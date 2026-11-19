# SOLMAR — Open-World Crime Game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bebek-gg/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bebek-gg/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

SOLMAR is a complete open-world crime game that runs offline in a desktop
browser from static files. It was built for
[make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

You are Milo Reyes, a wheelman who owes Cleo Vane a debt he cannot pay in
cash alone. Solmar is a sun-soaked coastal city of four districts — Old
Marina, Coral Heights, the Neon Strip and Sunfield — with a beach, a pier
and an ocean at its southern edge. Everything in it is original: the city,
the people, the cars, the story, the art, the sounds and the music.

## What is in the game

- **A city to explore on foot and by car** — a real road grid, 70+ buildings,
  streetlights, palms, a pier, rooftops and a day/night cycle.
- **Traffic and pedestrians** — 24 cars driving the grid, 10 parked cars, and
  44 walkers who stroll the sidewalks, scatter from gunfire and pick
  themselves up after a shunt.
- **Eight cars to steal and drive** — Comet GT, Sunrunner, Hauler Van, Solmar
  Cab, Muscle V8, Coastal Coupe, Dune Pickup and the PD Cruiser, each with
  its own speed and handling. Arcade driving with handbrake drifts.
- **A wanted system, one to five stars** — foot cops who chase and arrest,
  PD cruisers with sirens that ram, and a police helicopter with a
  searchlight at four stars. It flies at a capped speed, so a fast car can
  outrun it. Lose the heat, or get busted and pay bail.
- **Twelve story missions** — stealing first wheels, a timed dash, a
  shakedown, a street race, a bank job, the Neon Grand Prix, a three-drop
  courier run, an escort, the Marina Heist, a stealth job that fails if the
  PD spots you, a night of taxi fares, and the getaway. Plus a repeatable
  chop-shop: sell stolen cars to Cleo.
- **Shops and safehouses** — Marina Mart sells repairs, body armour, pistol
  ammo and a Comet GT. The Sunfield Safehouse heals Milo and clears his
  wanted level; the Coral Loft can be bought as a second safehouse.
- **Radio** — three procedural WebAudio stations (SOLMAR FM, NEON NIGHTS,
  COASTAL JAZZ), R to change station. Engine hum, sirens, rotor thump and
  gunshots are all synthesized in code; there are no audio files.
- **Combat and progression** — punch (F), shoot (click, once armed), cash
  drops, and ranks from Wheelman to Kingpin of Solmar.
- **A HUD with a minimap** — cash, rank, wanted stars, health and armour,
  speed, radio station, mission prompt and a live top-down map.
- **A save** — cash, rank, mission progress, the Coral Loft and bests are
  kept in localStorage.

## Controls

| Key | Action |
| --- | ------ |
| WASD / arrows | Move on foot, drive in a car |
| Shift | Sprint |
| Space | Jump (on foot) / handbrake (in a car) |
| E | Steal or enter a car · work a job marker · browse a shop · rest |
| F | Punch |
| Click | Shoot (once armed with the pistol) |
| R | Change radio station |
| P | Pause |
| M | Mute |
| C | Reset camera |
| Mouse drag | Look around |

## Play it

Serve `game/` with any static file server and open `index.html`:

```sh
node serve.ts
# then open http://localhost:8080
```

The game loads no network resources: three.js is vendored under
`game/vendor/`, every sound is synthesized with WebAudio, and every texture
is drawn in code.

## Layout

- `game/index.html` — the page and the HUD.
- `game/src/main.js` — the entrypoint: boot, loop, camera, interaction.
- `game/src/city.js` — the city, districts, beach, pier, day/night.
- `game/src/vehicles.js` — car models, driving physics, traffic.
- `game/src/pedestrians.js` — the crowd.
- `game/src/player.js` — Milo on foot, punches and pistol fire.
- `game/src/police.js` — wanted level, cops, cruisers, helicopter.
- `game/src/missions.js` — the twelve story jobs and the chop-shop.
- `game/src/shops.js` — Marina Mart and the safehouses.
- `game/src/hud.js` — HUD, minimap, banners and menus.
- `game/src/audio.js` — procedural sound and the three radio stations.
- `game/src/save.js` — localStorage saves and rank titles.
- `game/src/utils.js` — small math helpers.
- `main.ts` — the hand-in program (copies `game/` and `screenshots/` and
  writes `dossier.json`).
- `serve.ts` — the local static server.

## Originality

SOLMAR is entirely our own work. It uses no Rockstar Games name, logo,
character, map or asset, and no asset from any other commercial game. The
city of Solmar, Milo Reyes, Cleo Vane, the eight car models, the twelve
missions, the radio stations and all art and music were made for this game.
