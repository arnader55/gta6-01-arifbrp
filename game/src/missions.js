// The story: Jax Marlowe, a wheelman fresh out of prison, owes $50,000 to Sal
// Vane. Five jobs pay the debt down, job by job, and the last one clears it.
// Each mission is a small state machine over the live game: it sets a waypoint,
// watches the player's position and the world, and reports done or failed.
export const MISSIONS = [
  {
    id: 'wheels-up',
    name: 'Wheels Up',
    brief: "Sal Vane wants a clean ride. Steal any car and bring it to Rico's Chop Shop.",
    reward: 800,
  },
  {
    id: 'the-drop',
    name: 'The Drop',
    brief: 'Pick up the package at the Vermilion Docks, then run it to the Hideout before the clock runs out.',
    reward: 1500,
  },
  {
    id: 'hot-pursuit',
    name: 'Hot Pursuit',
    brief: "Vane's men tipped off the cops. Survive a 3-star wanted level for 45 seconds.",
    reward: 2000,
  },
  {
    id: 'payback',
    name: 'Payback',
    brief: 'Five of Vane’s enforcers are waiting at the warehouse. Take them all down and grab the cash.',
    reward: 3000,
  },
  {
    id: 'big-score',
    name: 'The Big Score',
    brief: 'Steal the armored van from Copper State Bank and lose a 4-star wanted level by reaching the Hideout.',
    reward: 8000,
  },
];

function distTo(g, x, z) {
  return Math.hypot(g.player.x - x, g.player.z - z);
}

function arrive(g, x, z, r) {
  return distTo(g, x, z) < r;
}

export function createMissionManager(g) {
  let active = null; // {def, stage, timer, data}

  function start(index) {
    const def = MISSIONS[index];
    if (!def || active) return false;
    active = { def, index, stage: 0, timer: 0, data: {} };
    g.audio.missionStart();
    if (def.id === 'wheels-up') {
      g.setObjective('Steal any car — press E next to one');
      g.setWaypoint(null);
    } else if (def.id === 'the-drop') {
      g.setObjective('Go to the Docks contact');
      const docks = g.approach('docks');
      g.setWaypoint(docks.x, docks.z, 'Docks');
    } else if (def.id === 'hot-pursuit') {
      g.setWanted(3);
      active.timer = 45;
      g.setObjective('Lose the heat — survive 45 seconds');
      g.setWaypoint(null);
    } else if (def.id === 'payback') {
      g.spawnEnforcers();
      g.setObjective('Take out the enforcers (0/5)');
      const wh = g.approach('warehouse');
      g.setWaypoint(wh.x, wh.z, 'Warehouse');
    } else if (def.id === 'big-score') {
      g.spawnArmoredVan();
      g.setObjective('Steal the armored van at the Bank');
      const bank = g.approach('bank');
      g.setWaypoint(bank.x, bank.z, 'Bank');
    }
    g.hud.showMessage(`${def.name} — ${def.brief}`);
    g.log(`Mission started: ${def.name}`);
    return true;
  }

  function complete() {
    const def = active.def;
    g.cash += def.reward;
    g.debtPaid += def.reward;
    g.completedMissions.add(def.id);
    g.audio.missionDone();
    g.hud.showMessage(`Job done! +$${def.reward}  ·  Debt left: $${Math.max(0, 50000 - g.debtPaid)}`);
    g.log(`Mission complete: ${def.name} +$${def.reward}`);
    g.setObjective(g.completedMissions.size >= MISSIONS.length
      ? 'Debt paid. Vermilion City is yours — free roam.'
      : 'Press M for the next job');
    g.setWaypoint(null);
    g.save();
    active = null;
  }

  function fail(reason) {
    g.audio.missionFail();
    g.hud.showMessage(`Job failed: ${reason}. Press M to try again.`);
    g.log(`Mission failed: ${active.def.name} — ${reason}`);
    if (active.def.id === 'payback') g.clearEnforcers();
    if (active.def.id === 'big-score') g.clearArmoredVan();
    g.setObjective('Press M for the next job');
    g.setWaypoint(null);
    active = null;
  }

  function update(dt) {
    if (!active) return;
    const def = active.def;
    if (def.id === 'wheels-up') {
      if (active.stage === 0) {
        if (g.player.car) {
          active.stage = 1;
          g.setObjective("Deliver the car to Rico's Chop Shop");
          const shop = g.approach('chopShop');
          g.setWaypoint(shop.x, shop.z, 'Chop Shop');
        }
      } else if (arrive(g, g.approach('chopShop').x, g.approach('chopShop').z, 12)) {
        g.removePlayerCar();
        complete();
      }
    } else if (def.id === 'the-drop') {
      if (active.stage === 0) {
        if (arrive(g, g.approach('docks').x, g.approach('docks').z, 10)) {
          active.stage = 1;
          active.timer = 150;
          g.setObjective('Package picked up — run it to the Hideout, fast!');
          const hide = g.approach('hideout');
          g.setWaypoint(hide.x, hide.z, 'Hideout');
          g.hud.showMessage('Package secured. 150 seconds on the clock.');
        }
      } else {
        active.timer -= dt;
        g.setObjective(`Deliver the package — ${Math.max(0, Math.ceil(active.timer))}s left`);
        if (arrive(g, g.approach('hideout').x, g.approach('hideout').z, 10)) complete();
        else if (active.timer <= 0) fail('the package was late');
      }
    } else if (def.id === 'hot-pursuit') {
      active.timer -= dt;
      g.setObjective(`Lose the heat — ${Math.max(0, Math.ceil(active.timer))}s left`);
      if (g.wanted < 3) g.setWanted(3);
      if (active.timer <= 0) {
        g.setWanted(0);
        complete();
      }
    } else if (def.id === 'payback') {
      const left = g.enforcersAlive();
      g.setObjective(`Take out the enforcers (${5 - left}/5)`);
      if (left === 0) {
        if (active.stage === 0) {
          active.stage = 1;
          const wh = g.approach('warehouse');
          g.spawnCashBag(wh.x, wh.z);
          g.setObjective('Grab the cash bag at the warehouse');
          g.setWaypoint(wh.x, wh.z, 'Cash');
        } else if (g.cashBagTaken) {
          complete();
        }
      }
    } else if (def.id === 'big-score') {
      if (active.stage === 0) {
        if (g.player.car && g.player.car.kind === 'armored') {
          active.stage = 1;
          g.setWanted(4);
          g.setObjective('Lose the cops — reach the Hideout in the van');
          const hide = g.approach('hideout');
          g.setWaypoint(hide.x, hide.z, 'Hideout');
        }
      } else if (arrive(g, g.approach('hideout').x, g.approach('hideout').z, 12)) {
        g.setWanted(0);
        g.removePlayerCar();
        complete();
      }
    }
  }

  return {
    get active() {
      return active;
    },
    start,
    update,
    fail,
    nextIndex() {
      for (let i = 0; i < MISSIONS.length; i += 1) {
        if (!g.completedMissions.has(MISSIONS[i].id)) return i;
      }
      return -1;
    },
  };
}
