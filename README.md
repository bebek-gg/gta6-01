# SOLMAR — Open-World Crime

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bebek-gg/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bebek-gg/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**SOLMAR** is a complete open-world crime game built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). It runs entirely offline
in a desktop browser from the static files under `game/` — no network requests, three.js
vendored locally.

## The game

You are **Milo Reyes**, a wheelman with a debt to **Cleo Vane**, in the sun-soaked coastal
city of **Solmar**. Steal cars, run jobs, dodge the Solmar PD, and pull the big score at
Coral Bank — or just cruise the Neon Strip and see what the night brings.

- **A city on foot and by car** — four districts (Old Marina, Coral Heights, Neon Strip,
  Sunfield), a beach and ocean, traffic and pedestrians on a real road grid.
- **Steal any car** — parked cars or jack one from traffic, then drive it with arcade
  physics (handbrake drifts included).
- **Wanted system** — 1 to 5 stars. The Solmar PD sends foot cops and cruisers with
  sirens; lose them to cool off, or get busted and pay bail.
- **Five story missions** — First Wheels, Running Late, The Shakedown, Hot Pursuit, and
  The Big Score, plus a repeatable chop-shop: sell stolen cars to Cleo.
- **Combat, cash and progression** — punch, shoot, collect cash drops, rank up from
  Wheelman to Kingpin of Solmar.
- **HUD with minimap, saves, procedural sound** — WebAudio engine hum, sirens, gunshots
  and a bass loop, all generated in code. Progress saves to localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter or steal a car (hold at a job marker to work it) |
| F | Punch |
| Click | Shoot (once armed) |
| Drag mouse | Look around |
| P | Pause · M mute · C reset camera |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output`
and writes `/output/dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Everything in the game is original: the city, characters, vehicles, names, story, art,
sound and music. No Rockstar Games name, logo, character, map or asset is used.
