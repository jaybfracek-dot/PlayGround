import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeRelative, describeMidiMessage, formatBinding, parseMidiMessage } from '../js/midi-core.js'

test('parses note on and note off, including velocity-zero note off', () => {
  const on = parseMidiMessage(new Uint8Array([0x90, 60, 100]))
  assert.equal(on.type, 'noteon')
  assert.equal(on.channel, 0)
  assert.equal(on.note, 60)
  assert.equal(on.velocity, 100)
  assert.equal(on.pressed, true)

  const off = parseMidiMessage([0x80, 60, 0])
  assert.equal(off.type, 'noteoff')
  assert.equal(off.note, 60)

  const zero = parseMidiMessage([0x93, 61, 0])
  assert.equal(zero.type, 'noteoff')
  assert.equal(zero.channel, 3)
})

test('parses CC, pitch bend, aftertouch, program and sysex', () => {
  const cc = parseMidiMessage([0xb2, 33, 64])
  assert.equal(cc.type, 'cc')
  assert.equal(cc.controller, 33)
  assert.equal(cc.value, 64)
  assert.equal(cc.channel, 2)

  const bend = parseMidiMessage([0xe0, 0x00, 0x40])
  assert.equal(bend.type, 'pitchbend')
  assert.equal(bend.value, 0)
  const bendUp = parseMidiMessage([0xe1, 0x7f, 0x7f])
  assert.equal(bendUp.type, 'pitchbend')
  assert.ok(bendUp.unit > 0.99)

  assert.equal(parseMidiMessage([0xd0, 55]).type, 'channelpressure')
  assert.equal(parseMidiMessage([0xc0, 7]).type, 'program')
  assert.equal(parseMidiMessage([0xf0, 1, 2, 0xf7]).type, 'sysex')
  assert.equal(parseMidiMessage([0x01, 2, 3]), null)
  assert.equal(parseMidiMessage([]), null)
})

test('decodes relative jog encoders in every supported mode', () => {
  // two's complement / auto
  assert.equal(decodeRelative(1, 'auto'), 1)
  assert.equal(decodeRelative(5, 'auto'), 5)
  assert.equal(decodeRelative(127, 'auto'), -1)
  assert.equal(decodeRelative(120, 'auto'), -8)
  assert.equal(decodeRelative(64, 'auto'), 0)

  // offset
  assert.equal(decodeRelative(64, 'offset'), 0)
  assert.equal(decodeRelative(70, 'offset'), 6)
  assert.equal(decodeRelative(58, 'offset'), -6)

  // signed bit
  assert.equal(decodeRelative(1, 'signed'), 1)
  assert.equal(decodeRelative(64, 'signed'), 0)
  assert.equal(decodeRelative(127, 'signed'), -1)

  // absolute delta wraps around the 7-bit range
  assert.equal(decodeRelative(10, 'absolute', 5), 5)
  assert.equal(decodeRelative(120, 'absolute', 5), -13)
  assert.equal(decodeRelative(5, 'absolute', 120), 13)
  assert.equal(decodeRelative(50, 'absolute', null), 0)

  // linear absolute
  assert.equal(decodeRelative(70, 'absolute0', 60), 10)
  assert.equal(decodeRelative(10, 'absolute0', 60), -50)
})

test('formats bindings and monitor strings', () => {
  assert.equal(formatBinding({ type: 'cc', channel: 0, number: 33 }), 'CH 1 · CC 33')
  assert.equal(formatBinding({ type: 'note', channel: 2, number: 54 }), 'CH 3 · NOTE 54')
  assert.equal(formatBinding({ type: 'pitchbend', channel: 0, number: 0 }), 'CH 1 · PITCH BEND')
  assert.equal(formatBinding(null), '—')
  assert.match(describeMidiMessage({ channel: 0, type: 'cc', controller: 7, value: 127 }), /CC 7/)
})
