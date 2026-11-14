// The Base Ledger: the Commander's desk. Citizens and officials file requests; each is a small decision with a price.
// Also the roster files the Commander grades. All of it is data and pure functions; the simulation applies the effects.
//
// A request: from (who files it), title, text (NAME is replaced with a person's name), and two or three options.
// An option's fx: sup and cr (negative is a cost), mood (morale for a few days), def / pro / tru (Ministry standing),
// pride. say: what the comms log records. when(sim): only offered if true.

// a request only reaches the desk once whoever files it has an office on the base: the Patrol Office's request needs a
// Patrol Office, a trooper's needs a barracks, a Ministry's needs the building it works through. The Bureau writes to every HQ.
export const OFFICE = {
  'Citizen': ['mess', 'barracks', 'hab', 'block'], 'Trooper': ['barracks', 'hdbarracks'], 'Patrol Office': ['patrol'], 'Motor Pool': ['motorpool'],
  'Medical': ['medbay'], 'Quartermaster': ['depot'], 'SEAF': ['shed'], 'Franchise': ['burger', 'chicken', 'cola'], 'Inspector': ['comms'],
  'Ministry of Truth': ['truth', 'mast'], 'Ministry of Defence': ['patrol', 'range'], 'Ministry of Humanity': ['lecture', 'hab', 'block'], 'Ministry of Science': ['lab'],
};
export const hasOffice = (s, from) => !OFFICE[from] || OFFICE[from].some(t => s.b.some(b => b.type === t && b.done));
export const REQUESTS = [
  { from: 'Citizen', title: 'Request for leave', text: 'NAME of the canteen asks for two days of leave to visit a sister on Super Earth. Form L-2 is attached, in triplicate, one copy slightly damp.',
    opts: [{ label: 'APPROVE', fx: { mood: 4, cr: -10 }, say: 'Leave approved. NAME was seen smiling, which has been noted.' },
           { label: 'DENY', fx: { mood: -3, pro: 1 }, say: 'Leave denied. Productivity is its own holiday.' }] },
  { from: 'Citizen', title: 'A sign for the canteen', text: 'The mess staff would like a sign reading "EAT FOR DEMOCRACY". They have a design. It has a lot of exclamation marks.',
    opts: [{ label: 'FUND IT (25 CR)', fx: { cr: -25, mood: 3, tru: 1 }, say: 'The sign is up. Consumption of the grey stew is unchanged.' },
           { label: 'USE CARDBOARD', fx: { mood: 1 }, say: 'A cardboard sign is up. It is already curling.' },
           { label: 'DENY', fx: { mood: -1 }, say: 'No sign. The stew speaks for itself.' }] },
  { from: 'Bureau', title: 'Voluntary efficiency contribution', text: 'The Bureau invites your base to make a voluntary contribution toward the Presidential Efficiency Initiative. Participation is recorded. So is the lack of it.',
    opts: [{ label: 'CONTRIBUTE (40 CR)', fx: { cr: -40, pro: 2 }, say: 'Contribution received. A certificate is in the post. It will not arrive.' },
           { label: 'CONTRIBUTE SUPPLIES (80)', fx: { sup: -80, pro: 2 }, say: 'Eighty supplies have been made more efficient by leaving.' },
           { label: 'DECLINE', fx: { pro: -2 }, say: 'Your decision not to volunteer has been filed under "Remembered".' }] },
  { from: 'Ministry of Truth', title: 'Extra broadcast hour', text: 'The Ministry proposes an additional hour of evening broadcast. Citizens will be free to attend, in the sense that attendance is free.',
    opts: [{ label: 'APPROVE', fx: { tru: 3, mood: -2 }, say: 'The broadcast now runs an hour longer. Applause was sustained and supervised.' },
           { label: 'KEEP THE HOUR FREE', fx: { tru: -1, mood: 3 }, say: 'The evening stays free. The Ministry has made a note, and underlined it.' }] },
  { from: 'Trooper', title: 'Transfer to the front', text: 'NAME requests an early transfer to the front. The request is four pages long and mentions liberty nineteen times.',
    opts: [{ label: 'COMMEND THE SPIRIT', fx: { pride: 3, def: 1 }, say: 'NAME has been commended and told to wait for the transport like everyone else.' },
           { label: 'DENY: MORE TRAINING', fx: { mood: -1 }, say: 'Request denied. NAME was seen doing press-ups at the flag.' }] },
  { from: 'Citizen', title: 'A complaint about the potties', text: 'A petition, signed by eleven citizens and one person who signed twice, asks that the latrines be cleaned "more than never".',
    opts: [{ label: 'HIRE A CLEANER (30 CR)', fx: { cr: -30, mood: 4, clean: true }, say: 'The latrines have been cleaned. The petitioners have been thanked and counted.' },
           { label: 'ISSUE A STATEMENT', fx: { tru: 1, mood: -2 }, say: 'A statement confirms the latrines are a triumph. Nobody has read it in there.' }],
    when: s => s.has('potty') },
  { from: 'Franchise', title: 'Sponsored reveille', text: 'A franchise offers to sponsor the morning bugle call. The bugler would say the name of a burger before and after.',
    opts: [{ label: 'ACCEPT (60 CR)', fx: { cr: 60, tru: -2, mood: -1 }, say: 'Reveille is now brought to you by a burger. The flag looked uncomfortable.' },
           { label: 'REFUSE', fx: { pride: 2 }, say: 'The bugle remains unsponsored. The burger withdrew with dignity.' }],
    when: s => s.has('burger') || s.has('chicken') || s.has('cola') },
  { from: 'Quartermaster', title: 'Surplus crates', text: 'A pelican crew has "found" a pallet of supplies with another base\'s name on it. They are willing to un-find it for a consideration.',
    opts: [{ label: 'BUY QUIETLY (35 CR)', fx: { cr: -35, sup: 120, tru: -1 }, say: 'The pallet has joined your stores. The paperwork has joined the incinerator.' },
           { label: 'REPORT IT', fx: { tru: 2, pro: 1 }, say: 'The pallet was returned. A rival faction sent a card. It was sarcastic.' }] },
  { from: 'Citizen', title: 'A club for off-duty hours', text: 'NAME asks permission to start a Workers\' Club: chess, approved literature, and a kettle.',
    opts: [{ label: 'APPROVE WITH A KETTLE (20 CR)', fx: { cr: -20, mood: 5 }, say: 'The Workers\' Club has met. The kettle is already the most popular member.' },
           { label: 'APPROVE, NO KETTLE', fx: { mood: 2 }, say: 'The club has met. There was chess. There was no tea.' },
           { label: 'DENY', fx: { mood: -2, tru: 1 }, say: 'No club. Unsupervised chess leads to unsupervised thinking.' }] },
  { from: 'Ministry of Defence', title: 'Extra drill', text: 'The Ministry suggests your troopers would benefit from a night exercise. The troopers have not been asked.',
    opts: [{ label: 'ORDER IT', fx: { def: 3, mood: -4 }, say: 'The night exercise was a success. Several troopers found the wall by walking into it.' },
           { label: 'LET THEM SLEEP', fx: { mood: 2, def: -1 }, say: 'The base slept. The Ministry did not.' }] },
  { from: 'Citizen', title: 'Lost property', text: 'NAME has handed in a wallet found by the landing pad. It contains 45 credits and no name.',
    opts: [{ label: 'BASE FUNDS', fx: { cr: 45, mood: -1 }, say: 'The credits have been absorbed by the base. NAME looked at you for a moment longer than usual.' },
           { label: 'REWARD THE FINDER', fx: { cr: 20, mood: 3 }, say: 'NAME kept a finder\'s share and told everyone. Honesty is up this week.' }] },
  { from: 'Bureau', title: 'Census of votes', text: 'The Bureau requires a recount of the votes on your base. A clerk can do it properly, or your figure from last week can be sent again with confidence.',
    opts: [{ label: 'PAY A CLERK (15 CR)', fx: { cr: -15, pro: 2 }, say: 'The votes were counted. There was one more than expected. He has been issued a bunk.' },
           { label: 'SEND LAST WEEK\'S', fx: { pro: -1, tru: -1 }, say: 'Last week\'s figure was sent. The Bureau replied with last week\'s thanks.' }] },
  { from: 'Trooper', title: 'A band', text: 'Four troopers and a citizen with a tuba ask to form a base band for the colours. They have rehearsed. This is a warning.',
    opts: [{ label: 'INSTRUMENTS (30 CR)', fx: { cr: -30, pride: 4, mood: 3 }, say: 'The band played at Retreat. The flag came down slightly faster than usual.' },
           { label: 'VOICES ONLY', fx: { mood: 1 }, say: 'An a cappella anthem was attempted. It was sincere.' }] },
  { from: 'Medical', title: 'Vitamins', text: 'The medic recommends a course of vitamins for everyone. They are orange and the size of a thumb.',
    opts: [{ label: 'ISSUE THEM (50 SUP)', fx: { sup: -50, mood: 3, heal: true }, say: 'Vitamins issued. The wounded are mending faster and everyone is slightly orange.' },
           { label: 'FRESH AIR IS FREE', fx: {}, say: 'No vitamins. A walk round the wall was prescribed instead.' }],
    when: s => s.has('medbay') },
  { from: 'Inspector', title: 'A quiet word', text: 'The inspector lets it be known that inspections go more smoothly on bases that understand hospitality. He mentions his birthday.',
    opts: [{ label: 'A GIFT (50 CR)', fx: { cr: -50, tru: 4 }, say: 'The inspector received a fruit basket. His notes this week were written in a rounder hand.' },
           { label: 'A FIRM HANDSHAKE', fx: { tru: -1, pride: 2 }, say: 'The inspector received a handshake. He counted his fingers afterwards.' }] },
  { from: 'Citizen', title: 'Overtime', text: 'The depot staff offer to work a double shift this week if the base pays for it. They have already made sandwiches.',
    opts: [{ label: 'PAY OVERTIME (40 CR)', fx: { cr: -40, sup: 90, pro: 1 }, say: 'The depot ran all night. Ninety supplies were found behind other supplies.' },
           { label: 'NOT THIS WEEK', fx: {}, say: 'Overtime declined. The sandwiches were eaten on the clock.' }],
    when: s => s.has('depot') },
  { from: 'Citizen', title: 'Form C-01: permission to procreate', text: 'NAME of the motor pool and a spouse in the Liberty Habitat submit Form C-01. The Ministry of Humanity needs the base Commander\'s countersignature. The form is eleven pages and has a section on genetic loyalty.',
    opts: [{ label: 'COUNTERSIGN', fx: { mood: 3 }, say: 'C-01 countersigned. A future citizen has been pencilled in.' },
           { label: 'RETURN FOR CORRECTIONS', fx: { pro: 1 }, say: 'C-01 returned. Section 4b was in the wrong shade of blue ink.' }] },
  { from: 'Citizen', title: 'A family visit', text: 'NAME\'s family has a travel permit to visit the base for one afternoon. They would like to see the flag and eat in the mess. Their child has drawn a picture of a Hellbomb.',
    opts: [{ label: 'WELCOME THEM', fx: { mood: 3, sup: -10 }, say: 'The family toured the base. The child saluted everything, including a forklift.' },
           { label: 'NOT DURING DUTY', fx: { pro: 1 }, say: 'Visit postponed. The Hellbomb drawing has been pinned up in the canteen anyway.' }] },
  { from: 'Ministry of Humanity', title: 'Census of dependants', text: 'The Ministry of Humanity is counting the families of base personnel. Every citizen must list their dependants on Form C-07. NAME has listed a cat.',
    opts: [{ label: 'FILE THE CENSUS', fx: { pro: 1 }, say: 'Census filed. The cat has been issued a citizen number provisionally.' },
           { label: 'ACCEPT THE CAT', fx: { mood: 2 }, say: 'The cat is now the base mascot, on paper.' }] },
  { from: 'Motor Pool', title: 'A tyre shortage', text: 'NAME at the Motor Pool reports the trucks are on their last good tyres. A Bureau catalogue offers retreads at a discount, or new ones at full price with a Ministry sticker.',
    opts: [{ label: 'NEW TYRES (30 CR)', fx: { cr: -30, pro: 2 }, say: 'New tyres fitted. The trucks look almost proud.' },
           { label: 'RETREADS (10 CR)', fx: { cr: -10, pro: 1 }, say: 'Retreads fitted. One squeals on corners; it has been named Liberty.' }] },
  { from: 'SEAF', title: 'A pen pal programme', text: 'The Ministry of Truth asks the base to join its pen pal scheme: troopers write to schoolchildren on Super Earth. NAME has volunteered to censor the letters.',
    opts: [{ label: 'JOIN THE SCHEME', fx: { tru: 2, mood: 2 }, say: 'Letters are going out. One child has asked whether bugs have feelings. The censor said no.' },
           { label: 'NO TIME', fx: { pro: 1 }, say: 'The base is too busy for letters. The Ministry of Truth has noted the missed opportunity.' }] },
  { from: 'Citizen', title: 'A talent night', text: 'NAME of the canteen staff wants to hold a talent night in the mess. Acts so far: a juggler, a poet, and a trooper who can recite the Federation Constitution backwards.',
    opts: [{ label: 'ALLOW IT', fx: { mood: 4, sup: -8 }, say: 'Talent night was a success. The backwards Constitution was declared both patriotic and unsettling.' },
           { label: 'LIGHTS OUT AS USUAL', fx: { pro: 1 }, say: 'No talent night. The juggler practises alone behind the depot.' }] },
  { from: 'Ministry of Science', title: 'A field test', text: 'The Ministry of Science wants to test a new ration flavour on the base: "Liberty Stew, Mark II". NAME has read the ingredients and requests a transfer.',
    opts: [{ label: 'VOLUNTEER THE BASE', fx: { cr: 25, mood: -2 }, say: 'Mark II has been served. The Ministry pays 25 credits for the data. The data is mostly groaning.' },
           { label: 'DECLINE POLITELY', fx: {}, say: 'Declined. Mark II goes to another base. Our thoughts are with them.' }] },
  { from: 'Patrol Office', title: 'Spare boots', text: 'NAME at the Patrol Office says the squads are wearing through boots faster than the Bureau replaces them. A crate of spares would keep patrols moving.',
    opts: [{ label: 'ORDER A CRATE (20 CR)', fx: { cr: -20, def: 2 }, say: 'Fresh boots issued. Morale is up, blisters are down.' },
           { label: 'TELL THEM TO DARN', fx: { mood: -2 }, say: 'Darning kits issued. The squads are not amused.' }] },
  { from: 'Citizen', title: 'A lost cat', text: 'NAME reports the base cat (citizen number pending) has not been seen since the last supply pelican. A search would take an hour of somebody\'s time.',
    opts: [{ label: 'ORGANISE A SEARCH', fx: { mood: 3 }, say: 'The cat was found asleep in a crate of e-710 fuel cans. It has been reprimanded and fed.' },
           { label: 'IT WILL COME BACK', fx: {}, say: 'The cat came back on its own two days later, looking smug.' }] },
];

// ---------------------------------------------------------------- roster files
export const GRADES = ['A', 'B', 'C', 'D'];
const CONDUCT = [
  ['Asked the flag for permission to blink.', 'Volunteers before the question is finished.', 'Irons own bootlaces.'],
  ['Punctual. Salutes vending machines, to be safe.', 'Keeps a tidy bunk and an untidy diary.', 'Reliable. Hums the anthem while queueing.'],
  ['Late twice, with reasons.', 'Has opinions about the stew and shares them.', 'Was found asleep standing up. Technically on duty.'],
  ['Lost a rifle. Found a different one. Cannot explain either.', 'Asked what the Bureau is for.', 'Traded a helmet for a sandwich.'],
];
// what the Commander reads: range card, course time, a conduct note. Conduct is words, so it takes judgement
// next of kin, for the file: flavour only, picked from the trooper's id so it never changes
const KIN = ['Mother on Super Earth, works in a munitions plant. Writes weekly; the censor reads monthly.',
  'No family listed. Super Earth is family enough.', 'Wife and two children in a Liberty Habitat. C-01 permits on file, all approved.',
  'Father served on Malevelon Creek. Does not discuss it.', 'Older sister in the Ministry of Truth. Sends posters.',
  'Husband, a hydroponics technician on Mars. C-01 application pending: 14 months and counting.',
  'Grandmother on Super Earth, 103, still voting.', 'Twin brother, also SEAF, on another planet. Each insists he is the better shot.',
  'Parents run a canteen in Democracy Sector 9. Their meatloaf was commended.', 'Fiancée on Super Earth. Wedding approved for after the war.',
  'Three cousins in the Helldivers. Only one still answers letters, for obvious reasons.', 'Adopted by the state. Very well adjusted. Very.'];
export function fileOf(t) {
  const q = t.q, band = q.con >= 80 ? 0 : q.con >= 62 ? 1 : q.con >= 45 ? 2 : 3, secs = Math.round(260 - q.fit * 1.5);
  return { range: `${Math.round(q.aim / 10)} of 10 targets`, course: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, conduct: CONDUCT[band][t.id % 3], missions: t.missions, medals: t.medals, kin: KIN[(t.id * 7 + 3) % KIN.length] };
}
export function merit(t) { return (t.q.aim + t.q.fit + t.q.con) / 3 + Math.min(12, t.missions * 3) + t.medals * 6; }
export function trueGrade(t) { const m = merit(t); return m >= 80 ? 'A' : m >= 66 ? 'B' : m >= 52 ? 'C' : 'D'; }

// ---------------------------------------------------------------- calls from the Ministries: optional, but ignoring them costs
// g: what is asked for (rations, fuel, ammo, supplies, credits). n(sim): how much. m: whose standing. days: time to answer
export const CALLS = [
  { m: 'def', g: 'ammo', title: 'Ammunition for the Creek', text: 'The front at the Creek is short of rounds. The Ministry of Defence asks your base to set aside ammunition for the next transport.', n: s => 30 + s.week * 6, days: 4 },
  { m: 'def', g: 'rations', title: 'Rations for a relief column', text: 'A relief column passes your sector and has eaten its boots. Set aside rations and they will collect.', n: s => 40 + s.week * 8, days: 4 },
  { m: 'pro', g: 'fuel', title: 'E-710 for the fleet', text: 'A destroyer in orbit is running on fumes and optimism. The Ministry of Expansion requests E-710 from your stores.', n: s => 30 + s.week * 6, days: 5 },
  { m: 'pro', g: 'supplies', title: 'A neighbouring outpost', text: 'An outpost two valleys over was built by a committee. It needs supplies to finish its own wall. Solidarity is mandatory.', n: s => 200 + s.week * 40, days: 5 },
  { m: 'tru', g: 'credits', title: 'War bonds', text: 'The Ministry of Truth is selling Liberty Bonds. Bases are expected to show leadership by buying the first ones. Loudly.', n: s => 60 + s.week * 15, days: 5 },
  { m: 'tru', g: 'supplies', title: 'A parade float', text: 'Super Earth\'s Liberty Day parade needs a float from every sector. Yours will be a large papier-mâché eagle. Supplies, please.', n: s => 150 + s.week * 30, days: 6 },
  { m: 'def', g: 'credits', title: 'Medals for the fallen', text: 'The Ministry is striking medals for a battle your troopers fought in. Bases are invited to fund their own. It would look bad not to.', n: s => 50 + s.week * 12, days: 5 },
  { m: 'pro', g: 'ammo', title: 'A training exercise', text: 'A sector-wide live-fire exercise is planned. Your base is asked to provide the live part.', n: s => 25 + s.week * 5, days: 4 },
];
