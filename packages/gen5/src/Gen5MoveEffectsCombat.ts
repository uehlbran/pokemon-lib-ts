/**
 * Gen 5 new combat move effect handlers.
 *
 * Handles Gen 5 combat moves that need special logic beyond data-driven effects.
 * Called from the Gen5 move effect dispatcher as a secondary handler for moves
 * that this file recognizes.
 *
 * Moves implemented:
 *   - Explosion / Self-Destruct: selfFaint only (Gen 5 removed the defense-halving)
 *   - Dragon Tail / Circle Throw: -6 priority force-switch (priority is in move data)
 *   - Acrobatics: 110 BP when no held item, 55 BP with item
 *   - Final Gambit: user faints, deals damage equal to user's remaining HP
 *   - Foul Play: uses target's Attack stat (signaled via message; actual stat swap in damage calc)
 *   - Retaliate: 140 BP if ally fainted last turn, 70 BP otherwise
 *   - Shell Smash: +2 Atk/SpAtk/Speed, -1 Def/SpDef
 *   - Coil: +1 Atk/Def/Accuracy
 *   - Quiver Dance: +1 SpAtk/SpDef/Speed
 *   - Flame Charge: +1 Speed after dealing damage
 *   - Work Up: +1 Atk/SpAtk
 *   - Hone Claws: +1 Atk/Accuracy
 *   - Bulk Up: +1 Atk/Def
 *   - Calm Mind: +1 SpAtk/SpDef
 *   - Electro Ball: variable BP based on user/target speed ratio
 *   - Gyro Ball: variable BP based on target/user speed ratio
 *   - Heat Crash / Heavy Slam: variable BP based on weight ratio
 *   - Low Sweep: -1 Speed to target (handled by data; included for completeness)
 *   - Smack Down: grounds target, removes flying/levitate effects
 *   - Storm Throw / Frost Breath: always critical hit (willCrit in data; included for completeness)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 */

import type {
  ActivePokemon,
  BattleState,
  MoveEffectContext,
  MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import type { BattleStat, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Mutable internal result type used during effect processing.
 * Returned as the readonly MoveEffectResult interface.
 */
type MutableResult = {
  statusInflicted: import("@pokemon-lib-ts/core").PrimaryStatus | null;
  volatileInflicted: VolatileStatus | null;
  statChanges: Array<{ target: "attacker" | "defender"; stat: BattleStat; stages: number }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  forcedSwitch?: boolean;
  messages: string[];
  selfFaint?: boolean;
  customDamage?: {
    target: "attacker" | "defender";
    amount: number;
    source: string;
    type?: PokemonType | null;
  } | null;
  volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
};

// ---------------------------------------------------------------------------
// Helper: empty result
// ---------------------------------------------------------------------------

function emptyResult(): MutableResult {
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
// Speed-based BP helpers
// ---------------------------------------------------------------------------

/**
 * Calculate Electro Ball base power from speed ratio.
 *
 * ratio = floor(userSpeed / targetSpeed)
 *   ratio >= 4 → 150
 *   ratio >= 3 → 120
 *   ratio >= 2 → 80
 *   ratio >= 1 → 60
 *   else       → 40
 *
 * Source: Showdown data/moves.ts -- electroball basePowerCallback
 *   let ratio = Math.floor(pokemon.getStat('spe') / target.getStat('spe'));
 *   const bp = [40, 60, 80, 120, 150][Math.min(ratio, 4)];
 */
export function getElectroBallBP(userSpeed: number, targetSpeed: number): number {
  if (targetSpeed <= 0) return 40;
  const ratio = Math.floor(userSpeed / targetSpeed);
  const bpTable = [40, 60, 80, 120, 150];
  return bpTable[Math.min(ratio, 4)] ?? 150;
}

/**
 * Calculate Gyro Ball base power from speed ratio.
 *
 * power = floor(25 * targetSpeed / userSpeed) + 1, capped at 150.
 *
 * Source: Showdown data/moves.ts -- gyroball basePowerCallback
 *   let power = Math.floor(25 * target.getStat('spe') / pokemon.getStat('spe')) + 1;
 *   if (power > 150) power = 150;
 */
export function getGyroBallBP(userSpeed: number, targetSpeed: number): number {
  if (userSpeed <= 0) return 1;
  const power = Math.floor((25 * targetSpeed) / userSpeed) + 1;
  return Math.min(150, power);
}

/**
 * Calculate Heat Crash / Heavy Slam base power from weight ratio.
 *
 * Source: Showdown data/moves.ts -- heatcrash/heavyslam basePowerCallback
 *   pokemonWeight >= targetWeight * 5 → 120
 *   pokemonWeight >= targetWeight * 4 → 100
 *   pokemonWeight >= targetWeight * 3 → 80
 *   pokemonWeight >= targetWeight * 2 → 60
 *   else → 40
 */
export function getWeightBasedBP(userWeight: number, targetWeight: number): number {
  if (targetWeight <= 0) return 120;
  if (userWeight >= targetWeight * 5) return 120;
  if (userWeight >= targetWeight * 4) return 100;
  if (userWeight >= targetWeight * 3) return 80;
  if (userWeight >= targetWeight * 2) return 60;
  return 40;
}

/**
 * Calculate Acrobatics base power.
 * 110 BP when user has no held item; 55 BP (the nominal base power) otherwise.
 *
 * Source: Showdown data/moves.ts -- acrobatics basePowerCallback
 *   if (!pokemon.item) { this.debug("BP doubled"); return move.basePower * 2; }
 *   return move.basePower;
 *
 * Note: Showdown's nominal BP is 55 and doubles it to 110 when no item.
 */
export function getAcrobaticsBP(hasItem: boolean): number {
  // Source: Showdown data/moves.ts -- Acrobatics: 55 BP * 2 = 110 when no item
  return hasItem ? 55 : 110;
}

/**
 * Calculate Retaliate base power.
 * 140 BP if an ally on the user's side fainted last turn; 70 BP otherwise.
 *
 * Source: Showdown data/moves.ts -- retaliate onBasePower
 *   if (pokemon.side.faintedLastTurn) { return this.chainModify(2); }
 *
 * Note: We check BattleState.turnHistory for faint events on the attacker's side
 * from the previous turn, since BattleSide doesn't track faintedLastTurn directly.
 */
export function getRetaliateBP(allyFaintedLastTurn: boolean): number {
  // Source: Showdown data/moves.ts -- Retaliate: 70 BP * 2 = 140 if ally fainted last turn
  return allyFaintedLastTurn ? 140 : 70;
}

/**
 * Check whether an ally fainted on the previous turn for Retaliate.
 *
 * Scans turnHistory for the immediately previous turn's events looking for
 * faint events on the attacker's side.
 *
 * Source: Showdown data/moves.ts -- retaliate checks pokemon.side.faintedLastTurn
 */
export function didAllyFaintLastTurn(state: BattleState, attacker: ActivePokemon): boolean {
  const attackerSide = state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === attacker.pokemon),
  );
  if (attackerSide < 0) return false;

  // Look at the previous turn's events for faint events on the attacker's side
  const prevTurn = state.turnHistory[state.turnHistory.length - 1];
  if (!prevTurn) return false;

  for (const event of prevTurn.events) {
    if (event.type === "faint" && event.side === attackerSide) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Handle Gen 5 combat move effects.
 *
 * Returns a MoveEffectResult if the move is recognized, or null if it is not
 * a Gen 5 combat move handled by this module (so the caller can fall through
 * to other handlers).
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 */
export function handleGen5CombatMove(ctx: MoveEffectContext): MoveEffectResult | null {
  const moveId = ctx.move.id;
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";

  switch (moveId) {
    // -----------------------------------------------------------------
    // Explosion / Self-Destruct (Gen 5: no defense halving, just selfFaint)
    // Source: Showdown gen5/moves.ts -- inherits from base; no defense halving
    // Source: Bulbapedia -- "Starting in Gen V, Explosion and Self-Destruct
    //   no longer halve the target's Defense."
    // -----------------------------------------------------------------
    case "explosion":
    case "self-destruct": {
      const result = emptyResult();
      result.selfFaint = true;
      result.messages.push(`${attackerName} exploded!`);
      return result;
    }

    // -----------------------------------------------------------------
    // Dragon Tail / Circle Throw: -6 priority forced switch
    // Priority is in move data. Effect: force defender to switch.
    // Fails if the target is behind a substitute (engine handles sub check).
    // Source: Showdown data/moves.ts -- dragontail/circlethrow: forceSwitch: true
    // -----------------------------------------------------------------
    case "dragon-tail":
    case "circle-throw": {
      const result = emptyResult();
      result.switchOut = true;
      result.forcedSwitch = true;
      return result;
    }

    // -----------------------------------------------------------------
    // Final Gambit: user faints, deals damage equal to user's remaining HP
    // Source: Showdown data/moves.ts -- finalgambit:
    //   damageCallback(pokemon) { const damage = pokemon.hp; pokemon.faint(); return damage; }
    //   selfdestruct: "ifHit"
    // -----------------------------------------------------------------
    case "final-gambit": {
      const result = emptyResult();
      const userHp = ctx.attacker.pokemon.currentHp;
      result.selfFaint = true;
      result.customDamage = {
        target: "defender",
        amount: userHp,
        source: "final-gambit",
        type: "fighting",
      };
      result.messages.push(`${attackerName} risked everything in a final gambit!`);
      return result;
    }

    // -----------------------------------------------------------------
    // Foul Play: uses target's Attack stat for damage calculation
    // The actual stat swap happens in the damage calc; here we just signal it.
    // Source: Showdown data/moves.ts -- foulplay: overrideOffensivePokemon: 'target'
    // -----------------------------------------------------------------
    case "foul-play": {
      // Foul Play's unique behavior is in the damage formula (overrideOffensivePokemon).
      // The move effect itself has no secondary effects to apply.
      // Return null to let the default handler process it (no special effect needed).
      return null;
    }

    // -----------------------------------------------------------------
    // Shell Smash: +2 Atk, +2 SpAtk, +2 Speed; -1 Def, -1 SpDef
    // Source: Showdown data/moves.ts -- shellsmash:
    //   boosts: { def: -1, spd: -1, atk: 2, spa: 2, spe: 2 }
    // -----------------------------------------------------------------
    case "shell-smash": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "attack", stages: 2 },
        { target: "attacker", stat: "spAttack", stages: 2 },
        { target: "attacker", stat: "speed", stages: 2 },
        { target: "attacker", stat: "defense", stages: -1 },
        { target: "attacker", stat: "spDefense", stages: -1 },
      );
      result.messages.push(`${attackerName} broke its shell!`);
      return result;
    }

    // -----------------------------------------------------------------
    // Coil: +1 Atk, +1 Def, +1 Accuracy
    // Source: Showdown data/moves.ts -- coil:
    //   boosts: { atk: 1, def: 1, accuracy: 1 }
    // -----------------------------------------------------------------
    case "coil": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "attack", stages: 1 },
        { target: "attacker", stat: "defense", stages: 1 },
        { target: "attacker", stat: "accuracy", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Quiver Dance: +1 SpAtk, +1 SpDef, +1 Speed
    // Source: Showdown data/moves.ts -- quiverdance:
    //   boosts: { spa: 1, spd: 1, spe: 1 }
    // -----------------------------------------------------------------
    case "quiver-dance": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "spAttack", stages: 1 },
        { target: "attacker", stat: "spDefense", stages: 1 },
        { target: "attacker", stat: "speed", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Flame Charge: 50 BP Fire, +1 Speed after use
    // Source: Showdown data/moves.ts -- flamecharge:
    //   secondary: { chance: 100, self: { boosts: { spe: 1 } } }
    // Note: the +1 Speed is a guaranteed secondary self-boost.
    // -----------------------------------------------------------------
    case "flame-charge": {
      const result = emptyResult();
      result.statChanges.push({ target: "attacker", stat: "speed", stages: 1 });
      return result;
    }

    // -----------------------------------------------------------------
    // Work Up: +1 Atk, +1 SpAtk
    // Source: Showdown data/moves.ts -- workout:
    //   boosts: { atk: 1, spa: 1 }
    // -----------------------------------------------------------------
    case "work-up": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "attack", stages: 1 },
        { target: "attacker", stat: "spAttack", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Hone Claws: +1 Atk, +1 Accuracy
    // Source: Showdown data/moves.ts -- honeclaws:
    //   boosts: { atk: 1, accuracy: 1 }
    // -----------------------------------------------------------------
    case "hone-claws": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "attack", stages: 1 },
        { target: "attacker", stat: "accuracy", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Bulk Up: +1 Atk, +1 Def (Gen 3 carry-over)
    // Source: Showdown data/moves.ts -- bulkup:
    //   boosts: { atk: 1, def: 1 }
    // -----------------------------------------------------------------
    case "bulk-up": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "attack", stages: 1 },
        { target: "attacker", stat: "defense", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Calm Mind: +1 SpAtk, +1 SpDef (Gen 3 carry-over)
    // Source: Showdown data/moves.ts -- calmmind:
    //   boosts: { spa: 1, spd: 1 }
    // -----------------------------------------------------------------
    case "calm-mind": {
      const result = emptyResult();
      result.statChanges.push(
        { target: "attacker", stat: "spAttack", stages: 1 },
        { target: "attacker", stat: "spDefense", stages: 1 },
      );
      return result;
    }

    // -----------------------------------------------------------------
    // Smack Down: grounds the target, removes flying/levitate effects
    // Source: Showdown data/moves.ts -- smackdown:
    //   volatileStatus: 'smackdown'
    //   condition.onStart: removes Fly/Bounce volatiles, Magnet Rise, Telekinesis
    // -----------------------------------------------------------------
    case "smack-down": {
      const result = emptyResult();
      result.volatileInflicted = "smackdown" as VolatileStatus;
      result.messages.push(`${ctx.defender.pokemon.nickname ?? "The foe"} fell straight down!`);
      return result;
    }

    // -----------------------------------------------------------------
    // Low Sweep: 60 BP, -1 Speed to target (data-driven; handled here for completeness)
    // Source: Showdown data/moves.ts -- lowsweep:
    //   secondary: { chance: 100, boosts: { spe: -1 } }
    // -----------------------------------------------------------------
    case "low-sweep": {
      const result = emptyResult();
      result.statChanges.push({ target: "defender", stat: "speed", stages: -1 });
      return result;
    }

    // -----------------------------------------------------------------
    // Storm Throw / Frost Breath: always crit (willCrit in move data)
    // No special effect handler needed -- the crit logic is in the damage calc.
    // These are included to ensure they don't accidentally fall through to a
    // generic handler that might override their behavior.
    // Source: Showdown data/moves.ts -- stormthrow/frostbreath: willCrit: true
    // -----------------------------------------------------------------
    case "storm-throw":
    case "frost-breath":
      return null;

    default:
      return null;
  }
}
