import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  NonHpStat,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { ALL_NATURES, DataManager, getStatStageMultiplier } from "@pokemon-lib-ts/core";
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
    const table = this.getCritRateTable();
    const stage = Math.min(
      context.attacker.volatileStatuses.has("focus-energy") ? 2 : 0,
      table.length - 1,
    );
    const rate = table[stage];
    if (rate === undefined) return false;
    return rate <= 1 || context.rng.int(1, rate) === 1;
  }

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    return [...actions].sort((a, b) => {
      // Switches always go first
      if (a.type === "switch" && b.type !== "switch") return -1;
      if (b.type === "switch" && a.type !== "switch") return 1;

      // Item usage goes before moves
      if (a.type === "item" && b.type === "move") return -1;
      if (b.type === "item" && a.type === "move") return 1;

      // Run goes before moves
      if (a.type === "run" && b.type === "move") return -1;
      if (b.type === "run" && a.type === "move") return 1;

      // For moves, compare priority then speed
      if (a.type === "move" && b.type === "move") {
        const sideA = state.sides[a.side];
        const sideB = state.sides[b.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];
        if (!activeA || !activeB) return 0;

        const moveSlotA = activeA.pokemon.moves[a.moveIndex];
        const moveSlotB = activeB.pokemon.moves[b.moveIndex];
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

        // Speed tiebreak
        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);
        if (state.trickRoom.active) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
        return rng.chance(0.5) ? -1 : 1;
      }

      // Random tiebreak (non-move vs non-move of same type)
      return rng.chance(0.5) ? -1 : 1;
    });
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

  // Gen 3+ default (20% thaw); Gen 2 must override (25/256 ≈ 9.8%)
  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 2+: 20% chance to thaw each turn
    return rng.chance(0.2);
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

  applyEntryHazards(_pokemon: ActivePokemon, _side: BattleSide): EntryHazardResult {
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

  onSwitchOut(pokemon: ActivePokemon, _state: BattleState): void {
    // Default Gen 3+ behavior: clear all volatile statuses on switch-out.
    // Gen 1-2 override this to handle generation-specific persistence rules.
    pokemon.volatileStatuses.clear();
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
}
