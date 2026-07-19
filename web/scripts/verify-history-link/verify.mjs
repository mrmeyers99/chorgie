// Ad-hoc smoke test for the admin "History" button (issue #52).
//
// Registers a throw-away household against a running API + web dev server,
// adds a kid, clicks the History button on the admin Family page, and
// confirms the back button returns to /admin. Screenshots each step into
// ./screenshots. Does NOT clean up the test household/kid it creates —
// point it at a disposable dev database, or delete the rows manually
// afterward (see CLAUDE.md).
//
// Setup: npm install && npx playwright install chromium
// Run:   WEB_URL=http://localhost:5173 node verify.mjs

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'
const SHOTS = join(__dirname, 'screenshots')

const email = `pw-verify-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Playwright Kid'

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

  // Add a kid via /admin
  await page.goto(`${BASE}/admin`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.waitForSelector('text=Add Kid', { timeout: 10000 })
  await page.click('text=Add Kid')
  await page.fill('#kidName', kidName)
  await page.click('button:has-text("Add Kid"):not([aria-label])') // submit button
  await page.waitForSelector(`text=${kidName}`, { timeout: 10000 })

  await page.screenshot({ path: join(SHOTS, '1-admin-family-with-history-button.png'), fullPage: true })

  // Click the History button on the kid tile
  await page.click('a:has-text("History")')
  await page.waitForURL(/\/history\?kid=/, { timeout: 10000 })
  await page.waitForSelector('text=Payment History', { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '2-payment-history-back-to-admin.png'), fullPage: true })

  // Click the back button, confirm it returns to /admin (not /)
  await page.click('button:has-text("Back to Admin")')
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForSelector('text=Your Family', { timeout: 10000 })
  await page.waitForSelector('a:has-text("History")', { timeout: 10000 })
  await page.screenshot({ path: join(SHOTS, '3-back-on-admin-page.png'), fullPage: true })

  console.log(`OK: full flow verified. Screenshots written to ${SHOTS}`)
} finally {
  await browser.close()
}
