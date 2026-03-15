# Data Pipeline Specification

## Overview

The data pipeline transforms raw PokeAPI data into generation-specific JSON files that are packaged and shipped with each `@pokemon-lib-ts/genN` npm package. This document specifies:

- How to source PokeAPI data
- The transformation logic for each entity type (Pokemon, moves, abilities, items, types, natures)
- Gen-specific differences and how to handle them
- Validation requirements
- Implementation architecture

**Primary Purpose**: Ensure that the data exported in each gen package accurately reflects what was available in that generation, with appropriate stats, types, mechanics, and features.

---

## Prerequisites

### Data Source Setup

The pipeline uses the **PokeAPI `api-data` repository** as the primary source. Clone it into `tools/repos/api-data/`:

```bash
# From the monorepo root
mkdir -p tools/repos
cd tools/repos
git clone https://github.com/PokeAPI/api-data.git
cd api-data
# This repo contains pre-joined JSON files at: data/api/v2/
```

### Directory Layout

The PokeAPI api-data repo provides JSON files at these paths:

```
tools/repos/api-data/data/api/v2/
├── pokemon/
│   ├── 1/
│   │   └── index.json           # Bulbasaur
│   ├── 2/
│   │   └── index.json           # Ivysaur
│   └── ...
├── pokemon-species/
│   ├── 1/index.json
│   ├── 2/index.json
│   └── ...
├── move/
│   ├── 1/index.json
│   ├── 2/index.json
│   └── ...
├── ability/
│   ├── 1/index.json
│   └── ...
├── type/
│   ├── 1/index.json
│   └── ...
├── item/
│   ├── 1/index.json
│   └── ...
├── nature/
│   ├── 1/index.json
│   └── ...
├── evolution-chain/
│   ├── 1/index.json
│   └── ...
└── growth-rate/
    ├── 1/index.json
    └── ...
```

### Fallback Source

If the PokeAPI api-data repo is unavailable, the pipeline can fall back to CSV files at `tools/repos/pokeapi-csv/data/v2/csv/`. The CSV strategy is less reliable (loses nested data) but may be useful for debugging or partial imports.

---

## Version Group Strategy

PokeAPI organizes game versions into **version groups**, which represent distinct canonical releases. To correctly reconstruct per-generation data, the pipeline must use the appropriate version group for each generation.

### Version Group to Generation Mapping

| Version Group ID | Name | Generation | Canonical? | Usage |
|---|---|---|---|---|
| 1 | red-blue | 1 | ✅ Yes | Use for Gen 1 |
| 2 | yellow | 1 | No (enhanced remake) | Informational only |
| 3 | gold-silver | 2 | ✅ Yes | Use for Gen 2 |
| 4 | crystal | 2 | No (enhanced) | Informational only |
| 5 | ruby-sapphire | 3 | ✅ Yes | Use for Gen 3 |
| 6 | emerald | 3 | No (enhanced) | Informational only |
| 7 | firered-leafgreen | 3 | No (remake) | Informational only |
| 8 | diamond-pearl | 4 | ✅ Yes | Use for Gen 4 |
| 9 | platinum | 4 | No (enhanced) | Informational only |
| 10 | heartgold-soulsilver | 4 | No (remake) | Informational only |
| 11 | black-white | 5 | ✅ Yes | Use for Gen 5 |
| 12 | colosseum | 3 | No (spinoff) | Informational only |
| 13 | xd | 3 | No (spinoff) | Informational only |
| 14 | black-2-white-2 | 5 | No (sequel) | Informational only |
| 15 | x-y | 6 | ✅ Yes | Use for Gen 6 |
| 16 | omega-ruby-alpha-sapphire | 6 | No (remake) | Informational only |
| 17 | sun-moon | 7 | ✅ Yes | Use for Gen 7 |
| 18 | ultra-sun-ultra-moon | 7 | No (enhanced) | Informational only |
| 19 | lets-go-pikachu-lets-go-eevee | 7 | No (remake) | Informational only |
| 20 | sword-shield | 8 | ✅ Yes | Use for Gen 8 |
| 21 | the-isle-of-armor | 8 | No (DLC) | Informational only |
| 22 | the-crown-tundra | 8 | No (DLC) | Informational only |
| 23 | brilliant-diamond-and-shining-pearl | 8 | No (remake) | Informational only |
| 24 | legends-arceus | 8 | No (spinoff) | Informational only |
| 25 | scarlet-violet | 9 | ✅ Yes | Use for Gen 9 |
| 26 | the-teal-mask | 9 | No (DLC) | Informational only |
| 27 | the-indigo-disk | 9 | No (DLC) | Informational only |

### Canonical Version Group Selection

For each generation, use **only the canonical version group** when reconstructing data:

```typescript
const CANONICAL_VERSION_GROUPS: Record<number, string> = {
  1: 'red-blue',
  2: 'gold-silver',
  3: 'ruby-sapphire',
  4: 'diamond-pearl',
  5: 'black-white',
  6: 'x-y',
  7: 'sun-moon',
  8: 'sword-shield',
  9: 'scarlet-violet',
};
```

**Rationale**: Using the original release (not remakes, enhanced versions, or DLC) ensures consistency and historical accuracy. Each gen's data reflects what was available at that generation's launch, not what was added later.

---

## Importer Architecture

### Directory Structure

```
pokemon-lib-ts/
├── tools/
│   └── data-importer/
│       ├── package.json
│       ├── tsconfig.json
│       ├── import-gen.ts                 # CLI entry point
│       └── src/
│           ├── config.ts                 # GenConfig definitions
│           ├── utils/
│           │   ├── pokemon-api.ts        # PokeAPI file I/O helpers
│           │   ├── type-chart.ts         # Type effectiveness logic
│           │   └── validators.ts         # Validation helpers
│           ├── importers/
│           │   ├── pokemon.ts            # Pokemon importer
│           │   ├── moves.ts              # Moves importer
│           │   ├── abilities.ts          # Abilities importer
│           │   ├── items.ts              # Items importer
│           │   ├── type-chart.ts         # Type chart builder
│           │   └── natures.ts            # Natures importer
│           ├── transformers/
│           │   ├── pokemon-transformer.ts    # Pokemon PokeAPI → core entity
│           │   ├── move-transformer.ts      # Move PokeAPI → core entity
│           │   └── ...
│           └── validators/
│               ├── pokemon-validator.ts     # Validate Pokemon data
│               ├── moves-validator.ts       # Validate moves data
│               └── cross-reference.ts       # Validate cross-references
├── packages/
│   ├── gen1/data/
│   │   ├── pokemon.json
│   │   ├── moves.json
│   │   ├── abilities.json                # Empty for Gen 1-2
│   │   ├── items.json
│   │   ├── type-chart.json
│   │   └── natures.json                  # Empty for Gen 1-2
│   ├── gen2/data/
│   │   └── ...
│   └── ...
```

### CLI Interface

```bash
# Import a single generation
npx tsx tools/data-importer/import-gen.ts --gen 1

# Import with validation
npx tsx tools/data-importer/import-gen.ts --gen 3 --validate

# Import all generations
npx tsx tools/data-importer/import-gen.ts --all

# Validate without importing
npx tsx tools/data-importer/import-gen.ts --gen 5 --validate-only
```

---

## Gen Configuration

The importer is driven by a per-generation configuration object. This allows the same code to correctly handle Gen 1-9 differences.

### GenConfig Interface

```typescript
interface GenConfig {
  // Core generation metadata
  generation: number;                    // 1-9
  dexRange: [number, number];            // [start, end] inclusive (e.g., [1, 151] for Gen 1)

  // PokeAPI version group to use as canonical source
  canonicalVersionGroup: string;         // e.g., 'red-blue', 'gold-silver'
  allVersionGroups: string[];            // All groups for this gen (canonical + remakes for fallback)

  // Type system
  typeList: PokemonType[];               // Valid types for this gen (15 for Gen 1, 17 for Gen 2-5, 18 for Gen 6+)

  // Feature availability
  hasAbilities: boolean;                 // false for Gen 1-2, true for Gen 3+
  hasNatures: boolean;                   // false for Gen 1-2, true for Gen 3+
  hasPhysicalSpecialSplit: boolean;      // false for Gen 1-3, true for Gen 4+
  hasHeldItems: boolean;                 // false for Gen 1, true for Gen 2+
  hasRegionalForms: boolean;             // false for Gen 1-6, true for Gen 7+
  hasMegaEvolutions: boolean;            // false for Gen 1-5, true for Gen 6-7, false for Gen 8+
  hasGigantamax: boolean;                // false for Gen 1-7, true for Gen 8+
  hasTeraType: boolean;                  // false for Gen 1-8, true for Gen 9+

  // Moves list for this gen
  // Some moves were added in Gen 2 (e.g., Curse), removed in Gen 8 (Dexit)
  // Build this by filtering move/{id} where move.generation <= this.generation
  // AND move is not in the Dexit list if Gen 8+
  includedMoveIds: number[];             // Populated by moves importer

  // Other generation-specific settings
  eggGroupsAvailable: boolean;           // false for Gen 1, true for Gen 2+
  genderRatioAvailable: boolean;         // false for Gen 1, true for Gen 2+
}
```

### Config Definitions

```typescript
const GEN_CONFIGS: Record<number, GenConfig> = {
  1: {
    generation: 1,
    dexRange: [1, 151],
    canonicalVersionGroup: 'red-blue',
    allVersionGroups: ['red-blue', 'yellow'],
    typeList: ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
               'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon'],
    hasAbilities: false,
    hasNatures: false,
    hasPhysicalSpecialSplit: false,
    hasHeldItems: false,
    hasRegionalForms: false,
    hasMegaEvolutions: false,
    hasGigantamax: false,
    hasTeraType: false,
    includedMoveIds: [],  // Populated during import
    eggGroupsAvailable: false,
    genderRatioAvailable: false,
  },

  2: {
    generation: 2,
    dexRange: [1, 251],
    canonicalVersionGroup: 'gold-silver',
    allVersionGroups: ['gold-silver', 'crystal'],
    typeList: ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
               'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
               'dark', 'steel'],
    hasAbilities: false,
    hasNatures: false,
    hasPhysicalSpecialSplit: false,
    hasHeldItems: true,
    hasRegionalForms: false,
    hasMegaEvolutions: false,
    hasGigantamax: false,
    hasTeraType: false,
    includedMoveIds: [],
    eggGroupsAvailable: true,
    genderRatioAvailable: true,
  },

  3: {
    generation: 3,
    dexRange: [1, 386],
    canonicalVersionGroup: 'ruby-sapphire',
    allVersionGroups: ['ruby-sapphire', 'emerald', 'firered-leafgreen'],
    typeList: ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
               'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
               'dark', 'steel'],
    hasAbilities: true,
    hasNatures: true,
    hasPhysicalSpecialSplit: false,
    hasHeldItems: true,
    hasRegionalForms: false,
    hasMegaEvolutions: false,
    hasGigantamax: false,
    hasTeraType: false,
    includedMoveIds: [],
    eggGroupsAvailable: true,
    genderRatioAvailable: true,
  },

  // ... Gen 4-9 follow similar patterns

  9: {
    generation: 9,
    dexRange: [1, 1025],
    canonicalVersionGroup: 'scarlet-violet',
    allVersionGroups: ['scarlet-violet', 'the-teal-mask', 'the-indigo-disk'],
    typeList: ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
               'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
               'dark', 'steel', 'fairy'],
    hasAbilities: true,
    hasNatures: true,
    hasPhysicalSpecialSplit: true,
    hasHeldItems: true,
    hasRegionalForms: true,
    hasMegaEvolutions: false,
    hasGigantamax: false,
    hasTeraType: true,
    includedMoveIds: [],
    eggGroupsAvailable: true,
    genderRatioAvailable: true,
  },
};
```

---

## Pokemon Importer

### Overview

The Pokemon importer reads PokeAPI's `pokemon/{id}/index.json` and `pokemon-species/{id}/index.json`, transforms them to the core `PokemonSpeciesData` entity, and applies generation-specific logic.

### Input Sources

For each Pokemon in the dex range:

1. **`pokemon/{id}/index.json`** — Contains:
   - Base stats (hp, attack, defense, sp_attack, sp_defense, speed)
   - Sprites and artwork
   - Abilities (with `is_hidden` flag)
   - Moves with version group details
   - Species ID reference
   - Height, weight
   - Base experience

2. **`pokemon-species/{id}/index.json`** — Contains:
   - Gender ratio
   - Capture rate
   - Growth rate
   - Egg groups
   - Color, shape
   - Evolution chain ID
   - Generation introduced
   - Is main series (filters out Nidoran variants, etc.)

3. **`evolution-chain/{id}/index.json`** — Contains:
   - Evolution tree structure
   - Evolution conditions (level, item, trade, etc.)

### Transformation Logic

#### Step 1: Load Base Data

```typescript
async function loadPokemonData(pokemonId: number, config: GenConfig): Promise<PokeAPIRawPokemon> {
  // Load pokemon/{id}/index.json
  const pokemonData = await loadJSON(`pokemon/${pokemonId}/index.json`);

  // Load pokemon-species/{id}/index.json
  const speciesData = await loadJSON(`pokemon-species/${pokemonData.species.url.split('/').slice(-2)[0]}/index.json`);

  return { pokemon: pokemonData, species: speciesData };
}
```

#### Step 2: Map Base Stats

Handle the Gen 1 "Special" stat, which PokeAPI splits into `sp_attack` and `sp_defense` equally:

```typescript
function mapBaseStats(pokeapiStats: any[], generation: number): StatBlock {
  const stats = {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
  };

  const statNameMap: Record<string, keyof StatBlock> = {
    'hp': 'hp',
    'attack': 'attack',
    'defense': 'defense',
    'sp-attack': 'spAttack',
    'sp-defense': 'spDefense',
    'speed': 'speed',
  };

  for (const stat of pokeapiStats) {
    const key = statNameMap[stat.stat.name];
    if (key) {
      stats[key] = stat.base_stat;
    }
  }

  // Gen 1-2 had a single "Special" stat; PokeAPI reconstructs it as equal sp_attack and sp_defense
  // This is correct for our purposes

  return stats;
}
```

#### Step 3: Map Types

Filter to valid types for the generation:

```typescript
function mapTypes(pokeapiTypes: any[], config: GenConfig): [PokemonType] | [PokemonType, PokemonType] {
  const types = pokeapiTypes
    .sort((a, b) => a.slot - b.slot)
    .map(t => t.type.name as PokemonType)
    .filter(t => config.typeList.includes(t));

  if (types.length === 0) {
    throw new Error(`No valid types found for Pokemon`);
  }

  if (types.length > 2) {
    console.warn(`Pokemon has ${types.length} types; truncating to 2`);
    return [types[0], types[1]];
  }

  return types.length === 2 ? [types[0], types[1]] : [types[0]];
}
```

**Important**: Never retcon types. If Clefairy was Normal in Gen 1, it should be Normal in Gen 1, even though it was later changed to Fairy. The source PokeAPI data has historical type data; use it directly.

#### Step 4: Map Abilities

```typescript
function mapAbilities(pokemonData: any, generation: number): { normal: string[]; hidden: string | null } {
  if (!config.hasAbilities) {
    return { normal: [], hidden: null };
  }

  const normal: string[] = [];
  let hidden: string | null = null;

  for (const ability of pokemonData.abilities || []) {
    const abilityName = ability.ability.name;
    if (ability.is_hidden) {
      hidden = abilityName;
    } else {
      normal.push(abilityName);
    }
  }

  return { normal, hidden };
}
```

#### Step 5: Build Learnset

Extract moves the Pokemon learns in the target generation by filtering `version_group_details`:

```typescript
function buildLearnset(pokemonData: any, config: GenConfig): Learnset {
  const learnset: Learnset = {
    levelUp: [],
    tm: [],
    egg: [],
    tutor: [],
  };

  for (const moveRecord of pokemonData.moves || []) {
    const moveName = moveRecord.move.name;

    for (const detail of moveRecord.version_group_details) {
      const versionGroup = detail.version_group.name;

      // Only include if this version group is canonical for the target gen
      if (!config.allVersionGroups.includes(versionGroup)) {
        continue;
      }

      const method = detail.move_learn_method.name;

      if (method === 'level-up') {
        learnset.levelUp.push({
          level: detail.level_learned_at,
          moveId: moveId,  // Looked up from moves importer
        });
      } else if (method === 'machine') {
        learnset.tm.push(moveName);
      } else if (method === 'egg') {
        learnset.egg.push(moveName);
      } else if (method === 'tutor') {
        learnset.tutor.push(moveName);
      }
    }
  }

  // Sort level-up moves by level
  learnset.levelUp.sort((a, b) => a.level - b.level);

  return learnset;
}
```

**Important**: If a Pokemon is not in the canonical version group for this gen (e.g., Bulbasaur is not in Gold-Silver, only in Red-Blue), its learnset will be empty for Gen 2. This is correct — you must only use the canonical version group.

#### Step 6: Extract Evolution Chain

```typescript
async function extractEvolutionChain(speciesData: any): Promise<EvolutionData[]> {
  const chainId = speciesData.evolution_chain.url.split('/').slice(-2)[0];
  const chainData = await loadJSON(`evolution-chain/${chainId}/index.json`);

  const evolutions: EvolutionData[] = [];

  // Traverse the evolution tree
  function traverse(chain: any) {
    if (!chain.evolves_to || chain.evolves_to.length === 0) {
      return;
    }

    for (const evo of chain.evolves_to) {
      const condition: EvolutionCondition = parseEvolutionDetails(evo.evolution_details[0]);

      evolutions.push({
        toId: evo.species.url.split('/').slice(-2)[0],
        toName: evo.species.name,
        condition,
      });

      traverse(evo);
    }
  }

  traverse(chainData.chain);

  return evolutions;
}

function parseEvolutionDetails(details: any): EvolutionCondition {
  if (details.min_level) {
    return { type: 'level', level: details.min_level };
  }
  if (details.item) {
    return { type: 'item', itemId: lookupItemId(details.item.name) };
  }
  if (details.known_move) {
    return { type: 'move', moveId: lookupMoveId(details.known_move.name) };
  }
  if (details.trade) {
    return details.held_item
      ? { type: 'trade-with-item', itemId: lookupItemId(details.held_item.name) }
      : { type: 'trade' };
  }
  // ... handle other condition types
  return { type: 'other' };
}
```

#### Step 7: Handle Regional Forms (Gen 7+)

```typescript
function extractRegionalForms(pokemonData: any, config: GenConfig): RegionalFormData[] {
  if (!config.hasRegionalForms) {
    return [];
  }

  const forms: RegionalFormData[] = [];

  for (const form of pokemonData.forms || []) {
    if (!form.is_main_series) {
      continue;
    }

    if (form.name === pokemonData.name) {
      // Skip the base form; it's already the main entry
      continue;
    }

    // Extract region from form name (e.g., 'alolan-rattata' → 'alola')
    const region = parseRegionFromFormName(form.name);

    forms.push({
      id: form.id,
      name: form.name,
      region,
      types: mapTypes(form.types || pokemonData.types, config),
      baseStats: mapBaseStats(form.stats || pokemonData.stats, config.generation),
      // ... other fields
    });
  }

  return forms;
}
```

#### Step 8: Handle Mega Evolutions (Gen 6-7)

```typescript
function extractMegaEvolutions(speciesData: any, config: GenConfig): MegaEvolutionData[] {
  if (!config.hasMegaEvolutions) {
    return [];
  }

  const megas: MegaEvolutionData[] = [];

  for (const variety of speciesData.varieties || []) {
    // Check if this is a Mega form
    if (!variety.pokemon.name.includes('-mega')) {
      continue;
    }

    megas.push({
      name: variety.pokemon.name,
      types: extractTypesFromVariety(variety),
      baseStats: extractStatsFromVariety(variety),
      ability: extractAbilityFromVariety(variety),
      // ... other fields
    });
  }

  return megas;
}
```

#### Step 9: Output

```typescript
interface PokemonSpeciesData {
  id: number;
  name: string;                          // 'charizard'
  displayName: string;                   // 'Charizard'
  generation: number;
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: StatBlock;
  abilities: { normal: string[]; hidden: string | null };
  genderRatio: number;                   // PokeAPI: -1 (genderless), 0-8 scale
  captureRate: number;
  baseExperience: number;
  experienceGroup: ExperienceGroup;
  eggGroups: string[];                   // Empty for Gen 1
  height: number;                        // decimeters
  weight: number;                        // hectograms
  evYield: Partial<StatBlock>;
  learnset: Learnset;
  evolutionChain: EvolutionData[];
  forms?: RegionalFormData[];            // Gen 7+ only
  megaEvolutions?: MegaEvolutionData[];  // Gen 6-7 only
  gigantamaxData?: GigantamaxData;       // Gen 8 only
  teraType?: string;                     // Gen 9 only
}
```

---

## Move Importer

### Overview

The moves importer reads PokeAPI's `move/{id}/index.json` and reconstructs per-generation move data. The key challenge is that many moves changed their stats between generations (e.g., Hypnosis accuracy, Bite's type).

### Input Source

**`move/{id}/index.json`** contains:

```json
{
  "id": 1,
  "name": "pound",
  "power": 40,
  "accuracy": 100,
  "pp": 35,
  "type": { "name": "normal" },
  "damage_class": { "name": "physical" },
  "generation": { "name": "generation-i" },
  "past_values": [
    {
      "version_group": { "name": "black-2-white-2" },
      "power": 40,
      "accuracy": 100,
      "pp": 35,
      "type": { "name": "normal" },
      "damage_class": { "name": "physical" }
    }
  ],
  "effect_entries": [
    {
      "effect": "...",
      "language": { "name": "en" }
    }
  ]
}
```

### Transformation Logic

#### Step 1: Filter Moves by Generation

Only include moves that existed in the target generation:

```typescript
function filterMovesByGeneration(moveId: number, config: GenConfig, pokeapiMove: any): boolean {
  // Check if move's generation is <= target generation
  const moveGenNum = parseInt(pokeapiMove.generation.name.replace('generation-', ''));
  if (moveGenNum > config.generation) {
    return false;
  }

  // Handle Gen 8 "Dexit" — some moves were removed
  if (config.generation === 8) {
    const REMOVED_IN_GEN_8 = [
      // List of move IDs or names removed in Sword/Shield
      'ancient-power', 'bullet-punch', // ... etc
    ];
    if (REMOVED_IN_GEN_8.includes(pokeapiMove.name)) {
      return false;
    }
  }

  return true;
}
```

#### Step 2: Reconstruct Per-Generation Stats

Use `past_values` to find the move's stats in the canonical version group:

```typescript
function reconstructMoveStats(pokeapiMove: any, config: GenConfig): MoveStats {
  // Start with current (latest gen) data
  let power = pokeapiMove.power;
  let accuracy = pokeapiMove.accuracy;
  let pp = pokeapiMove.pp;
  let type = pokeapiMove.type.name;
  let damageClass = pokeapiMove.damage_class.name;

  // If importing a historical gen, find the past_values entry for that gen's version group
  if (config.generation < 9) {
    for (const past of pokeapiMove.past_values || []) {
      const versionGroup = past.version_group.name;

      // Check if this past value is for the target gen
      if (config.allVersionGroups.includes(versionGroup)) {
        power = past.power ?? power;
        accuracy = past.accuracy ?? accuracy;
        pp = past.pp ?? pp;
        type = past.type?.name ?? type;
        damageClass = past.damage_class?.name ?? damageClass;
        break;
      }
    }
  }

  return { power, accuracy, pp, type, damageClass };
}
```

#### Step 3: Apply Physical/Special Split Rules

For Gen 1-3, derive `category` from the move's **type**, not from PokeAPI's `damage_class`:

```typescript
function mapCategory(type: PokemonType, damageClass: string, config: GenConfig): MoveCategory {
  // Gen 4+ uses per-move categories
  if (config.hasPhysicalSpecialSplit) {
    return damageClass as MoveCategory;
  }

  // Gen 1-3: Category is determined by type
  const SPECIAL_TYPES = ['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark'];

  if (SPECIAL_TYPES.includes(type)) {
    return 'special';
  }
  return 'physical';
}
```

#### Step 4: Extract Effect Information

```typescript
function extractEffect(pokeapiMove: any): MoveEffect {
  // Find English effect entry
  const effectEntry = (pokeapiMove.effect_entries || []).find(
    e => e.language.name === 'en'
  );

  return {
    description: effectEntry?.effect || '',
    chance: pokeapiMove.effect_chance || null,
  };
}
```

#### Step 5: Output

```typescript
interface MoveData {
  id: number;
  name: string;                    // 'pound'
  displayName: string;             // 'Pound'
  type: PokemonType;
  category: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;         // null = always hits
  pp: number;
  priority: number;
  target: MoveTarget;              // 'single-target', 'all-opponents', etc.
  flags: MoveFlags;                // { contact: boolean, sound: boolean, ... }
  effect: MoveEffect;
  effectChance: number | null;
  description: string;
}
```

---

## Type Chart Builder

### Overview

The type chart is an NxN matrix showing type effectiveness. Gen 1 has quirks (Ghost immunity to Psychic), and the type roster changes across gens.

### Input Source

**`type/{id}/index.json`** contains damage relationships:

```json
{
  "id": 1,
  "name": "normal",
  "damage_relations": {
    "no_damage_to": [ { "name": "rock" }, ... ],
    "half_damage_to": [ { "name": "rock" }, ... ],
    "double_damage_to": [ ... ],
    "no_damage_from": [ ... ],
    "half_damage_from": [ ... ],
    "double_damage_from": [ ... ]
  },
  "past_damage_relations": [
    {
      "version_group": { "name": "black-2-white-2" },
      "damage_relations": { ... }
    }
  ]
}
```

### Transformation Logic

```typescript
async function buildTypeChart(config: GenConfig): Promise<TypeChart> {
  const chart: TypeChart = {};

  // Initialize all types as neutral (1.0 effectiveness)
  for (const attackType of config.typeList) {
    chart[attackType] = {};
    for (const defendType of config.typeList) {
      chart[attackType][defendType] = 1;
    }
  }

  // Load each type and apply damage relations
  for (const typeId of POKEMON_TYPE_IDS) {
    const typeData = await loadJSON(`type/${typeId}/index.json`);
    const typeName = typeData.name as PokemonType;

    // Skip types not in this gen
    if (!config.typeList.includes(typeName)) {
      continue;
    }

    // Get damage relations for the canonical version group
    const damageRelations = getDamageRelationsForGen(typeData, config);

    // Apply effectiveness: chart[attackType][defendType]
    // If a type deals super effective damage, increase the value

    for (const defendType of damageRelations.double_damage_to) {
      if (config.typeList.includes(defendType)) {
        chart[typeName][defendType] = 2;
      }
    }

    for (const defendType of damageRelations.half_damage_to) {
      if (config.typeList.includes(defendType)) {
        chart[typeName][defendType] = 0.5;
      }
    }

    for (const defendType of damageRelations.no_damage_to) {
      if (config.typeList.includes(defendType)) {
        chart[typeName][defendType] = 0;
      }
    }
  }

  return chart;
}

function getDamageRelationsForGen(typeData: any, config: GenConfig): DamageRelations {
  // For Gen 1-8, check past_damage_relations
  if (config.generation < 9) {
    for (const past of typeData.past_damage_relations || []) {
      const versionGroup = past.version_group.name;
      if (config.allVersionGroups.includes(versionGroup)) {
        return past.damage_relations;
      }
    }
  }

  // Fallback to current data
  return typeData.damage_relations;
}
```

### Gen 1 Special Cases

**Ghost/Psychic Bug**: In Gen 1, Ghost is immune to Psychic (0x effectiveness). However, this was a bug in the original game code. The PokeAPI data likely reflects the corrected behavior (2x super effective). We should decide:

1. **Option A** (Accuracy): Use PokeAPI's corrected data (current approach)
2. **Option B** (Historical Authenticity): Apply a hardcoded override for Gen 1:

```typescript
// Gen 1 overrides (only if authenticity is desired)
if (config.generation === 1) {
  chart['psychic']['ghost'] = 0;  // Bug: Ghost is immune
  // Note: Poison is super effective against Bug in Gen 1
  chart['poison']['bug'] = 2;
}
```

**Recommendation**: Use Option A (PokeAPI's corrected data) unless the project explicitly wants to emulate original game bugs.

### Type Count Per Generation

| Generation | Type Count | Types Added |
|---|---|---|
| Gen 1 | 15 | Base types (no Dark, Steel, Fairy) |
| Gen 2 | 17 | Dark, Steel |
| Gen 3-5 | 17 | (no change) |
| Gen 6+ | 18 | Fairy |

Ensure the type chart is NxN where N = gen's type count.

---

## Abilities Importer

### Overview

Abilities were introduced in Gen 3. Gen 1-2 should have empty ability files.

### Input Source

**`ability/{id}/index.json`** contains ability metadata:

```json
{
  "id": 1,
  "name": "stench",
  "generation": { "name": "generation-iii" },
  "effect_entries": [
    {
      "effect": "...",
      "language": { "name": "en" }
    }
  ]
}
```

### Transformation Logic

```typescript
async function importAbilities(config: GenConfig): Promise<AbilityData[]> {
  if (!config.hasAbilities) {
    return [];  // Gen 1-2
  }

  const abilities: AbilityData[] = [];

  // Load all abilities; filter by generation
  for (const abilityId of ABILITY_IDS) {
    const pokeapiAbility = await loadJSON(`ability/${abilityId}/index.json`);

    const abilityGenNum = parseInt(pokeapiAbility.generation.name.replace('generation-', ''));
    if (abilityGenNum > config.generation) {
      continue;
    }

    const effectEntry = pokeapiAbility.effect_entries.find(e => e.language.name === 'en');

    abilities.push({
      id: pokeapiAbility.id,
      name: pokeapiAbility.name,
      displayName: capitalize(pokeapiAbility.name.replace(/-/g, ' ')),
      description: effectEntry?.effect || '',
      shortDescription: effectEntry?.short_effect || '',
      generation: abilityGenNum,
      triggers: parseAbilityTriggers(pokeapiAbility),  // Not critical; can be {} for now
    });
  }

  return abilities;
}
```

---

## Items Importer

### Overview

Items are available from Gen 1, but held items (for Pokemon to hold in battle) were introduced in Gen 2.

### Input Source

**`item/{id}/index.json`**:

```json
{
  "id": 1,
  "name": "master-ball",
  "category": { "name": "balls" },
  "cost": 0,
  "fling_power": 30,
  "flavor_text_entries": [ ... ],
  "generation": { "name": "generation-i" }
}
```

### Transformation Logic

```typescript
async function importItems(config: GenConfig): Promise<ItemData[]> {
  const items: ItemData[] = [];

  for (const itemId of ITEM_IDS) {
    const pokeapiItem = await loadJSON(`item/${itemId}/index.json`);

    // Filter by gen
    const itemGenNum = parseInt(pokeapiItem.generation.name.replace('generation-', ''));
    if (itemGenNum > config.generation) {
      continue;
    }

    // For Gen 1, only include non-held items (balls, potions, evolutionary stones, etc.)
    if (!config.hasHeldItems && isHeldItem(pokeapiItem)) {
      continue;
    }

    const descEntry = pokeapiItem.flavor_text_entries.find(e => e.language.name === 'en');

    items.push({
      id: pokeapiItem.id,
      name: pokeapiItem.name,
      displayName: capitalize(pokeapiItem.name.replace(/-/g, ' ')),
      category: pokeapiItem.category.name,
      description: descEntry?.text || '',
      cost: pokeapiItem.cost || 0,
      holdEffect: parseHoldEffect(pokeapiItem),    // Gen 2+
      useEffect: parseUseEffect(pokeapiItem),      // Consumables, etc.
      flingPower: pokeapiItem.fling_power || null,
    });
  }

  return items;
}
```

---

## Natures Importer

### Overview

Natures were introduced in Gen 3. There are exactly 25 natures (no more, no fewer). Gen 1-2 should have empty nature files.

### Input Source

**`nature/{id}/index.json`**:

```json
{
  "id": 1,
  "name": "hardy",
  "increased_stat": null,
  "decreased_stat": null
}
```

### Transformation Logic

```typescript
async function importNatures(config: GenConfig): Promise<NatureData[]> {
  if (!config.hasNatures) {
    return [];  // Gen 1-2
  }

  const natures: NatureData[] = [];

  // There are exactly 25 natures; load them all
  for (let id = 1; id <= 25; id++) {
    const pokeapiNature = await loadJSON(`nature/${id}/index.json`);

    natures.push({
      id: pokeapiNature.id,
      name: pokeapiNature.name as NatureId,
      displayName: capitalize(pokeapiNature.name),
      increasedStat: pokeapiNature.increased_stat?.name || null,
      decreasedStat: pokeapiNature.decreased_stat?.name || null,
    });
  }

  return natures;
}
```

---

## Validation

### Post-Import Validation

After importing all files for a generation, validate:

#### Pokemon Validation

```typescript
function validatePokemonData(pokemon: PokemonSpeciesData[], config: GenConfig) {
  for (const p of pokemon) {
    // ID within dex range
    if (p.id < config.dexRange[0] || p.id > config.dexRange[1]) {
      throw new Error(`Pokemon ID ${p.id} outside dex range [${config.dexRange[0]}, ${config.dexRange[1]}]`);
    }

    // Types valid
    for (const type of p.types) {
      if (!config.typeList.includes(type)) {
        throw new Error(`Invalid type "${type}" for Pokemon ${p.name}`);
      }
    }

    // Stats reasonable (basic sanity check)
    for (const stat of Object.values(p.baseStats)) {
      if (stat < 1 || stat > 255) {
        throw new Error(`Stat out of range: ${stat}`);
      }
    }

    // Abilities valid (Gen 3+ only)
    if (config.hasAbilities) {
      // Abilities should not be empty
      if (p.abilities.normal.length === 0 && !p.abilities.hidden) {
        console.warn(`Pokemon ${p.name} has no abilities`);
      }
    } else {
      // Gen 1-2: must be empty
      if (p.abilities.normal.length > 0 || p.abilities.hidden) {
        throw new Error(`Gen ${config.generation} Pokemon should have no abilities`);
      }
    }

    // Learnset: all moves must exist
    for (const lvlUp of p.learnset.levelUp) {
      if (lvlUp.level < 1 || lvlUp.level > 100) {
        throw new Error(`Invalid learnset level: ${lvlUp.level}`);
      }
    }
  }
}
```

#### Move Validation

```typescript
function validateMoveData(moves: MoveData[], config: GenConfig) {
  for (const move of moves) {
    // Type valid
    if (!config.typeList.includes(move.type)) {
      throw new Error(`Invalid type "${move.type}" for move ${move.name}`);
    }

    // Category valid
    if (!['physical', 'special', 'status'].includes(move.category)) {
      throw new Error(`Invalid category "${move.category}" for move ${move.name}`);
    }

    // Power and accuracy in reasonable ranges
    if (move.power !== null && (move.power < 0 || move.power > 250)) {
      throw new Error(`Invalid power: ${move.power}`);
    }

    if (move.accuracy !== null && (move.accuracy < 0 || move.accuracy > 100)) {
      throw new Error(`Invalid accuracy: ${move.accuracy}`);
    }

    if (move.pp < 1 || move.pp > 64) {
      throw new Error(`Invalid PP: ${move.pp}`);
    }
  }
}
```

#### Type Chart Validation

```typescript
function validateTypeChart(chart: TypeChart, config: GenConfig) {
  // Must be NxN where N = number of types
  const typeCount = config.typeList.length;

  if (Object.keys(chart).length !== typeCount) {
    throw new Error(`Type chart row count ${Object.keys(chart).length} !== ${typeCount}`);
  }

  for (const attackType of config.typeList) {
    if (!chart[attackType]) {
      throw new Error(`Missing row for type "${attackType}"`);
    }

    const defenses = chart[attackType];
    if (Object.keys(defenses).length !== typeCount) {
      throw new Error(`Type "${attackType}" has ${Object.keys(defenses).length} columns; expected ${typeCount}`);
    }

    for (const defendType of config.typeList) {
      const effectiveness = defenses[defendType];

      // Valid values: 0 (immune), 0.5 (resist), 1 (neutral), 2 (super-effective)
      if (![0, 0.5, 1, 2].includes(effectiveness)) {
        throw new Error(`Invalid effectiveness: ${attackType} vs ${defendType} = ${effectiveness}`);
      }
    }
  }
}
```

#### Cross-Reference Validation

```typescript
function validateCrossReferences(
  pokemon: PokemonSpeciesData[],
  moves: MoveData[],
  abilities: AbilityData[],
  items: ItemData[],
  config: GenConfig
) {
  const moveNameSet = new Set(moves.map(m => m.name));
  const abilityNameSet = new Set(abilities.map(a => a.name));
  const itemNameSet = new Set(items.map(i => i.name));

  for (const p of pokemon) {
    // Every move in learnset must exist
    for (const levelUp of p.learnset.levelUp) {
      if (!moveNameSet.has(levelUp.moveId)) {
        throw new Error(`Pokemon ${p.name} references non-existent move: ${levelUp.moveId}`);
      }
    }

    for (const tm of p.learnset.tm) {
      if (!moveNameSet.has(tm)) {
        throw new Error(`Pokemon ${p.name} references non-existent TM move: ${tm}`);
      }
    }

    for (const egg of p.learnset.egg) {
      if (!moveNameSet.has(egg)) {
        throw new Error(`Pokemon ${p.name} references non-existent egg move: ${egg}`);
      }
    }

    // Every ability must exist
    if (config.hasAbilities) {
      for (const ability of p.abilities.normal) {
        if (!abilityNameSet.has(ability)) {
          throw new Error(`Pokemon ${p.name} references non-existent ability: ${ability}`);
        }
      }

      if (p.abilities.hidden && !abilityNameSet.has(p.abilities.hidden)) {
        throw new Error(`Pokemon ${p.name} references non-existent hidden ability: ${p.abilities.hidden}`);
      }
    }
  }
}
```

#### Dex Count Validation

```typescript
function validateDexCount(pokemon: PokemonSpeciesData[], config: GenConfig) {
  const expectedCount = config.dexRange[1] - config.dexRange[0] + 1;
  const actualCount = pokemon.length;

  if (actualCount !== expectedCount) {
    throw new Error(
      `Gen ${config.generation}: expected ${expectedCount} Pokemon, got ${actualCount}`
    );
  }

  // Quick reference table
  const EXPECTED_COUNTS: Record<number, number> = {
    1: 151,
    2: 251,
    3: 386,
    4: 493,
    5: 649,
    6: 721,
    7: 809,
    8: 905,
    9: 1025,
  };

  const expected = EXPECTED_COUNTS[config.generation];
  if (expected && actualCount !== expected) {
    throw new Error(
      `Gen ${config.generation}: expected ${expected} Pokemon, got ${actualCount}`
    );
  }
}
```

---

## NPM Scripts

Add to `tools/data-importer/package.json`:

```json
{
  "scripts": {
    "import-gen": "tsx import-gen.ts",
    "import-gen-1": "tsx import-gen.ts --gen 1",
    "import-gen-2": "tsx import-gen.ts --gen 2",
    "import-all": "tsx import-gen.ts --all",
    "validate": "tsx import-gen.ts --validate-only",
    "validate-gen-1": "tsx import-gen.ts --gen 1 --validate-only"
  }
}
```

Example usage from monorepo root:

```bash
# Import Gen 3 with validation
npm run -w tools/data-importer import-gen -- --gen 3 --validate

# Import all gens
npm run -w tools/data-importer import-all

# Validate Gen 5 without importing
npm run -w tools/data-importer validate -- --gen 5
```

---

## Known Edge Cases & Special Handling

### 1. **Fairy Retcon (Gen 6)**

Many Pokemon were changed to Fairy type in Gen 6 (Clefairy, Jigglypuff, Pikachu). The PokeAPI data has historical types, so Clefairy should be Normal in Gen 1-5 output.

**Handling**: Use PokeAPI data as-is; it already handles this correctly.

### 2. **Gen 1 Ghost/Psychic Bug**

Ghost is immune to Psychic in Gen 1 due to a code bug (0x effectiveness instead of 2x). PokeAPI likely corrects this.

**Decision**: Use corrected data unless historical bug emulation is required. Current recommendation: use PokeAPI's corrected chart.

### 3. **Move "Dexit" (Gen 8)**

Sword/Shield removed ~100 moves that existed in Gen 7. PokeAPI tracks this in `generation` metadata.

**Handling**: Filter moves where `generation <= target_gen` AND not in DEXIT_BLOCKLIST.

### 4. **Poison Super-Effective Against Bug (Gen 1)**

In Gen 1, Poison is super-effective against Bug (unusual). PokeAPI may or may not reflect this.

**Handling**: Verify against PokeAPI's past_damage_relations for Gen 1.

### 5. **Ice Resists Ice (Gen 1)**

In Gen 1, Ice is super-effective against Ice (unusual). PokeAPI may not reflect this.

**Handling**: Apply hardcoded override for Gen 1 if needed:

```typescript
if (config.generation === 1) {
  chart['ice']['ice'] = 2;  // Unusual but correct for Gen 1
}
```

### 6. **Regional Forms (Gen 7+)**

Alolan, Galarian, Hisuian, and Paldean forms were introduced in later gens. These appear as separate Pokemon with IDs > 1025 or as form variants.

**Handling**:
- Store as `forms` array in PokemonSpeciesData
- Include form-specific types, stats, abilities
- Track which region the form is from

### 7. **Mega Evolutions (Gen 6-7)**

Mega evolutions exist in Gen 6-7 but were replaced by Dynamax/Gigantamax in Gen 8.

**Handling**:
- Store as `megaEvolutions` array
- Each entry has types, stats, ability
- Do not include in Gen 8+ files

### 8. **Gigantamax (Gen 8)**

Available only in Sword/Shield. Gigantamax forms have different max move pools than their base form.

**Handling**:
- Store as `gigantamaxData` object (if the Pokemon can Gigantamax)
- Track G-max move overrides

### 9. **Tera Type (Gen 9)**

Every Pokemon can change its type to a Tera type in Scarlet/Violet. Default Tera type often matches the Pokemon's primary type, but can be different.

**Handling**:
- Add `teraType?: PokemonType` field to Gen 9 output
- PokeAPI may not have this data yet; may need to hardcode defaults

### 10. **Move Type Changes**

Some moves changed type between gens (e.g., Bite became Dark in Gen 2, was Normal before).

**Handling**: PokeAPI's `past_values` tracks this. Use it to reconstruct correct move types per gen.

### 11. **Learnset Method Filtering**

When extracting moves a Pokemon can learn, filter by version_group_details[].move_learn_method:
- `level-up` → levelUp learnset
- `machine` → TM learnset
- `egg` → egg learnset
- `tutor` → tutor learnset (Gen 4+ only)

Only include if the method is valid for the target gen.

### 12. **Gen 1 Dex Incomplete**

Gen 1 has 151 Pokemon (including Mew). Some of these don't appear in standard Red/Blue (Mew is event-only).

**Decision**: Include all in the dex range. Notes about event-only Pokemon can be documented separately.

### 13. **Held Item Availability**

Gen 1 has no held items. Gen 2 introduced the mechanic. The importer must not include held item data in Gen 1's item list.

**Handling**: Filter items by `category` and gen-specific held item list.

### 14. **Experience Groups**

Pokemon have experience groups ('erratic', 'fast', 'medium-fast', 'medium-slow', 'slow', 'fluctuating'). These are stable across gens.

**Handling**: Use as-is from `pokemon-species/{id}/index.json`.

---

## Implementation Checklist

- [ ] Clone PokeAPI api-data repo to `tools/repos/api-data/`
- [ ] Create `tools/data-importer/` directory structure
- [ ] Implement `GenConfig` interface and per-gen configs (GEN_CONFIGS)
- [ ] Implement Pokemon importer (handles stats, types, abilities, learnsets, evolutions)
- [ ] Implement move importer (handles past_values, physical/special split)
- [ ] Implement type chart builder
- [ ] Implement abilities, items, natures importers
- [ ] Implement post-import validators
- [ ] Add NPM scripts
- [ ] Test import for Gen 1 (small dex, no abilities/natures)
- [ ] Test import for Gen 3 (abilities introduced, physical/special by type)
- [ ] Test import for Gen 6 (Fairy type, Mega evolutions)
- [ ] Test import for Gen 8 (Gigantamax, Dexit)
- [ ] Test import for Gen 9 (Tera type, all modern features)
- [ ] Validate cross-references and dex counts

---

## References

- [PokeAPI Documentation](https://pokeapi.co/docs/v2)
- [PokeAPI api-data Repository](https://github.com/PokeAPI/api-data)
- [Pokemon Generation Details](https://bulbapedia.bulbagarden.net/wiki/Generation)
- Core entity specs: `core/01-entities.md`
- Architecture spec: `core/00-architecture.md`
