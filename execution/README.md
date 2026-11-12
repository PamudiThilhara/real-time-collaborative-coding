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

## Integrate with frontend `RoomPage.jsx`

The existing frontend Run button only displays a mock message. The frontend teammate should replace that mock with a request like this (using current React state):

```js
const response = await fetch('http://127.0.0.1:8090/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language, code: drafts[language] }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error ?? 'Execution failed');
// Render result.stdout in the existing TerminalPanel and handle result.timedOut.
```

**Important:** `execution`, `backend` and `frontend` are separate Git branches. A merge/integration branch must combine them before the full app works together. The Java collaboration server currently supports Python and JavaScript documents and stays unchanged here.

## Security / limits

Runs use Docker with `--network none`, a read-only root filesystem, read-only source mount, non-root user, disabled Linux capabilities, no-new-privileges, and CPU/memory/PID/file size limits. Containers are forcibly removed on timeout. These restrictions are **not sufficient for a publicly exposed multi-tenant code execution service**: add authentication, rate limiting, audit logs and stronger sandboxing (e.g. dedicated isolated worker hosts / microVMs) before deploying online. The service currently has no auth and must stay local/trusted.

## Testing

After Docker is running and Java service started:

```powershell
curl.exe http://127.0.0.1:8090/health
curl.exe -X POST http://127.0.0.1:8090/execute -H "Content-Type: application/json" -d '{"language":"python","code":"print(42)"}'
```

On PowerShell, `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8090/execute -ContentType application/json -Body '{"language":"python","code":"print(42)"}'` also works.
