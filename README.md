# FOB Super Commander

*Build your base where managed democracy needs to be managed.*

Build and run your faction's base for Super Earth. A browser game for the **Super Earth Special Forces** community, in the same look as [Orbital Fury](https://orbitalfury.com/) and [Super Orbital Simulator](https://ramziessgxr.github.io/super-orbital-simulator/).

> **Prototype 0.2** (the version shows on the title screen and in the menu). One planet, your faction and three rivals, three Ministries, 32 buildings, patrols, requisitions, inspections, a crest maker or your own uploaded logo, and troopers in your colours. Your base saves on your device.

You command a loyal sub-faction of Super Earth: your name, your crest, your colours, your base. Every week the Federation hands out supplies, and the better your standing with its Ministries, the bigger your share. Three other loyal factions on the planet want the same supplies.

## ▶ Play

Turn on GitHub Pages for this repository (Settings → Pages → deploy from `main`, root), and the game is at `https://ramziessgxr.github.io/fob-super-commander/`. It runs in a browser on a computer, or on a phone or tablet held sideways. There is nothing to install.

## How to play

- **Found your faction.** Name it, name the base and pick a motto. The crest maker has 11 crest shapes, 17 symbols (including the Helldiver fist), 9 patterns, up to four letters and four colours. You also pick your troopers' uniform, helmet and armband colours, and whether they wear the crest on the shoulder. Your crest goes on every flag, banner, billboard, memorial and statue you build. Your primary colour paints the roofs and uniforms, and the accent colour trims banners and the parade ground. Or upload your own logo (up to 2 MB, shrunk to 128 px; it stays on your device and replaces the crest everywhere). You can change all of it later from **MENU**.
- **The week.** A week is 2½ minutes. At the end of it, Super Earth ranks the four factions by total standing and splits the allocation: 1st gets 1.5×, 4th gets 0.6×. Recruits follow the same order. Then upkeep and rations are paid.
- **Three Ministries, three kinds of standing.** They all want different things, and they pull against each other.

  | Ministry | Wants | How you get it |
  | --- | --- | --- |
  | Defence | Victorious patrols | Send squads from **MINISTRIES → DEFENCE**. They march out of the gate and come back later, with a medal or a few fewer. Odds rise with veterans, drill, morale and a staffed armory. |
  | Expansion | Requisitions filled on time | Pump E-710, turn it into shells in a munitions plant, and ship it from the landing pad before the deadline. Missing one costs standing. |
  | Truth | A base that inspires | An inspector lands every week and scores morale (35%), propaganda (45%) and condition (20%). |

- **The Bureau** writes every week: memos, casualty form letters, and a ledger (MINISTRIES → STANDINGS) showing what your allocation was before its handling fee and the Presidential consulting.
- **Fast food.** One chain per base, by exclusive franchise agreement: Big Liberty Burger (huge morale, huge upkeep), Patriot Clucks (cheap, but everyone works 8% slower) or Bureau Cola & Fries (little morale, but a weekly kickback).
- **The pull.** A patrol takes troopers off the pumps. The munitions plant is loud, so troopers sleeping inside its red ring lose morale. A statue costs what a barracks costs. Every kind of propaganda is worth less the more of it you have, so variety beats ten banners.
- **Falling behind never ends the game.** A low rank means less supply, so upkeep goes unpaid. Then buildings wear down (grime on the roofs, lower output), morale slips and inspections suffer. You can always climb back with patrols, requisitions and repairs.
- **The tech tree.** Some buildings need others first. The munitions plant needs a pump and a depot, the generator needs a pump, the parade ground, armory and memorial need barracks, the loudspeaker and billboard need a Truth Office, and the statue needs both a Truth Office and a parade ground.
- **The Super Earth flag** flies at the centre of every base and can't be removed. Your faction flag and banners go beside it. Troops salute it, and medal ceremonies gather under it.
- **Votes.** The Bureau doesn't count people, it counts votes: "Two votes have been delivered to your base." The little people on screen stay people.
- **Porta potties** get dirtier the more votes use them, and an idle trooper is always on latrine duty. Too few means queues, and a filthy one hurts morale.
- **The ant farm.** You never manage people one by one. Troopers crew the buildings that need them and help build what's going up. Idle ones drill on the parade ground, salute the flag, queue at the vending machine, eat in the mess, admire the statue and stand at the memorial. Pelicans bring the allocation, recruits and the inspector, and forklifts unload the crates. When a patrol earns a medal, everyone lines up at the flag.

### Controls

| | Computer | Phone or tablet |
| --- | --- | --- |
| Move around | drag, or `W A S D` / arrows | drag |
| Zoom | scroll | pinch |
| Rotate | `Q` `E`, or right-drag | two-finger twist |
| Build | pick at the bottom (`Tab` changes group, `1`-`9` picks), `R` turns it, click to place, `Shift`+click to keep placing | tap the building, then tap the ground |
| Select | click a building | tap it |
| Other | `Space` pause, `M` Ministries, `H` hide the interface, `Del` demolish, `Esc` cancel | |

## The buildings

The build bar is grouped by the Ministry that owns each building.

| Ministry | Buildings |
| --- | --- |
| Expansion | Command HQ, Super Earth Flag, Landing Pad, Supply Depot, SEAF Bunker (storage), Solar Array, E-710 Generator, E-710 Pump, Munitions Plant |
| Defence | Barracks, Parade Ground, Armory, Helldiver Barracks (cryo), Underground Bunker |
| Humanity | Prefab Hab, Vending Machine, Porta Potty, Mess Hall, Big Liberty Burger, Patriot Clucks, Bureau Cola & Fries, Hydro Dome |
| Truth | Truth Office, Faction Flag, Banner, Helldivers Banner, Loudspeaker, Logo Billboard, Reflecting Pool, Memorial Wall, Liberty Statue |

## How it's built

Plain JavaScript modules, no framework and no build step. The 3D view is three.js, vendored as one file in `js/vendor/`. Every building, person, vehicle and crest is drawn in code, and there are no model or image files. The look (palette, type, panels and buttons) carries over from Orbital Fury and Super Orbital Simulator.

```
index.html          the page, the title, the faction editor, the HUD
css/style.css       the Orbital Fury theme plus the base-builder HUD
js/config.js        every tuning number: buildings, Ministries, missions, rivals, the week
js/sim.js           the simulation: buildings, crews, power, morale, propaganda, patrols, requisitions,
                    inspections, rivals, allocation, upkeep, saving (no DOM, no 3D)
js/life.js          the ant farm: troopers, forklifts, pelicans, crates, inspectors, ceremonies
js/models.js        every building, person and vehicle, built from simple shapes
js/logo.js          the crest maker
js/view.js          the 3D view: rotating near-isometric camera, ground, the wire, picking
js/demo.js          the finished base behind the title screen
js/main.js          the loop, input, HUD, Ministries panel, faction editor, saves
js/rng.js, noise.js seeded random and value noise (from Super Orbital Simulator)
test/headless.mjs   plays a base without a browser and prints the standings week by week
test/ui.mjs         clicks through the real page on a desktop and on a phone held sideways
```

**Running your own copy:** serve this folder with any local web server (`npm start`, then open <http://localhost:8080>). Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`. Add `?play` to skip the title, and `&seed=N` to fix the map.

**Tests:** `npm run sim` needs only Node. It plays 14 weeks with a simple bot, and `npm run sim:idle` shows the soft decline of a base that builds nothing. For the browser test, run `npm install` and `npm start`, then `npm run ui` in another terminal.

**Saves:** the base saves on your device every 20 seconds and when you leave. **MENU → COPY SAVE CODE** gives you the whole base as text to keep or move to another device, and **LOAD SAVE CODE** brings it back.

## Credits and disclaimer

- **Created and vibe coded by** Robert Troumbley (RamziesSGXR), head admin of the Super Earth Special Forces (SESF) community.
- **Art is drawn in code.** There are no image or model files in the game.
- **three.js** (MIT License, three.js authors) draws the 3D. See `js/vendor/THREE-LICENSE`.
- **Inspired by** Helldivers 2 (Arrowhead Game Studios, published by Sony Interactive Entertainment).
- **Unofficial fan project.** Not affiliated with, endorsed by or sponsored by Arrowhead Game Studios or Sony Interactive Entertainment. Helldivers, Super Earth, E-710, Pelican and the other names, phrases and settings from the Helldivers games belong to their owners and are used only to refer to them. Free, no ads, collects nothing, provided as is with no warranty.
