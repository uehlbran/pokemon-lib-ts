/**
 * Gen 4 Move Effect Master Dispatcher
 *
 * Routes move effect execution to the appropriate sub-module:
 *   - Gen4MoveEffectsField: field effects (Stealth Rock, Toxic Spikes, Trick Room,
 *     Tailwind, Defog, Gravity, Rapid Spin, binding moves)
 *   - Gen4MoveEffectsStatus: status/utility moves (Taunt, Disable, Yawn, Encore,
 *     Heal Block, Embargo, Worry Seed, Gastro Acid, Rest, Heal Bell/Aromatherapy,
 *     Safeguard, Lucky Chant, Block/Mean Look/Spider Web, Ingrain, Aqua Ring,
 *     Refresh, Destiny Bond, Wish, Haze)
 *   - Gen4MoveEffectsCombat: combat moves (Belly Drum, Explosion/Self-Destruct,
 *     Baton Pass, Perish Song, Pain Split, Moonlight/Morning Sun/Synthesis,
 *     Future Sight, Whirlwind/Roar, Counter, Mirror Coat, Power/Guard/Heart Swap,
 *     Acupressure, Ghost Curse)
 *   - Gen4MoveEffectsBehavior: behavioral overrides (Roost, Knock Off, Trick/Switcheroo,
 *     Natural Gift, Fling, Pluck/Bug Bite, Sucker Punch, Feint, Focus Punch,
 *     Doom Desire, Magnet Rise, Thief/Covet)
 *
 * Also handles data-driven effects via applyMoveEffect() and re-exports all
 * public functions from sub-modules.
 *
 * Key Gen 4 differences from Gen 3:
 *   - Shield Dust: blocks secondary effects on the holder (new in Gen 4)
 *   - Weather rocks: Damp/Heat/Smooth/Icy Rock extend weather to 8 turns
 *   - Light Clay: extends Reflect/Light Screen to 8 turns
 *   - Screens: Reflect/Light Screen produce screenSet results
 *   - No paralysis immunity for Electric types (Gen 6 adds that)
 *   - New null-effect moves: Stealth Rock, Toxic Spikes, Trick Room, Tailwind,
 *     Defog, Roost
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled functions exist
 */

import type {
  ActivePokemon,
  BattleState,
  MoveEffectContext,
  MoveEffectResult,
  MoveEffectSideTarget,
  MoveEffectSideTargetWithBoth,
} from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS, resolveStatChangeTarget } from "@pokemon-lib-ts/battle";
import type {
  BattleStat,
  EntryHazardType,
  MoveData,
  MoveEffect,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_CATEGORIES,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN4_ABILITY_IDS, GEN4_ITEM_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";
import { handleGen4BehaviorMove } from "./Gen4MoveEffectsBehavior";
import { handleGen4CombatMove } from "./Gen4MoveEffectsCombat";
import { handleGen4FieldMove } from "./Gen4MoveEffectsField";
import { handleGen4StatusMove } from "./Gen4MoveEffectsStatus";

// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

export { handleGen4BehaviorMove } from "./Gen4MoveEffectsBehavior";
export { handleGen4CombatMove } from "./Gen4MoveEffectsCombat";
export { handleGen4FieldMove } from "./Gen4MoveEffectsField";
export { handleGen4StatusMove } from "./Gen4MoveEffectsStatus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Mutable internal result type used during effect processing.
 * Returned as the readonly MoveEffectResult interface.
 */
type MutableResult = {
  statusInflicted: PrimaryStatus | null;
  volatileInflicted: VolatileStatus | null;
  statChanges: Array<{ target: MoveEffectSideTarget; stat: BattleStat; stages: number }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  /** When true along with switchOut, the DEFENDER is forced to switch (Whirlwind/Roar phazing) */
  forcedSwitch?: boolean;
  messages: string[];
  screenSet?: { screen: string; turnsLeft: number; side: MoveEffectSideTarget } | null;
  selfFaint?: boolean;
  customDamage?: {
    target: MoveEffectSideTarget;
    amount: number;
    source: string;
    type?: PokemonType | null;
  } | null;
  statusCured?: { target: MoveEffectSideTargetWithBoth } | null;
  weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  volatilesToClear?: Array<{ target: MoveEffectSideTarget; volatile: VolatileStatus }>;
  clearSideHazards?: MoveEffectSideTarget;
  itemTransfer?: { from: MoveEffectSideTarget; to: MoveEffectSideTarget };
  screensCleared?: MoveEffectSideTargetWithBoth | null;
  /** When set, only remove screens whose type is in this list (Brick Break: reflect, light-screen) */
  screenTypesToRemove?: readonly string[];
  statStagesReset?: { target: MoveEffectSideTargetWithBoth } | null;
  statusCuredOnly?: { target: MoveEffectSideTargetWithBoth } | null;
  selfStatusInflicted?: PrimaryStatus | null;
  selfVolatileInflicted?: VolatileStatus | null;
  selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  typeChange?: { target: MoveEffectSideTarget; types: readonly PokemonType[] } | null;
  tailwindSet?: { turnsLeft: number; side: MoveEffectSideTarget } | null;
  trickRoomSet?: { turnsLeft: number } | null;
  volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  futureAttack?: { moveId: string; turnsLeft: number; sourceSide: 0 | 1 } | null;
  gravitySet?: boolean;
  forcedMoveSet?: {
    moveIndex: number;
    moveId: string;
    volatileStatus: VolatileStatus;
  } | null;
  attackerItemConsumed?: boolean;
  wishSet?: { healAmount: number; turnsLeft: number } | null;
};

const ITEM_IDS = GEN4_ITEM_IDS;

// ---------------------------------------------------------------------------
// Status Immunity Table
// ---------------------------------------------------------------------------

/**
 * Gen 4 type-based status immunities.
 *
 * Critical difference from Gen 3: Electric types are NOT immune to paralysis
 * in Gen 4. That immunity was added in Gen 6.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — no paralysis immunity for Electric
 * Source: Bulbapedia — Electric-type paralysis immunity introduced in Gen 6
 */
const GEN4_STATUS_IMMUNITIES: Partial<Record<PrimaryStatus, readonly PokemonType[]>> = {
  [CORE_STATUS_IDS.burn]: [CORE_TYPE_IDS.fire],
  [CORE_STATUS_IDS.poison]: [CORE_TYPE_IDS.poison, CORE_TYPE_IDS.steel],
  [CORE_STATUS_IDS.badlyPoisoned]: [CORE_TYPE_IDS.poison, CORE_TYPE_IDS.steel],
  [CORE_STATUS_IDS.freeze]: [CORE_TYPE_IDS.ice],
  // No paralysis immunity for Electric — added in Gen 6
};

/**
 * Ability-based status immunities in Gen 4.
 *
 * Maps ability ID to the set of primary statuses it blocks.
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod — ability status immunities
 * Source: Bulbapedia — individual ability pages (Immunity, Insomnia, etc.)
 */
const ABILITY_STATUS_IMMUNITIES: Record<string, readonly PrimaryStatus[]> = {
  [GEN4_ABILITY_IDS.immunity]: [CORE_STATUS_IDS.poison, CORE_STATUS_IDS.badlyPoisoned],
  [GEN4_ABILITY_IDS.insomnia]: [CORE_STATUS_IDS.sleep],
  [GEN4_ABILITY_IDS.vitalSpirit]: [CORE_STATUS_IDS.sleep],
  [GEN4_ABILITY_IDS.limber]: [CORE_STATUS_IDS.paralysis],
  [GEN4_ABILITY_IDS.waterVeil]: [CORE_STATUS_IDS.burn],
  [GEN4_ABILITY_IDS.magmaArmor]: [CORE_STATUS_IDS.freeze],
};

/**
 * Check whether a target Pokemon's ability blocks a given primary status.
 *
 * @param target - The target Pokemon
 * @param status - The status being inflicted
 * @returns true if the ability blocks this status
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod — ability-based status immunity
 */
export function isStatusBlockedByAbility(target: ActivePokemon, status: PrimaryStatus): boolean {
  const immuneStatuses = ABILITY_STATUS_IMMUNITIES[target.ability];
  if (!immuneStatuses) return false;
  return immuneStatuses.includes(status);
}

/**
 * Volatile status immunity map for abilities in Gen 4.
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod — volatile immunity abilities
 * Source: Bulbapedia — Inner Focus, Own Tempo, Oblivious
 */
const ABILITY_VOLATILE_IMMUNITIES: Record<string, readonly VolatileStatus[]> = {
  [GEN4_ABILITY_IDS.innerFocus]: [CORE_VOLATILE_IDS.flinch],
  [GEN4_ABILITY_IDS.ownTempo]: [CORE_VOLATILE_IDS.confusion],
  [GEN4_ABILITY_IDS.oblivious]: [CORE_VOLATILE_IDS.infatuation],
};

/**
 * Check whether a target Pokemon's ability blocks a given volatile status.
 *
 * @param target - The target Pokemon
 * @param volatile - The volatile status being applied
 * @returns true if the ability blocks this volatile
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod — ability volatile immunity
 */
export function isVolatileBlockedByAbility(
  target: ActivePokemon,
  volatile: VolatileStatus,
): boolean {
  const immuneVolatiles = ABILITY_VOLATILE_IMMUNITIES[target.ability];
  if (!immuneVolatiles) return false;
  return immuneVolatiles.includes(volatile);
}

/**
 * Check whether a status condition can be inflicted on a target Pokemon in Gen 4.
 *
 * @param status - The status to attempt to inflict
 * @param target - The target Pokemon
 * @param state - Optional battle state (used for Leaf Guard + sun check)
 * @returns true if the status can be inflicted
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — status type immunities
 */
export function canInflictGen4Status(
  status: PrimaryStatus,
  target: ActivePokemon,
  state?: BattleState,
): boolean {
  // Can't have two primary statuses at once
  if (target.pokemon.status !== null) {
    return false;
  }

  // Leaf Guard: all status conditions blocked in sun weather
  // Source: Bulbapedia — Leaf Guard: "Prevents status conditions in sunny weather"
  // Source: Showdown data/abilities.ts — Leaf Guard onSetStatus
  if (
    target.ability === GEN4_ABILITY_IDS.leafGuard &&
    state?.weather?.type === CORE_WEATHER_IDS.sun
  ) {
    return false;
  }

  // Check type immunities
  // Source: Showdown Gen 4 — type-based status immunities (no Electric/paralysis)
  const immuneTypes = GEN4_STATUS_IMMUNITIES[status];
  if (immuneTypes) {
    for (const type of target.types) {
      if (immuneTypes.includes(type)) {
        return false;
      }
    }
  }

  // Check ability-based status immunities
  // Source: Showdown sim/abilities.ts Gen 4 mod — Immunity, Insomnia, Vital Spirit,
  //   Limber, Water Veil, Magma Armor
  if (isStatusBlockedByAbility(target, status)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Weather Rock Items
// ---------------------------------------------------------------------------

/**
 * Maps weather-extending held items to the weather type they extend.
 *
 * Source: pret/pokeplatinum — weather rock items extend weather to 8 turns
 * Source: Bulbapedia — Damp Rock, Heat Rock, Smooth Rock, Icy Rock
 */
const WEATHER_ROCK_ITEMS: Record<string, WeatherType> = {
  [ITEM_IDS.dampRock]: CORE_WEATHER_IDS.rain,
  [ITEM_IDS.heatRock]: CORE_WEATHER_IDS.sun,
  [ITEM_IDS.smoothRock]: CORE_WEATHER_IDS.sand,
  [ITEM_IDS.icyRock]: CORE_WEATHER_IDS.hail,
};

// ---------------------------------------------------------------------------
// Effect Chance Roll
// ---------------------------------------------------------------------------

/**
 * Roll for a secondary effect chance on the 0-99 scale.
 * 100% effects ALWAYS succeed (0-99 < 100 is always true).
 *
 * Gen 4 additions:
 *   - Shield Dust: blocks secondary effects on the holder
 *   - Serene Grace: doubles the chance before the roll (capped at 100)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — Shield Dust blocks secondary effects
 * Source: pret/pokeplatinum — Serene Grace doubles secondary effect chance
 *
 * @param chance - Effect chance percentage (0-100)
 * @param rng - Seeded PRNG instance
 * @param attacker - The attacking Pokemon (for Serene Grace check)
 * @param defender - The defending Pokemon (for Shield Dust check)
 * @param isSecondary - Whether this is a secondary effect (Shield Dust only blocks secondaries)
 * @returns true if the effect should activate
 */
function rollEffectChance(
  chance: number,
  rng: SeededRandom,
  attacker: ActivePokemon,
  defender?: ActivePokemon,
  isSecondary = false,
): boolean {
  // Shield Dust: blocks secondary effects on the holder
  // Source: Showdown Gen 4 — Shield Dust blocks secondary effects
  if (isSecondary && defender?.ability === GEN4_ABILITY_IDS.shieldDust) {
    return false;
  }

  let effectiveChance = chance;

  // Serene Grace: double the secondary effect chance (cap at 100)
  // Source: pret/pokeplatinum — Serene Grace doubles percentChance
  if (attacker.ability === GEN4_ABILITY_IDS.sereneGrace) {
    effectiveChance = Math.min(chance * 2, 100);
  }

  // 100% effects always succeed — skip the roll entirely
  // Source: pret/pokeplatinum — same check as pokeemerald
  if (effectiveChance >= 100) return true;
  return rng.int(0, 99) < effectiveChance;
}

// ---------------------------------------------------------------------------
// Apply Move Effect (data-driven switch)
// ---------------------------------------------------------------------------

/**
 * Apply a single MoveEffect to the mutable result object.
 * Handles all effect types defined in the MoveEffect discriminated union.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */
function applyMoveEffect(
  effect: MoveEffect,
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender, damage, rng } = context;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  switch (effect.type) {
    case "status-chance": {
      // Roll for status infliction — secondary effect
      // Source: Showdown Gen 4 — secondary status effect roll
      if (rollEffectChance(effect.chance, rng, attacker, defender, true)) {
        if (!defender.pokemon.status) {
          if (canInflictGen4Status(effect.status, defender, context.state)) {
            result.statusInflicted = effect.status;
          }
        }
      }
      break;
    }

    case "status-guaranteed": {
      // Guaranteed status (e.g., Thunder Wave, Toxic, Will-O-Wisp)
      // Source: Showdown Gen 4 — primary effect status infliction
      if (!defender.pokemon.status) {
        if (canInflictGen4Status(effect.status, defender, context.state)) {
          result.statusInflicted = effect.status;
        }
      }
      break;
    }

    case "stat-change": {
      // Only apply the secondary-effect roll for damaging moves — status moves
      // (e.g., Swords Dance, Dragon Dance) have guaranteed primary effects
      // Source: Showdown Gen 4 — secondary effect check only for damaging moves
      if (
        move.category !== CORE_MOVE_CATEGORIES.status &&
        !rollEffectChance(effect.chance, rng, attacker, defender, true)
      ) {
        break;
      }
      for (const change of effect.changes) {
        result.statChanges.push({
          target: resolveStatChangeTarget(effect.target),
          stat: change.stat,
          stages: change.stages,
        });
      }
      break;
    }

    case "recoil": {
      // Rock Head: prevents recoil damage from recoil moves (NOT Struggle)
      // Source: Showdown Gen 4 — Rock Head prevents recoil
      // Source: Bulbapedia — "Rock Head: Protects the Pokemon from recoil damage."
      if (attacker.ability === GEN4_ABILITY_IDS.rockHead) {
        break;
      }
      // Magic Guard: prevents recoil damage from moves (NOT Struggle recoil)
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents move recoil
      if (attacker.ability === GEN4_ABILITY_IDS.magicGuard) {
        break;
      }
      // Recoil damage is a fraction of damage dealt
      // Source: Showdown Gen 4 — recoil = floor(damage * fraction)
      result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
      break;
    }

    case "drain": {
      // Drain heals a fraction of damage dealt
      // Source: Showdown Gen 4 — drain = floor(damage * fraction)
      result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
      break;
    }

    case "heal": {
      // Heal a fraction of max HP (e.g., Recover, Milk Drink)
      // Source: Showdown Gen 4 — heal = floor(maxHP * fraction)
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = Math.max(1, Math.floor(maxHp * effect.amount));
      break;
    }

    case "multi": {
      // Process each sub-effect (e.g., Scald = damage + 30% burn)
      for (const subEffect of effect.effects) {
        applyMoveEffect(subEffect, move, result, context);
      }
      break;
    }

    case "volatile-status": {
      // For damaging moves, roll the effect chance (secondary effect)
      // For status moves (e.g., Focus Energy, Substitute), guaranteed
      if (
        move.category !== CORE_MOVE_CATEGORIES.status &&
        !rollEffectChance(effect.chance, rng, attacker, defender, true)
      ) {
        break;
      }
      // Check ability-based volatile immunities before applying
      // Source: Showdown sim/abilities.ts Gen 4 mod — Inner Focus (flinch),
      //   Own Tempo (confusion), Oblivious (infatuation)
      if (isVolatileBlockedByAbility(defender, effect.status)) {
        break;
      }
      result.volatileInflicted = effect.status;
      break;
    }

    case "weather": {
      // Gen 4: weather rocks extend weather to 8 turns
      // Source: pret/pokeplatinum — weather rock items extend weather to 8 turns
      // Source: Bulbapedia — Damp Rock, Heat Rock, Smooth Rock, Icy Rock
      const heldItem = attacker.pokemon.heldItem ?? "";
      const rockWeather = WEATHER_ROCK_ITEMS[heldItem];
      const turns = rockWeather === effect.weather ? 8 : (effect.turns ?? 5);
      result.weatherSet = {
        weather: effect.weather,
        turns,
        source: move.id,
      };
      break;
    }

    case "screen": {
      // Gen 4: Light Clay extends Reflect/Light Screen to 8 turns (else 5)
      // Source: Bulbapedia — Light Clay extends screens to 8 turns
      // Source: Showdown Gen 4 — Light Clay screen duration
      const screenName = effect.screen;
      const turns = attacker.pokemon.heldItem === ITEM_IDS.lightClay ? 8 : 5;
      result.screenSet = {
        screen: screenName,
        turnsLeft: turns,
        side: BATTLE_EFFECT_TARGETS.attacker,
      };
      const displayName = screenName === CORE_SCREEN_IDS.reflect ? "Reflect" : "Light Screen";
      result.messages.push(`${attackerName} put up a ${displayName}!`);
      break;
    }

    case "entry-hazard": {
      // Entry hazard targets the opponent's side
      // Source: Showdown Gen 4 — Spikes placed on foe's side
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
      // SwitchOutEffect uses `target` in the TypeScript interface.
      // Gen 4 JSON data may use `who` instead of `target` due to data generation.
      // We handle both field names for safety.
      // Source: Showdown Gen 4 — U-turn / Baton Pass switch-out effect
      const switchTarget = effect.target ?? (effect as unknown as { who: string }).who ?? "self";
      if (switchTarget === "self") {
        result.switchOut = true;
      }
      break;
    }

    case "protect": {
      // Protect/Detect — engine handles protect volatile + consecutive-use scaling
      // Source: Showdown Gen 4 — Protect sets PROTECTED status
      result.volatileInflicted = CORE_VOLATILE_IDS.protect;
      break;
    }

    case "custom": {
      // No-op: custom move effects are handled by sub-modules in executeGen4MoveEffect
      // before reaching applyMoveEffect. This case should never be hit in practice.
      break;
    }

    case "remove-hazards": {
      // Intentionally no-op: Rapid Spin is handled in Gen4MoveEffectsField.
      // Defog is also handled in Gen4MoveEffectsField (effect: null in Gen 4 data).
      break;
    }

    case "fixed-damage":
    case "level-damage":
    case "ohko":
    case "damage":
      // These are handled by the damage calculation itself
      break;

    case "terrain":
    case "multi-hit":
      // Handled by the engine or N/A in Gen 4
      break;

    case "two-turn": {
      // Two-turn moves: charge on turn 1, attack on turn 2.
      // On the charge turn, set a volatile status and force the move next turn.
      // Source: Showdown Gen 4 mod — two-turn move handling
      // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
      handleTwoTurnEffect(move, result, context);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Two-Turn Move Effect Handler
// ---------------------------------------------------------------------------

/**
 * Volatile status map for two-turn semi-invulnerable moves.
 * Maps move ID to the volatile status applied during the charge turn.
 *
 * Source: Showdown Gen 4 mod — semi-invulnerable states per move
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
 */
const TWO_TURN_VOLATILE_MAP: Readonly<Record<string, VolatileStatus>> = {
  [GEN4_MOVE_IDS.fly]: CORE_VOLATILE_IDS.flying,
  [GEN4_MOVE_IDS.bounce]: CORE_VOLATILE_IDS.flying,
  [GEN4_MOVE_IDS.dig]: CORE_VOLATILE_IDS.underground,
  [GEN4_MOVE_IDS.dive]: CORE_VOLATILE_IDS.underwater,
  [GEN4_MOVE_IDS.shadowForce]: CORE_VOLATILE_IDS.shadowForceCharging,
  [GEN4_MOVE_IDS.solarBeam]: CORE_VOLATILE_IDS.charging,
  [GEN4_MOVE_IDS.skullBash]: CORE_VOLATILE_IDS.charging,
  [GEN4_MOVE_IDS.razorWind]: CORE_VOLATILE_IDS.charging,
  [GEN4_MOVE_IDS.skyAttack]: CORE_VOLATILE_IDS.charging,
};

/**
 * Charge-turn messages for two-turn moves.
 *
 * Source: Showdown Gen 4 mod — charge turn messages
 */
const TWO_TURN_MESSAGES: Readonly<Record<string, string>> = {
  fly: "{pokemon} flew up high!",
  bounce: "{pokemon} sprang up!",
  dig: "{pokemon} dug underground!",
  dive: "{pokemon} dived underwater!",
  [GEN4_MOVE_IDS.shadowForce]: "{pokemon} vanished!",
  [GEN4_MOVE_IDS.solarBeam]: "{pokemon} is absorbing sunlight!",
};

/**
 * Handle the charge turn of a two-turn move.
 *
 * On the charge turn:
 *   1. Determine the volatile status from the move ID
 *   2. Check skip-charge conditions (SolarBeam in sun, Power Herb)
 *   3. If charging, set forcedMoveSet and emit a charge message
 *
 * Source: Showdown Gen 4 mod — two-turn move charge handling
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
 */
function handleTwoTurnEffect(
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker } = context;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const volatile = TWO_TURN_VOLATILE_MAP[move.id] ?? CORE_VOLATILE_IDS.charging;

  // SolarBeam in sun: skip charge, attack immediately
  // Source: Showdown Gen 4 mod — SolarBeam fires immediately in sun
  // Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
  if (move.id === GEN4_MOVE_IDS.solarBeam && context.state.weather?.type === CORE_WEATHER_IDS.sun) {
    return; // No forcedMoveSet — engine proceeds with the attack immediately
  }

  // Power Herb: skip charge, consume the item
  // Source: Showdown Gen 4 mod — Power Herb allows immediate attack
  // Source: Bulbapedia — "Power Herb allows the holder to skip the charge turn of a
  //   two-turn move. It is consumed after use."
  if (attacker.pokemon.heldItem === ITEM_IDS.powerHerb) {
    result.attackerItemConsumed = true;
    result.messages.push(`${attackerName} became fully charged due to its Power Herb!`);
    return; // No forcedMoveSet — engine proceeds with the attack immediately
  }

  // Determine the move index from the attacker's moveset
  // Source: Engine uses moveIndex to identify which move slot to force next turn
  const moveIndex = attacker.pokemon.moves.findIndex((m) => m.moveId === move.id);

  // Set up the forced move for next turn
  result.forcedMoveSet = {
    moveIndex: moveIndex >= 0 ? moveIndex : 0,
    moveId: move.id,
    volatileStatus: volatile,
  };

  // Emit the charge message
  const messageTemplate = TWO_TURN_MESSAGES[move.id] ?? "{pokemon} is charging up!";
  result.messages.push(messageTemplate.replace("{pokemon}", attackerName));
}

// ---------------------------------------------------------------------------
// Heal Block Gate
// ---------------------------------------------------------------------------

/**
 * Heal Block gate: if the attacker has heal-block, prevent HP recovery.
 * Called after both null-effect and data-driven effect handling.
 *
 * Source: Showdown Gen 4 mod — heal-block volatile gates all healing
 * Source: Bulbapedia — Heal Block: "prevents the target from recovering HP"
 */
function applyHealBlockGate(result: MutableResult, context: MoveEffectContext): void {
  if (result.healAmount > 0 && context.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)) {
    result.healAmount = 0;
    const attackerName = context.attacker.pokemon.nickname ?? "The Pokemon";
    result.messages.push(`${attackerName} is blocked from healing!`);
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute Gen 4 move effects after the damage step.
 *
 * This is the main entry point called by Gen4Ruleset.executeMoveEffect().
 * Routes to sub-modules in priority order, then falls back to data-driven
 * applyMoveEffect() for moves not handled by any sub-module.
 *
 * Sub-module order:
 *   1. Field effects (Stealth Rock, Toxic Spikes, Trick Room, Tailwind, Defog,
 *      Gravity, Rapid Spin, binding moves)
 *   2. Status moves (Taunt, Disable, Yawn, Encore, Heal Block, Embargo,
 *      Worry Seed, Gastro Acid, Rest, Heal Bell/Aromatherapy, Safeguard,
 *      Lucky Chant, Block/Mean Look/Spider Web, Ingrain, Aqua Ring, Refresh,
 *      Destiny Bond, Wish, Haze)
 *   3. Combat moves (Belly Drum, Explosion/Self-Destruct, Baton Pass,
 *      Perish Song, Pain Split, Moonlight/Morning Sun/Synthesis, Future Sight,
 *      Whirlwind/Roar, Counter, Mirror Coat, Power/Guard/Heart Swap, Acupressure,
 *      Ghost Curse)
 *   4. Behavioral overrides (Roost, Knock Off, Trick/Switcheroo, Natural Gift,
 *      Fling, Pluck/Bug Bite, Sucker Punch, Feint, Focus Punch, Doom Desire,
 *      Magnet Rise, Thief/Covet)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 *
 * @param context - The move effect context (attacker, defender, move, damage, state, rng)
 * @returns The structured move effect result for the engine to apply
 */
export function executeGen4MoveEffect(context: MoveEffectContext): MoveEffectResult {
  const result: MutableResult = {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };

  // Clear Destiny Bond volatile if the attacker is using any move other than Destiny Bond.
  // Destiny Bond persists only until the user's next action; if they choose a different move,
  // the volatile is removed.
  // Source: Showdown Gen 4 — destiny-bond volatile is cleared in onBeforeMove
  if (
    context.move.id !== GEN4_MOVE_IDS.destinyBond &&
    context.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.destinyBond)
  ) {
    result.volatilesToClear = [
      ...(result.volatilesToClear ?? []),
      { target: BATTLE_EFFECT_TARGETS.attacker, volatile: CORE_VOLATILE_IDS.destinyBond },
    ];
  }

  // Helper: merge base result's volatilesToClear into a sub-module result before returning.
  // The base result carries cross-cutting effects (e.g. Destiny Bond volatile clear) that
  // must be preserved regardless of which sub-module handles the move.
  function withBaseEffects(sub: MoveEffectResult): MoveEffectResult {
    if (result.volatilesToClear?.length) {
      (sub as MutableResult).volatilesToClear = [
        ...result.volatilesToClear,
        ...((sub as MutableResult).volatilesToClear ?? []),
      ];
    }
    return sub;
  }

  // 1. Field effect moves (Stealth Rock, Toxic Spikes, Trick Room, Tailwind, Defog,
  //    Gravity, Rapid Spin, binding moves)
  const fieldResult = handleGen4FieldMove(context);
  if (fieldResult !== null) {
    applyHealBlockGate(fieldResult as MutableResult, context);
    return withBaseEffects(fieldResult);
  }

  // 2. Status/utility moves (Taunt, Disable, Yawn, Encore, Heal Block, Embargo,
  //    Worry Seed, Gastro Acid, Rest, Heal Bell/Aromatherapy, Safeguard,
  //    Lucky Chant, Block/Mean Look/Spider Web, Ingrain, Aqua Ring, Refresh,
  //    Destiny Bond, Wish, Haze)
  const statusResult = handleGen4StatusMove(context);
  if (statusResult !== null) {
    applyHealBlockGate(statusResult as MutableResult, context);
    return withBaseEffects(statusResult);
  }

  // 3. Combat moves (Belly Drum, Explosion/Self-Destruct, Baton Pass, Perish Song,
  //    Pain Split, Moonlight/Morning Sun/Synthesis, Future Sight, Whirlwind/Roar,
  //    Counter, Mirror Coat, Power/Guard/Heart Swap, Acupressure, Ghost Curse)
  const combatResult = handleGen4CombatMove(context);
  if (combatResult !== null) {
    applyHealBlockGate(combatResult as MutableResult, context);
    return withBaseEffects(combatResult);
  }

  // 4. Behavioral overrides (Roost, Knock Off, Trick/Switcheroo, Natural Gift,
  //    Fling, Pluck/Bug Bite, Sucker Punch, Feint, Focus Punch, Doom Desire,
  //    Magnet Rise, Thief/Covet)
  const behaviorResult = handleGen4BehaviorMove(context);
  if (behaviorResult !== null) {
    applyHealBlockGate(behaviorResult as MutableResult, context);
    return withBaseEffects(behaviorResult);
  }

  // No sub-module claimed the move.
  // If the move has no data-driven effect, return the base result
  // (which may have the Destiny Bond clear applied).
  if (!context.move.effect) {
    return result;
  }

  // Fall through to data-driven effect handler
  applyMoveEffect(context.move.effect, context.move, result, context);

  applyHealBlockGate(result, context);

  return result;
}

// Re-export item move data from dedicated module (avoids circular import with Gen4MoveEffectsBehavior)
export { getFlingPower, NATURAL_GIFT_TABLE } from "./Gen4ItemMoveData";
