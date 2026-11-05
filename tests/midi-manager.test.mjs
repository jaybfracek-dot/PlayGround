import test from 'node:test'
import assert from 'node:assert/strict'

// MidiManager persists to localStorage. Keep the store in memory for the test.
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
}

const { MidiManager } = await import('../js/midi.js')

test('touch detection accepts both short and group deck ids', () => {
  const midi = new MidiManager()
  assert.equal(midi.hasTouch('A'), false)
  assert.equal(midi.hasTouch('B'), false)

  midi.setBinding('deckA.touch', { type: 'note', channel: 0, number: 54 }, { silent: true })
  assert.equal(midi.hasTouch('A'), true)
  assert.equal(midi.hasTouch('deckA'), true)
  assert.equal(midi.hasTouch('B'), false)

  midi.clearBinding('deckA.touch')
  assert.equal(midi.hasTouch('A'), false)
})

test('relative jog payload reaches the mapped target with a signed delta', () => {
  const midi = new MidiManager()
  const received = []
  midi.onControl = (target, payload) => received.push({ target, payload })
  midi.setBinding('deckA.jog', { type: 'cc', channel: 0, number: 33 }, { silent: true })

  midi.handleRaw([0xb0, 33, 5], 'test')
  midi.handleRaw([0xb0, 33, 123], 'test')

  assert.equal(received.length, 2)
  assert.equal(received[0].target, 'deckA.jog')
  assert.equal(received[0].payload.delta, 5)
  assert.equal(received[1].payload.delta, -5)
})
