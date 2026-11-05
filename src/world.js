import * as THREE from '../vendor/three.module.js';

/* ------------------------------------------------------------------ *
 * Goodwood Skate — world
 * A compact golden-hour street plaza. The terrain is one continuous
 * height-field so ramps, banks and bowls can all be ridden by the same
 * physics. Rails/ledges expose grind lines.
 * ------------------------------------------------------------------ */

export const PARK = {
  minX: -36.2,
  maxX: 36.2,
  minZ: -26.2,
  maxZ: 26.2,
  spawn: { x: 0, z: 14, heading: Math.PI },
};

const S = 0.5; // terrain vertex spacing hint

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

/* ---------------- height field ---------------- */

const quarter = [
  // north: ride from +z towards the north wall
  { axis: 'z', sign: -1, lip: -26.2, bottom: -19.70, h: 4.4, r: 7.0, min: -17, max: 17, crossMin: -999, crossMax: 999, name: 'north' },
  // south
  { axis: 'z', sign: 1, lip: 26.2, bottom: 20.40, h: 3.7, r: 6.4, min: -11, max: 11, crossMin: -999, crossMax: 999, name: 'south' },
  // west
  { axis: 'x', sign: -1, lip: -36.2, bottom: -29.96, h: 4.1, r: 6.8, min: -12, max: 12, crossMin: -999, crossMax: 999, name: 'west' },
  // east
  { axis: 'x', sign: 1, lip: 36.2, bottom: 30.22, h: 3.8, r: 6.6, min: -13, max: 13, crossMin: -999, crossMax: 999, name: 'east' },
];

const funbox = { x: -1, z: 3, halfX: 8, halfZ: 2.6, h: 1.25, bank: 3.0 };

/* Raised slabs that are both solid (height field) and grindable on every
 * edge. Keeping the collision data here means the visual boxes and the
 * physics always agree. */
const ledgeDefs = [
  { x: 18, z: 17, w: 10, d: 1.2, h: 0.62, rot: 0 },
  { x: -19, z: 9, w: 7.5, d: 1.1, h: 0.55, rot: 0.08 },
];

// Bench top — visual is built in buildProps, collision/grind lives here.
const benchDef = { x: 28, z: 18.5, w: 3.4, d: 0.7, h: 0.49, rot: -0.25 };

const surfaces = [
  ...ledgeDefs.map(l => ({ ...l, h: l.h + 0.0375 })), // metal cap sits on the slab
  benchDef,
];

const kickers = [
  { x1: 14, x2: 20, zBase: 1.5, zLip: -4.0, h: 1.65 },
  { x1: -22.75, x2: -17.25, zBase: -10.5, zLip: -5.0, h: 1.5, flip: true },
  { x1: 23.5, x2: 28.5, zBase: 15.0, zLip: 9.5, h: 1.3 },
];

export function heightAt(x, z) {
  let h = 0;

  // funbox
  const fdx = Math.abs(x - funbox.x);
  const fdz = Math.abs(z - funbox.z);
  if (fdx <= funbox.halfX && fdz <= funbox.halfZ + funbox.bank) {
    if (fdz <= funbox.halfZ) h = Math.max(h, funbox.h);
    else h = Math.max(h, funbox.h * smooth(1 - (fdz - funbox.halfZ) / funbox.bank));
  }

  // solid ledges / bench tops (also grindable along their edges)
  for (const s of surfaces) {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const dx = x - s.x, dz = z - s.z;
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    if (Math.abs(lx) <= s.w / 2 && Math.abs(lz) <= s.d / 2) h = Math.max(h, s.h);
  }

  // quarter pipes
  for (const q of quarter) {
    const cross = q.axis === 'z' ? x : z;
    if (cross < q.min || cross > q.max) continue;
    const along = q.axis === 'z' ? z : x;
    let b;
    if (q.axis === 'z') b = q.sign < 0 ? q.bottom - along : along - q.bottom;
    else b = q.sign < 0 ? q.bottom - along : along - q.bottom;
    // b runs 0 at the bottom of the transition to depth at the lip
    if (b < 0) continue;
    const depth = Math.abs(q.lip - q.bottom);
    if (b > depth) continue;
    const v = q.r - Math.sqrt(Math.max(0, q.r * q.r - b * b));
    h = Math.max(h, v);
  }

  // kickers (simple curved wedges)
  for (const k of kickers) {
    if (x < k.x1 || x > k.x2) continue;
    let t;
    if (!k.flip) t = (k.zBase - z) / (k.zBase - k.zLip);
    else t = (z - k.zBase) / (k.zLip - k.zBase);
    if (t < 0 || t > 1) continue;
    h = Math.max(h, k.h * Math.pow(t, 1.5));
  }

  return h;
}

/* ---------------- canvas texture helpers ---------------- */

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, x: c.getContext('2d') };
}

function concreteTexture() {
  const { c, x: g } = makeCanvas(1024);
  g.fillStyle = '#8b8a83';
  g.fillRect(0, 0, 1024, 1024);

  // broad tonal patches
  for (let i = 0; i < 60; i++) {
    const px = Math.random() * 1024, py = Math.random() * 1024, r = 40 + Math.random() * 220;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgba(${Math.random() > .5 ? '60,60,55' : '190,188,178'},${0.012 + Math.random() * 0.03})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }

  // aggregate speckle
  const img = g.getImageData(0, 0, 1024, 1024);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (Math.random() > 0.9992) { d[i] = 40; d[i + 1] = 40; d[i + 2] = 38; }
  }
  g.putImageData(img, 0, 0);

  // control joints
  g.strokeStyle = 'rgba(48,47,42,0.28)';
  g.lineWidth = 3;
  for (let i = 0; i <= 1024; i += 256) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke();
  }
  g.strokeStyle = 'rgba(220,216,204,0.10)';
  g.lineWidth = 1;
  for (let i = 4; i <= 1024; i += 256) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke();
  }

  // cracks
  g.strokeStyle = 'rgba(42,40,36,0.4)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 22; i++) {
    let px = Math.random() * 1024, py = Math.random() * 1024;
    g.beginPath(); g.moveTo(px, py);
    const steps = 5 + Math.floor(Math.random() * 10);
    for (let j = 0; j < steps; j++) {
      px += (Math.random() - 0.5) * 44; py += (Math.random() - 0.5) * 44;
      g.lineTo(px, py);
    }
    g.stroke();
  }

  // scuffs and old paint flecks
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(${Math.random() > 0.5 ? '220,214,198' : '70,66,58'},${0.06 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 5;
    g.beginPath();
    const px = Math.random() * 1024, py = Math.random() * 1024;
    g.moveTo(px, py);
    g.quadraticCurveTo(px + (Math.random() - .5) * 60, py + (Math.random() - .5) * 60, px + (Math.random() - .5) * 130, py + (Math.random() - .5) * 130);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function graffitiTexture(seed = 1) {
  const { c, x: g } = makeCanvas(1024);
  g.clearRect(0, 0, 1024, 1024);
  const palettes = [
    ['#ff5a1f', '#d7ff3f', '#6ef3d6', '#f4f0e6', '#1b1a18'],
    ['#ff3f8e', '#ffd23f', '#3fa9ff', '#f4f0e6', '#161412'],
    ['#9b5cff', '#6ef3d6', '#ff5a1f', '#f4f0e6', '#171614'],
  ];
  const pal = palettes[seed % palettes.length];
  const rnd = mulberry(seed * 9127 + 17);

  // big soft spray fields
  for (let i = 0; i < 26; i++) {
    const px = rnd() * 1024, py = rnd() * 1024, r = 40 + rnd() * 190;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, pal[Math.floor(rnd() * 4)] + 'bb');
    grad.addColorStop(0.55, pal[Math.floor(rnd() * 4)] + '3a');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }

  // jagged fills
  for (let i = 0; i < 15; i++) {
    g.fillStyle = pal[Math.floor(rnd() * 4)];
    g.globalAlpha = 0.55 + rnd() * 0.4;
    g.beginPath();
    let px = rnd() * 1024, py = rnd() * 1024;
    g.moveTo(px, py);
    for (let j = 0; j < 7; j++) {
      px += (rnd() - 0.5) * 300; py += (rnd() - 0.5) * 220;
      g.lineTo(px, py);
    }
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;

  // outline scribbles
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = pal[4];
    g.beginPath();
    let px = rnd() * 900 + 50, py = rnd() * 900 + 50;
    g.moveTo(px, py);
    for (let j = 0; j < 4; j++) {
      px += (rnd() - .5) * 220; py += (rnd() - .5) * 180;
      g.lineTo(px, py);
    }
    g.stroke();
    g.strokeStyle = pal[Math.floor(rnd() * 3)];
    g.lineWidth = 12;
    g.stroke();
    g.lineWidth = 4;
    g.strokeStyle = pal[3];
    g.stroke();
  }

  // tags
  const tags = ['SHIFT', 'SK8', 'GRIND', 'NO RULES', 'LAND IT', 'STREET'];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const tag = tags[Math.floor(rnd() * tags.length)];
    g.save();
    g.translate(140 + rnd() * 740, 140 + rnd() * 740);
    g.rotate((rnd() - 0.5) * 0.5);
    g.font = `900 ${60 + Math.floor(rnd() * 90)}px "Arial Black", sans-serif`;
    g.lineWidth = 18;
    g.strokeStyle = 'rgba(16,14,12,0.9)';
    g.strokeText(tag, 0, 0);
    g.fillStyle = pal[Math.floor(rnd() * 3)];
    g.fillText(tag, 0, 0);
    g.globalAlpha = 0.75;
    g.fillStyle = pal[3];
    g.fillText(tag, -5, -4);
    g.restore();
  }

  // drips
  for (let i = 0; i < 40; i++) {
    g.fillStyle = pal[Math.floor(rnd() * 4)] + '77';
    const px = rnd() * 1024, py = rnd() * 1024;
    g.fillRect(px, py, 2 + rnd() * 5, 20 + rnd() * 90);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture() {
  const { c, x: g } = makeCanvas(256);
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 10; x++) {
      const lit = Math.random() > 0.6;
      g.fillStyle = lit ? (Math.random() > .5 ? '#ffd99b' : '#a9d7ff') : '#141820';
      g.globalAlpha = lit ? 0.45 + Math.random() * 0.5 : 0.7;
      g.fillRect(8 + x * 24, 7 + y * 15, 15, 9);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function letterTexture(ch) {
  const { c, x: g } = makeCanvas(256);
  g.clearRect(0, 0, 256, 256);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 190px "Arial Black", sans-serif';
  g.lineWidth = 26;
  g.strokeStyle = 'rgba(10,9,8,0.85)';
  g.strokeText(ch, 128, 138);
  g.lineWidth = 12;
  g.strokeStyle = '#ff5a1f';
  g.strokeText(ch, 128, 138);
  g.fillStyle = '#d7ff3f';
  g.fillText(ch, 128, 138);
  g.globalAlpha = 0.35;
  g.fillStyle = '#ffffff';
  g.fillText(ch, 121, 130);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sunTexture() {
  const { c, x: g } = makeCanvas(512);
  const grad = g.createRadialGradient(256, 256, 10, 256, 256, 250);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(0.18, 'rgba(255,226,155,0.95)');
  grad.addColorStop(0.4, 'rgba(255,172,92,0.5)');
  grad.addColorStop(0.7, 'rgba(255,120,60,0.12)');
  grad.addColorStop(1, 'rgba(255,100,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function decalTexture(kind) {
  const { c, x: g } = makeCanvas(1024);
  g.clearRect(0, 0, 1024, 1024);
  if (kind === 'logo') {
    g.translate(512, 512);
    g.strokeStyle = '#ff5a1f';
    g.lineWidth = 34;
    g.beginPath(); g.arc(0, 0, 390, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(244,240,230,0.8)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 342, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ff5a1f';
    g.font = '900 250px "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('G//S', 0, -30);
    g.fillStyle = '#f4f0e6';
    g.font = '800 54px "Arial Black", sans-serif';
    g.fillText('GOODWOOD SKATE', 0, 160);
    g.fillStyle = '#d7ff3f';
    g.font = '700 30px monospace';
    g.fillText('EST. 2026', 0, 220);
  } else if (kind === 'arrow') {
    g.translate(512, 512);
    g.fillStyle = 'rgba(255,90,31,0.85)';
    g.beginPath();
    g.moveTo(0, -390); g.lineTo(220, -60); g.lineTo(90, -60);
    g.lineTo(90, 390); g.lineTo(-90, 390); g.lineTo(-90, -60);
    g.lineTo(-220, -60); g.closePath(); g.fill();
    g.fillStyle = 'rgba(244,240,230,0.7)';
    g.font = '800 46px monospace'; g.textAlign = 'center';
    g.fillText('SEND IT', 0, 330);
  } else {
    // hazard stripes
    g.save();
    g.translate(512, 512);
    g.rotate(-Math.PI / 4);
    for (let i = -8; i < 8; i++) {
      g.fillStyle = i % 2 ? '#171512' : '#ffcf2f';
      g.fillRect(-900, i * 90, 1800, 52);
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------------- scene builders ---------------- */

function buildEnvironment(scene, renderer) {
  // A tiny procedural golden-hour environment, prefiltered into a PMREM.
  // This gives concrete, metal and the skater real specular response
  // instead of a flat ambient wash.
  const envScene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        vec3 top = vec3(0.16, 0.30, 0.52);
        vec3 mid = vec3(0.70, 0.49, 0.37);
        vec3 horizon = vec3(1.0, 0.76, 0.49);
        float h = clamp(vDir.y, -0.6, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.24, h));
        col = mix(col, top, smoothstep(0.18, 0.78, h));
        vec3 ground = vec3(0.11, 0.09, 0.07);
        col = mix(ground, col, smoothstep(-0.38, 0.02, h));
        vec3 sunDir = normalize(vec3(-0.55, 0.22, -0.8));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.64, 0.30) * pow(sun, 220.0) * 9.0;
        col += vec3(1.0, 0.45, 0.18) * pow(sun, 9.0) * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 20), skyMat);
  envScene.add(dome);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const rt = pmrem.fromScene(envScene, 0.05, 0.1, 100);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.55;
  dome.geometry.dispose();
  dome.material.dispose();
  pmrem.dispose();
}

function buildSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color('#2a4c7a') },
    mid: { value: new THREE.Color('#b98876') },
    horizon: { value: new THREE.Color('#ffc98d') },
    sunDir: { value: new THREE.Vector3(-0.55, 0.22, -0.8).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.16, 0.72, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.55, 0.24) * pow(sun, 140.0) * 1.35;
        col += vec3(1.0, 0.42, 0.16) * pow(sun, 8.0) * 0.16;
        float haze = exp(-max(vDir.y, 0.0) * 10.0);
        col = mix(col, vec3(1.0, 0.79, 0.56), haze * 0.23);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), mat);
  sky.frustumCulled = false;
  scene.add(sky);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, opacity: 0.95, fog: false,
  }));
  sun.position.set(-150, 62, -218);
  sun.scale.set(150, 150, 1);
  sun.renderOrder = -1;
  scene.add(sun);

  // soft cloud bands
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf4d8bf, transparent: true, opacity: 0.1, depthWrite: false, fog: false });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
    cloud.scale.set(20 + Math.random() * 30, 1.2 + Math.random() * 2.2, 4 + Math.random() * 8);
    const a = Math.random() * Math.PI * 2, r = 210 + Math.random() * 90;
    cloud.position.set(Math.cos(a) * r, 60 + Math.random() * 60, Math.sin(a) * r);
    scene.add(cloud);
  }
}

function buildTerrain(scene, concrete) {
  const geo = new THREE.PlaneGeometry(74, 54, 148, 108);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const n = Math.sin(x * 3.1 + z * 1.7) * 0.02 + Math.sin(x * 0.37 - z * 0.61) * 0.03;
    const warm = y > 0.15 ? 0.02 : 0;
    col.setRGB(0.93 + n + warm, 0.92 + n + warm * 0.6, 0.89 + n - 0.01);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: concrete, vertexColors: true, roughness: 0.94, metalness: 0.02,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.castShadow = false;
  scene.add(ground);
  return ground;
}

function addDecal(scene, kind, x, z, size, y = 0.03, rot = 0, opacity = 1) {
  const tex = decalTexture(kind);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -2, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.set(-Math.PI / 2, 0, rot);
  mesh.position.set(x, heightAt(x, z) + y, z);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

function buildFunbox(scene, concrete, metal, graffiti) {
  const g = new THREE.Group();
  const topY = funbox.h;

  // vertical face panels under the flat top
  const faceMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92, color: 0xdad5c8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(funbox.halfX * 2 - 0.04, topY, funbox.halfZ * 2 - 0.06), faceMat);
  base.position.set(funbox.x, topY / 2, funbox.z);
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  // long graffiti panels on the vertical end faces
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(funbox.halfZ * 2 - 0.2, 0.86),
      new THREE.MeshStandardMaterial({ map: graffiti, roughness: 0.9, transparent: true, opacity: 0.95 })
    );
    panel.position.set(funbox.x + side * (funbox.halfX + 0.015), 0.62, funbox.z);
    panel.rotation.y = side * Math.PI / 2;
    panel.receiveShadow = true;
    g.add(panel);
  }

  // metal coping on all four top edges
  const edge = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), metal);
    m.position.set(x, topY + 0.02, z);
    m.castShadow = true;
    g.add(m);
  };
  edge(funbox.halfX * 2, 0.13, funbox.x, funbox.z - funbox.halfZ);
  edge(funbox.halfX * 2, 0.13, funbox.x, funbox.z + funbox.halfZ);
  edge(0.13, funbox.halfZ * 2, funbox.x - funbox.halfX, funbox.z);
  edge(0.13, funbox.halfZ * 2, funbox.x + funbox.halfX, funbox.z);

  // top deck paint stripes
  const paint = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.42 });
  for (let i = -6; i <= 6; i += 2) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.42, funbox.halfZ * 2 - 0.3), paint);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(funbox.x + i, topY + 0.035, funbox.z);
    stripe.renderOrder = 3;
    g.add(stripe);
  }
  scene.add(g);
}

function buildQuarterDetails(scene, metal) {
  const g = new THREE.Group();
  const coping = (len, x, z, y, rot) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, len, 12), metal);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = rot;
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  coping(34.4, 0, -26.2, 4.4, 0);
  coping(22.4, 0, 26.2, 3.7, 0);
  coping(24.4, -36.2, 0, 4.1, Math.PI / 2);
  coping(26.4, 36.2, 0, 3.8, Math.PI / 2);

  // hazard paint strips just below the coping
  const stripeTex = new THREE.CanvasTexture((() => {
    const { c, x } = makeCanvas(512);
    x.fillStyle = '#f3e7cf';
    x.fillRect(0, 0, 512, 512);
    x.save(); x.translate(256, 256); x.rotate(-Math.PI / 4);
    for (let i = -8; i < 8; i++) {
      x.fillStyle = i % 2 ? '#181512' : '#ffc431';
      x.fillRect(-900, i * 80, 1800, 40);
    }
    x.restore();
    return c;
  })());
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.repeat.set(6, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.85, side: THREE.DoubleSide });

  const strip = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), stripeMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  };
  strip(34.2, 0.34, 0, 4.16, -26.14, 0);
  strip(22.2, 0.34, 0, 3.47, 26.14, Math.PI);
  strip(24.2, 0.34, -36.14, 3.87, 0, Math.PI / 2);
  strip(26.2, 0.34, 36.14, 3.57, 0, -Math.PI / 2);

  scene.add(g);
}

function buildRail(scene, metal, darkMetal, a, b, y, options = {}, batch = null) {
  const ax = a[0], az = a[1], bx = b[0], bz = b[1];
  const dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz);
  const radius = options.radius || 0.055;

  const dir3 = new THREE.Vector3(dx / length, 0, dz / length);
  const up3 = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up3, dir3);

  const push = (bucket, px, py, pz, q, sx, sy, sz) => {
    batch[bucket].push(new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz)
    ));
  };

  if (batch) {
    push('tops', (ax + bx) / 2, y, (az + bz) / 2, quat, radius, length, radius);
  }

  // support posts
  const count = Math.max(2, Math.round(length / 3.2));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const px = ax + dx * t, pz = az + dz * t;
    if (batch) {
      push('posts', px, y / 2, pz, quat.identity(), 0.045, y, 0.045);
      push('feet', px, 0.02, pz, quat, 0.12, 0.035, 0.12);
    }
  }

  // orange paint bands
  if (!options.plain && batch) {
    for (let i = 0; i < 3; i++) {
      const t = 0.18 + i * 0.32;
      const bandQuat = new THREE.Quaternion().setFromUnitVectors(up3, dir3);
      push('bands', ax + dx * t, y, az + dz * t, bandQuat, 0.062, 0.26, 0.062);
    }
  }

  return { ax, az, bx, bz, y, length, width: options.width || 0.5 };
}

/* Register all four top edges of a rectangular surface as grind lines. */
function grindRect(rails, x, z, w, d, y, width, rot = 0, kind = 'ledge') {
  const c = Math.cos(rot), s = Math.sin(rot);
  const pt = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const edges = [
    [pt(-w / 2, -d / 2), pt(w / 2, -d / 2)],
    [pt(-w / 2, d / 2), pt(w / 2, d / 2)],
    [pt(-w / 2, -d / 2), pt(-w / 2, d / 2)],
    [pt(w / 2, -d / 2), pt(w / 2, d / 2)],
  ];
  for (const [[ax, az], [bx, bz]] of edges) {
    rails.push({
      ax, az, bx, bz, y, length: Math.hypot(bx - ax, bz - az), width, ledge: true, kind,
    });
  }
}

function flushRailBatch(scene, metal, darkMetal, batch) {
  const unit = new THREE.CylinderGeometry(1, 1, 1, 10);
  const orange = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 });
  const specs = [
    ['tops', metal, true],
    ['posts', darkMetal, true],
    ['feet', darkMetal, false],
    ['bands', orange, false],
  ];
  for (const [key, material, shadow] of specs) {
    const list = batch[key];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(unit, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}

function buildLedge(scene, concrete, graffiti, x, z, w, d, h, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const mat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xd6d0c2, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  box.position.y = h / 2;
  box.castShadow = box.receiveShadow = true;
  group.add(box);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.8, h * 0.72),
    new THREE.MeshStandardMaterial({ map: graffiti, transparent: true, roughness: 0.9 })
  );
  panel.position.set(0, h * 0.5, d / 2 + 0.01);
  group.add(panel);

  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.9, roughness: 0.3 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, d + 0.08), metal);
  edge.position.y = h + 0.01;
  group.add(edge);
  scene.add(group);

  return { x, z, w, d, h, rot };
}

function buildPalm(scene, x, z, scale = 1, batch = null) {
  let px = 0, pz = 0;
  const trunkMatrices = batch ? batch.trunks : [];
  const leafMatrices = batch ? batch.leaves : [];
  for (let i = 0; i < 8; i++) {
    px += Math.sin(i * 0.35) * 0.16;
    pz += Math.cos(i * 0.2) * 0.05;
    const radius = (0.18 - i * 0.008) / 0.2;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x + px * scale, (0.6 + i * 1.18) * scale, z + pz * scale),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.sin(i * 0.35) * 0.09)),
      new THREE.Vector3(radius * scale, 1.25 * scale, radius * scale)
    );
    trunkMatrices.push(m);
  }

  const leafPos = new THREE.Vector3(x + px * scale, 9.6 * scale, z + pz * scale);
  for (let i = 0; i < 9; i++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, (i / 9) * Math.PI * 2, -0.32 - Math.random() * 0.25));
    const m = new THREE.Matrix4().compose(leafPos, q, new THREE.Vector3(scale, scale, scale));
    leafMatrices.push(m);
  }
}

function flushPalmBatch(scene, batch) {
  if (!batch.trunks.length) return;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.25, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5842, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, batch.trunks.length);
  batch.trunks.forEach((m, i) => trunks.setMatrixAt(i, m));
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  trunks.frustumCulled = false;
  scene.add(trunks);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.6, 0.25, 2.8, 0);
  shape.quadraticCurveTo(0.6, -0.25, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(shape);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b42, roughness: 0.9, side: THREE.DoubleSide });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, batch.leaves.length);
  batch.leaves.forEach((m, i) => leaves.setMatrixAt(i, m));
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  leaves.frustumCulled = false;
  scene.add(leaves);
}

function buildWall(scene, concrete, graffiti, x, z, w, h, ry) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xb2ab9d, roughness: 0.96 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), wallMat);
  wall.position.set(0, h / 2, 0);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  // top cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.22, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a463f, roughness: 0.8 }));
  cap.position.y = h;
  g.add(cap);

  // graffiti murals
  const panels = Math.max(1, Math.floor(w / 16));
  for (let i = 0; i < panels; i++) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(15, w / panels - 1.2), h * 0.58),
      new THREE.MeshStandardMaterial({ map: graffiti, transparent: true, roughness: 0.94, opacity: 0.96 })
    );
    panel.position.set(-w / 2 + (i + 0.5) * (w / panels), h * 0.42, 0.27);
    g.add(panel);
  }

  // vertical seams
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x3c3831, transparent: true, opacity: 0.28 });
  for (let i = 1; i < panels * 2; i++) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.05, h), seamMat);
    seam.position.set(-w / 2 + (i / (panels * 2)) * w, h / 2, 0.26);
    g.add(seam);
  }

  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
}

function buildCity(scene) {
  const win = windowTexture();
  const mat = new THREE.MeshStandardMaterial({ map: win, color: 0x6e7480, roughness: 0.85, emissive: 0x1a2028, emissiveIntensity: 0.6 });
  const matB = new THREE.MeshStandardMaterial({ map: win, color: 0x7c7a76, roughness: 0.9, emissive: 0x1a2028, emissiveIntensity: 0.5 });
  const listA = [];
  const listB = [];
  const rnd = mulberry(7721);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 52 + rnd() * 90;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 6 + rnd() * 12;
    const d = 6 + rnd() * 12;
    const h = 7 + rnd() * (r > 100 ? 30 : 18);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, h / 2 - 0.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 0.3, 0)),
      new THREE.Vector3(w, h, d)
    );
    (rnd() > 0.5 ? listA : listB).push(m);
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const buildings = [];
  for (const [list, material] of [[listA, mat], [listB, matB]]) {
    const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    buildings.push(mesh);
  }
  // distant hills
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x4b5b66, fog: true });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(40 + Math.random() * 30, 12, 8), hillMat);
    const a = Math.random() * Math.PI * 2, r = 170 + Math.random() * 60;
    hill.position.set(Math.cos(a) * r, -22, Math.sin(a) * r);
    hill.scale.y = 0.5;
    scene.add(hill);
  }
  return buildings;
}

function buildProps(scene, metal, darkMetal) {
  const lampLights = [];
  const glowTexture = (() => {
    const { c, x: g } = makeCanvas(256);
    const grad = g.createRadialGradient(128, 128, 2, 128, 128, 126);
    grad.addColorStop(0, 'rgba(255,230,180,1)');
    grad.addColorStop(0.22, 'rgba(255,185,105,0.75)');
    grad.addColorStop(0.6, 'rgba(255,140,60,0.16)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  // lamp posts with real point lights and a soft volumetric cone
  for (const [x, z] of [[-30, -21], [30, -21], [-30, 21], [30, 21]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.4, 8), darkMetal);
    pole.position.y = 3.7; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.9, 6), darkMetal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-0.85, 7.25, 0); g.add(arm);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 10, 1, true), darkMetal);
    shade.position.set(-1.75, 7.05, 0); g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b5 }));
    bulb.position.set(-1.75, 6.9, 0); g.add(bulb);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      opacity: 0.7, toneMapped: false,
    }));
    glow.position.set(-1.75, 6.9, 0);
    glow.scale.set(3.2, 3.2, 1);
    g.add(glow);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 5.8, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb266, transparent: true, opacity: 0.028, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    cone.position.set(-1.75, 4.05, 0);
    g.add(cone);

    const light = new THREE.PointLight(0xffb168, 42, 22, 2);
    light.position.set(-1.75, 6.7, 0);
    g.add(light);
    lampLights.push(light);

    g.position.set(x, 0, z);
    scene.add(g);
  }

  // cones
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.7 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.7 });
  for (const [x, z, s] of [[-6, 10, 1], [13, 7.2, .85], [-15, 1, .9]]) {
    const cone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.78, 12), coneMat);
    body.position.y = 0.39; body.castShadow = true; cone.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.15, 12), bandMat);
    band.position.y = 0.35; cone.add(band);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), coneMat);
    base.position.y = 0.025; cone.add(base);
    cone.position.set(x, 0, z); cone.scale.setScalar(s);
    scene.add(cone);
  }

  // bench outside the flow line
  const bench = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7b5a3b, roughness: 0.85 });
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.19), wood);
    slat.position.set(0, 0.45, -0.24 + i * 0.23);
    slat.castShadow = true; bench.add(slat);
  }
  for (const sx of [-1.4, 1.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.7), darkMetal);
    leg.position.set(sx, 0.22, 0); bench.add(leg);
  }
  bench.position.set(28, 0, 18.5);
  bench.rotation.y = -0.25;
  scene.add(bench);

  // scattered boards / crates for silhouette detail
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 });
  for (const [x, z] of [[-33, 17], [33, -17]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat);
    crate.position.set(x, 0.55, z); crate.rotation.y = Math.random();
    crate.castShadow = crate.receiveShadow = true;
    scene.add(crate);
  }
}

/* ---------------- main factory ---------------- */

export function createWorld(scene, renderer) {
  const concrete = concreteTexture();
  const graffiti1 = graffitiTexture(1);
  const graffiti2 = graffitiTexture(2);
  const graffiti3 = graffitiTexture(3);

  const metal = new THREE.MeshStandardMaterial({ color: 0xc4c7c9, metalness: 0.92, roughness: 0.26 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x4c4a45, metalness: 0.7, roughness: 0.5 });

  buildSky(scene);
  buildTerrain(scene, concrete);
  buildFunbox(scene, concrete, metal, graffiti2);
  buildQuarterDetails(scene, metal);
  for (const ledge of ledgeDefs) buildLedge(scene, concrete, graffiti1, ledge.x, ledge.z, ledge.w, ledge.d, ledge.h, ledge.rot);
  buildCity(scene);
  buildProps(scene, metal, darkMetal);

  // walls
  buildWall(scene, concrete, graffiti1, 0, -27.5, 76, 7.6, 0);
  buildWall(scene, concrete, graffiti2, 0, 27.5, 76, 6.8, Math.PI);
  buildWall(scene, concrete, graffiti3, -37.5, 0, 56, 7.2, Math.PI / 2);
  buildWall(scene, concrete, graffiti1, 37.5, 0, 56, 7.2, -Math.PI / 2);

  // palms outside the walls
  const palmBatch = { trunks: [], leaves: [] };
  buildPalm(scene, -44, -20, 1.05, palmBatch);
  buildPalm(scene, 45, -14, 0.92, palmBatch);
  buildPalm(scene, -46, 16, 0.88, palmBatch);
  buildPalm(scene, 42, 24, 1.0, palmBatch);
  buildPalm(scene, 8, -38, 1.15, palmBatch);
  buildPalm(scene, -18, 39, 0.95, palmBatch);
  flushPalmBatch(scene, palmBatch);

  // ground decals
  addDecal(scene, 'logo', 0, 12.2, 9, 0.035, 0.1, 0.8);
  addDecal(scene, 'arrow', 0, 8.0, 3.4, 0.04, 0, 0.85);
  addDecal(scene, 'arrow', 17, -7.4, 2.6, 0.04, Math.PI, 0.7);
  addDecal(scene, 'arrow', -20, -12.6, 2.4, 0.04, Math.PI, 0.7);
  addDecal(scene, 'hazard', 0, -19.9, 7, 0.045, 0, 0.65);
  addDecal(scene, 'hazard', 20.8, 4.0, 4, 0.045, Math.PI / 2, 0.6);

  // rails
  const rails = [];
  const railBatch = { tops: [], posts: [], feet: [], bands: [] };
  rails.push(buildRail(scene, metal, darkMetal, [-12, -15], [12, -15], 0.74, { width: 0.55 }, railBatch));
  rails.push(buildRail(scene, metal, darkMetal, [8.6, 7.2], [8.6, -2.8], 0.72, { width: 0.55 }, railBatch));
  rails.push(buildRail(scene, metal, darkMetal, [-24, 15.2], [-10, 15.2], 0.67, { width: 0.55 }, railBatch));
  rails.push(buildRail(scene, metal, darkMetal, [-27.2, -16], [-27.2, -8], 0.7, { plain: true, width: 0.55 }, railBatch));
  flushRailBatch(scene, metal, darkMetal, railBatch);

  // every edge of every ledge, plus the bench top
  for (const ledge of ledgeDefs) {
    grindRect(rails, ledge.x, ledge.z, ledge.w, ledge.d, ledge.h + 0.0375, 0.9, ledge.rot);
  }
  grindRect(rails, benchDef.x, benchDef.z, benchDef.w, benchDef.d, benchDef.h + 0.01, 0.65, benchDef.rot, 'bench');

  // funbox coping — all four edges
  grindRect(rails, funbox.x, funbox.z, funbox.halfX * 2, funbox.halfZ * 2, funbox.h + 0.06, 0.75, 0, 'coping');

  // quarter-pipe coping (catch it on the way back down)
  rails.push({ ax: -17, az: -26.18, bx: 17, bz: -26.18, y: 4.47, length: 34, width: 0.75, ledge: true, kind: 'coping' });
  rails.push({ ax: -11, az: 26.18, bx: 11, bz: 26.18, y: 3.77, length: 22, width: 0.75, ledge: true, kind: 'coping' });
  rails.push({ ax: -36.18, az: -12, bx: -36.18, bz: 12, y: 4.17, length: 24, width: 0.75, ledge: true, kind: 'coping' });
  rails.push({ ax: 36.18, az: -13, bx: 36.18, bz: 13, y: 3.86, length: 26, width: 0.75, ledge: true, kind: 'coping' });

  // launch lips
  const launchPads = [
    { ax: -17, az: -26.2, bx: 17, bz: -26.2, nx: 0, nz: -1, y: 4.4, type: 'quarter' },
    { ax: -11, az: 26.2, bx: 11, bz: 26.2, nx: 0, nz: 1, y: 3.7, type: 'quarter' },
    { ax: -36.2, az: -12, bx: -36.2, bz: 12, nx: -1, nz: 0, y: 4.1, type: 'quarter' },
    { ax: 36.2, az: -13, bx: 36.2, bz: 13, nx: 1, nz: 0, y: 3.8, type: 'quarter' },
  ];
  for (const k of kickers) {
    launchPads.push({
      ax: k.x1, az: k.zLip, bx: k.x2, bz: k.zLip,
      nx: 0, nz: k.flip ? 1 : -1, y: k.h, type: 'kicker',
    });
  }

  // SKATE letters
  const letterDefs = [
    { ch: 'S', x: 17, z: -22.5, up: 1.15 },
    { ch: 'K', x: -1, z: 3, up: 1.55 },
    { ch: 'A', x: -30.6, z: 6, up: 1.15 },
    { ch: 'T', x: 18, z: -5.1, up: 1.25 },
    { ch: 'E', x: -8, z: -15, up: 1.2 },
  ];
  const letters = [];
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd7ff3f, emissive: 0x6f8f00, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.35 });
  for (const def of letterDefs) {
    const group = new THREE.Group();
    const y = heightAt(def.x, def.z) + def.up;
    group.position.set(def.x, y, def.z);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(def.ch), transparent: true, depthWrite: false, toneMapped: false,
    }));
    sprite.scale.set(1.55, 1.55, 1);
    group.add(sprite);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 8, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.8 }));
    inner.rotation.x = Math.PI / 2;
    group.add(inner);

    scene.add(group);
    letters.push({ ...def, group, sprite, ring, inner, y, collected: false, phase: Math.random() * Math.PI * 2 });
  }

  // lights
  const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x55483a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd2a1, 2.6);
  sun.position.set(-34, 44, -22);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.022;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x7ba7d8, 0.55);
  fill.position.set(30, 22, 26);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xff7a3a, 0.5);
  rim.position.set(-20, 9, 30);
  scene.add(rim);

  scene.fog = new THREE.Fog(0xd9c4ab, 68, 220);

  const sunHelper = null;

  function update(dt, elapsed) {
    for (const l of letters) {
      if (l.collected) continue;
      l.group.position.y = l.y + Math.sin(elapsed * 2.1 + l.phase) * 0.18;
      l.group.rotation.y = elapsed * 1.35 + l.phase;
      l.ring.rotation.z = elapsed * 1.9;
      const s = 1 + Math.sin(elapsed * 3.4 + l.phase) * 0.035;
      l.sprite.scale.set(1.55 * s, 1.55 * s, 1);
    }
  }

  return {
    heightAt,
    rails,
    launchPads,
    letters,
    update,
    sun,
    spawn: PARK.spawn,
    pillars: [
      { x: -30, z: -21 }, { x: 30, z: -21 }, { x: -30, z: 21 }, { x: 30, z: 21 },
    ],
  };
}
