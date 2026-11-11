// The loop, the input, the HUD and the screens. The simulation is in sim.js, the people in life.js, the picture in view.js.
import { C, B, MIN, GROUPS, FACTION_DEFAULT, PLANETS, VERSION, GOODS, GKEYS, ROADS, TRAIN, TECH, VEHICLES } from './config.js';
import { Sim, MKEYS, rankOf, dims } from './sim.js';
import { Life } from './life.js';
import { View } from './view.js';
import { drawLogo, drawTrooper, lookOf, ensureLogo, readUpload, SHAPES, SYMBOLS, PATTERNS, UNIFORMS, PALETTE } from './logo.js';
import { demoSim } from './demo.js';
import * as audio from './audio.js';

const $ = id => document.getElementById(id);
const SAVE = 'fob-super-commander.save.v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const CH = { def: ['DEFENCE', 'var(--def)'], pro: ['EXPANSION', 'var(--pro)'], tru: ['TRUTH', 'var(--tru)'], base: ['BASE', '#ffffff'], bur: ['BUREAU', '#d8a6ff'], riv: ['BULLETIN', 'var(--amber)'], log: ['LOGISTICS', 'var(--g)'] };

const view = new View($('view'));
let sim = null, life = null, playing = false, paused = false, speed = 1, tool = null, rot = 0, hover = null, group = 'expansion', minTab = 'def', speedI = 1;
const gameSpeed = () => C.SPEEDS[speedI];
const days = s => { const d = s / C.DAY; return d >= 1.5 ? `${Math.round(d)} days` : d >= 0.9 ? '1 day' : `${Math.max(1, Math.round(d * 24))} hours`; };
let acc = 0, hudT = 0, saveT = 0, last = performance.now();
for (const el of document.querySelectorAll('[data-version]')) el.textContent = 'v' + VERSION;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- saving
function store() { if (sim && playing) try { localStorage.setItem(SAVE, JSON.stringify(sim.save())); } catch { /* storage blocked: the game still works */ } }
function stored() { try { const s = localStorage.getItem(SAVE); return s ? JSON.parse(s) : null; } catch { return null; } }
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
  sim = s; life = new Life(sim); view.attach(sim, life);
  view.lookAt(sim.N / 2, sim.N / 2 + 2);
  playing = play; view.shift = play ? 0 : (innerWidth > 900 ? -0.38 : 0);
  if (play) { show(null); $('hud').classList.remove('hidden'); buildBar(); drawWho(); hud(); renderComms(true); }
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
  fxDraw(); show('s-faction');
}
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
  start(new Sim({ faction: draft, seed: (Math.random() * 1e9) | 0 })).then(store);
};

$('b-new').onclick = () => openFaction(false);
$('b-continue').onclick = () => { const s = stored(); if (s) start(new Sim({ state: s })); };
$('b-howto').onclick = () => show('s-howto');
$('ht-x').onclick = () => show(playing ? null : 's-title');

// ---------------------------------------------------------------- the build bar
// the line tools: roads and walls are drawn the same way. Drag from one end to the other; ends snap to the grid, to
// 45 degrees or nowhere (SNAP, or G), and always onto existing roads and walls so they join up
const RTOOLS = { road1: { name: 'Dirt Road', k: 'dirt', desc: 'Drag to draw. One tile wide and cheap. Vehicles go 1.6 times as fast as off-road, people a little faster.' },
  road2: { name: 'Paved Road', k: 'paved', desc: 'Drag to draw. Two tiles wide, with a centre line. Vehicles go 2.4 times as fast, so supplies reach their buildings sooner.' },
  wall: { name: 'Wall', k: 'wall', desc: 'Drag to draw HESCO wall. Whatever your walls enclose is the base: build further out, then take the old wall down. A road drawn through a wall makes a gate.' },
  unroad: { name: 'Bulldoze', k: null, desc: 'Click a road or a wall to take it out. Half the cost back.' } };
const SNAPS = ['grid', '45', 'free'], SNAPNAME = { grid: 'GRID', 45: '45°', free: 'FREE' };
let snapMode = 'grid';
const lineCost = k => k ? sim.linePrice(k) : 0;
function groupItems(g) { const subs = GROUPS.find(x => x[0] === g)[2]; return Object.entries(B).filter(([, d]) => subs.includes(d.group) && !d.fixed); }
function buildBar() {
  $('b-groups').innerHTML = GROUPS.map(([k, n]) => `<button class="btn ${k === group ? 'on' : ''}" data-g="${k}" type="button">${n}</button>`).join('');
  const items = groupItems(group);
  const lines = group === 'expansion' ? ['road1', 'road2', 'unroad'] : group === 'defence' ? ['wall', 'unroad'] : [];
  $('b-items').innerHTML = (lines.length ? `<button class="btn bi road" data-snap="1" type="button" title="How line ends snap (G)"><b>SNAP</b><span class="cost">${SNAPNAME[snapMode]}</span></button>` : '')
    + lines.map(k => { const d = RTOOLS[k]; return `<button class="btn bi road ${tool === k ? 'on' : ''}" data-b="${k}" type="button"><b>${d.name}</b><span class="cost">${d.k ? lineCost(d.k) + ' SUP / TILE' : 'HALF BACK'}</span></button>`; }).join('')
    + items.map(([k, d], i) => {
    const lk = sim.locked(k), poor = sim.supplies < d.cost;
    return `<button class="btn bi ${lk ? 'lock' : ''} ${poor ? 'poor' : ''} ${tool === k ? 'on' : ''}" data-b="${k}" type="button"><b>${d.name}</b><span class="cost">${d.cost} SUP</span></button>`;
  }).join('');
}
$('b-groups').onclick = e => { const b = e.target.closest('[data-g]'); if (b) { group = b.dataset.g; buildBar(); } };
$('b-items').onclick = e => { if (e.target.closest('[data-snap]')) { snapMode = SNAPS[(SNAPS.indexOf(snapMode) + 1) % 3]; buildBar(); return; } const b = e.target.closest('[data-b]'); if (b) pickTool(b.dataset.b); };
$('b-items').addEventListener('pointermove', e => {
  const b = e.target.closest('[data-b]'); if (!b) return hideTip();
  if (b.dataset.snap) return tip('<b>Snapping</b><br>GRID: ends on tile centres. 45°: straight lines at 45-degree steps, whole tiles long. FREE: anywhere. Ends always join existing roads and walls. G switches.', e.clientX, e.clientY - 12, true);
  const k = b.dataset.b; if (RTOOLS[k]) return tip(`<b>${RTOOLS[k].name}</b><br>${RTOOLS[k].desc}`, e.clientX, e.clientY - 12, true);
  const d = B[k], lk = sim.locked(k);
  const bits = [d.pw > 0 ? `+${d.pw} power` : d.pw < 0 ? `${d.pw} power` : '', d.crew ? `crew ${d.crew}` : '', d.beds ? `houses ${d.beds} votes` : '', d.eat ? `feeds ${d.eat}` : '', d.slots ? `trains ${d.slots} at ${TRAIN[d.train]}/h` : '', d.store ? 'stores ' + Object.entries(d.store).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ') : '', d.need ? 'uses ' + Object.keys(d.need).map(g => GOODS[g].name.toLowerCase()).join(', ') : '', d.mor ? `+morale` : '', d.prop ? `+propaganda` : '', `upkeep ${d.up}/wk`].filter(Boolean);
  tip(`<b>${d.name}</b><br>${d.desc}<br><span style="color:var(--g-dim)">${bits.join(' · ')}</span>` + (lk ? `<br><span class="warn">Needs ${lk.join(' and ')}</span>` : ''), e.clientX, e.clientY - 12, true);
});
$('b-items').addEventListener('pointerleave', hideTip);
function pickTool(k) {
  if (RTOOLS[k]) { tool = tool === k ? null : k; select(null); view.setGhost(null); view.showRoadGhost(null); buildBar(); return; }
  const lk = sim.locked(k);
  if (lk) { flash(`${B[k].name} needs ${lk.join(' and ')} first.`); return; }
  tool = tool === k ? null : k; select(null); buildBar();
  if (!tool) view.setGhost(null);
}
function tip(html, x, y, above) { const t = $('tip'); t.innerHTML = html; t.classList.remove('hidden'); const r = t.getBoundingClientRect(); t.style.left = Math.min(innerWidth - r.width - 6, Math.max(6, x - r.width / 2)) + 'px'; t.style.top = (above ? y - r.height : y + 18) + 'px'; }
function hideTip() { $('tip').classList.add('hidden'); }
let flashT = 0;
function flash(text) { tip(`<span class="warn">${esc(text)}</span>`, innerWidth / 2, innerHeight - 170, true); flashT = 2.2; }

// ---------------------------------------------------------------- selection
let selId = null;
function select(id) { selId = id; const b = id ? sim.byId(id) : null; view.select(b); view.showPlaza(b && b.type === 'seflag' ? sim.plaza().tiles : null); selPanel(); }
function selPanel() {
  const b = selId && sim.byId(selId), p = $('selp');
  if (!b) { p.classList.add('hidden'); p._html = ''; return; }
  const d = B[b.type], bits = [];
  if (!b.done) bits.push(`<div class="kv"><span>CONSTRUCTION</span><b>${Math.round(b.prog * 100)}%</b></div><div class="meter"><i style="width:${b.prog * 100}%;background:var(--yellow)"></i></div>`);
  else {
    bits.push(`<div class="kv"><span>CONDITION</span><b class="${b.cond < 40 ? 'down' : ''}">${Math.round(b.cond)}%</b></div><div class="meter"><i style="width:${b.cond}%;background:${b.cond < 40 ? 'var(--red)' : b.cond < 70 ? 'var(--amber)' : 'var(--g)'}"></i></div>`);
    if (d.crew) bits.push(`<div class="kv"><span>CREW</span><b class="${b.crew < d.crew ? 'warn' : ''}">${b.crew} / ${d.crew}</b></div>`);
    if (d.pw) bits.push(`<div class="kv"><span>POWER</span><b>${d.pw > 0 ? '+' : ''}${b.type === 'gen' ? Math.round(d.pw * sim.crewFrac(b) * (b.stock.fuel > 0 ? 1 : 0)) : d.pw}</b></div>`);
    const bar = (g, n, cap, label) => `<div class="kv"><span>${label || GOODS[g].name.toUpperCase()}</span><b class="${n < cap * 0.15 ? 'down' : ''}">${Math.floor(n)} / ${cap}</b></div><div class="meter"><i style="width:${Math.min(100, n / cap * 100)}%;background:${GOODS[g].color}"></i></div>`;
    if (d.store) for (const g in d.store) bits.push(bar(g, b.stock[g], d.store[g]));
    if (d.need) for (const g in d.need) bits.push(bar(g, b.stock[g], d.need[g], 'NEEDS ' + GOODS[g].name.toUpperCase()));
    if (d.pad) { const n = GKEYS.reduce((a, g) => a + b.stock[g], 0); bits.push(`<div class="kv"><span>WAITING TO BE MOVED</span><b>${Math.floor(n)}</b></div>`); }
    if (d.eat) bits.push(`<div class="kv"><span>FEEDS</span><b>${d.eat} votes a day</b></div>`);
    if (d.slots) { const n = sim.troops.filter(t => t.at === b.id).length; bits.push(`<div class="kv"><span>TRAINING NOW</span><b>${n} / ${d.slots}</b></div>`); }
    if (d.trucks || d.lifts) { const vs = sim.veh.filter(v => v.home === b.id); bits.push(`<div class="kv"><span>${d.trucks ? 'TRUCKS' : 'FORKLIFT'}</span><b>${vs.filter(v => v.job).length} of ${vs.length} on a run</b></div>`); }
    if (d.lab) bits.push(`<div class="kv"><span>RESEARCH</span><b>${sim.tech.cur ? `${TECH[sim.tech.cur].name}, ${Math.floor(sim.tech.pts / TECH[sim.tech.cur].hrs * 100)}%` : 'idle: pick a project in Science'}</b></div>`);
    if (d.armour) for (const k of ['frv', 'tank']) {
      const v = sim.veh.find(v => v.home === b.id && v.kind === k), w = b.wreck?.[k];
      if (v || w) bits.push(`<div class="kv"><span>${VEHICLES[k].name.toUpperCase()}</span><b>${v ? (v.mission ? 'on an operation' : 'ready') : `replacement in ${days(w)}`}</b></div>`);
    }
    if (d.squads) { const out = sim.patrols.filter(p => p.office === b.id).length; bits.push(`<div class="kv"><span>SQUADS KEPT OUT</span><b><button class="btn icon" id="sq-dn" type="button">-</button> ${b.squads} <button class="btn icon" id="sq-up" type="button">+</button></b></div><div class="kv"><span>IN THE FIELD NOW</span><b>${out}</b></div>`); }
    if (d.beds) bits.push(`<div class="kv"><span>VOTES HOUSED</span><b>${d.beds}</b></div>`);
    if (d.potty) bits.push(`<div class="kv"><span>CLEANLINESS</span><b class="${(b.clean ?? 100) < 25 ? 'down' : ''}">${Math.round(b.clean ?? 100)}%</b></div><div class="meter"><i style="width:${b.clean ?? 100}%;background:${(b.clean ?? 100) < 25 ? 'var(--red)' : 'var(--blue)'}"></i></div><div class="kv"><span>VOTES PER POTTY</span><b>${Math.round(sim.potties.perPotty)}</b></div>`);
    if (b.type === 'seflag') { const pz = sim.plaza(); bits.push(`<div class="kv"><span>PLAZA HOLDS</span><b class="${pz.need > pz.cap ? 'down' : ''}">${pz.cap} votes</b></div><div class="kv"><span>VOTES TO SALUTE</span><b>${pz.need}</b></div>`); }
    if (b.type === 'memorial') bits.push(`<div class="kv"><span>NAMES ON THE WALL</span><b>${sim.fallen.length}</b></div>`);
    if (b.off) bits.push(`<p class="warn">Switched off.</p>`);
  }
  const crew = sim.troops.filter(t => t.job === b.id).map(t => `${rankOf(t.missions)} ${esc(t.name)}`).join(', ');
  const html = `<div class="ph"><span>${d.name.toUpperCase()}</span><button class="x" id="sp-x" type="button">×</button></div><div class="sp-body">${bits.join('')}<p>${d.desc}</p>${crew ? `<p>On duty: ${crew}</p>` : ''}</div>
    <div class="sp-btns">${b.done && b.cond < 100 ? `<button class="btn" id="sp-rep" type="button">REPAIR ${sim.repairCost(b)}</button>` : ''}${b.done && (d.crew || d.pw < 0) ? `<button class="btn" id="sp-off" type="button">${b.off ? 'SWITCH ON' : 'SWITCH OFF'}</button>` : ''}${b.type === 'seflag' ? `<button class="btn" id="sp-move" type="button">MOVE FLAG ${C.FLAGMOVE}</button>` : ''}${d.fixed ? '' : `<button class="btn danger" id="sp-del" type="button">${b.done ? 'DEMOLISH +' + Math.round(d.cost * C.REFUND) : 'CANCEL +' + d.cost}</button>`}</div>`;
  p.classList.remove('hidden');
  if (p._html === html) return;
  p.innerHTML = p._html = html;
  $('sp-x').onclick = () => select(null);
  if ($('sp-rep')) $('sp-rep').onclick = () => { if (!sim.repair(b.id)) flash('Not enough supplies.'); selPanel(); };
  if ($('sp-off')) $('sp-off').onclick = () => { sim.toggle(b.id); selPanel(); };
  if ($('sq-up')) $('sq-up').onclick = () => { sim.setSquads(b.id, b.squads + 1); selPanel(); };
  if ($('sq-dn')) $('sq-dn').onclick = () => { sim.setSquads(b.id, b.squads - 1); selPanel(); };
  if ($('sp-del')) $('sp-del').onclick = () => { sim.demolish(b.id); select(null); audio.play('demolish'); };
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
const ORDERS = [
  ['Build a Supply Depot near the landing pad', s => s.has('depot')],
  ['Build a Mess Hall so every vote can eat', s => s.has('mess')],
  ['Build a Barracks: recruits fill empty bunks', s => s.has('barracks')],
  ['Build a Firing Range to train recruits', s => s.has('range')],
  ['Lay a road to it (Expansion: Paved Road, drag)', s => s.roadsV > 1],
  ['Ship trained troopers to the front (16:00)', s => s.stats.deployed > 0],
  ['Build a Patrol Office for standing patrols', s => s.has('patrol')],
  ['Raise two Banners with your crest', s => s.b.filter(b => b.type === 'banner' && b.done).length >= 2],
  ['Score 60+ in an inspection', s => s.inspection && s.inspection.score >= 60],
  ['Reach 1st place in the standings', s => s.rank === 0],
];
function hud() {
  const s = sim;
  $('r-sup').textContent = fmt(s.supplies);
  $('r-pw').textContent = `${s.power.made}/${s.power.used}`; $('r-pw').parentElement.classList.toggle('bad', s.power.ratio < 1);
  const home = s.troops.filter(t => t.state !== 'patrol').length;
  $('r-trp').textContent = `${home}/${s.troops.length}/${s.beds}`; $('r-trp').parentElement.classList.toggle('bad', s.troops.length > s.beds);
  $('r-mrl').textContent = Math.round(s.morale) + (s.moraleTarget > s.morale + 1 ? '↑' : s.moraleTarget < s.morale - 1 ? '↓' : '');
  $('r-mrl').parentElement.classList.toggle('bad', s.morale < 40);
  const use = s.usage();
  for (const g of GKEYS) { const n = Math.floor(s.amount(g)), u = use[g], el = $('r-' + (g === 'rations' ? 'rat' : g)); el.textContent = n; el.parentElement.classList.toggle('bad', u > 0 && n < u * 0.5); }
  const readyN = s.troops.filter(t => t.train >= 100 && t.state !== 'patrol').length, rec = s.troops.filter(t => t.train < 100).length;
  $('r-ready').textContent = `${readyN}/${rec}`;
  $('w-title').textContent = `WEEK ${s.week}`; $('w-fill').style.width = (s.wt / C.WEEK * 100) + '%'; $('w-insp').style.left = (C.INSPECT_AT * 100) + '%';
  const left = Math.ceil((C.WEEK - s.wt) / C.DAY);
  $('w-rank').textContent = `${['1ST', '2ND', '3RD', '4TH'][s.rank]} OF 4 · ALLOCATION IN ${left} DAY${left === 1 ? '' : 'S'}`;
  const hh = Math.floor(s.time.hour), mm = Math.floor((s.time.hour - hh) * 60 / 10) * 10;
  $('ck-day').textContent = `DAY ${s.time.day}`; $('ck-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('ck-phase').textContent = { night: 'LIGHTS OUT', firstcall: 'FIRST CALL', reveille: 'REVEILLE', pt: 'PT', chow: 'CHOW', mess: 'MESS', work: 'DUTY', retreat: 'RETREAT', evening: 'FREE TIME' }[s.time.phase];
  // standings
  const rows = s.table();
  $('stand').innerHTML = rows.map((r, i) => `<div class="srow ${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><canvas data-logo="${i}"></canvas><span class="nm">${esc(r.name)}</span><span class="tot">${s.total(r.stand)}</span>
    <div class="bars3" style="grid-column:2/5">${MKEYS.map(m => `<span><i style="width:${r.stand[m]}%;background:var(--${m})"></i></span>`).join('')}</div></div>`).join('')
    + `<div class="sfoot">Next allocation ${['1st', '2nd', '3rd', '4th'][s.rank]}: ~${fmt(C.ALLOC.base * C.ALLOC.mult[s.rank])} SUP. <span class="c-def">DEF</span> <span class="c-pro">EXP</span> <span class="c-tru">TRU</span></div>`;
  rows.forEach((r, i) => { const c = $('stand').querySelector(`[data-logo="${i}"]`); c.outerHTML = `<img src="${logoImg(r.logo)}" width="22" height="22" alt="">`; });
  // first orders
  const done = ORDERS.map(o => o[1](s)), next = done.indexOf(false);
  $('orders').classList.toggle('hidden', next < 0);
  $('or-list').innerHTML = ORDERS.map((o, i) => `<li class="${done[i] ? 'done' : i === next ? 'next' : ''}">${o[0]}</li>`).join('');
  // the build bar's affordability, and the selection
  for (const b of document.querySelectorAll('.bi')) { const k = b.dataset.b; if (!B[k]) continue; b.classList.toggle('poor', s.supplies < B[k].cost); b.classList.toggle('lock', !!s.locked(k)); }
  if (selId) selPanel();
  if (!$('mins').classList.contains('hidden')) renderMins();
  // the Ministry dock, bottom right: what each Ministry has waiting
  const o = s.orders[0], low = GKEYS.filter(g => use[g] > 0 && s.amount(g) < use[g] * 0.5);
  $('md-def').textContent = o ? `${o.sent}/${o.n} shipped` : `${s.patrols.length} patrols out`;
  $('md-pro').textContent = low.length ? `${low.map(g => GOODS[g].short).join(', ')} low` : s.hunger > 0.15 ? 'votes hungry' : 'supplies OK';
  $('md-tru').textContent = s.inspected ? 'inspected' : `inspects in ${days(C.WEEK * C.INSPECT_AT - s.wt)}`.replace(' days', 'd').replace(' hours', 'h');
  $('md-st').textContent = `${['1st', '2nd', '3rd', '4th'][s.rank]} of 4`;
  $('md-sci').textContent = s.tech.cur ? `${Math.floor(s.tech.pts / TECH[s.tech.cur].hrs * 100)}%` : s.has('lab') ? 'idle' : `${s.tech.done.length}/${Object.keys(TECH).length}`;
  document.querySelector('[data-mt="sci"]').classList.toggle('alert', s.has('lab') && !s.tech.cur && Object.keys(TECH).some(k => s.techState(k) === 'open'));
  document.querySelector('[data-mt="def"]').classList.toggle('alert', !!o && o.due - s.time.day <= 1 && o.sent < o.n);
  document.querySelector('[data-mt="pro"]').classList.toggle('alert', low.length > 0 || s.hunger > 0.15);
  for (const b of document.querySelectorAll('.md')) b.classList.toggle('on', !$('mins').classList.contains('hidden') && b.dataset.mt === minTab);
}
let commsN = 0;
function renderComms(all) {
  if (!all && sim.log.length === commsN) return; commsN = sim.log.length;
  $('c-list').innerHTML = sim.log.slice(-30).reverse().map(l => `<div class="cm"><em style="color:${CH[l.ch][1]}">${CH[l.ch][0]}</em>${esc(l.text)}</div>`).join('');
}

// ---------------------------------------------------------------- the Ministries
const vPick = {};   // vehicles picked for each special operation card
function renderMins(force) {
  const s = sim;
  const tabs = [['def', 'DEFENCE'], ['pro', 'EXPANSION'], ['tru', 'TRUTH'], ['sci', 'SCIENCE'], ['st', 'STANDINGS']].map(([k, n]) => `<button class="btn ${minTab === k ? 'on' : ''}" data-t="${k}" type="button">${n}</button>`).join('');
  if ($('mi-tabs')._html !== tabs) $('mi-tabs').innerHTML = $('mi-tabs')._html = tabs;
  let h = '';
  const head = m => `<div class="mi-head"><div class="big c-${m}">${Math.round(s.stand[m])}</div><div><b class="c-${m}">${MIN[m].name.toUpperCase()}</b><p>${MIN[m].wants} Standing drifts back toward ${C.STAND.rest} every week.</p></div></div>`;
  if (minTab === 'def') {
    const home = s.troops.filter(t => t.state !== 'patrol'), ready = home.filter(t => t.train >= 100).length, rec = s.troops.filter(t => t.train < 100), training = rec.filter(t => t.at).length;
    h += head('def') + `<h3>DEPLOYMENT ORDERS</h3>`;
    if (!s.orders.length) h += `<p>No orders open. The next comes with the week.</p>`;
    for (const o of s.orders) h += `<div class="card2"><div class="l"><b>${o.n} TRAINED TROOPERS TO THE FRONT</b><span>${o.sent} shipped · due day ${o.due} (${Math.max(0, o.due - s.time.day)} days left) · +${C.DEPLOY_PAY} SUP each, +${o.def} DEF when complete</span><div class="prog"><i style="width:${o.sent / o.n * 100}%"></i></div></div></div>`;
    h += `<p>Transports leave from the landing pad at ${C.DEPLOY_AT}:00 every day, ${s.padSeats() * s.b.filter(b => b.done && B[b.type].pad).length} seats a day across your pads. They take trained troopers who aren't crewing a building; the Patrol Office keeps its own squads back.</p>`;
    h += `<h3>TRAINING</h3><div class="kv"><span>READY TO SHIP</span><b>${ready}</b></div><div class="kv"><span>RECRUITS</span><b>${rec.length}</b></div><div class="kv"><span>IN TRAINING RIGHT NOW</span><b>${training}</b></div>`;
    const places = s.b.filter(b => b.done && B[b.type].slots);
    h += places.length ? places.map(b => `<div class="kv"><span>${B[b.type].name}</span><b>${s.troops.filter(t => t.at === b.id).length}/${B[b.type].slots} · ${TRAIN[B[b.type].train]} per hour</b></div>`).join('') : `<p class="warn">Nowhere to train. Build a Firing Range, an Obstacle Course or a Parade Ground.</p>`;
    h += `<p class="fine left">Recruits train from 08:00 to 20:00, except at lunch. 100 points makes a trooper. Recruits arrive with the morning supply pelican and fill empty bunks: more housing, more recruits.</p>`;
    const offices = s.b.filter(b => b.type === 'patrol' && b.done);
    h += `<h3>STANDING PATROLS</h3>` + (offices.length ? offices.map(b => `<div class="kv"><span>Patrol Office</span><b>${s.patrols.filter(p => p.office === b.id).length} of ${b.squads} squads out · ammo ${Math.floor(b.stock.ammo)}</b></div>`).join('') : `<p>Build a Patrol Office and it sends squads of three trained troopers out every morning at ${C.PATROL_AT}:00, on its own.</p>`);
    h += `<h3>SPECIAL OPERATIONS (OPTIONAL)</h3>`;
    for (const o of s.offers) {
      const pick = (vPick[o.id] || []).filter(k => s.armourFree(k)), ch = s.chance({ ...o, veh: pick }), ok = home.length >= o.size;
      const vb = ['frv', 'tank'].filter(k => s.veh.some(v => v.kind === k)).map(k => { const free = s.armourFree(k), on = pick.includes(k);
        return `<button class="btn ${on ? 'on' : ''}" data-veh="${o.id}:${k}" ${free ? '' : 'disabled'} type="button" title="${VEHICLES[k].desc} Burns ${VEHICLES[k].fuel} fuel.">${on ? '✓ ' : '+ '}${VEHICLES[k].name.toUpperCase()}</button>`; }).join('');
      h += `<div class="card2"><div class="l"><b>${esc(o.op)}${o.heavy ? ' <span class="warn">· HEAVY</span>' : ''}</b><span>${o.kind} · difficulty ${'◆'.repeat(o.diff)}${'◇'.repeat(5 - o.diff)} · ${o.size} troopers · ${days(o.dur * C.PATROL)} · reward +${o.def} DEF, +${o.sup} SUP</span>${vb ? `<div class="vpick">${vb}</div>` : ''}</div>
        <div style="text-align:right"><b class="${ch >= 0.65 ? 'up' : ch < 0.45 ? 'down' : 'warn'}">${ok ? Math.round(ch * 100) + '%' : '—'}</b><br><button class="btn" data-send="${o.id}" ${ok ? '' : 'disabled'} type="button">SEND</button></div></div>`;
    }
    if (!s.has('vbay')) h += `<p class="fine left">Research Fast Recon Vehicles and build a Vehicle Bay, and operations can take an FRV, or later a tank, along.</p>`;
    if (s.patrols.length) { h += `<h3>IN THE FIELD</h3>`; for (const p of s.patrols) h += `<div class="card2"><div class="l"><b>${esc(p.op)}</b><span>${p.brief > 0 ? 'BRIEFING · ' : ''}${p.kind} · ${p.members.length} troopers${p.veh?.length ? ' · ' + p.veh.map(k => VEHICLES[k].name).join(', ') : ''} · odds ${Math.round(p.chance * 100)}%</span><div class="prog"><i style="width:${p.t / p.dur * 100}%"></i></div></div></div>`; }
    if (s.honours.length) h += `<h3>MEDALS OF VALOUR</h3><div class="list2">${s.honours.slice(-12).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, week ${x.week}</div>`).join('')}</div>`;
    if (s.fallen.length) h += `<h3>THE FALLEN</h3><div class="list2">${s.fallen.slice(-16).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, ${esc(x.op)}</div>`).join('')}</div>`;
  } else if (minTab === 'pro') {
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
  } else if (minTab === 'sci') {
    const labs = s.b.filter(b => b.type === 'lab' && b.done), rate = s.labRate();
    h += `<p>A Science Lab researches one upgrade at a time while it is staffed and powered. More labs, faster research. Research is paid for up front.</p>`;
    if (!s.has('comms')) h += `<p class="warn">Build a Comms Tower, then a Science Lab, to start research.</p>`;
    else if (!labs.length) h += `<p class="warn">Build a Science Lab to start research.</p>`;
    else h += `<div class="kv"><span>LABS</span><b>${labs.length} · ${rate.toFixed(1)} lab hours per hour</b></div>`;
    if (s.tech.cur) { const k = s.tech.cur; h += `<div class="card2"><div class="l"><b>RESEARCHING: ${TECH[k].name.toUpperCase()}</b><span>${Math.floor(s.tech.pts)} of ${TECH[k].hrs} lab hours${rate > 0 ? ` · about ${days((TECH[k].hrs - s.tech.pts) / rate * C.DAY / 24)} left` : ' · stalled: the lab needs crew and power'}</span><div class="prog"><i style="width:${s.tech.pts / TECH[k].hrs * 100}%"></i></div></div></div>`; }
    h += `<div class="tech">` + [1, 2, 3].map(tier => `<div class="col"><i>TIER ${tier}</i>` + Object.entries(TECH).filter(([, t]) => t.tier === tier).map(([k, t]) => {
      const st = s.techState(k), can = st === 'open' && labs.length && !s.tech.cur && s.supplies >= t.cost;
      return `<div class="tn ${st}"><b>${t.name}</b><span>${t.desc}</span>${t.needs ? `<span>Needs ${t.needs.map(n => TECH[n].name).join(', ')}</span>` : ''}`
        + (st === 'done' ? '<span>RESEARCHED</span>' : st === 'busy' ? '<span>IN THE LAB</span>' : `<button class="btn" data-tech="${k}" ${can ? '' : 'disabled'} type="button">RESEARCH · ${t.cost} SUP · ${t.hrs}h</button>`) + `</div>`;
    }).join('') + `</div>`).join('') + `</div>`;
    h += `<h3>LANDING PADS</h3><div class="kv"><span>PADS</span><b>${s.count('pad')} of ${s.padCap()} allowed</b></div><p class="fine left">Your first pad needs no Comms Tower. Each tower lets you run ${s.hasTech('radio') ? 3 : 2} more. Every pad gets its own pelican: ${s.padLoad()} goods and ${s.padSeats()} seats a flight.</p>`;
  } else if (minTab === 'tru') {
    const ins = s.inspection, at = C.WEEK * C.INSPECT_AT - s.wt;
    h += head('tru') + `<p>${s.inspected ? 'This week\'s inspection is done.' : `Next inspection in ${days(at)}.`} The score is 35% morale, 45% propaganda and 20% condition. Truth standing moves most of the way to the score.</p>`;
    h += `<h3>RIGHT NOW</h3><div class="kv"><span>MORALE</span><b>${Math.round(s.morale)}</b></div><div class="kv"><span>PROPAGANDA</span><b>${s.prop}</b></div><div class="kv"><span>CONDITION</span><b>${Math.round(s.avgCond)}</b></div><div class="kv"><span>LIKELY SCORE</span><b>${Math.round(0.35 * s.morale + 0.45 * s.prop + 0.2 * s.avgCond)}</b></div>`;
    h += `<h3>MORALE, PIECE BY PIECE</h3>` + Object.entries(s.mor).filter(([, v]) => v).map(([k, v]) => `<div class="kv"><span>${{ base: 'baseline', comfort: 'comfort (mess, habs, vending, domes)', prop: 'propaganda', pride: 'medals', food: 'hunger', noise: 'noise near housing', crowd: 'votes without housing', latrine: 'latrine queues and filth', power: 'power cuts', grief: 'grief', worn: 'worn-out buildings' }[k]}</span><b class="${v < 0 ? 'down' : 'up'}">${v > 0 ? '+' : ''}${v}</b></div>`).join('');
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
}
$('mi-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { minTab = b.dataset.t; renderMins(true); } };
$('mi-body').onclick = e => {
  const s = e.target.closest('[data-send]');
  if (s && sim.send(+s.dataset.send, vPick[s.dataset.send] || [])) { delete vPick[s.dataset.send]; renderMins(true); renderComms(); }
  const v = e.target.closest('[data-veh]');
  if (v) { const [id, k] = v.dataset.veh.split(':'), cur = vPick[id] || []; vPick[id] = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; renderMins(true); }
  const t = e.target.closest('[data-tech]');
  if (t && sim.research(t.dataset.tech)) { audio.play('built'); renderMins(true); renderComms(); }
};
function toggleMins(tab) { const m = $('mins'), open = m.classList.contains('hidden') || (tab && tab !== minTab); if (tab) minTab = tab; m.classList.toggle('hidden', !open); if (open) renderMins(true); }
$('mdock').onclick = e => { const b = e.target.closest('[data-mt]'); if (b) toggleMins(b.dataset.mt); };
$('mi-x').onclick = () => $('mins').classList.add('hidden');
$('b-week').onclick = () => toggleMins('st'); $('stand').onclick = () => toggleMins('st');
$('or-x').onclick = () => $('orders').classList.toggle('min');

// ---------------------------------------------------------------- photo mode: a free camera, no interface
let photo = false, photoFrozen = false;
function setPhoto(on) {
  photo = on; view.setPhoto(on); tool = null; view.setGhost(null); view.showRoadGhost(null); select(null); hideTip();
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
function sndLabel() { $('b-snd').classList.toggle('on', !audio.isMuted()); $('b-snd').style.textDecoration = audio.isMuted() ? 'line-through' : ''; }
$('b-snd').onclick = () => { audio.setMuted(!audio.isMuted()); sndLabel(); }; sndLabel();
addEventListener('pointerdown', () => audio.unlock(), { capture: true }); addEventListener('keydown', () => audio.unlock(), { capture: true });
$('b-rl').onclick = () => view.rotate(-1); $('b-rr').onclick = () => view.rotate(1);
$('b-hide').onclick = () => $('hud').classList.toggle('bare');
$('b-menu').onclick = () => { $('menu').classList.toggle('hidden'); $('me-msg').textContent = ''; $('me-code').classList.add('hidden'); };
$('me-x').onclick = $('me-resume').onclick = () => $('menu').classList.add('hidden');
$('me-howto').onclick = () => { $('menu').classList.add('hidden'); show('s-howto'); };
$('me-faction').onclick = () => { $('menu').classList.add('hidden'); wasPaused = paused; paused = true; openFaction(true); };
$('me-new').onclick = () => { if (confirm('Found a new faction? This base will be gone for good unless you copied its save code.')) { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } playing = false; $('menu').classList.add('hidden'); title(); } };
$('me-export').onclick = async () => {
  const code = await exportCode(), t = $('me-code'); t.value = code; t.classList.remove('hidden'); t.select();
  try { await navigator.clipboard.writeText(code); $('me-msg').textContent = 'Save code copied. Keep it somewhere safe; it is your whole base.'; } catch { $('me-msg').textContent = 'Copy the code above and keep it somewhere safe.'; }
};
$('me-import').onclick = async () => {
  const t = $('me-code');
  if (t.classList.contains('hidden') || !t.value.trim()) { t.value = ''; t.classList.remove('hidden'); t.focus(); $('me-msg').textContent = 'Paste a save code, then press LOAD SAVE CODE again.'; return; }
  try { const st = await importCode(t.value); await start(new Sim({ state: st })); store(); $('menu').classList.add('hidden'); } catch { $('me-msg').textContent = 'That is not a save code this game can read.'; }
};

// ---------------------------------------------------------------- pointer and touch
const cv = $('view'), ptrs = new Map();
let drag = null, pinch = null, roadDrag = null;
const isRoad = t => !!RTOOLS[t];
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
  if (e.pointerType === 'mouse') tip(`${RTOOLS[tool].name}: ${c.cost} SUP${c.ok ? '' : ` · ${esc(c.why)}`}`, e.clientX, e.clientY);
}
function tileAt(e) {
  const p = view.pick(e.clientX, e.clientY);
  if (!tool) return p;
  const [w, d] = dims(tool === 'moveflag' ? 'seflag' : tool, rot); return { ...p, tx: Math.round(p.x - w / 2), tz: Math.round(p.z - d / 2) };
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!playing) return;
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; drag = null; return; }
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
      else { view.zoomBy(pinch.d / Math.max(1, d)); view.zoomT = view.zoom = Math.max(4, Math.min(30, view.zoomT)); }
      view.spin(-(ang - pinch.ang)); pinch.d = d; pinch.ang = ang;
    } else if (drag) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) { if (drag.btn === 2 || drag.btn === 1) { view.spin(-dx * 0.008); if (photo) view.tiltBy(dy * 0.006); } else view.pan(dx, dy); }
    }
  }
  if (photo) return;
  if (isRoad(tool)) roadPreview(e);
  else if (tool === 'moveflag') { const t = tileAt(e); hover = t; const ok = sim.canMoveFlag(t.tx, t.tz); view.setGhost('seflag', t.tx, t.tz, 0, ok.ok); view.showPlaza(sim.plazaAt(t.tx, t.tz, sim.b.find(b => b.type === 'seflag').id), ok.ok); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (tool) { const t = tileAt(e); hover = t; const ok = sim.canPlace(tool, t.tx, t.tz, rot); view.setGhost(tool, t.tx, t.tz, rot, ok.ok); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (e.pointerType === 'mouse' && !p0) {
    const p = view.pick(e.clientX, e.clientY);
    if (p.bid) { const b = sim.byId(p.bid); tip(`<b>${B[b.type].name}</b>${b.done ? '' : ` · ${Math.round(b.prog * 100)}% built`}`, e.clientX, e.clientY); cv.style.cursor = 'pointer'; }
    else { if (flashT <= 0) hideTip(); cv.style.cursor = ''; }
  }
});
function up(e) {
  if (!playing) return;
  ptrs.delete(e.pointerId);
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
  if (d.btn === 2) { if (tool) { tool = null; view.setGhost(null); view.showPlaza(null); view.showRoadGhost(null); buildBar(); } else select(null); return; }
  if (tool === 'moveflag') {
    const t = tileAt(e), r = sim.moveFlag(t.tx, t.tz);
    if (!r.ok) { flash(r.why); audio.play('deny'); return; }
    tool = null; view.setGhost(null); view.showPlaza(null); audio.play('place'); return;
  }
  if (tool) {
    const t = tileAt(e), ok = sim.canPlace(tool, t.tx, t.tz, rot);
    if (!ok.ok) { flash(ok.why); audio.play('deny'); return; }
    sim.place(tool, t.tx, t.tz, rot); buildBar(); audio.play('place');
    if (!e.shiftKey && !['banner', 'hdbanner', 'flag', 'solar', 'vend', 'speaker', 'potty'].includes(tool)) { tool = null; view.setGhost(null); buildBar(); }
    else view.setGhost(tool, t.tx, t.tz, rot, sim.canPlace(tool, t.tx, t.tz, rot).ok);
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
  if (!playing) return;
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
  else if (k === 'escape') { if (tool) { tool = null; view.setGhost(null); view.showPlaza(null); view.showRoadGhost(null); buildBar(); } else if (!$('mins').classList.contains('hidden')) $('mins').classList.add('hidden'); else if (!$('menu').classList.contains('hidden')) $('menu').classList.add('hidden'); else select(null); }
  else if (k === 'm') toggleMins();
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
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) {
    const fx = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
    const fz = (held.has('w') || held.has('arrowup') ? 1 : 0) - (held.has('s') || held.has('arrowdown') ? 1 : 0);
    if (fx || fz) view.move(fx, fz, dt);
    if (!paused) {
      acc += dt * gameSpeed();
      while (acc >= 0.1) { sim.step(0.1); acc -= 0.1; }
      for (const ev of sim.drain()) {
        life.event(ev); if (ev.t === 'built' || ev.t === 'week') buildBar();
        if (ev.t === 'built') audio.play('built');
        if (ev.t === 'say') audio.play('ping', ev.ch);
        if (ev.t === 'patrolBack' && ev.hero) audio.play('medal');
        if (ev.t === 'phase') { if (ev.phase === 'reveille') audio.play('reveille'); if (ev.phase === 'retreat') audio.play('retreat'); if (ev.phase === 'night') audio.play('taps'); }
        if (ev.t === 'moved') select(selId);
      }
      if (life.flights.some(f => !f.heard)) { for (const f of life.flights) f.heard = true; audio.play('pelican'); }
      life.update(dt * gameSpeed());
    }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); renderComms(); }
    saveT += dt; if (saveT > 20) { saveT = 0; store(); }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) hideTip(); }
  } else {
    view.spin(dt * 0.06);
    if (sim) { sim.step(dt); for (const ev of sim.drain()) life.event(ev); life.update(dt); }
  }
  if (sim && sim.time) { view.setTime(sim.time.hour); audio.setNight(1 - (view.dayLight ?? 1)); }
  view.frame(dt);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- go
title();
if (params.has('play')) { const s = stored(); start(s ? new Sim({ state: s }) : new Sim({ seed: +(params.get('seed') || 7) })); }
requestAnimationFrame(loop);
window.__fob = { get sim() { return sim; }, get life() { return life; }, view };
