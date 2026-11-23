import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { CollaborationClient } from '../src/network/CollaborationClient.js'

const url = process.env.CODECREW_TEST_URL || 'ws://127.0.0.1:8080/collaboration'

async function member(t, roomId, mode, username) {
  const client = new CollaborationClient({ url, roomId, mode, username })
  t.after(() => client.close())
  await client.connect()
  return client
}

function until(client, predicate) {
  if (predicate(client.state)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('Timed out waiting for client state')) }, 5000)
    const unsubscribe = client.subscribe(() => {
      if (predicate(client.state)) { clearTimeout(timeout); unsubscribe(); resolve() }
    })
  })
}

test('one edit in flight coalesces typing until a real Java ACK; no echo', { timeout: 10000 }, async (t) => {
  const room = 'client-' + randomUUID()
  const alice = await member(t, room, 'create', 'Alice')
  const bob = await member(t, room, 'join', 'Bob')
  const received = alice.socket.onmessage
  const held = []
  const sent = []
  const send = alice.socket.send.bind(alice.socket)
  alice.socket.send = (message) => { sent.push(JSON.parse(message)); send(message) }
  alice.socket.onmessage = (message) => {
    const event = JSON.parse(message.data)
    if (event.type === 'edited') held.push(message)
    else received(message)
  }
  alice.edit('python', 'print("first")')
  await until(bob, (state) => state.drafts.python === 'print("first")')
  alice.edit('python', 'print("latest")')
  await delay(250)
  assert.equal(sent.length, 1)
  assert.equal(held.length, 1)
  received(held.shift())
  await until(bob, (state) => state.drafts.python === 'print("latest")')
  await delay(50)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].baseVersion, 1)
  received(held.shift())
  await delay(300)
  assert.equal(sent.length, 2)
  assert.equal(alice.documents.python.version, 2)
  assert.equal(bob.documents.python.version, 2)
})

test('concurrent clients preserve a rejected draft and explicitly restore at a new version', { timeout: 10000 }, async (t) => {
  const room = 'client-' + randomUUID()
  const alice = await member(t, room, 'create', 'Alice')
  const bob = await member(t, room, 'join', 'Bob')
  alice.edit('python', 'alice')
  bob.edit('python', 'bob')
  alice.flush('python')
  bob.flush('python')
  // Both writes were made at version 0 before either received a response.
  await Promise.race([
    until(alice, (state) => state.recovery.python !== undefined),
    until(bob, (state) => state.recovery.python !== undefined),
  ])
  const loser = alice.state.recovery.python !== undefined ? alice : bob
  const winner = loser === alice ? bob : alice
  const draft = loser.state.recovery.python
  assert.equal(loser.state.drafts.python, winner.state.drafts.python)
  assert.notEqual(draft, loser.state.drafts.python)
  loser.recover('python')
  await until(winner, (state) => state.drafts.python === draft)
  assert.equal(winner.documents.python.version, 2)
  assert.equal(loser.state.recovery.python, undefined)
})

test('reconnect preserves an unsent draft and receives the surviving room snapshot', { timeout: 10000 }, async (t) => {
  const room = 'client-' + randomUUID()
  const alice = await member(t, room, 'create', 'Alice')
  const bob = await member(t, room, 'join', 'Bob')
  alice.edit('python', 'unsent draft')
  alice.socket.close(4000, 'Integration test disconnect')
  await until(alice, (state) => state.status === 'reconnecting')
  assert.equal(alice.state.participants.length, 0)
  alice.edit('python', 'offline edit must be ignored')
  bob.edit('python', 'authoritative remote edit')
  await until(alice, (state) => state.status === 'connected')
  assert.equal(alice.state.drafts.python, 'authoritative remote edit')
  assert.equal(alice.state.recovery.python, 'unsent draft')
  assert.equal(alice.state.participants.length, 2)
  assert.equal(alice.documents.python.version, 1)
})

test('last-member disconnect reports room expiration without recreating it', { timeout: 10000 }, async (t) => {
  const alice = await member(t, 'client-' + randomUUID(), 'create', 'Alice')
  alice.socket.close(4000, 'Integration test disconnect')
  await until(alice, (state) => state.status === 'error')
  assert.match(alice.state.error, /Room not found/)
  assert.equal(alice.state.participants.length, 0)
})

test('oversized code remains local and is synchronized only after shortening', { timeout: 10000 }, async (t) => {
  const room = 'client-' + randomUUID()
  const alice = await member(t, room, 'create', 'Alice')
  const bob = await member(t, room, 'join', 'Bob')
  alice.edit('python', 'x'.repeat(65537))
  assert.match(alice.state.error, /65,536/)
  assert.equal(alice.state.recovery.python.length, 65537)
  assert.equal(bob.documents.python.version, 0)
  alice.edit('python', 'short enough')
  await until(bob, (state) => state.drafts.python === 'short enough')
  assert.equal(bob.documents.python.version, 1)
})
