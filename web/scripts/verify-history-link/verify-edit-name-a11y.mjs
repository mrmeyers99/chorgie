// Ad-hoc smoke test for the shared Modal component's accessibility behavior
// (Escape-to-close, focus trap, role=dialog) as used by the Edit Name dialog.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
void __dirname
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'

const email = `pw-verify-a11y-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'A11y Kid'
const newName = 'Renamed A11y Kid'

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

  // Open the Edit Name dialog and confirm the dialog role + autofocus
  await page.click('button:has-text("Edit Name")')
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ timeout: 10000 })
  const focusedId = await page.evaluate(() => document.activeElement?.id)
  if (focusedId !== 'editKidName') {
    throw new Error(`Expected #editKidName to be focused on open, got #${focusedId}`)
  }

  // Escape should close the dialog without saving
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached', timeout: 5000 })
  const stillOriginal = await page.locator(`text=${kidName}`).count()
  if (stillOriginal === 0) {
    throw new Error('Escape appears to have saved changes instead of just closing')
  }

  // Re-open, tab through the dialog, confirm focus wraps (trap) instead of escaping to the page
  await page.click('button:has-text("Edit Name")')
  await dialog.waitFor({ timeout: 10000 })
  // Save, Cancel are after the input; tab from input -> Save -> Cancel -> back to input (wrap)
  await page.keyboard.press('Tab') // input -> Save
  await page.keyboard.press('Tab') // Save -> Cancel
  await page.keyboard.press('Tab') // Cancel -> should wrap to input
  const wrappedId = await page.evaluate(() => document.activeElement?.id)
  if (wrappedId !== 'editKidName') {
    throw new Error(`Expected focus to wrap back to #editKidName, got #${wrappedId}`)
  }

  // Now actually save, to confirm the dialog still functions normally
  await page.fill('#editKidName', newName)
  await page.click('button:has-text("Save")')
  await page.waitForSelector(`text=${newName}`, { timeout: 10000 })

  console.log('OK: Modal dialog role, autofocus, Escape-to-close, and focus trap all verified.')
} finally {
  await browser.close()
}
