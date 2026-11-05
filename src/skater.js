import * as THREE from '../vendor/three.module.js';

/* ------------------------------------------------------------------ *
 * Goodwood Skate — detailed procedural skater rig.
 * Everything is still built from primitives (no external assets), but
 * the proportions, clothing, face, shoes and board are modelled with
 * rounded, tapered geometry so the player reads as a 3D character
 * rather than a collection of blocks.
 * ------------------------------------------------------------------ */

const SKIN = 0xc07c55;
const SKIN_DARK = 0x9c5f3f;
const HOODIE = 0xe4511b;
const HOODIE_DARK = 0xb63b0f;
const PANTS = 0x272b33;
const PANTS_DARK = 0x1d2026;
const SHOE = 0xefe8d9;
const SHOE_SOLE = 0xcbbda4;
const SHOE_DARK = 0x37322c;
const METAL = 0xbfc3c7;
const METAL_DARK = 0x6d7075;
const DECK = 0x1b1916;
const GRIP = 0x121110;
const BEANIE = 0x1c2d36;
const WHEEL = 0xe6ddc9;
const HAIR = 0x2a1c14;

let fabricTex = null;
function fabricTexture() {
  if (fabricTex) return fabricTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2f2f2';
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 1400; i++) {
    const v = 190 + Math.floor(Math.random() * 65);
    x.fillStyle = `rgba(${v},${v},${v},0.55)`;
    x.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  }
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(3, 3);
  fabricTex.colorSpace = THREE.SRGBColorSpace;
  return fabricTex;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0,
    ...opts,
  });
}

/* A tapered capsule: rounded at both ends, wide at the top and narrow
 * at the bottom. Much more organic than a straight cylinder. */
function limbGeometry(length, rTop, rBot, segments = 14) {
  const pts = [];
  const cap = 4;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rBot, -length + Math.sin(a) * rBot));
  }
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    pts.push(new THREE.Vector2(rBot + (rTop - rBot) * t, -length + length * t));
  }
  for (let i = 1; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rTop, Math.sin(a) * rTop));
  }
  return new THREE.LatheGeometry(pts, segments);
}

function limb(length, rTop, rBot, material, segments = 14) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(limbGeometry(length, rTop, rBot, segments), material);
  mesh.castShadow = true;
  group.add(mesh);
  return { group, mesh, length };
}

function roundedDeckShape(width = 0.44, length = 1.32) {
  const w = width / 2, l = length / 2;
  const s = new THREE.Shape();
  s.moveTo(-w + 0.02, -l + 0.09);
  s.quadraticCurveTo(-w, -l + 0.02, -w + 0.075, -l + 0.008);
  s.lineTo(w - 0.075, -l + 0.008);
  s.quadraticCurveTo(w, -l + 0.02, w - 0.02, -l + 0.09);
  s.lineTo(w + 0.01, -0.36);
  s.quadraticCurveTo(w - 0.006, -0.27, w, -0.20);
  s.lineTo(w, 0.20);
  s.quadraticCurveTo(w - 0.006, 0.27, w + 0.01, 0.36);
  s.lineTo(w - 0.02, l - 0.09);
  s.quadraticCurveTo(w, l - 0.02, w - 0.075, l - 0.008);
  s.lineTo(-w + 0.075, l - 0.008);
  s.quadraticCurveTo(-w, l - 0.02, -w + 0.02, l - 0.09);
  s.lineTo(-w - 0.01, 0.36);
  s.quadraticCurveTo(-w + 0.006, 0.27, -w, 0.20);
  s.lineTo(-w, -0.20);
  s.quadraticCurveTo(-w + 0.006, -0.27, -w - 0.01, -0.36);
  s.closePath();
  return s;
}

function deckGraphic() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1b1815';
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#e4511b';
  x.fillRect(24, 24, 464, 208);
  x.fillStyle = '#171512';
  x.fillRect(34, 34, 444, 188);
  x.save();
  x.translate(256, 140);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#efe8d9';
  x.font = '900 78px "Arial Black", sans-serif';
  x.fillText('GOODWOOD', 0, 0);
  x.fillStyle = '#d7ff3f';
  x.font = '700 26px monospace';
  x.fillText('S K A T E', 0, 58);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function gripTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#111010';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2400; i++) {
    const v = 12 + Math.floor(Math.random() * 28);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Skater {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);

    this.boardGroup = new THREE.Group();
    this.boardGroup.position.y = 0.105;
    this.tilt.add(this.boardGroup);

    this.body = new THREE.Group();
    this.tilt.add(this.body);

    this.activeTrick = null;
    this.trickT = 0;
    this.trickDur = 0.58;
    this.wheelSpin = 0;
    this.bob = 0;
    this.pushPhase = 0;

    this._buildBoard();
    this._buildBody();
    this._buildContactShadow();

    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    scene.add(this.group);
    this.group.visible = false;
  }

  /* ------------------------------------------------------------ board */

  _buildBoard() {
    const g = this.boardGroup;

    const deckShape = roundedDeckShape(0.46, 1.32);
    const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
      depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012,
      bevelSegments: 3, curveSegments: 10,
    });
    deckGeo.rotateX(-Math.PI / 2);
    const deckMat = mat(DECK, { roughness: 0.55, metalness: 0.05 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    g.add(deck);

    // grip tape top
    const gripGeo = new THREE.ShapeGeometry(roundedDeckShape(0.43, 1.26), 10);
    gripGeo.rotateX(-Math.PI / 2);
    const grip = new THREE.Mesh(gripGeo, new THREE.MeshStandardMaterial({
      color: 0x8b8b8b, map: gripTexture(), roughness: 1, metalness: 0,
    }));
    grip.position.y = 0.044;
    g.add(grip);

    // underside graphic
    const bottomGeo = new THREE.PlaneGeometry(0.35, 0.98);
    bottomGeo.rotateX(Math.PI / 2);
    const bottom = new THREE.Mesh(bottomGeo, new THREE.MeshStandardMaterial({
      map: deckGraphic(), roughness: 0.62, metalness: 0.03, side: THREE.DoubleSide,
    }));
    bottom.position.y = -0.014;
    g.add(bottom);

    // nose / tail kick
    for (const side of [-1, 1]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.22), deckMat);
      kick.position.set(0, 0.052, side * 0.57);
      kick.rotation.x = side * 0.20;
      g.add(kick);
    }

    // deck bolts
    const boltGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6);
    const boltMat = mat(0xc9c9c9, { metalness: 0.9, roughness: 0.3 });
    for (const z of [-0.42, 0.42]) {
      for (const x of [-0.155, 0.155]) {
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(x, 0.046, z);
        g.add(bolt);
      }
    }

    // trucks
    const truckMetal = mat(METAL, { metalness: 0.92, roughness: 0.24 });
    const truckDark = mat(METAL_DARK, { metalness: 0.75, roughness: 0.4 });
    for (const z of [-0.41, 0.41]) {
      const truck = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.13), truckDark);
      base.position.y = -0.012;
      truck.add(base);
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.032, 0.075), truckMetal);
      hanger.position.y = -0.037;
      truck.add(hanger);
      const kingpin = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.055, 8), truckDark);
      kingpin.position.y = -0.028;
      truck.add(kingpin);
      const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.016, 10), mat(0xd9b23f, { roughness: 0.7 }));
      bushing.position.y = -0.046;
      truck.add(bushing);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8), truckMetal);
      axle.rotation.z = Math.PI / 2;
      axle.position.y = -0.052;
      truck.add(axle);
      truck.position.z = z;
      g.add(truck);
    }

    // wheels
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.052, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.056, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const wheelMat = mat(WHEEL, { roughness: 0.5 });
    const hubMat = mat(0x7d7870, { metalness: 0.55, roughness: 0.35 });
    for (const z of [-0.41, 0.41]) {
      for (const x of [-0.225, 0.225]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(x, -0.06, z);
        g.add(w);
        this.wheels.push(w);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.set(x, -0.06, z);
        g.add(hub);
      }
    }
  }

  /* ------------------------------------------------------------- body */

  _buildBody() {
    const b = this.body;

    const fabric = fabricTexture();
    const pants = mat(PANTS, { roughness: 0.95, map: fabric });
    const pantsDark = mat(PANTS_DARK, { roughness: 0.95 });
    const hoodie = mat(HOODIE, { roughness: 0.92, map: fabric });
    const hoodieDark = mat(HOODIE_DARK, { roughness: 0.94, map: fabric });
    const skin = mat(SKIN, { roughness: 0.68 });
    const skinDark = mat(SKIN_DARK, { roughness: 0.75 });
    const shoe = mat(SHOE, { roughness: 0.72 });
    const shoeSole = mat(SHOE_SOLE, { roughness: 0.9 });
    const shoeDark = mat(SHOE_DARK, { roughness: 0.85 });
    const beanie = mat(BEANIE, { roughness: 0.98, map: fabric });
    const hair = mat(HAIR, { roughness: 1 });

    /* ---- hips / pelvis ---- */
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), pants);
    pelvis.position.set(0, 0.955, 0);
    pelvis.scale.set(1.22, 0.72, 1.02);
    b.add(pelvis);

    const waistBand = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.022, 8, 26), pantsDark);
    waistBand.position.set(0, 1.015, 0);
    waistBand.rotation.x = Math.PI / 2;
    waistBand.scale.set(1.02, 1.02, 0.82);
    b.add(waistBand);

    /* ---- torso / hoodie ---- */
    const profile = [
      [0.0, 1.00], [0.168, 1.00], [0.18, 1.06], [0.19, 1.15],
      [0.215, 1.26], [0.228, 1.34], [0.216, 1.41], [0.17, 1.46],
      [0.09, 1.49], [0.0, 1.49],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeo = new THREE.LatheGeometry(profile, 22);
    const torso = new THREE.Mesh(torsoGeo, hoodie);
    torso.scale.z = 0.74;
    b.add(torso);

    // shoulders
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), hoodie);
      shoulder.position.set(side * 0.198, 1.425, 0);
      shoulder.scale.set(1.04, 0.94, 1);
      b.add(shoulder);
    }

    // hood bunched behind the neck
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), hoodieDark);
    hood.position.set(0, 1.455, -0.105);
    hood.scale.set(1.15, 0.72, 0.68);
    b.add(hood);
    const hoodTrim = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.032, 8, 20), hoodieDark);
    hoodTrim.position.set(0, 1.485, -0.035);
    hoodTrim.rotation.x = Math.PI / 2;
    hoodTrim.scale.set(1.05, 1.05, 0.85);
    b.add(hoodTrim);

    // waist hem
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 7, 24), hoodieDark);
    hem.position.set(0, 1.005, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1.02, 1.02, 0.78);
    b.add(hem);

    // zipper + pull
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.4, 0.012), mat(0xc5c0b5, { roughness: 0.4, metalness: 0.5 }));
    zip.position.set(0, 1.255, 0.166);
    b.add(zip);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.036, 0.008), mat(0xd7d2c7, { metalness: 0.6, roughness: 0.3 }));
    pull.position.set(0, 1.43, 0.16);
    b.add(pull);

    // kangaroo pocket
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.12, 0.024), hoodieDark);
    pocket.position.set(0, 1.10, 0.146);
    pocket.rotation.x = -0.12;
    b.add(pocket);

    // chest patch
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.006), mat(0xd7ff3f, { roughness: 0.55 }));
    patch.position.set(0.105, 1.335, 0.163);
    patch.rotation.z = -0.12;
    b.add(patch);

    // drawstrings
    for (const side of [-1, 1]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15, 6), mat(0xe8e0d0, { roughness: 0.9 }));
      cord.position.set(side * 0.042, 1.385, 0.148);
      cord.rotation.x = 0.08;
      b.add(cord);
      const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 6), mat(0x55504a, { metalness: 0.5, roughness: 0.4 }));
      aglet.position.set(side * 0.042, 1.31, 0.154);
      b.add(aglet);
    }

    /* ---- neck / head ---- */
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.082, 0.11, 12), skin);
    neck.position.set(0, 1.525, 0);
    b.add(neck);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.565, 0);
    b.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.113, 22, 18), skin);
    skull.position.set(0, 0.105, 0);
    skull.scale.set(0.93, 1.08, 0.97);
    this.head.add(skull);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.093, 18, 14), skin);
    jaw.position.set(0, 0.055, 0.012);
    jaw.scale.set(1.0, 0.9, 0.95);
    this.head.add(jaw);

    // ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.023, 10, 8), skin);
      ear.position.set(side * 0.104, 0.105, 0.0);
      ear.scale.set(0.55, 1.0, 0.78);
      this.head.add(ear);
    }

    // nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), skin);
    nose.position.set(0, 0.087, 0.108);
    nose.scale.set(0.82, 1.15, 1.25);
    this.head.add(nose);

    // eyes
    const eyeWhite = mat(0xf2eee5, { roughness: 0.35 });
    const iris = mat(0x4c6f82, { roughness: 0.25 });
    const pupil = mat(0x0e0d0c, { roughness: 0.2 });
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), eyeWhite);
      white.position.set(side * 0.041, 0.116, 0.099);
      white.scale.set(1.0, 0.72, 0.5);
      this.head.add(white);
      const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), iris);
      irisMesh.position.set(side * 0.041, 0.115, 0.108);
      irisMesh.scale.set(1.0, 0.95, 0.5);
      this.head.add(irisMesh);
      const pupilMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 8, 6), pupil);
      pupilMesh.position.set(side * 0.041, 0.115, 0.112);
      pupilMesh.scale.set(1.0, 0.95, 0.4);
      this.head.add(pupilMesh);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.012), hair);
      brow.position.set(side * 0.042, 0.138, 0.103);
      brow.rotation.z = side * 0.08;
      this.head.add(brow);
    }

    // mouth
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.008), mat(0x7c4036, { roughness: 0.7 }));
    mouth.position.set(0, 0.036, 0.104);
    this.head.add(mouth);

    // hair at the nape / sideburns
    const nape = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 10), hair);
    nape.position.set(0, 0.085, -0.055);
    nape.scale.set(1.1, 0.75, 0.62);
    this.head.add(nape);
    for (const side of [-1, 1]) {
      const burn = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.056, 0.026), hair);
      burn.position.set(side * 0.088, 0.082, 0.028);
      this.head.add(burn);
    }

    // beanie
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.121, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), beanie);
    cap.position.set(0, 0.13, 0);
    cap.scale.set(1.02, 1.0, 1.02);
    this.head.add(cap);
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.121, 0.052, 20), beanie);
    fold.position.set(0, 0.115, 0);
    this.head.add(fold);
    const beaniePatch = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.006), mat(0xd7ff3f, { roughness: 0.6 }));
    beaniePatch.position.set(0.036, 0.14, 0.116);
    beaniePatch.rotation.z = -0.08;
    this.head.add(beaniePatch);

    /* ---- legs ---- */
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.135, 0.96, side * 0.235);

      const upper = limb(0.4, 0.108, 0.083, pants);
      upper.group.rotation.x = -0.12;
      hip.add(upper.group);

      const knee = new THREE.Group();
      knee.position.y = -0.4;
      upper.group.add(knee);
      const lower = limb(0.38, 0.08, 0.058, pants);
      lower.group.rotation.x = 0.28;
      knee.add(lower.group);

      const ankle = new THREE.Group();
      ankle.position.y = -0.38;
      lower.group.add(ankle);

      // cuff / trouser hem
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.055, 14), pantsDark);
      cuff.position.y = -0.345;
      lower.group.add(cuff);

      // high-top skate shoe
      const shoeGroup = new THREE.Group();
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.026, 0.30), shoeSole);
      sole.position.set(0, -0.019, 0.055);
      shoeGroup.add(sole);
      const midsole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.31), shoe);
      midsole.position.set(0, 0.0, 0.055);
      shoeGroup.add(midsole);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.084, 14, 10), shoe);
      toe.position.set(0, 0.048, 0.075);
      toe.scale.set(0.92, 0.55, 1.22);
      shoeGroup.add(toe);
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 10), shoe);
      heel.position.set(0, 0.058, -0.038);
      heel.scale.set(0.94, 0.8, 0.92);
      shoeGroup.add(heel);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.076, 0.075, 14), shoe);
      collar.position.set(0, 0.095, -0.035);
      shoeGroup.add(collar);
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.09, 0.024), shoeDark);
      tongue.position.set(0, 0.09, 0.048);
      tongue.rotation.x = -0.26;
      shoeGroup.add(tongue);
      for (let i = 0; i < 3; i++) {
        const lace = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.006, 0.009), mat(0xe8e2d5, { roughness: 0.85 }));
        lace.position.set(0, 0.105 + i * 0.014, 0.052 + i * 0.012);
        lace.rotation.x = -0.2;
        shoeGroup.add(lace);
      }
      const heelTab = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.012), shoeDark);
      heelTab.position.set(0, 0.13, -0.095);
      shoeGroup.add(heelTab);
      ankle.add(shoeGroup);
      shoeGroup.position.y = 0.0;

      b.add(hip);
      this.legs.push({ hip, upper, knee, lower, ankle, shoe: shoeGroup, side });
    }

    /* ---- arms ---- */
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.218, 1.425, 0);

      const upper = limb(0.30, 0.075, 0.061, hoodie);
      upper.group.rotation.z = side * 0.15;
      shoulder.add(upper.group);

      const elbow = new THREE.Group();
      elbow.position.y = -0.30;
      upper.group.add(elbow);
      const lower = limb(0.27, 0.058, 0.049, hoodie);
      lower.group.rotation.x = 0.18;
      elbow.add(lower.group);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.054, 0.04, 12), hoodieDark);
      cuff.position.y = -0.255;
      lower.group.add(cuff);

      const hand = new THREE.Group();
      hand.position.y = -0.29;
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.047, 12, 10), skin);
      palm.scale.set(0.92, 1.15, 0.68);
      hand.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.03, 3, 7), skin);
      thumb.position.set(-side * 0.036, -0.006, 0.022);
      thumb.rotation.z = side * 0.9;
      hand.add(thumb);
      for (let i = 0; i < 3; i++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.024, 2, 6), skin);
        finger.position.set((i - 1) * 0.019, -0.055, 0.006);
        hand.add(finger);
      }
      lower.group.add(hand);

      b.add(shoulder);
      this.arms.push({ shoulder, upper, elbow, lower, hand, side });
    }
  }

  /* ---------------------------------------------------- contact shadow */

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

    const geo = new THREE.PlaneGeometry(1.7, 2.55);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false,
    });
    this.contactShadow = new THREE.Mesh(geo, material);
    this.contactShadow.renderOrder = 2;
    this.contactShadow.visible = false;
    this.scene.add(this.contactShadow);
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
    this.boardGroup.position.y = 0.105;
  }

  show() { this.group.visible = true; }

  reset(x, y, z, heading) {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.clearTrick();
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    this.head.rotation.set(0, 0, 0);
    this.legs.forEach(l => {
      l.hip.position.y = 0.96;
      l.upper.group.rotation.x = -0.12;
      l.lower.group.rotation.x = 0.28;
      l.ankle.rotation.x = 0;
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
    this.pushPhase += dt * (3.2 + speed * 0.8);

    // overall tilt: slope pitch, carving lean, grind balance
    const slopePitch = s.slopePitch || 0;
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
    const bodyBase = 0.96 - crouch * 0.16 - charging * 0.06 - (manual ? 0.02 : 0);
    const swing = Math.sin(this.bob) * 0.015 * Math.min(1, speed / 4);
    this.body.position.y = swing - air * 0.03;

    for (const leg of this.legs) {
      const back = leg.side > 0 ? 1 : -1;
      const stance = back * 0.16;
      leg.hip.position.y = bodyBase;
      leg.hip.position.z = leg.side * 0.235 + (manual ? 0.035 : 0);
      let upperX = -0.18 + crouch * 0.62 + air * 0.55 + (grab ? 0.35 : 0) + stance * 0.5;
      let lowerX = 0.34 + crouch * 0.82 + air * 0.85 + (grab ? 0.6 : 0) - stance * 0.2;
      if (grind) { upperX += 0.08; lowerX += 0.25; }
      if (manual) { upperX += -0.12; lowerX -= 0.2; }
      leg.upper.group.rotation.x += (upperX - leg.upper.group.rotation.x) * Math.min(1, dt * 14);
      leg.lower.group.rotation.x += (lowerX - leg.lower.group.rotation.x) * Math.min(1, dt * 14);
      leg.hip.rotation.z = leg.side * (0.04 + crouch * 0.07);
      leg.knee.rotation.z = leg.side * 0.04;
      // keep the shoes flat on the deck
      leg.ankle.rotation.x += (-(leg.upper.group.rotation.x + leg.lower.group.rotation.x) * 0.72 - leg.ankle.rotation.x) * Math.min(1, dt * 12);
    }

    for (const arm of this.arms) {
      const side = arm.side;
      let sx = -0.12 - crouch * 0.25 + air * 0.9 + (manual ? -0.35 : 0);
      let sz = side * (0.2 + crouch * 0.2 + air * 0.45);
      let ex = 0.28 + crouch * 0.35 + air * 0.2;
      if (grab && side < 0) { sx = 1.15; sz = 0.28; ex = 0.15; }
      if (grind) { sx = -0.05; sz = side * 0.85; }
      if (bail > 0) { sx = -0.7 * Math.sin((s.bailTime || 0) * 9 + side); sz = side * 1.1; ex = 0.2; }
      if (!grind && !grab && bail === 0 && air < 0.2) {
        // natural counter-swing while riding or pushing
        sx += Math.sin(this.bob + side * 1.6) * 0.10 * Math.min(1, speed / 3);
        sz += Math.sin(this.pushPhase + side) * 0.03;
      }
      arm.shoulder.rotation.x += (sx - arm.shoulder.rotation.x) * Math.min(1, dt * 9);
      arm.shoulder.rotation.z += (sz - arm.shoulder.rotation.z) * Math.min(1, dt * 9);
      arm.elbow.rotation.x += (ex - arm.elbow.rotation.x) * Math.min(1, dt * 12);
      arm.upper.group.rotation.z = side * 0.12;
    }

    // head looks into travel, with a touch of life
    const headY = (manual ? -0.18 : 0) + Math.sin(this.bob * 0.5) * 0.035 + lean * 0.12;
    this.head.rotation.y += (headY - this.head.rotation.y) * Math.min(1, dt * 8);
    this.head.rotation.x += ((air * 0.08) - this.head.rotation.x) * Math.min(1, dt * 6);

    // board flip animation
    if (this.activeTrick) {
      this.trickT += dt;
      const p = Math.min(1, this.trickT / this.trickDur);
      const e = 1 - Math.pow(1 - p, 3);
      const d = this.activeTrick;
      this.boardGroup.rotation.z = THREE.MathUtils.degToRad(d.roll || 0) * e;
      this.boardGroup.rotation.y = THREE.MathUtils.degToRad(d.yaw || 0) * e;
      this.boardGroup.rotation.x = THREE.MathUtils.degToRad(d.pitch || 0) * e;
      this.boardGroup.position.y = 0.105 + Math.sin(p * Math.PI) * (d.pop || 0.1);
      if (p >= 1) {
        this.boardGroup.rotation.set(0, 0, 0);
        this.boardGroup.position.y = 0.105;
        this.activeTrick = null;
      }
    } else if (manual) {
      this.boardGroup.rotation.x += (-0.3 - this.boardGroup.rotation.x) * Math.min(1, dt * 8);
      this.boardGroup.rotation.y += (0 - this.boardGroup.rotation.y) * Math.min(1, dt * 8);
      this.boardGroup.rotation.z += (0 - this.boardGroup.rotation.z) * Math.min(1, dt * 8);
      this.boardGroup.position.y += (0.13 - this.boardGroup.position.y) * Math.min(1, dt * 8);
    } else {
      this.boardGroup.rotation.x += (0 - this.boardGroup.rotation.x) * Math.min(1, dt * 10);
      this.boardGroup.rotation.y += (0 - this.boardGroup.rotation.y) * Math.min(1, dt * 10);
      this.boardGroup.rotation.z += (0 - this.boardGroup.rotation.z) * Math.min(1, dt * 10);
      this.boardGroup.position.y += (0.105 - this.boardGroup.position.y) * Math.min(1, dt * 10);
    }

    // wheel spin
    this.wheelSpin += speed * dt * 7.5;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
  }
}
