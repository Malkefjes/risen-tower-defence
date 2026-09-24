# Working notes for Claude

Read this first in every session. Sessions do not share memory; this file and the design doc are the continuity.

## Collaboration

- Erik is the designer and player; Claude writes the code. Erik's calls on design are final.
- Take it slow on design: discuss fundamentals, reason through trade-offs, don't jump to building without agreement.
- Design doc (source of truth): https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec
- **Standing guardrail:** every shop/economy system must feed back into maze decisions. Flag it whenever a feature risks the economy becoming the main game.

## Code conventions

- TypeScript strict, Canvas 2D rendering, no framework.
- Keep game rules (grid, pathfinding, placement, combat) as pure logic, separate from rendering and input, so it can be unit tested.
- Tests live in `tests/`, run with `npm test`. Pathfinding and placement rules must have tests.
- Before committing: `npm run typecheck && npm test`.
- Small, focused commits with clear messages.

## Delivering builds

`npm run build:single` produces `dist-single/index.html`, a self-contained build published as a private playable link for Erik.

## Locked decisions (see design doc for the full list)

- Isometric pixel art, 32x16 px tiles, fixed camera (pan/zoom OK, no rotation).
- Render at low native resolution, integer upscale, image smoothing off.
- Game logic never touches graphics; everything draws as a named sprite so Erik's pixel art can replace placeholders.
- 8-direction movement, no corner cutting. Enemies take the fastest path. No map edge.
- Visual reference: mockups/look-test.html (published at https://claude.ai/artifact/NmEasb2A8bABcbzsxoyBK5).

## Pushing

The cloud workspace cannot push to this repo. Commit and push from the linked PC folder (device shell), authored as Erik with Claude as co-author. The token lives outside the repo and must never be committed.
