import { computePeaks } from './analysis.js'

/** Deterministic RNG so every reload sounds identical. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

const midiToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12)

export const DEMO_SPECS = [
  {
    id: 'demo-neon-tide',
    title: 'Neon Tide',
    artist: 'Aria Vex',
    bpm: 124,
    key: 'A MIN',
    root: 45,
    scale: MINOR,
    progression: [0, 5, 2, 6],
    style: 'house',
    seed: 7,
    color: '#ff8a3d',
    color2: '#ffc07a',
    tag: 'DEEP HOUSE'
  },
  {
    id: 'demo-chrome-hearts',
    title: 'Chrome Hearts',
    artist: 'KADE',
    bpm: 128,
    key: 'F MIN',
    root: 41,
    scale: MINOR,
    progression: [0, 0, 5, 6],
    style: 'tech',
    seed: 19,
    color: '#31d2ff',
    color2: '#9aebff',
    tag: 'TECH HOUSE'
  },
  {
    id: 'demo-afterglow',
    title: 'Afterglow Drive',
    artist: 'Nova Lane',
    bpm: 118,
    key: 'D♭ MAJ',
    root: 49,
    scale: MAJOR,
    progression: [0, 4, 5, 3],
    style: 'melodic',
    seed: 33,
    color: '#b07cff',
    color2: '#e0cbff',
    tag: 'MELODIC'
  },
  {
    id: 'demo-static-bloom',
    title: 'Static Bloom',
    artist: 'Rift Collective',
    bpm: 132,
    key: 'G MIN',
    root: 43,
    scale: MINOR,
    progression: [0, 6, 5, 4],
    style: 'electro',
    seed: 61,
    color: '#5ee6a8',
    color2: '#b7ffd9',
    tag: 'ELECTRO'
  }
]

function addKick(left, right, sampleRate, time, amp, rng) {
  const length = Math.min(left.length - Math.floor(time * sampleRate), Math.floor(sampleRate * 0.26))
  if (length <= 0) return
  const start = Math.floor(time * sampleRate)
  let phase = 0
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const freq = 46 + 135 * Math.exp(-t * 34)
    phase += (Math.PI * 2 * freq) / sampleRate
    const env = Math.exp(-t * 15) * (1 - Math.exp(-t * 600))
    let s = Math.sin(phase) * env * amp
    if (i < 90) s += (rng() * 2 - 1) * 0.12 * (1 - i / 90)
    left[start + i] += s
    right[start + i] += s
  }
}

function addNoise(left, right, sampleRate, time, duration, amp, decay, rng, pan = 0, hp = 0.86) {
  const length = Math.min(left.length - Math.floor(time * sampleRate), Math.floor(sampleRate * duration))
  if (length <= 0) return
  const start = Math.floor(time * sampleRate)
  const pl = Math.cos(((pan + 1) * Math.PI) / 4)
  const pr = Math.sin(((pan + 1) * Math.PI) / 4)
  let prev = 0
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const white = rng() * 2 - 1
    const filtered = white - prev * hp
    prev = white
    const env = Math.exp(-t * decay) * (1 - Math.exp(-t * 2500))
    const s = filtered * env * amp
    left[start + i] += s * pl
    right[start + i] += s * pr
  }
}

function addClap(left, right, sampleRate, time, amp, rng) {
  const bursts = [0, 0.011, 0.023, 0.038]
  for (let b = 0; b < bursts.length; b++) {
    addNoise(left, right, sampleRate, time + bursts[b], 0.16, amp * (b === 3 ? 1 : 0.55), 34, rng, 0, 0.55)
  }
}

function addHat(left, right, sampleRate, time, amp, rng, open = false, pan = 0) {
  addNoise(left, right, sampleRate, time, open ? 0.22 : 0.065, amp, open ? 12 : 46, rng, pan, 0.94)
}

function addTone(left, right, sampleRate, time, duration, freq, amp, opts = {}) {
  const length = Math.min(left.length - Math.floor(time * sampleRate), Math.floor(sampleRate * duration))
  if (length <= 0) return
  const start = Math.floor(time * sampleRate)
  const pan = opts.pan || 0
  const pl = Math.cos(((pan + 1) * Math.PI) / 4)
  const pr = Math.sin(((pan + 1) * Math.PI) / 4)
  const harmonics = opts.harmonics || [1, 0.28, 0.12]
  const attack = opts.attack || 0.008
  const release = opts.release || 0.08
  const decay = opts.decay || 0
  let phase = 0
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const envAttack = Math.min(1, t / attack)
    const envRelease = Math.min(1, Math.max(0, (duration - t) / release))
    const envDecay = decay ? Math.exp(-t * decay) : 1
    const env = envAttack * envRelease * envDecay
    phase += (Math.PI * 2 * freq) / sampleRate
    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      s += Math.sin(phase * (h + 1)) * harmonics[h]
    }
    s *= env * amp
    left[start + i] += s * pl
    right[start + i] += s * pr
  }
}

function addPad(left, right, sampleRate, time, duration, freqs, amp, rng) {
  for (let n = 0; n < freqs.length; n++) {
    const detune = (rng() - 0.5) * 0.6
    addTone(left, right, sampleRate, time, duration, freqs[n] * Math.pow(2, detune / 1200), amp, {
      attack: duration * 0.16,
      release: duration * 0.28,
      pan: (n - 1) * 0.28,
      harmonics: [1, 0.16, 0.07]
    })
  }
}

function renderDemo(spec, sampleRate) {
  const rng = mulberry32(spec.seed)
  const beat = 60 / spec.bpm
  const bars = 16
  const beatsPerBar = 4
  const duration = bars * beatsPerBar * beat
  const length = Math.ceil((duration + 0.15) * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const style = spec.style
  const scale = spec.scale

  const noteAt = (degree, octave = 0) => {
    const idx = ((degree % 7) + 7) % 7
    const oct = Math.floor(degree / 7) + octave
    return spec.root + scale[idx] + oct * 12
  }

  const bassPatterns = {
    house: [0, 0, 12, 0, 0, 0, 7, 12],
    tech: [0, 0, 0, 12, 0, 7, 0, 10],
    melodic: [0, 0, 7, 0, 12, 0, 7, 4],
    electro: [0, 0, 12, 7, 0, 0, 14, 7]
  }
  const arpPatterns = {
    house: [0, 2, 4, 6, 4, 2, 7, 4],
    tech: [0, 4, 2, 6, 0, 7, 4, 2],
    melodic: [0, 4, 2, 6, 4, 7, 6, 2],
    electro: [0, 2, 7, 4, 6, 2, 4, 7]
  }
  const bassPattern = bassPatterns[style] || bassPatterns.house
  const arpPattern = arpPatterns[style] || arpPatterns.house

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar * beat
    const chordDegree = spec.progression[bar % spec.progression.length]
    const chordRootMidi = noteAt(chordDegree, 0)
    const chordNotes = [0, 2, 4, 6].map((step) => midiToFreq(noteAt(chordDegree + step, 0) + 12))

    // Kick: four-on-the-floor with a pickup on the final bar.
    for (let b = 0; b < beatsPerBar; b++) {
      const swing = b === 3 && bar % 8 === 7 ? 0.01 : 0
      addKick(left, right, sampleRate, barStart + b * beat + swing, b === 0 ? 0.92 : 0.82, rng)
    }

    // Clap / snare on 2 and 4.
    addClap(left, right, sampleRate, barStart + beat, 0.22, rng)
    addClap(left, right, sampleRate, barStart + 3 * beat, 0.26, rng)

    // Hats: offbeat eighths, with extra 16ths on tech/electro.
    for (let eighth = 0; eighth < 8; eighth++) {
      const t = barStart + eighth * beat * 0.5
      const open = eighth === 3 || eighth === 7
      addHat(left, right, sampleRate, t, open ? 0.1 : 0.075, rng, open, (eighth % 2 ? 1 : -1) * 0.22)
      if ((style === 'tech' || style === 'electro') && eighth % 2 === 1) {
        addHat(left, right, sampleRate, barStart + (eighth + 0.5) * beat * 0.5, 0.045, rng, false, 0.35)
      }
    }

    // Bass groove, one note per eighth.
    for (let step = 0; step < 8; step++) {
      if (style === 'melodic' && (step === 2 || step === 6)) continue
      const semis = bassPattern[step]
      const freq = midiToFreq(chordRootMidi - 12 + semis)
      addTone(left, right, sampleRate, barStart + step * beat * 0.5, beat * 0.42, freq, 0.34, {
        attack: 0.006,
        release: 0.05,
        pan: 0,
        harmonics: [1, 0.22, 0.08]
      })
    }

    // Warm pad / chord bed.
    addPad(left, right, sampleRate, barStart, beat * 4, chordNotes, style === 'melodic' ? 0.075 : 0.055, rng)

    // Chord stabs on the offbeat for house/tech.
    if (style !== 'melodic') {
      for (let stab = 0; stab < 4; stab++) {
        const t = barStart + (stab + 0.5) * beat
        for (let n = 0; n < 3; n++) {
          addTone(left, right, sampleRate, t, beat * 0.22, chordNotes[n] * 2, 0.035, {
            attack: 0.005,
            decay: 22,
            release: 0.04,
            pan: (n - 1) * 0.4,
            harmonics: [1, 0.3]
          })
        }
      }
    }

    // Arp sparkle.
    for (let step = 0; step < 16; step++) {
      const density = style === 'melodic' ? 6 : 10
      if ((step + bar) % 16 > density) continue
      const degree = chordDegree + arpPattern[step % arpPattern.length]
      const freq = midiToFreq(noteAt(degree, 2))
      addTone(left, right, sampleRate, barStart + step * beat * 0.25, beat * 0.18, freq, 0.035, {
        attack: 0.004,
        decay: 30,
        release: 0.03,
        pan: step % 2 ? 0.55 : -0.55,
        harmonics: [1, 0.2]
      })
    }

    // Noise sweep into every 8-bar phrase.
    if (bar % 8 === 7) {
      addNoise(left, right, sampleRate, barStart + 2 * beat, beat * 2, 0.06, 1.5, rng, 0, 0.7)
    }
  }

  // Normalise and gently saturate.
  let peak = 0
  for (let i = 0; i < length; i++) {
    const l = Math.abs(left[i])
    const r = Math.abs(right[i])
    if (l > peak) peak = l
    if (r > peak) peak = r
  }
  const gain = peak > 0.0001 ? 0.9 / peak : 1
  const fade = Math.floor(sampleRate * 0.012)
  for (let i = 0; i < length; i++) {
    const edge = Math.min(1, i / fade, (length - 1 - i) / fade)
    left[i] = Math.tanh(left[i] * gain * 1.05) * 0.94 * edge
    right[i] = Math.tanh(right[i] * gain * 1.05) * 0.94 * edge
  }

  return { left, right, duration }
}

export async function buildDemoTracks(sampleRate, onProgress) {
  const tracks = []
  for (let i = 0; i < DEMO_SPECS.length; i++) {
    const spec = DEMO_SPECS[i]
    onProgress?.(spec, i)
    // Yield so the loading state can paint between renders.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const rendered = renderDemo(spec, sampleRate)
    const buffer = {
      numberOfChannels: 2,
      sampleRate,
      length: rendered.left.length,
      duration: rendered.duration,
      _left: rendered.left,
      _right: rendered.right,
      getChannelData(channel) {
        return channel === 0 ? this._left : this._right
      }
    }
    const peaks = computePeaks(buffer, 4096)
    tracks.push({
      id: spec.id,
      title: spec.title,
      artist: spec.artist,
      bpm: spec.bpm,
      key: spec.key,
      tag: spec.tag,
      color: spec.color,
      color2: spec.color2,
      duration: rendered.duration,
      buffer,
      peaks,
      source: 'demo'
    })
  }
  return tracks
}
