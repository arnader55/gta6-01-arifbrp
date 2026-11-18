// Every tuning number and colour for Vermilion City, in one place.
// The city is a 9 x 9 block grid on a 560 m square, streets on a 56 m pitch.
// All units are metres, seconds and degrees where a name says so.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 9, // blocks across, each 44 m of buildings + 12 m of road
  pitch: 56,
  roadWidth: 12,
  half: 252, // half the playable square
  seed: 20261118,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 8.0,
  jumpSpeed: 7.5,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 25,
  pistolDamage: 34,
};

export const CAR = {
  maxSpeed: 34, // m/s, about 122 km/h
  maxReverse: 10,
  accel: 16,
  brake: 30,
  drag: 0.6,
  steerMax: 0.62,
  steerSpeed: 2.4,
  grip: 6.5,
  radius: 2.1,
  maxHealth: 100,
};

export const TRAFFIC = { count: 16, speedMin: 7, speedMax: 12 };
export const PEDS = { count: 26, walkMin: 1.0, walkMax: 1.9 };

export const WANTED = {
  maxStars: 5,
  decayDelay: 8, // seconds unseen before stars start to fall
  decayStep: 4, // seconds per star once decaying
  bustSeconds: 2.0, // police touching the player on foot
};

export const START_CASH = 250;
export const DEBT_TOTAL = 50000;

export const PALETTE = {
  skyTop: '#2f5d8a',
  skyHorizon: '#ff9a52',
  fog: '#e88a4e',
  sun: '#ffd9a0',
  sand: '#d9a066',
  ground: '#c98f56',
  asphalt: '#3a3a40',
  asphaltLine: '#e8d44d',
  sidewalk: '#b98a5e',
  buildingA: '#e8c39a',
  buildingB: '#c96f4a',
  buildingC: '#7fa3a8',
  buildingD: '#a8584a',
  glass: '#3d6f8e',
  neonPink: '#ff4fd8',
  neonCyan: '#37e6ff',
  neonAmber: '#ffb347',
  palm: '#3f7a3a',
  trunk: '#8a6a4a',
  cactus: '#4d8a4d',
  playerJacket: '#d94f30',
  playerPants: '#2e3a4d',
  policeWhite: '#f2f2ee',
  policeBlack: '#1c1e24',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'vermilion-city.save.v1';

export const CONTROLS_TEXT =
  'WASD move / drive  ·  E enter car  ·  Space jump / handbrake  ·  Click shoot  ·  F punch  ·  Shift run  ·  M missions  ·  P pause  ·  H horn';
