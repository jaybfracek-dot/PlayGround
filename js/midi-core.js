/**
 * Pure MIDI parsing and relative-jog decoding helpers.
 * Kept free of browser APIs so it can be unit-tested in Node.
 */

export const STATUS_NAMES = {
  0x80: 'NOTE OFF',
  0x90: 'NOTE ON',
  0xa0: 'AFTERTOUCH',
  0xb0: 'CC',
  0xc0: 'PROGRAM',
  0xd0: 'CH PRESSURE',
  0xe0: 'PITCH BEND'
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

/**
 * Parse a raw Web MIDI message into a friendly object.
 * @param {Uint8Array|number[]} input raw message bytes
 * @returns {null|object}
 */
export function parseMidiMessage(input) {
  if (!input) return null
  const data = input instanceof Uint8Array ? input : Array.from(input)
  if (!data.length) return null

  const status = data[0]
  if (status < 0x80) return null // running status is not used by Web MIDI
  const type = status & 0xf0
  const channel = status & 0x0f
  const raw = Array.from(data)
  const base = { channel, channelNumber: channel + 1, status, raw }

  switch (type) {
    case 0x80:
      if (data.length < 3) return null
      return { ...base, type: 'noteoff', note: data[1], velocity: data[2], number: data[1], value: data[2], pressed: false }
    case 0x90: {
      if (data.length < 3) return null
      const velocity = data[2]
      return {
        ...base,
        type: velocity === 0 ? 'noteoff' : 'noteon',
        note: data[1],
        velocity,
        number: data[1],
        value: velocity,
        pressed: velocity > 0
      }
    }
    case 0xa0:
      if (data.length < 3) return null
      return { ...base, type: 'aftertouch', note: data[1], pressure: data[2], number: data[1], value: data[2] }
    case 0xb0:
      if (data.length < 3) return null
      return {
        ...base,
        type: 'cc',
        controller: data[1],
        number: data[1],
        value: data[2],
        unit: data[2] / 127
      }
    case 0xc0:
      if (data.length < 2) return null
      return { ...base, type: 'program', program: data[1], number: data[1], value: data[1] }
    case 0xd0:
      if (data.length < 2) return null
      return { ...base, type: 'channelpressure', pressure: data[1], number: data[1], value: data[1] }
    case 0xe0: {
      if (data.length < 3) return null
      const lsb = data[1]
      const msb = data[2]
      const value = ((msb << 7) | lsb) - 8192
      return { ...base, type: 'pitchbend', number: 0, value, unit: value / 8192, lsb, msb }
    }
    case 0xf0:
      return { ...base, type: data[0] === 0xf8 ? 'clock' : 'sysex', raw }
    default:
      return null
  }
}

/**
 * Decode a 7-bit relative-jog value into a signed tick delta.
 *
 * Modes:
 *  - auto/twos : 0..63 = clockwise, 64..127 = counter-clockwise (7-bit two's complement)
 *  - signed    : 1..63 = positive, 65..127 = negative, 64 = 0
 *  - offset    : value - 64 (0 = -64 ... 127 = +63)
 *  - absolute  : shortest wrap-around delta from the previous absolute value
 *  - absolute0 : raw value difference from previous absolute value (no wrap)
 *
 * @param {number} value incoming 0..127 value
 * @param {string} mode decoding mode
 * @param {number|null} lastValue previous raw value (for absolute modes)
 * @returns {number} signed tick delta
 */
export function decodeRelative(value, mode = 'auto', lastValue = null) {
  const v = clamp(Math.round(Number(value) || 0), 0, 127)
  switch (mode) {
    case 'offset':
      return v - 64
    case 'signed':
      if (v === 64) return 0
      return v < 64 ? v : v - 128
    case 'absolute': {
      if (lastValue === null || lastValue === undefined) return 0
      let delta = v - clamp(Math.round(Number(lastValue) || 0), 0, 127)
      if (delta > 64) delta -= 128
      if (delta < -64) delta += 128
      return delta
    }
    case 'absolute0': {
      if (lastValue === null || lastValue === undefined) return 0
      return v - clamp(Math.round(Number(lastValue) || 0), 0, 127)
    }
    case 'twos':
    case 'auto':
    default:
      if (v === 64) return 0
      return v > 64 ? v - 128 : v
  }
}

/** Normalise a 7-bit fader to 0..1 */
export function midiUnit(value) {
  return clamp(Number(value) || 0, 0, 127) / 127
}

/** Normalise a pitch-bend message to -1..1 */
export function pitchBendUnit(message) {
  if (!message) return 0
  if (typeof message.unit === 'number') return clamp(message.unit, -1, 1)
  return clamp((Number(message.value) || 0) / 8192, -1, 1)
}

/** Human-readable binding, e.g. "CH 1 · CC 33" */
export function formatBinding(binding) {
  if (!binding) return '—'
  const ch = binding.channel === null || binding.channel === undefined ? 'ANY' : `CH ${binding.channel + 1}`
  if (binding.type === 'cc') return `${ch} · CC ${binding.number}`
  if (binding.type === 'note') return `${ch} · NOTE ${binding.number}`
  if (binding.type === 'pitchbend') return `${ch} · PITCH BEND`
  return `${ch} · ${String(binding.type).toUpperCase()}`
}

/** Short label for the monitor */
export function describeMidiMessage(message) {
  if (!message) return '—'
  const ch = `CH${message.channel + 1}`
  switch (message.type) {
    case 'noteon':
      return `${ch} NOTE ON  ${message.note}  VEL ${message.velocity}`
    case 'noteoff':
      return `${ch} NOTE OFF ${message.note}`
    case 'cc':
      return `${ch} CC ${message.controller}  ${message.value}`
    case 'pitchbend':
      return `${ch} PITCH BEND  ${message.value > 0 ? '+' : ''}${message.value}`
    case 'aftertouch':
      return `${ch} AFTERTOUCH ${message.note} ${message.pressure}`
    case 'channelpressure':
      return `${ch} PRESSURE ${message.value}`
    case 'program':
      return `${ch} PROGRAM ${message.program}`
    default:
      return `${ch} ${message.type.toUpperCase()}`
  }
}
