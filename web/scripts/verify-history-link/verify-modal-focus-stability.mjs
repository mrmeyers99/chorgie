// Regression test for a PR #64 review finding: the shared Modal's focus-trap
// effect depended on `onClose`, a plain function redefined every render of the
// parent. Any re-render while the modal was open (e.g. clicking Save, which
// sets `savingName` and disables the buttons) re-ran the effect and yanked
// focus back onto the first focusable element (the name input), even if the
// user had tabbed focus elsewhere. Fixed by keeping onClose in a ref and using
// a stable effect dependency (a useId-derived title id that never changes).

import { chromium } from 'playwright'

const BASE = process.env.WEB_URL ?? 'http://localhost:5173'

const email = `pw-verify-focus-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Focus Kid'
const newName = 'Renamed Focus Kid'

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

  await page.click('button:has-text("Edit Name")')
  await page.locator('[role="dialog"]').waitFor({ timeout: 10000 })
  await page.fill('#editKidName', newName)

  // Tab away from the input onto the Save button, confirm it landed there
  await page.keyboard.press('Tab')
  const focusedBeforeSave = await page.evaluate(() => document.activeElement?.textContent)
  if (focusedBeforeSave !== 'Save') {
    throw new Error(`Expected Save button focused after Tab, got "${focusedBeforeSave}"`)
  }

  // Click Save (fires the in-flight PATCH, disabling Save/Cancel synchronously)
  // and immediately check where focus landed — this is the exact repro from
  // the review: a re-render mid-save should NOT snap focus back to the input.
  await page.click('button:has-text("Save")')
  const focusedIdRightAfterClick = await page.evaluate(() => document.activeElement?.id)
  if (focusedIdRightAfterClick === 'editKidName') {
    throw new Error(
      'Focus was yanked back into #editKidName immediately after clicking Save — the stale-onClose focus-trap bug is present',
    )
  }

  await page.waitForSelector(`text=${newName}`, { timeout: 10000 })
  console.log('OK: focus was not stolen back to the input when Save disabled mid-request.')
} finally {
  await browser.close()
}
