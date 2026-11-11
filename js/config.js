// Every tuning number in FOB Super Commander lives here: the buildings, the Ministries, the rivals and the week.

export const VERSION = '0.4';

export const C = {
  N: 40,                    // the base is N x N tiles; the outer ring is the perimeter wall
  DAY: 120,                 // seconds of game time in one day at normal speed
  WEEK: 840,                // a week is seven days; the allocation comes every week
  T: 840 / 150,             // the economy was tuned on a 150 s week; every rate is stretched by this much
  BUILD: 4, PATROL: 4,      // construction (about half a day) and patrols (two to four days) take this many times longer than on the old short week
  SPEEDS: [0.5, 1, 2, 4, 8], // game speeds, stepped with [ and ]; keys 1, 2 and 3 pick 1x, 2x and 4x
  INSPECT_AT: 0.55,         // the Ministry of Truth inspects this far into each week
  START: { supplies: 1500, troops: 6, morale: 55 },
  // Super Earth splits its allocation by rank: 1st, 2nd, 3rd, 4th.
  ALLOC: { base: 650, mult: [1.5, 1.15, 0.85, 0.6] },
  FILL: [0.6, 0.5, 0.4, 0.3],   // share of empty bunks filled by each morning's recruits, by rank: housing is what makes a base grow
  STAND: { start: 40, rest: 30, drift: 0.12 },    // standings drift back toward "rest" every week
  PADLOAD: 140,            // most a supply pelican can bring to one landing pad
  PADSEATS: 8,             // recruits in, or troopers out, per pad per flight
  BRIEF: 7.5,              // a squad's briefing before it marches out (1.5 game hours)
  REBUILD: 240,            // a wrecked FRV or tank is replaced in two days
  DEPLOY_AT: 16, SUPPLY_AT: 7, PATROL_AT: 9,   // hours: transports leave, supplies land, standing patrols go out
  DEPLOY_PAY: 40,          // supplies for every trained trooper shipped to the front
  WEAR: 3, MAINT: 12, UNPAID: 22,                 // condition: lost every week, regained when paid, lost when unpaid
  REFUND: 0.5,
  FLAGMOVE: 100,           // supplies to move the Super Earth flag
  OVERFLOW: 4,              // recruits beyond the beds Super Earth will still send
};

// The three Ministries a loyal faction answers to.
// What a base runs on. Everything arrives by pelican and is billed per unit.
export const GOODS = {
  rations: { name: 'Rations', short: 'RAT', cost: 1, color: '#c9b37a' },
  fuel:    { name: 'E-710 fuel', short: 'FUEL', cost: 2, color: '#b07ad8' },
  ammo:    { name: 'Ammo', short: 'AMMO', cost: 2, color: '#d8a24a' },
};
export const GKEYS = Object.keys(GOODS);
// Roads: tiles laid on the grid. People and vehicles move this many times faster on them.
export const ROADS = { 1: { name: 'Dirt Road', cost: 3, speed: 1.6, walk: 1.25 }, 2: { name: 'Paved Road', cost: 8, speed: 2.4, walk: 1.4 } };
// Vehicles: speed in tiles per game second off-road, and what they carry.
export const VEHICLES = {
  lift: { name: 'Forklift', speed: 0.7, load: 12 }, truck: { name: 'Supply Truck', speed: 1.0, load: 30 },
  // armour sits in a Vehicle Bay until a special operation takes it along. bonus: added to the odds. fuel: burned per operation.
  frv: { name: 'FRV', speed: 1.4, load: 0, armour: true, bonus: 0.12, guard: 0.7, fuel: 10, desc: 'Fast and light. Better odds, and it gets wounded troopers home.' },
  tank: { name: 'Tank', speed: 0.7, load: 0, armour: true, bonus: 0.28, guard: 0.4, fuel: 25, desc: 'For the really big actions. Much better odds, far fewer casualties.' },
};

// The light tech tree: a Science Lab researches one of these at a time. needs: research that must come first.
export const TECH = {
  radio:    { name: 'Long-Range Radio', tier: 1, cost: 120, hrs: 18, desc: 'Each Comms Tower runs three landing pads instead of two.' },
  shelving: { name: 'Reinforced Shelving', tier: 1, cost: 150, hrs: 24, desc: 'All storage holds 25% more.' },
  drill:    { name: 'Drill Sergeant Manuals', tier: 1, cost: 150, hrs: 24, desc: 'Recruits train 20% faster everywhere.' },
  solar:    { name: 'Patriotic Photovoltaics', tier: 1, cost: 160, hrs: 24, desc: 'Solar Arrays make 6 power instead of 4.' },
  cargo:    { name: 'Heavy-Lift Pelicans', tier: 2, cost: 260, hrs: 36, needs: ['radio'], desc: 'Every pelican carries 60 more goods and 4 more recruits or troopers.' },
  trucks:   { name: 'Third Truck', tier: 2, cost: 240, hrs: 30, needs: ['shelving'], desc: 'Every Motor Pool gets a third supply truck.' },
  asphalt:  { name: 'Bureau Asphalt', tier: 2, cost: 180, hrs: 24, needs: ['shelving'], desc: 'Paved road costs half. The Bureau supplies the asphalt, at a price it would rather not discuss.' },
  frv:      { name: 'Fast Recon Vehicles', tier: 2, cost: 300, hrs: 36, needs: ['drill'], desc: 'Unlocks the Vehicle Bay and its FRV, which special operations can take along.' },
  tank:     { name: 'Armoured Doctrine', tier: 3, cost: 450, hrs: 60, needs: ['frv', 'cargo'], desc: 'Every Vehicle Bay also keeps a tank, for the really big actions.' },
};
// Training: points a recruit earns per game hour at each place; 100 makes a trooper.
export const TRAIN = { range: 8, course: 6, lecture: 4, parade: 3 };   // points an hour; the duty day is 7.5 training hours

export const MIN = {
  def: { name: 'Ministry of Defence', short: 'DEFENCE', key: 'D', wants: 'Trained troopers shipped to the front on time, and patrols that come back.' },
  pro: { name: 'Ministry of Expansion', short: 'EXPANSION', key: 'X', wants: 'Supply lines that never run dry, and housing for every vote. Audited every week.' },
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
  hq:       { name: 'Command HQ', group: 'core', w: 3, d: 3, cost: 0, up: 0, pw: 6, beds: 6, unique: true, fixed: true, eat: 6, lifts: 1,
              store: { rations: 40, fuel: 20, ammo: 20 },
              desc: 'The heart of the faction. Houses and feeds six votes, keeps a little of everything and a forklift.' },
  seflag:   { name: 'Super Earth Flag', group: 'core', w: 2, d: 2, cost: 0, up: 0, prop: 6, mor: 2, unique: true, fixed: true,
              desc: 'Every base flies one, at its centre. It cannot be removed. Troops salute it, and medals are pinned beneath it.' },
  pad:      { name: 'Landing Pad', group: 'core', w: 3, d: 3, cost: 300, up: 20, pw: -1, pad: true,
              desc: 'The supply pelican lands here every morning, and transports take trained troopers to the front every afternoon. More pads, bigger loads.' },
  depot:    { name: 'Supply Depot', group: 'core', w: 2, d: 2, cost: 180, up: 12, lifts: 1, store: { rations: 150, ammo: 100 },
              desc: 'Stores rations and ammo, and comes with a forklift to move them.' },
  fueldepot: { name: 'Fuel Depot', group: 'core', w: 2, d: 2, cost: 200, up: 12, store: { fuel: 160 },
              desc: 'Tanks of E-710, delivered not pumped. Generators and trucks run on it.' },
  motorpool: { name: 'Motor Pool', group: 'core', w: 3, d: 2, cost: 320, up: 20, crew: 1, trucks: 2, need: { fuel: 30 }, burn: { fuel: 4 },
              desc: 'Two supply trucks: faster and bigger than forklifts, and faster still on paved roads. Burns fuel.' },
  comms:    { name: 'Comms Tower', group: 'core', w: 2, d: 2, cost: 260, up: 12, pw: -2, prop: 2,
              desc: 'A tall mast and a lot of static. Your first landing pad needs none; every tower lets you run two more.' },
  shed:     { name: 'SEAF Bunker', group: 'core', w: 2, d: 2, cost: 120, up: 6, store: { rations: 50, fuel: 50, ammo: 50 },
              desc: 'A standard-issue storage bunker. Holds a little of everything, and looks exactly like a shed.' },

  solar:    { name: 'Solar Array', group: 'power', w: 2, d: 1, cost: 90, up: 5, pw: 4,
              desc: 'Clean, quiet, patriotic power. Not much of it.' },
  lab:      { name: 'Science Lab', group: 'industry', w: 3, d: 2, cost: 320, up: 18, pw: -3, crew: 1, needs: ['comms'], lab: true,
              desc: 'Researches upgrades, one at a time, while it is staffed and powered. Pick what to study in the Science tab. More labs, faster research.' },
  gen:      { name: 'E-710 Generator', group: 'power', w: 2, d: 2, cost: 220, up: 15, pw: 14, crew: 1, need: { fuel: 30 }, burn: { fuel: 8 },
              desc: 'Lots of power, but it burns E-710 fuel, which has to be trucked in.' },


  barracks: { name: 'Barracks', group: 'military', w: 3, d: 2, cost: 260, up: 15, pw: -2, beds: 12,
              desc: 'Houses twelve votes. Every faction is judged by its soldiers.' },
  parade:   { name: 'Parade Ground', group: 'military', w: 4, d: 3, cost: 150, up: 5, needs: ['barracks'], drill: true, train: 'parade', slots: 12,
              desc: 'Recruits drill here in the morning. Slow training, but it takes twelve at once.' },
  range:    { name: 'Firing Range', group: 'military', w: 4, d: 2, cost: 280, up: 15, crew: 1, needs: ['barracks'], train: 'range', slots: 6, need: { ammo: 40 },
              desc: 'The fastest training there is. Needs an instructor and burns through ammo.' },
  course:   { name: 'Obstacle Course', group: 'military', w: 3, d: 3, cost: 200, up: 8, needs: ['barracks'], train: 'course', slots: 8,
              desc: 'Walls, nets and mud. Good training, no ammo needed.' },
  patrol:   { name: 'Patrol Office', group: 'military', w: 2, d: 2, cost: 240, up: 12, crew: 1, needs: ['barracks'], need: { ammo: 24 }, squads: 1,
              desc: 'Sends out standing patrols of three trained troopers every morning and brings them home. Set how many squads it keeps out.' },
  armory:   { name: 'Armory', group: 'military', w: 2, d: 2, cost: 320, up: 20, pw: -2, crew: 1, needs: ['barracks'],
              desc: 'Staffed, it makes every patrol more likely to succeed.' },
  hdbarracks: { name: 'Helldiver Barracks', group: 'military', w: 3, d: 2, cost: 420, up: 22, pw: -4, crew: 1, needs: ['barracks'], cryo: true,
              desc: 'Helldivers pass through on their way to the front, kept in cryo until needed. Staffed and powered, it earns +3 Defence standing every week.' },
  vbay:     { name: 'Vehicle Bay', group: 'military', w: 3, d: 3, cost: 380, up: 20, crew: 1, needs: ['motorpool'], tech: 'frv', need: { fuel: 40 }, armour: true,
              desc: 'Keeps an FRV, and a tank once Armoured Doctrine is researched. Special operations can take them along. A wrecked vehicle is replaced in two days.' },
  shelter:  { name: 'Underground Bunker', group: 'military', w: 2, d: 2, cost: 280, up: 10, pw: -1, mor: 3, needs: ['barracks'],
              desc: 'A blast door and a long stairway down. Knowing it is there helps everyone sleep.' },

  hab:      { name: 'Prefab Hab', group: 'living', w: 2, d: 2, cost: 120, up: 8, pw: 1, beds: 6, mor: 1,
              desc: 'The standard-issue hab with solar on the roof. Houses six votes.' },
  vend:     { name: 'Vending Machine', group: 'living', w: 1, d: 1, cost: 45, up: 4, pw: -1, mor: 2,
              desc: 'Liberty Cola. Tastes like freedom, mostly.' },
  potty:    { name: 'Porta Potty', group: 'living', w: 1, d: 1, cost: 35, up: 2, mor: 2, potty: true,
              desc: 'Somewhere to go. Gets dirtier the more votes use it; idle troopers clean it. Filthy ones hurt morale, and too few means queues.' },
  mess:     { name: 'Mess Hall', group: 'living', w: 3, d: 2, cost: 200, up: 15, pw: -3, crew: 1, mor: 8, eat: 24, need: { rations: 40 },
              desc: 'Feeds 24 votes a day, if the rations keep coming. The single biggest thing for morale.' },
  burger:   { name: 'Big Liberty Burger', group: 'living', w: 2, d: 2, cost: 260, up: 34, pw: -2, mor: 10, chain: true, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'A franchise with a cheerful mascot. Feeds 16. The biggest morale boost money can buy, and it costs a lot of money. One chain per base.' },
  chicken:  { name: 'Patriot Clucks', group: 'living', w: 2, d: 2, cost: 220, up: 8, pw: -2, mor: 6, chain: true, sluggish: 0.08, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'Cheap, fried and fiercely patriotic. Feeds 16. Votes who eat here work 8% slower. One chain per base.' },
  cola:     { name: 'Bureau Cola & Fries', group: 'living', w: 2, d: 2, cost: 200, up: 4, pw: -2, mor: 4, chain: true, kickback: 70, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'Run by the Bureau. Feeds 16. Modest morale, but it pays the base a 70 supply "consulting fee" every week. One chain per base.' },
  dome:     { name: 'Hydro Dome', group: 'living', w: 2, d: 2, cost: 240, up: 12, pw: -2, crew: 1, mor: 5, prop: 2,
              desc: 'Fresh greens under glass. Good for morale, nice to look at.' },

  lecture:  { name: 'Citizenship Hall', group: 'propaganda', w: 3, d: 2, cost: 240, up: 12, pw: -1, crew: 1, needs: ['truth'], train: 'lecture', slots: 10, prop: 4,
              desc: 'Lectures on Managed Democracy. Trains recruits a little, and the Ministry of Truth likes the sound of it.' },
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
export const CREW_ORDER = ['gen', 'motorpool', 'mess', 'range', 'patrol', 'lab', 'vbay', 'armory', 'lecture', 'truth', 'hdbarracks', 'dome'];

// Patrol missions the Ministry of Defence offers. diff 1-5.
export const MISSIONS = [
  { kind: 'Recon sweep', diff: [1, 2], size: [2, 3], dur: [45, 70] },
  { kind: 'Bug hole closure', diff: [2, 4], size: [3, 4], dur: [60, 90] },
  { kind: 'Convoy escort', diff: [2, 3], size: [4, 4], dur: [80, 100] },
  { kind: 'Bot outpost raid', diff: [3, 5], size: [4, 6], dur: [100, 130] },
  { kind: 'Civilian evacuation', diff: [2, 4], size: [3, 5], dur: [70, 110] },
  { kind: 'Retrieve stolen flag', diff: [1, 1], size: [2, 2], dur: [40, 50] },
  { kind: 'Orbital spotting run', diff: [2, 3], size: [2, 3], dur: [50, 80] },
  { kind: 'Armoured assault', diff: [5, 5], size: [5, 6], dur: [110, 140], heavy: true },
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
