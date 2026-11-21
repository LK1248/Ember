# Ember

Guitar practice helper with always-on voice commands ("Ember, next", "Ember, log B one forty").
Plain HTML/JS, no build step. Phone-first.

- Topics, item cards with links, metronome and practice log (A/B/C/F, tempo, fingers/pick)
- Triad trainer: progressions in a 4-fret window (walk 0→15 or random) or on one string set
- Roll: random key, interval, scale position, progression
- Offline speech recognition ([vosk-browser](https://github.com/ccoreilly/vosk-browser), Apache-2.0) restricted to Ember's commands
- Sync to a Google Sheet through an Apps Script — see [SETUP.md](SETUP.md)

Run locally: `python tools/serve.py` → http://localhost:5341
