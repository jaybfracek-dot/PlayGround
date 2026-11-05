/* ------------------------------------------------------------------ *
 * Goodwood Skate — input
 * Keyboard, touch (virtual stick + flick pad), and the Gamepad API.
 * USB-C and Bluetooth pads both appear through the same standard
 * mapping, so no driver-specific code is needed.
 * ------------------------------------------------------------------ */

export class Input {
  constructor() {
    this.moveX = 0;
    this.moveY = 0;
    this.flicks = [];
    this.jumpPressed = false;
    this.jumpReleased = false;
    this.jumpHeld = false;
    this.grab = false;
    this.boost = false;
    this.pausePressed = false;
    this.anyPressed = false;

    this.keys = new Set();
    this.keyVector = { x: 0, y: 0 };
    this.touchVector = { x: 0, y: 0 };
    this.padVector = { x: 0, y: 0 };

    this.padIndex = null;
    this.padName = '';
    this.padFlickArmed = true;
    this.padPrev = { x: 0, y: 0 };
    this.padButtonPrev = {};
    this.onPadChange = null;

    this.touch = false;
    this.stickPointer = null;
    this.stickCenter = { x: 0, y: 0 };
    this.stickRadius = 52;
    this.padPointer = null;
    this.padStart = { x: 0, y: 0, t: 0 };
    this.padFlicked = false;
    this.grabPointer = null;
    this.olliePointer = null;

    this._bindKeyboard();
    this._bindTouch();
    this._bindGamepad();
    this._bindLifecycle();
    this._detectTouch();
  }

  _detectTouch() {
    const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const narrow = window.innerWidth <= 820;
    this.touch = coarse || narrow;
    document.body.classList.toggle('touch', this.touch);
  }

  _bindLifecycle() {
    window.addEventListener('resize', () => this._detectTouch());
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.keyVector.x = this.keyVector.y = 0;
      this.jumpHeld = false;
      this.jumpReleased = true;
      this.grab = false;
      this.touchVector.x = this.touchVector.y = 0;
      this._releaseStick();
      this._releaseGrab();
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _bindKeyboard() {
    const map = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    window.addEventListener('keydown', e => {
      if (e.repeat) {
        if (['Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyM'].includes(e.code)) e.preventDefault();
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.anyPressed = true;
      this._updateKeyVector();
      if (e.code === 'Space') { this.jumpPressed = true; this.jumpHeld = true; }
      if (e.code === 'KeyF') this.grab = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.grab = true;
      if (e.code === 'KeyJ') this.flicks.push('left');
      if (e.code === 'KeyK') this.flicks.push('right');
      if (e.code === 'KeyL') this.flicks.push('upleft');
      if (e.code === 'KeyU') this.flicks.push('downright');
      if (e.code === 'KeyI') this.flicks.push('downleft');
      if (e.code === 'KeyO') this.flicks.push('upright');
      if (e.code === 'KeyM') this.flicks.push('down');
      if (e.code === 'Escape' || e.code === 'KeyP') this.pausePressed = true;
      if (e.code === 'KeyR') this.flicks.push('up');
      if (e.code === 'KeyB') this.boost = true;
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this._updateKeyVector();
      if (e.code === 'Space') { this.jumpReleased = true; this.jumpHeld = false; }
      if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.grab = false;
      if (e.code === 'KeyB') this.boost = false;
    });
  }

  _updateKeyVector() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const m = Math.hypot(x, y) || 1;
    this.keyVector.x = x / m;
    this.keyVector.y = y / m;
    if (!x && !y) { this.keyVector.x = 0; this.keyVector.y = 0; }
  }

  _bindTouch() {
    const stickZone = document.getElementById('stick-zone');
    const stickBase = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    if (!stickZone) return;

    const updateStick = (e) => {
      const dx = e.clientX - this.stickCenter.x;
      const dy = e.clientY - this.stickCenter.y;
      const dist = Math.hypot(dx, dy);
      const max = this.stickRadius;
      const clamped = Math.min(dist, max);
      const nx = dist > 0 ? (dx / dist) * (clamped / max) : 0;
      const ny = dist > 0 ? (dy / dist) * (clamped / max) : 0;
      this.touchVector.x = Math.abs(nx) > 0.12 ? nx : 0;
      this.touchVector.y = Math.abs(ny) > 0.12 ? -ny : 0;
      knob.style.transform = `translate(calc(-50% + ${nx * max * 0.62}px), calc(-50% + ${ny * max * 0.62}px))`;
    };

    stickZone.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      this.anyPressed = true;
      const rect = stickBase.getBoundingClientRect();
      this.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.stickRadius = rect.width * 0.42;
      try { stickZone.setPointerCapture(e.pointerId); } catch { /* synthetic / unsupported */ }
      stickZone.classList.add('active');
      updateStick(e);
    });
    stickZone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.stickPointer) return;
      e.preventDefault();
      updateStick(e);
    });
    const endStick = e => {
      if (e.pointerId !== this.stickPointer) return;
      this._releaseStick();
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);
    stickZone.addEventListener('lostpointercapture', endStick);

    const trickPad = document.getElementById('trick-pad');
    const emit = (dir) => {
      this.flicks.push(dir);
      this.anyPressed = true;
      if (navigator.vibrate) navigator.vibrate(12);
    };
    const dirFrom = (dx, dy) => {
      const a = Math.atan2(-dy, dx) * 180 / Math.PI;
      if (a >= -22.5 && a < 22.5) return 'right';
      if (a >= 22.5 && a < 67.5) return 'upright';
      if (a >= 67.5 && a < 112.5) return 'up';
      if (a >= 112.5 && a < 157.5) return 'upleft';
      if (a >= 157.5 || a < -157.5) return 'left';
      if (a >= -157.5 && a < -112.5) return 'downleft';
      if (a >= -112.5 && a < -67.5) return 'down';
      return 'downright';
    };

    trickPad.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (this.padPointer !== null) return;
      this.padPointer = e.pointerId;
      this.anyPressed = true;
      const rect = trickPad.getBoundingClientRect();
      this.padStart = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, t: performance.now() };
      this.padFlicked = false;
      try { trickPad.setPointerCapture(e.pointerId); } catch { /* synthetic / unsupported */ }
      trickPad.classList.add('active');
    });
    trickPad.addEventListener('pointermove', e => {
      if (e.pointerId !== this.padPointer) return;
      e.preventDefault();
      if (this.padFlicked) return;
      const dx = e.clientX - this.padStart.x;
      const dy = e.clientY - this.padStart.y;
      if (Math.hypot(dx, dy) > 26) {
        emit(dirFrom(dx, dy));
        this.padFlicked = true;
      }
    });
    const endPad = e => {
      if (e.pointerId !== this.padPointer) return;
      if (!this.padFlicked) emit('up');
      this.padPointer = null;
      trickPad.classList.remove('active');
    };
    trickPad.addEventListener('pointerup', endPad);
    trickPad.addEventListener('pointercancel', e => {
      if (e.pointerId !== this.padPointer) return;
      this.padPointer = null;
      trickPad.classList.remove('active');
    });

    const grabBtn = document.getElementById('grab-btn');
    grabBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.grabPointer = e.pointerId;
      this.grab = true;
      grabBtn.classList.add('active');
      try { grabBtn.setPointerCapture(e.pointerId); } catch { /* synthetic / unsupported */ }
    });
    const endGrab = e => {
      if (e.pointerId !== this.grabPointer) return;
      this._releaseGrab();
    };
    grabBtn.addEventListener('pointerup', endGrab);
    grabBtn.addEventListener('pointercancel', endGrab);
    grabBtn.addEventListener('lostpointercapture', endGrab);

    // dedicated ollie button — tap for a quick pop, hold to charge
    const ollieBtn = document.getElementById('ollie-btn');
    if (ollieBtn) {
      ollieBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (this.olliePointer !== null) return;
        this.olliePointer = e.pointerId;
        this.anyPressed = true;
        this.jumpPressed = true;
        this.jumpHeld = true;
        ollieBtn.classList.add('active');
        try { ollieBtn.setPointerCapture(e.pointerId); } catch { /* synthetic / unsupported */ }
      });
      const endOllie = e => {
        if (e.pointerId !== this.olliePointer) return;
        this.olliePointer = null;
        this.jumpReleased = true;
        this.jumpHeld = false;
        ollieBtn.classList.remove('active');
      };
      ollieBtn.addEventListener('pointerup', endOllie);
      ollieBtn.addEventListener('pointercancel', endOllie);
      ollieBtn.addEventListener('lostpointercapture', endOllie);
    }

    // tapping the trick pad itself should work even if pointer captures odd
    trickPad.addEventListener('lostpointercapture', e => {
      if (e.pointerId === this.padPointer) {
        if (!this.padFlicked) emit('up');
        this.padPointer = null;
        trickPad.classList.remove('active');
      }
    });
  }

  _releaseStick() {
    this.stickPointer = null;
    this.touchVector.x = 0;
    this.touchVector.y = 0;
    document.getElementById('stick-zone')?.classList.remove('active');
    const knob = document.getElementById('stick-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  }

  _releaseGrab() {
    this.grabPointer = null;
    this.grab = false;
    document.getElementById('grab-btn')?.classList.remove('active');
  }

  _bindGamepad() {
    window.addEventListener('gamepadconnected', e => {
      this.padIndex = e.gamepad.index;
      this.padName = e.gamepad.id;
      this.onPadChange?.(true, this.padName);
    });
    window.addEventListener('gamepaddisconnected', e => {
      if (e.gamepad.index !== this.padIndex) return;
      this.padIndex = null;
      this.padName = '';
      this.padVector.x = this.padVector.y = 0;
      this.onPadChange?.(false, '');
    });
  }

  _pollGamepad() {
    if (this.padIndex === null) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (p && p.connected) {
          this.padIndex = p.index;
          this.padName = p.id;
          this.onPadChange?.(true, p.id);
          break;
        }
      }
    }
    if (this.padIndex === null) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[this.padIndex];
    if (!pad || !pad.connected) return;

    const dz = 0.16;
    const lx = Math.abs(pad.axes[0] || 0) > dz ? pad.axes[0] : 0;
    const ly = Math.abs(pad.axes[1] || 0) > dz ? pad.axes[1] : 0;
    this.padVector.x = lx;
    this.padVector.y = -ly;

    const rx = pad.axes[2] || 0;
    const ry = pad.axes[3] || 0;
    const mag = Math.hypot(rx, ry);
    if (mag > 0.72 && this.padFlickArmed) {
      const dir = directionFrom(rx, -ry);
      this.flicks.push(dir);
      this.anyPressed = true;
      this.padFlickArmed = false;
      if (navigator.vibrate) navigator.vibrate(10);
    }
    if (mag < 0.26) this.padFlickArmed = true;
    this.padPrev.x = rx;
    this.padPrev.y = ry;

    const pressed = i => !!pad.buttons[i]?.pressed;
    const edge = (i, key) => {
      const p = pressed(i);
      const prev = this.padButtonPrev[key] || false;
      this.padButtonPrev[key] = p;
      return p && !prev;
    };
    const released = (i, key) => {
      const p = pressed(i);
      const prev = this.padButtonPrev['r' + key] || false;
      this.padButtonPrev['r' + key] = p;
      return !p && prev;
    };

    if (edge(0, 'jump')) { this.jumpPressed = true; this.jumpHeld = true; this.anyPressed = true; }
    if (released(0, 'jump')) { this.jumpReleased = true; this.jumpHeld = false; }
    if (pressed(2) || pressed(5)) this.grab = true;
    else if (this.grabPointer === null) this.grab = false;
    if (pressed(7)) this.boost = true;
    else if (!this.keys.has('KeyB')) this.boost = false;
    if (edge(9, 'pause') || edge(8, 'pause2')) { this.pausePressed = true; this.anyPressed = true; }

    // D-pad trick shortcuts
    const dpad = [
      ['up', 12], ['down', 13], ['left', 14], ['right', 15],
    ];
    for (const [dir, idx] of dpad) {
      if (edge(idx, 'dpad' + idx)) { this.flicks.push(dir); this.anyPressed = true; }
    }
    // B = manual flick
    if (edge(1, 'b')) { this.flicks.push('down'); this.anyPressed = true; }
  }

  update(dt) {
    this._pollGamepad();
    let x = this.keyVector.x + this.touchVector.x + this.padVector.x;
    let y = this.keyVector.y + this.touchVector.y + this.padVector.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.moveX = Math.abs(x) > 0.08 ? x : 0;
    this.moveY = Math.abs(y) > 0.08 ? y : 0;
  }

  endFrame() {
    this.flicks.length = 0;
    this.jumpPressed = false;
    this.jumpReleased = false;
    this.pausePressed = false;
    this.anyPressed = false;
  }

  rumble(strong = 0.5, weak = 0.2, ms = 90) {
    if (this.padIndex === null) return;
    const pad = navigator.getGamepads?.()[this.padIndex];
    const actuator = pad?.vibrationActuator;
    if (!actuator) return;
    try {
      actuator.playEffect('dual-rumble', {
        startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong,
      });
    } catch { /* unsupported pad */ }
  }
}

function directionFrom(x, y) {
  const a = Math.atan2(y, x) * 180 / Math.PI;
  if (a >= -22.5 && a < 22.5) return 'right';
  if (a >= 22.5 && a < 67.5) return 'upright';
  if (a >= 67.5 && a < 112.5) return 'up';
  if (a >= 112.5 && a < 157.5) return 'upleft';
  if (a >= 157.5 || a < -157.5) return 'left';
  if (a >= -157.5 && a < -112.5) return 'downleft';
  if (a >= -112.5 && a < -67.5) return 'down';
  return 'downright';
}
