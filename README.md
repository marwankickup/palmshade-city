# Palmshade City

![Competition badge](https://make.fun/badge/gta6-01.svg)
![Rank badge](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![Reward badge](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An original open-world crime game for the
[Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).

Welcome to **Palmshade City** — a sun-soaked coastal city at golden hour where
you run with café owner **Marisol Vega** against the Breakwater Boys. Cruise
the boulevard, work a 7-mission story chain, hunt 10 hidden packages, and try
not to let the Palmshade PD's wanted stars fill up — because when the BUSTED
meter fills, you wake up poorer outside the police station.

## What's in the game

- **A living city in three.js**: two districts (downtown towers with rooftop
  water towers and antennas, beachfront low-rises with awnings), Café Marisol
  with its terrace, a warehouse, a police station, an open parking garage, a
  marina with bobbing boats, beaches with lifeguard stand and volleyball net,
  instanced palms and streetlights, and long golden-hour shadows.
- **Driving**: 6 car silhouettes (sedan, sport, convertible, pickup, van,
  police interceptor) with arcade physics, damage smoke, AI traffic that
  follows lanes and brakes for you, and ~26 pedestrians who stroll, flee and
  occasionally get clipped.
- **Police system**: witness-based crimes raise your wanted level (0–5 stars);
  units route through the road grid to reach you, box you in with slot
  pursuit, shoot at high wanted, and fill the BUSTED meter if they pin you.
  Break line of sight and the heat decays.
- **Story**: 7 missions — deliveries, a bean run, a timed showroom sprint, a
  police escape, a marina pickup, a two-van convoy and a warehouse finale —
  with banner dialogue and cash rewards, plus free-roam replay afterwards.
- **Systems**: on-foot shooting, hidden collectible packages, localStorage
  save/continue, a live minimap, and a fully synthesized WebAudio soundtrack
  (engine, sirens, gunshots, warm chord pads — no audio files).

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Orbit camera (click the game to lock the pointer) |
| Click | Shoot (on foot) |
| E | Enter / exit car, talk |
| Shift | Sprint on foot / boost in car |
| Space | Handbrake |
| P | Pause (save from the pause menu) |

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in a desktop browser. Everything runs from
static files — no build step, no network requests.

## Tech notes

- three.js r180 is vendored under `game/vendor/` (module + core builds side
  by side) and imported through an import map; the game is plain ES modules
  under `game/src/`, one job per file (city, vehicles, traffic, peds, police,
  missions, combat, collectibles, audio, minimap, save).
- `main.ts` (Node 22, standard library only) hands the entry in: it copies
  `game/` and `screenshots/` to the output directory and writes
  `dossier.json` with the vendored make.fun library.
- All art is procedural: canvas-painted ground and building facades, canvas
  signs, and synthesized audio. No external assets.
