import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  BattleGimmick,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  ValidationResult,
  WeatherEffectResult,
} from "../context";
import type { BattleAction } from "../events";
import type { ActivePokemon, BattleSide, BattleState } from "../state";

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
   * Calculate all stats for a Pokemon.
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
   * Check if a frozen Pokemon thaws this turn.
   * Thaw chance: Gen 1 = never (only via move), Gen 2 = 25/256 (~9.77%), Gen 3+ = 20%/turn.
   */
  checkFreezeThaw(pokemon: ActivePokemon, rng: SeededRandom): boolean;

  /**
   * Get the number of sleep turns.
   * Gen 1: 1-7, Gen 5+: 1-3.
   */
  rollSleepTurns(rng: SeededRandom): number;

  /**
   * Check if a paralyzed Pokemon is fully paralyzed this turn.
   * Gen 1-2: 63/256 (~24.6%), Gen 3+: 1/4 (exact 25%).
   */
  checkFullParalysis(pokemon: ActivePokemon, rng: SeededRandom): boolean;

  /**
   * Roll whether a confused Pokemon hits itself this turn.
   * Gen 1-6: 1/2 (50%), Gen 7+: 1/3 (~33%).
   */
  rollConfusionSelfHit(rng: SeededRandom): boolean;

  /**
   * Process one turn of sleep for a Pokemon.
   * Decrements the sleep counter and wakes the Pokemon if it reaches 0.
   * Returns true if the Pokemon can act this turn (Gen 5+: can act on wake turn).
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

  /** Calculate EXP gained from defeating a Pokemon */
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
   * Validate that a Pokemon is legal for this generation.
   * Checks: species exists in this gen, moves are available,
   * ability is valid, held item is valid, etc.
   */
  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult;

  // --- Confusion ---

  /**
   * The probability (0-1) that a confused Pokemon hits itself.
   * Gen 1-6: 1/2 (50%). Gen 7+: 1/3.
   */
  getConfusionSelfHitChance(): number;

  /**
   * Calculate confusion self-hit damage.
   * Gen 1: simplified maxHP/8
   * Gen 2+: actual 40 base power typeless physical damage formula
   */
  calculateConfusionDamage(pokemon: ActivePokemon, state: BattleState, rng: SeededRandom): number;

  // --- Switch Out ---

  /**
   * Called when a Pokemon is switched out. Used to clear volatile
   * statuses that don't persist through switching (e.g., bind counter reset).
   * Gen 1: clears binding moves; Gen 2+: various volatile clears.
   */
  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void;

  // --- Switching ---

  /**
   * Whether a Pokemon is allowed to switch out.
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
   * Process Perish Song countdown for a Pokemon.
   * Returns the new counter value and whether the Pokemon fainted.
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
