import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  ActivePokemon,
  BagItemResult,
  BattleAction,
  BattleGimmick,
  BattleGimmickType,
  BattleSide,
  BattleState,
  CatchResult,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ExpRecipient,
  ExpRecipientSelectionContext,
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
  CORE_ABILITY_SLOTS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CRIT_MULTIPLIER_CLASSIC,
  calculateExpGainClassic,
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
  getAccuracyStageRatio,
  getGen12StatStageRatio,
  NEUTRAL_NATURES,
  validateDvs,
  validateFriendship,
  validateStatExp,
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

  /**
   * Internal flag set by calculateDamage when Present's heal case is rolled.
   * Read and cleared by executeMoveEffect's Present handler.
   * This avoids polluting DamageResult or MoveEffectContext with gen-specific state.
   */
  private _presentHealPending = false;

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

  getExpRecipients(context: ExpRecipientSelectionContext): readonly ExpRecipient[] {
    const recipients: ExpRecipient[] = [];

    for (const pokemon of context.winnerTeam) {
      if (pokemon.currentHp <= 0) continue;

      const isParticipant = context.livingParticipantUids.has(pokemon.uid);
      if (isParticipant) {
        recipients.push({ pokemon, hasExpShare: false });
        continue;
      }

      if (pokemon.heldItem === "exp-share") {
        recipients.push({ pokemon, hasExpShare: true });
      }
    }

    return recipients;
  }

  // --- Damage Calculation ---

  calculateDamage(context: DamageContext): DamageResult {
    const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
    const result = calculateGen2Damage(context, GEN2_TYPE_CHART, attackerSpecies);
    // Track Present heal case: calculateGen2Damage returns damage=0, effectiveness=1
    // for the heal roll (vs. damage=0, effectiveness=0 for type immunity).
    // Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
    if (context.move.id === "present" && result.damage === 0 && result.effectiveness === 1) {
      this._presentHealPending = true;
    }
    return result;
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

    // Apply stat stages
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer table (num/den), not float
    const speedRatio = getGen12StatStageRatio(active.statStages.speed);
    let effective = Math.floor((baseSpeed * speedRatio.num) / speedRatio.den);

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
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:5440 — `add a` doubles level diff
      const levelBonus = 2 * (attackerLevel - defenderLevel);
      const ohkoAcc = Math.min(255, move.accuracy + levelBonus);
      // move.accuracy is raw byte 30 (matching pokecrystal MOVE_ACC for OHKO moves).
      // BattleCommand_CheckHit: random(0,255) < accuracy → base 30/256 ≈ 11.7% at equal levels.
      if (ohkoAcc >= 255) return true;
      return rng.int(0, 255) < ohkoAcc;
    }

    // Thunder always hits in rain
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:1286-1290
    // "ld a, BATTLE_WEATHER_RAIN ; cp [wBattleWeather] ; ret z" — if rain, skip accuracy check
    const weather = context.state.weather?.type ?? null;
    if (move.id === "thunder" && weather === "rain") {
      return true;
    }

    // Thunder has 50% accuracy in sun (Gen 2)
    // Source: pret/pokecrystal engine/battle/effect_commands.asm ThunderAccuracy
    // The decomp checks for BATTLE_WEATHER_SUN and halves the accuracy byte.
    // Thunder base accuracy = 70% → 178 on 0-255 scale → halved to 89.
    // Convert move accuracy from percentage to 0-255 scale
    let accuracy = Math.floor((move.accuracy * 255) / 100);
    if (move.id === "thunder" && weather === "sun") {
      accuracy = Math.max(1, Math.floor(accuracy / 2));
    }

    // Apply accuracy/evasion stage modifiers using integer ratio table
    // Source: pret/pokecrystal data/battle/accuracy_multipliers.asm — AccuracyLevelMultipliers
    const accStage = attacker.statStages.accuracy;
    const evaStage = defender.statStages.evasion;
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    const ratio = getAccuracyStageRatio(netStage);
    accuracy = Math.floor((accuracy * ratio.num) / ratio.den);

    // Bright Powder: reduce accuracy by 20/256 (~7.8%)
    // Source: pret/pokecrystal engine/battle/core.asm:1074-1094 BrightPowderEffect
    // "sub 20" — subtracts 20 from the final accuracy value
    if (defender.pokemon.heldItem === "bright-powder") {
      accuracy -= 20;
    }

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

  /**
   * Handle effects when a move misses.
   * Explosion/Self-Destruct: user faints even on miss (all gens).
   *
   * Source: pret/pokecrystal — Self-Destruct/Explosion: user always faints even on miss
   */
  onMoveMiss(actor: ActivePokemon, move: MoveData, _state: BattleState): void {
    if (
      move.effect?.type === "custom" &&
      (move.effect.handler === "explosion" || move.effect.handler === "self-destruct")
    ) {
      actor.pokemon.currentHp = 0;
    }
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
    const { move, defender } = context;
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
      move.id === "roar" ||
      move.id === "rollout" ||
      move.id === "fury-cutter" ||
      move.id === "snore" ||
      move.id === "triple-kick" ||
      move.id === "present"
    ) {
      handleCustomEffect(move, result, context, this._presentHealPending);
      this._presentHealPending = false;
    } else {
      // Hyper Beam: skip recharge ONLY when the target faints (KO).
      // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
      // In Gen 2, Hyper Beam recharge is skipped ONLY on KO — NOT on miss or hitting Substitute.
      // This differs from Gen 1 where miss also skips recharge.
      // NOTE: By the time executeMoveEffect is called, the engine has already applied
      // damage to defender.pokemon.currentHp (clamped to 0 on KO). So a KO is detected
      // by checking currentHp === 0.
      if (move.flags?.recharge && defender.pokemon.currentHp === 0) {
        result.noRecharge = true;
      }

      if (move.effect) {
        applyMoveEffect(move.effect, move, result, context);
      }
    }

    // Compute per-hit damage for multi-hit moves with variable power/stats.
    // This runs after all effect processing so multiHitCount is already set.
    this.computePerHitDamage(move, result, context);

    return result;
  }

  /**
   * Set up lazy per-hit damage for multi-hit moves with variable power or stats.
   * Uses `perHitDamageFn` so RNG is only consumed for hits that actually execute.
   *
   * - Triple Kick: power escalates 10 -> 20 -> 30 per hit.
   *   Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
   *   Source: Bulbapedia -- "Power increases by 10 with each successive hit: 10, 20, 30"
   *
   * - Beat Up (Gen 2): each hit uses the party member's level and species base Attack
   *   in a simplified damage formula (no STAB, no weather, no crits, no type effectiveness).
   *   Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
   *   Formula per hit: floor(floor(floor(2*Level/5+2) * 10 * BaseAtk / BaseDef) / 50) + 2
   *   Then apply random factor (217-255)/255.
   *
   * Fix for #620: previously this method eagerly precomputed perHitDamage[] for ALL
   * hits, consuming RNG even for hits skipped by early KO. Now uses perHitDamageFn
   * which the engine calls lazily per-hit, so RNG is only consumed when the hit
   * actually executes.
   */
  private computePerHitDamage(
    move: MoveData,
    result: MutableResult,
    context: MoveEffectContext,
  ): void {
    if (!result.multiHitCount || result.multiHitCount <= 0) return;

    if (move.id === "triple-kick") {
      // Triple Kick: lazily compute damage for hits 2 and 3 with power 20 and 30.
      // Hit 1 (power 10) is already calculated by the engine's normal damage flow.
      // multiHitCount = 2 (2 additional hits).
      // Source: pret/pokecrystal -- damage computed inside the hit loop, not before it
      const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
      result.perHitDamageFn = (hitIdx: number): number => {
        const hitPower = (hitIdx + 2) * 10; // hit 2 = power 20, hit 3 = power 30
        const modifiedMove: MoveData = { ...move, power: hitPower };
        const isCrit = rollGen2Critical(context.attacker, modifiedMove, context.rng);
        const damageResult = calculateGen2Damage(
          {
            attacker: context.attacker,
            defender: context.defender,
            move: modifiedMove,
            state: context.state,
            rng: context.rng,
            isCrit,
          },
          GEN2_TYPE_CHART,
          attackerSpecies,
        );
        return damageResult.damage;
      };
    } else if (move.id === "beat-up") {
      // Beat Up (Gen 2): lazily compute each hit using party member's base Attack.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
      // The formula is simplified: no STAB, no weather, no type effectiveness, no crits.
      const actorSideIdx = context.state.sides.findIndex((s) =>
        s.active?.some((a) => a?.pokemon === context.attacker.pokemon),
      );
      const actorSide = context.state.sides[actorSideIdx];
      if (!actorSide) return;

      // Get the target's species base Defense (snapshot at move time)
      const defenderSpecies = this.dataManager.getSpecies(context.defender.pokemon.speciesId);
      const baseDefense = defenderSpecies.baseStats.defense;

      // Snapshot eligible members list at move time (order matters for hit index mapping)
      const eligibleMembers = actorSide.team.filter(
        (p) => p.currentHp > 0 && !p.status && p.uid !== context.attacker.pokemon.uid,
      );

      result.perHitDamageFn = (hitIdx: number): number => {
        const member = eligibleMembers[hitIdx];
        if (!member) return 0;
        const memberSpecies = this.dataManager.getSpecies(member.speciesId);
        const baseAttack = memberSpecies.baseStats.attack;
        const level = member.level;

        // Gen 2 Beat Up damage formula (typeless, no modifiers)
        // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
        // damage = floor(floor(floor(2*Level/5+2) * 10 * BaseAtk / BaseDef) / 50) + 2
        const levelFactor = Math.floor((2 * level) / 5) + 2;
        let dmg = Math.floor(Math.floor(levelFactor * 10 * baseAttack) / baseDefense);
        dmg = Math.floor(dmg / 50) + 2;

        // Apply random factor (217-255)/255
        // Source: pret/pokecrystal -- standard random factor for Gen 2 damage
        const roll = context.rng.int(217, 255);
        dmg = Math.floor((dmg * roll) / 255);
        return Math.max(1, dmg);
      };
    }
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
    if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.justFrozen)) {
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.justFrozen);
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
    return gen1to2FullParalysisCheck(rng);
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    return gen1to6ConfusionSelfHitRoll(rng);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 2+: CAN act on the turn it wakes up (unlike Gen 1)
    const sleepState = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter);
    if (!sleepState || sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
      return true; // Gen 2+: can act on wake turn
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
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

  getMaxHazardLayers(_hazardType: EntryHazardType): number {
    // Source: pret/pokecrystal — Gen 2 introduced Spikes with only a single layer.
    // Toxic Spikes and Stealth Rock do not exist in Gen 2.
    return 1;
  }

  applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    const hasSpikes = side.hazards.some((h) => h.type === "spikes");
    if (!hasSpikes) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Flying types are immune to Spikes
    if (pokemon.types.includes(CORE_TYPE_IDS.flying)) {
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
    // Gen 2 has no language metadata — only the 1.5× same-language trade bonus applies.
    // International trading existed between Japanese and other versions but language was not
    // tracked in the Pokemon data structure, so only the 1.5× bonus is modeled.
    // Source: pret/pokecrystal — no language field exists on Gen 2 box data.
    let exp = calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
      context.hasLuckyEgg,
      context.isTradedPokemon ?? false,
      false, // Gen 2: no international trade concept
    );
    // Source: specs/battle/03-gen2.md -- Exp. Share (Gen 2: held item giving 50% EXP split)
    if (context.hasExpShare) {
      exp = Math.max(1, Math.floor(exp / 2));
    }
    return exp;
  }

  // --- Battle Gimmick (not in Gen 2) ---

  getBattleGimmick(_type: BattleGimmickType): BattleGimmick | null {
    return null;
  }

  // --- Validation ---

  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult {
    const errors: string[] = [];

    // Check level range
    if (pokemon.level < 1 || pokemon.level > 100) {
      errors.push(`Level must be between 1 and 100, got ${pokemon.level}`);
    }

    let speciesExistsInGeneration = true;
    try {
      this.dataManager.getSpecies(species.id);
    } catch {
      speciesExistsInGeneration = false;
      errors.push(`Species #${species.id} (${species.displayName}) is not available in Gen 2`);
    }
    if (typeof pokemon.speciesId === "number" && pokemon.speciesId !== species.id) {
      errors.push(
        `Pokemon species id ${pokemon.speciesId} does not match provided species ${species.displayName} (#${species.id})`,
      );
    }

    // Check move count (1-4 moves)
    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    const legalMoves = new Set<string>();
    if (speciesExistsInGeneration) {
      for (const move of species.learnset.levelUp) legalMoves.add(move.move);
      for (const move of species.learnset.tm) legalMoves.add(move);
      for (const move of species.learnset.egg) legalMoves.add(move);
      for (const move of species.learnset.tutor) legalMoves.add(move);
      for (const move of species.learnset.event ?? []) legalMoves.add(move);
    }

    for (const moveSlot of pokemon.moves) {
      if (!moveSlot.moveId) {
        errors.push("Pokemon move slot is empty");
        continue;
      }

      try {
        this.dataManager.getMove(moveSlot.moveId);
      } catch {
        errors.push(`Move "${moveSlot.moveId}" is not available in Gen 2`);
        continue;
      }

      if (speciesExistsInGeneration && !legalMoves.has(moveSlot.moveId)) {
        errors.push(`Move "${moveSlot.moveId}" is not legal for ${species.displayName} in Gen 2`);
      }
    }

    if (pokemon.heldItem) {
      try {
        this.dataManager.getItem(pokemon.heldItem);
      } catch {
        errors.push(`Item "${pokemon.heldItem}" is not available in Gen 2`);
      }
    }

    if (pokemon.ability) {
      errors.push("Abilities are not available in Gen 2");
    }

    if (!NEUTRAL_NATURES.includes(pokemon.nature)) {
      errors.push(`Nature "${pokemon.nature}" is not supported in Gen 2`);
    }

    if (pokemon.abilitySlot !== CORE_ABILITY_SLOTS.normal1) {
      errors.push(`Ability slot "${pokemon.abilitySlot}" is not supported in Gen 2`);
    }

    const dvValidation = validateDvs({
      attack: pokemon.ivs.attack,
      defense: pokemon.ivs.defense,
      spAttack: pokemon.ivs.spAttack,
      spDefense: pokemon.ivs.spDefense,
      speed: pokemon.ivs.speed,
    });
    for (const failure of dvValidation.failures) {
      errors.push(failure.message);
    }

    const expectedHpDv =
      ((pokemon.ivs.attack & 1) << 3) |
      ((pokemon.ivs.defense & 1) << 2) |
      ((pokemon.ivs.speed & 1) << 1) |
      (pokemon.ivs.spAttack & 1);
    if (pokemon.ivs.hp !== expectedHpDv) {
      errors.push(
        `hp DV must be derived from the other DVs; expected ${expectedHpDv}, got ${pokemon.ivs.hp}`,
      );
    }

    const statExpValidation = validateStatExp(pokemon.evs);
    for (const failure of statExpValidation.failures) {
      errors.push(failure.message);
    }

    const friendshipValidation = validateFriendship(pokemon.friendship);
    for (const failure of friendshipValidation.failures) {
      errors.push(failure.message);
    }

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

    // Apply stat stages using integer arithmetic from pokecrystal stat_multipliers.asm
    const { num: atkNum, den: atkDen } = getGen12StatStageRatio(pokemon.statStages.attack);
    const effectiveAttack = Math.max(1, Math.floor((attack * atkNum) / atkDen));
    const { num: defNum, den: defDen } = getGen12StatStageRatio(pokemon.statStages.defense);
    const effectiveDefense = Math.max(1, Math.floor((defense * defNum) / defDen));

    // 40 base power typeless physical hit
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 40 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;

    // Showdown: noDamageVariance: true — confusion self-hit has no random factor
    return Math.max(1, baseDamage);
  }

  confusionSelfHitTargetsOpponentSub(): boolean {
    // Source: pret/pokecrystal battle confusion handling — Gen 2 does not apply Gen 1 opponent-substitute bug
    // Gen 2: confusion self-hit always damages the confused Pokemon itself (Gen 1 bug fixed).
    return false;
  }

  // Source: Gen 2 confusion lasts 1-4 turns (same as Gen 1)
  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get(CORE_VOLATILE_IDS.confusion);
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  // Source: Gen 2 bind/trapping — 2-5 turns, 1/16 max HP per turn
  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get(CORE_VOLATILE_IDS.bound);
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  // --- Switch In ---

  onSwitchIn(_pokemon: ActivePokemon, _state: BattleState): void {
    // Gen 2: no switch-in effects needed beyond hazards/items (handled by engine).
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
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.confusion);
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.focusEnergy);
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.leechSeed);
      // Perish Song counter is cleared on normal switch (not Baton Pass)
      // Source: pret/pokecrystal engine/battle/core.asm NewBattleMonStatus
      // Source: gen2-ground-truth.md — Perish Song counter removed when switching out normally
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.perishSong);
      // Substitute and Curse are cleared on normal switch, but preserved by Baton Pass
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.curse);
    }

    // These volatiles are ALWAYS cleared on switch (even with Baton Pass)
    // Source: pret/pokecrystal — encore/disable/bound/flinch are tied to the user, not baton-passable
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.bound);
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.flinch);
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.toxicCounter);
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.encore);
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.disable);
    // Attract and Nightmare are cleared on switch-out (always, not baton-passable)
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
    // Source: gen2-ground-truth.md Switching Mechanics — Attract and Nightmare reset on switch
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.infatuation);
    pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.nightmare);

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
          opposingActive.volatileStatuses.delete(CORE_VOLATILE_IDS.trapped);
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
      // When curHP*3 >= maxHP*2, the numerator (maxHP*2 - curHP*3) is <= 0.
      // The decomp formula produces 0 or negative, which clamps to minimum 1.
      // Source: pret/pokecrystal — hpFactor = max(1, formula) where formula <= 0 at full HP
      hpFactor = 1;
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

    // Step 5: Single roll — random 0-255, catch if random <= finalRate
    // Source: decomp lines 375-381 — `call Random; cp b; jr z, .catch; jr nc, .fail`
    // cp b: carry set (A < B → catch), zero flag set (A == B → also catch per jr z)
    // Combined condition: A <= B means roll <= finalRate
    const roll = rng.int(0, 255);
    if (roll <= finalRate) {
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
    return !pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.trapped);
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
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer table (num/den), not float
    const { num: sAtkNum, den: sAtkDen } = getGen12StatStageRatio(attacker.statStages.attack);
    const effectiveAttack = Math.max(1, Math.floor((attack * sAtkNum) / sAtkDen));
    const { num: sDefNum, den: sDefDen } = getGen12StatStageRatio(defender.statStages.defense);
    const effectiveDefense = Math.max(1, Math.floor((defense * sDefNum) / sDefDen));
    // Gen 2 damage formula: floor(floor(floor((2*L/5)+2) * P * A) / D) / 50) + 2
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 50 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;
    return Math.max(1, baseDamage);
  }

  calculateStruggleRecoil(attacker: ActivePokemon, _damageDealt: number): number {
    // Gen 2: Struggle recoil = 1/4 of the user's MAX HP
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Recoil
    // wMaxHP is used, not wCurDamage (the comment in the old code was wrong)
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  canBypassProtect(
    _move: MoveData,
    _actor: ActivePokemon,
    _activeVolatile: "protect" | "max-guard",
  ): boolean {
    // Gen 2: no moves can bypass Protect (Z-Moves/Max Moves are Gen 7-8 only)
    return false;
  }

  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen1to4MultiHitRoll(rng);
  }

  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    // Source: gen2-ground-truth.md §9 — Protect/Detect
    // Denominator grows by 3x each consecutive use (not 2x via bit-shift)
    // Success: random(0..255) < floor(255 / (3^N)), capped when denominator >= 255
    if (consecutiveProtects === 0) return true;
    const denominator = Math.min(255, 3 ** consecutiveProtects);
    const threshold = Math.floor(255 / denominator);
    if (threshold === 0) return false;
    return rng.int(0, 255) < threshold;
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
    const perishState = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.perishSong);
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
