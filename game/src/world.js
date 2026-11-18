// Vermilion City: the game. One Game object owns the scene, the player (on foot
// and in a car), traffic, pedestrians, the police and the wanted level, combat,
// pickups, missions and the save. Fixed 1/60 s steps; the renderer paints.
import * as THREE from 'three';
import { CITY, PLAYER, CAR, TRAFFIC, PEDS, WANTED, START_CASH, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { buildCity, collideCircle, pointBlocked } from './city.js';
import { makeCar, placeTrafficCar, stepTraffic, stepPolice, carColorList } from './vehicles.js';
import { makePersonMesh, makePedestrian, stepPedestrian, makeEnforcer, walkCycle } from './characters.js';
import { createMissionManager, MISSIONS } from './missions.js';
import { createHud } from './hud.js';

const SAVE_VERSION = 1;

export function createGame(canvas) {
  const rng = createRandom(CITY.seed);
  const audio = createAudio();
  const hud = createHud(document);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const city = buildCity(scene, rng);

  const player = {
    mesh: makePersonMesh('#d94f30', '#2e3a4d'),
    x: 0, z: 40, y: 0, vy: 0, heading: 0,
    health: PLAYER.maxHealth,
    car: null,
    walkPhase: 0,
    ammo: 24,
    punchTimer: 0,
    shootTimer: 0,
    hurtTimer: 0,
    onGround: true,
  };
  player.mesh.position.set(player.x, 0, player.z);
  scene.add(player.mesh);
  // The pistol in Jax's right hand.
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), new THREE.MeshLambertMaterial({ color: '#111111' }));
  pistol.position.set(0.42, 1.15, 0.35);
  player.mesh.add(pistol);

  // A waypoint beacon: a column of light and a spinning diamond, seen from afar.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  beacon.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffeb3b }),
  );
  diamond.position.y = 8;
  beacon.add(diamond);
  beacon.visible = false;
  scene.add(beacon);

  const g = {
    scene, camera, renderer, city, rng, audio, hud,
    player, beacon,
    traffic: [], parked: [], police: [], peds: [], enforcers: [], pickups: [],
    cash: START_CASH, debtPaid: 0, totalEarned: 0,
    completedMissions: new Set(),
    wanted: 0,
    waypoint: null,
    state: 'title',
    time: 0,
    lastSeen: 0,
    decayTimer: 0,
    bustTimer: 0,
    armoredVan: null,
    cashBagTaken: false,
    logLines: [],
  };
  const missions = createMissionManager(g);
  g.missions = missions;

  // ----- input -----
  const keys = new Set();
  const actions = { enter: false, jump: false, punch: false, shoot: false, horn: false };
  let camYawOffset = 0;
  let dragging = false;
  let lastPointerX = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') actions.enter = true;
    if (e.code === 'Space') actions.jump = true;
    if (e.code === 'KeyF') actions.punch = true;
    if (e.code === 'KeyH') actions.horn = true;
    if (e.code === 'KeyM') toggleMenu();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyN') audio.toggleMute();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    dragging = true;
    lastPointerX = e.clientX;
    if (g.state === 'play') actions.shoot = true;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camYawOffset += (e.clientX - lastPointerX) * 0.005;
    lastPointerX = e.clientX;
  });
  window.addEventListener('resize', resize);
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();

  // ----- save / load -----
  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VERSION, cash: g.cash, debtPaid: g.debtPaid, totalEarned: g.totalEarned,
        completed: [...g.completedMissions],
      }));
    } catch { /* storage off: the save lasts this visit only */ }
  }
  g.save = save;
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.v !== SAVE_VERSION) return;
      g.cash = data.cash ?? START_CASH;
      g.debtPaid = data.debtPaid ?? 0;
      g.totalEarned = data.totalEarned ?? 0;
      g.completedMissions = new Set(data.completed ?? []);
    } catch { /* a bad save is ignored */ }
  }
  load();

  function log(msg) {
    g.logLines.push(`[${g.time.toFixed(1)}s] ${msg}`);
  }
  g.log = log;

  // ----- spawning -----
  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const car = makeCar(0, 0, 0, rng.pick(carColorList()), 'civilian');
      car.cruise = rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
      placeTrafficCar(car, rng, city.streets, city.colliders);
      scene.add(car.mesh);
      g.traffic.push(car);
    }
  }
  function spawnParked() {
    let placed = 0;
    let tries = 0;
    while (placed < 12 && tries < 200) {
      tries += 1;
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const line = rng.pick(axis === 'x' ? city.streets.z : city.streets.x);
      const along = rng.range(-210, 210);
      const side = rng.chance(0.5) ? 4.2 : -4.2;
      const x = axis === 'x' ? along : line + side;
      const z = axis === 'x' ? line + side : along;
      if (pointBlocked(x, z, city.colliders)) continue;
      const car = makeCar(x, z, axis === 'x' ? Math.PI / 2 : 0, rng.pick(carColorList()), 'civilian');
      scene.add(car.mesh);
      g.parked.push(car);
      placed += 1;
    }
  }
  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const ped = makePedestrian(rng, city.streets);
      scene.add(ped.mesh);
      g.peds.push(ped);
    }
  }
  function spawnPickups() {
    const kinds = ['cash', 'cash', 'cash', 'cash', 'health', 'health', 'ammo', 'ammo'];
    for (const kind of kinds) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 50; tries += 1) {
        const axis = rng.chance(0.5) ? 'x' : 'z';
        const line = rng.pick(axis === 'x' ? city.streets.z : city.streets.x);
        const along = rng.range(-200, 200);
        x = axis === 'x' ? along : line + 9;
        z = axis === 'x' ? line + 9 : along;
        if (!pointBlocked(x, z, city.colliders)) break;
      }
      addPickup(kind, x, z);
    }
  }
  function addPickup(kind, x, z) {
    const color = kind === 'cash' ? 0x2e9e4a : kind === 'health' ? 0xffffff : 0xffeb3b;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.position.set(x, 0.9, z);
    scene.add(mesh);
    const p = { kind, mesh, x, z, taken: false, spin: rng.range(0, 6) };
    g.pickups.push(p);
    return p;
  }
  g.spawnCashBag = (x, z) => {
    g.cashBagTaken = false;
    const p = addPickup('cashbag', x, z);
    p.mesh.scale.set(1.4, 1.4, 1.4);
    return p;
  };

  // ----- wanted & police -----
  function setWanted(n) {
    g.wanted = Math.max(0, Math.min(WANTED.maxStars, n));
    audio.setSiren(g.wanted > 0);
    hud.setWanted(g.wanted);
  }
  g.setWanted = setWanted;
  function addWanted(n) {
    if (g.wanted === 0) g.lastSeen = g.time;
    setWanted(g.wanted + n);
  }
  g.addWanted = addWanted;

  function spawnPoliceCar() {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(60, 90);
    let x = player.x + Math.cos(angle) * dist;
    let z = player.z + Math.sin(angle) * dist;
    x = Math.max(-230, Math.min(230, x));
    z = Math.max(-230, Math.min(230, z));
    if (pointBlocked(x, z, city.colliders)) { x = player.x + 60; z = player.z; }
    const car = makeCar(x, z, 0, '#f2f2ee', 'police');
    scene.add(car.mesh);
    g.police.push(car);
    return car;
  }
  function syncPolice() {
    const want = g.wanted > 0 ? Math.min(g.wanted + 1, 5) : 0;
    while (g.police.length < want) spawnPoliceCar();
    while (g.police.length > want) {
      const car = g.police.pop();
      if (car === player.car) exitCar();
      scene.remove(car.mesh);
    }
  }

  // ----- mission glue (called by missions.js) -----
  // Landmarks sit at block centres, inside their buildings. A mission target is
  // the street in front of the block instead, so a car can actually reach it.
  g.approach = (key) => {
    const L = city.landmarks[key];
    if (key === 'docks') return { x: 224, z: L.z };
    return { x: L.x, z: L.z - 28 };
  };
  g.setWaypoint = (x, z, label) => {
    g.waypoint = x === null ? null : { x, z, label };
    beacon.visible = g.waypoint !== null;
    if (g.waypoint) beacon.position.set(x, 0, z);
  };
  g.setObjective = (t) => hud.setObjective(t);
  g.spawnEnforcers = () => {
    const L = city.landmarks.warehouse;
    // On the streets around the warehouse block, never inside its buildings.
    const spots = [
      [L.x - 27, L.z - 12], [L.x - 27, L.z + 10], [L.x + 27, L.z - 8],
      [L.x + 27, L.z + 14], [L.x - 6, L.z - 27],
    ];
    for (const [x, z] of spots) {
      const e = makeEnforcer(x, z, rng);
      scene.add(e.mesh);
      g.enforcers.push(e);
    }
  };
  g.enforcersAlive = () => g.enforcers.filter((e) => e.alive).length;
  g.clearEnforcers = () => {
    for (const e of g.enforcers) scene.remove(e.mesh);
    g.enforcers = [];
  };
  g.spawnArmoredVan = () => {
    const at = g.approach('bank');
    const van = makeCar(at.x, at.z, Math.PI / 2, '#5a6a7a', 'armored');
    van.mesh.scale.set(1.25, 1.25, 1.25);
    scene.add(van.mesh);
    g.parked.push(van);
    g.armoredVan = van;
  };
  g.clearArmoredVan = () => {
    if (!g.armoredVan) return;
    const i = g.parked.indexOf(g.armoredVan);
    if (i >= 0) g.parked.splice(i, 1);
    if (player.car === g.armoredVan) exitCar();
    scene.remove(g.armoredVan.mesh);
    g.armoredVan = null;
  };
  g.removePlayerCar = () => {
    if (!player.car) return;
    const car = player.car;
    scene.remove(car.mesh);
    const ti = g.traffic.indexOf(car);
    if (ti >= 0) g.traffic.splice(ti, 1);
    const pi = g.parked.indexOf(car);
    if (pi >= 0) g.parked.splice(pi, 1);
    const ci = g.police.indexOf(car);
    if (ci >= 0) g.police.splice(ci, 1);
    player.car = null;
    player.mesh.visible = true;
    player.x = car.x + 3;
    player.z = car.z;
    player.mesh.position.set(player.x, 0, player.z);
  };

  // ----- car enter / exit -----
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const list of [g.parked, g.traffic, g.police]) {
      for (const car of list) {
        const d = Math.hypot(car.x - player.x, car.z - player.z);
        if (d < bestD) { bestD = d; best = car; }
      }
    }
    return best;
  }
  function enterCar() {
    const car = nearestCar(4.5);
    if (!car) return;
    if (car.kind === 'police') {
      addWanted(2);
      hud.showMessage('You stole a police cruiser! The VCPD is coming.');
    } else if (g.traffic.includes(car)) {
      addWanted(1);
      hud.showMessage(`You stole a ${car.name}. Someone saw that.`);
      g.traffic.splice(g.traffic.indexOf(car), 1);
    } else {
      hud.showMessage(`You took the ${car.name}.`);
    }
    player.car = car;
    player.mesh.visible = false;
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    audio.unlock();
    log(`Entered car (${car.kind})`);
  }
  function exitCar() {
    if (!player.car) return;
    const car = player.car;
    car.speed = 0;
    player.car = null;
    player.mesh.visible = true;
    player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
    player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
    player.heading = car.heading;
    player.mesh.position.set(player.x, 0, player.z);
    if (!g.parked.includes(car) && !g.police.includes(car)) g.parked.push(car);
    log('Exited car');
  }
  g.exitCar = exitCar;

  // ----- combat -----
  const tracers = [];
  function fireTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color || 0xffe9a8 }));
    scene.add(line);
    tracers.push({ line, life: 0.08 });
  }
  function shoot() {
    if (player.ammo <= 0) {
      hud.showMessage('Out of ammo — find a yellow ammo box, or press F to punch.');
      player.shootTimer = 0.3;
      return;
    }
    player.ammo -= 1;
    player.shootTimer = 0.25;
    audio.shoot();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const from = new THREE.Vector3(player.x, 1.4, player.z);
    const dir = new THREE.Vector3(fx, 0, fz);
    let bestD = 70;
    let bestTarget = null;
    let bestKind = '';
    for (const e of g.enforcers) {
      if (!e.alive) continue;
      const d = hitDistance(from, dir, e.x, 1.2, e.z, 1.0);
      if (d !== null && d < bestD) { bestD = d; bestTarget = e; bestKind = 'enforcer'; }
    }
    for (const ped of g.peds) {
      if (ped.state === 'down') continue;
      const d = hitDistance(from, dir, ped.x, 1.2, ped.z, 0.8);
      if (d !== null && d < bestD) { bestD = d; bestTarget = ped; bestKind = 'ped'; }
    }
    for (const list of [g.traffic, g.parked, g.police]) {
      for (const car of list) {
        if (car === player.car) continue;
        const d = hitDistance(from, dir, car.x, 1.0, car.z, 2.2);
        if (d !== null && d < bestD) { bestD = d; bestTarget = car; bestKind = 'car'; }
      }
    }
    const to = from.clone().addScaledVector(dir, bestD);
    fireTracer(from, to);
    if (!bestTarget) return;
    if (bestKind === 'enforcer') {
      bestTarget.health -= PLAYER.pistolDamage;
      if (bestTarget.health <= 0) {
        bestTarget.alive = false;
        bestTarget.mesh.rotation.x = -Math.PI / 2;
        bestTarget.mesh.position.y = 0.3;
        addWanted(1);
        hud.showMessage('Enforcer down.');
      }
    } else if (bestKind === 'ped') {
      knockPed(bestTarget);
      addWanted(2);
    } else if (bestKind === 'car') {
      bestTarget.health -= PLAYER.pistolDamage;
      if (bestTarget.health <= 0) explodeCar(bestTarget);
      else addWanted(1);
    }
  }
  /** Distance along the ray to a vertical cylinder, or null for a miss. */
  function hitDistance(from, dir, cx, cy, cz, r) {
    const dx = cx - from.x;
    const dz = cz - from.z;
    const along = dx * dir.x + dz * dir.z;
    if (along < 0) return null;
    const px = from.x + dir.x * along;
    const pz = from.z + dir.z * along;
    const perp = Math.hypot(px - cx, pz - cz);
    if (perp > r) return null;
    return along;
  }
  function knockPed(ped) {
    ped.state = 'down';
    ped.downTimer = 8;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }
  function punch() {
    player.punchTimer = 0.4;
    audio.punch();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (const e of g.enforcers) {
      if (!e.alive) continue;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      if (Math.hypot(dx, dz) < 2.4 && dx * fx + dz * fz > 0) {
        e.health -= PLAYER.punchDamage;
        if (e.health <= 0) {
          e.alive = false;
          e.mesh.rotation.x = -Math.PI / 2;
          e.mesh.position.y = 0.3;
        }
      }
    }
    for (const ped of g.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      if (Math.hypot(dx, dz) < 2.2 && dx * fx + dz * fz > 0) {
        knockPed(ped);
        addWanted(1);
      }
    }
  }
  function explodeCar(car) {
    audio.crash();
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(3, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }),
    );
    flash.position.set(car.x, 1.5, car.z);
    scene.add(flash);
    tracers.push({ line: flash, life: 0.5, isMesh: true });
    if (car === player.car) {
      exitCar();
      damagePlayer(30);
    }
    scene.remove(car.mesh);
    for (const list of [g.traffic, g.parked, g.police]) {
      const i = list.indexOf(car);
      if (i >= 0) list.splice(i, 1);
    }
    addWanted(1);
  }

  function damagePlayer(amount) {
    if (player.hurtTimer > 0) return;
    player.health -= amount;
    player.hurtTimer = 0.5;
    hud.setHealth(player.health);
    if (player.health <= 0) wasted();
  }

  function wasted() {
    audio.wasted();
    const lost = Math.min(g.cash, 200);
    g.cash -= lost;
    hud.showMessage(`WASTED — you lost $${lost}.`);
    if (missions.active) missions.fail('Jax got wasted');
    endTo('WASTED', `You lost $${lost}. The hospital patched you up.`, city.landmarks.hospital);
  }
  function busted() {
    audio.wasted();
    const lost = Math.min(g.cash, 300);
    g.cash -= lost;
    hud.showMessage(`BUSTED — the VCPD took $${lost}.`);
    if (missions.active) missions.fail('Jax got busted');
    endTo('BUSTED', `The VCPD took $${lost}. Precinct 4 processed you.`, city.landmarks.policeStation);
  }
  function endTo(title, sub, place) {
    if (player.car) {
      scene.remove(player.car.mesh);
      player.car = null;
    }
    g.police.forEach((c) => scene.remove(c.mesh));
    g.police = [];
    setWanted(0);
    player.health = PLAYER.maxHealth;
    hud.setHealth(player.health);
    player.x = place.x + 10;
    player.z = place.z + 10;
    player.y = 0;
    player.vy = 0;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    g.state = 'end';
    hud.showEnd(title, sub);
    save();
  }
  function respawn() {
    hud.hideEnd();
    g.state = 'play';
  }
  g.respawn = respawn;

  // ----- screens -----
  function startGame() {
    hud.hideTitle();
    audio.unlock();
    audio.startMusic();
    g.state = 'play';
    if (g.completedMissions.size === 0 && !missions.active) {
      hud.setObjective('Press M — your first job is waiting');
      hud.showMessage('Jax Marlowe is out. Sal Vane wants his $50,000. Press M for work.');
    }
  }
  g.startGame = startGame;
  function togglePause() {
    if (g.state === 'play') {
      g.state = 'paused';
      hud.showPause(true);
    } else if (g.state === 'paused') {
      g.state = 'play';
      hud.showPause(false);
    }
  }
  function toggleMenu() {
    if (g.state === 'play') {
      g.state = 'menu';
      hud.showMenu(g.completedMissions, (i) => {
        hud.hideMenu();
        g.state = 'play';
        missions.start(i);
      }, () => {
        hud.hideMenu();
        g.state = 'play';
      });
    } else if (g.state === 'menu') {
      hud.hideMenu();
      g.state = 'play';
    }
  }
  g.toggleMenu = toggleMenu;

  // ----- the step -----
  function stepPlayerOnFoot(dt) {
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is relative to the camera, which trails the player's heading.
    const heading = player.heading + camYawOffset * 0.4;
    const mx = Math.sin(heading) * fwd + Math.sin(heading + Math.PI / 2) * strafe;
    const mz = Math.cos(heading) * fwd + Math.cos(heading + Math.PI / 2) * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      player.x += (mx / len) * speed * dt;
      player.z += (mz / len) * speed * dt;
      const want = Math.atan2(mx, mz);
      let diff = want - player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.heading += diff * Math.min(1, 12 * dt);
      player.walkPhase += speed * dt * 1.6;
      walkCycle(player.mesh, player.walkPhase, 1);
    } else {
      walkCycle(player.mesh, player.walkPhase, 0);
    }
    if (actions.jump && player.onGround) {
      player.vy = PLAYER.jumpSpeed;
      player.onGround = false;
    }
    player.vy -= 22 * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.onGround = true;
    }
    collideCircle(player, PLAYER.radius, city.colliders);
    player.x = Math.max(-248, Math.min(248, player.x));
    player.z = Math.max(-248, Math.min(248, player.z));
    player.mesh.position.set(player.x, player.y, player.z);
    player.mesh.rotation.y = player.heading;
    if (actions.enter) enterCar();
    if (actions.punch && player.punchTimer <= 0) punch();
    if (actions.shoot && player.shootTimer <= 0) shoot();
  }

  function stepPlayerDriving(dt) {
    const car = player.car;
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const back = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const steerIn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    const handbrake = keys.has('Space');
    if (fwd) car.speed += CAR.accel * dt;
    if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
    car.speed -= car.speed * CAR.drag * dt * 0.4;
    if (handbrake) car.speed *= Math.max(0, 1 - 3 * dt);
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerTarget = steerIn * CAR.steerMax * Math.min(1, Math.abs(car.speed) / 8 + 0.3);
    car.steer += Math.max(-CAR.steerSpeed * dt, Math.min(CAR.steerSpeed * dt, steerTarget - car.steer));
    car.heading += car.steer * (car.speed / 4.5) * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    car.x = nx;
    car.z = nz;
    if (collideCircle(car, CAR.radius, city.colliders)) {
      const impact = Math.abs(car.speed);
      car.speed *= -0.25;
      if (impact > 8) {
        audio.crash();
        car.health -= impact * 0.8;
        damagePlayer(impact * 0.4);
        if (car.health <= 0) explodeCar(car);
      }
    }
    // Bump into other cars.
    for (const list of [g.traffic, g.parked, g.police]) {
      for (const other of list) {
        if (other === car) continue;
        const dx = car.x - other.x;
        const dz = car.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.2 && d > 0.01) {
          const push = (4.2 - d) / 2;
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
          if (Math.abs(car.speed) > 6) {
            other.speed = Math.max(other.speed, car.speed * 0.4);
            car.speed *= 0.7;
            if (other.kind === 'police') addWanted(0); // ramming a cruiser keeps the heat
            audio.crash();
          }
        }
      }
    }
    // Run over pedestrians.
    for (const ped of g.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2.4 && Math.abs(car.speed) > 3) {
        knockPed(ped);
        addWanted(1);
        audio.crash();
        hud.showMessage('You hit a pedestrian!');
      }
    }
    car.x = Math.max(-248, Math.min(248, car.x));
    car.z = Math.max(-248, Math.min(248, car.z));
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.6;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    // Camera shake at speed, engine note follows speed.
    audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
    if (actions.enter) exitCar();
    if (actions.horn) audio.horn();
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    void before;
  }

  function stepPoliceAndWanted(dt) {
    syncPolice();
    let nearest = Infinity;
    let touching = false;
    for (const car of g.police) {
      const hit = stepPolice(car, dt, player, city.colliders, g.time);
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      nearest = Math.min(nearest, d);
      if (hit) touching = true;
      // A cruiser ramming the player's car damages it.
      if (player.car && d < 3.4) {
        player.car.health -= 12 * dt;
        player.car.speed *= 0.98;
        if (player.car.health <= 0) explodeCar(player.car);
      }
    }
    if (g.wanted > 0) {
      if (nearest < 55) {
        g.lastSeen = g.time;
        g.decayTimer = 0;
      } else {
        g.decayTimer += dt;
        if (g.decayTimer > WANTED.decayDelay) {
          g.decayTimer = WANTED.decayDelay;
          g.decayAcc = (g.decayAcc || 0) + dt;
          if (g.decayAcc > WANTED.decayStep) {
            g.decayAcc = 0;
            setWanted(g.wanted - 1);
            if (g.wanted === 0) hud.showMessage('You lost the cops. Clean — for now.');
          }
        }
      }
      // Busted: a cruiser sitting on Jax while he is on foot.
      if (!player.car && touching) {
        g.bustTimer += dt;
        hud.setObjective(`BUSTED IN ${Math.max(0, WANTED.bustSeconds - g.bustTimer).toFixed(1)}s — RUN!`);
        if (g.bustTimer >= WANTED.bustSeconds) {
          g.bustTimer = 0;
          busted();
        }
      } else {
        g.bustTimer = 0;
      }
    }
  }

  function stepEnforcers(dt) {
    for (const e of g.enforcers) {
      if (!e.alive) continue;
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);
      // Strafe sideways and keep a fighting distance.
      e.heading = Math.atan2(dx, dz);
      const strafeDir = e.strafe;
      e.x += Math.sin(e.heading + Math.PI / 2) * strafeDir * 2.2 * dt;
      e.z += Math.cos(e.heading + Math.PI / 2) * strafeDir * 2.2 * dt;
      if (dist > 26) {
        e.x += Math.sin(e.heading) * 3.5 * dt;
        e.z += Math.cos(e.heading) * 3.5 * dt;
      } else if (dist < 8) {
        e.x -= Math.sin(e.heading) * 2 * dt;
        e.z -= Math.cos(e.heading) * 2 * dt;
      }
      if (Math.random() < 0.005) e.strafe *= -1;
      collideCircle(e, PLAYER.radius, city.colliders);
      e.phase += dt * 4;
      walkCycle(e.mesh, e.phase, 0.6);
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 34) {
        e.shootTimer = rng.range(1.2, 2.4);
        audio.enemyShoot();
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        fireTracer(from, to, 0xff5040);
        if (Math.random() < 0.42) damagePlayer(8);
      }
    }
  }

  function stepPickups(dt) {
    for (const p of g.pickups) {
      if (p.taken) continue;
      p.spin += dt * 2;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 0.9 + Math.sin(p.spin * 1.4) * 0.15;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < 2.2) {
        p.taken = true;
        scene.remove(p.mesh);
        audio.pickup();
        if (p.kind === 'cash') {
          const amount = rng.int(50, 200);
          g.cash += amount;
          g.totalEarned += amount;
          hud.showMessage(`Found $${amount} stashed cash.`);
        } else if (p.kind === 'cashbag') {
          g.cashBagTaken = true;
          g.cash += 500;
          g.totalEarned += 500;
          hud.showMessage('Cash bag grabbed — $500.');
        } else if (p.kind === 'health') {
          player.health = Math.min(PLAYER.maxHealth, player.health + 40);
          hud.setHealth(player.health);
          hud.showMessage('Health +40.');
        } else if (p.kind === 'ammo') {
          player.ammo += 12;
          hud.showMessage('Ammo +12.');
        }
        save();
      }
    }
  }

  function stepCamera(dt) {
    const inCar = !!player.car;
    const dist = inCar ? 10.5 : 7;
    const height = inCar ? 4.2 : 3.2;
    const heading = player.heading + camYawOffset;
    camYawOffset *= Math.max(0, 1 - dt * 0.6);
    const tx = player.x - Math.sin(heading) * dist;
    const tz = player.z - Math.cos(heading) * dist;
    const speedK = inCar ? Math.abs(player.car.speed) : 0;
    const shake = inCar && speedK > 20 ? (Math.random() - 0.5) * 0.08 : 0;
    camera.position.x += (tx - camera.position.x) * Math.min(1, 5 * dt);
    camera.position.y += (height + shake - camera.position.y) * Math.min(1, 5 * dt);
    camera.position.z += (tz - camera.position.z) * Math.min(1, 5 * dt);
    camera.lookAt(player.x + Math.sin(player.heading) * 4, 1.6, player.z + Math.cos(player.heading) * 4);
  }

  function step(dt) {
    g.time += dt;
    if (g.state !== 'play') return;
    player.punchTimer = Math.max(0, player.punchTimer - dt);
    player.shootTimer = Math.max(0, player.shootTimer - dt);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    if (player.car) stepPlayerDriving(dt);
    else stepPlayerOnFoot(dt);
    // Traffic and pedestrians keep the city alive.
    const others = [...g.traffic, ...g.parked, ...g.police];
    for (const car of g.traffic) stepTraffic(car, dt, rng, city.streets, others, city.colliders);
    const danger = g.wanted > 0;
    for (const ped of g.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          const axis = rng.chance(0.5) ? 'x' : 'z';
          const line = rng.pick(axis === 'x' ? city.streets.z : city.streets.x);
          ped.x = axis === 'x' ? rng.range(-200, 200) : line + 8.5;
          ped.z = axis === 'x' ? line + 8.5 : rng.range(-200, 200);
        }
        continue;
      }
      stepPedestrian(ped, dt, player, danger, city.streets, city.colliders);
    }
    stepPoliceAndWanted(dt);
    stepEnforcers(dt);
    stepPickups(dt);
    missions.update(dt);
    // Health slowly comes back when Jax is not being shot at.
    if (player.hurtTimer <= 0 && player.health < PLAYER.maxHealth && player.health > 0) {
      player.health = Math.min(PLAYER.maxHealth, player.health + 1.5 * dt);
      hud.setHealth(player.health);
    }
    if (!player.car) audio.setEngine(0, false);
    // Tracers and explosion flashes fade out.
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.line);
        if (t.isMesh) t.line.geometry.dispose();
        tracers.splice(i, 1);
      } else if (t.isMesh) {
        t.line.material.opacity = t.life * 1.8;
        t.line.scale.multiplyScalar(1 + dt * 2);
      }
    }
    // The beacon spins.
    if (beacon.visible) {
      diamond.rotation.y += dt * 2;
      diamond.position.y = 8 + Math.sin(g.time * 2) * 0.6;
    }
    stepCamera(dt);
    hud.setCash(g.cash);
    hud.setDebt(g.debtPaid);
    hud.setHealth(player.health);
    hud.setSpeed(player.car ? Math.abs(player.car.speed) * 3.6 : 0, !!player.car);
    hud.drawMinimap(g);
    actions.enter = false;
    actions.jump = false;
    actions.punch = false;
    actions.shoot = false;
    actions.horn = false;
  }
  g.step = step;

  function render() {
    renderer.render(scene, camera);
  }
  g.render = render;

  // ----- boot -----
  spawnTraffic();
  spawnParked();
  spawnPeds();
  spawnPickups();
  camera.position.set(player.x, 3.2, player.z - 7);
  camera.lookAt(player.x, 1.6, player.z + 4);
  hud.setCash(g.cash);
  hud.setDebt(g.debtPaid);
  hud.setHealth(player.health);
  hud.setWanted(0);
  hud.setObjective('Press Space or click to start');
  hud.showTitle(g.totalEarned);
  hud.drawMinimap(g);
  render();

  return g;
}
