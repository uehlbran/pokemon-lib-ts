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
import type { BattleAction, MoveAction } from "../events";
import type { ActivePokemon, BattleSide, BattleState } from "../state";
import type { GenerationRuleset } from "./GenerationRuleset";

/**
 * Abstract base class implementing GenerationRuleset with Gen 3+ defaults.
 * Gen 3-9 extend this; Gen 1-2 implement the interface directly.
 */
export abstract class BaseRuleset implements GenerationRuleset {
  abstract readonly generation: Generation;
  abstract readonly name: string;

  abstract getTypeChart(): TypeChart;
  abstract getValidTypes(): readonly PokemonType[];

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

    return {
      hp,
      attack: calcStat(base.attack, ivs.attack, evs.attack),
      defense: calcStat(base.defense, ivs.defense, evs.defense),
      spAttack: calcStat(base.spAttack, ivs.spAttack, evs.spAttack),
      spDefense: calcStat(base.spDefense, ivs.spDefense, evs.spDefense),
      speed: calcStat(base.speed, ivs.speed, evs.speed),
    };
  }

  abstract calculateDamage(context: DamageContext): DamageResult;

  getCritRateTable(): readonly number[] {
    // Gen 6+: 1/24, 1/8, 1/2, 1/1
    return [24, 8, 2, 1];
  }

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

      // For moves, compare priority
      if (a.type === "move" && b.type === "move") {
        const _aPriority = (a as MoveAction).moveIndex;
        const _bPriority = (b as MoveAction).moveIndex;
        // In the base implementation, we just compare by speed
        // The actual priority comes from the move data, which the engine resolves
      }

      // Speed tiebreak — higher speed goes first (reversed in Trick Room)
      const sideA = state.sides[a.side];
      const sideB = state.sides[b.side];
      const activeA = sideA?.active[0];
      const activeB = sideB?.active[0];

      if (activeA && activeB) {
        const speedA = activeA.pokemon.calculatedStats?.speed ?? 0;
        const speedB = activeB.pokemon.calculatedStats?.speed ?? 0;

        if (state.trickRoom.active) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
      }

      // Random tiebreak
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

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    switch (status) {
      case "burn":
        // Gen 7+: 1/16 max HP
        return Math.max(1, Math.floor(maxHp / 16));
      case "poison":
        return Math.max(1, Math.floor(maxHp / 8));
      case "badly-poisoned":
        // Escalating: 1/16, 2/16, 3/16... per turn
        return Math.max(1, Math.floor(maxHp / 16));
      default:
        return 0;
    }
  }

  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 2+: 20% chance to thaw each turn
    return rng.chance(0.2);
  }

  rollSleepTurns(rng: SeededRandom): number {
    // Gen 5+: 1-3 turns
    return rng.int(1, 3);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 3+: exact 25% chance to be fully paralyzed
    return rng.chance(0.25);
  }

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
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  onSwitchOut(pokemon: ActivePokemon, _state: BattleState): void {
    // Default Gen 3+ behavior: clear all volatile statuses on switch-out.
    // Gen 1-2 override this to handle generation-specific persistence rules.
    pokemon.volatileStatuses.clear();
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

  calculateStruggleRecoil(attacker: ActivePokemon, _damageDealt: number): number {
    // Gen 4+ default: 1/4 of attacker's max HP
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

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
      "wish",
      "future-attack",
      "perish-song",
      "screen-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
    ];
  }
}
