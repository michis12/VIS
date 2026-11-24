import type { Food, Recipe } from '../types'

/**
 * Built-in basics (per 100 g / 100 ml, typical values – Richtwerte), for foods
 * without a barcode where Open Food Facts is weak: fruit, vegetables, meat,
 * staples. kcal · Eiweiß · Kohlenhydrate · Fett.
 */
type Row = [id: string, name: string, kcal: number, p: number, c: number, f: number, serving?: [string, number]]

const ROWS: Row[] = [
  // Getreide, Beilagen
  ['reis-roh', 'Reis, roh', 350, 7, 78, 0.7],
  ['reis-gekocht', 'Reis, gekocht', 130, 2.7, 28, 0.3],
  ['jasminreis-roh', 'Jasminreis, roh', 355, 7, 79, 0.6],
  ['basmati-roh', 'Basmatireis, roh', 350, 8.5, 77, 0.6],
  ['nudeln-roh', 'Nudeln, roh', 355, 12, 71, 1.5],
  ['nudeln-gekocht', 'Nudeln, gekocht', 150, 5.5, 30, 0.9],
  ['vk-nudeln-gekocht', 'Vollkornnudeln, gekocht', 124, 5.3, 26.5, 0.5],
  ['vk-nudeln-roh', 'Vollkornnudeln, roh', 340, 13, 64, 2.5],
  ['haferflocken', 'Haferflocken', 370, 13.5, 59, 7],
  ['kartoffeln', 'Kartoffeln, gekocht', 77, 2, 17, 0.1],
  ['suesskartoffel', 'Süßkartoffel, gekocht', 86, 1.6, 20, 0.1],
  ['brot-vollkorn', 'Vollkornbrot', 220, 8, 39, 1.5, ['1 Scheibe', 50]],
  ['brot-weiss', 'Weißbrot / Toast', 265, 8.5, 48, 3.5, ['1 Scheibe', 30]],
  ['semmel', 'Semmel', 270, 9, 53, 1.5, ['1 Semmel', 50]],
  ['tortilla', 'Tortilla (Weizen)', 300, 8.5, 50, 7, ['1 Stück', 60]],
  ['couscous-roh', 'Couscous, roh', 360, 12.5, 72, 1.1],
  ['quinoa-roh', 'Quinoa, roh', 370, 14, 64, 6],
  ['mehl', 'Weizenmehl', 345, 10, 72, 1],
  // Fleisch, Fisch, Eier
  ['huehnerbrust', 'Hühnerbrust, roh', 110, 23, 0, 1.5],
  ['putenbrust', 'Putenbrust, roh', 105, 24, 0, 1],
  ['faschiertes-gemischt', 'Faschiertes gemischt', 250, 18, 0, 20],
  ['faschiertes-rind', 'Faschiertes Rind', 220, 20, 0, 15],
  ['rindersteak', 'Rindersteak, roh', 125, 22, 0, 4],
  ['schweinefilet', 'Schweinefilet, roh', 110, 21, 0, 2.5],
  ['schinken', 'Kochschinken', 115, 19, 1, 4, ['1 Scheibe', 20]],
  ['lachs', 'Lachs, roh', 200, 20, 0, 13],
  ['thunfisch-dose', 'Thunfisch (Dose, natur)', 110, 25, 0, 1],
  ['ei', 'Ei', 143, 12.6, 0.7, 9.5, ['1 Ei (M)', 55]],
  ['eiklar', 'Eiklar', 48, 10.5, 0.7, 0.2],
  // Milchprodukte
  ['vollmilch', 'Vollmilch 3,5 %', 64, 3.3, 4.7, 3.5, ['1 Glas', 250]],
  ['milch-15', 'Milch 1,5 %', 47, 3.4, 4.8, 1.5, ['1 Glas', 250]],
  ['magerquark', 'Magertopfen', 67, 12, 4, 0.3],
  ['skyr', 'Skyr natur', 63, 11, 4, 0.2],
  ['joghurt', 'Joghurt 3,5 %', 65, 3.5, 4.5, 3.5],
  ['griech-joghurt', 'Griechisches Joghurt 10 %', 130, 5, 4, 10],
  ['huettenkaese', 'Hüttenkäse', 98, 12, 2.5, 4.5],
  ['gouda', 'Gouda', 360, 25, 0, 29, ['1 Scheibe', 25]],
  ['mozzarella', 'Mozzarella', 255, 18, 1, 20],
  ['sauerrahm', 'Sauerrahm 15 %', 160, 3, 4, 15],
  ['schlagobers', 'Schlagobers 36 %', 340, 2.2, 3, 36],
  ['butter', 'Butter', 740, 0.7, 0.6, 82, ['1 TL', 5]],
  ['whey', 'Whey Protein Pulver', 380, 75, 8, 5, ['1 Scoop', 30]],
  // Gemüse, Hülsenfrüchte
  ['zwiebel', 'Zwiebel, roh', 40, 1.1, 9.3, 0.1, ['1 Zwiebel', 110]],
  ['zwiebel-gekocht', 'Zwiebel, gekocht', 44, 1.4, 10, 0.2, ['1 große', 128]],
  ['knoblauch', 'Knoblauch', 149, 6.4, 33, 0.5, ['1 Zehe', 4]],
  ['fruehlingszwiebel', 'Frühlingszwiebel', 32, 1.8, 7.3, 0.2],
  ['paprika', 'Paprika', 31, 1, 6, 0.3, ['1 Paprika', 150]],
  ['tomate', 'Tomate', 18, 0.9, 3.9, 0.2, ['1 Tomate', 100]],
  ['tomaten-dose', 'Tomaten, gehackt (Dose)', 22, 1.2, 3.5, 0.2],
  ['tomatenmark', 'Tomatenmark', 85, 4.5, 14, 0.5],
  ['paprikamark', 'Paprikamark, scharf', 55, 2, 8, 1],
  ['gurke', 'Gurke', 15, 0.6, 3.6, 0.1],
  ['brokkoli', 'Brokkoli', 34, 2.8, 7, 0.4],
  ['karotte', 'Karotte', 41, 0.9, 10, 0.2, ['1 Karotte', 80]],
  ['spinat', 'Spinat', 23, 2.9, 3.6, 0.4],
  ['salat', 'Blattsalat', 15, 1.4, 2.9, 0.2],
  ['sauerkraut', 'Sauerkraut', 20, 1.3, 3, 0.2],
  ['mais-dose', 'Mais (Dose, abgetropft)', 80, 3, 14, 1.3],
  ['kidney-dose', 'Kidneybohnen (Dose, abgetropft)', 105, 7.5, 15, 0.6],
  ['kichererbsen-dose', 'Kichererbsen (Dose, abgetropft)', 120, 7, 16, 2.5],
  ['linsen-roh', 'Linsen, roh', 350, 24, 50, 1.5],
  ['champignons', 'Champignons', 22, 3.1, 3.3, 0.3],
  // Obst
  ['banane', 'Banane', 89, 1.1, 23, 0.3, ['1 Banane', 120]],
  ['apfel', 'Apfel', 52, 0.3, 14, 0.2, ['1 Apfel', 180]],
  ['beeren', 'Beeren (gemischt, TK)', 45, 1, 9, 0.4],
  ['orange', 'Orange', 47, 0.9, 12, 0.1, ['1 Orange', 150]],
  ['avocado', 'Avocado', 160, 2, 9, 15, ['½ Avocado', 75]],
  // Fette, Nüsse, Sonstiges
  ['olivenoel', 'Olivenöl', 884, 0, 0, 100, ['1 EL', 10]],
  ['erdnussbutter', 'Erdnussbutter', 600, 25, 15, 50, ['1 EL', 15]],
  ['mandeln', 'Mandeln', 600, 21, 9, 52],
  ['honig', 'Honig', 305, 0.4, 82, 0, ['1 TL', 8]],
  ['zucker', 'Zucker', 400, 0, 100, 0, ['1 TL', 4]],
  ['kakao-pulver', 'Kakaopulver, gesüßt (Kakao-Getränk)', 380, 5, 80, 3.5, ['1 EL', 10]],
  ['sojasauce', 'Sojasauce', 55, 8, 5, 0.5, ['1 EL', 15]],
  ['ketchup', 'Ketchup', 100, 1.2, 23, 0.2, ['1 EL', 15]],
  ['zartbitter', 'Zartbitterschokolade 70 %', 580, 8, 33, 43],
]

export const BASICS: Food[] = ROWS.map(([id, name, kcal, p, c, f, serving]) => ({
  id: 'b-' + id, name, kcal, p, c, f, source: 'basic',
  ...(serving ? { serving: { label: serving[0], g: serving[1] } } : {}),
}))

const B = (id: string) => {
  const f = BASICS.find((x) => x.id === 'b-' + id)
  if (!f) throw new Error('unknown basic ' + id)
  return f
}

/** Starter recipes (from the user's previous app). */
export const SEED_RECIPES: Recipe[] = [
  {
    id: 'r-jigobomba', name: 'JigoBomba',
    items: [{ food: B('kakao-pulver'), grams: 40 }, { food: B('vollmilch'), grams: 650 }, { food: B('whey'), grams: 9.6 }],
  },
  {
    id: 'r-eiernudeln', name: 'Eiernudeln',
    items: [{ food: B('vk-nudeln-gekocht'), grams: 1300 }, { food: B('ei'), grams: 300 }],
  },
  {
    id: 'r-chili', name: 'Chili con Carne',
    items: [
      { food: B('zwiebel'), grams: 156 }, { food: B('knoblauch'), grams: 12 }, { food: B('faschiertes-gemischt'), grams: 800 },
      { food: B('mais-dose'), grams: 285 }, { food: B('kidney-dose'), grams: 260 }, { food: B('tomaten-dose'), grams: 690 },
    ],
  },
  {
    id: 'r-nochickn-bowl', name: 'NoChicknBowl',
    items: [
      { food: B('jasminreis-roh'), grams: 150 }, { food: B('ei'), grams: 229.6 },
      { food: B('sojasauce'), grams: 30 }, { food: B('fruehlingszwiebel'), grams: 6.3 },
    ],
  },
  {
    id: 'r-krautspeise', name: 'Krautspeise',
    items: [
      { food: B('zwiebel-gekocht'), grams: 128 }, { food: B('faschiertes-gemischt'), grams: 400 }, { food: B('paprikamark'), grams: 8 },
      { food: B('sauerkraut'), grams: 550 }, { food: B('tomatenmark'), grams: 32 }, { food: B('sauerrahm'), grams: 100 },
    ],
  },
]
