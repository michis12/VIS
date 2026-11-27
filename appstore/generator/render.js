// renders store.html (6 × 1320 × 2868) per language and cuts it into the 6 App Store images
// usage: node render.js de|en <out folder>
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const L = process.argv[2] === 'en' ? 'en' : 'de'
const out = process.argv[3] || path.join(__dirname, 'out-' + L)
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--hide-scrollbars'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 7920, height: 2868, deviceScaleFactor: 1 })
  await page.goto('file:///' + path.join(__dirname, 'store.html').replace(/\\/g, '/') + '?lang=' + L, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  fs.mkdirSync(out, { recursive: true })
  await page.screenshot({ path: path.join(out, 'panorama.png') })
  for (let i = 0; i < 6; i++) {
    await page.screenshot({ path: path.join(out, `${i + 1}.png`), clip: { x: i * 1320, y: 0, width: 1320, height: 2868 } })
  }
  await browser.close()
  console.log('done', L, out)
})().catch((e) => { console.error(e); process.exit(1) })
