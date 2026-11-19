# Palmshade City

![Palmshade City on make.fun](https://make.fun/badge/gta6-01.svg)
![Rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![Reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An entry for the make.fun bounty [Make GTA 6 (gta6-01)](https://make.fun/bounty/gta6-01).

**Palmshade City** is an original 3D open-world crime game that runs entirely in the
browser — a sun-soaked coastal city at golden hour with two districts (a downtown of
high-rises and a beachfront strip of low-rise cafés), a marina with a pier and bobbing
boats, and a working wanted system. You arrive with nothing but a borrowed reputation:
Marisol Vega of Café Marisol needs a driver, the Breakwater Boys need a lesson, and the
Palmshade PD would very much like a word.

## What's in the game

- **A 7-mission story chain** — deliveries, a package-collection run, a police escape,
  a timed run, a marina pickup and a warehouse finale, with dialogue banners, gold
  objective markers and cash rewards.
- **Wanted system (0–5 stars)** — crimes only count when witnessed. Police spawn on the
  road grid, route to you with BFS pathfinding, box you in with slot-based approach,
  fill a BUSTED meter when you're slow or on foot, and open fire at high wanted levels.
  Get busted or wasted and you respawn at the station or hospital, lighter in the wallet.
- **Driving & traffic** — six car silhouettes (sedan, sport, convertible, pickup, van,
  police interceptor) with arcade physics, AI traffic that follows lanes, brakes for
  obstacles and turns at intersections, and damage smoke when a car is beaten up.
- **On foot** — a stylized character with a walk cycle, sprint, shooting (hitscan with
  tracers, muzzle flash and sparks), ~26 pedestrians who stroll, flee and get knocked
  down, and 10 hidden packages to find — some need crate-stair climbs onto a café
  terrace, a parking-garage deck, a warehouse annex roof, a lifeguard stand and the
  end of the pier.
- **Presentation** — gradient sky dome with sun disc and drifting clouds, PCF-soft
  shadows, ACES tone mapping, painted-canvas streets and facades, a live minimap, and
  an all-synthesized WebAudio soundtrack (engine, sirens, gunshots, chimes and a warm
  chord-pad loop). No audio or image files — everything is generated in code.
- **Autosave** — money, story progress, packages and position persist in localStorage;
  Continue from the main menu picks up where you left off.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Orbit camera (pointer lock) |
| Shift | Sprint |
| E | Talk / enter & exit car |
| Mouse click | Shoot (on foot) |
| P or Esc | Pause |

## Run it locally

```
node serve.ts
```

then open http://localhost:8080 in a desktop browser. The game loads fully offline:
three.js is vendored under `game/vendor/` and the page makes no network requests.

## Tech notes

- three.js r180 (vendored ES modules), plain JavaScript ES modules under `game/src/`,
  one job per file: `city` (world building), `player`, `vehicles`, `traffic`, `peds`,
  `police`, `missions`, `combat`, `collectibles`, `audio`, `minimap`, `save`, `util`,
  wired together by `main.js`.
- Deterministic staged scenes for screenshots: `game/index.html?shot=cover|foot|mission|chase|beach&seed=1`.
- The world layout (road grid, districts, landmarks) is generated from a seeded RNG,
  so every visit builds the same city.
