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
- `src/data/seed.json` enthält nur die Übungsliste. Persönliche Trainings- und Gewichtsdaten
  liegen nicht im Repo, sondern nur auf dem Gerät und im Cloud-Backup.
- Cloud-Backup über Supabase (Projekt `VIS-DATABASE`): Tabelle `backups` mit Row Level Security,
  die letzten 30 Stände pro Benutzer bleiben erhalten. Schema in `supabase/migrations/`.
  Verbindungsdaten in `.env` (nur der öffentliche Publishable Key).

## App-Icon

`scripts/icon/icon.html` rendert das Icon. Zum Neu-Exportieren `python -I scripts/icon/save_server.py`
starten, `http://127.0.0.1:8765/icon.html` öffnen und in der Konsole `exportIcons()` aufrufen.
