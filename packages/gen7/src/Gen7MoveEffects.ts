/**
 * Gen 7 move effect handlers.
 *
 * Implements Gen 7-specific moves:
 *   - Aurora Veil: Hail-only screen, halves damage from both physical and special
 *     moves. Lasts 5 turns (8 with Light Clay). Does not stack with Reflect/Light Screen.
 *
 * Additional Gen 7 move effects (Baneful Bunker, Z-Moves, etc.) will be added
 * in later waves.
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: Bulbapedia -- Aurora Veil
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";

// ---------------------------------------------------------------------------
// Default empty result
// ---------------------------------------------------------------------------

function createBaseResult(): MoveEffectResult {
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

// ---------------------------------------------------------------------------
// Aurora Veil
// ---------------------------------------------------------------------------

/**
 * Default duration for Aurora Veil (5 turns).
 *
 * Source: Showdown data/moves.ts -- auroraveil: sideCondition, duration: 5
 * Source: Bulbapedia -- "Aurora Veil lasts for five turns"
 */
export const AURORA_VEIL_DEFAULT_TURNS = 5;

/**
 * Extended duration for Aurora Veil with Light Clay (8 turns).
 *
 * Source: Showdown data/items.ts -- lightclay: extends screen duration by 3
 * Source: Bulbapedia -- "Light Clay extends Aurora Veil to 8 turns"
 */
export const AURORA_VEIL_LIGHT_CLAY_TURNS = 8;

/**
 * Handle Aurora Veil move effect.
 *
 * Aurora Veil is an Ice-type status move introduced in Gen 7.
 * It can ONLY be used during Hail weather -- the move fails otherwise.
 * When active, it halves damage from both physical and special moves
 * (like having both Reflect and Light Screen at once).
 *
 * Key mechanics:
 *   - Fails if weather is not Hail
 *   - Lasts 5 turns (8 with Light Clay)
 *   - Does NOT stack with Reflect/Light Screen (their effects don't apply additionally)
 *   - Bypassed by critical hits
 *   - Removed by Brick Break, Defog, Psychic Fangs
 *   - Sets the "aurora-veil" screen on the user's side
 *
 * Source: Showdown data/moves.ts -- auroraveil:
 *   onTry(source) { return source.effectiveWeather() === 'hail'; }
 *   sideCondition: 'auroraveil', condition: { duration: 5 }
 *   onAnyModifyDamage: if (!crit) return this.chainModify(0.5); (singles)
 * Source: Bulbapedia -- Aurora Veil: "This move can only be used during hail...
 *   Reduces damage taken from physical and special moves by half"
 */
export function handleAuroraVeil(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  // Aurora Veil fails if weather is not Hail
  // Source: Showdown data/moves.ts -- onTry: source.effectiveWeather() === 'hail'
  if (!ctx.state.weather || ctx.state.weather.type !== "hail") {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Check if Aurora Veil is already active on the user's side
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );
  if (attackerSideIndex >= 0) {
    const attackerSide = ctx.state.sides[attackerSideIndex];
    if (attackerSide?.screens.some((s) => s.type === "aurora-veil")) {
      return {
        ...base,
        messages: ["But it failed!"],
      };
    }
  }

  // Light Clay extends screen duration from 5 to 8 turns
  // Source: Showdown data/items.ts -- lightclay: extends screen duration
  const turns =
    ctx.attacker.pokemon.heldItem === "light-clay"
      ? AURORA_VEIL_LIGHT_CLAY_TURNS
      : AURORA_VEIL_DEFAULT_TURNS;

  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";

  return {
    ...base,
    screenSet: { screen: "aurora-veil", turnsLeft: turns, side: "attacker" },
    messages: [
      `Aurora Veil made ${attackerName}'s team stronger against physical and special moves!`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 7 move effects.
 *
 * Currently handles:
 *   - Aurora Veil (Hail-only dual screen)
 *
 * Returns null if the move is not a recognized Gen 7 move effect,
 * allowing the caller to fall through to Gen 6 / BaseRuleset handlers.
 *
 * Source: references/pokemon-showdown/data/moves.ts
 */
export function executeGen7MoveEffect(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "aurora-veil":
      return handleAuroraVeil(ctx);
    default:
      return null;
  }
}
