<!-- SPEC FRONT-MATTER -->
<!-- status: IMPLEMENTED -->
<!-- last-updated: 2026-03-15 -->

# Battle Library — Architecture

> **Status: IMPLEMENTED** — Battle engine and ruleset interface implemented in `packages/battle/src/`. Code is the source of truth for method signatures.

> Pluggable generation system, state machine, event model, and how generation-specific
> rulesets integrate with the core engine.
>
> This library depends on `@pokemon-lib-ts/core` and nothing else.
> Zero game engine dependencies — pure TypeScript.

---

## Quick Start for AI Agents

**Core files**:
- `packages/battle/src/engine/BattleEngine.ts` — main engine (state machine, turn loop)
- `packages/battle/src/ruleset/GenerationRuleset.ts` — interface all gen packages implement
- `packages/battle/src/ruleset/BaseRuleset.ts` — default Gen 3+ implementations (Gen 3-9 extend this)
- `packages/battle/src/index.ts` — public exports

**Pattern**: Gen 1-2 implement `GenerationRuleset` directly. Gen 3-9 extend `BaseRuleset`.

**To add a new gen**: Read `specs/battle/0N-genN.md`, implement `GenerationRuleset`, extend `BaseRuleset` if Gen 3+.

**Tests**: `packages/battle/tests/` for engine tests. `packages/genN/tests/` for per-gen tests.

---

## 1. Vision

`@pokemon-lib-ts/battle` is a standalone Pokémon battle simulator that supports **every generation's mechanics** (Gen 1 through Gen 9) via a pluggable ruleset system. A consumer picks a generation, creates a battle, and the engine handles everything — turn order, damage calculation, status effects, abilities, items, weather, terrain, switching, and win conditions.

The engine is:
- **Deterministic** — given the same inputs and seed, produces the same outputs
- **Event-driven** — emits a stream of events that describe what happened (for UI rendering, logging, replay)
- **Headless** — no rendering, no DOM, no game engine. The consumer handles display.
- **Testable** — entire battles can be run in unit tests

---

## 2. Generation Plugin Architecture

### 2.1 The `GenerationRuleset` Interface

Every generation implements this interface. It's the contract between the core engine and gen-specific behavior.

```typescript
/**
 * A generation ruleset defines all the mechanics that vary between generations.
 * The battle engine delegates to this interface for anything that changed across gens.
 *
 * The engine provides the "skeleton" (state machine, event emission, turn loop)
 * and the ruleset provides the "flesh" (damage calc, type chart, crit formula, etc.).
 */
export interface GenerationRuleset {
  /** Generation number */
  readonly generation: Generation;

  /** Display name (e.g., "Gen 1 (RBY)") */
  readonly name: string;

  // --- Type System ---

  /** Type chart for this generation (may differ from modern) */
  getTypeChart(): TypeChart;

  /** Valid types in this generation */
  getValidTypes(): readonly PokemonType[];

  // --- Stat Calculation ---

  /**
   * Calculate all stats for a Pokémon.
   * Gen 1-2 use different formulas than Gen 3+.
   */
  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock;

  // --- Damage Calculation ---

  /**
   * Calculate damage for a move.
   * This is the most generation-specific function — every gen has subtle differences
   * in modifier order, rounding, and which factors apply.
   */
  calculateDamage(context: DamageContext): DamageResult;

  // --- Critical Hits ---

  /** Critical hit stage table for this gen */
  getCritRateTable(): readonly number[];

  /**
   * Critical hit damage multiplier applied after the damage formula.
   * Gen 2-5: 2x, Gen 6+: 1.5x.
   * Gen 1: returns 1 — crits are handled via level-doubling inside the damage formula itself,
   * not as a post-calc multiplier.
   */
  getCritMultiplier(): number;

  /**
   * Roll for critical hit.
   * Gen 1 uses Speed-based formula.
   * Gen 2+ uses stage-based probability table.
   */
  rollCritical(context: CritContext): boolean;

  // --- Turn Order ---

  /**
   * Resolve the order in which actions execute this turn.
   * Gen 1-4 resolve slightly differently from Gen 5+.
   */
  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[];

  // --- Move Execution ---

  /**
   * Check if a move hits (accuracy check).
   * Gen 1 has different accuracy mechanics.
   */
  doesMoveHit(context: AccuracyContext): boolean;

  /**
   * Execute a move's effect after damage calculation.
   * Handles secondary effects, stat changes, status infliction.
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult;

  // --- Status Conditions ---

  /**
   * Apply end-of-turn status damage (burn, poison, etc.).
   * The damage fractions changed across generations.
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number;

  /**
   * Check if a frozen Pokémon thaws this turn.
   * Thaw chance: Gen 1 = never (only via move),
   * Gen 2 freeze thaw: 25/256 (~9.8%) chance per turn, NOT 20%.
   * Gen 3+: 20%/turn.
   */
  checkFreezeThaw(pokemon: ActivePokemon, rng: SeededRandom): boolean;

  /**
   * Get the number of sleep turns.
   * Gen 1: 1-7, Gen 5+: 1-3.
   */
  rollSleepTurns(rng: SeededRandom): number;

  /**
   * Check if a paralyzed Pokémon is fully paralyzed this turn.
   * Gen 1-2: 63/256 (~24.6%), Gen 3+: 1/4 (exact 25%).
   */
  checkFullParalysis(pokemon: ActivePokemon, rng: SeededRandom): boolean;

  /**
   * Roll whether a confused Pokémon hits itself this turn.
   * Gen 1-6: 1/2 (50%), Gen 7+: 1/3 (~33%).
   */
  rollConfusionSelfHit(rng: SeededRandom): boolean;

  /**
   * Process one turn of sleep for a Pokémon.
   * Decrements the sleep counter and wakes the Pokémon if it reaches 0.
   * Returns true if the Pokémon can act this turn (Gen 5+: can act on wake turn).
   * Returns false if still sleeping, or woke up but cannot act (Gen 1-4).
   */
  processSleepTurn(pokemon: ActivePokemon, state: BattleState): boolean;

  // --- Abilities ---

  /**
   * Whether abilities exist in this generation.
   * Gen 1-2: false. Gen 3+: true.
   */
  hasAbilities(): boolean;

  /**
   * Apply an ability's effect at the appropriate trigger point.
   * No-ops for Gen 1-2.
   */
  applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult;

  // --- Items ---

  /**
   * Whether held items exist in this generation.
   * Gen 1: false. Gen 2+: true.
   */
  hasHeldItems(): boolean;

  /**
   * Apply a held item's effect at the appropriate trigger point.
   */
  applyHeldItem(trigger: string, context: ItemContext): ItemResult;

  // --- Weather ---

  /**
   * Whether weather mechanics exist in this generation.
   * Gen 1: false. Gen 2+: true.
   */
  hasWeather(): boolean;

  /** Apply end-of-turn weather effects (damage, etc.) */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[];

  // --- Terrain ---

  /**
   * Whether terrain mechanics exist in this generation.
   * Gen 1-6: false. Gen 7+: true.
   */
  hasTerrain(): boolean;

  /** Apply terrain effects */
  applyTerrainEffects(state: BattleState): TerrainEffectResult[];

  // --- Entry Hazards ---

  /**
   * Which entry hazards are available in this generation.
   * Gen 1: none. Gen 2: Spikes only. Gen 4: Stealth Rock, Toxic Spikes.
   * Gen 6: Sticky Web.
   */
  getAvailableHazards(): readonly EntryHazardType[];

  /** Calculate entry hazard damage on switch-in */
  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult;

  // --- EXP Gain ---

  /** Calculate EXP gained from defeating a Pokémon */
  calculateExpGain(context: ExpContext): number;

  // --- Battle Gimmick ---

  /**
   * The special battle mechanic for this generation (if any).
   * Gen 1-5: null. Gen 6-7: Mega Evolution. Gen 7: Z-Moves.
   * Gen 8: Dynamax. Gen 9: Terastallization.
   */
  getBattleGimmick(): BattleGimmick | null;

  // --- Validation ---

  /**
   * Validate that a Pokémon is legal for this generation.
   * Checks: species exists in this gen, moves are available,
   * ability is valid, held item is valid, etc.
   */
  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult;

  // --- Confusion ---

  /**
   * The probability (0-1) that a confused Pokémon hits itself.
   * Gen 1-6: 1/2 (50%). Gen 7+: 1/3.
   */
  getConfusionSelfHitChance(): number;

  /**
   * Calculate confusion self-hit damage.
   * Gen 1: simplified maxHP/8.
   * Gen 2+: actual 40 base power typeless physical damage formula.
   */
  calculateConfusionDamage(pokemon: ActivePokemon, state: BattleState, rng: SeededRandom): number;

  // --- Switch Out ---

  /**
   * Called when a Pokémon is switched out. Used to clear volatile
   * statuses that don't persist through switching (e.g., bind counter reset).
   * Gen 1: clears binding moves; Gen 2+: various volatile clears.
   */
  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void;

  // --- Switching ---

  /**
   * Whether Pursuit should execute before an opponent's switch.
   * Gen 2-7: true. Gen 1, Gen 8+: false.
   */
  shouldExecutePursuitPreSwitch(): boolean;

  /**
   * Whether a Pokémon is allowed to switch out.
   * Gen 1: checks for 'trapped' volatile (trapping moves like Wrap/Bind).
   * Gen 2+: checks for Mean Look, Spider Web, Shadow Tag, etc.
   * The engine delegates this check to the ruleset instead of
   * checking volatile statuses directly.
   */
  canSwitch(pokemon: ActivePokemon, state: BattleState): boolean;

  // --- End-of-Turn Formulas ---

  /**
   * Calculate Leech Seed drain amount.
   * Gen 1: 1/16 max HP. Gen 2+: 1/8 max HP.
   */
  calculateLeechSeedDrain(pokemon: ActivePokemon): number;

  /**
   * Calculate Curse (Ghost-type) damage per turn.
   * Gen 2+: 1/4 max HP. Gen 1: N/A (Curse doesn't exist).
   */
  calculateCurseDamage(pokemon: ActivePokemon): number;

  /**
   * Calculate Nightmare damage per turn.
   * Gen 2+: 1/4 max HP while asleep. Gen 1: N/A.
   */
  calculateNightmareDamage(pokemon: ActivePokemon): number;

  /**
   * Calculate Struggle recoil damage.
   * Gen 1-3: 1/2 of damage dealt. Gen 4+: 1/4 of attacker's max HP.
   */
  calculateStruggleRecoil(attacker: ActivePokemon, damageDealt: number): number;

  /**
   * Roll the number of hits for a multi-hit move.
   * Gen 1-4: [2,2,2,3,3,3,4,5] weighted (roughly 37.5/37.5/12.5/12.5%).
   * Gen 5+: 35/35/15/15% for 2/3/4/5 hits.
   */
  rollMultiHitCount(attacker: ActivePokemon, rng: SeededRandom): number;

  /**
   * Roll whether a Protect-type move succeeds.
   * Returns false if the consecutive use check fails (Gen 2+: 1/3^N chance for N>0).
   * Gen 1 has no Protect — implement to always return true.
   */
  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean;

  /**
   * Calculate bind/trapping end-of-turn damage.
   * Gen 2-4: 1/16 max HP. Gen 5+: 1/8 max HP.
   * Gen 1: not used (bind is handled via canExecuteMove instead).
   */
  calculateBindDamage(pokemon: ActivePokemon): number;

  /**
   * Process Perish Song countdown for a Pokémon.
   * Returns the new counter value and whether the Pokémon fainted.
   */
  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  };

  // --- End-of-Turn Order ---

  /**
   * The order of end-of-turn effects varies by generation.
   * Returns the ordered list of effect types to process.
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[];
}
```

### 2.2 Registering Generations

```typescript
/**
 * Registry of all available generation rulesets.
 * Consumers import only the generations they need — tree-shakeable.
 */
export class GenerationRegistry {
  private rulesets: Map<Generation, GenerationRuleset> = new Map();

  register(ruleset: GenerationRuleset): void {
    this.rulesets.set(ruleset.generation, ruleset);
  }

  get(gen: Generation): GenerationRuleset {
    const ruleset = this.rulesets.get(gen);
    if (!ruleset) {
      throw new Error(`Generation ${gen} ruleset not registered. Import and register it first.`);
    }
    return ruleset;
  }

  has(gen: Generation): boolean {
    return this.rulesets.has(gen);
  }

  getAll(): GenerationRuleset[] {
    return [...this.rulesets.values()].sort((a, b) => a.generation - b.generation);
  }
}

/** Singleton registry */
export const generations = new GenerationRegistry();
```

### 2.3 Tree-Shakeable Imports

Consumers only pay for the generations they use:

```typescript
// Import only Gen 1 and Gen 9
import { Gen1Ruleset } from '@pokemon-lib-ts/gen1';
import { Gen9Ruleset } from '@pokemon-lib-ts/gen9';
import { generations, BattleEngine } from '@pokemon-lib-ts/battle';

generations.register(new Gen1Ruleset());
generations.register(new Gen9Ruleset());

// Create a Gen 1 battle
const battle = new BattleEngine({ generation: 1, /* ... */ }, new Gen1Ruleset(), dataManager);
```

### 2.4 Turn Order Resolution (`resolveTurnOrder`)

`BaseRuleset.resolveTurnOrder()` implements the default sort for Gen 3+ (and is the reference description for all gens). Gen 1 and Gen 2 override this method where their mechanics differ.

#### Sort Order (highest priority wins)

1. **Action type bracket** — sorted before speed comparison:
   - Switch actions execute first (switches are simultaneous in Gen 1–5, sequential in Gen 6+)
   - Item use executes before moves
   - Run executes before moves
   - Move vs. move proceeds to step 2

2. **Move priority bracket** — integer priority attached to each move in the data layer (Extreme Speed = +2, Quick Attack = +1, most moves = 0, Trick Room = −7, etc.):
   - Higher priority bracket goes first
   - Ties within the same bracket proceed to step 3

3. **Effective Speed** — within the same priority bracket, the faster Pokémon moves first:
   - Base Speed after stat stage multipliers (`stages −6 … +6 → ×(2/8) … ×(8/2)`)
   - Full paralysis reduces Speed by ×0.25 (applied to the stat, not the stage)
   - Held items that modify Speed (e.g., Choice Scarf ×1.5, Iron Ball ×0.5) are applied here
   - Trick Room reverses the comparison (slower Pokémon moves first)

4. **Speed tie** — when effective Speed values are equal after step 3:
   - Resolved by coin flip via the battle's `SeededRandom` instance (`rng.chance(0.5)`)
   - Deterministic with a fixed seed; not truly random

#### Generation-Specific Differences

| Gen | Difference |
|-----|-----------|
| Gen 1 | No move-priority brackets (Quick Attack/Agility/Whirlwind all act at +1 but it's hardcoded per-move, not a priority field) |
| Gen 1 | Speed is compared before any stage modification (stat stages do not affect turn order) |
| Gen 2 | Priority brackets introduced; otherwise similar to Gen 3+ |
| Gen 3–4 | Switches are simultaneous within a turn (both Pokémon are considered switched before any entry hazards are applied) |
| Gen 5+ | Turn order for switches becomes sequential in edge cases (Pursuit interaction) |

---

## 3. Battle State Model

### 3.1 Core State Interface

```typescript
export interface BattleState {
  /** Current battle phase */
  phase: BattlePhase;

  /** Which generation's rules are active */
  readonly generation: Generation;

  /** Battle format */
  readonly format: BattleFormat;

  /** Current turn number (starts at 1) */
  turnNumber: number;

  /** The two sides (player, opponent) */
  sides: [BattleSide, BattleSide];

  /** Active weather (null = clear) */
  weather: WeatherState | null;

  /** Active terrain (null = none) — Gen 7+ only */
  terrain: TerrainState | null;

  /** Trick Room active — Gen 4+ only */
  trickRoom: { active: boolean; turnsLeft: number };

  /** Magic Room active — Gen 5+ only */
  magicRoom: { active: boolean; turnsLeft: number };

  /** Wonder Room active — Gen 5+ only */
  wonderRoom: { active: boolean; turnsLeft: number };

  /** Gravity active — Gen 4+ only */
  gravity: { active: boolean; turnsLeft: number };

  /** Turn history for replay/AI */
  turnHistory: TurnRecord[];

  /** Seeded RNG state */
  readonly rng: SeededRandom;

  /** Whether the battle has ended */
  ended: boolean;

  /** Winner (0 = side 0, 1 = side 1, null = not ended or draw) */
  winner: 0 | 1 | null;
}

export type BattlePhase =
  | 'battle-start'
  | 'turn-start'
  | 'action-select'
  | 'turn-resolve'
  | 'turn-end'
  | 'faint-check'
  | 'switch-prompt'
  | 'battle-end';

export type BattleFormat =
  | 'singles'
  | 'doubles'
  | 'triples'      // Gen 5 only
  | 'rotation';    // Gen 5 only

export interface WeatherState {
  type: WeatherType;
  turnsLeft: number;    // -1 = permanent (set by ability)
  source: string;       // What set it (ability ID or move ID)
}

export interface TerrainState {
  type: TerrainType;
  turnsLeft: number;
  source: string;
}
```

### 3.2 Battle Side

```typescript
export interface TrainerRef {
  readonly id: string;
  readonly displayName: string;
  readonly trainerClass: string;
}

export interface BattleSide {
  /** Side index (0 = player, 1 = opponent) */
  readonly index: 0 | 1;

  /** Trainer reference (null for wild battles) */
  readonly trainer: TrainerRef | null;

  /** Full team (up to 6) */
  team: PokemonInstance[];

  /** Currently active Pokémon on the field (null slots = fainted) */
  active: (ActivePokemon | null)[];  // 1 for singles, 2 for doubles, 3 for triples

  /** Entry hazards on this side */
  hazards: EntryHazardState[];

  /** Active screens on this side */
  screens: ScreenState[];

  /** Tailwind active */
  tailwind: { active: boolean; turnsLeft: number };

  /** Lucky Chant (prevents crits) */
  luckyChant: { active: boolean; turnsLeft: number };

  /** Wish pending */
  wish: { active: boolean; turnsLeft: number; healAmount: number } | null;

  /** Future Sight / Doom Desire pending */
  futureAttack: FutureAttackState | null;

  /** Number of Pokémon that have fainted */
  faintCount: number;

  /** Whether this side has used its battle gimmick (Mega, Z-Move, Dynamax, Tera) */
  gimmickUsed: boolean;
}

export interface ActivePokemon {
  /** Reference to the PokemonInstance in the team array */
  pokemon: PokemonInstance;

  /** Team slot index (0-5) */
  teamSlot: number;

  /** In-battle stat stages (-6 to +6) */
  statStages: Record<BattleStat, number>;

  /** Volatile statuses currently active */
  volatileStatuses: Map<VolatileStatus, VolatileStatusState>;

  /** Types (can change from Transform, Forest's Curse, Trick-or-Treat, Tera) */
  types: PokemonType[];

  /** Active ability (can change from Skill Swap, etc.) */
  ability: string;

  /** Last move used (for Encore, Disable, etc.) */
  lastMoveUsed: string | null;

  /** Damage taken this turn (for Counter, Mirror Coat) */
  lastDamageTaken: number;

  /** Type of last damage received — PokemonType (not MoveCategory); null if no damage taken */
  lastDamageType: PokemonType | null;

  /** Turns this Pokémon has been on the field */
  turnsOnField: number;

  /** Whether this Pokémon moved this turn */
  movedThisTurn: boolean;

  /** Consecutive Protect/Detect uses (success chance halves each use) */
  consecutiveProtects: number;

  /** Substitute HP remaining (0 = no substitute) */
  substituteHp: number;

  /** Whether transformed (Transform, Imposter) */
  transformed: boolean;

  /** Transformed species data (if transformed) */
  transformedSpecies: PokemonSpeciesData | null;

  // --- Battle Gimmick State ---

  /** Whether this Pokémon is Mega Evolved */
  isMega: boolean;

  /** Whether this Pokémon is Dynamaxed */
  isDynamaxed: boolean;
  dynamaxTurnsLeft: number;

  /** Whether this Pokémon is Terastallized */
  isTerastallized: boolean;
  teraType: PokemonType | null;
}

export interface VolatileStatusState {
  /** Turns remaining (-1 = indefinite until condition is met) */
  turnsLeft: number;

  /** Source of the status (for Leech Seed target tracking, etc.) */
  source?: string;

  /** Additional data specific to the volatile status */
  data?: Record<string, unknown>;
}

export interface EntryHazardState {
  type: EntryHazardType;
  layers: number;
}

export interface ScreenState {
  type: ScreenType;
  turnsLeft: number;
}
```

### 3.3 Battle Actions

```typescript
/**
 * An action a player/AI can take during action-select.
 */
export type BattleAction =
  | MoveAction
  | SwitchAction
  | ItemAction
  | RunAction
  | RechargeAction
  | StruggleAction;

interface MoveAction {
  readonly type: 'move';
  readonly side: 0 | 1;
  readonly moveIndex: number;       // Index in active Pokémon's move slots
  readonly targetSide?: 0 | 1;     // For doubles targeting
  readonly targetSlot?: number;     // For doubles targeting
  readonly mega?: boolean;          // Mega Evolve before using move
  readonly zMove?: boolean;         // Use as Z-Move
  readonly dynamax?: boolean;       // Dynamax before using move
  readonly terastallize?: boolean;  // Terastallize before using move
}

interface SwitchAction {
  readonly type: 'switch';
  readonly side: 0 | 1;
  readonly switchTo: number;       // Team slot index to switch to
}

interface ItemAction {
  readonly type: 'item';
  readonly side: 0 | 1;
  readonly itemId: string;
  readonly target?: number;        // Team slot (for healing items on specific Pokémon)
}

interface RunAction {
  readonly type: 'run';
  readonly side: 0 | 1;
}

interface RechargeAction {
  readonly type: 'recharge';
  readonly side: 0 | 1;
}

interface StruggleAction {
  readonly type: 'struggle';
  readonly side: 0 | 1;
}
```

---

## 4. Battle State Machine

The state machine is the same across all generations. Only the behavior within each phase changes (via the GenerationRuleset).

```
battle-start
    │
    ▼
turn-start ◄────────────────────────────────┐
    │                                        │
    ▼                                        │
action-select                                │
    │                                        │
    ▼                                        │
turn-resolve                                 │
    │                                        │
    ▼                                        │
turn-end                                     │
    │                                        │
    ▼                                        │
faint-check ──── any fainted? ──► switch-prompt
    │                                   │
    │ (no faints or all               │ (switches resolved)
    │  switches done)                   │
    │                                   │
    │◄──────────────────────────────────┘
    │
    ├──── battle continues? ─── yes ────────►┘
    │
    ▼
battle-end
```

### Phase Details

| Phase | What Happens | Gen Ruleset Calls |
|-------|-------------|-------------------|
| `battle-start` | Initialize state, send out lead Pokémon, trigger entry abilities and hazards | `applyAbility('on-switch-in', ...)`, `applyEntryHazards(...)` |
| `turn-start` | Increment turn counter, decrement field effect counters | (minimal gen-specific logic) |
| `action-select` | Wait for both sides to submit actions | (none — this is input) |
| `turn-resolve` | Sort actions by priority/speed, execute each in order | `resolveTurnOrder(...)`, `calculateDamage(...)`, `doesMoveHit(...)`, `executeMoveEffect(...)`, `rollCritical(...)` |
| `turn-end` | Apply end-of-turn effects in generation-specific order | `getEndOfTurnOrder()`, `applyStatusDamage(...)`, `applyWeatherEffects(...)`, `applyTerrainEffects(...)` |
| `faint-check` | Check for fainted Pokémon, prompt for switch-in | (state check, no gen logic) |
| `switch-prompt` | Wait for faint replacement choices | (input, then `applyAbility('on-switch-in', ...)`) |
| `battle-end` | Determine winner, calculate EXP, EV gains | `calculateExpGain(...)` |

---

## 5. Event System

The battle engine emits events for every observable action. The consumer (UI, logger, replay system) subscribes to these events.

### 5.1 Battle Events

```typescript
export type BattleEvent =
  | { type: 'battle-start'; format: BattleFormat; generation: Generation }
  | { type: 'turn-start'; turnNumber: number }
  | { type: 'switch-in'; side: 0 | 1; pokemon: PokemonSnapshot; slot: number }
  | { type: 'switch-out'; side: 0 | 1; pokemon: PokemonSnapshot }
  | { type: 'move-start'; side: 0 | 1; pokemon: string; move: string }
  | { type: 'move-miss'; side: 0 | 1; pokemon: string; move: string }
  | { type: 'move-fail'; side: 0 | 1; pokemon: string; move: string; reason: string }
  | { type: 'damage'; side: 0 | 1; pokemon: string; amount: number; currentHp: number; maxHp: number; source: string }
  | { type: 'heal'; side: 0 | 1; pokemon: string; amount: number; currentHp: number; maxHp: number; source: string }
  | { type: 'faint'; side: 0 | 1; pokemon: string }
  | { type: 'effectiveness'; multiplier: number }
  | { type: 'critical-hit' }
  | { type: 'status-inflict'; side: 0 | 1; pokemon: string; status: PrimaryStatus }
  | { type: 'status-cure'; side: 0 | 1; pokemon: string; status: PrimaryStatus }
  | { type: 'volatile-start'; side: 0 | 1; pokemon: string; volatile: VolatileStatus }
  | { type: 'volatile-end'; side: 0 | 1; pokemon: string; volatile: VolatileStatus }
  | { type: 'stat-change'; side: 0 | 1; pokemon: string; stat: BattleStat; stages: number; currentStage: number }
  | { type: 'weather-set'; weather: WeatherType; source: string }
  | { type: 'weather-end'; weather: WeatherType }
  | { type: 'terrain-set'; terrain: TerrainType; source: string }
  | { type: 'terrain-end'; terrain: TerrainType }
  | { type: 'ability-activate'; side: 0 | 1; pokemon: string; ability: string }
  | { type: 'item-activate'; side: 0 | 1; pokemon: string; item: string }
  | { type: 'item-consumed'; side: 0 | 1; pokemon: string; item: string }
  | { type: 'hazard-set'; side: 0 | 1; hazard: EntryHazardType }
  | { type: 'hazard-clear'; side: 0 | 1; hazard: EntryHazardType }
  | { type: 'screen-set'; side: 0 | 1; screen: ScreenType; turns: number }
  | { type: 'screen-end'; side: 0 | 1; screen: ScreenType }
  | { type: 'mega-evolve'; side: 0 | 1; pokemon: string; form: string }
  | { type: 'dynamax'; side: 0 | 1; pokemon: string }
  | { type: 'dynamax-end'; side: 0 | 1; pokemon: string }
  | { type: 'terastallize'; side: 0 | 1; pokemon: string; teraType: PokemonType }
  | { type: 'z-move'; side: 0 | 1; pokemon: string; move: string }
  | { type: 'catch-attempt'; ball: string; pokemon: string; shakes: number; caught: boolean }
  | { type: 'exp-gain'; side: 0 | 1; pokemon: string; amount: number }
  | { type: 'level-up'; side: 0 | 1; pokemon: string; newLevel: number }
  | { type: 'message'; text: string }
  | { type: 'battle-end'; winner: 0 | 1 | null };

/**
 * Snapshot of a Pokémon's public state — what the opponent can see.
 * Used in events to avoid leaking hidden information (EVs, IVs, etc.).
 */
export interface PokemonSnapshot {
  speciesId: number;
  nickname: string | null;
  level: number;
  currentHp: number;
  maxHp: number;
  status: PrimaryStatus | null;
  gender: Gender;
  isShiny: boolean;
}
```

### 5.2 Event Listener

```typescript
export type BattleEventListener = (event: BattleEvent) => void;

/** The engine stores events and allows subscription */
export interface BattleEventEmitter {
  on(listener: BattleEventListener): void;
  off(listener: BattleEventListener): void;

  /** Get all events emitted so far (for replay) */
  getEventLog(): readonly BattleEvent[];
}
```

---

## 6. BattleEngine Public API

```typescript
export class BattleEngine implements BattleEventEmitter {
  readonly state: BattleState;
  private readonly ruleset: GenerationRuleset;
  private listeners: Set<BattleEventListener>;
  private eventLog: BattleEvent[];

  constructor(config: BattleConfig, ruleset: GenerationRuleset, dataManager: DataManager)

  // --- Event Emitter ---
  on(listener: BattleEventListener): void;
  off(listener: BattleEventListener): void;
  getEventLog(): readonly BattleEvent[];

  // --- Battle Flow ---

  /** Start the battle (transitions from battle-start → action-select) */
  start(): void;

  /** Submit an action for a side. When both sides have submitted, turn resolves. */
  submitAction(side: 0 | 1, action: BattleAction): void;

  /** Submit a switch choice for a fainted Pokémon replacement. */
  submitSwitch(side: 0 | 1, teamSlot: number): void;

  /** Get the current phase */
  getPhase(): BattlePhase;

  /** Get available moves for the active Pokémon on a side */
  getAvailableMoves(side: 0 | 1): AvailableMove[];

  /** Get valid switch targets for a side */
  getAvailableSwitches(side: 0 | 1): number[];  // Team slot indices

  /** Check if the battle has ended */
  isEnded(): boolean;

  /** Get the winner (null if not ended) */
  getWinner(): 0 | 1 | null;

  // --- State Inspection ---

  /** Get a read-only view of the battle state */
  getState(): Readonly<BattleState>;

  /** Get the active Pokémon for a side */
  getActive(side: 0 | 1): ActivePokemon | null;

  /** Get the team for a side */
  getTeam(side: 0 | 1): readonly PokemonInstance[];

  // --- Serialization ---

  /** Serialize battle state for save/load or network transmission */
  serialize(): string;

  /** Restore a battle from serialized state */
  static deserialize(data: string, ruleset: GenerationRuleset): BattleEngine;
}

export interface BattleConfig {
  generation: Generation;
  format: BattleFormat;
  teams: [PokemonInstance[], PokemonInstance[]];
  trainers?: [TrainerRef | null, TrainerRef | null];
  seed: number;
  isWildBattle?: boolean;
}

export interface AvailableMove {
  index: number;
  moveId: string;
  displayName: string;
  type: PokemonType;
  category: MoveCategory;
  pp: number;
  maxPp: number;
  disabled: boolean;
  disabledReason?: string;
}
```

---

## 7. Context Objects

These are the data bags passed to GenerationRuleset methods.

```typescript
export interface DamageContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
  readonly isCrit: boolean;
}

export interface DamageResult {
  readonly damage: number;
  readonly effectiveness: number;
  readonly isCrit: boolean;
  readonly randomFactor: number;
  readonly breakdown?: DamageBreakdown;  // Optional detailed breakdown for debugging
}

export interface DamageBreakdown {
  readonly baseDamage: number;
  readonly weatherMod: number;
  readonly critMod: number;
  readonly randomMod: number;
  readonly stabMod: number;
  readonly typeMod: number;
  readonly burnMod: number;
  readonly abilityMod: number;
  readonly itemMod: number;
  readonly otherMod: number;
  readonly finalDamage: number;
}

export interface CritContext {
  readonly attacker: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface AccuracyContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface MoveEffectContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly damage: number;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface MoveEffectResult {
  readonly statusInflicted: PrimaryStatus | null;
  readonly volatileInflicted: VolatileStatus | null;
  readonly statChanges: ReadonlyArray<{ target: 'attacker' | 'defender'; stat: BattleStat; stages: number }>;
  readonly recoilDamage: number;
  readonly healAmount: number;
  readonly switchOut: boolean;
  readonly messages: readonly string[];
  /** Set a screen (Reflect/Light Screen) on the attacker's or defender's side */
  readonly screenSet?: { screen: string; turnsLeft: number; side: 'attacker' | 'defender' } | null;
  /** Attacker faints after using the move (Explosion, Self-Destruct) */
  readonly selfFaint?: boolean;
  /** Skip recharge next turn (e.g., Hyper Beam KO'd the target) */
  readonly noRecharge?: boolean;
  /** Custom damage to apply to a target (for OHKO, fixed-damage, Counter) */
  readonly customDamage?: {
    target: 'attacker' | 'defender';
    amount: number;
    source: string;
    /** The type of the move dealing this damage, for lastDamageType tracking */
    type?: PokemonType | null;
  } | null;
  /** Cure the specified pokemon's status (e.g., Haze clears both sides) */
  readonly statusCured?: { target: 'attacker' | 'defender' | 'both' } | null;
  /** Data for volatile status infliction (turnsLeft, extra data) */
  readonly volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  readonly weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  readonly hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  readonly volatilesToClear?: ReadonlyArray<{
    target: 'attacker' | 'defender';
    volatile: VolatileStatus;
  }>;
  readonly clearSideHazards?: 'attacker' | 'defender';
  readonly itemTransfer?: { from: 'attacker' | 'defender'; to: 'attacker' | 'defender' };
  /** Clear screens from the specified side(s) (Haze or setter switching out) */
  readonly screensCleared?: 'attacker' | 'defender' | 'both' | null;
}

export interface AbilityContext {
  readonly pokemon: ActivePokemon;
  readonly opponent?: ActivePokemon;
  readonly state: BattleState;
  readonly rng: SeededRandom;
  readonly trigger: AbilityTrigger;
  readonly move?: MoveData;
  readonly damage?: number;
}

export interface AbilityResult {
  readonly activated: boolean;
  readonly effects: ReadonlyArray<{
    type: string;
    target: 'self' | 'opponent' | 'field';
    value: unknown;
  }>;
  readonly messages: readonly string[];
}

export interface ExpContext {
  readonly defeatedSpecies: PokemonSpeciesData;
  readonly defeatedLevel: number;
  readonly participantLevel: number;
  readonly isTrainerBattle: boolean;
  readonly participantCount: number;
  readonly hasLuckyEgg: boolean;
  readonly hasExpShare: boolean;
  readonly affectionBonus: boolean;
}
```

---

## 8. Battle Gimmick System

```typescript
/**
 * Battle gimmick — the special mechanic unique to certain generations.
 * Only one can be active per generation.
 */
export interface BattleGimmick {
  /** Name of the gimmick */
  readonly name: string;

  /** Which generation(s) support this gimmick */
  readonly generations: readonly Generation[];

  /** Check if the active Pokémon can use this gimmick */
  canUse(pokemon: ActivePokemon, side: BattleSide, state: BattleState): boolean;

  /** Apply the gimmick (Mega Evolve, Dynamax, Terastallize, etc.) */
  activate(pokemon: ActivePokemon, side: BattleSide, state: BattleState): BattleEvent[];

  /** Revert the gimmick (if applicable — Dynamax reverts after 3 turns) */
  revert?(pokemon: ActivePokemon, state: BattleState): BattleEvent[];

  /**
   * Modify a move when the gimmick is active.
   * Z-Moves transform regular moves. Max Moves replace moves during Dynamax.
   */
  modifyMove?(move: MoveData, pokemon: ActivePokemon): MoveData;
}
```

---

## 9. AI System

```typescript
export interface AIController {
  /** Choose an action for the given battle state */
  chooseAction(
    side: 0 | 1,
    state: Readonly<BattleState>,
    ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): BattleAction;

  /** Choose a switch-in after a faint */
  chooseSwitchIn(
    side: 0 | 1,
    state: Readonly<BattleState>,
    ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): number;  // Team slot index
}

/** Built-in AI tiers */
export class RandomAI implements AIController { /* Tier 1: picks random valid move */ }
export class SmartAI implements AIController { /* Tier 2: prefers super-effective, avoids immune */ }
export class CompetitiveAI implements AIController { /* Tier 3: considers switching, setup, prediction */ }
```

---

## 10. File Structure

Gen-specific code lives in separate packages (`@pokemon-lib-ts/gen1` through `@pokemon-lib-ts/gen9`). The battle package only contains the engine, interfaces, AI, and events.

```
packages/battle/src/            # @pokemon-lib-ts/battle — engine only
├── index.ts                    # Public API barrel export
├── engine/
│   ├── BattleEngine.ts         # Main engine class
│   └── index.ts
├── ruleset/
│   ├── GenerationRuleset.ts    # Interface definition (the contract)
│   ├── GenerationRegistry.ts   # Registry singleton
│   ├── BaseRuleset.ts          # Shared defaults (Gen 3+ behavior)
│   └── index.ts
├── state/
│   ├── BattleState.ts          # BattleState interface
│   ├── BattleSide.ts           # BattleSide, ActivePokemon, TrainerRef interfaces
│   └── index.ts
├── events/
│   ├── BattleEvent.ts          # Event type definitions
│   ├── BattleAction.ts         # BattleAction discriminated union
│   └── index.ts
├── context/
│   ├── types.ts                # Context objects (DamageContext, MoveEffectResult, etc.)
│   └── index.ts
├── ai/
│   ├── AIController.ts         # Interface
│   ├── RandomAI.ts
│   └── index.ts
└── utils/
    ├── BattleHelpers.ts        # Shared utility functions
    └── index.ts

packages/gen1/src/              # @pokemon-lib-ts/gen1 — example gen package
├── index.ts                    # Exports Gen1Ruleset + createDataManager()
├── Gen1Ruleset.ts              # Implements GenerationRuleset
├── Gen1DamageCalc.ts
├── Gen1TypeChart.ts
├── Gen1StatCalc.ts
└── data/
    └── index.ts                # Data loader (reads from ../data/*.json)

packages/gen6/src/              # @pokemon-lib-ts/gen6 — example with gimmick
├── index.ts
├── Gen6Ruleset.ts              # Extends BaseRuleset
├── MegaEvolution.ts            # BattleGimmick implementation
└── data/
    └── index.ts
```

---

## 11. Inheritance Strategy

`BaseRuleset` lives in `@pokemon-lib-ts/battle` and implements Gen 3+ defaults. Each gen package imports it and extends or replaces as needed. Gen 1 and Gen 2 are different enough that they implement the interface directly.

```
@pokemon-lib-ts/battle exports:
  GenerationRuleset (interface)   ← the contract
  BaseRuleset (abstract class)    ← Gen 3+ defaults

@pokemon-lib-ts/gen1 exports:
  Gen1Ruleset implements GenerationRuleset  ← standalone (too different)

@pokemon-lib-ts/gen2 exports:
  Gen2Ruleset implements GenerationRuleset  ← standalone (bridges old/new)

@pokemon-lib-ts/gen3 exports:
  Gen3Ruleset extends BaseRuleset  ← minimal overrides (Gen 3 IS the base)

@pokemon-lib-ts/gen4 exports:
  Gen4Ruleset extends BaseRuleset  ← adds physical/special split, Stealth Rock

@pokemon-lib-ts/gen5 exports:
  Gen5Ruleset extends BaseRuleset  ← adds scaled EXP, team preview, Gems

@pokemon-lib-ts/gen6 exports:
  Gen6Ruleset extends BaseRuleset  ← adds Fairy, Mega, updated crit/type chart

@pokemon-lib-ts/gen7 exports:
  Gen7Ruleset extends BaseRuleset  ← adds Z-Moves, terrain from abilities

@pokemon-lib-ts/gen8 exports:
  Gen8Ruleset extends BaseRuleset  ← adds Dynamax, removes Mega/Z

@pokemon-lib-ts/gen9 exports:
  Gen9Ruleset extends BaseRuleset  ← adds Tera, removes Dynamax, Snow replaces Hail
```

Each gen package depends on `@pokemon-lib-ts/battle` (for `BaseRuleset` and `GenerationRuleset`), and `@pokemon-lib-ts/core` (for entity types and shared logic). The gen packages are leaves in the dependency graph — nothing depends on them except the consumer's application.

---

## Implementation Cross-Reference

| Concept | Source File | Notes |
|---------|-------------|-------|
| GenerationRuleset interface | `packages/battle/src/ruleset/GenerationRuleset.ts` | ~43 methods |
| BaseRuleset abstract class | `packages/battle/src/ruleset/BaseRuleset.ts` | Gen 3+ defaults |
| BattleEngine | `packages/battle/src/engine/BattleEngine.ts` | Constructor: (config, ruleset, dataManager) |
| BattleState | `packages/battle/src/state/BattleState.ts` | State interface |
| BattleSide, ActivePokemon, TrainerRef | `packages/battle/src/state/BattleSide.ts` | Side and active-slot interfaces |
| BattleEvent types | `packages/battle/src/events/BattleEvent.ts` | Named interface pattern |
| BattleAction | `packages/battle/src/events/BattleAction.ts` | Discriminated union |
| Context objects (DamageContext, MoveEffectResult, etc.) | `packages/battle/src/context/types.ts` | Ruleset method parameters |
| AI controllers | `packages/battle/src/ai/` | RandomAI, interface |
| Public exports | `packages/battle/src/index.ts` | What consumers import |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-03-15 | Added ~20 missing GenerationRuleset methods, fixed constructor signature (ruleset param), fixed TrainerData→TrainerRef, added ActivePokemon combat tracking fields (lastDamageTaken, lastDamageType), fixed freeze thaw rate (20%→~9.8% for Gen 2), added MoveEffectResult fields, added Quick Start and Cross-Reference, updated file structure to match actual layout |
| 1.0 | 2024 | Initial battle architecture spec |
