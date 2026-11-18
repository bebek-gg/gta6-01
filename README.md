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
  sirens; at 4–5 stars a **police helicopter** joins the hunt, leading you down the
  street with its searchlight raking back onto your car. Outrun the bird in a fast car
  and its searchlight loses you, or shake it at a safehouse. Lose them to cool off,
  or get busted and pay bail.
- **Twelve story missions** — First Wheels, Running Late, The Shakedown, Hot Pursuit, The
  Big Score, the Neon Grand Prix street race, then Three Drops, The Bodyguard, The Marina
  Heist, Quiet Night (a no-heat stealth job), Night Shift (taxi fares) and The Getaway,
  plus a repeatable chop-shop: sell stolen cars to Cleo.
- **Shops and safehouses** — spend cash in Old Marina on repairs, body armor, pistol ammo
  and a Comet GT of your own; rest at the Sunfield Safehouse to clear your wanted level and
  heal, or buy the Coral Loft as a second safehouse.
- **Radio** — three procedural stations (SOLMAR FM, NEON NIGHTS, COASTAL JAZZ) on Key R.
- **Eight car models** — Comet GT, Sunrunner, Hauler Van, Solmar Cab, Muscle V8, Coastal
  Coupe, Dune Pickup and the PD Cruiser, with denser traffic and more pedestrians.
- **Combat, cash and progression** — punch, shoot (with ammo), collect cash drops, rank up
  from Wheelman to Kingpin of Solmar.
- **HUD with minimap, saves, procedural sound** — WebAudio engine hum, sirens, rotor thump,
  gunshots and a three-station radio, all generated in code. Progress saves to localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter or steal a car (hold at a job marker to work it; near a shop, browse it) |
| F | Punch |
| Click | Shoot (once armed; uses ammo) |
| R | Change radio station |
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
