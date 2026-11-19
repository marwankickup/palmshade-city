# Palmshade City

![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An entry for the make.fun bounty **“Make GTA 6”** — [make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01).

**Palmshade City** is an original 3D open-world crime game that runs entirely from static
files in a desktop browser — no network requests, no build step. Cruise a golden-hour
coastal city of downtown towers, a beachfront boulevard, a marina and a sandy beach.
Run a 7-mission story chain for café owner **Marisol Vega** against the Breakwater Boys,
out-drive the Palmshade PD's wanted system (0–5 stars, road-network pursuit, BUSTED
meter), jack cars, trade gunfire, and hunt 10 hidden packages stashed on terraces,
the pier end and rooftops.

## What is in the game

- **Two districts + coast**: downtown high-rises with rooftop props and lit windows,
  beachfront low-rises with awnings and Café Marisol's terrace, a parking garage you can
  climb, Warehouse 7, the Palmshade PD station, a park block, marina with bobbing boats,
  a pier, lifeguard stand and beach props — all under a sunset sky.
- **7-mission story chain**: deliveries, a package run, a heat-escape, a timed run, a
  marina pickup, an ambush shootout and a finale — with banner dialogue, a gold pillar
  objective marker and cash rewards. Replayable when finished.
- **Wanted & police AI**: witness-based crimes (theft, hit-and-runs, gunfire) raise your
  stars; interceptors spawn on the road grid and pursue with BFS routing and surround
  slots, shoot at high wanted, and fill a BUSTED meter if they pin you. Shake them off
  to decay the heat.
- **Driving & traffic**: 6 car types (sedan, sport, convertible, pickup, van, police
  interceptor), arcade physics, AI traffic with lane discipline and braking, parked cars
  to steal, damage and smoke.
- **On foot**: walk/sprint, step-up climbing (crate stairs to real rooftops), hitscan
  shooting with tracers and sparks, 26 pedestrians who stroll, flee and fall.
- **Extras**: 10 hidden packages (+$150 each), live minimap, localStorage save/Continue,
  fully synthesized WebAudio (engine, sirens, gunshots, jingles, sunset pad) — zero audio
  assets.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse | Orbit camera (pointer lock) |
| Click / F | Shoot (on foot) |
| E | Talk / enter / exit vehicle |
| Shift | Sprint |
| Space | Brake (car) / jump (on foot) |
| P or Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

then open <http://localhost:8080> in desktop Chrome. Everything loads from `game/`
(three.js r180 is vendored under `game/vendor/`); the game makes no network requests.

To pack the entry the way the bounty harness does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

which copies `game/` and `screenshots/` and writes `out/dossier.json`.

## Tech notes

- Plain ES modules under `game/src/`, one job per file: `city` (world building),
  `vehicles`/`traffic`/`police` (cars and their drivers), `player`/`peds` (people),
  `missions` (story step-engine), `combat`, `collectibles`, `minimap`, `audio`
  (synthesized), `save`, `util` (grid routing + collision), `main` (glue, HUD,
  camera, crime witnessing, `?shot=` screenshot staging, `window.__game` test hooks).
- Deterministic world generation from `?seed=`; `?shot=cover|foot|mission|chase|beach`
  stages the screenshot scenes used in `screenshots/`.
