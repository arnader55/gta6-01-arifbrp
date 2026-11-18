// People on foot: the player, the pedestrians who fill the sidewalks, and the
// armed enforcers who show up in the shootout mission. One low-poly figure builder
// with a walk-cycle swing, reused for all three.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { collideCircle } from './city.js';

const SHIRTS = ['#e8e8e8', '#3a6fc2', '#c23b2e', '#e8c33a', '#3a9e6a', '#7a4a9e', '#e07a2e', '#22242a'];
const PANTS = ['#2e3a4d', '#4a3a2e', '#3a3a3a', '#5a2e3a'];

export function makePersonMesh(jacket, pants, skin) {
  const g = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: jacket });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin || '#c98d64' });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), jacketMat);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
  head.position.y = 1.68;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), new THREE.MeshLambertMaterial({ color: '#1c1410' }));
  hair.position.y = 1.76;
  hair.scale.set(1, 0.6, 1);
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), pantsMat);
  legL.position.set(-0.16, 0.38, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), pantsMat);
  legR.position.set(0.16, 0.38, 0);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacketMat);
  armL.position.set(-0.42, 1.15, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacketMat);
  armR.position.set(0.42, 1.15, 0);
  g.add(armR);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

/** Swing the limbs for a walk cycle; phase advances with distance walked. */
export function walkCycle(mesh, phase, amount) {
  const u = mesh.userData;
  const swing = Math.sin(phase) * 0.55 * amount;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  mesh.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
}

export function makePedestrian(rng, streets) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(axis === 'x' ? streets.z : streets.x);
  const along = rng.range(-220, 220);
  const side = rng.chance(0.5) ? 8.5 : -8.5;
  const mesh = makePersonMesh(rng.pick(SHIRTS), rng.pick(PANTS));
  const ped = {
    mesh,
    x: axis === 'x' ? along : line + side,
    z: axis === 'x' ? line + side : along,
    heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.0, 1.9),
    axis,
    dir: rng.chance(0.5) ? 1 : -1,
    phase: rng.range(0, Math.PI * 2),
    fleeing: false,
    state: 'walk',
  };
  mesh.position.set(ped.x, 0, ped.z);
  mesh.rotation.y = ped.heading;
  return ped;
}

/** One pedestrian step: stroll the sidewalk, turn at corners, flee from trouble. */
export function stepPedestrian(ped, dt, player, danger, streets, colliders) {
  const dx = ped.x - player.x;
  const dz = ped.z - player.z;
  const dist = Math.hypot(dx, dz);
  ped.fleeing = danger && dist < 26;
  const speed = ped.fleeing ? 5.2 : ped.speed;
  let heading = ped.heading;
  if (ped.fleeing) {
    heading = Math.atan2(dx, dz);
  } else {
    // Walk along the sidewalk line; at a corner, pick a new street.
    const along = ped.axis === 'x' ? ped.x : ped.z;
    const streetLines = ped.axis === 'x' ? streets.x : streets.z;
    let atCross = false;
    for (let i = 0; i < streetLines.length; i += 1) {
      if (Math.abs(along - streetLines[i]) < 1.0) { atCross = true; break; }
    }
    if (atCross && Math.random() < 0.01) {
      const crossLines = ped.axis === 'x' ? streets.z : streets.x;
      let best = crossLines[0];
      let bestD = Infinity;
      const crossPos = ped.axis === 'x' ? ped.z : ped.x;
      for (let i = 0; i < crossLines.length; i += 1) {
        const d = Math.abs(crossLines[i] - crossPos);
        if (d < bestD) { bestD = d; best = crossLines[i]; }
      }
      const newDir = Math.random() < 0.5 ? 1 : -1;
      if (ped.axis === 'x') {
        ped.z = best + (ped.z > best ? 8.5 : -8.5);
        ped.axis = 'z';
        ped.dir = newDir;
      } else {
        ped.x = best + (ped.x > best ? 8.5 : -8.5);
        ped.axis = 'x';
        ped.dir = newDir;
      }
    }
    heading = ped.axis === 'x' ? (ped.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir === 1 ? 0 : Math.PI);
    const end = ped.dir === 1 ? 224 : -224;
    if ((ped.dir === 1 && along > end) || (ped.dir === -1 && along < -end)) ped.dir *= -1;
  }
  let diff = heading - ped.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.heading += Math.max(-4 * dt, Math.min(4 * dt, diff * 6 * dt));
  ped.x += Math.sin(ped.heading) * speed * dt;
  ped.z += Math.cos(ped.heading) * speed * dt;
  collideCircle(ped, PLAYER.radius, colliders);
  ped.phase += speed * dt * 2.4;
  walkCycle(ped.mesh, ped.phase, ped.fleeing ? 1 : 0.7);
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
}

/** An armed enforcer for the shootout mission. */
export function makeEnforcer(x, z, rng) {
  const mesh = makePersonMesh('#1c1e24', '#2e2e34', '#b98a64');
  // A red bandana so the player can tell them apart at a glance.
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.48), new THREE.MeshLambertMaterial({ color: '#c23b2e' }));
  band.position.y = 1.62;
  mesh.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: '#111111' }));
  gun.position.set(0.42, 1.15, 0.35);
  mesh.add(gun);
  mesh.position.set(x, 0, z);
  return {
    mesh,
    x, z,
    heading: rng.range(0, Math.PI * 2),
    health: 100,
    alive: true,
    shootTimer: rng.range(0.5, 2),
    phase: rng.range(0, Math.PI * 2),
    strafe: rng.chance(0.5) ? 1 : -1,
  };
}
