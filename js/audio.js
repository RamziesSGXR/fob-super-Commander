// Sound, synthesised in the browser: no audio files. Wind across the base, a bugle for reveille and lights out,
// pelicans coming in, building, and a ping for every message. Browsers only allow sound after a click or a key,
// so nothing plays until the player has touched the page.
const KEY = 'fob-super-commander.sound';
let ctx = null, master = null, wind = null, muted = false, lastPing = 0;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* no storage: sound stays on */ }

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}

// called on the first click or key press
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  // the wind: filtered noise, always on, quieter at night
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  wind = ctx.createGain(); wind.gain.value = 0.12; src.connect(f).connect(wind).connect(master); src.start();
}

function tone(freq, t0, dur, { type = 'sine', vol = 0.2, attack = 0.01, glide = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (glide) o.frequency.linearRampToValueAtTime(freq + glide, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0, dur, { vol = 0.2, freq = 800, q = 1, type = 'bandpass', sweep = 0 } = {}) {
  const n = ctx.sampleRate * dur, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; if (sweep) f.frequency.linearRampToValueAtTime(freq + sweep, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.3); g.gain.linearRampToValueAtTime(0, t0 + dur);
  s.connect(f).connect(g).connect(master); s.start(t0);
}
// a bugle: notes of the harmonic series on a brassy saw, played as a little call
function bugle(notes) {
  let t = ctx.currentTime + 0.05;
  for (const [n, len] of notes) { const f = 196 * n; tone(f, t, len * 0.95, { type: 'sawtooth', vol: 0.07, attack: 0.03 }); tone(f, t, len * 0.95, { type: 'triangle', vol: 0.09, attack: 0.02 }); t += len; }
}

export function play(what, arg) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  switch (what) {
    case 'click': tone(900, t, 0.05, { type: 'square', vol: 0.04 }); break;
    case 'place': tone(140, t, 0.18, { type: 'triangle', vol: 0.25, glide: -60 }); noise(t, 0.12, { vol: 0.15, freq: 300 }); break;
    case 'built': tone(660, t, 0.25, { vol: 0.12 }); tone(990, t + 0.12, 0.35, { vol: 0.1 }); break;
    case 'demolish': noise(t, 0.6, { vol: 0.25, freq: 200, type: 'lowpass', sweep: -150 }); break;
    case 'deny': tone(180, t, 0.14, { type: 'square', vol: 0.06 }); tone(150, t + 0.12, 0.16, { type: 'square', vol: 0.06 }); break;
    case 'ping': {   // one ping per message, pitched by who sent it, never more than one a second
      if (t - lastPing < 1) return; lastPing = t;
      const f = { def: 520, pro: 660, tru: 780, bur: 440, riv: 390, base: 600 }[arg] || 600;
      tone(f, t, 0.18, { vol: 0.06 }); tone(f * 1.5, t + 0.08, 0.2, { vol: 0.045 }); break;
    }
    case 'pelican': noise(t, 4.5, { vol: 0.22, freq: 180, q: 0.7, sweep: 260 }); tone(70, t, 4.5, { type: 'sawtooth', vol: 0.03, attack: 1.5 }); break;
    case 'reveille': bugle([[3, 0.18], [4, 0.18], [5, 0.36], [3, 0.18], [4, 0.18], [5, 0.36], [3, 0.18], [5, 0.18], [6, 0.6]]); break;
    case 'taps': bugle([[3, 0.5], [3, 0.25], [4, 1.1], [3, 0.5], [4, 0.25], [5, 1.1], [3, 0.4], [4, 0.4], [5, 1.4]]); break;
    case 'medal': bugle([[4, 0.16], [5, 0.16], [6, 0.32], [8, 0.8]]); break;
  }
}
// wind is softer at night
export function setNight(n) { if (wind && ctx) wind.gain.setTargetAtTime(0.12 - 0.06 * n, ctx.currentTime, 1); }
