# Pokemon Fan Game — Data Schemas

> All TypeScript interfaces, types, and enums for Pokemon, moves, abilities, items, natures, type chart, and battle state.

---

## 5. Data Layer

### 5.1 Pokemon Species Schema (`pokemon.json`)

Each entry represents a species (not an individual):

```typescript
interface PokemonSpeciesData {
  id: number;                     // National dex number (1-151 for Gen 1)
  name: string;                   // Lowercase identifier ("charizard")
  displayName: string;            // Display name ("Charizard")
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: StatBlock;
  abilities: {
    normal: string[];             // Ability IDs
    hidden: string | null;        // Hidden ability ID or null
  };
  genderRatio: number;            // % male. -1 = genderless
  catchRate: number;              // 0-255
  baseExp: number;                // Base experience yield
  expGroup: ExperienceGroup;      // "fast" | "medium-fast" | "medium-slow" | "slow" | "erratic" | "fluctuating"
  evYield: Partial<StatBlock>;    // Which EVs this species yields
  eggGroups: string[];
  learnset: {
    levelUp: { level: number; move: string }[];
    tm: string[];
    egg: string[];
    tutor: string[];
  };
  evolution: EvolutionData | null;
  dimensions: { height: number; weight: number }; // meters, kg
  spriteKey: string;              // Key for sprite lookup (usually same as name)

  // Transformation data (stubbed for v1)
  megaEvolutions?: MegaEvolutionData[];
  gigantamaxForm?: GigantamaxData;
  canDynamax?: boolean;           // Default true for all, false for special cases
}

interface StatBlock {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

interface EvolutionData {
  from?: { species: number; method: string; level?: number; item?: string; condition?: string };
  to?: { species: number; method: string; level?: number; item?: string; condition?: string }[];
}

interface MegaEvolutionData {
  form: string;                   // "mega", "mega-x", "mega-y"
  item: string;                   // Required held item
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: StatBlock;
  ability: string;
}

interface GigantamaxData {
  gMaxMove: { type: PokemonType; name: string; power: number };
}
```

### 5.2 Pokemon Instance Schema

An individual Pokemon in the player's party or a trainer's team:

```typescript
interface PokemonInstance {
  uid: string;                    // Unique ID (crypto.randomUUID())
  speciesId: number;              // References PokemonSpeciesData.id
  nickname: string | null;
  level: number;                  // 1-100
  experience: number;             // Current EXP
  nature: NatureId;
  ivs: StatBlock;                 // 0-31 per stat
  evs: StatBlock;                 // 0-252 per stat, 510 total cap
  currentHp: number;
  moves: MoveSlot[];              // 1-4 moves
  ability: string;                // Active ability ID
  abilitySlot: 'normal1' | 'normal2' | 'hidden';
  heldItem: string | null;
  status: PrimaryStatus | null;   // "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null
  friendship: number;             // 0-255
  gender: 'male' | 'female' | 'genderless';
  isShiny: boolean;
  metLocation: string;
  metLevel: number;
  originalTrainer: string;

  // Runtime only (not saved)
  calculatedStats?: StatBlock;

  // Future
  teraType?: PokemonType;
  dynamaxLevel?: number;
}

interface MoveSlot {
  moveId: string;
  currentPP: number;
  maxPP: number;                  // Base PP * (1 + 0.2 * ppUps)
  ppUps: number;                  // 0-3
}
```

### 5.3 Move Schema (`moves.json`)

```typescript
interface MoveData {
  id: string;                     // Lowercase identifier ("flamethrower")
  displayName: string;            // "Flamethrower"
  type: PokemonType;
  category: 'physical' | 'special' | 'status';
  power: number | null;           // null for status moves
  accuracy: number | null;        // null = never misses (e.g., Swift)
  pp: number;                     // Base PP
  priority: number;               // -7 to +5
  target: MoveTarget;
  flags: MoveFlags;
  effect: MoveEffect | null;      // See MoveEffect union type
  description: string;

  // Future
  zMovePower?: number;
  maxMovePower?: number;
}

type MoveTarget =
  | 'adjacent-foe'        // Single adjacent opponent
  | 'all-adjacent-foes'   // Both opponents in doubles
  | 'adjacent-ally'       // Single adjacent ally
  | 'self'                // User only
  | 'all-adjacent'        // All adjacent (foes + allies)
  | 'user-and-allies'     // User + allies
  | 'all-foes'            // All opponents
  | 'entire-field'        // Affects whole field
  | 'user-field'          // User's side (screens, hazards)
  | 'foe-field'           // Opponent's side (hazards)
  | 'random-foe';         // Random opponent

interface MoveFlags {
  contact: boolean;       // Makes contact (triggers Rough Skin, etc.)
  sound: boolean;         // Sound-based (bypasses Substitute)
  bullet: boolean;        // Bullet/ball move (Bulletproof blocks)
  pulse: boolean;         // Pulse move (Mega Launcher boosts)
  punch: boolean;         // Punching move (Iron Fist boosts)
  bite: boolean;          // Biting move (Strong Jaw boosts)
  wind: boolean;          // Wind move (Wind Rider, Wind Power)
  powder: boolean;        // Powder move (Grass types immune)
  protect: boolean;       // Blocked by Protect/Detect
  mirror: boolean;        // Copied by Mirror Move
  snatch: boolean;        // Stolen by Snatch
  gravity: boolean;       // Disabled by Gravity (fly, bounce, etc.)
  defrost: boolean;       // Thaws user if frozen (Scald, Flame Wheel, etc.)
  recharge: boolean;      // Requires recharge turn (Hyper Beam)
  charge: boolean;        // Two-turn move (Solar Beam, Fly, Dig)
}

// Move effects — union of all possible effect types
type MoveEffect =
  | { type: 'damage' }                                            // Pure damage, no secondary
  | { type: 'status-chance'; status: PrimaryStatus; chance: number }  // % chance to inflict status
  | { type: 'status-guaranteed'; status: PrimaryStatus }              // Always inflicts status
  | { type: 'stat-change'; changes: StatChange[]; target: 'self' | 'foe'; chance: number }
  | { type: 'volatile-status'; status: VolatileStatus; chance: number }
  | { type: 'heal'; amount: number }                              // Fraction of max HP (0.5 = 50%)
  | { type: 'recoil'; amount: number }                            // Fraction of damage dealt
  | { type: 'drain'; amount: number }                             // Fraction of damage dealt healed
  | { type: 'weather'; weather: WeatherType; turns: number }
  | { type: 'terrain'; terrain: TerrainType; turns: number }
  | { type: 'entry-hazard'; hazard: EntryHazardType; target: 'foe-field' }
  | { type: 'remove-hazards' }                                    // Rapid Spin / Defog
  | { type: 'screen'; screen: ScreenType; turns: number }
  | { type: 'ohko' }                                              // One-hit KO (Fissure, etc.)
  | { type: 'fixed-damage'; damage: number }                      // Fixed damage (Dragon Rage = 40)
  | { type: 'level-damage' }                                      // Damage = user's level (Night Shade)
  | { type: 'multi-hit'; min: number; max: number }               // Hits 2-5 times
  | { type: 'two-turn'; firstTurn: 'charge' | 'fly' | 'dig' | 'dive' | 'bounce' }
  | { type: 'switch-out'; target: 'self' | 'foe' }               // U-turn, Dragon Tail
  | { type: 'protect' }
  | { type: 'custom'; handler: string }                           // Complex moves with custom logic

interface StatChange {
  stat: keyof StatBlock | 'accuracy' | 'evasion';
  stages: number;     // Positive = raise, negative = lower
}
```

### 5.4 Ability Schema (`abilities.json`)

```typescript
interface AbilityData {
  id: string;                     // "blaze"
  displayName: string;            // "Blaze"
  description: string;
  triggers: AbilityTrigger[];     // When this ability activates
}

type AbilityTrigger =
  | 'on-switch-in'               // Intimidate, Drizzle, Sand Stream
  | 'on-before-move'             // Protean, Libero
  | 'on-after-move-hit'          // Rough Skin, Iron Barbs, Flame Body
  | 'on-damage-taken'            // Sturdy, Multiscale
  | 'on-stat-change'             // Clear Body, Competitive, Defiant
  | 'on-status-inflicted'        // Immunity, Limber, Vital Spirit
  | 'on-weather-change'          // Sand Rush, Swift Swim, Chlorophyll
  | 'on-terrain-change'          // Surge abilities
  | 'on-turn-end'                // Speed Boost, Moody, Poison Heal
  | 'on-hp-threshold'            // Blaze, Torrent, Overgrow, Swarm
  | 'on-faint'                   // Aftermath
  | 'passive-modifier'           // Huge Power, Pure Power, Hustle
  | 'passive-immunity';          // Levitate, Flash Fire, Lightning Rod
```

### 5.5 Item Schema (`items.json`)

```typescript
interface ItemData {
  id: string;                     // "potion"
  displayName: string;            // "Potion"
  description: string;
  category: ItemCategory;
  pocket: BagPocket;              // Which bag pocket this goes in
  price: number;                  // Buy price (sell = price / 2)
  effect: ItemEffect;
  battleUsable: boolean;          // Can be used during battle?
  fieldUsable: boolean;           // Can be used outside battle?
  holdEffect?: HoldEffect;       // Effect when held by Pokemon
  spriteKey: string;              // Icon key in itemicons/
}

type ItemCategory =
  | 'pokeball'
  | 'medicine'
  | 'vitamin'
  | 'held-item'
  | 'battle-item'
  | 'berry'
  | 'tm'
  | 'key-item'
  | 'evolution-item';

type BagPocket =
  | 'items'
  | 'medicine'
  | 'pokeballs'
  | 'tms'
  | 'berries'
  | 'key-items';
```

### 5.6 Nature Schema (`natures.json`)

```typescript
interface NatureData {
  id: string;                     // "adamant"
  displayName: string;            // "Adamant"
  increased: keyof StatBlock | null;  // Stat boosted by 10% (null for neutral)
  decreased: keyof StatBlock | null;  // Stat reduced by 10% (null for neutral)
}
// 25 natures total: 5 neutral (Hardy, Docile, Serious, Bashful, Quirky) + 20 with modifiers
```

### 5.7 Type Chart (`typeChart.json`)

An 18x18 matrix. Stored as:

```typescript
// typeChart.json structure
{
  "normal":    { "normal": 1, "fire": 1, "water": 1, "electric": 1, "grass": 1, "ice": 1, "fighting": 1, "poison": 1, "ground": 1, "flying": 1, "psychic": 1, "bug": 1, "rock": 0.5, "ghost": 0, "dragon": 1, "dark": 1, "steel": 0.5, "fairy": 1 },
  "fire":      { ... },
  // ... all 18 types as both attacker and defender
}

// Access: typeChart[attackingType][defendingType] => multiplier (0, 0.25, 0.5, 1, 2, 4)
```

### 5.8 Enums & Constants

```typescript
// src/types/pokemon.ts

type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

type PrimaryStatus = 'burn' | 'poison' | 'badly-poisoned' | 'paralysis' | 'sleep' | 'freeze';

type VolatileStatus =
  | 'confusion' | 'infatuation' | 'leech-seed' | 'curse'
  | 'nightmare' | 'perish-song' | 'taunt' | 'torment'
  | 'encore' | 'disable' | 'yawn' | 'ingrain'
  | 'aqua-ring' | 'substitute' | 'focus-energy'
  | 'magnet-rise' | 'embargo' | 'heal-block'
  | 'flinch' | 'protect' | 'endure';

type WeatherType = 'rain' | 'sun' | 'sand' | 'snow' | 'harsh-sun' | 'heavy-rain' | 'strong-winds';

type TerrainType = 'electric' | 'grassy' | 'psychic' | 'misty';

type EntryHazardType = 'stealth-rock' | 'spikes' | 'toxic-spikes' | 'sticky-web';

type ScreenType = 'reflect' | 'light-screen' | 'aurora-veil';

type NatureId =
  | 'hardy' | 'lonely' | 'brave' | 'adamant' | 'naughty'
  | 'bold' | 'docile' | 'relaxed' | 'impish' | 'lax'
  | 'timid' | 'hasty' | 'serious' | 'jolly' | 'naive'
  | 'modest' | 'mild' | 'quiet' | 'bashful' | 'rash'
  | 'calm' | 'gentle' | 'sassy' | 'careful' | 'quirky';

type ExperienceGroup = 'fast' | 'medium-fast' | 'medium-slow' | 'slow' | 'erratic' | 'fluctuating';
```

---

