# Palmshade City

![bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An entry for the make.fun bounty [Make GTA 6](https://make.fun/bounty/gta6-01) — https://make.fun/bounty/gta6-01

**Palmshade City** is an original open-world crime game that runs entirely in the
browser. A sun-soaked coastal city at golden hour: a downtown canyon of towers, a
beachfront boulevard of cafés and low-rises, a working marina, and one very
determined café owner. Marisol Vega of Café Marisol is losing her turf to the
Breakwater Boys — run her deliveries, collect what the Boys scattered, outrun
the Palmshade PD, and finish the fight at their warehouse. Every name, place
and vehicle here was invented for this game.

## What's in the city

- **Two districts** — downtown high-rises with rooftop water towers, AC units
  and lit windows; beachfront low-rises with awnings and a café terrace.
- **Landmarks** — Café Marisol, the Breakwater Storage warehouse, Palmshade PD,
  a multi-storey parking garage, a marina with pier and bobbing boats.
- **A 7-mission story chain** with dialogue, gold pillar markers, cash rewards
  and autosave: deliveries, a package-collection run, a police escape, a timed
  beach run, a marina pickup and a warehouse finale.
- **Wanted system** — witness-based crimes raise 0–5 stars; police spawn on
  nearby roads, route through the street grid (BFS) and box you in. Get caught
  slow and surrounded and you're BUSTED: fined and dropped at the station.
- **10 hidden packages** — on a café terrace, a pier end, crate-stair rooftops,
  a lifeguard stand and more. +$150 each.
- **Traffic & pedestrians** — AI cars drive the grid with lane discipline and
  braking; 26 pedestrians stroll, flee gunfire and dive from reckless drivers.
- **Full HUD** — wanted stars, money, health + vehicle bars, BUSTED meter,
  speedometer, crosshair, objective pill, dialogue banners and a live minimap
  with traffic/police blips.
- **Synthesized audio** — engine, sirens, gunshots, crashes, jingles and a warm
  pad loop, all generated with WebAudio. No audio files, no network requests:
  everything ships as static files under `game/`.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click canvas to lock) | Orbit camera |
| Shift | Sprint |
| E | Talk / enter & exit vehicles |
| Mouse click (on foot) | Shoot |
| Esc or P | Pause |
| M | Mute |

## Run it

Requires Node 22+.

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Tech notes

- three.js (vendored under `game/vendor/`, r180) with ES modules under
  `game/src/` — one job per file: city, player, vehicles, traffic, peds,
  police, missions, combat, collectibles, audio, minimap, save, util.
- Golden-hour lighting: PCFSoft shadow-mapped sun, ACES filmic tone mapping,
  gradient sky dome with sun disc and billboard clouds, canvas-painted ground
  and facades.
- Progress (money, mission chain, packages, position) persists in
  `localStorage`; Continue from the main menu.
- Deterministic screenshot scenes for the bounty live at
  `game/index.html?shot=cover|foot|mission|chase|beach&seed=1`.

## License

MIT — see `LICENSE`.
