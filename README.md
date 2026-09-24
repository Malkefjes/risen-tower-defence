# Risen Tower Defence

A browser tower defense game about mazing. Enemies take the fastest path to your nexus; you bend that path with Tetris-shaped walls and mount towers on top of them. Every piece is a choice between lengthening the maze and building a platform for firepower.

A personal project, built for fun.

- **Design doc:** [Maze Defense — Design Doc](https://claude.ai/code/artifact/8a4e11d2-eea6-4144-9f29-23a844c9d1ec) (the source of truth for design decisions)
- **Stack:** TypeScript, Vite, Canvas 2D, Vitest

## Running locally

Requires [Node.js](https://nodejs.org) 20+.

```sh
npm install
npm run dev        # dev server with hot reload
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run build:single` | Build a single self-contained `index.html` to `dist-single/` (used for playable links) |
| `npm test` | Run tests |
| `npm run typecheck` | Type-check only |

## Roadmap

| Phase | Scope | Question it answers |
| --- | --- | --- |
| 1. Core maze | Grid, terrain, spawner, nexus, live path preview, piece placement and rotation, blocking and lock rules, 1 tower, 1 enemy, waves, HP | Does placing pieces feel good? How many walls per round? |
| 2. Tower variety | 3–4 towers with different reach and footprints | Do different builds want different mazes? |
| 3. Roguelite layer | Gold, interest, shop, rerolls, bench, star-ups | Does the economy add tension without taking over? |
| 4. Depth | Traits, enemy variety, more terrain | Does it stay unsolvable over many runs? |
| 5. Identity | Sci-fi visuals, planets, meta progression | Does it feel like its own game? |
