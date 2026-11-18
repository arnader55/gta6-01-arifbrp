// Vermilion City itself: a sun-baked desert city on a 9 x 9 block grid, built once
// from a fixed seed so every visit sees the same streets. The ground is one big
// canvas texture (roads, sidewalks, lane paint, crosswalks, the river), buildings
// are boxes with lit-window canvas textures, and every solid thing registers an
// AABB collider the player, cars and pedestrians all respect.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

const STREET_COUNT = 9; // street centrelines across the city
const PITCH = CITY.pitch;
const HALF = CITY.half;

function streetCoord(i) {
  return -PITCH * 4 + i * PITCH; // -224 .. 224
}

function blockCentre(i) {
  return streetCoord(i) + PITCH / 2; // -196 .. 196
}

/** A window texture: a warm facade with a grid of windows, some lit, some dark. */
function windowTexture(rng, base, lit) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      g.fillStyle = rng.chance(lit) ? '#ffd98a' : '#2c3e50';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A glowing shop sign, drawn on canvas and stuck on a building face. */
function signTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#14101c';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const toPx = (m) => ((m + HALF + 28) / (HALF * 2 + 56)) * S;
  // Desert sand everywhere, then the city slab.
  g.fillStyle = '#c98d55';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#b98a5e';
  g.fillRect(toPx(-HALF - 6), toPx(-HALF - 6), toPx(HALF + 6) - toPx(-HALF - 6), toPx(HALF + 6) - toPx(-HALF - 6));
  // The river along the east edge, with a sandy bank.
  g.fillStyle = '#3d7ea6';
  g.fillRect(toPx(252), 0, toPx(284) - toPx(252), S);
  g.fillStyle = '#d9b06a';
  g.fillRect(toPx(248), 0, toPx(252) - toPx(248), S);
  // Sidewalks, then asphalt, then paint, for every street both ways.
  for (let i = 0; i < STREET_COUNT; i += 1) {
    const c = streetCoord(i);
    for (const axis of ['x', 'z']) {
      g.fillStyle = '#a87a52';
      if (axis === 'x') g.fillRect(toPx(-HALF - 8), toPx(c - 8), toPx(HALF + 8) - toPx(-HALF - 8), toPx(c + 8) - toPx(c - 8));
      else g.fillRect(toPx(c - 8), toPx(-HALF - 8), toPx(c + 8) - toPx(c - 8), toPx(HALF + 8) - toPx(-HALF - 8));
      g.fillStyle = '#3a3a40';
      if (axis === 'x') g.fillRect(toPx(-HALF), toPx(c - 6), toPx(HALF) - toPx(-HALF), toPx(c + 6) - toPx(c - 6));
      else g.fillRect(toPx(c - 6), toPx(-HALF), toPx(c + 6) - toPx(c - 6), toPx(HALF) - toPx(-HALF));
    }
  }
  // Centre dashes and crosswalks.
  g.fillStyle = '#e8d44d';
  for (let i = 0; i < STREET_COUNT; i += 1) {
    const c = streetCoord(i);
    for (let d = -HALF + 14; d < HALF - 10; d += 14) {
      g.fillRect(toPx(d), toPx(c - 0.5), toPx(d + 7) - toPx(d), toPx(c + 0.5) - toPx(c - 0.5));
      g.fillRect(toPx(c - 0.5), toPx(d), toPx(c + 0.5) - toPx(c - 0.5), toPx(d + 7) - toPx(d));
    }
  }
  g.fillStyle = 'rgba(240,240,230,0.85)';
  for (let i = 0; i < STREET_COUNT; i += 1) {
    for (let j = 0; j < STREET_COUNT; j += 1) {
      const x = streetCoord(i);
      const z = streetCoord(j);
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(toPx(x - 5 + k * 2.2), toPx(z - 8), toPx(x - 3.6 + k * 2.2) - toPx(x - 5 + k * 2.2), toPx(z - 5.5) - toPx(z - 8));
        g.fillRect(toPx(x - 5 + k * 2.2), toPx(z + 5.5), toPx(x - 3.6 + k * 2.2) - toPx(x - 5 + k * 2.2), toPx(z + 8) - toPx(z + 5.5));
      }
    }
  }
  // Scrub dots out in the desert ring.
  for (let i = 0; i < 260; i += 1) {
    g.fillStyle = rng.chance(0.5) ? '#a87a4a' : '#b98a52';
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    if (x > toPx(-HALF - 10) && x < toPx(HALF + 10) && y > toPx(-HALF - 10) && y < toPx(HALF + 10)) continue;
    g.beginPath();
    g.arc(x, y, rng.range(1, 3), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const streets = { x: [], z: [] };
  for (let i = 0; i < STREET_COUNT; i += 1) {
    streets.x.push(streetCoord(i));
    streets.z.push(streetCoord(i));
  }

  // Sunset: low warm sun from the west, warm sky, haze on the horizon.
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 620);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x8a5a3a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27d, 1.6);
  sun.position.set(-180, 120, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7fa3c8, 0.35);
  fill.position.set(120, 80, -100);
  scene.add(fill);

  // The ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 56, HALF * 2 + 56),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // The river bridge on the middle east-west street.
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(40, 1, 12),
    new THREE.MeshLambertMaterial({ color: '#4a4a52' }),
  );
  bridge.position.set(268, 0.5, 0);
  scene.add(bridge);

  const facadeTex = [
    windowTexture(rng, PALETTE.buildingA, 0.45),
    windowTexture(rng, PALETTE.buildingC, 0.4),
    windowTexture(rng, PALETTE.buildingD, 0.35),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: '#5a4a42' });
  const signDefs = [
    { text: 'HOTEL', color: PALETTE.neonPink },
    { text: 'CASINO', color: PALETTE.neonAmber },
    { text: 'TACOS 24H', color: PALETTE.neonCyan },
    { text: 'MOTEL', color: PALETTE.neonPink },
    { text: 'LIQUOR', color: PALETTE.neonAmber },
  ];

  // Landmark blocks: [blockX, blockZ, name, kind]. Downtown is the middle 3x3.
  const landmarks = {
    bank: { x: blockCentre(4), z: blockCentre(4), name: 'Copper State Bank' },
    chopShop: { x: blockCentre(4), z: blockCentre(7), name: "Rico's Chop Shop" },
    docks: { x: 238, z: 84, name: 'Vermilion Docks' },
    warehouse: { x: blockCentre(1), z: blockCentre(1), name: 'Vane Warehouse' },
    hideout: { x: blockCentre(1), z: blockCentre(6), name: "Jax's Hideout" },
    hospital: { x: blockCentre(6), z: blockCentre(2), name: 'St. Cactus Hospital' },
    policeStation: { x: blockCentre(6), z: blockCentre(5), name: 'VCPD Precinct 4' },
    gasStation: { x: blockCentre(2), z: blockCentre(4), name: 'Desert Rose Gas' },
    plaza: { x: blockCentre(4), z: blockCentre(3), name: 'Founders Plaza' },
  };

  function addBuilding(x, z, w, d, h, mat, sign) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2, d * 0.7), roofMat);
    roof.position.set(x, h + 0.6, z);
    scene.add(roof);
    if (rng.chance(0.5)) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.4), new THREE.MeshLambertMaterial({ color: '#8a8a90' }));
      ac.position.set(x + w * 0.2, h + 1.4, z - d * 0.15);
      scene.add(ac);
    }
    if (sign) {
      const tex = signTexture(sign.text, sign.color);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.5),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      panel.position.set(x, Math.min(h - 2, 14), z + d / 2 + 0.15);
      scene.add(panel);
    }
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return mesh;
  }

  const downtown = (bx, bz) => bx >= 3 && bx <= 5 && bz >= 3 && bz <= 5;
  let signIndex = 0;
  for (let bx = 0; bx < 8; bx += 1) {
    for (let bz = 0; bz < 8; bz += 1) {
      const cx = blockCentre(bx);
      const cz = blockCentre(bz);
      const isDowntown = downtown(bx, bz);
      // The plaza block stays open, with a fountain.
      if (bx === 4 && bz === 3) {
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 6, 1.2, 12),
          new THREE.MeshLambertMaterial({ color: '#7fb3c8' }),
        );
        fountain.position.set(cx, 0.6, cz);
        scene.add(fountain);
        colliders.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 6, maxZ: cz + 6 });
        continue;
      }
      // The gas station is a canopy, not a tower.
      if (bx === 2 && bz === 4) {
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(24, 1, 16),
          new THREE.MeshLambertMaterial({ color: '#d94f30' }),
        );
        canopy.position.set(cx, 6, cz);
        scene.add(canopy);
        for (const dx of [-7, 7]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 8), roofMat);
          pole.position.set(cx + dx, 3, cz);
          scene.add(pole);
        }
        colliders.push({ minX: cx - 12, maxX: cx + 12, minZ: cz - 8, maxZ: cz + 8 });
        continue;
      }
      const tall = isDowntown ? rng.range(28, 62) : rng.range(8, 20);
      const tex = rng.pick(facadeTex);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      // Downtown towers get a neon sign; the bank gets a gold crown.
      const sign = isDowntown && rng.chance(0.6) ? signDefs[signIndex++ % signDefs.length] : null;
      const w = rng.range(20, 30);
      const d = rng.range(20, 30);
      addBuilding(cx, cz, w, d, tall, mat, sign);
      // A low annex on half the blocks.
      if (rng.chance(0.55)) {
        const ax = cx + (rng.chance(0.5) ? 1 : -1) * (w / 2 + 7);
        const az = cz + (rng.chance(0.5) ? 1 : -1) * (d / 2 + 6);
        if (Math.abs(ax) < HALF - 20 && Math.abs(az) < HALF - 20) {
          addBuilding(ax, az, 12, 10, rng.range(5, 9), new THREE.MeshLambertMaterial({ map: rng.pick(facadeTex) }), null);
        }
      }
    }
  }

  // The bank tower, taller than the rest, gold-topped.
  const bankMesh = new THREE.Mesh(
    new THREE.BoxGeometry(26, 74, 26),
    new THREE.MeshLambertMaterial({ map: facadeTex[0], color: '#e8c96a' }),
  );
  bankMesh.position.set(landmarks.bank.x + 16, 37, landmarks.bank.z - 14);
  scene.add(bankMesh);
  colliders.push({ minX: landmarks.bank.x + 3, maxX: landmarks.bank.x + 29, minZ: landmarks.bank.z - 27, maxZ: landmarks.bank.z - 1 });

  // Palms along the streets, cacti out in the desert.
  const palmMat = new THREE.MeshLambertMaterial({ color: PALETTE.palm, side: THREE.DoubleSide });
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat);
    trunk.position.y = 2.5;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), palmMat);
      leaf.position.y = 5.2;
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.x = -0.5;
      leaf.translateZ(1.4);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let i = 0; i < STREET_COUNT; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      if (rng.chance(0.55)) palm(streetCoord(i) + 8.5, blockCentre(j));
      if (rng.chance(0.4)) palm(blockCentre(j), streetCoord(i) + 8.5);
    }
  }
  const cactusMat = new THREE.MeshLambertMaterial({ color: PALETTE.cactus });
  for (let i = 0; i < 40; i += 1) {
    const x = rng.pick([-1, 1]) * rng.range(HALF + 12, HALF + 26);
    const z = rng.range(-HALF - 20, HALF + 20);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, rng.range(2, 4.5), 8), cactusMat);
    c.position.set(x, 1.5, z);
    scene.add(c);
    if (rng.chance(0.5)) {
      const z2 = rng.range(-HALF - 20, HALF + 20);
      const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, rng.range(2, 4), 8), cactusMat);
      c2.position.set(rng.pick([-1, 1]) * rng.range(HALF + 12, HALF + 26), 1.5, z2);
      scene.add(c2);
    }
  }

  // Street lamps at every other intersection.
  const lampMat = new THREE.MeshLambertMaterial({ color: '#2c2c30' });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8' });
  for (let i = 0; i < STREET_COUNT; i += 2) {
    for (let j = 0; j < STREET_COUNT; j += 2) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), lampMat);
      pole.position.set(streetCoord(i) + 7.5, 3.5, streetCoord(j) + 7.5);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bulbMat);
      bulb.position.set(streetCoord(i) + 7.5, 7.1, streetCoord(j) + 7.5);
      scene.add(bulb);
    }
  }

  // Distant desert mesas on the horizon, for the skyline.
  const mesaMat = new THREE.MeshLambertMaterial({ color: '#a85a3a' });
  for (const [mx, mz, mw, mh] of [[-420, -160, 180, 60], [420, 200, 220, 80], [-380, 320, 160, 46], [380, -320, 190, 70]]) {
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 60), mesaMat);
    mesa.position.set(mx, mh / 2 - 2, mz);
    scene.add(mesa);
  }

  return { colliders, streets, landmarks, bounds: HALF };
}

/** Push a circle (x, z, radius) out of every AABB it overlaps. Returns true if it hit. */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Dead centre inside the box: push out along the smallest penetration.
      const pl = pos.x - c.minX;
      const pr = c.maxX - pos.x;
      const pt = pos.z - c.minZ;
      const pb = c.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = c.minX - radius;
      else if (m === pr) pos.x = c.maxX + radius;
      else if (m === pt) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

/** True when the point is inside any collider (used for spawn safety). */
export function pointBlocked(x, z, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
  }
  return false;
}
