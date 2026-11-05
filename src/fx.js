import * as THREE from '../vendor/three.module.js';

/* Small sprite particle pools for dust, sparks and letter bursts. */

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, inner.replace('1)', '0.55)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function squareTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(6, 6, 52, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Pool {
  constructor(scene, texture, count, blending = THREE.NormalBlending) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, opacity: 1, depthWrite: false,
        blending, toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.items.push({ sprite, material, life: 0, maxLife: 0, vel: new THREE.Vector3(), size: 0.2, gravity: 0, drag: 0.5 });
    }
    this.cursor = 0;
  }

  spawn(x, y, z, opts = {}) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.sprite.visible = true;
    it.sprite.position.set(x, y, z);
    it.life = it.maxLife = opts.life || 0.5;
    it.vel.set(
      (Math.random() - 0.5) * (opts.spread || 3) + (opts.vx || 0),
      Math.random() * (opts.up || 2) + (opts.vy || 0),
      (Math.random() - 0.5) * (opts.spread || 3) + (opts.vz || 0)
    );
    it.size = opts.size || 0.5;
    it.gravity = opts.gravity ?? -3;
    it.drag = opts.drag ?? 1.5;
    it.material.color.set(opts.color || 0xffffff);
    it.material.opacity = opts.opacity ?? 0.8;
    it.sprite.scale.setScalar(it.size);
    it.baseOpacity = it.material.opacity;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.sprite.visible) continue;
      it.life -= dt;
      if (it.life <= 0) { it.sprite.visible = false; continue; }
      const damp = Math.exp(-it.drag * dt);
      it.vel.multiplyScalar(damp);
      it.vel.y += it.gravity * dt;
      it.sprite.position.addScaledVector(it.vel, dt);
      const t = it.life / it.maxLife;
      it.material.opacity = it.baseOpacity * Math.min(1, t * 1.8);
      it.sprite.scale.setScalar(it.size * (0.5 + (1 - t) * 1.3));
    }
  }
}

export class FX {
  constructor(scene) {
    this.dustTex = radialTexture('rgba(232,218,192,1)', 'rgba(232,218,192,0)');
    this.sparkTex = radialTexture('rgba(255,214,120,1)', 'rgba(255,140,40,0)');
    this.dust = new Pool(scene, this.dustTex, 70);
    this.sparks = new Pool(scene, this.sparkTex, 80, THREE.AdditiveBlending);
    this.letters = new Pool(scene, squareTexture('#d7ff3f'), 40);
  }

  land(x, y, z, power = 1) {
    const n = Math.round(4 + power * 5);
    for (let i = 0; i < n; i++) {
      this.dust.spawn(x + (Math.random() - 0.5) * 0.7, y + 0.08, z + (Math.random() - 0.5) * 0.7, {
        spread: 2.4 * power, up: 0.8 * power, size: 0.35 + Math.random() * 0.5,
        life: 0.45 + Math.random() * 0.35, opacity: 0.45, gravity: -1.2, drag: 2.4,
      });
    }
  }

  grindSparks(x, y, z, vx, vz) {
    for (let i = 0; i < 2; i++) {
      this.sparks.spawn(x + (Math.random() - 0.5) * 0.25, y + 0.03, z + (Math.random() - 0.5) * 0.25, {
        vx: -vx * 0.25 + (Math.random() - 0.5) * 2, vy: 0.7 + Math.random() * 1.8, vz: -vz * 0.25 + (Math.random() - 0.5) * 2,
        size: 0.12 + Math.random() * 0.12, life: 0.22 + Math.random() * 0.28, opacity: 1, gravity: -11, drag: 0.8,
      });
    }
  }

  trick(x, y, z) {
    for (let i = 0; i < 5; i++) {
      this.sparks.spawn(x + (Math.random() - 0.5) * 0.6, y + 0.15, z + (Math.random() - 0.5) * 0.6, {
        spread: 2.2, up: 1.4, size: 0.1 + Math.random() * 0.12, life: 0.3, opacity: 0.7, gravity: -4, drag: 1.2,
      });
    }
  }

  burst(x, y, z, color = 0xd7ff3f) {
    for (let i = 0; i < 22; i++) {
      this.letters.spawn(x, y, z, {
        spread: 6, up: 5, size: 0.14 + Math.random() * 0.2, life: 0.7 + Math.random() * 0.6,
        color, opacity: 1, gravity: -5, drag: 1.1,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.sparks.spawn(x, y, z, {
        spread: 5, up: 4, size: 0.16, life: 0.5, opacity: 0.8, gravity: -3, drag: 0.8,
      });
    }
  }

  update(dt) {
    this.dust.update(dt);
    this.sparks.update(dt);
    this.letters.update(dt);
  }
}
