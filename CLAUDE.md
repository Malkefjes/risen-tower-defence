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
