// Ad-hoc smoke test for kid-submitted chore requests ("I did something else").
//
// Registers a throw-away household against a running API + web dev server,
// creates a kid, and confirms:
//   1. A kid can submit an off-list chore (with and without an amount) from the
//      home dashboard, and it shows under "Waiting for Approval".
//   2. The request name is ciphertext on the wire, not plaintext.
//   3. Admin Mode shows a pending-count badge on the "Requests" nav link.
//   4. The admin can adjust the amount and approve -> kid balance increases by
//      the approved (not requested) amount, and it appears in History.
//   5. The admin can decline -> no balance change, it leaves the pending list.
//
// Does NOT clean up the test data it creates -- point it at a disposable dev
// database (see CLAUDE.md).
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

const email = `pw-requests-${Date.now()}@example.com`
const password = 'testpassword123'
const pin = '1234'
const kidName = 'Request Kid'
const approvedChore = 'Raked the leaves'
const declinedChore = 'Ate my vegetables'

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

async function selectKid(page) {
  await page.goto(`${BASE}/`)
  await page.click(`button:has-text("${kidName}")`)
  await page.waitForSelector('text=+ I did something else')
}

async function submitRequest(page, name, amount) {
  await page.click('text=+ I did something else')
  await page.fill('#requestName', name)
  if (amount !== undefined) await page.fill('#requestAmount', String(amount))
  await page.click('button:has-text("Send for approval")')
  await page.waitForSelector(`[role=status]:has-text("${name}")`)
}

await mkdir(SHOTS, { recursive: true })

const browser = await chromium.launch()
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

  // Create a kid in admin mode, then exit admin mode back to the kid view
  await page.goto(`${BASE}/admin`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.click('text=Add Kid')
  await page.fill('#kidName', kidName)
  await page.click('button:has-text("Add Kid"):not([aria-label])')
  await page.waitForSelector(`text=${kidName}`)
  await page.click('button:has-text("Exit Admin")')
  await page.waitForURL(`${BASE}/`)

  // 1. Kid submits two requests
  await selectKid(page)
  await submitRequest(page, approvedChore, 2)
  await submitRequest(page, declinedChore)
  await page.waitForSelector('text=Waiting for Approval')
  assert(await page.isVisible(`text=${approvedChore}`), 'pending request not listed')
  assert(await page.isVisible('text=Grown-up decides'), 'no-amount request label missing')
  await page.screenshot({ path: join(SHOTS, '1-kid-pending-requests.png'), fullPage: true })

  // 2. Ciphertext on the wire
  const raw = await fetchRaw(page, '/chore-requests?status=pending')
  assert(raw.requests.length === 2, `expected 2 pending requests, got ${raw.requests.length}`)
  for (const req of raw.requests) {
    assert(![approvedChore, declinedChore].includes(req.enc_name), 'enc_name is plaintext on the wire')
  }

  // 3. Admin badge
  await page.goto(`${BASE}/requests`)
  await page.fill('#pin', pin)
  await page.click('button:has-text("Enter Admin Mode")')
  await page.waitForSelector(`text=${approvedChore}`)
  const badge = await page.textContent('a:has-text("Requests") span')
  assert(badge?.trim() === '2', `expected nav badge "2", got "${badge}"`)
  await page.screenshot({ path: join(SHOTS, '2-admin-requests.png'), fullPage: true })

  // 4. Approve with an adjusted amount
  const approveRow = page.locator('li', { hasText: approvedChore })
  await approveRow.locator('input[type=number]').fill('3.50')
  await approveRow.locator('button:has-text("Approve")').click()
  await page.waitForSelector(`[role=status]:has-text("earned $3.50")`)

  // 5. Decline the other
  const declineRow = page.locator('li', { hasText: declinedChore })
  await declineRow.locator('button:has-text("Decline")').click()
  await page.waitForSelector('text=No requests waiting for approval')
  assert(!(await page.isVisible('a:has-text("Requests") span')), 'badge still shown after clearing queue')
  await page.screenshot({ path: join(SHOTS, '3-admin-requests-cleared.png'), fullPage: true })

  const kids = await fetchRaw(page, '/kids')
  const kid = kids.kids[0]
  assert(Number(kid.balance) === 3.5, `expected balance 3.50, got ${kid.balance}`)

  await page.click('button:has-text("Exit Admin")')
  await page.waitForURL(`${BASE}/`)
  await selectKid(page)
  assert(!(await page.isVisible('text=Waiting for Approval')), 'pending section still shown')

  await page.click('text=View History')
  await page.waitForSelector(`text=${approvedChore}`)
  assert(await page.isVisible('text=+$3.50'), 'approved amount not in history')
  assert(!(await page.isVisible(`text=${declinedChore}`)), 'declined request leaked into history')
  await page.screenshot({ path: join(SHOTS, '4-history-with-extra.png'), fullPage: true })

  console.log('✅ chore request flow verified')
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'failure.png'), fullPage: true })
  console.error('❌', err.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
