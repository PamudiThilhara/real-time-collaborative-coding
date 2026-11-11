# CodeCrew collaboration server

Requires JDK 17 or later and Maven. Run from the repository root:

```powershell
mvn -f backend/pom.xml compile exec:java
```

The server listens at `ws://127.0.0.1:8080/collaboration`. For a two-device LAN demo, set `CODECREW_HOST` to the server's LAN IP (or `0.0.0.0`) and `CODECREW_ORIGIN` to the exact frontend origin, e.g. `http://192.168.1.20:5173`. Configure the browser to connect to that server's LAN IP. Set `CODECREW_PORT` to change port 8080.

## WebSocket protocol

Open a native browser `WebSocket`. Send one JSON object per text message.

| Client event | Fields | Behavior |
| --- | --- | --- |
| `join` | `roomId`, `username` | Joins a room, creating it when the first user arrives. |
| `edit` | `language`, `code`, `baseVersion` | Updates the document when the version matches the server's current version. |

```json
{"type":"join","roomId":"crew-demo","username":"Chathura"}
```

```json
{"type":"edit","language":"python","code":"print(42)","baseVersion":0}
```

| Server event | Fields | Client action |
| --- | --- | --- |
| `joined` | `roomId`, `clientId`, `documents`, `participants` | Initialize the editor and member list. |
| `presence` | `participants` | Refresh the member list after a join or disconnect. |
| `edited` | `language`, `document`, `authorId` | Apply the latest document. The sender receives this acknowledgement too. |
| `conflict` | `language`, `document` | The server kept the newer document. Preserve the rejected local draft for reconciliation. |
| `error` | `code`, `message` | Display the server message. |

A document is `{code, version}`, keyed by `python` or `javascript` in `documents`. A participant is `{id, username}`. Start from the `joined` snapshot. Send edits with the latest acknowledged version for that language and keep one edit in flight per document. Applying an incoming snapshot should update Monaco without echoing it back. Close the socket to leave. To reconnect, open a new socket and join again.

## Networking and concurrency

Java-WebSocket accepts TCP connections and handles WebSocket handshakes. Four worker threads decode incoming WebSocket traffic. A synchronized section orders updates to room membership and document versions, so two clients editing version 0 cannot both overwrite it. This is whole-document synchronization with version checks. A simultaneous edit can require manual reconciliation.

Rooms and drafts are kept in memory while at least one user remains connected. Room IDs grant access in this local demo. Remote execution can take the editor's current language and source as its input and return output to the terminal through the execution branch's interface.

## Smoke test

With the Java server running, use Node.js 22 or newer from the repository root:

```powershell
node backend/smoke.mjs
```

Pass a WebSocket URL as the first argument to test another address.
