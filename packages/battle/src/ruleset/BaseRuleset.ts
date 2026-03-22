import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  MoveData,
  NonHpStat,
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
  ALL_NATURES,
  calculateModifiedCatchRate,
  calculateShakeChecks,
  DataManager,
  getStatStageMultiplier,
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
import type { GenerationRuleset } from "./GenerationRuleset";

/**
 * Abstract base class implementing GenerationRuleset with Gen 6+/7+ defaults.
 * Gen 6-9 typically extend this directly; Gen 3-5 need to override some methods.
 * Gen 1-2 implement the interface directly (too mechanically different).
 */
export abstract class BaseRuleset implements GenerationRuleset {
  abstract readonly generation: Generation;
  abstract readonly name: string;

  protected readonly dataManager: DataManager;

  constructor(dataManager?: DataManager) {
    this.dataManager = dataManager ?? new DataManager();
  }

  abstract getTypeChart(): TypeChart;
  abstract getAvailableTypes(): readonly PokemonType[];

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    // Gen 3+ stat formula: default implementation
    const level = pokemon.level;
    const base = species.baseStats;
    const ivs = pokemon.ivs;
    const evs = pokemon.evs;

    const hp =
      Math.floor(((2 * base.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;

    const calcStat = (baseStat: number, iv: number, ev: number): number => {
      return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5;
    };

    // Apply nature modifier (+10% boosted stat, -10% decreased stat)
    // Source: Game Freak Gen 3+ formula — floor(stat * 1.1) or floor(stat * 0.9)
    const nature = ALL_NATURES.find((n) => n.id === pokemon.nature);
    const applyNature = (stat: number, statKey: NonHpStat): number => {
      if (!nature || nature.increased === null) return stat;
      if (nature.increased === statKey) return Math.floor(stat * 1.1);
      if (nature.decreased === statKey) return Math.floor(stat * 0.9);
      return stat;
    };

    return {
      hp,
      attack: applyNature(calcStat(base.attack, ivs.attack, evs.attack), "attack"),
      defense: applyNature(calcStat(base.defense, ivs.defense, evs.defense), "defense"),
      spAttack: applyNature(calcStat(base.spAttack, ivs.spAttack, evs.spAttack), "spAttack"),
      spDefense: applyNature(calcStat(base.spDefense, ivs.spDefense, evs.spDefense), "spDefense"),
      speed: applyNature(calcStat(base.speed, ivs.speed, evs.speed), "speed"),
    };
  }

  abstract calculateDamage(context: DamageContext): DamageResult;

  // Gen 6+ default; Gen 3-5 use a 2-stage table with 1/16 and 1/8 rates
  getCritRateTable(): readonly number[] {
    // Gen 6+: 1/24, 1/8, 1/2, 1/1
    return [24, 8, 2, 1];
  }

  // Gen 6+ default (1.5x); Gen 3-5 must override (2.0x)
  getCritMultiplier(): number {
    // Gen 6+: 1.5x
    return 1.5;
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;
    const table = this.getCritRateTable();
    let stage = 0;

    // Focus Energy: +2 stages
    // Source: Showdown sim/battle-actions.ts getMoveHit crit stage calc
    if (attacker.volatileStatuses.has("focus-energy")) stage += 2;

    // High crit-ratio move: from move data (e.g., Slash, Crabhammer = critRatio 1)
    // Source: Showdown sim/battle-actions.ts — move.critRatio adds to crit stage
    if (move.critRatio && move.critRatio > 0) stage += move.critRatio;

    // Held item bonuses
    // Source: Showdown sim/battle-actions.ts — item crit stage modifiers
    const item = attacker.pokemon.heldItem;
    if (item === "scope-lens" || item === "razor-claw") stage += 1;
    if (
      (item === "leek" || item === "stick") &&
      (attacker.pokemon.speciesId === 83 || attacker.pokemon.speciesId === 865)
    ) {
      stage += 2;
    }
    if (item === "lucky-punch" && attacker.pokemon.speciesId === 113) stage += 2;

    // Ability: Super Luck (+1 stage)
    // Source: Showdown sim/battle-actions.ts — Super Luck ability crit bonus
    if (attacker.ability === "super-luck") stage += 1;

    stage = Math.min(stage, table.length - 1);
    const rate = table[stage];
    if (rate === undefined) return false;
    return rate <= 1 || rng.int(1, rate) === 1;
  }

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    // Pre-assign one tiebreak key per action BEFORE sorting to ensure deterministic
    // PRNG consumption. V8's sort algorithm calls comparators a non-deterministic number
    // of times, so consuming rng inside the comparator breaks replay determinism.
    // Fix: consume exactly N rng.next() calls upfront, then use keys in comparator.
    // Source: GitHub issue #120

    // Allow subclasses (Gen 3+) to pre-roll "go first" items (Quick Claw, etc.) before
    // tiebreak keys are assigned, preserving PRNG consumption order.
    const quickClawActivated = this.getQuickClawActivated(actions, state, rng);

    const tagged = actions.map((action, idx) => ({ action, idx, tiebreak: rng.next() }));

    tagged.sort((a, b) => {
      const actionA = a.action;
      const actionB = b.action;

      // Switches always go first
      if (actionA.type === "switch" && actionB.type !== "switch") return -1;
      if (actionB.type === "switch" && actionA.type !== "switch") return 1;

      // Item usage goes before moves
      if (actionA.type === "item" && actionB.type === "move") return -1;
      if (actionB.type === "item" && actionA.type === "move") return 1;

      // Run goes before moves
      if (actionA.type === "run" && actionB.type === "move") return -1;
      if (actionB.type === "run" && actionA.type === "move") return 1;

      // For moves, compare priority then speed
      if (actionA.type === "move" && actionB.type === "move") {
        const sideA = state.sides[actionA.side];
        const sideB = state.sides[actionB.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];
        if (!activeA || !activeB) return 0;

        const moveSlotA = activeA.pokemon.moves[actionA.moveIndex];
        const moveSlotB = activeB.pokemon.moves[actionB.moveIndex];
        if (!moveSlotA || !moveSlotB) return 0;

        let priorityA = 0;
        let priorityB = 0;
        try {
          priorityA = this.dataManager.getMove(moveSlotA.moveId).priority;
        } catch {
          /* default 0 */
        }
        try {
          priorityB = this.dataManager.getMove(moveSlotB.moveId).priority;
        } catch {
          /* default 0 */
        }

        if (priorityA !== priorityB) return priorityB - priorityA; // higher priority first

        // Quick Claw / go-first item: activated holders go first within same priority bracket
        const qcA = quickClawActivated.has(a.idx);
        const qcB = quickClawActivated.has(b.idx);
        if (qcA && !qcB) return -1;
        if (qcB && !qcA) return 1;

        // Speed tiebreak
        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);
        if (state.trickRoom.active) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // Deterministic tiebreak (non-move vs non-move of same type)
      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    return tagged.map((t) => t.action);
  }

  /**
   * Hook for subclasses to pre-roll "go first" item effects (Quick Claw, etc.)
   * before tiebreak keys are assigned in resolveTurnOrder.
   *
   * Called with the PRNG object so subclasses consume their RNG calls BEFORE
   * the tiebreak rng.next() calls, preserving PRNG consumption order.
   *
   * Returns a Set of action indices that have a "go first" item activated.
   * Default: no items activated (Gen 4+ Quick Claw uses different mechanics).
   *
   * Source: pret/pokeemerald HOLD_EFFECT_QUICK_CLAW — Gen 3 Quick Claw pre-roll
   */
  protected getQuickClawActivated(
    _actions: BattleAction[],
    _state: BattleState,
    _rng: SeededRandom,
  ): Set<number> {
    return new Set();
  }

  doesMoveHit(context: AccuracyContext): boolean {
    // Never-miss moves (accuracy === null)
    if (context.move.accuracy === null) return true;

    const accuracy = context.move.accuracy;
    const accStage = context.attacker.statStages.accuracy;
    const evaStage = context.defender.statStages.evasion;
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    let multiplier: number;
    if (netStage >= 0) {
      multiplier = (3 + netStage) / 3;
    } else {
      multiplier = 3 / (3 - netStage);
    }

    const finalAccuracy = Math.floor(accuracy * multiplier);
    return context.rng.int(1, 100) <= finalAccuracy;
  }

  executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    const result: MoveEffectResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    return result;
  }

  /**
   * Default: no moves can hit a semi-invulnerable target.
   * Gen 3+ rulesets override to allow specific moves (e.g., Thunder hits flying).
   * Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
   */
  canHitSemiInvulnerable(_moveId: string, _volatile: VolatileStatus): boolean {
    return false;
  }

  /**
   * PP cost is 2 when the defender has Pressure, 1 otherwise.
   * Pressure was introduced in Gen 3 and applies to all Gen 3+ rulesets.
   * Source: pret/pokeemerald — ABILITY_PRESSURE deducts 2 PP per move use
   * Source: Showdown sim/battle.ts — ABILITY_PRESSURE check in deductPP
   */
  getPPCost(_actor: ActivePokemon, defender: ActivePokemon | null, _state: BattleState): number {
    return defender?.ability === "pressure" ? 2 : 1;
  }

  /**
   * Handle effects when a move misses.
   * Explosion/Self-Destruct: user faints even on miss (all gens).
   *
   * Source: pret/pokered engine/battle/core.asm — actor faints regardless of hit/miss
   * Source: pret/pokeemerald — Self-Destruct/Explosion: user always faints even on miss
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
    // No-op — Gen 3+ rulesets override if they need reactive damage triggers.
    // Source: pret/pokered — Rage and Bide are Gen 1 only in base form
  }

  // Burn: Gen 7+ default (1/16 max HP); Gen 3-6 must override (1/8 max HP)
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    switch (status) {
      case "burn":
        // Gen 7+: 1/16 max HP
        return Math.max(1, Math.floor(maxHp / 16));
      case "poison":
        return Math.max(1, Math.floor(maxHp / 8));
      case "badly-poisoned": {
        // Escalating: 1/16, 2/16, 3/16... per turn, tracked via toxic-counter volatile
        const toxicState = pokemon.volatileStatuses.get("toxic-counter");
        const counter = (toxicState?.data?.counter as number) ?? 1;
        const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
        if (toxicState) {
          if (!toxicState.data) {
            toxicState.data = { counter: counter + 1 };
          } else {
            (toxicState.data as Record<string, unknown>).counter = counter + 1;
          }
        }
        return damage;
      }
      default:
        return 0;
    }
  }

  // Gen 3+ default (20% thaw pre-move); Gen 2 overrides to always return false
  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 3+: 20% chance to thaw each turn (checked pre-move, not EoT)
    return rng.chance(0.2);
  }

  // Gen 3+ never thaw via EoT (handled pre-move by checkFreezeThaw); Gen 2 overrides this
  processEndOfTurnDefrost(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    return false;
  }

  // Gen 5+ default (1-3 turns); Gen 3-4 must override (2-5 turns)
  rollSleepTurns(rng: SeededRandom): number {
    // Gen 5+: 1-3 turns
    return rng.int(1, 3);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 3+: exact 25% chance to be fully paralyzed
    return rng.chance(0.25);
  }

  // Gen 3-6 default (50% self-hit); Gen 7+ must override (33%)
  rollConfusionSelfHit(rng: SeededRandom): boolean {
    // Gen 1-6: 50% chance to hit itself in confusion
    return rng.chance(0.5);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Look up the sleep counter in volatile statuses
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // No counter found or already at 0 — wake up
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true; // Can act this turn (Gen 2+ behavior)
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Just reached 0 — wake up, can act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }
    return false; // Still sleeping
  }

  hasAbilities(): boolean {
    return true;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return { activated: false, effects: [], messages: [] };
  }

  hasHeldItems(): boolean {
    return true;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return { activated: false, effects: [], messages: [] };
  }

  canUseBagItems(): boolean {
    return true;
  }

  /**
   * Apply a bag item (Potion, Antidote, X Attack, Revive, etc.) to a target Pokemon.
   *
   * Bag items are generation-invariant in their effects — a Super Potion always heals 50 HP,
   * an X Attack always boosts Attack by +2. Poke Ball mechanics are deferred to per-gen rulesets.
   *
   * Source: Bulbapedia "Potion" / "X Attack" etc. — item effects are consistent across all gens.
   */
  applyBagItem(itemId: string, target: ActivePokemon, _state: BattleState): BagItemResult {
    const pokemon = target.pokemon;
    const messages: string[] = [];
    const name = pokemon.nickname ?? `species#${pokemon.speciesId}`;

    // Normalize item ID: strip hyphens and lowercase for matching
    // This handles alternate IDs like "full-restore" → "fullrestore", "parlyz-heal" → "parlyzheal"
    const normalizedId = itemId.replace(/-/g, "").toLowerCase();

    // ─── Healing items ────────────────────────────────────────────────────────
    const healAmounts: Record<string, number | "full"> = {
      potion: 20,
      superpotion: 50,
      hyperpotion: 120,
      maxpotion: "full",
      fullrestore: "full",
    };

    const healVal = healAmounts[normalizedId];
    if (healVal !== undefined) {
      const maxHp = pokemon.calculatedStats?.hp ?? pokemon.currentHp;
      const currentHp = pokemon.currentHp;

      // Cannot use healing items on fainted Pokemon (use Revive instead)
      if (currentHp <= 0) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      const healAmount =
        healVal === "full" ? maxHp - currentHp : Math.min(healVal as number, maxHp - currentHp);

      if (healAmount <= 0) {
        messages.push(`${name}'s HP is already full!`);
        return { activated: false, messages };
      }

      messages.push(`${name} recovered ${healAmount} HP!`);

      // Full Restore also cures status
      if (normalizedId === "fullrestore" && pokemon.status) {
        const curedStatus = pokemon.status;
        messages.push(`${name}'s ${curedStatus} was cured!`);
        return { activated: true, healAmount, statusCured: curedStatus, messages };
      }

      return { activated: true, healAmount, messages };
    }

    // ─── Status cure items ────────────────────────────────────────────────────
    const statusCures: Record<string, PrimaryStatus | "any"> = {
      antidote: "poison",
      burnheal: "burn",
      iceheal: "freeze",
      awakening: "sleep",
      paralyzeheal: "paralysis",
      parlyzheal: "paralysis",
      fullheal: "any",
    };

    const cureTarget = statusCures[normalizedId];
    if (cureTarget !== undefined) {
      if (!pokemon.status) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      // Check if the item cures this specific status
      const cures =
        cureTarget === "any" ||
        pokemon.status === cureTarget ||
        // Antidote cures both poison and badly-poisoned
        (cureTarget === "poison" && pokemon.status === "badly-poisoned");

      if (!cures) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      messages.push(`${name}'s ${pokemon.status} was cured!`);
      return { activated: true, statusCured: pokemon.status, messages };
    }

    // ─── Revive items ─────────────────────────────────────────────────────────
    if (normalizedId === "revive" || normalizedId === "maxrevive") {
      if (pokemon.currentHp > 0) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      const maxHp = pokemon.calculatedStats?.hp ?? 1;
      const reviveHp = normalizedId === "maxrevive" ? maxHp : Math.floor(maxHp / 2);
      messages.push(`${name} was revived!`);
      return { activated: true, revived: true, healAmount: reviveHp, messages };
    }

    // ─── Stat boost items (X items: +2 stages, capped at +6) ─────────────────
    // Source: Bulbapedia "X Attack" etc. — Gen 7+ X items raise stat by 2 stages
    const statBoosts: Record<string, import("@pokemon-lib-ts/core").BattleStat> = {
      xattack: "attack",
      xdefense: "defense",
      xdefend: "defense",
      xspatk: "spAttack",
      xspecial: "spAttack",
      xspdef: "spDefense",
      xspeed: "speed",
      xaccuracy: "accuracy",
    };

    const boostStat = statBoosts[normalizedId];
    if (boostStat !== undefined) {
      const currentStage = target.statStages[boostStat] ?? 0;

      if (currentStage >= 6) {
        messages.push(`${name}'s ${boostStat} won't go higher!`);
        return { activated: false, messages };
      }

      messages.push(`${name}'s ${boostStat} rose sharply!`);
      return { activated: true, statChange: { stat: boostStat, stages: 2 }, messages };
    }

    // ─── Unknown item ─────────────────────────────────────────────────────────
    messages.push("It had no effect.");
    return { activated: false, messages };
  }

  hasWeather(): boolean {
    return true;
  }

  applyWeatherEffects(_state: BattleState): WeatherEffectResult[] {
    return [];
  }

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // Gen 4-5 defaults (spikes, stealth-rock, toxic-spikes); Gen 3 must override (spikes only); Gen 6+ must override (add sticky-web)
  getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes"];
  }

  applyEntryHazards(
    _pokemon: ActivePokemon,
    _side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  calculateExpGain(context: ExpContext): number {
    // Simplified Gen 5+ scaled formula
    const baseExp = context.defeatedSpecies.baseExp;
    const a = context.isTrainerBattle ? 1.5 : 1;
    const b = baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;
    const p = context.hasLuckyEgg ? 1.5 : 1;

    return Math.floor(((a * b * l) / (5 * s)) * p);
  }

  getBattleGimmick(): BattleGimmick | null {
    return null;
  }

  validatePokemon(_pokemon: PokemonInstance, _species: PokemonSpeciesData): ValidationResult {
    return { valid: true, errors: [] };
  }

  getConfusionSelfHitChance(): number {
    // Gen 1-6: 50% chance; Gen 7+ overrides to 33%
    return 0.5;
  }

  calculateConfusionDamage(
    pokemon: ActivePokemon,
    _state: BattleState,
    _rng: SeededRandom,
  ): number {
    // Gen 3+: confusion self-hit uses 40 base power with the user's own Attack and Defense.
    // No random variance, no STAB, no critical hit, no type effectiveness.
    // Burn halves physical attack even on confusion self-hits (confusion is always physical-category).
    // No Gen 1 stat overflow check — that bug is Gen 1 specific.
    // Source: Showdown sim/battle.ts confusion self-damage logic
    const level = pokemon.pokemon.level;
    const calcStats = pokemon.pokemon.calculatedStats;
    const baseAtk = calcStats?.attack ?? 50;
    const baseDef = calcStats?.defense ?? 50;

    let atk = Math.max(1, Math.floor(baseAtk * getStatStageMultiplier(pokemon.statStages.attack)));
    const def = Math.max(
      1,
      Math.floor(baseDef * getStatStageMultiplier(pokemon.statStages.defense)),
    );

    if (pokemon.pokemon.status === "burn") {
      atk = Math.floor(atk / 2);
    }

    const levelFactor = Math.floor((2 * level) / 5) + 2;
    const damage = Math.floor(Math.floor(levelFactor * 40 * atk) / def / 50) + 2;
    return Math.max(1, damage);
  }

  confusionSelfHitTargetsOpponentSub(): boolean {
    // Gen 3+: confusion self-hit always damages the confused Pokemon itself.
    return false;
  }

  // Source: default for Gen 3-6; Gen 7+ overrides to 2-5 turn range
  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get("confusion");
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  // Source: default for Gen 3+
  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get("bound");
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  onSwitchOut(pokemon: ActivePokemon, _state: BattleState): void {
    // Default Gen 3+ behavior: clear all volatile statuses on switch-out.
    // Gen 1-2 override this to handle generation-specific persistence rules.
    pokemon.volatileStatuses.clear();
  }

  // Source: Bulbapedia -- Escape (Generation III onwards)
  // F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
  // Flee succeeds if playerSpeed >= wildSpeed OR F >= 256 OR rng(0,255) < F
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
   * Roll a catch attempt using the Gen 3+ catch formula.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
   * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
   *
   * Formula:
   *   a = ((3 * HP_max - 2 * HP_current) * CatchRate * BallMod) / (3 * HP_max)) * StatusMod
   *   b = 65536 / (255 / a)^0.1875
   *   Each of 4 shake checks passes if rng(0,65535) < b
   *   4 passes = caught; display shakes = min(failedCheck, 3)
   */
  /**
   * Returns the status catch rate modifier table for this generation.
   * Default is Gen 3-4 (2.0x for sleep/freeze).
   * Gen 5+ rulesets should override to use 2.5x for sleep/freeze.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
   * Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze to 2.5x
   */
  protected getStatusCatchModifiers(): Record<PrimaryStatus, number> {
    // Gen 3-4 values inlined to avoid cross-package build-order dependency
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
    return {
      sleep: 2.0,
      freeze: 2.0,
      paralysis: 1.5,
      burn: 1.5,
      poison: 1.5,
      "badly-poisoned": 1.5,
    };
  }

  rollCatchAttempt(
    catchRate: number,
    maxHp: number,
    currentHp: number,
    status: PrimaryStatus | null,
    ballModifier: number,
    rng: SeededRandom,
  ): CatchResult {
    const modifiers = this.getStatusCatchModifiers();
    const statusModifier = status ? (modifiers[status] ?? 1) : 1;
    const modifiedRate = calculateModifiedCatchRate(
      maxHp,
      currentHp,
      catchRate,
      ballModifier,
      statusModifier,
    );
    const shakeChecks = calculateShakeChecks(modifiedRate, rng);
    // calculateShakeChecks returns 0-4; 4 = caught
    // CatchAttemptEvent uses shakes 0-3 where 3 = caught display
    if (shakeChecks >= 4) {
      return { caught: true, shakes: 3 };
    }
    return { caught: false, shakes: shakeChecks as 0 | 1 | 2 };
  }

  // Gen 3-7 default (true); Gen 8+ must override (false)
  shouldExecutePursuitPreSwitch(): boolean {
    // Gen 3-7 default (override to false in Gen 8+)
    return true;
  }

  canSwitch(_pokemon: ActivePokemon, _state: BattleState): boolean {
    // Default Gen 3+: no switching restrictions from the ruleset.
    // Shadow Tag, Arena Trap etc. would be checked via abilities, not here.
    return true;
  }

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Gen 2+: 1/8 max HP
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  calculateCurseDamage(pokemon: ActivePokemon): number {
    // Gen 2+: 1/4 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateNightmareDamage(pokemon: ActivePokemon): number {
    // Gen 2+: 1/4 max HP per turn while asleep
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  // Gen 2+ default (typeless 50 BP physical, no type chart, no STAB, no variance).
  // Gen 3+ inherit this directly. Gen 1-2 override with their own implementations.
  calculateStruggleDamage(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    _state: BattleState,
  ): number {
    // Source: Showdown — Gen 3+ Struggle is typeless physical damage
    // Formula: same as confusion self-hit but with 50 BP instead of 40 BP.
    const level = attacker.pokemon.level;
    const attack = attacker.pokemon.calculatedStats?.attack ?? 100;
    const defense = defender.pokemon.calculatedStats?.defense ?? 100;
    const effectiveAttack = Math.max(
      1,
      Math.floor(attack * getStatStageMultiplier(attacker.statStages.attack)),
    );
    const effectiveDefense = Math.max(
      1,
      Math.floor(defense * getStatStageMultiplier(defender.statStages.defense)),
    );
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 50 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;
    return Math.max(1, baseDamage);
  }

  // Gen 4+ default (1/4 max HP); Gen 3 must override (1/2 damage dealt)
  calculateStruggleRecoil(attacker: ActivePokemon, _damageDealt: number): number {
    // Gen 4+ default: 1/4 of attacker's max HP
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  // Gen 5+ default (uniform 2-5); Gen 3-4 must override ([2,2,2,3,3,3,4,5] weighted)
  rollMultiHitCount(attacker: ActivePokemon, rng: SeededRandom): number {
    // Gen 5+ distribution: 35/35/15/15% for 2/3/4/5 hits
    // Skill Link ability (Gen 5+) always hits 5 times
    if (attacker.ability === "skill-link") return 5;
    const roll = rng.int(1, 100);
    if (roll <= 35) return 2;
    if (roll <= 70) return 3;
    if (roll <= 85) return 4;
    return 5;
  }

  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    const denominator = Math.min(729, 3 ** consecutiveProtects);
    return rng.chance(1 / denominator);
  }

  // Gen 5+ default (1/8 max HP); Gen 2-4 must override (1/16 max HP)
  calculateBindDamage(pokemon: ActivePokemon): number {
    // Gen 5+ default: 1/8 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    const perishState = pokemon.volatileStatuses.get("perish-song");
    if (!perishState) return { newCount: 0, fainted: false };
    const counter = (perishState.data?.counter as number) ?? perishState.turnsLeft;
    if (counter <= 1) {
      return { newCount: 0, fainted: true };
    }
    const newCount = counter - 1;
    if (perishState.data) {
      perishState.data.counter = newCount;
    } else {
      perishState.turnsLeft = newCount;
    }
    return { newCount, fainted: false };
  }

  /**
   * Returns the effective speed of the given active pokemon, accounting for stat stages
   * and the paralysis speed penalty.
   *
   * Gen 7+ default: paralysis halves speed (×0.5). Gen 3-6 and Gen 1-2 must override (×0.25).
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;
    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));
    // Gen 7+ default: paralysis halves speed (×0.5); Gen 1-6 must override (×0.25)
    if (active.pokemon.status === "paralysis") {
      effective = Math.floor(effective * 0.5);
    }
    return Math.max(1, effective);
  }

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Note: "defrost" is intentionally absent here. Gen 3+ handle freeze thaw pre-move
    // via checkFreezeThaw (20% per turn), NOT between turns. Only Gen 2 includes "defrost"
    // in its EoT order (see Gen2Ruleset.getEndOfTurnOrder and processEndOfTurnDefrost).
    return [
      "weather-damage",
      "weather-countdown",
      "terrain-countdown",
      "status-damage",
      "leech-seed",
      "leftovers",
      "black-sludge",
      "bind",
      "curse",
      "nightmare",
      "wish",
      "future-attack",
      "perish-song",
      "screen-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
    ];
  }

  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }
}
