import { e1rm, fmtInt, isRealSet, weekKey, workoutSetCount, workoutVolume } from './lib'
import type { WorkoutProgress } from './progress'
import type { Exercise, WeightEntry, Workout } from './types'

export type Glyph =
  | 'katana' | 'mountain' | 'flame' | 'shield' | 'anvil' | 'helm' | 'axe' | 'hourglass'
  | 'moon' | 'sun' | 'fist' | 'scroll' | 'lotus' | 'bolt' | 'phoenix' | 'crown' | 'eye'
  | 'beer' | 'ghost' | 'tree' | 'heart' | 'rocket' | 'chair' | 'pyramid' | 'drumstick' | 'flex'
  | 'repeat' | 'shot' | 'couch'
  | 'barbell' | 'deadlift' | 'lion' | 'scale' | 'gorilla' | 'blade' | 'plate' | 'ring'
  | 'target' | 'stairs' | 'storm' | 'chevrons' | 'infinity' | 'diamond' | 'swords'
  | 'laurel' | 'torch' | 'gauge' | 'check' | 'figure' | 'link' | 'tape' | 'trend'
  | 'phase' | 'bulk' | 'shred'
  | 'diary' | 'egg' | 'bullseye'

export interface AchievementDef {
  id: string
  name: string
  glyph: Glyph
  desc: string
  unit: string
  tiers: [number, number, number, number, number]
  metric: keyof Metrics
  /** just for fun – counts for stars and rank, not for Shōgun */
  fun?: boolean
  /** "Kraft & Körper" – counts for stars and rank, not for Shōgun */
  body?: boolean
  /** "Rekorde & Fortschritt" – counts for stars and rank, not for Shōgun */
  prog?: boolean
  /** "Scores & Features" – counts for stars and rank, not for Shōgun */
  score?: boolean
  /** custom names for the 5 tiers (instead of Bronze … Obsidian) */
  labels?: [string, string, string, string, string]
  /** footnote shown in the detail sheet */
  note?: string
}

export interface Metrics {
  workouts: number
  volumeT: number
  sets: number
  streak: number
  exercises: number
  maxSets: number
  maxVolume: number
  hours: number
  night: number
  morning: number
  strongWeeks: number
  prs: number
  bestMonth: number
  weighIns: number
  heaviest: number
  comebacks: number
  // fun
  weekend: number
  ghost: number
  holidays: number
  mondayChest: number
  speedruns: number
  longestMin: number
  pyramids: number
  legSets: number
  curlSets: number
  highReps: number
  schnaps: number
  excuses: number
  // strength & body
  benchE1rm: number
  deadliftE1rm: number
  bestWeek: number
  maxBodyweight: number
  bodyGain: number
  bodyLoss: number
  heavySets: number
  daysIn: number
  // records & progress (from progress.ts)
  recordSets: number
  progressSets: number
  maxRecordsWorkout: number
  maxProgressWorkout: number
  improveStreak: number
  perfectWorkouts: number
  doubleHits: number
  // scores & features
  bestWeekScore: number
  goodWeekStreak: number
  eliteWeeks: number
  upWeeks: number
  flawless: number
  fullBodyWeeks: number
  supersets: number
  measureCount: number
  bestPhase: number
  cleanBulks: number
  cleanCuts: number
  foodDays: number
  proteinDays: number
  onTargetDays: number
}

/** Extra inputs for the score/feature achievements. */
export interface MetricExtras {
  workoutScores?: Map<string, number>
  /** finished weeks, oldest first */
  weekScores?: { score: number }[]
  measurements?: number
  /** scored bulk/cut/maintenance phases */
  phaseScores?: { type: string; score: number; weeks: number }[]
  /** food log summary */
  nutrition?: { days: number; proteinDays: number; onTargetDays: number }
}

const BENCH = new Set(['bench-press-barbell', 'bench-press-smith-machine', 'decline-barbell-bench-press', 'incline-bench-press-smith-machine'])
const DEADLIFT = new Set(['deadlift-barbell'])
const STANDARD_NOTE = 'Die Prozent-Angaben sind grobe Richtwerte für erwachsene Männer allgemein (nicht nur Gym-Gänger), berechnet aus dem geschätzten 1RM (Epley, Sätze bis 10 Wdh).'

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'samurai', name: 'Samurai', glyph: 'katana', metric: 'workouts', unit: 'Workouts', desc: 'Der Weg des Kriegers beginnt mit dem ersten Schritt. Absolviere Workouts.', tiers: [25, 100, 250, 400, 600] },
  { id: 'titan', name: 'Titan', glyph: 'mountain', metric: 'volumeT', unit: 't bewegt', desc: 'Bewege Berge. Gesamtvolumen aller Sätze in Tonnen.', tiers: [100, 500, 1000, 2000, 3500] },
  { id: 'krieger', name: 'Krieger', glyph: 'axe', metric: 'sets', unit: 'Sätze', desc: 'Jeder Satz ist ein Schlag. Sammle bestätigte Sätze.', tiers: [500, 1500, 3000, 5000, 8000] },
  { id: 'unbeugsam', name: 'Unbeugsam', glyph: 'shield', metric: 'streak', unit: 'Wochen am Stück', desc: 'Längste Serie von Wochen mit mindestens einem Workout.', tiers: [4, 8, 16, 30, 52] },
  { id: 'schmied', name: 'Waffenschmied', glyph: 'anvil', metric: 'exercises', unit: 'Übungen', desc: 'Ein Meister kennt viele Waffen. Trainiere verschiedene Übungen.', tiers: [10, 20, 30, 45, 60] },
  { id: 'spartaner', name: 'Spartaner', glyph: 'helm', metric: 'maxSets', unit: 'Sätze in einem Workout', desc: 'Dies ist Sparta. Die meisten Sätze in einer einzigen Einheit.', tiers: [15, 20, 25, 30, 40] },
  { id: 'berserker', name: 'Berserker', glyph: 'fist', metric: 'maxVolume', unit: 'kg in einem Workout', desc: 'Rausch der Schlacht. Höchstes Volumen in einem Workout.', tiers: [5000, 8000, 12000, 16000, 20000] },
  { id: 'moench', name: 'Shaolin', glyph: 'hourglass', metric: 'hours', unit: 'Stunden', desc: 'Geduld formt Stahl. Gesamte Trainingszeit.', tiers: [25, 75, 150, 300, 500] },
  { id: 'nachtwolf', name: 'Nachtwolf', glyph: 'moon', metric: 'night', unit: 'Workouts ab 20 Uhr', desc: 'Jagd im Dunkeln. Trainiere am späten Abend.', tiers: [5, 20, 50, 100, 200] },
  { id: 'morgenrot', name: 'Morgenrot', glyph: 'sun', metric: 'morning', unit: 'Workouts vor 9 Uhr', desc: 'Wer früh kämpft, siegt. Trainiere vor 9 Uhr.', tiers: [1, 5, 15, 30, 60] },
  { id: 'ronin', name: 'Ronin', glyph: 'bolt', metric: 'strongWeeks', unit: 'Wochen mit 3+ Workouts', desc: 'Ohne Herrn, aber mit Disziplin. Wochen mit mindestens drei Workouts.', tiers: [5, 15, 30, 60, 100] },
  { id: 'sensei', name: 'Sensei', glyph: 'scroll', metric: 'prs', unit: 'Rekorde', desc: 'Übertriff dich selbst. Neue Bestleistungen (geschätztes 1RM) je Übung.', tiers: [10, 50, 150, 300, 500] },
  { id: 'vollmond', name: 'Vollmond', glyph: 'eye', metric: 'bestMonth', unit: 'Workouts in einem Monat', desc: 'Ein Monat voller Kampf. Die meisten Workouts in einem Kalendermonat.', tiers: [8, 12, 16, 20, 25] },
  { id: 'chronist', name: 'Chronist', glyph: 'lotus', metric: 'weighIns', unit: 'Gewichtseinträge', desc: 'Kenne deinen Körper. Trage dein Gewicht ein.', tiers: [10, 30, 60, 120, 250] },
  { id: 'gigant', name: 'Gigant', glyph: 'flame', metric: 'heaviest', unit: 'kg in einem Satz', desc: 'Rohe Kraft. Das schwerste Gewicht, das du je bewegt hast.', tiers: [60, 100, 150, 200, 250] },
  { id: 'phoenix', name: 'Phönix', glyph: 'phoenix', metric: 'comebacks', unit: 'Comebacks', desc: 'Aus der Asche. Zurück ins Training nach 14+ Tagen Pause.', tiers: [1, 2, 3, 5, 8] },

  // ---- just for fun
  { id: 'wochenende', fun: true, name: 'Wochenend-Krieger', glyph: 'beer', metric: 'weekend', unit: 'Workouts am Wochenende', desc: 'Andere gehen brunchen, du gehst pumpen. Workouts am Samstag oder Sonntag.', tiers: [5, 25, 60, 100, 150] },
  { id: 'geisterstunde', fun: true, name: 'Geisterstunde', glyph: 'ghost', metric: 'ghost', unit: 'Workouts nach 22 Uhr', desc: 'Das Gym gehört dir und dem Putzpersonal. Starte nach 22 Uhr.', tiers: [1, 5, 15, 30, 60] },
  { id: 'weihnachtself', fun: true, name: 'Weihnachts­elf', glyph: 'tree', metric: 'holidays', unit: 'Feiertags-Workouts', desc: 'Keks verbrennen statt Keks essen. Training am 24., 25., 26., 31. Dezember oder 1. Jänner.', tiers: [1, 2, 3, 5, 8] },
  { id: 'brusttag', fun: true, name: 'Internationaler Brusttag', glyph: 'heart', metric: 'mondayChest', unit: 'Montage mit Brust', desc: 'Weltweit ist Montag Brusttag – und du hältst dich dran.', tiers: [5, 15, 40, 75, 120] },
  { id: 'speedrunner', fun: true, name: 'Speedrunner', glyph: 'rocket', metric: 'speedruns', unit: 'Blitz-Workouts', desc: 'Any% Gym-Run: mindestens 8 Sätze in unter 30 Minuten.', tiers: [1, 3, 10, 25, 50] },
  { id: 'sitzfleisch', fun: true, name: 'Sitzfleisch', glyph: 'chair', metric: 'longestMin', unit: 'Minuten (längstes Workout)', desc: 'Wohnst du hier? Dein längstes Workout in Minuten.', tiers: [90, 120, 150, 180, 240] },
  { id: 'pyramide', fun: true, name: 'Pyramiden­bauer', glyph: 'pyramid', metric: 'pyramids', unit: 'Übungen mit 5+ Sätzen', desc: 'Die Pharaonen wären stolz. Mindestens 5 Sätze einer Übung in einem Training.', tiers: [5, 20, 50, 100, 200] },
  { id: 'huehnerbein', fun: true, name: 'Kein Hühnerbein', glyph: 'drumstick', metric: 'legSets', unit: 'Bein-Sätze', desc: 'Leg Day ausgelassen? Nicht mit dir. Sätze für Beine und Waden.', tiers: [100, 300, 600, 1000, 1500] },
  { id: 'curlbro', fun: true, name: 'Curl-Bro', glyph: 'flex', metric: 'curlSets', unit: 'Curl-Sätze', desc: 'Curls for the girls (und die Jungs). Jeder Satz mit „Curl“ im Namen.', tiers: [100, 300, 600, 1000, 1500] },
  { id: 'wiederholungstaeter', fun: true, name: 'Wiederholungs­täter', glyph: 'repeat', metric: 'highReps', unit: 'Sätze mit 20+ Wdh', desc: 'Brennen ist das neue Wachsen. Sätze mit mindestens 20 Wiederholungen.', tiers: [10, 40, 100, 200, 350] },
  { id: 'schnapszahl', fun: true, name: 'Schnapszahl', glyph: 'shot', metric: 'schnaps', unit: 'Schnapszahl-Sätze', desc: 'Prost! Sätze mit Gewichten wie 11, 22, 55 oder 111 kg.', tiers: [20, 75, 200, 400, 700] },
  // ---- strength & body
  { id: 'bankdrueck', body: true, name: 'Bankdrück-Elite', glyph: 'barbell', metric: 'benchE1rm', unit: 'kg geschätztes 1RM Bankdrücken', desc: 'Wie stark ist deine Brust wirklich? Bestes geschätztes 1RM beim Bankdrücken (Langhantel oder Smith, flach, schräg oder negativ).', tiers: [60, 80, 100, 120, 140], labels: ['Einsteiger', 'Fortgeschritten', 'Stark (~Top 20 %)', 'Sehr stark (~Top 5 %)', 'Elite (~Top 1 %)'], note: STANDARD_NOTE },
  { id: 'kreuzheben', body: true, name: 'Kreuzheben-Koloss', glyph: 'deadlift', metric: 'deadliftE1rm', unit: 'kg geschätztes 1RM Kreuzheben', desc: 'Heb die Welt vom Boden auf. Bestes geschätztes 1RM beim Kreuzheben.', tiers: [100, 140, 180, 220, 260], labels: ['Einsteiger', 'Fortgeschritten', 'Stark (~Top 20 %)', 'Sehr stark (~Top 5 %)', 'Elite (~Top 1 %)'], note: STANDARD_NOTE },
  { id: 'loewe', body: true, name: 'Löwe – König des Gyms', glyph: 'lion', metric: 'bestWeek', unit: 'Workouts in einer Woche', desc: 'Das Gym ist dein Revier. Die meisten Workouts in einer Kalenderwoche – bei 7 regierst du.', tiers: [3, 4, 5, 6, 7], labels: ['Junglöwe', 'Rudelmitglied', 'Jäger', 'Rudelführer', 'König des Gyms'] },
  { id: 'schwergewicht', body: true, name: 'Schwergewicht', glyph: 'scale', metric: 'maxBodyweight', unit: 'kg Körpergewicht (Höchstwert)', desc: 'Die Waage ächzt. Dein höchstes eingetragenes Körpergewicht – Ziel: dreistellig.', tiers: [75, 80, 85, 90, 100], labels: ['Weltergewicht', 'Mittelgewicht', 'Halbschwer', 'Cruiser', 'Schwergewicht (100 kg)'] },
  { id: 'massemonster', body: true, name: 'Massemonster', glyph: 'gorilla', metric: 'bodyGain', unit: 'kg zugelegt', desc: 'Bulk mit Ansage. Größte Zunahme vom Tiefst- zum späteren Höchstgewicht.', tiers: [3, 6, 10, 15, 20] },
  { id: 'shredder', body: true, name: 'Shredder', glyph: 'blade', metric: 'bodyLoss', unit: 'kg abgenommen', desc: 'Messerscharf. Größte Abnahme von einem Höchst- zum späteren Tiefstgewicht.', tiers: [2, 4, 6, 8, 12] },
  { id: 'hunderter', body: true, name: '100er-Club', glyph: 'plate', metric: 'heavySets', unit: 'Sätze mit 100+ kg', desc: 'Dreistellig oder gar nicht. Sätze mit mindestens 100 kg.', tiers: [25, 100, 250, 500, 1000] },
  { id: 'treue', body: true, name: 'Treueschwur', glyph: 'ring', metric: 'daysIn', unit: 'Tage seit dem ersten Workout', desc: 'Bis dass der Muskelkater uns scheidet. Tage seit deinem ersten Workout.', tiers: [30, 182, 365, 730, 1825], labels: ['1 Monat', '½ Jahr', '1 Jahr', '2 Jahre', '5 Jahre'] },

  // ---- records & progress
  { id: 'rekordjaeger', prog: true, name: 'Rekordjäger', glyph: 'target', metric: 'recordSets', unit: 'Rekord-Sätze', desc: 'Jeder Bestwert zählt. Sätze mit neuem Höchstgewicht oder bestem geschätzten 1RM einer Übung.', tiers: [25, 100, 300, 600, 1000] },
  { id: 'stufenlaeufer', prog: true, name: 'Stufenläufer', glyph: 'stairs', metric: 'progressSets', unit: 'Fortschritts-Sätze', desc: 'Stufe um Stufe nach oben. Sätze, die besser waren als derselbe Satz beim letzten Mal.', tiers: [50, 250, 750, 1500, 3000] },
  { id: 'rekordflut', prog: true, name: 'Rekordflut', glyph: 'storm', metric: 'maxRecordsWorkout', unit: 'Rekorde in einem Workout', desc: 'Ein Gewitter aus Bestwerten. Die meisten Rekord-Sätze in einem einzigen Training.', tiers: [2, 4, 7, 12, 18] },
  { id: 'fortschrittsrausch', prog: true, name: 'Fortschrittsrausch', glyph: 'chevrons', metric: 'maxProgressWorkout', unit: 'Fortschritte in einem Workout', desc: 'Alles geht nach oben. Die meisten Fortschritts-Sätze in einem einzigen Training.', tiers: [3, 6, 10, 16, 24] },
  { id: 'unaufhaltsam', prog: true, name: 'Unaufhaltsam', glyph: 'infinity', metric: 'improveStreak', unit: 'Workouts in Folge mit Verbesserung', desc: 'Kein Training ohne Plus. Workouts in Folge mit mindestens einem Fortschritt oder Rekord.', tiers: [5, 15, 40, 80, 150] },
  { id: 'perfektionist', prog: true, name: 'Perfektionist', glyph: 'diamond', metric: 'perfectWorkouts', unit: 'perfekte Workouts', desc: 'Lückenlos besser. Workouts (ab 3 Übungen), in denen du dich bei jeder Übung verbessert hast.', tiers: [1, 5, 20, 50, 100] },
  { id: 'doppelschlag', prog: true, name: 'Doppelschlag', glyph: 'swords', metric: 'doubleHits', unit: 'Doppelschläge', desc: 'Zwei Treffer, eine Übung. Rekord und Fortschritt bei derselben Übung im selben Workout.', tiers: [10, 50, 150, 300, 500] },

  // ---- scores & features
  { id: 'wochenheld', score: true, name: 'Wochenheld', glyph: 'laurel', metric: 'bestWeekScore', unit: 'bester Wochenscore', desc: 'Die perfekte Woche. Dein höchster Wochenscore – 99 ist das Maximum.', tiers: [60, 70, 80, 90, 99] },
  { id: 'dauerbrenner', score: true, name: 'Dauerbrenner', glyph: 'torch', metric: 'goodWeekStreak', unit: 'Wochen in Folge mit Score 60+', desc: 'Nicht nachlassen. Wochen in Folge mit einem Wochenscore von mindestens 60.', tiers: [2, 4, 8, 16, 30] },
  { id: 'elitewochen', score: true, name: 'Elite-Wochen', glyph: 'gauge', metric: 'eliteWeeks', unit: 'Wochen mit Score 80+', desc: 'Elite ist kein Zufall. Wochen mit einem Wochenscore von mindestens 80.', tiers: [5, 15, 40, 80, 150] },
  { id: 'aufwaerts', score: true, name: 'Aufwärtstrend', glyph: 'trend', metric: 'upWeeks', unit: 'Wochen besser als die Vorwoche', desc: 'Jede Woche ein Stück besser. Wochen mit höherem Score als die Woche davor.', tiers: [5, 15, 30, 50, 80] },
  { id: 'makellos', score: true, name: 'Makellos', glyph: 'check', metric: 'flawless', unit: 'Workouts mit Score 90+', desc: 'Alles gegeben. Workouts mit einem Workout-Score von mindestens 90.', tiers: [1, 5, 15, 40, 80] },
  { id: 'ganzkoerper', score: true, name: 'Ganzkörper-Gott', glyph: 'figure', metric: 'fullBodyWeeks', unit: 'Wochen mit allen Muskelgruppen', desc: 'Die Heatmap leuchtet überall. Wochen, in denen Brust, Rücken, Schultern, Beine, Bizeps, Trizeps und Bauch trainiert wurden.', tiers: [3, 10, 25, 50, 100] },
  { id: 'duett', score: true, name: 'Duett', glyph: 'link', metric: 'supersets', unit: 'Supersätze', desc: 'Zwei Übungen, eine Pause. Gekoppelte Übungen (Supersätze) in abgeschlossenen Workouts.', tiers: [1, 10, 30, 75, 150] },
  { id: 'phasenmeister', score: true, name: 'Phasen-Meister', glyph: 'phase', metric: 'bestPhase', unit: 'bester Phasen-Score', desc: 'Bulk, Cut oder Erhalt – richtig durchgezogen. Dein höchster Phasen-Score (ab 2 Wochen).', tiers: [50, 60, 70, 80, 90] },
  { id: 'saubererbulk', score: true, name: 'Sauberer Bulk', glyph: 'bulk', metric: 'cleanBulks', unit: 'Bulks mit Score 70+', desc: 'Optimal zugenommen und dabei stärker geworden. Bulk-Phasen (ab 4 Wochen) mit Score 70+.', tiers: [1, 2, 3, 5, 8] },
  { id: 'shredded', score: true, name: 'Shredded', glyph: 'shred', metric: 'cleanCuts', unit: 'Cuts mit Score 70+', desc: 'Fett runter, Kraft bleibt. Cut-Phasen (ab 4 Wochen) mit Score 70+.', tiers: [1, 2, 3, 5, 8] },
  { id: 'tagebuch', score: true, name: 'Ess-Tagebuch', glyph: 'diary', metric: 'foodDays', unit: 'Tage geloggt', desc: 'Was du isst, zählt. Tage mit mindestens einem Eintrag in Ernährung.', tiers: [1, 7, 30, 100, 365] },
  { id: 'eiweissprofi', score: true, name: 'Eiweiß-Profi', glyph: 'egg', metric: 'proteinDays', unit: 'Tage Eiweißziel erreicht', desc: 'Muskeln brauchen Baustoff. Tage mit mindestens 2 g Eiweiß pro kg Körpergewicht.', tiers: [1, 7, 30, 100, 250] },
  { id: 'punktlandung', score: true, name: 'Punktlandung', glyph: 'bullseye', metric: 'onTargetDays', unit: 'Tage im Kalorienziel', desc: 'Genau dort, wo du hinwillst. Tage mit maximal 5 % Abweichung vom Kalorienziel der Phase.', tiers: [1, 7, 30, 90, 200] },
  { id: 'massband', score: true, name: 'Maßband', glyph: 'tape', metric: 'measureCount', unit: 'Messungen', desc: 'Zahlen lügen nicht. Einträge bei den Körpermaßen.', tiers: [1, 5, 12, 25, 52] },

  { id: 'ausreden', fun: true, name: 'Ausreden-Meister', glyph: 'couch', metric: 'excuses', unit: 'ausgelassene Übungen', desc: '„Heute nicht.“ – Übungen, die du per „Heute nicht trainieren“ geschwänzt hast.', tiers: [1, 5, 15, 30, 60] },
]

export const ULTIMATE = {
  name: 'Shōgun',
  desc: 'Herrscher über alle Disziplinen. Bringe jedes ernste Achievement auf 5 Sterne – die Spaß-Achievements zählen hier nicht.',
}

/** Ranks by share of all available stars, so adding achievements keeps them fair. */
export const RANKS: { share: number; name: string }[] = [
  { share: 0, name: 'Rekrut' },
  { share: 0.1, name: 'Knappe' },
  { share: 0.2, name: 'Kämpfer' },
  { share: 0.325, name: 'Veteran' },
  { share: 0.475, name: 'Champion' },
  { share: 0.6, name: 'Meister' },
  { share: 0.75, name: 'Großmeister' },
  { share: 0.9, name: 'Legende' },
  { share: 1, name: 'Shōgun' },
]
export const MAX_STARS = ACHIEVEMENTS.length * 5
const RANK_MIN = RANKS.map((r) => ({ ...r, min: Math.ceil(r.share * MAX_STARS) }))

/** Sets above this are treated as typos (e.g. 1174 kg). */
const MAX_PLAUSIBLE_KG = 500

export function computeMetrics(
  workouts: Workout[],
  weights: WeightEntry[],
  exercises: Exercise[],
  progress?: Map<string, WorkoutProgress>,
  extras: MetricExtras = {},
): Metrics {
  const done = workouts.filter((w) => w.status === 'done')
  const muscleOf = new Map(exercises.map((e) => [e.id, e.muscle]))
  const nameOf = new Map(exercises.map((e) => [e.id, e.name]))
  const m: Metrics = {
    workouts: done.length, volumeT: 0, sets: 0, streak: 0, exercises: 0, maxSets: 0, maxVolume: 0, hours: 0,
    night: 0, morning: 0, strongWeeks: 0, prs: 0, bestMonth: 0, weighIns: weights.length, heaviest: 0, comebacks: 0,
    weekend: 0, ghost: 0, holidays: 0, mondayChest: 0, speedruns: 0, longestMin: 0, pyramids: 0, legSets: 0,
    curlSets: 0, highReps: 0, schnaps: 0,
    benchE1rm: 0, deadliftE1rm: 0, bestWeek: 0, maxBodyweight: 0, bodyGain: 0, bodyLoss: 0, heavySets: 0,
    daysIn: done.length ? Math.floor((Date.now() - new Date(done[0].startedAt).getTime()) / 864e5) : 0,
    recordSets: 0, progressSets: 0, maxRecordsWorkout: 0, maxProgressWorkout: 0, improveStreak: 0,
    perfectWorkouts: 0, doubleHits: 0,
    bestWeekScore: 0, goodWeekStreak: 0, eliteWeeks: 0, upWeeks: 0, flawless: 0, fullBodyWeeks: 0,
    supersets: 0, measureCount: extras.measurements ?? 0,
    bestPhase: 0, cleanBulks: 0, cleanCuts: 0,
    foodDays: extras.nutrition?.days ?? 0, proteinDays: extras.nutrition?.proteinDays ?? 0, onTargetDays: extras.nutrition?.onTargetDays ?? 0,
    // whole workouts marked as skipped (older feature) count as one excuse each
    excuses: workouts.filter((w) => w.status === 'skipped').length,
  }
  const used = new Set<string>()
  const weeks = new Map<string, number>()
  const months = new Map<string, number>()
  const best = new Map<string, number>()
  let prevDay: number | null = null

  for (const w of done) {
    const vol = workoutVolume(w)
    const sets = workoutSetCount(w)
    m.volumeT += vol / 1000
    m.sets += sets
    m.maxSets = Math.max(m.maxSets, sets)
    m.maxVolume = Math.max(m.maxVolume, vol)
    m.hours += (w.durationSec ?? 0) / 3600
    const h = Number(w.startedAt.slice(11, 13))
    if (h >= 20) m.night++
    if (h < 9) m.morning++
    const wk = weekKey(w.startedAt)
    weeks.set(wk, (weeks.get(wk) ?? 0) + 1)
    const mo = w.startedAt.slice(0, 7)
    months.set(mo, (months.get(mo) ?? 0) + 1)
    const day = new Date(w.startedAt.slice(0, 10) + 'T12:00:00').getTime()
    if (prevDay != null && day - prevDay >= 14 * 864e5) m.comebacks++
    prevDay = day

    // fun
    const date = new Date(w.startedAt)
    const wd = date.getDay()
    const md = w.startedAt.slice(5, 10)
    if (wd === 0 || wd === 6) m.weekend++
    if (h >= 22 || h < 4) m.ghost++
    if (['12-24', '12-25', '12-26', '12-31', '01-01'].includes(md)) m.holidays++
    if (wd === 1 && w.exercises.some((e) => muscleOf.get(e.exerciseId) === 'Brust' && e.sets.some(isRealSet))) m.mondayChest++
    if (w.durationSec != null && w.durationSec <= 30 * 60 && sets >= 8) m.speedruns++
    if (w.durationSec != null) m.longestMin = Math.max(m.longestMin, Math.floor(w.durationSec / 60))

    for (const e of w.exercises) {
      if (e.skipped) m.excuses++
      const real = e.sets.filter(isRealSet).filter((s) => (s.weight ?? 0) <= MAX_PLAUSIBLE_KG)
      if (!real.length) continue
      const muscle = muscleOf.get(e.exerciseId)
      const isCurl = /curl/i.test(nameOf.get(e.exerciseId) ?? '')
      if (real.length >= 5) m.pyramids++
      for (const s of real) {
        if (muscle === 'Beine' || muscle === 'Waden') m.legSets++
        if (isCurl) m.curlSets++
        if ((s.reps ?? 0) >= 20) m.highReps++
        const kg = s.weight ?? 0
        if (kg >= 11 && Number.isInteger(kg) && new Set(String(kg)).size === 1) m.schnaps++
        if (kg >= 100) m.heavySets++
        if ((s.reps ?? 0) <= 10) {
          const est = e1rm(kg, s.reps ?? 0)
          if (BENCH.has(e.exerciseId)) m.benchE1rm = Math.max(m.benchE1rm, est)
          if (DEADLIFT.has(e.exerciseId)) m.deadliftE1rm = Math.max(m.deadliftE1rm, est)
        }
      }
      used.add(e.exerciseId)
      let top = 0
      for (const s of real) {
        top = Math.max(top, e1rm(s.weight ?? 0, s.reps ?? 0))
        m.heaviest = Math.max(m.heaviest, s.weight ?? 0)
      }
      const prev = best.get(e.exerciseId)
      if (prev != null && top > prev) m.prs++
      if (prev == null || top > prev) best.set(e.exerciseId, top)
    }
  }
  // records & progress
  if (progress) {
    let improveRun = 0
    for (const w of done) {
      const r = progress.get(w.id)
      if (!r) continue
      m.recordSets += r.prs
      m.progressSets += r.ups
      m.maxRecordsWorkout = Math.max(m.maxRecordsWorkout, r.prs)
      m.maxProgressWorkout = Math.max(m.maxProgressWorkout, r.ups)
      improveRun = r.ups + r.prs > 0 ? improveRun + 1 : 0
      m.improveStreak = Math.max(m.improveStreak, improveRun)
      const trained = r.exercises.filter((_, i) => !w.exercises[i].skipped && w.exercises[i].sets.some(isRealSet))
      if (trained.length >= 3 && trained.every((e) => e.ups + e.prs > 0)) m.perfectWorkouts++
      m.doubleHits += r.exercises.filter((e) => e.prs > 0 && e.ups > 0).length
    }
  }

  // scores & features
  const ws = extras.weekScores ?? []
  let goodRun = 0
  for (let i = 0; i < ws.length; i++) {
    const s = ws[i].score
    m.bestWeekScore = Math.max(m.bestWeekScore, s)
    goodRun = s >= 60 ? goodRun + 1 : 0
    m.goodWeekStreak = Math.max(m.goodWeekStreak, goodRun)
    if (s >= 80) m.eliteWeeks++
    if (i > 0 && s > ws[i - 1].score) m.upWeeks++
  }
  for (const s of extras.workoutScores?.values() ?? []) if (s >= 90) m.flawless++
  for (const p of extras.phaseScores ?? []) {
    if (p.weeks >= 2) m.bestPhase = Math.max(m.bestPhase, p.score)
    if (p.weeks >= 4 && p.score >= 70) {
      if (p.type === 'bulk') m.cleanBulks++
      if (p.type === 'cut') m.cleanCuts++
    }
  }
  const MAIN = ['Brust', 'Rücken', 'Schultern', 'Beine', 'Bizeps', 'Trizeps', 'Bauch']
  const groupsByWeek = new Map<string, Set<string>>()
  for (const w of done) {
    const k = weekKey(w.startedAt)
    const set = groupsByWeek.get(k) ?? new Set<string>()
    for (const e of w.exercises) if (!e.skipped && e.sets.some(isRealSet)) set.add(muscleOf.get(e.exerciseId) ?? '')
    groupsByWeek.set(k, set)
    // supersets: distinct linked groups with at least two trained exercises
    const counts = new Map<string, number>()
    for (const e of w.exercises) if (e.group && !e.skipped && e.sets.some(isRealSet)) counts.set(e.group, (counts.get(e.group) ?? 0) + 1)
    for (const c of counts.values()) if (c >= 2) m.supersets++
  }
  for (const set of groupsByWeek.values()) if (MAIN.every((g) => set.has(g))) m.fullBodyWeeks++

  m.exercises = used.size
  m.bestMonth = Math.max(0, ...months.values())
  m.bestWeek = Math.max(0, ...weeks.values())

  // body weight: highest value, biggest rise from a low and biggest drop from a high
  let low = Infinity
  let high = -Infinity
  for (const w of weights) {
    m.maxBodyweight = Math.max(m.maxBodyweight, w.kg)
    low = Math.min(low, w.kg)
    high = Math.max(high, w.kg)
    m.bodyGain = Math.max(m.bodyGain, w.kg - low)
    m.bodyLoss = Math.max(m.bodyLoss, high - w.kg)
  }
  const r1 = (v: number) => Math.round(v * 10) / 10
  m.benchE1rm = r1(m.benchE1rm)
  m.deadliftE1rm = r1(m.deadliftE1rm)
  m.bodyGain = r1(m.bodyGain)
  m.bodyLoss = r1(m.bodyLoss)
  m.strongWeeks = [...weeks.values()].filter((n) => n >= 3).length

  // longest run of consecutive ISO weeks
  const keys = [...weeks.keys()].sort()
  let run = 0
  let prev: number | null = null
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime()
    run = prev != null && Math.round((t - prev) / (7 * 864e5)) === 1 ? run + 1 : 1
    m.streak = Math.max(m.streak, run)
    prev = t
  }
  m.volumeT = Math.floor(m.volumeT)
  m.hours = Math.floor(m.hours)
  return m
}

export interface AchievementState {
  def: AchievementDef
  value: number
  stars: number
  next: number | null
  progress: number // 0..1 towards next tier
}

export function evaluate(m: Metrics): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = m[def.metric]
    const stars = def.tiers.filter((t) => value >= t).length
    const next = stars < 5 ? def.tiers[stars] : null
    const prevT = stars > 0 ? def.tiers[stars - 1] : 0
    const progress = next == null ? 1 : Math.max(0, Math.min(1, (value - prevT) / (next - prevT)))
    return { def, value, stars, next, progress }
  })
}

export const rankFor = (stars: number) => [...RANK_MIN].reverse().find((r) => stars >= r.min)!
export const nextRank = (stars: number) => RANK_MIN.find((r) => r.min > stars) ?? null

export const fmtMetric = (v: number) => (Number.isInteger(v) ? fmtInt(v) : v.toFixed(1).replace('.', ','))
