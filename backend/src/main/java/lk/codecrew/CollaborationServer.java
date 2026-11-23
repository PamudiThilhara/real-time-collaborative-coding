package lk.codecrew;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class CollaborationServer extends WebSocketServer {
    private static final int WORKER_THREADS = 4;
    private static final int MAX_MESSAGE_BYTES = 512 * 1024;
    private static final int MAX_CODE_LENGTH = 64 * 1024;
    private static final int MAX_ROOMS = 64;
    private static final int MAX_ROOM_MEMBERS = 16;
    private static final Gson JSON = new Gson();

    private final Object roomLock = new Object();
    private final Map<String, Room> rooms = new HashMap<>();
    private final Map<WebSocket, Membership> memberships = new HashMap<>();
    private final String allowedOrigin;

    private record Participant(String id, String username) {}
    private record Document(String code, long version) {}
    private record Membership(String roomId, Participant participant) {}

    private static final class Room {
        final Map<WebSocket, Participant> participants = new LinkedHashMap<>();
        final Map<String, Document> documents = new LinkedHashMap<>(Map.of(
                "python", new Document("print(\"Hello, CodeCrew!\")\n", 0),
                "javascript", new Document("console.log(\"Hello, CodeCrew!\");\n", 0)
        ));
    }

    private CollaborationServer(String host, int port, String allowedOrigin) {
        super(new InetSocketAddress(host, port), WORKER_THREADS,
                List.of(new Draft_6455(List.of(), MAX_MESSAGE_BYTES)));
        this.allowedOrigin = allowedOrigin;
        setConnectionLostTimeout(30);
    }

    public static void main(String[] args) {
        Map<String, String> env = System.getenv();
        String host = env.getOrDefault("CODECREW_HOST", "127.0.0.1");
        int port = Integer.parseInt(env.getOrDefault("CODECREW_PORT", "8080"));
        String origin = env.getOrDefault("CODECREW_ORIGIN", "");
        CollaborationServer server = new CollaborationServer(host, port, origin);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                server.stop(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "codecrew-shutdown"));
        server.start();
    }

    @Override
    public void onStart() {
        System.out.printf("CodeCrew listening on %s with %d WebSocket workers%n",
                getAddress(), WORKER_THREADS);
    }

    @Override
    public void onOpen(WebSocket socket, ClientHandshake handshake) {
        if (!"/collaboration".equals(handshake.getResourceDescriptor())) {
            socket.close(1008, "Use /collaboration");
            return;
        }
        String origin = handshake.getFieldValue("Origin");
        if (!origin.isEmpty() && !origin.equals(allowedOrigin)
                && !origin.matches("http://(localhost|127\\.0\\.0\\.1)(:[0-9]{1,5})?")) {
            socket.close(1008, "Origin not allowed");
        }
    }

    @Override
    public void onMessage(WebSocket socket, String message) {
        try {
            JsonElement parsed = JsonParser.parseString(message);
            if (!parsed.isJsonObject()) {
                throw new IllegalArgumentException("Send a JSON object.");
            }
            JsonObject event = parsed.getAsJsonObject();
            switch (requiredString(event, "type")) {
                case "create", "join" -> join(socket, requiredString(event, "roomId"),
                        requiredString(event, "username"), "create".equals(event.get("type").getAsString()));
                case "edit" -> edit(socket, requiredString(event, "language"),
                        requiredString(event, "code"), requiredVersion(event));
                default -> error(socket, "unknown_type", "Use create, join or edit.");
            }
        } catch (JsonParseException | IllegalArgumentException e) {
            error(socket, "invalid_message", "Invalid JSON or event fields.");
        }
    }

    @Override
    public void onMessage(WebSocket socket, ByteBuffer message) {
        socket.close(1003, "Send text JSON messages");
    }

    private void join(WebSocket socket, String roomId, String username, boolean create) {
        String name = username.strip();
        if (!roomId.matches("[A-Za-z0-9_-]{1,80}") || name.isEmpty()
                || name.length() > 30 || name.codePoints().anyMatch(Character::isISOControl)) {
            error(socket, "invalid_join", "Check the room ID and display name.");
            return;
        }

        synchronized (roomLock) {
            if (!socket.isOpen()) {
                return;
            }
            if (memberships.containsKey(socket)) {
                error(socket, "already_joined", "Open a new connection to join another room.");
                return;
            }
            Room room = rooms.get(roomId);
            // Creation and admission share the lock, so IDs cannot race or create phantom rooms.
            if (create && room != null) {
                error(socket, "room_exists", "This room ID is already in use. Create another room.");
                return;
            }
            if (room == null) {
                if (!create) {
                    error(socket, "room_not_found", "Room not found. Check the ID or create a new room.");
                    return;
                }
                if (rooms.size() >= MAX_ROOMS) {
                    error(socket, "room_limit", "The server has reached its active room limit.");
                    return;
                }
                room = new Room();
                rooms.put(roomId, room);
            }
            if (room.participants.size() >= MAX_ROOM_MEMBERS) {
                error(socket, "room_full", "This room is full.");
                return;
            }

            Participant participant = new Participant(UUID.randomUUID().toString(), name);
            room.participants.put(socket, participant);
            memberships.put(socket, new Membership(roomId, participant));
            send(socket, JSON.toJson(Map.of(
                    "type", "joined", "roomId", roomId, "clientId", participant.id(),
                    "documents", room.documents, "participants", room.participants.values()
            )));
            broadcastPresence(room);
        }
    }

    private void edit(WebSocket socket, String language, String code, long baseVersion) {
        if (code.length() > MAX_CODE_LENGTH) {
            error(socket, "code_too_large", "The document exceeds the editor size limit.");
            return;
        }

        synchronized (roomLock) {
            Membership membership = memberships.get(socket);
            if (membership == null) {
                error(socket, "join_required", "Join a room before editing.");
                return;
            }
            Room room = rooms.get(membership.roomId());
            Document current = room.documents.get(language);
            if (current == null) {
                error(socket, "invalid_language", "Use python or javascript.");
                return;
            }
            if (baseVersion != current.version()) {
                send(socket, JSON.toJson(Map.of(
                        "type", "conflict", "language", language, "document", current
                )));
                return;
            }

            Document updated = new Document(code, current.version() + 1);
            room.documents.put(language, updated);
            broadcast(room, Map.of("type", "edited", "language", language, "document", updated,
                    "authorId", membership.participant().id()));
        }
    }

    @Override
    public void onClose(WebSocket socket, int code, String reason, boolean remote) {
        synchronized (roomLock) {
            Membership membership = memberships.remove(socket);
            if (membership == null) {
                return;
            }
            Room room = rooms.get(membership.roomId());
            room.participants.remove(socket);
            if (room.participants.isEmpty()) {
                rooms.remove(membership.roomId());
            } else {
                broadcastPresence(room);
            }
        }
    }

    @Override
    public void onError(WebSocket socket, Exception error) {
        System.err.println("WebSocket error: " + error.getMessage());
    }

    private static String requiredString(JsonObject event, String field) {
        JsonElement value = event.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            throw new IllegalArgumentException(field);
        }
        return value.getAsString();
    }

    private static long requiredVersion(JsonObject event) {
        JsonElement value = event.get("baseVersion");
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException("baseVersion");
        }
        long version = Long.parseLong(value.getAsString());
        if (version < 0) {
            throw new IllegalArgumentException("baseVersion");
        }
        return version;
    }

    private static void broadcastPresence(Room room) {
        broadcast(room, Map.of("type", "presence", "participants", room.participants.values()));
    }

    private static void broadcast(Room room, Map<String, ?> event) {
        String message = JSON.toJson(event);
        room.participants.keySet().forEach(socket -> send(socket, message));
    }

    private static void error(WebSocket socket, String code, String message) {
        send(socket, JSON.toJson(Map.of("type", "error", "code", code, "message", message)));
    }

    private static void send(WebSocket socket, String message) {
        try {
            socket.send(message);
        } catch (WebsocketNotConnectedException ignored) {
            // onClose removes a participant whose connection closes during a broadcast.
        }
    }
}
