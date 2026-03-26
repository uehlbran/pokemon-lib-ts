import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";

/**
 * Gen 5 remaining ability handlers (Wave 4A).
 *
 * Covers abilities not yet implemented in the other Gen5Abilities* files:
 *
 * Gen 5 new:
 *   - Zen Mode: Darmanitan changes form below 50% HP at end of turn (on-turn-end)
 *   - Harvest: 50% chance to restore consumed Berry each turn; 100% in sun (on-turn-end)
 *   - Telepathy: Not hit by ally moves in doubles (passive-immunity) -- always no-op in singles
 *   - Healer: 30% chance to cure ally's status at end of turn (on-turn-end) -- doubles only
 *   - Friend Guard: Reduces damage to ally by 25% (on-damage-calc) -- doubles only
 *   - Heavy Metal: Doubles Pokemon's weight (weight-modifier)
 *   - Light Metal: Halves Pokemon's weight (weight-modifier)
 *
 * Gen 5 version-specific carry-overs:
 *   - Frisk: Reveals ONE random foe's item (NOT all foes -- Gen 6+ reveals all) (on-switch-in)
 *   - Keen Eye: Does NOT ignore evasion boosts (Gen 6+ ignores evasion) (passive)
 *   - Oblivious: Only blocks Attract and Captivate (NOT Intimidate -- Gen 8+) (passive-immunity)
 *   - Serene Grace: Doubles secondary chance, excludes Secret Power (on-damage-calc)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
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
 * Dispatch a Gen 5 remaining ability trigger.
 *
 * @param ctx - The ability context
 */
export function handleGen5RemainingAbility(ctx: AbilityContext): AbilityResult {
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
 * Gen 5: Only applies to Darmanitan (speciesId doesn't matter for our purposes --
 * the engine should only attach this ability to Darmanitan).
 *
 * Source: Showdown data/abilities.ts -- zenmode onResidual
 *   `if (pokemon.hp <= pokemon.maxhp / 2 && !['Zen', 'Galar-Zen'].includes(pokemon.species.forme))`
 *   `pokemon.addVolatile('zenmode')` which triggers formeChange('Darmanitan-Zen')
 * Source: Showdown data/abilities.ts -- zenmode flags: { cantsuppress: 1 }
 * Source: Bulbapedia -- Zen Mode: "Changes Darmanitan's form at the end of each turn
 *   if its HP is below half."
 */
function handleZenMode(ctx: AbilityContext): AbilityResult {
  const pokemon = ctx.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const currentHp = pokemon.pokemon.currentHp;
  const name = getName(ctx);

  // Check if currently in Zen form via volatile status
  // Source: Showdown -- zenmode condition uses addVolatile('zenmode')
  const isZenForm = pokemon.volatileStatuses.has("zen-mode" as never);

  if (currentHp <= Math.floor(maxHp / 2) && !isZenForm) {
    // Transform to Zen Mode
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
    // Revert from Zen Mode: HP is above 50% and currently in Zen form.
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
 * Conditions:
 *   - Pokemon must have no current held item
 *   - Pokemon must have a consumed berry tracked in volatile data
 *
 * Since the codebase does not yet track `lastItem` on PokemonInstance, we
 * check for a `harvest-berry` volatile status whose data contains the
 * berry ID.  The engine should set this volatile when a berry is consumed.
 *
 * Source: Showdown data/abilities.ts -- harvest onResidual
 *   `if (this.field.isWeather(['sunnyday', 'desolateland']) || this.randomChance(1, 2))`
 *   `if (pokemon.hp && !pokemon.item && this.dex.items.get(pokemon.lastItem).isBerry)`
 * Source: Bulbapedia -- Harvest: "Has a 50% chance of restoring a consumed Berry
 *   at the end of each turn. Always restores the Berry in sunlight."
 */
function handleHarvest(ctx: AbilityContext): AbilityResult {
  const pokemon = ctx.pokemon;
  const name = getName(ctx);

  // Must have no current item
  if (pokemon.pokemon.heldItem) return NO_EFFECT;

  // Check for consumed berry in volatile data
  const harvestData = pokemon.volatileStatuses.get("harvest-berry");
  if (!harvestData?.data?.berryId) return NO_EFFECT;

  const berryId = harvestData.data.berryId as string;

  // Check weather -- 100% in sun, 50% otherwise
  // Source: Showdown -- this.field.isWeather(['sunnyday', 'desolateland'])
  const isSunny = ctx.state.weather?.type === "sun";
  if (!isSunny) {
    // 50% chance -- rng.next() returns [0, 1), need < 0.5
    const roll = ctx.rng.next();
    if (roll >= HARVEST_BASE_PROBABILITY) return NO_EFFECT;
  }

  // Restore the consumed berry via the item-restore AbilityEffect.
  // Source: Showdown data/abilities.ts -- harvest: pokemon.setItem(pokemon.lastItem)
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
 * Source: Bulbapedia -- Healer: "Has a 30% chance of curing an adjacent ally's
 *   status condition at the end of each turn."
 */
function handleHealer(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);
  const format = ctx.state.format;

  // Singles: no ally to heal
  if (format === "singles") return NO_EFFECT;

  // Find ally on the same side
  const pokemonUid = ctx.pokemon.pokemon.uid;
  const side = ctx.state.sides.find((s) => s.active.some((a) => a && a.pokemon.uid === pokemonUid));
  if (!side) return NO_EFFECT;

  // Get adjacent allies (not self, not fainted, has a status)
  const allies = side.active.filter(
    (a) => a && a.pokemon.uid !== pokemonUid && a.pokemon.currentHp > 0 && a.pokemon.status,
  );
  if (allies.length === 0) return NO_EFFECT;

  // 30% chance per ally (Showdown: this.randomChance(3, 10))
  // Source: Showdown -- randomChance(3, 10) = 30%
  const roll = ctx.rng.next();
  if (roll >= HEALER_PROBABILITY) return NO_EFFECT;

  // Pick the first eligible ally (in doubles there's typically only one)
  const ally = allies[0];
  if (!ally) return NO_EFFECT;

  const allyName = ally.pokemon.nickname ?? String(ally.pokemon.speciesId);
  const statusName = ally.pokemon.status;

  // Source: Showdown data/abilities.ts -- healer: allyActive.cureStatus()
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
 * Frisk (Gen 5): Reveals ONE random foe's held item on switch-in.
 *
 * Gen 5 behavior: only reveals one random foe, not all foes.
 * Gen 6+ changed this to reveal all foes' items.
 *
 * Source: Showdown data/mods/gen5/abilities.ts -- frisk onStart
 *   `const target = pokemon.side.randomFoe();`
 *   `if (target?.item) { this.add('-item', '', target.getItem().name, ...) }`
 * Source: Showdown data/abilities.ts (base, Gen 6+) -- frisk onStart
 *   `for (const target of pokemon.foes())` -- reveals ALL foes
 */
function handleFrisk(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  // In singles, the opponent is the only foe
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
 *   `return null;` (nullifies the move)
 * Source: Bulbapedia -- Telepathy: "Anticipates an ally's attack and dodges it."
 */
function handleTelepathy(ctx: AbilityContext): AbilityResult {
  // In singles, Telepathy never activates -- there are no ally moves
  if (ctx.state.format === "singles") return NO_EFFECT;

  // Telepathy only blocks ally moves -- if there is no attacker (ctx.opponent)
  // or the attacker is on the opposing side, do not activate.
  // Source: Showdown data/abilities.ts -- telepathy onTryHit:
  //   `if (target !== source && target.isAlly(source) && move.category !== 'Status')`
  if (!ctx.opponent) return NO_EFFECT;

  // Check that ctx.opponent is on the SAME side as ctx.pokemon (i.e., is an ally)
  const myUid = ctx.pokemon.pokemon.uid;
  const attackerUid = ctx.opponent.pokemon.uid;
  const mySide = ctx.state.sides.find((s) => s.active.some((a) => a && a.pokemon.uid === myUid));
  const attackerSide = ctx.state.sides.find((s) =>
    s.active.some((a) => a && a.pokemon.uid === attackerUid),
  );
  // If the attacker is not on the same side, it's a foe -- Telepathy doesn't apply
  if (!mySide || !attackerSide || mySide !== attackerSide) return NO_EFFECT;

  // Status moves are not blocked by Telepathy
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
 * Oblivious (Gen 5): Only blocks Attract and Captivate.
 * Does NOT block Intimidate (that was added in Gen 8).
 *
 * Source: Showdown data/mods/gen5/abilities.ts -- oblivious
 *   onUpdate: removes Attract volatile
 *   onTryHit: blocks Captivate only
 * Source: Bulbapedia -- Oblivious Gen V: "Prevents the Pokemon from being infatuated.
 *   Also prevents the effect of Captivate."
 */
function handleOblivious(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);
  const moveId = ctx.move?.id;

  // Block Attract (infatuation)
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

  // Block Captivate
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
 * Keen Eye (Gen 5): Prevents accuracy reduction.
 * Does NOT ignore the opponent's evasion boosts (that was added in Gen 6).
 *
 * Source: Showdown data/mods/gen5/abilities.ts -- keeneye
 *   `onModifyMove() {}` -- empty override, meaning the Gen 6+ evasion
 *   bypass is removed for Gen 5
 * Source: Showdown data/abilities.ts (base) -- keeneye
 *   `onModifyMove(move) { move.ignoreEvasion = true; }` -- Gen 6+ behavior
 * Source: Bulbapedia -- Keen Eye Gen III-V: "Prevents accuracy from being lowered."
 */
function handleKeenEye(_ctx: AbilityContext): AbilityResult {
  // Keen Eye's passive effect (preventing accuracy reduction) is handled
  // via the on-stat-change trigger in the stat ability handler. This
  // passive-immunity entry exists only to document that Keen Eye does NOT
  // ignore evasion in Gen 5 (unlike Gen 6+).
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
 * Does NOT affect the Pokemon itself, only its allies.
 *
 * Source: Showdown data/abilities.ts -- friendguard onAnyModifyDamage
 *   `if (target !== this.effectState.target && target.isAlly(this.effectState.target))`
 *   `return this.chainModify(0.75);`
 * Source: Bulbapedia -- Friend Guard: "Reduces damage done to allies by 25%."
 */
function handleFriendGuard(ctx: AbilityContext): AbilityResult {
  // Only relevant in doubles/triples
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
 * Serene Grace (Gen 5): Doubles the chance of secondary effects.
 * Excludes Secret Power (Gen 5 specific exclusion).
 *
 * Source: Showdown data/mods/gen5/abilities.ts -- serenegrace onModifyMove
 *   `if (move.secondaries && move.id !== 'secretpower')`
 *   `for (const secondary of move.secondaries) { if (secondary.chance) secondary.chance *= 2; }`
 * Source: Showdown data/abilities.ts (base, Gen 6+) -- no Secret Power exclusion
 */
function handleSereneGrace(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return NO_EFFECT;

  // Gen 5: Secret Power is excluded from Serene Grace
  // Source: Showdown data/mods/gen5/abilities.ts -- move.id !== 'secretpower'
  if (ctx.move.id === "secret-power") return NO_EFFECT;

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
 * Source: Bulbapedia -- Heavy Metal: "Doubles the Pokemon's weight."
 */
export const HEAVY_METAL_WEIGHT_MULTIPLIER = 2;

/**
 * Light Metal: Halves the Pokemon's weight.
 *
 * Source: Showdown data/abilities.ts -- lightmetal onModifyWeight
 *   `return this.trunc(weighthg / 2);`
 * Source: Bulbapedia -- Light Metal: "Halves the Pokemon's weight."
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
 * Source: Showdown data/abilities.ts -- friendguard
 *   `return this.chainModify(0.75);`
 */
export const FRIEND_GUARD_DAMAGE_MULTIPLIER = 0.75;

// ---------------------------------------------------------------------------
// Serene Grace secondary chance multiplier
// ---------------------------------------------------------------------------

/**
 * Serene Grace doubles secondary effect chances (multiplier = 2).
 *
 * Source: Showdown data/abilities.ts -- serenegrace
 *   `if (secondary.chance) secondary.chance *= 2;`
 */
export const SERENE_GRACE_CHANCE_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Harvest sun probability
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
 * Returns the Serene Grace chance multiplier, returning 1 if the move
 * is excluded (Secret Power in Gen 5).
 *
 * Source: Showdown data/mods/gen5/abilities.ts -- excludes secretpower
 */
export function getSereneGraceMultiplier(abilityId: string, moveId: string): number {
  if (abilityId !== "serene-grace") return 1;
  if (moveId === "secret-power") return 1;
  return SERENE_GRACE_CHANCE_MULTIPLIER;
}
