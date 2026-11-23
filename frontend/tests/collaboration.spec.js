import { expect, test } from '@playwright/test'

async function create(page, name = 'Alice') {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.locator('.room-local-status')).toHaveText('Connected')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return page.locator('.room-id').innerText()
}

async function join(page, roomId, name = 'Bob') {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Already have a room?').fill(roomId)
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.locator('.room-local-status')).toHaveText('Connected')
  await expect(page.locator('.monaco-editor')).toBeVisible()
}

async function replaceCode(page, code) {
  await page.getByRole('textbox', { name: 'Editor content' }).focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

function trackEdits(page) {
  const edits = []
  page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
    const event = JSON.parse(String(payload))
    if (event.type === 'edit') edits.push(event)
  }))
  return edits
}

test('two tabs synchronize both languages, snapshots and presence without echo loops', async ({ page, context }) => {
  const aliceEdits = trackEdits(page)
  const id = await create(page)
  const bob = await context.newPage()
  const bobEdits = trackEdits(bob)
  await join(bob, id)
  await expect(page.locator('.count-badge')).toHaveText('2')
  await expect(bob.locator('.count-badge')).toHaveText('2')
  await expect(page.locator('.users-list')).toContainText('Bob')
  await expect(page.locator('.users-list')).not.toContainText('Alex Morgan')
  await replaceCode(page, 'print("shared python")')
  await expect(bob.locator('.view-lines')).toContainText('shared python')
  await expect.poll(() => aliceEdits.length).toBe(1)
  expect(bobEdits).toHaveLength(0)
  for (const tab of [page, bob]) await tab.getByRole('combobox', { name: 'Editor language' }).selectOption('javascript')
  await replaceCode(bob, 'console.log("shared javascript");')
  await expect(page.locator('.view-lines')).toContainText('shared javascript')
  await expect.poll(() => bobEdits.length).toBe(1)
  // Also prove late arrivals receive authoritative snapshots for both files.
  const late = await context.newPage()
  await join(late, id, 'Late')
  await expect(late.locator('.view-lines')).toContainText('shared python')
  await late.getByRole('combobox', { name: 'Editor language' }).selectOption('javascript')
  await expect(late.locator('.view-lines')).toContainText('shared javascript')
  await bob.getByRole('button', { name: 'Leave room', exact: true }).click()
  await late.close()
  await expect(page.locator('.count-badge')).toHaveText('1')
  await expect(page.locator('.users-list')).not.toContainText('Bob')
  expect(aliceEdits).toHaveLength(1)
  expect(bobEdits).toHaveLength(1)
})

test('rejects invalid and missing rooms and removes a room after the last user leaves', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Alice')
  await page.getByLabel('Already have a room?').fill('bad room!')
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.locator('.form-error')).toContainText('Room IDs use')
  await page.getByLabel('Already have a room?').fill('missing-' + crypto.randomUUID())
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.locator('.form-error')).toContainText('Room not found')
  const id = await create(page)
  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await page.getByLabel('Already have a room?').fill(id)
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.locator('.form-error')).toContainText('Room not found')
})

test('shows a network error when the connection fails before joining', async ({ page }) => {
  await page.routeWebSocket('**/collaboration', (route) => route.close({ code: 1011, reason: 'Test network interruption' }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Alice')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.getByRole('alert')).toContainText('Cannot connect')
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeEnabled()
  await expect(page.locator('.room-page')).toHaveCount(0)
})

test('rejoins a surviving room after disconnection and takes the latest snapshot', async ({ page, context }) => {
  const id = await create(page)
  const bob = await context.newPage()
  await bob.addInitScript(() => {
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args)
        if (String(args[0]).endsWith('/collaboration')) window.testCollaborationSocket = this
      }
    }
  })
  await join(bob, id)
  // Close the actual native socket so Java receives the real close handshake.
  await bob.evaluate(() => window.testCollaborationSocket.close(4000, 'Test disconnect'))
  await expect(bob.locator('.room-local-status')).toHaveText('reconnecting')
  await replaceCode(page, 'print("latest after reconnect")')
  await expect(bob.locator('.room-local-status')).toHaveText('Connected')
  await expect(bob.locator('.view-lines')).toContainText('latest after reconnect')
  await expect(page.locator('.count-badge')).toHaveText('2')
  await expect(bob.locator('.users-list .user-name')).toHaveCount(2)
})

test('simultaneous edits retain the rejected draft for explicit recovery', async ({ page, context }) => {
  let accepted = false
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    const event = JSON.parse(String(payload))
    if (event.type === 'edited' && event.document.code === 'print("alice wins")') accepted = true
  }))
  const id = await create(page)
  const bob = await context.newPage()
  const held = []
  let serverRoute
  // Delay Bob's outgoing edit only, forwarding all real Java responses unchanged.
  await bob.routeWebSocket('**/collaboration', (route) => {
    serverRoute = route.connectToServer()
    route.onMessage((message) => {
      if (JSON.parse(String(message)).type === 'edit') held.push(message)
      else serverRoute.send(message)
    })
  })
  await join(bob, id)
  await replaceCode(bob, 'print("bob draft")')
  await expect.poll(() => held.length).toBe(1)
  await replaceCode(page, 'print("alice wins")')
  await expect.poll(() => held.length).toBe(1)
  // Wait for Alice's real ACK before sending Bob's stale baseVersion.
  await expect.poll(() => accepted).toBe(true)
  serverRoute.send(held.shift())
  await expect(bob.locator('.view-lines')).toContainText('alice wins')
  await bob.locator('.draft-recovery summary').click()
  await expect(bob.getByLabel('Saved Python draft')).toHaveValue('print("bob draft")')
  await bob.getByRole('button', { name: 'Restore Python draft' }).click()
  await expect.poll(() => held.length).toBe(1)
  serverRoute.send(held.shift())
  await expect(page.locator('.view-lines')).toContainText('bob draft')
})
