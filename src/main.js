import * as THREE from '../vendor/three.module.js';
import { createWorld, PARK, heightAt } from './world.js';
import { Skater } from './skater.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { FX } from './fx.js';

/* ================================================================ setup */

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
});
const coarse = window.matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 480);

const world = createWorld(scene, renderer);
const skater = new Skater(scene);
const fx = new FX(scene);
const audio = new GameAudio();
const input = new Input();

scene.add(camera);

/* ================================================================ ui */

const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'),
  start: $('start-screen'),
  pause: $('pause-screen'),
  results: $('results-screen'),
  timer: $('timer'),
  score: $('score'),
  best: $('hud-best'),
  startBest: $('start-best'),
  combo: $('combo-wrap'),
  comboMult: $('combo-mult'),
  comboBank: $('combo-bank'),
  comboBar: $('combo-bar'),
  trickFeed: $('trick-feed'),
  toast: $('center-toast'),
  balance: $('balance-wrap'),
  balanceMarker: $('balance-marker'),
  balanceMode: $('balance-mode'),
  speed: $('speed-val'),
  speedBar: $('speed-bar'),
  letters: $('letters'),
  padBadge: $('pad-badge'),
  padStatus: $('pad-status'),
  flash: $('flash'),
  pauseScore: $('pause-score'),
  pauseTime: $('pause-time'),
  finalScore: $('final-score'),
  resultTrick: $('result-trick'),
  resultTricks: $('result-tricks'),
  resultLetters: $('result-letters'),
  resultBest: $('result-best'),
  resultsTitle: $('results-title'),
  newBest: $('new-best'),
  mute: $('mute-btn'),
};

const LETTERS = ['S', 'K', 'A', 'T', 'E'];

/* ================================================================ state */

const START_TIME = 120;
const GRAVITY = 23;
const SLOPE_GRAVITY = 12.5;

const game = {
  mode: 'menu', // menu | playing | paused | results
  elapsed: 0,
  timeLeft: START_TIME,
  score: 0,
  bank: 0,
  mult: 1,
  comboTimer: 0,
  comboMax: 2.2,
  letters: new Set(),
  tricksLanded: 0,
  bestTrick: { name: '—', points: 0 },
  best: loadBest(),
  bailing: 0,
  bailTimer: 0,
  lastSecond: 99,
  wasBest: false,
};

const phys = {
  x: PARK.spawn.x,
  y: 0,
  z: PARK.spawn.z,
  vx: 0,
  vz: 0,
  vy: 0,
  heading: PARK.spawn.heading,
  grounded: true,
  airTime: 0,
  airTricks: 0,
  spin: 0,
  grind: null,
  manual: false,
  manualBalance: 0,
  manualTime: 0,
  grabTime: 0,
  charge: 0,
  charging: false,
  crouch: 0,
  lean: 0,
  slopePitch: 0,
  slopeRoll: 0,
  safe: { x: PARK.spawn.x, z: PARK.spawn.z, heading: PARK.spawn.heading },
  safeTimer: 0,
  pushTimer: 0,
  launched: false,
  wallTimer: 0,
};

const cam = {
  pos: new THREE.Vector3(0, 4.4, 22),
  target: new THREE.Vector3(0, 1.2, 8),
  yaw: Math.PI,
  fov: 60,
  shake: 0,
  snap: true,
};

const TRICKS = {
  kickflip: { name: 'KICKFLIP', points: 140, roll: 360, pop: 0.15, dur: 0.5 },
  heelflip: { name: 'HEELFLIP', points: 140, roll: -360, pop: 0.15, dur: 0.5 },
  shuvit: { name: 'POP SHUVIT', points: 90, yaw: 360, pop: 0.1, dur: 0.46 },
  varial: { name: 'VARIAL KICKFLIP', points: 260, roll: 360, yaw: 360, pop: 0.17, dur: 0.62 },
  treflip: { name: '360 FLIP', points: 380, roll: 360, yaw: 360, pop: 0.22, dur: 0.68 },
  impossible: { name: 'IMPOSSIBLE', points: 320, pitch: 360, pop: 0.18, dur: 0.66 },
};

const FLICK_MAP = {
  left: 'kickflip',
  right: 'heelflip',
  upleft: 'shuvit',
  upright: 'treflip',
  downleft: 'impossible',
  downright: 'varial',
};

/* ================================================================ boot visuals */

skater.show();
skater.reset(PARK.spawn.x, heightAt(PARK.spawn.x, PARK.spawn.z), PARK.spawn.z, PARK.spawn.heading);
updateBestText();
ui.padBadge.classList.add('hidden');

input.onPadChange = (connected, name) => {
  if (connected) {
    ui.padBadge.classList.remove('hidden');
    const short = name.split('(')[0].trim().slice(0, 24).toUpperCase();
    ui.padStatus.textContent = `PAD CONNECTED · ${short}`;
    ui.padStatus.classList.add('on');
    if (game.mode === 'playing') showToast('CONTROLLER CONNECTED', short || 'GAMEPAD READY', '', 1500);
    input.rumble(0.3, 0.5, 90);
  } else {
    ui.padBadge.classList.add('hidden');
    ui.padStatus.textContent = 'NO PAD — CONNECT USB-C OR BLUETOOTH';
    ui.padStatus.classList.remove('on');
    if (game.mode === 'playing') showToast('CONTROLLER LOST', 'TOUCH CONTROLS STILL ACTIVE', 'bail', 1400);
  }
};

/* ================================================================ helpers */

function loadBest() {
  try { return Number(localStorage.getItem('skate-shift-best-v1')) || 0; } catch { return 0; }
}
function saveBest(value) {
  game.best = value;
  try { localStorage.setItem('skate-shift-best-v1', String(value)); } catch { /* private mode */ }
  updateBestText();
}
function updateBestText() {
  const b = game.best.toLocaleString('en-US');
  if (ui.best) ui.best.textContent = `BEST ${b}`;
  if (ui.startBest) ui.startBest.textContent = b;
}
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function timeFmt(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function approachAngle(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}
function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }
function speedOf() { return Math.hypot(phys.vx, phys.vz); }

/* ================================================================ HUD */

let toastTimeout = 0;
function showToast(title, sub = '', cls = '', ms = 1100) {
  if (!ui.toast) return;
  const el = ui.toast;
  el.className = 'hidden';
  el.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
  // force animation restart
  void el.offsetWidth;
  el.className = cls || '';
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hidden'), ms);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let feedTimer = 0;
function addTrickFeed(name, points, countTrick = true) {
  const line = document.createElement('div');
  line.className = 'trick-line';
  line.innerHTML = `${escapeHtml(name)}${points ? `<i>+${fmt(points)}</i>` : ''}`;
  ui.trickFeed.appendChild(line);
  while (ui.trickFeed.children.length > 4) ui.trickFeed.firstElementChild.remove();
  if (countTrick) game.tricksLanded++;
  setTimeout(() => {
    line.classList.add('fade');
    setTimeout(() => line.remove(), 520);
  }, 2300);
}

function updateHUD() {
  if (game.mode === 'menu' || game.mode === 'results') return;
  ui.timer.textContent = timeFmt(game.timeLeft);
  ui.timer.classList.toggle('low', game.timeLeft <= 10.2);
  ui.score.textContent = fmt(game.score);
  ui.speed.textContent = Math.round(speedOf() * 3.6);
  ui.speedBar.firstElementChild.style.width = `${clamp(speedOf() / 16 * 100, 0, 100)}%`;

  const comboVisible = game.bank >= 1;
  ui.combo.classList.toggle('hidden', !comboVisible);
  if (comboVisible) {
    ui.comboMult.textContent = `x${game.mult.toFixed(1)}`;
    ui.comboBank.textContent = fmt(game.bank);
    const t = clamp(game.comboTimer / game.comboMax, 0, 1);
    ui.comboBar.firstElementChild.style.transform = `scaleX(${t})`;
  }

  const balanceOn = !!(phys.grind || phys.manual);
  ui.balance.classList.toggle('hidden', !balanceOn);
  if (balanceOn) {
    const bal = phys.grind ? phys.grind.balance : phys.manualBalance;
    const pct = clamp((bal + 1) / 2, 0.015, 0.985) * 100;
    ui.balanceMarker.style.left = `${pct}%`;
    ui.balanceMarker.classList.toggle('warn', Math.abs(bal) > 0.72);
    ui.balanceMode.textContent = phys.grind ? 'GRIND' : 'MANUAL';
  }

  for (const el of ui.letters.children) {
    el.classList.toggle('got', game.letters.has(el.dataset.letter));
  }
}

function updateCoarse() {
  document.body.classList.toggle('touch', window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 820);
}

/* ================================================================ run lifecycle */

function startGame() {
  audio.ensure();
  clearTimeout(toastTimeout);
  clearTimeout(feedTimer);
  document.body.classList.remove('in-menu', 'in-results', 'in-pause');
  ui.start.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.trickFeed.innerHTML = '';
  ui.toast.classList.add('hidden');
  ui.combo.classList.add('hidden');
  ui.balance.classList.add('hidden');

  resetRun();
  game.mode = 'playing';
  updateBestText();
  input.endFrame();
  showToast('DROP IN', '2 MINUTES · MAKE IT COUNT', '', 900);
  requestAnimationFrame(() => {
    document.activeElement?.blur?.();
  });
}

function resetRun() {
  game.timeLeft = START_TIME;
  game.score = 0;
  game.bank = 0;
  game.mult = 1;
  game.comboTimer = 0;
  game.letters.clear();
  game.tricksLanded = 0;
  game.bestTrick = { name: '—', points: 0 };
  game.bailing = 0;
  game.bailTimer = 0;
  game.lastSecond = 99;
  game.wasBest = false;

  phys.x = PARK.spawn.x;
  phys.z = PARK.spawn.z;
  phys.y = heightAt(phys.x, phys.z);
  phys.vx = 0; phys.vz = 0; phys.vy = 0;
  phys.heading = PARK.spawn.heading;
  phys.grounded = true;
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.grind = null;
  phys.manual = false;
  phys.manualBalance = 0;
  phys.manualTime = 0;
  phys.grabTime = 0;
  phys.charge = 0;
  phys.charging = false;
  phys.crouch = 0;
  phys.lean = 0;
  phys.safe = { x: phys.x, z: phys.z, heading: phys.heading };
  phys.safeTimer = 0;
  phys.pushTimer = 0;
  phys.wallTimer = 0;

  for (const l of world.letters) {
    l.collected = false;
    l.group.visible = true;
  }

  skater.reset(phys.x, phys.y, phys.z, phys.heading);
  skater.clearTrick();
  snapCamera();
  ui.trickFeed.innerHTML = '';
  ui.combo.classList.add('hidden');
  ui.balance.classList.add('hidden');
  updateHUD();
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  document.body.classList.add('in-pause');
  ui.pause.classList.remove('hidden');
  ui.pauseScore.textContent = fmt(game.score);
  ui.pauseTime.textContent = timeFmt(game.timeLeft);
  input.padVector.x = input.padVector.y = 0;
  audio.stopAll();
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  document.body.classList.remove('in-pause');
  ui.pause.classList.add('hidden');
  audio.ensure();
  input.endFrame();
}

function finishGame() {
  if (game.mode === 'results') return;
  game.mode = 'results';
  game.timeLeft = Math.max(0, game.timeLeft);
  if (game.bank > 0) {
    game.score += Math.round(game.bank);
    game.bank = 0;
  }
  ui.hud.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.start.classList.add('hidden');
  document.body.classList.remove('in-pause');
  document.body.classList.add('in-results');

  const final = Math.round(game.score);
  const isBest = final > game.best;
  game.wasBest = isBest;
  if (isBest) saveBest(final);
  ui.finalScore.textContent = fmt(final);
  ui.resultTrick.textContent = game.bestTrick.points > 0 ? game.bestTrick.name : '—';
  ui.resultTricks.textContent = String(game.tricksLanded);
  ui.resultLetters.textContent = `${game.letters.size} / 5`;
  ui.resultBest.textContent = fmt(game.best);
  ui.newBest.classList.toggle('hidden', !isBest);
  ui.resultsTitle.textContent = final >= 18000 ? 'LEGENDARY LINE.' : final >= 7000 ? 'NICE LINE.' : 'KEEP PUSHING.';
  ui.results.classList.remove('hidden');
  audio.end();
}

function backToMenu() {
  game.mode = 'menu';
  document.body.classList.add('in-menu');
  document.body.classList.remove('in-results', 'in-pause');
  ui.results.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.start.classList.remove('hidden');
  resetRun();
  ui.startBest?.classList.remove('hidden');
  updateBestText();
  updateMenuCamera(0, true);
}

/* ================================================================ trick / score helpers */

function bankNow() {
  if (game.bank <= 0) { game.bank = 0; return; }
  game.score += Math.round(game.bank);
  game.bank = 0;
  game.mult = 1;
  game.comboTimer = 0;
  ui.combo.classList.add('hidden');
}

function loseCombo() {
  const lost = Math.round(game.bank);
  game.bank = 0;
  game.mult = 1;
  game.comboTimer = 0;
  ui.combo.classList.add('hidden');
  return lost;
}

function registerTrick(def) {
  const gained = Math.round(def.points * game.mult);
  game.bank += gained;
  game.mult = Math.min(8, Math.round((game.mult + 0.25) * 100) / 100);
  game.comboTimer = game.comboMax;
  if (def.points > game.bestTrick.points) game.bestTrick = { name: def.name, points: def.points };
  addTrickFeed(def.name, gained);
  audio.trick();
  fx.trick(phys.x, phys.y + 0.8, phys.z);
  skater.playTrick(def);
  if (navigator.vibrate) navigator.vibrate(8);
}

function setAir(vy, silent = false) {
  phys.grounded = false;
  phys.vy = vy;
  phys.y = Math.max(phys.y, heightAt(phys.x, phys.z)) + 0.03;
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.charging = false;
  phys.charge = 0;
  phys.manual = false;
  phys.grabTime = 0;
  phys.grabLabeled = false;
  phys.grind = null;
  skater.clearTrick();
  if (!silent) {
    audio.ollie(0.4);
    fx.land(phys.x, phys.y, phys.z, 0.45);
    input.rumble(0.18, 0.25, 60);
  }
}

function jumpNow(vy) {
  if (!phys.grounded) return;
  setAir(vy);
}

function startManual() {
  phys.manual = true;
  phys.manualBalance = 0;
  phys.manualTime = 0;
  game.comboTimer = game.comboMax;
  game.bank += Math.round(45 * game.mult);
  game.mult = Math.min(8, Math.round((game.mult + 0.15) * 100) / 100);
  addTrickFeed('MANUAL', 45);
  audio.trick();
}

function endManual() {
  phys.manual = false;
  phys.manualBalance = 0;
  game.comboTimer = game.comboMax;
}

function startBail(reason = '') {
  if (game.bailing > 0) return;
  const lost = loseCombo();
  game.bailing = 1.65;
  game.bailTimer = 0;
  phys.grind = null;
  phys.manual = false;
  phys.charging = false;
  phys.charge = 0;
  phys.grabTime = 0;
  skater.clearTrick();
  audio.bail();
  input.rumble(1, 0.8, 260);
  cam.shake = 0.7;
  fx.land(phys.x, phys.y, phys.z, 1.6);
  showToast('BAILED', lost > 0 ? `${fmt(lost)} POINTS LOST` : reason, 'bail', 1400);
  flashScreen();
  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
}

function respawn() {
  phys.x = phys.safe.x;
  phys.z = phys.safe.z;
  phys.y = heightAt(phys.x, phys.z);
  phys.heading = phys.safe.heading;
  phys.vx = 0; phys.vz = 0; phys.vy = 0;
  phys.grounded = true;
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.grind = null;
  phys.manual = false;
  phys.manualBalance = 0;
  phys.charging = false;
  phys.charge = 0;
  phys.grabTime = 0;
  game.bailing = 0;
  game.bailTimer = 0;
  skater.clearTrick();
  skater.reset(phys.x, phys.y, phys.z, phys.heading);
  snapCamera();
  showToast('ROLL AWAY', 'SHAKE IT OFF', '', 900);
}

function flashScreen() {
  ui.flash.classList.add('on');
  setTimeout(() => ui.flash.classList.remove('on'), 90);
}

/* ================================================================ input action handling */

function handleFlicks(flicks) {
  for (const f of flicks) {
    if (f === 'down') {
      if (phys.grounded && !phys.grind) {
        if (phys.manual) endManual();
        else startManual();
      }
      continue;
    }

    if (phys.grind) continue;

    if (phys.grounded) {
      if (f === 'up') {
        jumpNow(6.2);
        continue;
      }
      jumpNow(6.1);
      const key = FLICK_MAP[f];
      if (key && phys.airTricks < 4) {
        phys.airTricks++;
        registerTrick(TRICKS[key]);
      }
      continue;
    }

    if (f === 'up') continue;
    const key = FLICK_MAP[f];
    if (key && phys.airTricks < 4) {
      phys.airTricks++;
      registerTrick(TRICKS[key]);
    }
  }
}

function handleJump(acts, dt) {
  if (acts.jumpPressed) {
    if (phys.grind) {
      popOffRail(6.6);
    } else if (phys.grounded) {
      if (phys.manual) endManual();
      phys.charging = true;
      phys.charge = 0;
    }
  }
  if (phys.charging) {
    phys.charge = Math.min(1, phys.charge + dt * 2.0);
    if (acts.jumpReleased || phys.charge >= 1) {
      const power = 5.5 + phys.charge * 3.3;
      phys.charging = false;
      jumpNow(power);
      audio.ollie(phys.charge);
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }
}

/* ================================================================ physics */

function gradient(x, z) {
  const e = 0.38;
  return {
    x: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    z: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

function stepGround(dt, acts) {
  const m = Math.hypot(acts.mx, acts.my);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const dir = new THREE.Vector3()
    .addScaledVector(forward, acts.my)
    .addScaledVector(right, acts.mx);
  const moveMag = Math.min(1, dir.length());
  if (moveMag > 0.001) dir.normalize();

  let targetHeading = phys.heading;
  if (moveMag > 0.12) targetHeading = Math.atan2(dir.x, dir.z);
  const turnRate = (phys.manual ? 2.2 : 3.3) + Math.min(1.4, speedOf() * 0.06);
  const prevHeading = phys.heading;
  phys.heading = approachAngle(phys.heading, targetHeading, turnRate * dt);
  phys.heading = ((phys.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  const f = { x: Math.sin(phys.heading), z: Math.cos(phys.heading) };
  const r = { x: Math.cos(phys.heading), z: -Math.sin(phys.heading) };

  let vf = phys.vx * f.x + phys.vz * f.z;
  let vl = phys.vx * r.x + phys.vz * r.z;

  if (moveMag > 0.08) {
    const accel = (phys.manual ? 2.2 : 4.6) + (acts.boost ? 4.8 : 0);
    vf += accel * moveMag * dt;
    if (acts.boost) vf += 2.5 * dt;
  } else {
    vf *= Math.exp(-0.32 * dt);
  }
  vf *= Math.exp(-0.11 * dt);
  vl *= Math.exp(-5.4 * dt);

  const g = gradient(phys.x, phys.z);
  const gsq = 1 + g.x * g.x + g.z * g.z;
  const ax = -SLOPE_GRAVITY * g.x / gsq;
  const az = -SLOPE_GRAVITY * g.z / gsq;
  vf += (ax * f.x + az * f.z) * dt;
  vl += (ax * r.x + az * r.z) * dt;

  const maxForward = (acts.boost ? 18 : 14.5);
  vf = clamp(vf, -7, maxForward);

  phys.vx = f.x * vf + r.x * vl;
  phys.vz = f.z * vf + r.z * vl;

  const ox = phys.x, oz = phys.z;
  let nx = phys.x + phys.vx * dt;
  let nz = phys.z + phys.vz * dt;

  const b = 0.4;
  if (nx < PARK.minX + b) { nx = PARK.minX + b; phys.vx *= -0.1; wallHit(); }
  if (nx > PARK.maxX - b) { nx = PARK.maxX - b; phys.vx *= -0.1; wallHit(); }
  if (nz < PARK.minZ + b) { nz = PARK.minZ + b; phys.vz *= -0.1; wallHit(); }
  if (nz > PARK.maxZ - b) { nz = PARK.maxZ - b; phys.vz *= -0.1; wallHit(); }

  const currentH = phys.y;
  const nh = heightAt(nx, nz);
  const maxStep = currentH > 0.45 ? 1.6 : 0.8;
  if (nh - currentH > maxStep) {
    // ledge / wall face: don't climb it
    nx = ox;
    nz = oz;
    phys.vx *= 0.15;
    phys.vz *= 0.15;
    wallHit();
  }

  phys.x = nx;
  phys.z = nz;

  // launch lips
  if (tryLaunch()) return;

  const H = heightAt(phys.x, phys.z);
  if (H < phys.y - 0.5) {
    // rolled off a lip or ledge
    phys.grounded = false;
    phys.vy = Math.max(0, phys.vy);
    phys.airTime = 0;
    phys.airTricks = 0;
    phys.spin = 0;
    return;
  }
  phys.y = H;

  // terrain pitch for the skater
  const ahead = heightAt(phys.x + f.x * 0.7, phys.z + f.z * 0.7);
  const behind = heightAt(phys.x - f.x * 0.7, phys.z - f.z * 0.7);
  phys.slopePitch = Math.atan2(ahead - behind, 1.4);
  const lx = heightAt(phys.x + r.x * 0.7, phys.z + r.z * 0.7);
  const rx = heightAt(phys.x - r.x * 0.7, phys.z - r.z * 0.7);
  phys.slopeRoll = Math.atan2(rx - lx, 1.4);

  const turnDelta = angleDelta(prevHeading, phys.heading);
  phys.lean += (clamp(-turnDelta / Math.max(0.001, dt) * 0.12 + vl * 0.035, -1, 1) - phys.lean) * Math.min(1, dt * 9);

  const spd = speedOf();
  phys.crouch += (((phys.charging ? 0.55 + phys.charge * 0.4 : 0) + (phys.manual ? 0.18 : 0) + (phys.grind ? 0.25 : 0)) - phys.crouch) * Math.min(1, dt * 10);

  // push feedback
  if (moveMag > 0.35 && spd < maxForward - 1) {
    phys.pushTimer -= dt;
    if (phys.pushTimer <= 0) {
      phys.pushTimer = 0.55;
      audio.push();
      if (navigator.vibrate) navigator.vibrate(4);
    }
  }

  // safe respawn point update
  phys.safeTimer += dt;
  if (H < 0.22 && !phys.manual && phys.safeTimer > 0.4) {
    phys.safeTimer = 0;
    phys.safe.x = phys.x;
    phys.safe.z = phys.z;
    phys.safe.heading = phys.heading;
  }

  // manual balance
  if (phys.manual) {
    phys.manualTime += dt;
    phys.manualBalance += (acts.mx * 0.95 + Math.sin(phys.manualTime * 2.4) * 0.09) * dt;
    game.bank += 34 * game.mult * dt;
    game.comboTimer = game.comboMax;
    if (Math.abs(phys.manualBalance) > 1 || phys.manualTime > 7.5) {
      startBail('manual balance');
    }
  }
}

function wallHit() {
  phys.wallTimer += 1;
  if (phys.wallTimer > 3) {
    phys.wallTimer = 0;
    audio.land(2);
    input.rumble(0.3, 0.1, 40);
  }
}

function tryLaunch() {
  const spd = speedOf();
  if (spd < 3.4) return false;
  for (const pad of world.launchPads) {
    const dx = pad.bx - pad.ax, dz = pad.bz - pad.az;
    const len2 = dx * dx + dz * dz;
    let t = ((phys.x - pad.ax) * dx + (phys.z - pad.az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = pad.ax + dx * t, pz = pad.az + dz * t;
    const dist = Math.hypot(phys.x - px, phys.z - pz);
    if (dist > 0.85) continue;
    const outward = phys.vx * pad.nx + phys.vz * pad.nz;
    if (outward < 1.2) continue;
    if (phys.y < pad.y - 1.1) continue;

    const vm = speedOf();
    if (pad.type === 'quarter') {
      phys.vx -= pad.nx * (outward * 1.12);
      phys.vz -= pad.nz * (outward * 1.12);
      phys.y = Math.max(phys.y, pad.y - 0.12);
      setAir(4.6 + vm * 0.23, true);
      audio.ollie(0.5);
      fx.land(phys.x, phys.y, phys.z, 0.8);
      input.rumble(0.2, 0.3, 60);
      showToast('AIR', 'QUARTER PIPE', '', 650);
    } else {
      phys.y = Math.max(phys.y, pad.y - 0.08);
      setAir(4.3 + vm * 0.55, true);
      audio.ollie(0.7);
      fx.land(phys.x, phys.y, phys.z, 0.7);
      input.rumble(0.35, 0.3, 80);
    }
    return true;
  }
  return false;
}

function stepAir(dt, acts) {
  phys.airTime += dt;
  phys.vy -= GRAVITY * dt;
  phys.x += phys.vx * dt;
  phys.z += phys.vz * dt;

  const b = 0.35;
  if (phys.x < PARK.minX + b) { phys.x = PARK.minX + b; phys.vx = Math.abs(phys.vx) * 0.25; }
  if (phys.x > PARK.maxX - b) { phys.x = PARK.maxX - b; phys.vx = -Math.abs(phys.vx) * 0.25; }
  if (phys.z < PARK.minZ + b) { phys.z = PARK.minZ + b; phys.vz = Math.abs(phys.vz) * 0.25; }
  if (phys.z > PARK.maxZ - b) { phys.z = PARK.maxZ - b; phys.vz = -Math.abs(phys.vz) * 0.25; }

  phys.y += phys.vy * dt;

  // spin with left stick while airborne
  if (Math.abs(acts.mx) > 0.32) {
    const delta = acts.mx * 4.4 * dt;
    phys.heading += delta;
    phys.spin += delta;
  }
  phys.lean += ((-acts.mx * 0.8) - phys.lean) * Math.min(1, dt * 6);

  // grab
  if (acts.grab && phys.vy < 3.5) {
    phys.grabTime += dt;
    game.bank += 26 * game.mult * dt;
    game.comboTimer = game.comboMax;
    if (phys.grabTime > 0.35 && !phys.grabLabeled) {
      phys.grabLabeled = true;
      addTrickFeed('INDY GRAB', Math.round(26 * game.mult), false);
    }
  } else {
    phys.grabLabeled = false;
  }

  // catch a rail on the way down
  if (phys.vy < 1.6 && !phys.grind) {
    const rail = findRail();
    if (rail) {
      enterGrind(rail);
      return;
    }
  }

  const H = heightAt(phys.x, phys.z);
  if (phys.y <= H + 0.015 && phys.vy <= 0) {
    const impact = -phys.vy;
    phys.y = H;
    land(impact);
  }
}

function findRail() {
  let best = null;
  let bestD = Infinity;
  for (const rail of world.rails) {
    if (phys.y < rail.y - 0.35 || phys.y > rail.y + 1.15) continue;
    const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
    const len2 = dx * dx + dz * dz;
    let t = ((phys.x - rail.ax) * dx + (phys.z - rail.az) * dz) / len2;
    if (t < -0.03 || t > 1.03) continue;
    t = clamp(t, 0, 1);
    const px = rail.ax + dx * t, pz = rail.az + dz * t;
    const dist = Math.hypot(phys.x - px, phys.z - pz);
    const maxDist = (rail.width || 0.55) + 0.42;
    if (dist < maxDist && dist < bestD) {
      bestD = dist;
      best = { rail, t };
    }
  }
  return best;
}

function enterGrind(found) {
  const rail = found.rail;
  const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
  const len = Math.hypot(dx, dz);
  const dirx = dx / len, dirz = dz / len;
  const sign = (phys.vx * dirx + phys.vz * dirz) >= 0 ? 1 : -1;
  const spd = Math.max(3, speedOf());

  phys.grind = {
    rail, t: found.t, sign, speed: spd, balance: 0, time: 0,
    dirx, dirz, len,
  };
  phys.grounded = false;
  phys.vy = 0;
  phys.y = rail.y + 0.02;
  phys.x = rail.ax + dx * found.t;
  phys.z = rail.az + dz * found.t;
  phys.heading = Math.atan2(dirx * sign, dirz * sign);
  phys.vx = dirx * sign * spd;
  phys.vz = dirz * sign * spd;
  phys.spin = 0;
  phys.airTricks = 0;
  phys.airTime = 0;
  phys.manual = false;
  phys.charge = 0;
  phys.charging = false;
  skater.clearTrick();

  game.bank += Math.round(70 * game.mult);
  game.mult = Math.min(8, Math.round((game.mult + 0.2) * 100) / 100);
  game.comboTimer = game.comboMax;
  addTrickFeed('50-50 GRIND', 70);
  if (game.bestTrick.points < 70) game.bestTrick = { name: '50-50 GRIND', points: 70 };
  audio.grindStart();
  input.rumble(0.35, 0.2, 90);
  fx.land(phys.x, phys.y, phys.z, 0.8);
  showToast('LOCKED IN', 'BALANCE WITH THE LEFT STICK', '', 900);
}

function stepGrind(dt, acts) {
  const gr = phys.grind;
  if (!gr) return;
  gr.time += dt;
  gr.speed = Math.max(2.4, gr.speed - 0.12 * dt);
  gr.t += gr.sign * gr.speed * dt / gr.len;

  if (gr.t < 0 || gr.t > 1) {
    exitGrind();
    return;
  }

  const rail = gr.rail;
  const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
  phys.x = rail.ax + dx * gr.t;
  phys.z = rail.az + dz * gr.t;
  phys.y = rail.y + 0.02;
  phys.heading = Math.atan2(gr.dirx * gr.sign, gr.dirz * gr.sign);
  phys.vx = gr.dirx * gr.sign * gr.speed;
  phys.vz = gr.dirz * gr.sign * gr.speed;
  phys.lean = clamp(gr.balance * 0.8, -1, 1);

  gr.balance += (acts.mx * 1.15 + Math.sin(gr.time * 2.6) * 0.075) * dt;
  if (Math.abs(gr.balance) > 1) {
    startBail('balance');
    return;
  }

  game.bank += 58 * game.mult * dt;
  game.comboTimer = game.comboMax;

  if (Math.random() < 0.7) fx.grindSparks(phys.x, phys.y, phys.z, phys.vx, phys.vz);

  if (acts.jumpPressed) {
    popOffRail(6.4);
  }
}

function popOffRail(vy) {
  if (!phys.grind) return;
  const spd = phys.grind.speed;
  const hx = phys.heading;
  phys.grind = null;
  phys.grounded = false;
  phys.vy = vy;
  phys.y += 0.05;
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.vx = Math.sin(hx) * spd;
  phys.vz = Math.cos(hx) * spd;
  audio.ollie(0.5);
  fx.trick(phys.x, phys.y, phys.z);
  input.rumble(0.3, 0.25, 80);
}

function exitGrind() {
  if (!phys.grind) return;
  const gr = phys.grind;
  const rail = gr.rail;
  phys.x = clamp(phys.x, rail.ax - 0.2, rail.bx + 0.2);
  phys.z = clamp(phys.z, rail.az - 0.2, rail.bz + 0.2);
  phys.grind = null;
  phys.grounded = false;
  phys.vy = 2.7;
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.vx = gr.dirx * gr.sign * gr.speed;
  phys.vz = gr.dirz * gr.sign * gr.speed;
  game.comboTimer = game.comboMax;
}

function land(impact) {
  const air = phys.airTime;
  const spinDeg = Math.abs(phys.spin) * 180 / Math.PI;
  const grabTime = phys.grabTime;

  phys.grounded = true;
  phys.vy = 0;
  phys.y = heightAt(phys.x, phys.z);
  phys.grind = null;

  if (air > 0.18) {
    const bonus = Math.round(air * 62 * game.mult);
    if (bonus > 0) game.bank += bonus;
    if (spinDeg >= 150) {
      const n = Math.max(1, Math.round(spinDeg / 180));
      const pts = Math.round(n * 120 * game.mult);
      game.bank += pts;
      game.mult = Math.min(8, Math.round((game.mult + 0.25) * 100) / 100);
      addTrickFeed(`${n * 180} SPIN`, pts);
      if (game.bestTrick.points < pts) game.bestTrick = { name: `${n * 180} SPIN`, points: pts };
    }
    if (grabTime > 0.35) {
      const pts = Math.round(grabTime * 140 * game.mult);
      game.bank += pts;
      addTrickFeed('GRAB LANDED', pts);
      if (game.bestTrick.points < pts) game.bestTrick = { name: 'INDY GRAB', points: pts };
    }
    if (air > 1.15) showToast('BIG AIR', `+${fmt(bonus)} AIR BONUS`, '', 800);
    audio.land(impact);
    fx.land(phys.x, phys.y, phys.z, clamp(impact / 8, 0.4, 2));
    input.rumble(clamp(impact / 20, 0.2, 1), 0.25, 110);
    cam.shake = Math.max(cam.shake, clamp(impact / 28, 0.05, 0.55));
    if (impact > 24) {
      startBail('heavy landing');
      return;
    }
  }

  phys.heading = Math.round(phys.heading / (Math.PI / 2)) * (Math.PI / 2);
  phys.airTime = 0;
  phys.airTricks = 0;
  phys.spin = 0;
  phys.grabTime = 0;
  phys.grabLabeled = false;
  skater.clearTrick();
  game.comboTimer = Math.max(game.comboTimer, game.comboMax);
}

function stepBail(dt) {
  game.bailTimer += dt;
  game.bailing -= dt;
  phys.vy -= GRAVITY * dt;
  phys.x += phys.vx * dt;
  phys.z += phys.vz * dt;
  phys.vx *= Math.exp(-2.5 * dt);
  phys.vz *= Math.exp(-2.5 * dt);
  phys.y += phys.vy * dt;
  const H = heightAt(phys.x, phys.z);
  if (phys.y < H) {
    phys.y = H;
    if (phys.vy < -6) fx.land(phys.x, phys.y, phys.z, 1.2);
    phys.vy = 0;
  }
  phys.heading += dt * 1.5 * Math.sin(game.bailTimer * 3);
  if (game.bailing <= 0) respawn();
}

function physicsStep(dt, acts, first) {
  if (game.bailing > 0) { stepBail(dt); return; }

  if (first) {
    handleFlicks(acts.flicks);
  }
  handleJump({
    ...acts,
    jumpPressed: first && acts.jumpPressed,
    jumpReleased: first && acts.jumpReleased,
  }, dt);

  if (phys.grind) {
    stepGrind(dt, acts);
  } else if (!phys.grounded) {
    stepAir(dt, acts);
  } else {
    stepGround(dt, acts);
  }

  if (phys.grounded) {
    phys.airTime = 0;
    phys.spin = 0;
  }
}

/* ================================================================ camera */

function snapCamera() {
  const h = phys.heading;
  cam.yaw = h;
  const portrait = camera.aspect < 0.85 ? 1 : 0;
  const dist = 7.6 + portrait * 1.5;
  const fx = Math.sin(h), fz = Math.cos(h);
  cam.pos.set(phys.x - fx * dist, phys.y + 4.2 + portrait * 0.5, phys.z - fz * dist);
  cam.target.set(phys.x + fx * 3.6, phys.y + 1.25, phys.z + fz * 3.6);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.target);
  camera.fov = 60 + portrait * 7;
  camera.updateProjectionMatrix();
  cam.snap = false;
  cam.shake = 0;
}

function updateCamera(dt) {
  if (game.mode === 'menu') {
    const t = game.elapsed * 0.055;
    const r = 26;
    const px = Math.sin(t) * r;
    const pz = Math.cos(t) * r + 4;
    cam.pos.lerp(new THREE.Vector3(px, 8.6 + Math.sin(t * 1.7) * 1.2, pz), 1 - Math.exp(-1.8 * dt));
    cam.target.lerp(new THREE.Vector3(0, 1.4, 0), 1 - Math.exp(-2.5 * dt));
    camera.position.copy(cam.pos);
    if (cam.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.2;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.2;
    }
    camera.lookAt(cam.target);
    cam.shake *= Math.exp(-3 * dt);
    return;
  }

  if (game.mode === 'results') {
    const t = game.elapsed * 0.12;
    const r = 9;
    cam.pos.lerp(new THREE.Vector3(phys.x + Math.sin(t) * r, phys.y + 3.4, phys.z + Math.cos(t) * r), 1 - Math.exp(-2 * dt));
    cam.target.lerp(new THREE.Vector3(phys.x, phys.y + 1.1, phys.z), 1 - Math.exp(-3 * dt));
    camera.position.copy(cam.pos);
    camera.lookAt(cam.target);
    return;
  }

  const spd = speedOf();
  let travelYaw = phys.heading;
  if (spd > 1.4) travelYaw = Math.atan2(phys.vx, phys.vz);
  if (phys.grind) travelYaw = Math.atan2(phys.vx, phys.vz);
  const rate = 1 - Math.exp(-3.2 * dt);
  cam.yaw = lerpAngle(cam.yaw, travelYaw, rate);

  const portrait = camera.aspect < 0.85 ? 1 : 0;
  const f = { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) };
  const dist = 7.4 + Math.min(2.6, spd * 0.14) + (phys.grounded ? 0 : 0.5) + portrait * 1.5;
  const height = 4.0 + Math.min(1.0, spd * 0.04) + (phys.grounded ? 0 : 0.5) + portrait * 0.5;
  const desired = new THREE.Vector3(
    phys.x - f.x * dist,
    Math.max(phys.y + height, heightAt(phys.x - f.x * dist, phys.z - f.z * dist) + 1.3),
    phys.z - f.z * dist
  );
  const look = new THREE.Vector3(
    phys.x + f.x * (3.1 + Math.min(2.2, spd * 0.12)),
    phys.y + 1.15 + (phys.grounded ? 0 : 0.25),
    phys.z + f.z * (3.1 + Math.min(2.2, spd * 0.12))
  );

  const follow = 1 - Math.exp(-6.2 * dt);
  cam.pos.lerp(desired, follow);
  cam.target.lerp(look, 1 - Math.exp(-9 * dt));

  camera.position.copy(cam.pos);
  if (cam.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake * 0.7;
    camera.position.z += (Math.random() - 0.5) * cam.shake;
    cam.shake *= Math.exp(-5 * dt);
  }
  camera.lookAt(cam.target);

  const targetFov = 58 + Math.min(12, spd * 0.55) + (phys.grounded ? 0 : 2.2) + (camera.aspect < 0.85 ? 7 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

/* ================================================================ letters + main tick */

function checkLetters() {
  if (game.bailing > 0) return;
  const px = phys.x, py = phys.y + 0.8, pz = phys.z;
  for (const l of world.letters) {
    if (l.collected) continue;
    const dx = px - l.group.position.x;
    const dy = py - l.group.position.y;
    const dz = pz - l.group.position.z;
    if (Math.hypot(dx, dy, dz) < 1.75) {
      l.collected = true;
      l.group.visible = false;
      game.letters.add(l.ch);
      const gained = Math.round(650 * game.mult);
      game.bank += gained;
      game.mult = Math.min(8, Math.round((game.mult + 0.3) * 100) / 100);
      game.comboTimer = game.comboMax;
      fx.burst(l.group.position.x, l.group.position.y, l.group.position.z);
      audio.pickup(true);
      input.rumble(0.2, 0.5, 100);
      const all = game.letters.size === 5;
      if (all) {
        const bonus = Math.round(3000 * game.mult);
        game.bank += bonus;
        showToast('ALL LETTERS', `+${fmt(gained + bonus)} · BONUS`, '', 1600);
        flashScreen();
      } else {
        showToast(`${l.ch} COLLECTED`, `${game.letters.size} / 5 · +${fmt(gained)}`, '', 1000);
      }
      updateHUD();
    }
  }
}

function updateGame(dt) {
  game.timeLeft -= dt;
  if (game.timeLeft <= 10.2) {
    const sec = Math.ceil(game.timeLeft);
    if (sec !== game.lastSecond && sec > 0) {
      game.lastSecond = sec;
      audio.tick();
    }
  }
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    updateHUD();
    finishGame();
    return;
  }

  const acts = {
    mx: input.moveX,
    my: input.moveY,
    jumpPressed: input.jumpPressed,
    jumpReleased: input.jumpReleased,
    grab: input.grab,
    boost: input.boost,
    flicks: input.flicks.slice(),
  };

  const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.017)));
  const sub = dt / steps;

  for (let i = 0; i < steps; i++) {
    physicsStep(sub, acts, i === 0);
    if (game.mode !== 'playing') return;
  }

  // combo window
  if (game.bank > 0 && phys.grounded && !phys.grind && !phys.manual && game.bailing <= 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) bankNow();
  }

  if (!phys.grounded && !phys.grind) {
    // in air; keep combo alive
    game.comboTimer = game.comboMax;
  }

  checkLetters();
  audio.updateRolling(speedOf(), phys.grounded, !!phys.grind);
  updateHUD();

  // skater visual state
  const visualAir = phys.grounded || phys.grind ? 0 : 1;
  const visual = {
    x: phys.x,
    y: phys.y,
    z: phys.z,
    heading: phys.heading,
    speed: speedOf(),
    air: visualAir,
    crouch: clamp(phys.crouch + (phys.charging ? 0.2 : 0) + (phys.grind ? 0.22 : 0), 0, 1.2),
    lean: phys.lean,
    balance: phys.grind ? phys.grind.balance : (phys.manual ? phys.manualBalance : 0),
    grinding: !!phys.grind,
    manual: phys.manual,
    grab: input.grab && !phys.grounded,
    bail: game.bailing > 0 ? 1 : 0,
    bailTime: game.bailTimer,
    charging: phys.charging,
    slopePitch: phys.slopePitch,
    slopeRoll: phys.slopeRoll,
    groundY: heightAt(phys.x, phys.z),
  };
  skater.update(dt, visual);
}

/* ================================================================ loop */

let last = performance.now();
let menuInit = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!Number.isFinite(dt)) dt = 0.016;
  dt = Math.min(0.05, Math.max(0.0001, dt));
  game.elapsed += dt;

  input.update(dt);

  if (input.pausePressed) {
    if (game.mode === 'playing') pauseGame();
    else if (game.mode === 'paused') resumeGame();
  }

  if (game.mode === 'playing') {
    updateGame(dt);
  } else if (game.mode === 'paused') {
    // keep the world alive but freeze the run
    skater.update(0, {
      x: phys.x, y: phys.y, z: phys.z, heading: phys.heading, speed: 0,
      air: 0, crouch: phys.crouch, lean: phys.lean, balance: 0,
      grinding: false, manual: phys.manual, grab: false, bail: 0, bailTime: 0,
      charging: false, slopePitch: phys.slopePitch, slopeRoll: phys.slopeRoll,
      groundY: heightAt(phys.x, phys.z),
    });
    audio.stopAll();
  } else if (game.mode === 'menu') {
    if (!menuInit) { menuInit = true; updateMenuCamera(0, true); }
    skater.update(dt, {
      x: PARK.spawn.x, y: heightAt(PARK.spawn.x, PARK.spawn.z), z: PARK.spawn.z,
      heading: PARK.spawn.heading + Math.sin(game.elapsed * 0.4) * 0.25,
      speed: 0, air: 0, crouch: 0.08, lean: 0, balance: 0,
      grinding: false, manual: false, grab: false, bail: 0, bailTime: 0,
      charging: false, slopePitch: 0, slopeRoll: 0,
      groundY: heightAt(PARK.spawn.x, PARK.spawn.z),
    });
  } else if (game.mode === 'results') {
    skater.update(dt, {
      x: phys.x, y: phys.y, z: phys.z, heading: phys.heading, speed: 0,
      air: 0, crouch: 0.1, lean: 0, balance: 0,
      grinding: false, manual: false, grab: false, bail: 0, bailTime: 0,
      charging: false, slopePitch: 0, slopeRoll: 0,
      groundY: heightAt(phys.x, phys.z),
    });
  }

  world.update(dt, game.elapsed);
  fx.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  input.endFrame();
}

function updateMenuCamera(dt, snap = false) {
  if (snap) {
    cam.pos.set(18, 8.6, 24);
    cam.target.set(0, 1.4, 0);
  }
}

/* ================================================================ events / wiring */

$('start-btn').addEventListener('click', startGame);
$('replay-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', backToMenu);
$('resume-btn').addEventListener('click', resumeGame);
$('quit-btn').addEventListener('click', () => { pauseGame(); finishGame(); });
$('pause-btn').addEventListener('click', pauseGame);
$('mute-btn').addEventListener('click', () => {
  audio.ensure();
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.mute.classList.toggle('muted', muted);
  ui.mute.textContent = muted ? '×' : '♪';
  try { localStorage.setItem('skate-shift-muted', muted ? '1' : '0'); } catch { /* ignore */ }
});

window.addEventListener('keydown', e => {
  if (e.code === 'KeyR' && game.mode !== 'playing') {
    // R only acts as a trick while riding; outside a run it restarts.
    if (game.mode === 'results') startGame();
  }
  if (e.code === 'Enter') {
    if (game.mode === 'menu' || game.mode === 'results') startGame();
    else if (game.mode === 'paused') resumeGame();
  }
});

window.addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  updateCoarse();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') pauseGame();
});

// initial mute preference
try {
  if (localStorage.getItem('skate-shift-muted') === '1') {
    audio.muted = true;
    ui.mute.classList.add('muted');
    ui.mute.textContent = '×';
  }
} catch { /* ignore */ }

// initial pad readout
try {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(p => p && p.connected);
  if (pad) {
    input.padIndex = pad.index;
    input.padName = pad.id;
    input.onPadChange?.(true, pad.id);
  }
} catch { /* ignore */ }

updateCoarse();
updateHUD();
updateBestText();
updateMenuCamera(0, true);
document.body.classList.add('in-menu');
requestAnimationFrame(frame);

// debug/test hook — harmless in production, useful for automated checks
window.__skate = {
  game, phys, input, world, camera, skater, renderer, scene,
  startGame, resetRun, finishGame, backToMenu,
  flick: d => input.flicks.push(d),
  jump: () => { input.jumpPressed = true; input.jumpHeld = true; setTimeout(() => { input.jumpReleased = true; input.jumpHeld = false; }, 80); },
  press: code => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
  release: code => window.dispatchEvent(new KeyboardEvent('keyup', { code })),
  teleport: (x, z, heading = phys.heading) => {
    phys.x = x; phys.z = z; phys.y = heightAt(x, z); phys.vx = phys.vz = phys.vy = 0;
    phys.heading = heading; phys.grounded = true; phys.grind = null; snapCamera();
  },
};
