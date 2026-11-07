import { AudioEngine } from './audio-engine.js'
import { buildDemoTracks } from './demo-tracks.js'
import { clamp, computePeaks, estimateBpm, formatTime } from './analysis.js'
import { CONTROL_TARGETS, MidiManager } from './midi.js'
import { formatBinding, isPartyMixLiveDevice } from './midi-core.js'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const FILE_PALETTE = [
  ['#31d2ff', '#a0edff'],
  ['#ff8a3d', '#ffc184'],
  ['#b07cff', '#e0cbff'],
  ['#5ee6a8', '#b7ffd9'],
  ['#ff5d7a', '#ffadbc'],
  ['#f2c94c', '#ffe9a3']
]

const state = {
  audio: null,
  midi: null,
  tracks: [],
  decks: {},
  knobs: {},
  filter: 'all',
  search: '',
  sessionStart: Date.now(),
  booted: false,
  learningTarget: null,
  wizardRun: 0,
  crossfader: 0,
  masterVolume: 0.78,
  lastUiTick: 0,
  lastWaveTick: 0,
  keyScratch: { A: { dir: 0, last: 0 }, B: { dir: 0, last: 0 } }
}

function deckRefs(id) {
  return {
    id,
    root: $(`#deck${id}`),
    mode: $(`#mode${id}`),
    bpm: $(`#bpm${id}`),
    key: $(`#key${id}`),
    cap: $(`#cap${id}`),
    cover: $(`#cover${id}`),
    title: $(`#title${id}`),
    artist: $(`#artist${id}`),
    tag: $(`#tag${id}`),
    load: $(`#load${id}`),
    overview: $(`#waveOverview${id}`),
    zoom: $(`#waveZoom${id}`),
    remain: $(`#remain${id}`),
    remainClock: $(`#remainClock${id}`),
    scratchHint: $(`#scratchHint${id}`),
    platter: $(`#platter${id}`),
    platterSpin: $(`#platterSpin${id}`),
    platterLabel: $(`#platterLabel${id}`),
    platterStatus: $(`#platterStatus${id}`),
    platterStatusText: $(`#platterStatusText${id}`),
    platterSub: $(`#platterSub${id}`),
    play: $(`#play${id}`),
    playIcon: $(`#play${id} use`),
    cue: $(`#cue${id}`),
    sync: $(`#sync${id}`),
    loop: $(`#loop${id}`),
    pads: $(`#pads${id}`),
    padButtons: $$(`#pads${id} .pad`),
    tempo: $(`#tempo${id}`),
    tempoVal: $(`#tempoVal${id}`),
    time: $(`#time${id}`),
    duration: $(`#dur${id}`),
    transportState: $(`#transportState${id}`)
  }
}

const ui = {
  deck: { A: deckRefs('A'), B: deckRefs('B') },
  midiOverlay: $('#midiOverlay'),
  helpOverlay: $('#helpOverlay'),
  wizardOverlay: $('#wizardOverlay'),
  virtualDock: $('#virtualDock'),
  virtualToggle: $('#virtualToggle'),
  trackRows: $('#trackRows'),
  toastStack: $('#toastStack'),
  boot: $('#boot'),
  bootBar: $('#bootBar'),
  dropZone: $('#dropZone'),
  fileInput: $('#fileInput'),
  crossfader: $('#crossfader'),
  virtualCross: $('#virtualCross'),
  monitorLog: $('#monitorLog'),
  midiStatus: $('#midiStatus'),
  midiStatusText: $('#midiStatusText'),
  audioChip: $('#audioChip'),
  audioStatusText: $('#audioStatusText'),
  sessionClock: $('#sessionClock'),
  masterBpm: $('#masterBpm'),
  searchInput: $('#searchInput'),
  importState: $('#importState'),
  libraryCount: $('#libraryCount'),
  sensitivityRange: $('#sensitivityRange'),
  sensitivityOut: $('#sensitivityOut'),
  jogSignal: $('#jogSignal'),
  mappingSummary: $('#mappingSummary'),
  midiDot: $('#midiDot'),
  midiDeviceName: $('#midiDeviceName'),
  midiDeviceDetail: $('#midiDeviceDetail'),
  enableMidi: $('#enableMidi'),
  hardMapping: {}
}

/* ---------------- helpers ---------------- */
function initials(title) {
  return String(title || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => (word.match(/[a-z0-9]/i) || ['?'])[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function colorForName(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return FILE_PALETTE[Math.abs(hash) % FILE_PALETTE.length]
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
}

function toast(text, kind = '', duration = 2600) {
  const node = document.createElement('div')
  node.className = `toast${kind ? ` is-${kind}` : ''}`
  node.textContent = text
  ui.toastStack.appendChild(node)
  setTimeout(() => {
    node.classList.add('is-leaving')
    setTimeout(() => node.remove(), 240)
  }, duration)
}

async function ensureAudio() {
  if (!state.audio) return
  const status = await state.audio.resume()
  updateAudioChip(status)
  return status
}

function updateAudioChip(status) {
  const running = status === 'running'
  ui.audioChip.classList.toggle('is-live', running)
  ui.audioStatusText.textContent = running ? 'AUDIO RUNNING' : 'AUDIO SUSPENDED'
}

function updateSessionClock() {
  const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000)
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  ui.sessionClock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function setJogSignal(delta) {
  ui.jogSignal.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta)}`
  ui.jogSignal.style.color = delta < 0 ? 'var(--b)' : delta > 0 ? 'var(--a)' : 'var(--violet)'
}

/* ---------------- knobs ---------------- */
function createKnob(container, options) {
  const { label, min = -1, max = 1, value = 0, reset = 0, className = '', onChange } = options
  const node = document.createElement('div')
  node.className = `knob${className ? ` ${className}` : ''}`
  node.tabIndex = 0
  node.setAttribute('role', 'slider')
  node.setAttribute('aria-label', label)
  node.setAttribute('aria-valuemin', String(min))
  node.setAttribute('aria-valuemax', String(max))
  node.innerHTML = `<div class="knob__dial"><span class="knob__ind"></span></div><span class="knob__name">${label}</span>`
  container.appendChild(node)
  const indicator = $('.knob__ind', node)
  let current = clamp(value, min, max)
  let drag = null

  const render = () => {
    const ratio = (current - min) / (max - min)
    indicator.style.transform = `translateX(-50%) rotate(${-135 + ratio * 270}deg)`
    node.setAttribute('aria-valuenow', current.toFixed(2))
  }
  const setValue = (next, notify = true) => {
    current = clamp(Number(next), min, max)
    node.dataset.value = String(current)
    render()
    if (notify) onChange?.(current)
  }

  node.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    node.setPointerCapture(event.pointerId)
    drag = { y: event.clientY, start: current }
    node.classList.add('is-dragging')
  })
  node.addEventListener('pointermove', (event) => {
    if (!drag) return
    const sensitivity = (max - min) / 150
    setValue(drag.start + (drag.y - event.clientY) * sensitivity)
  })
  const endDrag = () => {
    drag = null
    node.classList.remove('is-dragging')
  }
  node.addEventListener('pointerup', endDrag)
  node.addEventListener('pointercancel', endDrag)
  node.addEventListener('dblclick', () => setValue(reset))
  node.addEventListener('wheel', (event) => {
    event.preventDefault()
    setValue(current + (event.deltaY < 0 ? 1 : -1) * ((max - min) / 40))
  }, { passive: false })
  node.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      setValue(current + (max - min) / 40)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setValue(current - (max - min) / 40)
    }
  })
  node.addEventListener('contextmenu', (event) => event.preventDefault())

  render()
  onChange?.(current)
  return { node, setValue, get value() { return current } }
}

function setupMixerKnobs() {
  for (const id of ['A', 'B']) {
    const deck = state.decks[id]
    const eqContainer = $(`#eq${id}`)
    state.knobs[`eqLow${id}`] = createKnob(eqContainer, {
      label: 'LOW',
      min: -1,
      max: 1,
      value: 0,
      onChange: (v) => deck.audio.setEQ('low', v)
    })
    state.knobs[`eqMid${id}`] = createKnob(eqContainer, {
      label: 'MID',
      min: -1,
      max: 1,
      value: 0,
      onChange: (v) => deck.audio.setEQ('mid', v)
    })
    state.knobs[`eqHigh${id}`] = createKnob(eqContainer, {
      label: 'HIGH',
      min: -1,
      max: 1,
      value: 0,
      onChange: (v) => deck.audio.setEQ('high', v)
    })
    state.knobs[`filter${id}`] = createKnob($(`#filter${id}`), {
      label: 'FILTER',
      min: 0,
      max: 1,
      value: 0.5,
      reset: 0.5,
      className: 'knob--filter',
      onChange: (v) => deck.audio.setFilter(v)
    })
  }
  state.knobs.master = createKnob($('#masterKnob'), {
    label: 'MASTER',
    min: 0,
    max: 1,
    value: state.masterVolume,
    reset: 0.78,
    className: 'knob--master',
    onChange: (v) => {
      state.masterVolume = v
      state.audio?.setMasterVolume(v)
    }
  })
}

/* ---------------- device values ---------------- */
function setCrossfaderValue(value, { echoVirtual = true } = {}) {
  state.crossfader = clamp(value, -1, 1)
  ui.crossfader.value = state.crossfader
  state.audio?.setCrossfader(state.crossfader)
  if (echoVirtual) ui.virtualCross.value = String(Math.round((state.crossfader + 1) * 63.5))
}

function setMasterVolume(unit) {
  const v = clamp(unit, 0, 1)
  state.masterVolume = v
  state.audio?.setMasterVolume(v)
  state.knobs.master?.setValue(v, false)
}

function setChannelVolume(id, unit) {
  const deck = state.decks[id]
  const v = clamp(unit, 0, 1)
  deck.channelVolume = v
  deck.audio.setChannelVolume(v)
  const slider = $(`#vol${id}`)
  const label = $(`#volVal${id}`)
  slider.value = String(v)
  label.textContent = String(Math.round(v * 100))
}

function setPitch(id, pitch, { updateSlider = true } = {}) {
  const deck = state.decks[id]
  deck.pitch = clamp(pitch, 0.5, 1.5)
  deck.audio.setPitch(deck.pitch)
  const percent = (deck.pitch - 1) * 100
  ui.deck[id].tempoVal.textContent = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
  if (updateSlider) ui.deck[id].tempo.value = String(clamp(percent, -8, 8))
  updateBpmLabels()
}

function updateBpmLabels() {
  for (const id of ['A', 'B']) {
    const deck = state.decks[id]
    const bpm = deck.track?.bpm ? deck.track.bpm * deck.pitch : 0
    ui.deck[id].bpm.textContent = bpm ? bpm.toFixed(1) : '—'
  }
  const a = state.decks.A
  const b = state.decks.B
  const chosen = a.playing ? a : b.playing ? b : a.track ? a : b
  const bpm = chosen.track?.bpm ? chosen.track.bpm * chosen.pitch : 0
  ui.masterBpm.textContent = bpm ? bpm.toFixed(1) : '—'
}

function refreshCapability() {
  for (const id of ['A', 'B']) {
    const capacitive = state.midi ? state.midi.hasTouch(id) : false
    const setting = $(`#capSetting${id}`)
    const deckEl = ui.deck[id]
    deckEl.cap.textContent = capacitive ? 'TOUCH' : 'NO TOUCH'
    deckEl.cap.classList.toggle('is-touch', capacitive)
    deckEl.mode.textContent = capacitive ? 'CAPACITIVE' : 'RELATIVE'
    setting.textContent = capacitive ? 'CAPACITIVE' : 'NO TOUCH'
    setting.classList.toggle('is-touch', capacitive)
    const mode = state.midi?.settings.platterMode[id] || 'auto'
    deckEl.platterSub.textContent = capacitive
      ? 'TOUCH TO GRAB · RELEASE TO RESUME'
      : mode === 'nudge'
        ? 'ROTATE TO BEND SPEED'
        : 'ROTATE TO SCRATCH · AUTO-GRAB'
    deckEl.scratchHint.textContent = capacitive
      ? 'TOUCH + ROTATE TO SCRATCH'
      : mode === 'nudge'
        ? 'ROTATE TO NUDGE'
        : 'ROTATE TO SCRATCH'
  }
}

function refreshSettingsUI() {
  if (!state.midi) return
  const settings = state.midi.settings
  $$('select[data-setting]').forEach((select) => {
    const key = select.dataset.setting
    const deck = select.dataset.deck
    const value = deck ? settings[key]?.[deck] : settings[key]
    if (value !== undefined) select.value = String(value)
  })
  ui.sensitivityRange.value = String(settings.sensitivity)
  ui.sensitivityOut.textContent = `${Number(settings.sensitivity).toFixed(2)}×`
  refreshCapability()
}

/* ---------------- mapping UI ---------------- */
function buildMappingUI() {
  const containers = {
    deckA: $('#mapDeckA'),
    deckB: $('#mapDeckB'),
    mixer: $('#mapMixer')
  }
  for (const target of CONTROL_TARGETS) {
    const row = document.createElement('div')
    row.className = 'map-row'
    row.dataset.target = target.id
    const roleText = target.role === 'relative' ? 'RELATIVE' : target.role === 'touch' ? 'TOUCH SENSOR' : target.role.toUpperCase()
    row.innerHTML = `
      <div class="map-row__label"><span>${target.label}</span><small>${roleText}</small></div>
      <button class="bind-btn" type="button" data-bind="${target.id}" title="${target.hint || 'MIDI learn this control'}">LEARN</button>
      <button class="clear-bind" type="button" data-clear="${target.id}" aria-label="Clear ${target.label}"><svg class="icon"><use href="#i-x"></use></svg></button>
    `
    containers[target.group].appendChild(row)
  }
}

function refreshMappingUI() {
  if (!state.midi) return
  let count = 0
  for (const target of CONTROL_TARGETS) {
    const row = $(`[data-target="${target.id}"]`)
    if (!row) continue
    const binding = state.midi.getBinding(target.id)
    const button = $('.bind-btn', row)
    const clear = $('.clear-bind', row)
    if (binding) count++
    button.textContent = binding ? formatBinding(binding) : 'LEARN'
    button.classList.toggle('is-bound', Boolean(binding))
    button.classList.toggle('is-learning', state.learningTarget === target.id)
    row.classList.toggle('is-learning', state.learningTarget === target.id)
    clear.style.opacity = binding ? '1' : ''
  }
  ui.mappingSummary.textContent = `${count} control${count === 1 ? '' : 's'} mapped`
  refreshCapability()
}

/* ---------------- deck state ---------------- */
function createDeckState(id) {
  const deck = {
    id,
    audio: state.audio.decks[id],
    track: null,
    pitch: 1,
    playing: false,
    touching: false,
    scratchActive: false,
    autoScratch: false,
    scratchRate: 0,
    pendingJog: 0,
    lastJogFrame: 0,
    lastTickAt: 0,
    autoReleaseAt: 0,
    nudgeOffset: 0,
    nudgeUntil: 0,
    platterAngle: Math.random() * 360,
    cue: 0,
    cues: [null, null, null, null],
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    echo: false,
    channelVolume: 0.86
  }

  deck.audio.onEnded = () => {
    deck.playing = false
    deck.scratchActive = false
    deck.touching = false
    deck.pendingJog = 0
    deck.scratchRate = 0
    updateDeckUI(id)
    updateBpmLabels()
  }

  return deck
}

function cueStorageKey(track) {
  return `scratchlab.cues.${track.id}`
}

function loadCues(track) {
  try {
    const raw = localStorage.getItem(cueStorageKey(track))
    if (!raw) return [null, null, null, null]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [null, null, null, null]
    return [0, 1, 2, 3].map((i) => {
      const value = parsed[i]
      return Number.isFinite(value) && value >= 0 && value <= track.duration ? value : null
    })
  } catch {
    return [null, null, null, null]
  }
}

function saveCues(deck) {
  if (!deck.track) return
  try {
    localStorage.setItem(cueStorageKey(deck.track), JSON.stringify(deck.cues))
  } catch {
    /* private mode */
  }
}

function updatePads(id) {
  const deck = state.decks[id]
  const refs = ui.deck[id]
  refs.padButtons.forEach((button, index) => {
    const cue = deck.cues[index]
    button.classList.toggle('is-set', cue !== null)
    $('.pad__time', button).textContent = cue === null ? '—' : formatTime(cue)
  })
}

function updateDeckUI(id) {
  const deck = state.decks[id]
  const refs = ui.deck[id]
  const isPlaying = deck.playing
  refs.root.classList.toggle('is-playing', isPlaying)
  refs.root.classList.toggle('is-scratching', deck.scratchActive)
  refs.play.classList.toggle('is-playing', isPlaying)
  refs.playIcon.setAttribute('href', isPlaying ? '#i-pause' : '#i-play')
  refs.play.setAttribute('aria-label', `${isPlaying ? 'Pause' : 'Play'} deck ${id}`)
  refs.loop.classList.toggle('is-active', deck.loop)
  refs.sync.classList.remove('is-active')

  let status = 'STANDBY'
  if (deck.track) {
    if (deck.scratchActive) status = deck.touching ? 'SCRATCH · TOUCH' : 'SCRATCH · JOG'
    else if (deck.nudgeUntil > performance.now()) status = 'PITCH NUDGE'
    else if (isPlaying) status = 'PLAYING'
    else status = 'READY'
  }
  refs.platterStatusText.textContent = status
  refs.transportState.textContent = status === 'SCRATCH · TOUCH' || status === 'SCRATCH · JOG' ? 'SCRATCH' : status
  refs.remainClock.textContent = deck.track ? `−${formatTime(Math.max(0, deck.audio.duration - deck.audio.getPosition()))}` : '−0:00'
  const progress = deck.track && deck.audio.duration ? deck.audio.getPosition() / deck.audio.duration : 0
  refs.platter.setAttribute('aria-valuenow', String(Math.round(clamp(progress, 0, 1) * 100)))
}

function setDeckTrack(id, track, { play = false } = {}) {
  const deck = state.decks[id]
  const refs = ui.deck[id]
  if (!state.audio || !track) return
  deck.playing = false
  deck.touching = false
  deck.scratchActive = false
  deck.autoScratch = false
  deck.pendingJog = 0
  deck.scratchRate = 0
  deck.nudgeOffset = 0
  deck.nudgeUntil = 0
  deck.audio.load(track)
  deck.track = track
  deck.cue = 0
  deck.loop = false
  deck.cues = loadCues(track)
  deck.audio.setLoop(false)
  deck.audio.setChannelVolume(deck.channelVolume)
  deck.audio.setPitch(deck.pitch)

  refs.title.textContent = track.title
  refs.artist.textContent = track.artist || (track.source === 'file' ? 'Local MP3' : 'ScratchLab demo')
  refs.tag.textContent = track.tag || (track.source === 'file' ? 'MP3' : 'DEMO')
  refs.cover.innerHTML = `<span>${initials(track.title)}</span>`
  refs.cover.style.background = `linear-gradient(135deg, ${track.color}, ${track.color2})`
  refs.platterLabel.style.background = `radial-gradient(circle at 38% 30%, rgba(255,255,255,.35), transparent 38%), linear-gradient(135deg, ${track.color}, ${track.color2})`
  const small = $('small', refs.platterLabel)
  if (small) small.textContent = `${id} · ${track.source === 'file' ? 'MP3' : '33⅓'}`
  refs.bpm.textContent = track.bpm ? (track.bpm * deck.pitch).toFixed(1) : '—'
  refs.key.textContent = track.key || '—'
  refs.duration.textContent = formatTime(track.duration)
  refs.time.textContent = '0:00'
  refs.remain.textContent = `−${formatTime(track.duration)}`
  refs.tempoVal.textContent = `${(deck.pitch - 1) * 100 >= 0 ? '+' : ''}${((deck.pitch - 1) * 100).toFixed(1)}%`
  refs.loop.classList.remove('is-active')
  updatePads(id)
  updateDeckUI(id)
  updateBpmLabels()
  drawDeckWaveform(id)
  renderLibrary()

  if (play) {
    playDeck(id).catch(() => {})
  }
}

async function playDeck(id) {
  await ensureAudio()
  const deck = state.decks[id]
  if (!deck.track) {
    toast('Load a track into Deck ' + id, 'warn')
    return
  }
  if (deck.audio.getPosition() >= deck.audio.duration - 0.08) {
    deck.audio.seek(0)
  }
  if (deck.scratchActive && deck.touching) {
    deck.touching = false
    deck.scratchActive = false
    deck.autoScratch = false
  }
  deck.playing = true
  deck.audio.play()
  updateDeckUI(id)
  updateBpmLabels()
}

function pauseDeck(id) {
  const deck = state.decks[id]
  if (!deck.track) return
  deck.playing = false
  deck.scratchActive = false
  deck.autoScratch = false
  deck.touching = false
  deck.pendingJog = 0
  deck.scratchRate = 0
  deck.audio.pause()
  updateDeckUI(id)
  updateBpmLabels()
}

async function togglePlay(id) {
  const deck = state.decks[id]
  if (deck.playing) pauseDeck(id)
  else await playDeck(id)
}

function cueDeck(id) {
  const deck = state.decks[id]
  if (!deck.track) return
  const position = deck.audio.getPosition()
  if (deck.playing) {
    pauseDeck(id)
    deck.audio.seek(deck.cue)
    toast(`Deck ${id} cued to ${formatTime(deck.cue)}`)
  } else if (Math.abs(position - deck.cue) > 0.12) {
    deck.cue = position
    toast(`Cue point set · ${formatTime(deck.cue)}`)
  } else {
    deck.audio.seek(deck.cue)
    playDeck(id).catch(() => {})
  }
  drawDeckWaveform(id)
}

function padAction(id, index, { forceSet = false } = {}) {
  const deck = state.decks[id]
  if (!deck.track) return
  if (forceSet || deck.cues[index] === null) {
    deck.cues[index] = deck.audio.getPosition()
    saveCues(deck)
    toast(`Hot cue ${index + 1} set on Deck ${id}`)
  } else {
    deck.audio.seek(deck.cues[index])
    toast(`Deck ${id} → hot cue ${index + 1}`)
  }
  updatePads(id)
  updateDeckUI(id)
  drawDeckWaveform(id)
  const button = ui.deck[id].padButtons[index]
  button.classList.remove('is-hit')
  void button.offsetWidth
  button.classList.add('is-hit')
}

function clearPad(id, index) {
  const deck = state.decks[id]
  deck.cues[index] = null
  saveCues(deck)
  updatePads(id)
  drawDeckWaveform(id)
}

function toggleLoop(id) {
  const deck = state.decks[id]
  if (!deck.track) return
  deck.loop = !deck.loop
  if (deck.loop) {
    const beat = 60 / (deck.track.bpm || 120)
    let start = deck.audio.getPosition()
    let end = start + beat * 4
    if (end > deck.audio.duration - 0.02) {
      end = deck.audio.duration - 0.02
      start = Math.max(0, end - beat * 4)
    }
    deck.loopStart = start
    deck.loopEnd = end
    deck.audio.setLoop(true, start, end)
    toast(`4-beat loop armed · ${formatTime(start)} → ${formatTime(end)}`, 'accent')
  } else {
    deck.audio.setLoop(false)
    toast('Loop off')
  }
  updateDeckUI(id)
  drawDeckWaveform(id)
}

function toggleEcho(id) {
  const deck = state.decks[id]
  deck.echo = !deck.echo
  deck.audio.setEcho(deck.echo, deck.track?.bpm || 120)
  $(`#echo${id}`).classList.toggle('is-active', deck.echo)
  toast(`Echo ${deck.echo ? 'on' : 'off'} · Deck ${id}`)
}

function syncDeck(id) {
  const deck = state.decks[id]
  const otherId = id === 'A' ? 'B' : 'A'
  const other = state.decks[otherId]
  if (!deck.track || !other.track) {
    toast('Load tracks on both decks to sync', 'warn')
    return
  }
  if (!deck.track.bpm || !other.track.bpm) {
    toast('A track is missing BPM data', 'warn')
    return
  }
  const target = other.track.bpm * other.pitch
  const ratio = target / deck.track.bpm
  if (ratio < 0.92 || ratio > 1.08) {
    toast(`BPM gap too wide (${deck.track.bpm.toFixed(1)} → ${target.toFixed(1)})`, 'warn')
    return
  }
  setPitch(id, ratio)
  ui.deck[id].sync.classList.add('is-active')
  setTimeout(() => ui.deck[id].sync.classList.remove('is-active'), 900)
  toast(`Deck ${id} synced to ${target.toFixed(1)} BPM at ${(ratio * 100 - 100).toFixed(1)}%`, 'accent')
}

/* ---------------- scratch engine ---------------- */
function beginScratch(deck, auto) {
  if (!deck.track) return
  deck.scratchActive = true
  deck.autoScratch = auto
  deck.scratchRate = 0
  deck.audio.beginScratch()
  updateDeckUI(deck.id)
}

function endScratch(deck) {
  if (!deck.scratchActive) return
  deck.scratchActive = false
  deck.autoScratch = false
  deck.scratchRate = 0
  deck.pendingJog = 0
  deck.audio.endScratch()
  updateDeckUI(deck.id)
}

function setTouch(id, down) {
  const deck = state.decks[id]
  if (!deck.track) return
  if (down) {
    if (deck.touching) return
    deck.touching = true
    if (!deck.scratchActive) beginScratch(deck, false)
    else deck.autoScratch = false
  } else {
    if (!deck.touching) return
    deck.touching = false
    if (deck.scratchActive) endScratch(deck)
  }
  updateDeckUI(id)
}

function handleJog(id, delta, source = 'midi') {
  const deck = state.decks[id]
  if (!deck.track || !Number.isFinite(delta) || delta === 0) return
  setJogSignal(delta)
  const mode = state.midi?.settings.platterMode[id] || 'auto'
  const capacitive = state.midi?.hasTouch(id) || false
  const scratchMode = deck.touching || mode === 'scratch' || (mode === 'auto' && !capacitive)
  if (scratchMode) {
    if (!deck.scratchActive) beginScratch(deck, !deck.touching)
    deck.pendingJog += delta
    deck.autoReleaseAt = performance.now() + 145
  } else {
    if (!deck.playing) return
    const ticksPerRev = state.midi?.settings.ticksPerRev[id] || 128
    const sensitivity = state.midi?.settings.sensitivity || 1
    deck.nudgeOffset = clamp(deck.nudgeOffset + delta * 0.0024 * sensitivity, -0.14, 0.14)
    deck.nudgeUntil = performance.now() + 95
    deck.audio.nudge(deck.nudgeOffset)
    deck.platterAngle += (delta / ticksPerRev) * 360
  }
  updateDeckUI(id)
}

function processJogFrame(deck, now) {
  if (deck.pendingJog !== 0) {
    const ticksPerRev = state.midi?.settings.ticksPerRev[deck.id] || 128
    const sensitivity = state.midi?.settings.sensitivity || 1
    const secondsPerTick = (1.8 / ticksPerRev) * sensitivity
    const dt = clamp((now - (deck.lastJogFrame || now - 16)) / 1000, 0.008, 0.06)
    deck.lastJogFrame = now
    const instant = (deck.pendingJog * secondsPerTick) / dt
    deck.pendingJog = 0
    deck.scratchRate = deck.scratchRate * 0.28 + instant * 0.72
    deck.lastTickAt = now
    deck.audio.scratchRate(clamp(deck.scratchRate, -9, 9), 0.011)
  }
  if (deck.scratchActive) {
    if (now - deck.lastTickAt > 52 && Math.abs(deck.scratchRate) > 0.001) {
      deck.scratchRate = 0
      deck.audio.scratchRate(0, 0.02)
    }
    if (deck.autoScratch && !deck.touching && now > deck.autoReleaseAt) {
      endScratch(deck)
    }
  }
  if (deck.nudgeUntil && now > deck.nudgeUntil) {
    deck.nudgeUntil = 0
    deck.nudgeOffset = 0
    deck.audio.endNudge()
    updateDeckUI(deck.id)
  }
}

/* ---------------- library ---------------- */
function renderLibrary() {
  const query = state.search.trim().toLowerCase()
  const visible = state.tracks.filter((track) => {
    if (state.filter === 'demo' && track.source !== 'demo') return false
    if (state.filter === 'file' && track.source !== 'file') return false
    if (!query) return true
    return `${track.title} ${track.artist} ${track.key} ${track.tag}`.toLowerCase().includes(query)
  })
  ui.libraryCount.textContent = `${state.tracks.length} TRACK${state.tracks.length === 1 ? '' : 'S'}`
  ui.trackRows.innerHTML = ''
  const loaded = { A: state.decks.A?.track?.id, B: state.decks.B?.track?.id }

  if (!visible.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-row'
    empty.textContent = state.filter === 'file' && !state.tracks.some((t) => t.source === 'file')
      ? 'NO MP3S YET — IMPORT OR DROP FILES TO BEGIN'
      : 'NO TRACKS MATCH THIS SEARCH'
    ui.trackRows.appendChild(empty)
    return
  }

  visible.forEach((track, index) => {
    const row = document.createElement('div')
    row.className = 'track-row'
    row.dataset.id = track.id
    row.setAttribute('role', 'listitem')
    const safeId = escapeHtml(track.id)
    const safeTitle = escapeHtml(track.title)
    const safeTag = escapeHtml(track.tag || (track.source === 'file' ? 'MP3' : 'DEMO'))
    if (loaded.A === track.id) row.classList.add('is-loaded-a')
    if (loaded.B === track.id) row.classList.add('is-loaded-b')
    row.innerHTML = `
      <span class="col-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="col-title">
        <span class="row-cover" style="--cover-a:${track.color};--cover-b:${track.color2}"><span>${initials(track.title)}</span></span>
        <span class="row-title"><b></b><small></small></span>
        <span class="row-tag">${safeTag}</span>
      </span>
      <span class="col-bpm">${track.bpm ? track.bpm.toFixed(1) : '—'}</span>
      <span class="col-key">${track.key || '—'}</span>
      <span class="col-time">${formatTime(track.duration)}</span>
      <span class="col-actions">
        <button class="load-btn load-a" data-load="A" data-id="${safeId}" aria-label="Load ${safeTitle} to deck A">A</button>
        <button class="load-btn load-b" data-load="B" data-id="${safeId}" aria-label="Load ${safeTitle} to deck B">B</button>
      </span>
    `
    $('.row-title b', row).textContent = track.title
    $('.row-title small', row).textContent = track.artist || 'Local file'
    ui.trackRows.appendChild(row)
  })
}

function loadTrackById(id, deckId) {
  const track = state.tracks.find((item) => item.id === id)
  if (!track) return
  setDeckTrack(deckId, track)
  toast(`${track.title} loaded to Deck ${deckId}`, 'accent')
}

function setImportState(text) {
  ui.importState.textContent = text
  if (!text) return
  clearTimeout(setImportState.timer)
  setImportState.timer = setTimeout(() => {
    ui.importState.textContent = ''
  }, 4500)
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => {
    return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name)
  })
  if (!files.length) {
    toast('No audio files found in that drop', 'warn')
    return
  }
  let firstTrack = null
  for (const file of files) {
    setImportState(`DECODING ${file.name.toUpperCase()}`)
    try {
      const buffer = await state.audio.decodeFile(file)
      await sleep(20)
      const peaks = computePeaks(buffer, 4096)
      let bpm = 0
      let confidence = 0
      try {
        const result = estimateBpm(buffer)
        // Only surface a tempo when the autocorrelation is convincing; a random
        // reading on spoken word or silence is worse than no reading at all.
        confidence = result.confidence
        bpm = confidence > 0.2 ? result.bpm : 0
      } catch {
        /* analysis is best effort */
      }
      const title = file.name.replace(/\.[^.]+$/, '')
      const [color, color2] = colorForName(file.name)
      const track = {
        id: `file:${file.name}:${file.size}:${file.lastModified}`,
        title,
        artist: 'Local MP3',
        bpm,
        key: '—',
        tag: confidence > 0.2 ? 'MP3 · ANALYSED' : 'MP3',
        color,
        color2,
        duration: buffer.duration,
        buffer,
        peaks,
        source: 'file'
      }
      const existing = state.tracks.findIndex((item) => item.id === track.id)
      if (existing >= 0) state.tracks.splice(existing, 1, track)
      else state.tracks.push(track)
      if (!firstTrack) firstTrack = track
    } catch (error) {
      console.error(error)
      toast(`Could not decode ${file.name}`, 'error')
    }
  }
  setImportState('')
  renderLibrary()
  if (firstTrack) {
    toast(`Imported ${files.length} track${files.length === 1 ? '' : 's'} · BPM ${firstTrack.bpm ? firstTrack.bpm.toFixed(1) : '—'}`, 'accent')
    if (!state.decks.A.playing) setDeckTrack('A', firstTrack)
  }
}

/* ---------------- waveforms ---------------- */
function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, width, height }
}

function drawOverview(deck, canvas) {
  const { ctx, width, height } = fitCanvas(canvas)
  ctx.clearRect(0, 0, width, height)
  const track = deck.track
  if (!track) {
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    ctx.font = '600 8px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('NO TRACK LOADED', width / 2, height / 2 + 3)
    return
  }
  const peaks = track.peaks
  const position = deck.audio.getPosition()
  const progress = clamp(position / Math.max(0.001, track.duration), 0, 1)
  const mid = height / 2

  const drawBars = (color, start, end, alpha) => {
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    const step = 2
    for (let x = start; x < end; x += step) {
      const index = clamp(Math.floor((x / width) * peaks.buckets), 0, peaks.buckets - 1)
      const peak = Math.max(peaks.left[index], peaks.right[index])
      const barHeight = Math.max(1, peak * (height - 4))
      ctx.fillRect(x, mid - barHeight / 2, 1.2, barHeight)
    }
    ctx.globalAlpha = 1
  }

  drawBars('rgba(255,255,255,.16)', 0, width, 1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width * progress, height)
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, track.color)
  gradient.addColorStop(1, track.color2)
  drawBars(gradient, 0, width, 0.95)
  ctx.restore()

  if (deck.loop && deck.loopEnd > deck.loopStart) {
    const x1 = (deck.loopStart / track.duration) * width
    const x2 = (deck.loopEnd / track.duration) * width
    ctx.fillStyle = 'rgba(255,255,255,.11)'
    ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height)
    ctx.fillStyle = 'rgba(255,255,255,.4)'
    ctx.fillRect(x1, 0, 1, height)
    ctx.fillRect(x2, 0, 1, height)
  }

  deck.cues.forEach((cue, index) => {
    if (cue === null) return
    const x = (cue / track.duration) * width
    ctx.fillStyle = 'rgba(255,255,255,.5)'
    ctx.fillRect(x, 0, 1, height)
    ctx.fillStyle = track.color2
    ctx.beginPath()
    ctx.moveTo(x - 3, 0)
    ctx.lineTo(x + 3, 0)
    ctx.lineTo(x, 4)
    ctx.closePath()
    ctx.fill()
  })

  const cueX = (deck.cue / track.duration) * width
  ctx.fillStyle = 'rgba(255,255,255,.28)'
  ctx.fillRect(cueX, 0, 1, height)

  const x = progress * width
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = track.color2
  ctx.shadowBlur = 7
  ctx.fillRect(x, 0, 1.2, height)
  ctx.shadowBlur = 0
}

function drawZoom(deck, canvas) {
  const { ctx, width, height } = fitCanvas(canvas)
  ctx.clearRect(0, 0, width, height)
  const track = deck.track
  if (!track) {
    ctx.fillStyle = 'rgba(255,255,255,.11)'
    ctx.font = '600 8px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('LOAD A TRACK TO SCRATCH', width / 2, height / 2 + 3)
    return
  }
  const windowSeconds = 8
  const position = deck.audio.getPosition()
  const start = position - windowSeconds * 0.28
  const mid = height / 2
  const bpm = track.bpm || 120
  const beat = 60 / bpm

  if (deck.loop && deck.loopEnd > deck.loopStart) {
    const x1 = ((deck.loopStart - start) / windowSeconds) * width
    const x2 = ((deck.loopEnd - start) / windowSeconds) * width
    if (x2 > 0 && x1 < width) {
      ctx.fillStyle = 'rgba(255,255,255,.06)'
      ctx.fillRect(x1, 0, x2 - x1, height)
    }
  }

  // beat grid
  const firstBeat = Math.floor(Math.max(0, start) / beat)
  const lastTime = start + windowSeconds
  for (let b = firstBeat; b * beat <= lastTime; b++) {
    const t = b * beat
    if (t < start || t > track.duration) continue
    const x = ((t - start) / windowSeconds) * width
    const isBar = b % 4 === 0
    ctx.fillStyle = isBar ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)'
    ctx.fillRect(x, 0, 1, height)
    if (isBar) {
      ctx.fillStyle = 'rgba(255,255,255,.18)'
      ctx.fillRect(x, 0, 1, 5)
    }
  }

  const grad = ctx.createLinearGradient(0, 0, width, 0)
  grad.addColorStop(0, track.color)
  grad.addColorStop(1, track.color2)
  const step = 1
  for (let x = 0; x < width; x += step) {
    const t = start + (x / width) * windowSeconds
    if (t < 0 || t >= track.duration) continue
    const index = clamp(Math.floor((t / track.duration) * track.peaks.buckets), 0, track.peaks.buckets - 1)
    const l = Math.pow(track.peaks.left[index], 0.82)
    const r = Math.pow(track.peaks.right[index], 0.82)
    const played = t <= position
    ctx.fillStyle = played ? grad : 'rgba(255,255,255,.13)'
    ctx.globalAlpha = played ? 0.96 : 0.72
    const lh = Math.max(0.6, l * (mid - 2))
    const rh = Math.max(0.6, r * (mid - 2))
    ctx.fillRect(x, mid - lh, 0.85, lh)
    ctx.fillRect(x, mid, 0.85, rh)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.fillRect(0, mid, width, 1)

  deck.cues.forEach((cue) => {
    if (cue === null) return
    const x = ((cue - start) / windowSeconds) * width
    if (x < 0 || x > width) return
    ctx.fillStyle = 'rgba(255,255,255,.62)'
    ctx.fillRect(x, 0, 1, height)
    ctx.fillStyle = track.color2
    ctx.beginPath()
    ctx.moveTo(x - 3, 0)
    ctx.lineTo(x + 3, 0)
    ctx.lineTo(x, 4)
    ctx.closePath()
    ctx.fill()
  })

  const cueX = ((deck.cue - start) / windowSeconds) * width
  if (cueX >= 0 && cueX <= width) {
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    ctx.fillRect(cueX, 0, 1, height)
  }

  const playheadX = width * 0.28
  const glow = ctx.createLinearGradient(playheadX - 22, 0, playheadX + 22, 0)
  glow.addColorStop(0, 'rgba(255,255,255,0)')
  glow.addColorStop(0.5, `${track.color2}33`)
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(playheadX - 22, 0, 44, height)
  ctx.fillStyle = '#fff'
  ctx.shadowColor = track.color2
  ctx.shadowBlur = 9
  ctx.fillRect(playheadX, 0, 1.4, height)
  ctx.shadowBlur = 0
  ctx.fillStyle = track.color2
  ctx.beginPath()
  ctx.moveTo(playheadX - 4, 0)
  ctx.lineTo(playheadX + 4, 0)
  ctx.lineTo(playheadX, 6)
  ctx.closePath()
  ctx.fill()
}

function drawDeckWaveform(id) {
  const deck = state.decks[id]
  const refs = ui.deck[id]
  if (!deck || !refs) return
  drawOverview(deck, refs.overview)
  drawZoom(deck, refs.zoom)
}

/* ---------------- MIDI ---------------- */
function updateMidiStatus(info) {
  if (!info) return
  const partyMixLive = Boolean(info.enabled && info.devices.some(isPartyMixLiveDevice))
  $('#partyMixGuide').hidden = !partyMixLive
  const connected = Boolean((info.enabled && info.devices.length) || info.virtualEnabled)
  ui.midiStatus.classList.toggle('is-live', connected)
  ui.midiDot.className = `status-chip__dot${connected ? ' is-live' : info.error ? ' is-error' : ''}`
  const text = state.midi ? state.midi.getStatusText() : 'MIDI NOT CONNECTED'
  ui.midiStatusText.textContent = text
  ui.midiStatus.title = info.error || text
  ui.enableMidi.textContent = info.enabled ? 'RESCAN DEVICES' : 'ENABLE MIDI'

  if (!info.supported) {
    ui.midiDeviceName.textContent = 'Web MIDI is not available'
    ui.midiDeviceDetail.textContent = 'Use Chrome or Edge on desktop over HTTPS or localhost.'
  } else if (info.error) {
    ui.midiDeviceName.textContent = 'MIDI access blocked'
    ui.midiDeviceDetail.textContent = info.error
  } else if (info.enabled && info.devices.length) {
    ui.midiDeviceName.textContent = info.devices.map((device) => device.name || device.manufacturer || 'MIDI input').join(' · ')
    ui.midiDeviceDetail.textContent = `${partyMixLive ? 'Party Mix Live detected · ' : ''}${info.devices.length} input${info.devices.length === 1 ? '' : 's'} detected · map controls before use${info.virtualEnabled ? ' · virtual controller active' : ''}`
  } else if (info.enabled) {
    $('#partyMixGuide').hidden = true
    ui.midiDeviceName.textContent = 'No MIDI inputs found'
    ui.midiDeviceDetail.textContent = 'Plug in a class-compliant controller, then press RESCAN. You can also use the virtual controller.'
  } else {
    ui.midiDeviceName.textContent = 'MIDI access not enabled'
    ui.midiDeviceDetail.textContent = 'Connect a controller and press ENABLE MIDI. Web MIDI requires a secure context.'
  }
  ui.virtualToggle.classList.toggle('is-active', Boolean(info.virtualEnabled))
}

function appendMonitor(entry) {
  if (!ui.monitorLog) return
  const empty = $('.monitor__empty', ui.monitorLog)
  if (empty) empty.remove()
  const line = document.createElement('div')
  const typeClass = entry.message.type.startsWith('note')
    ? 'is-note'
    : entry.message.type === 'pitchbend'
      ? 'is-pb'
      : entry.message.type === 'cc'
        ? 'is-cc'
        : ''
  line.className = `monitor-line ${typeClass}`
  const time = new Date(entry.time).toLocaleTimeString([], { hour12: false })
  const delta = entry.delta !== null && entry.delta !== undefined ? `Δ ${entry.delta > 0 ? '+' : ''}${entry.delta}` : ''
  line.innerHTML = `<span class="time">${time}</span><span class="src"></span><span class="msg"></span><span class="delta"></span>`
  $('.src', line).textContent = entry.source
  $('.msg', line).textContent = entry.text
  $('.delta', line).textContent = delta
  ui.monitorLog.appendChild(line)
  while (ui.monitorLog.children.length > 80) ui.monitorLog.firstElementChild.remove()
  ui.monitorLog.scrollTop = ui.monitorLog.scrollHeight
}

function handleMidiControl(targetId, payload) {
  const [group, name] = targetId.split('.')
  if (group === 'mixer') {
    if (name === 'crossfader') {
      setCrossfaderValue(payload.value)
    } else if (name === 'master') {
      setMasterVolume(payload.unit)
    }
    return
  }
  const id = group === 'deckA' ? 'A' : 'B'
  const deck = state.decks[id]
  if (!deck) return

  if (name === 'jog') {
    handleJog(id, payload.delta, payload.sourceKind === 'virtual' ? 'virtual' : 'midi')
    return
  }
  if (name === 'touch') {
    setTouch(id, Boolean(payload.pressed))
    return
  }
  if (name === 'tempo') {
    setPitch(id, 1 + (payload.pitch || 0))
    return
  }
  if (name === 'volume') {
    setChannelVolume(id, payload.unit)
    return
  }
  if (name === 'filter') {
    state.knobs[`filter${id}`]?.setValue(payload.unit)
    return
  }
  if (name === 'eqHigh' || name === 'eqMid' || name === 'eqLow') {
    state.knobs[`${name}${id}`]?.setValue(payload.unit * 2 - 1)
    return
  }
  if (name.startsWith('pad')) {
    if (payload.pressed) {
      const index = Number(name.slice(3)) - 1
      if (index >= 0 && index < 4) padAction(id, index)
    }
    return
  }
  if (!payload.pressed) return
  if (name === 'play') {
    togglePlay(id).catch(() => {})
  } else if (name === 'cue') {
    cueDeck(id)
  } else if (name === 'sync') {
    syncDeck(id)
  }
}

function setupMidi() {
  state.midi = new MidiManager({
    onControl: handleMidiControl,
    onDevices: updateMidiStatus,
    onMonitor: appendMonitor,
    onLearn: (target) => {
      state.learningTarget = target
      refreshMappingUI()
      if (target) toast('MIDI learn armed — move a control', 'accent', 1800)
    },
    onNotice: (text) => toast(text),
    onSettings: () => refreshSettingsUI()
  })
  buildMappingUI()
  refreshSettingsUI()
  refreshMappingUI()
  updateMidiStatus({ supported: state.midi.supported, enabled: false, error: '', devices: [] })

  document.addEventListener('click', (event) => {
    const bind = event.target.closest('[data-bind]')
    if (bind) {
      const target = bind.dataset.bind
      if (state.learningTarget === target) state.midi.cancelLearn()
      else state.midi.startLearn(target)
      return
    }
    const clear = event.target.closest('[data-clear]')
    if (clear) {
      state.midi.clearBinding(clear.dataset.clear)
      refreshMappingUI()
    }
  })

  $$('select[data-setting]').forEach((select) => {
    select.addEventListener('change', () => {
      const key = select.dataset.setting
      const deck = select.dataset.deck
      state.midi.updateSetting(deck ? `${key}.${deck}` : key, select.value)
      refreshCapability()
    })
  })

  ui.sensitivityRange.addEventListener('input', () => {
    const value = Number(ui.sensitivityRange.value)
    state.midi.settings.sensitivity = value
    ui.sensitivityOut.textContent = `${value.toFixed(2)}×`
  })
  ui.sensitivityRange.addEventListener('change', () => state.midi.save())

  ui.enableMidi.addEventListener('click', async () => {
    const ok = await state.midi.enable()
    if (ok) toast('MIDI devices scanned', 'accent')
  })

  setTimeout(() => {
    if (state.midi && !state.midi.access && state.midi.supported) {
      state.midi.enable()
    }
  }, 900)
}

/* ---------------- auto-map wizard ---------------- */
function bindingFromMessage(message) {
  if (message.type === 'cc') return { type: 'cc', channel: message.channel, number: message.controller }
  if (message.type === 'noteon' || message.type === 'noteoff') return { type: 'note', channel: message.channel, number: message.note }
  if (message.type === 'pitchbend') return { type: 'pitchbend', channel: message.channel, number: 0 }
  return null
}

function setupWizard() {
  const progress = $('#wizardProgress')
  for (let i = 0; i < 7; i++) progress.appendChild(document.createElement('i'))
  $('#autoMapOpen').addEventListener('click', () => {
    $('#midiOverlay').hidden = true
    ui.wizardOverlay.hidden = false
    state.midi.cancelLearn()
    // Start listening immediately. Requesting MIDI permission can stay pending
    // while the browser prompt is open, but messages (and the virtual controller)
    // should still be capturable.
    Promise.resolve(state.midi.enable()).catch(() => {})
    runWizard()
  })
  $('#wizardClose').addEventListener('click', closeWizard)
  $('#wizardSkip').addEventListener('click', () => state.midi?.cancelCapture())
}

function closeWizard() {
  state.wizardRun++
  state.midi?.cancelCapture()
  ui.wizardOverlay.hidden = true
  refreshMappingUI()
}

function setWizardStep(number, title, text, signal) {
  const total = 7
  $('#wizardStepNo').textContent = `STEP ${number} / ${total}`
  $('#wizardTitle').textContent = title
  $('#wizardText').textContent = text
  $('#wizardSignalText').textContent = signal
  $('#wizardSignal').hidden = false
  $('#wizardCaptured').hidden = true
  $('#wizardSkip').hidden = false
  $('#wizardNext').hidden = true
  $$('#wizardProgress i').forEach((dot, index) => {
    dot.classList.toggle('is-done', index < number - 1)
    dot.classList.toggle('is-now', index === number - 1)
  })
}

function showWizardCapture(text) {
  $('#wizardSignal').hidden = true
  $('#wizardCaptured').hidden = false
  $('#wizardCapturedText').textContent = text
}

async function wizardCapture(predicate, timeout) {
  try {
    return await state.midi.captureNext(predicate, { timeout })
  } catch {
    return null
  }
}

async function runWizard() {
  const token = ++state.wizardRun
  if (!state.midi.supported) {
    toast('Web MIDI is unavailable in this browser', 'warn')
    return
  }
  try {
    setWizardStep(1, "Rotate Deck A's jog", 'Move Deck A\'s jog wheel forward and back. The first CC control that moves will be captured.', 'Waiting for a jog CC message…')
    let captured = await wizardCapture((message) => message.type === 'cc', 25000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckA.jog', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture(`Jog captured · ${captured.text}`)
    } else showWizardCapture('No jog signal — skipped')
    refreshMappingUI()
    await sleep(650)
    if (token !== state.wizardRun) return

    setWizardStep(2, 'Touch Deck A platter', 'Touch the top of Deck A\'s platter once. This identifies a capacitive (touch-sensitive) jog wheel. No touch sensor? Tap SKIP.', 'Waiting for a touch note…')
    captured = await wizardCapture((message) => message.type === 'noteon' && message.velocity > 0, 7000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckA.touch', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture('Capacitive platter detected')
    } else {
      state.midi.setBinding('deckA.touch', null, { silent: true })
      showWizardCapture('No touch sensor — Deck A will auto-grab')
    }
    refreshMappingUI()
    await sleep(750)
    if (token !== state.wizardRun) return

    setWizardStep(3, "Rotate Deck B's jog", 'Move Deck B\'s jog wheel forward and back.', 'Waiting for a jog CC message…')
    captured = await wizardCapture((message) => message.type === 'cc', 25000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckB.jog', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture(`Jog captured · ${captured.text}`)
    } else showWizardCapture('No jog signal — skipped')
    refreshMappingUI()
    await sleep(650)
    if (token !== state.wizardRun) return

    setWizardStep(4, 'Touch Deck B platter', 'Touch Deck B\'s platter top once, or tap SKIP if it has no sensor.', 'Waiting for a touch note…')
    captured = await wizardCapture((message) => message.type === 'noteon' && message.velocity > 0, 7000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckB.touch', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture('Capacitive platter detected')
    } else {
      state.midi.setBinding('deckB.touch', null, { silent: true })
      showWizardCapture('No touch sensor — Deck B will auto-grab')
    }
    refreshMappingUI()
    await sleep(750)
    if (token !== state.wizardRun) return

    setWizardStep(5, 'Move the crossfader', 'Slide the crossfader from one side to the other.', 'Waiting for a crossfader CC…')
    captured = await wizardCapture((message) => message.type === 'cc', 20000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('mixer.crossfader', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture(`Crossfader captured · ${captured.text}`)
    } else showWizardCapture('No crossfader signal — skipped')
    refreshMappingUI()
    await sleep(650)
    if (token !== state.wizardRun) return

    setWizardStep(6, 'Press Play on Deck A', 'Press the physical Play button for Deck A.', 'Waiting for a note message…')
    captured = await wizardCapture((message) => message.type === 'noteon' && message.velocity > 0, 12000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckA.play', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture(`Play A captured · ${captured.text}`)
    } else showWizardCapture('Play A skipped')
    refreshMappingUI()
    await sleep(650)
    if (token !== state.wizardRun) return

    setWizardStep(7, 'Press Play on Deck B', 'Press the physical Play button for Deck B.', 'Waiting for a note message…')
    captured = await wizardCapture((message) => message.type === 'noteon' && message.velocity > 0, 12000)
    if (token !== state.wizardRun) return
    if (captured) {
      state.midi.setBinding('deckB.play', bindingFromMessage(captured.message), { silent: true })
      showWizardCapture(`Play B captured · ${captured.text}`)
    } else showWizardCapture('Play B skipped')

    refreshMappingUI()
    state.midi.save()
    $('#wizardStepNo').textContent = 'MAPPING COMPLETE'
    $('#wizardTitle').textContent = 'Your booth is wired up'
    $('#wizardText').textContent = 'Jogs and touch sensors are mapped. The platter engine has already switched each deck to capacitive or relative mode. Use MIDI Setup to map EQ, tempo, pads and filters.'
    $('#wizardSignal').hidden = true
    $('#wizardCaptured').hidden = false
    $('#wizardCapturedText').textContent = 'Mapping saved to this browser'
    $('#wizardSkip').hidden = true
    const next = $('#wizardNext')
    next.hidden = false
    next.textContent = 'DONE'
    next.onclick = closeWizard
    toast('Auto-map complete', 'accent')
    refreshCapability()
  } catch (error) {
    if (token !== state.wizardRun) return
    console.error(error)
    toast('Auto-map stopped — no MIDI signal', 'warn')
  }
}

/* ---------------- virtual controller ---------------- */
function setVirtualController(enabled) {
  state.midi.setVirtualEnabled(enabled)
  ui.virtualDock.hidden = !enabled
  ui.virtualToggle.classList.toggle('is-active', enabled)
  if (enabled) toast('Virtual MIDI controller online', 'accent')
}

function setupVirtualController() {
  const touchState = { A: false, B: false }
  const timers = new Map()

  const send = (bytes) => state.midi.sendVirtual(bytes)

  $$('[data-vjog]').forEach((button) => {
    const id = button.dataset.vjog
    const dir = Number(button.dataset.dir)
    const start = (event) => {
      event.preventDefault()
      if (!state.midi.virtualEnabled) setVirtualController(true)
      button.classList.add('is-held')
      try { button.setPointerCapture(event.pointerId) } catch { /* ignore */ }
      const controller = id === 'A' ? 100 : 101
      const value = dir > 0 ? 2 : 126
      const tick = () => send([0xbf, controller, value])
      tick()
      if (timers.has(button)) clearInterval(timers.get(button))
      timers.set(button, setInterval(tick, 18))
    }
    const stop = () => {
      button.classList.remove('is-held')
      if (timers.has(button)) {
        clearInterval(timers.get(button))
        timers.delete(button)
      }
    }
    button.addEventListener('pointerdown', start)
    button.addEventListener('pointerup', stop)
    button.addEventListener('pointercancel', stop)
    button.addEventListener('pointerleave', stop)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
  })

  $$('[data-vtouch]').forEach((button) => {
    const id = button.dataset.vtouch
    button.addEventListener('click', () => {
      if (!state.midi.virtualEnabled) setVirtualController(true)
      touchState[id] = !touchState[id]
      button.classList.toggle('is-on', touchState[id])
      const note = id === 'A' ? 60 : 61
      send(touchState[id] ? [0x9f, note, 127] : [0x8f, note, 0])
    })
  })

  $$('[data-vplay]').forEach((button) => {
    const id = button.dataset.vplay
    button.addEventListener('click', () => {
      if (!state.midi.virtualEnabled) setVirtualController(true)
      const note = id === 'A' ? 70 : 71
      send([0x9f, note, 100])
      setTimeout(() => send([0x8f, note, 0]), 45)
    })
  })

  ui.virtualCross.addEventListener('input', () => {
    if (!state.midi.virtualEnabled) setVirtualController(true)
    send([0xbf, 7, Number(ui.virtualCross.value)])
  })

  $('#virtualToggle').addEventListener('click', () => setVirtualController(!state.midi.virtualEnabled))
  $('#virtualClose').addEventListener('click', () => setVirtualController(false))
  $('#virtualDock').addEventListener('contextmenu', (event) => event.preventDefault())
}

/* ---------------- UI wiring ---------------- */
let clearArmed = false
let clearTimer = null

function bindPlatter(id) {
  const refs = ui.deck[id]
  let drag = null

  const angleAt = (event) => {
    const rect = refs.platter.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    return (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI
  }

  refs.platter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    ensureAudio()
    try { refs.platter.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    drag = { angle: angleAt(event) }
    refs.platter.classList.add('grabbed')
    refs.platter.classList.add('is-touch')
    setTouch(id, true)
  })

  refs.platter.addEventListener('pointermove', (event) => {
    if (!drag) return
    const angle = angleAt(event)
    let delta = angle - drag.angle
    while (delta > 180) delta -= 360
    while (delta < -180) delta += 360
    drag.angle = angle
    const ticksPerRev = state.midi?.settings.ticksPerRev[id] || 128
    handleJog(id, (delta / 360) * ticksPerRev, 'pointer')
  })

  const release = () => {
    if (!drag) return
    drag = null
    refs.platter.classList.remove('grabbed')
    refs.platter.classList.remove('is-touch')
    setTouch(id, false)
  }
  refs.platter.addEventListener('pointerup', release)
  refs.platter.addEventListener('pointercancel', release)
  refs.platter.addEventListener('lostpointercapture', release)
  refs.platter.addEventListener('contextmenu', (event) => event.preventDefault())

  refs.platter.addEventListener('wheel', (event) => {
    event.preventDefault()
    ensureAudio()
    handleJog(id, event.deltaY > 0 ? -2 : 2, 'wheel')
  }, { passive: false })

  refs.platter.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    if (!event.repeat) setTouch(id, true)
    handleJog(id, event.key === 'ArrowRight' ? 4 : -4, 'keyboard')
  })
  refs.platter.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setTouch(id, false)
  })
}

function setupUI() {
  for (const id of ['A', 'B']) {
    const refs = ui.deck[id]
    refs.play.addEventListener('click', () => {
      togglePlay(id).catch((error) => console.error(error))
    })
    refs.cue.addEventListener('click', () => cueDeck(id))
    refs.cue.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      const deck = state.decks[id]
      if (!deck.track) return
      deck.cue = deck.audio.getPosition()
      drawDeckWaveform(id)
      toast(`Cue set at ${formatTime(deck.cue)}`, 'accent')
    })
    refs.sync.addEventListener('click', () => syncDeck(id))
    refs.loop.addEventListener('click', () => toggleLoop(id))
    refs.tempo.addEventListener('input', () => {
      setPitch(id, 1 + Number(refs.tempo.value) / 100)
    })
    refs.padButtons.forEach((button, index) => {
      button.addEventListener('click', (event) => padAction(id, index, { forceSet: event.shiftKey }))
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        clearPad(id, index)
      })
    })
    refs.load.addEventListener('click', () => {
      ui.searchInput.focus()
      $('#library').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      toast('Pick a track and tap A or B in the library')
    })
    bindPlatter(id)
  }

  for (const id of ['A', 'B']) {
    $(`#vol${id}`).addEventListener('input', (event) => {
      setChannelVolume(id, Number(event.target.value))
    })
    $(`#echo${id}`).addEventListener('click', () => toggleEcho(id))
  }

  ui.crossfader.addEventListener('input', () => setCrossfaderValue(Number(ui.crossfader.value)))

  ui.searchInput.addEventListener('input', () => {
    state.search = ui.searchInput.value
    renderLibrary()
  })
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.remove('is-active'))
      tab.classList.add('is-active')
      state.filter = tab.dataset.tab
      renderLibrary()
    })
  })

  $('#importBtn').addEventListener('click', () => ui.fileInput.click())
  ui.fileInput.addEventListener('change', async () => {
    await importFiles(ui.fileInput.files)
    ui.fileInput.value = ''
  })

  ui.trackRows.addEventListener('click', (event) => {
    const loadButton = event.target.closest('[data-load]')
    if (loadButton) {
      loadTrackById(loadButton.dataset.id, loadButton.dataset.load)
    }
  })
  ui.trackRows.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.track-row[data-id]')
    if (!row) return
    loadTrackById(row.dataset.id, state.decks.A.playing ? 'B' : 'A')
  })

  let dragDepth = 0
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth++
    ui.dropZone.hidden = false
  })
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
  })
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (!dragDepth) ui.dropZone.hidden = true
  })
  window.addEventListener('drop', async (event) => {
    event.preventDefault()
    dragDepth = 0
    ui.dropZone.hidden = true
    if (event.dataTransfer?.files?.length) await importFiles(event.dataTransfer.files)
  })

  $('#midiOpen').addEventListener('click', () => {
    ui.midiOverlay.hidden = false
    state.midi?.enable()
  })
  ui.midiStatus.addEventListener('click', () => {
    ui.midiOverlay.hidden = false
    state.midi?.enable()
  })
  $('#helpOpen').addEventListener('click', () => {
    ui.helpOverlay.hidden = false
  })
  ui.audioChip.addEventListener('click', () => ensureAudio())

  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const overlay = $(`#${button.dataset.close}`)
      if (overlay) overlay.hidden = true
    })
  })
  ;[ui.midiOverlay, ui.helpOverlay].forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.hidden = true
    })
  })

  $('#clearMonitor').addEventListener('click', () => {
    ui.monitorLog.innerHTML = '<div class="monitor__empty">Waiting for MIDI messages… move a control, or open the virtual controller.</div>'
  })

  const clearButton = $('#clearAllMappings')
  clearButton.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true
      clearButton.textContent = 'CONFIRM CLEAR ALL'
      clearTimeout(clearTimer)
      clearTimer = setTimeout(() => {
        clearArmed = false
        clearButton.textContent = 'CLEAR ALL MAPPINGS'
      }, 3200)
      return
    }
    clearArmed = false
    clearTimeout(clearTimer)
    clearButton.textContent = 'CLEAR ALL MAPPINGS'
    state.midi.clearAll()
    refreshMappingUI()
    toast('All mappings cleared', 'warn')
  })

  $('#brandHome').addEventListener('click', (event) => event.preventDefault())

  // Any first gesture unlocks the audio context; the browser requires it.
  const unlock = () => ensureAudio()
  window.addEventListener('pointerdown', unlock, { passive: true, once: true })
  window.addEventListener('keydown', unlock, { once: true })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!ui.wizardOverlay.hidden) closeWizard()
      else if (!ui.midiOverlay.hidden) ui.midiOverlay.hidden = true
      else if (!ui.helpOverlay.hidden) ui.helpOverlay.hidden = true
      state.midi?.cancelLearn()
    }
  })
}

function setupKeyboard() {
  const scratchKeys = {
    KeyQ: ['A', -1],
    KeyE: ['A', 1],
    KeyO: ['B', -1],
    KeyP: ['B', 1]
  }
  const isTyping = (target) => {
    if (!target) return false
    return ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.isContentEditable
  }

  window.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
    if (scratchKeys[event.code]) {
      event.preventDefault()
      const [id, dir] = scratchKeys[event.code]
      if (event.repeat) return
      state.keyScratch[id].dir = dir
      state.keyScratch[id].last = 0
      setTouch(id, true)
      return
    }
    if (event.code === 'Space' || event.code === 'KeyA' || event.code === 'KeyL') {
      event.preventDefault()
      togglePlay(event.code === 'KeyL' ? 'B' : 'A').catch(() => {})
    } else if (event.code === 'KeyS') {
      event.preventDefault()
      cueDeck('A')
    } else if (event.code === 'Semicolon') {
      event.preventDefault()
      cueDeck('B')
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault()
      const step = event.shiftKey ? 0.22 : 0.08
      setCrossfaderValue(state.crossfader + (event.code === 'ArrowRight' ? step : -step))
    }
  })

  window.addEventListener('keyup', (event) => {
    if (!scratchKeys[event.code]) return
    const [id] = scratchKeys[event.code]
    state.keyScratch[id].dir = 0
    setTouch(id, false)
  })
}

/* ---------------- animation loop ---------------- */
let lastFrame = typeof performance !== 'undefined' ? performance.now() : Date.now()
let lastSessionTick = 0

function animate(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.06)
  lastFrame = now
  if (state.booted) {
    for (const id of ['A', 'B']) {
      const deck = state.decks[id]
      const refs = ui.deck[id]
      processJogFrame(deck, now)

      const key = state.keyScratch[id]
      if (key.dir && now - key.last > 25) {
        key.last = now
        handleJog(id, key.dir * 1.35, 'keyboard')
      }

      const rate = deck.audio.getRate()
      deck.platterAngle = (deck.platterAngle + rate * dt * 200) % 360
      refs.platterSpin.style.transform = `rotate(${deck.platterAngle.toFixed(2)}deg)`

      const level = deck.audio.getLevel()
      const vu = $(`#vu${id}`)
      const peak = $(`#vuPeak${id}`)
      vu.style.height = `${level * 100}%`
      peak.style.bottom = `${level * 100}%`
      peak.style.opacity = level > 0.018 ? '0.75' : '0'

      if (now - state.lastUiTick > 78) {
        const position = deck.track ? deck.audio.getPosition() : 0
        const duration = deck.track ? deck.audio.duration : 0
        refs.time.textContent = formatTime(position)
        refs.remain.textContent = `−${formatTime(Math.max(0, duration - position))}`
        refs.remainClock.textContent = `−${formatTime(Math.max(0, duration - position))}`
        refs.platter.setAttribute('aria-valuenow', String(duration ? Math.round((position / duration) * 100) : 0))
      }
    }

    if (now - state.lastUiTick > 78) {
      state.lastUiTick = now
      updateSessionClock()
    }
    if (now - state.lastWaveTick > 38) {
      state.lastWaveTick = now
      drawDeckWaveform('A')
      drawDeckWaveform('B')
    }
  }
  requestAnimationFrame(animate)
}

/* ---------------- boot ---------------- */
async function init() {
  try {
    state.audio = new AudioEngine()
    await state.audio.init()
    state.audio.ctx.onstatechange = () => updateAudioChip(state.audio.ctx.state)
    updateAudioChip(state.audio.ctx.state)

    state.decks.A = createDeckState('A')
    state.decks.B = createDeckState('B')
    setupMixerKnobs()
    setupMidi()
    setupUI()
    setupVirtualController()
    setupWizard()
    setupKeyboard()
    setChannelVolume('A', 0.86)
    setChannelVolume('B', 0.86)
    setCrossfaderValue(0)
    setMasterVolume(0.78)

    ui.bootBar.style.width = '6%'
    const tracks = await buildDemoTracks(state.audio.ctx.sampleRate, (_spec, index) => {
      ui.bootBar.style.width = `${12 + index * 21}%`
    })
    state.tracks = tracks
    ui.bootBar.style.width = '94%'
    renderLibrary()
    setDeckTrack('A', tracks[0])
    setDeckTrack('B', tracks[1] || tracks[0])
    setPitch('A', 1)
    setPitch('B', 1)
    refreshMappingUI()
    refreshSettingsUI()
    updateAudioChip(state.audio.ctx.state)
    updateSessionClock()

    state.booted = true
    ui.bootBar.style.width = '100%'
    setTimeout(() => {
      ui.boot.classList.add('is-done')
      setTimeout(() => {
        ui.boot.hidden = true
      }, 420)
    }, 260)
    requestAnimationFrame(animate)
  } catch (error) {
    console.error(error)
    const sub = $('.boot__sub')
    if (sub) {
      sub.textContent = 'AUDIO ENGINE FAILED'
      sub.style.color = 'var(--danger)'
      const detail = document.createElement('div')
      detail.style.cssText = 'max-width:420px;text-align:center;font-size:10px;color:var(--muted);line-height:1.5;margin-top:4px'
      detail.textContent = error?.message || String(error)
      sub.after(detail)
    }
    ui.bootBar.style.width = '100%'
    ui.bootBar.style.background = 'var(--danger)'
  }
}

/* ---------------- debug / automation API ---------------- */
function snapshot() {
  const decks = {}
  for (const id of ['A', 'B']) {
    const deck = state.decks[id]
    if (!deck) continue
    decks[id] = {
      title: deck.track?.title || null,
      id: deck.track?.id || null,
      playing: deck.playing,
      position: deck.audio.getPosition(),
      duration: deck.audio.duration,
      rate: deck.audio.getRate(),
      pitch: deck.pitch,
      scratchActive: deck.scratchActive,
      touching: deck.touching,
      capacitive: state.midi?.hasTouch(id) || false,
      cues: deck.cues.slice(),
      loop: deck.loop
    }
  }
  return {
    booted: state.booted,
    audio: state.audio?.ctx.state || 'none',
    crossfader: state.crossfader,
    masterVolume: state.masterVolume,
    decks,
    tracks: state.tracks.map((track) => ({ id: track.id, title: track.title, bpm: track.bpm, source: track.source })),
    midi: {
      supported: state.midi?.supported || false,
      enabled: state.midi?.enabled || false,
      devices: state.midi?.devices || [],
      virtual: state.midi?.virtualEnabled || false,
      mappings: state.midi?.mapping || null
    }
  }
}

window.scratchlab = {
  get ready() { return state.booted },
  snapshot,
  loadDemo(deckId, index = 0) {
    const demos = state.tracks.filter((track) => track.source === 'demo')
    if (demos[index]) setDeckTrack(deckId, demos[index])
  },
  loadTrack,
  play: (id) => playDeck(id),
  pause: (id) => pauseDeck(id),
  toggle: (id) => togglePlay(id),
  cue: (id) => cueDeck(id),
  jog: (id, delta) => handleJog(id, delta, 'debug'),
  touch: (id, down) => setTouch(id, down),
  beginScratch: (id) => beginScratch(state.decks[id], false),
  endScratch: (id) => endScratch(state.decks[id]),
  setPitch: (id, pitch) => setPitch(id, pitch),
  setCrossfader: (value) => setCrossfaderValue(value),
  setChannelVolume,
  setMasterVolume,
  toggleLoop,
  pad: (id, index) => padAction(id, index),
  midiRaw: (bytes) => state.midi?.handleRaw(bytes, 'Debug MIDI', 'hardware'),
  sendVirtual: (bytes) => state.midi?.sendVirtual(bytes),
  bind: (targetId, binding) => {
    state.midi?.setBinding(targetId, binding)
    refreshMappingUI()
  },
  clearBinding: (targetId) => {
    state.midi?.clearBinding(targetId)
    refreshMappingUI()
  },
  enableMidi: () => state.midi?.enable(),
  get midi() { return state.midi },
  get audio() { return state.audio }
}

function loadTrack(trackId, deckId = 'A') {
  loadTrackById(trackId, deckId)
}

init()
