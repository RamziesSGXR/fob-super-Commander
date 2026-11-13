// Sound, synthesised in the browser: no sound files except the music you add yourself.
// Everything on the base makes its sound from where it is. The listener sits at the camera: zoom in and the base gets
// louder and closer, turn the view and the sounds turn with it. Each building type and each vehicle has its own voice;
// only the nearest few play at once. Bugle calls come from the loudspeakers and the flag, the loudspeakers read out
// announcements, and citizens chatter in passing. Browsers only allow sound after a click or a key, so nothing plays
// until the player has touched the page.
//
// Mixer: master → effects (one-shots), ambience (buildings and vehicles), voices (loudspeakers and chatter), music.
const KEY = 'fob-super-commander.sound', MIX = 'fob-super-commander.mix';
let ctx = null, master = null, wind = null, muted = false, lastPing = 0, noiseBuf = null;
const bus = {};
export const mix = { master: 0.8, fx: 0.8, amb: 0.7, voice: 0.8, music: 0.5, pa: true };
try { muted = localStorage.getItem(KEY) === 'off'; Object.assign(mix, JSON.parse(localStorage.getItem(MIX) || '{}')); } catch { /* defaults */ }

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : mix.master * 0.6, ctx.currentTime, 0.05);
  if (m) try { speechSynthesis.cancel(); } catch { /* no speech */ }
}
export function setMix(k, v) {
  mix[k] = v; try { localStorage.setItem(MIX, JSON.stringify(mix)); } catch { /* not remembered */ }
  if (!ctx) return;
  if (k === 'master') master.gain.setTargetAtTime(muted ? 0 : v * 0.6, ctx.currentTime, 0.05);
  else if (bus[k]) bus[k].gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  if (k === 'pa' && !v) try { speechSynthesis.cancel(); } catch { /* no speech */ }
}

// called on the first click or key press
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : mix.master * 0.6;
  // a gentle limiter so a busy moment never clips
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; master.connect(comp).connect(ctx.destination);
  for (const k of ['fx', 'amb', 'voice', 'music']) { bus[k] = ctx.createGain(); bus[k].gain.value = mix[k]; bus[k].connect(master); }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // the wind: brown noise, always on, quieter at night and when you're zoomed in among the buildings
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  wind = ctx.createGain(); wind.gain.value = 0.1; src.connect(f).connect(wind).connect(bus.amb); src.start();
  music.start();
}

// ---------------------------------------------------------------- building blocks: every sound can go to any output
function tone(freq, t0, dur, { type = 'sine', vol = 0.2, attack = 0.01, glide = 0, dest = bus.fx } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (glide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + glide), t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0, dur, { vol = 0.2, freq = 800, q = 1, type = 'bandpass', sweep = 0, dest = bus.fx, attack = 0.3 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; if (sweep) f.frequency.linearRampToValueAtTime(Math.max(30, freq + sweep), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.max(0.003, dur * attack)); g.gain.linearRampToValueAtTime(0, t0 + dur);
  s.connect(f).connect(g).connect(dest); s.start(t0, Math.random() * 1.5, dur + 0.05);
}
// a bugle: notes of the harmonic series on a brassy saw, played as a little call
function bugle(notes, dest, t = ctx.currentTime + 0.05) {
  for (const [n, len] of notes) { const f = 196 * n; tone(f, t, len * 0.95, { type: 'sawtooth', vol: 0.07, attack: 0.03, dest }); tone(f, t, len * 0.95, { type: 'triangle', vol: 0.09, attack: 0.02, dest }); t += len; }
}
const CALLS = {
  reveille: [[3, 0.18], [4, 0.18], [5, 0.36], [3, 0.18], [4, 0.18], [5, 0.36], [3, 0.18], [5, 0.18], [6, 0.6]],
  taps: [[3, 0.5], [3, 0.25], [4, 1.1], [3, 0.5], [4, 0.25], [5, 1.1], [3, 0.4], [4, 0.4], [5, 1.4]],
  retreat: [[4, 0.3], [4, 0.15], [5, 0.3], [6, 0.6], [5, 0.3], [4, 0.3], [3, 0.6], [4, 0.3], [5, 0.9]],
  medal: [[4, 0.16], [5, 0.16], [6, 0.32], [8, 0.8]],
};
// Simlish: a voice made of syllables, two formant filters on a buzzing source. pitch: the speaker's voice
const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [440, 1020], [300, 870]];
function babble(dest, t, syll = 8, pitch = 150, vol = 0.18) {
  for (let i = 0; i < syll; i++) {
    const [f1, f2] = VOWELS[(Math.random() * VOWELS.length) | 0], len = 0.09 + Math.random() * 0.1, p = pitch * (0.9 + Math.random() * 0.25);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * (Math.random() < 0.3 ? 1.15 : 0.95), t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.linearRampToValueAtTime(0, t + len);
    for (const [ff, q] of [[f1, 6], [f2, 8]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; o.connect(bp).connect(g); }
    g.connect(dest); o.start(t); o.stop(t + len + 0.02);
    t += len + (Math.random() < 0.18 ? 0.12 : 0.02);
  }
  return t;
}

// ---------------------------------------------------------------- where you are listening from
// x, z: the tile the camera looks at. h: how high the camera is. rx, rz: the screen's right-hand direction on the ground
const ear = { x: 32, z: 32, h: 8, rx: 1, rz: 0 };
export function listen(x, z, h, rx, rz) { ear.x = x; ear.z = z; ear.h = h; ear.rx = rx; ear.rz = rz; }
const REF = 5;
function heard(x, z) {
  const dx = x - ear.x, dz = z - ear.z, d2 = dx * dx + dz * dz + ear.h * ear.h, d = Math.sqrt(d2);
  return { g: REF * REF / (REF * REF + d2), pan: Math.max(-1, Math.min(1, (dx * ear.rx + dz * ear.rz) / (d + 1))) * 0.85 };
}
// a short-lived output at a place: gain and pan fixed for the length of the sound
function spot(x, z, busK = 'fx', floor = 0, boost = 1) {
  const h = heard(x, z), g = ctx.createGain(); g.gain.value = Math.max(floor, Math.min(1, h.g * boost));
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = h.pan; g.connect(p).connect(bus[busK]); } else g.connect(bus[busK]);
  return { out: g, g: g.gain.value };
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
    default: if (CALLS[what]) bugle(CALLS[what], bus.fx);
  }
}

// the same sounds, made somewhere on the base
export function playAt(what, x, z) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  if (what === 'pelican') {   // engines from the pad: heard across the base, loud close up
    const { out } = spot(x, z, 'fx', 0.12, 2.2);
    noise(t, 5, { vol: 0.35, freq: 160, q: 0.7, sweep: 300, dest: out }); tone(68, t, 5, { type: 'sawtooth', vol: 0.06, attack: 1.5, dest: out }); return;
  }
  const { out } = spot(x, z, 'fx', 0.25, 2);
  if (what === 'place') { tone(140, t, 0.18, { type: 'triangle', vol: 0.3, glide: -60, dest: out }); noise(t, 0.12, { vol: 0.2, freq: 300, dest: out }); }
  else if (what === 'gate') { tone(180, t, 0.9, { type: 'sawtooth', vol: 0.03, glide: 60, attack: 0.1, dest: out }); noise(t + 0.85, 0.06, { vol: 0.2, freq: 700, q: 2, attack: 0.01, dest: out }); }
  else if (what === 'gatedown') { tone(220, t, 0.8, { type: 'sawtooth', vol: 0.025, glide: -60, attack: 0.1, dest: out }); noise(t + 0.8, 0.08, { vol: 0.25, freq: 400, q: 2, attack: 0.01, dest: out }); }
  else if (what === 'built') { for (let i = 0; i < 3; i++) noise(t + i * 0.16, 0.06, { vol: 0.3, freq: 2400, q: 3, attack: 0.05, dest: out }); tone(660, t + 0.5, 0.25, { vol: 0.08, dest: out }); }
  else if (what === 'demolish') { noise(t, 0.9, { vol: 0.4, freq: 220, type: 'lowpass', sweep: -160, dest: out }); for (let i = 0; i < 4; i++) noise(t + 0.1 + Math.random() * 0.6, 0.08, { vol: 0.25, freq: 1500, q: 2, attack: 0.05, dest: out }); }
}

// Bugle calls come from the loudspeakers and the flag. sources: [[x, z], ...]. The nearest sets the direction; each
// farther one is a little later and quieter, so a big base echoes. Always audible: the whole base is meant to hear it.
export function callAt(name, sources) {
  if (!ctx || muted || !CALLS[name]) return;
  const near = sources.map(([x, z]) => [x, z, heard(x, z).g]).sort((a, b) => b[2] - a[2]).slice(0, 3);
  if (!near.length) { bugle(CALLS[name], bus.fx); return; }
  near.forEach(([x, z], i) => { const { out } = spot(x, z, 'fx', i ? 0.06 : 0.3, 2.5); bugle(CALLS[name], out, ctx.currentTime + 0.05 + i * 0.09); });
}

// ---------------------------------------------------------------- the base's own sounds: buildings and vehicles
// Each kind is a loop (built once per voice) and, for some, things that happen now and then (tick).
const KINDS = {
  hum:    { loop: o => { osc(o, 'sawtooth', 50, 0.05, 140); osc(o, 'sine', 100, 0.04); } },                                           // generator
  hvac:   { loop: o => { hiss(o, 380, 0.035, 0.6, 'lowpass'); } },                                                                     // air handling, the default
  rumble: { loop: o => { hiss(o, 110, 0.12, 0.7, 'lowpass'); osc(o, 'sawtooth', 38, 0.03, 90); } },
  radio:  { loop: o => { hiss(o, 2400, 0.012, 1.4); }, tick: (o, t) => { if (Math.random() < 0.25) babble(o, t, 4 + (Math.random() * 6 | 0), 160, 0.06); else if (Math.random() < 0.3) for (let i = 0; i < 5; i++) tone(820, t + i * 0.12, Math.random() < 0.5 ? 0.05 : 0.11, { vol: 0.04, dest: o }); } },
  static: { loop: o => { hiss(o, 3000, 0.02, 0.8); }, tick: (o, t) => { if (Math.random() < 0.4) for (let i = 0; i < 7; i++) tone(700, t + i * 0.1, Math.random() < 0.5 ? 0.04 : 0.09, { vol: 0.05, dest: o }); } },
  beeps:  { loop: o => { hiss(o, 380, 0.02, 0.6, 'lowpass'); }, tick: (o, t) => { for (let i = 0; i < 3; i++) if (Math.random() < 0.6) tone(900 + Math.random() * 1200, t + i * 0.18, 0.06, { vol: 0.04, dest: o }); } },
  heart:  { loop: o => { hiss(o, 380, 0.02, 0.6, 'lowpass'); }, every: 1.1, tick: (o, t) => tone(1000, t, 0.09, { vol: 0.05, dest: o }) },
  shots:  { loop: () => {}, every: 0.5, tick: (o, t) => { if (Math.random() < 0.55) { noise(t, 0.12, { vol: 0.5, freq: 900, q: 0.6, attack: 0.02, dest: o }); tone(90, t, 0.15, { type: 'square', vol: 0.12, glide: -40, dest: o }); } } },
  fry:    { loop: o => { hiss(o, 5000, 0.03, 0.5, 'highpass'); }, tick: (o, t) => { if (Math.random() < 0.4) noise(t, 0.05, { vol: 0.12, freq: 3000, q: 4, attack: 0.05, dest: o }); if (Math.random() < 0.3) babble(o, t + 0.2, 5, 190, 0.05); } },
  clatter:{ loop: o => { hiss(o, 600, 0.02, 0.5); }, tick: (o, t) => { for (let i = 0; i < 4; i++) if (Math.random() < 0.5) noise(t + Math.random() * 0.8, 0.04, { vol: 0.12, freq: 2500 + Math.random() * 2000, q: 6, attack: 0.05, dest: o }); if (Math.random() < 0.5) babble(o, t, 6, 120 + Math.random() * 90, 0.06); } },
  clank:  { loop: o => { hiss(o, 140, 0.05, 0.7, 'lowpass'); }, tick: (o, t) => { if (Math.random() < 0.5) { tone(220 + Math.random() * 300, t, 0.3, { type: 'square', vol: 0.04, dest: o }); noise(t, 0.05, { vol: 0.2, freq: 1800, q: 3, attack: 0.05, dest: o }); } if (Math.random() < 0.2) noise(t + 0.3, 0.5, { vol: 0.1, freq: 2600, q: 8, dest: o }); } },
  fridge: { loop: o => { osc(o, 'sine', 120, 0.02); hiss(o, 500, 0.015, 0.5, 'lowpass'); }, tick: (o, t) => { if (Math.random() < 0.15) { tone(500, t, 0.08, { type: 'square', vol: 0.05, glide: -200, dest: o }); noise(t + 0.08, 0.1, { vol: 0.1, freq: 900, dest: o }); } } },
  flag:   { loop: o => { const g = hiss(o, 900, 0.04, 0.6); lfo(g.gain, 2.6, 0.03); } },                                             // cloth in the wind
  water:  { loop: o => { const g = hiss(o, 1600, 0.05, 0.4); lfo(g.gain, 5.3, 0.03); } },
  flame:  { loop: o => { hiss(o, 300, 0.03, 0.6, 'lowpass'); }, tick: (o, t) => { if (Math.random() < 0.6) noise(t + Math.random() * 0.4, 0.02, { vol: 0.1, freq: 2600, q: 2, attack: 0.05, dest: o }); } },
  cryo:   { loop: o => { hiss(o, 4200, 0.02, 0.5, 'highpass'); osc(o, 'sine', 60, 0.03); }, tick: (o, t) => { if (Math.random() < 0.12) noise(t, 1.4, { vol: 0.12, freq: 5000, type: 'highpass', dest: o }); } },
  murmur: { loop: o => { hiss(o, 380, 0.02, 0.6, 'lowpass'); }, tick: (o, t) => { if (Math.random() < 0.55) babble(o, t, 6 + (Math.random() * 6 | 0), 100 + Math.random() * 120, 0.05); } },
  lecture:{ loop: o => { hiss(o, 380, 0.02, 0.6, 'lowpass'); }, every: 2.4, tick: (o, t) => babble(o, t, 12, 120, 0.06) },
  drum:   { loop: () => {}, every: 0.55, tick: (o, t) => { tone(90, t, 0.12, { vol: 0.25, glide: -30, dest: o }); noise(t, 0.05, { vol: 0.08, freq: 400, attack: 0.05, dest: o }); } },
  whistle:{ loop: o => { hiss(o, 380, 0.015, 0.6, 'lowpass'); }, tick: (o, t) => { if (Math.random() < 0.12) tone(2600, t, 0.4, { vol: 0.05, glide: 120, dest: o }); } },
  build:  { loop: o => { hiss(o, 200, 0.03, 0.6, 'lowpass'); }, every: 0.45, tick: (o, t) => { if (Math.random() < 0.7) { noise(t, 0.04, { vol: 0.35, freq: 1600 + Math.random() * 800, q: 4, attack: 0.05, dest: o }); tone(180, t, 0.08, { type: 'square', vol: 0.05, dest: o }); } } },
  // vehicles: engines whose note rises when they move
  truck:  { loop: o => { o.eng = osc(o, 'sawtooth', 42, 0.06, 260); hiss(o, 140, 0.06, 0.7, 'lowpass'); }, every: 0.3, tick: (o, t, s) => { brakes(o, t, s, 0.18); } },
  lift:   { loop: o => { o.eng = osc(o, 'triangle', 300, 0.012); }, tick: (o, t, s) => { if (s.moving) tone(1250, t, 0.25, { type: 'square', vol: 0.025, dest: o }); }, every: 0.6 },
  frv:    { loop: o => { o.eng = osc(o, 'sawtooth', 60, 0.05, 420); hiss(o, 200, 0.04, 0.7, 'lowpass'); }, every: 0.3, tick: (o, t, s) => { if (s.moving && !o.was) tone(110, t, 0.5, { type: 'sawtooth', vol: 0.06, glide: 90, dest: o }); o.was = s.moving; } },
  // a squad in step: left, right, on gravel
  march:  { loop: () => {}, every: 0.52, tick: (o, t) => { for (let i = 0; i < 2; i++) noise(t + i * 0.26, 0.07, { vol: 0.16, freq: 900 + i * 150, q: 1.2, attack: 0.008, dest: o }); } },
  // the pelican as it flies: a turbine whine over a heavy thrum, loudest low over the pad
  pelican:{ loop: o => { o.eng = osc(o, 'sawtooth', 55, 0.07, 300); osc(o, 'triangle', 1900, 0.006); hiss(o, 420, 0.09, 0.5, 'lowpass'); }, every: 0.12, tick: (o, t) => { noise(t, 0.08, { vol: 0.05, freq: 160, q: 1, attack: 0.03, dest: o }); } },
  tank:   { loop: o => { o.eng = osc(o, 'sawtooth', 30, 0.09, 160); hiss(o, 90, 0.12, 0.7, 'lowpass'); }, tick: (o, t, s) => { if (s.moving) for (let i = 0; i < 4; i++) noise(t + i * 0.1, 0.03, { vol: 0.12, freq: 1300, q: 3, attack: 0.05, dest: o }); }, every: 0.4 },
};
function osc(o, type, f, vol, lp) {
  const n = ctx.createOscillator(); n.type = type; n.frequency.value = f; const g = ctx.createGain(); g.gain.value = vol;
  if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; n.connect(fl).connect(g); } else n.connect(g);
  g.connect(o.out); n.start(); o.stop.push(n); return n;
}
function hiss(o, f, vol, q = 1, type = 'bandpass') {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol; s.connect(fl).connect(g).connect(o.out); s.start(0, Math.random() * 1.9); o.stop.push(s); return g;
}
function lfo(param, rate, depth) { const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = rate; g.gain.value = depth; l.connect(g).connect(param); l.start(); return l; }

const MAXV = 9, voices = new Map(), ENGINE = { truck: 42, lift: 300, frv: 60, tank: 30, pelican: 55 };
// a lorry pulling up: the air brakes sigh as it stops, and a door shuts a moment later
function brakes(o, t, s, vol) { if (o.was && !s.moving) { noise(t, 0.7, { vol, freq: 3800, q: 0.8, type: 'highpass', attack: 0.02, dest: o }); if (Math.random() < 0.5) noise(t + 1.1, 0.08, { vol: vol * 1.4, freq: 300, q: 2, attack: 0.01, dest: o }); } o.was = s.moving; }
// list: [{ key, kind, x, z, on, moving, vol }]. Called a few times a second; keeps the nearest few playing
export function emitters(list) {
  if (!ctx || muted || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const scored = list.filter(e => KINDS[e.kind] && e.on !== false).map(e => ({ e, h: heard(e.x, e.z) })).filter(s => s.h.g > 0.035).sort((a, b) => b.h.g - a.h.g).slice(0, MAXV);
  const keep = new Set(scored.map(s => s.e.key));
  for (const [k, v] of voices) if (!keep.has(k)) { v.g.gain.setTargetAtTime(0, t, 0.25); setTimeout(() => { for (const n of v.stop) try { n.stop(); } catch { /* stopped */ } v.g.disconnect(); }, 1200); voices.delete(k); }
  for (const { e, h } of scored) {
    let v = voices.get(e.key);
    if (!v) {
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) g.connect(p).connect(bus.amb); else g.connect(bus.amb);
      v = { g, p, out: ctx.createGain(), stop: [], next: t + Math.random() }; v.out.connect(g);
      KINDS[e.kind].loop(v); voices.set(e.key, v);
    }
    v.g.gain.setTargetAtTime(Math.min(1, h.g * 2.2 * (e.vol ?? 1)), t, 0.2); if (v.p) v.p.pan.setTargetAtTime(h.pan, t, 0.2);
    if (v.eng) v.eng.frequency.setTargetAtTime((e.moving ? 1.6 : 1) * ENGINE[e.kind], t, 0.4);
    const K = KINDS[e.kind];
    if (K.tick && t >= v.next) { K.tick(v.out, t + 0.02, e); v.next = t + (K.every ? K.every * (0.9 + Math.random() * 0.2) : 1.2 + Math.random() * 2.5); }
  }
}

// ---------------------------------------------------------------- voices: chatter and the loudspeakers
export function chatter(x, z, pitch) {
  if (!ctx || muted) return;
  const { out } = spot(x, z, 'voice', 0, 2.4); babble(out, ctx.currentTime + 0.02, 6 + (Math.random() * 8 | 0), pitch);
}
// Announcements are read out by the browser's own voice, as loud as the nearest loudspeaker is to you. It returns how
// loud that was (0 to 1), so the screen can caption what was said.
let paVoice = null;
export function announce(text, x, z) {
  if (!ctx || muted || !mix.pa) return 0;
  const h = heard(x, z), vol = Math.min(1, Math.max(0.08, h.g * 2.5)) * mix.voice * mix.master;
  const { out } = spot(x, z, 'voice', 0.08, 2.5), t = ctx.currentTime;   // the chime before every announcement
  tone(660, t, 0.4, { vol: 0.12, dest: out }); tone(880, t + 0.22, 0.4, { vol: 0.1, dest: out }); tone(550, t + 0.44, 0.6, { vol: 0.1, dest: out });
  try {
    const S = window.speechSynthesis; if (!S) return vol;
    if (!paVoice) { const vs = S.getVoices(); paVoice = vs.find(v => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null; }
    const u = new SpeechSynthesisUtterance(text); if (paVoice) u.voice = paVoice;
    u.rate = 0.92; u.pitch = 0.75; u.volume = vol;
    setTimeout(() => { S.cancel(); S.speak(u); }, 1100);
  } catch { /* no speech on this browser */ }
  return vol;
}

// ---------------------------------------------------------------- music: your own tracks, listed in music/tracks.json
// The file is a list of file names (or { file, title }) in the music folder. Tracks play shuffled with a pause between.
const music = {
  list: [], el: null, src: null, i: 0, title: '', loaded: false,
  async start() {
    try { const r = await fetch('music/tracks.json', { cache: 'no-cache' }); if (r.ok) this.list = (await r.json()).map(x => typeof x === 'string' ? { file: x, title: x.replace(/\.[a-z0-9]+$/i, '') } : x); } catch { /* no music */ }
    this.loaded = true;
    if (!this.list.length) return;
    for (let i = this.list.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.list[i], this.list[j]] = [this.list[j], this.list[i]]; }
    this.el = new Audio(); this.el.crossOrigin = 'anonymous'; this.src = ctx.createMediaElementSource(this.el); this.src.connect(bus.music);
    this.el.onended = () => setTimeout(() => this.next(), 20000 + Math.random() * 40000);
    setTimeout(() => this.next(), 8000);
  },
  next() { if (!this.list.length) return; const tr = this.list[this.i++ % this.list.length]; this.title = tr.title || tr.file; this.el.src = 'music/' + tr.file; this.el.play().catch(() => { /* blocked until a click */ }); },
};
export function musicInfo() { return { loaded: music.loaded, n: music.list.length, title: music.el && !music.el.paused ? music.title : '' }; }
export function skipTrack() { if (music.el) { music.el.pause(); music.next(); } }

// wind is softer at night
export function setNight(n) { if (wind && ctx) wind.gain.setTargetAtTime(0.1 - 0.05 * n, ctx.currentTime, 1); }
export function debug() { return { voices: [...voices.keys()], state: ctx && ctx.state }; }
