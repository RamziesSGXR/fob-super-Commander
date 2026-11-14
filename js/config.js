// Every tuning number in FOB Super Commander lives here: the buildings, the Ministries, the rivals and the week.

export const VERSION = '0.13.1';

export const C = {
  N: 80,                    // the map is N x N tiles; the base is whatever your walls enclose, inside the charter's bounds
  BOX: 40,                  // the starting wall encloses a BOX x BOX square in the middle
  WALL: 4,
  BRIDGE: 3,               // a road tile over water costs this many times as much
  // the charter: how much ground the Bureau lets you build on. box: the side of the square, centred on the landing
  STAGES: [
    { name: 'Outpost', box: 36 },
    { name: 'Fort', box: 56, troops: 40, pro: 55, cr: 1500, alloc: 0.25 },
    { name: 'Major Base', box: 80, troops: 110, pro: 70, cr: 4000, alloc: 0.5 },
  ],                  // supplies per tile of wall
  DAY: 120,                 // seconds of game time in one day at normal speed
  WEEK: 840,                // a week is seven days; the allocation comes every week
  T: 840 / 150,             // the economy was tuned on a 150 s week; every rate is stretched by this much
  BUILD: 4, PATROL: 4,      // construction (about half a day) and patrols (two to four days) take this many times longer than on the old short week
  SPEEDS: [0.5, 1, 2, 4, 8], // game speeds, stepped with [ and ]; keys 1, 2 and 3 pick 1x, 2x and 4x
  INSPECT_AT: 0.55,         // the Ministry of Truth inspects this far into each week
  START: { supplies: 3600, credits: 600, troops: 6, morale: 55 },
  WAGE: 2,                 // credits a day for every citizen on the staff
  OVERDRAFT: 800,          // how far credits may go below zero before the Bureau stops lending
  REFIT: 0.15,             // a refit costs the difference in price plus this share of the base price
  ODFEE: 0.03,             // a week's fee on any overdraft
  DEPLOY_CR: 20,           // credits per trooper shipped, on top of the supplies
  BUY: { cr: 60, sup: 100 },
  SELL: { sup: 100, cr: 35 },   // and buys them back, at its own rate   // the Bureau sells supplies for credits, at its own rate
  SALES: { burger: 7, chicken: 6, cola: 8, vend: 1 },   // credits a day from the franchises
  REVIEWS_DAY: 5,          // files the Ministry will accept from you in a day
  REVIEW: 14,              // days before a trooper's file comes round again
  // Super Earth splits its allocation by rank: 1st, 2nd, 3rd, 4th.
  ALLOC: { base: 650, mult: [1.5, 1.15, 0.85, 0.6] },
  FILL: [0.6, 0.5, 0.4, 0.3],   // share of empty bunks filled by each morning's recruits, by rank: housing is what makes a base grow
  STAND: { start: 40, rest: 30, drift: 0.12 },    // standings drift back toward "rest" every week
  PADLOAD: 140,            // most a supply pelican can bring to one landing pad
  PADSEATS: 8,             // recruits in, or troopers out, per pad per flight
  BRIEF: 7.5,              // a squad's briefing before it marches out (1.5 game hours)
  HEAL: 300,               // a wounded trooper is back on duty after two and a half days in a Medical Bay
  REBUILD: 240,            // a wrecked FRV or tank is replaced in two days
  DEPLOY_AT: 16, SUPPLY_AT: 7, PATROL_AT: 9,   // hours: transports leave, supplies land, standing patrols go out
  DEPLOY_PAY: 30,          // supplies for every trained trooper shipped to the front
  WEAR: 3, MAINT: 12, UNPAID: 22,                 // condition: lost every week, regained when paid, lost when unpaid
  REFUND: 0.5,
  FLAGMOVE: 100,           // supplies to move the Super Earth flag
  OVERFLOW: 4,              // recruits beyond the beds Super Earth will still send
};

// The three Ministries a loyal faction answers to.
// What a base runs on. Everything arrives by pelican and is billed per unit.
// ---------------------------------------------------------------- the planet's market (js/market.js)
export const MKEYS_ALL = ['def', 'pro', 'tru'];
export const MARKET = {
  // price in credits per unit at an index of 100; idx: the Ministry whose index moves it; w: how hard; lot: offer sizes
  goods: {
    sup:     { name: 'Supplies', short: 'SUP', base: 0.45, idx: 'pro', w: 0.7, lot: [100, 300] },
    rations: { name: 'Rations', short: 'RAT', base: 0.55, idx: 'def', w: 0.5, lot: [40, 120] },
    fuel:    { name: 'E-710 fuel', short: 'FUEL', base: 1.0, idx: 'pro', w: 0.8, lot: [20, 80] },
    ammo:    { name: 'Ammo', short: 'AMMO', base: 0.9, idx: 'def', w: 1.0, lot: [30, 100] },
  },
  spread: 0.12,      // buy at the price plus this, sell at the price less it
  impact: 0.0005,    // each unit you trade moves the price this much (100 units: 5%)
  vol: 0.035,        // the day's random move
  shocks: [
    { m: 'def', d: 35, days: 4, text: 'a major offensive opens on the front. Every base is shipping ammo; Defence favour is dear.' },
    { m: 'def', d: -25, days: 3, text: 'ceasefire rumours (denied). Ammo prices slip; Defence favour is cheap this week.' },
    { m: 'pro', d: 30, days: 4, text: 'audit season at the Bureau. Everyone is building; supplies and fuel are dear.' },
    { m: 'pro', d: -22, days: 3, text: 'a supply glut after a convoy came through whole. Supplies and fuel are cheap.' },
    { m: 'tru', d: 32, days: 4, text: 'election week. Every base wants the Ministry of Truth to notice it.' },
    { m: 'tru', d: -20, days: 3, text: 'the Ministry of Truth is busy with a scandal (there is no scandal). Its favour is cheap.' },
  ],
};
// Ministry commitments: what a level costs a day (per level), and the standing a day it buys at an index of 100
export const COMMIT = {
  levels: ['NONE', 'LOW', 'STANDARD', 'HIGH', 'ALL OUT'],
  def: { ministry: 'Ministry of Defence', cost: { ammo: 5, rations: 4 }, gain: 0.9, perk: 'Patrol and operation odds +2% a level; deployment orders pay 5% more a level.' },
  pro: { ministry: 'Bureau of Expansion', cost: { sup: 14, fuel: 2 }, gain: 0.9, perk: 'Building goes 8% faster a level.' },
  tru: { ministry: 'Ministry of Truth', cost: { cr: 6, sup: 6 }, gain: 0.9, perk: 'Morale +2 a level.' },
};
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
  highrise: { name: 'Vertical Housing', tier: 2, cost: 280, hrs: 36, needs: ['shelving'], desc: 'Unlocks the Hab Block: three storeys, thirty bunks, one plot.' },
  broadcast:{ name: 'Planetary Broadcast', tier: 2, cost: 300, hrs: 36, needs: ['radio'], desc: 'Unlocks the Broadcast Mast: a very tall mast that runs four landing pads and carries the Ministry of Truth to every ear.' },
  command:  { name: 'Unified Command', tier: 3, cost: 480, hrs: 60, needs: ['broadcast', 'highrise'], desc: 'Unlocks the Command Tower, which watches a long stretch of wall and makes the whole base stand straighter.' },
  fortworks:{ name: 'Fortification Doctrine', tier: 1, cost: 180, hrs: 24, desc: 'Unlocks Defence Turrets, Floodlight Towers and the Emergency Operations Bunker.' },
  civic:    { name: 'Civic Programme', tier: 2, cost: 260, hrs: 30, needs: ['shelving'], desc: 'Unlocks DEMOCRA-MART, the Citizens\' Casino and the Memorial Halls.' },
  archive:  { name: 'Quantum Archives', tier: 2, cost: 300, hrs: 36, needs: ['radio'], desc: 'Unlocks the Server and Storage Vault, the Security Brig and Cryopreservation Storage.' },
  warroom:  { stage: 1, name: 'Strategic Command', tier: 3, cost: 520, hrs: 60, needs: ['archive', 'command'], desc: 'Unlocks the War Room: every front in real time, better odds and more operations to choose from.' },
  industry: { name: 'State Industry', tier: 2, cost: 280, hrs: 36, needs: ['shelving'], desc: 'Unlocks the State Industrial Complex: your own supplies, made on the base, for fuel and power.' },
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
// the build menu, by what a building is for: [key, label, what the section is for, the buildings in it]
export const GROUPS = [
  ['roads', 'ROADS', 'Roads first: every building snaps to a plot along one, door to the street.', []],
  ['logistics', 'LOGISTICS', 'Bring supplies and recruits in, store goods, and move them round the base.', ['pad', 'depot', 'fueldepot', 'shed', 'motorpool', 'yard', 'comms', 'mast']],
  ['training', 'TRAINING', 'Turn recruits into troopers. The front pays supplies and credits for every one you ship.', ['range', 'course', 'parade', 'lecture']],
  ['living', 'LIVING', 'House, feed and look after your people. Empty bunks are what bring recruits in.', ['barracks', 'hab', 'block', 'mess', 'potty', 'medbay', 'club', 'dome']],
  ['income', 'INCOME', 'Buildings that earn credits or make supplies.', ['vend', 'burger', 'chicken', 'cola', 'mart', 'casino', 'extractor', 'mine', 'factory']],
  ['power', 'POWER', 'Most buildings need power to run.', ['gen', 'solar']],
  ['defence', 'DEFENCE', 'Close the wall, watch it and arm it, and send patrols out.', ['patrol', 'lookout', 'flood', 'turret', 'shelter', 'armory', 'vbay', 'hdbarracks', 'brig', 'cryo', 'eob']],
  ['truth', 'TRUTH', 'Morale and propaganda, for the Ministry of Truth.', ['flag', 'banner', 'hdbanner', 'speaker', 'billboard', 'truth', 'pool', 'plaque', 'statue', 'memorial', 'halls', 'partyhq', 'palace', 'monument']],
  ['command', 'COMMAND', 'Research, operations and records.', ['command', 'warroom', 'lab', 'vault']],
];
// what a new base builds before anything else: these are what bring money in. Everything else waits for them
export const FOUNDATION = ['pad', 'depot', 'barracks', 'mess', 'range'];
export const EARLY = new Set([...FOUNDATION, 'gen', 'solar', 'potty', 'hab', 'yard']);

// w x d is the footprint before rotation. pw: power made (+) or used (-). up: upkeep each week. crew: troops it needs to run.
// mor: morale it adds. prop: propaganda it adds. needs: buildings that must stand first (the tech tree).
export const B = {
  hq:       { staff: 2, name: 'Command HQ', group: 'core', w: 3, d: 3, cost: 0, stdCost: 600, up: 0, pw: 6, beds: 8, unique: true, fixed: true, eat: 8, lifts: 1,
              store: { rations: 40, fuel: 20, ammo: 20 },
              desc: 'The heart of the faction: houses and feeds eight votes (six while it is still tents), keeps a little of everything and a forklift. Upgrade it from its card.' },
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
  mast:     { name: 'Broadcast Mast', group: 'core', w: 2, d: 2, cost: 520, up: 22, pw: -5, prop: 9, tech: 'broadcast', needs: ['comms'], pads: 4, staff: 1,
              desc: 'Twice the height of a Comms Tower. Runs four more landing pads, and the evening broadcast reaches the whole base.' },
  yard:     { name: 'Engineer Yard', group: 'core', w: 3, d: 2, cost: 280, up: 14, pw: -1, crews: 1, needs: ['barracks'],
              desc: 'A shed, a stack of HESCO and a bulldozer. Takes three of your recruits and trains them as an engineer crew in a day: one more building job at a time.' },
  shed:     { name: 'SEAF Bunker', group: 'core', w: 2, d: 2, cost: 120, up: 6, store: { rations: 50, fuel: 50, ammo: 50 },
              desc: 'A standard-issue storage bunker. Holds a little of everything, and looks exactly like a shed.' },

  solar:    { name: 'Solar Array', group: 'power', w: 2, d: 1, cost: 90, up: 5, pw: 4,
              desc: 'Clean, quiet, patriotic power. Not much of it.' },
  lab:      { staff: 2, name: 'Science Lab', group: 'industry', w: 3, d: 2, cost: 320, up: 18, pw: -3, crew: 1, needs: ['comms'], lab: true,
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
  lookout:  { name: 'Lookout Tower', group: 'military', w: 1, d: 1, cost: 90, up: 4, crew: 1, watch: 9, atWall: true,
              desc: 'A trooper with binoculars and a thermos. Stands at the wall and watches nine tiles of it either way. Unwatched wall costs Defence standing.' },
  medbay:   { name: 'Medical Bay', group: 'military', w: 3, d: 2, cost: 300, up: 16, pw: -2, crew: 1, needs: ['barracks'], ward: 4, mor: 2, staff: 1,
              desc: 'A medic and four beds. Troopers hurt on patrol are treated here and return to duty in a few days; without one they are flown off planet, or worse.' },
  command:  { name: 'Command Tower', group: 'military', w: 3, d: 3, cost: 700, up: 30, pw: -5, crew: 2, unique: true, tech: 'command', watch: 16, prop: 10, mor: 4, staff: 2,
              desc: 'Five storeys of concrete with a glass crown. Its watch officers see sixteen tiles of wall, and everyone can see it.' },
  armory:   { name: 'Armory', group: 'military', w: 2, d: 2, cost: 320, up: 20, pw: -2, crew: 1, needs: ['barracks'],
              desc: 'Staffed, it makes every patrol more likely to succeed.' },
  hdbarracks: { name: 'Helldiver Barracks', group: 'military', w: 3, d: 2, cost: 420, up: 22, pw: -4, crew: 1, needs: ['barracks'], cryo: true,
              desc: 'Helldivers pass through on their way to the front, kept in cryo until needed. Staffed and powered, it earns +3 Defence standing every week.' },
  vbay:     { name: 'Vehicle Bay', group: 'military', w: 3, d: 3, cost: 380, up: 20, crew: 1, needs: ['motorpool'], tech: 'frv', need: { fuel: 40 }, armour: true,
              desc: 'Keeps an FRV, and a tank once Armoured Doctrine is researched. Special operations can take them along. A wrecked vehicle is replaced in two days.' },
  shelter:  { name: 'Underground Bunker', group: 'military', w: 2, d: 2, cost: 280, up: 10, pw: -1, mor: 3, needs: ['barracks'],
              desc: 'A blast door and a long stairway down. Knowing it is there helps everyone sleep.' },

  block:    { name: 'Hab Block', group: 'living', w: 3, d: 3, cost: 520, up: 26, pw: -3, beds: 30, mor: 3, tech: 'highrise',
              desc: 'Three storeys of bunks with a trim band in your colours. Houses thirty votes on one plot.' },
  hab:      { name: 'Prefab Hab', group: 'living', w: 2, d: 2, cost: 120, up: 8, pw: 1, beds: 6, mor: 1,
              desc: 'The standard-issue hab with solar on the roof. Houses six votes.' },
  vend:     { name: 'Vending Machine', group: 'living', w: 1, d: 1, cost: 45, up: 4, pw: -1, mor: 2,
              desc: 'Liberty Cola. Tastes like freedom, mostly.' },
  potty:    { name: 'Porta Potty', group: 'living', w: 1, d: 1, cost: 35, up: 2, mor: 2, potty: true,
              desc: 'Somewhere to go. Gets dirtier the more votes use it; idle troopers clean it. Filthy ones hurt morale, and too few means queues.' },
  mess:     { staff: 2, name: 'Mess Hall', group: 'living', w: 3, d: 2, cost: 200, up: 15, pw: -3, crew: 1, mor: 8, eat: 24, need: { rations: 40 },
              desc: 'Feeds 24 votes a day, if the rations keep coming. The single biggest thing for morale.' },
  burger:   { staff: 2, name: 'Big Liberty Burger', group: 'living', w: 2, d: 2, cost: 260, up: 34, pw: -2, mor: 10, chain: true, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'A franchise with a cheerful mascot. Feeds 16. The biggest morale boost money can buy, and it costs a lot of money. One chain per base.' },
  chicken:  { staff: 2, name: 'Patriot Clucks', group: 'living', w: 2, d: 2, cost: 220, up: 8, pw: -2, mor: 6, chain: true, sluggish: 0.08, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'Cheap, fried and fiercely patriotic. Feeds 16. Votes who eat here work 8% slower. One chain per base.' },
  cola:     { staff: 2, name: 'Bureau Cola & Fries', group: 'living', w: 2, d: 2, cost: 200, up: 4, pw: -2, mor: 4, chain: true, kickback: 70, needs: ['mess'], eat: 16, need: { rations: 30 },
              desc: 'Run by the Bureau. Feeds 16. Modest morale, but it pays the base a 70 supply "consulting fee" every week. One chain per base.' },
  dome:     { staff: 1, name: 'Hydro Dome', group: 'living', w: 2, d: 2, cost: 240, up: 12, pw: -2, crew: 1, mor: 5, prop: 2,
              desc: 'Fresh greens under glass. Good for morale, nice to look at.' },

  lecture:  { staff: 1, name: 'Citizenship Hall', group: 'propaganda', w: 3, d: 2, cost: 240, up: 12, pw: -1, crew: 1, needs: ['truth'], train: 'lecture', slots: 10, prop: 4,
              desc: 'Lectures on Managed Democracy. Trains recruits a little, and the Ministry of Truth likes the sound of it.' },
  truth:    { staff: 1, name: 'Truth Office', group: 'propaganda', w: 2, d: 2, cost: 220, up: 15, pw: -2, crew: 1, prop: 6, mor: 1,
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
  // ---------------------------------------------------------------- Fort Sanctuary (from the SESF base build)
  plaque:   { name: 'Memorial Plaque', group: 'propaganda', w: 2, d: 1, cost: 120, up: 2, prop: 5, mor: 2, needs: ['memorial'], atGate: true,
              desc: 'A poem for those who stood firm on Mars, held in refracted light by lens shards from Illuminate wreckage. Stands at a gate.' },
  flood:    { name: 'Floodlight Tower', group: 'military', w: 1, d: 1, cost: 110, up: 4, pw: -2, watch: 7, atWall: true, tech: 'fortworks',
              desc: 'Luminite-core emitters that cut through fog, sandstorms and bio-acid haze. Lights the wall at night and watches seven tiles of it.' },
  turret:   { name: 'Defence Turret', group: 'military', w: 1, d: 1, cost: 220, up: 8, pw: -2, guns: 6, atWall: true, tech: 'fortworks', need: { ammo: 15 },
              desc: 'An autonomous rotary gun on Mag-Coil torque and a Guidance Core. Arms six tiles of wall either way. Walls deter; turrets destroy.' },
  eob:      { stage: 1, name: 'Emergency Operations Bunker', group: 'military', w: 4, d: 3, cost: 900, up: 24, pw: 5, crew: 2, unique: true, tech: 'fortworks', large: true, mor: 3, weekly: { def: 2 },
              desc: 'If the surface falls silent, the war continues below. Armoured walls, redundant comm relays and its own power grid. +2 Defence standing a week.' },
  vault:    { name: 'Server and Storage Vault', group: 'industry', w: 3, d: 3, cost: 640, up: 16, pw: -4, crew: 1, tech: 'archive', large: true, lab: 0.35, store: { rations: 60, fuel: 40, ammo: 40 },
              desc: 'Every battle log, strat-map and citizen record on quantum drives, cooled by Automaton heat plates. Research 35% faster, and a hardened store.' },
  warroom:  { name: 'War Room', group: 'military', w: 4, d: 4, cost: 1200, up: 30, pw: -6, crew: 3, unique: true, tech: 'warroom', needs: ['command'], large: true, prop: 8, odds: 0.08, offers: 1, staff: 2,
              desc: 'Illuminate holo cores cast every front in 360 degrees; Automaton servers crunch the threat. Special operations +8% odds, and one more to choose from.' },
  halls:    { stage: 1, name: 'Memorial Halls', group: 'propaganda', w: 4, d: 3, cost: 980, up: 20, pw: -2, tech: 'civic', needs: ['memorial'], large: true, prop: 18, mor: 5, pride: 1,
              desc: 'One wing for legendary Helldivers, one for the battles that made them, in holographic panels lit by Luminite. Inspires every recruit who marches past.' },
  mart:     { name: 'DEMOCRA-MART', group: 'living', w: 3, d: 3, cost: 700, up: 14, pw: -3, tech: 'civic', large: true, mor: 4, sales: 14, staff: 3,
              desc: 'Rations upgrades, souvenir shrapnel mugs and liberty-approved luxuries, with self-checkout lanes run by Automaton cores. Earns credits every day.' },
  casino:   { name: 'Citizens\' Casino', group: 'living', w: 3, d: 3, cost: 760, up: 16, pw: -4, tech: 'civic', large: true, mor: 5, sales: 18, staff: 3, weekly: { tru: -1 },
              desc: 'Statistically approved wagering on Illuminate RNG cores. Luck and liberty, both supervised. Good for morale and credits; the Ministry of Truth frowns slightly.' },
  cryo:     { name: 'Cryopreservation Storage', group: 'military', w: 3, d: 2, cost: 680, up: 18, pw: -5, crew: 1, tech: 'archive', needs: ['hdbarracks'], large: true, odds: 0.05,
              desc: 'A select few Helldivers kept frozen for just-in-case service, thawed when called. Special operations +5% odds.' },
  brig:     { name: 'Security Brig', group: 'military', w: 3, d: 2, cost: 560, up: 14, pw: -3, crew: 1, tech: 'archive', large: true, weekly: { tru: 2 }, inspect: 5,
              desc: 'Containment emitters and restraint bolts for prisoners, rogue AI cores, and any Helldiver who forgets what Managed Democracy means. +2 Truth a week; inspections +5.' },
  partyhq:  { stage: 1, name: 'Party Headquarters', group: 'propaganda', w: 3, d: 3, cost: 820, up: 18, pw: -3, unique: true, needs: ['truth'], large: true, prop: 10, staff: 3, weekly: { tru: 1 }, reviews: 3,
              desc: 'Administrative heart of the base\'s political life. +1 Truth a week, and three more roster files a day get read.' },
  palace:   { stage: 2, name: 'Palace of Culture and Science', group: 'propaganda', w: 5, d: 5, cost: 2600, up: 40, pw: -6, unique: true, tech: 'civic', needs: ['partyhq'], large: true, prop: 30, mor: 6, pride: 2, staff: 4,
              desc: 'Monumental architecture: a stepped tower with a spire, visible from orbit, or so the brochure says. A great deal of propaganda, morale and pride.' },
  club:     { name: 'Workers\' Club', group: 'living', w: 2, d: 2, cost: 160, up: 4, pw: -1, needs: ['mess'], mor: 3, staff: 1,
              desc: 'Chess, approved literature and a kettle. Morale for the evenings.' },
  monument: { name: 'Ideological Monument', group: 'propaganda', w: 2, d: 2, cost: 420, up: 6, needs: ['truth'], prop: 12, pride: 1,
              desc: 'A raised fist in bronze, eight metres tall, chin high, forearm straight. The Helldiver salute, forever.' },
  extractor:{ name: 'E-710 Extractor', group: 'industry', w: 2, d: 2, cost: 420, up: 10, pw: -2, crew: 1, deposit: 3, pump: 24, store: { fuel: 80 },
              desc: 'Built on an E-710 seep: pumps about 24 fuel a day into its tank, and the trucks carry it where it is needed. Deliveries cost less.' },
  mine:     { name: 'Ore Mine', group: 'industry', w: 2, d: 2, cost: 380, up: 10, pw: -2, crew: 2, deposit: 4, make: 30,
              desc: 'Built on an ore field: digs about 30 supplies a day while crewed and powered.' },
  factory:  { stage: 1, name: 'State Industrial Complex', group: 'industry', w: 4, d: 3, cost: 900, up: 22, pw: -6, crew: 3, tech: 'industry', large: true, make: 45, need: { fuel: 40 },
              desc: 'Turns E-710 and labour into supplies: about 45 a day while crewed, powered and fuelled. Trucks bring the fuel.' },
  memorial: { name: 'Memorial Wall', group: 'propaganda', w: 3, d: 1, cost: 180, up: 4, prop: 6, mor: 2, needs: ['barracks'],
              desc: 'A plaque for every trooper who fell. Halves the grief of each loss.' },
  statue:   { name: 'Liberty Statue', group: 'propaganda', w: 2, d: 2, cost: 360, up: 10, prop: 16, mor: 4, needs: ['truth', 'parade'],
              desc: 'A hero in bronze on your crest. Inspectors love it.' },
};

// Crew is filled in this order when there aren't enough troops for everything.
export const CREW_ORDER = ['gen', 'motorpool', 'factory', 'extractor', 'mine', 'mess', 'range', 'patrol', 'medbay', 'lookout', 'turret', 'flood', 'command', 'warroom', 'eob', 'cryo', 'brig', 'vault', 'lab', 'vbay', 'armory', 'lecture', 'truth', 'hdbarracks', 'dome'];

// Patrol missions the Ministry of Defence offers. diff 1-5.
export const MISSIONS = [
  { kind: 'Recon sweep', diff: [1, 2], size: [2, 3], dur: [45, 70] },
  { kind: 'Bug hole closure', diff: [2, 4], size: [3, 4], dur: [60, 90], wants: 'tank' },
  { kind: 'Convoy escort', diff: [2, 3], size: [4, 4], dur: [80, 100], wants: 'frv' },
  { kind: 'Bot outpost raid', diff: [3, 5], size: [4, 6], dur: [100, 130], wants: 'tank' },
  { kind: 'Civilian evacuation', diff: [2, 4], size: [3, 5], dur: [70, 110], wants: 'frv' },
  { kind: 'Retrieve stolen flag', diff: [1, 1], size: [2, 2], dur: [40, 50] },
  { kind: 'Orbital spotting run', diff: [2, 3], size: [2, 3], dur: [50, 80] },
  { kind: 'Armoured assault', diff: [5, 5], size: [5, 6], dur: [110, 140], heavy: true, wants: 'tank', needs: true },
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

// ---------------------------------------------------------------- designs and parts for the large buildings
// Every large building keeps its required shape. Pick one of three designs, then add parts: each costs more and does more.
export const DESIGNS = [
  { key: 'std', name: 'Standard Issue', cost: 1, desc: 'The approved pattern. Cheapest.' },
  { key: 'fort', name: 'Fortified', cost: 1.25, wear: 0.5, wings: 1, desc: 'Blast walls, armour plate and a walled yard a tile wide each side. Wears half as fast and adds 1 Defence standing a week.', weekly: { def: 1 } },
  { key: 'mon', name: 'Monumental', cost: 1.4, prop: 6, pride: 1, wings: 1, desc: 'Columns, gold trim, banners and a colonnaded wing a tile wide each side. +6 propaganda and pride; people stand up straighter walking past.' },
];
// the part library: what each part looks like is drawn in models.js; what it does depends on the building (PARTS_FOR)
export const PARTS = {
  antenna: { name: 'Relay Antennas', cost: 60 },
  floods:  { name: 'Roof Floodlights', cost: 50 },
  sign:    { name: 'Lit Sign', cost: 40 },
  flags:   { name: 'Flag Poles', cost: 45 },
  solar:   { name: 'Solar Roof', cost: 90 },
  guns:    { name: 'Roof Gun', cost: 120 },
  planter: { name: 'Planters', cost: 30 },
  vents:   { name: 'Heat Exchangers', cost: 70 },
  holo:    { name: 'Holo Display', cost: 110 },
};
// per building: which parts it can take and what each adds. Keys: prop, mor, sales, watch, guns, odds, lab, pw, pride
export const PARTS_FOR = {
  eob:     { antenna: { odds: 0.02 }, vents: { pw: 2 }, guns: { guns: 5 }, flags: { prop: 2 } },
  vault:   { vents: { lab: 0.15 }, antenna: { lab: 0.1 }, solar: { pw: 3 }, guns: { guns: 4 } },
  warroom: { holo: { odds: 0.04 }, antenna: { odds: 0.02 }, flags: { prop: 3 }, floods: { watch: 6 } },
  halls:   { holo: { prop: 6 }, flags: { prop: 3 }, planter: { mor: 2 }, floods: { prop: 2 } },
  mart:    { sign: { sales: 4 }, holo: { sales: 5, prop: 2 }, planter: { mor: 1 }, solar: { pw: 3 } },
  casino:  { sign: { sales: 5 }, holo: { sales: 6 }, floods: { mor: 1 }, planter: { mor: 1 } },
  cryo:    { vents: { odds: 0.02 }, solar: { pw: 3 }, flags: { prop: 2 }, guns: { guns: 4 } },
  brig:    { floods: { watch: 5 }, guns: { guns: 5 }, antenna: { prop: 1 }, vents: { pw: 1 } },
  lab:     { antenna: { lab: 0.1 }, vents: { lab: 0.1 }, solar: { pw: 2 }, sign: { prop: 1 } },
  hdbarracks: { flags: { prop: 3 }, vents: { mor: 1 }, guns: { guns: 4 }, floods: { watch: 4 } },
  partyhq: { flags: { prop: 3 }, sign: { prop: 2 }, holo: { prop: 4 }, planter: { mor: 1 } },
  palace:  { flags: { prop: 4 }, floods: { prop: 3 }, holo: { prop: 5, mor: 1 }, planter: { mor: 2 } },
  factory: { vents: { make: 8 }, solar: { pw: 4 }, antenna: { make: 4 }, floods: { make: 4 } },
  command: { holo: { prop: 4 }, antenna: { odds: 0.02 }, floods: { watch: 6 }, flags: { prop: 3 } },
};

// ---------------------------------------------------------------- loans: every base starts with the Founding Charter
// rate: interest a week on what is owed. pay: the least taken each week. The Charter is what bought your start.
export const LOANS = {
  charter: { name: 'Founding Charter', amt: 3000, rate: 0.012, pay: 90, desc: 'Your landing, your first supplies and the Bureau\'s confidence, all on credit.' },
  dev:     { name: 'Bureau Development Loan', amt: 1200, rate: 0.02, pay: 70, desc: 'For growth. The Bureau believes in you, at two per cent a week.' },
  quick:   { name: 'Emergency Credit', amt: 500, rate: 0.045, pay: 60, desc: 'Fast, no questions, many consequences.' },
};
export const DEBT_MAX = 6000;   // the most the Bureau will have outstanding with one base

// ---------------------------------------------------------------- difficulty, chosen when founding the faction
// charter: the Founding Charter's size and weekly rate. sup: supplies you land with. rivals: how hard the other factions
// push. pen: how much standing losses bite. od: how far credits may run overdrawn
export const DIFF = {
  recruit:   { name: 'Recruit', desc: 'A gentle Bureau. A smaller Charter at a lower rate, slower rivals, softer penalties.', charter: 2000, rate: 0.008, sup: 4200, rivals: 0.85, pen: 0.6, od: 1200 },
  veteran:   { name: 'Veteran', desc: 'The standard posting.', charter: 3000, rate: 0.012, sup: 3600, rivals: 1, pen: 1, od: 800 },
  helldiver: { name: 'Helldiver', desc: 'A big Charter at a steep rate, hungry rivals, and a Bureau that remembers everything.', charter: 4200, rate: 0.018, sup: 3600, rivals: 1.15, pen: 1.4, od: 400 },
};

// ---------------------------------------------------------------- construction standards (design §7, after US base camp doctrine)
// Initial (tents), temporary (prefabs) and semi-permanent (concrete). Every number in B was tuned on the permanent standard,
// so "perm" is 1 everywhere; the others scale it. cost and time: of building it. cap: beds, seats, training places, ward beds,
// storage and franchise sales. up: upkeep. wear: how fast it wears (a paid building regains 12 a week). mor, prop: what its
// morale and propaganda are worth. stage: the charter it needs (1 = Fort)
export const STD = [
  { key: 'tent', name: 'Tent', doctrine: 'Initial', cost: 0.4, time: 0.35, cap: 0.75, up: 0.75, wear: 5, mor: 0.5, prop: 0.4,
    desc: 'Canvas, poles and sandbags. Cheap and up in hours, but it holds fewer, wears out without constant upkeep and nobody is proud of it.' },
  { key: 'prefab', name: 'Prefab', doctrine: 'Temporary', cost: 0.7, time: 0.65, cap: 0.9, up: 0.9, wear: 2.5, mor: 0.8, prop: 0.75,
    desc: 'Plywood huts and shipping containers off the pelican. A proper roof, near-standard capacity, moderate upkeep.' },
  { key: 'perm', name: 'Permanent', doctrine: 'Semi-permanent', cost: 1, time: 1, cap: 1, up: 1, wear: 1, mor: 1, prop: 1, stage: 1,
    desc: 'Concrete and steel. Dear and slow, but it holds the most, barely wears, and the Ministry of Truth approves. Needs a Fort charter.' },
];
// the buildings that come in all three standards; everything else has one (and counts as permanent)
export const STANDARDS = new Set(['hq', 'depot', 'fueldepot', 'shed', 'motorpool', 'yard', 'barracks', 'range', 'course', 'patrol', 'medbay',
  'armory', 'vbay', 'mess', 'burger', 'chicken', 'cola', 'lecture', 'truth', 'club']);
// engineers: crews of three do every building job, one job per crew. start: crews that land with you. train: seconds a
// yard takes to turn three recruits into a crew (a day). help: extra pace for each idle trooper lending a hand (up to two)
export const ENG = { start: 2, per: 3, train: 120, help: 0.1 };
// scrub and debris on the ground: cleared by engineers before anything is built on it. t: seconds of crew work a tile
// (half an hour). yield: supplies salvaged from a tile. keep: the landing zone, kept clear. patch: most tiles in one clearing order
export const SCRUB = { t: 2.5, yield: 5, keep: 7, patch: 24,
  density: { desert: 0.3, steppe: 0.4, ice: 0.25, jungle: 0.6, ash: 0.45 },
  name: { desert: 'scrub and rubble', steppe: 'scrub and brush', ice: 'ice boulders and drift', jungle: 'undergrowth', ash: 'slag and debris' } };
// the landing: the SEAF security detachment sweeps the ground round the landing zone before the engineers start.
// dur: seconds (about eight hours). salvage: supplies found
export const SWEEP = { dur: 42, salvage: [60, 140] };
