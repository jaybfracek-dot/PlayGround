// Generates the four royalty-free demo tracks shipped with PHASE//TWO.
// Requires: npm install lamejs (only needed to regenerate the MP3 assets).
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const fs = await import('node:fs')
const vm = await import('node:vm')
const lameSource = fs.readFileSync('/tmp/lamegen/node_modules/lamejs/lame.all.js', 'utf8') + '\nmodule.exports = lamejs'
const lameModule = { exports: {} }
vm.runInNewContext(lameSource, { module: lameModule, exports: lameModule.exports, console })
const { Mp3Encoder } = lameModule.exports

const SR = 44100
const TAU = Math.PI * 2
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x))
const noise = () => Math.random() * 2 - 1
const noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

function adsr(t, dur, a = 0.005, d = 0.1, s = 0.6, r = 0.2) {
  if (t < 0 || t > dur + r) return 0
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
  if (t < dur) return s
  return Math.max(0, s * (1 - (t - dur) / r))
}

function sine(phase) { return Math.sin(TAU * phase) }
function saw(phase) { return 2 * (phase - Math.floor(phase + 0.5)) }
function square(phase) { return Math.sign(sine(phase)) }
function tri(phase) { return 2 * Math.abs(saw(phase)) - 1 }

function add(buf, startSec, dur, fn, pan = 0, gain = 1) {
  const start = Math.floor(startSec * SR)
  const n = Math.floor(dur * SR)
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4)
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < n; i++) {
    const j = start + i
    if (j < 0 || j >= buf[0].length) continue
    const v = fn(i / SR, i)
    buf[0][j] += v * gl
    buf[1][j] += v * gr
  }
}

function kick(buf, t, gain = 0.9, pan = 0) {
  add(buf, t, 0.42, (x) => {
    const f = 46 + 120 * Math.exp(-x * 35)
    const env = Math.exp(-x * 9) * Math.min(1, x * 500)
    const click = Math.exp(-x * 90) * 0.22 * noise()
    return Math.sin(TAU * f * x + 1.2) * env * gain + click * gain
  }, pan)
}

function snare(buf, t, gain = 0.55, pan = 0) {
  add(buf, t, 0.24, (x) => {
    const env = Math.exp(-x * 20)
    const body = Math.sin(TAU * 186 * x) * Math.exp(-x * 30) * 0.45
    const n = (noise() * 0.6 + noise() * 0.4) * Math.exp(-x * 16)
    return (body + n) * env * gain
  }, pan)
}

function clap(buf, t, gain = 0.38, pan = 0) {
  for (let k = 0; k < 4; k++) {
    add(buf, t + k * 0.011, 0.1, (x) => {
      const env = Math.exp(-x * (k === 3 ? 28 : 75))
      return noise() * env * gain * (k === 3 ? 1 : 0.6)
    }, pan)
  }
}

function hat(buf, t, gain = 0.18, open = false, pan = 0.15) {
  let prev = 0
  add(buf, t, open ? 0.24 : 0.055, (x) => {
    const n = noise()
    const hp = n - prev * 0.92
    prev = n
    const env = Math.exp(-x * (open ? 16 : 75))
    return hp * env * gain
  }, pan)
}

function rim(buf, t, gain = 0.25, pan = -0.2) {
  add(buf, t, 0.1, (x) => {
    const env = Math.exp(-x * 55)
    return (Math.sin(TAU * 780 * x) * 0.7 + noise() * 0.3) * env * gain
  }, pan)
}

function shaker(buf, t, gain = 0.1, pan = 0.35) {
  let prev = 0
  add(buf, t, 0.09, (x) => {
    const n = noise(); const hp = n - prev * 0.85; prev = n
    return hp * Math.exp(-x * 45) * gain
  }, pan)
}

function bass(buf, t, midi, dur, gain = 0.45, pan = 0) {
  const f = noteHz(midi)
  add(buf, t, dur, (x) => {
    const env = adsr(x, dur, 0.008, 0.08, 0.65, 0.08)
    const fundamental = sine(f * x) * 0.75
    const harmonic = sine(f * 2 * x) * 0.15 + tri(f * x) * 0.18
    return (fundamental + harmonic) * env * gain
  }, pan)
}

function subBass(buf, t, midi, dur, gain = 0.4) {
  const f = noteHz(midi)
  add(buf, t, dur, (x) => Math.sin(TAU * f * x) * adsr(x, dur, 0.01, 0.05, 0.85, 0.08) * gain)
}

function pad(buf, t, midis, dur, gain = 0.12, pan = 0) {
  midis.forEach((m, i) => {
    const f = noteHz(m)
    add(buf, t, dur, (x) => {
      const env = adsr(x, dur, 0.35, 0.6, 0.55, 0.7)
      const detune = 1 + (i - midis.length / 2) * 0.0015
      return (tri(f * detune * x) * 0.55 + sine(f * 2 * detune * x) * 0.18) * env * gain
    }, pan)
  })
}

function stab(buf, t, midis, dur = 0.28, gain = 0.16, pan = 0.1) {
  midis.forEach((m, i) => {
    const f = noteHz(m)
    add(buf, t, dur, (x) => {
      const env = adsr(x, dur, 0.004, 0.16, 0.18, 0.12)
      return (saw(f * x) * 0.4 + square(f * 2.001 * x) * 0.12 + sine(f * x) * 0.5) * env * gain
    }, pan + (i - 1) * 0.08)
  })
}

function pluck(buf, t, midi, dur = 0.5, gain = 0.2, pan = 0) {
  const f = noteHz(midi)
  add(buf, t, dur, (x) => {
    const env = Math.exp(-x * 8) * Math.min(1, x * 300)
    return (sine(f * x) * 0.6 + tri(f * 2 * x) * 0.15 + sine(f * 3 * x) * 0.08) * env * gain
  }, pan)
}

function crackle(buf, seconds, amount = 0.012) {
  for (let i = 0; i < seconds * SR * 0.0009; i++) {
    const j = Math.floor(Math.random() * buf[0].length)
    const v = noise() * amount * (0.4 + Math.random() * 0.6)
    buf[0][j] += v
    buf[1][j] += v * 0.8
  }
}

function reverb(buf, delaySec = 0.19, amount = 0.2) {
  const d = Math.floor(delaySec * SR)
  const l = buf[0], r = buf[1]
  for (let i = d; i < l.length; i++) {
    l[i] += r[i - d] * amount
    r[i] += l[i - d] * amount * 0.93
  }
}

function normalize(buf, target = 0.92) {
  let peak = 0
  for (const ch of buf) for (const v of ch) peak = Math.max(peak, Math.abs(v))
  const g = peak > 0 ? target / peak : 1
  for (const ch of buf) for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * g * 1.08) / Math.tanh(1.08)
}

function makeBuffer(bpm, bars) {
  const beat = 60 / bpm
  const dur = bars * 4 * beat
  return { bpm, bars, beat, dur, buf: [new Float32Array(Math.ceil(dur * SR)), new Float32Array(Math.ceil(dur * SR))] }
}

const A_MIN = [57, 60, 64, 67]
const F_MAJ = [53, 57, 60, 64]
const C_MAJ = [48, 52, 55, 59]
const G_MAJ = [55, 59, 62, 65]

function house() {
  const { bpm, bars, beat, dur, buf } = makeBuffer(124, 16)
  const roots = [45, 45, 41, 43]
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    for (let b = 0; b < 4; b++) kick(buf, t0 + b * beat, 0.95)
    for (let b = 0; b < 4; b++) hat(buf, t0 + (b + 0.5) * beat, 0.19, true)
    for (let s = 0; s < 16; s++) hat(buf, t0 + s * beat / 4, s % 4 === 0 ? 0.06 : 0.11, false, -0.1)
    clap(buf, t0 + 1 * beat, 0.34); clap(buf, t0 + 3 * beat, 0.34)
    const chord = [A_MIN, F_MAJ, C_MAJ, G_MAJ][bar % 4]
    stab(buf, t0 + 0.5 * beat, chord, 0.3, 0.12, 0.05)
    stab(buf, t0 + 2.5 * beat, chord, 0.22, 0.09, -0.1)
    pad(buf, t0, chord.map(n => n + 12), 4 * beat, 0.045, 0)
    const root = roots[bar % 4]
    for (let e = 0; e < 8; e++) bass(buf, t0 + e * beat / 2, root + (e % 2 ? 12 : 0), beat * 0.42, 0.33)
    if (bar % 2 === 1) pluck(buf, t0 + 3.5 * beat, chord[(bar + 1) % 4] + 12, 0.4, 0.1, 0.25)
  }
  reverb(buf, 0.187, 0.16)
  normalize(buf, 0.9)
  return { buf, bpm, bars, dur, title: 'Midnight Motion', artist: 'Kairo Club', key: 'A min', color: '#ff9d3c' }
}

function boomBap() {
  const { bpm, bars, beat, dur, buf } = makeBuffer(94, 12)
  const chords = [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]]
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    const swing = beat * 0.08
    kick(buf, t0, 0.95); kick(buf, t0 + 1.5 * beat, 0.75); kick(buf, t0 + 2.75 * beat, 0.72)
    if (bar % 4 === 3) kick(buf, t0 + 3.5 * beat, 0.5)
    snare(buf, t0 + beat, 0.5); snare(buf, t0 + 3 * beat, 0.55)
    rim(buf, t0 + 2.5 * beat, 0.16)
    for (let s = 0; s < 8; s++) hat(buf, t0 + s * beat / 2 + (s % 2 ? swing : 0), s % 2 ? 0.12 : 0.07, false, 0.2)
    shaker(buf, t0 + 3.25 * beat, 0.08)
    const chord = chords[bar % 4]
    for (let b = 0; b < 4; b++) pad(buf, t0 + b * beat, chord, beat * 0.85, 0.055, 0.05)
    const root = [38, 34, 31, 33][bar % 4]
    bass(buf, t0, root, beat * 0.8, 0.45)
    bass(buf, t0 + 1.5 * beat, root + 7, beat * 0.4, 0.3)
    bass(buf, t0 + 2.75 * beat, root, beat * 0.55, 0.4)
    if (bar % 2 === 0) pluck(buf, t0 + 2.5 * beat, chord[2] + 12, 0.5, 0.07, -0.3)
  }
  crackle(buf, dur, 0.018)
  reverb(buf, 0.23, 0.12)
  normalize(buf, 0.88)
  return { buf, bpm, bars, dur, title: 'Velvet Static', artist: 'Mono/Chrome', key: 'D min', color: '#a58bff' }
}

function techno() {
  const { bpm, bars, beat, dur, buf } = makeBuffer(132, 16)
  const acid = [41, 41, 44, 41, 48, 46, 44, 41]
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    for (let b = 0; b < 4; b++) {
      kick(buf, t0 + b * beat, 1.0)
      hat(buf, t0 + (b + 0.5) * beat, 0.12, true, 0.25)
    }
    for (let s = 0; s < 16; s++) hat(buf, t0 + s * beat / 4, s % 2 ? 0.055 : 0.085, false, -0.15)
    clap(buf, t0 + beat, 0.25); clap(buf, t0 + 3 * beat, 0.25)
    for (let s = 0; s < 16; s++) {
      const n = acid[(s + bar * 3) % acid.length]
      pluck(buf, t0 + s * beat / 4, n, 0.18, 0.06, s % 2 ? 0.3 : -0.3)
    }
    subBass(buf, t0, 29, beat * 3.6, 0.28)
    pad(buf, t0, [53, 56, 60], 4 * beat, 0.025, 0)
    if (bar % 4 === 0) rim(buf, t0 + 3.5 * beat, 0.13, 0.2)
  }
  reverb(buf, 0.145, 0.18)
  normalize(buf, 0.93)
  return { buf, bpm, bars, dur, title: 'Neon Rain', artist: 'Static Bloom', key: 'F# min', color: '#38d9ff' }
}

function golden() {
  const { bpm, bars, beat, dur, buf } = makeBuffer(84, 12)
  const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]]
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    kick(buf, t0, 0.7); kick(buf, t0 + 2.5 * beat, 0.55)
    rim(buf, t0 + beat, 0.18); rim(buf, t0 + 3 * beat, 0.2)
    shaker(buf, t0 + 0.5 * beat, 0.07); shaker(buf, t0 + 1.5 * beat, 0.06); shaker(buf, t0 + 3.5 * beat, 0.08)
    for (let s = 0; s < 8; s++) hat(buf, t0 + s * beat / 2, 0.035, false, 0.3)
    const chord = chords[bar % 4]
    pad(buf, t0, chord, 4 * beat, 0.085, 0.1)
    const root = [36, 33, 29, 31][bar % 4]
    bass(buf, t0, root, beat * 1.8, 0.38)
    bass(buf, t0 + 2.5 * beat, root + 7, beat * 0.9, 0.26)
    if (bar % 2 === 1) {
      pluck(buf, t0 + beat, chord[2] + 12, 1.2, 0.1, -0.25)
      pluck(buf, t0 + 3 * beat, chord[3] + 12, 1.0, 0.08, 0.3)
    }
  }
  crackle(buf, dur, 0.009)
  reverb(buf, 0.27, 0.22)
  normalize(buf, 0.86)
  return { buf, bpm, bars, dur, title: 'Golden Hour', artist: 'Lumen Fields', key: 'C maj', color: '#ffd76a' }
}

function id3(tags) {
  const frames = Object.entries(tags).map(([id, text]) => {
    const body = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'utf8')])
    const h = Buffer.alloc(10)
    h.write(id, 0, 'ascii')
    h.writeUInt32BE(body.length, 4)
    return Buffer.concat([h, body])
  })
  const body = Buffer.concat(frames)
  const h = Buffer.alloc(10)
  h.write('ID3', 0, 'ascii'); h[3] = 3; h[4] = 0; h[5] = 0
  const size = body.length
  h[6] = (size >> 21) & 0x7f; h[7] = (size >> 14) & 0x7f; h[8] = (size >> 7) & 0x7f; h[9] = size & 0x7f
  return Buffer.concat([h, body])
}

function encodeMp3(track) {
  const [l, r] = track.buf
  const enc = new Mp3Encoder(2, SR, 192)
  const chunks = []
  const block = 1152
  const li = new Int16Array(block), ri = new Int16Array(block)
  for (let i = 0; i < l.length; i += block) {
    const n = Math.min(block, l.length - i)
    for (let j = 0; j < n; j++) {
      li[j] = clamp(l[i + j], -1, 1) * 32767
      ri[j] = clamp(r[i + j], -1, 1) * 32767
    }
    const out = enc.encodeBuffer(n === block ? li : li.subarray(0, n), n === block ? ri : ri.subarray(0, n))
    if (out.length) chunks.push(Buffer.from(out))
  }
  const end = enc.flush()
  if (end.length) chunks.push(Buffer.from(end))
  return Buffer.concat([id3({ TIT2: track.title, TPE1: track.artist, TALB: 'PHASE//TWO Sessions', TBPM: String(track.bpm) }), ...chunks])
}

mkdirSync('assets/audio', { recursive: true })
for (const [file, make] of [['midnight-motion', house], ['velvet-static', boomBap], ['neon-rain', techno], ['golden-hour', golden]]) {
  console.log('rendering', file)
  const track = make()
  const mp3 = encodeMp3(track)
  writeFileSync(`assets/audio/${file}.mp3`, mp3)
  console.log(file, (mp3.length / 1024 / 1024).toFixed(2), 'MB', track.dur.toFixed(2), 's', track.bpm, 'BPM')
}
