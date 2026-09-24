# Working notes for Claude

Read this first in every session. Sessions do not share memory; this file and `docs/DESIGN.md` are the continuity.

## Status

- **Done:** Phase 1 step 1. Snowy evening map (Frostfall), supply drops of 3 random walls per round, wall bar, placement with live path preview, undo/pick-up, waves of walkers (no combat), camera pan/zoom. Wall lamps/windows and the on-screen help card were removed at Erik's request.
- **Next:** Phase 1 step 2: towers, credits, enemy HP, player HP, tuning panel. See "Step 2 plan" in `docs/DESIGN.md` (agreed). Waiting on Erik's pick of turret look from `mockups/turrets/` (published at https://claude.ai/artifact/SfHrBAezmbHYPbQb3rvonE; rebuild with `node scripts/mockup.mjs turrets`) and on sell refund rules.
- **Run locally:** double-click `start-dev.cmd` (Windows) or `npm install && npm run dev`, then http://localhost:5173.

## Collaboration

- Erik is the designer and player; Claude writes the code. Erik's calls on design are final.
- Erik dislikes popups that interrupt play: prefer non-blocking notices.
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

`npm run build:artifact` produces `dist-single/artifact.html`, a self-contained build. Publish it with the Artifact tool to the existing playable link: https://claude.ai/artifact/44JH12KkM2JYyTDMCxxmJ4 (pass it as `url` from a new session).

## Code map

- `src/sim/` game rules, no graphics: `world.ts` (map, walls, no-edge bounds), `pathfinding.ts` (flow field, 8-way, no corner cutting), `pieces.ts`, `game.ts` (supply drops, hand, placement rules, waves, walkers), `maps.ts`.
- `src/render/` three.js: `models.ts` (named model library, materials, evening palette), `view.ts` (scene, camera, sync with sim, effects).
- `src/input/controller.ts` mouse/keyboard to actions; `src/ui/hud.ts` DOM overlay; `src/main.ts` fixed-step loop (60 ticks/s).
- Rendering uses `THREE.ColorManagement.enabled = false` and legacy-like light intensities to match the mockups.

## Locked decisions (see design doc for the full list)

- Art style: clean low-poly 3D with three.js, soft light and shadows. Replaces the earlier pixel-art decision.
- Camera: orthographic, fixed iso-style angle (about 30 deg elevation, 45 deg rotation). Pan/zoom OK.
- First world is snowy and cozy: cold world, warm colony (orange prefab walls, cyan nexus, violet aliens). Evening lighting is THE look (day/night presets were dropped).
- Game logic never touches graphics; the renderer builds everything from named models so Erik's own models (e.g. Blockbench) can replace placeholders.
- 8-direction movement, no corner cutting. Enemies take the fastest path. No map edge.
- Visual reference: mockups/snow-test.html, Clean 3D view (published at https://claude.ai/artifact/4Y1EHcKtCrum2szcH6Diqd). mockups/look-test.html is the older pixel exploration.

## Pushing

- From Claude Code on Erik's PC: normal `git commit` / `git push` with Erik's own git login.
- From a Claude cloud session (Cowork): the cloud workspace can't push to this repo. Commit and push from the linked PC folder via the device shell, authored as Erik with Claude as co-author, using a fine-grained token Erik provides. Tokens live outside the repo and must never be committed.
