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
} from "../../src/context";
import type { BattleAction } from "../../src/events";
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
  private fleeSuccess = true;

  setFixedDamage(damage: number): void {
    this.fixedDamage = damage;
  }

  setAlwaysHit(hit: boolean): void {
    this.alwaysHit = hit;
  }

  setAlwaysCrit(crit: boolean): void {
    this.alwaysCrit = crit;
  }

  setFleeSuccess(success: boolean): void {
    this.fleeSuccess = success;
  }

  getTypeChart(): TypeChart {
    // Minimal type chart — everything is neutral
    const types = this.getAvailableTypes();
    const chart: Record<string, Record<string, number>> = {};
    for (const atk of types) {
      chart[atk] = {};
      for (const def of types) {
        (chart[atk] as Record<string, number>)[def] = 1;
      }
    }
    return chart as TypeChart;
  }

  getAvailableTypes(): readonly PokemonType[] {
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

  private moveEffectOverride: Partial<MoveEffectResult> | null = null;

  /**
   * Override the result returned by executeMoveEffect for the next call.
   * Merges with the default (empty) result. Consumed after one call.
   */
  setMoveEffectResult(overrides: Partial<MoveEffectResult>): void {
    this.moveEffectOverride = overrides;
  }

  private semiInvulnerableOverrides = new Map<string, Set<string>>();

  /**
   * Configure specific moves to hit specific semi-invulnerable states.
   * E.g., `setCanHitSemiInvulnerable("thunder", "flying")` makes Thunder hit flying targets.
   */
  setCanHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): void {
    if (!this.semiInvulnerableOverrides.has(moveId)) {
      this.semiInvulnerableOverrides.set(moveId, new Set());
    }
    this.semiInvulnerableOverrides.get(moveId)!.add(volatile);
  }

  canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    return this.semiInvulnerableOverrides.get(moveId)?.has(volatile) ?? false;
  }

  private ppCostOverride: number | null = null;

  setPPCost(cost: number): void {
    this.ppCostOverride = cost;
  }

  getPPCost(_actor: ActivePokemon, _defender: ActivePokemon | null, _state: BattleState): number {
    return this.ppCostOverride ?? 1;
  }

  onMoveMiss(_actor: ActivePokemon, _move: MoveData, _state: BattleState): void {
    // No-op for mock
  }

  onDamageReceived(
    _defender: ActivePokemon,
    _damage: number,
    _move: MoveData,
    _state: BattleState,
  ): void {
    // No-op for mock
  }

  executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    const base: MoveEffectResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    if (this.moveEffectOverride) {
      const merged = { ...base, ...this.moveEffectOverride };
      this.moveEffectOverride = null;
      return merged;
    }
    return base;
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

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    return rng.chance(0.25);
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(0.5);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }
    return false;
  }

  hasAbilities(): boolean {
    return false;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return { activated: false, effects: [], messages: [] };
  }

  isSoundImmune(_pokemon: ActivePokemon): boolean {
    return false;
  }

  hasHeldItems(): boolean {
    return false;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return { activated: false, effects: [], messages: [] };
  }

  private nextBagItemResult: BagItemResult | null = null;
  private bagItemsAllowed = true;

  setNextBagItemResult(result: BagItemResult): void {
    this.nextBagItemResult = result;
  }

  setBagItemsAllowed(allowed: boolean): void {
    this.bagItemsAllowed = allowed;
  }

  canUseBagItems(): boolean {
    return this.bagItemsAllowed;
  }

  applyBagItem(_itemId: string, _target: ActivePokemon, _state: BattleState): BagItemResult {
    if (this.nextBagItemResult) {
      const result = this.nextBagItemResult;
      this.nextBagItemResult = null;
      return result;
    }
    return { activated: false, messages: ["It had no effect."] };
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

  applyEntryHazards(
    _pokemon: ActivePokemon,
    _side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  private nextExpGain: number | null = null;

  /**
   * Configure a one-shot fixed EXP gain return value for the next calculateExpGain call.
   * Useful for testing multi-level-up scenarios without relying on the formula.
   * After one call, resets to the default formula.
   */
  setNextExpGain(amount: number): void {
    this.nextExpGain = amount;
  }

  calculateExpGain(context: ExpContext): number {
    if (this.nextExpGain !== null) {
      const amount = this.nextExpGain;
      this.nextExpGain = null;
      return amount;
    }
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

  getConfusionSelfHitChance(): number {
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

  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get("confusion");
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get("bound");
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  onSwitchIn(_pokemon: ActivePokemon, _state: BattleState): void {
    // No-op for mock
  }

  onSwitchOut(_pokemon: ActivePokemon, _state: BattleState): void {
    // No-op for mock
  }

  shouldExecutePursuitPreSwitch(): boolean {
    return true;
  }

  confusionSelfHitTargetsOpponentSub(): boolean {
    return false; // Gen 3+ default: confusion self-hit damages the confused Pokemon, not sub
  }

  canSwitch(_pokemon: ActivePokemon, _state: BattleState): boolean {
    return true;
  }

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  calculateCurseDamage(pokemon: ActivePokemon): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateNightmareDamage(pokemon: ActivePokemon): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateStruggleDamage(
    attacker: ActivePokemon,
    _defender: ActivePokemon,
    _state: BattleState,
  ): number {
    // Default mock: typeless 1/4 max HP (Gen 3+ style)
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    return Math.max(1, Math.floor(damageDealt / 2));
  }

  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return rng.pick([2, 2, 2, 3, 3, 3, 4, 5] as const);
  }

  rollProtectSuccess(_consecutiveProtects: number, _rng: SeededRandom): boolean {
    return true; // Always succeeds in mock
  }

  calculateBindDamage(pokemon: ActivePokemon): number {
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
    if (counter <= 1) return { newCount: 0, fainted: true };
    const newCount = counter - 1;
    if (perishState.data) {
      perishState.data.counter = newCount;
    } else {
      perishState.turnsLeft = newCount;
    }
    return { newCount, fainted: false };
  }

  rollFleeSuccess(
    _playerSpeed: number,
    _wildSpeed: number,
    _attempts: number,
    _rng: SeededRandom,
  ): boolean {
    return this.fleeSuccess;
  }

  private nextCatchResult: CatchResult | null = null;

  setNextCatchResult(result: CatchResult): void {
    this.nextCatchResult = result;
  }

  rollCatchAttempt(
    _catchRate: number,
    _maxHp: number,
    _currentHp: number,
    _status: PrimaryStatus | null,
    _ballModifier: number,
    rng: SeededRandom,
  ): CatchResult {
    if (this.nextCatchResult) {
      const result = this.nextCatchResult;
      this.nextCatchResult = null;
      return result;
    }
    // Consume RNG so determinism tests exercise actual seeded behavior.
    // A roll < 0.5 → caught; shakes proportional to remaining roll.
    const roll = rng.next();
    const caught = roll < 0.5;
    const shakes = caught ? 4 : Math.floor(rng.next() * 4);
    return { shakes, caught };
  }

  processEndOfTurnDefrost(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    return false;
  }

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return ["status-damage"];
  }

  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }
}
