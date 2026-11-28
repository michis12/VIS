/**
 * Reference Upper/Lower split (the developer's own three days). The coach uses
 * it as the base when someone asks for an Upper/Lower plan or a starter template.
 * Exercise ids are from the bundled catalog (seed.json).
 */
export const STARTER_SPLIT: { name: string; exercises: { id: string; sets: number }[] }[] = [
  {
    name: 'Day 1 Upper',
    exercises: [
      { id: 'rear-delt', sets: 2 }, { id: 'lateral-raise-machine', sets: 2 }, { id: 'bicep-curl-cable', sets: 2 },
      { id: 'pull-up-assisted', sets: 2 }, { id: 'triceps-dip-assisted', sets: 2 }, { id: 'chest-press-machine', sets: 2 },
      { id: 'iso-lateral-row-machine', sets: 3 }, { id: 'shrug-dumbbell', sets: 2 },
    ],
  },
  {
    name: 'Day 2 Lower',
    exercises: [
      { id: 'romanian-deadlift-barbell', sets: 2 }, { id: 'hamstring-curl', sets: 2 }, { id: 'squat-smith-machine', sets: 2 },
      { id: 'leg-press', sets: 2 }, { id: 'calf-press-on-leg-press', sets: 2 }, { id: 'overhead-press-reverse-machine', sets: 2 },
    ],
  },
  {
    name: 'Day 3 Upper',
    exercises: [
      { id: 'rear-delt', sets: 2 }, { id: 'lateral-raise-machine', sets: 2 }, { id: 'bicep-curl-cable', sets: 2 },
      { id: 'pull-up-assisted', sets: 2 }, { id: 'triceps-dip-assisted', sets: 2 }, { id: 'chest-press-machine', sets: 2 },
      { id: 'iso-lateral-row-machine', sets: 2 }, { id: 'cable-crunch', sets: 2 },
    ],
  },
]
