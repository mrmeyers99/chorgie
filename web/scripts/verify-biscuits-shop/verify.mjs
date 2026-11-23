// Ad-hoc smoke test for biscuits (earning) and the avatar shop.
//
// Registers a throw-away household against a running API + web dev server,
// creates a kid plus a recurring and an always-available chore, and confirms:
//   1. Chore cards show what they're worth in biscuits (10 on time, flat 5).
//   2. Completing chores credits biscuits (status message + kid tile).
//   3. The shop shows "Need N more" when the kid is short, lets them try items
//      on, and lets them buy once they can afford it: biscuits drop by the
//      price and the item is worn right away.
//   4. Taking off / wearing again works.
//   5. Worn items show on the kid's avatar on the home screen, and the biscuits
//      earned show in History.
//
// Does NOT clean up the test data it creates -- point it at a disposable dev
// database (see CLAUDE.md).
//
// Setup: npm install && npx playwright install chromium
//        (or skip the browser download and use installed Chrome: PW_CHANNEL=chrome)
// Run:   WEB_URL=http://localhost:5173 API_URL=http://localhost:3000 node verify.mjs

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'
const API_BASE = process.env.API_URL ?? 'http://localhost:3000'
const SHOTS = join(__dirname, 'screenshots')

const email = `pw-shop-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Shop Kid'
const recurringChore = 'Feed the dog'
const repeatChore = 'Tidy the toys'

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function fetchRaw(page, path) {
  return page.evaluate(
    async ({ apiBase, path }) => {
      const token = sessionStorage.getItem('accessToken')
      const res = await fetch(`${apiBase}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json()
    },
    { apiBase: API_BASE, path },
  )
}

async function firstKid(page) {
  const kids = await fetchRaw(page, '/kids')
  return kids.kids[0]
}

async function selectKid(page) {
  await page.goto(`${BASE}/`)
  await page.click(`button:has-text("${kidName}")`)
  await page.waitForSelector('text=+ I did something else')
}

function choreRow(page, name) {
  return page.locator('li', { hasText: name }).first()
}

function shopCard(page, itemName) {
  return page.locator('li', { hasText: itemName }).first()
}

async function completeChore(page, name, expectBiscuits) {
  await choreRow(page, name).locator('button:has-text("Complete")').click()
  await page.waitForSelector(
    `[role=status]:has-text("and ${expectBiscuits} biscuit")`,
  )
}

async function addChore(page, name, type) {
  await page.click('button:has-text("Add Chore")')
  await page.fill('#enc_name', name)
  await page.fill('#reward_amount', '1')
  await page.selectOption('#recurrence_type', type)
  if (type === 'recurring') await page.fill('#recurrence_interval_days', '1')
  await page.click('button[type=submit]:has-text("Add Chore")')
  await page.waitForSelector(`text=${name}`)
}

async function openShop(page) {
  await page.click('a:has-text("Shop")')
  await page.waitForSelector(`text=${kidName}'s Shop`)
}

await mkdir(SHOTS, { recursive: true })

const browser = await chromium.launch(
  process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {},
)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('dialog', (dialog) => dialog.accept())

try {
  await page.goto(`${BASE}/register`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.fill('#confirmPassword', password)
  await page.fill('#admin_pin', pin)
  await page.fill('#confirmAdminPin', pin)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`, { timeout: 10000 })

  // Admin: create a kid and two chores
  await page.goto(`${BASE}/admin`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.click('text=Add Kid')
  await page.fill('#kidName', kidName)
  await page.click('button:has-text("Add Kid"):not([aria-label])')
  await page.waitForSelector(`text=${kidName}`)
  await page.goto(`${BASE}/chores`)
  await addChore(page, recurringChore, 'recurring')
  await addChore(page, repeatChore, 'always-available')
  await page.click('button:has-text("Exit Admin")')
  await page.waitForURL(`${BASE}/`)

  // 1. Chore cards show their biscuit value
  await selectKid(page)
  assert(
    (await choreRow(page, recurringChore).locator('[aria-label="10 biscuits"]').count()) === 1,
    'recurring chore card should show 10 biscuits',
  )
  assert(
    (await choreRow(page, repeatChore).locator('[aria-label="5 biscuits"]').count()) === 1,
    'always-available chore card should show 5 biscuits',
  )
  await page.screenshot({ path: join(SHOTS, '1-home-chore-biscuits.png'), fullPage: true })

  // 2. Completing credits biscuits
  await completeChore(page, recurringChore, 10)
  assert((await firstKid(page)).biscuits === 10, 'expected 10 biscuits after on-time recurring chore')
  await page.waitForSelector(`button:has-text("${kidName}") [aria-label="10 biscuits"]`)

  // 3. Shop: too short for the crown and the party hat; try one on
  await openShop(page)
  assert(
    await shopCard(page, 'Crown').locator('button:has-text("Need 60 more")').isDisabled(),
    'crown should need 60 more',
  )
  assert(
    await shopCard(page, 'Party hat').locator('button:has-text("Need 10 more")').isDisabled(),
    'party hat should need 10 more',
  )
  await page.click('button[aria-label="Try on Party hat"]')
  await page.waitForSelector('text=Trying on:')
  await page.screenshot({ path: join(SHOTS, '2-shop-short-preview.png'), fullPage: true })

  // Earn 25 more (5 x always-available) -> 35, then buy party hat (20) + red collar (15)
  await selectKid(page)
  for (let i = 0; i < 5; i += 1) await completeChore(page, repeatChore, 5)
  assert((await firstKid(page)).biscuits === 35, 'expected 35 biscuits')

  await openShop(page)
  await shopCard(page, 'Party hat').locator('button:has-text("Buy")').click()
  await page.waitForSelector('[role=status]:has-text("You got the Party hat!")')
  await shopCard(page, 'Red collar').locator('button:has-text("Buy")').click()
  await page.waitForSelector('[role=status]:has-text("You got the Red collar!")')
  const kid = await firstKid(page)
  const shop = await fetchRaw(page, `/shop/kids/${kid.id}`)
  assert(shop.biscuits === 0, `expected 0 biscuits after buying, got ${shop.biscuits}`)
  assert(
    shop.items.length === 2 && shop.items.every((i) => i.equipped),
    `both items should be owned and worn: ${JSON.stringify(shop.items)}`,
  )
  await page.screenshot({ path: join(SHOTS, '3-shop-bought.png'), fullPage: true })

  // 4. Take off / wear again
  await shopCard(page, 'Party hat').locator('button:has-text("Take off")').click()
  await shopCard(page, 'Party hat').locator('button:has-text("Wear")').click()
  await shopCard(page, 'Party hat').locator('button:has-text("Take off")').waitFor()

  // 5. Accessories on the home avatar + biscuits in History
  const after = await firstKid(page)
  assert(
    JSON.stringify(after.equipped_items) === JSON.stringify(['party-hat', 'red-collar']),
    `equipped_items: ${JSON.stringify(after.equipped_items)}`,
  )
  await selectKid(page)
  assert(
    (await page.locator('[data-accessory="party-hat"]').count()) > 0,
    'party hat not drawn on the home avatar',
  )
  await page.screenshot({ path: join(SHOTS, '4-home-wearing.png'), fullPage: true })

  await page.click('text=View History')
  await page.waitForSelector('[aria-label="plus 10 biscuits"]')
  await page.screenshot({ path: join(SHOTS, '5-history-biscuits.png'), fullPage: true })

  console.log('✅ biscuits + shop verified')
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {})
  console.error('❌', err.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
