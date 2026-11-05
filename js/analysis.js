/** Audio analysis helpers: waveform peaks, duration formatting, BPM estimation. */

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function formatTime(seconds, forceHours = false) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0 || forceHours) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return '—'
  return bpm.toFixed(1)
}

/**
 * Build min/max-style mono peak data (absolute peak per bucket) for waveform drawing.
 * We keep separate L/R peaks so the waveform can show a proper stereo shape.
 */
export function computePeaks(buffer, buckets = 4096) {
  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left
  const length = left.length
  const outL = new Float32Array(buckets)
  const outR = new Float32Array(buckets)
  const step = length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * step)
    const end = Math.min(length, Math.max(start + 1, Math.floor((b + 1) * step)))
    let maxL = 0
    let maxR = 0
    // Sample at most a few thousand points per bucket; peaks are sparse enough.
    const stride = Math.max(1, Math.floor((end - start) / 512))
    for (let i = start; i < end; i += stride) {
      const l = left[i] < 0 ? -left[i] : left[i]
      const r = right[i] < 0 ? -right[i] : right[i]
      if (l > maxL) maxL = l
      if (r > maxR) maxR = r
    }
    outL[b] = maxL
    outR[b] = maxR
  }
  return { left: outL, right: outR, buckets, duration: buffer.duration }
}

/**
 * Lightweight tempo estimation suitable for dropped MP3s.
 * Builds a 100 Hz energy envelope, runs autocorrelation over 60-200 BPM,
 * folds the result into a useful DJ range and returns a confidence value.
 */
export function estimateBpm(buffer) {
  try {
    const sampleRate = buffer.sampleRate
    const channel = buffer.getChannelData(0)
    const maxSamples = Math.min(channel.length, Math.floor(sampleRate * 60))
    const hop = Math.max(64, Math.floor(sampleRate / 100))
    const frames = Math.floor((maxSamples - hop) / hop)
    if (frames < 120) return { bpm: 0, confidence: 0 }

    const energy = new Float32Array(frames)
    for (let f = 0; f < frames; f++) {
      const start = f * hop
      let sum = 0
      for (let i = start; i < start + hop; i += 2) {
        const s = channel[i] || 0
        sum += s * s
      }
      energy[f] = Math.sqrt(sum / (hop / 2))
    }

    const onset = new Float32Array(frames)
    let mean = 0
    for (let f = 1; f < frames; f++) {
      const a = Math.log1p(energy[f] * 800)
      const b = Math.log1p(energy[f - 1] * 800)
      const d = Math.max(0, a - b)
      onset[f] = d
      mean += d
    }
    mean /= Math.max(1, frames - 1)

    let best = { bpm: 0, score: 0 }
    // 30..100 frames at 10 ms = 60..200 BPM
    for (let lag = 30; lag <= 100; lag++) {
      let cross = 0
      let e1 = 0
      let e2 = 0
      for (let i = lag; i < frames; i++) {
        const a = onset[i] - mean
        const b = onset[i - lag] - mean
        cross += a * b
        e1 += a * a
        e2 += b * b
      }
      const corr = cross / Math.sqrt(e1 * e2 + 1e-9)
      const bpm = 60 / (lag * 0.01)
      // Gentle preference for 100-140 BPM to avoid half/double-time confusion.
      const prior = Math.exp(-Math.pow(Math.log(bpm / 120), 2) / 0.18)
      const score = corr * prior
      if (score > best.score) best = { bpm, score }
    }

    let bpm = best.bpm
    if (!bpm) return { bpm: 0, confidence: 0 }
    while (bpm < 80) bpm *= 2
    while (bpm > 160) bpm /= 2
    return { bpm: Math.round(bpm * 10) / 10, confidence: Math.max(0, best.score) }
  } catch {
    return { bpm: 0, confidence: 0 }
  }
}

export function makePeaksFromArray(left, sampleRate, buckets = 4096) {
  const fake = {
    numberOfChannels: 1,
    sampleRate,
    duration: left.length / sampleRate,
    getChannelData: () => left
  }
  return computePeaks(fake, buckets)
}
