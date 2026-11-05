const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function now() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
}

/** One deck's audio graph and transport state. */
export class DeckAudio {
  constructor(ctx, destination, id) {
    this.ctx = ctx
    this.id = id
    this.duration = 0
    this.playing = false
    this.scratching = false
    this.pitch = 1
    this.position = 0
    this.rate = 0
    this.active = false
    this.gate = 0
    this.stateAt = now()
    this.onEnded = null
    this.levelData = null

    this.worklet = new AudioWorkletNode(ctx, 'deck-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })

    this.channel = ctx.createGain()
    this.channel.gain.value = 0.86

    this.eqLow = ctx.createBiquadFilter()
    this.eqLow.type = 'lowshelf'
    this.eqLow.frequency.value = 180
    this.eqLow.gain.value = 0

    this.eqMid = ctx.createBiquadFilter()
    this.eqMid.type = 'peaking'
    this.eqMid.frequency.value = 1100
    this.eqMid.Q.value = 0.9
    this.eqMid.gain.value = 0

    this.eqHigh = ctx.createBiquadFilter()
    this.eqHigh.type = 'highshelf'
    this.eqHigh.frequency.value = 4200
    this.eqHigh.gain.value = 0

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 22000
    this.filter.Q.value = 0.8

    this.crossfader = ctx.createGain()
    this.crossfader.gain.value = 0.707

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.65
    this.levelData = new Float32Array(this.analyser.fftSize)

    // Echo send: filter -> delay -> feedback loop + wet gain
    this.delay = ctx.createDelay(1.2)
    this.delay.delayTime.value = 0.36
    this.feedback = ctx.createGain()
    this.feedback.gain.value = 0.32
    this.wet = ctx.createGain()
    this.wet.gain.value = 0
    this.echoOn = false

    this.worklet
      .connect(this.channel)
      .connect(this.eqLow)
      .connect(this.eqMid)
      .connect(this.eqHigh)
      .connect(this.filter)
      .connect(this.crossfader)
      .connect(this.analyser)
      .connect(destination)

    this.filter.connect(this.delay)
    this.delay.connect(this.feedback)
    this.feedback.connect(this.delay)
    this.delay.connect(this.wet)
    this.wet.connect(this.crossfader)

    this.worklet.port.onmessage = (event) => {
      const data = event.data
      if (!data) return
      if (data.type === 'state') {
        this.position = data.position
        this.rate = data.rate
        this.active = data.active
        this.gate = data.gate
        this.stateAt = now()
      } else if (data.type === 'ended') {
        this.playing = false
        this.scratching = false
        this.active = false
        if (this.onEnded) this.onEnded()
      }
    }
  }

  load(track) {
    const buffer = track.buffer
    this.duration = track.duration || buffer.duration
    this.position = 0
    this.rate = 0
    this.active = false
    this.playing = false
    this.scratching = false
    this.stateAt = now()

    const copies = []
    const transfer = []
    for (let ch = 0; ch < 2; ch++) {
      const source = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1))
      const copy = new Float32Array(source.length)
      copy.set(source)
      copies.push(copy)
      transfer.push(copy.buffer)
    }
    this.worklet.port.postMessage(
      {
        type: 'load',
        channels: copies,
        length: copies[0].length,
        sourceRate: buffer.sampleRate
      },
      transfer
    )
    this.setEcho(this.echoOn, track.bpm)
  }

  play() {
    if (!this.duration) return
    this.playing = true
    this.scratching = false
    this.active = true
    this.worklet.port.postMessage({ type: 'play', position: this.getPosition() })
    this.worklet.port.postMessage({ type: 'rate', value: this.pitch, smooth: 0.025, active: true })
  }

  pause() {
    this.playing = false
    this.scratching = false
    this.active = false
    this.worklet.port.postMessage({ type: 'pause' })
  }

  seek(position) {
    const p = clamp(position, 0, Math.max(0, this.duration - 0.01))
    this.position = p
    this.stateAt = now()
    this.worklet.port.postMessage({ type: 'seek', position: p })
  }

  setPitch(pitch) {
    this.pitch = clamp(pitch, 0.5, 1.5)
    if (this.playing && !this.scratching) {
      this.worklet.port.postMessage({ type: 'rate', value: this.pitch, smooth: 0.04 })
    }
  }

  beginScratch() {
    this.scratching = true
    this.worklet.port.postMessage({ type: 'active', active: true })
    this.worklet.port.postMessage({ type: 'rate', value: 0, smooth: 0.012 })
  }

  scratchRate(rate, smooth = 0.012) {
    this.scratching = true
    this.worklet.port.postMessage({ type: 'rate', value: clamp(rate, -10, 10), smooth })
  }

  endScratch() {
    this.scratching = false
    if (this.playing) {
      this.worklet.port.postMessage({ type: 'rate', value: this.pitch, smooth: 0.11 })
      this.worklet.port.postMessage({ type: 'active', active: true })
    } else {
      this.worklet.port.postMessage({ type: 'rate', value: 0, smooth: 0.13 })
      setTimeout(() => {
        if (!this.playing && !this.scratching) {
          this.worklet.port.postMessage({ type: 'pause' })
        }
      }, 190)
    }
  }

  nudge(offset) {
    if (!this.playing) return
    this.worklet.port.postMessage({
      type: 'rate',
      value: clamp(this.pitch + offset, -3, 3),
      smooth: 0.015
    })
  }

  endNudge() {
    if (this.playing && !this.scratching) {
      this.worklet.port.postMessage({ type: 'rate', value: this.pitch, smooth: 0.085 })
    }
  }

  setLoop(enabled, start, end) {
    if (!enabled) {
      this.worklet.port.postMessage({ type: 'loop', enabled: false })
      return
    }
    this.worklet.port.postMessage({ type: 'loop', enabled: true, start: Math.max(0, start), end: Math.max(start + 0.05, end) })
  }

  setEQ(band, value) {
    const gain = clamp(value, -1, 1) * 12
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh
    node.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02)
  }

  setFilter(value) {
    const v = clamp(value, 0, 1)
    const t = this.ctx.currentTime
    if (v < 0.48) {
      this.filter.type = 'lowpass'
      const frequency = 110 * Math.pow(19000 / 110, v / 0.48)
      this.filter.frequency.setTargetAtTime(frequency, t, 0.02)
    } else if (v > 0.52) {
      this.filter.type = 'highpass'
      const frequency = 20 * Math.pow(9000 / 20, (v - 0.52) / 0.48)
      this.filter.frequency.setTargetAtTime(frequency, t, 0.02)
    } else {
      this.filter.type = 'lowpass'
      this.filter.frequency.setTargetAtTime(22000, t, 0.02)
    }
  }

  setChannelVolume(value) {
    const v = clamp(value, 0, 1)
    this.channel.gain.setTargetAtTime(Math.pow(v, 1.5), this.ctx.currentTime, 0.02)
  }

  setCrossfaderGain(gain) {
    this.crossfader.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015)
  }

  setEcho(enabled, bpm) {
    this.echoOn = Boolean(enabled)
    const beat = bpm > 0 ? 60 / bpm : 0.5
    this.delay.delayTime.setTargetAtTime(clamp(beat * 0.75, 0.05, 1.1), this.ctx.currentTime, 0.05)
    this.feedback.gain.setTargetAtTime(enabled ? 0.36 : 0.12, this.ctx.currentTime, 0.02)
    this.wet.gain.setTargetAtTime(enabled ? 0.3 : 0, this.ctx.currentTime, 0.03)
  }

  getPosition() {
    if (!this.duration) return 0
    const elapsed = Math.max(0, now() - this.stateAt)
    let position = this.position
    if (this.active && Math.abs(this.rate) > 0.0001) position += this.rate * elapsed
    return clamp(position, 0, this.duration)
  }

  getRate() {
    return this.rate
  }

  getLevel() {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.levelData)
    let sum = 0
    for (let i = 0; i < this.levelData.length; i += 2) {
      const sample = this.levelData[i]
      sum += sample * sample
    }
    const rms = Math.sqrt(sum / (this.levelData.length / 2))
    return clamp(Math.pow(rms * 3.4, 0.62), 0, 1)
  }
}

export class AudioEngine {
  constructor() {
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) throw new Error('Web Audio is not supported in this browser')
    this.ctx = new Context({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.78
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -7
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 9
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.22
    this.masterAnalyser = this.ctx.createAnalyser()
    this.masterAnalyser.fftSize = 256
    this.masterAnalyser.smoothingTimeConstant = 0.7
    this.masterData = new Float32Array(this.masterAnalyser.fftSize)
    this.master.connect(this.limiter)
    this.limiter.connect(this.masterAnalyser)
    this.masterAnalyser.connect(this.ctx.destination)
    this.decks = {}
    this.crossfaderValue = 0
    this.ready = false
  }

  async init() {
    if (this.ready) return
    await this.ctx.audioWorklet.addModule(new URL('./deck-processor.js', import.meta.url))
    this.decks.A = new DeckAudio(this.ctx, this.master, 'A')
    this.decks.B = new DeckAudio(this.ctx, this.master, 'B')
    this.setCrossfader(0)
    this.ready = true
  }

  async resume() {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume()
      } catch {
        /* browser still waiting for a gesture */
      }
    }
    return this.ctx.state
  }

  setCrossfader(value) {
    this.crossfaderValue = clamp(value, -1, 1)
    const unit = (this.crossfaderValue + 1) / 2
    const gainA = Math.cos((unit * Math.PI) / 2)
    const gainB = Math.sin((unit * Math.PI) / 2)
    if (this.decks.A) this.decks.A.setCrossfaderGain(gainA)
    if (this.decks.B) this.decks.B.setCrossfaderGain(gainB)
  }

  setMasterVolume(value) {
    const v = clamp(value, 0, 1)
    this.master.gain.setTargetAtTime(Math.pow(v, 1.25), this.ctx.currentTime, 0.02)
  }

  getMasterLevel() {
    this.masterAnalyser.getFloatTimeDomainData(this.masterData)
    let sum = 0
    for (let i = 0; i < this.masterData.length; i += 2) {
      const s = this.masterData[i]
      sum += s * s
    }
    const rms = Math.sqrt(sum / (this.masterData.length / 2))
    return clamp(Math.pow(rms * 3.2, 0.6), 0, 1)
  }

  async decodeFile(file) {
    const arrayBuffer = await file.arrayBuffer()
    return this.ctx.decodeAudioData(arrayBuffer)
  }
}
