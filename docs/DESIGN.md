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
- **Settle:** call the ship down where you think you can hold it. The ship is your core: it supplies upkeep to what's connected to it and is how you leave. Losing it does **not** end the run (decided 2026-09-25): the ship is destroyed, what depended on it starts to decay, and you rebuild around a hub (later), which can be rebuilt and acts as a ship.
- **Mine:** by hand at first (carry ore home), then extractors on nodes, then a rover and drones to haul.
- **Build:** walls bought with stone, towers, the smelter, generators.
- **Defend:** raids come on their own (no Start wave button). A raid clock always shows the time to the next raid; your activity pulls it closer; a warning shows where it will come from. They come from cave exits around the map.
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

### Raids (decided 2026-09-25)

Principle: **waiting must cost something.** You don't choose when you're attacked, but you always see it coming, because mazing needs a readable threat and time to prepare.

- **Raid clock, no button:** the HUD always shows the time to the next raid. First raid after a grace period (start: 4:00 after landing), then a set time after the last raid is cleared (start: 3:00). All numbers are tuning sliders; Erik tunes by playing.
- **Activity pulls it closer:** mining, smelting and building make noise the planet hears (start: each mined stage takes 4 s off, metal 6 s; each wall piece 2 s; each tower or building 5 s; the clock runs 50% faster while a smelter works). You can't call a raid yourself, only push it by what you do.
- **Warning:** the last 60 s are fixed (activity can't pull a raid into its own warning); the active caves stir and the HUD shows where it will come from.
- **Raids grow** with how many you've survived (size and enemy HP).
- **Calm and raid** replace planning and wave. Walls can be picked up during calm and lock during a raid; nodes regrow when a raid is cleared.
- **Later:** stray groups between raids, a steady pressure on the base that grows over time.

### Enemies and pathing

- **Targets and obstacles:** enemies go for the **nearest target** (the ship, the smelter, later hub modules, extractors, generators), not always the ship. Walls, terrain and ore are **obstacles**, never targets. **Towers are not targets:** a tower breaks only when a wall under it breaks (a 2×2 breaks if any one of its walls does).
- **Walls are slow obstacles (built):** enemies take the quickest way to their target, where crossing a wall costs the time it takes to chew through it (its HP against their damage) and terrain can't be crossed at all. A maze that holds is walked; a full block gets chewed through. You may wall in completely, but it must be **sufficiently slow** for basic enemies (a decent amount of time, not impossible), so walling in the ship is never a great starting strategy; mazing stays the efficient play (a holding maze costs nothing, a block costs repairs). Plated walls are tougher. Wall breakers come later as a special enemy. The path preview shows where enemies will chew through.
- They move in 8 directions but never cut a wall corner, so two diagonal walls form a closed seam.
- Walls may fully enclose anything (enemies chew through); only terrain can truly seal a path. **A piece breaks as a whole** (Erik, 2026-09-25): its whole tetromino shape goes at once, so the gap always fits the same piece again (a lone 1-cell hole could never be patched with 4-cell pieces). Numbers to start: stone piece 600 HP, plating ×3 (1800), at most 2 enemies claw one piece at a time (2 HP/s each), so a stone piece takes about 150 s and a plated one about 7½ minutes. Any tower on a broken piece goes with it (a 2×2 on two pieces goes if either breaks). **Repair** a damaged piece for stone (its share of the wall price for the HP missing) from the wall's right-click wheel, any time.
- Live path preview while placing a piece. This is essential.
- **Attacks (built):** enemies walk to a cell next to their target and claw it (`enemyDamage` 2 HP/s each); ship 400 HP, smelter 150. **The ship can be destroyed:** it slumps into a dark wreck that still blocks, its gun goes silent, a notice offers a New run, and the run goes on; raids move on to the next-nearest targets. A destroyed smelter is gone with what was in it. With nothing left to attack, enemies burrow away, so a raid still ends. Upkeep and decay: see "Supply and upkeep".

### Threats and answers (decided 2026-09-26)

Enemies and towers are the two deepest systems; everything else supports them. Enemies are **problems**, towers are **solutions**: each threat breaks one thing a defence relies on, and each baseline tower has one clear purpose. No flavour variants of the same auto turret.

- **Early to mid game, a strict matrix:** every threat needs its answer, and raids mix threats, so a base needs all of them. Every tower is clearly bad against at least one threat, and a tower's worth depends on where it sits in the maze, so there is no single best tower.
- **Late game, builds:** mods let you invest in one tower (or even walls) until it covers its own weaknesses ("this run I go laser cannon; I need an answer to swarms"). **Covering a weakness with mods must cost clearly more than placing the tower that answers it**, so a build is a commitment you chose, not the default. Mods are designed later; numbers stay open to being bent.
- **Some threats are answered by the maze, not a tower** (wall thickness, plating, spare routes). That keeps mazing the core.

| Threat | What it is | What it breaks | Baseline answer |
| --- | --- | --- | --- |
| **Grunt** | The ordinary enemy; the yardstick for the rest | Nothing in particular | Gun (piercing) |
| **Swarm** | Tiny, huge packs, medium speed | Single-target damage, by numbers | Explosive area damage; switchbacks that bunch them |
| **Runner** | Low HP, very fast, arrives ahead of the raid | Time in range | Heavy (slow) from the support tower, plus the gun; a longer maze |
| **Flyer** | Flies a straight, predictable line from its cave to its target | The maze | AA (useless against ground). Few and fragile, so the maze stays the core |
| **Support** | Heals or shields its pack | Your damage, and target choice | Incendiary (burning stops healing); kill it first |
| **Elite** | Small pack, tough, hits hard; later becomes the new baseline | Relying on one answer (too tough for splash, too many for one big gun) | A balanced defence |
| **Brute** | Slow, huge HP, armoured, breaks walls fast | The maze holding; opens shortcuts for the pack behind it | Laser cannon; plated front walls and spare routes |
| **Boss** | Big, armoured, resistant | One damage source | Variety, prepped with support |
| **Titan** | Heavy armour, heavy resistances; comes from special far spawners and becomes inevitable the longer a run goes, announced long ahead | The whole defence | A prep zone (Heavy, Cracked, burning) before the killzone |

**Damage types** (sci-fi, no melee, no frost):

- **Piercing:** rounds, rapid fire. The workhorse; flat armour hurts it most.
- **Laser:** a cannon, slow and huge per shot (not a beam). Beats armour by the size of the hit.
- **Explosive:** area damage. The swarm killer; armour counts on each target.
- **Incendiary:** a **thermite mortar** that leaves ground burning for a few seconds (not a flamethrower). Low damage; its job is prep. The enemies adapted to the cold and fire undoes it: **a burning enemy loses its resistances and can't heal.** Burn ticks take armour like any hit. Burning ground melts the snow to a scorched patch. Placement is a maze question: aim it where the path doubles back, and slowed enemies burn longer.

**Armour and resistances:**

- **Armour** is a flat reduction per hit: many small hits do little, big hits go through.
- **Resistances** are per damage type: half damage, never immune. Only Elites, Bosses and the Titan have them (at most one or two each), they are visible on the model and shown in the raid warning, and burning strips them. They exist so late-game builds have a problem to solve.
- **Cold does nothing to them** (they live here). The one immunity, and it teaches the world.

**Statuses:**

- **Heavy** (brown): slowed, from the support tower. Replaces frost.
- **Cracked:** armour lowered, from the support tower.
- **Burning:** from incendiary; resistances off, no healing.

The Titan shows the whole system: Heavy and Cracked, then burning, then the laser cannon, in that order along the maze.

### Supply and upkeep (decided 2026-09-25)

- **Supply** comes from the ship (later also hubs). A wall or building is supplied when it's **within the supply radius** (large: 40 cells from the ship's centre, so a big base fits) **and connected to the ship through walls or buildings** (touching counts, corners too, since diagonal walls form a closed seam).
- **Building needs supply (built):** walls must join the network (the first touches the ship), so no loose walls in the open; a smelter must touch it; nothing goes down beyond the radius. A later tech could allow disconnected walls. The radius shows as a ring on the snow while you hold something to build; unsupplied walls look cold and dim.
- **Breaches cut supply:** a broken or picked-up piece can leave the walls beyond it unsupplied.
- **Upkeep costs resources (built):** the ship (and hubs) has its own 24-slot inventory (also storage; it starts a run with 200 stone so the first walls don't decay at once). Click the ship when you're next to it to open it (from further off, a click still shows its gun). Every minute it takes 3% of each supplied thing's build price (stone for stone walls and the smelter, alloy for plating and towers), about 10% per raid cycle; a bigger base costs more. The ship's panel shows the upkeep per minute and how long the stock lasts. If the ship is destroyed its inventory is lost.
- **Decay (built):** anything unsupplied (cut off, out of range, upkeep unpaid, or the ship destroyed) loses HP steadily, full to broken in about 5 minutes; it stops when supply returns, and repair works as normal. The top bar shows "Upkeep unpaid" while it's unpaid. Towers keep firing (power may switch them later); they go when their wall breaks.
- **The hub** (later): a buildable building with its own supply area and inventory that acts as a ship; it can be built anywhere, so you can recover or start an outpost.

### Walls

- Tetris-shaped pieces, rotatable. Any of the 7 shapes can be bought with stone from the Q build wheel; the stone is paid as the piece goes down and refunded when an unlocked piece is picked up.
- In real time: full refund for about 5 seconds after placing, then recycle for 50%.
- Walls carry power from generators and the ship to towers.

### Towers

- Towers stand only on walls. A footprint may span walls from different pieces; a wall carrying a tower can't be removed until the tower is sold.
- Footprints (1×1, 2×2, later more). Bigger is stronger per material, but eats walls that could have extended the maze.
- First tower: the **Twin** (1×1), which grows into the **Gatling** (2×2). Both are single-target guns, so they will be redesigned around the threat list (see "Threats and answers"): one baseline tower per purpose (gun, laser cannon, explosive, thermite mortar, AA, support), deepened by mods.
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
| Smelter | 2×2 building on open ground (E → Buildings → Smelter), 500 stone + 300 raw metal; holds 2 stacks of raw metal in and 2 of alloy out, smelts 1:1 at 5/s like a Rust furnace; blocks enemies like a wall; Remove (in its panel) gives back its full price and its contents; enemies will attack it (next step) |
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
| Threats | Grunt, Swarm, Runner, Flyer, Support, Elite, Brute, Boss, Titan; each breaks one thing a defence relies on |
| Towers | One baseline tower per purpose, deepened by mods; late-game builds can cover a tower's weaknesses, at a clearly higher cost than the tower that answers them |
| Damage | Piercing, laser (cannon), explosive, incendiary (thermite mortar); flat armour per hit; resistances per type, half damage, only on Elite, Boss, Titan, stripped by burning |
| Slow | Heavy (brown), not frost: the enemies are cold-adapted |
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

WASD run (relative to the screen) · Shift sprint · Space jump · hold left mouse to fire the multitool (mines a node in reach) · hold right mouse on a wall for its modification wheel (metal plating) · click a turret or the ship for its range and stats · hold Q for the wall wheel, E for the tower wheel (point at Buildings for the smelter), release to pick · click a smelter next to you for its panel · left click places what you hold · R or right-click rotate · 1–6 hotbar (1 puts away what you hold) · left-drag (away from a node), middle-drag or arrows pan · C follow the rig · H look at the ship · scroll zoom · X sells the selected tower · Z undo · P pause · F speed · V path preview · G grid · T test walkers · K tuning.

## Open questions

- Economy numbers: ore per trip, costs of walls, towers and buildings. Found through play, with the tuning panel.
- How fast should the threat meter climb, and what exactly feeds it?
- Enemy target preferences: which types go for what?
- The baseline towers: shape, footprint and cost of each (gun, laser cannon, explosive, thermite mortar, AA, support), and what becomes of the Twin and Gatling.
- Meta between planets: what exactly carries over, and how is it earned?
