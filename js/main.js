// The loop, the input, the HUD and the screens. The simulation is in sim.js, the people in life.js, the picture in view.js.
import { C, B, MIN, GROUPS, FACTION_DEFAULT, PLANETS, VERSION, GOODS, GKEYS, ROADS, TRAIN, TECH, VEHICLES, DESIGNS, PARTS, PARTS_FOR, LOANS, DIFF, FOUNDATION, MARKET, COMMIT, STD, SCRUB, ZONES, ZKEYS, GROWS, CHAINS, GROW, UTIL, LAND } from './config.js';
import { Sim, MKEYS, rankOf, dims, LOOSE } from './sim.js';
import { REQUESTS, GRADES, fileOf, CALLS } from './desk.js';
import { Life } from './life.js';
import { View } from './view.js';
import { drawLogo, drawTrooper, lookOf, ensureLogo, readUpload, SHAPES, SYMBOLS, PATTERNS, UNIFORMS, PALETTE } from './logo.js';
import { demoSim } from './demo.js';
import { regionImage, survey, biomeOf, BIOMES, RW, RH, TPP } from './site.js';
import { bestSite } from './sim.js';
import * as audio from './audio.js';
import { PA, SAY } from './voices.js';

// The sci-fi interface (matched to Orbital Fury's) is the default; ?ui=classic goes back to phosphor green, and is remembered
try {
  const q = new URLSearchParams(location.search).get('ui');
  if (q === 'scifi' || q === 'classic') localStorage.setItem('fob.ui', q);
  if (localStorage.getItem('fob.ui') !== 'classic') {
    document.body.classList.add('ui-scifi');
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(l);
  }
} catch (e) { /* no storage: the sci-fi look without remembering */ document.body.classList.add('ui-scifi'); }
const $ = id => document.getElementById(id);
const SAVE = 'fob-super-commander.save.v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const CH = { def: ['DEFENCE', 'var(--def)'], pro: ['EXPANSION', 'var(--pro)'], tru: ['TRUTH', 'var(--tru)'], base: ['BASE', '#ffffff'], bur: ['BUREAU', '#d8a6ff'], riv: ['BULLETIN', 'var(--amber)'], log: ['LOGISTICS', 'var(--g)'] };

const view = new View($('view'));
view.onBoom = (x, z, up) => { if (playing) audio.playAt(up ? 'gate' : 'gatedown', x, z); };
let sim = null, life = null, playing = false, paused = false, speed = 1, tool = null, rot = 0, hover = null, group = 'roads', minTab = 'def', speedI = 1;
const gameSpeed = () => C.SPEEDS[speedI];
const days = s => { const d = s / C.DAY; return d >= 1.5 ? `${Math.round(d)} days` : d >= 0.9 ? '1 day' : `${Math.max(1, Math.round(d * 24))} hours`; };
let acc = 0, hudT = 0, mmT = 0, saveT = 0, last = performance.now();
for (const el of document.querySelectorAll('[data-version]')) el.textContent = 'v' + VERSION;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- saving
function store() { if (sim && playing && !sim.callIn) try { localStorage.setItem(SAVE, JSON.stringify(sim.save())); } catch { /* storage blocked: the game still works */ } }
function stored() { try { const s = localStorage.getItem(SAVE), o = s ? JSON.parse(s) : null; return o && o.v >= SAVE_MIN ? o : null; } catch { return null; } }   // bases from before the big map (0.16) are not carried over
const SAVE_MIN = 11;
async function exportCode() {
  const json = JSON.stringify(sim.save());
  if ('CompressionStream' in window) {
    const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    let bin = ''; new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b)); return 'FOB1:' + btoa(bin);
  }
  return 'FOB0:' + btoa(unescape(encodeURIComponent(json)));
}
async function importCode(code) {
  code = code.trim();
  if (code.startsWith('FOB1:')) {
    const bin = atob(code.slice(5)), u = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  if (code.startsWith('FOB0:')) return JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
  throw new Error('not a save code');
}
addEventListener('pagehide', store);
document.addEventListener('visibilitychange', () => { if (document.hidden) store(); });

// ---------------------------------------------------------------- starting
async function start(s, play = true) {
  await ensureLogo(s.faction.logo);
  sim = s; life = new Life(sim); view.attach(sim, life); $('hud').classList.remove('calling'); $('callin').classList.add('hidden'); if (tool === 'callin') tool = null;
  view.lookAt(sim.N / 2, sim.N / 2 + 2);
  playing = play; view.shift = play ? 0 : (innerWidth > 900 ? -0.38 : 0);
  mmStatic = null; commsN = 0; unread = 0;
  if (play) { show(null); $('hud').classList.remove('hidden'); setIview('none'); buildBar(); drawWho(); hud(); renderComms(true); drawMinimap(); }
}
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); }

function title() {
  const s = stored();
  $('b-continue').classList.toggle('hidden', !s);
  start(s ? new Sim({ state: s }) : demoSim(), false);
  view.zoomT = view.zoom = 11;
  show('s-title'); $('hud').classList.add('hidden');
}

// ---------------------------------------------------------------- the faction editor
let draft = null, editing = false;
function openFaction(edit) {
  editing = edit; draft = structuredClone(edit ? sim.faction : FACTION_DEFAULT);
  draft.look = lookOf(draft); draft.logo.pattern ||= 'none'; draft.logo.pc ||= draft.logo.rim;
  $('fx-crest').checked = !!draft.look.crest;
  $('fx-title').textContent = edit ? 'EDIT YOUR FACTION' : 'FOUND YOUR FACTION';
  $('fx-go').textContent = edit ? 'SAVE CHANGES' : 'FOUND THE FACTION';
  $('fx-name').value = draft.name; $('fx-base').value = draft.base; $('fx-motto').value = draft.motto; $('fx-text').value = draft.logo.text;
  for (const sw of document.querySelectorAll('.sw')) {
    sw.innerHTML = (sw.dataset.p === 'u' ? UNIFORMS : PALETTE).map(c => `<button type="button" style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
  }
  draft.diff = edit ? sim.diff : draft.diff || 'veteran';
  $('fx-diff').closest('.fx-sw').classList.toggle('hidden', edit); $('fx-diff-d').classList.toggle('hidden', edit);
  fxDraw(); show('s-faction');
}
function diffDraw() {
  $('fx-diff').innerHTML = Object.entries(DIFF).map(([k, d]) => `<button class="btn ${draft.diff === k ? 'on' : ''}" data-diff="${k}" type="button">${d.name.toUpperCase()}</button>`).join('');
  const d = DIFF[draft.diff]; $('fx-diff-d').textContent = `${d.desc} Founding Charter ${d.charter.toLocaleString()} CR at ${Math.round(d.rate * 1000) / 10}% a week; you land with ${d.sup.toLocaleString()} supplies.`;
}
$('fx-diff').onclick = e => { const b = e.target.closest('[data-diff]'); if (b) { draft.diff = b.dataset.diff; diffDraw(); } };
function fxUpState() { $('fx-unup').classList.toggle('hidden', !draft.logo.img); for (const id of ['fx-shape', 'fx-symbol']) $(id).closest('.fx-row').style.opacity = draft.logo.img ? 0.4 : 1; }
$('fx-up').onclick = () => $('fx-file').click();
$('fx-unup').onclick = () => { delete draft.logo.img; fxDraw(); };
$('fx-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  try { draft.logo.img = await readUpload(f); $('fx-upmsg').textContent = 'Logo uploaded. It replaces the crest everywhere in your base.'; fxDraw(); }
  catch (err) { $('fx-upmsg').textContent = err.message || 'That picture could not be read.'; }
};
function getK(k) { return k.split('.').reduce((o, p) => o[p], draft); }
function setK(k, v) { const p = k.split('.'); const o = p.slice(0, -1).reduce((o, q) => o[q], draft); o[p.at(-1)] = v; }
function fxDraw() {
  const g = $('fx-prev').getContext('2d'); g.clearRect(0, 0, 200, 200); drawLogo(g, draft.logo, 6, 6, 188);
  $('fx-shape').textContent = draft.logo.shape; $('fx-symbol').textContent = draft.logo.symbol; fxUpState(); $('fx-pattern').textContent = draft.logo.pattern;
  const tg = $('fx-trooper').getContext('2d'); tg.clearRect(0, 0, 120, 120); drawTrooper(tg, draft, 10, 10, 100);
  for (const sw of document.querySelectorAll('.sw')) { const v = getK(sw.dataset.k); for (const b of sw.children) b.classList.toggle('on', b.dataset.c === v); }
  diffDraw();
}
document.querySelector('.fx').addEventListener('click', e => {
  const cy = e.target.closest('[data-cy]'), c = e.target.closest('[data-c]');
  if (cy) { const [k, d] = cy.dataset.cy.split(':'), list = k === 'shape' ? SHAPES : k === 'pattern' ? PATTERNS : SYMBOLS; draft.logo[k] = list[(list.indexOf(draft.logo[k]) + +d + list.length) % list.length]; fxDraw(); }
  if (c) { setK(c.closest('.sw').dataset.k, c.dataset.c); fxDraw(); }
});
$('fx-crest').onchange = e => { draft.look.crest = e.target.checked; fxDraw(); };
$('fx-text').addEventListener('input', e => { draft.logo.text = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); fxDraw(); });
$('fx-rand').onclick = () => {
  const p = a => a[Math.floor(Math.random() * a.length)];
  const A = ['Iron', 'Liberty', 'Crimson', 'Steadfast', 'Golden', 'Righteous', 'Ashen', 'Vigilant', 'Free', 'Thunder'], Bn = ['Lancers', 'Guard', 'Brigade', 'Legion', 'Wardens', 'Battalion', 'Rangers', 'Sentinels', 'Corps', 'Hammers'];
  draft.name = `${p(['1st', '3rd', '9th', '12th', '27th', '101st', '404th'])} ${p(A)} ${p(Bn)}`; draft.base = `${p(['Fort', 'Camp', 'FOB', 'Outpost', 'Firebase'])} ${p(['Resolve', 'Liberty', 'Vigil', 'Anvil', 'Dawn', 'Mercy', 'Ballot', 'Granite'])}`;
  draft.motto = p(['Freedom never sleeps.', 'Democracy, delivered hot.', 'We hold the line.', 'Paperwork and gunfire.', 'Always forward, never late.']);
  draft.primary = p(PALETTE); draft.secondary = p(PALETTE.filter(c => c !== draft.primary));
  draft.logo = { shape: p(SHAPES), symbol: p(SYMBOLS.filter(s => s !== 'none')), bg: draft.primary, fg: draft.secondary, rim: draft.secondary, text: '', pattern: p(PATTERNS), pc: p(PALETTE) };
  draft.look = { uniform: p(UNIFORMS), helmet: p(UNIFORMS), armband: draft.secondary, crest: Math.random() < 0.5 }; $('fx-crest').checked = draft.look.crest;
  $('fx-name').value = draft.name; $('fx-base').value = draft.base; $('fx-motto').value = draft.motto; $('fx-text').value = ''; fxDraw();
};
$('fx-back').onclick = () => editing ? (show(null), (paused = wasPaused)) : show('s-title');
let wasPaused = false;
$('fx-go').onclick = () => {
  draft.name = $('fx-name').value.trim() || 'Unnamed Loyal Faction'; draft.base = $('fx-base').value.trim() || 'FOB Nameless'; draft.motto = $('fx-motto').value.trim() || 'For Super Earth.';
  if (editing) { sim.faction = draft; view.setFaction(draft); drawWho(); show(null); paused = wasPaused; store(); return; }
  draft.planet = PLANETS[Math.floor(Math.random() * PLANETS.length)];
  openLanding();
};

// ---------------------------------------------------------------- the landing site: pick a spot on the planet's region map
const land = { seed: 0, biome: '', u: 0, v: 0 };
function openLanding() {
  land.seed = (Math.random() * 1e9) | 0; land.biome = biomeOf(draft.planet);
  $('ld-planet').textContent = `${draft.planet.toUpperCase()} · ${BIOMES[land.biome].name.toUpperCase()}`;
  const g = $('ld-map').getContext('2d'), im = g.createImageData(RW, RH); im.data.set(regionImage(land.seed, land.biome)); g.putImageData(im, 0, 0);
  const b = bestSite(land.seed, land.biome, C.N); pickSite(b.u, b.v); show('s-land');
}
function pickSite(u, v) {
  const half = C.N / TPP / 2; land.u = Math.max(half, Math.min(RW - half, u)); land.v = Math.max(half, Math.min(RH - half, v));
  const c = $('ld-mark'), g = c.getContext('2d'); g.clearRect(0, 0, RW, RH);
  const box = (s, col, w) => { const h = s / TPP / 2; g.strokeStyle = col; g.lineWidth = w; g.strokeRect(land.u - h, land.v - h, h * 2, h * 2); };
  box(C.N, '#f5d547', 0.8);
  { const h = C.N / TPP / 2, step = LAND.PARCEL / TPP; g.strokeStyle = 'rgba(245,213,71,0.22)'; g.lineWidth = 0.3; g.beginPath(); for (let i = 1; i < LAND.GRID; i++) { g.moveTo(land.u - h + i * step, land.v - h); g.lineTo(land.u - h + i * step, land.v + h); g.moveTo(land.u - h, land.v - h + i * step); g.lineTo(land.u + h, land.v - h + i * step); } g.stroke(); }
  g.fillStyle = '#f5d547'; g.fillRect(land.u - 0.8, land.v - 0.8, 1.6, 1.6);
  const s = survey(land.seed, land.biome, land.u, land.v, C.N), pc = v => Math.round(v * 100) + '%';
  const km = C.N * LAND.TILE_M / 1000;
  $('ld-survey').innerHTML = `<div class="kv"><span>SECTION</span><b>${km.toFixed(1)} × ${km.toFixed(1)} KM · ${Math.round((LAND.GRID - 2) ** 2 * (LAND.PARCEL * LAND.TILE_M / 1000) ** 2)} KM² GRANTABLE</b></div><div class="kv"><span>BUILDABLE GROUND</span><b>${pc(s.open)}</b></div><div class="kv"><span>WATER</span><b>${pc(s.water)}</b></div><div class="kv"><span>ROCK</span><b>${pc(s.rock)}</b></div>`
    + `<div class="kv"><span>NATURAL COVER</span><b>${pc(s.cover)}</b></div><div class="kv"><span>E-710 SEEPS</span><b>${s.seeps} tiles</b></div><div class="kv"><span>ORE FIELDS</span><b>${s.ore} tiles</b></div>`
    + `<ul>${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
}
$('ld-mark').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); pickSite((e.clientX - r.left) / r.width * RW, (e.clientY - r.top) / r.height * RH); audio.play('click'); });
let suggestN = 0;
$('ld-best').onclick = () => { const l = bestSite(land.seed, land.biome, C.N, true), b = l[++suggestN % Math.min(6, l.length)]; pickSite(b.u, b.v); };
$('ld-back').onclick = () => show('s-faction');
$('ld-go').onclick = () => start(new Sim({ faction: draft, diff: draft.diff, seed: land.seed, site: { u: land.u, v: land.v }, callIn: true })).then(() => beginCallIn());

// ---------------------------------------------------------------- calling in the HQ: the whole section from high up, the
// 3 x 3 parcels the HQ would bring shown under the pointer
function beginCallIn() {
  tool = 'callin'; select(null); paused = false; rot = 0;
  view.zoomT = view.zoom = view.zMax() * 0.92; view.lookAt(sim.N / 2, sim.N / 2);
  $('callin').classList.remove('hidden'); $('hud').classList.add('calling');
  ciCard(); ciRead(null);
}
// the card at the top: what this step is
function ciCard() {
  const flag = sim.callIn === 'flag';
  $('ci-h').textContent = flag ? 'STEP 1 OF 2 · RAISE THE FLAG' : 'STEP 2 OF 2 · SET DOWN THE COMMAND POST';
  $('ci-p').textContent = flag
    ? 'Pick where the first pelican comes down. The troopers raise the Super Earth flag there, and the 3 × 3 parcels round it (1.8 km on a side) are granted to you, cleared of scrub.'
    : 'Now place the Command Post anywhere on your ground: the HQ and its own landing pad, with the HQ\'s stores. It is the nexus of the base; the first pelican lands on its pad. R turns it.';
  $('ci-best').textContent = flag ? 'SUGGEST A SPOT' : 'NEXT TO THE FLAG';
}
function ciRead(at) {
  if (!at) { $('ci-read').innerHTML = '<p class="fine left">Move over the map to survey a spot.</p>'; return; }
  if (sim.callIn === 'hq') { const c = sim.canStarter(at[0], at[1], rot); $('ci-read').innerHTML = `<div class="kv"><span>HERE</span><b class="${c.ok ? 'up' : 'warn'}">${c.ok ? 'CLEAR TO SET DOWN' : esc(c.why).toUpperCase()}</b></div>`; return; }
  const c = sim.canFlag(at[0], at[1]), ps = sim.startParcels(at[0], at[1]), f = ps.map(([px, pz]) => sim.parcelInfo(px, pz)), sum = k => f.reduce((a, b) => a + b[k], 0);
  $('ci-read').innerHTML = `<div class="kv"><span>BUILDABLE</span><b>${sum('buildKm2').toFixed(2)} km² of ${sum('km2').toFixed(2)}</b></div><div class="kv"><span>WATER · ROCK</span><b>${sum('water')} · ${sum('rock')} tiles</b></div><div class="kv"><span>E-710 · ORE</span><b>${sum('seeps')} · ${sum('ore')} tiles</b></div>`
    + `<div class="kv"><span>HERE</span><b class="${c.ok ? 'up' : 'warn'}">${c.ok ? 'CLEAR TO LAND' : esc(c.why).toUpperCase()}</b></div>`;
}
function callIn(x, z) {
  if (sim.callIn === 'flag') {
    const r = sim.plantFlag(x, z); if (!r.ok) { flash(r.why); audio.play('deny'); return; }
    tool = 'starter'; ciStart = null; view.setGhost(null); view.lookAt(x + 0.5, z + 0.5); view.zoomT = 40;
    audio.play('place'); ciCard(); ciRead(null); drawMinimap();
    flash('The flag is up. Now set down the Command Post.');
    return;
  }
  const r = sim.placeStarter(x, z, rot); if (!r.ok) { flash(r.why); audio.play('deny'); return; }
  sim.begin(); life = new Life(sim); view.life = life;
  tool = null; ciStart = null; view.setGhost(null); view.showParcels(null); $('callin').classList.add('hidden'); $('hud').classList.remove('calling');
  const hq = sim.b.find(b => b.type === 'hq'); view.lookAt(hq.x + 1.5, hq.z + 1.5); view.zoomT = 24;
  audio.play('place'); buildBar(); hud(); drawMinimap(); store();
  flash('The pelican is inbound to the pad. Draw your first road from the HQ.');
}
// test hook: the whole landing in one call, at the suggested spot
function callInAuto() { const [x, z] = sim.autoSpot(); if (sim.callIn === 'flag') sim.plantFlag(x - 2, z + 1, { force: true }); tool = 'starter'; rot = 0; callIn(x, z); }
$('ci-best').onclick = () => {
  let x, z;
  if (sim.callIn === 'flag') { [x, z] = sim.autoSpot(); x -= 2; z += 1; ciStart = { parcels: sim.startParcels(x, z), ok: true }; view.setGhost('seflag', x, z, 0, true); }
  else { const [fx, fz] = sim.flagAt; let best = null; for (let r = 2; r < 14 && !best; r++) for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) for (let k = 0; k < 4 && !best; k++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && sim.canStarter(fx + dx, fz + dz, k).ok) best = [fx + dx, fz + dz, k]; if (!best) { flash('No room near the flag: pick a spot'); return; } [x, z, rot] = best; view.setGhost('starter', x, z, rot, true); }
  view.lookAt(x + 1, z + 1); view.zoomT = Math.min(view.zoomT, 50); hover = { tx: x, tz: z, rot }; ciRead([x, z]);
  flash(sim.callIn === 'flag' ? 'A good spot: click there to bring the pelican down.' : 'Room here: click it to set the Command Post down.');
};

// ---------------------------------------------------------------- LAND: buy the parcels next to yours
let landSel = null, landHover = null, ciStart = null;
function landCard(p) {
  landSel = p; const el = $('selp');
  if (!p) { if (el.dataset.land) { el.classList.add('hidden'); el.dataset.land = ''; el._html = ''; } return; }
  const [px, pz] = p, f = sim.parcelInfo(px, pz), c = sim.canBuy(px, pz), cost = sim.parcelCost(px, pz), st = sim.parcelState(px, pz), pc = v => Math.round(v / f.tiles * 100) + '%';
  const html = `<div class="ph"><span>LAND · PARCEL ${sim.parcelName(px, pz)}</span><button class="x" id="lp-x" type="button">×</button></div>`
    + `<div class="kv"><span>AREA</span><b>${f.km2} km² · ${LAND.PARCEL * LAND.TILE_M} m square</b></div><div class="kv"><span>BUILDABLE</span><b>${f.buildKm2} km² (${pc(f.open)})</b></div>`
    + `<div class="kv"><span>WATER</span><b>${pc(f.water)}</b></div><div class="kv"><span>ROCK</span><b>${pc(f.rock)}</b></div><div class="kv"><span>SCRUB</span><b>${pc(f.scrub)}</b></div>`
    + `<div class="kv"><span>E-710 SEEPS</span><b>${f.seeps ? f.seeps + ' tiles' : 'none'}</b></div><div class="kv"><span>ORE FIELDS</span><b>${f.ore ? f.ore + ' tiles' : 'none'}</b></div>`
    + (st === 'owned' ? `<p class="fine left">Yours.</p>` : `<div class="kv"><span>PRICE</span><b>${cost.sup} SUP · ${cost.cr} CR</b></div><div class="kv"><span>PARCELS HELD</span><b>${sim.held()} / ${Math.min(441, sim.allowance())}</b></div>`
      + (c.ok ? `<button class="btn primary" id="lp-buy" type="button">BUY PARCEL ${sim.parcelName(px, pz)}</button>` : `<p class="fine left warn">${esc(c.why)}.</p>`));
  el.classList.remove('hidden'); el.dataset.land = '1';
  if (el._html === html) return; el.innerHTML = el._html = html;
  $('lp-x').onclick = () => landCard(null);
  if ($('lp-buy')) $('lp-buy').onclick = () => { const r = sim.buyParcel(px, pz); if (!r.ok) { flash(r.why); audio.play('deny'); } else audio.play('place'); el._html = ''; landCard(p); buildBar(); };
}

$('b-new').onclick = () => openFaction(false);
$('b-continue').onclick = () => { const s = stored(); if (s) start(new Sim({ state: s })); };
$('b-howto').onclick = () => show('s-howto');
$('ht-x').onclick = () => show(playing ? null : 's-title');

// ---------------------------------------------------------------- the build bar
// the line tools: roads and walls are drawn the same way. Drag from one end to the other; ends snap to the grid, to
// 45 degrees or nowhere (SNAP, or G), and always onto existing roads and walls so they join up
const RTOOLS = { road1: { name: 'Dirt Road', k: 'dirt', why: 'One tile wide, cheap, a bit faster', desc: 'Drag to draw. One tile wide and cheap. Vehicles go 1.6 times as fast as off-road, people a little faster.' },
  road2: { name: 'Paved Road', k: 'paved', why: 'Two tiles wide, vehicles 2.4× faster', desc: 'Drag to draw. Two tiles wide, with a centre line. Vehicles go 2.4 times as fast, so supplies reach their buildings sooner.' },
  wall: { name: 'Wall', k: 'wall', why: 'Encloses the base; a road through it is a gate', desc: 'Drag to draw perimeter wall. Whatever your walls enclose is the base: build further out, then take the old wall down. A road drawn through a wall makes a gate.' },
  unroad: { name: 'Bulldoze', k: null, why: 'Take out a road or a wall', desc: 'Click a road or a wall to take it out. Half the cost back.' },
  land: { name: 'Land', k: null, area: true, why: 'Buy parcels next to yours', desc: 'Shows the section as parcels, 600 m on a side. Yellow ones touch your ground and can be bought; click one to see what is on it and its price. The charter sets how many you may hold.' },
  clear: { name: 'Clear Scrub', k: null, area: true, why: `Engineers clear a patch, +${SCRUB.yield} SUP a tile`, desc: `Click scrub or debris to have the next free engineer crew clear that patch (up to ${SCRUB.patch} tiles). Each tile cleared brings in ${SCRUB.yield} supplies of salvage. Click an ordered patch to cancel it. Anything you build on scrub is cleared first anyway.` } };
const SNAPS = ['grid', '45', 'free'], SNAPNAME = { grid: 'GRID', 45: '45°', free: 'FREE' };
let snapMode = 'grid';
const lineCost = k => k ? sim.linePrice(k) : 0;
// thin line icons (24 x 24, drawn with the current colour)
const ICON = {
  roads: 'M8 21 11 3M16 21 13 3M12 6v2M12 11v2M12 16v2', logistics: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  training: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 11.5v1', living: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5',
  income: 'M4 20h16M7 17v-4M12 17V9M17 17V5', power: 'M13 2 5 14h6l-1 8 8-12h-6z', defence: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  truth: 'M3 10v4h3l7 4V6l-7 4zM16 9c1.5 1.5 1.5 4.5 0 6M19 7c3 3 3 7 0 10', command: 'M12 21V9M8 21h8M5 7c4-4 10-4 14 0M8 10c2-2 6-2 8 0M12 9V3',
  role: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', zones: 'M3 3h8v8H3zM13 13h8v8h-8zM13 3h8v8M3 13h8v8', zone: 'M3 3h8v8H3zM13 13h8v8h-8zM13 3h8v8M3 13h8v8', money: 'M12 3v18M16 7c0-2-8-2-8 1s8 2 8 5-8 3-8 1', supply: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5',
  cond: 'M14 6a4 4 0 0 0 4 6l-8 8-4-4 8-8a4 4 0 0 0 6-4l-3 3-3-1-1-3z', crew: 'M12 4a3 3 0 1 0 0 6 3 3 0 1 0 0-6M5 20c0-4 3-7 7-7s7 3 7 7', watch: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6',
  none: 'M5 5l14 14M19 5 5 19', res: 'M12 3l6 8-6 10-6-10zM6 11h12', routes: 'M4 18c3-9 13-9 16 0M4 18a1.5 1.5 0 1 0 0 .1M20 18a1.5 1.5 0 1 0 0 .1M12 11v.1',
};
const icon = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k] || ''}"/></svg>`;
function groupItems(g) { const subs = GROUPS.find(x => x[0] === g)[3]; return subs.filter(k => B[k] && !B[k].fixed && !GROWS.has(k)).map(k => [k, B[k]]); }   // everyday buildings only grow in zones
// what a building is for, in a few words, from what it does
function whyOf(k) {
  const d = B[k], m = [], cf = sim.hasStd(k) ? STD[sim.std].cap : 1, cp = v => Math.max(1, Math.round(v * cf));
  if (d.pad) m.push('supplies and recruits in, troopers out');
  if (C.SALES[k] || d.sales) m.push(`+${C.SALES[k] || d.sales} CR a day`);
  if (d.make) m.push(`+${d.make} supplies a day`);
  if (d.pump) m.push(`+${d.pump} fuel a day`);
  if (d.slots) m.push(`trains ${cp(d.slots)} recruits`);
  if (d.beds) m.push(`houses ${cp(d.beds)}`);
  if (d.eat) m.push(`feeds ${cp(d.eat)}`);
  if (d.pw > 0) m.push(`+${d.pw} power`);
  if (d.water) m.push(`${d.water} water a day`);
  if (d.sewer) m.push(`takes ${d.sewer} waste a day`);
  if (d.cover) m.push(`covers ${Math.max(...Object.values(d.cover))} tiles`);
  if (d.store) m.push(`stores ${Math.floor(Object.values(d.store).reduce((a, b) => a + b, 0) * cf)} goods`);
  if (d.trucks) m.push(`${d.trucks} supply trucks`);
  if (d.ward) m.push(`${cp(d.ward)} beds for the wounded`);
  if (d.watch) m.push(`watches ${d.watch} tiles of wall`);
  if (d.guns) m.push(`arms ${d.guns} tiles of wall`);
  if (d.squads) m.push('sends standing patrols');
  if (d.lab) m.push('research');
  if (d.weekly) m.push(Object.entries(d.weekly).map(([s, v]) => `${v > 0 ? '+' : ''}${v} ${{ def: 'Defence', pro: 'Expansion', tru: 'Truth' }[s]} a week`).join(', '));
  const sk = sim.hasStd(k) ? STD[sim.std] : null;
  if (d.prop) m.push(`+${Math.round(d.prop * (sk?.prop ?? 1))} propaganda`);
  if (d.mor) m.push(`+${Math.round(d.mor * (sk?.mor ?? 1))} morale`);
  return m.slice(0, 2).join(' · ') || d.desc.split('. ')[0];
}
const perDay = v => Math.round(v / 7 * 10) / 10;
let buildOpen = true;
function buildBar() {
  $('b-groups').innerHTML = GROUPS.map(([k, n]) => `<button class="bg ${k === group ? 'on' : ''} ${k === group && buildOpen ? 'open' : ''}" data-g="${k}" type="button" title="${esc(GROUPS.find(x => x[0] === k)[2])}">${icon(k)}<span>${n}</span></button>`).join('');
  $('b-items').classList.toggle('hidden', !buildOpen);
  if (!buildOpen) return;
  const items = groupItems(group), G = GROUPS.find(x => x[0] === group);
  const lines = group === 'roads' ? ['road1', 'road2', 'unroad', 'clear', 'land'] : group === 'defence' ? ['wall', 'unroad'] : [];
  const found = sim.founded(), fm = sim.foundMissing();
  if (group === 'zones') { zonesBar(G, found, fm); return; }
  const stdRow = items.some(([k]) => sim.hasStd(k)) ? `<span class="bi-std"><span>BUILD AS</span>${STD.map((t, i) => { const lk = sim.stdLock(i); return `<button class="btn ${sim.std === i ? 'on' : ''} ${lk ? 'lock' : ''}" data-std="${i}" type="button" title="${esc(t.doctrine + ' standard. ' + t.desc + (lk ? ' ' + lk + '.' : ''))}">${t.name.toUpperCase()}${lk ? ' 🔒' : ''}</button>`; }).join('')}</span>` : '';
  const u = sim.util, utilLine = group === 'power' && u ? `<span class="bi-crews">POWER ${sim.power.made}/${sim.power.used} · WATER ${u.water.made}/${u.water.use} · SEWAGE ${u.sewer.cap}/${u.sewer.use} A DAY${u.dark ? ` · ${u.dark} DARK` : ''}</span>` : '';
  const head = `<div class="bi-head"><b>${G[1]}</b><span>${group === 'power' ? '' : esc(G[2])}</span>${utilLine}<span id="bi-crews" class="bi-crews"></span>${stdRow}${!found ? `<em>Foundation first: ${fm.map(t => B[t].name).join(', ')}. These bring the money in; the rest of the base opens once they are up.${fm.some(t => GROWS.has(t)) ? ` ${fm.filter(t => GROWS.has(t)).map(t => B[t].name).join(', ')} grow${fm.filter(t => GROWS.has(t)).length > 1 ? '' : 's'} in zones: paint them from the ZONES bar.` : ''}</em>` : ''}</div>`;
  $('b-items').innerHTML = head + `<div class="bi-row">` + (lines.length ? `<button class="bi road" data-snap="1" type="button" title="How line ends snap (G)"><span class="th ic-th">${icon('roads')}</span><b>SNAP</b><span class="why">${SNAPNAME[snapMode]}</span><span class="cost">G to switch</span></button>` : '')
    + lines.map(k => { const d = RTOOLS[k]; return `<button class="bi road ${tool === k ? 'on' : ''}" data-b="${k}" type="button"><span class="th ic-th">${icon(k === 'wall' ? 'defence' : k === 'unroad' ? 'none' : k === 'clear' ? 'cond' : k === 'land' ? 'zones' : 'roads')}</span><b>${d.name}</b><span class="why">${esc(d.why)}</span><span class="cost">${d.k ? lineCost(d.k) + ' SUP / TILE' : k === 'land' ? `${sim.held()} / ${Math.min(441, sim.allowance())} HELD` : k === 'clear' ? `+${SCRUB.yield} SUP / TILE` : 'HALF BACK'}</span></button>`; }).join('')
    + items.map(([k, d]) => {
      const lk = sim.locked(k), cost = sim.costOf(k, specOf(k)), poor = sim.supplies < cost, fnd = !found && FOUNDATION.includes(k) && fm.includes(k);
      return `<button class="bi ${lk ? 'lock' : ''} ${poor ? 'poor' : ''} ${tool === k ? 'on' : ''} ${fnd ? 'found' : ''}" data-b="${k}" type="button"><span class="th"><img alt="" data-th="${k}" data-std="${sim.hasStd(k) ? sim.std : 2}"></span><b>${d.name}</b><span class="why">${esc(lk ? 'Needs ' + lk.join(' and ') : whyOf(k))}</span><span class="cost">${sim.designable(k) ? 'FROM ' : ''}${cost} SUP${d.up ? ` · <i>−${perDay(d.up * (sim.hasStd(k) ? STD[sim.std].up : 1))}/d</i>` : ''}${d.pw < 0 ? ` · <i>${d.pw} PWR</i>` : ''}</span></button>`;
    }).join('') + `</div>`;
  // pictures of the buildings, drawn once each by the 3D view
  for (const im of $('b-items').querySelectorAll('img[data-th]')) { const u = view.thumb(im.dataset.th, +im.dataset.std); if (u) im.src = u; }
}
$('b-groups').onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; const g = b.dataset.g; buildOpen = g === group ? !buildOpen : true; group = g; buildBar(); zoneViewFor(); audio.play('click'); };
// the ZONES tab flips the map to the zones view (and back when you leave it); where zoning can go is shown while a brush is up
let ivBeforeZones = null;
function zoneViewFor() {
  const z = buildOpen && group === 'zones';
  if (z && iview !== 'zone') { ivBeforeZones = iview; setIview('zone'); }
  else if (!z && ivBeforeZones !== null && iview === 'zone') { setIview(ivBeforeZones); ivBeforeZones = null; }
}
// every free roadside tile on your land: where a zone can be painted
function zoneable() { return sim.plotTiles().filter(([x, z]) => { const t = sim.terr?.[z * sim.N + x]; return t !== 1 && t !== 2 && sim.ownedTile(x, z); }); }
$('b-items').onclick = e => { const chn = e.target.closest('[data-chain]'); if (chn) { sim.setChain(chn.dataset.chain || null); buildBar(); audio.play('click'); return; } const sd = e.target.closest('[data-std]'); if (sd && !sd.closest('.bi')) { const k = +sd.dataset.std, lk = sim.stdLock(k); if (lk) { flash(lk + '.'); audio.play('deny'); return; } sim.setStd(k); buildBar(); audio.play('click'); return; } if (e.target.closest('[data-snap]')) { snapMode = SNAPS[(SNAPS.indexOf(snapMode) + 1) % 3]; buildBar(); return; } const b = e.target.closest('[data-b]'); if (b) pickTool(b.dataset.b); };
$('b-items').addEventListener('pointermove', e => {
  const b = e.target.closest('[data-b]'); if (!b) return hideTip();
  if (b.dataset.snap) return tip('<b>Snapping</b><br>GRID: ends on tile centres. 45°: straight lines at 45-degree steps, whole tiles long. FREE: anywhere. Ends always join existing roads and walls. G switches.', e.clientX, e.clientY - 12, true);
  const k = b.dataset.b; if (k.startsWith('zone:')) return tip(k === 'zone:' ? '<b>Unzone</b><br>Drag over the ground to clear zoning.' : `<b>${ZONES[k.slice(5)].name}</b><br>${esc(ZONES[k.slice(5)].desc)}`, e.clientX, e.clientY - 12, true);
  if (RTOOLS[k]) return tip(`<b>${RTOOLS[k].name}</b><br>${RTOOLS[k].desc}`, e.clientX, e.clientY - 12, true);
  const d = B[k], lk = sim.locked(k), cf = sim.hasStd(k) ? STD[sim.std].cap : 1, cp = v => Math.max(1, Math.round(v * cf));
  const bits = [d.pw > 0 ? `+${d.pw} power` : d.pw < 0 ? `${d.pw} power` : '', d.crew ? `crew ${d.crew}` : '', d.beds ? `houses ${cp(d.beds)} votes` : '', d.eat ? `feeds ${cp(d.eat)}` : '', d.slots ? `trains ${cp(d.slots)} at ${TRAIN[d.train]}/h` : '', d.store ? 'stores ' + Object.entries(d.store).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ') : '', d.need ? 'uses ' + Object.keys(d.need).map(g => GOODS[g].name.toLowerCase()).join(', ') : '', `upkeep ${perDay(d.up)} supplies a day`].filter(Boolean);
  tip(`<b>${d.name}</b><br>${d.desc}<br><span style="color:var(--g-dim)">${bits.join(' · ')}</span>` + (lk ? `<br><span class="warn">Needs ${lk.join(' and ')}</span>` : ''), e.clientX, e.clientY - 12, true);
});
$('b-items').addEventListener('pointerleave', hideTip);
// ---------------------------------------------------------------- the design desk: large buildings are designed before placing
const specs = {};   // the last design chosen for each building type
const specOf = k => sim.designable(k) ? (specs[k] ||= { design: 0, parts: [] }) : sim.hasStd(k) ? { std: sim.std } : null;
const PARTFX = { make: v => `+${v} supplies a day`, prop: v => `+${v} propaganda`, mor: v => `+${v} morale`, sales: v => `+${v} CR a day`, watch: v => `watches ${v} tiles`, guns: v => `arms ${v} tiles of wall`, odds: v => `+${Math.round(v * 100)}% operation odds`, lab: v => `+${Math.round(v * 100)}% research`, pw: v => `+${v} power`, pride: () => 'pride' };
let refit = null;   // { id, sp }: refitting a building that is already up
function refitShow() {
  const b = refit && sim.byId(refit.id);
  if (!b) { refit = null; view.setGhost(null); designPanel(); return; }
  const c = sim.refit(b, refit.sp);
  view.setGhost(b.type, c.x ?? b.x, c.z ?? b.z, b.rot, c.ok, refit.sp);
  designPanel();
}
function designPanel() {
  const el = $('design'), rb = refit && sim.byId(refit.id), k = rb ? rb.type : tool, sp = rb ? refit.sp : k && specOf(k);
  if (!sp) { el.classList.add('hidden'); return; }
  const pf = PARTS_FOR[k], rc = rb && sim.refit(rb, sp);
  el.innerHTML = (rb ? `<div class="dz-h"><b>REFIT · ${esc(B[k].name.toUpperCase())}</b><span>${rc.cost ? fmt(rc.cost) + ' SUP' : ''}</span></div>`
      : `<div class="dz-h"><b>DESIGN · ${esc(B[k].name.toUpperCase())}</b><span>${fmt(sim.costOf(k, sp))} SUP</span></div>`)
    + `<div class="dz-row">` + DESIGNS.map((d, i) => `<button class="btn dz ${sp.design === i ? 'on' : ''}" data-dz="${i}" type="button"><b>${d.name}</b><span>${d.cost === 1 ? 'base price' : '×' + d.cost}</span><i>${esc(d.desc)}</i></button>`).join('') + `</div>`
    + `<div class="dz-row parts">` + Object.entries(pf).map(([p, fx]) => `<button class="btn dp ${sp.parts.includes(p) ? 'on' : ''}" data-dp="${p}" type="button"><b>${sp.parts.includes(p) ? '✓ ' : '+ '}${PARTS[p].name}</b><span>${PARTS[p].cost} SUP · ${Object.entries(fx).map(([q, v]) => PARTFX[q](v)).join(', ')}</span></button>`).join('') + `</div>`
    + (rb ? `<div class="dz-go"><span class="${rc.ok ? 'c-ok' : 'c-bad'}">${esc(rc.ok ? 'It fits. The building closes for the refit, about half a day.' : rc.why)}</span><button class="btn" id="dz-cancel" type="button">CANCEL</button><button class="btn primary" id="dz-apply" type="button" ${rc.ok ? '' : 'disabled'}>REFIT ${rc.cost ? fmt(rc.cost) : ''}</button></div>`
      + `<p class="fine left">A refit pays the difference in price and a fee. Fortified and Monumental need a clear tile each side for their wings.</p>`
      : `<p class="fine left">Fortified and Monumental take a tile more each side for their wings. Parts sit on the building. Your choice is kept for the next one you place. Refit a building later from its panel.</p>`);
  el.classList.remove('hidden');
}
$('design').onclick = e => {
  if (refit) {
    if (e.target.closest('#dz-cancel')) { refit = null; view.setGhost(null); designPanel(); selPanel(); return; }
    if (e.target.closest('#dz-apply')) { const c = sim.redesign(refit.id, refit.sp); if (c.ok) { audio.play('place'); const id = refit.id; refit = null; view.setGhost(null); designPanel(); select(id); } else flash(c.why); return; }
  }
  const sp = refit ? refit.sp : specOf(tool); if (!sp) return;
  const d = e.target.closest('[data-dz]'), p = e.target.closest('[data-dp]');
  if (d) sp.design = +d.dataset.dz;
  if (p) { const q = p.dataset.dp; sp.parts = sp.parts.includes(q) ? sp.parts.filter(x => x !== q) : [...sp.parts, q]; }
  if ((d || p) && refit) { audio.play('click'); refitShow(); return; }
  if (d || p) { audio.play('click'); designPanel(); if (hover) view.setGhost(tool, hover.tx, hover.tz, hover.rot, sim.canPlace(tool, hover.tx, hover.tz, hover.rot, sp).ok, sp); }
};
function pickTool(k) {
  if (k.startsWith('zone:')) { tool = tool === k ? null : k; select(null); view.setGhost(null); view.showPlots(tool ? zoneable() : null); buildBar(); if (tool) flash(`Click beside a road to ${k === 'zone:' ? 'clear' : 'fill'} that block${k === 'zone:' ? '' : ' with ' + ZONES[k.slice(5)].name}, or drag to paint a patch. The pale strips are where zoning can go.`); return; }
  if (RTOOLS[k]) { tool = tool === k ? null : k; select(null); view.setGhost(null); view.showRoadGhost(null); buildBar(); return; }
  const lk = sim.locked(k);
  if (lk) { flash(`${B[k].name} needs ${lk.join(' and ')} first.`); return; }
  tool = tool === k ? null : k; select(null); buildBar(); designPanel();
  if (!tool) view.setGhost(null);
  view.showPlots(tool && !LOOSE.has(tool) ? sim.plotTiles() : null);
}
function tip(html, x, y, above) { const t = $('tip'); t.innerHTML = html; t.classList.remove('hidden'); const r = t.getBoundingClientRect(); t.style.left = Math.min(innerWidth - r.width - 6, Math.max(6, x - r.width / 2)) + 'px'; t.style.top = (above ? y - r.height : y + 18) + 'px'; }
function hideTip() { $('tip').classList.add('hidden'); }
let flashT = 0;
function flash(text) { const top = $('build').getBoundingClientRect().top || innerHeight - 170; tip(`<span class="warn">${esc(text)}</span>`, innerWidth / 2, top - 10, true); flashT = 2.2; }

// ---------------------------------------------------------------- zones: the brushes, what each zone grows, and the demand
const DEMAND = [['bunks', 'BUNKS'], ['seats', 'MESS SEATS'], ['latrines', 'LATRINES'], ['storage', 'STORAGE'], ['shops', 'SHOPS']];
function demandBars(d) {
  if (!d) return '<span class="fine">Demand is worked out every hour.</span>';
  return DEMAND.map(([k, n]) => `<span class="dm" title="${d[k] ? `Short by ${d[k]}${k === 'bunks' ? ` (jobs for ${d.jobs})` : ''}` : 'Enough for now'}"><i>${n}</i><b><u style="width:${Math.round(d.bars[k] * 100)}%"></u></b></span>`).join('');
}
function zonesBar(G, found, fm) {
  const d = sim.dem, ch = sim.chainNow(), lockedChain = sim.b.some(b => B[b.type].chain);
  const stdRow = `<span class="bi-std"><span>GROW AS</span>${STD.map((t, i) => { const lk = sim.stdLock(i); return `<button class="btn ${sim.std === i ? 'on' : ''} ${lk ? 'lock' : ''}" data-std="${i}" type="button" title="${esc(t.doctrine + ' standard. ' + t.desc + (lk ? ' ' + lk + '.' : ''))}">${t.name.toUpperCase()}${lk ? ' 🔒' : ''}</button>`; }).join('')}</span>`;
  const chainSel = lockedChain ? `<span class="bi-chain">FRANCHISE <b>${B[ch].name}</b></span>` : `<span class="bi-chain">FRANCHISE <select id="z-chain" title="The one chain your Commerce zone grows (one per base)">${['', ...CHAINS].map(k => `<option value="${k}" ${ch === (k || null) ? 'selected' : ''}>${k ? B[k].name : 'None'}</option>`).join('')}</select></span>`;
  const head = `<div class="bi-head" title="${esc(G[2])}"><b>${G[1]}</b><span class="bi-dem">${demandBars(d)}</span>${chainSel}${stdRow}</div>`;
  const card = k => {
    const z = ZONES[k], note = sim.growNote?.[k], n = sim.zoneCount(k);
    const what = z.grows.length ? 'Grows ' + z.grows.map(t => t === 'chain' ? (ch ? B[ch].name : 'your franchise') : B[t].name).join(', ') : z.fits ? 'Placed here, works 5% better' : 'Kept clear';
    return `<button class="bi zone ${tool === 'zone:' + k ? 'on' : ''}" data-b="zone:${k}" type="button" title="${esc(z.desc)}"><span class="th ic-th" style="background:${z.col}33;border-color:${z.col}"><i class="zsw" style="background:${z.col}"></i></span><b>${z.name}</b><span class="why">${esc(what)}</span><span class="cost">${n ? n + ' tiles' : 'none painted'}${note && z.grows.length ? ' · ' + esc(note) : ''}</span></button>`;
  };
  $('b-items').innerHTML = head + `<div class="bi-row">${ZKEYS.map(card).join('')}<button class="bi zone ${tool === 'zone:' ? 'on' : ''}" data-b="zone:" type="button"><span class="th ic-th">${icon('none')}</span><b>Unzone</b><span class="why">Drag to clear zoning. Buildings already up stay.</span><span class="cost">FREE</span></button></div>`;
  const sel = $('z-chain'); if (sel) sel.onchange = () => { sim.setChain(sel.value || null); sim.growStep(); buildBar(); audio.play('click'); };
}
// ---------------------------------------------------------------- engineers: what a job or a crew is doing, in words
function buildState(b) {
  if (!sim.secure()) return 'waiting: the landing zone is being swept';
  const c = sim.crewOn(b.id);
  if (!c) { const n = sim.waitingAhead(b.id); return `waiting for a free engineer crew${n > 0 ? ` (${n} job${n > 1 ? 's' : ''} ahead)` : ''}`; }
  if (b.clr?.length) return `${c.name} clearing ${sim.scrubName()}, ${b.clr.length} tile${b.clr.length > 1 ? 's' : ''} to go`;
  return `${c.name} at work, ${Math.round((b.done ? b.upg.prog : b.prog) * 100)}%`;
}
function crewState(c) {
  if (c.wait > 0) return `in training, ${days(c.wait)} left`;
  if (c.job == null) return 'free';
  if (c.job < 0) { const o = (sim.clr || []).find(o => o.id === c.job); return `clearing scrub, ${o?.tiles.length || 0} tiles to go`; }
  const b = sim.byId(c.job); return b ? `${b.done ? 'upgrading' : 'building'} the ${B[b.type].name}` : 'free';
}
// ---------------------------------------------------------------- selection
let selId = null;
function select(id) { if (refit && refit.id !== id) { refit = null; view.setGhost(null); designPanel(); } selId = id; const b = id ? sim.byId(id) : null; view.select(b); view.showPlaza(b && b.type === 'seflag' ? sim.plaza().tiles : null); selPanel(); }
function selPanel() {
  const b = selId && sim.byId(selId), p = $('selp');
  if (!b) { p.classList.add('hidden'); p._html = ''; return; }
  const d = B[b.type], bits = [];
  if (sim.hasStd(b.type)) { const k = sim.stdOf(b); bits.push(`<div class="kv"><span>STANDARD</span><b>${STD[k].name} <small>(${STD[k].doctrine.toLowerCase()})</small></b></div>`); }
  if (!b.done || b.upg) { const pr = b.done ? b.upg.prog : b.prog; bits.push(`<div class="kv"><span>${b.done ? 'UPGRADE TO ' + STD[b.upg.to].name.toUpperCase() : 'CONSTRUCTION'}</span><b>${Math.round(pr * 100)}%</b></div><div class="meter"><i style="width:${pr * 100}%;background:var(--yellow)"></i></div><div class="kv"><span>ENGINEERS</span><b>${esc(buildState(b))}</b></div>`); }
  { const notes = []; if (b.grown) notes.push(`Grew in ${ZONES[b.grown].name}`); if (B[b.type].beds && b.noisy) notes.push('<span class="warn">Noisy neighbours: morale suffers</span>'); if (B[b.type].beds && b.hazard) notes.push('<span class="warn">Fuel or a generator next door: a hazard</span>'); if (b.nearPad) notes.push(`Near a landing pad: holds ${Math.round((GROW.padBonus - 1) * 100)}% more`); if (sim.zoneFit(b) > 1) notes.push('In its own zone: works 5% better'); if (notes.length) bits.push(`<div class="kv"><span>ZONE</span><b>${notes.join('<br>')}</b></div>`); }
  if (b.done && (d.pw < 0 || sim.needsWater(b) || sim.needsSewer(b))) { const sv = []; if (d.pw < 0) sv.push(b.dark ? '<span class="down">no power: outside the grid</span>' : 'power'); if (sim.needsWater(b)) sv.push(b.dry ? '<span class="warn">no water</span>' : 'water'); if (sim.needsSewer(b)) sv.push(b.foul ? '<span class="warn">no sewage</span>' : 'sewage'); if (b.smelly) sv.push('<span class="warn">smells the lagoon</span>'); bits.push(`<div class="kv"><span>SERVICES</span><b>${sv.join(' · ')}</b></div>`); }
  if (B[b.type].water && b.done) bits.push(`<div class="kv"><span>WATER</span><b>${B[b.type].water} a day${b.bad ? ' · <span class="down">contaminated: a lagoon is too close</span>' : ''}</b></div>`);
  if (b.type === 'yard') { const cs = sim.crews.filter(c => c.yard === b.id); bits.push(`<div class="kv"><span>CREW</span><b>${cs.length ? cs.map(c => `${c.name}: ${crewState(c)}`).join('; ') : b.done ? `waiting for ${3} recruits` : 'none yet'}</b></div>`); }
  if (!b.done) { /* construction shown above */ }
  else {
    bits.push(`<div class="kv"><span>CONDITION</span><b class="${b.cond < 40 ? 'down' : ''}">${Math.round(b.cond)}%</b></div><div class="meter"><i style="width:${b.cond}%;background:${b.cond < 40 ? 'var(--red)' : b.cond < 70 ? 'var(--amber)' : 'var(--g)'}"></i></div>`);
    if (d.crew) bits.push(`<div class="kv"><span>CREW</span><b class="${b.crew < d.crew ? 'warn' : ''}">${b.crew} / ${d.crew}</b></div>`);
    if (d.pw) bits.push(`<div class="kv"><span>POWER</span><b>${d.pw > 0 ? '+' : ''}${b.type === 'gen' ? Math.round(d.pw * sim.crewFrac(b) * (b.stock.fuel > 0 ? 1 : 0)) : d.pw}</b></div>`);
    const bar = (g, n, cap, label) => `<div class="kv"><span>${label || GOODS[g].name.toUpperCase()}</span><b class="${n < cap * 0.15 ? 'down' : ''}">${Math.floor(n)} / ${cap}</b></div><div class="meter"><i style="width:${Math.min(100, n / cap * 100)}%;background:${GOODS[g].color}"></i></div>`;
    if (d.store) for (const g in d.store) bits.push(bar(g, b.stock[g], sim.storeCap(b, g)));
    if (d.need) for (const g in d.need) bits.push(bar(g, b.stock[g], d.need[g], 'NEEDS ' + GOODS[g].name.toUpperCase()));
    if (d.pad) { const n = GKEYS.reduce((a, g) => a + b.stock[g], 0); bits.push(`<div class="kv"><span>WAITING TO BE MOVED</span><b>${Math.floor(n)}</b></div>`); }
    if (d.eat) bits.push(`<div class="kv"><span>FEEDS</span><b>${sim.cap(b, 'eat')} votes a day</b></div>`);
    if (d.slots) { const n = sim.troops.filter(t => t.at === b.id).length; bits.push(`<div class="kv"><span>TRAINING NOW</span><b>${n} / ${sim.cap(b, 'slots')}</b></div>`); }
    if (d.trucks || d.lifts) { const vs = sim.veh.filter(v => v.home === b.id); bits.push(`<div class="kv"><span>${d.trucks ? 'TRUCKS' : 'FORKLIFT'}</span><b>${vs.filter(v => v.job).length} of ${vs.length} on a run</b></div>`); }
    if (d.ward) { const w = sim.troops.filter(t => t.hurt > 0); bits.push(`<div class="kv"><span>PATIENTS</span><b>${Math.min(w.length, d.ward)} of ${d.ward} beds</b></div>` + w.slice(0, 6).map(t => `<div class="kv"><span>${esc(t.name)}</span><b>${days(t.hurt)}</b></div>`).join('')); }
    if (d.cryo) bits.push(`<div class="kv"><span>HELLDIVERS</span><b>four thawed, on a Marine's day: PT 05:30, Colors 08:00</b></div>`);
    if (d.staff) bits.push(`<div class="kv"><span>CITIZEN STAFF</span><b>${d.staff}</b></div>`);
    if (d.watch) bits.push(`<div class="kv"><span>WATCHES</span><b>${b.crew > 0 ? d.watch + ' tiles of wall' : 'nothing: no crew'}</b></div>`);
    if (d.lab) bits.push(`<div class="kv"><span>RESEARCH</span><b>${sim.tech.cur ? `${TECH[sim.tech.cur].name}, ${Math.floor(sim.tech.pts / TECH[sim.tech.cur].hrs * 100)}%` : 'idle: pick a project in Science'}</b></div>`);
    if (d.armour) for (const k of ['frv', 'tank']) {
      const v = sim.veh.find(v => v.home === b.id && v.kind === k), w = b.wreck?.[k];
      if (v || w) bits.push(`<div class="kv"><span>${VEHICLES[k].name.toUpperCase()}</span><b>${v ? (v.mission ? 'on an operation' : 'ready') : `replacement in ${days(w)}`}</b></div>`);
    }
    if (d.squads) { const out = sim.patrols.filter(p => p.office === b.id).length; bits.push(`<div class="kv"><span>SQUADS KEPT OUT</span><b><button class="btn icon" id="sq-dn" type="button">-</button> ${b.squads} <button class="btn icon" id="sq-up" type="button">+</button></b></div><div class="kv"><span>IN THE FIELD NOW</span><b>${out}</b></div>`); }
    if (d.beds) bits.push(`<div class="kv"><span>VOTES HOUSED</span><b>${sim.cap(b, 'beds')}</b></div>`);
    if (d.potty) bits.push(`<div class="kv"><span>CLEANLINESS</span><b class="${(b.clean ?? 100) < 25 ? 'down' : ''}">${Math.round(b.clean ?? 100)}%</b></div><div class="meter"><i style="width:${b.clean ?? 100}%;background:${(b.clean ?? 100) < 25 ? 'var(--red)' : 'var(--blue)'}"></i></div><div class="kv"><span>VOTES PER POTTY</span><b>${Math.round(sim.potties.perPotty)}</b></div>`);
    if (b.type === 'seflag') { const pz = sim.plaza(); bits.push(`<div class="kv"><span>PLAZA HOLDS</span><b class="${pz.need > pz.cap ? 'down' : ''}">${pz.cap} votes</b></div><div class="kv"><span>VOTES TO SALUTE</span><b>${pz.need}</b></div>`); }
    if (b.type === 'memorial') bits.push(`<div class="kv"><span>NAMES ON THE WALL</span><b>${sim.fallen.length}</b></div>`);
    if (b.off) bits.push(`<p class="warn">Switched off.</p>`);
  }
  const crew = sim.troops.filter(t => t.job === b.id).map(t => `${rankOf(t.missions)} ${esc(t.name)}`).join(', ');
  // one line on how it is doing, and what it earns or costs, like a city builder's building card
  const out = d.need && Object.keys(d.need).find(g => (b.stock[g] || 0) < 0.5);
  const st = !b.done ? ['warn', `Under construction: ${buildState(b)}`] : b.upg ? ['warn', `Upgrading, half pace: ${buildState(b)}`] : b.off ? ['warn', 'Switched off'] : out ? ['bad', `Out of ${GOODS[out].name.toLowerCase()}`]
    : b.dark ? ['bad', 'Dark: outside power coverage. Build a Substation (UTILITIES)'] : d.crew && b.crew < 1 ? ['bad', 'No crew'] : d.pw < 0 && sim.power.ratio < 1 ? ['bad', 'Short of power'] : d.crew && b.crew < d.crew ? ['warn', `Short of crew, ${b.crew} of ${d.crew}`]
    : b.cond < 40 ? ['bad', 'Falling apart: repair it'] : ['ok', d.store ? 'Stocked and running' : 'Running'];
  const mv = b.done ? moneyOf(b) : 0;
  const top = `<div class="sp-status ${st[0]}">${st[1]}</div><div class="sp-money"><span>UPKEEP <b class="down">−${fmt(perDay(sim.upkeepOf(b)))}</b>/d</span><span>NET <b class="${mv < 0 ? 'down' : 'up'}">${mv >= 0 ? '+' : '−'}${fmt(Math.abs(mv))}</b> SUP/d</span><span class="role" style="color:${ROLE_COL[roleOf(b.type)]}">${GROUPS.find(g => g[0] === roleOf(b.type))?.[1] || 'COMMAND'}</span></div>`;
  const html = `<div class="ph"><span>${d.name.toUpperCase()}</span><button class="x" id="sp-x" type="button">×</button></div>${top}<div class="sp-body">${bits.join('')}<p>${d.desc}</p>${crew ? `<p>On duty: ${crew}</p>` : ''}</div>
    <div class="sp-btns">${b.done && b.cond < 100 ? `<button class="btn" id="sp-rep" type="button">REPAIR ${sim.repairCost(b)}</button>` : ''}${b.done && (d.crew || d.pw < 0) ? `<button class="btn" id="sp-off" type="button">${b.off ? 'SWITCH ON' : 'SWITCH OFF'}</button>` : ''}${b.type === 'seflag' ? `<button class="btn" id="sp-move" type="button">MOVE FLAG ${C.FLAGMOVE}</button>` : ''}${b.type === 'hq' && sim.unsettled() ? `<button class="btn primary" id="sp-hq" type="button">MOVE HQ (free until your first road)</button>` : ''}${(() => { if (!sim.hasStd(b.type) || sim.stdOf(b) >= 2 || b.upg || !b.done) return ''; const u = sim.upgradeInfo(b); return `<button class="btn ${u.ok ? 'primary' : ''}" id="sp-upg" type="button" title="${esc(u.ok ? STD[u.to].desc : u.why)}" ${u.ok ? '' : 'disabled'}>UPGRADE TO ${STD[u.to].name.toUpperCase()} ${u.cost}</button>`; })()}${b.done && sim.designable(b.type) ? `<button class="btn" id="sp-refit" type="button">${refit?.id === b.id ? 'REFITTING…' : 'REFIT'}</button>` : ''}${d.fixed ? '' : `<button class="btn danger" id="sp-del" type="button">${b.done ? 'DEMOLISH +' + Math.round((b.cost ?? d.cost) * C.REFUND) : 'CANCEL +' + (b.cost ?? d.cost)}</button>`}</div>`;
  p.classList.remove('hidden');
  if (p._html === html) return;
  p.innerHTML = p._html = html;
  $('sp-x').onclick = () => select(null);
  if ($('sp-rep')) $('sp-rep').onclick = () => { if (!sim.repair(b.id)) flash('Not enough supplies.'); selPanel(); };
  if ($('sp-off')) $('sp-off').onclick = () => { sim.toggle(b.id); selPanel(); };
  if ($('sp-upg')) $('sp-upg').onclick = () => { const u = sim.upgrade(b.id); if (!u.ok) { flash(u.why); audio.play('deny'); } else audio.playAt('place', b.x + b.w / 2, b.z + b.d / 2); selPanel(); };
  if ($('sq-up')) $('sq-up').onclick = () => { sim.setSquads(b.id, b.squads + 1); selPanel(); };
  if ($('sq-dn')) $('sq-dn').onclick = () => { sim.setSquads(b.id, b.squads - 1); selPanel(); };
  if ($('sp-del')) $('sp-del').onclick = () => { sim.demolish(b.id); select(null); audio.playAt('demolish', b.x + b.w / 2, b.z + b.d / 2); };
  if ($('sp-hq')) $('sp-hq').onclick = () => startMoveHQ();
  if ($('sp-refit')) $('sp-refit').onclick = () => { refit = refit?.id === b.id ? null : { id: b.id, sp: { design: b.design || 0, parts: [...(b.parts || [])] } }; refitShow(); selPanel(); };
  if ($('sp-move')) $('sp-move').onclick = () => { tool = 'moveflag'; view.showPlaza(sim.plazaAt(b.x, b.z, b.id)); flash('Pick a new spot for the flag. It needs open ground round it for the plaza.'); };
}

// ---------------------------------------------------------------- the HUD
function drawWho() {
  const g = $('h-logo').getContext('2d'); g.clearRect(0, 0, 56, 56); drawLogo(g, sim.faction.logo, 2, 2, 52);
  $('h-name').textContent = sim.faction.name; $('h-base').textContent = `${sim.faction.base}, ${sim.planet}`;
}
const logoCache = new Map();
function logoImg(logo) {
  const k = JSON.stringify(logo); if (logoCache.has(k)) return logoCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 44; drawLogo(c.getContext('2d'), logo, 1, 1, 42); const u = c.toDataURL(); logoCache.set(k, u); return u;
}
function startMoveHQ() { select(null); tool = 'movehq'; flash('Pick where the HQ stands, inside your land. The flag goes beside it.'); }
const ORDERS = [
  ['Wait for the security detachment to sweep the landing zone: the engineers start building once it is secure', s => s.secure()],
  ['Draw a road from your HQ (ROADS, drag). Stay inside your land: the dashed yellow line', s => s.net.segs.some(q => q.k !== 'wall')],
  ['Paint a Life Support zone and a Logistics zone along the road (ZONES: click beside a road to fill a block): barracks, a mess, latrines and a depot grow there', s => s.zoneCount('life') > 0 && s.zoneCount('logi') > 0],
  ['Lay the foundation: place a Firing Range; the zones grow the Supply Depot, Barracks and Mess Hall (the Command Post brought the pad)', s => s.founded()],
  ['Have the engineers clear a patch of scrub for salvage (ROADS, CLEAR SCRUB)', s => (s.stats.cleared || 0) >= 6],
  ['Build an Engineer Yard (LOGISTICS): a third crew means three jobs at once', s => s.crews.some(c => c.yard)],
  ['Close a wall round the base (DEFENCE, Wall), with a road through it for a gate', s => !s.open && s.gates.length > 0],
  ['Paint a Civic and Commerce zone and pick a franchise: shops grow as the base fills up', s => s.zoneCount('comm') > 0],
  ['Give the bunks water and sewage beyond the HQ: a Water Well and a Sewage Lagoon (UTILITIES). Keep the well away from the lagoon', s => s.has('well') && s.has('lagoon')],
  ['Carry the grid with a Substation so nothing goes dark (UTILITIES; the UTILITIES view shows coverage)', s => s.has('substation')],
  ['Upgrade a tent to a prefab: select it and press UPGRADE', s => s.b.some(b => b.done && s.hasStd(b.type) && b.type !== 'hq' && s.stdOf(b) >= 1)],
  ['Ship trained troopers to the front: transports leave the pad at 16:00', s => s.stats.deployed > 0],
  ['Deal with the desk: answer a request or grade a trooper\'s file (here, or DESK)', s => (s.stats.desk || 0) + (s.stats.graded || 0) > 0],
  ['Answer a Ministry call: set aside what they ask for', s => (s.stats.calls || 0) > 0],
  ['Set your Ministry commitments (ECONOMY, COMMITMENTS): what you give each Ministry a day for standing', s => !!s.commitSet],
  ['Trade on the market or with a rival base: buy what you are short of, sell the surplus', s => (s.stats.trades || 0) + (s.stats.mkt || 0) > 0],
  ['Keep supplies and credits rising: the net per day is under each at the top', s => { const r = s.rates(); return s.week >= 2 && r.supNet >= 0 && r.crNet >= 0; }],
  ['Build a Patrol Office for standing patrols', s => s.has('patrol')],
  ['Pay back the Founding Charter (ECONOMY, LOANS)', s => !s.loans.some(l => l.k === 'charter')],
  ['Be promoted to a Forward Operating Base (EXPANSION, CHARTER)', s => s.stage >= 1],
  ['Buy a parcel of land next to yours: the FOB charter lets you hold 20 (ROADS, LAND)', s => (s.stats.parcels || 0) >= 1],
  ['Be promoted to a Fort: more land, permanent buildings', s => s.stage >= 2],
  ['Be promoted to a Major Base', s => s.stage >= 3],
  ['Score 60+ in an inspection', s => s.inspection && s.inspection.score >= 60],
  ['Reach 1st place in the standings', s => s.rank === 0],
];

// ---------------------------------------------------------------- info views: the base recoloured by one question
const ROLE_COL = { roads: '#9aa3a0', logistics: '#e6eadc', training: '#f5d547', living: '#7fe9e0', income: '#59ff8a', power: '#ffb03a', defence: '#ff6a4d', truth: '#c98bff', command: '#6aa8ff' };
const roleOf = k => (GROUPS.find(g => g[3].includes(k)) || ['command'])[0];
const IVIEWS = [
  ['none', 'BASE', 'The base as it stands.'],
  ['res', 'RESOURCES', 'What the ground holds: E-710 seeps (violet) for an Extractor, ore (rust) for a Mine, water (blue) and rock (grey). Buildings go see-through.'],
  ['routes', 'SUPPLY ROUTES', 'Where goods go: from the pad to storage, and from storage to the buildings that use them. Brighter lines have a truck or forklift on them now.'],
  ['role', 'ROLES', 'What each building is for: the build menu section it comes from.'],
  ['money', 'MONEY', 'What each building earns or costs a day, in supplies (a credit counts as the market price of supplies). Green earns, red costs. Pads earn what shipped troopers bring in.'],
  ['power', 'POWER', 'Yellow makes power, cyan is powered, red is short of power, grey needs none.'],
  ['supply', 'SUPPLY', 'Goods a building runs on, full (green) to empty (red). Storage is blue, deeper the fuller.'],
  ['cond', 'CONDITION', 'Repair: green is sound, red is falling apart. Upkeep keeps it up.'],
  ['crew', 'CREW', 'Crew at their posts: green full, amber short, red none. Grey needs no crew.'],
  ['util', 'UTILITIES', 'Coverage: power (yellow), water (blue), sewage (brown) and fuel pipes (violet). Buildings are green when served, amber missing water or sewage, red dark (outside power).'],
  ['zone', 'ZONING', 'Zones painted on the ground, and buildings in the colour of the zone they grew in or stand in. Red outline: bunks next to noise or fuel.'],
];
let iview = 'none', ivT = 0, ivT2 = 0;
const mix = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)), A = p(a), Bc = p(b); return '#' + A.map((v, i) => Math.round(v + (Bc[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join(''); };
const ramp = t => t < 0.5 ? mix('#ff4d3a', '#f5c447', t * 2) : mix('#f5c447', '#3fe07a', (t - 0.5) * 2);
// a building's direct money per day, in supplies: earnings less upkeep, wages and the goods it burns
function moneyOf(b) {
  const s = sim, d = B[b.type], crp = 1 / Math.max(0.2, s.price('sup'));   // credits counted as supplies
  if (!b.done) return 0;
  const w = s.work(b);
  let v = -s.upkeepOf(b) / 7 - (d.staff || 0) * C.WAGE * crp;
  v += ((C.SALES[b.type] || 0) * s.capF(b) + s.stat(b, 'sales')) * crp * (b.off ? 0 : 1);
  v += s.stat(b, 'make') * w + (d.pump || 0) * w * GOODS.fuel.cost;
  if (d.burn) for (const g in d.burn) v -= d.burn[g] * GOODS[g].cost;
  if (d.pad) { const r = s.rates(); v += ((r.sup.deploy || 0) + (r.cr.deploy || 0) * crp) / Math.max(1, s.count('pad')); }
  return v;
}
function ivColor(b, mode) {
  const s = sim, d = B[b.type];
  if (mode === 'role') return ROLE_COL[roleOf(b.type)];
  if (mode === 'money') { const v = moneyOf(b); return v >= 0 ? mix('#5a625e', '#3fe07a', v / 30) : mix('#5a625e', '#ff4d3a', -v / 30); }
  if (mode === 'power') return d.pw > 0 ? '#ffd23a' : d.pw < 0 ? (s.power.ratio >= 1 && !b.off ? '#7fe9e0' : '#ff4d3a') : '#5a625e';
  if (mode === 'supply') { if (d.need) return ramp(Math.min(...Object.keys(d.need).map(g => (b.stock[g] || 0) / d.need[g]))); if (d.store) { const cap = Object.values(d.store).reduce((a, x) => a + x, 0), n = Object.keys(d.store).reduce((a, g) => a + (b.stock[g] || 0), 0); return mix('#24364a', '#5aa8ff', n / cap); } return '#5a625e'; }
  if (mode === 'cond') return ramp(b.cond / 100);
  if (mode === 'util') { if (b.dark) return '#ff4d3a'; if (b.dry || b.foul) return '#f5c447'; if (B[b.type].cover || UTIL.powCover[b.type]) return '#ffffff'; return d.pw < 0 || sim.needsWater(b) ? '#3fe07a' : '#5a625e'; }
  if (mode === 'zone') { if ((b.noisy || b.hazard) && B[b.type].beds) return '#ff4d3a'; const k = b.grown || sim.zoneKey(sim.zoneAt(Math.floor(b.x + b.w / 2), Math.floor(b.z + b.d / 2))); return k ? ZONES[k].col : '#5a625e'; }
  if (mode === 'crew') return d.crew ? (b.crew >= d.crew ? '#3fe07a' : b.crew > 0 ? '#f5c447' : '#ff4d3a') : '#5a625e';
  return null;
}
function ivLegend() {
  const v = IVIEWS.find(x => x[0] === iview), el = $('iv-legend');
  if (iview === 'none') { el.classList.add('hidden'); return; }
  let keys = '';
  if (iview === 'res') keys = [['#aa50ff', 'E-710 SEEP'], ['#e6783c', 'ORE'], ['#4696ff', 'WATER'], ['#3a3a40', 'ROCK']].map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  if (iview === 'util') { const u = sim.util || sim.utilities(); keys = [['#ffd23a', 'POWER'], ['#4fb4ff', 'WATER'], ['#b08a4a', 'SEWAGE'], ['#c98bff', 'FUEL']].map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('') + `<p>Water ${u.water.made} made, ${u.water.use} used a day${u.water.bad > 0.05 ? ` (${Math.round(u.water.bad * 100)}% from wells by a lagoon)` : ''}. Sewage ${u.sewer.cap} taken, ${u.sewer.use} made. ${u.dark ? `${u.dark} building${u.dark > 1 ? 's' : ''} dark. ` : ''}${sim.graceOn() ? `The inspectorate arrives in ${sim.utilGrace} days.` : `Outbreak risk ${Math.round((sim.risk || 0) * 100)}% a day.`}</p>`; }
  if (iview === 'zone') keys = ZKEYS.map(k => `<span><i style="background:${ZONES[k].col}"></i>${ZONES[k].short}</span>`).join('') + `<span><i style="background:#ff4d3a"></i>NOISY OR HAZARDOUS BUNKS</span><p>Demand: ${esc(sim.demandText())}.</p>`;
  if (iview === 'routes') keys = GKEYS.map(g => `<span><i style="background:${GOODS[g].color}"></i>${GOODS[g].name.toUpperCase()}</span>`).join('');
  if (iview === 'role') keys = GROUPS.filter(g => g[0] !== 'roads').map(g => `<span><i style="background:${ROLE_COL[g[0]]}"></i>${g[1]}</span>`).join('');
  if (iview === 'money') { const list = sim.b.filter(b => b.done).map(b => [b, moneyOf(b)]).sort((a, b) => a[1] - b[1]); const top = list.slice(-3).reverse(), bot = list.slice(0, 3);
    keys = `<span><i style="background:#3fe07a"></i>EARNS</span><span><i style="background:#ff4d3a"></i>COSTS</span><p>Best: ${top.map(([b, x]) => `${B[b.type].name} ${x >= 0 ? '+' : ''}${Math.round(x)}`).join(', ')}<br>Dearest: ${bot.map(([b, x]) => `${B[b.type].name} ${Math.round(x)}`).join(', ')} (supplies a day)</p>`; }
  el.innerHTML = `<b>${v[1]}</b><p>${esc(v[2])}</p><div class="keys">${keys}</div>`; el.classList.remove('hidden');
}
// every route goods take round the base: pad to storage, storage to the buildings that use them, and the runs a vehicle is on now
function routesNow() {
  const s = sim, done = s.b.filter(b => b.done), mid = b => [b.x + b.w / 2, b.z + b.d / 2], out = new Map();
  const nearest = (b, list) => list.filter(x => x !== b).sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
  const add = (a, b, g, live) => { const k = `${a.id}>${b.id}:${g}`, r = out.get(k); if (r) { r.live ||= live; return; } out.set(k, { a: mid(a), b: mid(b), col: GOODS[g].color, live, g }); };
  const pads = done.filter(b => B[b.type].pad);
  for (const g of GKEYS) {
    const stores = done.filter(b => s.storeCap(b, g) && !B[b.type].pump);
    for (const p of pads) { const d = nearest(p, stores); if (d) add(p, d, g); }
    for (const b of done.filter(b => B[b.type].pump && s.storeCap(b, g))) { const d = nearest(b, stores); if (d) add(b, d, g); }
    for (const b of done) if (s.needCap(b, g)) { const src = nearest(b, stores.length ? stores : pads); if (src) add(src, b, g); }
  }
  for (const v of s.veh) if (v.job) { const a = s.byId(v.job.src), b = s.byId(v.job.dst); if (a && b) add(a, b, v.job.g, true); }
  return [...out.values()];
}
function coverList() {
  const out = [], col = { pw: '#ffd23a', wa: '#4fb4ff', se: '#b08a4a', fu: '#c98bff' };
  for (const b of sim.b) if (b.done && !b.off) for (const [k, r] of Object.entries(sim.coverOf(b))) out.push({ x: b.x + b.w / 2, z: b.z + b.d / 2, r, col: col[k] });
  return out;
}
function ivApply() {
  const ghost = iview === 'res' || iview === 'routes';
  view.setInfo(iview === 'none' ? null : new Map(sim.b.map(b => [b.id, ghost ? '#c8d0cc' : ivColor(b, iview)])), ghost);
  view.showResources(iview === 'res');
  view.setCover(iview === 'util' ? coverList() : null);
  view.setRoutes(iview === 'routes' ? routesNow() : null);
}
function setIview(k) {
  iview = k; ivT = 0;
  $('iv').innerHTML = IVIEWS.map(([k2, n]) => `<button class="ivb ${k2 === iview ? 'on' : ''}" data-iv="${k2}" type="button" title="${n}">${icon(k2)}</button>`).join('');
  ivApply(); ivLegend(); mmStatic = null;
}
$('iv').onclick = e => { const b = e.target.closest('[data-iv]'); if (b) { setIview(b.dataset.iv === iview ? 'none' : b.dataset.iv); audio.play('click'); } };

// ---------------------------------------------------------------- the minimap, bottom right: terrain, roads, the wall, the
// buildings in their info-view colours, the charter line and what the camera sees. Click or drag to move there
let mmStatic = null, mmKey = '', mmZoom = 2, mmDrag = false;
function mmTransform() {
  const N = sim.N, W = 200, z = mmZoom, cx = mmZoom > 1 ? view.target.x + N / 2 : N / 2, cz = mmZoom > 1 ? view.target.z + N / 2 : N / 2, k = W / N * z;
  return { k, X: x => (x - cx) * k + W / 2, Y: y => (y - cz) * k + W / 2, inv: (px, py) => [(px - W / 2) / k + cx, (py - W / 2) / k + cz] };
}
function drawMinimap() {
  const cv = $('minimap'); if (!cv || !sim) return;
  const g = cv.getContext('2d'), N = sim.N, W = 200;
  const key = `${sim.roadsV}|${sim.b.length}|${sim.b.reduce((a, b) => a + (b.done ? 1 : 0), 0)}|${iview}|${sim.stage}|${sim.ownV || 0}`;
  if (!mmStatic || key !== mmKey || (iview !== 'none' && ivT === 0)) {
    mmKey = key; mmStatic ||= Object.assign(document.createElement('canvas'), { width: N, height: N });
    const c = mmStatic.getContext('2d'), im = c.createImageData(N, N), bio = BIOMES[sim.site?.biome || 'steppe'];
    for (let i = 0; i < N * N; i++) {
      const t = sim.terr?.[i] || 0, col = sim.walls[i] === 1 ? [235, 228, 200] : sim.walls[i] === 2 ? [245, 213, 71] : sim.roads[i] ? (sim.roads[i] === 2 ? [150, 152, 150] : [120, 104, 82])
        : t === 1 ? bio.sea : t === 2 ? bio.high.map(v => v * 0.8) : t === 3 ? [150, 90, 200] : t === 4 ? [170, 96, 60] : bio.ground.map(v => v * (sim.inMask[i] ? 0.62 : 0.42));
      im.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    c.putImageData(im, 0, 0);
    for (const b of sim.b) { c.fillStyle = (iview === 'none' ? ROLE_COL[roleOf(b.type)] : ivColor(b, iview)) || '#888'; c.globalAlpha = b.done ? 1 : 0.5; c.fillRect(b.x, b.z, b.w, b.d); }
    c.globalAlpha = 1;
  }
  const T = mmTransform();
  g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#0b0d0c'; g.fillRect(0, 0, W, W); g.imageSmoothingEnabled = false;
  g.drawImage(mmStatic, T.X(0), T.Y(0), N * T.k, N * T.k);
  { const P = LAND.PARCEL; g.strokeStyle = 'rgba(245,213,71,0.85)'; g.lineWidth = 1; g.beginPath();   // the edge of the ground you hold
    for (let pz = 0; pz < LAND.GRID; pz++) for (let px = 0; px < LAND.GRID; px++) if (sim.owns(px, pz)) {
      const x0 = T.X(px * P), z0 = T.Y(pz * P), x1 = T.X(px * P + P), z1 = T.Y(pz * P + P);
      if (!sim.owns(px, pz - 1)) { g.moveTo(x0, z0); g.lineTo(x1, z0); } if (!sim.owns(px, pz + 1)) { g.moveTo(x0, z1); g.lineTo(x1, z1); }
      if (!sim.owns(px - 1, pz)) { g.moveTo(x0, z0); g.lineTo(x0, z1); } if (!sim.owns(px + 1, pz)) { g.moveTo(x1, z0); g.lineTo(x1, z1); }
    }
    g.stroke(); }
  for (const v of sim.veh) if (!v.away) { g.fillStyle = '#ffffff'; g.fillRect(T.X(v.x) - 1, T.Y(v.z) - 1, 2, 2); }
  const fp = view.footprint(); if (fp.length === 4) { g.strokeStyle = '#7fe9e0'; g.lineWidth = 1.4; g.beginPath(); fp.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](T.X(x), T.Y(z))); g.closePath(); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(127,233,224,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); g.stroke();
  // north, and where the camera is turned
  g.fillStyle = '#7fe9e0'; g.font = '600 11px ui-monospace, monospace'; g.textAlign = 'center'; g.fillText('N', W / 2, 13);
}
function mmGo(e) { const r = $('minimap').getBoundingClientRect(), [x, z] = mmTransform().inv((e.clientX - r.left) / r.width * 200, (e.clientY - r.top) / r.height * 200); view.lookAt(Math.max(0, Math.min(sim.N, x)), Math.max(0, Math.min(sim.N, z))); }
$('minimap').addEventListener('pointerdown', e => { mmDrag = true; $('minimap').setPointerCapture(e.pointerId); mmGo(e); e.stopPropagation(); });
$('minimap').addEventListener('pointermove', e => { if (mmDrag) mmGo(e); });
$('minimap').addEventListener('pointerup', () => { mmDrag = false; });
$('b-mmz').onclick = () => { mmZoom = mmZoom === 1 ? 2 : mmZoom === 2 ? 3 : 1; $('b-mmz').textContent = mmZoom + '×'; };

// ---------------------------------------------------------------- the task board: the next orders, then everything on the
// desk with the buttons to deal with it there and then
const MINI = { def: 'MINISTRY OF DEFENCE', pro: 'BUREAU OF EXPANSION', tru: 'MINISTRY OF TRUTH' };
function taskBoard() {
  const s = sim, items = [];
  const done = ORDERS.map(o => o[1](s)), todo = ORDERS.map((o, i) => i).filter(i => !done[i]);
  let h = '';
  if (todo.length) h += `<div class="tb-sec"><span>ORDERS · ${done.filter(Boolean).length} OF ${ORDERS.length} DONE</span></div>` + todo.slice(0, 3).map((i, n) => `<div class="tb-o ${n === 0 ? 'next' : ''}"><i>${i + 1}</i>${esc(ORDERS[i][0])}</div>`).join('');
  // calls from the Ministries
  for (const c of s.calls.filter(c => !c.acc)) { const q = CALLS[c.k], have = s.have(c.g);
    items.push(`<div class="tb-i call"><em class="c-${q.m}">${MINI[q.m]} · DUE DAY ${c.due}</em><b>${esc(q.title)}: ${fmt(c.n)} ${c.g.toUpperCase()}</b><span class="${have < c.n ? 'warn' : 'up'}">You have ${fmt(have)}</span><div class="tb-b"><button class="btn" data-call="${c.id}:1" type="button">SET ASIDE</button><button class="btn" data-call="${c.id}:0" type="button">DECLINE</button></div></div>`); }
  // requests
  for (const r of s.desk) { const q = REQUESTS[r.k];
    items.push(`<div class="tb-i"><em>${esc(q.from.toUpperCase())} · ${days(Math.max(0, r.due - s.t))} LEFT</em><b>${esc(q.title)}</b><span class="tb-txt">${esc(q.text.replaceAll('NAME', r.name))}</span><div class="tb-b">${q.opts.map((o, i) => `<button class="btn" data-dec="${r.id}:${i}" ${s.canDecide(r, i) ? '' : 'disabled'} type="button" title="${esc(fxText(o.fx))}">${esc(o.label)}</button>`).join('')}</div></div>`); }
  // offers from the other bases
  for (const o of s.market.offers) { const M = MARKET.goods[o.g], mk = (o.buys ? s.sellAt(o.g) : s.buyAt(o.g)) * 10, ok = s.canTakeOffer(o);
    items.push(`<div class="tb-i offer"><em>${esc(o.from.toUpperCase())} · UNTIL DAY ${o.until}</em><b>${o.buys ? 'WANTS' : 'SELLS'} ${o.n} ${M.short} at ${(o.p * 10).toFixed(1)} CR per 10</b><span>Market ${o.buys ? 'pays' : 'charges'} ${mk.toFixed(1)}. ${o.buys ? `You hold ${Math.floor(s.holding(o.g))}.` : ''}</span><div class="tb-b"><button class="btn" data-offer="${o.id}" ${ok.ok ? '' : 'disabled'} title="${esc(ok.why || '')}" type="button">${o.buys ? 'SELL' : 'BUY'} · ${o.buys ? '+' : '−'}${fmt(o.p * o.n)} CR</button></div></div>`); }
  // files to grade
  { const files = Math.min(s.reviewsLeft(), s.toReview().length); if (files) items.push(`<div class="tb-i"><em>ROSTER REVIEW</em><b>${files} trooper file${files > 1 ? 's' : ''} to grade</b><span>A fair grade pays 8 supplies and 3 credits.</span><div class="tb-b"><button class="btn" data-open="led" type="button">OPEN THE DESK</button></div></div>`); }
  // what needs fixing
  const warn = (t, why, open) => items.push(`<div class="tb-i alert"><b>${esc(t)}</b><span>${esc(why)}</span>${open ? `<div class="tb-b"><button class="btn" data-open="${open}" type="button">OPEN</button></div>` : ''}</div>`);
  const use = s.usage();
  for (const g of GKEYS) if (use[g] > 0 && s.amount(g) < use[g] * 0.5) warn(`${GOODS[g].name} running low`, `${Math.floor(s.amount(g))} left, ${Math.round(use[g])} used a day. More storage brings bigger deliveries; or buy on the market.`, 'eco:market');
  for (const m of MKEYS) if ((s.commit?.[m] || 0) && (s.commitLast?.[m] ?? 1) < 0.6) warn(`${COMMIT[m].ministry}: commitment short`, `Only ${Math.round(s.commitLast[m] * 100)}% paid yesterday. Trade for the goods, or lower the level.`, 'eco:commit');
  { const u = s.util; if (u && !s.graceOn()) { if (u.dark) warn('Buildings dark', `${u.dark} building${u.dark > 1 ? 's are' : ' is'} outside power coverage. Build a Substation near ${u.dark > 1 ? 'them' : 'it'} (UTILITIES).`); if (s.waterEff() < 0.75) warn('Short of water', `Bunks without water lose morale and fall sick. Wells, a purification unit, or a tower to carry it (UTILITIES).`); if (s.sewerEff() < 0.75) warn('Sewage backing up', 'Bunks without sewage lose morale and fall sick. A lagoon, or a treatment plant at Fort (UTILITIES).'); } }
  if (s.power.ratio < 1) warn('Short of power', `${s.power.made} made, ${s.power.used} wanted: buildings run slow. Build a Generator or a Solar Array.`);
  if (s.hunger > 0.15) warn('Votes going hungry', 'Not enough seats at meals, or not enough rations. A Mess Hall feeds 24.');
  if (s.troops.length > s.beds) warn('Not enough bunks', `${s.troops.length} votes, ${s.beds} bunks. Build a Barracks or a Prefab Hab.`);
  if (s.credits < -s.OD) warn('Past the overdraft', 'Wages go unpaid and franchises stop. Sell surplus on the market, or borrow.', 'eco:loans');
  if (s.has('lab') && !s.tech.cur && Object.keys(TECH).some(k => s.techState(k) === 'open')) warn('The Science Lab is idle', 'Pick a research project.', 'sci');
  if (s.nextStage() && s.stageCheck().every(c => c.ok)) warn('A bigger charter is yours for the asking', 'Apply on the Expansion tab.', 'pro');
  if (items.length) h += `<div class="tb-sec"><span>ON THE DESK · ${items.length}</span></div>` + items.join('');
  else if (!todo.length) h += `<p class="fine left">Nothing waiting. The base runs itself; the desk fills up during duty hours.</p>`;
  $('tb-n').textContent = items.length ? items.length : '';
  const el = $('tb-body'); if (el._html !== h && !(el.matches(':hover') && el._html && el._html.length === h.length)) el.innerHTML = el._html = h;
}
$('tb-body').onclick = e => {
  const s = sim;
  const c = e.target.closest('[data-call]'); if (c) { const [id, y] = c.dataset.call.split(':').map(Number); s.answer(id, !!y); audio.play('click'); taskBoard(); return; }
  const d = e.target.closest('[data-dec]'); if (d) { const [id, i] = d.dataset.dec.split(':').map(Number); s.decide(id, i); audio.play('click'); taskBoard(); return; }
  const o = e.target.closest('[data-offer]'); if (o) { const r = s.takeOffer(+o.dataset.offer); if (!r.ok) flash(r.why); else audio.play('place'); taskBoard(); return; }
  const op = e.target.closest('[data-open]'); if (op) { const [t, sub] = op.dataset.open.split(':'); if (sub) ecoTab = sub; openMins(t); }
};
$('or-x').onclick = () => { $('orders').classList.toggle('min'); $('or-x').textContent = $('orders').classList.contains('min') ? '+' : '–'; };

const MOR_NAMES = { base: 'baseline', comfort: 'comfort (mess, habs, vending, domes)', prop: 'propaganda', pride: 'medals and pride', food: 'hunger', noise: 'noise near the bunks', hazard: 'fuel or generators by the bunks', crowd: 'votes without bunks', latrine: 'latrine queues and filth', power: 'power cuts', grief: 'grief', worn: 'worn buildings', mood: 'desk decisions', unpaid: 'unpaid wages', water: 'water for the bunks', sewer: 'sewage from the bunks', smell: 'the lagoon smell', sick: 'sickness', commit: 'Truth commitment' };
// ---------------------------------------------------------------- readouts: a live breakdown on hover, and a click to where it's managed
const INFO_GO = { sup: () => { ecoTab = 'budget'; openMins('eco'); }, cr: () => { ecoTab = 'budget'; openMins('eco'); }, debt: () => { ecoTab = 'loans'; openMins('eco'); },
  votes: () => { group = 'zones'; buildOpen = true; buildBar(); setIview('zone'); }, morale: () => openMins('tru'), power: () => setIview('util'),
  rations: () => setIview('supply'), fuel: () => setIview('supply'), ammo: () => setIview('supply'), ready: () => openMins('def'), week: () => toggleMins('st') };
function infoHtml(k) {
  const s = sim, r = s.rates(), sg = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v)), row = (n, v, cls) => `<tr><td>${esc(n)}</td><td class="${cls ?? (v < 0 ? 'down' : 'up')}">${typeof v === 'number' ? sg(v) : v}</td></tr>`;
  const flows = o => Object.entries(o).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1]).map(([c, v]) => row(CAT[c] || c, Math.round(v))).join('');
  const t = (title, body, foot) => `<b>${title}</b><table class="tipt">${body}</table>${foot ? `<span class="fine">${foot}</span>` : ''}`;
  if (k === 'sup') return t(`SUPPLIES ${fmt(s.supplies)} · ${sg(Math.round(r.supNet))} A DAY`, flows(r.sup), 'Averaged over the last days. Click for the budget.');
  if (k === 'cr') return t(`CREDITS ${fmt(s.credits)} · ${sg(Math.round(r.crNet))} A DAY`, flows(r.cr), 'Click for the budget.');
  if (k === 'debt') return t(`OWED ${fmt(s.debt())}`, s.loans.map(l => row(LOANS[l.k].name, `${fmt(l.bal)} · −${Math.min(l.bal, LOANS[l.k].pay)}/wk`, '')).join('') + (s.credits < 0 ? row('Overdraft', fmt(-s.credits), 'down') : ''), 'Click for loans.');
  if (k === 'votes') { const home = s.troops.filter(t => t.state !== 'patrol').length, out = s.troops.length - home, by = {};
    for (const b of s.b) if (b.done && B[b.type].beds) by[B[b.type].name] = (by[B[b.type].name] || 0) + s.cap(b, 'beds');
    const d = s.dem; return t(`VOTES ${home} HOME · ${s.troops.length} IN ALL · ${s.beds} BUNKS`, Object.entries(by).map(([n, v]) => row(n, v + ' bunks', '')).join('') + row('Out on patrol', out, '') + row('Engineers (at their yard)', s.engineers(), '') + (d ? row('Bunks wanted', d.bunks ? `${d.bunks} more` : 'enough', d.bunks ? 'warn' : 'up') : ''), 'Recruits fill empty bunks each morning. Click for zoning.'); }
  if (k === 'morale') return t(`MORALE ${Math.round(s.morale)} → ${Math.round(s.moraleTarget)}`, Object.entries(s.mor).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([n, v]) => row(MOR_NAMES[n] || n, v)).join(''), 'Morale moves slowly toward the target. Click for the Ministry of Truth.');
  if (k === 'power') { const u = s.util; const src = {}; for (const b of s.b) if (b.done && !b.off && B[b.type].pw > 0) src[B[b.type].name] = (src[B[b.type].name] || 0) + 1;
    return t(`POWER ${s.power.made} MADE · ${s.power.used} USED`, Object.entries(src).map(([n, c]) => row(n, '×' + c, '')).join('') + (u ? row('Water a day', `${u.water.made} / ${u.water.use}`, u.water.ratio < 1 ? 'warn' : 'up') + row('Sewage a day', `${u.sewer.cap} / ${u.sewer.use}`, u.sewer.ratio < 1 ? 'warn' : 'up') + (u.dark ? row('Dark: outside coverage', u.dark, 'down') : '') : ''), 'Click for the Utilities view.'); }
  if (['rations', 'fuel', 'ammo'].includes(k)) { const use = s.usage()[k] || 0, have = s.amount(k);
    return t(`${GOODS[k].name.toUpperCase()} ${Math.floor(have)}`, row('In storage', Math.floor(s.stored(k)), '') + row('Room in storage', Math.floor(s.storage(k)), '') + row('Waiting on the pads', Math.floor(s.onPad(k)), '') + row('At the buildings using it', Math.floor(s.inUse(k)), '') + row('On trucks and forklifts', Math.floor(s.carried(k)), '') + row('Used a day', Math.round(use), '') + row('Lasts', use ? `${(have / use).toFixed(1)} days` : '—', use && have / use < 1.5 ? 'down' : 'up'), 'The 07:00 pelican refills storage. Click for the Supply view.'); }
  if (k === 'ready') { const ready = s.troops.filter(t => t.train >= 100 && t.state !== 'patrol').length, rec = s.troops.filter(t => t.train < 100), o = s.orders[0];
    return t(`READY ${ready} · IN TRAINING ${rec.length}`, row('Training places', s.b.filter(b => b.done && B[b.type].train).reduce((a, b) => a + s.cap(b, 'slots'), 0), '') + row('Average progress', rec.length ? Math.round(rec.reduce((a, t) => a + t.train, 0) / rec.length) + '%' : '—', '') + (o ? row('Deployment order', `${o.sent} of ${o.n}, by day ${o.due}`, o.sent < o.n && o.due - s.time.day <= 1 ? 'down' : '') : ''), 'Transports leave the pad at 16:00. Click for the Ministry of Defence.'); }
  if (k === 'week') return t(`WEEK ${s.week} · ${['1ST', '2ND', '3RD', '4TH'][s.rank]} OF 4`, row('Allocation at this rank', `~${fmt(C.ALLOC.base * C.ALLOC.mult[s.rank])} SUP`, '') + row('Inspection', s.inspected ? 'done this week' : 'later this week', '') + row('Charter', C.STAGES[s.stage || 0].name, ''), 'Click for the standings.');
  return '';
}
document.addEventListener('pointermove', e => { const el = e.target.closest?.('[data-info]'); if (!el || !playing) return; const h = infoHtml(el.dataset.info); if (h) { const r = el.getBoundingClientRect(); tip(h, r.left + r.width / 2, r.top < innerHeight / 2 ? r.bottom + 8 : r.top - 8, r.top >= innerHeight / 2); } });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-info]') && !e.relatedTarget?.closest?.('[data-info]') && flashT <= 0) hideTip(); });
document.addEventListener('click', e => { const el = e.target.closest?.('#status [data-info]'); if (el && INFO_GO[el.dataset.info]) { INFO_GO[el.dataset.info](); audio.play('click'); } });
// ---------------------------------------------------------------- layout: keep the floating panels out of each other's way.
// CSS places them; this trims and shifts them as they open, close and grow, every frame
function layout() {
  const q = id => document.getElementById(id), shown = e => e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none', H = innerHeight, W = innerWidth;
  const items = q('b-items'), groups = q('b-groups'), mmRow = document.querySelector('#mmwrap .mm-row'), iv = q('iv');
  if (!playing) return;
  if (W <= 760 || H <= 560) {   // phones: a popup takes the top of the screen and the task board steps aside for it
    const pop = q('deskpop'), orders = q('orders'), selp = q('selp'), up = shown(pop), card = shown(selp);
    const t0 = q('top').getBoundingClientRect().bottom + 6, floor = card ? selp.getBoundingClientRect().top : (shown(q('b-items')) ? q('b-items') : q('b-groups')).getBoundingClientRect().top;
    if (up) Object.assign(pop.style, { left: '4vw', right: 'auto', width: '92vw', transform: 'none', top: t0 + 'px', bottom: 'auto', maxHeight: Math.max(120, floor - t0 - 8) + 'px', overflowY: 'auto' });
    if (orders) orders.style.visibility = up || card ? 'hidden' : '';   // the task board steps aside for a popup or a building card
    return;
  }
  if (!mmRow || !mmRow.offsetParent) return;
  const mr = mmRow.getBoundingClientRect(), right = W - mr.left + 8;
  if (items) items.style.marginRight = right + 'px';                       // the build bar stops short of the minimap column
  if (iv) iv.style.maxWidth = (mr.width + 4) + 'px';                       // the view buttons wrap inside that column
  const barTop = shown(items) ? items.getBoundingClientRect().top : groups.getBoundingClientRect().top;
  const top0 = q('top').getBoundingClientRect().bottom + 6;
  // the left column: the task board stops above the build bar
  const orders = q('orders'), oShown = shown(orders); if (oShown) orders.style.maxHeight = Math.max(120, barTop - orders.getBoundingClientRect().top - 8) + 'px';
  // the right column: standings, the building card (folding the standings away when there's no room), the view buttons
  const stand = q('stand'), selp = q('selp'), ivTop = iv ? iv.getBoundingClientRect().top : mr.top;
  if (shown(selp)) {
    stand.style.display = '';
    const st = stand.getBoundingClientRect(), fold = ivTop - (st.bottom + 8) - 8 < 230, t = fold ? top0 : st.bottom + 8;
    stand.style.display = fold ? 'none' : '';
    selp.style.top = t + 'px'; selp.style.bottom = 'auto'; selp.style.maxHeight = Math.max(140, ivTop - t - 8) + 'px'; selp.style.overflowY = 'auto';
  } else stand.style.display = '';
  // the middle: a popup at the top, then the comms log or the notices under it; the info legend bottom-right, over the bar
  let L = oShown ? orders.getBoundingClientRect().right + 8 : 8, R = W - right;
  for (const e of [stand, selp]) if (shown(e)) R = Math.min(R, e.getBoundingClientRect().left - 8);
  const midW = Math.max(200, R - L);
  let y = top0;
  const pop = q('deskpop');
  if (shown(pop)) { Object.assign(pop.style, { left: L + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none', width: Math.min(340, midW) + 'px' }); y = pop.getBoundingClientRect().bottom + 8; }
  const lg = q('iv-legend'); let lgTop = barTop;
  if (lg && !lg.classList.contains('hidden')) lg.style.display = (barTop - y) < 230 && (shown(q('comms')) || shown(pop)) ? 'none' : '';   // no room: the legend steps aside for the popup and the log
  if (shown(lg)) {
    Object.assign(lg.style, { position: 'fixed', right: (W - R) + 'px', bottom: (H - barTop + 8) + 'px', overflowY: 'auto', width: Math.min(252, midW) + 'px' });
    const keep = shown(q('comms')) ? 160 : 90;   // the comms log keeps room for a few lines; the legend scrolls
    lg.style.maxHeight = Math.max(60, Math.min(lg.scrollHeight + 2, (barTop - 8) - y - keep)) + 'px';
    lgTop = lg.getBoundingClientRect().top;
  }
  const lgLeft = shown(lg) ? lg.getBoundingClientRect().left : W;
  for (const e of [q('comms'), q('notices')]) {
    if (!e) continue;
    Object.assign(e.style, { left: L + 'px', transform: 'none', width: Math.min(600, midW) + 'px', top: y + 'px' });
    const r = e.getBoundingClientRect(), below = r.right > lgLeft ? lgTop : barTop;   // stop above the legend if they share columns
    e.style.maxHeight = Math.max(80, below - y - 8) + 'px'; e.style.overflowY = e.id === 'comms' ? '' : 'hidden';
  }
}
function hud() {
  const s = sim;
  { const r = s.rates(), sg = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));
    $('r-sup').textContent = fmt(s.supplies); $('r-sup-d').textContent = `${sg(r.supNet)}/d`; $('r-sup-d').className = r.supNet < 0 ? 'down' : 'up';
    $('r-cr').textContent = fmt(s.credits); $('r-cr-d').textContent = `${sg(r.crNet)}/d`; $('r-cr-d').className = r.crNet < 0 ? 'down' : 'up';
    $('r-cr').parentElement.classList.toggle('bad', s.credits < 0);
    const debt = s.debt(), pay = s.loans.reduce((a, l) => a + Math.min(l.bal, LOANS[l.k].pay), 0);
    $('r-debt').textContent = fmt(debt); $('r-debt-d').textContent = pay ? `−${fmt(pay)}/wk` : debt ? 'overdraft' : 'clear'; $('r-debt').parentElement.classList.toggle('clear', debt <= 0); }
  $('r-pw').textContent = `${s.power.made}/${s.power.used}`; $('r-pw').parentElement.classList.toggle('bad', s.power.ratio < 1);
  const home = s.troops.filter(t => t.state !== 'patrol').length;
  $('r-trp').textContent = `${home}/${s.troops.length}/${s.beds}`; $('r-trp').parentElement.classList.toggle('bad', s.troops.length > s.beds);
  $('r-mrl').textContent = Math.round(s.morale) + (s.moraleTarget > s.morale + 1 ? '↑' : s.moraleTarget < s.morale - 1 ? '↓' : '');
  $('r-mrl').parentElement.classList.toggle('bad', s.morale < 40);
  const use = s.usage();
  for (const g of GKEYS) { const n = Math.floor(s.amount(g)), u = use[g], el = $('r-' + (g === 'rations' ? 'rat' : g)); el.textContent = n; el.parentElement.classList.toggle('bad', u > 0 && n < u * 0.5); }
  const readyN = s.troops.filter(t => t.train >= 100 && t.state !== 'patrol').length, rec = s.troops.filter(t => t.train < 100).length;
  $('r-ready').textContent = `${readyN}/${rec}`;
  { const el = document.getElementById('bi-crews'); if (el) { const cs = s.crews || [], busy = cs.filter(c => c.job != null && !c.wait).length, q = s.jobQueue().length; el.textContent = `CREWS ${busy}/${cs.length} AT WORK · ${q} JOB${q === 1 ? '' : 'S'} OPEN${!s.secure() ? ' · SWEEP UNDER WAY' : ''}`; el.classList.toggle('bad', q > cs.length + 2); el.title = `Engineer crews do every building job, one each. ${cs.some(c => c.wait) ? 'A crew is in training. ' : ''}More crews: an Engineer Yard (Logistics).`; } }
  $('w-title').textContent = `WEEK ${s.week}`; $('w-fill').style.width = (s.wt / C.WEEK * 100) + '%'; $('w-insp').style.left = (C.INSPECT_AT * 100) + '%';
  const left = Math.ceil((C.WEEK - s.wt) / C.DAY);
  $('w-rank').textContent = `${['1ST', '2ND', '3RD', '4TH'][s.rank]} OF 4 · ALLOCATION IN ${left} DAY${left === 1 ? '' : 'S'}`;
  const hh = Math.floor(s.time.hour), mm = Math.floor((s.time.hour - hh) * 60 / 10) * 10;
  $('ck-day').textContent = `DAY ${s.time.day}`; $('ck-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('ck-phase').textContent = { night: 'LIGHTS OUT', firstcall: 'FIRST CALL', reveille: 'REVEILLE', pt: 'PT', chow: 'CHOW', mess: 'MESS', work: 'DUTY', retreat: 'RETREAT', evening: 'FREE TIME' }[s.time.phase];
  // standings, with each Ministry's market index beside the bars
  const rows = s.table();
  const idx = MKEYS.map(m => { const I = s.market.idx[m], d = I.hist.at(-1) - (I.hist.at(-2) ?? I.hist.at(-1)); return `<span class="c-${m}">${{ def: 'DEF', pro: 'EXP', tru: 'TRU' }[m]} ${Math.round(I.v)}<small class="${d > 0 ? 'down' : d < 0 ? 'up' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : ''}</small></span>`; }).join(' ');
  $('stand').innerHTML = rows.map((r, i) => `<div class="srow ${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><canvas data-logo="${i}"></canvas><span class="nm">${esc(r.name)}</span><span class="tot">${s.total(r.stand)}</span>
    <div class="bars3" style="grid-column:2/5">${MKEYS.map(m => `<span><i style="width:${r.stand[m]}%;background:var(--${m})"></i></span>`).join('')}</div></div>`).join('')
    + `<div class="sfoot">Allocation for ${['1st', '2nd', '3rd', '4th'][s.rank]}: ~${fmt(C.ALLOC.base * C.ALLOC.mult[s.rank])} SUP<br><span title="Planet market indices: how hard every base is chasing each Ministry. High means its favour (and its goods) cost more.">INDEX ${idx}</span></div>`;
  rows.forEach((r, i) => { const c = $('stand').querySelector(`[data-logo="${i}"]`); c.outerHTML = `<img src="${logoImg(r.logo)}" width="22" height="22" alt="">`; });
  taskBoard();
  // zones stand out while painting, in the zones view, and while a build menu is open that has things growing in zones
  view.zoneStrong = isZone(tool) || iview === 'zone' || (buildOpen && GROUPS.find(g => g[0] === group)?.[3]?.some(k => GROWS.has(k)));
  if (group === 'zones' && buildOpen && (ivT2 = (ivT2 || 0) + 1) % 20 === 0) buildBar();
  // the build bar's affordability, and the selection
  for (const b of document.querySelectorAll('.bi')) { const k = b.dataset.b; if (!B[k]) continue; b.classList.toggle('poor', s.supplies < s.costOf(k, specOf(k))); b.classList.toggle('lock', !!s.locked(k)); }
  if (selId) selPanel();
  if (!$('mins').classList.contains('hidden')) renderMins();
  // info views follow the base as it changes
  if (iview !== 'none' && (ivT += 1) % 4 === 0) { ivApply(); if (iview === 'money') ivLegend(); }
  // the status bar's window buttons: what each one has waiting
  const o = s.orders[0], low = GKEYS.filter(g => use[g] > 0 && s.amount(g) < use[g] * 0.5);
  $('md-eco').textContent = s.market.offers.length ? `${s.market.offers.length} offer${s.market.offers.length > 1 ? 's' : ''}` : `SUP ${(s.price('sup') * 10).toFixed(1)}`;
  $('md-def').textContent = o ? `${o.sent}/${o.n} shipped` : `${s.patrols.length} patrols out`;
  $('md-pro').textContent = low.length ? `${low.map(g => GOODS[g].short).join(', ')} low` : s.hunger > 0.15 ? 'votes hungry' : 'supplies OK';
  $('md-tru').textContent = s.inspected ? 'inspected' : `inspects in ${days(C.WEEK * C.INSPECT_AT - s.wt)}`.replace(' days', 'd').replace(' hours', 'h');
  $('md-st').textContent = `${['1st', '2nd', '3rd', '4th'][s.rank]} of 4`;
  { const files = Math.min(s.reviewsLeft(), s.toReview().length), calls = s.calls.filter(c => !c.acc).length; $('md-led').textContent = calls ? `${calls} call${calls > 1 ? 's' : ''}` : s.desk.length ? `${s.desk.length} request${s.desk.length > 1 ? 's' : ''}` : files ? `${files} file${files > 1 ? 's' : ''}` : 'clear'; }
  $('md-sci').textContent = s.tech.cur ? `${Math.floor(s.tech.pts / TECH[s.tech.cur].hrs * 100)}%` : s.has('lab') ? 'idle' : `${s.tech.done.length}/${Object.keys(TECH).length}`;
  document.querySelector('[data-mt="sci"]').classList.toggle('alert', s.has('lab') && !s.tech.cur && Object.keys(TECH).some(k => s.techState(k) === 'open'));
  document.querySelector('[data-mt="def"]').classList.toggle('alert', !!o && o.due - s.time.day <= 1 && o.sent < o.n);
  document.querySelector('[data-mt="pro"]').classList.toggle('alert', low.length > 0 || s.hunger > 0.15);
  document.querySelector('#mdock [data-mt="led"]').classList.toggle('alert', s.calls.some(c => !c.acc) || s.desk.length > 0);
  document.querySelector('#mdock [data-mt="eco"]').classList.toggle('alert', MKEYS.some(m => (s.commit?.[m] || 0) && (s.commitLast?.[m] ?? 1) < 0.6));
  for (const b of document.querySelectorAll('.md')) b.classList.toggle('on', !$('mins').classList.contains('hidden') && b.dataset.mt === minTab);
}
let commsN = 0, unread = 0;
const noticeQ = [];
function renderComms(all) {
  if (!all && sim.log.length === commsN) return;
  const fresh = all ? [] : sim.log.slice(commsN); commsN = sim.log.length;
  $('c-list').innerHTML = sim.log.slice(-40).reverse().map(l => `<div class="cm"><em style="color:${CH[l.ch][1]}">${CH[l.ch][0]}</em>${esc(l.text)}</div>`).join('');
  // the newest lines also show for a moment under the top bar, and light the COMMS button while the log is shut
  if ($('comms').classList.contains('hidden')) { unread += fresh.length; $('cm-dot').textContent = unread ? unread : ''; }
  for (const l of fresh.slice(-2)) {
    const n = document.createElement('div'); n.className = 'notice'; n.innerHTML = `<em style="color:${CH[l.ch][1]}">${CH[l.ch][0]}</em>${esc(l.text)}`;
    $('notices').prepend(n); setTimeout(() => n.classList.add('out'), 7000); setTimeout(() => n.remove(), 7800);
    while ($('notices').children.length > 3) $('notices').lastChild.remove();
  }
}
function toggleComms(on = $('comms').classList.contains('hidden')) { $('comms').classList.toggle('hidden', !on); $('b-comms').classList.toggle('on', on); if (on) { unread = 0; $('cm-dot').textContent = ''; } }
$('b-comms').onclick = () => toggleComms(); $('cm-x').onclick = () => toggleComms(false);

// ---------------------------------------------------------------- the Ministries
let lastGrade = null;
const fxText = fx => Object.entries(fx).map(([k, v]) => ({ sup: `${v > 0 ? '+' : ''}${v} supplies`, cr: `${v > 0 ? '+' : ''}${v} credits`, mood: `morale ${v > 0 ? 'up' : 'down'}`, def: `Defence ${v > 0 ? '+' : ''}${v}`, pro: `Expansion ${v > 0 ? '+' : ''}${v}`, tru: `Truth ${v > 0 ? '+' : ''}${v}`, pride: 'pride up', clean: 'latrines cleaned', heal: 'wounded mend faster' })[k]).filter(Boolean).join(', ') || 'no effect';
// a new request slides in above the dock; it does not stop the game
let deskT = 0;
function callPop(id) {
  if (!$('mins').classList.contains('hidden')) return;   // a window is open: the task board has it
  const c = sim.calls.find(c => c.id === id); if (!c) return; const q = CALLS[c.k];
  $('deskpop').innerHTML = `<i>CALL FROM THE MINISTRY · DUE DAY ${c.due}</i><b>${esc(q.title)}: ${fmt(c.n)} ${c.g.toUpperCase()}</b><p>${esc(q.text)}</p><button class="btn" data-open-led="1" type="button">OPEN THE DESK</button><button class="btn" data-later="1" type="button">LATER</button>`;
  $('deskpop').classList.remove('hidden'); deskT = 16; audio.play('ping', q.m);
}
function deskPop(id) {
  const r = sim.desk.find(r => r.id === id); if (!r) return; const q = REQUESTS[r.k];
  $('deskpop').innerHTML = `<i>BASE LEDGER · ${q.from.toUpperCase()}</i><b>${esc(q.title)}</b><p>${esc(q.text.replaceAll('NAME', r.name))}</p><button class="btn" data-open-led="1" type="button">OPEN THE DESK</button><button class="btn" data-later="1" type="button">LATER</button>`;
  $('deskpop').classList.remove('hidden'); deskT = 14; audio.play('ping');
}
$('deskpop').onclick = e => { if (e.target.closest('[data-open-led]')) { minTab = 'led'; openMins(); } { const d = e.target.closest('[data-open-def]'); if (d) { repOpen = +d.dataset.openDef; minTab = 'def'; openMins(); } } if (e.target.closest('button')) $('deskpop').classList.add('hidden'); };
const vPick = {};   // vehicles picked for each special operation card
let repOpen = null;  // the after-action report open in the Defence tab
// the operations map: a window on the region map round the base, with the operations on offer and the squads out there
let opImg = null;
function drawOpMap(cv) {
  const s = sim, site = s.opSite(), g = cv.getContext('2d'), W = cv.width, H = cv.height, Z = 4;   // 4 canvas px per region px
  if (!opImg || opImg.key !== site.seed + site.biome) {
    const c = document.createElement('canvas'); c.width = RW; c.height = RH; const cg = c.getContext('2d'), im = cg.createImageData(RW, RH);
    im.data.set(regionImage(site.seed, site.biome)); cg.putImageData(im, 0, 0); opImg = { c, key: site.seed + site.biome };
  }
  const ox = site.u - W / Z / 2, oy = site.v - H / Z / 2, X = u => (u - ox) * Z, Y = v => (v - oy) * Z;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.fillStyle = '#111'; g.fillRect(0, 0, W, H); g.drawImage(opImg.c, ox, oy, W / Z, H / Z, 0, 0, W, H);
  g.fillStyle = 'rgba(8,12,14,0.25)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,230,0,0.18)'; g.lineWidth = 1;
  for (const km of [2.5, 5, 7.5, 10]) { g.beginPath(); g.arc(X(site.u), Y(site.v), km / (TPP * LAND.TILE_M / 1000) * Z, 0, Math.PI * 2); g.stroke(); }
  g.font = '600 13px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  s.offers.forEach((o, i) => { if (o.px == null) return; const x = X(o.px), y = Y(o.py);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = o.heavy ? '#ff6a5a' : '#ffe600'; g.fillRect(-8, -8, 16, 16); g.restore();
    g.fillStyle = '#111'; g.fillText(String(i + 1), x, y + 1); });
  for (const p of s.patrols) { if (p.px == null) continue; const f = p.brief > 0 ? 0 : p.t / p.dur, k = f < 0.5 ? f * 2 : (1 - f) * 2;
    const x = X(site.u + (p.px - site.u) * k), y = Y(site.v + (p.py - site.v) * k);
    g.setLineDash([4, 4]); g.strokeStyle = p.office ? 'rgba(89,255,138,0.35)' : 'rgba(110,220,255,0.6)'; g.beginPath(); g.moveTo(X(site.u), Y(site.v)); g.lineTo(X(p.px), Y(p.py)); g.stroke(); g.setLineDash([]);
    g.fillStyle = p.office ? '#59ff8a' : '#6edcff'; g.beginPath(); g.arc(x, y, p.office ? 4 : 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffe600'; g.strokeStyle = '#111'; g.lineWidth = 2; g.fillRect(X(site.u) - 7, Y(site.v) - 7, 14, 14); g.strokeRect(X(site.u) - 7, Y(site.v) - 7, 14, 14);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '600 11px ui-monospace, monospace'; g.textAlign = 'left'; g.fillText(s.faction.base.toUpperCase(), X(site.u) + 12, Y(site.v)); g.fillText('N ↑   rings every 2.5 km', 8, H - 10);
}
function reportPop(id) {
  if (!$('mins').classList.contains('hidden')) return;
  const r = sim.reports?.find(r => r.id === id); if (!r) return;
  $('deskpop').innerHTML = `<i>AFTER-ACTION REPORT · DAY ${r.day}</i><b>${esc(r.op)}: <span class="${r.win ? 'up' : 'down'}">${r.win ? 'SUCCESS' : 'FAILED'}</span></b><p>${r.lines.map(esc).join(' ')}</p><button class="btn" data-open-def="${r.id}" type="button">OPEN IN DEFENCE</button><button class="btn" data-later="1" type="button">FILE IT</button>`;
  $('deskpop').classList.remove('hidden'); deskT = 18;
}
// ---------------------------------------------------------------- the economy window: budget, market, commitments, loans, production
let ecoTab = 'budget', tradeQ = 50;
const CAT = { industry: 'Industry', calls: 'Calls answered', alloc: 'Weekly allocation', deploy: 'Troopers shipped', ops: 'Operations and patrols', roster: 'Roster review', sales: 'Franchise sales', ledger: 'Desk decisions',
  deliveries: 'Morning deliveries', upkeep: 'Upkeep', build: 'Building and roads', refund: 'Demolition refunds', repair: 'Repairs', research: 'Research', wages: 'Citizen wages', loans: 'Loans and repayments', interest: 'Overdraft fees',
  bought: 'Bought', sold: 'Sold', fees: 'Fees', salvage: 'Salvage and clearing', market: 'Market trades', trade: 'Trades with other bases', commit: 'Ministry commitments' };
// a 14-day line, for the tickers
function spark(hist, col, w = 96, h = 26) {
  const lo = Math.min(...hist), hi = Math.max(...hist), r = hi - lo || 1;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
}
const chg = hist => { const a = hist.at(-2) ?? hist.at(-1), b = hist.at(-1), d = (b - a) / (a || 1) * 100; return `<small class="${d > 0.5 ? 'up' : d < -0.5 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : ''}${Math.abs(d).toFixed(1)}%</small>`; };
// income against spending, per day, as two stacked bars and the list beside them
function budgetBlock(o, net, label) {
  const ks = Object.keys(o).filter(k => Math.abs(o[k]) >= 0.5), inc = ks.filter(k => o[k] > 0).sort((a, b) => o[b] - o[a]), out = ks.filter(k => o[k] < 0).sort((a, b) => o[a] - o[b]);
  const tin = inc.reduce((a, k) => a + o[k], 0), tout = -out.reduce((a, k) => a + o[k], 0), top = Math.max(tin, tout, 1);
  const G = ['#3fe07a', '#2fb565', '#7cf0a4', '#1f8a4c', '#a8f5c6'], R = ['#ff6a4d', '#d4482f', '#ff9a85', '#a83420', '#ffc0b3'];
  const bar = (list, cols) => `<div class="bb">${list.map((k, i) => `<i style="height:${Math.abs(o[k]) / top * 100}%;background:${cols[i % 5]}" title="${CAT[k] || k}: ${fmt(o[k])}"></i>`).join('')}</div>`;
  const row = (k, i, cols) => `<tr><td><i class="sw" style="background:${cols[i % 5]}"></i>${CAT[k] || k}</td><td class="${o[k] < 0 ? 'down' : 'up'}">${o[k] > 0 ? '+' : ''}${fmt(o[k])}</td></tr>`;
  return `<div class="budget"><div class="bchart">${bar(inc, G)}${bar(out, R)}</div><table class="acct"><tr><td><b>${label} IN</b></td><td class="up"><b>+${fmt(tin)}</b></td></tr>${inc.map((k, i) => row(k, i, G)).join('')}
    <tr><td><b>${label} OUT</b></td><td class="down"><b>−${fmt(tout)}</b></td></tr>${out.map((k, i) => row(k, i, R)).join('')}
    <tr class="net"><td><b>NET A DAY</b></td><td class="${net < 0 ? 'down' : 'up'}"><b>${net >= 0 ? '+' : ''}${fmt(net)}</b></td></tr></table></div>`;
}
function renderEco(s) {
  const tabs = [['budget', 'BUDGET'], ['market', 'MARKET'], ['commit', 'COMMITMENTS'], ['loans', 'LOANS'], ['prod', 'PRODUCTION']];
  let h = `<div class="subtabs">${tabs.map(([k, n]) => `<button class="btn ${ecoTab === k ? 'on' : ''}" data-et="${k}" type="button">${n}</button>`).join('')}</div>`;
  if (ecoTab === 'budget') {
    const r = s.rates();
    h += `<p class="fine left">Per day, averaged over the last ${r.days} day${r.days > 1 ? 's' : ''}. Weekly items (the allocation, loan payments) are spread across the week.</p>`;
    h += `<h3>SUPPLIES</h3>` + budgetBlock(r.sup, r.supNet, 'SUPPLIES') + `<h3>CREDITS</h3>` + budgetBlock(r.cr, r.crNet, 'CREDITS');
    h += `<p class="fine left"><b>More supplies:</b> rank higher for a bigger allocation (${fmt(s.lastAlloc || 0)} last week), ship trained troopers (${C.DEPLOY_PAY} each), win operations, grade files, mine ore, or buy on the market. <b>More credits:</b> ship troopers (${C.DEPLOY_CR} each, half again for grade A), run operations, open franchises, and sell surplus on the market. <b>Spending less:</b> the MONEY info view (by the minimap) colours every building by what it earns or costs.</p>`;
  } else if (ecoTab === 'market') {
    const M = s.market;
    h += `<p class="fine left">Every base on ${esc(s.planet)} trades through this market. Prices move each day with the three Ministry indices (how hard every base is chasing each Ministry's favour) and with what you buy and sell: the more you trade at once, the more the price moves against you. Buy at the higher price, sell at the lower.</p>`;
    h += `<div class="tickers">${MKEYS.map(m => { const I = M.idx[m]; return `<div class="tk"><b class="c-${m}">${{ def: 'DEFENCE', pro: 'EXPANSION', tru: 'TRUTH' }[m]} INDEX</b><span class="v">${Math.round(I.v)} ${chg(I.hist)}</span>${spark(I.hist, `var(--${m})`)}<span class="fine">${{ def: 'moves ammo and rations', pro: 'moves supplies and fuel', tru: 'moves the price of Truth favour' }[m]}</span></div>`; }).join('')}</div>`;
    if (M.shocks.length) h += `<p class="warn">${M.shocks.map(x => `Until day ${x.until}: ${esc(x.text)}`).join('<br>')}</p>`;
    h += `<div class="qsel"><span>TRADE IN LOTS OF</span>${[10, 50, 100, 250].map(q => `<button class="btn ${tradeQ === q ? 'on' : ''}" data-tq="${q}" type="button">${q}</button>`).join('')}</div>`;
    h += `<table class="mkt"><tr><th>GOOD</th><th>PRICE /10</th><th>14 DAYS</th><th>YOU HOLD</th><th>ROOM</th><th></th></tr>` + Object.keys(MARKET.goods).map(g => {
      const G = M.goods[g], d = MARKET.goods[g], buy = s.canTrade(g, tradeQ, true), sell = s.canTrade(g, tradeQ, false), room = s.room(g);
      return `<tr><td><b>${d.name}</b></td><td><span class="up" title="you sell at">${(s.sellAt(g) * 10).toFixed(1)}</span> / <span class="down" title="you buy at">${(s.buyAt(g) * 10).toFixed(1)}</span> ${chg(G.hist)}</td><td>${spark(G.hist, '#7fe9e0', 80, 22)}</td><td>${fmt(s.holding(g))}</td><td>${room === Infinity ? '—' : fmt(room)}</td>
        <td class="tbtn"><button class="btn" data-trade="${g}:1" ${buy.ok ? '' : 'disabled'} title="${esc(buy.ok ? `Buy ${tradeQ} for ${fmt(buy.cr)} CR` : buy.why)}" type="button">BUY −${fmt(s.quote(g, tradeQ, true))}</button><button class="btn" data-trade="${g}:0" ${sell.ok ? '' : 'disabled'} title="${esc(sell.ok ? `Sell ${tradeQ} for ${fmt(sell.cr)} CR` : sell.why)}" type="button">SELL +${fmt(s.quote(g, tradeQ, false))}</button></td></tr>`;
    }).join('') + `</table>`;
    h += `<h3>OFFERS FROM OTHER BASES</h3>`;
    if (!M.offers.length) h += `<p class="fine left">None right now. Rival bases post offers at 10:00 and 15:00: what they are short of, they pay over the market for; what they have too much of, they sell under it. Offers last two days.</p>`;
    for (const o of M.offers) { const d = MARKET.goods[o.g], ok = s.canTakeOffer(o), mk = (o.buys ? s.sellAt(o.g) : s.buyAt(o.g)) * 10;
      h += `<div class="card2"><div class="l"><b><img src="${logoImg(o.logo)}" width="18" height="18" alt=""> ${esc(o.from)} ${o.buys ? 'WANTS' : 'SELLS'} ${o.n} ${d.name.toUpperCase()}</b><span>${(o.p * 10).toFixed(1)} CR per 10 (the market ${o.buys ? 'pays' : 'charges'} ${mk.toFixed(1)}) · ${fmt(o.p * o.n)} CR in all · until day ${o.until}${ok.ok ? '' : ` · <span class="warn">${esc(ok.why)}</span>`}</span></div><button class="btn" data-offer="${o.id}" ${ok.ok ? '' : 'disabled'} type="button">${o.buys ? 'SELL TO THEM' : 'BUY FROM THEM'}</button></div>`; }
  } else if (ecoTab === 'commit') {
    h += `<p class="fine left">What the base gives each Ministry every day, paid at midnight from your stores. Each level buys standing at today's index: when a Ministry's index is low its favour is cheap; when every base is chasing it, dear. No base can afford ALL OUT on everything: pick what to chase, and trade for what you are short of.</p>`;
    for (const m of MKEYS) {
      const lvl = s.commit[m] || 0, I = s.market.idx[m], cost = s.commitCost(m, lvl), gain = s.commitGain(m, lvl), paid = s.commitLast[m] ?? 1;
      const cval = Object.entries(cost).reduce((a, [g, n]) => a + (g === 'cr' ? n : n * s.price(g)), 0);
      h += `<div class="cmt"><div class="cmt-h"><div class="big c-${m}">${Math.round(s.stand[m])}</div><div><b class="c-${m}">${COMMIT[m].ministry.toUpperCase()}</b><span>Index ${Math.round(I.v)} ${chg(I.hist)} · ${esc(COMMIT[m].perk)}</span></div></div>
        <div class="lv">${COMMIT.levels.map((n, i) => `<button class="btn ${i === lvl ? 'on' : ''}" data-commit="${m}:${i}" type="button">${n}</button>`).join('')}</div>
        <div class="kv"><span>COSTS A DAY</span><b>${lvl ? Object.entries(cost).map(([g, n]) => `${fmt(n)} ${g === 'cr' ? 'CR' : g === 'sup' ? 'SUP' : MARKET.goods[g].short}`).join(' + ') + ` <span class="fine">(about ${fmt(cval)} CR at market)</span>` : 'nothing'}</b></div>
        <div class="kv"><span>BUYS A DAY</span><b class="c-${m}">${lvl ? `+${gain.toFixed(1)} standing, less near the top` : 'no standing; it drifts back toward ' + C.STAND.rest}</b></div>
        ${lvl && paid < 1 ? `<p class="${paid < 0.6 ? 'down' : 'warn'}">Yesterday only ${Math.round(paid * 100)}% was paid: short of ${Object.keys(cost).filter(g => (g === 'cr' ? s.credits + s.OD : s.holding(g)) < cost[g]).map(g => CAT[g] || (g === 'cr' ? 'credits' : g === 'sup' ? 'supplies' : MARKET.goods[g].name.toLowerCase())).join(', ') || 'stock'}.</p>` : ''}</div>`;
    }
    const tot = {}; for (const m of MKEYS) for (const [g, n] of Object.entries(s.commitCost(m))) tot[g] = (tot[g] || 0) + n;
    h += `<div class="kv"><span>ALL COMMITMENTS, A DAY</span><b>${Object.entries(tot).filter(([, n]) => n).map(([g, n]) => `${fmt(n)} ${g === 'cr' ? 'CR' : g === 'sup' ? 'SUP' : MARKET.goods[g].short}`).join(' + ') || 'nothing'}</b></div>`;
  } else if (ecoTab === 'loans') {
    const debt = s.debt();
    h += `<h3>DEBT</h3><div class="kv"><span>OWED TO THE BUREAU</span><b class="${debt > 0 ? 'warn' : 'up'}">${fmt(debt)} CR</b></div>`;
    s.loans.forEach((l, i) => { const L = LOANS[l.k];
      h += `<div class="card2"><div class="l"><b>${L.name.toUpperCase()}</b><span>${fmt(l.bal)} CR owed · ${Math.round((l.k === 'charter' ? s.D.rate : L.rate) * 1000) / 10}% a week · at least ${L.pay} CR taken each week${l.int ? ` · ${fmt(l.int)} CR interest so far` : ''}</span></div><div style="text-align:right"><button class="btn" data-repay="${i}:100" ${s.credits >= 1 ? '' : 'disabled'} type="button">REPAY 100</button> <button class="btn" data-repay="${i}:${Math.ceil(l.bal)}" ${s.credits >= l.bal ? '' : 'disabled'} type="button">REPAY ALL</button></div></div>`; });
    if (s.credits < 0) h += `<p class="${s.credits < -s.OD ? 'down' : 'warn'}">Overdrawn by ${fmt(-s.credits)} CR: a ${Math.round(C.ODFEE * 100)}% fee each week. Past ${fmt(s.OD)} CR the staff go unpaid, franchises stop trading and morale falls.</p>`;
    h += `<p class="fine left">You landed on the Founding Charter: the Bureau paid for your start and takes its money back a little every week. Credits may run ${fmt(s.OD)} CR into overdraft. Repaying a loan in full earns Expansion standing.</p>`;
    for (const k of ['dev', 'quick']) { const L = LOANS[k]; h += `<div class="card2"><div class="l"><b>${L.name.toUpperCase()}: ${fmt(L.amt)} CR</b><span>${esc(L.desc)} ${Math.round(L.rate * 1000) / 10}% a week, at least ${L.pay} CR a week.</span></div><button class="btn" data-borrow="${k}" ${s.canBorrow(k) ? '' : 'disabled'} type="button">BORROW</button></div>`; }
  } else if (ecoTab === 'prod') {
    const by = {}; for (const b of s.b) { if (B[b.type].fixed && b.type !== 'hq') continue; const k = b.type; by[k] ||= { n: 0, v: 0, up: 0 }; by[k].n++; by[k].v += moneyOf(b); by[k].up += (B[k].up || 0) / 7; }
    const list = Object.entries(by).sort((a, b) => b[1].v - a[1].v);
    h += `<p class="fine left">Each kind of building on the base and what it earns or costs a day, counted in supplies (a credit at the market price of supplies). Training and housing show as costs: what they bring in arrives through the pad, as troopers shipped.</p>`;
    h += `<table class="acct"><tr><td><b>BUILDING</b></td><td><b>HOW MANY</b></td><td><b>UPKEEP /D</b></td><td><b>NET /D</b></td></tr>` + list.map(([k, o]) => `<tr><td><i class="sw" style="background:${ROLE_COL[roleOf(k)]}"></i>${B[k].name}</td><td>${o.n}</td><td>${fmt(o.up)}</td><td class="${o.v < 0 ? 'down' : 'up'}">${o.v >= 0 ? '+' : ''}${fmt(o.v)}</td></tr>`).join('') + `</table>`;
    const u = s.usage();
    h += `<h3>GOODS</h3><table class="st"><tr><th></th><th>GOOD</th><th>IN STORE</th><th>ON THE PAD</th><th>AT USE</th><th>USED A DAY</th></tr>`
      + GKEYS.map(g => `<tr><td></td><td>${GOODS[g].name}</td><td>${Math.floor(s.stored(g))} / ${s.storage(g)}</td><td>${Math.floor(s.onPad(g))}</td><td>${Math.floor(s.inUse(g))}</td><td>${Math.round(u[g])}</td></tr>`).join('') + `</table>`;
  }
  return h;
}
function renderMins(force) {
  const s = sim;
  const tabs = [['eco', 'ECONOMY'], ['led', 'DESK'], ['def', 'DEFENCE'], ['pro', 'EXPANSION'], ['tru', 'TRUTH'], ['sci', 'SCIENCE'], ['st', 'STANDINGS']].map(([k, n]) => `<button class="btn ${minTab === k ? 'on' : ''}" data-t="${k}" type="button">${n}</button>`).join('');
  if ($('mi-tabs')._html !== tabs) $('mi-tabs').innerHTML = $('mi-tabs')._html = tabs;
  let h = '';
  const head = m => `<div class="mi-head"><div class="big c-${m}">${Math.round(s.stand[m])}</div><div><b class="c-${m}">${MIN[m].name.toUpperCase()}</b><p>${MIN[m].wants} Standing drifts back toward ${C.STAND.rest} every week.</p></div></div>`;
  if (minTab === 'eco') h += renderEco(s);
  else if (minTab === 'def') {
    const home = s.troops.filter(t => t.state !== 'patrol'), ready = home.filter(t => t.train >= 100).length, rec = s.troops.filter(t => t.train < 100), training = rec.filter(t => t.at).length;
    h += head('def') + `<h3>DEPLOYMENT ORDERS</h3>`;
    if (!s.orders.length) h += `<p>No orders open. The next comes with the week.</p>`;
    for (const o of s.orders) h += `<div class="card2"><div class="l"><b>${o.n} TRAINED TROOPERS TO THE FRONT</b><span>${o.sent} shipped · due day ${o.due} (${Math.max(0, o.due - s.time.day)} days left) · +${C.DEPLOY_PAY} SUP each, +${o.def} DEF when complete</span><div class="prog"><i style="width:${o.sent / o.n * 100}%"></i></div></div></div>`;
    h += `<p>Transports leave from the landing pad at ${C.DEPLOY_AT}:00 every day, ${s.padSeats() * s.b.filter(b => b.done && B[b.type].pad).length} seats a day across your pads. They take trained troopers who aren't crewing a building; the Patrol Office keeps its own squads back.</p>`;
    { const w = s.troops.filter(t => t.hurt > 0).length; if (w || s.has('medbay')) h += `<div class="kv"><span>WOUNDED</span><b class="${w > s.wardBeds ? 'warn' : ''}">${w}${s.wardBeds ? ` · ${s.wardBeds} ward beds` : ' · no Medical Bay'}</b></div>`; }
    h += `<h3>TRAINING</h3><div class="kv"><span>READY TO SHIP</span><b>${ready}</b></div><div class="kv"><span>RECRUITS</span><b>${rec.length}</b></div><div class="kv"><span>IN TRAINING RIGHT NOW</span><b>${training}</b></div>`;
    const places = s.b.filter(b => b.done && B[b.type].slots);
    h += places.length ? places.map(b => `<div class="kv"><span>${B[b.type].name}</span><b>${s.troops.filter(t => t.at === b.id).length}/${B[b.type].slots} · ${TRAIN[B[b.type].train]} per hour</b></div>`).join('') : `<p class="warn">Nowhere to train. Build a Firing Range, an Obstacle Course or a Parade Ground.</p>`;
    h += `<p class="fine left">Recruits train from 08:00 to 20:00, except at lunch. 100 points makes a trooper. Recruits arrive with the morning supply pelican and fill empty bunks: more housing, more recruits.</p>`;
    const offices = s.b.filter(b => b.type === 'patrol' && b.done);
    { const f = s.fort || s.fortify(), pc = v => Math.round(v * 100) + '%';
      h += `<h3>BASE DEFENCE</h3><div class="kv"><span>DEFENSIBILITY</span><b class="${f.score >= 60 ? 'up' : f.score < 40 ? 'down' : 'warn'}">${f.score} / 100</b></div>`
        + `<div class="kv"><span>WALL WATCHED</span><b>${pc(f.cover)}</b></div><div class="kv"><span>WALL ARMED</span><b>${pc(f.armed || 0)}</b></div><div class="kv"><span>GATES MANNED</span><b>${f.manned} of ${f.gates}</b></div><div class="kv"><span>HQ AND FUEL FROM THE WALL</span><b>${pc(f.depth)}</b></div>`
        + `<p class="fine left">${f.closed ? '' : '<span class="down">No closed wall yet. </span>'}Reviewed every week: above 45 earns Defence standing, below loses it. Lookout Towers watch the wall, every gate takes one trained trooper, and more than two gates is asking for trouble.</p>`; }
    h += `<h3>STANDING PATROLS</h3>` + (offices.length ? offices.map(b => `<div class="kv"><span>Patrol Office</span><b>${s.patrols.filter(p => p.office === b.id).length} of ${b.squads} squads out · ammo ${Math.floor(b.stock.ammo)}</b></div>`).join('') : `<p>Build a Patrol Office and it sends squads of three trained troopers out every morning at ${C.PATROL_AT}:00, on its own.</p>`);
    h += `<h3>SPECIAL OPERATIONS (OPTIONAL)</h3><canvas id="opmap" width="560" height="240" title="Operations map: the base, the operations on offer and the squads in the field"></canvas>`;
    for (const [oi, o] of s.offers.entries()) {
      const pick = (vPick[o.id] || []).filter(k => s.armourFree(k)), ch = s.chance({ ...o, veh: pick }), ok = home.length >= o.size;
      const vb = ['frv', 'tank'].filter(k => s.veh.some(v => v.kind === k)).map(k => { const free = s.armourFree(k), on = pick.includes(k);
        return `<button class="btn ${on ? 'on' : ''}" data-veh="${o.id}:${k}" ${free ? '' : 'disabled'} type="button" title="${VEHICLES[k].desc} Burns ${VEHICLES[k].fuel} fuel.">${on ? '✓ ' : '+ '}${VEHICLES[k].name.toUpperCase()}</button>`; }).join('');
      const where = o.place ? `<span class="opwhere"><i class="opn">${oi + 1}</i> The ${esc(o.place)}, ${o.km} km ${o.dir}${o.wants ? ` · <b class="${pick.includes(o.wants) ? 'up' : o.needs ? 'down' : 'warn'}">${o.needs ? 'NEEDS' : 'CALLS FOR'} ${o.wants === 'frv' ? 'AN FRV' : 'A TANK'}</b>` : ''}</span>` : '';
      h += `<div class="card2"><div class="l"><b>${esc(o.op)}${o.heavy ? ' <span class="warn">· HEAVY</span>' : ''}</b>${where}<span>${o.kind} · difficulty ${'◆'.repeat(o.diff)}${'◇'.repeat(5 - o.diff)} · ${o.size} troopers · ${days(o.dur * C.PATROL)} · reward +${o.def} DEF, +${o.sup} SUP</span>${vb ? `<div class="vpick">${vb}</div>` : ''}</div>
        <div style="text-align:right"><b class="${ch >= 0.65 ? 'up' : ch < 0.45 ? 'down' : 'warn'}">${ok ? Math.round(ch * 100) + '%' : '—'}</b><br><button class="btn" data-send="${o.id}" ${ok ? '' : 'disabled'} type="button">SEND</button></div></div>`;
    }
    if (!s.has('vbay')) h += `<p class="fine left">Research Fast Recon Vehicles and build a Vehicle Bay, and operations can take an FRV, or later a tank, along.</p>`;
    if (s.patrols.length) { h += `<h3>IN THE FIELD</h3>`; for (const p of s.patrols) h += `<div class="card2"><div class="l"><b>${esc(p.op)}</b><span>${p.brief > 0 ? 'BRIEFING · ' : ''}${p.kind} · ${p.members.length} troopers${p.veh?.length ? ' · ' + p.veh.map(k => VEHICLES[k].name).join(', ') : ''} · odds ${Math.round(p.chance * 100)}%</span><div class="prog"><i style="width:${p.t / p.dur * 100}%"></i></div></div></div>`; }
    if (s.reports?.length) {
      h += `<h3>AFTER-ACTION REPORTS</h3>`;
      for (const r of s.reports.slice(-8).reverse()) {
        const open = repOpen === r.id;
        h += `<div class="card2 rep ${r.win ? '' : 'lost'}" data-rep="${r.id}"><div class="l"><b>${esc(r.op)} <span class="${r.win ? 'up' : 'down'}">${r.win ? 'SUCCESS' : 'FAILED'}</span></b><span>Day ${r.day} · ${esc(r.kind)}${r.place ? ` · the ${esc(r.place)}, ${r.km} km ${r.dir}` : ''} · ${r.n} troopers under ${esc(r.leader || '—')}${r.veh.length ? ' · ' + r.veh.join(', ') : ''} · ${r.def >= 0 ? '+' : ''}${r.def} DEF${r.sup ? `, +${r.sup} SUP` : ''}</span>${open ? `<p class="rep-t">${r.lines.map(esc).join(' ')}</p>` : ''}</div><div style="text-align:right"><button class="btn" type="button">${open ? 'CLOSE' : 'READ'}</button></div></div>`;
      }
    }
    if (s.honours.length) h += `<h3>MEDALS OF VALOUR</h3><div class="list2">${s.honours.slice(-12).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, week ${x.week}</div>`).join('')}</div>`;
    if (s.fallen.length) h += `<h3>THE FALLEN</h3><div class="list2">${s.fallen.slice(-16).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, ${esc(x.op)}</div>`).join('')}</div>`;
  } else if (minTab === 'pro') {
    { const st = C.STAGES[s.stage || 0], nx = s.nextStage(), ck = s.stageCheck();
      h += `<h3>CHARTER</h3><div class="kv"><span>${esc(s.faction.base.toUpperCase())} IS A</span><b>${st.name.toUpperCase()} · ${s.held()} OF ${Math.min(441, st.parcels)} PARCELS HELD</b></div>`;
      if (nx) h += `<p class="fine left">The Bureau grants a bigger charter when the base has earned it: more land (up to ${nx.parcels >= 441 ? 'all 441' : nx.parcels} parcels, bought with ROADS → LAND), a bigger allocation and new buildings.</p>` + ck.map(c => `<div class="kv"><span>${c.ok ? '✓' : '·'} ${esc(c.text)}</span><b class="${c.ok ? 'up' : 'warn'}">${c.ok ? 'MET' : 'NOT YET'}</b></div>`).join('')
        + `<button class="btn ${ck.every(c => c.ok) ? 'primary' : ''}" data-promote="1" ${ck.every(c => c.ok) ? '' : 'disabled'} type="button">APPLY FOR A ${nx.name.toUpperCase()} CHARTER</button>`;
      else h += `<p class="fine left">The largest charter the Bureau grants. Any parcel on the section can be bought, so long as it touches yours.</p>`; }
    const u = s.usage(), home = s.troops.filter(t => t.state !== 'patrol').length;
    h += head('pro') + `<h3>SUPPLY LINES</h3><table class="st"><tr><th></th><th>GOOD</th><th>IN STORE</th><th>ON THE PAD</th><th>AT USE</th><th>USED A DAY</th><th>COST A DAY</th></tr>`
      + GKEYS.map(g => `<tr><td></td><td>${GOODS[g].name}</td><td>${Math.floor(s.stored(g))} / ${s.storage(g)}</td><td>${Math.floor(s.onPad(g))}</td><td>${Math.floor(s.inUse(g))}</td><td>${Math.round(u[g])}</td><td>${Math.round(u[g] * GOODS[g].cost)}</td></tr>`).join('') + `</table>`;
    if (s.bill) h += `<p>Last supply pelican, day ${s.bill.day}: ${GKEYS.map(g => `${s.bill.order[g]} ${GOODS[g].name.toLowerCase()}`).join(', ')}. Billed ${s.bill.cost} supplies. It lands at 0${C.SUPPLY_AT}:00 and brings what fills your storage, up to ${s.padLoad()} per pad.</p>`;
    const lifts = s.veh.filter(v => v.kind === 'lift'), trucks = s.veh.filter(v => v.kind === 'truck');
    h += `<h3>VEHICLES</h3><div class="kv"><span>FORKLIFTS</span><b>${lifts.filter(v => v.job).length} of ${lifts.length} on a run</b></div><div class="kv"><span>SUPPLY TRUCKS</span><b>${trucks.filter(v => v.job).length} of ${trucks.length} on a run</b></div>`;
    h += `<p class="fine left">Vehicles carry goods from the pad to storage, and from storage to the buildings that use them, without being told. They go 1.6 times as fast on dirt road and 2.4 times on paved. A Motor Pool adds two trucks.</p>`;
    h += `<h3>FOOD</h3><div class="kv"><span>SEATS AT MEALS</span><b class="${s.seats < home ? 'down' : ''}">${s.seats} for ${home} votes</b></div><div class="kv"><span>HUNGER</span><b class="${s.hunger > 0.15 ? 'down' : ''}">${Math.round(s.hunger * 100)}%</b></div>`;
    if (s.audit) { const A = s.audit; h += `<h3>LAST AUDIT, WEEK ${A.week}: ${A.score}/100 (${A.delta >= 0 ? '+' : ''}${A.delta})</h3><div class="kv"><span>SUPPLY LINES</span><b>${A.lines}</b></div><div class="kv"><span>VOTES FED</span><b>${A.food}</b></div><div class="kv"><span>HOUSING</span><b>${A.housing}</b></div><div class="kv"><span>GROWTH (${A.target} expected)</span><b>${A.growth}</b></div><ul class="notes">${A.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`; }
    h += `<p class="fine left">The audit at the end of each week scores supply lines that never run dry, votes fed, a bunk for everyone, and a base that keeps growing.</p>`;
  } else if (minTab === 'led') {
    h += `<p>The Commander's desk. Everything here also shows on the task board on the left. Requests wait two days, then file themselves and people notice.</p>`;
    h += `<h3>CALLS FROM THE MINISTRIES</h3>`;
    if (!s.calls.length) h += `<p class="fine left">No calls open. The Ministries ask for goods, supplies or credits every few days. Set them aside and they go on the day; ignore them and standing and morale suffer.</p>`;
    for (const c of s.calls) { const q = CALLS[c.k], have = s.have(c.g), short = have < c.n;
      h += `<div class="req"><i>${{ def: 'MINISTRY OF DEFENCE', pro: 'MINISTRY OF EXPANSION', tru: 'MINISTRY OF TRUTH' }[q.m]} · DUE DAY ${c.due} (${days(Math.max(0, (c.due - s.time.day) * C.DAY))})</i><b>${esc(q.title)}: ${fmt(c.n)} ${c.g.toUpperCase()}</b><p>${esc(q.text)}</p>`
        + `<p class="${short ? 'warn' : 'up'}">You have ${fmt(have)}.${short ? ' Not enough yet.' : ''}</p>`
        + (c.acc ? `<p class="up">SET ASIDE: it goes on day ${c.due} if you still have it then.</p>` : `<button class="btn" data-call="${c.id}:1" type="button">SET IT ASIDE</button><button class="btn" data-call="${c.id}:0" type="button">DECLINE (−2)</button>`) + `</div>`; }
    h += `<h3>REQUESTS</h3>`;
    if (!s.desk.length) h += `<p class="fine left">Nothing waiting. Requests arrive during duty hours.</p>`;
    for (const r of s.desk) { const q = REQUESTS[r.k];
      h += `<div class="req"><i>${q.from.toUpperCase()} · ${days(Math.max(0, r.due - s.t))} LEFT</i><b>${esc(q.title)}</b><p>${esc(q.text.replaceAll('NAME', r.name))}</p>`
        + q.opts.map((o, i) => `<button class="btn" data-dec="${r.id}:${i}" ${s.canDecide(r, i) ? '' : 'disabled'} type="button" title="${esc(fxText(o.fx))}">${esc(o.label)}</button>`).join('') + `</div>`; }
    const files = s.toReview(), left = s.reviewsLeft();
    h += `<h3>ROSTER REVIEW</h3><p class="fine left">Read the file, give the grade the trooper has earned. A fair grade pays 8 supplies and 3 credits; a wild one is audited. A: outstanding on the range, the course and in conduct. B: solid. C: gets by. D: back to training. Missions and medals count for a lot. The Ministry takes ${C.REVIEWS_DAY} files a day: ${left} left today.</p>`;
    if (lastGrade) h += `<p class="${lastGrade.off ? 'warn' : 'up'}">${esc(lastGrade.text)}</p>`;
    if (!files.length) h += `<p class="fine left">No files waiting. A file comes up when a trooper finishes training, and again every ${C.REVIEW} days.</p>`;
    for (const t of files.slice(0, left > 0 ? 3 : 0)) { const f = fileOf(t);
      h += `<div class="file"><div><b>${rankOf(t.missions)} ${esc(t.name)}</b>${t.grade ? ` <span>last graded ${t.grade}</span>` : ''}<br><span>RANGE</span> ${f.range} · <span>COURSE</span> ${f.course} · <span>MISSIONS</span> ${f.missions}${f.medals ? ` · <span>MEDALS</span> ${f.medals}` : ''}<br><span>CONDUCT</span> ${esc(f.conduct)}<br><span>NEXT OF KIN</span> <i>${esc(f.kin)}</i></div>`
        + `<div class="g">${GRADES.map(g => `<button class="btn" data-grade="${t.id}:${g}" type="button">${g}</button>`).join('')}</div></div>`; }
    h += `<p class="fine left">Money, loans and the market are under ECONOMY.</p>`;
  } else if (minTab === 'sci') {
    const labs = s.b.filter(b => b.type === 'lab' && b.done), rate = s.labRate();
    h += `<p>A Science Lab researches one upgrade at a time while it is staffed and powered. More labs, faster research. Research is paid for up front.</p>`;
    if (!s.has('comms')) h += `<p class="warn">Build a Comms Tower, then a Science Lab, to start research.</p>`;
    else if (!labs.length) h += `<p class="warn">Build a Science Lab to start research.</p>`;
    else h += `<div class="kv"><span>LABS</span><b>${labs.length} · ${rate.toFixed(1)} lab hours per hour</b></div>`;
    if (s.tech.cur) { const k = s.tech.cur; h += `<div class="card2"><div class="l"><b>RESEARCHING: ${TECH[k].name.toUpperCase()}</b><span>${Math.floor(s.tech.pts)} of ${TECH[k].hrs} lab hours${rate > 0 ? ` · about ${days((TECH[k].hrs - s.tech.pts) / rate * C.DAY / 24)} left` : ' · stalled: the lab needs crew and power'}</span><div class="prog"><i style="width:${s.tech.pts / TECH[k].hrs * 100}%"></i></div></div></div>`; }
    h += `<div class="tech">` + [1, 2, 3].map(tier => `<div class="col"><i>TIER ${tier}</i>` + Object.entries(TECH).filter(([, t]) => t.tier === tier).map(([k, t]) => {
      const st = s.techState(k), can = st === 'open' && labs.length && !s.tech.cur && s.credits >= t.cost;
      return `<div class="tn ${st}"><b>${t.name}</b><span>${t.desc}</span>${t.needs ? `<span>Needs ${t.needs.map(n => TECH[n].name).join(', ')}</span>` : ''}`
        + (st === 'done' ? '<span>RESEARCHED</span>' : st === 'busy' ? '<span>IN THE LAB</span>' : `<button class="btn" data-tech="${k}" ${can ? '' : 'disabled'} type="button">RESEARCH · ${t.cost} CR · ${t.hrs}h</button>`) + `</div>`;
    }).join('') + `</div>`).join('') + `</div>`;
    h += `<h3>LANDING PADS</h3><div class="kv"><span>PADS</span><b>${s.count('pad')} of ${s.padCap()} allowed</b></div><p class="fine left">Your first pad needs no Comms Tower. Each tower lets you run ${s.hasTech('radio') ? 3 : 2} more. Every pad gets its own pelican: ${s.padLoad()} goods and ${s.padSeats()} seats a flight.</p>`;
  } else if (minTab === 'tru') {
    const ins = s.inspection, at = C.WEEK * C.INSPECT_AT - s.wt;
    h += head('tru') + `<p>${s.inspected ? 'This week\'s inspection is done.' : `Next inspection in ${days(at)}.`} The score is 35% morale, 45% propaganda and 20% condition. Truth standing moves most of the way to the score.</p>`;
    h += `<h3>RIGHT NOW</h3><div class="kv"><span>MORALE</span><b>${Math.round(s.morale)}</b></div><div class="kv"><span>PROPAGANDA</span><b>${s.prop}</b></div><div class="kv"><span>CONDITION</span><b>${Math.round(s.avgCond)}</b></div><div class="kv"><span>LIKELY SCORE</span><b>${Math.round(0.35 * s.morale + 0.45 * s.prop + 0.2 * s.avgCond)}</b></div>`;
    h += `<h3>MORALE, PIECE BY PIECE</h3>` + Object.entries(s.mor).filter(([, v]) => v).map(([k, v]) => `<div class="kv"><span>${(MOR_NAMES[k] || k)}</span><b class="${v < 0 ? 'down' : 'up'}">${v > 0 ? '+' : ''}${v}</b></div>`).join('');
    if (ins) h += `<h3>LAST REPORT, WEEK ${ins.week}: ${ins.score}/100 (${ins.delta >= 0 ? '+' : ''}${ins.delta})</h3><ul class="notes">${ins.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    h += `<p class="fine left">Every kind of propaganda counts for less the more of it you have, so a flag, banners, a loudspeaker, a statue and a pool beat ten banners.</p>`;
  } else {
    const rows = s.table();
    h += `<p>Every week Super Earth ranks the four loyal factions on ${s.planet} by their total standing and splits the allocation: 1st gets ${C.ALLOC.mult[0]}×, 4th gets ${C.ALLOC.mult[3]}×, and the morning recruits fill more of your empty bunks the higher you rank.</p>`;
    h += `<table class="st"><tr><th>#</th><th>FACTION</th><th class="c-def">DEF</th><th class="c-pro">EXP</th><th class="c-tru">TRU</th><th>TOTAL</th><th>SHARE</th></tr>`
      + rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td><img src="${logoImg(r.logo)}" width="20" height="20" alt="" style="vertical-align:middle;margin-right:6px">${esc(r.name)}</td>${MKEYS.map(m => `<td>${Math.round(r.stand[m])}</td>`).join('')}<td><b>${s.total(r.stand)}</b></td><td>${fmt(C.ALLOC.base * C.ALLOC.mult[i])}</td></tr>`).join('') + `</table>`;
    if (s.ledger) { const L = s.ledger; h += `<h3>BUREAU LEDGER, WEEK ${L.week}</h3><div class="kv"><span>Allocation approved by the Federation</span><b>${fmt(L.gross)}</b></div><div class="kv"><span>Bureau handling fee</span><b class="down">-${fmt(L.fee)}</b></div><div class="kv"><span>Presidential consulting</span><b class="down">-${fmt(L.consult)}</b></div><div class="kv"><span>Delivered to ${esc(s.faction.base)}</span><b>${fmt(L.net)}</b></div><p class="fine left">The numbers add up. The Bureau has checked.</p>`; }
    h += `<p class="fine left">Last allocation: ${fmt(s.lastAlloc)} supplies. Troopers shipped ${s.stats.deployed}. Patrols won ${s.stats.patrolsWon}, lost ${s.stats.patrolsLost}. Inspections ${s.stats.inspections}.</p>`;
  }
  // only redraw what changed, and never under the pointer, so buttons stay put while you click them
  if ($('mi-body')._html !== h && (force || !$('mins').matches(':hover'))) $('mi-body').innerHTML = $('mi-body')._html = h;
  if ($('opmap')) drawOpMap($('opmap'));
}
$('mi-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { minTab = b.dataset.t; renderMins(true); } };
$('mi-body').onclick = e => {
  { const et = e.target.closest('[data-et]'); if (et) { ecoTab = et.dataset.et; renderMins(true); return; } }
  { const q = e.target.closest('[data-tq]'); if (q) { tradeQ = +q.dataset.tq; renderMins(true); return; } }
  { const tr = e.target.closest('[data-trade]'); if (tr) { const [g, b] = tr.dataset.trade.split(':'); const r = sim.trade(g, tradeQ, b === '1'); if (r.ok) audio.play('place'); else flash(r.why); renderMins(true); return; } }
  { const of = e.target.closest('[data-offer]'); if (of) { const r = sim.takeOffer(+of.dataset.offer); if (r.ok) audio.play('place'); else flash(r.why); renderMins(true); renderComms(); return; } }
  { const cm = e.target.closest('[data-commit]'); if (cm) { const [m, l] = cm.dataset.commit.split(':'); sim.setCommit(m, +l); audio.play('click'); renderMins(true); return; } }
  { const r = e.target.closest('[data-rep]'); if (r) { repOpen = repOpen === +r.dataset.rep ? null : +r.dataset.rep; renderMins(true); return; } }
  const s = e.target.closest('[data-send]');
  if (s && sim.send(+s.dataset.send, vPick[s.dataset.send] || [])) { delete vPick[s.dataset.send]; renderMins(true); renderComms(); }
  const v = e.target.closest('[data-veh]');
  if (v) { const [id, k] = v.dataset.veh.split(':'), cur = vPick[id] || []; vPick[id] = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; renderMins(true); }
  const ca = e.target.closest('[data-call]'); if (ca) { const [id, y] = ca.dataset.call.split(':'); if (sim.answer(+id, y === '1')) { audio.play('click'); renderMins(true); renderComms(); } }
  const dc = e.target.closest('[data-dec]');
  if (dc) { const [id, i] = dc.dataset.dec.split(':'); if (sim.decide(+id, +i)) { audio.play('click'); $('deskpop').classList.add('hidden'); renderMins(true); renderComms(); } }
  const gr = e.target.closest('[data-grade]');
  if (gr) { const [id, g] = gr.dataset.grade.split(':'); const r = sim.gradeTroop(+id, g); if (r) { lastGrade = r; audio.play(r.off ? 'deny' : 'built'); renderMins(true); } }
  if (e.target.closest('[data-promote]') && sim.promote()) { audio.callAt('medal', []); renderMins(true); renderComms(); buildBar(); }
  if (e.target.closest('[data-sell]') && sim.sellSupplies()) { audio.play('place'); renderMins(true); }
  const bo = e.target.closest('[data-borrow]'); if (bo && sim.borrow(bo.dataset.borrow)) { audio.play('built'); renderMins(true); renderComms(); }
  const rp = e.target.closest('[data-repay]'); if (rp) { const [i, a] = rp.dataset.repay.split(':'); if (sim.repay(+i, a === 'all' ? Infinity : +a)) { audio.play('place'); renderMins(true); renderComms(); } }
  if (e.target.closest('[data-buy]') && sim.buySupplies()) { audio.play('place'); renderMins(true); renderComms(); }
  const t = e.target.closest('[data-tech]');
  if (t && sim.research(t.dataset.tech)) { audio.play('built'); renderMins(true); renderComms(); }
};
function openMins(tab) { if (tab) minTab = tab; $('mins').classList.remove('hidden'); $('deskpop').classList.add('hidden'); renderMins(true); }
function toggleMins(tab) { const m = $('mins'), open = m.classList.contains('hidden') || (tab && tab !== minTab); if (tab) minTab = tab; m.classList.toggle('hidden', !open); if (open) { $('deskpop').classList.add('hidden'); renderMins(true); } }
$('mdock').onclick = e => { const b = e.target.closest('[data-mt]'); if (b) toggleMins(b.dataset.mt); };
document.querySelector('#top .bigs').onclick = e => { const b = e.target.closest('[data-mt]'); if (!b) return; ecoTab = b.dataset.et || 'budget'; openMins('eco'); };
$('mi-x').onclick = () => $('mins').classList.add('hidden');
$('b-week').onclick = () => toggleMins('st'); $('stand').onclick = () => toggleMins('st');
$('or-x').onclick = () => $('orders').classList.toggle('min');

// ---------------------------------------------------------------- photo mode: a free camera, no interface
let photo = false, photoFrozen = false;
function setPhoto(on) {
  photo = on; view.setPhoto(on); tool = null; $('design').classList.add('hidden'); view.setGhost(null); view.showRoadGhost(null); view.showPlots(null); select(null); hideTip();
  $('hud').classList.toggle('hidden', on); $('photobar').classList.toggle('hidden', !on);
  if (!on && photoFrozen) { photoFrozen = false; setPause(false); $('ph-pause').textContent = 'FREEZE TIME'; }
  if (!on) buildBar();
}
$('b-photo').onclick = () => setPhoto(true); $('ph-x').onclick = () => setPhoto(false);
$('ph-up').onclick = () => view.tiltBy(0.12); $('ph-dn').onclick = () => view.tiltBy(-0.12);
$('ph-pause').onclick = () => { photoFrozen = !photoFrozen; setPause(photoFrozen); $('paused').classList.add('hidden'); $('ph-pause').textContent = photoFrozen ? 'UNFREEZE' : 'FREEZE TIME'; };
$('ph-shot').onclick = () => {   // render a frame and save it straight away, before the buffer is cleared
  view.r.render(view.scene, view.cam);
  const a = document.createElement('a'); a.href = $('view').toDataURL('image/png');
  a.download = `${(sim.faction.base || 'fob').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-day-${sim.time.day}.png`; a.click();
  audio.play('built');
};

// ---------------------------------------------------------------- top bar and menu
function setPause(p) { paused = p; $('ck-pause').textContent = p ? '▶' : 'II'; $('ck-pause').classList.toggle('on', p); $('paused').classList.toggle('hidden', !p); }
function setSpeed(i) { speedI = Math.max(0, Math.min(C.SPEEDS.length - 1, i)); $('ck-speed').textContent = gameSpeed() + '×'; if (paused) setPause(false); audio.play('click'); }
$('ck-pause').onclick = () => setPause(!paused);
$('ck-slow').onclick = () => setSpeed(speedI - 1); $('ck-fast').onclick = () => setSpeed(speedI + 1);
// graphics level: AUTO by default, remembered
const GFX = ['auto', 'high', 'medium', 'low'];
let gfx = 'auto'; try { gfx = localStorage.getItem('fob.gfx') || 'auto'; } catch (e) { /* default */ }
const gfxLabel = () => { $('b-gfx').textContent = { auto: 'GFX', high: 'GFX+', medium: 'GFX=', low: 'GFX-' }[gfx]; };
view.setQuality(gfx); gfxLabel();
$('b-gfx').onclick = () => { gfx = GFX[(GFX.indexOf(gfx) + 1) % 4]; try { localStorage.setItem('fob.gfx', gfx); } catch (e) { /* not remembered */ } view.setQuality(gfx); gfxLabel(); flash(`Graphics: ${gfx.toUpperCase()}`); };
function sndLabel() { $('b-snd').classList.toggle('on', !audio.isMuted()); $('b-snd').style.textDecoration = audio.isMuted() ? 'line-through' : ''; }
$('b-snd').onclick = () => { audio.setMuted(!audio.isMuted()); sndLabel(); }; sndLabel();
for (const k of ['master', 'fx', 'amb', 'voice', 'music']) { const el = $('mx-' + k); el.value = audio.mix[k]; el.oninput = () => audio.setMix(k, +el.value); }
$('mx-pa').checked = audio.mix.pa; $('mx-pa').onchange = () => audio.setMix('pa', $('mx-pa').checked);
setInterval(() => { const m = audio.musicInfo(); $('mx-track').textContent = !m.loaded ? '' : !m.n ? 'No music added yet' : m.title ? 'Playing: ' + m.title : `${m.n} tracks`; }, 2000);
addEventListener('pointerdown', () => audio.unlock(), { capture: true }); addEventListener('keydown', () => audio.unlock(), { capture: true });
$('b-rl').onclick = () => view.rotate(-1); $('b-rr').onclick = () => view.rotate(1);
$('b-hide').onclick = () => $('hud').classList.toggle('bare');
// F3: the debug window. Frame time, what the renderer draws, what the simulation holds, where the camera is
let debugOn = false, frameMs = 0, fpsS = 60, dbgT = 0, stepMs = 0;
function debugPanel(dt) {
  fpsS = fpsS * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05; if ((dbgT -= dt) > 0) return; dbgT = 0.25;
  const r = view.r?.info?.render || {}, s = sim, t = view.target, mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a';
  const rows = [['VERSION', VERSION], ['FPS', Math.round(fpsS)], ['FRAME (RENDER)', frameMs.toFixed(1) + ' ms'], ['SIM STEP', (stepMs || 0).toFixed(2) + ' ms'], ['DRAW CALLS', r.calls ?? 'n/a'], ['TRIANGLES', r.triangles != null ? (r.triangles / 1000).toFixed(0) + 'k' : 'n/a'], ['JS HEAP', mem]];
  if (s) rows.push(['MAP', `${s.N}×${s.N} tiles · ${s.held?.() ?? 0} parcels`], ['BUILDINGS', s.b.length], ['TROOPS', s.troops.length], ['ACTORS', life?.actors?.size ?? 0], ['DAY · HOUR', `${s.time?.day ?? '-'} · ${(s.time?.hour ?? 0).toFixed(2)}`], ['SPEED', paused ? 'paused' : gameSpeed() + '×'], ['CAMERA', `${Math.round(t.x + s.N / 2)}, ${Math.round(t.z + s.N / 2)} · zoom ${view.zoom.toFixed(1)}`], ['TOOL', tool || '-'], ['PARCEL', hover ? s.parcelName?.(...s.parcelAt(hover.tx, hover.tz)) : '-']);
  $('debug').innerHTML = '<div class="ph"><span>DEBUG · F3</span></div>' + rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(String(v))}</b></div>`).join('');
}
// the menu stops the clock while it is open, and puts it back the way it was when it closes
let menuWasPaused = null;
function menuOpen(on) {
  const el = $('menu'), isOpen = !el.classList.contains('hidden'); if (on === isOpen) return;
  el.classList.toggle('hidden', !on);
  if (on) { menuWasPaused = paused; setPause(true); $('me-msg').textContent = ''; $('me-code').classList.add('hidden'); }
  else if (menuWasPaused !== null) { setPause(menuWasPaused); menuWasPaused = null; }
}
$('b-menu').onclick = () => menuOpen($('menu').classList.contains('hidden'));
$('me-x').onclick = $('me-resume').onclick = () => menuOpen(false);
$('me-howto').onclick = () => { menuOpen(false); setPause(true); show('s-howto'); };
$('me-faction').onclick = () => { menuOpen(false); wasPaused = paused; paused = true; openFaction(true); };
$('me-new').onclick = () => { if (confirm('Found a new faction? This base will be gone for good unless you copied its save code.')) { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } playing = false; $('menu').classList.add('hidden'); title(); } };
$('me-export').onclick = async () => {
  const code = await exportCode(), t = $('me-code'); t.value = code; t.classList.remove('hidden'); t.select();
  try { await navigator.clipboard.writeText(code); $('me-msg').textContent = 'Save code copied. Keep it somewhere safe; it is your whole base.'; } catch { $('me-msg').textContent = 'Copy the code above and keep it somewhere safe.'; }
};
$('me-import').onclick = async () => {
  const t = $('me-code');
  if (t.classList.contains('hidden') || !t.value.trim()) { t.value = ''; t.classList.remove('hidden'); t.focus(); $('me-msg').textContent = 'Paste a save code, then press LOAD SAVE CODE again.'; return; }
  try { const st = await importCode(t.value); if (!(st.v >= SAVE_MIN)) { $('me-msg').textContent = 'That save is from before the big map (0.16) and can no longer be loaded. Found a new base.'; return; } await start(new Sim({ state: st })); store(); $('menu').classList.add('hidden'); } catch { $('me-msg').textContent = 'That is not a save code this game can read.'; }
};

// ---------------------------------------------------------------- pointer and touch
const cv = $('view'), ptrs = new Map();
let drag = null, pinch = null, roadDrag = null, zoneDrag = null;
const isZone = t => !!t && t.startsWith('zone:');
const tileOf = e => { const p = view.pick(e.clientX, e.clientY); return [Math.floor(p.x), Math.floor(p.z)]; };
function zoneRect(a, b) { const out = []; for (let z = Math.min(a[1], b[1]); z <= Math.max(a[1], b[1]); z++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, z, 1]); return out; }
const isRoad = t => !!RTOOLS[t] && !RTOOLS[t].area;
function lineEnd(e) {   // the snapped end of the line under the pointer
  const p = view.pick(e.clientX, e.clientY), k = RTOOLS[tool].k || 'dirt';
  return sim.snapLine({ x: p.x, z: p.z }, snapMode, k, roadDrag);
}
function roadPreview(e) {
  if (tool === 'unroad') {
    const p = view.pick(e.clientX, e.clientY), sg = sim.lineAt(p.x, p.z);
    if (!sg) { view.showLine(null); if (e.pointerType === 'mouse' && flashT <= 0) hideTip(); return; }
    const nd = id => sim.net.nodes.find(n => n.id === id), a = nd(sg.a), b = nd(sg.b);
    view.showLine(a, b, sg.w, false, sg.k === 'wall');
    if (e.pointerType === 'mouse') tip(`Take out this ${sg.k === 'wall' ? 'wall' : 'road'}: +${Math.floor(Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)) * sim.linePrice(sg.k) / 2)} SUP`, e.clientX, e.clientY);
    return;
  }
  const k = RTOOLS[tool].k, end = lineEnd(e);
  if (!roadDrag) { view.showLine(end, end, k === 'paved' ? 2 : 1, true, k === 'wall'); if (e.pointerType === 'mouse' && flashT <= 0) hideTip(); return; }
  const c = sim.checkLine(roadDrag, end, k);
  view.showLine(roadDrag, end, k === 'paved' ? 2 : 1, c.ok, k === 'wall');
  if (e.pointerType === 'mouse') tip(`${RTOOLS[tool].name}: ${c.cost} SUP${c.ok && !c.runs ? '' : ` · ${esc(c.why)}`}`, e.clientX, e.clientY);
}
function tileAt(e) {
  const p = view.pick(e.clientX, e.clientY);
  if (!tool) return p;
  if (tool !== 'moveflag' && tool !== 'movehq' && tool !== 'callin' && tool !== 'starter' && !LOOSE.has(tool)) {   // buildings snap to the nearest roadside plot and face the road
    const pl = sim.plotFor(tool, p.x, p.z, specOf(tool)?.design);
    if (pl) return { ...p, tx: pl.tx, tz: pl.tz, rot: pl.rot };
  }
  const [w, d] = dims(tool === 'moveflag' || tool === 'callin' ? 'seflag' : tool === 'movehq' ? 'hq' : tool, tool === 'movehq' || tool === 'callin' ? 0 : rot, specOf(tool)?.design); return { ...p, tx: Math.round(p.x - w / 2), tz: Math.round(p.z - d / 2), rot };
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!playing) return;
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; drag = null; return; }
  if (isZone(tool) && e.button === 0) { zoneDrag = tileOf(e); drag = null; view.showPlots(zoneRect(zoneDrag, zoneDrag)); return; }
  if (isRoad(tool) && e.button === 0) { if (tool !== 'unroad') roadDrag = lineEnd(e); else roadDrag = { x: 0, z: 0, bull: true }; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false };
});
cv.addEventListener('pointermove', e => {
  if (!playing) return;
  const p0 = ptrs.get(e.pointerId);
  if (p0) {
    const dx = e.clientX - p0.x, dy = e.clientY - p0.y; p0.x = e.clientX; p0.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (photo) { view.dolly(pinch.d / Math.max(1, d)); view.tiltBy(((a.y + b.y) / 2 - (pinch.my ?? (a.y + b.y) / 2)) * -0.004); pinch.my = (a.y + b.y) / 2; }
      else { view.zoomBy(pinch.d / Math.max(1, d)); view.zoomT = view.zoom = Math.max(4, Math.min(view.zMax(), view.zoomT)); }
      view.spin(-(ang - pinch.ang)); pinch.d = d; pinch.ang = ang;
    } else if (drag) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) { if (drag.btn === 2 || drag.btn === 1) { view.spin(-dx * 0.008); if (photo) view.tiltBy(dy * 0.006); } else view.pan(dx, dy); }
    }
  }
  if (photo) return;
  if (isZone(tool)) { const t = tileOf(e); if (zoneDrag) { view.showPlots(zoneRect(zoneDrag, t)); if (e.pointerType === 'mouse') tip(`${Math.abs(t[0] - zoneDrag[0]) + 1} × ${Math.abs(t[1] - zoneDrag[1]) + 1}`, e.clientX, e.clientY); } else if (e.pointerType === 'mouse') { const n = sim.zoneAt(t[0], t[1]); tip(n ? ZONES[sim.zoneKey(n)].name : 'Not zoned', e.clientX, e.clientY); } return; }
  if (tool === 'clear') { const p = view.pick(e.clientX, e.clientY), tx = Math.floor(p.x), tz = Math.floor(p.z), i = tz * sim.N + tx, o = sim.clearOrderAt(i);
    if (e.pointerType === 'mouse') tip(o ? `Ordered: ${o.tiles.length} tiles. Click to cancel` : sim.scrub?.[i] ? `Clear this patch of ${sim.scrubName()}` : 'Nothing to clear here', e.clientX, e.clientY); return; }
  if (isRoad(tool)) roadPreview(e);
  else if (tool === 'starter') { const t = tileAt(e); hover = t; const ok = sim.canStarter(t.tx, t.tz, rot); view.setGhost('starter', t.tx, t.tz, rot, ok.ok); ciRead([t.tx, t.tz]); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (tool === 'callin') { const t = tileAt(e); hover = t; const ok = sim.canFlag(t.tx, t.tz); view.setGhost('seflag', t.tx, t.tz, 0, ok.ok); ciStart = { parcels: sim.startParcels(t.tx, t.tz), ok: ok.ok }; ciRead([t.tx, t.tz]); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (tool === 'land') { const p = view.pick(e.clientX, e.clientY), q = sim.parcelAt(p.x, p.z); landHover = q; if (e.pointerType === 'mouse') { const st = sim.parcelState(...q), c = sim.parcelCost(...q); tip(`<b>Parcel ${sim.parcelName(...q)}</b> · ${{ owned: 'yours', buy: `${c.sup} SUP · ${c.cr} CR · click to see`, next: esc(sim.canBuy(...q).why), far: 'must touch your ground', edge: 'never granted' }[st]}`, e.clientX, e.clientY); } }
  else if (tool === 'movehq') { const t = tileAt(e); hover = t; const ok = sim.canMoveHQ(t.tx, t.tz); view.setGhost('hq', t.tx, t.tz, 0, ok.ok); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (tool === 'moveflag') { const t = tileAt(e); hover = t; const ok = sim.canMoveFlag(t.tx, t.tz); view.setGhost('seflag', t.tx, t.tz, 0, ok.ok); view.showPlaza(sim.plazaAt(t.tx, t.tz, sim.b.find(b => b.type === 'seflag').id), ok.ok); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (tool) { const t = tileAt(e); hover = t; const ok = sim.canPlace(tool, t.tx, t.tz, t.rot, specOf(tool)); view.setGhost(tool, t.tx, t.tz, t.rot, ok.ok, specOf(tool)); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (e.pointerType === 'mouse' && !p0) {
    const p = view.pick(e.clientX, e.clientY);
    if (p.bid) { const b = sim.byId(p.bid); tip(`<b>${B[b.type].name}</b>${b.done ? (b.upg ? ' · upgrading' : '') : ` · ${buildState(b)}`}`, e.clientX, e.clientY); cv.style.cursor = 'pointer'; }
    else { if (flashT <= 0) hideTip(); cv.style.cursor = ''; }
  }
});
function up(e) {
  if (!playing) return;
  ptrs.delete(e.pointerId);
  if (zoneDrag) {
    const a = zoneDrag, t = tileOf(e); zoneDrag = null; view.showPlots(isZone(tool) ? zoneable() : null); if (flashT <= 0) hideTip();
    // a click (no drag) fills the block along the road under it; a drag paints the rectangle
    const one = a[0] === t[0] && a[1] === t[1], r = one ? sim.zoneFill(t[0], t[1], tool.slice(5) || null) : sim.paintZone(a[0], a[1], t[0], t[1], tool.slice(5) || null);
    if (r.ok) { audio.play('place'); sim.growStep(); buildBar(); view.showPlots(zoneable()); } else { flash(one ? r.why : 'Nothing to change there: zones go on open ground on your land.'); audio.play('deny'); }
    return;
  }
  if (roadDrag) {
    let ok;
    if (tool === 'unroad') { const p = view.pick(e.clientX, e.clientY); ok = sim.removeLine(p.x, p.z); if (!ok) flash('No road or wall there.'); }
    else { const end = lineEnd(e), c = sim.checkLine(roadDrag, end, RTOOLS[tool].k); ok = c.ok && sim.drawLine(roadDrag, end, RTOOLS[tool].k); if (!ok && c.why !== 'Too short') flash(c.why || 'Cannot draw that here.'); }
    roadDrag = null; view.showLine(null); if (flashT <= 0) hideTip();
    if (ok) { audio.play(tool === 'unroad' ? 'demolish' : 'place'); buildBar(); } else audio.play('deny');
    return;
  }
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const d = drag; drag = null;
  if (photo) return;
  if (d.moved) return;
  if (d.btn === 2 && (tool === 'callin' || tool === 'starter')) return;
  if (d.btn === 2) { if (tool) { tool = null; view.setGhost(null); view.showPlaza(null); view.showRoadGhost(null); view.showPlots(null); buildBar(); designPanel(); } else select(null); return; }
  if (tool === 'clear') {
    const p = view.pick(e.clientX, e.clientY), tx = Math.floor(p.x), tz = Math.floor(p.z), o = sim.clearOrderAt(tz * sim.N + tx);
    if (o) { sim.cancelClear(o.id); audio.play('click'); return; }
    const r = sim.orderClear(tx, tz); if (!r.ok) { flash(r.why + '.'); audio.play('deny'); return; }
    flash(`${r.n} tiles ordered cleared. ${sim.crews.some(c => c.job == null && !c.wait) ? 'A crew is on its way.' : 'The next free crew will take it.'}`); audio.play('place'); return;
  }
  if (tool === 'callin' || tool === 'starter') { const t = tileAt(e); callIn(t.tx, t.tz); return; }
  if (tool === 'land') { const p = view.pick(e.clientX, e.clientY), q = sim.parcelAt(p.x, p.z); if (sim.grantable(...q)) { landCard(q); audio.play('click'); } return; }
  if (tool === 'movehq') {
    const t = tileAt(e), r = sim.moveHQ(t.tx, t.tz);
    if (!r.ok) { flash(r.why); audio.play('deny'); return; }
    tool = null; view.setGhost(null); audio.play('place'); flash('The HQ is set down here. Draw your first road from it.'); return;
  }
  if (tool === 'moveflag') {
    const t = tileAt(e), r = sim.moveFlag(t.tx, t.tz);
    if (!r.ok) { flash(r.why); audio.play('deny'); return; }
    tool = null; view.setGhost(null); view.showPlaza(null); audio.play('place'); return;
  }
  if (tool) {
    const t = tileAt(e), sp = specOf(tool), ok = sim.canPlace(tool, t.tx, t.tz, t.rot, sp);
    if (!ok.ok) { flash(ok.why); audio.play('deny'); return; }
    sim.place(tool, t.tx, t.tz, t.rot, false, sp); buildBar(); audio.playAt('place', t.tx + 1, t.tz + 1);
    if (!e.shiftKey && !LOOSE.has(tool)) { tool = null; view.setGhost(null); view.showPlots(null); buildBar(); designPanel(); }
    else { const n = tileAt(e); view.setGhost(tool, n.tx, n.tz, n.rot, sim.canPlace(tool, n.tx, n.tz, n.rot, sp).ok, sp); if (!LOOSE.has(tool)) view.showPlots(sim.plotTiles()); }
    return;
  }
  const p = view.pick(e.clientX, e.clientY); select(p.bid);
}
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); if (photo) view.dolly(Math.exp(e.deltaY * 0.0012)); else view.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------------------------------------------------------------- keys
const held = new Set();
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase(); held.add(k);
  if (k === 'f3') { e.preventDefault(); debugOn = !debugOn; $('debug').classList.toggle('hidden', !debugOn); return; }
  if (!playing) return;
  if (sim.callIn) { if (k === 'q') view.rotate(-1); else if (k === 'e') view.rotate(1); else if (k === 'r' && tool === 'starter') { rot = (rot + 1) % 4; if (hover) { view.setGhost('starter', hover.tx, hover.tz, rot, sim.canStarter(hover.tx, hover.tz, rot).ok); ciRead([hover.tx, hover.tz]); } } return; }   // nothing else until the HQ is down
  if (k === 'p') { setPhoto(!photo); return; }
  if (photo) {
    if (k === 'q') view.rotate(-1); else if (k === 'e') view.rotate(1);
    else if (k === 'r') view.tiltBy(0.1); else if (k === 'f') view.tiltBy(-0.1);
    else if (k === 'h') $('photobar').classList.toggle('hidden');
    else if (k === 'escape') setPhoto(false);
    else if (k === ' ') { e.preventDefault(); $('ph-pause').click(); }
    return;
  }
  if (k === 'g') { snapMode = SNAPS[(SNAPS.indexOf(snapMode) + 1) % 3]; buildBar(); flash(`Snapping: ${SNAPNAME[snapMode]}`); return; }
  if (k === 'q') view.rotate(-1);
  else if (k === 'e') view.rotate(1);
  else if (k === 'r') { rot = (rot + 1) % 4; if (tool && hover) view.setGhost(tool, hover.tx, hover.tz, rot, false); }
  else if (k === ' ') { e.preventDefault(); setPause(!paused); }
  else if (k === 'escape') { if (tool) { tool = null; view.setGhost(null); view.showPlaza(null); view.showRoadGhost(null); view.showPlots(null); buildBar(); designPanel(); } else if (!$('mins').classList.contains('hidden')) $('mins').classList.add('hidden'); else if (!$('menu').classList.contains('hidden')) $('menu').classList.add('hidden'); else select(null); }
  else if (k === 'm') toggleMins();
  else if (k === 'c') toggleComms();
  else if (k === 'l') toggleMins('led');
  else if (k === 'b') toggleMins('eco');
  else if (k === 'i') setIview(IVIEWS[(IVIEWS.findIndex(v => v[0] === iview) + 1) % IVIEWS.length][0]);
  else if (k === 'h') $('hud').classList.toggle('bare');
  else if (k === 'tab') { e.preventDefault(); const i = GROUPS.findIndex(g => g[0] === group); group = GROUPS[(i + (e.shiftKey ? GROUPS.length - 1 : 1)) % GROUPS.length][0]; buildBar(); }
  else if (k === 'delete' || k === 'backspace') { if (selId && !B[sim.byId(selId)?.type]?.fixed) { sim.demolish(selId); select(null); } }
  else if (k === '[') setSpeed(speedI - 1);
  else if (k === ']') setSpeed(speedI + 1);
  else if (k === '1' || k === '2' || k === '3') setSpeed(C.SPEEDS.indexOf([1, 2, 4][+k - 1]));
});
addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// ---------------------------------------------------------------- the loop
// ---------------------------------------------------------------- the soundscape: what you hear is where it happens
// each building type's sound, and when it makes it. on(h, ph): only at those times
const SOUND = {
  gen: 'hum', solar: 'hvac', motorpool: 'clank', vbay: 'clank', depot: 'clank', fueldepot: 'hum', shed: 'hvac', armory: 'clank',
  hq: 'radio', patrol: 'radio', command: 'radio', lookout: 'radio', comms: 'static', mast: 'static', speaker: 'hvac', billboard: 'hvac', truth: 'radio',
  lab: 'beeps', medbay: 'heart', hdbarracks: 'cryo', shelter: 'hvac', range: 'shots', course: 'whistle', parade: 'drum', lecture: 'lecture',
  mess: 'clatter', burger: 'fry', chicken: 'fry', cola: 'fridge', vend: 'fridge', barracks: 'murmur', hab: 'murmur', block: 'murmur',
  extractor: 'hum', mine: 'clank', factory: 'clank', partyhq: 'radio', palace: 'murmur', club: 'murmur', monument: 'flag', eob: 'hum', vault: 'beeps', warroom: 'radio', halls: 'flame', mart: 'clatter', casino: 'beeps', cryo: 'cryo', brig: 'radio', turret: 'hvac', flood: 'hum', plaque: 'flame',
  seflag: 'flag', flag: 'flag', banner: 'flag', hdbanner: 'flag', pool: 'water', memorial: 'flame', dome: 'hum', potty: 'hvac',
};
const WHEN = {
  shots: (h, ph) => ph === 'work' || ph === 'pt', drum: (h, ph) => ph === 'pt', lecture: (h, ph) => ph === 'work',
  clatter: (h, ph) => ph === 'chow' || ph === 'mess' || ph === 'evening' || ph === 'work', whistle: (h, ph) => ph === 'pt' || ph === 'work',
  murmur: (h, ph) => ph === 'evening' || ph === 'firstcall', fry: (h, ph) => ph !== 'night',
};
const horns = () => sim.b.filter(b => b.done && ['speaker', 'mast', 'seflag'].includes(b.type)).map(b => [b.x + b.w / 2, b.z + b.d / 2]);
let sndT = 0, paT = 45, chatT = 6, bubbles = [];
let sndLast = performance.now();
function soundscape() {
  const now = performance.now(), dt = Math.min(1, (now - sndLast) / 1000); sndLast = now;   // wall-clock time: the frame step is capped on slow machines
  audio.listen(...view.ear());
  if ((sndT -= dt) <= 0) {
    sndT = 0.2;
    const h = sim.time.hour, ph = sim.time.phase, list = [];
    for (const b of sim.b) {
      const k = b.done ? SOUND[b.type] || 'hvac' : 'build';
      list.push({ key: 'b' + b.id, kind: k, x: b.x + b.w / 2, z: b.z + b.d / 2, on: !b.done || ((!b.off || k === 'flag') && (!WHEN[k] || WHEN[k](h, ph))), vol: B[b.type].w * B[b.type].d > 4 ? 1.3 : 1 });
    }
    for (const v of sim.veh) if (!v.away) list.push({ key: 'v' + v.id, kind: v.kind, x: v.x, z: v.z, moving: v.path.length > 0, on: v.path.length > 0 || v.kind !== 'lift' });
    // a squad marching out after its briefing: boots in step
    for (const p of sim.patrols) if (!(p.brief > 0)) { const as = p.members.map(id => life.actors.get(id)).filter(a => a && !a.hidden && (a.act === 'walk' || a.act === 'run'));
      if (as.length >= 2) list.push({ key: 'm' + p.id, kind: 'march', x: as.reduce((a, q) => a + q.x, 0) / as.length, z: as.reduce((a, q) => a + q.z, 0) / as.length, moving: true, on: true, vol: 0.6 + as.length * 0.15 }); }
    for (const f of life.flights) list.push({ key: 'p' + f.padKey, kind: 'pelican', x: f.x, z: f.z, moving: f.ph !== 'land', on: f.y < 15.5, vol: 2.2 - Math.min(1.4, f.y / 10) });
    audio.emitters(list);
  }
  if (paused) return;
  // the loudspeakers read something out every couple of minutes, from the one nearest you
  if ((paT -= dt) <= 0) {
    paT = 80 + Math.random() * 70;
    const sp = sim.b.filter(b => b.done && (b.type === 'speaker' || b.type === 'mast')), [ex, ez] = view.ear();
    if (sp.length && sim.time.phase !== 'night') {
      const s = sp.reduce((a, b) => Math.hypot(a.x - ex, a.z - ez) < Math.hypot(b.x - ex, b.z - ez) ? a : b), line = PA[(Math.random() * PA.length) | 0];
      if (audio.announce(line, s.x + 0.5, s.z + 0.5) > 0.12) caption(line);
    }
  }
  // people near the camera say something now and then: a bubble over their head and a mumble from where they stand
  if ((chatT -= dt) <= 0) {
    chatT = 4 + Math.random() * 5;
    const [ex, ez, eh] = view.ear();
    if (eh < 11 && sim.time.phase !== 'night') {
      const near = [...life.actors.values()].filter(a => !a.hidden && a.kind !== 'inspector' && Math.hypot(a.x - ex, a.z - ez) < eh * 0.9 && !['plan', 'salute', 'heart', 'run', 'lie'].includes(a.act));
      if (near.length) {
        const a = near[(Math.random() * near.length) | 0], t = a.extra === 'civ' ? sim.byId(a.home)?.type : null;
        const pool = a.extra === 'eng' ? SAY.eng : a.extra === 'hd' ? SAY.hd : t && SAY[t] ? SAY[t] : a.extra === 'civ' ? SAY.civ : sim.troop?.(a.id)?.hurt > 0 ? SAY.wounded : SAY.troop;
        bubble(a, pool[(Math.random() * pool.length) | 0]);
        audio.chatter(a.x, a.z, a.extra === 'civ' ? 170 + (a.n || 0) * 25 : a.extra === 'hd' || a.extra === 'eng' ? 115 + (a.n || 0) * 10 : 130 + ((+a.id || 0) % 4) * 12);
      }
    }
  }
  for (const b of bubbles) {
    b.t -= dt; const a = life.actors.get(b.id), p = a && !a.hidden && b.t > 0 ? view.toScreen(a.x, a.z, 1.15) : null;
    if (!p) { b.el.remove(); b.dead = true; continue; }
    b.el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -100%)`; b.el.style.opacity = Math.min(1, b.t * 2);
  }
  bubbles = bubbles.filter(b => !b.dead);
}
function bubble(a, text) {
  if (bubbles.length >= 3) { bubbles[0].el.remove(); bubbles.shift(); }
  const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text; $('app').appendChild(el);
  bubbles.push({ id: a.id, el, t: 4.5 });
}
let capT = 0;
function caption(text) {
  let el = $('pa-cap'); if (!el) { el = document.createElement('div'); el.id = 'pa-cap'; $('app').appendChild(el); }
  el.innerHTML = `<i>LOUDSPEAKER</i> ${esc(text)}`; el.classList.add('on'); clearTimeout(capT); capT = setTimeout(() => el.classList.remove('on'), 9000);
}

// if a frame ever fails, keep the game alive and say what happened instead of leaving a black screen
let oops = 0;
function trouble(msg) {
  let el = $('trouble'); if (!el) { el = document.createElement('div'); el.id = 'trouble'; el.className = 'panel'; el.style.cssText = 'position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:30;padding:10px 14px;max-width:min(560px,92vw);font-size:12px;border-color:#ff6a4d'; $('app').appendChild(el); }
  if (!msg) { el.remove(); return; }
  el.innerHTML = `<b style="color:#ff6a4d">DISPLAY TROUBLE</b><br>${esc(msg)}<br><span style="opacity:.7">Your base is saved. Try a reload (Ctrl+Shift+R). If it comes back, send this message to the developers. v${VERSION}</span>`;
}
view.onLost = lost => trouble(lost ? 'The graphics driver dropped the 3D view. Waiting for it to come back.' : null);
function loop(now) { try { loopBody(now); oops = 0; } catch (e) { console.error(e); if (++oops === 3) trouble(String(e && e.message || e)); requestAnimationFrame(loop); } }
function loopBody(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) layout();   // panels keep out of each other's way, paused or not
  if (playing) {
    const fx = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
    const fz = (held.has('w') || held.has('arrowup') ? 1 : 0) - (held.has('s') || held.has('arrowdown') ? 1 : 0);
    if (fx || fz) view.move(fx, fz, dt);
    if (!paused && !sim.callIn) {
      acc += dt * gameSpeed();
      const st0 = performance.now(); let sn = 0; while (acc >= 0.1) { sim.step(0.1); acc -= 0.1; sn++; } if (sn) stepMs = stepMs * 0.9 + (performance.now() - st0) / sn * 0.1;
      for (const ev of sim.drain()) {
        life.event(ev); if (ev.t === 'built' || ev.t === 'week') buildBar();
        if (ev.t === 'built') { const b = sim.byId(ev.id); if (b) audio.playAt('built', b.x + b.w / 2, b.z + b.d / 2); }
        if (ev.t === 'say') audio.play('ping', ev.ch);
        if (ev.t === 'patrolBack' && ev.hero) { const f = sim.b.find(b => b.type === 'seflag'); audio.callAt('medal', f ? [[f.x + 1, f.z + 1]] : []); }
        if (ev.t === 'phase') { const c = { reveille: 'reveille', retreat: 'retreat', night: 'taps' }[ev.phase]; if (c) audio.callAt(c, horns()); }
        if (ev.t === 'moved') select(selId);
        if (ev.t === 'desk') { audio.play('ping'); $('orders').classList.remove('min'); }   // requests land on the task board
        if (ev.t === 'call') callPop(ev.id);
        if (ev.t === 'report') reportPop(ev.id);
      }

      life.update(dt * gameSpeed());
    }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); renderComms(); }
    mmT -= dt; if (mmT <= 0) { mmT = 0.1; drawMinimap(); }
    saveT += dt; if (saveT > 20) { saveT = 0; store(); }
    if (deskT > 0) { deskT -= dt; if (deskT <= 0) $('deskpop').classList.add('hidden'); }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) hideTip(); }
  } else {
    view.spin(dt * 0.06);
    if (sim) { sim.step(dt); for (const ev of sim.drain()) life.event(ev); life.update(dt); }
  }
  if (sim && sim.time) { view.setTime(sim.time.hour); audio.setNight(1 - (view.dayLight ?? 1)); }
  if (playing && sim) { view.showParcels(tool === 'land' ? 'land' : tool === 'callin' ? 'callin' : null, tool === 'land' ? landHover : null, tool === 'callin' ? ciStart : null); if (tool !== 'land' && landSel) landCard(null); else if (landSel) landCard(landSel); }
  if (!view.lost) { const t0 = performance.now(); view.frame(dt); frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1; }
  if (debugOn) debugPanel(dt);
  if (sim && sim.time) soundscape(dt);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- go
title();
if (params.has('play')) { const s = stored(); start(s ? new Sim({ state: s }) : new Sim({ seed: +(params.get('seed') || 7) })); }
requestAnimationFrame(loop);
window.__fob = { get sim() { return sim; }, get life() { return life; }, view, audio, callIn: (x, z) => callIn(x, z), callInAuto: () => callInAuto(), select: id => select(id), openMins: t => openMins(t), setEco: t => { ecoTab = t; }, snd: () => ({ chatT, paT, sndT, n: bubbles.length, playing, paused }) };
