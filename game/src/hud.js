// The HUD: DOM panels for cash, health, wanted stars and the objective, a 2D
// canvas minimap of the whole city, and the title, pause, mission and end
// screens. All of it is plain DOM so it stays readable in screenshots.
import { MISSIONS } from './missions.js';

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const cashEl = $('cash');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const starsEl = $('stars');
  const objectiveEl = $('objective');
  const toastEl = $('toast');
  const speedEl = $('speed');
  const minimap = $('minimap');
  const mm = minimap.getContext('2d');
  const titleScreen = $('title-screen');
  const pauseScreen = $('pause-screen');
  const menuScreen = $('menu-screen');
  const missionList = $('mission-list');
  const endScreen = $('end-screen');
  const endTitle = $('end-title');
  const endSub = $('end-sub');
  const debtEl = $('debt');
  let toastTimer = null;
  let lastCash = -1;
  let lastStars = -1;
  let lastHealth = -1;

  function setCash(cash) {
    if (cash === lastCash) return;
    lastCash = cash;
    cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  function setDebt(paid) {
    debtEl.textContent = `Debt to Sal Vane: $${Math.max(0, 50000 - paid).toLocaleString('en-US')}`;
  }

  function setHealth(h) {
    const v = Math.round(h);
    if (v === lastHealth) return;
    lastHealth = v;
    healthFill.style.width = `${Math.max(0, Math.min(100, v))}%`;
    healthFill.style.background = v > 50 ? '#4caf50' : v > 25 ? '#ff9800' : '#f44336';
    healthNum.textContent = v;
  }

  function setWanted(stars) {
    if (stars === lastStars) return;
    lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += `<span class="star${i < stars ? ' on' : ''}">★</span>`;
    }
    starsEl.innerHTML = html;
  }

  function setObjective(text) {
    objectiveEl.textContent = text;
  }

  function showMessage(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 4200);
  }

  function setSpeed(kmh, inCar) {
    speedEl.textContent = inCar ? `${Math.round(kmh)} km/h` : '';
  }

  /** Draw the minimap: roads, the river, the player, police, traffic and the waypoint. */
  function drawMinimap(g) {
    const W = minimap.width;
    const H = minimap.height;
    const half = g.city.bounds + 28;
    const toMap = (x, z) => [((x + half) / (half * 2)) * W, ((z + half) / (half * 2)) * H];
    mm.fillStyle = '#333947';
    mm.fillRect(0, 0, W, H);
    // River.
    const [rx] = toMap(268, 0);
    mm.fillStyle = '#3d7ea6';
    mm.fillRect(rx - 4, 0, 10, H);
    // Roads.
    mm.strokeStyle = '#8a8fa0';
    mm.lineWidth = 5;
    for (const x of g.city.streets.x) {
      const [px] = toMap(x, 0);
      mm.beginPath();
      mm.moveTo(px, 0);
      mm.lineTo(px, H);
      mm.stroke();
    }
    for (const z of g.city.streets.z) {
      const [, pz] = toMap(0, z);
      mm.beginPath();
      mm.moveTo(0, pz);
      mm.lineTo(W, pz);
      mm.stroke();
    }
    // Waypoint.
    if (g.waypoint) {
      const [wx, wz] = toMap(g.waypoint.x, g.waypoint.z);
      mm.fillStyle = '#ffeb3b';
      mm.beginPath();
      mm.moveTo(wx, wz - 8);
      mm.lineTo(wx + 7, wz);
      mm.lineTo(wx, wz + 8);
      mm.lineTo(wx - 7, wz);
      mm.closePath();
      mm.fill();
      mm.strokeStyle = '#111';
      mm.lineWidth = 1;
      mm.stroke();
    }
    // Traffic as pale dots.
    mm.fillStyle = 'rgba(230,230,230,0.8)';
    for (const c of g.traffic) {
      const [tx, tz] = toMap(c.x, c.z);
      mm.fillRect(tx - 1, tz - 1, 2, 2);
    }
    // Police as red dots.
    mm.fillStyle = '#ff3030';
    for (const p of g.police) {
      const [px, pz] = toMap(p.x, p.z);
      mm.beginPath();
      mm.arc(px, pz, 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    // The player as a white arrow, pointing along the heading.
    const [px, pz] = toMap(g.player.x, g.player.z);
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(Math.sin(g.player.heading), Math.cos(g.player.heading)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 6);
    mm.lineTo(-5, 6);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  function showTitle(best) {
    titleScreen.classList.remove('hidden');
    $('title-best').textContent = best > 0 ? `Best run: $${best.toLocaleString('en-US')} earned` : '';
  }
  function hideTitle() {
    titleScreen.classList.add('hidden');
  }
  function showPause(show) {
    pauseScreen.classList.toggle('hidden', !show);
  }
  function showEnd(title, sub) {
    endTitle.textContent = title;
    endSub.textContent = sub;
    endScreen.classList.remove('hidden');
  }
  function hideEnd() {
    endScreen.classList.add('hidden');
  }

  function showMenu(completed, onPick, onClose) {
    missionList.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const done = completed.has(m.id);
      const row = doc.createElement('button');
      row.className = `mission-row${done ? ' done' : ''}`;
      row.innerHTML = `<span class="m-name">${done ? '✓ ' : ''}${i + 1}. ${m.name}</span><span class="m-reward">$${m.reward}</span><span class="m-brief">${m.brief}</span>`;
      row.addEventListener('click', () => {
        if (!done) onPick(i);
      });
      missionList.appendChild(row);
    });
    menuScreen.classList.remove('hidden');
    menuScreen._onClose = onClose;
  }
  function hideMenu() {
    menuScreen.classList.add('hidden');
  }

  return {
    setCash, setDebt, setHealth, setWanted, setObjective, showMessage, setSpeed,
    drawMinimap, showTitle, hideTitle, showPause, showMenu, hideMenu, showEnd, hideEnd,
  };
}
