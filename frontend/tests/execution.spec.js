import { expect, test } from '@playwright/test'

const endpoint = 'http://127.0.0.1:8090/execute'

async function openEditor(page) {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Runner')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.locator('.room-local-status')).toHaveText('Connected')
  await expect(page.locator('.monaco-editor')).toBeVisible()
}

async function replaceCode(page, code) {
  await page.getByRole('textbox', { name: 'Editor content' }).focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

function trackRequests(page) {
  const requests = []
  page.on('request', (request) => {
    if (request.url() === endpoint && request.method() === 'POST') requests.push(request.postDataJSON())
  })
  return requests
}

test('runs current Python and JavaScript through the real Java/Docker API', async ({ page }) => {
  const requests = trackRequests(page)
  await openEditor(page)
  const python = 'print("current Python")\nprint("    indented line")\nprint("<script>literal text</script>")'
  await replaceCode(page, python)
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Python execution finished.')
  await expect(page.locator('.terminal-output').last()).toHaveText('current Python\n    indented line\n<script>literal text</script>\n')
  await expect(page.getByRole('log')).toContainText('Exit code: 0')
  await page.getByRole('combobox', { name: 'Editor language' }).selectOption('javascript')
  const javascript = 'console.log("current JavaScript");\nconsole.error("stderr included");'
  await replaceCode(page, javascript)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('log')).toContainText('JavaScript execution finished.')
  // Docker merges stdout/stderr without promising ordering between the streams.
  await expect(page.locator('.terminal-output').last()).toContainText('current JavaScript')
  await expect(page.locator('.terminal-output').last()).toContainText('stderr included')
  expect(requests).toEqual([{ language: 'python', code: python }, { language: 'javascript', code: javascript }])
})

for (const [language, code] of [['python', 'def broken'], ['javascript', 'const = ;']]) {
  test(`renders real ${language} syntax errors and nonzero exit codes`, async ({ page }) => {
    await openEditor(page)
    await page.getByRole('combobox', { name: 'Editor language' }).selectOption(language)
    await replaceCode(page, code)
    await page.getByRole('button', { name: 'Run code', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('execution failed.')
    await expect(page.getByRole('log')).toContainText('Exit code: 1')
    await expect(page.locator('.terminal-output').last()).toContainText('SyntaxError')
  })
}

test('renders the real Docker execution timeout and exit code', async ({ page }) => {
  await openEditor(page)
  await replaceCode(page, 'while True:\n    pass')
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Python execution timed out.', { timeout: 25000 })
  await expect(page.getByRole('log')).toContainText('Exit code: -1')
  await expect(page.getByRole('log')).toContainText('12-second limit')
  await expect(page.getByRole('button', { name: 'Run code', exact: true })).toBeEnabled()
})

test('guards repeated shortcuts while running and keeps the submitted language snapshot', async ({ page }) => {
  const requests = trackRequests(page)
  await openEditor(page)
  const code = 'import time\nprint("begin", flush=True)\ntime.sleep(3)\nprint("done")'
  await replaceCode(page, code)
  await page.getByRole('button', { name: 'Collapse terminal' }).click()
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Running…', exact: true })).toBeDisabled()
  await expect(page.getByRole('log')).toContainText('Running Python')
  await page.getByRole('textbox', { name: 'Editor content' }).focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.getByRole('combobox', { name: 'Editor language' }).selectOption('javascript')
  await replaceCode(page, 'console.log("edited during the run");')
  await expect(page.getByRole('log')).toContainText('Python execution finished.', { timeout: 10000 })
  await expect(page.locator('.terminal-output').last()).toHaveText('begin\ndone\n')
  expect(requests).toEqual([{ language: 'python', code }])
  await page.getByRole('button', { name: 'Clear terminal' }).click()
  await expect(page.getByRole('log')).toContainText('Terminal cleared.')
})

test('reports an unavailable service and allows another attempt', async ({ page }) => {
  await page.route(endpoint, (route) => route.abort('connectionrefused'))
  await openEditor(page)
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Cannot reach http://127.0.0.1:8090/execute')
  await expect(page.getByRole('log')).toContainText('EXECUTION_ORIGIN')
  await expect(page.getByRole('button', { name: 'Run code', exact: true })).toBeEnabled()
  await page.unroute(endpoint)
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Python execution finished.')
})

test('renders service rejection and invalid response without inventing output', async ({ page }) => {
  await openEditor(page)
  await page.route(endpoint, (route) => route.fulfill({ status: 429, json: { error: 'busy' } }))
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('two jobs are already running')
  await page.unroute(endpoint)
  await page.route(endpoint, (route) => route.fulfill({ status: 200, json: { unexpected: true } }))
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('unexpected result')
  await expect(page.locator('.terminal-output')).toHaveCount(0)
})

test('enforces the HTTP deadline and releases the running state', async ({ page }) => {
  await openEditor(page)
  await page.clock.install()
  let received = false
  // Hold the HTTP response to simulate a hung service, rather than a code timeout.
  await page.route(endpoint, () => { received = true })
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect.poll(() => received).toBe(true)
  await page.clock.fastForward(25001)
  await expect(page.getByRole('log')).toContainText('Execution request timed out.')
  await expect(page.getByRole('log')).toContainText('25 seconds')
  await expect(page.getByRole('button', { name: 'Run code', exact: true })).toBeEnabled()
})

test('leaving aborts an in-flight HTTP request and a new room can execute', async ({ page }) => {
  await openEditor(page)
  let received = false
  await page.route(endpoint, () => { received = true })
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect.poll(() => received).toBe(true)
  const aborted = page.waitForEvent('requestfailed', (request) => request.url() === endpoint)
  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await aborted
  await expect(page.locator('.home-page')).toBeVisible()
  await page.unroute(endpoint)
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Python execution finished.')
  await expect(page.getByRole('log')).not.toContainText('Execution failed.')
})
