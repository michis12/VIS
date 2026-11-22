import type { Exercise } from './types'

/**
 * Which muscle groups an exercise works: the primary group is the exercise's own
 * `muscle`; secondary groups are derived from the movement in its name.
 */
export function musclesFor(ex: Exercise | undefined): { primary: string; secondary: string[] } {
  if (!ex) return { primary: 'Sonstige', secondary: [] }
  const n = ex.name.toLowerCase()
  const has = (...k: string[]) => k.some((x) => n.includes(x))
  const g = ex.muscle
  let sec: string[] = []

  if (g === 'Brust') {
    sec = has('fly', 'butterfly', 'pec deck', 'round') ? ['Schultern'] : ['Trizeps', 'Schultern']
    if (has('rear delt')) sec = ['Schultern', 'Rücken']
  } else if (g === 'Rücken') {
    if (has('deadlift', 'jefferson')) sec = ['Beine', 'Unterarme', 'Nacken']
    else if (has('extension', 'back lean', 'back lift')) sec = ['Beine']
    else if (has('straight', 'pull straight', 'straight-arm')) sec = ['Trizeps', 'Bauch']
    else if (has('butterfly', 'reverse')) sec = ['Schultern', 'Nacken']
    else if (has('row', 'pull', 'lat', 'chest support', 't bar')) sec = ['Bizeps', 'Schultern', 'Unterarme']
  } else if (g === 'Schultern') {
    if (has('press', 'log')) sec = ['Trizeps', 'Nacken']
    else if (has('rear', 'face', 'pull', 'back lift')) sec = ['Rücken', 'Nacken']
    else if (has('front')) sec = ['Brust']
    else sec = ['Nacken']
  } else if (g === 'Beine') {
    if (has('romanian', 'hamstring')) sec = ['Rücken']
    else if (has('squat', 'leg press', 'step up')) sec = ['Waden', 'Bauch']
  } else if (g === 'Bizeps') {
    sec = ['Unterarme']
  } else if (g === 'Trizeps') {
    sec = has('dip', 'push up') ? ['Brust', 'Schultern'] : has('lat') ? ['Rücken'] : []
  } else if (g === 'Nacken') {
    sec = ['Unterarme']
  }
  return { primary: g, secondary: sec.filter((s) => s !== g) }
}
