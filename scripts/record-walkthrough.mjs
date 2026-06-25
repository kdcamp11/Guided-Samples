// GRACE — user-facing walkthrough video generator.
//
// Drives the real product journey in a headed browser and records a clean demo
// video to /public/demo/grace-walkthrough.webm (embedded on the landing page).
//
// Usage:
//   npm run record:walkthrough
//
// Environment:
//   GRACE_URL          Target site. Defaults to http://localhost:3000.
//                      (e.g. GRACE_URL=https://graceofficial.app)
//   HEADLESS=1         Record without a visible window (CI; needs a display/xvfb).
//   GRACE_DEMO_EMAIL / GRACE_DEMO_PASSWORD
//                      Optional: sign in via the real auth modal.
//   GRACE_STORAGE_STATE
//                      Optional path to reuse/save an authenticated session.
//
// One-time setup:  npm install  &&  npx playwright install chromium
//
// This script only *observes* the product — it never changes the flow or logic.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.GRACE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = process.env.HEADLESS === '1'
const SIZE = { width: 1366, height: 854 }

const OUT_DIR = path.join(ROOT, 'public', 'demo')
const TMP_DIR = path.join(ROOT, 'test-results', 'walkthrough-video')
const TARGET = path.join(OUT_DIR, 'grace-walkthrough.webm')
const POSTER = path.join(OUT_DIR, 'grace-walkthrough-poster.png')

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(TMP_DIR, { recursive: true })

// Injected on every navigation: hide dev/debug overlays, seed demo state, and
// draw a soft demo cursor so clicks read clearly in the recording.
const INIT_SCRIPT = () => {
  try {
    const style = document.createElement('style')
    style.textContent = `
      nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
      [data-nextjs-dialog-overlay], [data-nextjs-build-indicator],
      #__next-prerender-indicator { display: none !important; }
      * { caret-color: transparent !important; }
    `
    ;(document.head || document.documentElement).appendChild(style)

    try {
      // Seeded demo state (values the app already reads — no product changes):
      // full free-AI allowance so no paywall interrupts, expanded sidebar.
      localStorage.setItem('grace_ai_free_used', '0')
      localStorage.setItem('grace-sidebar-collapsed', '0')
    } catch {}

    const mount = () => {
      if (!document.body || document.getElementById('__demo_cursor')) return
      const dot = document.createElement('div')
      dot.id = '__demo_cursor'
      Object.assign(dot.style, {
        position: 'fixed', left: '-100px', top: '-100px', zIndex: '2147483647',
        width: '20px', height: '20px', borderRadius: '50%', pointerEvents: 'none',
        background: 'rgba(10,10,10,0.16)', border: '2px solid rgba(10,10,10,0.5)',
        transform: 'translate(-50%,-50%)', transition: 'width .12s, height .12s, background .12s',
      })
      document.body.appendChild(dot)
      addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px' }, true)
      addEventListener('mousedown', () => { dot.style.width = '38px'; dot.style.height = '38px'; dot.style.background = 'rgba(34,197,94,0.35)' }, true)
      addEventListener('mouseup', () => { dot.style.width = '20px'; dot.style.height = '20px'; dot.style.background = 'rgba(10,10,10,0.16)' }, true)
    }
    if (document.body) mount()
    else addEventListener('DOMContentLoaded', mount)
  } catch {}
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function main() {
  console.log(`\n🎬  Recording GRACE walkthrough against ${BASE}\n`)

  // Optional seeded auth: reuse a saved session, or sign in with demo creds via
  // the real UI. Without either, the run is a guest (the flow never gates on it).
  const storageStatePath = process.env.GRACE_STORAGE_STATE
  const reuseSession = !!(storageStatePath && fs.existsSync(storageStatePath))

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 280, // deliberate, demo-paced motion
    args: [`--window-size=${SIZE.width + 40},${SIZE.height + 120}`],
  })
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    recordVideo: { dir: TMP_DIR, size: SIZE },
    ...(reuseSession ? { storageState: storageStatePath } : {}),
  })
  await context.addInitScript(INIT_SCRIPT)
  const page = await context.newPage()
  const video = page.video()

  const pause = (ms) => page.waitForTimeout(ms).catch(() => {})
  const alive = () => !page.isClosed()

  // Log the current URL + every visible clickable's text — the key diagnostic
  // when an expected control isn't found.
  async function dump(label) {
    if (!alive()) { console.log(`   · [${label}] page already closed`); return }
    try {
      const texts = await page.$$eval('button, a, [role="button"], [role="tab"]', els =>
        Array.from(new Set(els
          .filter(e => e.offsetParent !== null && (e.offsetWidth || e.offsetHeight))
          .map(e => (e.innerText || e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean))).slice(0, 50))
      console.log(`   · [${label}] url = ${page.url()}`)
      console.log(`   · [${label}] visible buttons/links: ${texts.length ? texts.join('  |  ') : '(none found)'}`)
    } catch (e) { console.log(`   · [${label}] could not read page: ${e?.message ?? e}`) }
  }

  // Click the first matching locator from a list. Never throws.
  async function clickAny(desc, makers, { timeout = 4500 } = {}) {
    for (const make of makers) {
      try {
        const loc = make().first()
        await loc.waitFor({ state: 'visible', timeout })
        await loc.scrollIntoViewIfNeeded().catch(() => {})
        await loc.click({ timeout })
        return true
      } catch {}
    }
    return false
  }

  // Fallback cascade for a CTA: exact button text → partial button text →
  // partial link/role text → common CTA synonyms. Logs visible buttons on miss.
  async function advance(desc, names, { extras = true } = {}) {
    const COMMON = ['Start First Project', 'Start Project', 'Create Project', 'New Project',
      'New Design', 'Start a new design', 'Start designing', 'Get Started', 'Begin', 'Continue', 'Start']
    const candidates = extras ? [...names, ...COMMON.filter(c => !names.includes(c))] : names

    // 1) exact button text
    for (const n of candidates) {
      if (await clickAny(desc, [() => page.getByRole('button', { name: new RegExp(`^\\s*${escapeRe(n)}\\s*$`, 'i') })], { timeout: 1500 })) {
        console.log(`   · clicked "${n}" (exact button)`); return true
      }
    }
    // 2) partial button text
    for (const n of names) {
      if (await clickAny(desc, [() => page.getByRole('button', { name: new RegExp(escapeRe(n), 'i') })], { timeout: 1200 })) {
        console.log(`   · clicked "${n}" (partial button)`); return true
      }
    }
    // 3) partial link / role=button text
    for (const n of names) {
      if (await clickAny(desc, [
        () => page.getByRole('link', { name: new RegExp(escapeRe(n), 'i') }),
        () => page.getByText(new RegExp(escapeRe(n), 'i')),
      ], { timeout: 1000 })) {
        console.log(`   · clicked "${n}" (text/link)`); return true
      }
    }
    console.warn(`   · could not find a CTA for: ${desc}`)
    await dump(desc)
    return false
  }

  async function waitFor(desc, makers, { timeout = 12000, diagnose = true } = {}) {
    for (const make of makers) {
      try { await make().first().waitFor({ state: 'visible', timeout }); return true } catch {}
    }
    console.warn(`   · screen not detected: ${desc}`)
    if (diagnose) await dump(desc)
    return false
  }

  const byRole = (name) => () => page.getByRole('button', { name })
  const byText = (text) => () => page.getByText(text, { exact: false })

  // Sign in with seeded demo credentials via the real auth modal (no product change).
  async function maybeLogin() {
    if (reuseSession) { console.log('▶ Reusing saved demo session'); return }
    const email = process.env.GRACE_DEMO_EMAIL
    const password = process.env.GRACE_DEMO_PASSWORD
    if (!email || !password) { console.log('   · no demo credentials set — recording as guest'); return }
    console.log('▶ Signing in as demo account')
    if (!await clickAny('Open auth', [() => page.getByRole('button', { name: /sign in/i })])) return
    try {
      await page.getByPlaceholder('you@example.com').first().fill(email)
      await page.getByPlaceholder(/min\. 6 characters/i).first().fill(password)
      await clickAny('Submit sign-in', [byRole(/sign in & continue/i), byRole(/^sign in/i)])
      await pause(2800)
      if (storageStatePath) {
        fs.mkdirSync(path.dirname(storageStatePath), { recursive: true })
        await context.storageState({ path: storageStatePath })
        console.log(`   · saved session → ${path.relative(ROOT, storageStatePath)}`)
      }
    } catch (e) { console.warn('   · sign-in skipped:', e?.message ?? e) }
  }

  try {
    // ── 1. Landing page ───────────────────────────────────────────────────────
    console.log('▶ Landing page')
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await pause(3000)
    await page.screenshot({ path: POSTER, animations: 'disabled', scale: 'css' }).then(
      () => console.log(`   · poster → ${path.relative(ROOT, POSTER)}`), () => {})
    await maybeLogin()
    if (!await advance('Enter Studio', ['Build It Yourself', 'Open Studio', 'Launch Studio', 'Self Service', 'Start your first design'], { extras: false })) {
      throw new Error('Could not enter the Studio from the landing page')
    }

    // ── 2. New Project (via the Projects section) ─────────────────────────────
    console.log('▶ New Project')
    await waitFor('Studio shell', [byText('GRACE Enterprise')], { timeout: 15000 })
    await pause(1200)
    // Self-service drops into the design flow; open the Projects section first so
    // the "New Project" entry point is on screen.
    await advance('Open Projects section', ['Projects'], { extras: false })
    await pause(1400)
    await advance('New Project', ['New Project', 'Start First Project', 'Start a new design', 'New Design'])

    // ── 3. Select Your Route ──────────────────────────────────────────────────
    console.log('▶ Select Your Route')
    await waitFor('Select Your Route', [byText('Select Your Route'), byText('Custom Apparel')])
    await pause(2200)
    await advance('Custom Apparel', ['Custom Apparel'], { extras: false })

    // ── 4. Design Studio — showcase the tools ─────────────────────────────────
    console.log('▶ Design Studio')
    await waitFor('Design Studio', [byText('Design Studio'), byRole(/Confirm Design/i)])
    await pause(1800)

    await clickAny('Garment tab', [() => page.getByRole('button', { name: 'Garment' })])
    await pause(1800)
    await clickAny('GRACE Library', [byText('GRACE Library')])
    await pause(1400)
    await clickAny('Library garment', [() => page.locator('button img').nth(0)])
    await pause(1600)
    await clickAny('Garment colour swatch', [() => page.locator('button[title^="#"], button[style*="background"]').nth(2)])
    await pause(1400)

    await clickAny('Logo/Art tab', [() => page.getByRole('button', { name: /Logo\/Art/i })])
    await pause(1700)

    await clickAny('Text tab', [() => page.getByRole('button', { name: 'Text' })])
    await pause(1100)
    await clickAny('Add Text Layer', [byRole(/Add Text Layer/i)])
    await pause(700)
    try {
      const ta = page.getByPlaceholder('Your text here').first()
      await ta.waitFor({ state: 'visible', timeout: 3000 })
      await ta.fill('GRACE')
    } catch {}
    await pause(1400)

    await clickAny('Preview toggle', [() => page.getByRole('button', { name: 'Preview' })])
    await pause(1700)
    await clickAny('Design toggle', [() => page.getByRole('button', { name: 'Design' })])
    await pause(800)
    await clickAny('Save', [() => page.getByRole('button', { name: 'Save' })])
    await pause(1300)
    await advance('Confirm Design', ['Confirm Design'], { extras: false })

    // ── 5. Preview in Reality (preview optional — proceed directly) ────────────
    console.log('▶ Preview in Reality')
    await waitFor('Preview in Reality', [byText('Preview in Reality')])
    await pause(2600)
    await advance('Proceed to Tech Pack', ['Proceed to Tech Pack', 'Proceed', 'Continue'], { extras: false })

    // ── 6. Tech Pack ──────────────────────────────────────────────────────────
    console.log('▶ Tech Pack')
    await waitFor('Tech Pack', [byText('Tech Pack')])
    await pause(2600)
    await advance('Send to Production', ['Send to Production', 'Start Production'], { extras: false })

    // ── 7. Send to Production ─────────────────────────────────────────────────
    console.log('▶ Send to Production')
    await waitFor('Send to Production', [byText('Send to Production')])
    await pause(3200) // final hold
  } catch (err) {
    console.warn('\n⚠️  Walkthrough ended early:', err?.message ?? err)
    if (alive()) await dump('on-exit')
    console.warn('   The recording up to this point is still saved below.\n')
  } finally {
    // Always finalise + save the video, even if a page closed mid-run.
    await context.close().catch(() => {})
    let saved = false
    if (video) {
      try { await video.saveAs(TARGET); saved = true } catch (e) { console.warn('   · video.saveAs failed:', e?.message ?? e) }
    }
    if (!saved) {
      // Fallback: recover whatever Playwright wrote to the scratch dir.
      try {
        const webm = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.webm'))
          .map(f => ({ f, t: fs.statSync(path.join(TMP_DIR, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t)[0]
        if (webm) { fs.copyFileSync(path.join(TMP_DIR, webm.f), TARGET); saved = true }
      } catch {}
    }
    await browser.close().catch(() => {})
    if (saved) console.log(`\n✅  Saved demo video → ${path.relative(ROOT, TARGET)}\n`)
    else { console.error('\n❌  No video could be saved.\n'); process.exitCode = 1 }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
