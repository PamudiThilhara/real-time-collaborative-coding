import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const url = process.argv[2] ?? 'ws://127.0.0.1:8080/collaboration'
const roomId = 'smoke-' + randomUUID()
const sockets = []
const deadline = setTimeout(() => {
  console.error('Timed out waiting for the collaboration server.')
  process.exit(1)
}, 10000)

async function connect() {
  const socket = new WebSocket(url)
  sockets.push(socket)
  const inbox = []
  const waiters = []

  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data)
    const index = waiters.findIndex(({ matches }) => matches(event))
    if (index < 0) inbox.push(event)
    else waiters.splice(index, 1)[0].resolve(event)
  })

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('Cannot connect to ' + url)), { once: true })
  })

  return {
    send: (event) => socket.send(JSON.stringify(event)),
    close: () => socket.close(),
    next(matches) {
      const index = inbox.findIndex(matches)
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0])
      return new Promise((resolve) => waiters.push({ matches, resolve }))
    },
  }
}

const type = (name) => (event) => event.type === name

try {
  const [alice, bob, other] = await Promise.all([connect(), connect(), connect()])
  alice.send({ type: 'create', roomId, username: 'Alice' })
  const initial = await alice.next(type('joined'))
  assert.equal(initial.documents.python.version, 0)

  bob.send({ type: 'join', roomId, username: 'Bob' })
  await bob.next(type('joined'))
  await alice.next((event) => event.type === 'presence' && event.participants.length === 1)
  await alice.next((event) => event.type === 'presence' && event.participants.length === 2)

  const edit = { type: 'edit', language: 'python', baseVersion: 0 }
  alice.send({ ...edit, code: 'print("Alice")' })
  bob.send({ ...edit, code: 'print("Bob")' })
  const [seenByAlice, seenByBob] = await Promise.all([
    alice.next(type('edited')),
    bob.next(type('edited')),
  ])
  assert.deepEqual(seenByAlice, seenByBob)
  assert.equal(seenByAlice.document.version, 1)

  const loser = seenByAlice.authorId === initial.clientId ? bob : alice
  const conflict = await loser.next(type('conflict'))
  assert.deepEqual(conflict.document, seenByAlice.document)

  other.send({ type: 'join', roomId: roomId + '-missing', username: 'Other' })
  assert.equal((await other.next(type('error'))).code, 'room_not_found')
  other.send({ type: 'create', roomId, username: 'Other' })
  assert.equal((await other.next(type('error'))).code, 'room_exists')
  other.send({ type: 'create', roomId: 'invalid room!', username: 'Other' })
  assert.equal((await other.next(type('error'))).code, 'invalid_join')
  other.send({ type: 'create', roomId: roomId + '-other', username: 'Other' })
  const isolated = await other.next(type('joined'))
  assert.equal(isolated.documents.python.version, 0)
  assert.equal(isolated.participants.length, 1)

  bob.close()
  const presence = await alice.next((event) => event.type === 'presence'
    && event.participants.length === 1 && event.participants[0].username === 'Alice')
  assert.equal(presence.participants[0].id, initial.clientId)
  console.log('Passed create, join, missing/duplicate/invalid room, concurrent edit, conflict, isolation, and disconnect checks.')
} finally {
  clearTimeout(deadline)
  sockets.forEach((socket) => socket.close())
}
