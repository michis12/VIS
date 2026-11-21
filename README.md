# VIS

Persönliche Fitness-Tracking-Web-App (PWA) für das iPhone: Templates, Workout mit Timer,
Satz-Eingabe per Drehrad oder Tastatur, Pausen-Timer, Statistiken, Gewicht und Bulk/Cut-Phasen.

## Entwickeln

```
npm install
npm run dev
```

## Daten

- Alles liegt lokal im Browser (IndexedDB). Sicherung/Wiederherstellung als JSON unter „Mehr“.
- `src/data/seed.json` wird beim ersten Start importiert. Neu erzeugen aus einem Strong-Export:
  `python -I scripts/build_seed.py <strong_workouts.csv>`
- Die Gewichtsdaten bis 21.11.2026 sind aus einem Screenshot abgelesen (±0,3 kg).
