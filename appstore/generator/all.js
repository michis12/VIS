// every screenshot for the store images in one language: node all.js de|en
const path = require('path')
const fs = require('fs')
const { open, load, tab, clickText, sleep } = require('./lib')
const L = process.argv[2] === 'en' ? 'en' : 'de'
const OUT = path.join(__dirname, 'raw-' + L)
fs.mkdirSync(OUT, { recursive: true })
const T = {
  de: {
    coach: require('./ai-coach.json'),
    food: { text: '2 Eier, 2 Toast, halbe Avocado, Cappuccino', items: [['Vollkorntoast', 60, 147, 5.4, 25, 2.1], ['Ei, gekocht', 110, 171, 14, 1.2, 12], ['Avocado', 70, 112, 1.4, 1.3, 10.5], ['Cappuccino', 200, 76, 4, 6, 3.8]], comment: 'Toast mit 2 Scheiben, Eier mittelgroß angenommen.' },
    add: 'Hinzufügen', manage: 'Verwalten', all: 'Alle Übungen', start: 'Workout starten', muscles: 'Muskeln',
  },
  en: {
    coach: [
      { id: 'm1', role: 'user', text: 'How was my week?' },
      { id: 'm2', role: 'assistant', text: 'Strong week, Max: 3 of 3 workouts and a week score of 80 – Elite. You hit a new bench press record. You still need 76 g of protein today to reach your goal.' },
      { id: 'm3', role: 'user', text: 'Log 250 g skyr with berries as a snack and build me a push day' },
      { id: 'm4', role: 'assistant', text: 'Done – just tap Apply.', actions: [
        { a: { kind: 'log' }, title: 'Log: Snacks, today', detail: '250 g skyr · 100 g berries · 205 kcal · 29 g protein' },
        { a: { kind: 'template' }, title: 'New template: Push Day', detail: 'Bench Press (Barbell) ×3 · Incline Chest Fly (Dumbbell) ×2 · Lateral Raise (Machine) ×3 · Triceps Pushdown ×2' },
      ] },
    ],
    food: { text: '2 eggs, 2 toast, half an avocado, cappuccino', items: [['Wholegrain toast', 60, 147, 5.4, 25, 2.1], ['Egg, boiled', 110, 171, 14, 1.2, 12], ['Avocado', 70, 112, 1.4, 1.3, 10.5], ['Cappuccino', 200, 76, 4, 6, 3.8]], comment: 'Assumed 2 slices of toast and medium eggs.' },
    add: 'Add', manage: 'Manage', all: 'All exercises', start: 'Start workout', muscles: 'Muscles',
  },
}[L]

const shot = async (page, name) => { await sleep(900); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(L, name) }
const dropActive = (page) => page.evaluate(async () => {
  const db = await import('/src/db.ts')
  const s = await db.loadAll()
  for (const w of s.workouts) if (w.status === 'active') await db.del('workouts', w.id)
})

;(async () => {
  const { browser, page } = await open()
  await load(page)
  await dropActive(page)
  await page.evaluate(async (L) => {
    const db = await import('/src/db.ts')
    const s = await db.loadAll()
    await db.saveSettings({ ...s.settings, lang: L })
    localStorage.removeItem('vis.coach.v1')
  }, L)
  await load(page)
  await page.addStyleTag({ content: '.plan-badge{display:none!important}' })

  if (process.argv[3] !== 'workout') await rest(page)
  await workout(page)
  await page.evaluate(async () => {
    const db = await import('/src/db.ts')
    const s = await db.loadAll()
    await db.saveSettings({ ...s.settings, lang: 'de' })
  })
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })

async function rest(page) {
  // tabs
  await tab(page, 2); await shot(page, 'home')
  await tab(page, 3); await shot(page, 'food')
  await tab(page, 0); await shot(page, 'stats')
  await tab(page, 4); await shot(page, 'profile')
  await tab(page, 1)
  await page.evaluate((h) => [...document.querySelectorAll('h2')].find((x) => x.textContent === h)?.scrollIntoView({ block: 'start' }), T.muscles)
  await page.evaluate(() => { const s = document.querySelector('.screen'); if (s) s.scrollBy(0, -70); else window.scrollBy(0, -70) })
  await shot(page, 'body-muscles')

  // coach
  await page.evaluate((m) => localStorage.setItem('vis.coach.v1', JSON.stringify(m)), T.coach)
  await tab(page, 2)
  await page.click('.coach-btn'); await sleep(900)
  await shot(page, 'coach')
  await page.evaluate(() => localStorage.removeItem('vis.coach.v1'))

  // AI food entry from text
  await load(page)
  await page.evaluate((f) => {
    window.__mockAi = async (body) => {
      await new Promise((r) => setTimeout(r, 300))
      if (body.mode !== 'text') return {}
      return { items: f.items.map(([name, grams, kcal, protein, carbs, fat]) => ({ name, grams, kcal, protein, carbs, fat, ref: '' })), comment: f.comment }
    }
  }, T.food)
  await tab(page, 3)
  await clickText(page, '.btn', T.add)
  await page.type('input.input', T.food.text, { delay: 5 })
  await sleep(500)
  await page.click('.ai-row'); await sleep(1500)
  await shot(page, 'ai-food')

  // exercise library
  await load(page)
  await tab(page, 2)
  await clickText(page, 'button.link', T.manage)
  await clickText(page, '.menu button', T.all)
  await shot(page, 'exercises')
}

async function workout(page) {
  // running workout: first sets beat the last time (records and progress)
  await load(page)
  await tab(page, 2)
  await page.click('.card.tpl.tpl-next'); await sleep(700)
  await clickText(page, '.btn', T.start); await sleep(900)
  await page.evaluate(async () => {
    const db = await import('/src/db.ts')
    const s = await db.loadAll()
    const w = s.workouts.find((x) => x.status === 'active')
    // what was lifted last time in this template
    const last = s.workouts.filter((x) => x.status === 'done' && x.templateId === w.templateId).pop()
    const prev = (i) => last.exercises.find((e) => e.exerciseId === w.exercises[i].exerciseId).sets
    const p0 = prev(0), p1 = prev(1)
    // exercise 1: heavier than ever = record, then one more rep = progress
    w.exercises[0].sets[0] = { weight: p0[0].weight + 5, reps: p0[0].reps, done: true }
    w.exercises[0].sets[1] = { weight: p0[1].weight, reps: p0[1].reps + 1, done: true }
    // exercise 2: more reps than last time = progress
    w.exercises[1].sets = w.exercises[1].sets.map((x, i) => (i < 2 ? { weight: p1[i].weight, reps: p1[i].reps + 1, done: true } : x))
    w.startedAt = new Date(Date.now() - 23 * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    await db.put('workouts', w)
  })
  await load(page)
  await page.evaluate(() => [...document.querySelectorAll('.hero')][0]?.click()); await sleep(1200)
  await shot(page, 'workout')
  await dropActive(page)
}
