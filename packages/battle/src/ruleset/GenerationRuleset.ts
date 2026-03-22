import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  StatBlock,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  BagItemResult,
  BattleGimmick,
  CatchResult,
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

// ─── Sub-interfaces (ISP: Interface Segregation Principle) ───────────────────
// Consumers that only need one aspect of the ruleset can type-narrow to the
// relevant sub-interface (e.g., pass only `DamageSystem` to a damage calculator).
// GenerationRuleset composes all of them into the complete contract.
// ─────────────────────────────────────────────────────────────────────────────

/** Type chart lookup and available type list for this generation. */
export interface TypeSystem {
  getTypeChart(): TypeChart;
  /** Valid types in this generation */
  getAvailableTypes(): readonly PokemonType[];
}

/** Base stat and in-battle stat calculation. */
export interface StatCalculator {
  /**
   * Calculate all stats for a Pokemon.
   * Gen 1-2 use different formulas than Gen 3+.
   */
  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock;
}

/** Damage formula and damage breakdown. */
export interface DamageSystem {
  /**
   * Calculate damage for a move.
   * This is the most generation-specific function — every gen has subtle differences
   * in modifier order, rounding, and which factors apply.
   */
  calculateDamage(context: DamageContext): DamageResult;

  /**
   * Whether future attacks (Future Sight, Doom Desire) recalculate damage at hit time.
   * Gen 2-4: false -- damage is calculated at use time and stored.
   * Gen 5+: true -- damage is recalculated when the attack lands.
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   * Source: Showdown sim/battle-actions.ts -- Gen 5+ recalculates future attack damage
   */
  recalculatesFutureAttackDamage?(): boolean;

  /**
   * Cap lethal damage for survival abilities (Sturdy in Gen 5+, etc.).
   * Called BEFORE HP is subtracted when damage >= defender's currentHp.
   * Returns the (possibly reduced) damage and messages to emit.
   * Default: no capping (returns damage unchanged).
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * "If this Pokemon is at full HP, it survives attacks that would KO it with 1 HP."
   */
  capLethalDamage?(
    damage: number,
    defender: ActivePokemon,
    attacker: ActivePokemon,
    move: MoveData,
    state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] };
}

/** Critical hit rate table, multiplier, and roll. */
export interface CriticalHitSystem {
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
}

/** Priority sort and turn order resolution. */
export interface TurnOrderSystem {
  /**
   * Resolve the order in which actions execute this turn.
   * Gen 1-4 resolve slightly differently from Gen 5+.
   */
  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[];
}

/** Accuracy check and move effect execution. */
export interface MoveSystem {
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
  /**
   * Check whether a move can hit a target in a semi-invulnerable state.
   * E.g., Thunder/Hurricane can hit "flying", Earthquake can hit "underground",
   * Surf can hit "underwater". Returns false by default — most moves miss.
   *
   * Gen 1 has no two-turn semi-invulnerable moves in the Gen 3+ sense
   * (Fly/Dig exist but engine handles them differently), so Gen 1 returns false.
   *
   * Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
   */
  canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean;

  /**
   * Returns the PP cost for using a move against a specific defender.
   * Default is 1; returns 2 if the defender has Pressure (Gen 3+).
   *
   * Source: pret/pokeemerald — ABILITY_PRESSURE deducts 2 PP per move use
   */
  getPPCost(actor: ActivePokemon, defender: ActivePokemon | null, state: BattleState): number;

  /**
   * Called when a move misses its target. Allows gen-specific miss-related effects:
   * - Explosion/Self-Destruct: user faints even on miss (all gens)
   * - Gen 1 Rage: rage-miss-lock volatile causes subsequent Rage uses to auto-miss
   *
   * Source: pret/pokered engine/battle/core.asm — Explosion/Self-Destruct always faint user
   * Source: pret/pokered RageEffect — Rage miss loop
   */
  onMoveMiss(actor: ActivePokemon, move: MoveData, state: BattleState): void;

  /**
   * Called after the defender takes direct damage (not absorbed by a substitute).
   * Allows gen-specific reactive effects triggered by taking a hit:
   * - Gen 1 Rage: boosts defender Attack by +1 stage
   * - Gen 1 Bide: accumulates received damage into `bide` volatile data
   *
   * Source: pret/pokered RageEffect, BideEffect
   */
  onDamageReceived(
    defender: ActivePokemon,
    damage: number,
    move: MoveData,
    state: BattleState,
  ): void;
}

/**
 * All status condition mechanics: damage ticks, cure rolls, sleep/paralysis/confusion.
 *
 * Gen 1–2 implement this directly; Gen 3+ inherit Gen 3+ defaults from BaseRuleset.
 */
export interface StatusSystem {
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
  /**
   * Process one turn of confusion for a Pokemon.
   * Decrements the confusion counter and returns whether the Pokemon is still confused.
   * Gen 1-6: confusion lasts 1-4 turns (after decrement). Gen 7+: 2-5 turns.
   * @returns `true` if still confused, `false` if confusion ended this turn.
   */
  processConfusionTurn(active: ActivePokemon, state: BattleState): boolean;
  /**
   * Whether confusion self-hit damage targets the opponent's Substitute (Gen 1 bug).
   * In Gen 1, when a confused Pokemon hits itself, the damage goes to the opponent's
   * Substitute if one is active — this is a documented cartridge bug.
   * Source: pokered engine/battle/core.asm — confusion self-hit checks opponent sub.
   * All other gens: self-hit always damages the confused Pokemon itself.
   */
  confusionSelfHitTargetsOpponentSub(): boolean;
}

/** Whether this generation has abilities, and how to apply them. */
export interface AbilitySystem {
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
  /**
   * Whether a Pokemon is immune to sound-based effects (e.g., Uproar wake-up).
   * Gen 3+: true if the Pokemon has the Soundproof ability.
   * Gen 1-2: always false (no abilities).
   *
   * Source: Showdown sim/battle-actions.ts — Soundproof immunity to Uproar and other sound moves
   * Source: Bulbapedia — Soundproof protects from sound-based effects including Uproar
   */
  isSoundImmune(pokemon: ActivePokemon): boolean;
}

/** Whether this generation has held items, and how to apply them. */
export interface ItemSystem {
  /**
   * Whether held items exist in this generation.
   * Gen 1: false. Gen 2+: true.
   */
  hasHeldItems(): boolean;
  /**
   * Apply held item effects for the given trigger.
   * @param trigger Known trigger points:
   *   - `"end-of-turn"` -- standard end-of-turn item effects (Leftovers, Black Sludge, etc.)
   *   - `"on-damage-taken"` -- triggered when the holder takes damage (context.opponent = attacker)
   *   - `"on-hit"` -- triggered when the holder lands a hit (context.opponent = defender)
   *   - `"on-contact"` -- triggered when a contact move hits the holder (context.opponent = attacker)
   *   - `"before-move"` -- triggered before the holder's move executes
   *   - `"stat-boost-between-turns"` -- Gen 2+ stat-boosting items (e.g., Macho Brace) between turns
   *   - `"heal-between-turns"` -- Gen 2+ healing items (e.g., Lum Berry) between turns
   * @param context The item trigger context (holder, state, RNG, etc.)
   */
  applyHeldItem(trigger: string, context: ItemContext): ItemResult;
}

/** Whether this generation has weather, and how to apply weather effects. */
export interface WeatherSystem {
  /**
   * Whether weather mechanics exist in this generation.
   * Gen 1: false. Gen 2+: true.
   */
  hasWeather(): boolean;
  /** Apply end-of-turn weather effects (damage, etc.) */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[];
}

/** Whether this generation has terrain, and how to apply terrain effects (Gen 6+). */
export interface TerrainSystem {
  /**
   * Whether terrain mechanics exist in this generation.
   * Gen 1-6: false. Gen 7+: true.
   */
  hasTerrain(): boolean;
  /** Apply terrain effects */
  applyTerrainEffects(state: BattleState): TerrainEffectResult[];
}

/** Entry hazard list and application on switch-in. */
export interface HazardSystem {
  /**
   * Which entry hazards are available in this generation.
   * Gen 1: none. Gen 2: Spikes only. Gen 4: Stealth Rock, Toxic Spikes.
   * Gen 6: Sticky Web.
   */
  getAvailableHazards(): readonly EntryHazardType[];
  /** Calculate entry hazard damage on switch-in.
   * @param state - Optional BattleState for checking field conditions (e.g., Gravity) */
  applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    state?: BattleState,
  ): EntryHazardResult;
}

/** Switch legality, Pursuit interaction, and switch-out hooks. */
export interface SwitchSystem {
  /**
   * Whether a Pokemon is allowed to switch out.
   * Gen 1: checks for 'trapped' volatile (trapping moves like Wrap/Bind).
   * Gen 2+: checks for Mean Look, Spider Web, Shadow Tag, etc.
   */
  canSwitch(pokemon: ActivePokemon, state: BattleState): boolean;
  /**
   * Whether Pursuit should execute before an opponent's switch.
   * Gen 2-7: true. Gen 1, Gen 8+: false.
   */
  shouldExecutePursuitPreSwitch(): boolean;
  /**
   * Called when a Pokemon is switched out. Used to clear volatile
   * statuses that don't persist through switching (e.g., bind counter reset).
   */
  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void;

  /**
   * Called when a Pokemon enters the field (initial send-out or mid-battle switch).
   * Use for gen-specific switch-in effects like Gen 5 sleep counter reset.
   * Default: no-op.
   */
  onSwitchIn(pokemon: ActivePokemon, state: BattleState): void;
}

/** Flee attempt mechanics (wild battles only). */
export interface FleeSystem {
  /**
   * Roll whether a flee attempt succeeds.
   * @param playerSpeed - Speed of the fleeing pokemon (with stat stages applied)
   * @param wildSpeed - Speed of the wild pokemon (with stat stages applied)
   * @param attempts - Number of flee attempts so far (1-based, already incremented)
   * @param rng - Battle PRNG
   * @returns `true` if the flee attempt succeeds
   *
   * Source: Bulbapedia — Escape (Generation III+ formula)
   * F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
   * Flee succeeds if playerSpeed >= wildSpeed OR F >= 256 OR rng(0,255) < F
   */
  rollFleeSuccess(
    playerSpeed: number,
    wildSpeed: number,
    attempts: number,
    rng: SeededRandom,
  ): boolean;
}

/** Poke Ball catch attempt mechanics (wild battles only). */
export interface CatchSystem {
  /**
   * Roll a catch attempt: compute the modified catch rate from the target's
   * species catchRate, HP ratio, status, and ball modifier, then perform
   * shake checks to determine catch success.
   *
   * @param catchRate - Base catch rate of the target species (0-255)
   * @param maxHp - Target's maximum HP
   * @param currentHp - Target's current HP
   * @param status - Target's primary status condition, or `null` if healthy
   * @param ballModifier - Ball catch rate modifier (e.g., 1 for Poke Ball, 2 for Ultra Ball)
   * @param rng - Battle PRNG
   * @returns CatchResult with shakes (0-3) and caught boolean
   *
   * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
   * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
   */
  rollCatchAttempt(
    catchRate: number,
    maxHp: number,
    currentHp: number,
    status: PrimaryStatus | null,
    ballModifier: number,
    rng: SeededRandom,
  ): CatchResult;
}

/**
 * End-of-turn damage sources and multi-turn mechanics.
 *
 * Covers: leech seed, curse, nightmare, struggle recoil, bind, perish song, protect, multi-hit.
 */
export interface EndOfTurnSystem {
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
   * Calculate Struggle base damage dealt to the defender.
   * Gen 1: Normal-type physical damage (50 BP, Ghost immune — type chart applies).
   * Gen 2+: Typeless damage (50 BP physical, type chart does NOT apply, Ghost takes full damage).
   * @param state - Required for Gen 1 (passed to calculateDamage for Normal-type chart lookup);
   *   Gen 2+ compute damage inline without consulting state.
   * @returns damage amount (non-negative integer)
   */
  calculateStruggleDamage(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    state: BattleState,
  ): number;
  /**
   * Calculate Struggle recoil damage.
   * Gen 1: 1/2 of damage dealt. Gen 2-3: 1/4 of damage dealt. Gen 4+: 1/4 of attacker's max HP.
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
   * Gen 2: halving bit-shift variant (255 >> N approach from pokecrystal).
   * Gen 3-4: 1/(2^N) halving table, capped at index 3 (12.5% minimum).
   * Gen 5+: 1/(3^N), capped at 1/729.
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
   * Process one turn of bind/trapping for a Pokemon.
   * Decrements the bind counter and returns whether the Pokemon is still bound.
   * Trap mechanics vary by generation (e.g., Gen 1 trapping prevents the target from acting).
   * @returns `true` if still bound, `false` if the binding ended this turn.
   */
  processBoundTurn(active: ActivePokemon, state: BattleState): boolean;
  /**
   * Process Perish Song countdown for a Pokemon.
   * Returns the new counter value and whether the Pokemon fainted.
   */
  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  };
  /**
   * The order of end-of-turn effects varies by generation.
   * Returns the ordered list of effect types to process.
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[];
  /**
   * Effects that fire per-acting-Pokemon after each move or struggle resolves (Phase 1 residuals).
   * Phase 1 fires once per action (immediately after checkMidTurnFaints for that action).
   * Phase 2 (`getEndOfTurnOrder`) fires once after ALL actions are resolved.
   *
   * Gen 1 and Gen 3+: return `[]` — no per-attack residuals; all effects remain in Phase 2.
   * Gen 2 (pokecrystal `ResidualDamage`): returns `["status-damage", "leech-seed", "nightmare", "curse"]`.
   *
   * Note: `checkMidTurnFaints()` emits faint events but does not set `state.ended`.
   * Battle-end detection is deferred to the end-of-turn `checkBattleEnd()` call.
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[];
  /**
   * Process end-of-turn freeze thaw for a Pokemon (called by the "defrost" EoT effect).
   * Gen 1: always false (frozen Pokemon never thaw naturally).
   * Gen 2: 25/256 (~9.8%) chance; skip if frozen this turn (wPlayerJustGotFrozen guard).
   * Gen 3+: always false ("defrost" is not in getEndOfTurnOrder(); thaw is handled pre-move).
   * @returns `true` if the Pokemon thawed this turn.
   */
  processEndOfTurnDefrost(pokemon: ActivePokemon, rng: SeededRandom): boolean;
}

/**
 * Bag item usage (Potions, status cures, X items, Revives).
 *
 * Bag items are items used from the trainer's bag during battle, not held items.
 * Effects are generation-invariant (a Super Potion always heals 50 HP).
 * Poke Ball catch mechanics are handled separately by `CatchSystem`.
 */
export interface BagItemSystem {
  /**
   * Whether the trainer can use bag items in the current battle context.
   * Returns `true` for standard trainer battles, `false` for Battle Frontier, etc.
   */
  canUseBagItems(): boolean;

  /**
   * Apply a bag item effect to a target Pokemon.
   * Returns a BagItemResult describing what happened; the engine applies the result
   * to the battle state and emits appropriate events.
   */
  applyBagItem(itemId: string, target: ActivePokemon, state: BattleState): BagItemResult;
}

/** Pokémon validation, EXP gain, and battle gimmick (Mega/Z-Move/Dynamax/Tera). */
export interface ValidationSystem {
  /**
   * Validate that a Pokemon is legal for this generation.
   * Checks: species exists in this gen, moves are available,
   * ability is valid, held item is valid, etc.
   */
  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult;
  /** Calculate EXP gained from defeating a Pokemon */
  calculateExpGain(context: ExpContext): number;
  /**
   * The special battle mechanic for this generation (if any).
   * Gen 1-5: null. Gen 6-7: Mega Evolution. Gen 7: Z-Moves.
   * Gen 8: Dynamax. Gen 9: Terastallization.
   */
  getBattleGimmick(): BattleGimmick | null;
}

/**
 * The complete interface that a generation ruleset must implement.
 *
 * Composed from focused sub-interfaces; each sub-interface can be used
 * independently (e.g., pass only `DamageSystem` to a damage calculator).
 *
 * Gen 1–2 implement this interface directly.
 * Gen 3+ extend `BaseRuleset` and override generation-specific methods.
 */
export interface GenerationRuleset
  extends TypeSystem,
    StatCalculator,
    DamageSystem,
    CriticalHitSystem,
    TurnOrderSystem,
    MoveSystem,
    StatusSystem,
    AbilitySystem,
    ItemSystem,
    BagItemSystem,
    WeatherSystem,
    TerrainSystem,
    HazardSystem,
    SwitchSystem,
    FleeSystem,
    CatchSystem,
    EndOfTurnSystem,
    ValidationSystem {
  /** The generation number this ruleset implements (1–9). */
  readonly generation: Generation;
  /** Human-readable name, e.g. "Generation I". */
  readonly name: string;
}
