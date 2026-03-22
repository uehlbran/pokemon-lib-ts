/**
 * Gen 2 Move Effect Handlers
 *
 * Implements all data-driven and custom move effect execution for Gen 2
 * (Gold/Silver/Crystal).
 *
 * Key Gen 2 characteristics:
 *   - No abilities
 *   - Held items (type-boosting, berries, Leftovers)
 *   - Weather (Rain Dance, Sunny Day, Sandstorm)
 *   - Screens: Reflect and Light Screen last 5 turns
 *   - Safeguard protects the user's side from status for 5 turns
 *
 * Source: pret/pokecrystal engine/battle/effect_commands.asm
 */

import type { MoveEffectContext } from "@pokemon-lib-ts/battle";
import type {
  BattleStat,
  EntryHazardType,
  MoveData,
  MoveEffect,
  PokemonType,
  PrimaryStatus,
  ScreenType,
  SeededRandom,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import { canInflictGen2Status } from "./Gen2Status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Mutable internal result type used during effect processing.
 * Returned as the readonly MoveEffectResult interface.
 */
export type MutableResult = {
  statusInflicted: PrimaryStatus | null;
  volatileInflicted: VolatileStatus | null;
  statChanges: Array<{ target: "attacker" | "defender"; stat: BattleStat; stages: number }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  batonPass?: boolean;
  forcedSwitch?: boolean;
  messages: string[];
  weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
  clearSideHazards?: "attacker" | "defender";
  itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
  selfFaint?: boolean;
  customDamage?: {
    target: "attacker" | "defender";
    amount: number;
    source: string;
  } | null;
  screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
  noRecharge?: boolean;
  statusCuredOnly?: { target: "attacker" | "defender" | "both" } | null;
  selfStatusInflicted?: PrimaryStatus | null;
  selfVolatileInflicted?: VolatileStatus | null;
  selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  futureAttack?: { moveId: string; turnsLeft: number; sourceSide: 0 | 1 } | null;
  forcedMoveSet?: {
    moveIndex: number;
    moveId: string;
    volatileStatus: VolatileStatus;
  } | null;
  statStagesReset?: { target: "attacker" | "defender" | "both" } | null;
  screensCleared?: "attacker" | "defender" | "both" | null;
  statusCured?: { target: "attacker" | "defender" | "both" } | null;
  typeChange?: { target: "attacker" | "defender"; types: readonly PokemonType[] } | null;
  /**
   * Number of additional hits beyond the first for multi-hit moves.
   * E.g., multiHitCount=2 means 2 more hits after the initial one, for 3 total.
   */
  multiHitCount?: number | null;
  /**
   * Move ID to execute immediately after this move resolves (Sleep Talk, Metronome).
   * No PP is deducted for the recursive move.
   */
  recursiveMove?: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Moves that cannot be called by Sleep Talk in Gen 2.
 * Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
 * Includes Sleep Talk itself, two-turn charge moves, and Bide.
 */
const SLEEP_TALK_BANNED_MOVES: ReadonlySet<string> = new Set([
  "sleep-talk",
  "bide",
  "skull-bash",
  "razor-wind",
  "sky-attack",
  "solar-beam",
  "fly",
  "dig",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Roll for a secondary effect chance on the 0-255 scale.
 * Even a 100% chance has a 1/256 failure rate (effectChance = 255, roll can equal 255).
 */
export function rollEffectChance(chance: number, rng: SeededRandom): boolean {
  const effectChance = Math.floor((chance * 255) / 100);
  return rng.int(0, 255) < effectChance;
}

// ---------------------------------------------------------------------------
// Data-Driven Effect Application
// ---------------------------------------------------------------------------

/**
 * Apply a data-driven move effect to the mutable result object.
 *
 * Handles all effect types from the MoveEffect discriminated union in core.
 * Custom effects are delegated to handleCustomEffect().
 */
export function applyMoveEffect(
  effect: NonNullable<MoveData["effect"]>,
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender, damage, rng } = context;

  switch (effect.type) {
    case "status-chance": {
      // Roll for status infliction on 0-255 scale (1/256 failure rate even at 100%)
      if (rollEffectChance(effect.chance, rng)) {
        if (!defender.pokemon.status) {
          if (canInflictGen2Status(effect.status, defender, context.state)) {
            result.statusInflicted = effect.status;
          }
        }
      }
      break;
    }

    case "status-guaranteed": {
      if (!defender.pokemon.status) {
        // Source: pret/pokecrystal engine/battle/core.asm CheckSafeguard
        // Safeguard blocks ALL primary status infliction, including guaranteed-status moves
        if (canInflictGen2Status(effect.status, defender, context.state)) {
          result.statusInflicted = effect.status;
        }
      }
      break;
    }

    case "stat-change": {
      // Check if the stat change has a chance component (0-255 scale, 1/256 failure even at 100%)
      // Only apply the secondary-effect roll for damaging moves — status moves (e.g. Swords Dance)
      // have guaranteed primary effects and must never incur the 1/256 failure.
      if (move.category !== "status" && !rollEffectChance(effect.chance, rng)) {
        break;
      }
      for (const change of effect.changes) {
        result.statChanges.push({
          target: effect.target === "self" ? "attacker" : "defender",
          stat: change.stat,
          stages: change.stages,
        });
      }
      break;
    }

    case "recoil": {
      // Recoil damage is a fraction of damage dealt
      result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
      break;
    }

    case "drain": {
      // Drain heals a fraction of damage dealt
      result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
      break;
    }

    case "heal": {
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = Math.max(1, Math.floor(maxHp * effect.amount));
      break;
    }

    case "multi": {
      // Process each sub-effect
      for (const subEffect of effect.effects) {
        applyMoveEffect(subEffect, move, result, context);
      }
      break;
    }

    case "volatile-status": {
      if (move.category !== "status" && !rollEffectChance(effect.chance, rng)) {
        break;
      }
      // Encore and Disable have custom failure conditions and volatile data —
      // delegate to handleCustomEffect which implements their full logic.
      if (effect.status === "encore" || effect.status === "disable") {
        handleCustomEffect(move, result, context);
        break;
      }
      result.volatileInflicted = effect.status;
      break;
    }

    case "weather": {
      result.weatherSet = {
        weather: effect.weather,
        turns: effect.turns ?? 5,
        source: move.id,
      };
      break;
    }

    case "entry-hazard": {
      // Spikes targets the opponent's side
      // In a 1v1, attacker is on one side; target is the other
      // The targetSide is the side that gets the hazard
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
      if (effect.target === "self") {
        // Baton Pass — switch out preserving stat changes and volatile statuses
        // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
        result.switchOut = true;
        if (move.id === "baton-pass") {
          result.batonPass = true;
        }
      }
      break;
    }

    case "protect": {
      // Protect/Detect — handled by engine (sets protect volatile status)
      result.volatileInflicted = "protect";
      break;
    }

    case "screen": {
      // In Gen 2, screens last exactly 5 turns
      // Source: pret/pokecrystal — Reflect and Light Screen last 5 turns
      result.screenSet = {
        screen: effect.screen as ScreenType,
        turnsLeft: 5,
        side: "attacker",
      };
      break;
    }

    case "custom": {
      handleCustomEffect(move, result, context);
      break;
    }

    case "fixed-damage":
    case "level-damage":
    case "ohko":
    case "damage":
      // These are handled by the damage calculation itself
      break;

    case "remove-hazards": {
      // Rapid Spin removes hazards from user's side
      result.messages.push(`${attacker.pokemon.nickname ?? "The Pokemon"} blew away hazards!`);
      break;
    }

    case "terrain":
    case "multi-hit":
    case "two-turn":
      // Handled by the engine or N/A
      break;
  }
}

// ---------------------------------------------------------------------------
// Custom Effect Handlers
// ---------------------------------------------------------------------------

/**
 * Handle custom move effects specific to Gen 2.
 */
export function handleCustomEffect(
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender } = context;
  const pokemonName = attacker.pokemon.nickname ?? "The Pokemon";

  switch (move.id) {
    case "belly-drum": {
      // Lose 50% max HP, maximize Attack to +6
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const halfHp = Math.floor(maxHp / 2);
      if (attacker.pokemon.currentHp > halfHp) {
        result.recoilDamage = halfHp;
        result.statChanges.push({
          target: "attacker",
          stat: "attack",
          stages: 6 - attacker.statStages.attack,
        });
        result.messages.push(`${pokemonName} cut its own HP and maximized Attack!`);
      } else {
        result.messages.push(`${pokemonName} is too weak to use Belly Drum!`);
      }
      break;
    }

    case "rapid-spin": {
      // Remove leech-seed and binding volatiles from user, spikes from user's side
      result.volatilesToClear = [
        { target: "attacker", volatile: "leech-seed" },
        { target: "attacker", volatile: "bound" },
      ];
      result.clearSideHazards = "attacker";
      result.messages.push(`${pokemonName} blew away leech seed and spikes!`);
      break;
    }

    case "mean-look":
    case "spider-web": {
      // Trapping effect — prevents switching
      result.volatileInflicted = "trapped";
      break;
    }

    case "thief": {
      // Steal defender's item if user has no item
      if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
        result.itemTransfer = { from: "defender", to: "attacker" };
        result.messages.push(
          `${pokemonName} stole ${defender.pokemon.nickname ?? "the foe"}'s ${defender.pokemon.heldItem}!`,
        );
      }
      break;
    }

    case "baton-pass": {
      // Switch out preserving stat changes and volatile statuses
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      result.switchOut = true;
      result.batonPass = true;
      break;
    }

    case "encore": {
      // Force target to repeat its last used move for 2-6 turns
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Fails if the defender hasn't used a move yet
      const lastMoveId = defender.lastMoveUsed;
      if (!lastMoveId) {
        result.messages.push("But it failed!");
        break;
      }
      // Find the move index in the defender's moveset
      const moveIndex = defender.pokemon.moves.findIndex((m) => m.moveId === lastMoveId);
      if (moveIndex < 0 || (defender.pokemon.moves[moveIndex]?.currentPP ?? 0) <= 0) {
        result.messages.push("But it failed!");
        break;
      }
      // Encore lasts 2-6 turns in Gen 2
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect duration
      const encoreTurns = context.rng.int(2, 6);
      result.volatileInflicted = "encore";
      result.volatileData = { turnsLeft: encoreTurns, data: { moveIndex } };
      result.messages.push(`${defender.pokemon.nickname ?? "The foe"} got an Encore!`);
      break;
    }

    case "disable": {
      // Disable prevents the target from using its last-used move for 1-7 turns
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect
      // Fails if target has no last move or already disabled
      if (defender.volatileStatuses.has("disable")) {
        result.messages.push("But it failed!");
        break;
      }
      const disableLastMoveId = defender.lastMoveUsed;
      if (!disableLastMoveId) {
        result.messages.push("But it failed!");
        break;
      }
      const disableMoveIndex = defender.pokemon.moves.findIndex(
        (m) => m.moveId === disableLastMoveId,
      );
      if (disableMoveIndex < 0 || (defender.pokemon.moves[disableMoveIndex]?.currentPP ?? 0) <= 0) {
        result.messages.push("But it failed!");
        break;
      }
      // Disable lasts 1-7 turns in Gen 2
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect duration
      const disableTurns = context.rng.int(1, 7);
      result.volatileInflicted = "disable";
      result.volatileData = { turnsLeft: disableTurns, data: { moveId: disableLastMoveId } };
      result.messages.push(
        `${defender.pokemon.nickname ?? "The foe"}'s ${disableLastMoveId} was disabled!`,
      );
      break;
    }

    case "explosion":
    case "self-destruct": {
      result.selfFaint = true;
      result.messages.push(`${pokemonName} exploded!`);
      break;
    }

    case "safeguard": {
      // Safeguard protects the user's side from status conditions for 5 turns
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SafeguardEffect
      result.screenSet = {
        screen: "safeguard",
        turnsLeft: 5,
        side: "attacker",
      };
      result.messages.push(`${pokemonName}'s party is protected by Safeguard!`);
      break;
    }

    case "counter": {
      // Counter reflects 2x the physical damage taken back at the attacker.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // Gen 2: Counter only reflects Normal-type and Fighting-type moves.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:5113-5142
      //   cp NORMAL ; jr z, .counter_physical
      //   cp FIGHTING ; jr nz, .failed
      // This restricts Counter to Normal/Fighting only — NOT all physical moves.
      if (
        attacker.lastDamageTaken <= 0 ||
        attacker.lastDamageCategory !== "physical" ||
        (attacker.lastDamageType !== "normal" && attacker.lastDamageType !== "fighting")
      ) {
        result.messages.push("But it failed!");
        break;
      }
      result.customDamage = {
        target: "defender",
        amount: attacker.lastDamageTaken * 2,
        source: "counter",
      };
      break;
    }

    case "mirror-coat": {
      // Mirror Coat reflects 2x the special damage taken back at the attacker.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_MirrorCoat
      // Mirror Coat is -1 priority (handled by move data).
      if (attacker.lastDamageTaken <= 0 || attacker.lastDamageCategory !== "special") {
        result.messages.push("But it failed!");
        break;
      }
      result.customDamage = {
        target: "defender",
        amount: attacker.lastDamageTaken * 2,
        source: "mirror-coat",
      };
      break;
    }

    case "whirlwind":
    case "roar": {
      // Force the opponent to switch to a random party member.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Whirlwind
      // In Gen 2, Whirlwind/Roar work (unlike Gen 1 where they always fail in trainer battles).
      // These are -1 priority in Gen 2 data. No ability checks needed (Gen 2 has no abilities).
      result.switchOut = true;
      result.forcedSwitch = true;
      break;
    }

    case "hidden-power": {
      // Hidden Power's type and base power are calculated from the attacker's DVs.
      // The actual type/power override is handled in Gen2DamageCalc.ts (calculateGen2HiddenPower).
      // This case exists to prevent the "unknown custom effect" fallthrough.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
      break;
    }

    case "moonlight":
    case "morning-sun":
    case "synthesis": {
      // Weather-dependent healing moves
      // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
      // No weather: 1/2 max HP
      // Sunny Day: 2/3 max HP (floor)
      // Rain Dance/Sandstorm: 1/4 max HP (floor)
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const currentWeather = context.state.weather?.type ?? null;
      let healFraction: number;
      if (currentWeather === "sun") {
        healFraction = 2 / 3;
      } else if (currentWeather === "rain" || currentWeather === "sand") {
        healFraction = 1 / 4;
      } else {
        healFraction = 1 / 2;
      }
      result.healAmount = Math.max(1, Math.floor(maxHp * healFraction));
      result.messages.push(`${pokemonName} recovered HP!`);
      break;
    }

    // =========================================================================
    // Future Sight (#213)
    // =========================================================================
    case "future-sight": {
      // Future Sight: schedules a delayed Psychic-type attack landing in 2 turns.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
      // In Gen 2: damage is calculated at hit time (NOT use time), typeless
      // (type immunities don't apply at resolution — the engine handles this).
      const actorSide = context.state.sides.findIndex((s) =>
        s.active?.some((a) => a?.pokemon === attacker.pokemon),
      ) as 0 | 1;

      // Fail if a future attack is already pending on the target's side
      const defenderSideIndex = actorSide === 0 ? 1 : 0;
      const defenderSide = context.state.sides[defenderSideIndex];
      if (defenderSide?.futureAttack) {
        result.messages.push("But it failed!");
        break;
      }

      result.futureAttack = {
        moveId: "future-sight",
        turnsLeft: 2,
        sourceSide: actorSide,
      };
      result.messages.push(`${pokemonName} foresaw an attack!`);
      break;
    }

    // =========================================================================
    // Sleep Talk (#211)
    // =========================================================================
    case "sleep-talk": {
      // Sleep Talk: randomly uses one of the user's other moves while asleep.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
      // NOTE: The engine currently blocks sleeping Pokemon in canExecuteMove before
      // executeMoveEffect runs. For Sleep Talk to function in full engine integration,
      // the engine needs a sleep-bypass mechanism (see issue filed for this).
      // This handler implements the correct selection logic.
      if (attacker.pokemon.status !== "sleep") {
        result.messages.push("But it failed!");
        break;
      }
      // Build list of usable moves (exclude banned moves and moves with 0 PP)
      const usableMoves = attacker.pokemon.moves.filter(
        (m) => !SLEEP_TALK_BANNED_MOVES.has(m.moveId) && m.currentPP > 0,
      );
      if (usableMoves.length === 0) {
        result.messages.push("But it failed!");
        break;
      }
      const chosenIndex = Math.floor(context.rng.next() * usableMoves.length);
      const chosen = usableMoves[chosenIndex];
      if (!chosen) {
        result.messages.push("But it failed!");
        break;
      }
      result.recursiveMove = chosen.moveId;
      result.messages.push(`${pokemonName} used Sleep Talk!`);
      break;
    }

    // =========================================================================
    // Snore (#211)
    // =========================================================================
    case "snore": {
      // Snore: can only be used while asleep. Deals damage with 30% flinch chance.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SnoreEffect
      // The sleep precondition is checked here. Since this move is pre-dispatched
      // (bypassing the data-driven volatile-status handler for flinch), we also
      // roll the 30% flinch chance manually.
      // NOTE: Same engine sleep-bypass limitation as Sleep Talk.
      if (attacker.pokemon.status !== "sleep") {
        result.messages.push("But it failed!");
        break;
      }
      // Roll 30% flinch chance (on 0-255 scale, 1/256 failure rate)
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SnoreEffect
      if (rollEffectChance(30, context.rng)) {
        result.volatileInflicted = "flinch";
      }
      break;
    }

    // =========================================================================
    // Present (#219)
    // =========================================================================
    case "present": {
      // Present: randomly deals 40/80/120 damage or heals the target for 1/4 max HP.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
      // Roll 0-255: 0-101 (40%) -> power 40; 102-177 (30%) -> power 80;
      //             178-203 (10%) -> power 120; 204-255 (20%) -> heal 1/4 HP
      // Note: using 0-255 scale matches the cartridge RNG.
      // Since Present has power: null in move data, the engine skips normal damage calc.
      // We use customDamage to signal the power outcome to the engine.
      const presentRoll = context.rng.int(0, 255);
      if (presentRoll < 102) {
        // 40 power damage — 102/256 = ~39.8%
        result.customDamage = {
          target: "defender",
          amount: 40,
          source: "present-power",
        };
      } else if (presentRoll < 178) {
        // 80 power damage — 76/256 = ~29.7%
        result.customDamage = {
          target: "defender",
          amount: 80,
          source: "present-power",
        };
      } else if (presentRoll < 204) {
        // 120 power damage — 26/256 = ~10.2%
        result.customDamage = {
          target: "defender",
          amount: 120,
          source: "present-power",
        };
      } else {
        // Heal the target for 1/4 max HP — 52/256 = ~20.3%
        // Source: pret/pokecrystal — Present heal applies to the TARGET, not the user
        // TODO: Proper Present heal requires engine support for "heal defender" field
        // on MoveEffectResult. For now, we store amount=0 and the heal message.
        const defMaxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
        const healAmt = Math.max(1, Math.floor(defMaxHp / 4));
        result.customDamage = {
          target: "defender",
          amount: 0,
          source: "present-heal",
        };
        result.messages.push(
          `${defender.pokemon.nickname ?? "The foe"} regained ${healAmt} HP from Present!`,
        );
      }
      break;
    }

    // =========================================================================
    // Magnitude (#219)
    // =========================================================================
    case "magnitude": {
      // Magnitude: random power based on magnitude level 4-10.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm MagnitudeEffect
      // Magnitudes 4-10, probabilities on 0-255 scale:
      //   4: 13/256 (~5%), 5: 25/256 (~10%), 6: 51/256 (~20%),
      //   7: 77/256 (~30%), 8: 51/256 (~20%), 9: 25/256 (~10%), 10: 14/256 (~5%)
      // Since Magnitude has power: null in move data, the engine skips normal damage calc.
      // We signal the effective power via customDamage.
      const magRoll = context.rng.int(0, 255);
      let magnitudeLevel: number;
      let magnitudePower: number;
      if (magRoll < 13) {
        magnitudeLevel = 4;
        magnitudePower = 10;
      } else if (magRoll < 38) {
        magnitudeLevel = 5;
        magnitudePower = 30;
      } else if (magRoll < 89) {
        magnitudeLevel = 6;
        magnitudePower = 50;
      } else if (magRoll < 166) {
        magnitudeLevel = 7;
        magnitudePower = 70;
      } else if (magRoll < 217) {
        magnitudeLevel = 8;
        magnitudePower = 90;
      } else if (magRoll < 242) {
        magnitudeLevel = 9;
        magnitudePower = 110;
      } else {
        magnitudeLevel = 10;
        magnitudePower = 150;
      }
      result.customDamage = {
        target: "defender",
        amount: magnitudePower,
        source: "magnitude",
      };
      result.messages.push(`Magnitude ${magnitudeLevel}!`);
      break;
    }

    // =========================================================================
    // Triple Kick (#219)
    // =========================================================================
    case "triple-kick": {
      // Triple Kick: hits 1-3 times with escalating power (10, 20, 30).
      // Each hit has an independent accuracy check.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
      // The first hit is already dealt by the engine's normal damage flow (power 10).
      // We signal additional hits via multiHitCount.
      // NOTE: The escalating power (20, 30) for subsequent hits is not supported by
      // the engine's multi-hit loop (which reuses the first hit's damage).
      // This is a known limitation — subsequent hits will use power 10 instead of 20/30.
      // TODO: Engine support for per-hit variable power in multi-hit moves.
      result.multiHitCount = 2; // 2 additional hits beyond the first (3 total)
      break;
    }

    // =========================================================================
    // Rollout (#219)
    // =========================================================================
    case "rollout": {
      // Rollout: locks the user for 5 turns with escalating power.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
      // Power: 30 * 2^(turn-1), doubled again if Defense Curl was used
      // On miss or after 5 turns, the move ends.
      // The engine uses forcedMoveSet to lock the user into the move.
      const rolloutState = attacker.volatileStatuses.get("rollout");
      const rolloutCount = rolloutState ? ((rolloutState.data?.count as number) ?? 0) + 1 : 0;

      if (rolloutCount < 4) {
        // Lock into Rollout for the next turn
        const moveIdx = attacker.pokemon.moves.findIndex((m) => m.moveId === "rollout");
        if (moveIdx >= 0) {
          result.forcedMoveSet = {
            moveIndex: moveIdx,
            moveId: "rollout",
            volatileStatus: "rollout",
          };
          result.selfVolatileInflicted = "rollout";
          result.selfVolatileData = {
            turnsLeft: 1,
            data: { count: rolloutCount },
          };
        }
      }
      // Power escalation is handled in Gen2DamageCalc.ts via the rollout volatile state.
      break;
    }

    // =========================================================================
    // Fury Cutter (#219)
    // =========================================================================
    case "fury-cutter": {
      // Fury Cutter: power doubles on each consecutive successful use, up to 160.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
      // Power: 10 * 2^min(consecutiveUses, 4) -> 10, 20, 40, 80, 160
      // Resets on miss or when a different move is used.
      // The consecutive counter is tracked via a volatile status.
      const furyCutterState = attacker.volatileStatuses.get("fury-cutter");
      const currentCount = furyCutterState ? ((furyCutterState.data?.count as number) ?? 0) + 1 : 0;

      // Update the volatile with the new count (capped at 4 for power 160)
      result.selfVolatileInflicted = "fury-cutter";
      result.selfVolatileData = {
        turnsLeft: -1, // No expiry — resets on miss or different move
        data: { count: Math.min(currentCount, 4) },
      };
      // Power escalation is handled in Gen2DamageCalc.ts via the fury-cutter volatile.
      break;
    }

    // =========================================================================
    // Beat Up (#219)
    // =========================================================================
    case "beat-up": {
      // Beat Up: hits once for each non-fainted, non-statused party member.
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
      // Each hit uses that party member's base Attack stat in the damage formula.
      // In Gen 2, Beat Up is typeless (no type effectiveness, no STAB).
      // NOTE: The engine's multi-hit loop reuses the first hit's damage, which doesn't
      // account for per-member Attack differences. This is a known simplification.
      // We set multiHitCount to the number of eligible party members minus 1
      // (since the first hit is already dealt).
      const actorSideIdx = context.state.sides.findIndex((s) =>
        s.active?.some((a) => a?.pokemon === attacker.pokemon),
      );
      const actorSide = context.state.sides[actorSideIdx];
      if (!actorSide) break;

      // Count eligible party members: alive and no primary status condition
      const eligibleCount = actorSide.team.filter((p) => p.currentHp > 0 && !p.status).length;

      if (eligibleCount === 0) {
        result.messages.push("But it failed!");
        break;
      }

      // multiHitCount = additional hits beyond the first
      result.multiHitCount = Math.max(0, eligibleCount - 1);
      result.messages.push(`${pokemonName} used Beat Up!`);
      break;
    }

    default: {
      // Unknown custom effect
      break;
    }
  }
}
