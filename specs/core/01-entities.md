# Core Pokémon Library — Entity Definitions

> All TypeScript interfaces, types, and enums for the core data model.
>
> These interfaces use the "modern" (Gen 3+) superset model — they have fields for
> abilities, natures, SpAtk/SpDef split, etc. Each gen package (`@pokemon-lib-ts/gen1`
> through `@pokemon-lib-ts/gen9`) populates these same interfaces with generation-appropriate
> values. For example, Gen 1 data fills `abilities.normal` with `[]` and `natures.json`
> is empty, while Gen 9 data fills them fully. The interfaces are permissive enough
> to represent any generation's Pokémon data without needing gen-specific interface variants.
>
> Each gen package has its own **complete, standalone data files** — no overlays or diffs.
> See `core/00-architecture.md` § 8 for the rationale.

---

## 1. Primitive Types & Enums

These are the building blocks used throughout both libraries.

### 1.1 Pokémon Types

```typescript
/**
 * All 18 Pokémon types (as of Gen 6+).
 * Gen 1 had 15 (no Dark, Steel, Fairy).
 * Gen 2 added Dark and Steel.
 * Gen 6 added Fairy.
 * Generation plugins in the battle library filter this list as needed.
 */
export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

/** Number of types per generation — used by battle gen plugins to validate data */
export const TYPES_BY_GEN: Record<number, readonly PokemonType[]> = {
  1: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon'],
  2: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel'],
  3: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel'],
  4: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel'],
  5: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel'],
  6: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'],
  7: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'],
  8: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'],
  9: ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'],
} as const;
```

### 1.2 Stats

```typescript
/**
 * The six core stats. This is the Gen 3+ model with separate
 * Special Attack and Special Defense.
 *
 * Gen 1-2 note: Gen 1 had a single "Special" stat. Gen 2 split it into
 * SpAtk/SpDef but with different base values. The battle library's
 * Gen 1/Gen 2 plugins handle this mapping.
 */
export interface StatBlock {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly spAttack: number;
  readonly spDefense: number;
  readonly speed: number;
}

/** Mutable version of StatBlock — used for computed stats that change at runtime */
export interface MutableStatBlock {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

/** Stat keys as a union type (excludes HP for certain formulas) */
export type StatName = keyof StatBlock;

/** Non-HP stats (used in nature modifiers — natures don't affect HP) */
export type NonHpStat = Exclude<StatName, 'hp'>;

/** Battle stat modifiers — includes accuracy and evasion which aren't core stats */
export type BattleStat = StatName | 'accuracy' | 'evasion';
```

### 1.3 Status Conditions

```typescript
/**
 * Primary status conditions — only one can be active at a time.
 * These persist outside of battle (except badly-poisoned which reverts to poison).
 */
export type PrimaryStatus =
  | 'burn'
  | 'poison'
  | 'badly-poisoned'   // Toxic — escalating damage. Reverts to 'poison' outside battle in Gen 1-4.
  | 'paralysis'
  | 'sleep'
  | 'freeze';

/**
 * Volatile status conditions — can have multiple at once.
 * These are cleared when the Pokémon switches out or the battle ends.
 */
export type VolatileStatus =
  | 'confusion'
  | 'infatuation'
  | 'leech-seed'
  | 'curse'            // Ghost-type Curse effect
  | 'nightmare'
  | 'perish-song'
  | 'taunt'
  | 'torment'
  | 'encore'
  | 'disable'
  | 'yawn'
  | 'ingrain'
  | 'aqua-ring'
  | 'substitute'
  | 'focus-energy'
  | 'magnet-rise'
  | 'embargo'
  | 'heal-block'
  | 'flinch'
  | 'protect'
  | 'endure'
  | 'drowsy'           // Gen 9 — from Yawn equivalent
  | 'bound'            // Bind, Wrap, Fire Spin, etc.
  | 'no-retreat'       // Gen 8
  | 'tar-shot'         // Gen 8
  | 'octolock';        // Gen 8
```

### 1.4 Weather & Terrain

```typescript
export type WeatherType =
  | 'rain'
  | 'sun'
  | 'sand'
  | 'snow'             // Gen 9 renamed Hail to Snow
  | 'hail'             // Gen 1-8
  | 'harsh-sun'        // Primal Groudon
  | 'heavy-rain'       // Primal Kyogre
  | 'strong-winds';    // Mega Rayquaza

export type TerrainType =
  | 'electric'
  | 'grassy'
  | 'psychic'
  | 'misty';
```

### 1.5 Field Effects

```typescript
export type EntryHazardType =
  | 'stealth-rock'     // Gen 4+
  | 'spikes'           // Gen 2+
  | 'toxic-spikes'     // Gen 4+
  | 'sticky-web';      // Gen 6+

export type ScreenType =
  | 'reflect'
  | 'light-screen'
  | 'aurora-veil';     // Gen 7+

/** Max number of layers for stacking hazards */
export const HAZARD_MAX_LAYERS: Record<EntryHazardType, number> = {
  'stealth-rock': 1,
  'spikes': 3,
  'toxic-spikes': 2,
  'sticky-web': 1,
} as const;
```

### 1.6 Natures

```typescript
export type NatureId =
  | 'hardy' | 'lonely' | 'brave' | 'adamant' | 'naughty'
  | 'bold' | 'docile' | 'relaxed' | 'impish' | 'lax'
  | 'timid' | 'hasty' | 'serious' | 'jolly' | 'naive'
  | 'modest' | 'mild' | 'quiet' | 'bashful' | 'rash'
  | 'calm' | 'gentle' | 'sassy' | 'careful' | 'quirky';

/** The 5 neutral natures (no stat modification) */
export const NEUTRAL_NATURES: readonly NatureId[] = [
  'hardy', 'docile', 'serious', 'bashful', 'quirky'
] as const;
```

### 1.7 Experience Groups

```typescript
export type ExperienceGroup =
  | 'erratic'       // 600,000 EXP to level 100
  | 'fast'          // 800,000 EXP to level 100
  | 'medium-fast'   // 1,000,000 EXP to level 100
  | 'medium-slow'   // 1,059,860 EXP to level 100
  | 'slow'          // 1,250,000 EXP to level 100
  | 'fluctuating';  // 1,640,000 EXP to level 100
```

### 1.8 Gender

```typescript
export type Gender = 'male' | 'female' | 'genderless';
```

### 1.9 Move Enums

```typescript
export type MoveCategory = 'physical' | 'special' | 'status';

/**
 * Move targeting categories.
 * In singles, most of these resolve to the same thing (the opponent),
 * but they matter for doubles/triples.
 */
export type MoveTarget =
  | 'adjacent-foe'        // Single adjacent opponent
  | 'all-adjacent-foes'   // Both opponents in doubles
  | 'adjacent-ally'       // Single adjacent ally (doubles)
  | 'self'                // User only
  | 'all-adjacent'        // All adjacent (foes + allies)
  | 'user-and-allies'     // User + allies
  | 'all-foes'            // All opponents
  | 'entire-field'        // Affects whole field
  | 'user-field'          // User's side (screens, hazards)
  | 'foe-field'           // Opponent's side (hazards)
  | 'random-foe'          // Random opponent
  | 'any';                // Any single target (used in doubles)
```

### 1.10 Item Enums

```typescript
export type ItemCategory =
  | 'pokeball'
  | 'medicine'
  | 'vitamin'
  | 'held-item'
  | 'battle-item'
  | 'berry'
  | 'tm'
  | 'hm'               // Gen 1-6
  | 'tr'               // Gen 8 (Technical Records)
  | 'key-item'
  | 'evolution-item'
  | 'mail'             // Gen 2-4
  | 'gem'              // Gen 5+
  | 'z-crystal'        // Gen 7
  | 'mega-stone';      // Gen 6-7

export type BagPocket =
  | 'items'
  | 'medicine'
  | 'pokeballs'
  | 'tms'
  | 'berries'
  | 'key-items'
  | 'battle-items'
  | 'treasures';       // Sellable items
```

### 1.11 Generation Identifier

```typescript
/** Supported game generations */
export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Human-readable generation names */
export const GENERATION_NAMES: Record<Generation, string> = {
  1: 'Red / Blue / Yellow',
  2: 'Gold / Silver / Crystal',
  3: 'Ruby / Sapphire / Emerald',
  4: 'Diamond / Pearl / Platinum',
  5: 'Black / White / B2W2',
  6: 'X / Y / ORAS',
  7: 'Sun / Moon / USUM',
  8: 'Sword / Shield',
  9: 'Scarlet / Violet',
} as const;

/** National dex range per generation (cumulative) */
export const DEX_RANGE: Record<Generation, { start: number; end: number }> = {
  1: { start: 1, end: 151 },
  2: { start: 1, end: 251 },
  3: { start: 1, end: 386 },
  4: { start: 1, end: 493 },
  5: { start: 1, end: 649 },
  6: { start: 1, end: 721 },
  7: { start: 1, end: 809 },
  8: { start: 1, end: 905 },
  9: { start: 1, end: 1025 },
} as const;
```

---

## 2. Core Entity Interfaces

### 2.1 Pokémon Species

Represents a species (e.g., "Charizard") — not an individual Pokémon.

```typescript
export interface PokemonSpeciesData {
  /** National Pokédex number */
  readonly id: number;

  /** Lowercase identifier (e.g., "charizard") */
  readonly name: string;

  /** Display name (e.g., "Charizard") */
  readonly displayName: string;

  /** One or two types */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats (Gen 3+ model with SpAtk/SpDef split) */
  readonly baseStats: StatBlock;

  /** Available abilities */
  readonly abilities: {
    readonly normal: readonly string[];    // 1-2 regular ability IDs
    readonly hidden: string | null;        // Hidden ability ID, or null
  };

  /** Gender ratio: percentage male. -1 = genderless. */
  readonly genderRatio: number;

  /** Base catch rate (0-255) */
  readonly catchRate: number;

  /** Base experience yield when defeated */
  readonly baseExp: number;

  /** Experience growth group */
  readonly expGroup: ExperienceGroup;

  /** EV yield when defeated */
  readonly evYield: Partial<StatBlock>;

  /** Egg groups for breeding */
  readonly eggGroups: readonly string[];

  /** Learnset — all moves this species can learn and how */
  readonly learnset: Learnset;

  /** Evolution data (null if doesn't evolve) */
  readonly evolution: EvolutionData | null;

  /** Physical dimensions */
  readonly dimensions: {
    readonly height: number;   // meters
    readonly weight: number;   // kg
  };

  /** Sprite lookup key (usually same as name) */
  readonly spriteKey: string;

  /** Base friendship/happiness (0-255) */
  readonly baseFriendship: number;

  /** Generation this species was introduced */
  readonly generation: Generation;

  /** Whether this is a legendary or mythical Pokémon */
  readonly isLegendary: boolean;
  readonly isMythical: boolean;

  // --- Form/Transformation Data (optional) ---

  /** Mega Evolution forms (Gen 6-7) */
  readonly megaEvolutions?: readonly MegaEvolutionData[];

  /** Gigantamax form data (Gen 8) */
  readonly gigantamaxForm?: GigantamaxData;

  /** Whether this species can Dynamax (Gen 8, default true) */
  readonly canDynamax?: boolean;

  /** Available Tera Types (Gen 9, default = same as species types) */
  readonly teraTypes?: readonly PokemonType[];

  /**
   * Regional forms (Alolan, Galarian, Hisuian, Paldean).
   * Each regional form is essentially a separate species entry
   * but linked to the original via this field.
   */
  readonly regionalForms?: readonly RegionalFormData[];
}
```

### 2.2 Learnset

```typescript
export interface Learnset {
  /** Moves learned by leveling up, ordered by level */
  readonly levelUp: readonly LevelUpMove[];

  /** Moves learned via TM/HM/TR */
  readonly tm: readonly string[];

  /** Moves available as egg moves */
  readonly egg: readonly string[];

  /** Moves taught by move tutor */
  readonly tutor: readonly string[];

  /** Moves obtainable only via special events */
  readonly event?: readonly string[];
}

export interface LevelUpMove {
  readonly level: number;
  readonly move: string;   // Move ID
}
```

### 2.3 Evolution Data

```typescript
export interface EvolutionData {
  /** What this species evolves from (null if base form) */
  readonly from: EvolutionLink | null;

  /** What this species can evolve into */
  readonly to: readonly EvolutionLink[];
}

export interface EvolutionLink {
  /** Target species ID */
  readonly speciesId: number;

  /** How the evolution is triggered */
  readonly method: EvolutionMethod;

  /** Minimum level required (for level-up evolutions) */
  readonly level?: number;

  /** Item required (for item-use or held-item evolutions) */
  readonly item?: string;

  /** Special condition description */
  readonly condition?: string;

  /** Gender requirement */
  readonly gender?: Gender;

  /** Time of day requirement */
  readonly timeOfDay?: 'day' | 'night';

  /** Required held item during trade */
  readonly tradeItem?: string;

  /** Required known move */
  readonly knownMove?: string;

  /** Required known move type */
  readonly knownMoveType?: PokemonType;

  /** Required friendship level */
  readonly minFriendship?: number;

  /** Required location */
  readonly location?: string;
}

export type EvolutionMethod =
  | 'level-up'          // Reach a certain level
  | 'trade'             // Trade (with or without item)
  | 'use-item'          // Use item on Pokémon
  | 'friendship'        // Level up with high friendship
  | 'friendship-day'    // Level up with high friendship during day
  | 'friendship-night'  // Level up with high friendship at night
  | 'special';          // Other conditions (Tyrogue, Wurmple, etc.)
```

### 2.4 Transformation Data

```typescript
export interface MegaEvolutionData {
  /** Form identifier: "mega", "mega-x", "mega-y" */
  readonly form: string;

  /** Required held Mega Stone item ID */
  readonly item: string;

  /** Types in Mega form */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats in Mega form */
  readonly baseStats: StatBlock;

  /** Ability in Mega form */
  readonly ability: string;
}

export interface GigantamaxData {
  /** The G-Max Move this species gets */
  readonly gMaxMove: {
    readonly type: PokemonType;
    readonly name: string;
    readonly basePower: number;
    readonly effect: string;
  };
}

export interface RegionalFormData {
  /** Region identifier */
  readonly region: 'alola' | 'galar' | 'hisui' | 'paldea';

  /** Species ID of the regional form (PokeAPI assigns separate IDs) */
  readonly formSpeciesId: number;

  /** Types of the regional form */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats of the regional form */
  readonly baseStats: StatBlock;

  /** Abilities of the regional form */
  readonly abilities: {
    readonly normal: readonly string[];
    readonly hidden: string | null;
  };
}
```

### 2.5 Pokémon Instance

An individual Pokémon — one specific Pikachu in the player's party.

```typescript
export interface PokemonInstance {
  /** Unique identifier for this individual */
  readonly uid: string;

  /** Species ID (references PokemonSpeciesData.id) */
  readonly speciesId: number;

  /** Nickname (null = use species display name) */
  nickname: string | null;

  /** Current level (1-100) */
  level: number;

  /** Current total experience points */
  experience: number;

  /** Nature */
  readonly nature: NatureId;

  /** Individual Values (0-31 per stat, determined at creation) */
  readonly ivs: StatBlock;

  /** Effort Values (0-252 per stat, 510 total cap) */
  evs: MutableStatBlock;

  /** Current HP (0 to max) */
  currentHp: number;

  /** Learned moves (1-4 slots) */
  moves: MoveSlot[];

  /** Active ability ID */
  ability: string;

  /** Which ability slot this is from */
  readonly abilitySlot: 'normal1' | 'normal2' | 'hidden';

  /** Held item ID (null = no item) */
  heldItem: string | null;

  /** Primary status condition (null = healthy) */
  status: PrimaryStatus | null;

  /** Friendship / happiness (0-255) */
  friendship: number;

  /** Gender */
  readonly gender: Gender;

  /** Whether this individual is shiny */
  readonly isShiny: boolean;

  /** Where this Pokémon was caught/received */
  readonly metLocation: string;

  /** Level when caught/received */
  readonly metLevel: number;

  /** OT name */
  readonly originalTrainer: string;

  /** OT ID number */
  readonly originalTrainerId: number;

  /** Ball this Pokémon was caught in */
  readonly pokeball: string;

  // --- Cached computed values (not serialized) ---

  /** Computed stats — recalculated when level/EVs/nature change */
  calculatedStats?: StatBlock;

  // --- Generation-specific fields ---

  /** Tera Type for Gen 9 battles */
  teraType?: PokemonType;

  /** Dynamax Level for Gen 8 battles (0-10) */
  dynamaxLevel?: number;
}

export interface MoveSlot {
  /** Move ID (references MoveData.id) */
  readonly moveId: string;

  /** Current PP remaining */
  currentPP: number;

  /** Maximum PP (base PP * (1 + 0.2 * ppUps)) */
  maxPP: number;

  /** PP Ups applied (0-3) */
  ppUps: number;
}
```

### 2.6 Pokemon Creation Options

```typescript
/** Options for creating a new PokemonInstance */
export interface PokemonCreationOptions {
  nickname: string | null;
  nature: NatureId;
  ivs: StatBlock;
  evs: MutableStatBlock;
  abilitySlot: 'normal1' | 'normal2' | 'hidden';
  gender: Gender;
  isShiny: boolean;
  moves: string[];           // Move IDs — if empty, uses latest level-up moves
  heldItem: string | null;
  friendship: number;
  metLocation: string;
  originalTrainer: string;
  originalTrainerId: number;
  pokeball: string;
  teraType: PokemonType;
  dynamaxLevel: number;
}
```

---

## 3. Move Interfaces

### 3.1 Move Data

```typescript
export interface MoveData {
  /** Lowercase identifier (e.g., "flamethrower") */
  readonly id: string;

  /** Display name (e.g., "Flamethrower") */
  readonly displayName: string;

  /** Move type */
  readonly type: PokemonType;

  /** Physical, Special, or Status */
  readonly category: MoveCategory;

  /** Base power (null for status moves and variable-power moves) */
  readonly power: number | null;

  /** Accuracy percentage (null = never misses) */
  readonly accuracy: number | null;

  /** Base Power Points */
  readonly pp: number;

  /** Priority bracket (-7 to +5) */
  readonly priority: number;

  /** Targeting category */
  readonly target: MoveTarget;

  /** Move flags (contact, sound, etc.) */
  readonly flags: MoveFlags;

  /** Effect data (null for pure damage moves) */
  readonly effect: MoveEffect | null;

  /** Flavor text description */
  readonly description: string;

  /** Generation this move was introduced */
  readonly generation: Generation;

  // --- Generation-specific fields ---

  /** Z-Move base power (Gen 7) */
  readonly zMovePower?: number;

  /** Z-Move effect for status moves (Gen 7) */
  readonly zMoveEffect?: string;

  /** Max Move base power (Gen 8) */
  readonly maxMovePower?: number;

  /**
   * Category override history — some moves changed category across gens.
   * In Gen 1-3, category was determined by TYPE (all Fire moves were Special).
   * In Gen 4+, each move has its own category.
   * The main `category` field reflects the Gen 4+ value.
   * Gen plugins use this field to look up the correct category for their gen.
   */
  readonly categoryByGen?: Partial<Record<Generation, MoveCategory>>;
}
```

### 3.2 Move Flags

```typescript
export interface MoveFlags {
  readonly contact: boolean;       // Makes contact (Rough Skin, Flame Body, etc.)
  readonly sound: boolean;         // Sound-based (bypasses Substitute, Soundproof blocks)
  readonly bullet: boolean;        // Bullet/ball move (Bulletproof blocks)
  readonly pulse: boolean;         // Pulse move (Mega Launcher boosts 50%)
  readonly punch: boolean;         // Punching move (Iron Fist boosts 20%)
  readonly bite: boolean;          // Biting move (Strong Jaw boosts 50%)
  readonly wind: boolean;          // Wind move (Wind Rider, Wind Power trigger)
  readonly slicing: boolean;       // Slicing move (Sharpness boosts 50%, Gen 9)
  readonly powder: boolean;        // Powder/spore move (Grass types immune Gen 6+)
  readonly protect: boolean;       // Blocked by Protect/Detect/Baneful Bunker/etc.
  readonly mirror: boolean;        // Reflected by Mirror Move / Magic Bounce
  readonly snatch: boolean;        // Stolen by Snatch
  readonly gravity: boolean;       // Disabled by Gravity (Fly, Bounce, etc.)
  readonly defrost: boolean;       // Thaws user if frozen (Scald, Flame Wheel, etc.)
  readonly recharge: boolean;      // Requires recharge next turn (Hyper Beam)
  readonly charge: boolean;        // Two-turn move (Solar Beam, Fly, Dig)
  readonly bypassSubstitute: boolean; // Hits through Substitute (sound moves, etc.)
}
```

### 3.3 Move Effects

```typescript
/**
 * Discriminated union of all possible move effect types.
 * The `type` field enables exhaustive switch statements.
 */
export type MoveEffect =
  | DamageEffect
  | StatusChanceEffect
  | StatusGuaranteedEffect
  | StatChangeEffect
  | VolatileStatusEffect
  | HealEffect
  | RecoilEffect
  | DrainEffect
  | WeatherEffect
  | TerrainEffect
  | EntryHazardEffect
  | RemoveHazardsEffect
  | ScreenEffect
  | OhkoEffect
  | FixedDamageEffect
  | LevelDamageEffect
  | MultiHitEffect
  | TwoTurnEffect
  | SwitchOutEffect
  | ProtectEffect
  | MultiEffect
  | CustomEffect;

interface DamageEffect { readonly type: 'damage'; }

interface StatusChanceEffect {
  readonly type: 'status-chance';
  readonly status: PrimaryStatus;
  readonly chance: number;        // 0-100
}

interface StatusGuaranteedEffect {
  readonly type: 'status-guaranteed';
  readonly status: PrimaryStatus;
}

interface StatChangeEffect {
  readonly type: 'stat-change';
  readonly changes: readonly StatChange[];
  readonly target: 'self' | 'foe';
  readonly chance: number;        // 0-100 (100 = guaranteed)
}

interface VolatileStatusEffect {
  readonly type: 'volatile-status';
  readonly status: VolatileStatus;
  readonly chance: number;
}

interface HealEffect {
  readonly type: 'heal';
  readonly amount: number;        // Fraction of max HP (0.5 = 50%)
}

interface RecoilEffect {
  readonly type: 'recoil';
  readonly amount: number;        // Fraction of damage dealt
}

interface DrainEffect {
  readonly type: 'drain';
  readonly amount: number;        // Fraction of damage dealt that heals user
}

interface WeatherEffect {
  readonly type: 'weather';
  readonly weather: WeatherType;
  readonly turns: number;         // 5 default, 8 with weather rock
}

interface TerrainEffect {
  readonly type: 'terrain';
  readonly terrain: TerrainType;
  readonly turns: number;
}

interface EntryHazardEffect {
  readonly type: 'entry-hazard';
  readonly hazard: EntryHazardType;
}

interface RemoveHazardsEffect {
  readonly type: 'remove-hazards';
  readonly method: 'spin' | 'defog';  // Defog also removes screens
}

interface ScreenEffect {
  readonly type: 'screen';
  readonly screen: ScreenType;
  readonly turns: number;
}

interface OhkoEffect {
  readonly type: 'ohko';
}

interface FixedDamageEffect {
  readonly type: 'fixed-damage';
  readonly damage: number;        // e.g., Dragon Rage = 40, Sonic Boom = 20
}

interface LevelDamageEffect {
  readonly type: 'level-damage';  // Damage = user's level (Night Shade, Seismic Toss)
}

interface MultiHitEffect {
  readonly type: 'multi-hit';
  readonly min: number;
  readonly max: number;           // Usually 2-5
}

interface TwoTurnEffect {
  readonly type: 'two-turn';
  readonly firstTurn: 'charge' | 'fly' | 'dig' | 'dive' | 'bounce' | 'phantom-force' | 'shadow-force' | 'solar-beam' | 'meteor-beam' | 'electro-shot';
}

interface SwitchOutEffect {
  readonly type: 'switch-out';
  readonly who: 'self' | 'foe';   // U-turn = self, Dragon Tail = foe
}

interface ProtectEffect {
  readonly type: 'protect';
  readonly variant: 'standard' | 'baneful-bunker' | 'spiky-shield' | 'kings-shield' | 'silk-trap' | 'burning-bulwark';
}

/**
 * Moves with multiple effects (e.g., Scald: damage + 30% burn).
 * The effects list is applied in order.
 */
interface MultiEffect {
  readonly type: 'multi';
  readonly effects: readonly MoveEffect[];
}

/**
 * Complex moves that need custom handler logic.
 * The handler string maps to a registered function in the battle engine.
 */
interface CustomEffect {
  readonly type: 'custom';
  readonly handler: string;       // e.g., "metronome", "mirror-move", "transform"
}

export interface StatChange {
  readonly stat: BattleStat;
  readonly stages: number;        // Positive = raise, negative = lower
}
```

---

## 4. Ability Interface

```typescript
export interface AbilityData {
  /** Lowercase identifier (e.g., "blaze") */
  readonly id: string;

  /** Display name (e.g., "Blaze") */
  readonly displayName: string;

  /** Description of the ability's effect */
  readonly description: string;

  /** When this ability activates — used by the battle engine to register handlers */
  readonly triggers: readonly AbilityTrigger[];

  /** Generation this ability was introduced */
  readonly generation: Generation;

  /** Whether this ability can be suppressed (Gastro Acid, Mold Breaker, etc.) */
  readonly suppressible: boolean;

  /** Whether this ability can be copied (Trace, Role Play) */
  readonly copyable: boolean;

  /** Whether this ability can be swapped (Skill Swap) */
  readonly swappable: boolean;
}

export type AbilityTrigger =
  | 'on-switch-in'           // Intimidate, Drizzle, Sand Stream
  | 'on-switch-out'          // Regenerator, Natural Cure
  | 'on-before-move'         // Protean, Libero
  | 'on-after-move-hit'      // Rough Skin, Iron Barbs, Flame Body
  | 'on-after-move-used'     // Moxie (after KO), Magician
  | 'on-damage-taken'        // Sturdy, Multiscale, Disguise
  | 'on-damage-calc'         // Huge Power, Hustle, Sand Force (modifies damage)
  | 'on-stat-change'         // Clear Body, Competitive, Defiant
  | 'on-status-inflicted'    // Immunity, Limber, Vital Spirit
  | 'on-weather-change'      // Sand Rush, Swift Swim, Chlorophyll
  | 'on-terrain-change'      // Surge abilities
  | 'on-turn-end'            // Speed Boost, Moody, Poison Heal
  | 'on-hp-threshold'        // Blaze, Torrent, Overgrow, Swarm
  | 'on-faint'               // Aftermath
  | 'on-contact'             // Static, Flame Body, Poison Point
  | 'on-critical-hit'        // Anger Point, Sniper
  | 'on-accuracy-check'      // Compound Eyes, Hustle (accuracy modification)
  | 'on-priority-check'      // Prankster, Gale Wings, Triage
  | 'on-type-effectiveness'  // Filter, Solid Rock, Prism Armor
  | 'on-item-use'            // Unnerve, Ripen
  | 'passive-modifier'       // Huge Power, Pure Power, Hustle
  | 'passive-immunity';      // Levitate, Flash Fire, Lightning Rod, Volt Absorb
```

---

## 5. Item Interfaces

```typescript
export interface ItemData {
  /** Lowercase identifier (e.g., "potion") */
  readonly id: string;

  /** Display name (e.g., "Potion") */
  readonly displayName: string;

  /** Description */
  readonly description: string;

  /** Item category */
  readonly category: ItemCategory;

  /** Bag pocket this item goes in */
  readonly pocket: BagPocket;

  /** Buy price in PokéDollars (sell = price / 2) */
  readonly price: number;

  /** Whether this item can be used in battle */
  readonly battleUsable: boolean;

  /** Whether this item can be used outside battle */
  readonly fieldUsable: boolean;

  /** Effect when used from the bag */
  readonly useEffect?: ItemUseEffect;

  /** Effect when held by a Pokémon */
  readonly holdEffect?: HoldEffect;

  /** Generation this item was introduced */
  readonly generation: Generation;

  /** Sprite/icon key */
  readonly spriteKey: string;

  /** Fling base power (Gen 4+, for Fling move) */
  readonly flingPower?: number;

  /** Fling effect (Gen 4+) */
  readonly flingEffect?: string;
}

/** Effect when an item is actively used */
export type ItemUseEffect =
  | { readonly type: 'heal-hp'; readonly amount: number }
  | { readonly type: 'heal-hp-fraction'; readonly fraction: number }
  | { readonly type: 'heal-status'; readonly status: PrimaryStatus | 'all' }
  | { readonly type: 'heal-pp'; readonly amount: number | 'all' }
  | { readonly type: 'revive'; readonly hpFraction: number }
  | { readonly type: 'boost-stat'; readonly stat: StatName; readonly evAmount: number }
  | { readonly type: 'rare-candy' }
  | { readonly type: 'evolution-trigger' }
  | { readonly type: 'catch'; readonly catchRateModifier: number; readonly bonusCondition?: string }
  | { readonly type: 'battle-boost'; readonly stat: BattleStat; readonly stages: number }
  | { readonly type: 'custom'; readonly handler: string };

/** Effect when a Pokémon holds this item */
export type HoldEffect =
  | { readonly type: 'stat-boost'; readonly stat: StatName; readonly multiplier: number }
  | { readonly type: 'type-boost'; readonly moveType: PokemonType; readonly multiplier: number }
  | { readonly type: 'choice-lock'; readonly stat: StatName; readonly multiplier: number }
  | { readonly type: 'life-orb'; readonly damageMultiplier: number; readonly recoilFraction: number }
  | { readonly type: 'leftovers'; readonly healFraction: number }
  | { readonly type: 'berry'; readonly trigger: string; readonly effect: string }
  | { readonly type: 'focus-sash' }
  | { readonly type: 'eviolite' }
  | { readonly type: 'assault-vest' }
  | { readonly type: 'weather-extend'; readonly weather: WeatherType }
  | { readonly type: 'terrain-extend'; readonly terrain: TerrainType }
  | { readonly type: 'mega-stone'; readonly species: number; readonly form: string }
  | { readonly type: 'z-crystal'; readonly moveType: PokemonType }
  | { readonly type: 'custom'; readonly handler: string };
```

---

## 6. Nature Interface

```typescript
export interface NatureData {
  /** Lowercase identifier (e.g., "adamant") */
  readonly id: NatureId;

  /** Display name (e.g., "Adamant") */
  readonly displayName: string;

  /** Stat increased by 10% (null for neutral natures) */
  readonly increased: NonHpStat | null;

  /** Stat decreased by 10% (null for neutral natures) */
  readonly decreased: NonHpStat | null;

  /** Flavor this nature likes (for PokéBlocks/Poffins) */
  readonly likedFlavor: string | null;

  /** Flavor this nature dislikes */
  readonly dislikedFlavor: string | null;
}
```

---

## 7. Type Chart Interface

```typescript
/**
 * Type effectiveness chart — a mapping from attacking type to defending type to multiplier.
 * Multiplier values: 0 (immune), 0.5 (not very effective), 1 (neutral), 2 (super effective).
 *
 * For dual-typed defenders, multiply the two multipliers together:
 * e.g., Ice vs. Dragon/Flying = 2 * 2 = 4 (double super effective).
 *
 * The type chart has changed across generations:
 * - Gen 1: No Dark, Steel, Fairy. Ghost was bugged (0x vs Psychic, should be 2x).
 * - Gen 2-5: Added Dark and Steel. Fixed Ghost vs Psychic.
 * - Gen 6+: Added Fairy. Steel lost resistance to Ghost and Dark.
 *
 * The core library provides the full Gen 6+ chart.
 * Battle library gen plugins can provide their own charts.
 */
export type TypeChart = Record<PokemonType, Record<PokemonType, number>>;
```

---

## 8. Trainer Interface

```typescript
export interface TrainerData {
  /** Unique trainer identifier */
  readonly id: string;

  /** Display name */
  readonly displayName: string;

  /** Trainer class (e.g., "Bug Catcher", "Gym Leader") */
  readonly trainerClass: string;

  /** Team definition */
  readonly team: readonly TrainerPokemon[];

  /** AI tier (1 = random, 2 = type-aware, 3 = competitive) */
  readonly aiTier: 1 | 2 | 3;

  /** Money reward multiplier */
  readonly rewardMultiplier: number;

  /** Pre-battle dialog */
  readonly beforeBattleDialog: readonly string[];

  /** Post-defeat dialog */
  readonly defeatDialog: readonly string[];

  /** Post-victory dialog (player lost) */
  readonly victoryDialog: readonly string[];

  /** Sprite key */
  readonly spriteKey: string;

  /** Battle BGM override (null = use default) */
  readonly battleMusic?: string;

  /** Whether this is a rematchable trainer */
  readonly rematchable: boolean;
}

export interface TrainerPokemon {
  readonly speciesId: number;
  readonly level: number;
  readonly moves?: readonly string[];  // If undefined, use default level-up moveset
  readonly ability?: string;           // If undefined, use first normal ability
  readonly heldItem?: string;
  readonly nature?: NatureId;          // If undefined, random
  readonly ivs?: Partial<StatBlock>;   // If undefined, defaults vary by AI tier
  readonly evs?: Partial<StatBlock>;   // If undefined, 0
}
```

---

## 9. Data Validation Types

Used by the DataManager to validate loaded data.

```typescript
export interface DataValidationResult {
  readonly valid: boolean;
  readonly errors: readonly DataValidationError[];
  readonly warnings: readonly DataValidationWarning[];
}

export interface DataValidationError {
  readonly entity: string;     // "pokemon", "move", "ability", etc.
  readonly id: string | number;
  readonly field: string;
  readonly message: string;
}

export interface DataValidationWarning {
  readonly entity: string;
  readonly id: string | number;
  readonly field: string;
  readonly message: string;
}
```

---
