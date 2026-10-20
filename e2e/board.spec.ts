import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

const summary = (page: Page) => page.getByTestId('board-summary')

const newBoard = () => `/b/e2e${Math.random().toString(36).slice(2, 10)}`

const contexts: BrowserContext[] = []

test.afterEach(() => Promise.all(contexts.splice(0).map((context) => context.close())))

async function openBoard(browser: Browser, path = newBoard()): Promise<Page> {
  const context = await browser.newContext()
  contexts.push(context)
  const page = await context.newPage()
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
  const alice = await openBoard(browser)
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
  const alice = await openBoard(browser)
  await openBoard(browser, new URL(alice.url()).pathname)
  await expect(alice.getByRole('group', { name: '2 people on this board' })).toBeVisible()
})

test('undo only reverts your own changes', async ({ browser }) => {
  const alice = await openBoard(browser)
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
  const page = await openBoard(browser)
  await drawRect(page, [300, 300], [400, 400])
  await expect(summary(page)).toHaveText(/^1 object/)
  await page.reload()
  await expect(summary(page)).toHaveText(/^1 object/)
})

test('opens the shortcut list from the keyboard', async ({ browser }) => {
  const page = await openBoard(browser)
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('fills an empty board from the sample', async ({ browser }) => {
  const page = await openBoard(browser)
  await page.getByRole('button', { name: 'Start from a sample' }).click()
  await expect(summary(page)).toHaveText(/^6 objects/)
  await expect(page.getByRole('heading', { name: 'An empty board' })).toBeHidden()
})

test('the home page leads to a new board', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Draw together, in real time' })).toBeVisible()
  await page.getByRole('link', { name: 'Open a board' }).first().click()
  await expect(page).toHaveURL(/\/b\/[a-z0-9]+$/)
  await expect(page.getByRole('heading', { name: 'An empty board' })).toBeVisible()
})

test('a view link shows the board live without letting the viewer edit', async ({ browser }) => {
  const alice = await openBoard(browser)
  await alice.getByRole('button', { name: 'Share' }).click()
  const link = alice.getByLabel('Can view')
  await expect(link).toHaveValue(/\/v\//)
  const viewer = await openBoard(browser, new URL(await link.inputValue()).pathname)
  await alice.keyboard.press('Escape')

  await drawRect(alice, [300, 300], [500, 420])
  await expect(summary(viewer)).toHaveText(/^1 object/)
  await expect(viewer.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0)

  await drawRect(viewer, [700, 300], [800, 400])
  await viewer.keyboard.press('Delete')
  await expect(summary(viewer)).toHaveText(/^1 object/)
  await expect(summary(alice)).toHaveText(/^1 object/)
})

test('a frame carries its contents and can be renamed', async ({ browser }) => {
  const page = await openBoard(browser)
  await page.keyboard.press('s')
  await page.mouse.click(500, 380)
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  await page.mouse.move(380, 260)
  await page.mouse.down()
  await page.mouse.move(760, 560, { steps: 5 })
  await page.mouse.up()

  await page.mouse.dblclick(400, 245)
  await page.getByLabel('Frame title').fill('Sprint ideas')
  await page.keyboard.press('Enter')

  await page.mouse.move(420, 245)
  await page.mouse.down()
  await page.mouse.move(620, 245, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  await page.mouse.dblclick(700, 380)
  await expect(page.getByLabel('Sticky note text')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.dblclick(620, 245)
  await expect(page.getByLabel('Frame title')).toHaveValue('Sprint ideas')
})

test('following someone keeps your view on theirs', async ({ browser }) => {
  const alice = await openBoard(browser)
  const bob = await openBoard(browser, new URL(alice.url()).pathname)
  await bob.getByRole('button', { name: /^Follow / }).click()

  await alice.getByRole('button', { name: 'Zoom in' }).click()
  await alice.getByRole('button', { name: 'Zoom in' }).click()
  const zoom = await alice.locator('.zoom-level').textContent()
  await expect(bob.locator('.zoom-level')).toHaveText(zoom!)
  await expect(bob.getByText(/^Following /)).toBeVisible()
})
