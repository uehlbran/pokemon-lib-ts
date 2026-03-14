# Pokemon Fan Game — Asset Pipeline

> Covers battle sprites, tilesets, move animations, data sources (PokeAPI api-data + CSV), and local repo structure.

---

## 4. Asset Pipeline

### Battle Sprites

**Primary Source**: `https://github.com/PokeAPI/sprites` (installable via npm)

This repo contains ALL Pokemon sprites organized by numeric ID, which maps directly to PokeAPI data. It includes the Smogon/Showdown BW-style sprites with full Gen 1-9 coverage.

**Setup**:
```bash
npm install github:PokeAPI/sprites
# OR clone directly:
git clone --depth 1 https://github.com/PokeAPI/sprites.git tools/sprites
```

**Sprite folders we use**:

| Asset | Path in Repo | Naming | Format |
|-------|-------------|--------|--------|
| Front sprites (default) | `sprites/pokemon/{id}.png` | `1.png`, `6.png`, `151.png` | PNG |
| Back sprites | `sprites/pokemon/back/{id}.png` | `1.png`, `6.png` | PNG |
| Shiny front | `sprites/pokemon/shiny/{id}.png` | `1.png`, `6.png` | PNG |
| Shiny back | `sprites/pokemon/back/shiny/{id}.png` | `1.png`, `6.png` | PNG |
| Showdown animated (front) | `sprites/pokemon/other/showdown/{id}.gif` | `1.gif`, `6.gif` | GIF |
| Showdown animated (back) | `sprites/pokemon/other/showdown/back/{id}.gif` | `1.gif`, `6.gif` | GIF |
| Showdown shiny (front) | `sprites/pokemon/other/showdown/shiny/{id}.gif` | `1.gif`, `6.gif` | GIF |
| Showdown shiny (back) | `sprites/pokemon/other/showdown/back/shiny/{id}.gif` | `1.gif`, `6.gif` | GIF |
| Official artwork | `sprites/pokemon/other/official-artwork/{id}.png` | `1.png`, `6.png` | PNG |
| Home renders | `sprites/pokemon/other/home/{id}.png` | `1.png`, `6.png` | PNG |

**Why this repo instead of scraping Showdown's live server**:
- **Numeric ID naming** ties directly to PokeAPI data — no name-to-file mapping
- **Installable via npm** — stays in the dependency tree
- **One repo, all variants** — every generation's sprites, showdown GIFs, Home renders, official art
- **Maintained by PokeAPI team** — IDs guaranteed to match the data API

**Alternate sprites from Showdown live server** (`play.pokemonshowdown.com/sprites/`):

The Showdown server has the same sprites but uses **name-based** file naming (`charizard.png` instead of `6.png`) and has additional assets (trainer sprites, item icons, type badges) not in the PokeAPI sprites repo. Use this as a supplementary source:

| Asset | Source | Naming |
|-------|--------|--------|
| Trainer battle sprites | `play.pokemonshowdown.com/sprites/trainers/` | `youngster.png`, `bugcatcher.png` |
| Item icons | `play.pokemonshowdown.com/sprites/itemicons/` | Item sprite sheet |
| Type badge icons | `play.pokemonshowdown.com/sprites/types/` | `Normal.png`, `Fire.png` |

**Form/variant naming in PokeAPI sprites repo**:
- Base form: `{id}.png` (e.g., `6.png` = Charizard)
- Mega: `{id}-mega.png` or `{id}-mega-x.png` / `{id}-mega-y.png`
- Gigantamax: `{id}-gmax.png` (may vary — Claude Code should verify)
- Alolan: Forms use different IDs in PokeAPI (e.g., Alolan Meowth = `10109.png`)
- Gender variants: `{id}-f.png` for female where applicable

**Sprite Dimensions**: Default sprites are 96x96 pixels on transparent background.

### Sprite Loading Strategy

Copy sprites from the repo into `public/assets/pokemon/` during the build/setup step, renaming as needed. In `BootScene.ts`, load all Gen 1 sprites (IDs 1-151, ~600 files across 4 variants). Total size ~2-5 MB.

```typescript
// Sprite key convention using numeric IDs: pokemon-{id}-{variant}
// Examples:
//   "pokemon-6-front"        → sprites/pokemon/6.png
//   "pokemon-6-back"         → sprites/pokemon/back/6.png
//   "pokemon-6-front-shiny"  → sprites/pokemon/shiny/6.png
//   "pokemon-6-back-shiny"   → sprites/pokemon/back/shiny/6.png
//
// Loader helper:
for (let id = 1; id <= 151; id++) {
  this.load.image(`pokemon-${id}-front`, `assets/pokemon/front/${id}.png`);
  this.load.image(`pokemon-${id}-back`, `assets/pokemon/back/${id}.png`);
  this.load.image(`pokemon-${id}-front-shiny`, `assets/pokemon/front-shiny/${id}.png`);
  this.load.image(`pokemon-${id}-back-shiny`, `assets/pokemon/back-shiny/${id}.png`);
}
```

### Overworld Assets (Phase 4 — Future)

These are NOT needed for the initial build phases:
- **Tilesets**: From Spriters Resource (FRLG or HGSS style). 16x16 tile grid.
- **Player sprite**: 4-direction walking spritesheet (32x32 per frame, 4 frames per direction)
- **NPC sprites**: Same format as player sprite

### Move / Attack Animations

There is no single sprite-sheet repository for all Pokémon move animations. Pokémon Showdown (the gold standard for web-based battles) does all move animations **procedurally in code** — using tweens, particles, color overlays, and sprite transforms. The animation definitions live in `battle-animations-moves.ts` in the Showdown client repo.

**Our approach: Tiered animation system** — start simple, improve over time. No phase is blocked by animations.

#### Tier 1: Generic Procedural Animations (implement in Phase 5)

Every move gets an animation based on its **category** and **type** — zero custom assets needed.

```typescript
// src/battle-ui/BattleAnimations.ts

interface MoveAnimationConfig {
  category: 'physical' | 'special' | 'status';
  type: PokemonType;
  moveId: string;  // For Tier 3 overrides
}

// Tier 1 generic animations:
// PHYSICAL: Attacker slides toward target → target shakes → slide back
// SPECIAL:  Type-colored particle burst spawns at attacker → travels to target → target flashes
// STATUS:   Screen dims briefly → status icon appears on target → fade back

// Type determines particle/flash color:
const TYPE_COLORS: Record<PokemonType, number> = {
  normal: 0xA8A878,   fire: 0xF08030,    water: 0x6890F0,
  electric: 0xF8D030, grass: 0x78C850,   ice: 0x98D8D8,
  fighting: 0xC03028, poison: 0xA040A0,  ground: 0xE0C068,
  flying: 0xA890F0,   psychic: 0xF85888, bug: 0xA8B820,
  rock: 0xB8A038,     ghost: 0x705898,   dragon: 0x7038F8,
  dark: 0x705848,     steel: 0xB8B8D0,   fairy: 0xEE99AC,
};
```

This covers 100% of moves immediately. It won't look amazing, but it looks functional — similar to how early Pokémon Essentials fan games handle animations.

#### Tier 2: Type-Specific Animation Templates (post-v1 polish)

Create ~18 reusable animation templates, one per type, with simple particle effects:

| Type | Animation |
|------|-----------|
| Fire | Flame particles rise from target, orange screen tint |
| Water | Blue droplets splash on target, ripple effect |
| Electric | Yellow lightning bolt zigzags to target, flash |
| Grass | Green leaf particles swirl around target |
| Ice | White/blue shards rain on target, frost overlay |
| Ground | Screen shakes, brown dust particles rise |
| Psychic | Purple wave pulses outward from attacker |
| Ghost | Dark shadow creeps along ground to target |
| ... | (similar for all 18 types) |

These can be built using Phaser's built-in particle system (`Phaser.GameObjects.Particles`) and tweens. No external assets required — just code.

#### Tier 3: Per-Move Animations (long-term / reference from Showdown)

For signature moves or highly recognizable attacks, create unique animations. The best reference is Pokémon Showdown's client source:

**Source**: `https://github.com/smogon/pokemon-showdown-client`
**Key file**: `play.pokemonshowdown.com/src/battle-animations-moves.ts`

This TypeScript file contains animation definitions for every move in the game. Each animation is a function that uses Showdown's animation API (tweens, particles, sprites). While we can't directly copy-paste these (Showdown uses its own rendering engine, not Phaser), they serve as an excellent reference for what each move's animation should look like.

For v1, Tier 1 is sufficient. Tier 2 is a polish pass. Tier 3 is an ongoing effort that can happen gradually — add custom animations for the most common/iconic moves first (Thunderbolt, Flamethrower, Surf, Earthquake, etc.) and let the generic system handle the rest.

#### Animation System Architecture

```typescript
// src/battle-ui/BattleAnimations.ts

class BattleAnimations {
  private scene: Phaser.Scene;
  private customAnimations: Map<string, MoveAnimationFn>;  // moveId → custom animation

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.customAnimations = new Map();
    this.registerCustomAnimations();  // Tier 3 overrides
  }

  // Main entry point — called by BattleSceneRenderer when a move is used
  async playMoveAnimation(
    config: MoveAnimationConfig,
    attacker: Phaser.GameObjects.Sprite,
    defender: Phaser.GameObjects.Sprite
  ): Promise<void> {
    // Check for Tier 3 custom animation first
    const custom = this.customAnimations.get(config.moveId);
    if (custom) {
      return custom(this.scene, attacker, defender, config);
    }

    // Fall back to Tier 2 type template (when implemented)
    // Fall back to Tier 1 generic animation
    return this.playGenericAnimation(config, attacker, defender);
  }

  private async playGenericAnimation(...): Promise<void> { /* Tier 1 */ }
  private registerCustomAnimations(): void { /* Tier 3 overrides */ }
}

type MoveAnimationFn = (
  scene: Phaser.Scene,
  attacker: Phaser.GameObjects.Sprite,
  defender: Phaser.GameObjects.Sprite,
  config: MoveAnimationConfig
) => Promise<void>;
```

---

### Local Repository Structure

You've downloaded the PokeAPI repos locally. Here's where they should live in the project and how Claude Code should reference them:

```
pokemon-fan-game/
├── tools/
│   ├── repos/                          # Downloaded external repos (gitignored)
│   │   ├── api-data/                   # PokeAPI/api-data — pre-joined JSON
│   │   │   └── data/api/v2/
│   │   │       ├── pokemon/            # pokemon/{id}/index.json
│   │   │       ├── pokemon-species/    # pokemon-species/{id}/index.json
│   │   │       ├── move/              # move/{id}/index.json
│   │   │       ├── ability/           # ability/{id}/index.json
│   │   │       ├── type/             # type/{id}/index.json
│   │   │       ├── item/             # item/{id}/index.json
│   │   │       ├── nature/           # nature/{id}/index.json
│   │   │       ├── evolution-chain/  # evolution-chain/{id}/index.json
│   │   │       └── growth-rate/      # growth-rate/{id}/index.json
│   │   │
│   │   ├── sprites/                    # PokeAPI/sprites — all Pokemon sprites
│   │   │   └── sprites/pokemon/
│   │   │       ├── {id}.png            # Front default (1.png, 2.png, ...)
│   │   │       ├── back/{id}.png       # Back sprites
│   │   │       ├── shiny/{id}.png      # Shiny front
│   │   │       ├── back/shiny/{id}.png # Shiny back
│   │   │       └── other/
│   │   │           ├── showdown/       # Animated GIFs
│   │   │           ├── official-artwork/
│   │   │           └── home/           # Pokemon Home renders
│   │   │
│   │   ├── pokeapi-csv/                # PokeAPI/pokeapi CSV files (fallback)
│   │   │   └── data/v2/csv/
│   │   │       ├── pokemon.csv
│   │   │       ├── pokemon_stats.csv
│   │   │       └── ... (~178 files)
│   │   │
│   │   └── showdown-client/            # smogon/pokemon-showdown-client (reference)
│   │       └── play.pokemonshowdown.com/src/
│   │           └── battle-animations-moves.ts  # Move animation reference
│   │
│   └── data-importer/                  # Import scripts that read from repos/
│       ├── importPokemon.ts
│       ├── importMoves.ts
│       ├── importAbilities.ts
│       ├── importItems.ts
│       └── copySprites.ts             # Copies sprites from repos/ → public/assets/
│
├── public/assets/                      # Final game assets (copied from repos by scripts)
│   ├── pokemon/
│   │   ├── front/{id}.png
│   │   ├── back/{id}.png
│   │   ├── front-shiny/{id}.png
│   │   └── back-shiny/{id}.png
│   ├── trainers/
│   ├── itemicons/
│   ├── types/
│   └── ...
```

**The `tools/repos/` directory should be gitignored** — these are large external repos that each developer downloads locally. The import scripts read from `tools/repos/` and output to `src/data/` (JSON) and `public/assets/` (sprites). The output files ARE committed to version control.

**NPM scripts for asset pipeline**:
```json
{
  "scripts": {
    "setup:sprites": "tsx tools/data-importer/copySprites.ts",
    "import:all": "tsx tools/data-importer/importPokemon.ts && tsx tools/data-importer/importMoves.ts && tsx tools/data-importer/importAbilities.ts && tsx tools/data-importer/importItems.ts",
    "setup:all": "npm run import:all && npm run setup:sprites",
    "validate:data": "vitest run tests/data/"
  }
}
```

---

There are TWO data sources from PokeAPI. Use **Option A** (preferred) unless you hit issues, then fall back to **Option B**.

#### Option A: `api-data` Repo (PREFERRED — Pre-Joined JSON)

**Source**: `https://github.com/PokeAPI/api-data`

This repo contains **every PokeAPI endpoint saved as static JSON files**. It's the exact same data the REST API returns, but stored offline. This means the data is already fully joined — no need to parse CSVs and manually link foreign keys.

**Why this is better than CSVs**: Instead of joining 6+ CSV tables to build one Pokemon's data, you read a single JSON file like `data/api/v2/pokemon/6/index.json` and get Charizard's complete data — stats, types, abilities, moves, everything — already assembled.

**Setup**:
```bash
# Clone just the data directory (it's large — thousands of JSON files)
git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/api-data.git tools/api-data
cd tools/api-data
git sparse-checkout set data/api/v2/pokemon data/api/v2/pokemon-species data/api/v2/move data/api/v2/ability data/api/v2/item data/api/v2/type data/api/v2/nature data/api/v2/evolution-chain data/api/v2/growth-rate
```

**File structure**:
```
tools/api-data/data/api/v2/
├── pokemon/
│   ├── 1/index.json          # Bulbasaur — full data (stats, types, abilities, moves, sprites)
│   ├── 2/index.json          # Ivysaur
│   ├── ...
│   └── 151/index.json        # Mew
├── pokemon-species/
│   ├── 1/index.json          # Bulbasaur species (evolution chain, catch rate, gender ratio, growth rate, egg groups)
│   └── ...
├── move/
│   ├── 1/index.json          # Pound — full move data (power, accuracy, PP, type, category, effect, flags)
│   └── ...
├── ability/
│   ├── 1/index.json          # Stench — full ability data (effect description, Pokemon that have it)
│   └── ...
├── type/
│   ├── 1/index.json          # Normal — damage relations (super effective against, resists, immune to)
│   └── ...
├── item/
│   ├── 1/index.json          # Master Ball
│   └── ...
├── nature/
│   ├── 1/index.json          # Hardy — stat modifiers
│   └── ...
├── evolution-chain/
│   ├── 1/index.json          # Bulbasaur chain
│   └── ...
└── growth-rate/
    ├── 1/index.json          # Slow
    └── ...
```

**Key JSON structures** (matching the PokeAPI docs at pokeapi.co/docs/v2):

**Pokemon endpoint** (`pokemon/{id}/index.json`):
- `id`, `name`, `height`, `weight`, `base_experience`
- `stats[]`: `{ base_stat, effort, stat: { name } }` — base stats + EV yield
- `types[]`: `{ slot, type: { name } }` — types
- `abilities[]`: `{ ability: { name }, is_hidden, slot }` — abilities
- `moves[]`: `{ move: { name }, version_group_details[]: { level_learned_at, move_learn_method: { name }, version_group: { name } } }` — full learnset with learn method and version
- `sprites`: sprite URLs (we don't use these — we use Showdown sprites)

**Pokemon Species endpoint** (`pokemon-species/{id}/index.json`):
- `capture_rate` — catch rate
- `gender_rate` — gender ratio (-1 = genderless, 0-8 scale)
- `growth_rate: { name }` — EXP group
- `egg_groups[]` — egg groups
- `evolution_chain: { url }` — link to evolution chain
- `genera[]` — species classification (filter language.name = "en")
- `names[]` — display names (filter language.name = "en")

**Move endpoint** (`move/{id}/index.json`):
- `id`, `name`, `power`, `pp`, `accuracy`, `priority`
- `type: { name }` — move type
- `damage_class: { name }` — "physical", "special", or "status"
- `target: { name }` — targeting type
- `effect_entries[]` — effect description (filter language.name = "en")
- `effect_chance` — % chance for secondary effect
- `meta`: `{ ailment, min_hits, max_hits, drain, healing, crit_rate, ailment_chance, flinch_chance, stat_chance }`

**Type endpoint** (`type/{id}/index.json`):
- `damage_relations`: `{ double_damage_to[], half_damage_to[], no_damage_to[], double_damage_from[], half_damage_from[], no_damage_from[] }` — full type chart

**Importer strategy with api-data**:
1. Read `pokemon/{id}/index.json` for ids 1-151
2. Read corresponding `pokemon-species/{id}/index.json` for each
3. Merge the two into our `PokemonSpeciesData` schema
4. Read referenced `evolution-chain/{id}/index.json` for evolution data
5. Read `move/{id}/index.json` for each unique move referenced in learnsets
6. Read `ability/{id}/index.json` for each unique ability
7. Read all 18 `type/{id}/index.json` files to build the type chart
8. Read `nature/{id}/index.json` for ids 1-25
9. Read `item/{id}/index.json` for relevant items
10. Transform everything into our game's JSON schemas and write to `src/data/`

This is significantly simpler than CSV parsing — each file is already a rich, self-contained object.

---

#### Option B: CSV Files (Fallback)

**Source**: `https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv`

Use this if the api-data repo has issues, or if you need data that isn't exposed through the API endpoints. The CSVs are a normalized database dump (~178 files) that requires joining tables by foreign keys.

**Setup**: Clone or download the CSV directory into `tools/data-importer/csv/`:
```bash
# In the project root
git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi.git tools/pokeapi-data
cd tools/pokeapi-data
git sparse-checkout set data/v2/csv
# CSVs now at tools/pokeapi-data/data/v2/csv/
```

**Importer approach**: Claude Code should write TypeScript scripts (`tools/data-importer/`) that read the CSVs, join them by foreign key IDs, filter to the data we need, and output our game JSON files. Use `papaparse` or Node's built-in `fs` + simple CSV parsing (these files are clean, no edge cases).

#### CSV Files → Our JSON Mapping

**For `pokemon.json` (species data):**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `pokemon.csv` | `id,identifier,species_id,height,weight,base_experience,order,is_default` | Pokemon ID, name, height, weight, base EXP. Filter `is_default=1` for base forms. |
| `pokemon_species.csv` | `id,identifier,generation_id,evolves_from_species_id,evolution_chain_id,color_id,shape_id,habitat_id,gender_rate,capture_rate,base_happiness,is_baby,hatch_counter,has_gender_differences,growth_rate_id,forms_switchable,is_legendary,is_mythical,order,conquest_order` | Gender ratio (`gender_rate`: -1=genderless, 0=always male, 8=always female, value/8=female ratio), catch rate (`capture_rate`), growth rate group (`growth_rate_id`), evolution chain. |
| `pokemon_stats.csv` | `pokemon_id,stat_id,base_stat,effort` | Base stats (stat_id: 1=HP, 2=Atk, 3=Def, 4=SpAtk, 5=SpDef, 6=Speed) and EV yield (`effort`). |
| `pokemon_types.csv` | `pokemon_id,type_id,slot` | Types (slot 1=primary, slot 2=secondary). Join with `types.csv` for type names. |
| `pokemon_abilities.csv` | `pokemon_id,ability_id,is_hidden,slot` | Abilities. `is_hidden=1` for hidden ability. Join with `abilities.csv` for ability names. |
| `pokemon_moves.csv` | `pokemon_id,version_group_id,move_id,pokemon_move_method_id,level,order` | Learnsets. `pokemon_move_method_id`: 1=level-up, 2=egg, 3=tutor, 4=TM/HM. Filter by latest `version_group_id` for Gen 9 data (id=25 for scarlet-violet or latest available). |
| `pokemon_species_names.csv` | `pokemon_species_id,local_language_id,name,genus` | Display names. Filter `local_language_id=9` for English. |
| `evolution_chains.csv` | `id,baby_trigger_item_id` | Evolution chain IDs. |
| `pokemon_evolution.csv` | `id,evolved_species_id,evolution_trigger_id,trigger_item_id,minimum_level,gender_id,location_id,held_item_id,time_of_day,known_move_id,known_move_type_id,minimum_happiness,minimum_beauty,minimum_affection,relative_physical_stats,party_species_id,party_type_id,trade_species_id,needs_overworld_rain,turn_upside_down` | Evolution requirements. `evolution_trigger_id`: 1=level-up, 2=trade, 3=use-item, 4=shed. |
| `growth_rates.csv` | `id,identifier,formula` | EXP group names (fast, medium-fast, etc.). |
| `egg_groups.csv` + `pokemon_egg_groups.csv` | Join for egg group membership. |

**For `moves.json`:**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `moves.csv` | `id,identifier,generation_id,type_id,power,pp,accuracy,priority,target_id,damage_class_id,effect_id,effect_chance,contest_type_id,contest_effect_id,super_contest_effect_id` | Move ID, name, type, power, PP, accuracy, priority, target, category (`damage_class_id`: 1=status, 2=physical, 3=special). |
| `move_names.csv` | `move_id,local_language_id,name` | Display names. Filter `local_language_id=9`. |
| `move_flag_map.csv` | `move_id,move_flag_id` | Move flags (contact, sound, punch, etc.). Join with `move_flags.csv` for flag names. |
| `move_flags.csv` | `id,identifier` | Flag identifiers. |
| `move_effect_prose.csv` | `move_effect_id,local_language_id,short_effect,effect` | Effect descriptions. Filter `local_language_id=9`. |
| `move_meta.csv` | `move_id,meta_category_id,meta_ailment_id,min_hits,max_hits,min_turns,max_turns,drain,healing,crit_rate,ailment_chance,flinch_chance,stat_chance` | Detailed move metadata — multi-hit ranges, drain %, healing %, status chance, flinch chance. |
| `move_meta_stat_changes.csv` | `move_id,stat_id,change` | Stat stage changes caused by moves. |
| `move_targets.csv` | `id,identifier` | Target type identifiers. |
| `move_damage_classes.csv` | `id,identifier` | 1=status, 2=physical, 3=special. |

**For `abilities.json`:**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `abilities.csv` | `id,identifier,generation_id,is_main_series` | Ability ID and name. |
| `ability_names.csv` | `ability_id,local_language_id,name` | Display names. Filter `local_language_id=9`. |
| `ability_prose.csv` | `ability_id,local_language_id,short_effect,effect` | Descriptions. Filter `local_language_id=9`. |

**For `items.json`:**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `items.csv` | `id,identifier,category_id,cost,fling_power,fling_effect_id` | Item ID, name, category, buy price. |
| `item_names.csv` | `item_id,local_language_id,name` | Display names. Filter `local_language_id=9`. |
| `item_prose.csv` | `item_id,local_language_id,short_effect,effect` | Descriptions. Filter `local_language_id=9`. |
| `item_categories.csv` | `id,pocket_id,identifier` | Item category → pocket mapping. |
| `item_pockets.csv` | `id,identifier` | Bag pocket names. |

**For `typeChart.json`:**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `types.csv` | `id,identifier,generation_id,damage_class_id` | Type IDs and names. |
| `type_efficacy.csv` | `damage_type_id,target_type_id,damage_factor` | Effectiveness matrix. `damage_factor`: 200=super effective, 100=neutral, 50=not very effective, 0=immune. |

**For `natures.json`:**

| CSV File | Columns (header row) | What We Need |
|----------|---------------------|--------------|
| `natures.csv` | `id,identifier,decreased_stat_id,increased_stat_id,hates_flavor_id,likes_flavor_id,game_index` | Nature name, which stat is boosted/reduced. Stat IDs: 1=HP, 2=Atk, 3=Def, 4=SpAtk, 5=SpDef, 6=Speed. |

#### Reference / Lookup Tables

| CSV File | Purpose |
|----------|---------|
| `types.csv` | Type ID → name mapping (1=normal, 2=fighting, 3=flying...) |
| `stats.csv` | Stat ID → name mapping (1=hp, 2=attack, 3=defense...) |
| `languages.csv` | Language ID → name (9=English) |
| `version_groups.csv` | Version group ID → game generation mapping |
| `move_learn_methods.csv` | Method ID → name (1=level-up, 2=egg, 3=tutor, 4=machine) |

#### CSV Files to IGNORE

These are not needed for our game:
- All `*_flavor_text.csv` files (we write our own descriptions or use short_effect)
- All contest-related CSVs (`contest_*`, `super_contest_*`)
- `pokemon_form_pokeathlon_stats.csv`
- `pal_park_*` CSVs
- `encounter_*` CSVs (we define our own encounter tables)
- `location_*` CSVs (we define our own maps)
- `berry_*` CSVs (can add later if berries are needed)
- `machine*.csv` (TM/HM mappings — can derive from pokemon_moves)
- All non-English language rows (filter `local_language_id=9`)

#### Importer Script Strategy

Each importer script should:
1. Read the relevant CSVs using simple line-by-line parsing
2. Build lookup maps (type ID → name, stat ID → name, etc.)
3. Join tables by foreign keys
4. Filter to Gen 1 Pokemon (species ID 1-151) or all Pokemon depending on scope
5. Transform into our game's JSON schema (defined in Section 5)
6. Write to `src/data/{filename}.json`
7. Log counts: "Imported 151 Pokemon, 165 moves, 76 abilities, 200 items"

```bash
npm run import:all    # Runs all importers sequentially
npm run validate:data # Verifies JSON integrity + cross-references
```

This populates `src/data/` with all JSON files. These are checked into version control — they don't change at runtime.

---

