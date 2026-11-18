// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, menu and end (wasted / busted).
//
// ?shot=1-cover|2-chase|3-mission|4-city stages that scene instead of running
// the loop, paints it twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createGame } from './world.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(canvas);
window.__game = game; // for headless playtesting and debugging

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  stageShot(name, game);
  game.render();
  game.render();
  window.__shotReady = true;
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function onKey(event) {
    if (event.code === 'Space' || event.code === 'Enter') {
      if (game.state === 'title') {
        game.startGame();
        announce('Playing. Press M for missions.');
      } else if (game.state === 'end') {
        game.respawn();
        announce('Playing.');
      }
    }
  }
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', () => {
    if (game.state === 'title') {
      game.startGame();
      announce('Playing. Press M for missions.');
    } else if (game.state === 'end') {
      game.respawn();
      announce('Playing.');
    }
  });
  document.getElementById('menu-close').addEventListener('click', () => game.toggleMenu());
  document.getElementById('end-respawn').addEventListener('click', () => {
    game.respawn();
    announce('Playing.');
  });
  document.getElementById('title-start').addEventListener('click', () => {
    game.startGame();
    announce('Playing. Press M for missions.');
  });
  // Clicking anywhere on the title screen starts, too — the overlay covers the canvas.
  document.getElementById('title-screen').addEventListener('click', () => {
    if (game.state === 'title') {
      game.startGame();
      announce('Playing. Press M for missions.');
    }
  });

  // Leaving the tab pauses a running game rather than letting the cops catch Jax unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') game.state = 'paused';
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP && game.state === 'play') {
      game.step(STEP);
      accumulator -= STEP;
    }
    if (game.state !== 'play') accumulator = 0;
    game.render();
  }

  announce('Vermilion City. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
