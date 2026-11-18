// The screenshot scenes behind ?shot=1-cover|2-chase|3-mission|4-city. Each one
// arranges the live game into a real playable moment — a downtown drive with
// the cops behind, a three-star chase, the warehouse shootout, the city at
// sunset — then lets it settle for a few steps so the frame is what a short
// game really looks like. The same seed always builds the same city.
import { STEP } from './config.js';

function settle(g, steps) {
  for (let i = 0; i < steps; i += 1) g.step(STEP);
}

function putPlayerInCar(g, x, z, heading, speed) {
  const car = g.parked[0] || g.traffic[0];
  if (!car) return null;
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  g.player.car = car;
  g.player.mesh.visible = false;
  g.player.x = x;
  g.player.z = z;
  g.player.heading = heading;
  return car;
}

function putPoliceBehind(g, count, x, z, heading) {
  g.setWanted(count > 2 ? 3 : count);
  settle(g, 2); // spawn the cruisers
  for (let i = 0; i < g.police.length; i += 1) {
    const p = g.police[i];
    // Far enough back that the chase camera (10.5 m behind the player) never
    // sits inside a cruiser, close enough to read as a pursuit.
    const back = 22 + i * 10;
    p.x = x - Math.sin(heading) * back + (i % 2 === 0 ? 5 : -5);
    p.z = z - Math.cos(heading) * back;
    p.heading = heading;
    p.speed = 30;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = heading;
  }
}

/** Put the chase camera exactly where the game puts it, so a staged shot does
 * not spend its first frames flying in from the boot position. `reverse` looks
 * back at the player from the front — the pursuit shot. */
function snapCamera(g, reverse) {
  const inCar = !!g.player.car;
  const dist = inCar ? 10.5 : 7;
  const height = inCar ? 4.2 : 3.2;
  const h = g.player.heading;
  if (reverse) {
    g.camera.position.set(g.player.x + Math.sin(h) * dist, height, g.player.z + Math.cos(h) * dist);
    g.camera.lookAt(g.player.x - Math.sin(h) * 4, 1.6, g.player.z - Math.cos(h) * 4);
    return;
  }
  g.camera.position.set(g.player.x - Math.sin(h) * dist, height, g.player.z - Math.cos(h) * dist);
  g.camera.lookAt(g.player.x + Math.sin(h) * 4, 1.6, g.player.z + Math.cos(h) * 4);
}

export function stageShot(name, g) {
  g.hud.hideTitle();
  g.hud.hideEnd();
  g.hud.showPause(false);
  g.state = 'play';
  const L = g.city.landmarks;

  if (name === '2-chase') {
    // A three-star chase down the avenue: Jax at speed, three cruisers on him.
    putPlayerInCar(g, -56, -120, 0, 26);
    putPoliceBehind(g, 3, -56, -120, 0);
    g.setObjective('Lose the heat — 3 stars and climbing');
    settle(g, 12);
    // Look back from the front: Jax's car head-on, the three cruisers behind it.
    snapCamera(g, true);
    return;
  }
  if (name === '3-mission') {
    // The Payback shootout at Vane's warehouse: Jax on foot, enforcers ahead.
    g.player.x = L.warehouse.x - 45;
    g.player.z = L.warehouse.z - 2;
    g.player.heading = Math.atan2(L.warehouse.x - g.player.x, L.warehouse.z - g.player.z);
    g.player.mesh.position.set(g.player.x, 0, g.player.z);
    g.player.mesh.rotation.y = g.player.heading;
    g.player.ammo = 48;
    g.spawnEnforcers();
    g.setWanted(1);
    g.setObjective('Take out the enforcers (0/5)');
    const wh = g.approach('warehouse');
    g.setWaypoint(wh.x, wh.z, 'Warehouse');
    settle(g, 20);
    snapCamera(g);
    return;
  }
  if (name === '4-city') {
    // The city itself at sunset, from the plaza: towers, neon, mesas, the river.
    g.player.x = L.plaza.x;
    g.player.z = L.plaza.z + 14;
    g.player.heading = Math.PI;
    g.player.mesh.position.set(g.player.x, 0, g.player.z);
    g.player.mesh.rotation.y = g.player.heading;
    g.setObjective('Vermilion City — 9 blocks of trouble, yours to take');
    settle(g, 20);
    // Hold the camera high and wide; no more steps run after this.
    g.camera.position.set(L.plaza.x - 90, 68, L.plaza.z - 110);
    g.camera.lookAt(60, 24, 60);
    return;
  }
  // 1-cover (and any other name): downtown drive, wanted level up, cruisers in
  // the mirror, the minimap and the mission objective on the HUD.
  putPlayerInCar(g, 0, 84, 0, 20);
  putPoliceBehind(g, 2, 0, 84, 0);
  g.setObjective('Deliver the stolen ride to the Chop Shop');
  const shop = g.approach('chopShop');
  g.setWaypoint(shop.x, shop.z, 'Chop Shop');
  g.cash = 1240;
  g.hud.showMessage('Wheels Up — steal a ride and bring it to the Chop Shop');
  settle(g, 24);
  // Bring one cruiser around in front as an oncoming roadblock, so the chase
  // reads in the frame instead of hiding behind the camera.
  if (g.police[0]) {
    const p = g.police[0];
    p.x = 9;
    p.z = g.player.z + 34;
    p.heading = Math.PI;
    p.speed = 18;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
  snapCamera(g);
}
