import type { Exercise } from '../types'

/**
 * Standard exercises every user gets (on top of the bundled history's own ones),
 * so almost every common gym exercise is there from the start. Missing ones are
 * added on every start (db.ts loadAll); existing exercises (same id or same
 * name) are never touched. Muscle groups use the app's German keys.
 */

const L: [string, string][] = [
  // Brust
  ['Incline Bench Press (Barbell)', 'Brust'], ['Decline Bench Press (Dumbbell)', 'Brust'], ['Decline Chest Press (Machine)', 'Brust'],
  ['Chest Fly (Dumbbell)', 'Brust'], ['Incline Chest Fly (Dumbbell)', 'Brust'], ['Cable Fly (High to Low)', 'Brust'], ['Cable Fly (Mid)', 'Brust'],
  ['Chest Press (Cable)', 'Brust'], ['Chest Dip', 'Brust'], ['Floor Press (Dumbbell)', 'Brust'], ['Push Up (Weighted)', 'Brust'],
  ['Decline Push Up', 'Brust'], ['Pullover (Dumbbell)', 'Brust'],
  // Rücken
  ['Bent Over Row (Barbell)', 'Rücken'], ['Pendlay Row (Barbell)', 'Rücken'], ['Single Arm Row (Dumbbell)', 'Rücken'],
  ['Chest Supported Row (Dumbbell)', 'Rücken'], ['Seated Cable Row', 'Rücken'], ['Seated Cable Row (Wide Grip)', 'Rücken'],
  ['Meadows Row', 'Rücken'], ['Seal Row', 'Rücken'], ['Inverted Row', 'Rücken'], ['Chin Up', 'Rücken'], ['Chin Up (Assisted)', 'Rücken'],
  ['Pull Up (Weighted)', 'Rücken'], ['Rack Pull', 'Rücken'], ['Deadlift (Trap Bar)', 'Rücken'], ['Sumo Deadlift', 'Rücken'],
  ['Good Morning (Barbell)', 'Rücken'], ['Hyperextension', 'Rücken'], ['Superman', 'Rücken'], ['Low Row (Machine)', 'Rücken'],
  // Schultern
  ['Overhead Press (Barbell)', 'Schultern'], ['Overhead Press (Dumbbell)', 'Schultern'], ['Seated Overhead Press (Dumbbell)', 'Schultern'],
  ['Arnold Press (Dumbbell)', 'Schultern'], ['Push Press', 'Schultern'], ['Landmine Press', 'Schultern'], ['Handstand Push Up', 'Schultern'],
  ['Upright Row (Barbell)', 'Schultern'], ['Upright Row (Cable)', 'Schultern'], ['Front Raise (Cable)', 'Schultern'], ['Front Raise (Plate)', 'Schultern'],
  ['Rear Delt Fly (Cable)', 'Schultern'], ['Y-Raise (Dumbbell)', 'Schultern'], ['Lateral Raise (Single Arm, Cable)', 'Schultern'],
  // Bizeps
  ['Bicep Curl (Barbell)', 'Bizeps'], ['EZ-Bar Curl', 'Bizeps'], ['Incline Curl (Dumbbell)', 'Bizeps'], ['Concentration Curl', 'Bizeps'],
  ['Preacher Curl (Dumbbell)', 'Bizeps'], ['Preacher Curl (Machine)', 'Bizeps'], ['Spider Curl', 'Bizeps'], ['Bayesian Curl (Cable)', 'Bizeps'],
  ['Hammer Curl (Rope)', 'Bizeps'], ['Bicep Curl (Machine)', 'Bizeps'],
  // Trizeps
  ['Skull Crusher (EZ-Bar)', 'Trizeps'], ['Skull Crusher (Dumbbell)', 'Trizeps'], ['Close-Grip Bench Press (Barbell)', 'Trizeps'],
  ['Overhead Triceps Extension (Dumbbell)', 'Trizeps'], ['Triceps Kickback (Dumbbell)', 'Trizeps'], ['Triceps Kickback (Cable)', 'Trizeps'],
  ['Dips (Weighted)', 'Trizeps'], ['Bench Dips', 'Trizeps'], ['Triceps Dip (Machine)', 'Trizeps'], ['Triceps Extension (Machine)', 'Trizeps'],
  // Beine
  ['Squat (Barbell)', 'Beine'], ['Front Squat (Barbell)', 'Beine'], ['Goblet Squat', 'Beine'], ['Hack Squat (Machine)', 'Beine'],
  ['Pendulum Squat (Machine)', 'Beine'], ['Belt Squat', 'Beine'], ['Sissy Squat', 'Beine'], ['Bulgarian Split Squat (Dumbbell)', 'Beine'],
  ['Lunge (Dumbbell)', 'Beine'], ['Walking Lunge (Dumbbell)', 'Beine'], ['Reverse Lunge (Barbell)', 'Beine'],
  ['Romanian Deadlift (Dumbbell)', 'Beine'], ['Stiff-Leg Deadlift (Barbell)', 'Beine'], ['Hip Thrust (Barbell)', 'Beine'],
  ['Hip Thrust (Machine)', 'Beine'], ['Glute Bridge', 'Beine'], ['Seated Leg Curl (Machine)', 'Beine'], ['Lying Leg Curl (Machine)', 'Beine'],
  ['Nordic Curl', 'Beine'], ['Hip Abduction (Machine)', 'Beine'], ['Glute Kickback (Cable)', 'Beine'], ['Cable Pull Through', 'Beine'],
  ['Leg Press (Single Leg)', 'Beine'],
  // Waden
  ['Seated Calf Raise (Machine)', 'Waden'], ['Standing Calf Raise (Dumbbell)', 'Waden'], ['Calf Raise (Smith Machine)', 'Waden'], ['Donkey Calf Raise', 'Waden'],
  // Bauch
  ['Crunch', 'Bauch'], ['Decline Crunch', 'Bauch'], ['Bicycle Crunch', 'Bauch'], ['Sit Up', 'Bauch'], ['Hanging Leg Raise', 'Bauch'],
  ['Toes to Bar', 'Bauch'], ['Ab Wheel Rollout', 'Bauch'], ['Russian Twist', 'Bauch'], ['Cable Woodchopper', 'Bauch'], ['Pallof Press', 'Bauch'],
  // Unterarme, Nacken
  ['Wrist Curl (Barbell)', 'Unterarme'], ['Reverse Wrist Curl (Barbell)', 'Unterarme'], ['Reverse Curl (EZ-Bar)', 'Unterarme'], ['Wrist Roller', 'Unterarme'],
  ['Shrug (Barbell)', 'Nacken'], ['Shrug (Machine)', 'Nacken'], ['Neck Curl (Plate)', 'Nacken'], ['Neck Extension (Plate)', 'Nacken'],
]

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const CATALOG: Exercise[] = L.map(([name, muscle]) => ({ id: slug(name), name, muscle }))
