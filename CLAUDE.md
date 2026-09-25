# Working notes for Claude

Read this first in every session. Sessions do not share memory; this file and `docs/DESIGN.md` are the continuity.

## Status

- **Done:** Phase 1 step 1 (map, supply drops, wall bar, placement with path preview, undo/pick-up, waves, camera). Phase 1 step 2: Twin tower (1×1) and its Gatling form (2×2) on walls, credits with flat income, selling (full refund in the phase built, 75% after, also mid-wave), enemy HP with growth, nexus HP and run over/restart, tuning panel (K) saved in localStorage. Turret look picked by Erik: design B "Twin" from `mockups/turrets/`.
- **New direction (2026-09-25):** survival tower defense. Explore a planet, mine, build a base, defend it by mazing. Read `docs/PLAN.md` first: agreed decisions, milestones M0 to M5, idea bank, open questions. The old Phase 2+ roadmap in `docs/DESIGN.md` is superseded.
- **Done (M0):** Armored deck walls in the game (per-piece model `wallPiece`, outline logic in `src/render/pieceShape.ts`), design doc rewritten for the survival direction.
- **Ship:** the Rocket (`mockups/rocketship/`, https://claude.ai/artifact/GBVZ8RpZPQaqY44reLU2hg): 3×3, three fins (one front-centre), Reactor core in an open cage mid-body, wider lower body as a sturdy base, nose cone directly on the core cage (no upper cylinder), cargo bay front-left of the front fin with a door that becomes the ramp (shut when landing, opens after touchdown), fabricator with console screen front-right, both at walking height. The player arrives earlier by drop pod, never from the ship. Waiting on Erik's final OK.
- **Rocket is final** and lives in `src/render/ship.ts` (model `ship`, `userData.rig` has the door, bay and core).
- **Settled for M1a:** mining is a held key (not automatic). Order: avatar, then ore, then fabricator.
- **Next:** Erik picks an avatar. First round (`mockups/avatar/`, https://claude.ai/artifact/H5ECqtwJGetKCkiSGX224s) didn't land; Exo-rig was the right direction. Exo-rig round (`mockups/exorig/`) also missed; Erik wants a humanoid exo-rig with plain labels, no themed names. Humanoid round (`mockups/humanoid/`): B was closest. B variations (`mockups/humanoid-b/`): Erik chose B2 and asked for revisions (no shoulder pads, torso = hip width, backpack flush with torso top, square helmet with visors), then: no helmet stripe, no side visors, smaller head, short neck; then: no ore canisters on the pack, hips pulled back, no drill or fingers, a blocky prefab multitool (tool gun with cyan beam) in the right hand. Revised rig: `mockups/rig/` (https://claude.ai/artifact/6tc7ay9BZja5htwtdCNBCg); walks in place on a turntable. Note: roundedBox bevels bulge past w/d, so face details need the `bulge()` offset. Then M1a part 1 (avatar + Rocket in the game), described to Erik before building.
- Picks so far: walls = Armored deck, nexus/ship = Reactor core as starting point (`mockups/stronghold/`, published at https://claude.ai/artifact/DkXNNFtuUA26uCJPa3sLa5).
- **Run locally:** double-click `start-dev.cmd` (Windows) or `npm install && npm run dev`, then http://localhost:5173.

## Collaboration

- Erik is the designer and player; Claude writes the code. Erik's calls on design are final.
- Erik dislikes popups that interrupt play: prefer non-blocking notices.
- No instructional text in the UI ("Press Space to resume", control hints, how-to lines). It's Erik's own game; he knows the controls. Show state, not instructions.
- Take it slow on design: discuss fundamentals, reason through trade-offs, don't jump to building without agreement.
- Design: `docs/DESIGN.md` (snapshot in the repo). Erik's live, editable copy: https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec. When a design decision changes, update `docs/DESIGN.md` in the same commit.
- **Standing guardrail:** every shop/economy system must feed back into maze decisions. Flag it whenever a feature risks the economy becoming the main game.

## Code conventions

- TypeScript strict, three.js for rendering, no UI framework.
- Keep game rules (grid, pathfinding, placement, combat) as pure logic, separate from rendering and input, so it can be unit tested.
- Tests live in `tests/`, run with `npm test`. Pathfinding and placement rules must have tests.
- Before committing: `npm run typecheck && npm test`.
- Small, focused commits with clear messages.

## Delivering builds

Mockups: `node scripts/mockup.mjs <name>` builds `mockups/<name>/` (can import the game's models) into `dist-mockup/<name>.html`.


`npm run build:artifact` produces `dist-single/artifact.html`, a self-contained build. Publish it with the Artifact tool to the existing playable link: https://claude.ai/artifact/44JH12KkM2JYyTDMCxxmJ4 (pass it as `url` from a new session).

## Code map

- `src/sim/` game rules, no graphics: `world.ts` (map, walls, no-edge bounds), `pathfinding.ts` (flow field, 8-way, no corner cutting), `pieces.ts`, `game.ts` (supply drops, hand, placement rules, towers, combat, credits, HP, waves), `towers.ts` (tower kinds, stats, tuning defaults), `maps.ts`.
- `src/render/` three.js: `models.ts` (named model library, materials, evening palette), `view.ts` (scene, camera, sync with sim, effects).
- `src/input/controller.ts` mouse/keyboard to actions; `src/ui/hud.ts` DOM overlay; `src/ui/tuning.ts` tuning sliders; `src/main.ts` fixed-step loop (60 ticks/s).
- Rendering uses `THREE.ColorManagement.enabled = false` and legacy-like light intensities to match the mockups.

## Locked decisions (see design doc for the full list)

- Art style: clean low-poly 3D with three.js, soft light and shadows. Replaces the earlier pixel-art decision.
- Camera: orthographic, fixed iso-style angle (about 30 deg elevation, 45 deg rotation). Pan/zoom OK.
- First world is snowy and cozy: cold world, warm colony (palette: colony orange, cyan power, dark steel, white; violet aliens). Evening lighting is THE look (day/night presets were dropped).
- Game logic never touches graphics; the renderer builds everything from named models so Erik's own models (e.g. Blockbench) can replace placeholders.
- 8-direction movement, no corner cutting. Enemies take the fastest path. No map edge.
- Visual reference: mockups/snow-test.html, Clean 3D view (published at https://claude.ai/artifact/4Y1EHcKtCrum2szcH6Diqd). mockups/look-test.html is the older pixel exploration.

## Pushing

- From Claude Code on Erik's PC: normal `git commit` / `git push` with Erik's own git login.
- From a Claude cloud session (Cowork): the cloud workspace can't push to this repo. Commit and push from the linked PC folder via the device shell, authored as Erik with Claude as co-author, using a fine-grained token Erik provides. Tokens live outside the repo and must never be committed.
