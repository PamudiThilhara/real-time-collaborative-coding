# CodeCrew

University Network Programming project: React + Vite and a Java-WebSocket collaboration server connected through the browser's native WebSocket API. No Socket.IO or Spring Boot.

## Run

Requires JDK 17+, Maven, Node.js 22+, and running Docker Desktop/Engine. Download the execution images once:

```powershell
docker pull python:3.12-alpine
docker pull node:22-alpine
```

From the repository root:

```powershell
mvn -f backend/pom.xml compile exec:java
```

In a second terminal, from the repository root, start the separate execution service:

```powershell
javac -d execution/out execution/src/main/java/lk/codecrew/execution/ExecutionServer.java
java -cp execution/out lk.codecrew.execution.ExecutionServer
```

It binds to `127.0.0.1:8090` and permits the frontend origin `http://localhost:5173` by default. Keep `EXECUTION_HOST` on loopback. Open the frontend using **http://localhost:5173**. If you use `http://127.0.0.1:5173`, set `$env:EXECUTION_ORIGIN = 'http://127.0.0.1:5173'` before starting the execution service instead. Scheme, hostname and port must match exactly; do not bypass CORS checks.

In a third terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Use `mvn.cmd` / `npm.cmd` on Windows if PowerShell blocks scripts. Restart any old collaboration server after updating this checkout: the protocol now distinguishes `create` from `join`.

Default socket: `ws://127.0.0.1:8080/collaboration`. To override, copy `frontend/.env.example` to `frontend/.env.local`, set `VITE_COLLABORATION_URL`, and restart Vite. Java supports `CODECREW_HOST`, `CODECREW_PORT`, and `CODECREW_ORIGIN`; see [backend documentation](backend/README.md). HTTPS deployments require a `wss://` server/proxy.

## Test two browser tabs

1. Open Vite's URL in tab A, enter Alice, and click **Create a room**. The workspace opens after Java confirms membership. Copy its ID.
2. Open the same frontend in tab B, enter Bob, paste that ID, and click **Join room**. Both sidebars should show Alice and Bob, with a count of 2.
3. Type Python in A and check B; type in B and check A. Select JavaScript in both tabs and repeat. Switch back to Python to confirm independent shared files. Late arrivals receive both current documents.
4. Leave B. A's list/count updates. Joining an unknown ID shows **Room not found**. IDs allow 1-80 letters, numbers, underscores or hyphens.
5. Keep A connected and take B offline through developer tools. B pauses editing and reconnects on return, receiving the latest snapshot. Some browsers do not sever an existing WebSocket when switching offline; closing B tests presence removal instead.
6. Stop Java for a full outage. Both tabs pause and retry five times. Restart Java. Rooms are in memory and disappear when empty or Java stops, so an expired room reports **Room not found**. Leave and create a new room. After retry exhaustion use **Retry connection**.
7. Simultaneous whole-file edits can conflict. The accepted server document is shown and the rejected draft appears under **Saved Python/JavaScript draft**. Review/copy it, then explicitly restore or discard it. Unacknowledged drafts are also retained during reconnects. Recovery drafts live in the current page only: copy them before leaving or refreshing.
8. **Run code** and Ctrl/Cmd+Enter submit the selected file to the local Java execution API. Docker runs the code; output appears only in the submitting tab's terminal. Collaboration remains on its separate WebSocket connection.

## Test browser execution

1. With Docker and both Java services running, open **http://localhost:5173** and create/join a room.
2. Select Python, replace the current source with `print("Hello from Python")`, and click **Run code**. Expect `Hello from Python` and **Exit code: 0** in the terminal.
3. Select JavaScript, enter `console.log("Hello from JavaScript");`, then use **Run code** or Ctrl/Cmd+Enter. Expect that output and **Exit code: 0**. Changing files uses the current file's source, including shared edits received from another tab.
4. Try Python `raise ValueError("test error")` or JavaScript `throw new Error("test error");`. Expect the error/stack trace and a nonzero exit code. The API combines stderr with stdout.
5. Try Python `while True: pass`. The run should stop at the service's 12-second limit and report a timeout with **Exit code: -1**. While running, the button is disabled and repeated shortcuts send no additional requests. You can still edit/switch languages; the running request uses its original source snapshot.
6. Stop the execution service and run again. The terminal should explain how to start the local service/Docker and check the allowed frontend origin. Collaboration should continue working. Restart the service to retry.

The browser waits at most 25 seconds for an HTTP result, allowing time for Docker timeout cleanup. Leaving a room aborts the browser request; the service may finish cleaning up an already-started container under its existing execution limit.

## Automated checks

```powershell
mvn -f backend/pom.xml clean compile
# With the normal Java server running:
node backend/smoke.mjs
cd frontend
npm run test:integration
npm run lint
npm run build -- --outDir ../build/frontend
npm run test:e2e
```

The build command writes to ignored `build/frontend`, leaving `frontend/dist` untouched. Playwright starts a separate collaboration server on **18080** and Vite on **5173**. Both ports must be free; stop a manually running Vite first. It reuses an execution service on **8090**, or starts the unchanged Java source with loopback binding and `EXECUTION_ORIGIN=http://localhost:5173`. Docker and both downloaded images are required. Tests execute real Python/JavaScript through Java/Docker; explicit error cases interrupt requests or inject malformed/rejected responses to test UI handling. Collaboration tests also selectively interrupt or delay WebSocket traffic. Windows uses installed Edge. Elsewhere install Chromium with `npx playwright install chromium`; `PLAYWRIGHT_CHANNEL` selects another installed browser.

See [frontend documentation](frontend/README.md) for client behavior, [backend documentation](backend/README.md) for collaboration JSON, and [execution documentation](execution/README.md) for Docker restrictions and the HTTP API. Execution stays local-only and never runs code inside the collaboration server.
