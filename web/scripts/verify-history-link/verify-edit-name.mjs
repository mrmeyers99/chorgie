// Ad-hoc smoke test for editing a kid's display name on the admin Family page.
//
// Registers a throw-away household, adds a kid, edits its name via the new
// "Edit Name" dialog, and confirms the updated name persists after reload.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'
const SHOTS = join(__dirname, 'screenshots')

const email = `pw-verify-edit-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Original Name'
const newName = 'Renamed Kid'

await mkdir(SHOTS, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(`${BASE}/register`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.fill('#confirmPassword', password)
  await page.fill('#admin_pin', pin)
  await page.fill('#confirmAdminPin', pin)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`, { timeout: 10000 })

  await page.goto(`${BASE}/admin`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.waitForSelector('text=Add Kid', { timeout: 10000 })
  await page.click('text=Add Kid')
  await page.fill('#kidName', kidName)
  await page.click('button:has-text("Add Kid"):not([aria-label])')
  await page.waitForSelector(`text=${kidName}`, { timeout: 10000 })

  await page.screenshot({ path: join(SHOTS, 'edit-1-before.png'), fullPage: true })

  await page.click('button:has-text("Edit Name")')
  await page.waitForSelector('#editKidName', { timeout: 10000 })
  await page.fill('#editKidName', '')
  await page.fill('#editKidName', newName)
  await page.screenshot({ path: join(SHOTS, 'edit-2-dialog.png'), fullPage: true })
  await page.click('button:has-text("Save")')
  await page.waitForSelector(`text=${newName}`, { timeout: 10000 })

  await page.screenshot({ path: join(SHOTS, 'edit-3-after.png'), fullPage: true })

  // Reload to confirm the rename actually persisted server-side
  await page.reload()
  await page.waitForSelector(`text=${newName}`, { timeout: 10000 })
  const oldNameStillPresent = await page.locator(`text=${kidName}`).count()
  if (oldNameStillPresent > 0) {
    throw new Error('Old name still present after reload — rename did not persist correctly')
  }

  console.log(`OK: kid name edited from "${kidName}" to "${newName}" and persisted. Screenshots in ${SHOTS}`)
} finally {
  await browser.close()
}
