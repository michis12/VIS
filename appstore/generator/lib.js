// shared helpers for the App Store screenshots
const puppeteer = require('puppeteer-core')
const path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://localhost:5310/'
const OUT = path.join(__dirname, 'raw')

async function open() {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    userDataDir: path.join(__dirname, 'profile'),
    args: ['--hide-scrollbars', '--lang=de-DE'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.emulateTimezone('Europe/Vienna')
  return { browser, page }
}

// iPhone safe areas so the content sits below the status bar / island
const SAFE = ':root{--safe-top:59px!important;--safe-bottom:30px!important} *::-webkit-scrollbar{display:none}'
async function load(page) {
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.addStyleTag({ content: SAFE })
  await page.waitForSelector('.tabbar', { timeout: 20000 })
  await sleep(700)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function shot(page, name) {
  await sleep(900)
  await page.screenshot({ path: path.join(OUT, name + '.png') })
  console.log('shot', name)
}
async function tab(page, i) {
  await page.evaluate((i) => document.querySelectorAll('.tabbar .tab')[i].click(), i)
  await sleep(700)
}
async function clickText(page, sel, text) {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text))
    if (el) { el.click(); return true }
    return false
  }, sel, text)
  if (!ok) throw new Error('not found: ' + sel + ' ' + text)
  await sleep(600)
}
module.exports = { open, load, shot, tab, clickText, sleep, OUT }
