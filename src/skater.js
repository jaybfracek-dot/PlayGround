import * as THREE from '../vendor/three.module.js';

/* ------------------------------------------------------------------ *
 * Stylised low-poly skater with a board rig that can flip, shuv, spin
 * and tumble. Everything is primitives so it loads instantly.
 * ------------------------------------------------------------------ */

const SKIN = 0xb97c52;
const SKIN_DARK = 0x9c633f;
const HOODIE = 0xff5a1f;
const HOODIE_DARK = 0xd3430e;
const PANTS = 0x23262c;
const SHOE = 0xf1ece0;
const SHOE_SOLE = 0xcfc7b7;
const METAL = 0xb8bbbe;
const DECK = 0x24211d;
const GRIP = 0x171512;
const BEANIE = 0x1a2a33;
const WHEEL = 0xe8dfcd;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.8, metalness: opts.metalness ?? 0, ...opts });
}

function limb(length, radius, material, segments = 8) {
  const group = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 3, segments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  group.add(mesh);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.95, 8, 6), material);
  joint.castShadow = true;
  group.add(joint);
  return { group, mesh, length };
}

function roundedDeckShape(width = 0.78, length = 1.92) {
  const w = width / 2, l = length / 2;
  const s = new THREE.Shape();
  s.moveTo(-w + 0.03, -l + 0.12);
  s.quadraticCurveTo(-w, -l + 0.03, -w + 0.11, -l + 0.01);
  s.lineTo(w - 0.11, -l + 0.01);
  s.quadraticCurveTo(w, -l + 0.03, w - 0.03, -l + 0.12);
  s.lineTo(w + 0.015, -0.5);
  s.quadraticCurveTo(w - 0.01, -0.38, w, -0.28);
  s.lineTo(w, 0.28);
  s.quadraticCurveTo(w - 0.01, 0.38, w + 0.015, 0.5);
  s.lineTo(w - 0.03, l - 0.12);
  s.quadraticCurveTo(w, l - 0.03, w - 0.11, l - 0.01);
  s.lineTo(-w + 0.11, l - 0.01);
  s.quadraticCurveTo(-w, l - 0.03, -w + 0.03, l - 0.12);
  s.lineTo(-w - 0.015, 0.5);
  s.quadraticCurveTo(-w + 0.01, 0.38, -w, 0.28);
  s.lineTo(-w, -0.28);
  s.quadraticCurveTo(-w + 0.01, -0.38, -w - 0.015, -0.5);
  s.closePath();
  return s;
}

export class Skater {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);

    this.boardGroup = new THREE.Group();
    this.boardGroup.position.y = 0.16;
    this.tilt.add(this.boardGroup);

    this.body = new THREE.Group();
    this.tilt.add(this.body);

    this.activeTrick = null;
    this.trickT = 0;
    this.trickDur = 0.58;
    this.wheelSpin = 0;
    this.bob = 0;

    this._buildBoard();
    this._buildBody();
    this._buildContactShadow();

    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    scene.add(this.group);
    this.group.visible = false;
  }

  _buildContactShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.68)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(2.0, 3.1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false,
    });
    this.contactShadow = new THREE.Mesh(geo, mat);
    this.contactShadow.renderOrder = 2;
    this.contactShadow.visible = false;
    this.scene.add(this.contactShadow);
  }

  _buildBoard() {
    const g = this.boardGroup;

    const deckShape = roundedDeckShape();
    const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
      depth: 0.055, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.018, bevelSegments: 2, curveSegments: 7,
    });
    deckGeo.rotateX(-Math.PI / 2);
    const deckMat = new THREE.MeshStandardMaterial({ color: DECK, roughness: 0.6 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.015;
    g.add(deck);

    // grip tape top
    const gripGeo = new THREE.ShapeGeometry(roundedDeckShape(0.73, 1.84), 6);
    gripGeo.rotateX(-Math.PI / 2);
    const grip = new THREE.Mesh(gripGeo, new THREE.MeshStandardMaterial({ color: GRIP, roughness: 1 }));
    grip.position.y = 0.082;
    g.add(grip);

    // underside graphic
    const bottomGeo = new THREE.ShapeGeometry(roundedDeckShape(0.68, 1.78), 5);
    bottomGeo.rotateX(Math.PI / 2);
    const bottom = new THREE.Mesh(bottomGeo, new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.7, side: THREE.DoubleSide }));
    bottom.position.y = -0.005;
    g.add(bottom);

    // nose/tail kick
    for (const side of [-1, 1]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.025, 0.34), deckMat);
      kick.position.set(0, 0.085, side * 0.82);
      kick.rotation.x = side * 0.2;
      g.add(kick);
    }

    // trucks
    for (const z of [-0.62, 0.62]) {
      const truck = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.22), mat(METAL, { metalness: 0.85, roughness: 0.3 }));
      base.position.y = -0.015;
      truck.add(base);
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.12), mat(0x9a9da1, { metalness: 0.8, roughness: 0.35 }));
      hanger.position.y = -0.065;
      truck.add(hanger);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.76, 6), mat(0xcfd2d4, { metalness: 0.9, roughness: 0.25 }));
      axle.rotation.z = Math.PI / 2;
      axle.position.y = -0.075;
      truck.add(axle);
      truck.position.z = z;
      g.add(truck);
    }

    // wheels
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.085, 8);
    hubGeo.rotateZ(Math.PI / 2);
    for (const z of [-0.62, 0.62]) {
      for (const x of [-0.35, 0.35]) {
        const w = new THREE.Mesh(wheelGeo, mat(WHEEL, { roughness: 0.55 }));
        w.position.set(x, -0.075, z);
        g.add(w);
        this.wheels.push(w);
        const hub = new THREE.Mesh(hubGeo, mat(0x6e6a62, { metalness: 0.5, roughness: 0.4 }));
        hub.position.set(x, -0.075, z);
        g.add(hub);
      }
    }
  }

  _buildBody() {
    const b = this.body;

    const pants = mat(PANTS, { roughness: 0.9 });
    const shoe = mat(SHOE, { roughness: 0.68 });
    const hoodie = mat(HOODIE, { roughness: 0.85 });
    const hoodieDark = mat(HOODIE_DARK, { roughness: 0.9 });
    const skin = mat(SKIN, { roughness: 0.85 });
    const beanie = mat(BEANIE, { roughness: 0.95 });

    // pelvis
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.16, 3, 8), pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.position.set(0, 0.92, 0);
    pelvis.castShadow = true;
    b.add(pelvis);

    // torso / hoodie
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.28, 4, 9), hoodie);
    torso.position.set(0, 1.33, 0);
    torso.castShadow = true;
    b.add(torso);

    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 6, 12), hoodieDark);
    hood.position.set(0, 1.53, -0.04);
    hood.rotation.x = Math.PI / 2;
    b.add(hood);

    // zipper + chest slash
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.02), mat(0xb9b4a9));
    zip.position.set(0, 1.31, 0.225);
    b.add(zip);
    const slash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.012), mat(0xd7ff3f, { roughness: 0.6 }));
    slash.position.set(0.08, 1.4, 0.245);
    slash.rotation.z = -0.45;
    b.add(slash);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 7), skin);
    neck.position.set(0, 1.6, 0);
    b.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), skin);
    head.position.set(0, 1.76, 0);
    head.scale.set(0.92, 1.05, 0.95);
    head.castShadow = true;
    b.add(head);

    // beanie
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.172, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), beanie);
    cap.position.set(0, 1.79, 0);
    cap.scale.set(1.02, 0.95, 1.02);
    b.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.06, 12), beanie);
    brim.position.set(0, 1.78, 0);
    b.add(brim);

    // glasses
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.045, 0.05), mat(0x111214, { roughness: 0.25, metalness: 0.2 }));
    glasses.position.set(0, 1.77, 0.15);
    b.add(glasses);

    // backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.17), mat(0x2f3b3f, { roughness: 0.95 }));
    pack.position.set(0, 1.3, -0.26);
    pack.castShadow = true;
    b.add(pack);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.02), mat(0x191c1e));
    strap.position.set(0.14, 1.34, 0.24);
    b.add(strap);

    // legs (front foot towards +z)
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.155, 0.9, side * 0.29);
      const upper = limb(0.4, 0.085, pants);
      upper.group.rotation.x = -0.12;
      hip.add(upper.group);

      const knee = new THREE.Group();
      knee.position.y = -0.4;
      upper.group.add(knee);
      const lower = limb(0.38, 0.072, pants);
      lower.group.rotation.x = 0.28;
      knee.add(lower.group);

      const ankle = new THREE.Group();
      ankle.position.y = -0.38;
      lower.group.add(ankle);

      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.105, 0.35), shoe);
      shoeMesh.position.set(0, 0.045, 0.07);
      shoeMesh.castShadow = true;
      ankle.add(shoeMesh);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.37), mat(SHOE_SOLE, { roughness: 0.9 }));
      sole.position.set(0, -0.015, 0.07);
      ankle.add(sole);

      b.add(hip);
      this.legs.push({ hip, upper, knee, lower, ankle, side });
    }

    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 1.48, 0);
      const upper = limb(0.32, 0.068, hoodie);
      upper.group.rotation.z = side * 0.15;
      shoulder.add(upper.group);

      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      upper.group.add(elbow);
      const lower = limb(0.3, 0.056, hoodieDark);
      lower.group.rotation.x = 0.18;
      elbow.add(lower.group);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), skin);
      hand.position.y = -0.3;
      hand.castShadow = true;
      lower.group.add(hand);

      b.add(shoulder);
      this.arms.push({ shoulder, upper, elbow, lower, hand, side });
    }
  }

  playTrick(def) {
    this.activeTrick = def;
    this.trickT = 0;
    this.trickDur = def.dur || 0.58;
  }

  clearTrick() {
    this.activeTrick = null;
    this.trickT = 0;
    this.boardGroup.rotation.set(0, 0, 0);
    this.boardGroup.position.y = 0.16;
  }

  show() { this.group.visible = true; }

  reset(x, y, z, heading) {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.clearTrick();
    this.body.rotation.set(0, 0, 0);
    this.legs.forEach(l => {
      l.hip.position.y = 0.9;
      l.upper.group.rotation.x = -0.12;
      l.lower.group.rotation.x = 0.28;
    });
    this.arms.forEach(a => {
      a.shoulder.rotation.set(0, 0, a.side * 0.15);
      a.upper.group.rotation.set(0, 0, a.side * 0.15);
      a.elbow.rotation.x = 0.18;
    });
  }

  update(dt, s) {
    const g = this.group;
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.heading;

    // soft contact shadow that tightens near the ground and fades in the air
    const gy = s.groundY;
    if (Number.isFinite(gy)) {
      const height = Math.max(0, (s.y ?? gy) - gy);
      const fade = Math.max(0, 1 - height / 4.5);
      const shadow = this.contactShadow;
      shadow.visible = fade > 0.03;
      shadow.position.set(s.x, gy + 0.018, s.z);
      shadow.rotation.y = s.heading;
      const spread = 1 + height * 0.16;
      shadow.scale.set(spread, 1, spread);
      shadow.material.opacity = 0.68 * fade * fade + 0.12 * fade;
    } else {
      this.contactShadow.visible = false;
    }

    const speed = Math.abs(s.speed || 0);
    const air = s.air || 0;
    const crouch = s.crouch || 0;
    const lean = s.lean || 0;
    const grind = s.grinding ? 1 : 0;
    const manual = s.manual ? 1 : 0;
    const grab = s.grab ? 1 : 0;
    const bail = s.bail || 0;
    const charging = s.charging ? 1 : 0;

    this.bob += dt * (2 + speed * 0.55);

    // overall tilt: slope pitch, carving lean, grind balance
    const slopePitch = s.slopePitch || 0;
    const targetZ = s.slopeRoll || 0;
    const bal = s.balance || 0;
    if (bail > 0) {
      const t = s.bailTime || 0;
      this.tilt.rotation.x += (Math.sin(t * 10) * 0.35 - this.tilt.rotation.x) * Math.min(1, dt * 12);
      this.tilt.rotation.z += (Math.cos(t * 8) * 0.4 - this.tilt.rotation.z) * Math.min(1, dt * 12);
      this.tilt.rotation.y = Math.sin(t * 7) * 0.4;
    } else {
      this.tilt.rotation.x += (-slopePitch * 0.85 - this.tilt.rotation.x) * Math.min(1, dt * 10);
      this.tilt.rotation.z += (-lean * 0.17 + bal * 0.16 - this.tilt.rotation.z) * Math.min(1, dt * 9);
      this.tilt.rotation.y += (0 - this.tilt.rotation.y) * Math.min(1, dt * 9);
    }

    // body crouch + air pose
    const bodyBase = 0.92 - crouch * 0.16 - charging * 0.06 - (manual ? 0.02 : 0);
    const swing = Math.sin(this.bob) * 0.015 * Math.min(1, speed / 4);
    this.body.position.y = swing - air * 0.03;

    for (const leg of this.legs) {
      const back = leg.side > 0 ? 1 : -1;
      const stance = back * 0.16;
      leg.hip.position.y = bodyBase;
      leg.hip.position.z = leg.side * 0.29 + (manual ? 0.05 : 0);
      let upperX = -0.18 + crouch * 0.62 + air * 0.55 + (grab ? 0.35 : 0) + stance * 0.5;
      let lowerX = 0.34 + crouch * 0.82 + air * 0.85 + (grab ? 0.6 : 0) - stance * 0.2;
      if (grind) { upperX += 0.08; lowerX += 0.25; }
      if (manual) { upperX += -0.12; lowerX -= 0.2; }
      leg.upper.group.rotation.x += (upperX - leg.upper.group.rotation.x) * Math.min(1, dt * 14);
      leg.lower.group.rotation.x += (lowerX - leg.lower.group.rotation.x) * Math.min(1, dt * 14);
      leg.hip.rotation.z = leg.side * (0.04 + crouch * 0.07);
      leg.knee.rotation.z = leg.side * 0.04;
    }

    for (const arm of this.arms) {
      const side = arm.side;
      let sx = -0.12 - crouch * 0.25 + air * 0.9 + (manual ? -0.35 : 0);
      let sz = side * (0.2 + crouch * 0.2 + air * 0.45);
      let ex = 0.28 + crouch * 0.35 + air * 0.2;
      if (grab && side < 0) { sx = 1.15; sz = 0.28; ex = 0.15; }
      if (grind) { sx = -0.05; sz = side * 0.85; }
      if (bail > 0) { sx = -0.7 * Math.sin((s.bailTime || 0) * 9 + side); sz = side * 1.1; ex = 0.2; }
      arm.shoulder.rotation.x += (sx - arm.shoulder.rotation.x) * Math.min(1, dt * 9);
      arm.shoulder.rotation.z += (sz - arm.shoulder.rotation.z) * Math.min(1, dt * 9);
      arm.elbow.rotation.x += (ex - arm.elbow.rotation.x) * Math.min(1, dt * 12);
      arm.upper.group.rotation.z = side * 0.12;
    }

    // head looks into travel
    this.body.rotation.y += ((manual ? -0.18 : 0) - this.body.rotation.y) * Math.min(1, dt * 8);

    // board flip animation
    if (this.activeTrick) {
      this.trickT += dt;
      const p = Math.min(1, this.trickT / this.trickDur);
      const e = 1 - Math.pow(1 - p, 3);
      const d = this.activeTrick;
      this.boardGroup.rotation.z = THREE.MathUtils.degToRad(d.roll || 0) * e;
      this.boardGroup.rotation.y = THREE.MathUtils.degToRad(d.yaw || 0) * e;
      this.boardGroup.rotation.x = THREE.MathUtils.degToRad(d.pitch || 0) * e;
      this.boardGroup.position.y = 0.16 + Math.sin(p * Math.PI) * (d.pop || 0.1);
      if (p >= 1) {
        this.boardGroup.rotation.set(0, 0, 0);
        this.boardGroup.position.y = 0.16;
        this.activeTrick = null;
      }
    } else if (manual) {
      this.boardGroup.rotation.x += (-0.3 - this.boardGroup.rotation.x) * Math.min(1, dt * 8);
      this.boardGroup.rotation.y += (0 - this.boardGroup.rotation.y) * Math.min(1, dt * 8);
      this.boardGroup.rotation.z += (0 - this.boardGroup.rotation.z) * Math.min(1, dt * 8);
      this.boardGroup.position.y += (0.2 - this.boardGroup.position.y) * Math.min(1, dt * 8);
    } else {
      this.boardGroup.rotation.x += (0 - this.boardGroup.rotation.x) * Math.min(1, dt * 10);
      this.boardGroup.rotation.y += (0 - this.boardGroup.rotation.y) * Math.min(1, dt * 10);
      this.boardGroup.rotation.z += (0 - this.boardGroup.rotation.z) * Math.min(1, dt * 10);
      this.boardGroup.position.y += (0.16 - this.boardGroup.position.y) * Math.min(1, dt * 10);
    }

    // wheel spin
    this.wheelSpin += speed * dt * 7.5;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
  }
}
