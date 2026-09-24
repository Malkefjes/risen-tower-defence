# Risen Tower Defence: Design

Snapshot of the living design doc, kept in the repo so every session can read it.
Live version (editable by Erik): https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec
If the two disagree, ask Erik which is current, then update both.

Last synced: 2026-09-24.

## Vision

A browser tower defense game where you shape the enemy's path with Tetris-shaped walls and mount towers on top of them. Every piece is a choice between lengthening the maze and building a platform for firepower. It's made purely for Erik's own enjoyment, so fun and depth come before polish, onboarding or broad appeal.

## Pillars

1. **Shape the path.** Enemies take the fastest route to the nexus; you bend it with walls.
2. **Walls are scarce and do many jobs.** Every piece is maze, tower platform, or both.
3. **Read the land.** Terrain is free structure; each map is a puzzle about using it well.
4. **Adapt live.** You can build mid-wave, and every placement becomes a commitment.
5. **Different builds want different mazes.** Tower types, terrain, spawns and enemies change what the best layout looks like.

## Core mechanics

### Map and terrain

- Open space on an underlying grid with no edge, with enemy spawner(s) and a nexus to defend. You can build outward forever, and enemies can always walk around, so strong mazes form a fortress around the nexus.
- Start small but roomy, with a few natural obstacles: "how do I use this terrain with only these few walls?"
- Terrain ideas: rocks (block, unbuildable), rough ground (slows enemies), high ground (tower range bonus).

### Enemies and pathing

- Enemies always take the fastest path to the nexus, recalculated when walls change. They move in 8 directions but never cut a wall corner, so two diagonal walls form a closed seam.
- Live path preview while placing a piece. This is essential.
- Enemy variety should put pressure on the maze: flyers, wall breakers, fast swarms, tanks.

### Walls

- Tetris-shaped pieces, rotatable.
- Walls can never fully block the path; at least one route must stay open. No placement may trap an enemy either.
- Building is allowed during waves. If it turns into an exploit, we address it then.
- Walls can be removed only in the planning phase they were built in; after that they lock. Walls placed mid-wave lock immediately.
- New pieces arrive as a supply drop: 3 random walls into the wall bar each round, no popup. Unused walls carry over. Later: ways to specialize supply (blueprints, rerolls, special pieces).

### Towers

- Towers can only be placed on top of walls.
- Towers come in footprints (1×1, 2×1, 2×2, 3×3…). Bigger is stronger but eats walls that could have extended the maze.
- Tower types should favor different maze shapes: splash likes switchbacks, beams like straight corridors, slows like corners.

## Run structure and economy

Runs are roguelite, inspired by TFT: you know every piece, but never which combination you'll get. That keeps the game unsolvable even for its creator.

**Guardrail:** every shop and economy system must feed back into maze decisions. If the economy becomes the main game, pull it back.

### Two channels per round

| Channel | Gives | Decision type |
| --- | --- | --- |
| Wall supply | 3 random walls each round, free | Spatial: where does each shape fit my maze? |
| Tower shop | Rotating towers bought with credits | Economic: buy, reroll or save? |

Walls stay out of the shop: they have no identity on their own and would dilute it. Tower footprints link the two channels, because wall supply limits how many and how big your towers can be.

### Systems (planned)

- **Rounds and HP:** a big HP bar. Leaked enemies deal damage based on strength; the run ends at 0.
- **Income and interest:** credits after each round, plus interest on savings later. Saved credits double as an emergency fund mid-wave.
- **Shop rerolls:** spend credits to refresh the tower shop.
- **Bench:** hold towers you can't place yet, such as a 3×3 tower waiting for its platform.
- **Star-ups:** 3 copies combine into a 2★ tower, 3 of those into 3★. Leaning: same footprint, so upgrades never force a rebuild.
- **Traits:** towers share traits that unlock bonuses. Traits should be spatial (e.g. same wall structure, covering the same path stretch), so team building and maze building become one decision.
- **Wall supply levers:** pay credits to reroll a supply drop; maybe later buy an extra piece at a steep, rising cost. Special pieces (reinforced, conductive, raised) appear occasionally.

## Setting

Sci-fi: a colony lands on hostile planets using prefabs and blueprints.

- Each planet is a new map with its own terrain and threats.
- Blueprints could drive unlocks and supply specialization.
- Later layer: walls carry power, so towers only work if their walls connect to the nexus or a reactor.

The first world, Frostfall, is a snowy planet with a cozy mood: cold world, warm colony.

## Visual direction

Locked: clean low-poly 3D, rendered with three.js through a fixed isometric-style camera. The fortress should read as a place: a small, cozy colony on a hostile planet. References: `mockups/snow-test.html` (Clean 3D view); `mockups/look-test.html` is the older pixel exploration, kept as history.

- **Style:** simple low-poly shapes, soft light and shadows, rounded prefab blocks. Lighting carries much of the mood.
- **First world: snow.** Blue-white snow, orange prefab modules like a polar research station, a cyan nexus, violet aliens.
- **Evening is the look:** a low orange sun, lavender sky. Day and night presets were dropped.
- **Plain walls for now:** wall lamps and lit windows were removed for simplicity (they looked off). Revisit later; any light must never look like it cuts through blocks.
- **Camera:** orthographic, fixed angle (about 30° elevation, 45° rotation). Pan and zoom are fine; rotation can be considered later.
- **Low walls** so towers and enemies behind them stay visible.
- **Art is swappable:** game logic never knows about graphics. Everything is drawn from named models; code-built placeholders now, Erik's models (e.g. made in Blockbench) later.
- **Feel matters from day one:** pieces snap and drop with a small shake, the path preview flows, enemies move smoothly and flash on hit, snow falls.
- **No popups that interrupt play.** Use small non-blocking notices.

Not locked yet: exact palette, wall height, zoom range, final model shapes.

## Roadmap

| Phase | Scope | Question it answers |
| --- | --- | --- |
| 1. Core maze | Step 1 (done): map, camera, supply drops, wall bar, placement, path preview, undo, walkers. Step 2 (next): towers, credits, enemy HP, player HP, tuning panel | Does placing pieces feel good? How many walls per round? |
| 2. Tower variety | 3–4 towers with different reach and footprints | Do different builds want different mazes? |
| 3. Roguelite layer | Shop, rerolls, bench, star-ups, interest | Does the economy add tension without taking over? |
| 4. Depth | Traits, enemy variety, more terrain | Does it stay unsolvable over many runs? |
| 5. Identity | Final visuals, planets, meta progression | Does it feel like its own game? |

## Phase 1 details

Goal: prove that shaping a path with Tetris walls feels good, and find how scarce walls should be.

- One handmade map (Frostfall) with a rift, a nexus, rocks and pines, in a world with no edge.
- Round loop: untimed planning, then a wave. Pause and speed control.
- Controls: R or right-click rotates; scroll zooms; drag or WASD pans; 1–9 selects walls; Z undoes; Enter starts the wave.
- Undo in the planning phase takes a whole piece back into the wall bar.

**Step 2 plan (agreed with Erik):**

- One tower type in 1×1 and 2×2, bought from a fixed build menu next to the wall bar (stand-in until the Phase 3 shop). Its look is being picked from `mockups/turrets/`.
- Towers sit on walls, and a 2×2 may span walls from different pieces. A wall carrying a tower can't be picked up.
- Towers can be sold, so a build can change when a better tower comes along. Refund rules still to settle.
- Targeting: the enemy with the most progress (closest to the nexus). Targeting options come later.
- Credits: flat income per round only, no kill bounty. Towers cost credits.
- Enemies get HP and scale per wave. Player starts at 20 HP; each leak costs 1 (scaled by enemy strength once enemy types exist). At 0 a non-blocking "Run over" notice offers a restart.
- Tuning panel (hidden, toggled by a key) with sliders: walls per round, income, enemy HP and growth, enemy speed, tower damage, range, fire rate and cost.

Out of scope for Phase 1: other terrain, multiple spawners, more tower or enemy types, shop, traits, star-ups, final art, sound.

Success: placing pieces is satisfying and readable, a walls-per-round range feels tight but fair, and Erik catches himself choosing between mazing and building platforms.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Browser, TypeScript + Vite + three.js, repo Malkefjes/risen-tower-defence |
| Genre | Mazing tower defense with Tetris walls |
| Roles | Erik: vision and design. Claude: code |
| Visual style | Clean low-poly 3D, fixed iso-style camera, evening light |
| Map | No edge; enemies can always go around |
| Movement | 8 directions, no corner cutting |
| Building during waves | Allowed; mid-wave walls lock immediately |
| Wall removal | Only in the planning phase it was built; then locked |
| Wall supply | 3 random walls into the wall bar each round, no popup; unused walls carry over |
| Tower supply | Rotating shop with credits, rerolls, bench (Phase 3) |
| Income | Credits per round, TFT-style; interest later |
| Run structure | Roguelite runs with an HP bar |
| Progression in a run | Star-ups and traits |
| Map size | Start small and grow |
| Tower sizes | Multiple footprints on wall blocks; a footprint may span several wall pieces |
| Tower selling | Towers can be sold to change the build |
| Targeting | Most progress (closest to nexus) by default; options later |
| Setting | Sci-fi colony; first world is snowy |

## Open questions

- Tower selling: refund amount, and whether selling is allowed mid-wave.
- Star-ups: keep the same footprint, or grow?
- Economy numbers: income, interest, tower and reroll costs. Income is flat per round for now.
- Wall supply rate: how many pieces per round? The key tuning knob, found through play.
- Trait design: which traits, and how spatial should they be?
- Meta-structure: runs across planets, unlocks between runs?
