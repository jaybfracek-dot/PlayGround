import test from 'node:test'
import assert from 'node:assert/strict'
import { computePeaks, estimateBpm, formatTime } from '../js/analysis.js'

function clickTrack({ sampleRate = 44100, bpm = 120, seconds = 12, duration = 0.06 } = {}) {
  const length = sampleRate * seconds
  const data = new Float32Array(length)
  const beat = 60 / bpm
  let seed = 1234567
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed / 4294967296) * 2 - 1
  }
  for (let t = 0; t < seconds; t += beat) {
    const start = Math.floor(t * sampleRate)
    const count = Math.floor(duration * sampleRate)
    for (let i = 0; i < count && start + i < length; i++) {
      const env = Math.exp(-(i / sampleRate) * 38)
      data[start + i] += Math.sin((i / sampleRate) * 2 * Math.PI * 70) * env * 0.8 + random() * env * 0.2
    }
  }
  return {
    numberOfChannels: 1,
    sampleRate,
    length,
    duration: seconds,
    getChannelData: () => data
  }
}

test('formats times for DJ displays', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(65), '1:05')
  assert.equal(formatTime(3661), '1:01:01')
  assert.equal(formatTime(3661, true), '1:01:01')
})

test('computes stereo waveform peaks', () => {
  const buffer = clickTrack()
  const peaks = computePeaks(buffer, 256)
  assert.equal(peaks.buckets, 256)
  assert.equal(peaks.left.length, 256)
  assert.equal(peaks.right.length, 256)
  assert.ok(Math.max(...peaks.left) > 0.5)
})

test('estimates around 120 BPM from a click track', () => {
  const buffer = clickTrack({ bpm: 120, seconds: 20 })
  const result = estimateBpm(buffer)
  assert.ok(result.bpm >= 116 && result.bpm <= 124, `expected ~120 BPM, got ${result.bpm}`)
  assert.ok(result.confidence > 0)
})
