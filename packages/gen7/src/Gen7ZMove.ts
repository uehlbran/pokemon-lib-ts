/**
 * Gen 7 Z-Move BattleGimmick implementation.
 *
 * Z-Moves are a once-per-battle mechanic introduced in Generation 7 (Sun/Moon).
 * A Pokemon holding a Z-Crystal can convert one of its moves into a Z-Move variant:
 *   - Damaging moves become type-specific Z-Moves with boosted power
 *   - Status moves keep their original effect and gain a Z-Power bonus effect
 *
 * Z-Moves coexist with Mega Evolution in Gen 7 -- a team CAN use both in the same
 * battle (different Pokemon). The restriction is per-item: a Pokemon holds either a
 * Mega Stone or a Z-Crystal, not both.
 *
 * Source: Showdown sim/battle-actions.ts -- canZMove, getZMove, getActiveZMove
 * Source: Showdown sim/side.ts -- zMoveUsed tracking (separate from mega)
 * Source: Bulbapedia "Z-Move" -- https://bulbapedia.bulbagarden.net/wiki/Z-Move
 */

import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";
import { CORE_MOVE_CATEGORIES } from "@pokemon-lib-ts/core";

import { getSpeciesZMoves, getZCrystalType, isSpeciesZCrystal, isZCrystal } from "./Gen7Items.js";

// ═══════════════════════════════════════════════════════════════════════════
// Z-Move Power Table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Per-move Z-Move base power overrides.
 *
 * These moves have explicit zMove.basePower entries in Showdown data/moves.ts
 * that differ from what the standard threshold table would compute. The overrides
 * are authoritative: they reflect adjustments made in the game data for moves
 * with variable power, fixed multi-hit, or special mechanics.
 *
 * Source: Showdown data/moves.ts — per-move zMove.basePower fields
 * Verified via @pkmn/data oracle (compare-gimmicks.ts).
 */
const Z_MOVE_POWER_OVERRIDES: Readonly<Record<string, number>> = {
  // ── Fixed-BP moves with Showdown-adjusted Z power ─────────────────────────
  "core-enforcer": 140, // formula gives 180 (100 BP); Showdown override: 140
  "double-hit": 140, // formula gives 100 (35 BP, fixed 2-hit); Showdown override: 140
  "flying-press": 170, // formula gives 180 (100 BP); Showdown override: 170
  "gear-grind": 180, // formula gives 100 (50 BP, fixed 2-hit); Showdown override: 180
  hex: 160, // formula gives 120 (65 BP); Showdown override: 160 (reflects doubled power vs status)
  "lands-wrath": 185, // formula gives 175 (90 BP); Showdown override: 185
  "mega-drain": 120, // formula gives 100 (40 BP); Showdown override: 120
  "multi-attack": 185, // formula gives 185 (120 BP in Gen 7); Showdown override: 185
  "thousand-arrows": 180, // formula gives 175 (90 BP); Showdown override: 180
  "triple-kick": 120, // formula gives 100 (10 BP, fixed 3-hit); Showdown override: 120
  "v-create": 220, // formula gives 200 (180 BP); Showdown override: 220
  // ── Variable-power / special-case moves — formula gives wrong value; Showdown overrides ─
  // Moves with power: null (null-BP) compute basePower=0, so formula returns 100.
  // power-trip, stored-power, weather-ball have stored BP but use basePowerCallback in Showdown.
  // Source: Showdown data/moves.ts — per-move zMove.basePower fields
  // Source: @pkmn/data oracle (compare-gimmicks.ts buildZMovePowerChecks)
  "crush-grip": 190, // null BP (HP-scaled); Showdown override: 190
  "electro-ball": 160, // null BP (speed-ratio); Showdown override: 160
  endeavor: 160, // null BP (HP-delta); Showdown override: 160
  "final-gambit": 180, // null BP (user HP); Showdown override: 180
  fissure: 180, // null BP (OHKO); Showdown override: 180
  flail: 160, // null BP (low HP); Showdown override: 160
  frustration: 160, // null BP (low friendship); Showdown override: 160
  "grass-knot": 160, // null BP (target weight); Showdown override: 160
  guillotine: 180, // null BP (OHKO); Showdown override: 180
  "gyro-ball": 160, // null BP (speed ratio); Showdown override: 160
  "heat-crash": 160, // null BP (weight ratio); Showdown override: 160
  "heavy-slam": 160, // null BP (weight ratio); Showdown override: 160
  "horn-drill": 180, // null BP (OHKO); Showdown override: 180
  "low-kick": 160, // null BP (target weight); Showdown override: 160
  magnitude: 140, // null BP (random magnitude); Showdown override: 140
  "natural-gift": 160, // null BP (berry type); Showdown override: 160
  punishment: 160, // null BP (target boosts); Showdown override: 160
  "power-trip": 160, // 20 BP stored, basePowerCallback (user boosts); formula gives 100; Showdown override: 160
  return: 160, // null BP (high friendship); Showdown override: 160
  reversal: 160, // null BP (low HP); Showdown override: 160
  "sheer-cold": 180, // null BP (OHKO); Showdown override: 180
  "stored-power": 160, // 20 BP stored, basePowerCallback (user boosts); formula gives 100; Showdown override: 160
  "trump-card": 160, // null BP (remaining PP); Showdown override: 160
  "weather-ball": 160, // 50 BP stored, basePowerCallback (weather type); formula gives 100; Showdown override: 160
  "wring-out": 190, // null BP (HP-scaled); Showdown override: 190
};

/**
 * Calculate the Z-Move base power for a damaging move.
 *
 * Checks per-move overrides first (for moves with explicit zMove.basePower in
 * Showdown data). Falls back to the standard descending-threshold table:
 *   basePower >= 140 -> 200
 *   basePower >= 130 -> 195
 *   basePower >= 120 -> 190
 *   basePower >= 110 -> 185
 *   basePower >= 100 -> 180
 *   basePower >= 90  -> 175
 *   basePower >= 80  -> 160
 *   basePower >= 70  -> 140
 *   basePower >= 60  -> 120
 *   else             -> 100
 *   no base power    -> 100
 *
 * Variable multi-hit moves (min != max range, e.g. Bullet Seed 2–5):
 *   basePower *= 3 before the threshold lookup.
 * Fixed multi-hit moves (scalar count, e.g. Double Kick always 2×):
 *   NO multiplication — Showdown only multiplies for Array.isArray(multihit).
 *
 * Source: Showdown sim/dex-moves.ts:551-577 -- Z-Move power calculation
 * Source: Showdown data/moves.ts -- per-move zMove.basePower overrides
 */
export function getZMovePower(move: MoveData): number {
  // Status moves do not have Z-Move power
  if (move.category === CORE_MOVE_CATEGORIES.status) return 0;

  // Per-move override: some moves have explicit zMove.basePower in Showdown data/moves.ts.
  const override = Z_MOVE_POWER_OVERRIDES[move.id];
  if (override !== undefined) return override;

  let basePower = move.power ?? 0;

  // Only variable multi-hit (min !== max range) multiplies basePower by 3.
  // Fixed multi-hit moves (scalar multihit, min === max) do NOT multiply.
  // Source: Showdown sim/dex-moves.ts:554 -- `if (Array.isArray(data.multihit)) basePower *= 3;`
  // Array.isArray is true only for the [min, max] range form, not scalar fixed counts.
  const effect = move.effect;
  if (effect?.type === "multi-hit" && effect.min !== effect.max) {
    basePower *= 3;
  }

  if (!basePower) return 100;
  if (basePower >= 140) return 200;
  if (basePower >= 130) return 195;
  if (basePower >= 120) return 190;
  if (basePower >= 110) return 185;
  if (basePower >= 100) return 180;
  if (basePower >= 90) return 175;
  if (basePower >= 80) return 160;
  if (basePower >= 70) return 140;
  if (basePower >= 60) return 120;
  return 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// Type-Specific Z-Move Names
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Named Z-Move for each type. When a damaging move is converted to a Z-Move,
 * the Z-Move name is determined by the base move's type.
 *
 * Source: Showdown sim/battle-actions.ts:31-50 -- Z_MOVES constant
 */
const Z_MOVE_NAMES: Readonly<Record<string, string>> = {
  normal: "breakneck-blitz",
  fighting: "all-out-pummeling",
  flying: "supersonic-skystrike",
  poison: "acid-downpour",
  ground: "tectonic-rage",
  rock: "continental-crush",
  bug: "savage-spin-out",
  ghost: "never-ending-nightmare",
  steel: "corkscrew-crash",
  fire: "inferno-overdrive",
  water: "hydro-vortex",
  grass: "bloom-doom",
  electric: "gigavolt-havoc",
  psychic: "shattered-psyche",
  ice: "subzero-slammer",
  dragon: "devastating-drake",
  dark: "black-hole-eclipse",
  fairy: "twinkle-tackle",
};

/**
 * Get the named Z-Move for a given type.
 *
 * Source: Showdown sim/battle-actions.ts:31-50
 */
export function getZMoveName(type: string): string {
  return Z_MOVE_NAMES[type] ?? "breakneck-blitz";
}

// ═══════════════════════════════════════════════════════════════════════════
// Species-Specific Z-Move Data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps species Z-Crystal item IDs to the signature base move they require.
 * If the Pokemon knows the signature move AND holds the species Z-Crystal,
 * it can use the species-specific Z-Move (obtained from Gen7Items.getSpeciesZMoves()).
 *
 * Source: Showdown data/items.ts -- species Z-Crystal entries (zMoveFrom field)
 */
const SPECIES_Z_BASE_MOVES: Readonly<Record<string, string>> = {
  "pikanium-z": "volt-tackle",
  "pikashunium-z": "thunderbolt",
  "aloraichium-z": "thunderbolt",
  "snorlium-z": "giga-impact",
  "mewnium-z": "psychic",
  "decidium-z": "spirit-shackle",
  "incinium-z": "darkest-lariat",
  "primarium-z": "sparkling-aria",
  "tapunium-z": "natures-madness",
  "marshadium-z": "spectral-thief",
  "kommonium-z": "clanging-scales",
  "lycanium-z": "stone-edge",
  "mimikium-z": "play-rough",
  "lunalium-z": "moongeist-beam",
  "solganium-z": "sunsteel-strike",
  "ultranecrozium-z": "photon-geyser",
  "eevium-z": "last-resort",
};

/**
 * Species-specific Z-Move power values. These are fixed and do not use the
 * standard power table.
 *
 * Source: Showdown data/moves.ts -- individual Z-Move entries (basePower)
 * Source: Bulbapedia -- species-specific Z-Move base power values
 */
const SPECIES_Z_POWER: Readonly<Record<string, number>> = {
  catastropika: 210,
  "10000000-volt-thunderbolt": 195,
  "stoked-sparksurfer": 175,
  "pulverizing-pancake": 210,
  "genesis-supernova": 185,
  "sinister-arrow-raid": 180,
  "malicious-moonsault": 180,
  "oceanic-operetta": 195,
  "guardian-of-alola": 0, // Fixed-damage: 75% of target's current HP
  "soul-stealing-7-star-strike": 195,
  "clangorous-soulblaze": 185,
  "splintered-stormshards": 190,
  "lets-snuggle-forever": 190,
  "menacing-moonraze-maelstrom": 200,
  "searing-sunraze-smash": 200,
  "light-that-burns-the-sky": 200,
  "extreme-evoboost": 0, // Status Z-Move: +2 all stats
};

/**
 * Get the base move required for a species-specific Z-Crystal.
 * Returns null if the item is not a species-specific Z-Crystal.
 *
 * Source: Showdown data/items.ts -- zMoveFrom field on species Z-Crystal items
 */
export function getSpeciesZBaseMove(zCrystalId: string): string | null {
  return SPECIES_Z_BASE_MOVES[zCrystalId] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove BattleGimmick
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gen 7 Z-Move BattleGimmick implementation.
 *
 * Implements the BattleGimmick interface for Z-Moves. Z-Moves are once per team
 * per battle. Tracking is done internally via `usedBySide` rather than via
 * `side.gimmickUsed`, because Gen 7 allows both Mega Evolution and Z-Moves
 * in the same battle (different Pokemon, different gimmick slots).
 *
 * Source: Showdown sim/side.ts:170 -- zMoveUsed: boolean (separate from mega)
 * Source: Showdown sim/battle-actions.ts:1401-1448 -- getZMove, getActiveZMove
 */
export class Gen7ZMove implements BattleGimmick {
  readonly name = "Z-Move";
  readonly generations = [7] as const;

  /**
   * Tracks which sides have already used their Z-Move this battle.
   * Gen 7 tracks Z-Move usage separately from Mega Evolution usage
   * (side.zMoveUsed in Showdown vs side.megaUsed).
   *
   * Source: Showdown sim/side.ts:170 -- zMoveUsed is per-side, separate from mega
   */
  private readonly usedBySide: Set<0 | 1> = new Set();

  /**
   * Returns true if the Z-Move gimmick can be activated for the given Pokemon.
   *
   * Conditions (all must be true):
   *   1. This side has not yet used a Z-Move this battle
   *   2. The Pokemon holds a Z-Crystal
   *   3. The Pokemon has at least one move compatible with the Z-Crystal
   *   4. The Pokemon is not transformed into a Mega/Primal/Ultra form
   *
   * Source: Showdown sim/battle-actions.ts:1450-1481 -- canZMove
   * Source: Showdown sim/battle-actions.ts:1401-1423 -- getZMove checks
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    // 1. Z-Move not already used this battle for this side
    if (this.usedBySide.has(side.index)) return false;

    // Source: Showdown sim/battle-actions.ts:1452-1454 -- transformed mega/primal/ultra block
    if (pokemon.transformed && pokemon.isMega) {
      return false;
    }

    const heldItem = pokemon.pokemon.heldItem;
    if (!heldItem) return false;

    // 2. The Pokemon must hold a Z-Crystal
    if (!isZCrystal(heldItem)) return false;

    // 3. Check if at least one move is compatible with this Z-Crystal
    // For species-specific Z-Crystals: needs the specific signature move
    // For type-specific Z-Crystals: we check in modifyMove (MoveSlot doesn't carry type)
    //
    // Note: MoveSlot only has moveId, not the move's type. Full type-matching validation
    // happens in modifyMove() where the engine passes the actual MoveData. Here we do
    // the best check possible with available data.
    if (isSpeciesZCrystal(heldItem)) {
      const requiredMove = SPECIES_Z_BASE_MOVES[heldItem];
      if (!requiredMove) return false;
      const hasRequiredMove = pokemon.pokemon.moves.some((m) => m.moveId === requiredMove);
      return hasRequiredMove;
    }

    // For type-specific Z-Crystals: verify the crystal type is valid.
    // The actual move-type matching is done in modifyMove() since MoveSlot
    // doesn't carry the move's type (only moveId).
    // Source: Showdown sim/battle-actions.ts:1456 -- `if (!item.zMove) return;`
    const zType = getZCrystalType(heldItem);
    return zType !== null;
  }

  /**
   * Activates the Z-Move gimmick for the given Pokemon.
   * Marks this side as having used its Z-Move and emits a ZMoveEvent.
   *
   * Note: We do NOT set side.gimmickUsed here because Gen 7 allows both
   * Mega Evolution and Z-Moves in the same battle (tracked separately).
   *
   * Source: Showdown sim/side.ts:233 -- zMoveUsed = false (initialized)
   * Source: Showdown sim/battle.ts:2626-2631 -- Z-Move activation in runAction
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    this.usedBySide.add(side.index);

    const pokemonId = pokemon.pokemon.uid;

    // Determine the Z-Move name for the event
    const heldItem = pokemon.pokemon.heldItem;
    let zMoveName = "z-move";
    if (heldItem && isSpeciesZCrystal(heldItem)) {
      const speciesZMoves = getSpeciesZMoves();
      zMoveName = speciesZMoves[heldItem] ?? "z-move";
    } else if (heldItem) {
      const zType = getZCrystalType(heldItem);
      if (zType) {
        zMoveName = getZMoveName(zType);
      }
    }

    const event: BattleEvent = {
      type: "z-move",
      side: side.index,
      pokemon: pokemonId,
      move: zMoveName,
    };

    return [event];
  }

  /**
   * Transforms the base move into its Z-Move variant.
   *
   * For damaging moves:
   *   - Power is set via the Z-Move power table (or species-specific power)
   *   - Category (physical/special) is preserved from the base move
   *   - Priority is preserved from the base move (for Quick Guard)
   *   - Name becomes the type-specific Z-Move name (or species-specific name)
   *
   * For status moves:
   *   - The original move is preserved (effects still fire)
   *   - A Z-Power bonus effect is noted via zMoveEffect
   *   - Name is prefixed with "Z-"
   *
   * Source: Showdown sim/battle-actions.ts:1425-1448 -- getActiveZMove
   * Source: Showdown sim/dex-moves.ts:551-577 -- Z-Move power calculation
   */
  modifyMove(move: MoveData, pokemon: ActivePokemon): MoveData {
    const heldItem = pokemon.pokemon.heldItem;
    if (!heldItem || !isZCrystal(heldItem)) return move;

    // Check for species-specific Z-Crystal
    if (isSpeciesZCrystal(heldItem)) {
      const requiredMove = SPECIES_Z_BASE_MOVES[heldItem];
      if (requiredMove && move.id === requiredMove) {
        return this.getSpeciesZMove(move, heldItem);
      }
      // If the move doesn't match the species Z-Crystal's required move, no transform
      return move;
    }

    // Type-specific Z-Crystal
    const zType = getZCrystalType(heldItem);
    if (!zType || move.type !== zType) return move;

    if (move.category === CORE_MOVE_CATEGORIES.status) {
      return this.getStatusZMove(move);
    }

    return this.getDamagingZMove(move);
  }

  /**
   * Reset Z-Move tracking (for new battle).
   * Called when a new battle starts to clear the used-by-side tracking.
   */
  reset(): void {
    this.usedBySide.clear();
  }

  serializeState(): { usedBySide: Array<0 | 1> } {
    return { usedBySide: [...this.usedBySide] };
  }

  restoreState(state: unknown): void {
    this.usedBySide.clear();

    if (!state || typeof state !== "object" || !("usedBySide" in state)) {
      return;
    }

    const usedBySide = (state as { usedBySide?: unknown }).usedBySide;
    if (!Array.isArray(usedBySide)) {
      return;
    }

    for (const sideIndex of usedBySide) {
      if (sideIndex === 0 || sideIndex === 1) {
        this.usedBySide.add(sideIndex);
      }
    }
  }

  /**
   * Check if a side has already used its Z-Move.
   * Exposed for testing and external validation.
   */
  hasUsedZMove(sideIndex: 0 | 1): boolean {
    return this.usedBySide.has(sideIndex);
  }

  /**
   * Mark a side's Z-Move as used without going through activate().
   * Used by Gen7UltraBurst.activate() to consume the Z-Crystal as part of
   * Ultra Burst activation — Ultra Necrozma's Z-Move fires in the same action.
   *
   * Source: Bulbapedia "Ultra Burst" -- "Necrozma can use Light That Burns the Sky
   *   after undergoing Ultra Burst; this consumes the Ultranecrozium Z."
   */
  markUsed(sideIndex: 0 | 1): void {
    this.usedBySide.add(sideIndex);
  }

  // --- Private helpers ---

  /**
   * Convert a damaging move to a type-specific Z-Move.
   *
   * Source: Showdown sim/battle-actions.ts:1441-1447
   */
  private getDamagingZMove(move: MoveData): MoveData {
    const zPower = getZMovePower(move);
    const zMoveId = getZMoveName(move.type);

    return {
      ...move,
      id: zMoveId,
      displayName: formatZMoveName(zMoveId),
      power: zPower,
      // Category and priority are preserved from the base move
      // Source: Showdown sim/battle-actions.ts:1443-1445
      // Z-Moves never miss (accuracy is bypassed)
      accuracy: null,
      zMovePower: zPower,
    };
  }

  /**
   * Convert a status move to a Z-Move variant.
   * The original move's effect is preserved; the Z-Power bonus is signaled
   * via the zMoveEffect field.
   *
   * Source: Showdown sim/battle-actions.ts:1435-1439
   */
  private getStatusZMove(move: MoveData): MoveData {
    return {
      ...move,
      // Keep original ID so the engine executes the original effect
      displayName: `Z-${move.displayName}`,
      // The zMoveEffect signals the bonus effect to the move effect handler
      zMoveEffect: move.zMoveEffect ?? undefined,
      zMovePower: 0,
    };
  }

  /**
   * Convert a move to a species-specific Z-Move.
   *
   * Source: Showdown sim/battle-actions.ts:1425-1433
   */
  private getSpeciesZMove(move: MoveData, zCrystalId: string): MoveData {
    const speciesZMoves = getSpeciesZMoves();
    const zMoveId = speciesZMoves[zCrystalId] ?? move.id;
    const zPower = SPECIES_Z_POWER[zMoveId] ?? getZMovePower(move);

    // Status-type species Z-Moves (like Extreme Evoboost from Eevium Z)
    if (move.category === CORE_MOVE_CATEGORIES.status) {
      return {
        ...move,
        id: zMoveId,
        displayName: formatZMoveName(zMoveId),
        accuracy: null,
        zMoveEffect: move.zMoveEffect ?? undefined,
        zMovePower: 0,
      };
    }

    return {
      ...move,
      id: zMoveId,
      displayName: formatZMoveName(zMoveId),
      power: zPower,
      accuracy: null,
      zMovePower: zPower,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a Z-Move ID into a display name.
 * Converts kebab-case to Title Case (e.g., "gigavolt-havoc" -> "Gigavolt Havoc").
 */
function formatZMoveName(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
