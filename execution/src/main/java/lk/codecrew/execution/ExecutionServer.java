package lk.codecrew.execution;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Java implementation of an HTTP remote-code runner, with disposable Docker containers. */
public final class ExecutionServer {
    private static final int MAX_REQUEST = 70_000;
    private static final int MAX_CODE = 65_536;
    private static final int MAX_OUTPUT = 32_768;
    private static final Semaphore CAPACITY = new Semaphore(2);
    private static final String ORIGIN = System.getenv().getOrDefault("EXECUTION_ORIGIN", "http://localhost:5173");

    private ExecutionServer() {}

    public static void main(String[] args) throws IOException {
        String host = System.getenv().getOrDefault("EXECUTION_HOST", "127.0.0.1");
        int port = Integer.parseInt(System.getenv().getOrDefault("EXECUTION_PORT", "8090"));
        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 32);
        server.createContext("/health", exchange -> {
            if (!cors(exchange)) return;
            if (!exchange.getRequestMethod().equals("GET")) {
                reply(exchange, 405, "{\"error\":\"method_not_allowed\"}");
                return;
            }
            reply(exchange, 200, "{\"status\":\"ok\"}");
        });
        server.createContext("/execute", exchange -> {
            if (!cors(exchange)) return;
            if (!exchange.getRequestMethod().equals("POST")) {
                reply(exchange, 405, "{\"error\":\"method_not_allowed\"}");
                return;
            }
            if (!CAPACITY.tryAcquire()) {
                reply(exchange, 429, "{\"error\":\"busy\"}");
                return;
            }
            try {
                byte[] input = exchange.getRequestBody().readNBytes(MAX_REQUEST + 1);
                if (input.length > MAX_REQUEST) {
                    reply(exchange, 413, "{\"error\":\"request_too_large\"}");
                    return;
                }
                Map<String, String> json = new JsonStrings(new String(input, StandardCharsets.UTF_8)).parse();
                String lang = json.get("language"), code = json.get("code");
                if (lang == null || code == null || code.length() > MAX_CODE ||
                    !(lang.equals("python") || lang.equals("javascript"))) {
                    reply(exchange, 400, "{\"error\":\"invalid_input\"}");
                    return;
                }
                ExecutionResult result = execute(lang, code);
                reply(exchange, 200, "{\"stdout\":\"" + escape(result.output) + "\",\"exitCode\":" +
                    result.exitCode + ",\"timedOut\":" + result.timedOut + "}");
            } catch (IllegalArgumentException ex) {
                reply(exchange, 400, "{\"error\":\"invalid_json\"}");
            } catch (Exception ex) {
                System.err.println("Execution failed: " + ex);
                reply(exchange, 503, "{\"error\":\"execution_unavailable\"}");
            } finally {
                CAPACITY.release();
            }
        });
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.printf("Java execution API on http://%s:%d%n", host, port);
    }

    private static boolean cors(HttpExchange exchange) throws IOException {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin != null && !origin.equals(ORIGIN)) {
            reply(exchange, 403, "{\"error\":\"origin_not_allowed\"}");
            return false;
        }
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", ORIGIN);
        exchange.getResponseHeaders().set("Vary", "Origin");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        if (exchange.getRequestMethod().equals("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return false;
        }
        return true;
    }

    private static ExecutionResult execute(String language, String code) throws Exception {
        Path dir = Files.createTempDirectory("codecrew-exec-");
        String filename = language.equals("python") ? "main.py" : "main.js";
        String image = language.equals("python") ? "python:3.12-alpine" : "node:22-alpine";
        String runner = language.equals("python") ? "python3" : "node";
        String name = "codecrew-" + UUID.randomUUID().toString().replace("-", "");
        try {
            Files.writeString(dir.resolve(filename), code, StandardCharsets.UTF_8);
            // Docker runs as an unprivileged user. On Linux, temporary folders normally
            // have mode 0700, which would make the mounted source unreadable in Docker.
            // 0711 allows traversal but not directory listing by other local users.
            try {
                Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwx--x--x"));
                Files.setPosixFilePermissions(dir.resolve(filename), PosixFilePermissions.fromString("rw-r--r--"));
            } catch (UnsupportedOperationException ignored) {
                // Windows uses a different filesystem permission model.
            }
            ProcessBuilder builder = new ProcessBuilder("docker", "run", "--rm", "--name", name,
                "--network", "none", "--memory", "128m", "--cpus", "0.5", "--pids-limit", "64",
                "--ulimit", "fsize=65536:65536", "--read-only", "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges", "--user", "65534:65534",
                "--tmpfs", "/tmp:rw,nosuid,noexec,size=16m",
                "--mount", "type=bind,src=" + dir.toAbsolutePath() + ",dst=/workspace,readonly",
                "--workdir", "/workspace", image, runner, filename);
            // Drain output continuously instead of redirecting untrusted output to
            // an unbounded host file. An infinite print loop must not fill the disk.
            builder.redirectErrorStream(true);
            Process process = builder.start();
            ByteArrayOutputStream collected = new ByteArrayOutputStream();
            AtomicBoolean truncated = new AtomicBoolean(false);
            Thread outputReader = new Thread(() -> {
                try (InputStream stream = process.getInputStream()) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = stream.read(buffer)) >= 0) {
                        int room = MAX_OUTPUT - collected.size();
                        if (count > room) truncated.set(true);
                        if (room > 0) collected.write(buffer, 0, Math.min(room, count));
                    }
                } catch (IOException ignored) {
                    // The stream can close when a timed-out Docker client is killed.
                }
            }, "codecrew-output-reader");
            outputReader.setDaemon(true);
            outputReader.start();
            boolean finished = process.waitFor(12, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
                try {
                    Process cleanup = new ProcessBuilder("docker", "rm", "-f", name).start();
                    if (!cleanup.waitFor(3, TimeUnit.SECONDS)) cleanup.destroyForcibly();
                } catch (IOException ignored) { }
            }
            outputReader.join(2_000);
            if (outputReader.isAlive()) {
                process.getInputStream().close();
                outputReader.join(1_000);
            }
            String text = collected.toString(StandardCharsets.UTF_8);
            if (truncated.get()) text += "\n[output truncated]";
            return new ExecutionResult(text, finished ? process.exitValue() : -1, !finished);
        } finally {
            Files.deleteIfExists(dir.resolve(filename));
            Files.deleteIfExists(dir);
        }
    }

    private record ExecutionResult(String output, int exitCode, boolean timedOut) {}

    private static String escape(String value) {
        StringBuilder result = new StringBuilder();
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"' -> result.append("\\\"");
                case '\\' -> result.append("\\\\");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                default -> {
                    if (c < 32) result.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else result.append(c);
                }
            }
        }
        return result.toString();
    }

    private static void reply(HttpExchange exchange, int status, String json) throws IOException {
        byte[] data = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, data.length);
        try (var stream = exchange.getResponseBody()) { stream.write(data); }
    }

    /** Minimal strict JSON parser for an object containing string properties; no dependencies. */
    private static final class JsonStrings {
        private final String input;
        private int i;
        JsonStrings(String input) { this.input = input; }
        Map<String, String> parse() {
            Map<String, String> map = new HashMap<>();
            whitespace(); expect('{'); whitespace();
            if (take('}')) { whitespace(); end(); return map; }
            while (true) {
                whitespace(); String key = string(); whitespace(); expect(':'); whitespace();
                String value = string();
                if (map.putIfAbsent(key, value) != null) throw new IllegalArgumentException("duplicate key");
                whitespace();
                if (take('}')) break;
                expect(',');
            }
            whitespace(); end(); return map;
        }
        private String string() {
            expect('"'); StringBuilder b = new StringBuilder();
            while (i < input.length()) {
                char c = input.charAt(i++);
                if (c == '"') return b.toString();
                if (c < 32) throw new IllegalArgumentException("control char");
                if (c != '\\') { b.append(c); continue; }
                if (i >= input.length()) throw new IllegalArgumentException("escape");
                char e = input.charAt(i++);
                switch (e) {
                    case '"', '\\', '/' -> b.append(e);
                    case 'n' -> b.append('\n');
                    case 'r' -> b.append('\r');
                    case 't' -> b.append('\t');
                    case 'b' -> b.append('\b');
                    case 'f' -> b.append('\f');
                    case 'u' -> {
                        if (i + 4 > input.length()) throw new IllegalArgumentException("unicode");
                        try { b.append((char)Integer.parseInt(input.substring(i, i + 4), 16)); }
                        catch (NumberFormatException err) { throw new IllegalArgumentException("unicode"); }
                        i += 4;
                    }
                    default -> throw new IllegalArgumentException("escape");
                }
            }
            throw new IllegalArgumentException("unterminated string");
        }
        private void whitespace() {
            while (i < input.length() && " \t\r\n".indexOf(input.charAt(i)) >= 0) i++;
        }
        private boolean take(char c) {
            if (i < input.length() && input.charAt(i) == c) { i++; return true; }
            return false;
        }
        private void expect(char c) { if (!take(c)) throw new IllegalArgumentException("expected " + c); }
        private void end() { if (i != input.length()) throw new IllegalArgumentException("trailing characters"); }
    }
}
