// Every tuning number in FOB Super Commander lives here: the buildings, the Ministries, the rivals and the week.

export const VERSION = '0.3';

export const C = {
  N: 40,                    // the base is N x N tiles; the outer ring is the perimeter wall
  WEEK: 150,                // seconds of game time in one allocation week
  INSPECT_AT: 0.55,         // the Ministry of Truth inspects this far into each week
  START: { supplies: 1500, troops: 6, morale: 55 },
  // Super Earth splits its allocation by rank: 1st, 2nd, 3rd, 4th.
  ALLOC: { base: 650, mult: [1.5, 1.15, 0.85, 0.6], recruits: [5, 4, 3, 2] },
  STAND: { start: 40, rest: 30, drift: 0.12 },    // standings drift back toward "rest" every week
  STORE: { base: 80, depot: 200, shed: 100 },                // how much E-710 and how many shells fit
  WEAR: 3, MAINT: 12, UNPAID: 22,                 // condition: lost every week, regained when paid, lost when unpaid
  REFUND: 0.5,
  OVERFLOW: 4,              // recruits beyond the beds Super Earth will still send
};

// The three Ministries a loyal faction answers to.
export const MIN = {
  def: { name: 'Ministry of Defence', short: 'DEFENCE', key: 'D', wants: 'Patrols that come back victorious.' },
  pro: { name: 'Ministry of Expansion', short: 'EXPANSION', key: 'X', wants: 'Requisitions filled on time: extraction, industry and shipping.' },
  tru: { name: 'Ministry of Truth', short: 'TRUTH', key: 'T', wants: 'A base that inspires: morale, propaganda and upkeep.' },
};

// The build bar is grouped by the Ministry that owns each building. Humanity has no standing yet; it arrives later.
export const GROUPS = [
  ['expansion', 'EXPANSION', ['core', 'power', 'industry']], ['defence', 'DEFENCE', ['military']],
  ['humanity', 'HUMANITY', ['living']], ['truth', 'TRUTH', ['propaganda']],
];

// w x d is the footprint before rotation. pw: power made (+) or used (-). up: upkeep each week. crew: troops it needs to run.
// mor: morale it adds. prop: propaganda it adds. needs: buildings that must stand first (the tech tree).
export const B = {
  hq:       { name: 'Command HQ', group: 'core', w: 3, d: 3, cost: 0, up: 0, pw: 6, beds: 6, unique: true, fixed: true,
              desc: 'The heart of the faction. Houses six votes and keeps a little power on.' },
  seflag:   { name: 'Super Earth Flag', group: 'core', w: 2, d: 2, cost: 0, up: 0, prop: 6, mor: 2, unique: true, fixed: true,
              desc: 'Every base flies one, at its centre. It cannot be removed. Troops salute it, and medals are pinned beneath it.' },
  pad:      { name: 'Landing Pad', group: 'core', w: 3, d: 3, cost: 300, up: 20, pw: -1,
              desc: 'Pelicans land here with allocations, recruits and inspectors, and take your requisitions away.' },
  depot:    { name: 'Supply Depot', group: 'core', w: 2, d: 2, cost: 180, up: 12,
              desc: 'Stores 200 more E-710 and shells. Comes with a forklift.' },
  shed:     { name: 'SEAF Bunker', group: 'core', w: 2, d: 2, cost: 120, up: 6,
              desc: 'A standard-issue storage bunker. Holds 100 more E-710 and shells, and looks exactly like a shed.' },

  solar:    { name: 'Solar Array', group: 'power', w: 2, d: 1, cost: 90, up: 5, pw: 4,
              desc: 'Clean, quiet, patriotic power. Not much of it.' },
  gen:      { name: 'E-710 Generator', group: 'power', w: 2, d: 2, cost: 220, up: 15, pw: 14, crew: 1, burn: 0.05, needs: ['pump'],
              desc: 'Lots of power, but it burns E-710.' },

  pump:     { name: 'E-710 Pump', group: 'industry', w: 2, d: 2, cost: 250, up: 15, pw: -2, crew: 2, onDeposit: true, make: 0.25,
              desc: 'Pumps E-710 from a deposit. Must sit on the dark ground.' },
  plant:    { name: 'Munitions Plant', group: 'industry', w: 3, d: 2, cost: 380, up: 25, pw: -5, crew: 3, needs: ['pump', 'depot'],
              use: 0.2, out: 0.3, noise: 6,
              desc: 'Turns E-710 into shells. Loud: troops sleeping nearby lose morale.' },

  barracks: { name: 'Barracks', group: 'military', w: 3, d: 2, cost: 260, up: 15, pw: -2, beds: 12,
              desc: 'Houses twelve votes. Every faction is judged by its soldiers.' },
  parade:   { name: 'Parade Ground', group: 'military', w: 4, d: 3, cost: 150, up: 5, needs: ['barracks'], drill: true,
              desc: 'Idle troops drill here. Drilled troops win more patrols.' },
  armory:   { name: 'Armory', group: 'military', w: 2, d: 2, cost: 320, up: 20, pw: -2, crew: 1, needs: ['barracks'],
              desc: 'Staffed, it makes every patrol more likely to succeed.' },
  hdbarracks: { name: 'Helldiver Barracks', group: 'military', w: 3, d: 2, cost: 420, up: 22, pw: -4, crew: 1, needs: ['barracks'], cryo: true,
              desc: 'Helldivers pass through on their way to the front, kept in cryo until needed. Staffed and powered, it earns +3 Defence standing every week.' },
  shelter:  { name: 'Underground Bunker', group: 'military', w: 2, d: 2, cost: 280, up: 10, pw: -1, mor: 3, needs: ['barracks'],
              desc: 'A blast door and a long stairway down. Knowing it is there helps everyone sleep.' },

  hab:      { name: 'Prefab Hab', group: 'living', w: 2, d: 2, cost: 120, up: 8, pw: 1, beds: 6, mor: 1,
              desc: 'The standard-issue hab with solar on the roof. Houses six votes.' },
  vend:     { name: 'Vending Machine', group: 'living', w: 1, d: 1, cost: 45, up: 4, pw: -1, mor: 2,
              desc: 'Liberty Cola. Tastes like freedom, mostly.' },
  potty:    { name: 'Porta Potty', group: 'living', w: 1, d: 1, cost: 35, up: 2, mor: 2, potty: true,
              desc: 'Somewhere to go. Gets dirtier the more votes use it; idle troopers clean it. Filthy ones hurt morale, and too few means queues.' },
  mess:     { name: 'Mess Hall', group: 'living', w: 3, d: 2, cost: 200, up: 15, pw: -3, crew: 1, mor: 8,
              desc: 'Hot food. The single biggest thing for morale.' },
  burger:   { name: 'Big Liberty Burger', group: 'living', w: 2, d: 2, cost: 260, up: 34, pw: -2, mor: 10, chain: true, needs: ['mess'],
              desc: 'A franchise with a cheerful mascot. The biggest morale boost money can buy, and it costs a lot of money. One chain per base.' },
  chicken:  { name: 'Patriot Clucks', group: 'living', w: 2, d: 2, cost: 220, up: 8, pw: -2, mor: 6, chain: true, sluggish: 0.08, needs: ['mess'],
              desc: 'Cheap, fried and fiercely patriotic. Votes who eat here work 8% slower. One chain per base.' },
  cola:     { name: 'Bureau Cola & Fries', group: 'living', w: 2, d: 2, cost: 200, up: 4, pw: -2, mor: 4, chain: true, kickback: 70, needs: ['mess'],
              desc: 'Run by the Bureau. Modest morale, but it pays the base a 70 supply "consulting fee" every week. One chain per base.' },
  dome:     { name: 'Hydro Dome', group: 'living', w: 2, d: 2, cost: 240, up: 12, pw: -2, crew: 1, mor: 5, prop: 2,
              desc: 'Fresh greens under glass. Good for morale, nice to look at.' },

  truth:    { name: 'Truth Office', group: 'propaganda', w: 2, d: 2, cost: 220, up: 15, pw: -2, crew: 1, prop: 6, mor: 1,
              desc: 'A Ministry of Truth branch office. Unlocks loudspeakers, billboards and statues.' },
  flag:     { name: 'Faction Flag', group: 'propaganda', w: 1, d: 1, cost: 40, up: 1, prop: 4, mor: 1,
              desc: 'Your colours and crest, flying beside the Super Earth flag. Troops salute it.' },
  banner:   { name: 'Banner', group: 'propaganda', w: 1, d: 1, cost: 30, up: 1, prop: 3,
              desc: 'Your logo on a hanging banner. Place them anywhere.' },
  hdbanner: { name: 'Helldivers Banner', group: 'propaganda', w: 1, d: 1, cost: 35, up: 1, prop: 3, mor: 1,
              desc: 'The banner of the Helldivers, who are everyone\'s and no one\'s. Counts separately from your own banners.' },
  speaker:  { name: 'Loudspeaker', group: 'propaganda', w: 1, d: 1, cost: 70, up: 3, pw: -1, prop: 5, mor: 2, needs: ['truth'],
              desc: 'Plays the anthem on the hour, every hour.' },
  billboard:{ name: 'Logo Billboard', group: 'propaganda', w: 2, d: 1, cost: 140, up: 6, pw: -1, prop: 9, needs: ['truth'],
              desc: 'Your logo, name and motto, lit up at night.' },
  pool:     { name: 'Reflecting Pool', group: 'propaganda', w: 3, d: 2, cost: 200, up: 8, prop: 8, mor: 4,
              desc: 'A calm place to reflect on liberty.' },
  memorial: { name: 'Memorial Wall', group: 'propaganda', w: 3, d: 1, cost: 180, up: 4, prop: 6, mor: 2, needs: ['barracks'],
              desc: 'A plaque for every trooper who fell. Halves the grief of each loss.' },
  statue:   { name: 'Liberty Statue', group: 'propaganda', w: 2, d: 2, cost: 360, up: 10, prop: 16, mor: 4, needs: ['truth', 'parade'],
              desc: 'A hero in bronze on your crest. Inspectors love it.' },
};

// Crew is filled in this order when there aren't enough troops for everything.
export const CREW_ORDER = ['gen', 'pump', 'plant', 'mess', 'armory', 'truth', 'dome'];

// Patrol missions the Ministry of Defence offers. diff 1-5.
export const MISSIONS = [
  { kind: 'Recon sweep', diff: [1, 2], size: [2, 3], dur: [45, 70] },
  { kind: 'Bug hole closure', diff: [2, 4], size: [3, 4], dur: [60, 90] },
  { kind: 'Convoy escort', diff: [2, 3], size: [4, 4], dur: [80, 100] },
  { kind: 'Bot outpost raid', diff: [3, 5], size: [4, 6], dur: [100, 130] },
  { kind: 'Civilian evacuation', diff: [2, 4], size: [3, 5], dur: [70, 110] },
  { kind: 'Retrieve stolen flag', diff: [1, 1], size: [2, 2], dur: [40, 50] },
  { kind: 'Orbital spotting run', diff: [2, 3], size: [2, 3], dur: [50, 80] },
];
export const OP_A = ['Righteous', 'Unyielding', 'Glorious', 'Patriotic', 'Steadfast', 'Liberty', 'Iron', 'Free', 'Lawful', 'Radiant', 'Vigilant', 'Sovereign'];
export const OP_B = ['Harvest', 'Thunder', 'Gavel', 'Lantern', 'Ballot', 'Anvil', 'Sunrise', 'Verdict', 'Beacon', 'Hammer', 'Mandate', 'Anthem'];

// The other loyal factions on this planet. w: how much each one cares about each Ministry.
export const RIVALS = [
  { name: '7th Democratic Vanguard', motto: 'Liberty through superior firepower.', w: { def: 1.0, pro: 0.45, tru: 0.5 },
    logo: { shape: 'shield', symbol: 'sword', bg: '#8a1c1c', fg: '#f4f4f4', rim: '#f4f4f4', text: '7' } },
  { name: 'Steel Ledger Logistics', motto: 'Every shell accounted for.', w: { def: 0.4, pro: 1.0, tru: 0.45 },
    logo: { shape: 'hex', symbol: 'gear', bg: '#3d4247', fg: '#ffd21f', rim: '#ffd21f', text: '' } },
  { name: 'Choir of Managed Truth', motto: 'Morale is mandatory.', w: { def: 0.45, pro: 0.5, tru: 1.0 },
    logo: { shape: 'circle', symbol: 'star', bg: '#1d3f8a', fg: '#ffd780', rim: '#ffd780', text: '' } },
];

export const SURNAMES = ['Harrow', 'Vance', 'Okafor', 'Lindqvist', 'Castellanos', 'Brandt', 'Moreau', 'Tanaka', 'Reyes', 'Kowalski', 'Abara', 'Holt',
  'Sato', 'Ferreira', 'Dubois', 'Novak', 'Achebe', 'Mercer', 'Quinn', 'Ibarra', 'Kessler', 'Rourke', 'Valdez', 'Petrov', 'Nakamura', 'Oyelaran',
  'Sorensen', 'Bishop', 'Calloway', 'Drummond', 'Everett', 'Fontaine', 'Garrison', 'Hale', 'Ivers', 'Jarrah', 'Kade', 'Lorne', 'Marlow', 'Nash',
  'Oduya', 'Pryce', 'Ravel', 'Stroud', 'Thorne', 'Ulric', 'Voss', 'Wexley', 'Yoder', 'Zane', 'Amari', 'Brook', 'Cruz', 'Delacroix', 'Engel', 'Fisk'];
export const RANKS = [[0, 'PVT'], [2, 'CPL'], [5, 'SGT'], [9, 'LT'], [14, 'CPT']];

export const PLANETS = ['Veritas Minor', "Hadrian's Reach", 'Calypso IV', 'New Lincoln', 'Ostara', 'Breckenridge Prime', 'Lumen Fields', "Castor's Rest", 'Halcyon Drift', 'Merit'];

export const FACTION_DEFAULT = {
  name: 'Super Earth Special Forces', base: 'Fort Sanctuary', motto: 'Liberty, delivered.',
  primary: '#2e4a2a', secondary: '#ffe600',
  logo: { shape: 'shield', symbol: 'eagle', bg: '#1b2a1a', fg: '#ffe600', rim: '#ffe600', text: 'SESF' },
};
