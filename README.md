# Palmshade City

![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An original open-world crime caper that runs entirely in your desktop browser — no downloads, no build step, no network requests. My entry for the make.fun bounty [gta6-01 "Make GTA 6"](https://make.fun/bounty/gta6-01).

## About

**Palmshade City** is an original open-world crime game that runs entirely in the
browser from static files — no server, no network requests. You play a new runner
in a sun-soaked coastal city of palm-lined boulevards, a marina, and a downtown
grid, taking jobs from café owner **Marisol Vega** and marina captain **Dario** in
their turf war with the Breakwater Boys.

- A 10-mission story chain: deliveries, a package run, a police escape, a timed
  run, a marina pickup, a warehouse shootout, a boat delivery across the bay, a
  checkpoint street race against Drey's wheelman, and a rooftop finale on
  Warehouse 7 — replayable at a ×1.5 payout.
- A living city with real-time shadows and golden-hour atmosphere: AI traffic,
  26 pedestrians, parked cars you can take, animated marina water, billboards,
  beach umbrellas and loungers, and a Palmshade PD that answers witnessed crimes
  with a 0–5 star wanted system — pursuit units with callsigns and roles shown
  live in the **Police Response Panel**, roadblocks and the **AIR-1 helicopter**
  with a searchlight at high wanted levels, and a BUSTED meter when they box
  you in.
- **Crew system**: recruit **Vex** at the café and **Tito** at the marina —
  they follow on foot, ride in your car, and shoot at police and Breakwater
  Boys, with portrait tiles and health bars in the HUD. Downed crew can be
  revived, and **G** calls the crew car for a pickup.
- **Garage & cash economy**: missions, races and taxi fares pay cash; spend it
  at **Palmshade Customs** (the parking-garage workshop) on engine, armor and
  nitro upgrades — three levels each, applied to every ride you drive, plus
  repairs. Upgrades persist in your save.
- **Carjacking**: steal a moving traffic car and its driver is dumped at the
  kerb and runs — counted as a stat, with a wanted bump.
- **Exploding cars**: damaged vehicles smoke, catch fire, and blow up —
  splash damage can chain one wreck into the next, and burning wrecks
  smoulder on the street.
- **Police tactics**: at 3+ stars, **PIT-1 / PIT-2** units run at your rear
  quarter to spin you out; at 4+ stars roadblocks gain **spike strips** that
  shred your tires; the response panel labels every unit's role (PIT, RAM,
  ROADBLOCK, AIR-1).
- **District standing**: Brisa Beach, Centro and Westside each track your
  standing — missions, packages, races and fares completed there raise it;
  check your standing on the pause screen.
- Drive anything: cars on the grid and the runabout **Brisa** at the marina —
  boat handling, wake and open-water runs included.
- Side activities: a checkpoint **street race** with a saved best time, and
  **taxi fares** — pick up flagged passengers and run them across town for cash.
- Three weapons (fists, sidearm, rapid-fire SMG), 20 hidden packages to find
  (terraces, the pier, rooftops, the beaches), a RESPECT rank ladder, a working
  radio with three stations, a live minimap, and autosave so you can pick up
  where you left off.

Everything is original: the city, characters, names and art were invented for
this game. three.js is vendored under `game/vendor/`; all audio is synthesized
with WebAudio — there are no audio files and no network calls.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click canvas to lock) | Orbit camera / aim |
| Mouse hold (on foot) | Fire sidearm |
| Shift | Sprint / nitro boost (in a car, with nitro fitted) |
| E | Talk / enter & exit vehicle or boat / recruit & revive crew / open Palmshade Customs in a car at the garage bay |
| G | Call the crew car for a pickup |
| Space | Brake |
| R (in a car) | Change radio station |
| 1 / 2 / 3 | Fists / sidearm / SMG |
| P / Esc | Pause (shows district standing) |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. (Any static file server
pointed at `game/` works too.)

## Tech notes

- three.js r180 (vendored), ES modules under `game/src/`, one job per file:
  city generation, player, vehicles (damage, fire & explosions), boat,
  traffic AI, pedestrians, police AI with BFS road routing (PIT maneuvers,
  spike strips, roadblocks, helicopter), missions, side activities (races
  & taxi), combat, crew AI, the garage/upgrades shop, collectibles,
  synthesized audio, minimap, save.
- `main.ts` (Node 22) packages `game/` + `screenshots/` and writes the
  `dossier.json` summary for the bounty.
- Progress (money, missions, packages, position, garage upgrades, district
  standing, carjack stats and recruited crew) persists in `localStorage`.
