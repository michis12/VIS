/**
 * Tiny i18n layer: every visible string is written as a German/English pair,
 * `t('Speichern', 'Save')`. German is the default. The current language lives in
 * Settings (so it is part of the backup); StoreProvider calls `setLang` whenever
 * the settings change, and App remounts the screens so everything re-renders.
 */
export type Lang = 'de' | 'en'

let lang: Lang = 'de'

export const getLang = () => lang

export function setLang(l: Lang | undefined) {
  lang = l === 'en' ? 'en' : 'de'
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

/** Pick the string for the current language. */
export const t = (de: string, en: string) => (lang === 'en' ? en : de)

/** BCP 47 locale for dates and numbers. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'de-AT')

/** Decimal comma in German, point in English. */
export const dec = (v: number, digits = 1) => {
  const s = v.toFixed(digits)
  return lang === 'en' ? s : s.replace('.', ',')
}

/** Number → string with the language's decimal separator (no fixed digits). */
export const decStr = (v: number) => (lang === 'en' ? String(v) : String(v).replace('.', ','))

/** Singular/plural pick. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
