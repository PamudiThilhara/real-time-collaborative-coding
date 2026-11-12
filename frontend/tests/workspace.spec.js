import { expect, test } from '@playwright/test'

test('validates the home form, creates a room, and leaves it', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your name')
  await page.getByLabel('What should we call you?').fill('Taylor')
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a room ID')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.locator('.room-id')).toHaveText(/^crew-[a-f0-9]{8}$/)
  await expect(page.locator('.user-name').first()).toContainText('Taylor')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Build Without Limits.',
  )
  await expect(page.getByLabel('What should we call you?')).toHaveValue(
    'Taylor',
  )
  expect(errors).toEqual([])
})

test('joins a room, edits both languages, preserves drafts, and previews execution', async ({
  page,
  context,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Sam')
  await page.getByLabel('Already have a room?').fill('crew-testing')
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.locator('.room-id')).toHaveText('crew-testing')
  await expect(page.locator('.monaco-editor')).toBeVisible()

  const editor = page.getByRole('textbox', { name: 'Editor content' })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.type('# saved Python draft\n')
  await expect(page.locator('.view-lines')).toContainText('saved Python draft')
  await page
    .getByRole('combobox', { name: 'Editor language' })
    .selectOption('javascript')
  await expect(page.locator('.view-lines')).toContainText('function greet')
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.type('// saved JavaScript draft\n')
  await page
    .getByRole('combobox', { name: 'Editor language' })
    .selectOption('python')
  await expect(page.locator('.view-lines')).toContainText('saved Python draft')
  await page
    .getByRole('combobox', { name: 'Editor language' })
    .selectOption('javascript')
  await expect(page.locator('.view-lines')).toContainText(
    'saved JavaScript draft',
  )
  await page.getByRole('button', { name: 'Run code', exact: true }).click()
  await expect(page.getByRole('log')).toContainText(
    'JavaScript execution is not connected yet.',
  )
  await expect(page.getByRole('log')).toContainText(
    'Your code has not been executed.',
  )
  await page.getByRole('button', { name: 'Collapse terminal' }).click()
  await expect(page.getByRole('log')).toHaveCount(0)
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('log')).toBeVisible()
  await page.getByRole('button', { name: 'Clear terminal' }).click()
  await expect(page.getByRole('log')).toContainText('Terminal cleared.')
  await page.getByRole('button', { name: 'Copy room ID', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Room ID copied' }),
  ).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'crew-testing',
  )

  await page.getByRole('button', { name: 'Leave room', exact: true }).click()
  await page.getByRole('button', { name: 'Create a room' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.view-lines')).not.toContainText(
    'saved Python draft',
  )
  expect(errors).toEqual([])
})

for (const width of [320, 390, 768]) {
  test(`supports a ${width}px viewport without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('button', { name: 'Explore the editor' }).click()
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Run code', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (width < 701) {
      await page
        .getByRole('button', { name: 'Toggle workspace sidebar' })
        .click()
      await expect(
        page.getByRole('heading', { name: 'Your crew' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'main.js' }).click()
      await expect(
        page.getByRole('combobox', { name: 'Editor language' }),
      ).toHaveValue('javascript')
      await expect(
        page.getByRole('heading', { name: 'Your crew' }),
      ).not.toBeVisible()
    }
    await page.getByRole('button', { name: 'Run code', exact: true }).click()
    await expect(page.getByRole('log')).toContainText(
      'execution is not connected yet.',
    )
  })
}
