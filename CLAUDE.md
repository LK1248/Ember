# Ember — notes for Claude

Guitar practice helper. Plain HTML/CSS/ES modules, no build step. Phone-first (Android Chrome), laptop too.
Sibling project in style: C:\LK\Dev\Sandbox\VoiceCoach.

## Run / test
- `python tools/serve.py [port]` (default 5341, sends no-cache). Voice needs https or localhost.
- `window.ember.run("log b one forty")` runs a command; `window.ember.say("ember next")` feeds recogniser text
  (wake-word path). The browser preview pane blocks the mic, so test voice this way.
- Items come from the user's sheet: `python tools/import_sheet.py "<xlsx>"` regenerates `js/items.js`
  (items + links only — the user chose NOT to import history).

## Architecture
- `main.js` router (hash), header, home logo states, global commands, voice wiring.
- `views.js` menu/topic/item/history/settings/edit; `triads.js` triad trainer + Roll; `ui.js` helpers.
- `store.js` localStorage state: user item edits, log, settings. Records carry `updatedAt`; newest wins.
- `sync.js` + `apps-script/Code.gs`: one POST (text/plain, no preflight) sends changes, returns all rows.
- `voice.js`: Vosk offline recogniser (vosk-browser from jsDelivr, model from ccoreilly.github.io) with a
  restricted grammar = `commands.js` VOCABULARY; fallback engine = Chrome Web Speech.
- `commands.js` parser (spoken numbers: "one forty five" = 145, "one oh five" = 105).
- `theory.js` chords/keys/triad shapes; `fretboard.js` SVG (high e on top). String sets are listed low
  string first ([3,2,1]); bass = first element.
- `links.js`: item links → video (YouTube, not "lesson"), lesson, tabs (everything else). Videos play in an
  in-app overlay (youtube-nocookie embed, play/pause via postMessage) so the mic keeps listening; tab sites
  can't be framed, and voice has no tap for window.open, so they open in place (Back returns).
  "chords" stays a topic word, so the tab command is "tabs"/"link".
- Topic lists are a numbered tile grid (2 per row on phone) so a number can be spoken without scrolling.
- `audio.js` soft cues (no speech — user wants screen-only feedback) and the metronome.

## User decisions
- Home = logo only (img/ember-mark.svg); first tap lights Ember (audio + mic need a gesture), next tap = menu.
- Wake word "Ember", always listening. No spoken replies; soft non-vocal cues are fine.
- Grades A/B/C/F (F = fail). Mode F = fingerpicking, P = pick (user rarely uses a pick).
- Scale positions 4+ 5- 5+ 6- 6+: number = root string; "6-" = more notes above the root fret.
- Triads "4 frets start @0-15": progression inside a 4-fret window, walk 0→15 or random.
- Storage: Google Sheet via Apps Script (user is signed into Google on both devices, not GitHub).
