# Frostfall: Design

Snapshot of the living design doc, kept in the repo so every session can read it.
Live version (editable by Erik): https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec
If the two disagree, ask Erik which is current, then update both.
The build order lives in `docs/PLAN.md` (milestones M0 to M5, idea bank).

Last synced: 2026-09-25. The live copy still describes the old round-based design until it's updated.

## Vision

A survival tower defense for the browser. A high-tech colony explores hostile alien planets to mine their resources: we have the technology and the blueprints, the planet has the raw material. You land, explore on foot, pick a spot between ore nodes, call your ship down, and build a base you're proud of. You defend it the tower defense way: you shape the enemy's path with Tetris-shaped walls and mount towers on top of them. The more you take, the harder the planet pushes back. It's made purely for Erik's own enjoyment, so fun and depth come before polish, onboarding or broad appeal.

Whether it ends up feeling more like tower defense or more like survival should come out of what's fun in play.

## Pillars

1. **Shape the path.** Enemies take the fastest route to what they attack; you bend it with walls.
2. **Walls are scarce and do many jobs.** Every piece is maze, tower platform, power line, or all three.
3. **Read the land.** Terrain and ore nodes are fixed; where you settle and what you fortify is the puzzle.
4. **Greed against safety.** Mining more, and growing bigger, draws bigger raids. You choose how far to push.
5. **Your base, your presence.** You build near your avatar. While you're out mining, the base has to hold on its own.

## Core loop

- **Arrive:** a drop pod lands you on the planet. Explore on foot and find ore nodes.
- **Settle:** call the ship down where you think you can hold it. The ship is your core: it holds your cargo, prints walls, and is how you leave. Losing it ends the run.
- **Mine:** by hand at first (carry ore home), then extractors on nodes, then a rover and drones to haul.
- **Build:** walls bought with stone, towers, the smelter, generators.
- **Defend:** raids are telegraphed (a threat meter, warnings with direction). They come from burrows around the map.
- **Launch:** you choose when to leave. Launching triggers a final siege. The ship carries over to the next planet.

One planet is one long run over several sessions, saved in the browser.

## Core mechanics

### Map, terrain and nodes

- An underlying grid with no edge. Enemies can always walk around structures.
- Ore nodes sit at fixed places, so the map decides where fights happen.
- Terrain ideas: rocks (block, unbuildable), rough ground (slows enemies), high ground (tower range bonus).

### Resources

- Mined from 3×3 nodes (one size, like Rust): **stone** (600 per node, 200 per stage) builds walls, **metal** (300 per node, 100 per stage) builds towers. A node breaks in three stages and each stage drops its ore at once into the hotbar.
- **Two walls (decided 2026-09-25):** every piece is placed as a **stone wall** (stone only; towers can't stand on it). **Metal plating** upgrades a placed piece, whole piece at once, into the **Armored deck** (the orange wall), which is the only wall towers stand on. The upgrade keeps the shape and position, so the path doesn't change. Plating is applied from a **modification wheel**: hold right mouse on a wall (later: more wall mods there). Stone walls still have a walkable deck. Stone wall look: C from the wall playground (terraced grey courses, snowy top). Later: refined alloy and **power**. The chain stays short on purpose, with no conveyor belts.
- Mining: hold the left mouse button next to a node; it breaks off in three stages. A shiny hotspot on the node mines about 20% faster while the cursor is on it, and hops around like Rust's.
- **Physical up to the ship:** ore is mined at nodes and physically brought home (carried, then hauled). Once at the ship, the refinery turns it into alloy without routing.
- **Power** comes from generators and the ship, runs through connected walls, and is drawn by towers and industry.

### Enemies and pathing

- Enemies take the fastest path to the nearest building (later: enemy types with preferred targets), recalculated when walls change. They move in 8 directions but never cut a wall corner, so two diagonal walls form a closed seam.
- Every building can be attacked: ship, extractors, refinery, generators, stockpiles. Normal enemies walk around walls; wall breakers are a special enemy type.
- Walls may never seal a building off from the spawns, and no placement may trap an enemy.
- Live path preview while placing a piece. This is essential.

### Walls

- Tetris-shaped pieces, rotatable. Any of the 7 shapes can be bought with stone from the Q build wheel; the stone is paid as the piece goes down and refunded when an unlocked piece is picked up.
- In real time: full refund for about 5 seconds after placing, then recycle for 50%.
- Walls carry power from generators and the ship to towers.

### Towers

- Towers stand only on walls. A footprint may span walls from different pieces; a wall carrying a tower can't be removed until the tower is sold.
- Footprints (1×1, 2×2, later more). Bigger is stronger per material, but eats walls that could have extended the maze.
- First tower: the **Twin** (1×1), which grows into the **Gatling** (2×2).
- Default targeting: the enemy with the most progress. Targeting options later.
- Selling: full refund shortly after placing, 75% after (a tuning knob).

### The avatar

- A builder: WASD moves it, it collides with walls, rocks and buildings.
- You can only build and repair within a radius of the avatar (later also of drones).
- Can't be hurt in M1; can be from M2, and respawns at the ship. No weapon for now.

## Setting

Sci-fi: a high-tech colony lands on hostile planets using a ship, prefabs and blueprints.

- Each planet is a new map with its own terrain and threats.
- Blueprints and ship upgrades carry between planets.

The first world, Frostfall, is a snowy planet with a cozy mood: cold world, warm colony.

## Visual direction

Locked: clean low-poly 3D, rendered with three.js through a fixed isometric-style camera. The base should read as a stronghold: a high-tech colony holding ground on a hostile planet.

- **Palette:** colony orange, cyan power, dark steel, and white (snow and light accents). Violet belongs to the aliens.
- **Walls: Armored deck** (from `mockups/stronghold/`): walls fuse with every neighbouring wall, whatever piece it came from, so a wall line is one continuous structure. One orange for all walls. Dark steel plinth, orange armor, steel gun deck on top, a thin cyan power line along the outside. The power line is dim until power exists, then lights on powered walls.
- **Ship:** the Rocket (3×3), with the Reactor core mid-body. It has a weak built-in gun that fires from the core: a circular range of about 5.5 cells, slow and light, enough to help early on but never a replacement for towers. Towers mostly have circular ranges too; click a turret or the ship to see its range and stats.
- **Turret:** Twin / Gatling (design B from `mockups/turrets/`).
- **Style:** simple low-poly shapes, soft light and shadows. Lighting carries much of the mood.
- **Evening is the look:** a low orange sun, lavender sky. Day and night presets were dropped.
- **No lamps or lit windows on walls:** they looked off. Any light must never look like it cuts through blocks.
- **Camera:** orthographic, fixed angle (about 30° elevation, 45° rotation). Follows the avatar; you can pan away freely to watch the base, with keys to snap back to the avatar or the ship.
- **Low walls** so towers and enemies behind them stay visible.
- **Art is swappable:** game logic never knows about graphics. Everything is drawn from named models; code-built placeholders now, Erik's models (e.g. made in Blockbench) later.
- **Feel matters from day one:** pieces snap and drop with a small shake, the path preview flows, enemies move smoothly and flash on hit, snow falls.
- **No popups that interrupt play**, and no instructional text in the UI. Show state, not instructions.

Not locked yet: zoom range, final model shapes.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Browser, TypeScript + Vite + three.js, repo Malkefjes/risen-tower-defence |
| Genre | Survival tower defense: explore, mine, build a base, defend it by mazing with Tetris walls |
| Roles | Erik: vision and design. Claude: code |
| Run structure | One planet = one long saved run; ends with a launch you choose and a final siege |
| Carries over | The ship (upgrades, modules, look), blueprints and tech |
| Core | The ship replaces the nexus; losing it ends the run |
| Player | Avatar builder; hand mining, then extractors, rover, drones |
| Building range | Only near the avatar (later drones) |
| Resources | Stone, raw metal, alloy, power; physical up to the ship |
| Smelter | 2×2 building on open ground (E → Buildings → Smelter), 500 stone + 300 raw metal; holds 2 stacks of raw metal in and 2 of alloy out, smelts 1:1 at 5/s like a Rust furnace; blocks enemies like a wall; enemies will attack it (next step) |
| Alloy | Pays for towers and metal plating. Raw metal is only good for the smelter. Runs start with 400 stone, 0 raw metal, 150 alloy |
| Threat | Grows with extraction and base size; raids are telegraphed |
| Attack targets | Every building; walls are walked around (wall breakers excepted) |
| Wall supply | Buy any shape with stone from the Q wheel (no supply drops) |
| Wall removal | Full refund for ~5 s after placing, then recycle for 50% |
| Power | Through walls, from generators and the ship |
| Visual style | Clean low-poly 3D, fixed iso-style camera, evening light |
| Palette | Colony orange, cyan power, dark steel, white; violet aliens |
| Walls look | Armored deck; neighbouring walls fuse seamlessly; one orange |
| Map | No edge; enemies can always go around. Generated world (zones, raised ground with cliffs, forests, lakes) |
| Spawners | Caves anywhere except raised ground, 24+ cells from the ship, rarer than ore; the nearest few send each wave |
| Waves | Each nearby cave sends packs of 3–5 a few seconds apart; a pack moves at one speed, packs vary a little in speed; enemies walk slightly off the tile centre (looks only) |
| Basic enemy | The leaper: dark red, Tyranid-like, climbs out of a cave, bursts on death |
| Movement | 8 directions, no corner cutting |
| Tower sizes | Multiple footprints on wall blocks; a footprint may span several wall pieces |
| First tower | Twin (1×1), grows into the Gatling (2×2) |
| Targeting | Most progress by default; options later |
| Setting | Sci-fi colony on hostile planets; first world is snowy Frostfall |

## Retired (kept for the record)

These were part of the round-based Phase 1 design. They stay in the game until the milestone that replaces them (see `docs/PLAN.md`).

| Retired | Replaced by |
| --- | --- |
| Rounds: untimed planning phase, then a wave started with a button | Real time with telegraphed raids (M1b) |
| Nexus and nexus HP bar | The ship; every building has its own HP (M1a, M2) |
| Credits with flat income per round | Ore, then alloy (M1a, M3) |
| Supply drop of 3 random walls per round | Buy any shape with stone from the Q wheel (done) |
| Walls removable only in the planning phase they were built | Undo window, then recycle (M1b) |
| WASD pans the camera | WASD moves the avatar; drag and arrows pan (M1a) |
| TFT-style tower shop, rerolls, bench, interest | Towers built from material; shop ideas parked in the idea bank |
| Star-ups and traits | Parked in the idea bank; revisit once the survival loop works |
| Roadmap phases 1 to 5 (core maze, tower variety, roguelite layer, depth, identity) | Milestones M0 to M5 in `docs/PLAN.md` |

## Controls (current)

WASD run (relative to the screen) · Shift sprint · Space jump · hold left mouse to fire the multitool (mines a node in reach) · hold right mouse on a wall for its modification wheel (metal plating) · click a turret or the ship for its range and stats · hold Q for the wall wheel, E for the tower wheel, release to pick · left click places what you hold · R or right-click rotate · 1–6 hotbar (1 puts away what you hold) · middle-drag or arrows pan · C follow the rig · H look at the ship · scroll zoom · X sells the selected tower · Z undo · Enter start wave · P pause · F speed · V path preview · G grid · T test walkers · K tuning.

## Open questions

- Economy numbers: ore per trip, costs of walls, towers and buildings. Found through play, with the tuning panel.
- How fast should the threat meter climb, and what exactly feeds it?
- Enemy target preferences: which types go for what?
- Meta between planets: what exactly carries over, and how is it earned?
