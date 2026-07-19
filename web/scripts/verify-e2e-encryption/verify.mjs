// Ad-hoc smoke test for client-side E2E encryption (issue #53).
//
// Registers a throw-away household against a running API + web dev server,
// creates a kid and a recurring chore, and confirms:
//   1. The raw API response for enc_display_name/enc_name/enc_description is
//      NOT the plaintext string (i.e. actually ciphertext on the wire).
//   2. The UI still renders the decrypted plaintext.
//   3. After completing the chore and reloading the page, the decrypted
//      plaintext still renders — proving the household key (persisted in
//      IndexedDB) survives a reload, not just an in-memory variable.
//
// Does NOT clean up the test household/kid/chore it creates — point it at a
// disposable dev database (see CLAUDE.md).
//
// Setup: npm install && npx playwright install chromium
// Run:   WEB_URL=http://localhost:5173 API_URL=http://localhost:3000 node verify.mjs

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'
const API_BASE = process.env.API_URL ?? 'http://localhost:3000'
const SHOTS = join(__dirname, 'screenshots')

const email = `pw-verify-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Encryption Kid'
const choreName = 'Secret Chore Name'
const choreDescription = 'Should never be stored as plaintext'

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function fetchRaw(page, path, accessToken) {
  return page.evaluate(
    async ({ apiBase, path, token }) => {
      const res = await fetch(`${apiBase}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json()
    },
    { apiBase: API_BASE, path, token: accessToken },
  )
}

await mkdir(SHOTS, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  // Register a fresh test household
  await page.goto(`${BASE}/register`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.fill('#confirmPassword', password)
  await page.fill('#admin_pin', pin)
  await page.fill('#confirmAdminPin', pin)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`, { timeout: 10000 })

  const accessToken = await page.evaluate(() => sessionStorage.getItem('accessToken'))
  assert(accessToken, 'no access token stored after registration')

  // Add a kid via /admin
  await page.goto(`${BASE}/admin`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.waitForSelector('text=Add Kid', { timeout: 10000 })
  await page.click('text=Add Kid')
  await page.fill('#kidName', kidName)
  await page.click('button:has-text("Add Kid"):not([aria-label])')
  await page.waitForSelector(`text=${kidName}`, { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '1-admin-family-decrypted-kid.png'), fullPage: true })

  const rawKids = await fetchRaw(page, '/kids', accessToken)
  const rawKid = rawKids.kids.find((k) => k.avatar_id === 'corgi-1')
  assert(rawKid, 'created kid not found in raw API response')
  assert(rawKid.enc_display_name !== kidName, 'enc_display_name was stored as plaintext!')
  assert(/^[A-Za-z0-9+/]+=*$/.test(rawKid.enc_display_name), 'enc_display_name does not look like base64 ciphertext')
  console.log('OK: kid display name is ciphertext on the wire:', rawKid.enc_display_name)

  // Add a recurring chore via /chores
  await page.goto(`${BASE}/chores`)
  await page.click('text=Add Chore')
  await page.fill('#enc_name', choreName)
  await page.fill('#enc_description', choreDescription)
  await page.fill('#reward_amount', '1.50')
  await page.selectOption('#recurrence_type', 'recurring')
  await page.fill('#recurrence_interval_days', '3')
  await page.click('button:has-text("Add Chore")')
  await page.waitForSelector(`text=${choreName}`, { timeout: 10000 })
  await page.waitForSelector('text=every 3 days', { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '2-chore-admin-decrypted-chore.png'), fullPage: true })

  const rawChores = await fetchRaw(page, '/chores', accessToken)
  const rawChore = rawChores.chores.find((c) => c.recurrence_interval_days === 3)
  assert(rawChore, 'created chore not found in raw API response')
  assert(rawChore.enc_name !== choreName, 'enc_name was stored as plaintext!')
  assert(rawChore.enc_description !== choreDescription, 'enc_description was stored as plaintext!')
  console.log('OK: chore name/description are ciphertext on the wire:', rawChore.enc_name)

  // Complete the chore as the kid on the home page
  await page.goto(`${BASE}/`)
  await page.click(`text=${kidName}`)
  await page.waitForSelector(`text=${choreName}`, { timeout: 10000 })
  await page.click('button:has-text("Complete")')
  await page.waitForSelector('text=earned $1.50', { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '3-home-completed-chore.png'), fullPage: true })

  // Reload and confirm decrypted content survives (HEK persisted in IndexedDB,
  // not a bare in-memory variable that would be wiped on reload)
  await page.reload()
  await page.click(`text=${kidName}`)
  await page.waitForSelector(`text=${choreName}`, { timeout: 10000 })
  await page.waitForSelector('button:has-text("Not Yet")', { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '4-home-after-reload-still-decrypted.png'), fullPage: true })
  console.log('OK: kid/chore names still decrypted after a page reload (IndexedDB-persisted key)')

  // Payment history should also show the decrypted chore name and kid name
  await page.goto(`${BASE}/`)
  await page.click(`text=${kidName}`)
  await page.click('text=View History')
  await page.waitForSelector(`text=${choreName}`, { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '5-payment-history-decrypted.png'), fullPage: true })
  console.log('OK: payment history shows decrypted chore name')

  console.log(`\nOK: full E2E encryption flow verified. Screenshots written to ${SHOTS}`)
} finally {
  await browser.close()
}
