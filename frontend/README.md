# CodeCrew frontend

React + Vite, Monaco, CSS and Lucide icons. The existing dark layout now connects to Java using the native browser `WebSocket` API.

## Run locally

Start Java from the repository root with `mvn -f backend/pom.xml compile exec:java`. In this folder:

```powershell
npm install
npm run dev
```

Use `npm.cmd` on Windows if PowerShell blocks scripts. The default URL is `ws://127.0.0.1:8080/collaboration`. Copy `.env.example` to `.env.local` to override `VITE_COLLABORATION_URL`, then restart Vite. For LAN testing use the Java server's actual LAN IP, configure its bind address and allowed frontend origin, and start Vite with `--host`. HTTPS requires `wss://`.

Create generates an ID and sends `create`; Join sends `join` for an existing room. Both wait for `joined`; errors appear on the form. **Explore the editor** creates a real room as Guest (or the entered name).

## Synchronization

- `src/network/CollaborationClient.js` owns the socket, acknowledged document versions, local drafts, reconnection and recovery. `RoomPage` subscribes with `useSyncExternalStore`.
- `joined` initializes Python and JavaScript from Java. `presence` provides actual participant IDs/names. Language selection is local; each file's contents are shared.
- Edits debounce for 120 ms and include `baseVersion`. At most one edit per language is in flight; further typing is coalesced until acknowledgement. Only editor input sends `edit`. Incoming snapshots, ACKs and model switches do not echo.
- This is whole-document version synchronization, not a character-level merge or CRDT. Conflicts show the accepted server document and retain the rejected local draft for explicit review/restoration. Restoring publishes the draft as a new edit and can replace a collaborator's work; review it first.
- Disconnection clears presence, pauses editing and rejoins after delays of 0.5, 1, 2, 4 and 8 seconds. After five failed retries use **Retry connection**. Handshakes/joins and edit ACKs time out after 8 seconds. Reconnect requests a fresh snapshot and never silently replays unacknowledged edits; drafts remain available for recovery.
- Empty rooms expire. Reconnecting to an expired room reports the backend error; leave and create another room. Leaving closes the socket and clears timers. Leaving/refreshing discards page-local recovery drafts.
- The document limit is 65,536 UTF-16 code units. Oversized drafts remain local with an error; shorten them to synchronize.
- Run code uses the separate local Java HTTP execution service; no user code runs in the collaboration server.

## Run code

Start Docker and the service using [execution/README.md](../execution/README.md). Open the frontend at **http://localhost:5173** to match the service's default allowed origin. If you choose `http://127.0.0.1:5173` or a different local port, set `EXECUTION_ORIGIN` to that exact origin before starting Java. Keep the service bound to `127.0.0.1`; no proxy or CORS bypass is used.

The button and Ctrl/Cmd+Enter send `POST http://127.0.0.1:8090/execute` with `{language, code}` from the selected editor document at the time of the run. The endpoint is deliberately fixed to loopback for this stage. Running disables duplicate submissions from both the button and shortcut. Editing, language switching, terminal controls, and WebSocket collaboration remain available. Execution output is local to the submitting tab.

The terminal preserves output whitespace and shows `stdout` (which includes stderr), `exitCode`, and `timedOut`. API rejections, unavailable service/Docker, CORS/origin failures, and malformed responses produce errors without fabricated output. The service's execution limit is 12 seconds; a separate 25-second browser request deadline allows cleanup time. Leaving aborts the HTTP request and prevents late results from appearing in a new room; it does not cancel an already-started Docker job on the server.

For a quick check, run Python `print("Hello from Python")` and JavaScript `console.log("Hello from JavaScript");`. Expect the corresponding output and exit code 0. See the [root README](../README.md) for syntax/runtime errors, timeouts, duplicate requests, and offline checks.

Monaco and workers are bundled locally. Google Fonts use system fallbacks when unavailable.

## Checks

```powershell
npm run lint
# With Java running on 8080 (or set CODECREW_TEST_URL):
npm run test:integration
npm run build -- --outDir ../build/frontend
npm run test:e2e
```

The build uses an alternate folder to keep `frontend/dist` untouched. Playwright starts collaboration Java on 18080 and Vite on 5173, and reuses/starts execution Java on 8090 with origin `http://localhost:5173`. Docker must be running with `python:3.12-alpine` and `node:22-alpine` downloaded. Java and Maven must be on PATH. Successful execution, language errors and the 12-second timeout use the real API/Docker; unavailable/rejected/malformed-response tests deliberately intercept requests. Windows uses installed Edge; elsewhere install Playwright Chromium. Set `PLAYWRIGHT_CHANNEL` to choose another browser. See the [root README](../README.md) for manual two-tab, disconnection and conflict checks.
