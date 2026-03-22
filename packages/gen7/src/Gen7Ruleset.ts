import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleAction,
  BattleGimmick,
  BattleGimmickType,
  BattleSide,
  BattleState,
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
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  DataManager,
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { createGen7DataManager } from "./data/index.js";
import { GEN7_TYPE_CHART, GEN7_TYPES } from "./Gen7TypeChart.js";

/**
 * Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 7.
 *
 * Key Gen 7 differences from Gen 6:
 *   - Z-Moves (new battle gimmick, coexists with Mega Evolution)
 *   - Terrain system enhanced: 1.5x damage boost for grounded Pokemon (was 1.3x in Gen 6)
 *   - Surge abilities: Electric/Grassy/Psychic/Misty Surge set terrain on switch-in
 *   - Burn damage: 1/16 max HP (was 1/8 in Gen 3-6)
 *   - Paralysis speed penalty: 0.5x (was 0.25x in Gen 3-6) -- inherited from BaseRuleset
 *   - Confusion self-hit: 33% (was 50% in Gen 1-6)
 *   - Prankster status moves fail against Dark-type targets
 *   - Gale Wings only works at full HP (was unconditional in Gen 6)
 *   - Parental Bond second hit: 25% (was 50% in Gen 6)
 *   - Aurora Veil (new move, reduces damage like dual screens, hail-only)
 *   - Baneful Bunker (new protect variant, poisons on contact)
 *   - Beast Boost, Disguise, Schooling, Stamina, Battle Bond (new abilities)
 *
 * Key Gen 7 inherits from BaseRuleset (Gen 7+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1]
 *   - getCritMultiplier: 1.5x
 *   - getEffectiveSpeed: paralysis 0.5x (Gen 7+ default)
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *   - applyStatusDamage: burn 1/16 (Gen 7+ default in BaseRuleset)
 *
 * Source: references/pokemon-showdown/data/ (Gen 7 data)
 * Source: specs/battle/08-gen7.md
 */
export class Gen7Ruleset extends BaseRuleset {
  readonly generation = 7 as const;
  readonly name = "Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon)";

  /**
   * Temporary weather state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it. The protected getEffectiveSpeed signature only takes ActivePokemon
   * (inherited from BaseRuleset), but Chlorophyll/Swift Swim/Sand Rush need weather context.
   * Set to null outside of turn order resolution.
   *
   * Source: Pattern from Gen5Ruleset._currentWeather and Gen6Ruleset._currentWeather
   */
  private _currentWeather: string | null = null;

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen7DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN7_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN7_TYPES;
  }

  // --- Terrain ---

  /**
   * Gen 7 has terrain (Electric, Grassy, Misty, Psychic).
   * Enhanced from Gen 6: terrain damage boost is 1.5x (was 1.3x in Gen 6).
   *
   * Source: Bulbapedia -- Terrain damage boost increased to 1.5x in Gen 7
   * Source: Showdown sim/field.ts -- terrain effects
   */
  hasTerrain(): boolean {
    return true;
  }

  /**
   * Gen 7 terrain effects stub.
   * Will be fully implemented in Wave 3 (Terrain System).
   *
   * Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded Pokemon
   * Source: Showdown data/conditions.ts -- grassyterrain.onResidual
   */
  override applyTerrainEffects(state: BattleState): TerrainEffectResult[] {
    // Stub -- will be implemented in Wave 3
    void state;
    return [];
  }

  /**
   * Check if a primary status condition can be inflicted on a target,
   * considering active terrain effects.
   *
   * - Electric Terrain: grounded Pokemon cannot fall asleep
   * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
   * - Psychic Terrain: blocks priority moves against grounded targets (handled elsewhere)
   *
   * Source: Bulbapedia "Electric Terrain" Gen 7 -- "Grounded Pokemon cannot fall asleep."
   * Source: Bulbapedia "Misty Terrain" Gen 7 -- "Grounded Pokemon are protected from
   *   status conditions."
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   */
  checkTerrainStatusImmunity(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string } {
    // Stub -- will be fully implemented in Wave 3
    void status;
    void target;
    void state;
    return { immune: false };
  }

  // --- Move Effects ---

  /**
   * Gen 7 move effect dispatch stub.
   * Will be fully implemented in Wave 5 (Move Effects).
   *
   * Source: Showdown data/moves.ts -- Gen 7 move handlers
   */
  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    // Fall through to BaseRuleset for default handling
    return super.executeMoveEffect(context);
  }

  // --- Ability System ---

  /**
   * Gen 7 ability dispatch stub.
   * Will be fully implemented in Wave 7 (Abilities).
   *
   * Source: Showdown data/abilities.ts -- Gen 7 ability handlers
   */
  override applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return { activated: false, effects: [], messages: [] };
  }

  // --- Damage Calculation ---

  /**
   * Gen 7 damage formula stub.
   * Will be fully implemented in Wave 2 (Damage Calc).
   *
   * The Gen 7 damage formula is fundamentally the same as Gen 6 with adjustments:
   *   - Terrain boost: 1.5x (was 1.3x in Gen 6)
   *   - Parental Bond second hit: 25% (was 50% in Gen 6)
   *   - Z-Move damage calculations
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 7 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(_context: DamageContext): DamageResult {
    throw new Error("Gen 7 damage calculation not yet implemented (Wave 2)");
  }

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   *
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   */
  recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  /**
   * Cap lethal damage for Sturdy (Gen 5+): survive any hit from full HP at 1 HP.
   * Stub -- will be enhanced with Disguise handling in Wave 7.
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * Source: Bulbapedia -- Sturdy (Ability)
   */
  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const currentHp = defender.pokemon.currentHp;

    // Sturdy: if at full HP and damage would KO, cap at maxHp - 1
    if (defender.ability === "sturdy" && currentHp === maxHp && damage >= currentHp) {
      const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on thanks to Sturdy!`],
      };
    }
    return { damage, survived: false, messages: [] };
  }

  // --- Semi-Invulnerable Hit Check ---

  /**
   * Gen 7 semi-invulnerable move bypass check (same as Gen 6).
   *
   * Source: Showdown data/moves.ts -- semi-invulnerable move interactions
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    switch (volatile) {
      case "flying":
        return [
          "gust",
          "twister",
          "thunder",
          "sky-uppercut",
          "hurricane",
          "smack-down",
          "thousand-arrows",
        ].includes(moveId);
      case "underground":
        return ["earthquake", "magnitude", "fissure"].includes(moveId);
      case "underwater":
        return ["surf", "whirlpool"].includes(moveId);
      case "shadow-force-charging":
        return false; // Nothing bypasses Shadow Force / Phantom Force
      case "charging":
        return true; // Generic charging moves are NOT semi-invulnerable
      default:
        return false;
    }
  }

  // --- Critical Hit System ---

  /**
   * Gen 7 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * Source: Showdown sim/battle-actions.ts -- crit immunity check
   * Source: Bulbapedia -- Battle Armor / Shell Armor prevent critical hits
   */
  rollCritical(context: CritContext): boolean {
    const defenderAbility = context.defender?.ability;
    if (defenderAbility === "battle-armor" || defenderAbility === "shell-armor") {
      return false;
    }
    return super.rollCritical(context);
  }

  // --- Confusion ---

  /**
   * Gen 7+ confusion self-hit chance is 33% (was 50% in Gen 1-6).
   *
   * Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting
   *   itself in confusion has decreased from 50% to approximately 33%."
   * Source: Showdown sim/battle-actions.ts -- Gen 7 confusion chance
   */
  override rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(1 / 3);
  }

  /**
   * Returns the confusion self-hit chance for Gen 7 (33%).
   *
   * Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
   */
  override getConfusionSelfHitChance(): number {
    return 1 / 3;
  }

  // --- Speed ---

  /**
   * Gen 7 effective speed calculation.
   *
   * Gen 7 inherits the BaseRuleset default (paralysis 0.5x) which is correct.
   * Weather abilities and held items are added here for Gen 7.
   *
   * Source: Showdown sim/pokemon.ts -- Gen 7 speed modifiers
   * Source: Bulbapedia -- individual ability/item pages
   */
  protected override getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Simple: doubles all stat stage effects
    // Source: Bulbapedia -- Simple doubles stat stage effects
    const speedStage =
      active.ability === "simple"
        ? Math.max(-6, Math.min(6, active.statStages.speed * 2))
        : active.statStages.speed;

    let effective = Math.floor(baseSpeed * getStatStageMultiplier(speedStage));

    // Embargo: prevents held item effects
    // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
    const isEmbargoed = active.volatileStatuses.has("embargo");

    // Choice Scarf: 1.5x Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Choice Scarf boosts Speed 1.5x
    if (active.pokemon.heldItem === "choice-scarf" && active.ability !== "klutz" && !isEmbargoed) {
      effective = Math.floor(effective * 1.5);
    }

    // Chlorophyll: 2x Speed in sun
    // Source: Bulbapedia -- Chlorophyll doubles Speed in sun
    if (active.ability === "chlorophyll" && this._currentWeather === "sun") {
      effective = effective * 2;
    }

    // Swift Swim: 2x Speed in rain
    // Source: Bulbapedia -- Swift Swim doubles Speed in rain
    if (active.ability === "swift-swim" && this._currentWeather === "rain") {
      effective = effective * 2;
    }

    // Sand Rush: 2x Speed in sandstorm
    // Source: Bulbapedia -- Sand Rush doubles Speed in sandstorm
    if (active.ability === "sand-rush" && this._currentWeather === "sand") {
      effective = effective * 2;
    }

    // Slush Rush: 2x Speed in hail (new in Gen 7)
    // Source: Bulbapedia -- Slush Rush doubles Speed in hail
    if (active.ability === "slush-rush" && this._currentWeather === "hail") {
      effective = effective * 2;
    }

    // Surge Surfer: 2x Speed on Electric Terrain (new in Gen 7)
    // Source: Bulbapedia -- Surge Surfer doubles Speed on Electric Terrain
    // Note: Terrain check will be enhanced in Wave 3
    if (active.ability === "surge-surfer") {
      // Will need terrain state check -- stub for now
    }

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    // Source: Bulbapedia -- Slow Start halves Speed for 5 turns
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    // Source: Bulbapedia -- Unburden doubles Speed when held item is lost
    if (
      active.ability === "unburden" &&
      active.volatileStatuses.has("unburden") &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    // Source: Bulbapedia -- Quick Feet boosts Speed 1.5x when statused
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 7+: paralysis halves speed (x0.5)
      // Source: Bulbapedia -- Paralysis: speed reduced to 50% in Gen 7+
      effective = Math.floor(effective * 0.5);
    }

    // Iron Ball: halve Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Iron Ball halves Speed
    if (active.pokemon.heldItem === "iron-ball" && active.ability !== "klutz" && !isEmbargoed) {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Turn Order ---

  /**
   * Gen 7 turn order resolution with weather context, Tailwind speed doubling,
   * and Trick Room reversal.
   *
   * Source: Showdown sim/battle.ts -- turn order resolution
   * Source: Bulbapedia -- Tailwind: doubles Speed of user's side
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Set weather context for getEffectiveSpeed to read
    this._currentWeather = state.weather?.type ?? null;

    // Pre-roll Quick Claw activations
    const quickClawActivated = this.getQuickClawActivated(actions, state, rng);

    const tagged = actions.map((action, idx) => ({ action, idx, tiebreak: rng.next() }));
    const trickRoomActive = state.trickRoom.active;

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
        let moveDataA: MoveData | undefined;
        let moveDataB: MoveData | undefined;
        try {
          moveDataA = this.dataManager.getMove(moveSlotA.moveId);
          priorityA = moveDataA.priority;
        } catch {
          /* default 0 */
        }
        try {
          moveDataB = this.dataManager.getMove(moveSlotB.moveId);
          priorityB = moveDataB.priority;
        } catch {
          /* default 0 */
        }

        // Ability-based priority boosts (Prankster, Gale Wings)
        // Source: Showdown data/abilities.ts -- Gen 7 ability priority
        if (activeA.ability && moveDataA) {
          const resultA = this.applyAbility("on-priority-check", {
            pokemon: activeA,
            state,
            rng: state.rng,
            trigger: "on-priority-check",
            move: moveDataA,
          });
          if (resultA.activated) {
            priorityA += 1;
          }
        }
        if (activeB.ability && moveDataB) {
          const resultB = this.applyAbility("on-priority-check", {
            pokemon: activeB,
            state,
            rng: state.rng,
            trigger: "on-priority-check",
            move: moveDataB,
          });
          if (resultB.activated) {
            priorityB += 1;
          }
        }

        if (priorityA !== priorityB) return priorityB - priorityA; // higher priority first

        // Quick Claw / go-first item: activated holders go first within same priority bracket
        const qcA = quickClawActivated.has(a.idx);
        const qcB = quickClawActivated.has(b.idx);
        if (qcA && !qcB) return -1;
        if (qcB && !qcA) return 1;

        // Speed tiebreak with Tailwind
        let speedA = this.getEffectiveSpeed(activeA);
        let speedB = this.getEffectiveSpeed(activeB);

        // Tailwind: doubles the Speed of the user's side
        // Source: Bulbapedia -- Tailwind doubles Speed for 4 turns
        if (sideA?.tailwind.active) {
          speedA *= 2;
        }
        if (sideB?.tailwind.active) {
          speedB *= 2;
        }

        if (trickRoomActive) {
          if (speedA !== speedB) return speedA - speedB; // slower goes first
        } else {
          if (speedA !== speedB) return speedB - speedA; // faster goes first
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // Deterministic tiebreak (non-move vs non-move of same type)
      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    // Clear weather context
    this._currentWeather = null;
    return tagged.map((t) => t.action);
  }

  // --- Weather ---

  /**
   * Gen 7 end-of-turn weather chip damage stub.
   * Will be fully implemented in Wave 4.
   *
   * Source: Showdown data/conditions.ts -- weather end-of-turn damage
   */
  override applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    void state;
    return [];
  }

  // --- Entry Hazards ---

  /**
   * Gen 7 available hazards include Sticky Web (same as Gen 6).
   *
   * Source: Bulbapedia -- Sticky Web introduced in Gen 6, still present in Gen 7
   * Source: Showdown data/moves.ts -- stickyweb
   */
  override getAvailableHazards(): readonly import("@pokemon-lib-ts/core").EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"];
  }

  /**
   * Gen 7 entry hazards stub.
   * Will be fully implemented in Wave 4.
   *
   * Source: Showdown data/moves.ts -- hazard condition handlers
   */
  override applyEntryHazards(
    _pokemon: ActivePokemon,
    _side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  // --- End of Turn ---

  /**
   * Gen 7 end-of-turn effect ordering.
   * Similar to Gen 6 but includes aurora-veil-countdown.
   *
   * Source: Showdown data/conditions.ts -- residual order
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [
      "weather-damage",
      "future-attack",
      "wish",
      "weather-healing",
      "shed-skin",
      "leech-seed",
      "leftovers",
      "black-sludge",
      "aqua-ring",
      "ingrain",
      "poison-heal",
      "grassy-terrain-heal",
      "status-damage",
      "nightmare",
      "curse",
      "bad-dreams",
      "bind",
      "yawn-countdown",
      "encore-countdown",
      "taunt-countdown",
      "disable-countdown",
      "heal-block-countdown",
      "embargo-countdown",
      "magnet-rise-countdown",
      "perish-song",
      "screen-countdown",
      "safeguard-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
      "terrain-countdown",
      "weather-countdown",
      "toxic-orb-activation",
      "flame-orb-activation",
      "speed-boost",
      "moody",
      "healing-items",
    ];
  }

  /**
   * Gen 7 (like Gen 3+) has no per-attack residuals; all residuals are in Phase 2.
   *
   * Source: Showdown Gen 7 -- no per-attack residuals
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }

  // --- Experience ---

  /**
   * Gen 7 EXP formula.
   *
   * Gen 7 reverts to a simpler formula than Gen 5/6:
   *   exp = floor((baseExp * defeatedLevel) / (5 * participantCount))
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x).
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_VII
   * Source: Showdown sim/battle-actions.ts -- Gen 7 EXP formula
   */
  calculateExpGain(context: ExpContext): number {
    const baseExp = context.defeatedSpecies.baseExp;
    const a = context.isTrainerBattle ? 1.5 : 1;
    const l = context.defeatedLevel;
    const s = context.participantCount;
    const p = context.hasLuckyEgg ? 1.5 : 1;

    let exp = Math.floor(((a * baseExp * l) / (5 * s)) * p);

    // Source: Showdown sim/battle-actions.ts -- traded EXP bonus applied after all other multipliers.
    // Same language -> 1.5x, international -> 1.7x.
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    return Math.max(1, exp);
  }

  // --- Held Items ---

  /**
   * Gen 7 held item application stub.
   * Will be fully implemented in Wave 6 (Held Items).
   *
   * Source: Showdown data/items.ts -- Gen 7 item handlers
   */
  override applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return { activated: false, effects: [], messages: [] };
  }

  // --- Battle Gimmick (Z-Moves + Mega Evolution) ---

  /**
   * Returns the requested battle gimmick handler for Gen 7.
   *
   * Gen 7 has two gimmicks: Mega Evolution (carried from Gen 6) and Z-Moves (new).
   * Only one gimmick can be used per Pokemon per battle.
   *
   * @param type - 'mega' for Mega Evolution, 'zmove' for Z-Moves.
   *   Other types return null.
   *
   * Source: Bulbapedia "Z-Move" -- introduced in Gen 7 (Sun and Moon)
   * Source: Bulbapedia "Mega Evolution" -- carried forward from Gen 6
   * Source: Showdown sim/battle.ts -- getBattleGimmick returns appropriate handler
   */
  override getBattleGimmick(_type: BattleGimmickType): BattleGimmick | null {
    // Stub -- Z-Moves will be implemented in Wave 8, Mega Evolution in Wave 9
    return null;
  }

  // --- Catch Rate ---

  /**
   * Gen 7 uses 2.5x status catch modifier for sleep/freeze (same as Gen 5+).
   *
   * Source: Bulbapedia -- Catch rate: Gen 5+ uses 2.5x for sleep/freeze
   */
  protected override getStatusCatchModifiers(): Record<PrimaryStatus, number> {
    return {
      sleep: 2.5,
      freeze: 2.5,
      paralysis: 1.5,
      burn: 1.5,
      poison: 1.5,
      "badly-poisoned": 1.5,
    };
  }
}
