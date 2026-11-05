/**
 * DeckProcessor — sample-accurate, bidirectional playback engine.
 *
 * A single AudioBufferSourceNode cannot be reliably played backwards across
 * browsers, so this worklet owns the track data and moves an interpolated
 * read-head at a signed rate. That is what makes real jog-wheel scratching
 * (including reverse) work.
 */
class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.channels = null
    this.length = 0
    this.sourceRate = sampleRate
    this.position = 0 // in source samples
    this.rate = 0
    this.targetRate = 0
    this.rateSmooth = 0.01
    this.gate = 0
    this.active = false
    this.loop = null
    this.ended = false
    this.framesSinceReport = 0
    this.reportNow = true
    this.port.onmessage = (event) => this.handleMessage(event.data)
  }

  handleMessage(message) {
    if (!message) return
    switch (message.type) {
      case 'load': {
        this.channels = message.channels
        this.length = message.length || (this.channels[0] ? this.channels[0].length : 0)
        this.sourceRate = message.sourceRate || sampleRate
        this.position = 0
        this.rate = 0
        this.targetRate = 0
        this.gate = 0
        this.active = false
        this.loop = null
        this.ended = false
        this.reportNow = true
        break
      }
      case 'play': {
        if (typeof message.position === 'number') this.position = this.secondsToSamples(message.position)
        this.active = true
        this.ended = false
        this.reportNow = true
        break
      }
      case 'rate': {
        if (typeof message.value === 'number') this.targetRate = message.value
        if (typeof message.smooth === 'number' && message.smooth > 0) this.rateSmooth = message.smooth
        if (typeof message.active === 'boolean') this.active = message.active
        break
      }
      case 'pause': {
        this.active = false
        this.targetRate = 0
        this.rateSmooth = 0.025
        this.reportNow = true
        break
      }
      case 'active': {
        this.active = Boolean(message.active)
        if (!this.active) this.targetRate = 0
        break
      }
      case 'seek': {
        if (typeof message.position === 'number') this.position = this.secondsToSamples(message.position)
        this.ended = false
        this.reportNow = true
        break
      }
      case 'loop': {
        if (message.enabled && message.end > message.start) {
          this.loop = {
            start: this.secondsToSamples(message.start),
            end: this.secondsToSamples(message.end)
          }
          if (this.loop.end - this.loop.start < this.sourceRate * 0.02) this.loop = null
        } else {
          this.loop = null
        }
        this.reportNow = true
        break
      }
      default:
        break
    }
  }

  secondsToSamples(seconds) {
    return Math.max(0, seconds * this.sourceRate)
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    const left = output[0]
    const right = output[1] || output[0]
    left.fill(0)
    if (output[1]) output[1].fill(0)
    if (!this.channels || !this.length) return true
    if (!this.active && this.gate < 0.0002) {
      this.reportIfNeeded(left.length)
      return true
    }

    const channelL = this.channels[0]
    const channelR = this.channels[1] || this.channels[0]
    const rateCoef = 1 - Math.exp(-1 / (sampleRate * Math.max(0.001, this.rateSmooth)))
    const gateCoef = 1 - Math.exp(-1 / (sampleRate * 0.007))
    const stepScale = this.sourceRate / sampleRate
    const maxIndex = this.length - 2

    for (let i = 0; i < left.length; i++) {
      this.rate += (this.targetRate - this.rate) * rateCoef
      const gateTarget = this.active && Math.abs(this.rate) > 0.0018 ? 1 : 0
      this.gate += (gateTarget - this.gate) * gateCoef

      if (this.active && Math.abs(this.rate) > 0.00001 && this.length > 2 && maxIndex > 0) {
        this.position += this.rate * stepScale

        if (this.loop) {
          const loopLength = this.loop.end - this.loop.start
          if (loopLength > 8) {
            while (this.position >= this.loop.end) this.position -= loopLength
            while (this.position < this.loop.start) this.position += loopLength
          }
        } else if (this.position >= maxIndex) {
          this.position = maxIndex
          this.targetRate = 0
          this.active = false
          if (!this.ended) {
            this.ended = true
            this.port.postMessage({ type: 'ended' })
          }
        } else if (this.position < 0) {
          // A reverse scratch can reach the first sample without the track
          // actually ending. Hold the read-head at zero and stay engaged so
          // the platter keeps responding when the user turns it forward again.
          this.position = 0
          this.targetRate = 0
          if (this.rate >= 0) {
            this.active = false
            if (!this.ended) {
              this.ended = true
              this.port.postMessage({ type: 'ended' })
            }
          }
        }
      }

      if (this.gate > 0.00005 && maxIndex > 0) {
        const index = this.position | 0
        const frac = this.position - index
        const i0 = index >= 0 ? index : 0
        const i1 = i0 + 1 <= maxIndex ? i0 + 1 : maxIndex
        const l = channelL[i0] + (channelL[i1] - channelL[i0]) * frac
        const r = channelR[i0] + (channelR[i1] - channelR[i0]) * frac
        left[i] = l * this.gate
        if (output[1]) right[i] = r * this.gate
      }
    }

    this.reportIfNeeded(left.length)
    return true
  }

  reportIfNeeded(frames) {
    this.framesSinceReport += frames
    if (this.reportNow || this.framesSinceReport >= sampleRate * 0.035) {
      this.framesSinceReport = 0
      this.reportNow = false
      this.port.postMessage({
        type: 'state',
        position: this.sourceRate ? this.position / this.sourceRate : 0,
        rate: this.rate,
        active: this.active,
        gate: this.gate,
        loop: this.loop
          ? { start: this.loop.start / this.sourceRate, end: this.loop.end / this.sourceRate }
          : null
      })
    }
  }
}

registerProcessor('deck-processor', DeckProcessor)
