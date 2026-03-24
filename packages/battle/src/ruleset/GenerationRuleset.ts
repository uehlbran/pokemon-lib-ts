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
  TwoTurnMoveVolatile,
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

/** Damage formula, breakdown, and Struggle damage/recoil (mid-turn, not end-of-turn). */
export interface DamageSystem {
  /**
   * Calculate damage for a move.
   * This is the most generation-specific function — every gen has subtle differences
   * in modifier order, rounding, and which factors apply.
   */
  calculateDamage(context: DamageContext): DamageResult;
  /**
   * Calculate Struggle base damage dealt to the defender.
   * Gen 1: Normal-type physical damage (50 BP, Ghost immune — type chart applies).
   * Gen 2+: Typeless damage (50 BP physical, type chart does NOT apply, Ghost takes full damage).
   * @param state - Required for Gen 1 (passed to calculateDamage for Normal-type chart lookup);
   *   Gen 2+ compute damage inline without consulting state.
   *   Gen 1 also consumes `state.rng` because the live battle damage roll is part of the
   *   formula; callers must pass the active battle state rather than a synthetic copy.
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
   * Whether future attacks (Future Sight, Doom Desire) recalculate damage at hit time.
   * Gen 2-4: false -- damage is calculated at use time and stored.
   * Gen 5+: true -- damage is recalculated when the attack lands.
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   * Source: Showdown sim/battle-actions.ts -- Gen 5+ recalculates future attack damage
   */
  recalculatesFutureAttackDamage?(): boolean;

  /**
   * Intercept damage before HP is subtracted. Called for EVERY damaging hit
   * (not just lethal hits), allowing abilities and items to modify or redirect
   * damage — e.g., Disguise absorbs all non-status damage regardless of lethality,
   * while Sturdy and Focus Sash only activate on lethal hits.
   *
   * Implementations should apply their own lethal-hit guard when needed.
   * Returns the (possibly modified) damage and messages to emit.
   * Default: no modification (returns damage unchanged).
   *
   * If `consumedItem` is set, the engine will set the defender's heldItem to null
   * and emit an `item-consumed` event after applying the modified damage.
   *
   * Source: Showdown data/abilities.ts -- disguise: onDamage (priority 1, intercepts all hits)
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30, lethal-hit only)
   * Source: Showdown data/items.ts -- Focus Sash: onDamage (lethal-hit only)
   */
  capLethalDamage?(
    damage: number,
    defender: ActivePokemon,
    attacker: ActivePokemon,
    move: MoveData,
    state: BattleState,
  ): { damage: number; survived: boolean; messages: string[]; consumedItem?: string };

  /**
   * Returns `true` if the given volatile status should be blocked from being
   * inflicted on `target`. Called before both move-effect and ability-effect
   * volatile infliction.
   *
   * Used for terrain-based immunity: Misty Terrain blocks confusion on grounded
   * Pokemon. Gen 9+ rulesets override this; earlier gens return false by default.
   *
   * Source: Showdown sim/battle.ts -- terrainHit / onTryAddVolatile checks
   * Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile: blocks confusion
   */
  shouldBlockVolatile?(
    volatile: VolatileStatus,
    target: ActivePokemon,
    state: BattleState,
  ): boolean;

  /**
   * Returns `true` if a move with positive priority should be blocked from
   * hitting the defender. Called before move execution for priority > 0 moves.
   *
   * Used by Psychic Terrain (Gen 7+): blocks priority moves against grounded
   * targets. Other gens return false by default.
   *
   * Source: Showdown data/conditions.ts -- psychicterrain.onTryHit:
   *   if (target.isGrounded() && move.priority > 0) { return false; }
   * Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected
   *   from moves with increased priority."
   */
  shouldBlockPriorityMove?(
    actor: ActivePokemon,
    move: MoveData,
    defender: ActivePokemon,
    state: BattleState,
  ): boolean;

  /**
   * Returns `true` if the given move, when used by the given actor, can bypass Protect-type
   * volatile statuses and hit the defender for reduced (0.25x) damage.
   *
   * Gen 7: Z-Moves (zMovePower > 0) bypass regular Protect at 0.25x.
   * Gen 8: Max Moves (actor.isDynamaxed) bypass regular Protect at 0.25x but NOT Max Guard.
   * All other gens: no moves bypass Protect via this mechanic.
   *
   * The `activeVolatile` parameter tells the ruleset which protect-type volatile is active.
   * Max Guard (`"max-guard"`) is always-block — rulesets should return false for it.
   *
   * Source: Showdown sim/battle-actions.ts -- Z-Moves/Max Moves bypass Protect at 0.25x
   * Source: Showdown sim/battle-actions.ts -- Max Guard blocks all moves including Max Moves
   */
  canBypassProtect(
    move: MoveData,
    actor: ActivePokemon,
    activeVolatile: "protect" | "max-guard",
  ): boolean;
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
   * Execute a move's effect during move resolution.
   * Usually runs after damage calculation, but charge-turn handlers may be
   * consulted before accuracy/damage so they can request a forced follow-up move
   * or consume Power Herb without taking the normal damage path.
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult;
  /**
   * Check whether a move can hit a target in a semi-invulnerable state.
   * E.g., Thunder/Hurricane can hit "flying", Earthquake can hit "underground",
   * Surf can hit "underwater". The generic `"charging"` marker may also be passed
   * for two-turn moves that remain targetable; implementations should return true.
   * Returns false by default — most moves miss.
   *
   * Gen 1 has no two-turn semi-invulnerable moves in the Gen 3+ sense
   * (Fly/Dig exist but engine handles them differently), so Gen 1 returns false.
   *
   * Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
   */
  canHitSemiInvulnerable(moveId: string, volatile: TwoTurnMoveVolatile): boolean;

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

  /**
   * Check if a move should be reflected back at the user by the defender's ability
   * (e.g., Magic Bounce in Gen 5+).
   *
   * Called after the accuracy check but before damage/effect execution.
   * If this returns a non-null result, the engine skips normal execution and instead
   * executes the move with attacker/defender swapped (the defender uses the move
   * against the original attacker).
   *
   * @param move - The move being used
   * @param attacker - The Pokemon using the move
   * @param defender - The target Pokemon (potential Magic Bounce holder)
   * @param state - Current battle state
   * @returns An object with `reflected: true` and `messages` if the move is reflected,
   *   or `null` if the move proceeds normally.
   *
   * Gen 1-4: returns null (Magic Bounce does not exist).
   * Gen 5+: checks if defender has Magic Bounce and the move has the reflectable flag.
   *
   * Source: Showdown data/abilities.ts -- magicbounce.onTryHit:
   *   checks move.flags['reflectable'] and move.hasBounced
   */
  shouldReflectMove?(
    move: MoveData,
    attacker: ActivePokemon,
    defender: ActivePokemon,
    state: BattleState,
  ): { reflected: true; messages: string[] } | null;
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
   *   - `"before-turn-order"` -- triggered before move-order sorting for same-priority go-first items
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
   * Gen 1-5: false. Gen 6+: true.
   * Source: Showdown — Electric/Grassy/Misty Terrain introduced in Gen 6 (XY)
   */
  hasTerrain(): boolean;
  /** Apply terrain effects */
  applyTerrainEffects(state: BattleState): TerrainEffectResult[];

  /**
   * Check if terrain-based status immunity prevents a primary status condition.
   *
   * Gen 1-5: not present (no terrain). Gen 6+:
   *   - Electric Terrain: grounded Pokemon cannot fall asleep
   *   - Misty Terrain: grounded Pokemon cannot gain any primary status
   *
   * Returns `{ immune: false }` if the status CAN be inflicted,
   * or `{ immune: true, message }` if terrain blocks it.
   *
   * Optional: Gen 1-5 rulesets do not implement this method.
   * The engine checks `if (this.ruleset.checkTerrainStatusImmunity)` before calling.
   *
   * Note: Named `checkTerrainStatusImmunity` (not `canInflictStatus`) to avoid
   * colliding with Gen 1/2 rulesets' private `canInflictStatus` helper methods.
   *
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   * Source: Bulbapedia -- Electric Terrain / Misty Terrain status immunity
   */
  checkTerrainStatusImmunity?(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string };
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
  /**
   * The maximum number of layers a given hazard type can stack to.
   * Gen 2: Spikes = 1 (only 1 layer introduced in Gen 2).
   * Gen 3+: Spikes = 3, Toxic Spikes = 2, others (Stealth Rock, Sticky Web) = 1.
   * Gen 1: N/A (no hazards), returns 1 as a safe fallback.
   *
   * Source: pret/pokecrystal — Spikes mechanics, single layer only in Gen 2.
   * Source: Showdown data/moves.ts — spikes max 3 layers, toxic-spikes max 2, others max 1.
   */
  getMaxHazardLayers(hazardType: EntryHazardType): number;
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
 * Covers: leech seed, curse, nightmare, bind, perish song, protect, multi-hit.
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
   * Roll the number of hits for a multi-hit move.
   * Gen 1-4: [2,2,2,3,3,3,4,5] weighted (roughly 37.5/37.5/12.5/12.5%).
   * Gen 5+: 35/35/15/15% for 2/3/4/5 hits.
   */
  rollMultiHitCount(attacker: ActivePokemon, rng: SeededRandom): number;
  /**
   * Roll whether a Protect-type move succeeds.
   * Gen 2: halving bit-shift variant (255 >> N approach from pokecrystal).
   * Gen 3-4: 1/(2^N) halving table, capped at index 3 (12.5% minimum).
   * Gen 5: 1/(2^N), doubling counter capped at 256 (effectively impossible past 8 uses).
   * Gen 6+: 1/(3^N), capped at 1/729 (BaseRuleset default).
   * Gen 1 has no Protect — implement to always return true.
   *
   * Source: Showdown data/mods/gen5/conditions.ts — stall counter doubles (2^N), capped at 256
   * Source: Showdown data/conditions.ts (Gen 6+) — stall counter triples (3^N), capped at 729
   * Source: Bulbapedia — Protect: Gen 3-5 halves success rate (x1/2); Gen 6+ uses x1/3
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
  /**
   * Process Salt Cure end-of-turn residual damage for a Pokemon.
   * Deals 1/8 max HP per turn (1/4 for Water/Steel types).
   * Returns the damage dealt (0 if the Pokemon does not have the salt-cure volatile).
   * Gen 9 only — all other gens should omit this method (optional).
   *
   * Source: Showdown data/moves.ts -- Salt Cure onResidualOrder: 13
   */
  processSaltCureDamage?(pokemon: ActivePokemon): number;
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

/**
 * Which gimmick the player explicitly requested for this action.
 * Passed to `getBattleGimmick()` so multi-gimmick gens (e.g., Gen 7 has both
 * Mega Evolution and Z-Moves) can return the correct gimmick implementation.
 */
export type BattleGimmickType = "mega" | "zmove" | "dynamax" | "tera";

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
   *
   * @param type - Which gimmick the player requested ('mega', 'zmove', 'dynamax', or 'tera').
   *   Required so multi-gimmick gens (Gen 7: Mega + Z-Move) can return the correct
   *   gimmick implementation rather than always returning the same one.
   *   Single-gimmick gens may ignore this parameter.
   */
  getBattleGimmick(type: BattleGimmickType): BattleGimmick | null;
}

/** EXP recipient selection for faint rewards. */
export interface ExpRecipient {
  readonly pokemon: BattleState["sides"][number]["team"][number];
  readonly hasExpShare: boolean;
}

export interface ExpRecipientSelectionContext {
  readonly winnerTeam: BattleState["sides"][number]["team"];
  readonly livingParticipantUids: ReadonlySet<string>;
}

export interface ExpDistributionSystem {
  /**
   * Select all living Pokemon on the winning side that should receive EXP for a faint.
   *
   * Gen 1: only living participants receive EXP.
   * Gen 2-5: living participants plus non-participating held Exp. Share holders.
   * Gen 6+: living participants plus all other living party members (always-on Exp. Share).
   */
  getExpRecipients(context: ExpRecipientSelectionContext): readonly ExpRecipient[];
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
    ValidationSystem,
    ExpDistributionSystem {
  /** The generation number this ruleset implements (1–9). */
  readonly generation: Generation;
  /** Human-readable name, e.g. "Generation I". */
  readonly name: string;
}
