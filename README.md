# SOLMAR — Open-World Crime Game

[![make.fun](https://make.fun/badge.svg)](https://make.fun)
[![gta6-01](https://make.fun/badge-gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![SOLMAR](https://make.fun/badge-solmar.svg)](https://make.fun)

Milo Reyes works jobs for Cleo Vane in the coastal city of Solmar. Steal any
car, outrun the Solmar PD, run twelve story jobs — and don't get busted.

## The city

Four districts — Sunfield, Downtown, Marina and Coral Heights — on a road
grid, with a beach and an ocean to the east. Traffic (24 cars, 8 models),
44 pedestrians, streetlights, palms and landmark buildings. The wanted level
runs 1–5 stars: foot cops and cruisers give chase, and at 4–5 stars a police
helicopter with a searchlight joins in. It is fast, but it can be outrun.

## Story jobs (12)

First Wheels, Sunfield Shuffle, Coastal Cruise, Downtown Dash, Marina Meet,
Neon Grand Prix, Three Drops, The Bodyguard, The Marina Heist, Quiet Night,
Night Shift and The Getaway. Jobs pay $300–$2,000 and unlock in order; the
getaway closes the story. A repeatable chop-shop pays for stolen cars.

## Systems

- Marina Mart: repair $200, body armour $300, ammo $120, Comet GT $1,500.
- Safehouses: Sunfield (free rest) and the Coral Loft ($2,500).
- Three procedural radio stations (R to change) and a procedural WebAudio
  engine, gunshots and UI sounds — no audio files.
- Combat, ranks, a minimap HUD, localStorage saves, and a wanted system
  with heat that cools off when the PD loses sight of you.

## Play

Serve it with `node serve.ts`, then open http://localhost:8080 in a desktop
browser. WASD to move and drive, E to interact, R to change the radio,
click to shoot, Shift to run. It runs offline from static files (three.js
r160 is vendored under `game/vendor/`).
