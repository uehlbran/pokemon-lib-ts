# Pokemon Fan Game — Build Phases

> Phase 0 (bootstrap) through Phase 8 (transformation stubs), with exit criteria for each.

---

## 14. Build Phases

### Phase 0: Bootstrap — Automated Setup (run FIRST)

Claude Code should run this setup before anything else. It clones all required external repos, copies assets into the right locations, and verifies everything is in place.

**Bootstrap script** — Claude Code should create and run `tools/bootstrap.sh`:

```bash
#!/bin/bash
set -e

echo "=== Pokemon Fan Game — Project Bootstrap ==="
echo ""

# Create directory structure
mkdir -p tools/repos
mkdir -p public/assets/pokemon/front
mkdir -p public/assets/pokemon/back
mkdir -p public/assets/pokemon/front-shiny
mkdir -p public/assets/pokemon/back-shiny
mkdir -p public/assets/items
mkdir -p public/assets/types
mkdir -p public/assets/trainers
mkdir -p public/assets/tilesets
mkdir -p public/assets/maps
mkdir -p public/assets/characters
mkdir -p public/assets/ui
mkdir -p public/assets/audio/bgm
mkdir -p public/assets/audio/sfx
mkdir -p public/assets/audio/cries
mkdir -p src/data
mkdir -p src/data/cutscenes
mkdir -p tests/battle
mkdir -p tests/entities
mkdir -p tests/data
mkdir -p tests/utils
mkdir -p tools/data-importer

# ============================================================
# 1. Clone PokeAPI api-data (pre-joined JSON — primary data source)
# ============================================================
if [ ! -d "tools/repos/api-data" ]; then
  echo "Cloning PokeAPI/api-data (sparse — only the endpoints we need)..."
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/PokeAPI/api-data.git tools/repos/api-data
  cd tools/repos/api-data
  git sparse-checkout set \
    data/api/v2/pokemon \
    data/api/v2/pokemon-species \
    data/api/v2/move \
    data/api/v2/ability \
    data/api/v2/type \
    data/api/v2/item \
    data/api/v2/nature \
    data/api/v2/evolution-chain \
    data/api/v2/growth-rate \
    data/api/v2/item-category \
    data/api/v2/item-pocket \
    data/api/v2/egg-group \
    data/api/v2/move-damage-class \
    data/api/v2/move-target \
    data/api/v2/move-learn-method \
    data/api/v2/stat
  cd ../../..
  echo "✓ api-data cloned"
else
  echo "✓ api-data already present"
fi

# ============================================================
# 2. Clone PokeAPI sprites (all Pokemon sprites)
# ============================================================
if [ ! -d "tools/repos/sprites" ]; then
  echo "Cloning PokeAPI/sprites (sparse — only pokemon sprites + items)..."
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/PokeAPI/sprites.git tools/repos/sprites
  cd tools/repos/sprites
  git sparse-checkout set \
    sprites/pokemon \
    sprites/items
  cd ../../..
  echo "✓ sprites cloned"
else
  echo "✓ sprites already present"
fi

# ============================================================
# 3. Clone PokeAPI CSV data (fallback data source)
# ============================================================
if [ ! -d "tools/repos/pokeapi-csv" ]; then
  echo "Cloning PokeAPI/pokeapi (sparse — CSV files only)..."
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/PokeAPI/pokeapi.git tools/repos/pokeapi-csv
  cd tools/repos/pokeapi-csv
  git sparse-checkout set data/v2/csv
  cd ../../..
  echo "✓ pokeapi CSV data cloned"
else
  echo "✓ pokeapi CSV data already present"
fi

# ============================================================
# 4. Clone Showdown client (move animation reference)
# ============================================================
if [ ! -d "tools/repos/showdown-client" ]; then
  echo "Cloning smogon/pokemon-showdown-client (sparse — animation source only)..."
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/smogon/pokemon-showdown-client.git tools/repos/showdown-client
  cd tools/repos/showdown-client
  git sparse-checkout set \
    play.pokemonshowdown.com/src
  cd ../../..
  echo "✓ showdown-client cloned"
else
  echo "✓ showdown-client already present"
fi

# ============================================================
# 5. Clone Showdown server (battle mechanics reference)
# ============================================================
if [ ! -d "tools/repos/showdown-server" ]; then
  echo "Cloning smogon/pokemon-showdown (sparse — data + sim only)..."
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/smogon/pokemon-showdown.git tools/repos/showdown-server
  cd tools/repos/showdown-server
  git sparse-checkout set \
    data \
    sim
  cd ../../..
  echo "✓ showdown-server cloned"
else
  echo "✓ showdown-server already present"
fi

# ============================================================
# 6. Copy battle sprites to public/assets/
# ============================================================
echo "Copying Pokemon battle sprites (Gen 1, IDs 1-151)..."
for id in $(seq 1 151); do
  # Front sprites
  if [ -f "tools/repos/sprites/sprites/pokemon/${id}.png" ]; then
    cp "tools/repos/sprites/sprites/pokemon/${id}.png" "public/assets/pokemon/front/${id}.png"
  fi
  # Back sprites
  if [ -f "tools/repos/sprites/sprites/pokemon/back/${id}.png" ]; then
    cp "tools/repos/sprites/sprites/pokemon/back/${id}.png" "public/assets/pokemon/back/${id}.png"
  fi
  # Shiny front
  if [ -f "tools/repos/sprites/sprites/pokemon/shiny/${id}.png" ]; then
    cp "tools/repos/sprites/sprites/pokemon/shiny/${id}.png" "public/assets/pokemon/front-shiny/${id}.png"
  fi
  # Shiny back
  if [ -f "tools/repos/sprites/sprites/pokemon/back/shiny/${id}.png" ]; then
    cp "tools/repos/sprites/sprites/pokemon/back/shiny/${id}.png" "public/assets/pokemon/back-shiny/${id}.png"
  fi
done
echo "✓ Battle sprites copied ($(ls public/assets/pokemon/front/ | wc -l) front sprites)"

# ============================================================
# 7. Copy item sprites to public/assets/
# ============================================================
echo "Copying item sprites..."
if [ -d "tools/repos/sprites/sprites/items" ]; then
  cp tools/repos/sprites/sprites/items/*.png public/assets/items/ 2>/dev/null || true
  echo "✓ Item sprites copied ($(ls public/assets/items/ | wc -l) items)"
else
  echo "⚠ Item sprites directory not found — will need manual setup"
fi

# ============================================================
# 8. Verify
# ============================================================
echo ""
echo "=== Verification ==="
echo "api-data:         $([ -d tools/repos/api-data/data/api/v2/pokemon/1 ] && echo '✓ OK' || echo '✗ MISSING')"
echo "sprites:          $([ -f tools/repos/sprites/sprites/pokemon/1.png ] && echo '✓ OK' || echo '✗ MISSING')"
echo "pokeapi CSV:      $([ -f tools/repos/pokeapi-csv/data/v2/csv/pokemon.csv ] && echo '✓ OK' || echo '✗ MISSING')"
echo "showdown-client:  $([ -d tools/repos/showdown-client/play.pokemonshowdown.com/src ] && echo '✓ OK' || echo '✗ MISSING')"
echo "showdown-server:  $([ -d tools/repos/showdown-server/data ] && echo '✓ OK' || echo '✗ MISSING')"
echo ""
echo "Front sprites:    $(ls public/assets/pokemon/front/ 2>/dev/null | wc -l) files"
echo "Back sprites:     $(ls public/assets/pokemon/back/ 2>/dev/null | wc -l) files"
echo "Shiny front:      $(ls public/assets/pokemon/front-shiny/ 2>/dev/null | wc -l) files"
echo "Shiny back:       $(ls public/assets/pokemon/back-shiny/ 2>/dev/null | wc -l) files"
echo "Item sprites:     $(ls public/assets/items/ 2>/dev/null | wc -l) files"
echo ""
echo "=== Bootstrap Complete ==="
```

**Add to .gitignore**:
```
# External repos (large, each dev downloads locally)
tools/repos/
```

**What this does NOT download** (requires manual setup by you):
- **Tilesets**: Download Pokemon Essentials from https://reliccastle.com/essentials/ or https://github.com/Maruno17/pokemon-essentials and copy `Graphics/Tilesets/` and `Graphics/Characters/` to `public/assets/tilesets/` and `public/assets/characters/`. See the Resources doc for details.
- **Audio**: Cries, BGM, and SFX need to be sourced separately (Phase 7). See Resources doc.

**Exit criteria**: All 5 repos cloned. 151 front/back/shiny sprites in `public/assets/`. Item sprites copied. Verification shows all ✓.

---

### Phase 1: Project Foundation (est. 1-2 sessions)
- [ ] Scaffold Phaser + TypeScript + Vite project
- [ ] Configure tsconfig, vite.config, vitest.config
- [ ] Set up path aliases
- [ ] Create `index.html` with Phaser game mount
- [ ] Create `main.ts` with basic Phaser game config
- [ ] Create `BootScene` that shows "Loading..." text
- [ ] Verify `npm run dev`, `npm run typecheck`, `npm run test` all work
- [ ] Create all type definition files (`src/types/*.ts`)
- [ ] Create EventBus system
- [ ] Create SeededRandom utility
- [ ] Create DataManager (stub with hardcoded data for 1-3 Pokemon)

**Exit criteria**: `npm run dev` opens a browser window with a Phaser game. `npm run test` runs and passes. `npm run typecheck` passes.

### Phase 2: Data Pipeline (est. 2-3 sessions)
- [ ] Write PokeAPI importer for Pokemon species (Gen 1, IDs 1-151)
- [ ] Write PokeAPI importer for moves (all moves learnable by Gen 1 Pokemon)
- [ ] Write PokeAPI importer for abilities (all abilities of Gen 1 Pokemon)
- [ ] Write PokeAPI importer for items
- [ ] Create natures.json (manual — only 25 entries)
- [ ] Create typeChart.json (manual or imported)
- [ ] Create experienceGroups.json
- [ ] Write data validation tests
- [ ] DataManager loads all JSON and provides typed access

**Exit criteria**: `npm run import:all` produces valid JSON files. `npm run validate:data` passes. DataManager can retrieve any Gen 1 Pokemon's full data.

### Phase 3: Pokemon & Party System (est. 2-3 sessions)
- [ ] Pokemon instance creation (generate from species + level)
- [ ] Stat calculation (HP, all stats with IVs, EVs, nature)
- [ ] Level/EXP system
- [ ] Party management (add, remove, reorder, up to 6)
- [ ] PartyScene UI (view party, select Pokemon, see summary)
- [ ] SummaryScene UI (stats, moves, held item)
- [ ] Download and organize Gen5 sprites from Showdown
- [ ] Load and display Pokemon sprites in scenes

**Exit criteria**: Can create a team of 6 Pokemon with correct stats. PartyScene displays them with sprites. SummaryScene shows full details.

### Phase 4: Battle Engine Core (est. 4-6 sessions)
- [ ] BattleState interfaces and initial state creation
- [ ] Type chart implementation + tests
- [ ] Damage calculator + tests
- [ ] Turn order resolution + tests
- [ ] Move execution (damage moves, stat changes, status infliction)
- [ ] Status conditions (burn damage, paralysis speed, sleep turns, etc.)
- [ ] Stat stages (-6 to +6 with proper multipliers)
- [ ] Abilities (implement at least: Blaze/Torrent/Overgrow, Intimidate, Levitate, Sturdy, Static, Flame Body, Poison Point)
- [ ] Held items in battle (Leftovers, Choice Band/Specs/Scarf, Life Orb, berries)
- [ ] Weather (Rain, Sun, Sand, Snow) + abilities that set them
- [ ] Terrain (Electric, Grassy, Psychic, Misty)
- [ ] Entry hazards (Stealth Rock, Spikes, Toxic Spikes, Sticky Web) + removal
- [ ] Screens (Reflect, Light Screen, Aurora Veil)
- [ ] Switching logic + entry effects
- [ ] AI controller (at least tier 1 and 2)
- [ ] Full battle integration tests

**Exit criteria**: Can run a complete battle between two trainers purely in tests, with correct damage, status, weather, abilities, and turn order. All battle tests pass.

### Phase 5: Battle UI & Rendering (est. 3-4 sessions)
- [ ] BattleScene setup (backgrounds, sprite positions)
- [ ] HP bars (animated, color-coded green/yellow/red)
- [ ] Battle menu (Fight/Bag/Pokemon/Run)
- [ ] Move selection menu (2×2 grid, PP, type)
- [ ] Battle text box with typewriter effect
- [ ] Battle animations (sprite shake for damage, fade for faint, slide for switch)
- [ ] Status icons display
- [ ] Wild encounter flow (grass → battle → return)
- [ ] Trainer battle flow (spot → dialog → battle → victory)
- [ ] Catching flow (ball throw → shakes → catch/fail)
- [ ] EXP bar animation + level up notification
- [ ] Move learning prompt on level up

**Exit criteria**: Can walk into grass, encounter a wild Pokemon, battle it with full UI, catch it or defeat it, gain EXP, and return to overworld.

### Phase 6: Overworld (est. 3-4 sessions)
- [ ] MapManager loads Tiled JSON maps
- [ ] Player sprite on map with grid-based movement
- [ ] Collision detection from collision layer
- [ ] Camera follow with bounds
- [ ] Map transitions (doors, route boundaries)
- [ ] NPC placement from Tiled object layer
- [ ] NPC dialog interaction
- [ ] NPC trainer line-of-sight trigger
- [ ] Wild encounter zones from encounter layer
- [ ] Sign reading
- [ ] Item pickup from map
- [ ] Pokemon Center healing
- [ ] PokeMart shopping

**Exit criteria**: Complete game loop — walk around town, read signs, talk to NPCs, shop at PokeMart, heal at Pokemon Center, walk to a route, encounter wild Pokemon, battle trainers.

### Phase 7: Save/Load & Polish (est. 2-3 sessions)
- [ ] SaveManager implementation
- [ ] Title screen (New Game / Continue)
- [ ] New game flow (name entry → starter selection? or just given a team)
- [ ] Save from menu
- [ ] Load from title screen
- [ ] Bag/inventory system with pockets
- [ ] Item usage (Potions, status heals, Rare Candy, etc.)
- [ ] Pokedex tracking (seen/caught)
- [ ] Audio system (BGM per map, battle music, SFX, cries)
- [ ] Text speed options
- [ ] Bug fixing and polish

**Exit criteria**: Full playable demo — start new game, explore, battle, catch, save, load, continue.

### Phase 8: Transformation Stubs (est. 1-2 sessions)
- [ ] TransformBase abstract class
- [ ] MegaEvolution stub (data wired, UI button placeholder, disabled)
- [ ] Dynamax/Gigantamax stub (data wired, disabled)
- [ ] Terastallize stub (data wired, disabled)

**Exit criteria**: Transformation data exists in pokemon.json. TransformBase interface is tested. Battle engine has hooks for transformations that are disabled.

---

