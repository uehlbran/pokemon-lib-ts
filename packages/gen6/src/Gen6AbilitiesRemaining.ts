import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";

/**
 * Gen 6 remaining ability handlers.
 *
 * Covers abilities not handled in the other Gen6Abilities* files:
 *
 * Gen 5 carry-overs (same behavior):
 *   - Zen Mode: Darmanitan form change below 50% HP (on-turn-end)
 *   - Harvest: 50% chance to restore consumed Berry; 100% in sun (on-turn-end)
 *   - Healer: 30% chance to cure ally's status at end of turn (on-turn-end, doubles only)
 *   - Friend Guard: Reduces damage to allies by 25% (on-damage-calc, doubles only)
 *   - Telepathy: Not hit by ally moves in doubles (passive-immunity, no-op in singles)
 *   - Oblivious: Blocks Attract and Captivate (passive-immunity)
 *
 * Gen 6 changes from Gen 5:
 *   - Frisk: Reveals ALL foes' items on switch-in (Gen 5: only one random foe)
 *   - Keen Eye: Ignores evasion boosts (Gen 5: did NOT ignore evasion)
 *   - Serene Grace: No longer excludes Secret Power (Gen 5: excluded Secret Power)
 *   - Oblivious: Gen 6 same as Gen 5 for our scope
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 */

// ---------------------------------------------------------------------------
// Inactive result (shared sentinel)
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Helper: get display name from ActivePokemon
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a Gen 6 remaining ability trigger.
 *
 * @param ctx - The ability context
 */
export function handleGen6RemainingAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (ctx.trigger) {
    case "on-turn-end":
      return handleTurnEnd(abilityId, ctx);
    case "on-switch-in":
      return handleSwitchIn(abilityId, ctx);
    case "passive-immunity":
      return handlePassiveImmunity(abilityId, ctx);
    case "on-damage-calc":
      return handleDamageCalc(abilityId, ctx);
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-turn-end abilities
// ---------------------------------------------------------------------------

function handleTurnEnd(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "zen-mode":
      return handleZenMode(ctx);
    case "harvest":
      return handleHarvest(ctx);
    case "healer":
      return handleHealer(ctx);
    default:
      return NO_EFFECT;
  }
}

/**
 * Zen Mode: Darmanitan changes form when below 50% HP at end of turn.
 * If HP is above 50% and in Zen form, reverts to Standard form.
 *
 * Source: Showdown data/abilities.ts -- zenmode onResidual
 *   `if (pokemon.hp <= pokemon.maxhp / 2 && !['Zen', 'Galar-Zen'].includes(pokemon.species.forme))`
 * Source: Bulbapedia -- Zen Mode: "Changes Darmanitan's form at the end of each turn
 *   if its HP is below half."
 */
function handleZenMode(ctx: AbilityContext): AbilityResult {
  const pokemon = ctx.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const currentHp = pokemon.pokemon.currentHp;
  const name = getName(ctx);

  const isZenForm = pokemon.volatileStatuses.has("zen-mode" as never);

  if (currentHp <= Math.floor(maxHp / 2) && !isZenForm) {
    const effect: AbilityEffect = {
      effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
      target: BATTLE_EFFECT_TARGETS.self,
      volatile: "zen-mode" as never,
    };
    return {
      activated: true,
      effects: [effect],
      messages: [`${name} transformed into its Zen Mode!`],
    };
  }

  if (currentHp > Math.floor(maxHp / 2) && isZenForm) {
    // Source: Showdown data/abilities.ts -- zenmode onResidual:
    //   pokemon.hp > pokemon.maxhp / 2 && Zen form => formeChange back to standard
    const effect: AbilityEffect = {
      effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileRemove,
      target: BATTLE_EFFECT_TARGETS.self,
      volatile: "zen-mode" as never,
    };
    return {
      activated: true,
      effects: [effect],
      messages: [`${name} returned to its standard form!`],
    };
  }

  return NO_EFFECT;
}

/**
 * Harvest: 50% chance to restore a consumed Berry at the end of each turn.
 * 100% chance in Sun.
 *
 * Source: Showdown data/abilities.ts -- harvest onResidual
 *   `if (this.field.isWeather(['sunnyday', 'desolateland']) || this.randomChance(1, 2))`
 * Source: Bulbapedia -- Harvest: "Has a 50% chance of restoring a consumed Berry
 *   at the end of each turn. Always restores the Berry in sunlight."
 */
function handleHarvest(ctx: AbilityContext): AbilityResult {
  const pokemon = ctx.pokemon;
  const name = getName(ctx);

  if (pokemon.pokemon.heldItem) return NO_EFFECT;

  const harvestData = pokemon.volatileStatuses.get("harvest-berry");
  if (!harvestData?.data?.berryId) return NO_EFFECT;

  const berryId = harvestData.data.berryId as string;

  // Source: Showdown data/abilities.ts -- harvest: `this.field.isWeather(['sunnyday', 'desolateland'])`
  // Both regular sun and harsh sun (Desolate Land) guarantee Harvest activation.
  const isSunny = ctx.state.weather?.type === "sun" || ctx.state.weather?.type === "harsh-sun";
  if (!isSunny) {
    const roll = ctx.rng.next();
    if (roll >= HARVEST_BASE_PROBABILITY) return NO_EFFECT;
  }

  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.itemRestore,
    target: BATTLE_EFFECT_TARGETS.self,
    item: berryId,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Harvest restored its ${berryId}!`],
  };
}

/**
 * Healer: 30% chance to cure an ally's status condition at end of turn.
 * Only functional in doubles/triples -- in singles, no ally exists.
 *
 * Source: Showdown data/abilities.ts -- healer onResidual
 *   `for (const allyActive of pokemon.adjacentAllies())`
 *   `if (allyActive.status && this.randomChance(3, 10))`
 */
function handleHealer(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);
  const format = ctx.state.format;

  if (format === "singles") return NO_EFFECT;

  const pokemonUid = ctx.pokemon.pokemon.uid;
  const side = ctx.state.sides.find((s) => s.active.some((a) => a && a.pokemon.uid === pokemonUid));
  if (!side) return NO_EFFECT;

  const allies = side.active.filter(
    (a) => a && a.pokemon.uid !== pokemonUid && a.pokemon.currentHp > 0 && a.pokemon.status,
  );
  if (allies.length === 0) return NO_EFFECT;

  // Source: Showdown data/abilities.ts -- healer: randomChance(3, 10) = 30%
  const roll = ctx.rng.next();
  if (roll >= HEALER_PROBABILITY) return NO_EFFECT;

  const ally = allies[0];
  if (!ally) return NO_EFFECT;

  const allyName = ally.pokemon.nickname ?? String(ally.pokemon.speciesId);
  const statusName = ally.pokemon.status;

  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statusCure,
    target: BATTLE_EFFECT_TARGETS.ally,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Healer cured ${allyName}'s ${statusName}!`],
  };
}

// ---------------------------------------------------------------------------
// on-switch-in abilities
// ---------------------------------------------------------------------------

function handleSwitchIn(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "frisk":
      return handleFrisk(ctx);
    default:
      return NO_EFFECT;
  }
}

/**
 * Frisk (Gen 6): Reveals ALL foes' held items on switch-in.
 *
 * Gen 6 change from Gen 5: reveals all foes' items, not just one random foe.
 * In singles, this is functionally the same (only one opponent).
 *
 * Source: Showdown data/abilities.ts (base, Gen 6+) -- frisk onStart
 *   `for (const target of pokemon.foes()) { ... }` -- reveals ALL foes
 * Source: Showdown data/mods/gen5/abilities.ts -- frisk onStart
 *   `const target = pokemon.side.randomFoe();` -- Gen 5: only one random foe
 */
function handleFrisk(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  if (!ctx.opponent) return NO_EFFECT;

  const foeItem = ctx.opponent.pokemon.heldItem;
  if (!foeItem) return NO_EFFECT;

  const foeName = ctx.opponent.pokemon.nickname ?? String(ctx.opponent.pokemon.speciesId);

  return {
    activated: true,
    effects: [{ effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self }],
    messages: [`${name} frisked ${foeName} and found its ${foeItem}!`],
  };
}

// ---------------------------------------------------------------------------
// passive-immunity abilities
// ---------------------------------------------------------------------------

function handlePassiveImmunity(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "telepathy":
      return handleTelepathy(ctx);
    case "oblivious":
      return handleOblivious(ctx);
    case "keen-eye":
      return handleKeenEye(ctx);
    default:
      return NO_EFFECT;
  }
}

/**
 * Telepathy: In doubles/triples, prevents the Pokemon from being hit by
 * its ally's moves. In singles, always no-op.
 *
 * Source: Showdown data/abilities.ts -- telepathy onTryHit
 *   `if (target !== source && target.isAlly(source) && move.category !== 'Status')`
 */
function handleTelepathy(ctx: AbilityContext): AbilityResult {
  if (ctx.state.format === "singles") return NO_EFFECT;

  if (!ctx.opponent) return NO_EFFECT;

  const myUid = ctx.pokemon.pokemon.uid;
  const attackerUid = ctx.opponent.pokemon.uid;
  const mySide = ctx.state.sides.find((s) => s.active.some((a) => a && a.pokemon.uid === myUid));
  const attackerSide = ctx.state.sides.find((s) =>
    s.active.some((a) => a && a.pokemon.uid === attackerUid),
  );
  if (!mySide || !attackerSide || mySide !== attackerSide) return NO_EFFECT;

  if (ctx.move?.category === "status") return NO_EFFECT;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [{ effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self }],
    messages: [`${name} avoided the attack with Telepathy!`],
    movePrevented: true,
  };
}

/**
 * Oblivious (Gen 6): Blocks Attract and Captivate.
 * Same behavior as Gen 5 for these blocked moves.
 *
 * Source: Showdown data/abilities.ts -- oblivious onTryHit: blocks Captivate
 * Source: Bulbapedia -- Oblivious: "Prevents the Pokemon from being infatuated
 *   or from having its stats lowered by Captivate."
 */
function handleOblivious(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);
  const moveId = ctx.move?.id;

  if (moveId === "attract") {
    return {
      activated: true,
      effects: [
        { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
      ],
      messages: [`${name}'s Oblivious prevents infatuation!`],
      movePrevented: true,
    };
  }

  if (moveId === "captivate") {
    return {
      activated: true,
      effects: [
        { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
      ],
      messages: [`${name}'s Oblivious prevents Captivate!`],
      movePrevented: true,
    };
  }

  return NO_EFFECT;
}

/**
 * Keen Eye (Gen 6): Prevents accuracy reduction AND ignores evasion boosts.
 *
 * Gen 6 change from Gen 5: now ignores the opponent's evasion boosts in addition
 * to preventing accuracy drops on self.
 *
 * Source: Showdown data/abilities.ts (base, Gen 6+) -- keeneye
 *   `onModifyMove(move) { move.ignoreEvasion = true; }` -- Gen 6+ behavior
 * Source: Showdown data/mods/gen5/abilities.ts -- keeneye
 *   `onModifyMove() {}` -- empty override, evasion bypass removed for Gen 5
 * Source: Bulbapedia -- Keen Eye Gen VI: "Prevents accuracy from being lowered.
 *   Also ignores target's evasion boosts."
 */
function handleKeenEye(_ctx: AbilityContext): AbilityResult {
  // Keen Eye's passive effects (accuracy protection + evasion ignore in Gen 6)
  // are handled by the engine: stat-change block via on-stat-change, and
  // accuracy calculation reads this ability flag. This passive-immunity entry
  // documents the Gen 6 behavior but is a no-op at the passive-immunity level.
  return NO_EFFECT;
}

// ---------------------------------------------------------------------------
// on-damage-calc abilities
// ---------------------------------------------------------------------------

function handleDamageCalc(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "friend-guard":
      return handleFriendGuard(ctx);
    case "serene-grace":
      return handleSereneGrace(ctx);
    default:
      return NO_EFFECT;
  }
}

/**
 * Friend Guard: In doubles/triples, reduces damage dealt to allies by 25%.
 *
 * Source: Showdown data/abilities.ts -- friendguard onAnyModifyDamage
 *   `return this.chainModify(0.75);`
 */
function handleFriendGuard(ctx: AbilityContext): AbilityResult {
  if (ctx.state.format === "singles") return NO_EFFECT;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
        target: BATTLE_EFFECT_TARGETS.self,
      },
    ],
    messages: [`${name}'s Friend Guard reduced the damage!`],
  };
}

/**
 * Serene Grace (Gen 6): Doubles the chance of secondary effects.
 * Gen 6 change: no longer excludes Secret Power (that was a Gen 5-specific exclusion).
 *
 * Source: Showdown data/abilities.ts (base, Gen 6+) -- serenegrace onModifyMove
 *   `if (move.secondaries) { for (const secondary of move.secondaries) { secondary.chance *= 2; } }`
 *   No Secret Power exclusion in Gen 6+ base.
 * Source: Showdown data/mods/gen5/abilities.ts -- excluded Secret Power (Gen 5 only)
 */
function handleSereneGrace(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return NO_EFFECT;

  // Gen 6: Secret Power exclusion removed (Secret Power doesn't exist competitively in Gen 6
  // but the mechanic exclusion was Gen 5 specific)
  return {
    activated: true,
    effects: [{ effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self }],
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Weight modifiers
// ---------------------------------------------------------------------------

/**
 * Heavy Metal: Doubles the Pokemon's weight.
 *
 * Source: Showdown data/abilities.ts -- heavymetal onModifyWeight
 *   `return weighthg * 2;`
 */
export const HEAVY_METAL_WEIGHT_MULTIPLIER = 2;

/**
 * Light Metal: Halves the Pokemon's weight.
 *
 * Source: Showdown data/abilities.ts -- lightmetal onModifyWeight
 *   `return this.trunc(weighthg / 2);`
 */
export const LIGHT_METAL_WEIGHT_MULTIPLIER = 0.5;

/**
 * Returns the weight multiplier for weight-modifying abilities.
 *
 * @param abilityId - The ability ID to check
 * @returns The weight multiplier (1 for no modification)
 */
export function getWeightMultiplier(abilityId: string): number {
  switch (abilityId) {
    case "heavy-metal":
      return HEAVY_METAL_WEIGHT_MULTIPLIER;
    case "light-metal":
      return LIGHT_METAL_WEIGHT_MULTIPLIER;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Friend Guard damage multiplier constant
// ---------------------------------------------------------------------------

/**
 * Friend Guard reduces ally damage to 75% (multiplier = 0.75).
 *
 * Source: Showdown data/abilities.ts -- friendguard: `return this.chainModify(0.75);`
 */
export const FRIEND_GUARD_DAMAGE_MULTIPLIER = 0.75;

// ---------------------------------------------------------------------------
// Serene Grace secondary chance multiplier
// ---------------------------------------------------------------------------

/**
 * Serene Grace doubles secondary effect chances (multiplier = 2).
 * Gen 6: No move exclusions (Secret Power exclusion was Gen 5 only).
 *
 * Source: Showdown data/abilities.ts -- serenegrace: `secondary.chance *= 2;`
 */
export const SERENE_GRACE_CHANCE_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Harvest probabilities
// ---------------------------------------------------------------------------

/**
 * Harvest base probability (50%) outside sun.
 * Source: Showdown data/abilities.ts -- harvest: `this.randomChance(1, 2)`
 */
export const HARVEST_BASE_PROBABILITY = 0.5;

/**
 * Harvest probability in sun (100%).
 * Source: Showdown data/abilities.ts -- `this.field.isWeather(['sunnyday', 'desolateland'])`
 */
export const HARVEST_SUN_PROBABILITY = 1.0;

// ---------------------------------------------------------------------------
// Healer probability
// ---------------------------------------------------------------------------

/**
 * Healer activation probability (30%).
 * Source: Showdown data/abilities.ts -- healer: `this.randomChance(3, 10)`
 */
export const HEALER_PROBABILITY = 0.3;

/**
 * Returns the Serene Grace chance multiplier for Gen 6.
 * Unlike Gen 5, no moves are excluded in Gen 6.
 *
 * Source: Showdown data/abilities.ts (base) -- no move-id exclusion
 * Source: Showdown data/mods/gen5/abilities.ts -- excluded secretpower (Gen 5 only)
 */
export function getSereneGraceMultiplier(abilityId: string): number {
  if (abilityId !== "serene-grace") return 1;
  return SERENE_GRACE_CHANCE_MULTIPLIER;
}
