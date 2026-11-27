// Fills the isolated screenshot profile with a believable demo athlete
const { open, load, sleep } = require('./lib')

;(async () => {
  const { browser, page } = await open()
  await load(page)
  const res = await page.evaluate(async () => {
    const db = await import('/src/db.ts')
    const { BASICS } = await import('/src/data/foods.ts')
    const { STARTER_SPLIT } = await import('/src/data/starterSplit.ts')
    const snap = await db.loadAll()
    const exIds = new Set(snap.exercises.map((e) => e.id))
    const pad = (n) => String(n).padStart(2, '0')
    const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const ago = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d }
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

    // templates: the reference Upper/Lower split + a 4th day
    const tpls = STARTER_SPLIT.map((t, i) => ({ id: 'tpl-' + (i + 1), name: t.name, exercises: t.exercises.filter((e) => exIds.has(e.id)).map((e) => ({ exerciseId: e.id, sets: e.sets })) }))
    for (const t of tpls) await db.put('templates', t)

    // workouts over 15 weeks, 4 per week, slowly getting stronger
    const base = new Map()
    const kg = (id) => { if (!base.has(id)) base.set(id, 20 + Math.round(rnd() * 14) * 5); return base.get(id) }
    let ti = 0, n = 0
    for (let a = 105; a >= 1; a--) {
      const d = ago(a)
      if (![1, 2, 4, 6].includes(d.getDay())) continue
      const t = tpls[ti % tpls.length]; ti++
      const week = (105 - a) / 7
      const w = {
        id: 'demo-w' + a, name: t.name, templateId: t.id, status: 'done', source: 'app',
        startedAt: `${day(d)}T${pad(17 + Math.floor(rnd() * 2))}:${pad(Math.floor(rnd() * 50))}:00`,
        durationSec: 3000 + Math.round(rnd() * 1500),
        exercises: t.exercises.map((e) => {
          const w0 = kg(e.exerciseId) * (1 + 0.018 * week)
          return { exerciseId: e.exerciseId, sets: Array.from({ length: e.sets }, (_, s) => ({ weight: Math.round(w0 / 2.5) * 2.5, reps: 10 - s - (rnd() < 0.3 ? 1 : 0), done: true })) }
        }),
      }
      await db.put('workouts', w); n++
    }

    // body weight: lean bulk 76 → 79 kg
    for (let a = 105; a >= 0; a -= 2) {
      const v = 76.1 + (105 - a) * 0.028 + (rnd() - 0.5) * 0.5
      await db.put('weights', { date: day(ago(a)), kg: Math.round(v * 10) / 10, source: 'app' })
    }
    await db.put('phases', { id: 'demo-ph', type: 'bulk', start: day(ago(105)), calories: 2900 })
    for (const [a, m] of [[100, { arm: 37.5, chest: 101, waist: 80 }], [50, { arm: 38.4, chest: 103, waist: 80.5 }], [3, { arm: 39.2, chest: 104.5, waist: 81 }]]) {
      await db.put('measurements', { date: day(ago(a)), ...m })
    }

    // food diary: every day for 60 days, today breakfast + lunch
    const F = (q) => BASICS.find((f) => f.name.toLowerCase().includes(q))
    const menu = [
      ['breakfast', [['haferflocken', 90], ['milch', 300], ['banane', 120]]],
      ['lunch', [['reis, gekocht', 300], ['hühnerbrust', 200], ['brokkoli', 150]]],
      ['dinner', [['nudeln, gekocht', 320], ['faschiert', 150], ['tomaten', 150]]],
      ['snack', [['skyr', 250], ['beeren', 100], ['mandeln', 25]]],
    ]
    const missing = []
    const put = async (date, meal, q, g, hour) => {
      const f = F(q); if (!f) { missing.push(q); return }
      const k = g / 100
      await db.put('foodlog', { id: `demo-f-${date}-${q}`, date, meal, name: f.name, grams: g, kcal: f.kcal * k, p: f.p * k, c: f.c * k, f: f.f * k, ref: { kind: 'food', food: f }, at: `${date}T${pad(hour)}:15:00` })
    }
    for (let a = 60; a >= 1; a--) {
      const date = day(ago(a))
      for (const [i, [meal, items]] of menu.entries()) for (const [q, g] of items) await put(date, meal, q, Math.round(g * (0.9 + rnd() * 0.25)), 8 + i * 4)
    }
    const td = day(ago(0))
    for (const [i, [meal, items]] of menu.slice(0, 2).entries()) for (const [q, g] of items) await put(td, meal, q, g, 8 + i * 4)

    await db.saveSettings({ ...snap.settings, restSec: 120, name: 'Max', heightCm: 182, birthYear: 2002, sex: 'm', lang: 'de', mealSections: true, templateOrder: tpls.map((t) => t.id), favFoods: [F('skyr')?.id, F('haferflocken')?.id].filter(Boolean) })
    return { workouts: n, exercises: snap.exercises.length, basics: BASICS.length, recipes: snap.recipes.length, missing }
  })
  console.log(JSON.stringify(res))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
