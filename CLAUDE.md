# Working notes for Claude

Read this first in every session. Sessions do not share memory; this file, `docs/DESIGN.md` and `docs/PLAN.md` are the continuity.

## The game today

**Frostfall** (the repo and localStorage keys keep the old `risen` name): a survival tower defense in the browser. Explore a snowy planet, mine, build a base around your landed ship, and defend it by mazing. Playable build: https://claude.ai/artifact/44JH12KkM2JYyTDMCxxmJ4. Direction and milestones: `docs/PLAN.md` (M1b steps 1–4B done; the hub, 4C, is parked). Current focus: enemies and towers, the two deepest systems, designed from the threat list in `docs/DESIGN.md` ("Threats and answers"); steps in `docs/PLAN.md` ("Enemies and towers": step 1 done, next the Swarm and the explosive tower).

- **World** (`sim/worldgen.ts`, `render/scenery.ts`): generated from a seed (localStorage `risen.world.seed`, default 1), about 224×224, no map edge. Zones around the landing site: clearing, pine forest belt, rocky highlands, violet wastes. Raised ground (plateaus, 1.35 high, cliff edges) blocks everything. Pines and dead pines never touch (a free tile all round). Snow on the ground is always pure white; variety comes from bare patches with a cause (ice lakes, the landing scorch, rift heat, windswept rock). Footprints fill back in. Scenery never moves and is baked per 16×16 chunk (`bakeStatic`).
- **Ore** (`sim/ore.ts`, `render/ore.ts`, `render/mining.ts`): 3×3 nodes, about three stone per metal, none within 4 cells of the ship. Hold left mouse to mine; a node breaks in three stages (stone 200, metal 100 per stage) straight into the hotbar; reach is measured as it looks on screen. Mined-out nodes regrow when a raid is cleared.
- **Items** (`sim/inventory.ts`): a 6-slot hotbar (stacks of 1000, slot 1 the multitool). Stone, raw metal (only good in a smelter) and alloy (towers and plating). Runs start with 400 stone, 0 raw metal, 150 alloy.
- **Player** (`sim/avatar.ts`, `render/rig.ts`): WASD (screen-relative), Shift sprint, Space jump onto walls, nodes, rocks and towers (a 1/8-cell rim of deck around towers), trees are hurdles, only the ship is solid; collides in eighths of a cell; never blocks enemies. Runs on real time (game speed F never affects it).
- **Walls** (`sim/game.ts`, `sim/pieces.ts`, `render/stoneWall.ts`, `render/pieceShape.ts`): hold Q for the wall wheel, any of the 7 tetrominoes for stone (100 a piece). Every piece goes down as stone; hold right mouse on a wall for its wheel: metal plating (100 alloy, the Armored deck towers need) and repair (stone for the HP missing). Pieces placed during calm can be picked up for a refund; they lock when a raid starts. Walls fuse only with the same material.
- **Supply and upkeep**: walls and buildings must be within the ship's supply radius (40) and connected to it through walls or buildings (touching, corners count). The ship has a 24-slot inventory (click it when next to it; starts with 200 stone) and takes upkeep every minute: 3% of each supplied thing's price (stone for walls and smelters, alloy for plating and towers). Unsupplied or unpaid things decay (full to broken in 5 minutes).
- **Towers** (`sim/towers.ts`): hold E for the tower wheel. Three types so far, built as a 1×1 on plated walls and paid in alloy: the Gun (piercing, the general-purpose workhorse) and the Missile rack (explosive, `render/missileRack.ts` + `render/blast.ts`: missiles climb, turn and dive, homing in on their target, and burst over a radius per size; 3 missiles at 1×1, 6 at 2×2, reloading visibly; worse than the Gun per alloy on one target, the answer to the Swarm) and the Radome (support, `render/radome.ts`: no damage; a field on the snow in which enemies are Heavy, brown and `heavySlow` slower, lingering a moment after they leave; the answer to the Runner). Click a tower for its range and stats: Grow puts its next size (2×2; 3×3 once it has a model) on the cursor, toward the side you point at; it must cover plated wall with no other tower. Sell returns what was spent this calm in full and 75% of the rest. The ship has a weak gun from its core (range 5.5).
- **Smelter** (`sim/smelter.ts`, `render/smelterModel.ts`): E → Buildings → Smelter (500 stone + 300 raw metal), 2×2 on open ground. Click it when next to it for its Rust-style panel (2 raw metal slots in, 2 alloy out, 1:1 at 5/s; Remove gives back its price and contents). Its window glows and the chimney smokes only while it works.
- **Raids**: no Start wave button. A raid clock (10:00 grace, then 3:00 after each cleared raid); mining, building and smelting pull it closer but never into the fixed 60 s warning, when the active caves tremble and red chevrons show where it comes from. Phases in code are `"planning"` (calm) and `"wave"` (raid); the UI says Calm and Raid.
- **Enemies** (`sim/enemies.ts`, `render/enemies.ts`, `render/cave.ts`): each walker has a type. Raids send packs of the Swarm (Grumtooths, 12 a pack), the Runner (wolves, 5 a pack) and the Brute (the Colossus, alone), picked by each type's `share`, each taking its `cost` of the raid's size (`Tuning.enemies`); the Grunt has no look yet and isn't sent. They climb out of cave exits (the 3 nearest the ship are active), one speed per pack, each on its own line within the tile (view only). All are Erik's stone creatures, HP bar always shown; the red outline is in code (`ViewLooks.marks`) but off. They go for the nearest target (the ship or a smelter) and claw it from a neighbouring cell. Walls are slow obstacles: the flow field counts a wall as its chew time, so a maze gets walked and a full block gets chewed (at most 2 enemies per piece; a stone piece takes about 150 s). A piece breaks as a whole, with any tower on it. With nothing left to attack they burrow.
- **The ship** (`render/ship.ts`): the Rocket, 3×3, lands at the start of a run. At 0 HP it's a smoking wreck, its gun and inventory are gone, nothing is supplied, and the run goes on (a notice offers New run).
- **Tuning and balance** (`sim/tuning.ts`, `sim/balance.ts`): every number lives in `Tuning`: enemies per type (`enemies.grunt`), towers per type and size (`towers.gun[0..2]`, `cost` is the total at that size). K opens sliders for all of it, generated from the types, with DPS and alloy per DPS per tower size. Saved under `risen.tuning.v6`; `mergeTuning` lays any save over the defaults, so new or removed numbers never break it. `tests/balance.test.ts` holds the design's balance rules (for example, alloy per DPS within 25% at every size), and `runRaid(game)` plays a raid out headless and reports kills, ship damage and damage per tower.

## Collaboration

- Erik is the designer and player; Claude writes the code. Erik's calls on design are final.
- Take it slow on design: discuss fundamentals, reason through trade-offs, don't jump to building without agreement. Describe a step to Erik before building it unless he pre-approves.
- Looks are picked from mockups with three options labelled A/B/C; Erik iterates on the pick.
- Erik dislikes popups that interrupt play: prefer non-blocking notices. No instructional text in the UI (no control hints or how-to lines); show state, not instructions. No motion blur, ever.
- Design: `docs/DESIGN.md` (snapshot in the repo). Erik's live, editable copy: https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec. When a design decision changes, update `docs/DESIGN.md` in the same commit.
- **Standing guardrail:** every shop/economy system must feed back into maze decisions. Flag it whenever a feature risks the economy becoming the main game.

## Picks and looks (for reference)

- Rig (player): humanoid exo-rig, white armor, dark steel limbs, orange bands, cyan visor, blocky multitool with a cyan beam, raised only when mining or building.
- Walls: stone look C (terraced courses); plated walls are the Armored deck (orange). Ship: the Rocket with the Reactor core. Turrets: Twin/Gatling (design B), now the Gun at 1×1 and 2×2. Explosive tower: the missile rack (mockup C, https://claude.ai/artifact/B77csS1AgA2S1NGvjr88S1; tuned at https://claude.ai/artifact/VjKWFYSEM4soGb9MTV6jxh: size 1, tilt 30°, 3 and 6 missiles, cheeks 1.2, no radar), in the game.
- Ore: B1 ore body (stone grey, metal steel-silver). Hotbar icons are rendered from the real models (`render/icons.ts`); alloy is one plain ingot, no glow.
- Caves: look A (stacked rock outcrop, dark mouth, icicles; no violet, no glow). Cliffs: look B (tilted slabs with even snow). Enemies (the leaper is gone): the Brute is locked: Erik's Colossus golem (`render/colossus.ts`, cut into parts and coloured by rule), mined-stone grey, size 2, speed 1, 80 HP, alone, thin red outline, HP bar always. The Runner is locked: Erik's stone wolf (`render/wolf.ts`), size 1.5, speed 3, 4 HP, packs. The Swarm is being tried: Erik's Grumtooth (`render/grumtooth.ts`). All three share `render/stoneCreature.ts` (cutting, mined-stone colour, outline). Try enemies in `mockups/playground` (the real game on a tight maze, spawn on demand). Smelter: the round furnace with a framed molten window.
- Published mockups stay reachable as artifacts (e.g. rig https://claude.ai/artifact/6tc7ay9BZja5htwtdCNBCg, caves https://claude.ai/artifact/Tafs4dH2eZawJqtYMok94x, enemies https://claude.ai/artifact/C48Q6rcVmBz3WzaMkWY6cR, smelter https://claude.ai/artifact/Xaut1sxwRYzyBk6Wfjjxh7). Their source was removed from the repo (in git history).

## Code conventions

- TypeScript strict, three.js for rendering, no UI framework.
- Keep game rules (grid, pathfinding, placement, combat) as pure logic in `src/sim`, separate from rendering and input, so it can be unit tested.
- Tests live in `tests/`, run with `npm test`. Pathfinding and placement rules must have tests. `GameOptions.supply` is off by default so rule tests can put walls anywhere; supply tests turn it on.
- Before committing: `npm run typecheck && npm test`.
- Small, focused commits with clear messages.

## Gotchas

- `THREE.ColorManagement.enabled = false` at startup, with legacy-like light intensities. Create materials lazily, never at module import: materials made earlier get their hex colours converted (orange turned red).
- Every orange part uses `colonyOrange()` from `src/render/palette.ts`, so all oranges match. Don't create other oranges.
- Moving things are drawn interpolated between 60 Hz sim ticks and animated per rendered frame (walkers use `Walker.px/py` and the world clock), and the shadow camera is snapped to its texel grid; otherwise things vibrate.
- Snow lives in world space and just falls: never move or speed flakes because of the camera; zoom only changes how many are drawn.
- `roundedBox` bevels bulge past w/d, so face details need the `bulge()` offset.
- Pathfinding is Dijkstra over a typed grid (`World.blockedGrid`: 0 open, 1 solid, 2 wall with a chew cost); fields are recomputed on structure changes via `Game.refresh()` (which also recomputes supply), not every tick. Watch its cost on the big world.
- Each stone enemy is five meshes (ten with the outline on), not yet instanced: big raids cost draw calls until they are drawn in bulk.
- Headless checks: Playwright with Chromium at /opt/pw-browsers/chromium; hooks `window.perfInfo`, `window.lookAtCell(x, y)`, `window.game`.

## Delivering builds

- `npm run build:artifact` produces `dist-single/artifact.html`. Publish it with the Artifact tool to the playable link https://claude.ai/artifact/44JH12KkM2JYyTDMCxxmJ4 (pass it as `url` from a new session).
- Mockups for new looks: make `mockups/<name>/` (index.html + main.ts, may import the game's models), build with `node scripts/mockup.mjs <name>` into `dist-mockup/<name>.html`, publish it, and delete the folder once Erik has picked (mockups are type-checked and otherwise need upkeep).
- **Run locally:** double-click `start-dev.cmd` (Windows) or `npm install && npm run dev`, then http://localhost:5173.

## Code map

- `src/sim/` game rules, no graphics: `game.ts` (the Game: placement, supply, upkeep, raids, enemies, combat, smelters), `world.ts` (map, walls, targets, path grid), `pathfinding.ts` (flow field), `worldgen.ts`, `avatar.ts`, `ore.ts`, `inventory.ts`, `smelter.ts`, `pieces.ts`, `towers.ts` (tower kinds, sizes, growing), `enemies.ts` (enemy types), `tuning.ts` (every balance number), `balance.ts` (derived numbers, `runRaid`), `rng.ts`, `types.ts`.
- `src/render/` three.js: `view.ts` (scene, camera, sync with the sim, effects), `models.ts` (model library, materials, evening palette, towers, armored walls), `scenery.ts`, `ship.ts`, `rig.ts`, `ore.ts`, `mining.ts`, `icons.ts`, `stoneWall.ts`, `pieceShape.ts`, `cave.ts`, `cliff.ts`, `rock.ts`, `stoneCreature.ts` + `colossus.ts`, `wolf.ts`, `grumtooth.ts`, `enemies.ts` (the enemies), `smelterModel.ts`, `alien.ts`, `bake.ts`, `palette.ts`.
- `src/input/controller.ts` mouse and keyboard to actions; `src/ui/hud.ts` DOM overlay (status, hotbar, raid clock, panels, notices); `src/ui/buildWheel.ts` + `wheel.ts` the wheels; `src/ui/tuning.ts` sliders; `src/main.ts` fixed-step loop (60 ticks/s).

## Locked decisions (see the design doc for the full list)

- Art style: clean low-poly 3D with three.js, soft light and shadows. Evening lighting is THE look.
- Camera: orthographic, fixed iso-style angle (about 30° elevation, 45° rotation). Pan and zoom OK.
- First world is snowy and cozy: cold world, warm colony (colony orange, cyan power, dark steel, white; violet aliens).
- Game logic never touches graphics; the renderer builds everything from named models so Erik's own models can replace placeholders.
- 8-direction movement, no corner cutting. Enemies take the fastest path. No map edge.
- Visual reference: `mockups/snow-test.html` (Clean 3D view, https://claude.ai/artifact/4Y1EHcKtCrum2szcH6Diqd); `mockups/look-test.html` is the older pixel exploration.

## Pushing

- From Claude Code on Erik's PC: normal `git commit` / `git push` with Erik's own git login.
- From a Claude cloud session (Cowork): the cloud workspace can't push to this repo. Commit and push from the linked PC folder via the device shell, authored as Erik with Claude as co-author, using a fine-grained token Erik provides. Tokens live outside the repo and must never be committed.
