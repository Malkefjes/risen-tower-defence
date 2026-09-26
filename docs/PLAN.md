# Frostfall: Survival direction plan

Status: **approved by Erik on 2026-09-25.** Work one step at a time: before each step, Claude describes exactly what it will build and waits for Erik's feedback.
Written 2026-09-25 from the design conversation where Erik chose the survival direction.

This file has three jobs:
1. Pin down the new direction so no idea gets lost between sessions.
2. Lay out the build order as milestones that each keep the game playable and answer one question.
3. List what still needs Erik's call before or during each milestone.

---

## 1. The direction in one paragraph

A high-tech colony explores hostile alien planets to mine their resources. You arrive in a drop pod, explore on foot, find ore nodes, and call your ship down where you think you can hold it. You mine by hand at first, then build extractors, a refinery and generators, and fortify it all with Tetris walls and turrets. The more you take and the bigger you grow, the harder the planet pushes back. Raids come for your ship and for everything you built. One planet is one long run over several sessions: you build a base you're proud of, then choose your moment to launch in a final siege. The ship, and what you learned, carries over to the next planet.

Whether it plays more like tower defense or survival should come out of what's fun. Each milestone is built to find that out.

## 2. Agreed decisions (Erik said yes)

| Topic | Decision |
| --- | --- |
| Genre | Survival tower defense: explore, mine, build a base, defend it by mazing |
| Run shape | One planet = one long saved run over several sessions. Ends with a climax you choose (final siege and launch), not a filled quota |
| What carries over | The ship: upgrades, modules, look. Plus blueprints and tech (later) |
| The core | The nexus becomes your ship. It's what you defend and how you leave. Losing it ends the run |
| Arrival | Drop pod, explore, then choose where to call the ship down, between nodes you can defend |
| Player | An avatar you walk around with. Progression: hand mining, then extractors, then a rover, then drones |
| Presence | You can only build and repair near your avatar (later also near your drones). Your base must hold on its own while you're out |
| Resources | Three: raw ore, refined alloy, power. Physical, not just numbers: ore is mined at nodes and physically brought home |
| Threat | More extraction and a bigger base draw more attention. Raids are telegraphed, not random surprises |
| What gets attacked | Every building: ship, extractors, refineries, generators, stockpiles. Normal enemies walk around walls, so the maze stays the maze. Wall breakers are a special enemy type |
| Targets | Enemies go for the nearest building (later: enemy types with preferred targets) |
| Walls | Still Tetris pieces, bought with stone from the Q wheel: any of the 7 shapes (Erik, 2026-09-25; replaced the fabricator queue) |
| Power | Generators make power, towers and industry draw it. Power runs through walls, so the wall layout is also the power grid |
| Resource chain | Kept short on purpose: ore, alloy, power. No conveyor belts or Factorio chains |
| Controls | WASD moves the avatar. The camera follows the avatar, but you can pan away freely to watch the base while farming |
| Wall look | Armored deck (style A from `mockups/stronghold/`) |
| Ship look | Reactor core (nexus A) is the favorite starting point; the ship gets its own mockup |
| Turret | Twin / Gatling looks kept: they are the Gun at 1×1 and 2×2 |

## 3. Guardrails for every milestone

- **Every system ends in a maze decision.** Ore nodes decide where you fight, buildings are maze obstacles, power runs through walls. If a system doesn't touch the maze, question it.
- **Physical up to the ship, simple inside the base.** Ore has to travel from node to ship (carried, then hauled). Once home, converting ore to alloy is handled by the refinery without belts or routing.
- **Hauling must never become a chore.** Carrying by hand is a short early phase; automating it should feel like a reward.
- **Always playable.** Every milestone ends with a build at the playable link. Old features are replaced, never left half-broken.
- **Rules stay pure logic with tests.** Avatar movement, mining, threat, targeting, reachability and power connectivity all live in `src/sim/` with unit tests.
- **Save-friendly state.** From M1 on, the whole game state is plain data, so saving a planet run in M4 doesn't mean a rewrite.
- **No instructional text in the UI.** Show state, not instructions.

## 4. Milestones

Each milestone is a playable build that answers one question. I propose we stop after each one: Erik plays, we talk, then we go on (or change course).

### M0: Groundwork (small) (done 2026-09-25)
- Bring the Armored deck walls into the game: cells of one piece fuse into one hull, pieces keep a seam, and towers stand on the steel deck.
- Write the agreed direction into `docs/DESIGN.md`. Old parts that are replaced get marked "retired" there, with what replaced them.
- **Answers:** does the base look like a stronghold in the real game?

### M1a: Boots on the ground (part 1 done 2026-09-25: rig, Rocket, camera)
- **Avatar:** the player rig (`mockups/rig/`). Walks with WASD, jumps (Space) onto wall decks and runs along them; rocks, the Rocket and towers block it. Never blocks enemies. Pause moves to P. Always a run cycle, never a walk.
- **Camera:** follows the avatar. Dragging or arrow keys pan freely and stop following. One key snaps back to the avatar, another jumps to the ship.
- **Ship replaces the nexus:** same role, new model (placeholder based on Reactor core until the ship mockup).
- **Ore nodes on Frostfall:** a few nodes you can see. Stand next to one and hold the mine key to mine it by hand; the avatar carries a limited load and drops it off at the ship.
- **Ore replaces credits:** walls and towers cost ore.
- **Buying walls:** any of the 7 shapes from the Q wheel, paid in stone as it goes down. Replaced the supply drop and the planned fabricator queue (Erik, 2026-09-25).
- **Build range:** you can only build within a radius of the avatar (a tuning slider, so we can test with it large or small).
- Waves and the wave button stay for now, so only one big thing changes at a time.

#### M1a part 2 plan (approved and built 2026-09-25)
Brings the ore playground into the game, plus the build wheel.
- **From the playground:** sprint (Shift, 1.4×, not while firing), longer beam and grip, hold LMB to mine with move-while-mining and torso twist, screen-space reach (1.5-cell gap), 3×3 stone and metal nodes breaking in three stages with a shrinking footprint and the hotspot glint (+20%), 200 stone / 100 metal per stage arriving at once, the 6-slot hotbar (multitool in slot 1, stacks of 1000, "x200" counts, Full when a chunk won't fit), icons rendered from the models, the fading "+N".
- **Ore replaces credits:** pay straight from the hotbar (no delivery to the ship). Walls cost stone per cell (start 25), Twin 100 metal, Gatling 250, start with 400 stone and 100 metal; pick-up refunds stone, selling refunds metal. Credits and flat income go.
- **Nodes block enemies** like terrain (mining one down only opens paths). Frostfall: 3 stone near the ship, 2 metal further out toward the enemy path. A mined-out node grows back at the start of the next planning phase if its space is clear and it wouldn't cut off the path.
- **Build wheel:** hold Q for walls (7 shapes, greyed when you can't afford one), E for towers; centred on the character; the centre picks nothing; slices are cones that run past the wheel; release picks. The wall bar goes; supply drops show a short "+1 T +2 L" notice. No costs in the wheel yet. Look picked from the ore playground (A/B/C).
- **Keys:** 1–6 are hotbar slots only (1 drops a held wall or tower); LMB places when holding a wall or tower, otherwise fires the tool. Mining runs on real time (game speed doesn't change it; pause freezes it).
- **Tuning (K):** wall stone cost, tower metal costs, starting stock, node mine time, reach, sprint.
- **Order:** nodes in the sim → mining and hotbar in `Game` → costs → rendering (shared with the playground) → input → HUD → tuning → docs, headless check, publish.
- **Answers:** is walking out and mining fun, or a chore? Does building near yourself feel good?

### M1b: The planet reacts (direction agreed 2026-09-25; see DESIGN "Raids" and "Enemies and pathing")
Built in this order:
1. **Raid clock (done 2026-09-25):** no Start wave button; HUD clock to the next raid (grace 4:00, then 3:00 after each raid is cleared); activity pulls it closer (mining, smelting, building); 60 s warning that activity can't cut into, with the active caves stirring and their direction shown. Calm and raid replace planning and wave.
2. **Targets and building HP (done 2026-09-25):** the ship and smelter get HP; enemies path to the nearest target and claw it; the ship can be destroyed (the run goes on) and the raid moves to what's left.
3. **Breakable walls (done 2026-09-25):** walls get HP; crossing a wall costs its chew time in pathfinding, so enemies weigh walking a maze against breaking through; the "can't seal the path" rule goes; walls can be repaired. Basic enemies break walls slowly (walling in must not be a great opening). Towers break with the wall under them.
4. **Supply, upkeep and decay** (agreed 2026-09-25, see DESIGN "Supply and upkeep"): A supply network and build rules (done), B the ship's 24-slot inventory, upkeep drain and decay (done), C the hub (mockups first).
5. **Stray groups** between raids.
- **Cave exits** (done): raids come from caves around the map; the nearest few are active.

### Enemies and towers (the current focus, agreed 2026-09-26; see DESIGN "Threats and answers")
The hub (4C) and stray groups are parked. A system is built when the first threat that needs it arrives.
1. **One pair, done the new way (done 2026-09-26):** enemy types exist (the leaper is the Grunt, numbers per type); the Twin and Gatling are one Gun that grows in place (1×1 to 2×2; 3×3 once it has a model), selling returns 75% of what was spent before this calm; every balance number in `sim/tuning.ts`, with DPS and alloy per DPS in the tuning panel, the design's balance rules as tests, and `runRaid` to play a raid out headless.
2. **Enemy looks (done 2026-09-26):** Erik's stone creatures replace the leaper: the Brute (Colossus), the Runner (wolf) and the Swarm (Grumtooth), tried in `mockups/playground`; raids mix them by share. Still to do: drawing them in bulk (instancing), HP tuning, a Grunt look.
3. **An answer to every current enemy (agreed 2026-09-26):** the Gun stays the general-purpose workhorse; each new enemy gets its answer, in this order:
   1. The explosive tower (the missile rack; missiles home in) into the game, against the Swarm (done 2026-09-26: 1×1 250 alloy, 3 damage, radius 0.9, range 4, every 1.5 s; 2×2 625, 4 damage, radius 1.2, range 5, every 0.8 s; a common-sense start, tuned by the balance rules in step 4).
   2. The support tower against the Runner (done 2026-09-26): the Radome, a turning dome whose field makes everything in it Heavy (40% slower, not stacking, lingering 1 s at 1×1 and 2 s at 2×2 after leaving; picked from radar mockups, no pulse).
   3. The laser cannon against the Brute (done 2026-09-26): the rail lance, firing a big glowing slug; flat armour per hit (the Brute 0.75, at least 10% of a hit always lands).
4. **Balance by rules (first pass done 2026-09-26, see DESIGN "Balance anchors"; next: check the economy pays for the tower curve):** tests with `runRaid` on a standard maze: with the alloy you'd have by then, the right towers hold and the same alloy in the wrong ones costs the ship heavily (destroyed by about raid 4); enemy HP set from time in range; a raid schedule (raid 1 Swarm, 2 adds Runners, 3 the first Brute, then mixed, about +30% a raid, tied to what the economy can buy); the warning shows the raid's mix. A common-sense baseline Erik plays and corrects.
5. Then play it, and pick what comes next (Flyer and AA, Support enemies and the mortar).

### M2: Outposts
- **Extractors** built on nodes: they mine on their own into a visible stockpile next to them, which you collect by walking over.
- **Buildings have HP.** Enemies walk to the nearest building and attack it. Destroyed buildings leave a wreck you can salvage or rebuild. Repair near your avatar.
- **Reachability rule** (generalizes today's "can't block the rift"): walls can't seal off any building from the spawns. Otherwise fully walled-in extractors would be invulnerable.
- Avatar HP: enemies can hurt you; if you go down, you respawn at the ship and drop what you carried.
- **Answers:** is choosing what to fortify and what to risk the fun we hope for?

### M3: Industry
- **Smelter (done 2026-09-25, was "refinery"):** a 2×2 building you build (stone + raw metal) and feed by hand; turns raw metal into alloy 1:1. Towers and metal plating cost alloy; walls stay stone.
- **Generators and power:** towers and the refinery draw power. Power flows through connected walls from generators and the ship. Unpowered towers don't fire.
- **Answers:** does the economy feed the maze, or start taking it over?

### M4: Landfall
- **Bigger Frostfall** with fog of war, more nodes, varied terrain.
- **Drop pod start:** explore on foot, then call the ship down where you choose.
- **Save and load** a planet run in the browser, so it can span several sessions.
- **Rover, then drones** for hauling, to move ore without walking every load. Drones fly over walls; a rover needs a lane through the maze (maybe gates).
- **Answers:** does choosing your spot and growing a base over sessions build the attachment we want?

### M5: The planet fights back
- Escalation curve over a whole run, enemy variety (wall breakers, fast swarms, tanks, flyers).
- **Final siege and launch:** you choose when to leave; launching triggers the last big attack.
- **The ship carries over** to the next planet: upgrades and look.
- **Answers:** does a run have a satisfying arc from landing to launch?

## 5. What changes in today's game

| Today | Becomes | When |
| --- | --- | --- |
| Nexus | Your ship | M1a |
| Credits and flat income | Ore (then alloy in M3) | M1a |
| Supply drop of 3 random walls | Buy any shape with stone from the Q wheel | done |
| WASD pans the camera | WASD moves the avatar; drag and arrows pan | M1a |
| Planning phase and waves with a button | Real time with telegraphed raids | M1b |
| Pick up walls during the planning phase | Undo window, then recycle | M1b |
| One rift | Burrows around the map | M1b |
| Nexus HP bar | Ship HP; other buildings have their own HP | M2 |
| Tower sell rule (full refund in the phase built) | Same idea with the undo window | M1b |
| Tuning panel | Kept, grows with each milestone | all |

## 6. Idea bank (parked, not forgotten)

Good ideas that don't have a milestone yet. Review this list at every milestone.

- **Blizzards as the danger phase on Frostfall**: weather that marks raid time.
- **Noise and heat**: extraction and industry raise the threat meter (partly in M1b).
- **Gates** in walls so a rover can pass through the maze.
- **Special wall pieces**: reinforced, conductive (power), raised (tower range bonus).
- **Metal wall upgrade**: decided (see DESIGN.md, Two walls): stone walls by default, metal plating makes a piece the Armored deck that towers need. Later: tougher against wall breakers, maybe carry power; more mods in the wall's modification wheel.
- **Terrain**: rough ground slows enemies, high ground boosts tower range.
- **Tower variety** (old Phase 2): towers that favor different maze shapes (splash likes switchbacks, beams like corridors, slows like corners).
- **Targeting options** for towers.
- **Star-ups and traits** from the old TFT-style roadmap. Parked; revisit once the survival loop works.
- **Multiple planets**, each with its own terrain and threats.
- **Blueprints** as unlocks between planets and as a way to specialize fabricator supply.
- **Wrecks as loot**: salvaging destroyed buildings, maybe enemy remains as a resource.
- **Enemy types with preferred targets** (e.g. some go for power, some for stockpiles).
- **Ship modules** you install and carry between planets.

## 7. Settled questions (2026-09-25)

1. M1 is split into M1a and M1b.
2. Camera: WASD moves the avatar; dragging and arrow keys pan and stop following; **C** snaps to the avatar, **H** to the ship; Space stays pause.
3. Walls in real time (M1b): full refund for about 5 seconds after placing, then recycle for 50%.
4. The avatar is a builder: it can't be hurt in M1 and can be from M2. No weapon for now; revisit later.
5. The ship gets its own mockup (engine core based on Reactor core) before it goes into the game in M1a.
