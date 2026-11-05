/* PHASE//TWO audio graph
   AudioWorklet decks → EQ/filter → channel fader → crossfader → master. */

const DECK_IDS = ['A', 'B'];

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function equalPower(x) {
  const p = Math.max(0, Math.min(1, x));
  return [Math.cos(p * Math.PI / 2), Math.sin(p * Math.PI / 2)];
}

export class AudioEngine {
  constructor({ onPosition, onEnded } = {}) {
    this.ctx = null;
    this.nodes = {};
    this.analysers = {};
    this.buffers = {};
    this.crossfader = 0.5;
    this.masterVolume = 0.86;
    this.onPosition = onPosition || (() => {});
    this.onEnded = onEnded || (() => {});
    this._scratchRates = new Map();
    this._timeData = new Float32Array(1024);
    this._ready = false;
  }

  get ready() { return this._ready; }
  get sampleRate() { return this.ctx?.sampleRate || 0; }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');

    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
    if (!this.ctx.audioWorklet) throw new Error('AudioWorklet is not supported in this browser.');

    await this.ctx.audioWorklet.addModule(new URL('./worklets/deck-processor.js', import.meta.url));

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.16;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.masterAnalyser.smoothingTimeConstant = 0.78;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    for (const id of DECK_IDS) this._buildDeck(id);

    this._ready = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this;
  }

  _buildDeck(id) {
    const ctx = this.ctx;
    const node = new AudioWorkletNode(ctx, 'deck-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'position') this.onPosition(id, message);
      if (message.type === 'ended') this.onEnded(id);
      if (message.type === 'loaded') this.onPosition(id, { position: 0, rate: 0, playing: false, touched: false });
    };

    const trim = ctx.createGain();
    trim.gain.value = 1;

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 280;
    low.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1050;
    mid.Q.value = 1.15;
    mid.gain.value = 0;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 4600;
    high.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 22050;
    filter.Q.value = 0.8;

    const channelGain = ctx.createGain();
    channelGain.gain.value = 0.82;

    const crossGain = ctx.createGain();
    const [a, b] = equalPower(this.crossfader);
    crossGain.gain.value = id === 'A' ? a : b;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;

    const echoSend = ctx.createGain();
    echoSend.gain.value = 0;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.31;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2800;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0;

    node.connect(trim);
    trim.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(filter);
    filter.connect(channelGain);
    channelGain.connect(crossGain);
    crossGain.connect(analyser);
    analyser.connect(this.masterGain);

    crossGain.connect(echoSend);
    echoSend.connect(delay);
    delay.connect(echoTone);
    echoTone.connect(feedback);
    feedback.connect(delay);
    echoTone.connect(echoWet);
    echoWet.connect(this.masterGain);

    this.nodes[id] = { node, trim, low, mid, high, filter, channelGain, crossGain, analyser, echoSend, delay, feedback, echoWet };
    this.analysers[id] = analyser;
  }

  async decode(arrayBuffer) {
    if (!this.ctx) await this.init();
    // decodeAudioData may detach its input in some engines; hand it a copy.
    return this.ctx.decodeAudioData(arrayBuffer.slice(0));
  }

  loadBuffer(id, audioBuffer) {
    if (!this.nodes[id]) return;
    const left = audioBuffer.getChannelData(0).slice();
    const right = audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1).slice()
      : left.slice();
    this.buffers[id] = audioBuffer;
    this.nodes[id].node.port.postMessage(
      { type: 'load', left, right, duration: audioBuffer.duration },
      [left.buffer, right.buffer]
    );
  }

  play(id, value) {
    this.nodes[id]?.node.port.postMessage({ type: 'play', value });
  }

  seek(id, seconds) {
    this.nodes[id]?.node.port.postMessage({ type: 'seek', position: seconds });
  }

  setBaseRate(id, value) {
    this.nodes[id]?.node.port.postMessage({ type: 'baseRate', value });
  }

  setBend(id, value) {
    this.nodes[id]?.node.port.postMessage({ type: 'bend', value });
  }

  setTouch(id, value) {
    this.nodes[id]?.node.port.postMessage({ type: 'touch', value });
  }

  setScratchHold(id, value) {
    this.nodes[id]?.node.port.postMessage({ type: 'scratchHold', value });
  }

  setScratchRate(id, value) {
    this._scratchRates.set(id, value);
    this.nodes[id]?.node.port.postMessage({ type: 'scratchRate', value });
  }

  setLoop(id, inSec, outSec, active) {
    this.nodes[id]?.node.port.postMessage({ type: 'loop', in: inSec, out: outSec, active });
  }

  setChannelVolume(id, value) {
    const n = this.nodes[id];
    if (!n) return;
    const v = Math.max(0, Math.min(1, value));
    n.channelGain.gain.setTargetAtTime(v * v * 1.15, this.ctx.currentTime, 0.012);
  }

  setCrossfader(value) {
    this.crossfader = Math.max(0, Math.min(1, value));
    const [a, b] = equalPower(this.crossfader);
    if (this.nodes.A) this.nodes.A.crossGain.gain.setTargetAtTime(a, this.ctx.currentTime, 0.01);
    if (this.nodes.B) this.nodes.B.crossGain.gain.setTargetAtTime(b, this.ctx.currentTime, 0.01);
  }

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, value));
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.masterVolume * this.masterVolume * 1.15, this.ctx.currentTime, 0.012);
  }

  setEQ(id, band, db) {
    const n = this.nodes[id];
    if (!n) return;
    const node = n[band];
    if (!node) return;
    node.gain.setTargetAtTime(Math.max(-24, Math.min(24, db)), this.ctx.currentTime, 0.015);
  }

  setFilter(id, value) {
    const n = this.nodes[id];
    if (!n) return;
    const v = Math.max(-1, Math.min(1, value));
    const f = n.filter;
    const now = this.ctx.currentTime;
    if (v < -0.005) {
      f.type = 'lowpass';
      f.frequency.setTargetAtTime(22050 * Math.pow(300 / 22050, -v), now, 0.02);
      f.Q.setTargetAtTime(0.7 + Math.abs(v) * 2.2, now, 0.02);
    } else if (v > 0.005) {
      f.type = 'highpass';
      f.frequency.setTargetAtTime(30 * Math.pow(22050 / 30, v), now, 0.02);
      f.Q.setTargetAtTime(0.7 + v * 2.2, now, 0.02);
    } else {
      f.type = 'lowpass';
      f.frequency.setTargetAtTime(22050, now, 0.02);
      f.Q.setTargetAtTime(0.7, now, 0.02);
    }
  }

  setEcho(id, active) {
    const n = this.nodes[id];
    if (!n) return;
    const now = this.ctx.currentTime;
    n.echoSend.gain.setTargetAtTime(active ? 0.38 : 0, now, 0.03);
    n.echoWet.gain.setTargetAtTime(active ? 0.48 : 0, now, 0.03);
  }

  level(id) {
    const analyser = this.analysers[id];
    if (!analyser) return { rms: 0, peak: 0 };
    const data = this._timeData;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    return { rms: Math.sqrt(sum / data.length), peak };
  }

  masterLevel() {
    if (!this.masterAnalyser) return { rms: 0, peak: 0 };
    const data = new Float32Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getFloatTimeDomainData(data);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    return { rms: Math.sqrt(sum / data.length), peak };
  }

  latency() {
    if (!this.ctx) return 0;
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }
}
