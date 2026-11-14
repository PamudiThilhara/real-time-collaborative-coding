# CodeCrew — Java remote execution service

A separate Java 17 HTTP service for the existing **Python / JavaScript** editor. Java is the service implementation language, not an extra editor language. It runs each submission in a fresh restricted Docker container.

## Requirements

- JDK 17 or newer
- Docker Desktop (Windows) or Docker Engine (Linux), running and accessible
- Pre-download images: `docker pull python:3.12-alpine` and `docker pull node:22-alpine`

## Start (from repository root)

```powershell
javac -d execution/out execution/src/main/java/lk/codecrew/execution/ExecutionServer.java
java -cp execution/out lk.codecrew.execution.ExecutionServer
```

By default it listens at `http://127.0.0.1:8090`. Options: `EXECUTION_HOST`, `EXECUTION_PORT`, and `EXECUTION_ORIGIN` (default `http://localhost:5173`). The service binds to loopback by default; do not expose it on public networks.

## HTTP contract

- `GET /health`: `{"status":"ok"}`
- `POST /execute` JSON: `{"language":"python","code":"print(42)"}`
- Result: `{"stdout":"42\n","exitCode":0,"timedOut":false}`
- JavaScript example: `{"language":"javascript","code":"console.log(42)"}`

`stdout` includes standard output **and** standard error. Invalid requests return an `error` field with non-200 HTTP status. The service accepts up to 64 KiB code, returns up to 32 KiB output, imposes a 12-second execution timeout, and allows at most two concurrent jobs.

## Frontend integration

The React Run Code button and Ctrl/Cmd+Enter now call this API through `frontend/src/network/execution.js`. `RoomPage.jsx` submits the selected file's latest editor contents, prevents duplicate in-flight requests, and displays combined stdout/stderr, exit codes, timeouts and service errors in `TerminalPanel.jsx`. The equivalent HTTP request is:

```js
const response = await fetch('http://127.0.0.1:8090/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language, code: drafts[language] }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error ?? 'Execution failed');
// result.stdout includes stderr; result.exitCode and result.timedOut describe completion.
```

Use **http://localhost:5173** for the frontend to match the default `EXECUTION_ORIGIN`. To use **http://127.0.0.1:5173**, set `$env:EXECUTION_ORIGIN = 'http://127.0.0.1:5173'` before starting the service. An origin includes its exact scheme, hostname and port. Keep the default loopback bind address; no security/CORS checks need to be disabled. No Java implementation changes were needed for frontend integration.

The browser imposes a 25-second request deadline, separate from the 12-second execution limit. Leaving a room aborts the browser request, but an already-started job may continue until the existing service limit/cleanup completes. The collaboration server receives no execution requests.

## Security / limits

Runs use Docker with `--network none`, a read-only root filesystem, read-only source mount, non-root user, disabled Linux capabilities, no-new-privileges, and CPU/memory/PID/file size limits. Containers are forcibly removed on timeout. These restrictions are **not sufficient for a publicly exposed multi-tenant code execution service**: add authentication, rate limiting, audit logs and stronger sandboxing (e.g. dedicated isolated worker hosts / microVMs) before deploying online. The service currently has no auth and must stay local/trusted.

## Testing

After Docker is running and Java service started:

```powershell
curl.exe http://127.0.0.1:8090/health
curl.exe -X POST http://127.0.0.1:8090/execute -H "Content-Type: application/json" -d '{"language":"python","code":"print(42)"}'
```

On PowerShell, `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8090/execute -ContentType application/json -Body '{"language":"python","code":"print(42)"}'` also works.

For browser testing steps see the [root README](../README.md). `npm run test:e2e` in `frontend` tests real Python/JavaScript output, stderr, nonzero exits and Docker timeout behavior in addition to collaboration. It reuses the service on port 8090 or starts it with the default local origin; Docker/images must already be available.
