// GRACE — user-facing walkthrough video generator.
//
// Drives the real product journey in a headed browser and records a clean demo
// video to /public/demo/grace-walkthrough.webm (embedded on the landing page).
//
// Usage:
//   npm run record:walkthrough
//
// Environment:
//   GRACE_URL   Target site. Defaults to http://localhost:3000.
//               (e.g. GRACE_URL=https://graceofficial.app npm run record:walkthrough)
//   HEADLESS=1  Record without a visible window (for CI; needs a display/xvfb).
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

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(TMP_DIR, { recursive: true })

// Injected on every navigation: hide dev/debug overlays + draw a soft demo cursor
// so clicks read clearly in the recording.
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

async function main() {
  console.log(`\n🎬  Recording GRACE walkthrough against ${BASE}\n`)
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 280, // deliberate, demo-paced motion
    args: [`--window-size=${SIZE.width + 40},${SIZE.height + 120}`],
  })
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    recordVideo: { dir: TMP_DIR, size: SIZE },
  })
  await context.addInitScript(INIT_SCRIPT)
  const page = await context.newPage()
  const video = page.video()

  const pause = (ms) => page.waitForTimeout(ms)

  // Try a list of locators in order; click the first that's visible. Never throws.
  async function clickAny(desc, locators, { timeout = 4500 } = {}) {
    for (const make of locators) {
      try {
        const loc = make().first()
        await loc.waitFor({ state: 'visible', timeout })
        await loc.scrollIntoViewIfNeeded().catch(() => {})
        await loc.click({ timeout })
        return true
      } catch {}
    }
    console.warn(`   · skipped (not found): ${desc}`)
    return false
  }

  async function waitFor(desc, locators, { timeout = 9000 } = {}) {
    for (const make of locators) {
      try { await make().first().waitFor({ state: 'visible', timeout }); return true } catch {}
    }
    console.warn(`   · screen not detected: ${desc}`)
    return false
  }

  const byRole = (name) => () => page.getByRole('button', { name })
  const byText = (text) => () => page.getByText(text, { exact: false })

  try {
    // ── 1. Landing page ───────────────────────────────────────────────────────
    console.log('▶ Landing page')
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await pause(3000)
    await clickAny('Self-service entry', [byRole(/build it yourself/i), byRole(/open studio/i), byRole(/launch studio/i)])

    // ── 2. New Project ────────────────────────────────────────────────────────
    console.log('▶ New Project')
    await waitFor('Projects', [byRole(/new project/i), byRole(/start first project/i), byText('My Projects')])
    await pause(1600)
    await clickAny('New Project', [byRole(/new project/i), byRole(/start first project/i)])

    // ── 3. Select Your Route ──────────────────────────────────────────────────
    console.log('▶ Select Your Route')
    await waitFor('Select Your Route', [byText('Select Your Route')])
    await pause(2200)
    await clickAny('Custom Apparel', [byRole(/custom apparel/i), byText('Custom Apparel')])

    // ── 4. Design Studio — showcase the tools ─────────────────────────────────
    console.log('▶ Design Studio')
    await waitFor('Design Studio', [byText('Design Studio'), byRole(/Confirm Design/i)])
    await pause(1800)

    // Garment tab → GRACE Library / AI Generate / Upload Garment / colour palette
    await clickAny('Garment tab', [() => page.getByRole('button', { name: 'Garment' })])
    await pause(1800)
    await clickAny('GRACE Library', [byText('GRACE Library')])
    await pause(1400)
    // pick the first library garment so the design can move forward
    await clickAny('Library garment', [() => page.locator('button img').nth(0)])
    await pause(1600)
    // Garment Color palette
    await clickAny('Garment colour swatch', [() => page.locator('button[title^="#"], button[style*="background"]').nth(2)])
    await pause(1400)

    // Logo / Art tab
    await clickAny('Logo/Art tab', [() => page.getByRole('button', { name: /Logo\/Art/i })])
    await pause(1800)

    // Text tab + realistic input
    await clickAny('Text tab', [() => page.getByRole('button', { name: 'Text' })])
    await pause(1200)
    await clickAny('Add Text Layer', [byRole(/Add Text Layer/i)])
    await pause(700)
    try {
      const ta = page.getByPlaceholder('Your text here').first()
      await ta.waitFor({ state: 'visible', timeout: 3000 })
      await ta.fill('GRACE')
    } catch {}
    await pause(1500)

    // Design / Preview realism toggle
    await clickAny('Preview toggle', [() => page.getByRole('button', { name: 'Preview' })])
    await pause(1800)
    await clickAny('Design toggle', [() => page.getByRole('button', { name: 'Design' })])
    await pause(900)

    // Save
    await clickAny('Save', [() => page.getByRole('button', { name: 'Save' })])
    await pause(1400)

    // Confirm Design
    await clickAny('Confirm Design', [byRole(/Confirm Design/i)])

    // ── 5. Preview in Reality ─────────────────────────────────────────────────
    console.log('▶ Preview in Reality')
    await waitFor('Preview in Reality', [byText('Preview in Reality')])
    await pause(2600)
    await clickAny('Proceed to Tech Pack', [byRole(/Proceed to Tech Pack/i)])

    // ── 6. Tech Pack ──────────────────────────────────────────────────────────
    console.log('▶ Tech Pack')
    await waitFor('Tech Pack', [byText('Tech Pack')])
    await pause(2600)
    await clickAny('Send to Production', [byRole(/Send to Production/i)])

    // ── 7. Send to Production ─────────────────────────────────────────────────
    console.log('▶ Send to Production')
    await waitFor('Send to Production', [byText('Send to Production')])
    await pause(3200) // final hold
  } catch (err) {
    console.warn('\n⚠️  Walkthrough ended early:', err?.message ?? err)
    console.warn('   The video still captured everything reached up to this point.\n')
  }

  await context.close()
  await browser.close()

  if (video) {
    await video.saveAs(TARGET)
    await video.delete().catch(() => {})
    console.log(`\n✅  Saved demo video → ${path.relative(ROOT, TARGET)}\n`)
  } else {
    console.error('\n❌  No video was recorded.\n')
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
