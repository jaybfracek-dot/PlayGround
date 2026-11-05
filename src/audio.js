/* ------------------------------------------------------------------ *
 * Goodwood Skate — procedural audio
 * All sounds are synthesised with the Web Audio API: no downloads.
 * ------------------------------------------------------------------ */

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.rollGain = null;
    this.grindGain = null;
    this.started = false;
    this.noise = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noise = buf;

    // rolling wheels
    const roll = ctx.createBufferSource();
    roll.buffer = buf;
    roll.loop = true;
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 520;
    rollFilter.Q.value = 1.2;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(rollFilter).connect(this.rollGain).connect(this.master);
    roll.start();

    // metal grind loop
    const grind = ctx.createBufferSource();
    grind.buffer = buf;
    grind.loop = true;
    const gf = ctx.createBiquadFilter();
    gf.type = 'bandpass';
    gf.frequency.value = 2600;
    gf.Q.value = 8;
    const g2 = ctx.createGain();
    g2.gain.value = 0;
    grind.connect(gf).connect(g2).connect(this.master);
    grind.start();
    this.grindGain = g2;
    this.grindFilter = gf;
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.75, this.ctx.currentTime, 0.04);
  }

  _env(node, gain, attack, decay, peak) {
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(freq, dur, type = 'sine', peak = 0.1, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, filterType, freq, peak = 0.1, q = 1, delay = 0, slideTo = 0) {
    if (!this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  updateRolling(speed, grounded, grinding) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = grounded && !grinding ? Math.min(0.09, 0.005 + speed * 0.006) : 0;
    this.rollGain.gain.setTargetAtTime(target, t, 0.1);
    if (this.grindGain) {
      this.grindGain.gain.setTargetAtTime(grinding ? 0.09 : 0, t, 0.04);
      this.grindFilter.frequency.setTargetAtTime(1800 + speed * 80, t, 0.1);
    }
  }

  push() {
    this._noise(0.16, 'bandpass', 700, 0.05, 0.7, 0, 1800);
    this._tone(95, 0.1, 'sine', 0.035, -30);
  }

  ollie(charged = 0) {
    this._noise(0.1, 'highpass', 1400, 0.09 + charged * 0.04, 0.7);
    this._tone(190 + charged * 40, 0.16, 'triangle', 0.06, 150);
    this._tone(68, 0.13, 'sine', 0.09, -20, 0.01);
  }

  land(impact = 1) {
    const p = Math.min(1, impact / 12);
    this._tone(52, 0.18, 'sine', 0.12 + p * 0.12, -18);
    this._noise(0.12, 'lowpass', 900, 0.08 + p * 0.08, 0.8);
    if (p > 0.5) this._noise(0.06, 'highpass', 2200, 0.05, 0.6, 0.02);
  }

  trick() {
    this._noise(0.15, 'bandpass', 1700, 0.05, 1.8, 0, 3200);
  }

  grindStart() {
    this._noise(0.22, 'bandpass', 3000, 0.08, 6);
    this._tone(720, 0.14, 'triangle', 0.03, 120);
  }

  bail() {
    this._noise(0.5, 'lowpass', 1200, 0.18, 0.8, 0, 180);
    this._tone(70, 0.42, 'sawtooth', 0.1, -40);
    this._tone(120, 0.25, 'square', 0.04, -60, 0.05);
  }

  pickup(letter = false) {
    const notes = letter ? [523, 659, 784, 1046] : [784, 1046];
    notes.forEach((n, i) => this._tone(n, 0.22, 'sine', letter ? 0.06 : 0.035, 0, i * 0.055));
  }

  tick() {
    this._tone(920, 0.06, 'square', 0.02);
  }

  end() {
    const notes = [392, 523, 659, 784];
    notes.forEach((n, i) => this._tone(n, 0.5, 'triangle', 0.06, 0, i * 0.13));
  }

  stopAll() {
    if (!this.ctx) return;
    this.rollGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.grindGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}
