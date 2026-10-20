import { expect, test, type Browser, type Page } from '@playwright/test'

const summary = (page: Page) => page.getByTestId('board-summary')

async function openBoard(browser: Browser, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(path)
  await expect(page.locator('.connection[data-state="online"]')).toBeVisible()
  return page
}

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  await page.keyboard.press('r')
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 5 })
  await page.mouse.up()
}

test('edits made in one browser appear in another', async ({ browser }) => {
  const alice = await openBoard(browser, '/')
  const bob = await openBoard(browser, new URL(alice.url()).pathname)

  await drawRect(alice, [300, 300], [500, 420])
  await expect(summary(bob)).toHaveText(/^1 object on the board/)

  await alice.keyboard.press('s')
  await alice.mouse.click(800, 360)
  await alice.keyboard.type('Ship on Friday')
  await alice.keyboard.press('Escape')
  await expect(summary(bob)).toHaveText(/^2 objects on the board/)

  await bob.mouse.dblclick(800, 360)
  await expect(bob.getByLabel('Sticky note text')).toHaveValue('Ship on Friday')
})

test('shows who else is on the board', async ({ browser }) => {
  const alice = await openBoard(browser, '/')
  await openBoard(browser, new URL(alice.url()).pathname)
  await expect(alice.getByRole('group', { name: '2 people on this board' })).toBeVisible()
})

test('undo only reverts your own changes', async ({ browser }) => {
  const alice = await openBoard(browser, '/')
  const bob = await openBoard(browser, new URL(alice.url()).pathname)

  await drawRect(alice, [400, 200], [500, 300])
  await expect(summary(bob)).toHaveText(/^1 object/)
  await drawRect(bob, [800, 200], [900, 300])
  await expect(summary(alice)).toHaveText(/^2 objects/)

  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect(summary(alice)).toHaveText(/^1 object/)
  await expect(summary(bob)).toHaveText(/^1 object/)

  await bob.mouse.click(850, 250)
  await expect(summary(bob)).toHaveText(/1 selected/)
})

test('keeps the board after a reload', async ({ browser }) => {
  const page = await openBoard(browser, '/')
  await drawRect(page, [300, 300], [400, 400])
  await expect(summary(page)).toHaveText(/^1 object/)
  await page.reload()
  await expect(summary(page)).toHaveText(/^1 object/)
})

test('opens the shortcut list from the keyboard', async ({ browser }) => {
  const page = await openBoard(browser, '/')
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
