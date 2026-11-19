# Palmshade City

![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An original open-world crime game for the make.fun bounty
[**Make GTA 6 (gta6-01)**](https://make.fun/bounty/gta6-01) — built for
[make.fun](https://make.fun).

Golden hour over Palmshade City: a sun-soaked coastal city of pastel towers,
palm boulevards and a working marina. Café owner **Marisol Vega** is losing her
business to the Breakwater Boys, and she needs a driver. Run her deliveries,
steal back what they stole, find the hidden packages, and try not to get
busted — Palmshade PD runs a 0–5 star wanted system with grid-routed pursuit.

## What's in the game

- **Two districts**: downtown high-rises with rooftop water towers, AC units and
  antennas; beachfront low-rise with striped awnings and café terraces
- **Living streets**: AI traffic on the road grid, 26 pedestrians who stroll,
  flee and occasionally get knocked down, benches, hydrants, bus stops, beach
  umbrellas, a volleyball net, a lifeguard stand and boats bobbing in the marina
- **7-mission story chain** (deliveries, a package run, a car recovery, a timed
  lunch rush, a marina pickup, a two-van convoy and a warehouse finale) plus
  **10 hidden collectible packages** on rooftops, alleys, the pier and beaches
- **Police system**: witness-based crimes, road-grid routing pursuit, slot
  flanking, a BUSTED meter, wanted decay, and officers who shoot back at 4+ stars
- **Cars**: sedan, sport, convertible, pickup, van and police interceptor —
  arcade physics, damage smoke, dead engines
- **Presentation**: PCF soft shadows, ACES filmic tone mapping, emissive lit
  windows, gradient sky with sun disc and drifting clouds, live minimap, and a
  fully synthesized WebAudio soundtrack (engine, sirens, gunfire, chord pads) —
  no audio files, no network requests, everything vendored or generated

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click game first) | Orbit camera, aim |
| Mouse click | Shoot (on foot) |
| E | Enter / exit car |
| F | Talk to Marisol at Café Marisol |
| Shift | Sprint |
| Space | Handbrake |
| P | Pause (save from the pause menu) |

Progress (money, missions, packages, position) saves to localStorage; use
**Continue** on the title screen to pick up where you left off.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Or serve the `game/` folder with any static file server. The dossier/hand-in
program is `main.ts` (`node main.ts` with `MAKEFUN_OUTPUT_DIR` set).

## Tech notes

- three.js r180 vendored under `game/vendor/` (module wrapper + core build);
  the game loads with **zero network requests**
- All textures are painted on canvas at runtime; all audio is synthesized with
  WebAudio; the city, missions and traffic are procedural from a seeded RNG
- Source is split by job under `game/src/`: `city`, `vehicles`, `player`,
  `traffic`, `peds`, `police`, `missions`, `combat`, `collectibles`, `audio`,
  `minimap`, `save`, `util`, `main`
- Debug/staging hooks: `window.__game`, plus `?shot=cover|foot|mission|chase|beach&seed=1`
  URL scenes used for the screenshots in `screenshots/`
