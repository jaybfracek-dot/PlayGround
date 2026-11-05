/* PHASE//TWO deck engine — sample-accurate transport + vinyl scratch.
   Runs inside AudioWorkletGlobalScope. */

const TWO_PI = Math.PI * 2;

class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = null;
    this.right = null;
    this.length = 0;
    this.position = 0;
    this.playing = false;
    this.touched = false;
    this.scratchHold = false;
    this.baseRate = 1;
    this.bend = 1;
    this.scratchTarget = 0;
    this.currentRate = 0;
    this.envelope = 0;
    this.loopIn = -1;
    this.loopOut = -1;
    this.loopActive = false;
    this.samplesSinceReport = 0;
    this.endedSent = false;
    this.lastSentPosition = -1;
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    switch (message.type) {
      case 'load': {
        this.left = message.left;
        this.right = message.right;
        this.length = Math.min(this.left.length, this.right.length);
        this.position = 0;
        this.playing = false;
        this.touched = false;
        this.scratchHold = false;
        this.currentRate = 0;
        this.envelope = 0;
        this.loopIn = -1;
        this.loopOut = -1;
        this.loopActive = false;
        this.endedSent = false;
        this.port.postMessage({ type: 'loaded', length: this.length, duration: message.duration || this.length / sampleRate });
        break;
      }
      case 'play':
        this.playing = Boolean(message.value);
        if (this.playing && this.length && this.position >= this.length - 2) this.position = 0;
        if (!this.playing) this.endedSent = false;
        this.report();
        break;
      case 'seek':
        if (!this.length) break;
        this.position = Math.max(0, Math.min(this.length - 2, message.position * sampleRate));
        this.report();
        break;
      case 'baseRate':
        this.baseRate = Math.max(0.01, Math.min(4, message.value));
        break;
      case 'bend':
        this.bend = Math.max(0.25, Math.min(4, message.value));
        break;
      case 'touch':
        this.touched = Boolean(message.value);
        if (this.touched) {
          this.scratchTarget = 0;
          this.currentRate = 0;
        }
        this.port.postMessage({ type: 'touch', value: this.touched });
        break;
      case 'scratchHold':
        this.scratchHold = Boolean(message.value);
        if (this.scratchHold) {
          this.scratchTarget = 0;
          this.currentRate = 0;
        }
        break;
      case 'scratchRate':
        this.scratchTarget = Math.max(-16, Math.min(16, message.value || 0));
        break;
      case 'loop':
        this.loopIn = Math.max(0, (message.in || 0) * sampleRate);
        this.loopOut = Math.max(this.loopIn + 128, (message.out || 0) * sampleRate);
        this.loopActive = Boolean(message.active);
        break;
      default:
        break;
    }
  }

  report() {
    this.port.postMessage({
      type: 'position',
      position: this.position / sampleRate,
      rate: this.currentRate,
      playing: this.playing,
      touched: this.touched,
      scratchHold: this.scratchHold,
    });
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    if (!this.length) {
      outL.fill(0);
      outR.fill(0);
      return true;
    }

    const scratch = this.touched || this.scratchHold;
    const target = scratch
      ? this.scratchTarget
      : (this.playing ? this.baseRate * this.bend : 0);

    // A short one-pole smooth avoids zipper noise without blunting the scratch.
    const smoothing = scratch ? 0.62 : 0.18;
    this.currentRate += (target - this.currentRate) * smoothing;
    if (Math.abs(this.currentRate) < 0.0002 && Math.abs(target) < 0.0002) this.currentRate = 0;

    const rate = this.currentRate;
    const active = scratch || this.playing;
    const envTarget = active ? 1 : 0;
    let position = this.position;
    let ended = false;

    for (let i = 0; i < outL.length; i++) {
      this.envelope += (envTarget - this.envelope) * (active ? 0.003 : 0.0015);
      let p = position;

      if (this.loopActive) {
        const loopLength = this.loopOut - this.loopIn;
        if (loopLength > 32) {
          if (p >= this.loopOut) p = this.loopIn + ((p - this.loopIn) % loopLength);
          else if (p < this.loopIn) p = this.loopOut - ((this.loopIn - p) % loopLength);
        }
      }

      let sampleL = 0;
      let sampleR = 0;
      if (p >= 0 && p < this.length - 1) {
        const i0 = p | 0;
        const frac = p - i0;
        const l0 = this.left[i0];
        const l1 = this.left[i0 + 1];
        const r0 = this.right[i0];
        const r1 = this.right[i0 + 1];
        sampleL = l0 + (l1 - l0) * frac;
        sampleR = r0 + (r1 - r0) * frac;
      } else if (p >= this.length - 1) {
        ended = true;
      }

      const gain = this.envelope;
      outL[i] = sampleL * gain;
      outR[i] = sampleR * gain;

      position += rate;
      if (!this.loopActive && position >= this.length - 1) {
        position = this.length - 1;
        ended = true;
        break;
      }
      if (position < 0) {
        position = 0;
        this.currentRate = 0;
      }
    }

    this.position = position;

    if (ended && !this.endedSent) {
      this.endedSent = true;
      this.playing = false;
      this.currentRate = 0;
      this.port.postMessage({ type: 'ended' });
    }

    this.samplesSinceReport += outL.length;
    if (this.samplesSinceReport >= 512) {
      this.samplesSinceReport = 0;
      this.report();
    }

    return true;
  }
}

registerProcessor('deck-processor', DeckProcessor);
