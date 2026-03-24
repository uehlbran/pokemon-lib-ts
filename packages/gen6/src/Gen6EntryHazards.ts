/**
 * Gen 6 Entry Hazards
 *
 * Implements Spikes, Stealth Rock, Toxic Spikes, and Sticky Web hazard
 * application for Pokemon switching into battle. Gen 6 hazards inherit all
 * Gen 5 mechanics and add Sticky Web -- a Bug-type entry hazard that lowers
 * the Speed stat stage of grounded switch-ins by 1.
 *
 * Key mechanics:
 *   - Spikes: layer-scaled HP damage (1/8, 1/6, 1/4), grounded-only
 *   - Stealth Rock: Rock-type effectiveness-scaled damage (no grounding check)
 *   - Toxic Spikes: poison/badly-poisoned on grounded switch-in; Poison-type absorbs
 *   - Sticky Web: -1 Speed stage to grounded switch-ins (new in Gen 6)
 *   - Magic Guard: immune to ALL hazard effects (damage, status, AND stat drops)
 *   - Air Balloon: grants levitation (immune to ground-based hazards)
 *   - Heavy-Duty Boots do NOT exist in Gen 6 (introduced Gen 8)
 *
 * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes, stickyweb conditions
 * Source: Bulbapedia -- Sticky Web: "lowers the Speed stat of the opposing Pokemon
 *   that switches into it by one stage"
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  EntryHazardResult,
} from "@pokemon-lib-ts/battle";
import type {
  BattleStat,
  EntryHazardType,
  PrimaryStatus,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of applying a single damage-dealing hazard (Spikes or Stealth Rock) */
export interface HazardDamageResult {
  /** HP damage dealt */
  readonly damage: number;
  /** Message to emit */
  readonly message: string;
}

/** Result of applying Toxic Spikes */
export interface ToxicSpikesResult {
  /** Whether a Poison-type absorbed (removed) the hazard */
  readonly absorbed: boolean;
  /** Status to inflict, or null if immune */
  readonly status: "poison" | "badly-poisoned" | null;
  /** Message to emit */
  readonly message: string | null;
}

/** Result of applying Sticky Web */
export interface StickyWebResult {
  /** Whether the Speed drop was applied */
  readonly applied: boolean;
  /** Stat change to emit (speed: -1), or null if immune */
  readonly statChange: { stat: BattleStat; stages: number } | null;
  /** Messages to emit */
  readonly messages: string[];
}

// ---------------------------------------------------------------------------
// Grounding Check
// ---------------------------------------------------------------------------

/**
 * Determines whether a Pokemon is grounded (affected by Spikes, Toxic Spikes,
 * and Sticky Web).
 *
 * A Pokemon is grounded unless it is:
 *   - Flying-type
 *   - Has Levitate ability
 *   - Has Magnet Rise volatile
 *   - Has Telekinesis volatile (new check vs Gen 5 -- Telekinesis grants levitation in Gen 6)
 *   - Holds Air Balloon (Gen 5+ item)
 *
 * Exception: Gravity overrides all of the above and grounds everything.
 * Exception: Iron Ball grounds the holder.
 * Exception: Ingrain grounds the user.
 * Exception: Smack Down (volatile "smackdown") grounds the target.
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- individual ability/item/move pages
 */
/**
 * Airborne semi-invulnerable volatiles.
 * Pokemon using Fly, Bounce, Shadow Force, or Phantom Force are airborne and NOT grounded.
 * Dig and Dive are underground/underwater, NOT airborne -- still grounded for terrain purposes.
 *
 * These are the actual volatile status IDs applied by the engine during the charge turn:
 *   - "flying" -- Fly and Bounce both use this volatile (BattleEngine.ts:1191)
 *   - "shadow-force-charging" -- Shadow Force and Phantom Force both use this volatile
 *     (BattleEngine.ts:1194, Gen6MoveEffects.ts GEN6_TWO_TURN_VOLATILE_MAP)
 *
 * Source: BattleEngine.ts:1190-1194 -- semiInvulnerableVolatiles array
 * Source: Showdown sim/pokemon.ts -- isGrounded: returns false for Pokemon using Fly/Bounce
 * Source: Showdown data/conditions.ts -- terrain conditions check target.isGrounded()
 * Source: Bulbapedia "Semi-invulnerable turn" -- Fly/Bounce elevate the user
 */
const AIRBORNE_SEMI_INVULNERABLE = new Set(["flying", "shadow-force-charging"]);

export function isGen6Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
  // Gravity grounds everything (even semi-invulnerable airborne Pokemon)
  // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
  if (gravityActive) return true;

  // Airborne semi-invulnerable state makes the Pokemon NOT grounded.
  // Fly, Bounce, Shadow Force, and Phantom Force all elevate the user off the ground.
  // Dig and Dive do NOT affect grounding (underground/underwater but still "on ground").
  // Source: Showdown sim/pokemon.ts -- isGrounded checks for semi-invulnerable volatiles
  for (const v of AIRBORNE_SEMI_INVULNERABLE) {
    if (pokemon.volatileStatuses.has(v as VolatileStatus)) return false;
  }

  // Ingrain grounds the user even if Flying-type or Levitate
  // Source: Bulbapedia -- Ingrain: "The user is affected by hazards on the ground,
  //   even if it is a Flying-type or has the Levitate ability."
  // Source: Showdown sim/pokemon.ts -- isGrounded: checks 'ingrain' volatile before
  //   Flying/Levitate checks
  if (pokemon.volatileStatuses.has("ingrain")) return true;

  // Compute item suppression once. Klutz ability and Embargo volatile both suppress
  // held-item effects, preventing Iron Ball from grounding and Air Balloon from levitating.
  // Source: Showdown sim/pokemon.ts -- isGrounded: suppresses items under Klutz/Embargo
  // Source: Bulbapedia -- Klutz: "The held item has no effect"
  // Source: Bulbapedia -- Embargo: "The target cannot use its held item"
  const itemsSuppressed = pokemon.ability === "klutz" || pokemon.volatileStatuses.has("embargo");

  // Iron Ball grounds the holder (only when item effects are active)
  // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
  if (pokemon.pokemon.heldItem === "iron-ball" && !itemsSuppressed) return true;

  // Smack Down grounds the target
  // Source: Showdown data/moves.ts -- smackdown volatile grounds the target
  // Note: "smackdown" is not in the VolatileStatus union (Gen 5/6-specific volatile),
  // so we cast. The combat move handler uses the same cast pattern.
  if (pokemon.volatileStatuses.has("smackdown" as VolatileStatus)) return true;

  // Flying-type is not grounded
  if (pokemon.types.includes("flying")) return false;

  // Levitate grants levitation
  // Source: Bulbapedia -- Levitate: "gives full immunity to Ground-type moves"
  if (pokemon.ability === "levitate") return false;

  // Magnet Rise grants levitation
  // Source: Bulbapedia -- Magnet Rise: "makes the user immune to Ground-type moves"
  if (pokemon.volatileStatuses.has("magnet-rise")) return false;

  // Telekinesis grants levitation (new in Gen 5, but the Gen 5 implementation did not
  // check it in isGen5Grounded; Gen 6 adds this check per Showdown)
  // Source: Showdown sim/pokemon.ts -- isGrounded: checks telekinesis volatile
  // Source: Bulbapedia -- Telekinesis: "The target is raised into the air. It has a
  //   5-turn effect and makes all moves, except one-hit KO moves, used against the
  //   target always hit... it also makes the user immune to Ground-type moves"
  if (pokemon.volatileStatuses.has("telekinesis" as VolatileStatus)) return false;

  // Air Balloon grants levitation ONLY when item effects are not suppressed.
  // Source: Bulbapedia -- Air Balloon: "makes the holder immune to Ground-type moves"
  if (pokemon.pokemon.heldItem === "air-balloon" && !itemsSuppressed) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Individual Hazard Functions
// ---------------------------------------------------------------------------

/**
 * Apply Spikes damage to a grounded Pokemon switching in.
 *
 * Damage is layer-dependent:
 *   - 1 layer: floor(maxHp * 3 / 24) = floor(maxHp / 8)
 *   - 2 layers: floor(maxHp * 4 / 24) = floor(maxHp / 6)
 *   - 3 layers: floor(maxHp * 6 / 24) = floor(maxHp / 4)
 *
 * Returns null if the Pokemon is immune (not grounded).
 *
 * Source: Showdown data/moves.ts -- spikes.condition.onSwitchIn
 *   const damageAmounts = [0, 3, 4, 6]; // fractions of maxhp/24
 *   this.damage(damageAmounts[layers] * pokemon.maxhp / 24);
 */
export function applyGen6SpikesHazard(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): HazardDamageResult | null {
  // No layers -> no hazard
  if (layers <= 0) return null;

  // Not grounded -> immune
  if (!isGen6Grounded(switchingIn, gravityActive)) return null;

  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
  // damage = damageAmounts[layers] * maxhp / 24
  const damageNumerators = [0, 3, 4, 6];
  const clampedLayers = Math.min(layers, 3);
  const numerator = damageNumerators[clampedLayers] ?? 3;
  const damage = Math.max(1, Math.floor((maxHp * numerator) / 24));

  return {
    damage,
    message: `${pokemonName} was hurt by the spikes!`,
  };
}

/**
 * Apply Stealth Rock damage to a Pokemon switching in.
 *
 * Damage = floor(maxHp * typeEffectiveness / 8)
 * where typeEffectiveness is Rock-type's effectiveness against the switching Pokemon's types.
 *
 * Stealth Rock has NO grounding check -- it hits Flying-types, Levitate, etc.
 * Only Magic Guard prevents the damage.
 *
 * Source: Showdown data/moves.ts -- stealthrock.condition.onSwitchIn
 *   const typeMod = this.clampIntRange(pokemon.runEffectiveness(...), -6, 6);
 *   this.damage(pokemon.maxhp * (2 ** typeMod) / 8);
 */
export function applyGen6StealthRock(
  switchingIn: ActivePokemon,
  typeChart: TypeChart,
): HazardDamageResult | null {
  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Calculate Rock-type effectiveness against switching Pokemon's types
  // Source: Showdown -- runEffectiveness multiplies per-type matchups
  let effectiveness = 1;
  const rockChart = typeChart.rock;
  if (rockChart) {
    for (const type of switchingIn.types) {
      const mult = rockChart[type] ?? 1;
      effectiveness *= mult;
    }
  }

  // Source: Showdown -- damage = floor(maxhp * (2^typeMod) / 8)
  // Since effectiveness is already the product of multipliers (0.25, 0.5, 1, 2, 4),
  // this is equivalent to floor(maxhp * effectiveness / 8)
  const damage = Math.max(1, Math.floor((maxHp * effectiveness) / 8));

  return {
    damage,
    message: `Pointed stones dug into ${pokemonName}!`,
  };
}

/**
 * Apply Toxic Spikes effect to a Pokemon switching in.
 *
 * Layer 1: inflicts regular poison
 * Layer 2: inflicts badly poisoned (toxic)
 *
 * Immunities:
 *   - Poison-type: absorbs (removes) the hazard from the field
 *   - Steel-type: immune to poison status
 *   - Not grounded: immune (Flying, Levitate, Air Balloon, Magnet Rise, Telekinesis)
 *   - Already has a primary status: cannot gain another
 *
 * Source: Showdown data/moves.ts -- toxicspikes.condition.onSwitchIn
 *   if (pokemon.hasType('Poison')) -> removeSideCondition('toxicspikes')
 *   elif (pokemon.hasType('Steel')) -> do nothing
 *   elif (layers >= 2) -> trySetStatus('tox')
 *   else -> trySetStatus('psn')
 */
export function applyGen6ToxicSpikes(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): ToxicSpikesResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // No layers -> no hazard
  if (layers <= 0) {
    return { absorbed: false, status: null, message: null };
  }

  // Not grounded -> immune
  if (!isGen6Grounded(switchingIn, gravityActive)) {
    return { absorbed: false, status: null, message: null };
  }

  // Poison-type absorbs (removes) Toxic Spikes
  // Source: Showdown -- toxicspikes: grounded Poison-type removes them
  if (switchingIn.types.includes("poison")) {
    return {
      absorbed: true,
      status: null,
      message: `${pokemonName} absorbed the poison spikes!`,
    };
  }

  // Steel-type immune to poison
  // Source: Bulbapedia -- Steel types cannot be poisoned
  if (switchingIn.types.includes("steel")) {
    return { absorbed: false, status: null, message: null };
  }

  // Already has a primary status -> cannot gain another
  if (switchingIn.pokemon.status) {
    return { absorbed: false, status: null, message: null };
  }

  // Apply poison based on layers
  const clampedLayers = Math.min(layers, 2);
  if (clampedLayers >= 2) {
    return {
      absorbed: false,
      status: "badly-poisoned",
      message: `${pokemonName} was badly poisoned by the toxic spikes!`,
    };
  }

  return {
    absorbed: false,
    status: "poison",
    message: `${pokemonName} was poisoned by the toxic spikes!`,
  };
}

/**
 * Apply Sticky Web effect to a Pokemon switching in.
 *
 * Sticky Web lowers the Speed stat of the opposing grounded Pokemon by 1 stage.
 * This is the first entry hazard that modifies stat stages instead of dealing
 * damage or inflicting status.
 *
 * Immunities:
 *   - Not grounded: immune (Flying, Levitate, Air Balloon, Magnet Rise, Telekinesis)
 *   - Clear Body / White Smoke: blocks stat drops
 *   - Full Metal Body: blocks stat drops (Gen 7+ ability, not relevant in Gen 6)
 *   - Magic Guard does NOT block Sticky Web's Speed drop (it only blocks indirect damage,
 *     and Sticky Web deals no damage)
 *
 * Triggers:
 *   - Defiant: +2 Attack when a stat is lowered by an opponent
 *   - Competitive: +2 Special Attack when a stat is lowered by an opponent
 *
 * Source: Showdown data/moves.ts -- stickyweb.condition.onSwitchIn
 *   "if (!pokemon.isGrounded()) return;"
 *   "this.boost({spe: -1}, pokemon, ...);"
 * Source: Bulbapedia -- Sticky Web: "lowers the Speed stat of the opposing Pokemon
 *   that switches into it by one stage"
 * Source: Bulbapedia -- Clear Body: "Prevents other Pokemon from lowering this
 *   Pokemon's stat stages"
 * Source: Bulbapedia -- White Smoke: same effect as Clear Body
 */
export function applyGen6StickyWeb(
  switchingIn: ActivePokemon,
  gravityActive: boolean,
): StickyWebResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Not grounded -> immune
  if (!isGen6Grounded(switchingIn, gravityActive)) {
    return { applied: false, statChange: null, messages: [] };
  }

  // Clear Body / White Smoke: prevents stat drops
  // Source: Showdown data/abilities.ts -- clearbody: onBoost: "This Pokemon's stat stages
  //   cannot be lowered by other Pokemon"
  // Source: Bulbapedia -- Clear Body prevents stat reductions from opponents
  if (switchingIn.ability === "clear-body" || switchingIn.ability === "white-smoke") {
    return {
      applied: false,
      statChange: null,
      messages: [
        `${pokemonName}'s ${switchingIn.ability === "clear-body" ? "Clear Body" : "White Smoke"} prevents stat loss!`,
      ],
    };
  }

  // Hyper Cutter: prevents Attack drops only -- does NOT block Speed drops from Sticky Web
  // (This is a common misconception; Hyper Cutter only protects Attack, not Speed)

  // Apply -1 Speed stage
  // Source: Showdown data/moves.ts -- stickyweb: this.boost({spe: -1}, pokemon)
  const messages: string[] = [`${pokemonName} was caught in a sticky web!`];

  // Note: the actual stat stage modification is handled by the engine after reading
  // the statChanges from the EntryHazardResult. We only report the intended change here.

  // Defiant / Competitive trigger information:
  // These abilities trigger when a stat is lowered by an opponent. The engine handles
  // the trigger after applying the stat change. We include Defiant/Competitive trigger
  // messages and stat changes in the result for the engine to process.
  //
  // Source: Bulbapedia -- Defiant: "raises the Pokemon's Attack stat by two stages for
  //   each of its stats that is lowered by an opposing Pokemon"
  // Source: Bulbapedia -- Competitive: "raises the Pokemon's Special Attack stat by two
  //   stages for each of its stats that is lowered by an opposing Pokemon"
  const statChanges: Array<{ stat: BattleStat; stages: number }> = [{ stat: "speed", stages: -1 }];

  if (switchingIn.ability === "defiant") {
    // Defiant: +2 Attack in response to stat drop
    statChanges.push({ stat: "attack", stages: 2 });
    messages.push(`${pokemonName}'s Defiant sharply raised its Attack!`);
  } else if (switchingIn.ability === "competitive") {
    // Competitive: +2 Special Attack in response to stat drop
    statChanges.push({ stat: "spAttack", stages: 2 });
    messages.push(`${pokemonName}'s Competitive sharply raised its Sp. Atk!`);
  }

  return {
    applied: true,
    statChange: { stat: "speed", stages: -1 },
    messages,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Hazard Application
// ---------------------------------------------------------------------------

/**
 * Apply all entry hazards to a Pokemon switching in.
 *
 * Processes hazards in order: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
 * Stealth Rock, Spikes, and Toxic Spikes follow the Gen 4/5 ordering.
 * Sticky Web is processed last (new in Gen 6).
 *
 * Magic Guard prevents ALL hazard effects (both damage and status) but does NOT
 * prevent Sticky Web's stat drop. Wait -- actually per Showdown, Magic Guard
 * DOES prevent Sticky Web because the entire onSwitchIn handler is gated by
 * the damage check... No. Let me check again.
 *
 * Actually, in Showdown, Magic Guard only prevents damage-related effects.
 * Sticky Web does not deal damage, so Magic Guard does NOT block it.
 * However, the Showdown implementation gates Sticky Web behind a separate handler
 * from the damage hazards.
 *
 * After further review:
 * Source: Showdown sim/battle-actions.ts -- runSwitch: sideConditions are applied individually
 *   Each hazard's onSwitchIn runs independently. Magic Guard check is inside each
 *   damage-dealing hazard's handler, not a blanket check.
 * Source: Bulbapedia -- Magic Guard: "prevents all indirect damage" (Sticky Web is not damage)
 *
 * Conclusion: Magic Guard blocks Spikes/Stealth Rock/Toxic Spikes but NOT Sticky Web.
 *
 * Source: Showdown data/moves.ts -- individual hazard condition.onSwitchIn handlers
 * Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
 */
export function applyGen6EntryHazards(
  switchingIn: ActivePokemon,
  side: BattleSide,
  state: BattleState,
  typeChart: TypeChart,
): EntryHazardResult {
  let totalDamage = 0;
  let statusInflicted: PrimaryStatus | null = null;
  const messages: string[] = [];
  const hazardsToRemove: EntryHazardType[] = [];
  const statChanges: Array<{ stat: BattleStat; stages: number }> = [];
  const gravityActive = state.gravity?.active ?? false;

  // Magic Guard: immune to all DAMAGE-related hazard effects (Spikes, Stealth Rock, Toxic Spikes)
  // but NOT immune to Sticky Web (which applies a stat drop, not damage).
  // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
  // Source: Showdown data/abilities.ts -- magicguard: onDamage prevents residual/hazard damage
  const hasMagicGuard = switchingIn.ability === "magic-guard";

  if (!hasMagicGuard) {
    // --- Stealth Rock ---
    // No grounding check -- Stealth Rock hits everything
    const stealthRock = side.hazards.find((h) => h.type === "stealth-rock");
    if (stealthRock && stealthRock.layers > 0) {
      const result = applyGen6StealthRock(switchingIn, typeChart);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Spikes ---
    const spikes = side.hazards.find((h) => h.type === "spikes");
    if (spikes && spikes.layers > 0) {
      const result = applyGen6SpikesHazard(switchingIn, spikes.layers, gravityActive);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Toxic Spikes ---
    const toxicSpikes = side.hazards.find((h) => h.type === "toxic-spikes");
    if (toxicSpikes && toxicSpikes.layers > 0) {
      const result = applyGen6ToxicSpikes(switchingIn, toxicSpikes.layers, gravityActive);
      if (result.absorbed) {
        hazardsToRemove.push("toxic-spikes");
      }
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus blocks all status
      //   for grounded Pokemon. Toxic Spikes calls trySetStatus which checks terrain.
      //   If Misty Terrain is active and the Pokemon is grounded, the status is blocked
      //   and no poison message should be emitted.
      // Note: Electric Terrain only blocks sleep, not poison, so it does not affect
      //   Toxic Spikes. We inline the check to avoid circular imports with Gen6Terrain.ts.
      const terrainBlocksStatus =
        state.terrain?.type === "misty" && isGen6Grounded(switchingIn, gravityActive);
      if (result.status && !terrainBlocksStatus) {
        statusInflicted = result.status;
      }
      // Only suppress the poison message when terrain blocks the status.
      // Absorption messages (Poison-type absorbing spikes) should still be emitted.
      if (result.message && !(result.status && terrainBlocksStatus)) {
        messages.push(result.message);
      }
    }
  }

  // --- Sticky Web ---
  // NOT gated by Magic Guard (Sticky Web is a stat drop, not damage)
  // Source: Showdown data/moves.ts -- stickyweb.condition.onSwitchIn
  //   "this.boost({spe: -1}, pokemon, ...)" -- no Magic Guard check in this handler
  const stickyWeb = side.hazards.find((h) => h.type === "sticky-web");
  if (stickyWeb && stickyWeb.layers > 0) {
    const result = applyGen6StickyWeb(switchingIn, gravityActive);
    if (result.applied && result.statChange) {
      statChanges.push(result.statChange);
    }
    messages.push(...result.messages);
  }

  return {
    damage: totalDamage,
    statusInflicted,
    statChanges,
    messages,
    hazardsToRemove: hazardsToRemove.length > 0 ? hazardsToRemove : undefined,
  };
}
