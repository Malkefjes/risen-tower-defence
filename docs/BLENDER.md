# Exporting from Blender

How a model has to look when it leaves Blender so the game can load it as it is, with no fixes in code. The file goes in `models/` at the repo root. Its file name is the model's name in the game (`models/sentinel.glb` is the avatar).

The short version: **1 metre is 1 cell, the front looks toward −Y, the origin sits on the ground, apply all transforms, name the materials, export glTF Binary.** A checklist is at the end.

## Scale: 1 metre = 1 cell

One grid cell is 1 × 1 m. Model at real size in those units (leave Blender's Unit Scale at 1.0):

| Thing | Size in the game |
| --- | --- |
| Avatar (the Sentinel) | 1.33 m tall |
| Grunt / Runner / Brute / Elite | 1.35 / 1.86 / 2.5 / 1.6 m tall |
| Wall deck (the top of a wall, where towers stand) | 0.58 m above the ground |
| Raised ground (plateaus) | 1.35 m |
| 1×1 tower | fits in 1 × 1 m, standing on the deck |
| 2×2 tower, the smelter | 2 × 2 m |
| The ship / hub | 3 × 3 m (the hub's porch may stick out past that) |

For now, characters are scaled to their height in the game, so a character a bit off in size is fine. Buildings and towers are not scaled: they have to fit their cells.

## Facing: the front looks toward −Y

In Blender, **Front view (Numpad 1) should show the model's face**: Blender's front view looks at the model from −Y, so the model's front points toward −Y. The glTF exporter turns that into the direction the game treats as forward. Z is up in Blender. The exporter turns that into the game's up (keep **+Y Up** ticked on export).

Towers aim with a turret that turns. Model the turret pointing toward −Y as well.

## Origin: on the ground

- **Characters:** the origin is on the ground, between the feet.
- **Buildings, towers, walls:** the origin is in the middle of the footprint, at its base: the ground for buildings, the underside of the tower (where it meets the deck) for towers.
- Put the 3D cursor there, then Object → Set Origin → Origin to 3D Cursor.

## Apply all transforms

Before you export, select everything and **Ctrl+A → All Transforms**. Location, rotation and scale should read 0, 0 and 1 in the N panel. The game places and turns every model itself. A leftover rotation or scale in the file makes it lie down, face the wrong way or come in huge.

For a rigged character, apply transforms to the armature and the mesh before rigging. If a rig is already made, apply scale with the armature and mesh selected together, then check the animations still play.

## Materials: name them, colour them

Each material exports with its colour (Principled BSDF Base Color), Roughness, Metallic and Emission. Give every material a name. A few names are the colony palette, and **the game swaps these for its own shared material** so every orange in the base matches:

| Material name | What it is | Colour to use in Blender |
| --- | --- | --- |
| `orange` | colony orange (pads, plating, trims) | #D9573A |
| `steel` | the dark steel of colony builds | #2C3142 |
| `cyan` | power glow (visors, lights, cores); set Emission too | #7FF5E6 |

Any other name keeps the colour you gave it in Blender (stone, ice, glass, rubber…). **No white on colony builds**: white belongs to the snow.

Colour whole parts with materials (select the faces in Edit mode, pick the material, Assign) rather than painting a texture. One mesh can hold several materials. Textures load too, but keep them small (1024 px or less) until we do the performance step.

*The game doesn't read the palette names yet (the current models are still coloured by face in code); Claude wires them up when your first export comes in. Your colours show in the game as they look in Blender's Material Preview; only the light differs.*

## Shading: low-poly and flat

The look is clean low-poly with flat faces. Use **Shade Flat**, or Shade Auto Smooth on parts that should be round (smooth rocks, pipes). The game keeps the normals you export.

Rough triangle budgets (we'll set exact ones in the performance step):

| Thing | Triangles |
| --- | --- |
| Enemy (many on screen at once) | up to about 3,000 |
| Avatar | up to about 10,000 |
| Tower | 2,000–5,000 per size |
| Building (smelter, hub) | 5,000–10,000 |

The Statistics overlay (Viewport Overlays → Statistics) shows the count.

## Characters: rig and animations

- **Keep the Mixamo bone names** (`mixamorig:Hips`, `mixamorig:Spine`, `mixamorig:RightHand`…). The Sentinel and the golems share one 28-joint rig and its clips, and the game finds bones by name: Spine, Spine2, RightArm, RightForeArm, RightHand, RightUpLeg, RightLeg, LeftUpLeg, Hips.
- **Clip names** the game looks for (Action names in Blender): `restpose` (standing), `Walking`, `Running`; the Sentinel also has `Run_03` (sprint), and the golems `walking_2` (the Brute's heavier walk). A new clip gets its name agreed first.
- **In place:** the hips stay over the origin; the game moves the character itself. A clip that walks forward gets dragged back when the game plays it.
- **Loops cleanly:** the last frame leads straight into the first. The simplest way: key the last frame as a copy of the first.
- **30 fps**, and every bone keyed at the same frames (Bake Action with all bones, if in doubt).
- **Rigid parts stay rigid:** armour, backpacks and weapons are weighted 100% to one bone (Weight Paint, or Vertex Groups with weight 1.0). A plate weighted to two bones stretches when the character moves.
- **Hands and wrists:** weight the hand to the hand bone and the forearm guard to the forearm; keep the thumb out of the leg groups.
- A held item (the blaster) is its own file, not part of the character. Model it with its grip at the origin and its muzzle toward −Y.

## Export

File → Export → **glTF 2.0 (.glb/.gltf)**:

- **Format:** glTF Binary (.glb)
- **Include:** Selected Objects (select the model and, for a character, its armature)
- **Transform:** +Y Up ✓
- **Data → Mesh:** Apply Modifiers ✓, UVs ✓, Normals ✓
- **Data → Material:** Export
- **Data → Armature:** Export Deformation Bones Only ✓
- **Animation:** ✓, with the actions you want kept (untick the rest in the NLA or delete them)
- **Compression:** off (the game doesn't load Draco yet)

Save it into `models/` with a short lowercase name (`gun1.glb`, `smelter.glb`). A model that replaces an old one keeps the old file name.

## First exercise: the Sentinel

The avatar came from Meshy with faults the game patches in code (`render/sentinel.ts`). Fixing them in Blender and re-exporting to `models/sentinel.glb` lets those patches go:

1. **Chest:** flatten the small block sticking out of the chest piece.
2. **Backpack:** weight it 100% to Spine2 so it stops stretching.
3. **Wrists:** weight each hand to its hand bone only, so the hand moves with the forearm.
4. **Colours:** make materials `steel` (the body), `cyan` (the three visor faces below the ridge) and `orange` (shoulder pads, forearm guards, the big chest piece that wraps round to the backpack; the crevice between helmet and chest stays steel).
5. Keep the rig, the clip names and the size.

When it's in `models/`, Claude removes the matching code patches and checks him in the avatar mockup.

## Checklist

- [ ] 1 m = 1 cell, the right height or footprint
- [ ] Front view (Numpad 1) shows the front
- [ ] Origin on the ground (between the feet, or the middle of the footprint)
- [ ] Ctrl+A → All Transforms (0 / 0 / 1)
- [ ] Every material named; colony parts named `orange`, `steel`, `cyan`; no white on colony builds
- [ ] Flat shaded, within the triangle budget
- [ ] Characters: Mixamo bone names, clips named, in place, looping, rigid parts on one bone
- [ ] Exported as glTF Binary, +Y Up, no compression, into `models/`
