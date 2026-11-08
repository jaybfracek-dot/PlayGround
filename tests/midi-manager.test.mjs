import test from 'node:test'
import assert from 'node:assert/strict'

// MidiManager persists to localStorage. Keep the store in memory for the test.
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
}

const { MidiManager, PARTY_MIX_LIVE_PRESET } = await import('../js/midi.js')

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

test('Party Mix Live starter profile includes expected channel and control bindings', () => {
  const { mapping } = PARTY_MIX_LIVE_PRESET
  assert.deepEqual(mapping.deckA.jog, { type: 'cc', channel: 0, number: 6 })
  assert.deepEqual(mapping.deckB.jog, { type: 'cc', channel: 1, number: 6 })
  assert.deepEqual(mapping.deckA.play, { type: 'note', channel: 0, number: 0 })
  assert.deepEqual(mapping.deckB.sync, { type: 'note', channel: 1, number: 2 })
  assert.deepEqual(mapping.deckA.pad4, { type: 'note', channel: 4, number: 23 })
  assert.deepEqual(mapping.deckB.pad1, { type: 'note', channel: 5, number: 20 })
  assert.deepEqual(mapping.mixer.crossfader, { type: 'cc', channel: 15, number: 8 })
})

test('applying a MIDI preset replaces bindings, clears decoder state, and persists', () => {
  storage.clear()
  let notice = ''
  const midi = new MidiManager({ onNotice: (text) => { notice = text } })
  midi.setBinding('deckA.touch', { type: 'note', channel: 2, number: 54 }, { silent: true })
  midi.startLearn('deckA.cue')
  midi.lastCC.set('old', 12)
  midi.buttonEdges.set('old', true)

  midi.applyPreset()

  assert.equal(midi.learning, null)
  assert.equal(midi.getBinding('deckA.touch'), null)
  assert.deepEqual(midi.getBinding('deckA.jog'), { type: 'cc', channel: 0, number: 6 })
  assert.equal(midi.lastCC.size, 0)
  assert.equal(midi.buttonEdges.size, 0)
  assert.match(notice, /Numark Party Mix Live profile loaded/)
  const reloaded = new MidiManager()
  assert.deepEqual(reloaded.getBinding('mixer.crossfader'), { type: 'cc', channel: 15, number: 8 })
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
