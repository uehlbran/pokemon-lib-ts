# Pokemon Fan Game — External Resources & Asset Strategy

> Companion document to the main Technical Specification. Contains all external resource links, reference repositories, and strategies for acquiring assets that aren't available as simple repo clones.

---

## Table of Contents

1. [Repository Map — What We Have](#1-repository-map--what-we-have)
2. [Tileset & Overworld Asset Strategy](#2-tileset--overworld-asset-strategy)
3. [Item Sprites](#3-item-sprites)
4. [Move Animation Reference Sources](#4-move-animation-reference-sources)
5. [Battle Mechanic Reference Code](#5-battle-mechanic-reference-code)
6. [Audio Assets](#6-audio-assets)
7. [Miscellaneous Resources](#7-miscellaneous-resources)

---

## 1. Repository Map — What We Have

These repos are already downloaded locally in `tools/repos/`:

| Repo | URL | What It Gives Us |
|------|-----|-----------------|
| **PokeAPI/api-data** | https://github.com/PokeAPI/api-data | Pre-joined JSON for all Pokemon, moves, abilities, items, types, natures |
| **PokeAPI/sprites** | https://github.com/PokeAPI/sprites | All battle sprites (front/back/shiny), official artwork, Home renders, Showdown GIFs |
| **PokeAPI/pokeapi** | https://github.com/PokeAPI/pokeapi | ~178 CSV files (fallback data source) |

These repos should be cloned for reference:

| Repo | URL | What It Gives Us |
|------|-----|-----------------|
| **smogon/pokemon-showdown-client** | https://github.com/smogon/pokemon-showdown-client | Move animation code, battle rendering reference |
| **smogon/pokemon-showdown** | https://github.com/smogon/pokemon-showdown | Battle simulator logic, move effects, ability implementations, Gen 9 mechanics |
| **Maruno17/pokemon-essentials** | https://github.com/Maruno17/pokemon-essentials | RPG Maker XP Essentials — complete battle system in Ruby, tilesets, item/NPC sprites |
| **pokemon-essentials/pokemon-essentials** | https://github.com/pokemon-essentials/pokemon-essentials | RPG Maker MV port — TypeScript-based, closer to our tech stack |

---

## 2. Tileset & Overworld Asset Strategy

This is the most manual part of the asset pipeline. Unlike battle sprites and data, tilesets don't come in a single clean repo with consistent naming. Here's the strategy:

### The Problem

Tilesets need to be:
- Consistent art style across all maps (outdoor, indoor, lab, cave, water)
- Formatted as tileset images compatible with Tiled (regular grid, 16×16 tiles)
- Complete enough to build every map type: town, route, house interior, lab interior, Pokemon Center, PokeMart, cave

### Strategy: Use Pokemon Essentials Tilesets as Primary Source

Pokemon Essentials (the RPG Maker XP version) ships with comprehensive FRLG-style tilesets that are already assembled, well-organized, and battle-tested by thousands of fan games. This is the path of least resistance.

**Step 1: Download Pokemon Essentials**

The official distribution is from Relic Castle (requires free account):
- Main page: https://reliccastle.com/essentials/
- Or from the GitHub repo: https://github.com/Maruno17/pokemon-essentials

Once downloaded, the tilesets live in: `Graphics/Tilesets/`

**Step 2: Understand the Essentials Tileset Format**

Essentials tilesets are PNG images, 8 tiles wide (256px), any height. Each tile is 32×32 pixels in Essentials (RPG Maker XP standard). For our game (16×16 tile grid), you have two options:

| Approach | Pros | Cons |
|----------|------|------|
| **Use at 32×32** and set Tiled tile size to 32×32 | No conversion needed, higher detail | Larger maps, different feel than classic GBA games |
| **Downscale to 16×16** | Authentic GBA feel, matches original games | Loses detail, need to process images |
| **Use at 32×32 and scale the game** | Best of both — render at 2x, game feels like 16×16 | Slightly more complex camera/viewport math |

**Recommendation**: Use the 32×32 tilesets as-is and set your Phaser game to render at 2x scale. This gives you GBA-accurate pixel density without manually downscaling anything. Set your tile size to 32×32 in both Tiled and Phaser.

**Step 3: Tilesets You Need**

| Tileset | Use For | Source in Essentials |
|---------|---------|---------------------|
| Outdoor / Town | Pallet Town, routes, grass, trees, fences, flowers, water | `Graphics/Tilesets/Outdoor.png` (or similar) |
| Indoor (House) | Player's house, Rival's house, generic interiors | `Graphics/Tilesets/Indoor.png` |
| Lab / Special Building | Oak's Lab, machines, bookshelves, Pokeball table | `Graphics/Tilesets/Indoor.png` or separate lab tileset |
| Pokemon Center | Nurse Joy counter, healing machine, sofas | Included in indoor tilesets |
| PokeMart | Shelves, counter, items display | Included in indoor tilesets |
| Cave (future) | Rock walls, cave floor, ladders | `Graphics/Tilesets/Cave.png` |

**Step 4: Import into Tiled**

1. Copy the tileset PNGs to `public/assets/tilesets/`
2. In Tiled: Map → New Tileset → Image → select the PNG
3. Set tile width/height to 32×32 (or 16×16 if you downscaled)
4. Save as `.tsx` (Tiled tileset file) for reuse across maps
5. When exporting maps, embed the tileset in the JSON

### Supplementary Tileset Sources

If Essentials tilesets don't cover everything you need:

| Source | URL | Notes |
|--------|-----|-------|
| **Spriters Resource — FRLG Tileset** | https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/asset/3870/ | Raw FRLG tileset rip. May need reformatting for Tiled. |
| **Spriters Resource — FRLG Full** | https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/ | All FRLG sprites/tiles — browse for specific needs. |
| **Spriters Resource — HGSS** | https://www.spriters-resource.com/ds_dsi/pokemonheartgoldsoulsilver/ | DS-era tileset rips. Higher resolution, different style. |
| **Spriters Resource — RSE** | https://www.spriters-resource.com/game_boy_advance/pokemonrubysapphire/ | Ruby/Sapphire tileset rips. |
| **Eevee Expo — NPC Megapack** | https://eeveeexpo.com/resources/823/ | FRLG-style NPC overworld sprites (walking animations). |
| **Veekun Downloads** | https://veekun.com/dex/downloads | Overworld Pokemon sprites from HGSS, trainers, icons. |
| **PokeCommunity Resource Thread** | https://www.pokecommunity.com/threads/game-development-resources.352449/ | Community-maintained list of tilesets, sprites, audio. |

### Overworld Character Sprites

You need walking sprites for the player, NPCs, and possibly following Pokemon. These are NOT in the PokeAPI sprites repo (that's battle sprites only).

| Asset | Source | Format |
|-------|--------|--------|
| Player walking sprite | Pokemon Essentials (`Graphics/Characters/`) or Spriters Resource FRLG character rips | Spritesheet: 4 directions × 4 frames, 32×32 per frame |
| NPC walking sprites | Pokemon Essentials or Eevee Expo NPC Megapack | Same format as player |
| Professor Oak | Pokemon Essentials or custom from Spriters Resource | Overworld + possibly a large portrait for intro |
| Rival (Blue) | Pokemon Essentials or Spriters Resource FRLG | Overworld walking sprite |
| Mom | Pokemon Essentials generic female NPC | Simple standing/walking sprite |
| Pokeball (on table) | Can be a single tile/object sprite | Simple 16×16 or 32×32 sprite |

### Tileset Pipeline Summary

```
1. Download Pokemon Essentials (or just its Graphics/ folder)
2. Copy relevant tilesets → public/assets/tilesets/
3. Copy character sprites → public/assets/characters/
4. Import tilesets into Tiled as .tsx files
5. Build your maps in Tiled using these tilesets
6. Export maps as JSON → public/assets/maps/
7. Phaser loads the JSON + tileset images at runtime
```

This is inherently a manual process — you're hand-building maps in Tiled. But the tileset acquisition is a one-time setup.

---

## 3. Item Sprites

### Sources (pick one or combine):

**Option A: PokeAPI Sprites Repo (already downloaded)**

Path: `tools/repos/sprites/sprites/items/`
- Named by item identifier: `potion.png`, `poke-ball.png`, `rare-candy.png`
- Covers most items
- Already in your local repo

**Option B: Pokemon Showdown Item Icons**

URL: `https://play.pokemonshowdown.com/sprites/itemicons/`
- Sprite sheet format (all items in one image)
- Would need to be sliced into individual icons or loaded as a sprite atlas

**Option C: Pokemon Essentials**

Path in Essentials: `Graphics/Items/`
- Individual PNGs per item
- Named by internal ID: `POTION.png`, `POKEBALL.png`
- RPG Maker XP formatted (may need minor adjustments)

**Recommendation**: Use Option A (PokeAPI sprites repo) since you already have it downloaded and the naming matches our data pipeline.

---

## 4. Move Animation Reference Sources

Move animations in our game are procedural code (not sprite sheets). These sources are references for WHAT each animation should look like, not files to import directly.

### Primary: Pokemon Showdown Client

**Repo**: https://github.com/smogon/pokemon-showdown-client

**Key files**:
| File | Path | Contains |
|------|------|----------|
| `battle-animations-moves.ts` | `play.pokemonshowdown.com/src/battle-animations-moves.ts` | **Every move's animation defined in TypeScript.** This is the gold mine. Each move is a function that describes particle effects, sprite movements, screen flashes, etc. |
| `battle-animations.ts` | `play.pokemonshowdown.com/src/battle-animations.ts` | Base animation system — how Showdown renders particles, tweens, sprites. |
| `battle-scene-pokemon.ts` | `play.pokemonshowdown.com/src/battle-scene-pokemon.ts` | How Pokemon sprites are positioned and manipulated during battle. |

**How to use**: Clone the repo, open `battle-animations-moves.ts`, and search for any move name (e.g., "flamethrower"). You'll see exactly what particles, colors, timings, and sprite transforms Showdown uses. Translate the concept to Phaser's particle system and tween API.

**License**: AGPLv3 — you can study and reference the code. If you directly port significant amounts of animation code, your animation module would need to be AGPLv3 as well (but the rest of your game wouldn't).

### Secondary: Pokemon Essentials Move Animation Project

**Gen 9 Project**: https://eeveeexpo.com/resources/1480/
**PokeCommunity Thread**: https://www.pokecommunity.com/threads/the-gen-9-move-animation-project.526189/

These are in RPG Maker's proprietary animation format (`.rxdata` binary files). They can't be directly imported into Phaser. However:
- The project page has preview GIFs of many animations
- The animation descriptions explain what each move should look like
- Useful as visual reference alongside Showdown's code

### What "Downloading" Move Animations Means

There are no sprite sheets or asset files to download for move animations. The animations are:

1. **In Showdown**: TypeScript functions that programmatically create visual effects (particles, tweens, flashes). You clone the `pokemon-showdown-client` repo and read the code.

2. **In Essentials**: Binary data files (`.rxdata`) that describe frame-by-frame animations using cel sprites. These are tied to RPG Maker XP's engine and can't be extracted as standalone assets.

3. **In our game**: We create our own animations in Phaser using the tiered system described in the main spec, using Showdown's code as reference for what each move should look like.

---

## 5. Battle Mechanic Reference Code

When implementing the battle engine, these repos contain authoritative implementations of every mechanic:

### Pokemon Showdown Server (Gen 9 mechanics, TypeScript)

**Repo**: https://github.com/smogon/pokemon-showdown

| File | Contains |
|------|----------|
| `data/moves.ts` | Every move definition — power, accuracy, flags, effects, secondary effects |
| `data/abilities.ts` | Every ability definition — triggers, effects, interactions |
| `data/items.ts` | Every held item's battle effect |
| `sim/battle.ts` | Main battle loop, turn resolution, event system |
| `sim/battle-actions.ts` | Move execution, damage calculation, hit processing |
| `sim/pokemon.ts` | Pokemon stat calculation, status handling |
| `data/mods/gen1/moves.ts` | Gen 1-specific move behavior overrides |

This is THE most accurate open-source implementation of Pokemon battle mechanics. When Claude Code needs to know exactly how an ability or move works, this is where to look.

### Pokemon Essentials (Ruby, RPG Maker XP)

**Repo**: https://github.com/Maruno17/pokemon-essentials

Key scripts (in `Data/Scripts/` after extraction):
- Battle system: `Battle/`, `Battle_AbilityEffects/`, `Battle_MoveEffects/`
- Pokemon data: `Pokemon/`, `Pokemon_Stats/`
- Items: `Items/`

Useful because Essentials has been the fan game standard for 10+ years, so edge cases and quirky mechanics are well-documented in its code.

### Pokemon Essentials MV Port (TypeScript)

**Repo**: https://github.com/pokemon-essentials/pokemon-essentials

This is the most directly relevant reference since it's TypeScript. However, it's less complete than the RPG Maker XP version and may not have all Gen 9 mechanics.

---

## 6. Audio Assets

Audio is lower priority (Phase 7 in the main spec) but worth collecting early:

| Asset Type | Source | Notes |
|------------|--------|-------|
| Pokemon Cries | PokeAPI sprites repo: `sprites/pokemon/cries/` (if available) or Pokemon Showdown's audio | Showdown stores cries at `play.pokemonshowdown.com/audio/cries/` |
| Battle Music | Fan remixes on YouTube/SoundCloud (search "Pokemon FRLG battle theme remix 8-bit") | Need to find royalty-free or Creative Commons remixes |
| Town BGM | Similarly fan remixes | Search "Pallet Town remix" etc. |
| SFX (menu, hit, level up) | Pokemon Essentials `Audio/SE/` folder | Standard Pokemon sound effects |
| Move SFX | BellBlitzKing's Pokemon Sound Effects Pack (referenced in the Gen 9 Animation Project) | Covers Gen 1-7 attack SFX |

**Pokemon Showdown Audio** (not included in their GitHub repo for size reasons):
- Cries: `https://play.pokemonshowdown.com/audio/cries/{pokemon-name}.mp3`
- Example: `https://play.pokemonshowdown.com/audio/cries/charizard.mp3`
- These can be downloaded for all 151 Pokemon with a simple script

---

## 7. Miscellaneous Resources

### Community Resources

| Resource | URL | Use |
|----------|-----|-----|
| Bulbapedia Mechanics | https://bulbapedia.bulbagarden.net/wiki/Damage | Authoritative reference for damage formulas, type chart, mechanics per generation |
| Showdown Damage Calculator | https://calc.pokemonshowdown.com/ | Verify damage calc implementation against known-good results |
| PokeAPI Docs | https://pokeapi.co/docs/v2 | API endpoint documentation — describes the JSON structure of each resource |
| Tiled Map Editor | https://www.mapeditor.org/ | Free download, the map editor we're using |
| Phaser 3 Docs | https://phaser.io/docs | Phaser API reference |
| Phaser 3 Examples | https://labs.phaser.io/ | Hundreds of runnable examples for every Phaser feature |
| Phaser + Tiled Tutorial | https://medium.com/@michaelwesthadley/modular-game-worlds-in-phaser-3-tilemaps-1-958fc7e6bbd6 | Excellent guide for Pokemon-style top-down tilemaps in Phaser 3 |

### Fan Game Examples in Phaser

| Project | URL | Notes |
|---------|-----|-------|
| pokemon-phaser | https://github.com/konato-debug/pokemon-phaser | Simple Pokemon-inspired game in Phaser 3. Basic but functional reference. |
| PokemonClone | https://github.com/boxerbomb/PokemonClone | PhaserJS Pokemon clone with Tiled maps, encounters, battles. |

---

## Quick Start Checklist

When you're ready to start building, ensure you have:

- [ ] **PokeAPI/api-data** cloned → `tools/repos/api-data/`
- [ ] **PokeAPI/sprites** cloned → `tools/repos/sprites/`
- [ ] **PokeAPI/pokeapi** cloned (CSV fallback) → `tools/repos/pokeapi-csv/`
- [ ] **Pokemon Essentials** downloaded → extract `Graphics/Tilesets/` and `Graphics/Characters/` to `tools/repos/essentials-assets/`
- [ ] **smogon/pokemon-showdown-client** cloned → `tools/repos/showdown-client/` (animation reference)
- [ ] **smogon/pokemon-showdown** cloned → `tools/repos/showdown-server/` (battle mechanics reference)
- [ ] **Tiled Map Editor** installed from https://www.mapeditor.org/
- [ ] Tilesets imported into Tiled as `.tsx` files
- [ ] Node.js 20+ and npm installed
