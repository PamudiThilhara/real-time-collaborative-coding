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
| `create` | `roomId`, `username` | Atomically creates and joins a new room; rejects an existing ID with `room_exists`. |
| `join` | `roomId`, `username` | Joins an existing room; rejects a missing/expired ID with `room_not_found`. |
| `edit` | `language`, `code`, `baseVersion` | Updates the document when the version matches the server's current version. |

```json
{"type":"create","roomId":"crew-demo","username":"Chathura"}
```

Other users then send:

```json
{"type":"join","roomId":"crew-demo","username":"Nimali"}
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

A document is `{code, version}`, keyed by `python` or `javascript` in `documents`. A participant is `{id, username}`. Start from the `joined` snapshot. Send edits with the latest acknowledged version for that language and keep one edit in flight per document. Applying an incoming snapshot should update Monaco without echoing it back. Close the socket to leave. To reconnect, open a new socket and send `join` again, receiving a new client ID. Missing rooms are never recreated during reconnects.

Room IDs allow `[A-Za-z0-9_-]{1,80}`. Names are stripped, must be 1–30 characters, and cannot contain ISO control characters. Languages are `python` and `javascript`. Code is limited to 65,536 UTF-16 code units; there are at most 64 active rooms and 16 users per room. Error codes include `invalid_join`, `room_exists`, `room_not_found`, `room_full`, `room_limit`, `already_joined`, `join_required`, `invalid_language`, `code_too_large`, `invalid_message` and `unknown_type`.

**Protocol change:** `join` previously created missing rooms. Clients must now send `create` for creation; restart any old server. This distinction rejects mistyped IDs and prevents empty replacement rooms during reconnects. Existing edit and server event formats are unchanged.

## Networking and concurrency

Java-WebSocket accepts TCP connections and handles WebSocket handshakes. Four worker threads decode incoming WebSocket traffic. A synchronized section orders updates to room membership and document versions, so two clients editing version 0 cannot both overwrite it. This is whole-document synchronization with version checks. A simultaneous edit can require manual reconciliation.

Rooms and drafts are kept in memory while at least one user remains connected. Room IDs grant access in this local demo. The collaboration server only stores and broadcasts source text; it never executes it. Remote execution integration is deferred.

## Smoke test

With the Java server running, use Node.js 22 or newer from the repository root:

```powershell
node backend/smoke.mjs
```

Pass a WebSocket URL as the first argument to test another address.
