# ScratchLab — Browser DJ Booth

A two-deck browser DJ app with a real signed-rate scratch engine, Web MIDI controller support, capacitive platter detection, and drag-and-drop MP3 import.

## Run it

```bash
# from this repository root
python3 -m http.server 3002
# or use the project start script
./start.sh
```

Open <http://localhost:3002>. Chrome or Edge is recommended for Web MIDI. Click anywhere once (or the audio chip) to resume the audio context.

## Highlights

- **Real jog-wheel scratching** — an AudioWorklet moves an interpolated read-head at signed rates, so reverse scratches, pitch bends, and touch-to-scratch feel immediate. A plain `AudioBufferSourceNode` cannot play backwards reliably.
- **Import your own MP3s** — use **IMPORT MP3** or drag audio files onto the page. Files are decoded locally, analysed for BPM, rendered in the library, and loaded to a deck instantly.
- **Web MIDI input** — notes, CCs, pitch bend, aftertouch, program changes, and clock/sysex are parsed. A live monitor shows every incoming message and decoded jog delta.
- **Capacitive vs non-touch platters** — mapping a touch note marks the deck `CAPACITIVE`. In **AUTO** mode, capacitive decks scratch only while touched and pitch-nudge when released; non-touch decks auto-grab on rotation and release after the wheel stops.
- **Relative decoder modes** — 7-bit two's complement (`64 = 0`), offset, signed-bit, and absolute delta modes, plus adjustable ticks-per-revolution and sensitivity.
- **MIDI Learn and guided auto-map** — bind any control from MIDI Setup, or run the wizard and move each control once. Party Mix Live devices are identified from Web MIDI metadata and shown a quick-setup guide; mapping still uses Learn/Auto-map rather than guessed message numbers.
- **Virtual MIDI controller** — test the full MIDI path without hardware; it feeds the same parser as a physical controller.
- **Two full decks** — play/cue, sync, loops, four hot cues, tempo, 3-band EQ, filter, echo, channel faders, crossfader, master volume, waveforms, and VU meters.
- **Four demo tracks** — procedurally generated so the app is playable before importing anything.

## Default virtual-controller mapping

| Control | Deck A | Deck B |
| --- | --- | --- |
| Jog (relative CC) | CH 16 · CC 100 | CH 16 · CC 101 |
| Touch sensor (note) | CH 16 · Note 60 | CH 16 · Note 61 |
| Play | CH 16 · Note 70 | CH 16 · Note 71 |
| Cue | CH 16 · Note 72 | CH 16 · Note 73 |
| Hot cues 1–4 | Notes 80–83 | Notes 84–87 |

Crossfader: **CH 16 · CC 7**.

## Keyboard shortcuts

- `Space` / `A` — play or pause Deck A
- `L` — play or pause Deck B
- `S` / `;` — cue Deck A / Deck B
- `Q` / `E` — scratch Deck A backwards / forwards
- `O` / `P` — scratch Deck B backwards / forwards
- `←` / `→` — move the crossfader
- `Esc` — close the topmost panel

## Tests

```bash
node --test tests/*.test.mjs
```

The tests cover MIDI parsing, relative-jog decoding modes, BPM estimation, waveform peaks, and display formatting.

## Notes and assumptions

- MP3/audio decoding uses the browser's `decodeAudioData`; support follows the browser codec list.
- MIDI Learn is used instead of hardcoded controller profiles because jog CCs, touch notes, and channels vary between manufacturers.
- The default relative encoding is 7-bit two's complement (`64 = 0`). If your wheel turns the wrong way or feels too sensitive, change **Encoder type**, **Ticks per revolution**, or **Scratch sensitivity** in MIDI Setup.
- Beat detection is best-effort analysis for imported files; manually verified BPMs are not required for scratching or playback.
- MIDI mappings, platter settings, and hot cues persist in `localStorage`.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/jaybfracek-dot/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/jaybfracek-dot/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/jaybfracek-dot/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/jaybfracek-dot/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/jaybfracek-dot/PlayGround).
- 🛠️ [Check build runs](https://github.com/jaybfracek-dot/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/jaybfracek-dot/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/jaybfracek-dot).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->
