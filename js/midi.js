import { decodeRelative, describeMidiMessage, formatBinding, midiUnit, parseMidiMessage, pitchBendUnit } from './midi-core.js'

const STORAGE_KEY = 'scratchlab.midi.v3'

export const CONTROL_TARGETS = [
  { id: 'deckA.jog', group: 'deckA', label: 'Jog wheel', role: 'relative', hint: 'Rotate the platter' },
  { id: 'deckA.touch', group: 'deckA', label: 'Touch sensor', role: 'touch', hint: 'Touch the platter top' },
  { id: 'deckA.play', group: 'deckA', label: 'Play / pause', role: 'trigger' },
  { id: 'deckA.cue', group: 'deckA', label: 'Cue', role: 'trigger' },
  { id: 'deckA.sync', group: 'deckA', label: 'Sync', role: 'trigger' },
  { id: 'deckA.tempo', group: 'deckA', label: 'Tempo fader', role: 'fader' },
  { id: 'deckA.volume', group: 'deckA', label: 'Channel fader', role: 'fader' },
  { id: 'deckA.filter', group: 'deckA', label: 'Filter knob', role: 'knob' },
  { id: 'deckA.eqHigh', group: 'deckA', label: 'EQ high', role: 'knob' },
  { id: 'deckA.eqMid', group: 'deckA', label: 'EQ mid', role: 'knob' },
  { id: 'deckA.eqLow', group: 'deckA', label: 'EQ low', role: 'knob' },
  { id: 'deckA.pad1', group: 'deckA', label: 'Hot cue 1', role: 'trigger' },
  { id: 'deckA.pad2', group: 'deckA', label: 'Hot cue 2', role: 'trigger' },
  { id: 'deckA.pad3', group: 'deckA', label: 'Hot cue 3', role: 'trigger' },
  { id: 'deckA.pad4', group: 'deckA', label: 'Hot cue 4', role: 'trigger' },
  { id: 'deckB.jog', group: 'deckB', label: 'Jog wheel', role: 'relative', hint: 'Rotate the platter' },
  { id: 'deckB.touch', group: 'deckB', label: 'Touch sensor', role: 'touch', hint: 'Touch the platter top' },
  { id: 'deckB.play', group: 'deckB', label: 'Play / pause', role: 'trigger' },
  { id: 'deckB.cue', group: 'deckB', label: 'Cue', role: 'trigger' },
  { id: 'deckB.sync', group: 'deckB', label: 'Sync', role: 'trigger' },
  { id: 'deckB.tempo', group: 'deckB', label: 'Tempo fader', role: 'fader' },
  { id: 'deckB.volume', group: 'deckB', label: 'Channel fader', role: 'fader' },
  { id: 'deckB.filter', group: 'deckB', label: 'Filter knob', role: 'knob' },
  { id: 'deckB.eqHigh', group: 'deckB', label: 'EQ high', role: 'knob' },
  { id: 'deckB.eqMid', group: 'deckB', label: 'EQ mid', role: 'knob' },
  { id: 'deckB.eqLow', group: 'deckB', label: 'EQ low', role: 'knob' },
  { id: 'deckB.pad1', group: 'deckB', label: 'Hot cue 1', role: 'trigger' },
  { id: 'deckB.pad2', group: 'deckB', label: 'Hot cue 2', role: 'trigger' },
  { id: 'deckB.pad3', group: 'deckB', label: 'Hot cue 3', role: 'trigger' },
  { id: 'deckB.pad4', group: 'deckB', label: 'Hot cue 4', role: 'trigger' },
  { id: 'mixer.crossfader', group: 'mixer', label: 'Crossfader', role: 'fader' },
  { id: 'mixer.master', group: 'mixer', label: 'Master volume', role: 'knob' }
]

export const DEFAULT_SETTINGS = {
  encoding: { A: 'auto', B: 'auto' },
  platterMode: { A: 'auto', B: 'auto' },
  ticksPerRev: { A: 128, B: 128 },
  sensitivity: 1,
  lastController: ''
}

const VIRTUAL_CHANNEL = 15
const note = (number) => ({ type: 'note', channel: VIRTUAL_CHANNEL, number })
const cc = (number) => ({ type: 'cc', channel: VIRTUAL_CHANNEL, number })

export const VIRTUAL_MAPPING = {
  deckA: {
    jog: cc(100),
    touch: note(60),
    play: note(70),
    cue: note(72),
    pad1: note(80),
    pad2: note(81),
    pad3: note(82),
    pad4: note(83)
  },
  deckB: {
    jog: cc(101),
    touch: note(61),
    play: note(71),
    cue: note(73),
    pad1: note(84),
    pad2: note(85),
    pad3: note(86),
    pad4: note(87)
  },
  mixer: {
    crossfader: cc(7)
  }
}

function emptyMapping() {
  return { deckA: {}, deckB: {}, mixer: {} }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { mapping: emptyMapping(), settings: structuredClone(DEFAULT_SETTINGS) }
    const parsed = JSON.parse(raw)
    const mapping = emptyMapping()
    for (const group of ['deckA', 'deckB', 'mixer']) {
      if (parsed.mapping && parsed.mapping[group]) mapping[group] = parsed.mapping[group]
    }
    return {
      mapping,
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        ...(parsed.settings || {}),
        encoding: { ...DEFAULT_SETTINGS.encoding, ...(parsed.settings?.encoding || {}) },
        platterMode: { ...DEFAULT_SETTINGS.platterMode, ...(parsed.settings?.platterMode || {}) },
        ticksPerRev: { ...DEFAULT_SETTINGS.ticksPerRev, ...(parsed.settings?.ticksPerRev || {}) }
      }
    }
  } catch {
    return { mapping: emptyMapping(), settings: structuredClone(DEFAULT_SETTINGS) }
  }
}

function bindingMatches(binding, message) {
  if (!binding || !message) return false
  if (binding.channel !== null && binding.channel !== undefined && binding.channel !== message.channel) return false
  if (binding.type === 'pitchbend') return message.type === 'pitchbend'
  if (binding.type === 'cc') return message.type === 'cc' && binding.number === message.controller
  if (binding.type === 'note') {
    return (message.type === 'noteon' || message.type === 'noteoff') && binding.number === message.note
  }
  return false
}

export class MidiManager {
  constructor({ onControl, onDevices, onMonitor, onLearn, onNotice, onSettings } = {}) {
    const loaded = loadState()
    this.mapping = loaded.mapping
    this.settings = loaded.settings
    this.onControl = onControl || (() => {})
    this.onDevices = onDevices || (() => {})
    this.onMonitor = onMonitor || (() => {})
    this.onLearn = onLearn || (() => {})
    this.onNotice = onNotice || (() => {})
    this.onSettings = onSettings || (() => {})
    this.access = null
    this.enabled = false
    this.error = ''
    this.learning = null
    this.capture = null
    this.captureHistory = []
    this.lastCC = new Map()
    this.buttonEdges = new Map()
    this.devices = []
    this.virtualEnabled = false
    this.captureHistory = []
  }

  get supported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.requestMIDIAccess)
  }

  async enable() {
    if (!this.supported) {
      this.error = 'Web MIDI is not available in this browser. Use Chrome or Edge over HTTPS/localhost.'
      this.emitDevices()
      return false
    }
    if (this.access) {
      this.attachAccess()
      return true
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      this.enabled = true
      this.error = ''
      this.attachAccess()
      return true
    } catch (error) {
      this.enabled = false
      this.error = error && error.name === 'SecurityError'
        ? 'MIDI access was blocked. Allow MIDI permission and try again.'
        : 'Could not open MIDI devices.'
      this.emitDevices()
      return false
    }
  }

  attachAccess() {
    if (!this.access) return
    this.access.onstatechange = () => this.attachAccess()
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => this.handleRaw(event.data, input.name)
    }
    this.devices = Array.from(this.access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
      state: input.state,
      connection: input.connection
    }))
    if (!this.settings.lastController && this.devices[0]) {
      this.settings.lastController = this.devices[0].name
      this.save()
    }
    this.emitDevices()
  }

  emitDevices() {
    this.onDevices({
      supported: this.supported,
      enabled: this.enabled,
      error: this.error,
      devices: this.devices,
      virtualEnabled: this.virtualEnabled
    })
  }

  setVirtualEnabled(enabled) {
    this.virtualEnabled = Boolean(enabled)
    this.emitDevices()
  }

  hasTouch(deckId) {
    const group = deckId === 'A' || deckId === 'B' ? `deck${deckId}` : deckId
    return Boolean(this.mapping[group]?.touch)
  }

  getBinding(targetId) {
    const [group, target] = String(targetId).split('.')
    return this.mapping[group]?.[target] || null
  }

  setBinding(targetId, binding, { silent = false } = {}) {
    const [group, target] = String(targetId).split('.')
    if (!this.mapping[group]) this.mapping[group] = {}
    if (binding) {
      // A physical control should only own one target in its group.
      for (const key of Object.keys(this.mapping[group])) {
        const existing = this.mapping[group][key]
        if (
          key !== target &&
          existing &&
          existing.type === binding.type &&
          existing.channel === binding.channel &&
          existing.number === binding.number
        ) {
          delete this.mapping[group][key]
        }
      }
    }
    if (binding) this.mapping[group][target] = binding
    else delete this.mapping[group][target]
    this.save()
    if (!silent) {
      this.onNotice?.(binding ? `Mapped ${targetId.replace('.', ' ')} → ${formatBinding(binding)}` : `Cleared ${targetId.replace('.', ' ')}`)
    }
    this.onLearn?.(null)
  }

  clearBinding(targetId) {
    this.setBinding(targetId, null)
  }

  clearAll() {
    this.mapping = emptyMapping()
    this.learning = null
    this.save()
    this.onLearn?.(null)
    this.onNotice?.('All MIDI mappings cleared')
  }

  startLearn(targetId) {
    this.learning = { targetId }
    this.onLearn?.(targetId)
  }

  cancelLearn() {
    this.learning = null
    this.onLearn?.(null)
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapping: this.mapping, settings: this.settings }))
    } catch {
      /* storage can be unavailable in private mode */
    }
    this.onSettings?.(this.settings)
  }

  updateSetting(path, value) {
    const [key, deck] = path.split('.')
    if (deck) this.settings[key][deck] = value
    else this.settings[key] = value
    this.save()
  }

  handleRaw(data, sourceName = 'Unknown input', sourceKind = 'hardware') {
    let message
    try {
      message = parseMidiMessage(data)
    } catch {
      return null
    }
    if (!message || message.type === 'clock' || message.type === 'sysex') return message

    const map = sourceKind === 'virtual' ? VIRTUAL_MAPPING : this.mapping
    const matches = []
    for (const group of ['deckA', 'deckB', 'mixer']) {
      const groupMap = map[group]
      if (!groupMap) continue
      for (const [target, binding] of Object.entries(groupMap)) {
        if (bindingMatches(binding, message)) matches.push({ targetId: `${group}.${target}`, group, target, binding })
      }
    }

    let relativeDelta = null
    for (const match of matches) {
      if (match.target === 'jog') {
        const key = `${sourceName}|${sourceKind}|${message.channel}|${message.controller}`
        const last = this.lastCC.get(key)
        relativeDelta = decodeRelative(message.value, this.settings.encoding[match.group === 'deckA' ? 'A' : 'B'], last)
        this.lastCC.set(key, message.value)
      }
    }

    const monitorEntry = {
      time: Date.now(),
      source: sourceName,
      kind: sourceKind,
      message,
      text: describeMidiMessage(message),
      delta: relativeDelta,
      raw: message.raw
    }
    this.onMonitor(monitorEntry)

    if (this.capture) {
      this.captureHistory.push(monitorEntry)
      if (this.capture.predicate(message, monitorEntry, this.captureHistory)) {
        const resolve = this.capture.resolve
        clearTimeout(this.capture.timer)
        this.capture = null
        resolve(monitorEntry)
      }
    }

    if (this.learning) {
      const learned = this.learnFromMessage(this.learning.targetId, message)
      if (learned) return message
    }

    for (const match of matches) {
      const payload = this.payloadFor(match, message, relativeDelta, sourceName, sourceKind)
      if (payload) this.onControl(match.targetId, payload)
    }
    return message
  }

  payloadFor(match, message, relativeDelta, sourceName, sourceKind) {
    const base = { message, source: sourceName, sourceKind, raw: message.raw }
    switch (match.target) {
      case 'jog':
        return { ...base, delta: relativeDelta || 0, rawValue: message.value }
      case 'touch': {
        if (message.type === 'noteon') return { ...base, pressed: message.velocity > 0 }
        if (message.type === 'noteoff') return { ...base, pressed: false }
        if (message.type === 'cc') return { ...base, pressed: message.value >= 64 }
        return null
      }
      case 'play':
      case 'cue':
      case 'sync':
      case 'pad1':
      case 'pad2':
      case 'pad3':
      case 'pad4': {
        const key = `${match.targetId}|${sourceName}|${sourceKind}`
        let pressed = false
        if (message.type === 'noteon') pressed = message.velocity > 0
        else if (message.type === 'noteoff') pressed = false
        else if (message.type === 'cc') pressed = message.value >= 64
        const previous = this.buttonEdges.get(key) || false
        this.buttonEdges.set(key, pressed)
        if (!pressed || previous) return null
        return { ...base, pressed: true }
      }
      case 'tempo': {
        const unit = message.type === 'pitchbend' ? pitchBendUnit(message) : midiUnit(message.value)
        return { ...base, unit, pitch: message.type === 'pitchbend' ? unit * 0.08 : (unit - 0.5) * 0.16 }
      }
      case 'crossfader':
        return { ...base, unit: midiUnit(message.value), value: midiUnit(message.value) * 2 - 1 }
      case 'master':
        return { ...base, unit: midiUnit(message.value) }
      case 'volume':
      case 'filter':
      case 'eqHigh':
      case 'eqMid':
      case 'eqLow':
        return { ...base, unit: midiUnit(message.value) }
      default:
        return null
    }
  }

  learnFromMessage(targetId, message) {
    let type = null
    if (message.type === 'cc') type = 'cc'
    else if (message.type === 'noteon' || message.type === 'noteoff') type = 'note'
    else if (message.type === 'pitchbend') type = 'pitchbend'
    if (!type) return false
    // Do not learn note-off as the binding moment, but accept the note id.
    const binding = {
      type,
      channel: message.channel,
      number: type === 'pitchbend' ? 0 : type === 'cc' ? message.controller : message.note
    }
    this.learning = null
    this.setBinding(targetId, binding, { silent: true })
    this.onNotice?.(`${targetId.replace('.', ' ')} mapped to ${formatBinding(binding)}`)
    this.onLearn?.(null)
    return true
  }

  captureNext(predicate, { timeout = 12000 } = {}) {
    this.cancelCapture()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.capture = null
        reject(new Error('timeout'))
      }, timeout)
      this.capture = {
        predicate,
        resolve,
        reject,
        timer,
        startedAt: Date.now()
      }
      this.captureHistory = []
    })
  }

  cancelCapture() {
    if (this.capture) {
      clearTimeout(this.capture.timer)
      const reject = this.capture.reject
      this.capture = null
      reject?.(new Error('cancelled'))
    }
  }

  sendVirtual(bytes) {
    this.handleRaw(bytes, 'ScratchLab Virtual', 'virtual')
  }

  getStatusText() {
    if (!this.supported) return 'WEB MIDI UNSUPPORTED'
    if (this.error) return this.error.toUpperCase()
    if (this.virtualEnabled && (!this.enabled || !this.devices.length)) return 'VIRTUAL MIDI ACTIVE'
    if (!this.enabled) return 'MIDI NOT CONNECTED'
    if (!this.devices.length) return 'NO MIDI INPUTS'
    if (this.devices.length === 1) return this.devices[0].name.toUpperCase()
    return `${this.devices.length} MIDI INPUTS`
  }
}
