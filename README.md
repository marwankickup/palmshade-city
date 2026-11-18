# Palmshade City — a tiny open-world crime spree

![bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An entry for the make.fun bounty **[Make GTA 6 (gta6-01)](https://make.fun/bounty/gta6-01)**, built by **@marwan-kickup** with an AI pair.

**Palmshade City** is an original 3D open-world crime game that runs entirely in the browser. A golden-hour coastal city — pastel art-deco towers, palm-lined boulevards, a beach and the ocean — where you arrive with $120, a borrowed pair of shoes, and a café owner named Marisol Vega who has a problem: somebody keeps stealing her delivery vans.

## What you do

- **Explore** a 7×7-block city on foot or in any car you can reach: traffic, pedestrians, a working wanted system and the Palmshade PD.
- **Run Marisol's chain of five jobs** — recover a stolen van, chase down three lost drops, outrun the heat in a hot van, beat Rico's sunset run against the clock, and take back the warehouse in a final three-star showdown. Each job pays cash and the chain replays after you finish it.
- **Cause trouble**: steal cars, trade paint with traffic, clip a mailbox too many (there are no mailboxes, the PD is just touchy), or open fire on foot. Wanted stars rise to five, police hunt you in packs with proper pursuit slots, a busted meter fills when they pin you, and getting caught costs a fine and a trip to the hospital steps.
- **Get wasted or busted** and you wake up lighter in the wallet. **Save** from the pause menu and **Continue** next visit — money, finished jobs and your position persist in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Sprint (on foot) / handbrake (in car) |
| Mouse | Orbit camera (click the game to grab the mouse) |
| E | Get in / out of the nearest car |
| Mouse click | Shoot (on foot, pointer locked) |
| P or Esc | Pause (Save / Resume / Quit to menu) |
| M | Mute |

## Run it

```sh
node serve.ts
```

then open <http://localhost:8080> in desktop Chrome. No build step, no install.

## Tech notes

- **three.js r180**, vendored under `game/vendor/` (`three.module.min.js` + its `three.core.min.js` sibling) and loaded through an import map. The game makes **zero network requests** — every texture is drawn on a canvas at boot, every sound is synthesized with WebAudio.
- Plain ES modules under `game/src/`, one job per file: `city.js` (procedural city), `player.js`, `vehicles.js`, `traffic.js`, `peds.js`, `police.js`, `missions.js`, `combat.js`, `audio.js`, `minimap.js`, `save.js`, and `main.js` tying it together.
- Deterministic scenes for the screenshots live behind `?shot=cover|foot|mission|chase&seed=1` — the game auto-starts, stages the scene with a short autopilot, and keeps the audio muted.
- `window.__game` exposes small hooks (`getState()`, `start()`, and a `debug` namespace) used by the automated end-to-end checks.

Everything here is invented — the city, the Vegas, the PD, the very suspicious delivery vans. Any resemblance to a certain other sun-soaked crime saga is purely aspirational.
