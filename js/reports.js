// After-action reports: a few lines in the Ministry of Defence's voice for every operation that comes back.
// Plain data in, plain text out; the sim keeps them and the Defence tab shows them.

const pick = (r, a) => a[Math.floor(r() * a.length)];

const APPROACH = {
  'Recon sweep': ['The squad moved out light and quiet toward PLACE.', 'Recon element advanced on PLACE in two bounds.'],
  'Bug hole closure': ['The squad advanced on the nest at PLACE with grenades ready.', 'Terminid activity was confirmed at PLACE. The squad went in.'],
  'Convoy escort': ['The squad met the supply convoy short of PLACE and took the flanks.', 'Escort formed up on the convoy and rolled for PLACE.'],
  'Bot outpost raid': ['The squad approached the Automaton outpost at PLACE from downwind.', 'Fabricator smoke was sighted over PLACE. The squad closed in.'],
  'Civilian evacuation': ['The squad reached the settlers sheltering at PLACE.', 'Citizens were reported trapped at PLACE. The squad went to bring them in.'],
  'Retrieve stolen flag': ['The stolen flag was traced to PLACE.', 'Intelligence placed the stolen flag at PLACE. Unacceptable.'],
  'Orbital spotting run': ['The squad climbed to a vantage point over PLACE with a beacon.', 'Spotters set up over PLACE to call down the Destroyer.'],
  'Armoured assault': ['The assault column formed up for the push on PLACE.', 'Armour and infantry advanced together on PLACE.'],
  'Standing patrol': ['Routine patrol walked the route out past PLACE.', 'The squad patrolled the approaches round PLACE.'],
};
const WIN = {
  'Recon sweep': ['Enemy positions were mapped and the squad got out unseen.', 'Three enemy movements logged; the Ministry has the coordinates.'],
  'Bug hole closure': ['Every hole was sealed. The ground stopped moving.', 'The nest was collapsed in one go. Hives are a matter of paperwork now.'],
  'Convoy escort': ['The convoy arrived whole, crates and drivers alike.', 'Two ambushes were broken and the convoy made it through.'],
  'Bot outpost raid': ['The fabricators were destroyed and the outpost burned.', 'The outpost was levelled. Its parts are being studied by the Ministry of Science.'],
  'Civilian evacuation': ['Every citizen was brought out alive and grateful.', 'The settlers were brought in. One child asked to enlist.'],
  'Retrieve stolen flag': ['The flag was recovered, folded properly, and returned.', 'The flag is home. The thieves were corrected.'],
  'Orbital spotting run': ['The barrage landed on target. The Destroyer captain sends regards.', 'Targets were painted and erased from orbit.'],
  'Armoured assault': ['The line broke and the position was taken.', 'The objective was overrun by early afternoon.'],
  'Standing patrol': ['Nothing got past.', 'The route was clear. Two contacts were dealt with quietly.'],
};
const LOSS = {
  'Recon sweep': ['The squad was spotted and had to fall back under fire.'], 'Bug hole closure': ['The swarm came up faster than the grenades went down. The squad withdrew.'],
  'Convoy escort': ['The convoy was hit hard and half the crates were lost.'], 'Bot outpost raid': ['Heavy Devastators held the outpost. The squad pulled back.'],
  'Civilian evacuation': ['The squad was cut off and only some of the citizens got out.'], 'Retrieve stolen flag': ['The flag was not recovered. An inquiry has been opened.'],
  'Orbital spotting run': ['The beacon was lost before the barrage was called.'], 'Armoured assault': ['The assault stalled under artillery and fell back to the start line.'],
  'Standing patrol': ['The patrol ran into more than it could handle and came home early.'],
};
const FRV = ['The FRV got them there fast and out faster.', 'The FRV ran the wounded back between runs.', 'The FRV took the long road round and still arrived first.'];
const TANK = ['The tank went through the first line on its own.', 'The tank held the centre while the squad worked round.', 'Nobody argued with the tank.'];
const NOVEH = ['They went on foot the whole way.', 'No vehicle was free; boots it was.'];

export function writeReport(r, p, out) {
  const kind = p.office ? 'Standing patrol' : p.kind, place = p.place ? `the ${p.place}` : 'the objective';
  const lines = [pick(r, APPROACH[kind] || APPROACH['Standing patrol']).replace('PLACE', place)];
  if (!p.office) lines.push(p.veh?.length ? p.veh.map(k => pick(r, k === 'frv' ? FRV : TANK)).join(' ') : pick(r, NOVEH));
  lines.push(pick(r, (out.win ? WIN : LOSS)[kind] || (out.win ? WIN : LOSS)['Standing patrol']));
  if (p.wants && !p.office) lines.push(p.veh?.includes(p.wants) ? `Command notes that bringing the ${p.wants === 'frv' ? 'FRV' : 'tank'} was the right call.` : `Command notes that ${p.wants === 'frv' ? 'an FRV' : 'a tank'} would have helped.`);
  if (out.dead.length) lines.push(`Killed in action: ${out.dead.join(', ')}.`);
  if (out.hurt.length) lines.push(`Wounded: ${out.hurt.join(', ')}.`);
  if (out.evac.length) lines.push(`Evacuated off planet: ${out.evac.join(', ')}.`);
  if (out.lostVeh.length) lines.push(`Lost: the ${out.lostVeh.join(' and the ')}.`);
  if (out.hero) lines.push(`${out.hero} is put up for the Medal of Valour.`);
  if (!out.dead.length && !out.hurt.length && !out.evac.length) lines.push('Everyone came home.');
  return lines;
}
