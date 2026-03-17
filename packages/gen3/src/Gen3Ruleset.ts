import {
  type AbilityContext,
  type AbilityResult,
  type ActivePokemon,
  BaseRuleset,
  type BattleAction,
  type BattleSide,
  type BattleState,
  type DamageContext,
  type DamageResult,
  type EntryHazardResult,
  type ExpContext,
  type ItemContext,
  type ItemResult,
  type MoveEffectContext,
  type MoveEffectResult,
  type WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  EntryHazardType,
  MoveData,
  MoveEffect,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import {
  calculateExpGainClassic,
  DataManager,
  gen14MultiHitRoll,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { applyGen3Ability } from "./Gen3Abilities";
import { GEN3_CRIT_MULTIPLIER, GEN3_CRIT_RATE_DENOMINATORS } from "./Gen3CritCalc";
import { calculateGen3Damage } from "./Gen3DamageCalc";
import { applyGen3HeldItem } from "./Gen3Items";
import { GEN3_TYPE_CHART, GEN3_TYPES } from "./Gen3TypeChart";
import { applyGen3WeatherEffects } from "./Gen3Weather";

/**
 * Gen 3 (Ruby/Sapphire/Emerald) ruleset.
 *
 * Extends BaseRuleset (Gen 6+/7+ defaults) and overrides the methods that differ
 * in Gen 3.
 *
 * Phase 1 overrides implemented here:
 *   - getAvailableHazards — Gen 3 only has Spikes (no Stealth Rock until Gen 4)
 *   - calculateBindDamage — 1/16 max HP (Gen 2-4; Gen 5+ uses 1/8)
 *   - calculateStruggleRecoil — 1/2 damage dealt (Gen 3; Gen 4+ uses 1/4 max HP)
 *   - rollMultiHitCount — Gen 1-4 weighted distribution via gen14MultiHitRoll
 *   - rollSleepTurns — 2-5 turns (Gen 3-4; Gen 5+ uses 1-3)
 *   - calculateExpGain — classic formula (no level scaling)
 *   - getCritMultiplier — 2.0x (Gen 3-5; Gen 6+ uses 1.5x)
 *   - getCritRateTable — [16, 8, 4, 3, 2] denominators
 *   - getAvailableTypes — 17 types (no Fairy)
 *   - getEffectiveSpeed — paralysis penalty 0.25x (Gen 3-6; Gen 7+ uses 0.5x)
 *   - applyStatusDamage — burn = 1/8 max HP (Gen 3-6; Gen 7+ uses 1/16)
 *
 * Phase 2: calculateDamage will be implemented.
 */
export class Gen3Ruleset extends BaseRuleset {
  readonly generation = 3 as const;
  readonly name = "Gen 3 (Ruby/Sapphire/Emerald)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? new DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN3_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN3_TYPES;
  }

  // --- Damage Calculation (Phase 2 placeholder) ---

  /**
   * Gen 3 damage formula.
   *
   * Delegates to calculateGen3Damage which implements the full pokeemerald formula:
   *   BaseDamage = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
   *   Modifiers: targets → weather → crit (2.0x) → random (85-100) → STAB → type → burn
   *
   * Source: pret/pokeemerald src/battle_util.c CalculateBaseDamage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen3Damage(context, this.getTypeChart());
  }

  // --- Ability System ---

  /**
   * Gen 3 ability trigger dispatch.
   *
   * Currently only "on-switch-in" is supported (the only trigger the engine calls).
   * Damage-calc abilities (Huge Power, Thick Fat, Wonder Guard, etc.) are handled
   * inline in calculateGen3Damage, not through this method.
   *
   * Source: pret/pokeemerald src/battle_util.c AbilityBattleEffects
   */
  applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return applyGen3Ability(trigger, context);
  }

  // --- Critical Hit System ---

  /**
   * Gen 3-5 crit rate table (denominators [16, 8, 4, 3, 2]).
   *
   * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
   */
  getCritRateTable(): readonly number[] {
    return GEN3_CRIT_RATE_DENOMINATORS;
  }

  /**
   * Gen 3-5 critical hit multiplier: 2.0x.
   * (Gen 6+ uses 1.5x via BaseRuleset default.)
   *
   * Source: pret/pokeemerald src/battle_util.c — crits double base damage
   */
  getCritMultiplier(): number {
    return GEN3_CRIT_MULTIPLIER;
  }

  // --- Hazard System ---

  /**
   * Gen 3 entry hazards: only Spikes available.
   * Stealth Rock was introduced in Gen 4.
   * Toxic Spikes was introduced in Gen 4.
   *
   * Source: pret/pokeemerald — only MOVE_SPIKES exists as a hazard-layer move
   */
  getAvailableHazards(): readonly EntryHazardType[] {
    return ["spikes"];
  }

  // --- End-of-Turn System ---

  /**
   * Gen 2-4 bind/trap damage: 1/16 of max HP per turn.
   * Gen 5+ increased this to 1/8 (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — WRAP/BIND/CLAMP damage = maxHP / 16
   */
  calculateBindDamage(pokemon: ActivePokemon): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 16));
  }

  /**
   * Gen 3 Struggle recoil: 1/2 of damage dealt.
   * Gen 4+ changed this to 1/4 of attacker's max HP (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — Struggle recoil = damage / 2
   */
  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    return Math.max(1, Math.floor(damageDealt / 2));
  }

  /**
   * Gen 1-4 multi-hit distribution: weighted [2,2,2,3,3,3,4,5].
   * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
   * Gen 5+ uses a different distribution (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — multi-hit uses 8-entry lookup table
   * Also: packages/core/src/logic/gen12-shared.ts gen14MultiHitRoll
   */
  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen14MultiHitRoll(rng);
  }

  // --- Status System ---

  /**
   * Gen 3-4 sleep duration: 2-5 turns.
   * Gen 5+ reduced this to 1-3 turns (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sleep counter set to Random(4) + 2
   * (generates 0-3, adds 2 → range 2-5)
   */
  rollSleepTurns(rng: SeededRandom): number {
    return rng.int(2, 5);
  }

  /**
   * Gen 3-6 burn damage: 1/8 of max HP per turn.
   * Gen 7+ reduced burn damage to 1/16 (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    if (status === "burn") {
      // Gen 3-6: burn = 1/8 max HP (not 1/16 like Gen 7+)
      // Source: pret/pokeemerald src/battle_util.c
      return Math.max(1, Math.floor(maxHp / 8));
    }
    // All other statuses use the BaseRuleset default logic
    return super.applyStatusDamage(pokemon, status, state);
  }

  // --- Weather System ---

  /**
   * Gen 3 weather end-of-turn chip damage.
   *
   * Sandstorm: 1/16 max HP to non-Rock/Ground/Steel types.
   * Hail (new in Gen 3): 1/16 max HP to non-Ice types.
   * Rain/Sun: no chip damage.
   *
   * NOTE: NO SpDef boost for Rock types in sandstorm — that was added in Gen 4 (D/P).
   *
   * Source: pret/pokeemerald src/battle_util.c — weather damage = maxHP / 16
   */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen3WeatherEffects(state);
  }

  // --- Entry Hazard System ---

  /**
   * Gen 3 entry hazards: only Spikes available (no Stealth Rock, no Toxic Spikes).
   *
   * Damage table (per pret/pokeemerald src/battle_util.c):
   *   1 layer = 1/8 max HP
   *   2 layers = 1/6 max HP
   *   3 layers = 1/4 max HP
   *
   * Flying-types are immune. Levitate ability is immune.
   *
   * Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage routine
   */
  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult {
    // Gen 3: only spikes available — no Stealth Rock (Gen 4) or Toxic Spikes (Gen 4)
    const spikes = side.hazards.find((h) => h.type === "spikes");
    if (!spikes) return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };

    // Flying-types are immune to spikes
    // Source: pret/pokeemerald — TYPE_FLYING check in hazard application
    if (pokemon.types.includes("flying")) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Levitate ability grants immunity to ground-affecting effects including spikes
    // Source: pret/pokeemerald — Levitate ability check in hazard application
    if (pokemon.ability === "levitate") {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Damage fractions: 0 layers (sentinel), 1 layer = 1/8, 2 layers = 1/6, 3 layers = 1/4
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage fractions table
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    const fractions = [0, 1 / 8, 1 / 6, 1 / 4]; // index = layer count
    const layers = Math.min(spikes.layers, 3);
    // Guard: 0-layer spikes cannot deal damage (engine should never create them, but be defensive)
    if (layers === 0) return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    const fraction = fractions[layers] ?? 1 / 8; // fallback to 1/8 (1-layer default)
    const damage = Math.max(1, Math.floor(maxHp * fraction));

    const pokemonName = pokemon.pokemon.nickname ?? pokemon.pokemon.speciesId.toString();
    return {
      damage,
      statusInflicted: null,
      statChanges: [],
      messages: [`${pokemonName} was hurt by the spikes!`],
    };
  }

  /**
   * Gen 3-6 EXP formula: classic formula (no level scaling).
   * EXP = (b * L_d / 7) * (1 / s) * t
   *
   * Source: pret/pokeemerald src/battle_util.c GiveExpToMon
   * Also: packages/core/src/logic/experience.ts calculateExpGainClassic
   */
  calculateExpGain(context: ExpContext): number {
    return calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
    );
  }

  // --- Held Item System ---

  /**
   * Gen 3 has held items (inherited from Gen 2, modernized).
   */
  hasHeldItems(): boolean {
    return true;
  }

  /**
   * Gen 3 held item trigger dispatch.
   *
   * Delegates to applyGen3HeldItem for end-of-turn, on-damage-taken, and on-hit triggers.
   * Inline item effects (Choice Band, type boosters) are handled in Gen3DamageCalc.
   *
   * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects
   */
  applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen3HeldItem(trigger, context);
  }

  // --- Move Effects ---

  /**
   * Gen 3 move effect execution.
   *
   * Processes secondary effects (status infliction, stat changes, recoil, drain,
   * weather, entry hazards, protect, volatile statuses, custom effects).
   *
   * Gen 3 differences from Gen 2:
   * - Same 0-255 scale for effect chance with 1/256 failure rate at 100%
   * - Knock Off removes defender's item (no damage boost — Gen 5+ only)
   * - Electric types immune to paralysis (unlike Gen 2)
   * - Abilities may grant additional immunities (handled separately in damage calc)
   *
   * Source: pret/pokeemerald src/battle_script_commands.c
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    } = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    // Knock Off: custom handler — move data has effect: null so we handle by ID
    // Source: pret/pokeemerald src/battle_script_commands.c — Knock Off removes item
    if (context.move.id === "knock-off") {
      if (context.defender.pokemon.heldItem) {
        const item = context.defender.pokemon.heldItem;
        context.defender.pokemon.heldItem = null;
        const defenderName = context.defender.pokemon.nickname ?? "The foe";
        result.messages.push(`${defenderName} lost its ${item}!`);
        // Source: pokeemerald — no damage boost in Gen 3 (Gen 5+ only)
      }
    }

    if (!context.move.effect) return result;

    this.applyMoveEffect(context.move.effect, context.move, result, context);

    return result;
  }

  /**
   * Roll for a secondary effect chance on the 0-255 scale.
   * Even a 100% chance has a 1/256 failure rate (effectChance = 255, roll can equal 255).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — secondary effect probability
   */
  private rollEffectChance(chance: number, rng: SeededRandom): boolean {
    const effectChance = Math.floor((chance * 255) / 100);
    return rng.int(0, 255) < effectChance;
  }

  /**
   * Apply a single MoveEffect to the mutable result object.
   * Handles all effect types defined in the MoveEffect discriminated union.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c
   */
  private applyMoveEffect(
    effect: MoveEffect,
    move: MoveData,
    result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender, damage, rng } = context;

    switch (effect.type) {
      case "status-chance": {
        // Roll for status infliction on 0-255 scale (1/256 failure rate even at 100%)
        // Source: pret/pokeemerald — secondary effect probability check
        if (this.rollEffectChance(effect.chance, rng)) {
          if (!defender.pokemon.status) {
            if (canInflictGen3Status(effect.status, defender)) {
              result.statusInflicted = effect.status;
            }
          }
        }
        break;
      }

      case "status-guaranteed": {
        // Guaranteed status (e.g., Thunder Wave, Toxic, Will-O-Wisp)
        // Source: pret/pokeemerald — primary effect status infliction
        if (!defender.pokemon.status) {
          if (canInflictGen3Status(effect.status, defender)) {
            result.statusInflicted = effect.status;
          }
        }
        break;
      }

      case "stat-change": {
        // Only apply the secondary-effect roll for damaging moves — status moves
        // (e.g., Swords Dance, Dragon Dance) have guaranteed primary effects and
        // must never incur the 1/256 failure.
        // Source: pret/pokeemerald — secondary effect check only for damaging moves
        if (move.category !== "status" && !this.rollEffectChance(effect.chance, rng)) {
          break;
        }
        for (const change of effect.changes) {
          result.statChanges.push({
            target: effect.target === "self" ? "attacker" : "defender",
            stat: change.stat,
            stages: change.stages,
          });
        }
        break;
      }

      case "recoil": {
        // Recoil damage is a fraction of damage dealt
        // Source: pret/pokeemerald — recoil = floor(damage * fraction)
        result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
        break;
      }

      case "drain": {
        // Drain heals a fraction of damage dealt
        // Source: pret/pokeemerald — drain = floor(damage * fraction)
        result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
        break;
      }

      case "heal": {
        // Heal a fraction of max HP (e.g., Recover, Milk Drink)
        // Source: pret/pokeemerald — heal = floor(maxHP * fraction)
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        result.healAmount = Math.max(1, Math.floor(maxHp * effect.amount));
        break;
      }

      case "multi": {
        // Process each sub-effect (e.g., Scald = damage + 30% burn)
        for (const subEffect of effect.effects) {
          this.applyMoveEffect(subEffect, move, result, context);
        }
        break;
      }

      case "volatile-status": {
        // For damaging moves, roll the effect chance
        // For status moves (e.g., Focus Energy, Substitute), guaranteed
        if (move.category !== "status" && !this.rollEffectChance(effect.chance, rng)) {
          break;
        }
        result.volatileInflicted = effect.status;
        break;
      }

      case "weather": {
        // Set weather for 5 turns (Gen 3 default, no weather rocks)
        // Source: pret/pokeemerald — weather moves set 5-turn weather
        result.weatherSet = {
          weather: effect.weather,
          turns: effect.turns ?? 5,
          source: move.id,
        };
        break;
      }

      case "entry-hazard": {
        // Entry hazard targets the opponent's side
        // Source: pret/pokeemerald — Spikes placed on foe's side
        const attackerSideIndex = context.state.sides.findIndex((side) =>
          side.active.some((a) => a?.pokemon === attacker.pokemon),
        );
        const targetSide = attackerSideIndex === 0 ? 1 : 0;
        result.hazardSet = {
          hazard: effect.hazard,
          targetSide: targetSide as 0 | 1,
        };
        break;
      }

      case "switch-out": {
        if (effect.target === "self") {
          // Baton Pass — switch out preserving stat changes and volatile statuses
          // Source: pret/pokeemerald — Baton Pass transfers volatiles
          result.switchOut = true;
        }
        break;
      }

      case "protect": {
        // Protect/Detect — engine handles protect volatile + consecutive-use scaling
        // Source: pret/pokeemerald — Protect sets PROTECTED status
        result.volatileInflicted = "protect";
        break;
      }

      case "custom": {
        this.handleCustomEffect(move, result, context);
        break;
      }

      case "remove-hazards": {
        // Intentionally no-op: all Gen 3 remove-hazards effects (Rapid Spin)
        // are handled via the "custom" case in handleCustomEffect.
        // clearSideHazards is set there, not here.
        // Source: pret/pokeemerald — Rapid Spin uses EFFECT_RAPID_SPIN (custom)
        break;
      }

      case "fixed-damage":
      case "level-damage":
      case "ohko":
      case "damage":
        // These are handled by the damage calculation itself
        break;

      case "terrain":
      case "screen":
      case "multi-hit":
      case "two-turn":
        // Handled by the engine or N/A in Gen 3
        break;
    }
  }

  /**
   * Handle custom move effects specific to Gen 3.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c
   */
  private handleCustomEffect(
    move: MoveData,
    result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender } = context;
    const pokemonName = attacker.pokemon.nickname ?? "The Pokemon";

    switch (move.id) {
      case "belly-drum": {
        // Lose 50% max HP, maximize Attack to +6
        // Source: pret/pokeemerald — Belly Drum cuts HP and maximizes Attack
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        const halfHp = Math.floor(maxHp / 2);
        if (attacker.pokemon.currentHp > halfHp) {
          result.recoilDamage = halfHp;
          result.statChanges.push({
            target: "attacker",
            stat: "attack",
            stages: 6 - attacker.statStages.attack,
          });
          result.messages.push(`${pokemonName} cut its own HP and maximized Attack!`);
        } else {
          result.messages.push(`${pokemonName} is too weak to use Belly Drum!`);
        }
        break;
      }

      case "rapid-spin": {
        // Remove leech-seed and binding volatiles from user, spikes from user's side
        // Source: pret/pokeemerald — Rapid Spin clears Spikes, Leech Seed, Wrap
        result.volatilesToClear = [
          { target: "attacker", volatile: "leech-seed" },
          { target: "attacker", volatile: "bound" },
        ];
        result.clearSideHazards = "attacker";
        result.messages.push(`${pokemonName} blew away leech seed and spikes!`);
        break;
      }

      case "mean-look":
      case "spider-web":
      case "block": {
        // Trapping effect — prevents switching
        // Source: pret/pokeemerald — Mean Look / Spider Web / Block set TRAPPED flag
        result.volatileInflicted = "trapped";
        break;
      }

      case "thief": {
        // Steal defender's item if user has no item
        // Source: pret/pokeemerald — Thief takes held item
        if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
          result.itemTransfer = { from: "defender", to: "attacker" };
          result.messages.push(
            `${pokemonName} stole ${defender.pokemon.nickname ?? "the foe"}'s ${defender.pokemon.heldItem}!`,
          );
        }
        break;
      }

      case "baton-pass": {
        // Switch out preserving stat changes and volatile statuses
        // Source: pret/pokeemerald — Baton Pass
        result.switchOut = true;
        break;
      }

      case "explosion":
      case "self-destruct": {
        result.selfFaint = true;
        result.messages.push(`${pokemonName} exploded!`);
        break;
      }

      default: {
        // Unknown custom effect — no-op
        break;
      }
    }
  }

  // --- Turn Order (Quick Claw) ---

  /**
   * Pre-rolls Quick Claw for each move action before the main sort.
   * Quick Claw gives an 18.75% (3/16) chance to move first among same-priority actions.
   *
   * Overrides the BaseRuleset hook so PRNG calls (QC rolls) happen before tiebreak
   * keys are assigned, preserving PRNG consumption order.
   *
   * Source: pret/pokeemerald src/battle_util.c — HOLD_EFFECT_QUICK_CLAW (game uses
   * 60/256 ≈ 23.4%; Showdown normalizes to 18.75% = 3/16 for Gen 3)
   */
  protected override getQuickClawActivated(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): Set<number> {
    const quickClawActivated = new Set<number>();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action && action.type === "move") {
        const side = state.sides[action.side];
        const active = side?.active[0];
        if (active?.pokemon.heldItem === "quick-claw") {
          // 18.75% = 3/16 chance to activate
          // Source: Showdown sim/battle-actions.ts — Quick Claw 18.75% in Gen 3
          if (rng.chance(3 / 16)) {
            quickClawActivated.add(i);
          }
        }
      }
    }
    return quickClawActivated;
  }

  // --- Speed (turn order helper) ---

  /**
   * Gen 3-6 paralysis speed penalty: 0.25x (speed is quartered).
   * Gen 7+ uses 0.5x (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));
    if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (×0.25)
      // Source: pret/pokeemerald src/battle_util.c
      effective = Math.floor(effective * 0.25);
    }
    return Math.max(1, effective);
  }
}

// ─── Gen 3 Status Immunity ─────────────────────────────────────────────────

/**
 * Gen 3 type immunities to status conditions.
 *
 * Differences from Gen 2:
 * - Electric types ARE immune to paralysis in Gen 3 (added in Gen 3).
 * - Fire: immune to burn
 * - Ice: immune to freeze
 * - Poison/Steel: immune to poison and badly-poisoned
 * - Electric: immune to paralysis (NEW in Gen 3)
 *
 * Note: Limber ability also prevents paralysis, but that's handled by the
 * ability system, not here. This function only checks type-based immunity.
 *
 * Source: pret/pokeemerald src/battle_util.c — CanBeStatusd checks
 */
const GEN3_STATUS_IMMUNITIES: Record<string, readonly PokemonType[]> = {
  burn: ["fire"],
  poison: ["poison", "steel"],
  "badly-poisoned": ["poison", "steel"],
  freeze: ["ice"],
  paralysis: ["electric"],
};

/**
 * Check whether a status condition can be inflicted on a target Pokemon in Gen 3.
 *
 * @param status - The status to attempt to inflict
 * @param target - The target Pokemon
 * @returns true if the status can be inflicted
 */
export function canInflictGen3Status(status: PrimaryStatus, target: ActivePokemon): boolean {
  // Can't have two primary statuses at once
  if (target.pokemon.status !== null) {
    return false;
  }

  // Check type immunities
  // Source: pret/pokeemerald src/battle_util.c
  const immuneTypes = GEN3_STATUS_IMMUNITIES[status];
  if (immuneTypes) {
    for (const type of target.types) {
      if (immuneTypes.includes(type)) {
        return false;
      }
    }
  }

  return true;
}
