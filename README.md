# Palmshade City

![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/marwankickup/palmshade-city/reward.svg)

An original open-world crime caper that runs entirely in your desktop
browser — no downloads, no build step, no network requests. My entry for
the make.fun bounty [gta6-01 "Make GTA 6"](https://make.fun/bounty/gta6-01).

## The game

Welcome to **Palmshade City**, a sun-soaked coastal town of pastel
art-deco blocks, palm-lined boulevards and one long golden hour. You are
**Rook**, new in town, and **Marisol Vega** of Café Solano needs help:
a rival crew, the Breakwater Boys, keeps stealing her delivery gear.

- **Open world** — a full procedural city: road grid with traffic,
  sidewalks with pedestrians, a beach and the ocean, day-glow facades.
- **Drive anything** — steal parked cars, vans, pickups and sports cars;
  arcade driving with damage and smoke.
- **Wanted system** — crimes raise your stars (0–5). Palmshade PD routes
  through the streets, flanks you in slots, and fills the **BUSTED**
  meter if they pin you down. Break line of sight to cool off.
- **Five-mission story** — a van delivery, lost crates, a suspicious
  suitcase, an 80-second noodle run, and a warehouse finale, with
  dialogue, gold markers and cash rewards. Free roam and replays after.
- **Combat** — click to shoot on foot; the city reacts.
- **HUD** — live minimap with police blips and mission markers, wanted
  stars, health, cash and speedometer.
- **Save** — pause-menu save (plus autosave after every job) in
  localStorage; Continue from the title screen.
- **Sound** — engine, sirens, shots, crashes and a warm synth loop, all
  synthesised live with WebAudio. No audio files.

Everything — city, characters, vehicles, names, story, art and music —
is original to this game.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Walk / drive |
| Mouse (drag, or click view for pointer lock) | Look around |
| Shift | Sprint |
| E | Enter / exit car |
| Space | Handbrake |
| Mouse click (on foot, pointer locked) | Shoot |
| P / Esc | Pause (save from the pause menu) |

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open http://localhost:8080 in desktop Chrome. Node 22+ runs the
TypeScript server directly; there is nothing to install. You can also
serve the `game/` folder with any static file server.

## Tech notes

- **three.js** (r180) is vendored under `game/vendor/` as
  `three.module.min.js` + `three.core.min.js` and loaded through an
  import map — the game makes **zero network requests**; every texture
  is generated on a canvas at boot, and all audio is WebAudio synthesis.
- Source is split by job under `game/src/`: `city` (world building),
  `player`, `vehicles`, `traffic`, `peds`, `police`, `missions`,
  `combat`, `audio`, `minimap`, `save`, and `main` (boot + game loop).
- `main.ts` at the repo root is the entry program: it copies `game/`
  and `screenshots/` to the output directory and writes `dossier.json`
  with the vendored `vendor/makefun-game.ts` library.
- Screenshots in `screenshots/` are real captures of the game, staged
  deterministically with `?shot=cover|foot|mission|chase&seed=1`.

## License

MIT — see `LICENSE`.
