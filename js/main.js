// The loop, the input, the HUD and the screens. The simulation is in sim.js, the people in life.js, the picture in view.js.
import { C, B, MIN, GROUPS, FACTION_DEFAULT, PLANETS } from './config.js';
import { Sim, MKEYS, rankOf, dims } from './sim.js';
import { Life } from './life.js';
import { View } from './view.js';
import { drawLogo, SHAPES, SYMBOLS, PALETTE } from './logo.js';
import { demoSim } from './demo.js';

const $ = id => document.getElementById(id);
const SAVE = 'fob-super-commander.save.v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const CH = { def: ['DEFENCE', 'var(--def)'], pro: ['PROSPERITY', 'var(--pro)'], tru: ['TRUTH', 'var(--tru)'], base: ['BASE', '#ffffff'], riv: ['BULLETIN', 'var(--amber)'], log: ['LOGISTICS', 'var(--g)'] };

const view = new View($('view'));
let sim = null, life = null, playing = false, paused = false, speed = 1, tool = null, rot = 0, hover = null, group = 'core', minTab = 'def';
let acc = 0, hudT = 0, saveT = 0, last = performance.now();
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
function start(s, play = true) {
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
  $('fx-title').textContent = edit ? 'EDIT YOUR FACTION' : 'FOUND YOUR FACTION';
  $('fx-go').textContent = edit ? 'SAVE CHANGES' : 'FOUND THE FACTION';
  $('fx-name').value = draft.name; $('fx-base').value = draft.base; $('fx-motto').value = draft.motto; $('fx-text').value = draft.logo.text;
  for (const sw of document.querySelectorAll('.sw')) {
    sw.innerHTML = PALETTE.map(c => `<button type="button" style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
  }
  fxDraw(); show('s-faction');
}
function getK(k) { return k.split('.').reduce((o, p) => o[p], draft); }
function setK(k, v) { const p = k.split('.'); const o = p.slice(0, -1).reduce((o, q) => o[q], draft); o[p.at(-1)] = v; }
function fxDraw() {
  const g = $('fx-prev').getContext('2d'); g.clearRect(0, 0, 200, 200); drawLogo(g, draft.logo, 6, 6, 188);
  $('fx-shape').textContent = draft.logo.shape; $('fx-symbol').textContent = draft.logo.symbol;
  for (const sw of document.querySelectorAll('.sw')) { const v = getK(sw.dataset.k); for (const b of sw.children) b.classList.toggle('on', b.dataset.c === v); }
}
document.querySelector('.fx').addEventListener('click', e => {
  const cy = e.target.closest('[data-cy]'), c = e.target.closest('[data-c]');
  if (cy) { const [k, d] = cy.dataset.cy.split(':'), list = k === 'shape' ? SHAPES : SYMBOLS; draft.logo[k] = list[(list.indexOf(draft.logo[k]) + +d + list.length) % list.length]; fxDraw(); }
  if (c) { setK(c.closest('.sw').dataset.k, c.dataset.c); fxDraw(); }
});
$('fx-text').addEventListener('input', e => { draft.logo.text = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); fxDraw(); });
$('fx-rand').onclick = () => {
  const p = a => a[Math.floor(Math.random() * a.length)];
  const A = ['Iron', 'Liberty', 'Crimson', 'Steadfast', 'Golden', 'Righteous', 'Ashen', 'Vigilant', 'Free', 'Thunder'], Bn = ['Lancers', 'Guard', 'Brigade', 'Legion', 'Wardens', 'Battalion', 'Rangers', 'Sentinels', 'Corps', 'Hammers'];
  draft.name = `${p(['1st', '3rd', '9th', '12th', '27th', '101st', '404th'])} ${p(A)} ${p(Bn)}`; draft.base = `${p(['Fort', 'Camp', 'FOB', 'Outpost', 'Firebase'])} ${p(['Resolve', 'Liberty', 'Vigil', 'Anvil', 'Dawn', 'Mercy', 'Ballot', 'Granite'])}`;
  draft.motto = p(['Freedom never sleeps.', 'Democracy, delivered hot.', 'We hold the line.', 'Paperwork and gunfire.', 'Always forward, never late.']);
  draft.primary = p(PALETTE); draft.secondary = p(PALETTE.filter(c => c !== draft.primary));
  draft.logo = { shape: p(SHAPES), symbol: p(SYMBOLS), bg: draft.primary, fg: draft.secondary, rim: draft.secondary, text: '' };
  $('fx-name').value = draft.name; $('fx-base').value = draft.base; $('fx-motto').value = draft.motto; $('fx-text').value = ''; fxDraw();
};
$('fx-back').onclick = () => editing ? (show(null), (paused = wasPaused)) : show('s-title');
let wasPaused = false;
$('fx-go').onclick = () => {
  draft.name = $('fx-name').value.trim() || 'Unnamed Loyal Faction'; draft.base = $('fx-base').value.trim() || 'FOB Nameless'; draft.motto = $('fx-motto').value.trim() || 'For Super Earth.';
  if (editing) { sim.faction = draft; view.setFaction(draft); drawWho(); show(null); paused = wasPaused; store(); return; }
  draft.planet = PLANETS[Math.floor(Math.random() * PLANETS.length)];
  start(new Sim({ faction: draft, seed: (Math.random() * 1e9) | 0 })); store();
};

$('b-new').onclick = () => openFaction(false);
$('b-continue').onclick = () => { const s = stored(); if (s) start(new Sim({ state: s })); };
$('b-howto').onclick = () => show('s-howto');
$('ht-x').onclick = () => show(playing ? null : 's-title');

// ---------------------------------------------------------------- the build bar
function buildBar() {
  $('b-groups').innerHTML = GROUPS.map(([k, n]) => `<button class="btn ${k === group ? 'on' : ''}" data-g="${k}" type="button">${n}</button>`).join('');
  const items = Object.entries(B).filter(([, d]) => d.group === group && !d.fixed);
  $('b-items').innerHTML = items.map(([k, d], i) => {
    const lk = sim.locked(k), poor = sim.supplies < d.cost;
    return `<button class="btn bi ${lk ? 'lock' : ''} ${poor ? 'poor' : ''} ${tool === k ? 'on' : ''}" data-b="${k}" type="button"><span class="k">${i + 1}</span><b>${d.name}</b><span class="cost">${d.cost} SUP</span></button>`;
  }).join('');
}
$('b-groups').onclick = e => { const b = e.target.closest('[data-g]'); if (b) { group = b.dataset.g; buildBar(); } };
$('b-items').onclick = e => { const b = e.target.closest('[data-b]'); if (b) pickTool(b.dataset.b); };
$('b-items').addEventListener('pointermove', e => {
  const b = e.target.closest('[data-b]'); if (!b) return hideTip();
  const k = b.dataset.b, d = B[k], lk = sim.locked(k);
  const bits = [d.pw > 0 ? `+${d.pw} power` : d.pw < 0 ? `${d.pw} power` : '', d.crew ? `crew ${d.crew}` : '', d.beds ? `${d.beds} beds` : '', d.mor ? `+morale` : '', d.prop ? `+propaganda` : '', `upkeep ${d.up}/wk`].filter(Boolean);
  tip(`<b>${d.name}</b><br>${d.desc}<br><span style="color:var(--g-dim)">${bits.join(' · ')}</span>` + (lk ? `<br><span class="warn">Needs ${lk.map(t => B[t].name).join(' and ')}</span>` : ''), e.clientX, e.clientY - 12, true);
});
$('b-items').addEventListener('pointerleave', hideTip);
function pickTool(k) {
  const lk = sim.locked(k);
  if (lk) { flash(`${B[k].name} needs ${lk.map(t => B[t].name).join(' and ')} first.`); return; }
  tool = tool === k ? null : k; select(null); buildBar();
  if (!tool) view.setGhost(null);
}
function tip(html, x, y, above) { const t = $('tip'); t.innerHTML = html; t.classList.remove('hidden'); const r = t.getBoundingClientRect(); t.style.left = Math.min(innerWidth - r.width - 6, Math.max(6, x - r.width / 2)) + 'px'; t.style.top = (above ? y - r.height : y + 18) + 'px'; }
function hideTip() { $('tip').classList.add('hidden'); }
let flashT = 0;
function flash(text) { tip(`<span class="warn">${esc(text)}</span>`, innerWidth / 2, innerHeight - 170, true); flashT = 2.2; }

// ---------------------------------------------------------------- selection
let selId = null;
function select(id) { selId = id; view.select(id ? sim.byId(id) : null); selPanel(); }
function selPanel() {
  const b = selId && sim.byId(selId), p = $('selp');
  if (!b) { p.classList.add('hidden'); return; }
  const d = B[b.type], bits = [];
  if (!b.done) bits.push(`<div class="kv"><span>CONSTRUCTION</span><b>${Math.round(b.prog * 100)}%</b></div><div class="meter"><i style="width:${b.prog * 100}%;background:var(--yellow)"></i></div>`);
  else {
    bits.push(`<div class="kv"><span>CONDITION</span><b class="${b.cond < 40 ? 'down' : ''}">${Math.round(b.cond)}%</b></div><div class="meter"><i style="width:${b.cond}%;background:${b.cond < 40 ? 'var(--red)' : b.cond < 70 ? 'var(--amber)' : 'var(--g)'}"></i></div>`);
    if (d.crew) bits.push(`<div class="kv"><span>CREW</span><b class="${b.crew < d.crew ? 'warn' : ''}">${b.crew} / ${d.crew}</b></div>`);
    if (d.crew || d.make || d.out) bits.push(`<div class="kv"><span>RUNNING AT</span><b>${Math.round(sim.work(b) * 100)}%</b></div>`);
    if (d.pw) bits.push(`<div class="kv"><span>POWER</span><b>${d.pw > 0 ? '+' : ''}${b.type === 'gen' ? Math.round(d.pw * sim.crewFrac(b) * (sim.e710 > 0 ? 1 : 0)) : d.pw}</b></div>`);
    if (d.beds) bits.push(`<div class="kv"><span>BEDS</span><b>${d.beds}</b></div>`);
    if (b.type === 'memorial') bits.push(`<div class="kv"><span>NAMES ON THE WALL</span><b>${sim.fallen.length}</b></div>`);
    if (b.off) bits.push(`<p class="warn">Switched off.</p>`);
  }
  const crew = sim.troops.filter(t => t.job === b.id).map(t => `${rankOf(t.missions)} ${esc(t.name)}`).join(', ');
  p.innerHTML = `<div class="ph"><span>${d.name.toUpperCase()}</span><button class="x" id="sp-x" type="button">×</button></div><div class="sp-body">${bits.join('')}<p>${d.desc}</p>${crew ? `<p>On duty: ${crew}</p>` : ''}</div>
    <div class="sp-btns">${b.done && b.cond < 100 ? `<button class="btn" id="sp-rep" type="button">REPAIR ${sim.repairCost(b)}</button>` : ''}${b.done && (d.crew || d.pw < 0) ? `<button class="btn" id="sp-off" type="button">${b.off ? 'SWITCH ON' : 'SWITCH OFF'}</button>` : ''}${d.fixed ? '' : `<button class="btn danger" id="sp-del" type="button">${b.done ? 'DEMOLISH +' + Math.round(d.cost * C.REFUND) : 'CANCEL +' + d.cost}</button>`}</div>`;
  p.classList.remove('hidden');
  $('sp-x').onclick = () => select(null);
  if ($('sp-rep')) $('sp-rep').onclick = () => { if (!sim.repair(b.id)) flash('Not enough supplies.'); selPanel(); };
  if ($('sp-off')) $('sp-off').onclick = () => { sim.toggle(b.id); selPanel(); };
  if ($('sp-del')) $('sp-del').onclick = () => { sim.demolish(b.id); select(null); };
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
  ['Build an E-710 Pump on the dark ground', s => s.has('pump')],
  ['Build a Supply Depot', s => s.has('depot')],
  ['Fill a requisition (Ministries, Prosperity)', s => s.stats.delivered > 0],
  ['Build a Barracks', s => s.has('barracks')],
  ['Send a patrol (Ministries, Defence)', s => s.stats.patrolsWon + s.stats.patrolsLost + s.patrols.length > 0],
  ['Build a Mess Hall for morale', s => s.has('mess')],
  ['Raise two Banners with your crest', s => s.b.filter(b => b.type === 'banner' && b.done).length >= 2],
  ['Build a Truth Office', s => s.has('truth')],
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
  $('r-e7').textContent = `${Math.floor(s.e710)}/${s.cap}`; $('r-shl').textContent = `${Math.floor(s.shells)}`;
  $('w-title').textContent = `WEEK ${s.week}`; $('w-fill').style.width = (s.wt / C.WEEK * 100) + '%'; $('w-insp').style.left = (C.INSPECT_AT * 100) + '%';
  $('w-rank').textContent = `${['1ST', '2ND', '3RD', '4TH'][s.rank]} OF 4 · ${Math.ceil(C.WEEK - s.wt)}S TO ALLOCATION`;
  // standings
  const rows = s.table();
  $('stand').innerHTML = rows.map((r, i) => `<div class="srow ${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><canvas data-logo="${i}"></canvas><span class="nm">${esc(r.name)}</span><span class="tot">${s.total(r.stand)}</span>
    <div class="bars3" style="grid-column:2/5">${MKEYS.map(m => `<span><i style="width:${r.stand[m]}%;background:var(--${m})"></i></span>`).join('')}</div></div>`).join('')
    + `<div class="sfoot">Next allocation ${['1st', '2nd', '3rd', '4th'][s.rank]}: ~${fmt(C.ALLOC.base * C.ALLOC.mult[s.rank])} SUP. <span class="c-def">DEF</span> <span class="c-pro">PRO</span> <span class="c-tru">TRU</span></div>`;
  rows.forEach((r, i) => { const c = $('stand').querySelector(`[data-logo="${i}"]`); c.outerHTML = `<img src="${logoImg(r.logo)}" width="22" height="22" alt="">`; });
  // first orders
  const done = ORDERS.map(o => o[1](s)), next = done.indexOf(false);
  $('orders').classList.toggle('hidden', next < 0);
  $('or-list').innerHTML = ORDERS.map((o, i) => `<li class="${done[i] ? 'done' : i === next ? 'next' : ''}">${o[0]}</li>`).join('');
  // the build bar's affordability, and the selection
  for (const b of document.querySelectorAll('.bi')) { const k = b.dataset.b; b.classList.toggle('poor', s.supplies < B[k].cost); b.classList.toggle('lock', !!s.locked(k)); }
  if (selId) selPanel();
  if (!$('mins').classList.contains('hidden')) renderMins();
}
let commsN = 0;
function renderComms(all) {
  if (!all && sim.log.length === commsN) return; commsN = sim.log.length;
  $('c-list').innerHTML = sim.log.slice(-30).reverse().map(l => `<div class="cm"><em style="color:${CH[l.ch][1]}">${CH[l.ch][0]}</em>${esc(l.text)}</div>`).join('');
}

// ---------------------------------------------------------------- the Ministries
function renderMins() {
  const s = sim;
  $('mi-tabs').innerHTML = [['def', 'DEFENCE'], ['pro', 'PROSPERITY'], ['tru', 'TRUTH'], ['st', 'STANDINGS']].map(([k, n]) => `<button class="btn ${minTab === k ? 'on' : ''}" data-t="${k}" type="button">${n}</button>`).join('');
  let h = '';
  const head = m => `<div class="mi-head"><div class="big c-${m}">${Math.round(s.stand[m])}</div><div><b class="c-${m}">${MIN[m].name.toUpperCase()}</b><p>${MIN[m].wants} Standing drifts back toward ${C.STAND.rest} every week.</p></div></div>`;
  if (minTab === 'def') {
    const home = s.troops.filter(t => t.state !== 'patrol');
    h += head('def') + `<h3>MISSIONS OFFERED THIS WEEK</h3>`;
    if (!s.offers.length) h += `<p>No more missions this week. New orders arrive with the allocation.</p>`;
    for (const o of s.offers) {
      const ch = s.chance(o), ok = home.length >= o.size;
      h += `<div class="card2"><div class="l"><b>${esc(o.op)}</b><span>${o.kind} · difficulty ${'◆'.repeat(o.diff)}${'◇'.repeat(5 - o.diff)} · ${o.size} troopers · ${o.dur}s · reward +${o.def} DEF, +${o.sup} SUP</span></div>
        <div style="text-align:right"><b class="${ch >= 0.65 ? 'up' : ch < 0.45 ? 'down' : 'warn'}">${ok ? Math.round(ch * 100) + '%' : '—'}</b><br><button class="btn" data-send="${o.id}" ${ok ? '' : 'disabled'} type="button">SEND</button></div></div>`;
    }
    h += `<p class="fine left">Odds rise with veterans, drill on the parade ground, morale and a staffed armory. Squads are taken from idle troops first, then from jobs, so a patrol can leave a pump unmanned.</p>`;
    if (s.patrols.length) { h += `<h3>IN THE FIELD</h3>`; for (const p of s.patrols) h += `<div class="card2"><div class="l"><b>${esc(p.op)}</b><span>${p.kind} · ${p.members.length} troopers · odds ${Math.round(p.chance * 100)}%</span><div class="prog"><i style="width:${p.t / p.dur * 100}%"></i></div></div></div>`; }
    if (s.honours.length) h += `<h3>MEDALS OF VALOUR</h3><div class="list2">${s.honours.slice(-12).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, week ${x.week}</div>`).join('')}</div>`;
    if (s.fallen.length) h += `<h3>THE FALLEN</h3><div class="list2">${s.fallen.slice(-16).reverse().map(x => `<div>${x.rank} ${esc(x.name)}, ${esc(x.op)}</div>`).join('')}</div>`;
  } else if (minTab === 'pro') {
    h += head('pro') + `<h3>REQUISITIONS</h3>`;
    if (!s.contracts.length) h += `<p>No requisitions open. More arrive each week.</p>`;
    for (const c of s.contracts) {
      const have = s[c.good], ok = have >= c.qty && s.has('pad'), left = c.due - s.week;
      h += `<div class="card2"><div class="l"><b>${c.qty} ${c.good === 'shells' ? 'SHELLS' : 'E-710'}</b><span>due ${left <= 0 ? 'this week' : `in ${left + 1} weeks`} · reward +${c.pro} PRO, +${c.sup} SUP · you have ${Math.floor(have)}</span><div class="prog"><i style="width:${Math.min(100, have / c.qty * 100)}%"></i></div></div>
        <button class="btn ${ok ? 'primary' : ''}" data-ship="${c.id}" ${ok ? '' : 'disabled'} type="button">SHIP</button></div>`;
    }
    const pumps = s.b.filter(b => b.type === 'pump' && b.done), plants = s.b.filter(b => b.type === 'plant' && b.done);
    const e7 = pumps.reduce((a, b) => a + B.pump.make * s.work(b), 0) * 60, sh = plants.reduce((a, b) => a + B.plant.out * s.work(b), 0) * 60;
    h += `<h3>PRODUCTION</h3><p>E-710: about ${Math.round(e7)} a minute from ${pumps.length} pump${pumps.length === 1 ? '' : 's'}. Shells: about ${Math.round(sh)} a minute from ${plants.length} plant${plants.length === 1 ? '' : 's'}, which use ${Math.round(sh / B.plant.out * B.plant.use)} E-710 a minute. Storage ${s.cap} of each.</p>`;
    if (!s.has('pad')) h += `<p class="warn">You need a Landing Pad to ship anything.</p>`;
    h += `<p class="fine left">A missed requisition costs 8 Prosperity standing.</p>`;
  } else if (minTab === 'tru') {
    const ins = s.inspection, at = C.WEEK * C.INSPECT_AT - s.wt;
    h += head('tru') + `<p>${s.inspected ? 'This week\'s inspection is done.' : `Next inspection in ${Math.ceil(at)}s.`} The score is 35% morale, 45% propaganda and 20% condition. Truth standing moves most of the way to the score.</p>`;
    h += `<h3>RIGHT NOW</h3><div class="kv"><span>MORALE</span><b>${Math.round(s.morale)}</b></div><div class="kv"><span>PROPAGANDA</span><b>${s.prop}</b></div><div class="kv"><span>CONDITION</span><b>${Math.round(s.avgCond)}</b></div><div class="kv"><span>LIKELY SCORE</span><b>${Math.round(0.35 * s.morale + 0.45 * s.prop + 0.2 * s.avgCond)}</b></div>`;
    h += `<h3>MORALE, PIECE BY PIECE</h3>` + Object.entries(s.mor).filter(([, v]) => v).map(([k, v]) => `<div class="kv"><span>${{ base: 'baseline', comfort: 'comfort (mess, habs, vending, domes)', prop: 'propaganda', pride: 'medals', noise: 'noise near beds', crowd: 'not enough beds', power: 'power cuts', grief: 'grief', worn: 'worn-out buildings' }[k]}</span><b class="${v < 0 ? 'down' : 'up'}">${v > 0 ? '+' : ''}${v}</b></div>`).join('');
    if (ins) h += `<h3>LAST REPORT, WEEK ${ins.week}: ${ins.score}/100 (${ins.delta >= 0 ? '+' : ''}${ins.delta})</h3><ul class="notes">${ins.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    h += `<p class="fine left">Every kind of propaganda counts for less the more of it you have, so a flag, banners, a loudspeaker, a statue and a pool beat ten banners.</p>`;
  } else {
    const rows = s.table();
    h += `<p>Every week Super Earth ranks the four loyal factions on ${s.planet} by their total standing and splits the allocation: 1st gets ${C.ALLOC.mult[0]}×, 4th gets ${C.ALLOC.mult[3]}×, and the recruits follow the same order.</p>`;
    h += `<table class="st"><tr><th>#</th><th>FACTION</th><th class="c-def">DEF</th><th class="c-pro">PRO</th><th class="c-tru">TRU</th><th>TOTAL</th><th>SHARE</th></tr>`
      + rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td><img src="${logoImg(r.logo)}" width="20" height="20" alt="" style="vertical-align:middle;margin-right:6px">${esc(r.name)}</td>${MKEYS.map(m => `<td>${Math.round(r.stand[m])}</td>`).join('')}<td><b>${s.total(r.stand)}</b></td><td>${fmt(C.ALLOC.base * C.ALLOC.mult[i])}</td></tr>`).join('') + `</table>`;
    h += `<p class="fine left">Last allocation: ${fmt(s.lastAlloc)} supplies. Patrols won ${s.stats.patrolsWon}, lost ${s.stats.patrolsLost}. Requisitions filled ${s.stats.delivered}. Inspections ${s.stats.inspections}.</p>`;
  }
  $('mi-body').innerHTML = h;
}
$('mi-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { minTab = b.dataset.t; renderMins(); } };
$('mi-body').onclick = e => {
  const s = e.target.closest('[data-send]'), d = e.target.closest('[data-ship]');
  if (s && sim.send(+s.dataset.send)) { renderMins(); renderComms(); }
  if (d && sim.deliver(+d.dataset.ship)) { renderMins(); renderComms(); }
};
function toggleMins(tab) { const m = $('mins'), open = m.classList.contains('hidden') || (tab && tab !== minTab); if (tab) minTab = tab; m.classList.toggle('hidden', !open); if (open) renderMins(); }
$('b-min').onclick = () => toggleMins(); $('mi-x').onclick = () => $('mins').classList.add('hidden');
$('b-week').onclick = () => toggleMins('st'); $('stand').onclick = () => toggleMins('st');
$('or-x').onclick = () => $('orders').classList.toggle('min');

// ---------------------------------------------------------------- top bar and menu
function setPause(p) { paused = p; $('b-pause').textContent = p ? '▶' : 'II'; $('b-pause').classList.toggle('on', p); $('paused').classList.toggle('hidden', !p); }
$('b-pause').onclick = () => setPause(!paused);
$('b-speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('b-speed').textContent = speed + '×'; };
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
  try { const st = await importCode(t.value); start(new Sim({ state: st })); store(); $('menu').classList.add('hidden'); } catch { $('me-msg').textContent = 'That is not a save code this game can read.'; }
};

// ---------------------------------------------------------------- pointer and touch
const cv = $('view'), ptrs = new Map();
let drag = null, pinch = null;
function tileAt(e) {
  const p = view.pick(e.clientX, e.clientY);
  if (!tool) return p;
  const [w, d] = dims(tool, rot); return { ...p, tx: Math.round(p.x - w / 2), tz: Math.round(p.z - d / 2) };
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!playing) return;
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false };
});
cv.addEventListener('pointermove', e => {
  if (!playing) return;
  const p0 = ptrs.get(e.pointerId);
  if (p0) {
    const dx = e.clientX - p0.x, dy = e.clientY - p0.y; p0.x = e.clientX; p0.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      view.zoomBy(pinch.d / Math.max(1, d)); view.zoomT = view.zoom = Math.max(4, Math.min(30, view.zoomT));
      view.spin(-(ang - pinch.ang)); pinch.d = d; pinch.ang = ang;
    } else if (drag) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) { if (drag.btn === 2 || drag.btn === 1) view.spin(-dx * 0.008); else view.pan(dx, dy); }
    }
  }
  if (tool) { const t = tileAt(e); hover = t; const ok = sim.canPlace(tool, t.tx, t.tz, rot); view.setGhost(tool, t.tx, t.tz, rot, ok.ok); if (!ok.ok && e.pointerType === 'mouse') tip(esc(ok.why), e.clientX, e.clientY); else if (flashT <= 0) hideTip(); }
  else if (e.pointerType === 'mouse' && !p0) {
    const p = view.pick(e.clientX, e.clientY);
    if (p.bid) { const b = sim.byId(p.bid); tip(`<b>${B[b.type].name}</b>${b.done ? '' : ` · ${Math.round(b.prog * 100)}% built`}`, e.clientX, e.clientY); cv.style.cursor = 'pointer'; }
    else { if (flashT <= 0) hideTip(); cv.style.cursor = ''; }
  }
});
function up(e) {
  if (!playing) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) return;
  if (d.btn === 2) { if (tool) { tool = null; view.setGhost(null); buildBar(); } else select(null); return; }
  if (tool) {
    const t = tileAt(e), ok = sim.canPlace(tool, t.tx, t.tz, rot);
    if (!ok.ok) { flash(ok.why); return; }
    sim.place(tool, t.tx, t.tz, rot); buildBar();
    if (!e.shiftKey && !['banner', 'flag', 'solar', 'vend', 'speaker'].includes(tool)) { tool = null; view.setGhost(null); buildBar(); }
    else view.setGhost(tool, t.tx, t.tz, rot, sim.canPlace(tool, t.tx, t.tz, rot).ok);
    return;
  }
  const p = view.pick(e.clientX, e.clientY); select(p.bid);
}
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); view.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------------------------------------------------------------- keys
const held = new Set();
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase(); held.add(k);
  if (!playing) return;
  if (k === 'q') view.rotate(-1);
  else if (k === 'e') view.rotate(1);
  else if (k === 'r') { rot = (rot + 1) % 4; if (tool && hover) view.setGhost(tool, hover.tx, hover.tz, rot, false); }
  else if (k === ' ') { e.preventDefault(); setPause(!paused); }
  else if (k === 'escape') { if (tool) { tool = null; view.setGhost(null); buildBar(); } else if (!$('mins').classList.contains('hidden')) $('mins').classList.add('hidden'); else if (!$('menu').classList.contains('hidden')) $('menu').classList.add('hidden'); else select(null); }
  else if (k === 'm') toggleMins();
  else if (k === 'h') $('hud').classList.toggle('bare');
  else if (k === 'tab') { e.preventDefault(); const i = GROUPS.findIndex(g => g[0] === group); group = GROUPS[(i + (e.shiftKey ? GROUPS.length - 1 : 1)) % GROUPS.length][0]; buildBar(); }
  else if (k === 'delete' || k === 'backspace') { if (selId && !B[sim.byId(selId)?.type]?.fixed) { sim.demolish(selId); select(null); } }
  else if (/^[1-9]$/.test(k)) { const items = Object.entries(B).filter(([, d]) => d.group === group && !d.fixed); if (items[+k - 1]) pickTool(items[+k - 1][0]); }
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
      acc += dt * speed;
      while (acc >= 0.1) { sim.step(0.1); acc -= 0.1; }
      for (const ev of sim.drain()) { life.event(ev); if (ev.t === 'built' || ev.t === 'week') buildBar(); }
      life.update(dt * speed);
    }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); renderComms(); }
    saveT += dt; if (saveT > 20) { saveT = 0; store(); }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) hideTip(); }
  } else {
    view.spin(dt * 0.06);
    if (sim) { sim.step(dt); for (const ev of sim.drain()) life.event(ev); life.update(dt); }
  }
  view.frame(dt);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- go
title();
if (params.has('play')) { const s = stored(); start(s ? new Sim({ state: s }) : new Sim({ seed: +(params.get('seed') || 7) })); }
requestAnimationFrame(loop);
window.__fob = { get sim() { return sim; }, get life() { return life; }, view };
