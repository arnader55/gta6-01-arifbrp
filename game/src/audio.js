// All sound is synthesised with WebAudio: no audio files, nothing fetched.
// Engine hum, sirens, gunshots, pickups and a slow synthwave bass loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 3000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  // A two-note police siren that wails while any wanted level is active.
  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();
      sirenGain.gain.linearRampToValueAtTime(muted ? 0 : 0.045, ctx.currentTime + 0.4);
    } else if (!on && sirenOsc) {
      const osc = sirenOsc;
      const lfo = sirenLfo;
      const gain = sirenGain;
      sirenOsc = null;
      sirenLfo = null;
      sirenGain = null;
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => {
        try { osc.stop(); lfo.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  }

  // The engine note follows the car's speed; call every frame while driving.
  function setEngine(speed01, on) {
    if (!ensure()) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 480;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
      engineOsc._filter = filter;
    }
    if (engineOsc) {
      const target = on && !muted ? 0.05 + speed01 * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.06);
    }
  }

  // A slow synthwave bass line: A minor, one note a beat, with a soft pad fifth.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const note = BASS[musicStep % BASS.length];
      musicStep += 1;
      tone(note, 0.42, 'triangle', 0.09);
      tone(note * 2, 0.42, 'sine', 0.04);
      if (musicStep % 4 === 1) tone(note * 1.5, 0.8, 'sine', 0.03);
    }, 430);
  }

  return {
    unlock,
    startMusic,
    setSiren,
    setEngine,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      noise(0.14, 0.5, 1800);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    enemyShoot() {
      noise(0.12, 0.25, 1200);
    },
    punch() {
      noise(0.09, 0.4, 900);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.18);
      setTimeout(() => tone(990, 0.14, 'sine', 0.18), 70);
    },
    crash() {
      noise(0.3, 0.5, 700);
      tone(90, 0.25, 'sine', 0.25, 40);
    },
    horn() {
      tone(370, 0.35, 'square', 0.1);
      tone(466, 0.35, 'square', 0.08);
    },
    missionStart() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 110));
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 130));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.1), i * 150));
    },
    wasted() {
      [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sawtooth', 0.12), i * 220));
    },
    click() {
      tone(880, 0.05, 'sine', 0.12);
    },
  };
}
