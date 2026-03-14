# Pokemon Fan Game — Core Systems

> EventBus, DataManager, Seeded PRNG, and stat calculation formulas.

---

## 6. Core Systems

### 6.1 EventBus

Typed pub/sub system used by all game systems. Decouples logic from rendering. Critical for future multiplayer (events get serialized over network).

```typescript
// src/systems/EventBus.ts
type EventMap = {
  // Battle events
  'battle:start': { type: 'wild' | 'trainer'; opponentName: string };
  'battle:turn-start': { turnNumber: number };
  'battle:move-used': { user: string; move: string; target: string };
  'battle:damage': { target: string; amount: number; currentHp: number; maxHp: number; effectiveness: number };
  'battle:faint': { pokemon: string; side: 0 | 1 };
  'battle:switch': { side: 0 | 1; outPokemon: string; inPokemon: string };
  'battle:status': { target: string; status: PrimaryStatus };
  'battle:weather': { weather: WeatherType | null; turns: number };
  'battle:stat-change': { target: string; stat: string; stages: number; currentStage: number };
  'battle:end': { winner: 0 | 1; expGains: { uid: string; exp: number }[] };
  'battle:catch-attempt': { pokeball: string; pokemon: string; shakes: number; caught: boolean };
  'battle:message': { text: string };

  // Overworld events
  'overworld:encounter': { route: string; pokemon: PokemonInstance };
  'overworld:trainer-spot': { trainerId: string };
  'overworld:interaction': { type: string; id: string };
  'overworld:map-change': { from: string; to: string };

  // Player events
  'player:heal': { pokemon: string; amount: number };
  'player:item-use': { item: string; target?: string };
  'player:level-up': { pokemon: string; newLevel: number; statsGained: StatBlock };
  'player:evolution': { pokemon: string; from: number; to: number };
  'player:move-learn': { pokemon: string; move: string };

  // UI events
  'ui:dialog': { text: string; choices?: string[] };
  'ui:dialog-complete': { choice?: number };
};

class EventBus {
  private listeners: Map<string, Set<Function>> = new Map();

  on<K extends keyof EventMap>(event: K, callback: (data: EventMap[K]) => void): void;
  off<K extends keyof EventMap>(event: K, callback: (data: EventMap[K]) => void): void;
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
  once<K extends keyof EventMap>(event: K, callback: (data: EventMap[K]) => void): void;
}
```

### 6.2 DataManager

Loads and caches all JSON data. Provides typed access. Initialized in `BootScene`.

```typescript
class DataManager {
  private pokemon: Map<number, PokemonSpeciesData>;    // Keyed by national dex ID
  private pokemonByName: Map<string, PokemonSpeciesData>; // Keyed by name
  private moves: Map<string, MoveData>;                // Keyed by move ID
  private abilities: Map<string, AbilityData>;         // Keyed by ability ID
  private items: Map<string, ItemData>;                // Keyed by item ID
  private natures: Map<NatureId, NatureData>;          // Keyed by nature ID
  private typeChart: Record<PokemonType, Record<PokemonType, number>>;
  private experienceGroups: Record<ExperienceGroup, (level: number) => number>;
  private encounterTables: Map<string, EncounterTable>; // Keyed by route/area ID
  private trainers: Map<string, TrainerData>;           // Keyed by trainer ID

  async loadAll(): Promise<void>;  // Called from BootScene

  // Typed getters — throw if not found (data should always be valid)
  getSpecies(id: number): PokemonSpeciesData;
  getSpeciesByName(name: string): PokemonSpeciesData;
  getMove(id: string): MoveData;
  getAbility(id: string): AbilityData;
  getItem(id: string): ItemData;
  getNature(id: NatureId): NatureData;
  getTypeEffectiveness(attackType: PokemonType, defendType: PokemonType): number;
  getExpForLevel(group: ExperienceGroup, level: number): number;
  getEncounterTable(routeId: string): EncounterTable;
  getTrainer(id: string): TrainerData;
}
```

### 6.3 Seeded PRNG

Deterministic random number generation. Critical for reproducible battles and future multiplayer.

```typescript
// src/utils/random.ts
// Uses Mulberry32 algorithm — fast, deterministic, good distribution

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  // Returns float in [0, 1)
  next(): number;

  // Returns integer in [min, max] inclusive
  int(min: number, max: number): number;

  // Returns true with given probability (0-1)
  chance(probability: number): boolean;

  // Returns random element from array
  pick<T>(array: T[]): T;

  // Shuffles array in-place (Fisher-Yates)
  shuffle<T>(array: T[]): T[];

  // Returns current seed state (for serialization)
  getState(): number;

  // Restores seed state (for deserialization)
  setState(state: number): void;
}

// Global instance — re-seeded per battle
export let rng: SeededRandom;
export function seedRng(seed: number): void {
  rng = new SeededRandom(seed);
}
```

### 6.4 Stat Calculation

```typescript
// src/utils/math.ts

// Gen 3+ HP formula
function calculateHp(base: number, iv: number, ev: number, level: number): number {
  if (base === 1) return 1; // Shedinja
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

// Gen 3+ other stat formula
function calculateStat(
  base: number, iv: number, ev: number, level: number, natureMod: number
): number {
  return Math.floor(
    (Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureMod
  );
}

// Nature modifier: 1.1 for boosted, 0.9 for reduced, 1.0 for neutral
function getNatureModifier(nature: NatureData, stat: keyof StatBlock): number {
  if (nature.increased === stat) return 1.1;
  if (nature.decreased === stat) return 0.9;
  return 1.0;
}

// Calculate all stats for a PokemonInstance
function calculateAllStats(pokemon: PokemonInstance, species: PokemonSpeciesData, nature: NatureData): StatBlock;

// Experience required for a given level in a given group
function getExpForLevel(group: ExperienceGroup, level: number): number;

// Experience gained from defeating a Pokemon
function calculateExpGain(
  defeatedSpecies: PokemonSpeciesData,
  defeatedLevel: number,
  isTrainerBattle: boolean,
  participantLevel: number
): number;
```

---

