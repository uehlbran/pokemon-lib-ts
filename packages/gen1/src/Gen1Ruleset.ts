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
  StatBlock,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  calculateExpGainClassic,
  gen12FullParalysisCheck,
  gen14MultiHitRoll,
  gen16ConfusionSelfHitRoll,
  getGen12StatStageRatio,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "./data";
import { rollGen1Critical } from "./Gen1CritCalc";
import { calculateGen1Damage } from "./Gen1DamageCalc";
import type { Gen1BadgeBoosts } from "./Gen1StatCalc";
import { applyGen1BadgeBoosts, calculateGen1Stats } from "./Gen1StatCalc";
import { GEN1_TYPE_CHART, GEN1_TYPES } from "./Gen1TypeChart";

/**
 * Gen 1 critical hit rate "table".
 * Gen 1 doesn't use a stage-based crit rate table like later gens.
 * It uses a Speed-based formula instead. This table is provided
 * to satisfy the GenerationRuleset interface; it's not actually used
 * for crit calculations (rollCritical uses the Speed-based formula).
 */
const GEN1_CRIT_RATE_TABLE: readonly number[] = [1 / 16] as const;

/** Options for Gen1Ruleset constructor. */
export interface Gen1RulesetOptions {
  /**
   * Opt-in badge stat boosts. Each badge multiplies the relevant stat by ×9/8 (floor).
   * These are a single-player mechanic — competitive/link battles never apply them.
   * Default: undefined (no badge boosts applied).
   */
  readonly badgeBoosts?: Gen1BadgeBoosts;
}

/**
 * Gen1Ruleset — implements GenerationRuleset directly (not extending BaseRuleset).
 *
 * Gen 1 (Red/Blue/Yellow) is mechanically distinct enough from Gen 3+
 * that it warrants its own complete implementation rather than overriding a BaseRuleset.
 *
 * Key Gen 1 characteristics:
 * - No abilities, no held items, no weather, no terrain, no entry hazards
 * - Physical/Special determined by type, not by move
 * - Critical hits based on Speed stat
 * - 1/256 miss bug on 100% accuracy moves
 * - Permanent freeze (only thawed by fire moves)
 * - Focus Energy bug (divides crit rate by 4)
 */
export class Gen1Ruleset implements GenerationRuleset {
  readonly generation = 1 as const;
  readonly name = "Gen 1 (RBY)";

  private readonly dataManager = createGen1DataManager();
  private readonly badgeBoosts?: Gen1BadgeBoosts;

  constructor(options?: Gen1RulesetOptions) {
    this.badgeBoosts = options?.badgeBoosts;
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN1_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN1_TYPES;
  }

  // --- Stat Calculation ---

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    const base = calculateGen1Stats(pokemon, species);
    return this.badgeBoosts ? applyGen1BadgeBoosts(base, this.badgeBoosts) : base;
  }

  // --- Damage Calculation ---

  calculateDamage(context: DamageContext): DamageResult {
    const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
    return calculateGen1Damage(context, GEN1_TYPE_CHART, attackerSpecies);
  }

  // --- Critical Hits ---

  getCritRateTable(): readonly number[] {
    return GEN1_CRIT_RATE_TABLE;
  }

  getCritMultiplier(): number {
    // Gen 1 crits are handled by level doubling in Gen1DamageCalc.ts, not a flat multiplier
    return 1;
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;

    // Status moves don't crit
    if (move.category === "status") return false;

    const attackerSpecies = this.dataManager.getSpecies(attacker.pokemon.speciesId);
    return rollGen1Critical(attacker, move, attackerSpecies, rng);
  }

  // --- Turn Order ---

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
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
   * In Gen 1, paralysis reduces speed to 25%.
   */
  private getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Apply stat stages (integer arithmetic — Source: pret/pokered data/battle/stat_modifiers.asm)
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

    // Source: pokered RageEffect — Gen 1 Rage miss loop.
    // If the attacker is locked into Rage and has missed once (rage-miss-lock),
    // all subsequent Rage uses auto-miss (replicating the cartridge infinite loop).
    if (attacker.volatileStatuses.has("rage-miss-lock") && move.id === "rage") {
      return false;
    }

    // OHKO (Fissure, Guillotine, Horn Drill): only hits if user's in-battle speed >= target's
    // Source: pret/pokered engine/battle/core.asm — compares in-battle speed values
    // Source: gen1-ground-truth.md section 5: "Fail automatically if user's Speed < target's Speed"
    if (move.effect?.type === "ohko") {
      const attackerSpeed = this.getEffectiveSpeed(attacker);
      const defenderSpeed = this.getEffectiveSpeed(defender);
      if (attackerSpeed < defenderSpeed) return false;
    }

    // Moves with null accuracy never miss (e.g., Swift)
    if (move.accuracy === null) {
      return true;
    }

    // Source: pret/pokered engine/battle/core.asm:5348 CalcHitChance — two sequential integer
    // multiply-divide on 0-255 scale. Each stage modifier is applied as a separate floor()
    // operation using the Gen 1-2 stat stage numerator/denominator ratios:
    //   stage  0: 2/2   stage +1: 3/2   stage -1: 2/3   ... stage +6: 8/2   stage -6: 2/8

    // Step 1: Convert move accuracy from 0-100 percentage to 0-255 scale
    let acc: number;
    if (move.accuracy >= 100) {
      acc = 255;
    } else {
      acc = Math.floor((move.accuracy * 255) / 100);
    }

    // Step 2: Apply accuracy stage (integer multiply-divide)
    const accStage = attacker.statStages.accuracy;
    if (accStage !== 0) {
      const accNum = Math.max(2, 2 + accStage);
      const accDen = Math.max(2, 2 - accStage);
      acc = Math.floor((acc * accNum) / accDen);
    }

    // Clamp to 0-255
    acc = Math.max(0, Math.min(255, acc));

    // Step 3: Apply evasion stage (integer multiply-divide, inverted)
    // Evasion stage +1 is like accuracy stage -1 (reduces hit chance)
    const evaStage = defender.statStages.evasion;
    if (evaStage !== 0) {
      // Evasion is inverted: +1 evasion uses the -1 accuracy ratio (2/3)
      const evaNum = Math.max(2, 2 - evaStage);
      const evaDen = Math.max(2, 2 + evaStage);
      acc = Math.floor((acc * evaNum) / evaDen);
    }

    // Clamp to 0-255
    acc = Math.max(0, Math.min(255, acc));

    // Gen 1 1/256 miss bug: even 100% accuracy moves use < comparison
    // against a 0-255 random roll, meaning 255/256 max hit chance.
    // Exception: self-targeting moves get +1 to their threshold, making
    // 100% accuracy moves always hit (256/256). (Showdown scripts.ts:408)
    let threshold = acc;
    if (move.target === "self") {
      threshold = Math.min(256, threshold + 1);
    }
    const roll = rng.int(0, 255);

    return roll < threshold;
  }

  // Gen 1 has no semi-invulnerable two-turn moves in the Gen 3+ sense.
  canHitSemiInvulnerable(_moveId: string, _volatile: VolatileStatus): boolean {
    return false;
  }

  // Gen 1 has no Pressure ability — PP cost is always 1.
  getPPCost(_actor: ActivePokemon, _defender: ActivePokemon | null, _state: BattleState): number {
    return 1;
  }

  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const { move, damage, defender, brokeSubstitute } = context;

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
      screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
      selfFaint?: boolean;
      noRecharge?: boolean;
      customDamage?: {
        target: "attacker" | "defender";
        amount: number;
        source: string;
        type?: PokemonType | null;
      } | null;
      statusCured?: { target: "attacker" | "defender" | "both" } | null;
      statStagesReset?: { target: "attacker" | "defender" | "both" } | null;
      volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      screensCleared?: "attacker" | "defender" | "both" | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      statusCuredOnly?: { target: "attacker" | "defender" | "both" } | null;
      selfStatusInflicted?: PrimaryStatus | null;
      selfVolatileInflicted?: VolatileStatus | null;
      selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      typeChange?: { target: "attacker" | "defender"; types: readonly PokemonType[] } | null;
      recursiveMove?: string | null;
      moveSlotChange?: {
        slot: number;
        newMoveId: string;
        newPP: number;
        originalMoveId: string;
      } | null;
      forcedMoveSet?: {
        moveIndex: number;
        moveId: string;
        volatileStatus: VolatileStatus;
      } | null;
      multiHitCount?: number | null;
    } = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    // Source: gen1-ground-truth.md §7 — Hyper Beam
    // In Gen 1, Hyper Beam skips recharge if it KOs the target, breaks a Substitute, or misses.
    // The recharge flag on the move is handled by the engine; we signal skip via noRecharge.
    // NOTE: By the time executeMoveEffect is called, the engine has already applied damage to
    // defender.pokemon.currentHp (clamped to 0 on KO). So a KO is detected by checking currentHp === 0.
    // We also require damage > 0 to avoid triggering on missed moves (damage = 0).
    // brokeSubstitute: set by the engine when this hit destroyed the defender's substitute.
    if (
      move.flags.recharge &&
      damage > 0 &&
      (defender.pokemon.currentHp === 0 || brokeSubstitute)
    ) {
      result.noRecharge = true;
    }

    if (!move.effect) return result;

    this.applyMoveEffect(move.effect, move, result, context);

    return result;
  }

  private applyMoveEffect(
    effect: NonNullable<MoveData["effect"]>,
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
      screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
      selfFaint?: boolean;
      noRecharge?: boolean;
      customDamage?: {
        target: "attacker" | "defender";
        amount: number;
        source: string;
        type?: PokemonType | null;
      } | null;
      statusCured?: { target: "attacker" | "defender" | "both" } | null;
      statStagesReset?: { target: "attacker" | "defender" | "both" } | null;
      volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      screensCleared?: "attacker" | "defender" | "both" | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      statusCuredOnly?: { target: "attacker" | "defender" | "both" } | null;
      selfStatusInflicted?: PrimaryStatus | null;
      selfVolatileInflicted?: VolatileStatus | null;
      selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      typeChange?: { target: "attacker" | "defender"; types: readonly PokemonType[] } | null;
      recursiveMove?: string | null;
      moveSlotChange?: {
        slot: number;
        newMoveId: string;
        newPP: number;
        originalMoveId: string;
      } | null;
      forcedMoveSet?: {
        moveIndex: number;
        moveId: string;
        volatileStatus: VolatileStatus;
      } | null;
      multiHitCount?: number | null;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender, damage, rng } = context;

    switch (effect.type) {
      case "status-chance": {
        // Source: pret/pokered engine/battle/core.asm — secondary effect chance uses 0-255 scale
        // Roll: random(0..255) < floor(chance * 256 / 100)
        // e.g. 10% chance = threshold 25, probability = 25/256 ~ 9.77%
        const statusThreshold = Math.floor((effect.chance * 256) / 100);
        if (rng.int(0, 255) < statusThreshold) {
          // Can't inflict status if target already has one
          if (!defender.pokemon.status) {
            // Can't burn fire types, can't freeze ice types, etc.
            if (this.canInflictStatus(effect.status, defender)) {
              result.statusInflicted = effect.status;
            }
          }
        }
        break;
      }

      case "status-guaranteed": {
        if (!defender.pokemon.status) {
          if (this.canInflictStatus(effect.status, defender)) {
            result.statusInflicted = effect.status;
          }
        }
        break;
      }

      case "stat-change": {
        // Source: gen1-ground-truth.md §7 — Secondary Effect Chance
        // Stat-drop secondaries (e.g. Psychic's SpDef drop) must roll chance before applying.
        // chance=100 means always apply; chance<100 requires a dice roll.
        const chanceToApply = effect.chance ?? 100;
        const isSecondaryEffect = effect.target === "foe";
        if (isSecondaryEffect && chanceToApply < 100) {
          // Roll: random(0..255) < floor(chance * 256 / 100)
          const threshold = Math.floor((chanceToApply * 256) / 100);
          if (rng.int(0, 255) >= threshold) {
            // Chance roll failed — do not apply stat change
            break;
          }
        }

        for (const change of effect.changes) {
          const resolvedTarget = effect.target === "self" ? "attacker" : "defender";

          // Source: pret/pokered src/engine/battle/effect_commands.asm — Mist
          // Mist blocks all foe-targeted stat drops. If the defender has Mist active,
          // skip any stat changes targeting the defender with negative stages.
          if (
            resolvedTarget === "defender" &&
            change.stages < 0 &&
            defender.volatileStatuses.has("mist")
          ) {
            const defenderName = defender.pokemon.nickname ?? "The target";
            result.messages.push(`${defenderName} is protected by the mist!`);
            continue;
          }

          // Source: gen1-ground-truth.md §1 — Unified Special Stat
          // Gen 1 has a single Special stat for both offense and defense.
          // Any change to spAttack or spDefense must apply equally to BOTH,
          // because they represent the same unified stat.
          if (change.stat === "spAttack" || change.stat === "spDefense") {
            result.statChanges.push({
              target: resolvedTarget,
              stat: "spAttack",
              stages: change.stages,
            });
            result.statChanges.push({
              target: resolvedTarget,
              stat: "spDefense",
              stages: change.stages,
            });
          } else {
            result.statChanges.push({
              target: resolvedTarget,
              stat: change.stat,
              stages: change.stages,
            });
          }
        }
        break;
      }

      case "recoil": {
        // Recoil damage is a fraction of damage dealt
        if (damage > 0) {
          result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
        }
        break;
      }

      case "drain": {
        // Drain heals a fraction of damage dealt
        if (damage > 0) {
          result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
        }
        break;
      }

      case "heal": {
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        result.healAmount = Math.max(1, Math.floor(maxHp * effect.amount));
        break;
      }

      case "multi": {
        // Process each sub-effect
        for (const subEffect of effect.effects) {
          this.applyMoveEffect(subEffect, move, result, context);
        }
        break;
      }

      case "screen": {
        // Reflect / Light Screen: set a screen on the attacker's side
        // Gen 1: screens are permanent — they last until removed by Haze or the setter switches out.
        // turnsLeft: -1 is the permanent sentinel — never expires by countdown.
        result.screenSet = {
          screen: effect.screen,
          turnsLeft: -1, // Gen 1: screens are permanent — never expire by countdown.
          // Removed by Haze or when the setter switches out.
          side: "attacker",
        };
        result.messages.push(
          `${effect.screen === "reflect" ? "Reflect" : "Light Screen"} raised ${attacker.pokemon.nickname ?? "the user"}'s defenses!`,
        );
        break;
      }

      case "fixed-damage": {
        // Dragon Rage (40 damage), Sonic Boom (20 damage), etc.
        // Override the damage dealt with a fixed amount
        result.customDamage = {
          target: "defender",
          amount: effect.damage,
          source: move.id,
          type: move.type,
        };
        break;
      }

      case "level-damage": {
        // Night Shade, Seismic Toss: damage = user's level
        result.customDamage = {
          target: "defender",
          amount: attacker.pokemon.level,
          source: move.id,
          type: move.type,
        };
        break;
      }

      case "ohko": {
        // Fissure, Guillotine, Horn Drill: instant KO if it hits
        // The move only hits if user is faster than target (handled in accuracy check)
        result.customDamage = {
          target: "defender",
          amount: defender.pokemon.currentHp, // Deal exactly current HP to KO
          source: move.id,
          type: move.type,
        };
        result.messages.push("It's a one-hit KO!");
        break;
      }

      case "volatile-status": {
        // In Gen 1: Confusion, Bind, Wrap, etc.
        if (effect.status === "confusion") {
          // Source: pret/pokered engine/battle/core.asm — secondary effect chance uses 0-255 scale
          const confThreshold = Math.floor((effect.chance * 256) / 100);
          if (rng.int(0, 255) < confThreshold) {
            if (!defender.volatileStatuses.has("confusion")) {
              // Confusion lasts 2-5 turns in Gen 1
              // Source: pokered effects.asm:1143-1147 — `and $3; inc a; inc a` = random(0-3)+2 = [2,5]
              const turns = rng.int(2, 5);
              result.volatileInflicted = "confusion";
              result.volatileData = { turnsLeft: turns };
            }
          }
        } else if (effect.status === "bound") {
          // Bind, Wrap, Fire Spin, Clamp: trapping moves in Gen 1
          // No chance roll — trapping moves always trap if they hit (accuracy is the filter).
          // Duration is weighted: 37.5% × 2 turns, 37.5% × 3 turns, 12.5% × 4, 12.5% × 5
          // (Showdown conditions.ts:225, same as multi-hit distribution)
          // Source: gen1-ground-truth.md §7 — Trapping Moves
          // The volatile key must be "bound" — the engine checks "bound" to determine immobilization.
          if (!defender.volatileStatuses.has("bound")) {
            const turns = rng.pick([2, 2, 2, 3, 3, 3, 4, 5] as const);
            result.volatileInflicted = "bound";
            result.volatileData = { turnsLeft: turns, data: { bindTurns: turns } };
            result.messages.push(`${defender.pokemon.nickname ?? "The target"} was trapped!`);
          }
        } else if (effect.status === "focus-energy") {
          // Source: pret/pokered — Focus Energy sets SUBSTATUS_FOCUS_ENERGY
          // Self-targeting volatile: permanent until switch-out or Haze.
          // Fails silently if already active (no duplicate volatile).
          if (!attacker.volatileStatuses.has("focus-energy")) {
            result.selfVolatileInflicted = "focus-energy";
            result.selfVolatileData = { turnsLeft: -1 };
          }
        } else if (effect.status === "leech-seed") {
          // Source: pret/pokered — Grass types are immune to Leech Seed
          // Defender-targeting volatile: permanent until switch-out or Haze.
          if (defender.types.includes("grass")) {
            result.messages.push(`It doesn't affect ${defender.pokemon.nickname ?? "the target"}!`);
          } else if (defender.volatileStatuses.has("leech-seed")) {
            result.messages.push("But it failed!");
          } else {
            result.volatileInflicted = "leech-seed";
            result.volatileData = { turnsLeft: -1 };
          }
        }
        break;
      }

      case "damage":
        // Pure damage — handled by the damage calculation itself
        break;

      case "custom": {
        // Handle specific custom moves by handler name
        if (effect.handler === "splash") {
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Splash does nothing
          result.messages.push("But nothing happened!");
        } else if (effect.handler === "super-fang") {
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Super Fang
          // Deals damage equal to half the target's current HP, minimum 1.
          result.customDamage = {
            target: "defender",
            amount: Math.max(1, Math.floor(defender.pokemon.currentHp / 2)),
            source: "super-fang",
          };
        } else if (effect.handler === "psywave") {
          // Source: pret/pokered engine/battle/core.asm lines 4664-4788
          // Player Psywave: rerolls 0 → damage range [1, floor(level*1.5)-1]
          // Enemy Psywave: allows 0 → damage range [0, floor(level*1.5)-1]
          const maxDamage = Math.floor(attacker.pokemon.level * 1.5);
          const upperBound = Math.max(1, maxDamage - 1);
          // Determine if attacker is on the "enemy" side (index 1)
          const attackerSide = context.state.sides.findIndex((side) =>
            side.active.includes(attacker),
          );
          const isEnemySide = attackerSide === 1;
          let amount: number;
          if (isEnemySide) {
            // Enemy Psywave: [0, floor(level*1.5)-1] — can deal 0 damage
            amount = rng.int(0, upperBound);
          } else {
            // Player Psywave: reroll zeros → [1, floor(level*1.5)-1]
            amount = rng.int(1, upperBound);
          }
          result.customDamage = {
            target: "defender",
            amount,
            source: "psywave",
          };
        } else if (effect.handler === "teleport") {
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Teleport
          // In Gen 1, Teleport always fails in trainer battles and flees in wild battles.
          // Flee mechanics are not wired up; always fail for now.
          result.messages.push("But it failed!");
        } else if (effect.handler === "haze") {
          // Haze: resets all stat stages for both pokemon, clears all volatile statuses
          // for both Pokemon, and removes all screens from both sides (Gen 1 only).
          // Status cure: DEFENDER ONLY — Source: pokered move_effects/haze.asm:15-43
          // Non-volatile status (burn/paralysis/etc.) is only cured for the target,
          // NOT the user. Stat stage reset applies to both (separate operation).
          // statusCured: resets defender's stat stages AND cures status (engine contract — BattleEngine processEffectResult)
          result.statusCured = { target: "defender" };
          // statStagesReset: resets attacker's stages only — attacker's status is NOT cured by Haze
          result.statStagesReset = { target: "attacker" };
          result.screensCleared = "both";
          // Build volatilesToClear from all current volatile statuses on both Pokemon.
          // The engine will delete each and emit volatile-end events via processEffectResult.
          const hazeClears: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }> =
            [];
          for (const volatile of attacker.volatileStatuses.keys()) {
            hazeClears.push({ target: "attacker", volatile });
          }
          for (const volatile of defender.volatileStatuses.keys()) {
            hazeClears.push({ target: "defender", volatile });
          }
          result.volatilesToClear = hazeClears;
          result.messages.push("All stat changes were eliminated!");
        } else if (effect.handler === "explosion" || effect.handler === "self-destruct") {
          // Explosion / Self-Destruct: user faints after using the move
          result.selfFaint = true;
        } else if (effect.handler === "rest") {
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Rest
          // Rest heals to full HP and puts the user to sleep for exactly 2 turns.
          // Fails if user is at full HP AND has no primary status condition.
          const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
          const isFullHp = attacker.pokemon.currentHp >= maxHp;
          const hasStatus =
            attacker.pokemon.status !== null && attacker.pokemon.status !== undefined;
          if (isFullHp && !hasStatus) {
            result.messages.push("But it failed!");
          } else {
            result.statusCuredOnly = { target: "attacker" };
            result.healAmount = maxHp;
            result.selfStatusInflicted = "sleep";
            result.selfVolatileData = { turnsLeft: 2 };
          }
        } else if (effect.handler === "mist") {
          // Source: pret/pokered — Mist is SUBSTATUS_MIST, a permanent bit with no turn counter (lasts until switch-out or Haze)
          // Gen 2+ introduced the 5-turn timer; Gen 1 uses -1 (permanent sentinel).
          // Fails if user already has Mist active.
          if (attacker.volatileStatuses.has("mist")) {
            result.messages.push("But it failed!");
          } else {
            result.selfVolatileInflicted = "mist";
            result.selfVolatileData = { turnsLeft: -1 };
          }
        } else if (effect.handler === "conversion") {
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Conversion
          // Gen 1 Conversion copies the DEFENDER's types (not based on moves like Gen 2+).
          result.typeChange = { target: "attacker", types: [...defender.types] };
        } else if (effect.handler === "counter") {
          // Counter in Gen 1: only reflects Normal and Fighting type moves
          const lastDamage = attacker.lastDamageTaken ?? 0;
          const lastType = attacker.lastDamageType;
          const counterableType = lastType === "normal" || lastType === "fighting";
          if (lastDamage > 0 && counterableType) {
            result.customDamage = {
              target: "defender",
              amount: lastDamage * 2,
              source: "counter",
              type: move.type,
            };
          } else {
            result.messages.push("Counter failed!");
          }
        } else if (effect.handler === "disable") {
          // Source: pret/pokered DisableEffect — picks a RANDOM move slot (and $3),
          // checks if the move in that slot is non-zero, and disables it.
          // Duration: random 1-8 turns (pokered `and 7; inc a` = 0-7 + 1 = 1-8).
          // Fails if target already disabled or all moves have 0 PP.
          // NOTE: Gen 1 Disable targets a random move, NOT the last-used move (Gen 2+).
          if (defender.volatileStatuses.has("disable")) {
            result.messages.push("But it failed!");
          } else {
            // Pick a random move slot with PP > 0 (pokered loops until non-zero)
            const validMoves = defender.pokemon.moves
              .map((m, i) => ({ moveId: m.moveId, index: i, pp: m.currentPP }))
              .filter((m) => m.moveId && m.pp > 0);
            if (validMoves.length === 0) {
              result.messages.push("But it failed!");
            } else {
              const pickedIndex = rng.int(0, validMoves.length - 1);
              const picked = validMoves[pickedIndex];
              const duration = rng.int(1, 8);
              result.volatileInflicted = "disable";
              result.volatileData = {
                turnsLeft: duration,
                data: { moveId: picked?.moveId ?? "" },
              };
            }
          }
        } else if (effect.handler === "substitute") {
          // Source: pret/pokered SubstituteEffect + gen1-ground-truth.md
          // Creates a substitute that absorbs damage. Costs 1/4 max HP.
          // Source: pokered SubstituteEffect — cartridge uses <= comparison: if currentHP <= subCost, Substitute fails.
          const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
          const subHp = Math.floor(maxHp / 4);
          if (attacker.substituteHp > 0) {
            result.messages.push("But it failed!");
          } else if (attacker.pokemon.currentHp <= subHp) {
            result.messages.push("But it does not have enough HP!");
          } else {
            // Set substituteHp directly; HP cost is handled by customDamage so the
            // engine emits a proper damage event for the hp-delta tracker.
            attacker.substituteHp = subHp;
            result.customDamage = {
              target: "attacker",
              amount: subHp,
              source: "substitute",
            };
            result.selfVolatileInflicted = "substitute";
            result.selfVolatileData = { turnsLeft: -1 };
            result.messages.push(`${attacker.pokemon.nickname ?? "The user"} put in a substitute!`);
          }
        } else if (effect.handler === "rage") {
          // Source: pret/pokered src/engine/battle/move_effects.asm RageEffect
          // First use: sets rage volatile and locks user into repeating Rage.
          // Subsequent uses: re-locks the forced move (volatile already set by onDamageReceived boosts).
          const moveIndex = attacker.pokemon.moves.findIndex((m) => m.moveId === move.id);
          if (!attacker.volatileStatuses.has("rage")) {
            // First activation: set volatile and force repeat
            result.selfVolatileInflicted = "rage";
            result.selfVolatileData = { turnsLeft: -1, data: { moveIndex } };
          }
          // Always re-lock into Rage so it repeats next turn
          result.forcedMoveSet = {
            moveIndex: moveIndex >= 0 ? moveIndex : 0,
            moveId: move.id,
            volatileStatus: "rage",
          };
        } else if (effect.handler === "mimic") {
          // Source: pret/pokered src/engine/battle/move_effects.asm MimicEffect
          // Copies the opponent's last used move into Mimic's move slot for this battle.
          const lastMove = defender.lastMoveUsed;
          const invalidMoves = new Set(["mimic", "transform", "metronome", "struggle"]);
          if (!lastMove || invalidMoves.has(lastMove)) {
            result.messages.push("But it failed!");
          } else {
            // Find the slot Mimic occupies in the attacker's moveset
            const mimicSlotIndex = attacker.pokemon.moves.findIndex((m) => m.moveId === move.id);
            if (mimicSlotIndex < 0) {
              result.messages.push("But it failed!");
            } else {
              // Capture original PP before replacement
              // Source: pret/pokered — Mimic replacement reverts on switch-out with original PP
              const originalSlot = attacker.pokemon.moves[mimicSlotIndex];
              const originalCurrentPP = originalSlot?.currentPP ?? 0;
              const originalMaxPP = originalSlot?.maxPP ?? 0;
              const originalPpUps = originalSlot?.ppUps ?? 0;

              result.moveSlotChange = {
                slot: mimicSlotIndex,
                newMoveId: lastMove,
                newPP: 5,
                originalMoveId: move.id,
              };
              // Store backup data via selfVolatileInflicted so engine uses standard volatile pathway
              result.selfVolatileInflicted = "mimic-slot";
              result.selfVolatileData = {
                turnsLeft: -1,
                data: {
                  slot: mimicSlotIndex,
                  originalMoveId: move.id,
                  originalCurrentPP,
                  originalMaxPP,
                  originalPpUps,
                },
              };
            }
          }
        } else if (effect.handler === "mirror-move") {
          // Source: pret/pokered src/engine/battle/move_effects.asm MirrorMoveEffect
          // Executes the move the defender used last turn.
          const lastMove = defender.lastMoveUsed;
          // Cannot mirror: no previous move, or certain uncopyable moves
          // Source: pokered MirrorMoveEffect — only Mirror Move itself is blocked from copying.
          const cannotMirror = new Set(["mirror-move"]);
          if (!lastMove || cannotMirror.has(lastMove)) {
            result.messages.push("But it failed!");
          } else {
            result.recursiveMove = lastMove;
          }
        } else if (effect.handler === "metronome") {
          // Source: pret/pokered src/engine/battle/move_effects.asm MetronomeEffect
          // Picks a random Gen 1 move (excluding Metronome and Struggle) and executes it.
          const allMoves = this.dataManager.getAllMoves();
          const pool = allMoves.filter((m) => m.id !== "metronome" && m.id !== "struggle");
          if (pool.length === 0) {
            result.messages.push("But it failed!");
          } else {
            const idx = rng.int(0, pool.length - 1);
            const chosen = pool[idx];
            if (chosen) {
              result.recursiveMove = chosen.id;
            }
          }
        } else if (effect.handler === "transform") {
          // Source: pret/pokered src/engine/battle/move_effects.asm TransformEffect
          // Copies the defender's types, stat stages, calculated stats (except HP), and moves.
          // Copy types
          result.typeChange = { target: "attacker", types: [...defender.types] };
          // Copy stat stages (direct mutation — same pattern as Haze)
          for (const stat of [
            "attack",
            "defense",
            "spAttack",
            "spDefense",
            "speed",
            "accuracy",
            "evasion",
          ] as const) {
            attacker.statStages[stat] = defender.statStages[stat];
          }
          // Copy calculated stats (all except HP)
          // Cast to mutable to allow direct stat overwrite (Transform is a runtime mutation)
          if (defender.pokemon.calculatedStats && attacker.pokemon.calculatedStats) {
            const mutableStats = attacker.pokemon.calculatedStats as {
              -readonly [K in keyof import("@pokemon-lib-ts/core").StatBlock]: import("@pokemon-lib-ts/core").StatBlock[K];
            };
            mutableStats.attack = defender.pokemon.calculatedStats.attack;
            mutableStats.defense = defender.pokemon.calculatedStats.defense;
            mutableStats.spAttack = defender.pokemon.calculatedStats.spAttack;
            mutableStats.spDefense = defender.pokemon.calculatedStats.spDefense;
            mutableStats.speed = defender.pokemon.calculatedStats.speed;
          }
          // Copy moves with PP = 5 each; store originals for restoration on switch-out
          const originalMoves = attacker.pokemon.moves.map((m) => ({ ...m }));
          attacker.pokemon.moves = defender.pokemon.moves.map((m) => ({
            moveId: m.moveId,
            currentPP: 5,
            maxPP: 5,
            ppUps: 0,
          }));
          // Set transformed volatile to store originals
          attacker.transformed = true;
          // Source: pret/pokered TransformEffect — Transform copies the defender's current species appearance.
          // If defender has already transformed, use their transformedSpecies; otherwise look up defender's actual species.
          attacker.transformedSpecies =
            defender.transformedSpecies ??
            this.dataManager.getSpecies(defender.pokemon.speciesId) ??
            null;
          attacker.volatileStatuses.set("transform-data", {
            turnsLeft: -1,
            data: {
              originalMoves,
              originalTypes: [...(attacker.types ?? [])],
              originalStats: attacker.pokemon.calculatedStats
                ? { ...attacker.pokemon.calculatedStats }
                : null,
            },
          });
          result.messages.push(`${attacker.pokemon.nickname ?? "The user"} transformed!`);
        } else if (effect.handler === "bide") {
          // Source: pret/pokered src/engine/battle/move_effects.asm BideEffect
          // Charges for 2-3 turns accumulating damage, then releases 2x accumulated damage.
          const bideVolatile = attacker.volatileStatuses.get("bide");
          if (!bideVolatile) {
            // First use: start charging
            const turns = rng.int(2, 3);
            result.selfVolatileInflicted = "bide";
            result.selfVolatileData = { turnsLeft: turns, data: { accumulatedDamage: 0 } };
            result.forcedMoveSet = {
              moveIndex: attacker.pokemon.moves.findIndex((m) => m.moveId === move.id),
              moveId: move.id,
              volatileStatus: "bide",
            };
            result.messages.push(`${attacker.pokemon.nickname ?? "The user"} is storing energy!`);
          } else {
            const turnsLeft = bideVolatile.turnsLeft;
            const accumulated = (bideVolatile.data?.accumulatedDamage as number) ?? 0;
            if (turnsLeft > 1) {
              // Still charging: decrement turnsLeft and re-lock
              bideVolatile.turnsLeft = turnsLeft - 1;
              result.forcedMoveSet = {
                moveIndex: attacker.pokemon.moves.findIndex((m) => m.moveId === move.id),
                moveId: move.id,
                volatileStatus: "bide",
              };
              result.messages.push(`${attacker.pokemon.nickname ?? "The user"} is storing energy!`);
            } else {
              // Release: deal 2x accumulated damage
              attacker.volatileStatuses.delete("bide");
              if (accumulated === 0) {
                result.messages.push("But it failed!");
              } else {
                result.customDamage = {
                  target: "defender",
                  amount: accumulated * 2,
                  source: "bide",
                };
                result.messages.push(
                  `${attacker.pokemon.nickname ?? "The user"} unleashed energy!`,
                );
              }
            }
          }
        } else if (effect.handler === "thrash") {
          // Source: pret/pokered src/engine/battle/move_effects.asm ThrashEffect
          // Locks into Thrash for 2-3 turns of damage, then confuses the user.
          // Petal Dance uses the same handler.
          // The engine deals damage BEFORE calling executeMoveEffect, so the
          // first use already counts as one damage turn. We store turnsLeft
          // as (randomTurns - 1) to account for this, ensuring the total
          // number of damage turns matches pokered (2 or 3).
          const lockVolatile = attacker.volatileStatuses.get("thrash-lock");
          if (!lockVolatile) {
            // First use: damage already dealt this turn, so remaining forced turns = turns - 1
            const turns = rng.int(2, 3);
            result.selfVolatileInflicted = "thrash-lock";
            result.selfVolatileData = { turnsLeft: turns - 1, data: { moveId: move.id } };
            if (turns - 1 > 0) {
              result.forcedMoveSet = {
                moveIndex: attacker.pokemon.moves.findIndex((m) => m.moveId === move.id),
                moveId: move.id,
                volatileStatus: "thrash-lock",
              };
            } else {
              // turns=1 edge (shouldn't happen with int(2,3), but defensive)
              attacker.volatileStatuses.delete("thrash-lock");
              if (!attacker.volatileStatuses.has("confusion")) {
                result.selfVolatileInflicted = "confusion";
                result.selfVolatileData = { turnsLeft: rng.int(2, 5) };
              }
            }
          } else {
            const turnsLeft = lockVolatile.turnsLeft;
            if (turnsLeft > 1) {
              lockVolatile.turnsLeft = turnsLeft - 1;
              result.forcedMoveSet = {
                moveIndex: attacker.pokemon.moves.findIndex((m) => m.moveId === move.id),
                moveId: move.id,
                volatileStatus: "thrash-lock",
              };
            } else {
              // Last forced turn: damage was already dealt, now remove lock and confuse
              attacker.volatileStatuses.delete("thrash-lock");
              if (!attacker.volatileStatuses.has("confusion")) {
                result.selfVolatileInflicted = "confusion";
                result.selfVolatileData = { turnsLeft: rng.int(2, 5) };
              }
            }
          }
        }
        break;
      }

      case "multi-hit": {
        // Source: pokered multi-hit moves — 37.5/37.5/12.5/12.5% for 2/3/4/5 hits.
        // Roll the hit count and signal the engine to repeat damage calculation.
        // The engine will loop, applying damage for each additional hit.
        // Only the first hit can be a critical hit (Gen 1 rule).
        const hitCount = this.rollMultiHitCount(attacker, rng);
        // multiHitCount is the number of ADDITIONAL hits beyond the first
        // (the engine already dealt damage for the first hit before calling this).
        result.multiHitCount = Math.max(0, hitCount - 1);
        break;
      }

      case "weather":
      case "terrain":
      case "entry-hazard":
      case "remove-hazards":
      case "two-turn":
      case "protect":
        // These effects are N/A in Gen 1
        break;

      case "switch-out":
        // Roar and Whirlwind do nothing in Gen 1 — they have forceSwitch: false.
        // (Showdown gen1 moves.ts: both moves explicitly fail)
        result.messages.push("But it failed!");
        break;
    }
  }

  /**
   * Check if a status condition can be inflicted on a target.
   * Gen 1 immunities: Fire types can't be burned, Ice types can't be frozen, etc.
   */
  private canInflictStatus(status: PrimaryStatus, target: ActivePokemon): boolean {
    switch (status) {
      case "burn":
        return !target.types.includes("fire");
      case "freeze":
        return !target.types.includes("ice");
      case "paralysis":
        // In Gen 1, Electric types CAN be paralyzed (unlike later gens)
        return true;
      case "poison":
      case "badly-poisoned":
        return !target.types.includes("poison");
      case "sleep":
        return true;
      default:
        return true;
    }
  }

  // --- Status Conditions ---

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;

    switch (status) {
      case "burn": {
        // Source: gen1-ground-truth.md §8 — burn shares the N/16 counter with poison and Leech Seed.
        // When the toxic-counter volatile exists (set by Toxic), burn uses and increments that
        // shared counter. Without it, burn deals the standard 1/16 max HP per turn.
        const burnState = pokemon.volatileStatuses.get("toxic-counter");
        if (burnState) {
          const counter = (burnState.data?.counter as number) ?? 1;
          const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
          if (!burnState.data) {
            burnState.data = { counter: counter + 1 };
          } else {
            (burnState.data as Record<string, unknown>).counter = counter + 1;
          }
          return damage;
        }
        return Math.max(1, Math.floor(maxHp / 16));
      }

      case "poison": {
        // Source: gen1-ground-truth.md §8 — poison shares the N/16 counter with burn and Leech Seed.
        // When the toxic-counter volatile exists (set by Toxic), poison uses and increments that
        // shared counter. Without it, poison deals the standard 1/16 max HP per turn.
        const poisonState = pokemon.volatileStatuses.get("toxic-counter");
        if (poisonState) {
          const counter = (poisonState.data?.counter as number) ?? 1;
          const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
          if (!poisonState.data) {
            poisonState.data = { counter: counter + 1 };
          } else {
            (poisonState.data as Record<string, unknown>).counter = counter + 1;
          }
          return damage;
        }
        return Math.max(1, Math.floor(maxHp / 16));
      }

      case "badly-poisoned": {
        // Badly poisoned (Toxic): damage escalates each turn
        // N/16 max HP, where N starts at 1 and increments each turn
        // The toxic counter is stored under the "toxic-counter" volatile key
        const toxicState = pokemon.volatileStatuses.get("toxic-counter");
        const counter = (toxicState?.data?.counter as number) ?? 1;
        const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
        // Increment counter for next turn (ruleset owns this state)
        if (toxicState) {
          if (!toxicState.data) {
            toxicState.data = { counter: counter + 1 };
          } else {
            (toxicState.data as Record<string, unknown>).counter = counter + 1;
          }
        }
        return damage;
      }

      case "freeze":
      case "sleep":
      case "paralysis":
        // These don't deal damage
        return 0;

      default:
        return 0;
    }
  }

  checkFreezeThaw(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    // Gen 1: Frozen Pokemon NEVER thaw naturally.
    // They can only be thawed by being hit by a fire-type move.
    return false;
  }

  processEndOfTurnDefrost(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    // Gen 1: Frozen Pokemon never thaw naturally — no EoT defrost.
    // This method satisfies the GenerationRuleset interface contract; it is never called
    // in practice because Gen 1's getEndOfTurnOrder() does not include "defrost".
    return false;
  }

  rollSleepTurns(rng: SeededRandom): number {
    // Gen 1: Sleep lasts 1-7 turns
    return rng.int(1, 7);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    return gen12FullParalysisCheck(rng);
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    return gen16ConfusionSelfHitRoll(rng);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 1: cannot act on the turn it wakes up
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // Wake up — but cannot act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 1
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Just reached 0 — wake up but can't act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 1
    }
    return false; // Still sleeping
  }

  // --- Abilities (not in Gen 1) ---

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

  // --- Items (not in Gen 1) ---

  hasHeldItems(): boolean {
    return false;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return {
      activated: false,
      effects: [],
      messages: [],
    };
  }

  canUseBagItems(): boolean {
    return false;
  }

  applyBagItem(_itemId: string, _target: ActivePokemon, _state: BattleState): BagItemResult {
    // Gen 1 bag items are deferred — return no effect for now.
    // Standard bag items (Potions, status cures) will be implemented
    // when Gen 1 single-player battles are added.
    return { activated: false, messages: ["It had no effect."] };
  }

  // --- Weather (not in Gen 1) ---

  hasWeather(): boolean {
    return false;
  }

  applyWeatherEffects(_state: BattleState): WeatherEffectResult[] {
    return [];
  }

  // --- Terrain (not in Gen 1) ---

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // --- Entry Hazards (not in Gen 1) ---

  getAvailableHazards(): readonly EntryHazardType[] {
    return [];
  }

  getMaxHazardLayers(_hazardType: EntryHazardType): number {
    // Gen 1 has no entry hazards. Return 1 as a safe fallback in case the engine queries this.
    return 1;
  }

  applyEntryHazards(
    _pokemon: ActivePokemon,
    _side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    return {
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    };
  }

  // --- EXP Gain ---

  calculateExpGain(context: ExpContext): number {
    // Gen 1 has no language metadata — only the 1.5× same-language trade bonus applies.
    // isInternationalTrade is always false here (Gen 1 cartridges cannot detect foreign language).
    // Source: pret/pokered — no language field exists on Gen 1 box data.
    return calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
      false, // Gen 1: no Lucky Egg
      context.isTradedPokemon ?? false,
      false, // Gen 1: no international trade concept
    );
  }

  // --- Battle Gimmick (not in Gen 1) ---

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

    // Check that species exists in Gen 1 (Dex #1-151)
    if (species.id < 1 || species.id > 151) {
      errors.push(`Species #${species.id} (${species.displayName}) is not available in Gen 1`);
    }

    // Check move count (1-4 moves)
    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    // No held items in Gen 1
    if (pokemon.heldItem) {
      errors.push("Held items are not available in Gen 1");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // --- Confusion ---

  getConfusionSelfHitChance(): number {
    // Gen 1: 50% chance to hit itself when confused
    return 0.5;
  }

  calculateConfusionDamage(
    pokemon: ActivePokemon,
    _state: BattleState,
    _rng: SeededRandom,
  ): number {
    // Gen 1: confusion self-hit uses 40 base power with the user's own Attack and Defense.
    // No random variance, no STAB, no critical hit chance, no type effectiveness.
    // Burn halves physical attack even on confusion self-hits.
    // (Showdown gen1 conditions.ts:147-149)
    const level = pokemon.pokemon.level;
    const calcStats = pokemon.pokemon.calculatedStats;
    const baseAtk = calcStats?.attack ?? 50;
    const baseDef = calcStats?.defense ?? 50;

    // Integer stat-stage arithmetic — Source: pret/pokered data/battle/stat_modifiers.asm
    const { num: atkNum, den: atkDen } = getGen12StatStageRatio(pokemon.statStages.attack);
    let atk = Math.max(1, Math.floor((baseAtk * atkNum) / atkDen));
    const { num: defNum, den: defDen } = getGen12StatStageRatio(pokemon.statStages.defense);
    let def = Math.max(1, Math.floor((baseDef * defNum) / defDen));

    // Gen 1 stat overflow: same transform as calculateGen1Damage
    if (atk >= 256 || def >= 256) {
      atk = Math.max(1, Math.floor(atk / 4) % 256);
      def = Math.floor(def / 4) % 256;
      if (def === 0) def = 1;
    }

    if (pokemon.pokemon.status === "burn") {
      atk = Math.floor(atk / 2);
    }

    // Source: pret/pokered engine/battle/core.asm lines 4388-4450 — same formula as main damage calc
    // Must apply Math.min(997, ...) before adding +2 constant, matching calculateGen1Damage.
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    const damage = Math.min(997, Math.floor(Math.floor(levelFactor * 40 * atk) / def / 50)) + 2;
    return Math.max(1, damage);
  }

  confusionSelfHitTargetsOpponentSub(): boolean {
    // Source: pokered engine/battle/core.asm — Gen 1 cartridge bug:
    // confusion self-hit damage is applied to the opponent's Substitute if active.
    return true;
  }

  // Source: pokered effects.asm:1143-1147 — confusion lasts 2-5 turns (and ; inc a; inc a)
  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get("confusion");
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  // Source: Gen 1 bind/trapping — trapping prevents target from acting for 2-5 turns
  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get("bound");
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  // --- Move Miss Hook ---

  /**
   * Handle effects when a move misses.
   * - Explosion/Self-Destruct: user faints even on miss (all gens)
   * - Rage: set rage-miss-lock volatile, causing subsequent Rage uses to auto-miss
   *
   * Source: pret/pokered engine/battle/core.asm — actor faints regardless of hit/miss
   * Source: pret/pokered RageEffect — Gen 1 Rage miss loop
   */
  onMoveMiss(actor: ActivePokemon, move: MoveData, _state: BattleState): void {
    // Explosion/Self-Destruct: user faints even on miss
    if (
      move.effect?.type === "custom" &&
      (move.effect.handler === "explosion" || move.effect.handler === "self-destruct")
    ) {
      actor.pokemon.currentHp = 0;
    }
    // Rage miss-lock: Gen 1 only
    // When Rage misses while the user has the rage volatile, set a miss-lock
    // that causes all subsequent Rage uses to auto-miss (cartridge infinite loop).
    if (actor.volatileStatuses.has("rage")) {
      actor.volatileStatuses.set("rage-miss-lock", { turnsLeft: -1 });
    }
  }

  // --- Reactive Damage Hook ---

  onDamageReceived(
    defender: ActivePokemon,
    damage: number,
    _move: MoveData,
    _state: BattleState,
  ): void {
    // Source: pret/pokered RageEffect — if defender is using Rage, boost Attack +1 on each hit
    const rageVolatile = defender.volatileStatuses.get("rage");
    if (rageVolatile) {
      const newStage = Math.min(6, defender.statStages.attack + 1);
      defender.statStages.attack = newStage;
    }
    // Source: pret/pokered BideEffect — accumulate damage received into the bide counter
    const bideVolatile = defender.volatileStatuses.get("bide");
    if (bideVolatile) {
      const current = (bideVolatile.data?.accumulatedDamage as number) ?? 0;
      bideVolatile.data = { ...bideVolatile.data, accumulatedDamage: current + damage };
    }
  }

  // --- Switch In ---

  onSwitchIn(_pokemon: ActivePokemon, _state: BattleState): void {
    // Gen 1: no switch-in effects needed beyond hazards/abilities (which Gen 1 doesn't have).
  }

  // --- Switch Out ---

  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void {
    // Source: gen1-ground-truth.md §8 — What Persists on Switch-Out
    // Sleep counter persists (does NOT reset on switch-out — it is stored in party data).
    // Source: gen1-ground-truth.md §8 — What Resets on Switch-Out
    // Toxic counter resets to 0 on switch-out, and status reverts to regular poison.
    // (In Gen 1, Toxic'd Pokemon become regular-poisoned when they switch out.)

    // Mimic restoration: if a move slot was replaced by Mimic, restore the original
    // Source: pret/pokered — Mimic replacement reverts on switch-out
    const mimicSlot = pokemon.volatileStatuses.get("mimic-slot");
    if (mimicSlot?.data) {
      const { slot, originalMoveId, originalCurrentPP, originalMaxPP, originalPpUps } =
        mimicSlot.data as {
          slot: number;
          originalMoveId: string;
          originalCurrentPP?: number;
          originalMaxPP?: number;
          originalPpUps?: number;
        };
      if (pokemon.pokemon.moves[slot]) {
        // Use stored original PP values if available; fall back to base PP for backward compatibility
        // Source: pret/pokered — Mimic replacement reverts on switch-out with original PP
        const fallbackPP = this.dataManager.getMove(originalMoveId).pp;
        pokemon.pokemon.moves[slot] = {
          moveId: originalMoveId,
          currentPP: originalCurrentPP ?? fallbackPP,
          maxPP: originalMaxPP ?? fallbackPP,
          ppUps: originalPpUps ?? 0,
        };
      }
    }

    // Transform restoration: if transformed, restore original stats/types/moves
    // Source: pret/pokered — Transform reverts on switch-out
    const transformData = pokemon.volatileStatuses.get("transform-data");
    if (transformData?.data && pokemon.transformed) {
      const { originalMoves, originalTypes, originalStats } = transformData.data as {
        originalMoves: Array<{
          moveId: string;
          currentPP: number;
          maxPP: number;
          ppUps: number;
        }>;
        originalTypes: PokemonType[];
        originalStats: Record<string, number> | null;
      };
      pokemon.pokemon.moves = originalMoves;
      pokemon.types = originalTypes;
      if (originalStats && pokemon.pokemon.calculatedStats) {
        Object.assign(pokemon.pokemon.calculatedStats, originalStats);
      }
      pokemon.transformed = false;
      pokemon.transformedSpecies = null;
    }

    // Preserve the sleep counter through the volatile clear
    const sleepCounter = pokemon.volatileStatuses.get("sleep-counter");

    pokemon.volatileStatuses.clear();

    // Restore sleep counter — sleep persists through switching
    if (sleepCounter) {
      pokemon.volatileStatuses.set("sleep-counter", sleepCounter);
    }

    // Toxic counter reset: if the Pokemon has badly-poisoned status, revert to regular poison.
    // The toxic-counter volatile is NOT restored (it was cleared above).
    if (pokemon.pokemon.status === "badly-poisoned") {
      pokemon.pokemon.status = "poison";
    }

    // Gen 1: screens (Reflect / Light Screen) are cleared when the setter switches out.
    for (const side of state.sides) {
      if (side.active.some((active) => active === pokemon)) {
        side.screens = [];
        break;
      }
    }
  }

  // --- Switching ---

  // Source: pret/pokered engine/battle/core.asm TryRunningFromBattle
  // Gen 1 flee formula:
  //   A = floor((playerSpeed * 32) / floor(wildSpeed / 4)) mod 256
  //   If wildSpeed / 4 == 0 (i.e. wildSpeed < 4), flee always succeeds.
  //   Compare rng(0, 255) < A + 30 * attempts.
  //   After 4th attempt, always succeeds (same as Gen 3+ formula naturally).
  rollFleeSuccess(
    playerSpeed: number,
    wildSpeed: number,
    attempts: number,
    rng: SeededRandom,
  ): boolean {
    if (playerSpeed >= wildSpeed) return true;
    const wildSpeedDiv = Math.floor(wildSpeed / 4);
    if (wildSpeedDiv === 0) return true;
    const a = (Math.floor((playerSpeed * 32) / wildSpeedDiv) + 30 * attempts) % 256;
    return rng.int(0, 255) < a;
  }

  /**
   * Roll a catch attempt using the Gen 1 cartridge algorithm (BallThrowCalc).
   *
   * Source: pret/pokered engine/items/item_effects.asm — ItemUseBall
   * The Gen 1 algorithm is a two-step process:
   * 1. Generate Rand1 in ball-specific range, subtract status modifier. If < 0, caught.
   *    If (Rand1 - Status) > catchRate, fail. Calculate X from HP formula.
   *    Generate Rand2. If Rand2 <= X, caught.
   * 2. If not caught, calculate shake count from Z = (X * Y / 255) + Status2.
   *
   * ballModifier maps to ball type:
   *   1.0 = Poke Ball (rand range 0-255, BallFactor 12, BallFactor2 255)
   *   1.5 = Great Ball (rand range 0-200, BallFactor 8, BallFactor2 200)
   *   2.0 = Ultra Ball (rand range 0-150, BallFactor 12, BallFactor2 150)
   *   1.5 (Safari) = Safari Ball (same as Ultra: rand range 0-150, BallFactor 12, BallFactor2 150)
   */
  rollCatchAttempt(
    catchRate: number,
    maxHp: number,
    currentHp: number,
    status: PrimaryStatus | null,
    ballModifier: number,
    rng: SeededRandom,
  ): CatchResult {
    // Step 1: Determine ball parameters from ballModifier
    // Source: pokered ItemUseBall — ball types determine Rand1 range, BallFactor, BallFactor2
    let randMax: number;
    let ballFactor: number;
    let ballFactor2: number;
    if (ballModifier >= 2.0) {
      // Ultra Ball / Safari Ball
      randMax = 150;
      ballFactor = 12;
      ballFactor2 = 150;
    } else if (ballModifier >= 1.5) {
      // Great Ball
      randMax = 200;
      ballFactor = 8;
      ballFactor2 = 200;
    } else {
      // Poke Ball (default)
      randMax = 255;
      ballFactor = 12;
      ballFactor2 = 255;
    }

    // Step 2: Generate Rand1 in [0, randMax]
    // Source: pokered .loop — rejects values > randMax for Great/Ultra/Safari balls
    const rand1 = rng.int(0, randMax);

    // Step 3: Status modifier subtraction
    // Source: pokered .checkForAilments — freeze/sleep=25, burn/para/poison=12, none=0
    let statusValue = 0;
    if (status === "freeze" || status === "sleep") {
      statusValue = 25;
    } else if (
      status === "burn" ||
      status === "paralysis" ||
      status === "poison" ||
      status === "badly-poisoned"
    ) {
      statusValue = 12;
    }

    // If Status > Rand1, caught immediately
    if (statusValue > rand1) {
      return { caught: true, shakes: 3 };
    }
    const adjustedRand1 = rand1 - statusValue;

    // Step 4: Calculate X = min(255, floor(MaxHP * 255 / ballFactor / max(floor(HP/4), 1)))
    // Source: pokered — W = ((MaxHP * 255) / BallFactor) / max(HP / 4, 1); X = min(W, 255)
    // We compute X before the catchRate check because the shake calculation needs it.
    const hpDiv4 = Math.max(1, Math.floor(currentHp / 4));
    const w = Math.floor(Math.floor((maxHp * 255) / ballFactor) / hpDiv4);
    const x = Math.min(255, w);

    // Step 5: If (Rand1 - Status) > catchRate, fail
    // Source: pokered — `cp b / jr c, .failedToCapture`
    if (adjustedRand1 > catchRate) {
      return {
        caught: false,
        shakes: Gen1Ruleset.gen1CalcShakes(x, catchRate, ballFactor2, statusValue),
      };
    }

    // If W > 255, caught (pokered checks hQuotient+2 which is nonzero when W > 255)
    if (w > 255) {
      return { caught: true, shakes: 3 };
    }

    // Step 6: Generate Rand2. If Rand2 <= X, caught.
    // Source: pokered — `cp b / jr c, .failedToCapture` (if X < Rand2, fail)
    const rand2 = rng.int(0, 255);
    if (rand2 <= x) {
      return { caught: true, shakes: 3 };
    }

    // Failed to capture — calculate shakes
    return {
      caught: false,
      shakes: Gen1Ruleset.gen1CalcShakes(x, catchRate, ballFactor2, statusValue),
    };
  }

  /**
   * Calculate the number of shakes for a failed Gen 1 catch attempt.
   * Source: pokered ItemUseBall .failedToCapture — shake count from Z thresholds.
   * Z = floor(X * Y / 255) + Status2
   * where X = min(255, W) from HP formula, Y = floor(catchRate * 100 / ballFactor2)
   * Status2: none=0, burn/para/poison=5, freeze/sleep=10
   * Z < 10: 0 shakes, 10 <= Z < 30: 1 shake, 30 <= Z < 70: 2 shakes, Z >= 70: 3 shakes
   * Note: 3 shakes is a real failure tier — the Pokemon gives 3 shakes but still escapes.
   */
  private static gen1CalcShakes(
    x: number,
    catchRate: number,
    ballFactor2: number,
    statusValue: number,
  ): 0 | 1 | 2 | 3 {
    const y = Math.floor((catchRate * 100) / ballFactor2);
    const status2 = statusValue >= 25 ? 10 : statusValue >= 12 ? 5 : 0;
    const z = Math.floor((x * y) / 255) + status2;
    if (z < 10) return 0;
    if (z < 30) return 1;
    if (z < 70) return 2;
    return 3;
  }

  shouldExecutePursuitPreSwitch(): boolean {
    return false;
  }

  canSwitch(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 1: trapping moves (Wrap, Bind, Fire Spin, Clamp) prevent switching
    // Source: gen1-ground-truth.md §7 — Trapping Moves; volatile key is "bound"
    return !pokemon.volatileStatuses.has("bound");
  }

  // --- End-of-Turn Formulas ---

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Source: gen1-ground-truth.md §8 — Leech Seed shares the N/16 counter with burn/poison.
    // When the toxic-counter volatile exists (set by Toxic), Leech Seed uses and increments
    // that shared counter. Without it, Leech Seed drains the standard 1/16 max HP.
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    const seedState = pokemon.volatileStatuses.get("toxic-counter");
    if (seedState) {
      const counter = (seedState.data?.counter as number) ?? 1;
      const drain = Math.max(1, Math.floor((maxHp * counter) / 16));
      if (!seedState.data) {
        seedState.data = { counter: counter + 1 };
      } else {
        (seedState.data as Record<string, unknown>).counter = counter + 1;
      }
      return drain;
    }
    return Math.max(1, Math.floor(maxHp / 16));
  }

  calculateCurseDamage(_pokemon: ActivePokemon): number {
    // Curse doesn't exist in Gen 1
    return 0;
  }

  calculateNightmareDamage(_pokemon: ActivePokemon): number {
    // Nightmare doesn't exist in Gen 1
    return 0;
  }

  calculateStruggleDamage(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    state: BattleState,
  ): number {
    // Source: pret/pokered — Struggle is a Normal-type physical move with 50 BP in Gen 1.
    // Ghost types are immune to Normal-type moves.
    // We build a minimal MoveData for Struggle and delegate to calculateDamage.
    // rng uses a fixed seed so this method is deterministic (no live-battle RNG variance).
    // The random factor at seed 0 yields a fixed roll (~89%). This is intentional:
    // calculateStruggleDamage has no rng parameter by interface design. Callers that
    // need full Gen 1 damage variance (engine turn resolution) call calculateDamage()
    // directly with a live DamageContext instead.
    const STRUGGLE_MOVE_GEN1: MoveData = {
      id: "struggle",
      displayName: "Struggle",
      type: "normal",
      category: "physical",
      power: 50,
      accuracy: null,
      pp: 1,
      priority: 0,
      target: "adjacent-foe",
      flags: {
        contact: true,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: false,
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: null,
      description: "Struggle",
      generation: 1,
    };
    const result = this.calculateDamage({
      attacker,
      defender,
      move: STRUGGLE_MOVE_GEN1,
      state,
      rng: new SeededRandom(0),
      isCrit: false,
    });
    return result.damage;
  }

  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    // Gen 1: recoil = 1/2 of damage dealt
    return Math.max(1, Math.floor(damageDealt / 2));
  }

  canBypassProtect(
    _move: MoveData,
    _actor: ActivePokemon,
    _activeVolatile: "protect" | "max-guard",
  ): boolean {
    // Gen 1: no Protect move exists; no moves can bypass it
    return false;
  }

  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen14MultiHitRoll(rng);
  }

  rollProtectSuccess(_consecutiveProtects: number, _rng: SeededRandom): boolean {
    return true; // Gen 1 has no Protect move
  }

  calculateBindDamage(_pokemon: ActivePokemon): number {
    // Gen 1 handles bind/trapping in canExecuteMove, not end-of-turn
    return 0;
  }

  processPerishSong(_pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    // Perish Song doesn't exist in Gen 1
    return { newCount: 0, fainted: false };
  }

  // --- End-of-Turn Order ---

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Source: gen1-ground-truth.md §8 — End-of-Turn Order
    // 1. Burn/poison damage (status-damage)
    // 2. Leech Seed drain (leech-seed)
    // 3. Disable countdown (disable-countdown)
    // 4. Faint check (handled by engine after this array)
    // Leech Seed triggers after poison/burn and before the faint check.
    // Disable countdown is processed by the engine at BattleEngine.ts:2325-2346.
    return ["status-damage", "leech-seed", "disable-countdown"];
  }

  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    // Source: pokered engine/battle/core.asm:546 HandlePoisonBurnLeechSeed
    // Gen 1 processes poison/burn/leech-seed damage after each individual attack,
    // not just at end of turn. This is particularly relevant for multi-hit moves
    // where the defender could faint between hits from residual damage.
    return ["status-damage", "leech-seed"];
  }
}
