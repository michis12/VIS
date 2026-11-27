# App Store images

Six images per language, 1320 × 2868 (6.9" iPhone), upload in order 1–6.
The phones run across two images each, so the order matters.

- `de/1.png` … `de/6.png`: German
- `en/1.png` … `en/6.png`: English
- `*/alle-6-vorschau.png`: all six side by side (preview only, not for upload)

| # | Headline (DE / EN) | Shows |
|---|---|---|
| 1 | Training. Ernährung. Mit KI. / Training. Nutrition. Powered by AI. | 210 exercises, 57 achievements, training page |
| 2 | Jeder Satz zählt. / Every set counts. | running workout with records and progress |
| 3 | Foto oder Text. Die KI zählt. / Photo or text. AI does the math. | AI food entry, barcode scan |
| 4 | Dein Coach kennt deine Daten. / Your coach knows your data. | coach chat with action cards |
| 5 | Sieh, was du trainierst. / See what you train. | muscle heat map |
| 6 | Vom Rookie zum Shōgun. / From rookie to Shōgun. | rank and achievements |

The numbers come from the app: 210 exercises in a fresh install, 57 achievements
(serious and fun ones; `MAX_STARS / 5` in `src/achievements.ts`).

## Making them again

`generator/` has everything; the app screens are real screenshots of a demo
profile ("Max", 15 weeks of training) in a separate browser profile.

1. `npm i puppeteer-core` in `generator/` (uses the installed Microsoft Edge).
2. Start the app on port 5310 (`npx vite --port 5310`).
3. `node seed.js` once (demo data), then `node all.js de` and `node all.js en`
   for the screenshots in `raw-de/` / `raw-en/`. The coach answer and the AI
   food result are staged; they need temporary hooks in `src/foodAi.ts`,
   `src/components/AiCredit.tsx` and `src/screens/Home.tsx` (`window.__mockAi`,
   coach without plan check) that must not be committed.
4. `node render.js de out-de` / `node render.js en out-en` renders
   `store.html` and cuts it into the six images.
