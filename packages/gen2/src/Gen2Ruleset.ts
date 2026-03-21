import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  ActivePokemon,
  BagItemResult,
  BattleAction,
  BattleGimmick,
  BattleSide,
  BattleState,
  CatchResult,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  GenerationRuleset,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  ValidationResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  EntryHazardType,
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
import {
  CRIT_MULTIPLIER_CLASSIC,
  calculateExpGainClassic,
  gen12FullParalysisCheck,
  gen14MultiHitRoll,
  gen16ConfusionSelfHitRoll,
  getAccuracyStageRatio,
  getGen12StatStageRatio,
} from "@pokemon-lib-ts/core";
import { createGen2DataManager } from "./data";
import { GEN2_CRIT_RATES, rollGen2Critical } from "./Gen2CritCalc";
import { calculateGen2Damage } from "./Gen2DamageCalc";
import { applyGen2HeldItem } from "./Gen2Items";
import { applyMoveEffect, handleCustomEffect, type MutableResult } from "./Gen2MoveEffects";
import { calculateGen2Stats } from "./Gen2StatCalc";
import { calculateGen2StatusDamage } from "./Gen2Status";
import { GEN2_TYPE_CHART, GEN2_TYPES } from "./Gen2TypeChart";
import { applyGen2WeatherEffects } from "./Gen2Weather";

// Single source of truth for Gen 2 crit rates — use GEN2_CRIT_RATES from Gen2CritCalc
const GEN2_CRIT_RATE_TABLE: readonly number[] = GEN2_CRIT_RATES;

/**
 * Gen2Ruleset — implements GenerationRuleset directly (not extending BaseRuleset).
 *
 * Gen 2 (Gold/Silver/Crystal) is mechanically distinct enough from Gen 3+
 * that it warrants its own complete implementation rather than overriding a BaseRuleset.
 *
 * Key Gen 2 characteristics:
 * - No abilities, no natures
 * - Held items (first gen with them: Leftovers, berries, type-boosting items)
 * - Weather (Rain Dance, Sunny Day, Sandstorm)
 * - Entry hazards (Spikes only, 1 layer, 1/8 HP)
 * - Physical/Special determined by type, not by move
 * - Critical hits use stage-based system (Focus Energy fixed)
 * - 25/256 (~9.8%) freeze thaw chance per turn
 * - Dark and Steel types added (17 types total)
 * - SpAttack and SpDefense are now separate stats
 */
export class Gen2Ruleset implements GenerationRuleset {
  readonly generation = 2 as const;
  readonly name = "Gen 2 (GSC)";

  private readonly dataManager = createGen2DataManager();

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN2_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN2_TYPES;
  }

  // --- Stat Calculation ---

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    return calculateGen2Stats(pokemon, species);
  }

  // --- Damage Calculation ---

  calculateDamage(context: DamageContext): DamageResult {
    const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
    return calculateGen2Damage(context, GEN2_TYPE_CHART, attackerSpecies);
  }

  // --- Critical Hits ---

  getCritRateTable(): readonly number[] {
    return GEN2_CRIT_RATE_TABLE;
  }

  getCritMultiplier(): number {
    return CRIT_MULTIPLIER_CLASSIC; // 2.0x in Gen 1-5
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;

    // Status moves don't crit
    if (move.category === "status") return false;

    return rollGen2Critical(attacker, move, rng);
  }

  // --- Turn Order ---

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    // Check for Quick Claw activation on move actions (consumes rng before sorting)
    const quickClawActivated = new Set<number>();
    for (const action of actions) {
      if (action.type === "move" || action.type === "struggle" || action.type === "recharge") {
        const active = state.sides[action.side]?.active[0];
        if (active?.pokemon.heldItem === "quick-claw") {
          // ~23% chance (60/256) to move first
          if (rng.int(1, 256) <= 60) {
            quickClawActivated.add(action.side);
          }
        }
      }
    }

    // Pre-assign one tiebreak key per action BEFORE sorting to ensure deterministic
    // PRNG consumption. V8's sort algorithm calls comparators a non-deterministic number
    // of times, so consuming rng inside the comparator breaks replay determinism.
    // Fix: consume exactly N rng.next() calls upfront, then use keys in comparator.
    // Source: GitHub issue #120
    const tagged = actions.map((action) => ({ action, tiebreak: rng.next() }));

    tagged.sort((a, b) => {
      const actionA = a.action;
      const actionB = b.action;

      // Switches always go before moves
      // NOTE: Pursuit special ordering is complex and is not yet implemented.
      // In a full implementation, if the opponent is switching and a move action is Pursuit,
      // Pursuit would execute before the switch with doubled base power.
      if (actionA.type === "switch" && actionB.type !== "switch") return -1;
      if (actionB.type === "switch" && actionA.type !== "switch") return 1;

      // Run actions go first
      if (actionA.type === "run" && actionB.type !== "run") return -1;
      if (actionB.type === "run" && actionA.type !== "run") return 1;

      // If both are moves, compare priority then speed
      if (actionA.type === "move" && actionB.type === "move") {
        const sideA = state.sides[actionA.side];
        const sideB = state.sides[actionB.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];

        if (!activeA || !activeB) return 0;

        // Get moves for priority comparison
        const moveSlotA = activeA.pokemon.moves[actionA.moveIndex];
        const moveSlotB = activeB.pokemon.moves[actionB.moveIndex];
        if (!moveSlotA || !moveSlotB) return 0;

        let priorityA = 0;
        let priorityB = 0;
        try {
          priorityA = this.dataManager.getMove(moveSlotA.moveId).priority;
        } catch {
          // Move not found, use 0 priority
        }
        try {
          priorityB = this.dataManager.getMove(moveSlotB.moveId).priority;
        } catch {
          // Move not found, use 0 priority
        }

        // Higher priority goes first
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }

        // Quick Claw: if one side activated Quick Claw, that side goes first
        const aQuickClaw = quickClawActivated.has(actionA.side);
        const bQuickClaw = quickClawActivated.has(actionB.side);
        if (aQuickClaw && !bQuickClaw) return -1;
        if (bQuickClaw && !aQuickClaw) return 1;

        // Same priority: compare effective speed
        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);

        if (speedA !== speedB) {
          return speedB - speedA; // Higher speed goes first
        }

        // Speed tie: deterministic tiebreak using pre-assigned key
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // For recharge, struggle, etc., use speed
      if (
        (actionA.type === "move" || actionA.type === "struggle" || actionA.type === "recharge") &&
        (actionB.type === "move" || actionB.type === "struggle" || actionB.type === "recharge")
      ) {
        const activeA = state.sides[actionA.side]?.active[0];
        const activeB = state.sides[actionB.side]?.active[0];
        if (!activeA || !activeB) return 0;

        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);

        if (speedA !== speedB) {
          return speedB - speedA;
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      return 0;
    });

    return tagged.map((t) => t.action);
  }

  /**
   * Calculate effective speed for turn order.
   * In Gen 2, paralysis reduces speed to 25%.
   */
  private getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Apply stat stages using integer ratio table
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer num/den pairs
    const ratio = getGen12StatStageRatio(active.statStages.speed);
    let effective = Math.floor((baseSpeed * ratio.num) / ratio.den);

    // Paralysis reduces speed to 25%
    if (active.pokemon.status === "paralysis") {
      effective = Math.floor(effective * 0.25);
    }

    return Math.max(1, effective);
  }

  // --- Move Execution ---

  doesMoveHit(context: AccuracyContext): boolean {
    const { attacker, defender, move, rng } = context;

    // Moves with null accuracy never miss (e.g., Swift)
    if (move.accuracy === null) {
      return true;
    }

    // OHKO moves use level-based accuracy formula
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5420-5462 BattleCommand_OHKO
    // If attacker level < defender level, the move always fails.
    // Otherwise: accuracy = moveAcc + 2 * (attackerLevel - defenderLevel)
    // Then proceeds to normal BattleCommand_CheckHit.
    if (move.effect?.type === "ohko") {
      const attackerLevel = attacker.pokemon.level;
      const defenderLevel = defender.pokemon.level;
      if (attackerLevel < defenderLevel) {
        return false;
      }
      // Source: decomp line 5440 — `add a` doubles the level difference
      const levelBonus = 2 * (attackerLevel - defenderLevel);
      const ohkoAcc = Math.min(255, move.accuracy + levelBonus);
      // Convert percentage accuracy to 0-255 scale, then apply levelBonus
      // Actually, the decomp works on the raw move accuracy byte (0-255 scale) directly.
      // Move accuracy 30 in percentage = floor(30 * 255 / 100) = 76 on 0-255 scale.
      // But the decomp just uses MOVE_ACC directly which is stored as a percentage (30).
      // The `add e` instruction adds the doubled level diff to the raw byte.
      // So: effective = min(255, moveAcc + 2 * levelDiff), then BattleCommand_CheckHit.
      // BattleCommand_CheckHit: random 0-255, if random < accuracy, hit.
      if (ohkoAcc >= 255) return true;
      return rng.int(0, 255) < ohkoAcc;
    }

    // Convert move accuracy from percentage to 0-255 scale
    let accuracy = Math.floor((move.accuracy * 255) / 100);

    // Apply accuracy/evasion stage modifiers using integer ratio table
    // Source: pret/pokecrystal data/battle/accuracy_multipliers.asm — AccuracyLevelMultipliers
    const accStage = attacker.statStages.accuracy;
    const evaStage = defender.statStages.evasion;
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    const ratio = getAccuracyStageRatio(netStage);
    accuracy = Math.floor((accuracy * ratio.num) / ratio.den);

    // Cap at [1, 255]
    accuracy = Math.max(1, Math.min(255, accuracy));

    // Gen 2: 255 accuracy never misses (no 1/256 bug like Gen 1)
    if (accuracy >= 255) return true;

    // Hit check on 0-255 scale
    return rng.int(0, 255) < accuracy;
  }

  // Gen 2 has no semi-invulnerable two-turn moves in the Gen 3+ sense.
  canHitSemiInvulnerable(_moveId: string, _volatile: VolatileStatus): boolean {
    return false;
  }

  // Gen 2 has no Pressure ability — PP cost is always 1.
  getPPCost(_actor: ActivePokemon, _defender: ActivePokemon | null, _state: BattleState): number {
    return 1;
  }

  onDamageReceived(
    _defender: ActivePokemon,
    _damage: number,
    _move: MoveData,
    _state: BattleState,
  ): void {
    // No-op — Gen 2 does not have reactive damage triggers (Rage/Bide are Gen 1 only)
  }

  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const { move, attacker, defender, damage } = context;
    const result: MutableResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    // Some moves have effect: null in move data but still require custom handling.
    // Dispatch them to handleCustomEffect before the null-effect guard so their
    // cases in handleCustomEffect are reachable.
    // Source: pret/pokecrystal engine/battle/effect_commands.asm
    if (
      move.id === "explosion" ||
      move.id === "self-destruct" ||
      move.id === "safeguard" ||
      move.id === "mean-look" ||
      move.id === "spider-web" ||
      move.id === "counter" ||
      move.id === "mirror-coat" ||
      move.id === "whirlwind" ||
      move.id === "roar"
    ) {
      handleCustomEffect(move, result, context);
      return result;
    }

    // Hyper Beam: skip recharge when target faints OR when the move misses (damage === 0).
    // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
    // NOTE: By the time executeMoveEffect is called, the engine has already applied
    // damage to defender.pokemon.currentHp (clamped to 0 on KO). So a KO is detected
    // by checking currentHp === 0. A miss is detected by damage === 0.
    if (move.flags?.recharge && (damage === 0 || defender.pokemon.currentHp === 0)) {
      result.noRecharge = true;
    }

    if (move.effect) {
      applyMoveEffect(move.effect, move, result, context);
    }

    return result;
  }

  // --- Status Conditions ---

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    return calculateGen2StatusDamage(pokemon, status, state);
  }

  checkFreezeThaw(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // In Gen 2, thaw happens BETWEEN turns (not pre-move).
    // canExecuteMove calls this pre-move — always return false so frozen Pokemon always skip.
    // Actual thaw logic is in processEndOfTurnDefrost (EoT "defrost" effect).
    return false;
  }

  processEndOfTurnDefrost(pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Source: pret/pokecrystal engine/battle/core.asm:1524-1581 HandleDefrost
    // 25/256 (~9.8%) chance to thaw. Skip if frozen this turn (wPlayerJustGotFrozen guard).
    if (pokemon.volatileStatuses.has("just-frozen")) {
      pokemon.volatileStatuses.delete("just-frozen");
      return false;
    }
    return rng.int(0, 255) < 25;
  }

  rollSleepTurns(rng: SeededRandom): number {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:3608-3621
    // .random_loop: BattleRandom, AND SLP_MASK (7), reject 0 and 7, then INC A
    // Result: values 1-6 after AND, +1 = range 2-7
    return rng.int(2, 7);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    return gen12FullParalysisCheck(rng);
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    return gen16ConfusionSelfHitRoll(rng);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 2+: CAN act on the turn it wakes up (unlike Gen 1)
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true; // Gen 2+: can act on wake turn
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true; // Gen 2+: can act on wake turn
    }
    return false; // Still sleeping
  }

  // --- Abilities (not in Gen 2) ---

  hasAbilities(): boolean {
    return false;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return {
      activated: false,
      effects: [],
      messages: [],
    };
  }

  // --- Items (YES in Gen 2) ---

  hasHeldItems(): boolean {
    return true;
  }

  applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen2HeldItem(trigger, context);
  }

  canUseBagItems(): boolean {
    return true;
  }

  applyBagItem(_itemId: string, _target: ActivePokemon, _state: BattleState): BagItemResult {
    // Gen 2 bag items are deferred — return no effect for now.
    // Standard bag items (Potions, status cures) will be implemented
    // when Gen 2 single-player battles are added.
    return { activated: false, messages: ["It had no effect."] };
  }

  // --- Weather (YES in Gen 2) ---

  hasWeather(): boolean {
    return true;
  }

  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen2WeatherEffects(state);
  }

  // --- Terrain (not in Gen 2) ---

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // --- Entry Hazards (Spikes only in Gen 2) ---

  getAvailableHazards(): readonly EntryHazardType[] {
    return ["spikes"];
  }

  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult {
    const hasSpikes = side.hazards.some((h) => h.type === "spikes");
    if (!hasSpikes) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Flying types are immune to Spikes
    if (pokemon.types.includes("flying")) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    const damage = Math.max(1, Math.floor(maxHp / 8));

    return {
      damage,
      statusInflicted: null,
      statChanges: [],
      messages: [`${pokemon.pokemon.nickname ?? "The Pokemon"} was hurt by spikes!`],
    };
  }

  // --- EXP Gain ---

  calculateExpGain(context: ExpContext): number {
    return calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
    );
  }

  // --- Battle Gimmick (not in Gen 2) ---

  getBattleGimmick(): BattleGimmick | null {
    return null;
  }

  // --- Validation ---

  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult {
    const errors: string[] = [];

    // Check level range
    if (pokemon.level < 1 || pokemon.level > 100) {
      errors.push(`Level must be between 1 and 100, got ${pokemon.level}`);
    }

    // Check that species exists in Gen 2 (Dex #1-251)
    if (species.id < 1 || species.id > 251) {
      errors.push(`Species #${species.id} (${species.displayName}) is not available in Gen 2`);
    }

    // Check move count (1-4 moves)
    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    // Held items ARE valid in Gen 2 (unlike Gen 1)

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // --- Confusion ---

  getConfusionSelfHitChance(): number {
    return 0.5; // Gen 2: 50% chance to hit self in confusion
  }

  calculateConfusionDamage(
    pokemon: ActivePokemon,
    _state: BattleState,
    _rng: SeededRandom,
  ): number {
    const level = pokemon.pokemon.level;
    const stats = pokemon.pokemon.calculatedStats;
    const attack = stats?.attack ?? 100;
    const defense = stats?.defense ?? 100;

    // Apply stat stages using integer ratio table
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer num/den pairs
    const atkRatio = getGen12StatStageRatio(pokemon.statStages.attack);
    const effectiveAttack = Math.max(1, Math.floor((attack * atkRatio.num) / atkRatio.den));
    const defRatio = getGen12StatStageRatio(pokemon.statStages.defense);
    const effectiveDefense = Math.max(1, Math.floor((defense * defRatio.num) / defRatio.den));

    // 40 base power typeless physical hit
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 40 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;

    // Showdown: noDamageVariance: true — confusion self-hit has no random factor
    return Math.max(1, baseDamage);
  }

  // Source: Gen 2 confusion lasts 1-4 turns (same as Gen 1)
  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get("confusion");
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  // Source: Gen 2 bind/trapping — 2-5 turns, 1/16 max HP per turn
  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get("bound");
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  // --- Switch Out ---

  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void {
    // Gen 2: clear non-persistent volatiles on switch
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
    // Zeros wPlayerSubStatus1-5 (including SUBSTATUS_TOXIC), reverting badly-poisoned to regular poison
    if (pokemon.pokemon.status === "badly-poisoned") {
      pokemon.pokemon.status = "poison";
    }

    // Baton Pass: preserve stat stages and certain volatiles for the incoming Pokemon
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
    // Baton-passable volatiles in Gen 2: confusion, focus-energy, leech-seed, perish-song,
    // substitute, curse, encore, mean-look/spider-web trapping
    // Note: The engine resets stat stages after onSwitchOut (executeSwitch line ~1181).
    // Full Baton Pass stat-stage preservation requires engine-level integration (future work).
    const isBatonPass = pokemon.lastMoveUsed === "baton-pass";

    if (!isBatonPass) {
      pokemon.volatileStatuses.delete("confusion");
      pokemon.volatileStatuses.delete("focus-energy");
      pokemon.volatileStatuses.delete("leech-seed");
    }

    // These volatiles are ALWAYS cleared on switch (even with Baton Pass)
    // Source: pret/pokecrystal — encore/disable/bound/flinch are tied to the user, not baton-passable
    pokemon.volatileStatuses.delete("bound");
    pokemon.volatileStatuses.delete("flinch");
    pokemon.volatileStatuses.delete("toxic-counter");
    pokemon.volatileStatuses.delete("encore");
    pokemon.volatileStatuses.delete("disable");

    // If the switching Pokemon had applied trapping (Mean Look / Spider Web),
    // clear the "trapped" volatile from the opposing active Pokemon.
    // Source: gen2-ground-truth.md §9 — Mean Look / Spider Web:
    //   "Effect ends when the user (the Pokemon that used Mean Look/Spider Web) switches out"
    // Source: pret/pokecrystal — MeanLook/SpiderWeb tracking tied to trapper's presence on field
    const switchingSideIndex = state.sides.findIndex((side) =>
      side.active.some((a) => a?.pokemon === pokemon.pokemon),
    );
    if (switchingSideIndex !== -1) {
      const opposingSideIndex = switchingSideIndex === 0 ? 1 : 0;
      const opposingSide = state.sides[opposingSideIndex];
      for (const opposingActive of opposingSide?.active ?? []) {
        if (opposingActive) {
          opposingActive.volatileStatuses.delete("trapped");
        }
      }
    }
  }

  // --- Switching ---

  // Source: pret/pokecrystal engine/battle/core.asm TryRunning
  // Gen 2 flee formula is similar to Gen 1 but with minor differences.
  // Uses the same speed-based comparison: if player speed >= wild speed, always succeeds.
  // Otherwise: F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
  // Flee succeeds if F >= 256 OR rng(0, 255) < F
  rollFleeSuccess(
    playerSpeed: number,
    wildSpeed: number,
    attempts: number,
    rng: SeededRandom,
  ): boolean {
    if (playerSpeed >= wildSpeed) return true;
    const f = Math.floor((playerSpeed * 128) / wildSpeed) + 30 * attempts;
    if (f >= 256) return true;
    return rng.int(0, 255) < f;
  }

  /**
   * Roll a catch attempt using the Gen 2 BallCalc algorithm.
   *
   * Source: pret/pokecrystal engine/items/item_effects.asm PokeBallEffect (lines 212-411)
   *
   * Gen 2 catch formula (simplified, for non-special balls):
   *   1. modifiedRate = catchRate * ballModifier (already applied by caller)
   *   2. HP factor: maxHP * 2, currentHP * 3
   *      F = floor(modifiedRate * (maxHP*2 - currentHP*3) / (maxHP*2))
   *      F = max(1, F)
   *   3. Status bonus: freeze/sleep +10, burn/poison/paralysis +5 (decomp: FRZ|SLP → c=10, else → c=0)
   *      Note: decomp bug — BRN/PSN/PAR have no effect (second `and a` after clearing flags is always 0)
   *      Source: pret/pokecrystal docs/bugs_and_glitches.md — "BRN/PSN/PAR do not affect catch rate"
   *   4. finalRate = min(255, F + statusBonus)
   *   5. Roll: random 0-255; catch if random < finalRate (or random == 0 and finalRate > 0)
   *   6. Gen 2 has no shake checks — it's a single roll: caught or not.
   *      The ball animation wobble count is separate from the catch decision.
   */
  rollCatchAttempt(
    catchRate: number,
    maxHp: number,
    currentHp: number,
    status: PrimaryStatus | null,
    ballModifier: number,
    rng: SeededRandom,
  ): CatchResult {
    // Source: pret/pokecrystal engine/items/item_effects.asm:278-338 PokeBallEffect
    // Step 1: Apply ball modifier to catch rate (caller already passes the product)
    // In our interface, catchRate is the species base catch rate and ballModifier is the ball's
    // multiplier. The decomp applies ball-specific functions first, then uses the result as `b`.
    let modifiedRate = Math.floor(catchRate * ballModifier);
    modifiedRate = Math.min(255, Math.max(1, modifiedRate));

    // Step 2: HP factor
    // Source: decomp lines 281-335
    // maxHP*2 vs currentHP*3; F = floor(modifiedRate * (maxHP*2 - currentHP*3) / (maxHP*2))
    const maxHp2 = maxHp * 2;
    const curHp3 = currentHp * 3;
    let hpFactor: number;
    if (curHp3 >= maxHp2) {
      // If current HP * 3 >= max HP * 2, HP factor is minimal
      hpFactor = Math.max(1, Math.floor(modifiedRate / maxHp2));
    } else {
      hpFactor = Math.floor((modifiedRate * (maxHp2 - curHp3)) / maxHp2);
      hpFactor = Math.max(1, hpFactor);
    }

    // Step 3: Status bonus
    // Source: decomp lines 340-352 — BUG: only FRZ and SLP add +10; BRN/PSN/PAR have NO effect
    // This is a known bug in pokecrystal — we replicate it for cartridge accuracy.
    let statusBonus = 0;
    if (status === "freeze" || status === "sleep") {
      statusBonus = 10;
    }
    // BRN/PSN/PAR intentionally do NOT add a bonus — decomp bug replicated for accuracy

    // Step 4: Final rate
    const finalRate = Math.min(255, hpFactor + statusBonus);

    // Step 5: Single roll — random 0-255, catch if random < finalRate
    // Source: decomp lines 375-381 — `call Random; cp b; jr z, .catch; jr nc, .fail`
    // cp b: carry set if random < b (catch), zero flag if random == b (also catch in decomp)
    const roll = rng.int(0, 255);
    if (roll < finalRate) {
      return { caught: true, shakes: 3 };
    }
    // Gen 2 wobble animation is cosmetic — we return 0 shakes on failure for simplicity
    return { caught: false, shakes: 0 };
  }

  shouldExecutePursuitPreSwitch(): boolean {
    return true;
  }

  canSwitch(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 2: Mean Look / Spider Web prevent switching
    return !pokemon.volatileStatuses.has("trapped");
  }

  // --- End-of-Turn Formulas ---

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Gen 2: 1/8 max HP
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  calculateCurseDamage(pokemon: ActivePokemon): number {
    // Gen 2: 1/4 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateNightmareDamage(pokemon: ActivePokemon): number {
    // Gen 2: 1/4 max HP per turn while asleep
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateStruggleDamage(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    _state: BattleState,
  ): number {
    // Source: pret/pokecrystal — Struggle is typeless physical damage with 50 BP in Gen 2.
    // Type chart does NOT apply — Ghost-type defenders take normal damage.
    // Formula mirrors confusion self-hit (typeless physical, same base formula, 50 BP vs 40 BP).
    // Source: gen2-ground-truth.md §9 — Struggle is typeless, 50 BP physical
    const level = attacker.pokemon.level;
    const attack = attacker.pokemon.calculatedStats?.attack ?? 100;
    const defense = defender.pokemon.calculatedStats?.defense ?? 100;
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer num/den pairs
    const atkRatio = getGen12StatStageRatio(attacker.statStages.attack);
    const effectiveAttack = Math.max(1, Math.floor((attack * atkRatio.num) / atkRatio.den));
    const defRatio = getGen12StatStageRatio(defender.statStages.defense);
    const effectiveDefense = Math.max(1, Math.floor((defense * defRatio.num) / defRatio.den));
    // Gen 2 damage formula: floor(floor(floor((2*L/5)+2) * P * A) / D) / 50) + 2
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 50 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;
    return Math.max(1, baseDamage);
  }

  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    // Gen 2: recoil = 1/4 of the DAMAGE DEALT (not max HP)
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5670-5729 BattleCommand_Recoil
    // srl b; rr c; srl b; rr c — divides wCurDamage by 4
    return Math.max(1, Math.floor(damageDealt / 4));
  }

  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen14MultiHitRoll(rng);
  }

  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    // Source: pret/pokecrystal engine/battle/move_effects/protect.asm:14-74 — srl b (halving) each consecutive use
    // 1st use: 255/255 (always works), 2nd: 127/255, 3rd: 63/255, ...
    // Roll 1-255; success if roll <= threshold. Cap at 8 to avoid JS 32-bit shift wrap at multiples of 32.
    if (consecutiveProtects === 0) return true;
    const capped = Math.min(consecutiveProtects, 8);
    const threshold = Math.floor(255 >> capped);
    if (threshold === 0) return false;
    return rng.int(1, 255) <= threshold;
  }

  calculateBindDamage(pokemon: ActivePokemon): number {
    // Gen 2-4: 1/16 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 16));
  }

  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    const perishState = pokemon.volatileStatuses.get("perish-song");
    if (!perishState) return { newCount: 0, fainted: false };
    const counter = (perishState.data?.counter as number) ?? perishState.turnsLeft;
    if (counter <= 1) return { newCount: 0, fainted: true };
    const newCount = counter - 1;
    if (perishState.data) {
      perishState.data.counter = newCount;
    } else {
      perishState.turnsLeft = newCount;
    }
    return { newCount, fainted: false };
  }

  // --- End-of-Turn Order ---

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Source: pret/pokecrystal engine/battle/core.asm:250-296 HandleBetweenTurnEffects
    // Phase 2: runs once after both Pokemon have acted
    // Note: status-damage, leech-seed, nightmare, and curse are intentionally absent here —
    // they fire per-attack in Phase 1 via getPostAttackResidualOrder().
    // Order matches pokecrystal: FutureSight → weather-damage → weather-countdown → bind →
    // perish-song → leftovers → mystery-berry → defrost → safeguard → screens →
    // stat-boosting-items → healing-items → encore
    // Source: pret/pokecrystal engine/battle/core.asm:250-296 HandleBetweenTurnEffects
    // Disable countdown fires before Encore (jp HandleEncore is the final call)
    return [
      "future-attack",
      "weather-damage",
      "weather-countdown",
      "bind",
      "perish-song",
      "leftovers",
      "mystery-berry",
      "defrost",
      // Note: safeguard-countdown removed — Safeguard is stored as a ScreenType screen
      // and is now decremented by screen-countdown below. Two separate handlers would
      // double-decrement turnsLeft, halving the effective duration.
      // Source: pret/pokecrystal engine/battle/core.asm — single per-turn countdown
      "screen-countdown",
      "stat-boosting-items",
      "healing-items",
      "disable-countdown",
      "encore-countdown",
    ] as const;
  }

  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    // Source: pret/pokecrystal engine/battle/core.asm — ResidualDamage
    // Phase 1: runs per-Pokemon after each attack resolves
    // Order: status-damage → leech-seed → nightmare → curse
    return ["status-damage", "leech-seed", "nightmare", "curse"] as const;
  }
}
