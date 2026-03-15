import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import type { SeededRandom } from "@pokemon-lib-ts/core";
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
} from "../../src/context";
import type { BattleAction, MoveAction } from "../../src/events";
import type { GenerationRuleset } from "../../src/ruleset";
import type { ActivePokemon, BattleSide, BattleState } from "../../src/state";

/**
 * A minimal mock ruleset for testing. Provides simple, predictable behavior:
 * - calculateDamage returns fixed damage (10)
 * - doesMoveHit always returns true
 * - calculateStats returns simple values based on base stats + level
 * - No abilities, items, weather, terrain
 */
export class MockRuleset implements GenerationRuleset {
  readonly generation: Generation = 1;
  readonly name = "Mock Gen (Testing)";

  private fixedDamage = 10;
  private alwaysHit = true;
  private alwaysCrit = false;

  setFixedDamage(damage: number): void {
    this.fixedDamage = damage;
  }

  setAlwaysHit(hit: boolean): void {
    this.alwaysHit = hit;
  }

  setAlwaysCrit(crit: boolean): void {
    this.alwaysCrit = crit;
  }

  getTypeChart(): TypeChart {
    // Minimal type chart — everything is neutral
    const types = this.getValidTypes();
    const chart: Record<string, Record<string, number>> = {};
    for (const atk of types) {
      chart[atk] = {};
      for (const def of types) {
        chart[atk]![def] = 1;
      }
    }
    return chart as TypeChart;
  }

  getValidTypes(): readonly PokemonType[] {
    return [
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
    ];
  }

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    const level = pokemon.level;
    const base = species.baseStats;

    const calcHp = (): number => Math.floor(((2 * base.hp + 31) * level) / 100) + level + 10;

    const calcStat = (baseStat: number): number =>
      Math.floor(((2 * baseStat + 31) * level) / 100) + 5;

    return {
      hp: calcHp(),
      attack: calcStat(base.attack),
      defense: calcStat(base.defense),
      spAttack: calcStat(base.spAttack),
      spDefense: calcStat(base.spDefense),
      speed: calcStat(base.speed),
    };
  }

  calculateDamage(context: DamageContext): DamageResult {
    return {
      damage: this.fixedDamage,
      effectiveness: 1,
      isCrit: context.isCrit,
      randomFactor: 1,
    };
  }

  getCritRateTable(): readonly number[] {
    return [16, 8, 4, 2, 1];
  }

  getCritMultiplier(): number {
    return 2;
  }

  rollCritical(_context: CritContext): boolean {
    return this.alwaysCrit;
  }

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    return [...actions].sort((a, b) => {
      // Switches first
      if (a.type === "switch" && b.type !== "switch") return -1;
      if (b.type === "switch" && a.type !== "switch") return 1;

      // By speed (higher first)
      const sideA = state.sides[a.side];
      const sideB = state.sides[b.side];
      const activeA = sideA?.active[0];
      const activeB = sideB?.active[0];
      const speedA = activeA?.pokemon.calculatedStats?.speed ?? 0;
      const speedB = activeB?.pokemon.calculatedStats?.speed ?? 0;

      if (speedA !== speedB) return speedB - speedA;
      return rng.chance(0.5) ? -1 : 1;
    });
  }

  doesMoveHit(_context: AccuracyContext): boolean {
    return this.alwaysHit;
  }

  executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    return {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
  }

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    switch (status) {
      case "burn":
        return Math.max(1, Math.floor(maxHp / 16));
      case "poison":
        return Math.max(1, Math.floor(maxHp / 8));
      case "badly-poisoned":
        return Math.max(1, Math.floor(maxHp / 16));
      default:
        return 0;
    }
  }

  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    return rng.chance(0.2);
  }

  rollSleepTurns(rng: SeededRandom): number {
    return rng.int(1, 3);
  }

  hasAbilities(): boolean {
    return false;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return { activated: false, effects: [], messages: [] };
  }

  hasHeldItems(): boolean {
    return false;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return { activated: false, effects: [], messages: [] };
  }

  hasWeather(): boolean {
    return false;
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
    return [];
  }

  applyEntryHazards(_pokemon: ActivePokemon, _side: BattleSide): EntryHazardResult {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  calculateExpGain(context: ExpContext): number {
    return Math.floor(
      (context.defeatedSpecies.baseExp * context.defeatedLevel) / (5 * context.participantCount),
    );
  }

  getBattleGimmick(): BattleGimmick | null {
    return null;
  }

  validatePokemon(_pokemon: PokemonInstance, _species: PokemonSpeciesData): ValidationResult {
    return { valid: true, errors: [] };
  }

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return ["status-damage"];
  }
}
