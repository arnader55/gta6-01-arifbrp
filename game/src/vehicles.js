// Cars: a low-poly mesh builder (body, cabin, wheels, lights) plus the two fleets
// that drive the city — civilian traffic that follows the street grid, and the
// VCPD cruisers that chase the player when the wanted level is up.
import * as THREE from 'three';
import { CAR } from './config.js';
import { collideCircle, pointBlocked } from './city.js';

const CAR_COLORS = ['#c23b2e', '#2e6fc2', '#e8c33a', '#3a9e6a', '#7a4a9e', '#d8d8d2', '#22242a', '#e07a2e', '#4a9e9e'];
const CAR_NAMES = ['Vesper', 'Comet', 'Sandpiper', 'Coyote', 'Mojave', 'Sunrunner', 'Dune Buggy', 'Palomino'];

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: '#1c2c3a' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.0), bodyMat);
  hood.position.set(0, 0.9, 1.7);
  g.add(hood);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#141414' });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    h.position.set(hx, 0.62, 2.21);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ff2a22' });
  for (const tx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    t.position.set(tx, 0.62, -2.21);
    g.add(t);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: '#111111' }));
    bar.position.set(0, 1.52, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
    red.position.set(-0.3, 1.53, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: '#2050ff' }));
    blue.position.set(0.3, 1.53, -0.2);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: '#111111' }));
    star.position.set(0, 0.7, 2.22);
    g.add(star);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeCar(x, z, heading, color, kind) {
  const mesh = makeCarMesh(color, kind || 'civilian');
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    mesh,
    kind: kind || 'civilian',
    name: CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)],
    x, z, heading,
    speed: 0,
    steer: 0,
    health: CAR.maxHealth,
    // Traffic state: which street it is on and which way it drives.
    axis: 'x',
    dir: 1,
    target: 0,
    stuck: 0,
    flash: 0,
  };
}

/** Put a traffic car on a random street, driving along it. */
export function placeTrafficCar(car, rng, streets, colliders) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(axis === 'x' ? streets.z : streets.x);
  const along = rng.range(-220, 220);
  const dir = rng.chance(0.5) ? 1 : -1;
  const lane = dir === 1 ? 3 : -3;
  if (axis === 'x') {
    car.x = along;
    car.z = line + lane;
    car.heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = line + lane;
    car.z = along;
    car.heading = dir === 1 ? 0 : Math.PI;
  }
  car.axis = axis;
  car.dir = dir;
  car.speed = rng.range(7, 12);
  car.target = dir === 1 ? 224 : -224;
  if (pointBlocked(car.x, car.z, colliders)) {
    car.x = 0;
    car.z = line + lane;
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

/** One traffic step: drive along the street, turn at intersections, brake for cars ahead. */
export function stepTraffic(car, dt, rng, streets, others, colliders) {
  const speed = car.speed;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Brake if another car is close ahead.
  let ahead = false;
  for (let i = 0; i < others.length; i += 1) {
    const o = others[i];
    if (o === car) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 9 && dx * fx + dz * fz > 0) { ahead = true; break; }
  }
  const targetSpeed = ahead ? 0 : car.cruise || 10;
  car.speed += Math.max(-14 * dt, Math.min(8 * dt, targetSpeed - car.speed));
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  const along = car.axis === 'x' ? car.x : car.z;
  const nearEnd = car.dir === 1 ? along > 218 : along < -218;
  // At an intersection, sometimes turn onto the cross street.
  const streetLines = car.axis === 'x' ? streets.x : streets.z;
  let atCross = false;
  for (let i = 0; i < streetLines.length; i += 1) {
    if (Math.abs(along - streetLines[i]) < 1.2) { atCross = true; break; }
  }
  if ((atCross && rng.chance(0.02)) || nearEnd) {
    const crossLines = car.axis === 'x' ? streets.z : streets.x;
    let best = crossLines[0];
    let bestD = Infinity;
    const crossPos = car.axis === 'x' ? car.z : car.x;
    for (let i = 0; i < crossLines.length; i += 1) {
      const d = Math.abs(crossLines[i] - crossPos);
      if (d < bestD) { bestD = d; best = crossLines[i]; }
    }
    const newDir = rng.chance(0.5) ? 1 : -1;
    if (car.axis === 'x') {
      car.z = best + (newDir === 1 ? 3 : -3);
      car.axis = 'z';
      car.dir = newDir;
      car.heading = newDir === 1 ? 0 : Math.PI;
    } else {
      car.x = best + (newDir === 1 ? 3 : -3);
      car.axis = 'x';
      car.dir = newDir;
      car.heading = newDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  if (collideCircle(car, CAR.radius, colliders)) car.speed *= 0.5;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.6;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
}

/** One police step: steer toward the player and ram. Returns true if it touched the player. */
export function stepPolice(car, dt, player, colliders, time) {
  const dx = player.x - car.x;
  const dz = player.z - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 3 * dt));
  const targetSpeed = dist > 40 ? 30 : dist > 12 ? 24 : 16;
  car.speed += Math.max(-20 * dt, Math.min(14 * dt, targetSpeed - car.speed));
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  if (collideCircle(car, CAR.radius, colliders)) car.speed *= 0.6;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Flash the light bar, alternating red and blue.
  const phase = Math.floor(time * 6) % 2 === 0;
  if (car.mesh.userData.lightRed) {
    car.mesh.userData.lightRed.material.color.setHex(phase ? 0xff2020 : 0x550000);
    car.mesh.userData.lightBlue.material.color.setHex(phase ? 0x000055 : 0x2050ff);
  }
  const spin = car.speed * dt * 2.6;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  return dist < 3.2;
}

export function carColorList() {
  return CAR_COLORS;
}
