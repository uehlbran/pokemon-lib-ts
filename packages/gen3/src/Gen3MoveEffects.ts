/**
 * Gen 3 Move Effect Handlers
 *
 * Implements all data-driven and custom move effect execution for Gen 3
 * (Ruby/Sapphire/Emerald).
 *
 * Key Gen 3 differences from Gen 4+:
 *   - Physical/special split determined by TYPE not category:
 *     Physical: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel
 *     Special: Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark
 *   - Taunt: 2 turns (not 3-5 like Gen 4)
 *   - Encore: 2-5 turns (not 4-8 like Gen 4)
 *   - Disable: 2-5 turns (not fixed 4 like Gen 4)
 *   - Explosion/Self-Destruct: defense halved in damage calc
 *   - Electric types are NOT immune to paralysis in Gen 3 (immunity added in Gen 6)
 *   - 0-99 scale for effect chance (Random() % 100 < percentChance)
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

import type { ActivePokemon, MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
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
import { canInflictGen3Status } from "./Gen3Ruleset";

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
  statChanges: Array<{ target: "attacker" | "defender"; stat: BattleStat; stages: number }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  batonPass?: boolean;
  messages: string[];
  selfFaint?: boolean;
  /** When true along with switchOut, the DEFENDER is forced to switch (Whirlwind/Roar phazing) */
  forcedSwitch?: boolean;
  customDamage?: {
    target: "attacker" | "defender";
    amount: number;
    source: string;
  } | null;
  weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
  clearSideHazards?: "attacker" | "defender";
  itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
  selfStatusInflicted?: PrimaryStatus | null;
  selfVolatileInflicted?: VolatileStatus | null;
  selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
  forcedMoveSet?: { moveIndex: number; moveId: string; volatileStatus: VolatileStatus } | null;
  /** Screens to clear from the defender's side (e.g., Brick Break removes Reflect/Light Screen) */
  screensCleared?: "attacker" | "defender" | "both" | null;
};

// ---------------------------------------------------------------------------
// Effect Chance Roll
// ---------------------------------------------------------------------------

/**
 * Roll for a secondary effect chance on the 0-99 scale.
 * 100% effects ALWAYS succeed (0-99 < 100 is always true).
 *
 * Serene Grace: doubles the chance before the roll (capped at 100).
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:2908-2935 Cmd_seteffectwithchance
 * "else if (Random() % 100 < percentChance ...)"
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_SERENE_GRACE
 * "percentChance *= 2" before the Random() % 100 check.
 */
function rollEffectChance(chance: number, rng: SeededRandom, attacker?: ActivePokemon): boolean {
  let effectiveChance = chance;

  // Serene Grace: double the secondary effect chance (cap at 100)
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_SERENE_GRACE doubles percentChance
  if (attacker?.ability === "serene-grace") {
    effectiveChance = Math.min(chance * 2, 100);
  }

  // 100% effects always succeed — skip the roll entirely
  // Source: pret/pokeemerald — Random() % 100 < 100 is always true
  if (effectiveChance >= 100) return true;
  return rng.int(0, 99) < effectiveChance;
}

// ---------------------------------------------------------------------------
// Data-Driven Effect Dispatch
// ---------------------------------------------------------------------------

/**
 * Apply a single MoveEffect to the mutable result object.
 * Handles all effect types defined in the MoveEffect discriminated union.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */
function applyMoveEffect(
  effect: MoveEffect,
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender, damage, rng } = context;

  switch (effect.type) {
    case "status-chance": {
      // Roll for status infliction
      // Source: pret/pokeemerald — secondary effect probability check
      if (rollEffectChance(effect.chance, rng, attacker)) {
        if (!defender.pokemon.status) {
          if (canInflictGen3Status(effect.status, defender)) {
            result.statusInflicted = effect.status;
          }
        }
      }
      break;
    }

    case "status-guaranteed": {
      // Guaranteed status (e.g., Thunder Wave, Toxic, Will-O-Wisp)
      // Source: pret/pokeemerald — primary effect status infliction
      if (!defender.pokemon.status) {
        if (canInflictGen3Status(effect.status, defender)) {
          result.statusInflicted = effect.status;
        }
      }
      break;
    }

    case "stat-change": {
      // Only apply the secondary-effect roll for damaging moves — status moves
      // (e.g., Swords Dance, Dragon Dance) have guaranteed primary effects
      // Source: pret/pokeemerald — secondary effect check only for damaging moves
      if (move.category !== "status" && !rollEffectChance(effect.chance, rng, attacker)) {
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
      // Rock Head: prevents recoil damage from recoil moves (NOT Struggle)
      // Source: pret/pokeemerald ABILITY_ROCK_HEAD
      if (attacker.ability === "rock-head") {
        break;
      }
      // Recoil damage is a fraction of damage dealt
      // Source: pret/pokeemerald — recoil = floor(damage * fraction)
      result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
      break;
    }

    case "drain": {
      // Drain heals a fraction of damage dealt
      // Source: pret/pokeemerald — drain = floor(damage * fraction)
      const drainAmount = Math.max(1, Math.floor(damage * effect.amount));

      // Liquid Ooze: drain moves deal damage to the attacker instead of healing
      // Source: pret/pokeemerald src/battle_util.c — ABILITY_LIQUID_OOZE
      // Source: Showdown data/abilities.ts — Liquid Ooze: this.damage(damage); return 0;
      if (defender.ability === "liquid-ooze") {
        result.recoilDamage = drainAmount;
        const drainUserName = attacker.pokemon.nickname ?? "The Pokemon";
        result.messages.push(`${drainUserName} sucked up the liquid ooze!`);
      } else {
        result.healAmount = drainAmount;
      }
      break;
    }

    case "heal": {
      // Heal a fraction of max HP (e.g., Recover, Milk Drink)
      // Source: pret/pokeemerald — heal = floor(maxHP * fraction)
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
      // For damaging moves, roll the effect chance
      // For status moves (e.g., Focus Energy, Substitute), guaranteed
      if (move.category !== "status" && !rollEffectChance(effect.chance, rng, attacker)) {
        break;
      }
      result.volatileInflicted = effect.status;
      break;
    }

    case "weather": {
      // Set weather for 5 turns (Gen 3 default, no weather rocks)
      // Source: pret/pokeemerald — weather moves set 5-turn weather
      result.weatherSet = {
        weather: effect.weather,
        turns: effect.turns ?? 5,
        source: move.id,
      };
      break;
    }

    case "entry-hazard": {
      // Entry hazard targets the opponent's side
      // Source: pret/pokeemerald — Spikes placed on foe's side
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
        result.switchOut = true;
        // Baton Pass: additionally pass stat stages and volatile statuses.
        // Other switch-out moves (U-turn in Gen 4+) just switch without passing.
        // Source: pret/pokeemerald src/battle_script_commands.c — Baton Pass
        //   "gBattleScripting.savedBattler" + stat/volatile transfer logic
        // Source: Bulbapedia — "Baton Pass passes stat stage changes and certain
        //   volatile status conditions to the replacement Pokemon"
        if (context.move.id === "baton-pass") {
          result.batonPass = true;
        }
      }
      break;
    }

    case "protect": {
      // Protect/Detect — engine handles protect volatile + consecutive-use scaling
      // Source: pret/pokeemerald — Protect sets PROTECTED status
      result.volatileInflicted = "protect";
      break;
    }

    case "custom": {
      handleCustomEffect(move, result, context);
      break;
    }

    case "remove-hazards": {
      // Intentionally no-op: all Gen 3 remove-hazards effects (Rapid Spin)
      // are handled via the "custom" case in handleCustomEffect.
      // Source: pret/pokeemerald — Rapid Spin uses EFFECT_RAPID_SPIN (custom)
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
      // Not applicable in Gen 3
      break;

    case "screen": {
      // Reflect / Light Screen — set screen on attacker's side
      // Duration in Gen 3: 5 turns normally (no Light Clay in Gen 3)
      // Source: pret/pokeemerald src/battle_script_commands.c — Reflect/Light Screen effect
      result.screenSet = {
        screen: effect.screen,
        turnsLeft: effect.turns,
        side: "attacker",
      };
      break;
    }

    case "two-turn": {
      // Two-turn moves: charge on turn 1, attack on turn 2.
      // Source: pret/pokeemerald src/battle_script_commands.c — two-turn move handling
      handleTwoTurnEffect(move, result, context);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Two-Turn Move Effect Handler
// ---------------------------------------------------------------------------

/**
 * Volatile status map for two-turn semi-invulnerable moves in Gen 3.
 * Maps move ID to the volatile status applied during the charge turn.
 *
 * Gen 3 differences from Gen 4:
 *   - NO Shadow Force (Gen 4 move)
 *   - NO Power Herb (Gen 4 item)
 *   - Bounce IS in Gen 3 (RSE) — maps to "flying" like Fly
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — two-turn move handling
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
 */
const TWO_TURN_VOLATILE_MAP: Readonly<Record<string, VolatileStatus>> = {
  fly: "flying",
  bounce: "flying", // Bounce grants STATUS3_ON_AIR like Fly — Source: pret/pokeemerald
  dig: "underground",
  dive: "underwater",
  "solar-beam": "charging",
  "skull-bash": "charging",
  "razor-wind": "charging",
  "sky-attack": "charging",
};

/**
 * Charge-turn messages for two-turn moves.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — charge turn messages
 */
const TWO_TURN_MESSAGES: Readonly<Record<string, string>> = {
  fly: "{pokemon} flew up high!",
  bounce: "{pokemon} sprang up!",
  dig: "{pokemon} dug underground!",
  dive: "{pokemon} dived underwater!",
  "solar-beam": "{pokemon} is absorbing sunlight!",
  "skull-bash": "{pokemon} lowered its head!",
  // Source: pret/pokeemerald src/battle_script_commands.c — charge turn messages
  "razor-wind": "{pokemon} whipped up a whirlwind!",
  "sky-attack": "{pokemon} is glowing!",
};

/**
 * Handle the charge turn of a two-turn move in Gen 3.
 *
 * On the charge turn:
 *   1. Determine the volatile status from the move ID
 *   2. Check skip-charge conditions (SolarBeam in sun — no Power Herb in Gen 3)
 *   3. If charging, set forcedMoveSet and emit a charge message
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — two-turn move charge handling
 * Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
 */
function handleTwoTurnEffect(
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker } = context;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const volatile = TWO_TURN_VOLATILE_MAP[move.id] ?? "charging";

  // SolarBeam in harsh sunlight: skip charge, attack immediately
  // Source: pret/pokeemerald — SolarBeam not charging in sunny weather
  // Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
  if (move.id === "solar-beam" && context.state.weather?.type === "sun") {
    return; // No forcedMoveSet — engine proceeds with the attack immediately
  }

  // Find move index in attacker's moveset
  const moveIndex = attacker.pokemon.moves.findIndex(
    (m: { moveId: string }) => m.moveId === move.id,
  );

  // Set up forced move for next turn
  result.forcedMoveSet = {
    moveIndex: moveIndex >= 0 ? moveIndex : 0,
    moveId: move.id,
    volatileStatus: volatile,
  };

  // Skull Bash raises Defense by 1 stage on the charge turn
  // Source: pret/pokeemerald — EFFECT_SKULL_BASH: RaiseStat(STAT_DEF) before charging
  if (move.id === "skull-bash") {
    result.statChanges.push({ target: "attacker", stat: "defense", stages: 1 });
  }

  const messageTemplate = TWO_TURN_MESSAGES[move.id] ?? "{pokemon} is charging up!";
  result.messages.push(messageTemplate.replace("{pokemon}", attackerName));
}

// ---------------------------------------------------------------------------
// Custom Move Handlers
// ---------------------------------------------------------------------------

/**
 * Handle custom move effects specific to Gen 3.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */
function handleCustomEffect(
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender } = context;
  const pokemonName = attacker.pokemon.nickname ?? "The Pokemon";

  switch (move.id) {
    case "belly-drum": {
      // Lose 50% max HP, maximize Attack to +6
      // Source: pret/pokeemerald — Belly Drum cuts HP and maximizes Attack
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
      // Source: pret/pokeemerald — Rapid Spin clears Spikes, Leech Seed, Wrap
      result.volatilesToClear = [
        { target: "attacker", volatile: "leech-seed" },
        { target: "attacker", volatile: "bound" },
      ];
      result.clearSideHazards = "attacker";
      result.messages.push(`${pokemonName} blew away leech seed and spikes!`);
      break;
    }

    case "mean-look":
    case "spider-web":
    case "block": {
      // Trapping effect — prevents switching
      // Source: pret/pokeemerald — Mean Look / Spider Web / Block set TRAPPED flag
      result.volatileInflicted = "trapped";
      break;
    }

    case "thief": {
      // Steal defender's item if user has no item
      // Source: pret/pokeemerald — Thief takes held item
      if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
        result.itemTransfer = { from: "defender", to: "attacker" };
        result.messages.push(
          `${pokemonName} stole ${defender.pokemon.nickname ?? "the foe"}'s ${defender.pokemon.heldItem}!`,
        );
      }
      break;
    }

    case "baton-pass": {
      // Switch out preserving stat changes and volatile statuses.
      // The batonPass flag tells the engine to transfer stat stages and
      // volatile statuses to the incoming Pokemon.
      //
      // Source: pret/pokeemerald src/battle_script_commands.c — Baton Pass
      //   "gBattleScripting.savedBattler" + stat/volatile transfer logic
      // Source: Bulbapedia — "Baton Pass passes stat stage changes and certain
      //   volatile status conditions to the replacement Pokémon"
      result.switchOut = true;
      result.batonPass = true;
      break;
    }

    case "explosion":
    case "self-destruct": {
      result.selfFaint = true;
      result.messages.push(`${pokemonName} exploded!`);
      break;
    }

    default: {
      // Unknown custom effect — no-op
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// ID-Based Interceptors (moves with null effect or special handling)
// ---------------------------------------------------------------------------

/**
 * Handle moves that are intercepted by move ID before data-driven dispatch.
 * Returns true if the move was handled, false to fall through to data-driven dispatch.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */
function handleIdInterceptedMove(context: MoveEffectContext, result: MutableResult): boolean {
  const { attacker, defender, move, rng } = context;
  const state = context.state;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  switch (move.id) {
    // --- Knock Off ---
    case "knock-off": {
      // Knock Off: remove defender's item (no damage boost in Gen 3 — Gen 5+ only)
      // Source: pret/pokeemerald src/battle_script_commands.c — Knock Off removes item
      if (defender.pokemon.heldItem) {
        const item = defender.pokemon.heldItem;
        defender.pokemon.heldItem = null;
        const defenderName = defender.pokemon.nickname ?? "The foe";
        result.messages.push(`${defenderName} lost its ${item}!`);
      }
      return false; // Still process data-driven effects if any
    }

    // --- Counter ---
    case "counter": {
      // Counter: returns 2x the physical damage taken
      // Source: pret/pokeemerald — Counter returns 2x physical damage
      // Source: Bulbapedia — "Counter deals damage equal to twice the damage dealt by the
      //   last physical move that hit the user"
      if (attacker.lastDamageTaken <= 0 || attacker.lastDamageCategory !== "physical") {
        result.messages.push("But it failed!");
        return true;
      }
      result.customDamage = {
        target: "defender",
        amount: attacker.lastDamageTaken * 2,
        source: "counter",
      };
      return true;
    }

    // --- Mirror Coat ---
    case "mirror-coat": {
      // Mirror Coat: returns 2x the special damage taken
      // Source: pret/pokeemerald — Mirror Coat returns 2x special damage
      // Source: Bulbapedia — "Mirror Coat deals damage equal to twice the damage dealt by the
      //   last special move that hit the user"
      if (attacker.lastDamageTaken <= 0 || attacker.lastDamageCategory !== "special") {
        result.messages.push("But it failed!");
        return true;
      }
      result.customDamage = {
        target: "defender",
        amount: attacker.lastDamageTaken * 2,
        source: "mirror-coat",
      };
      return true;
    }

    // --- Destiny Bond ---
    case "destiny-bond": {
      // Destiny Bond: if the user faints from the opponent's next move, the attacker faints too
      // Source: pret/pokeemerald — sets destiny-bond volatile on user
      result.selfVolatileInflicted = "destiny-bond";
      result.messages.push(`${attackerName} is trying to take its foe down with it!`);
      return true;
    }

    // --- Perish Song ---
    case "perish-song": {
      // Both Pokemon get Perish Song volatile (3-turn countdown)
      // Already-affected Pokemon are skipped
      // Source: pret/pokeemerald — Perish Song sets 3-turn countdown on both
      // Source: Bulbapedia — "All Pokemon that hear the song will faint in 3 turns
      //   unless they switch out"
      const perishData = { turnsLeft: 3, data: { counter: 3 } };

      if (!defender.volatileStatuses.has("perish-song")) {
        result.volatileInflicted = "perish-song";
        result.volatileData = perishData;
      } else {
        result.volatileInflicted = null;
      }

      if (!attacker.volatileStatuses.has("perish-song")) {
        result.selfVolatileInflicted = "perish-song";
        result.selfVolatileData = perishData;
      }

      result.messages.push("All Pokemon that heard the song will faint in 3 turns!");
      return true;
    }

    // --- Endure ---
    case "endure": {
      // Endure: survive with 1 HP this turn
      // Source: pret/pokeemerald — Endure sets ENDURE volatile
      result.selfVolatileInflicted = "endure";
      result.messages.push(`${attackerName} braced itself!`);
      return true;
    }

    // --- Taunt ---
    case "taunt": {
      // Taunt: 2 turns in Gen 3
      // Source: pret/pokeemerald — Taunt lasts 2 turns
      // Source: Bulbapedia — "In Generation III, Taunt lasts for 2 turns"
      result.volatileInflicted = "taunt";
      result.volatileData = { turnsLeft: 2 };
      const defenderName = defender.pokemon.nickname ?? "The foe";
      result.messages.push(`${defenderName} fell for the taunt!`);
      return true;
    }

    // --- Encore ---
    case "encore": {
      // Encore: 2-5 turns in Gen 3
      // Source: pret/pokeemerald — Encore lasts 2-5 turns
      // Source: Bulbapedia — "In Generation III, Encore lasts 2-5 turns"
      if (!defender.lastMoveUsed || defender.volatileStatuses.has("encore")) {
        result.messages.push("But it failed!");
        return true;
      }
      const encoreTurns = rng.int(2, 5);
      result.volatileInflicted = "encore";
      result.volatileData = { turnsLeft: encoreTurns, data: { moveId: defender.lastMoveUsed } };
      const defenderNameE = defender.pokemon.nickname ?? "The foe";
      result.messages.push(`${defenderNameE} got an encore!`);
      return true;
    }

    // --- Disable ---
    case "disable": {
      // Disable: 2-5 turns in Gen 3, targets last used move
      // Source: pret/pokeemerald — Disable lasts 2-5 turns
      // Source: Bulbapedia — "In Generation III, Disable lasts 2-5 turns"
      if (!defender.lastMoveUsed) {
        result.messages.push("But it failed!");
        return true;
      }
      const disableTurns = rng.int(2, 5);
      result.volatileInflicted = "disable";
      result.volatileData = {
        turnsLeft: disableTurns,
        data: { moveId: defender.lastMoveUsed },
      };
      const defenderNameD = defender.pokemon.nickname ?? "The foe";
      result.messages.push(`${defenderNameD}'s ${defender.lastMoveUsed} was disabled!`);
      return true;
    }

    // --- Rest ---
    case "rest": {
      // Full heal + self-inflict 2-turn sleep
      // Source: pret/pokeemerald — Rest heals fully and inflicts sleep
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = maxHp;
      result.selfStatusInflicted = "sleep";
      result.messages.push(`${attackerName} went to sleep and became healthy!`);
      return true;
    }

    // --- Curse ---
    case "curse": {
      // Ghost-type Curse: lose 50% HP, inflict curse volatile on defender
      // Non-Ghost Curse: -1 Speed, +1 Attack, +1 Defense
      // Source: pret/pokeemerald — Curse has two different effects based on user type
      if (attacker.types.includes("ghost")) {
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        const halfHp = Math.floor(maxHp / 2);
        result.recoilDamage = halfHp;
        result.volatileInflicted = "curse";
        result.messages.push(
          `${attackerName} cut its own HP and laid a curse on ${defender.pokemon.nickname ?? "the foe"}!`,
        );
      } else {
        result.statChanges.push(
          { target: "attacker", stat: "speed", stages: -1 },
          { target: "attacker", stat: "attack", stages: 1 },
          { target: "attacker", stat: "defense", stages: 1 },
        );
      }
      return true;
    }

    // --- Whirlwind / Roar ---
    case "whirlwind":
    case "roar": {
      // Force switch — engine handles phazing logic when both switchOut and forcedSwitch are set
      // Source: pret/pokeemerald src/battle_script_commands.c — Whirlwind/Roar force random switch
      // Suction Cups: prevents forced switch
      // Source: pret/pokeemerald src/battle_util.c — ABILITY_SUCTION_CUPS blocks phazing
      if (defender.ability === "suction-cups") {
        const dName = defender.pokemon.nickname ?? "The foe";
        result.messages.push(`${dName} anchored itself with Suction Cups!`);
        return true;
      }
      // Ingrain: prevents forced switch
      // Source: pret/pokeemerald src/battle_util.c — STATUS3_ROOTED blocks phazing
      if (defender.volatileStatuses.has("ingrain")) {
        const dName = defender.pokemon.nickname ?? "The foe";
        result.messages.push(`${dName} anchored itself with its roots!`);
        return true;
      }
      result.switchOut = true;
      result.forcedSwitch = true;
      return true;
    }

    // --- Trick / Switcheroo ---
    case "trick": {
      // Swap items between attacker and defender
      // Source: pret/pokeemerald — Trick swaps held items
      // Fails if neither has an item, or if Sticky Hold blocks it
      if (defender.ability === "sticky-hold") {
        const dName = defender.pokemon.nickname ?? "The foe";
        result.messages.push(`${dName}'s Sticky Hold prevents item transfer!`);
        return true;
      }
      if (!attacker.pokemon.heldItem && !defender.pokemon.heldItem) {
        result.messages.push("But it failed!");
        return true;
      }
      result.itemTransfer = { from: "attacker", to: "defender" };
      result.messages.push(`${attackerName} switched items with its target!`);
      return true;
    }

    // --- Morning Sun / Synthesis / Moonlight ---
    case "morning-sun":
    case "synthesis":
    case "moonlight": {
      // Weather-dependent healing
      // Source: pret/pokeemerald — sun: 2/3, rain/sand/hail: 1/4, else: 1/2
      // Source: Bulbapedia — Weather-based HP recovery moves
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const weather = state.weather?.type ?? null;
      let healFraction: number;
      if (weather === "sun") {
        healFraction = 2 / 3;
      } else if (weather === "rain" || weather === "sand" || weather === "hail") {
        healFraction = 1 / 4;
      } else {
        healFraction = 1 / 2;
      }
      result.healAmount = Math.max(1, Math.floor(maxHp * healFraction));
      return true;
    }

    // --- Focus Punch ---
    case "focus-punch": {
      // Focus Punch: fails if the attacker took damage this turn before acting.
      // Focus Punch has -3 priority, so it always executes last. If the user was hit
      // by any damaging move before Focus Punch resolves, it fails.
      //
      // Source: pret/pokeemerald src/battle_script_commands.c — Focus Punch/Bide check
      // Source: Bulbapedia — "Focus Punch fails if the user is hit before it attacks"
      if (attacker.lastDamageTaken > 0) {
        result.messages.push(`${attackerName} lost its focus and couldn't move!`);
        return true; // Move fails — intercepted, no damage
      }
      // Focus Punch succeeds — damage applied by engine
      return false; // Fall through to data-driven (no effect for focus-punch, so engine applies damage)
    }

    // --- Pursuit ---
    case "pursuit": {
      // Pursuit: if the target is switching out this turn, deal double damage.
      // The engine tracks switching via the defender's action. In the move effect handler,
      // we can only check if the defender is switching by examining the context.
      // Since we don't have direct access to the defender's chosen action here,
      // we set up the pursuit mechanic as a damage multiplier that the engine can apply.
      //
      // In practice: the engine handles Pursuit's switch-doubling at the action resolution level.
      // The move effect handler just needs to exist so Pursuit isn't a no-op.
      // Damage is handled by the engine's normal damage path.
      //
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_PURSUIT
      // Source: Showdown data/mods/gen3/moves.ts — Pursuit beforeTurnCallback
      return false; // Fall through to data-driven effects (damage is normal)
    }

    // --- Brick Break ---
    case "brick-break": {
      // Brick Break: removes Reflect and Light Screen from the target's side before dealing damage.
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_BRICK_BREAK
      // Source: Bulbapedia — "Brick Break removes Reflect and Light Screen from the target's
      //   side of the field, then inflicts damage."
      result.screensCleared = "defender";
      // Only show message if there are actually screens to remove
      const defenderSideIndex = state.sides.findIndex((side) =>
        side.active.some((a) => a?.pokemon === defender.pokemon),
      );
      const defenderSide = state.sides[defenderSideIndex];
      const hasScreens =
        defenderSide?.screens.some((s) => s.type === "reflect" || s.type === "light-screen") ??
        false;
      if (hasScreens) {
        result.messages.push("The wall shattered!");
      }
      return false; // Fall through — Brick Break still deals normal damage
    }

    // --- Secret Power ---
    case "secret-power": {
      // Secret Power: 30% chance of a secondary effect that varies by terrain.
      // Since terrain is not modeled, default to paralysis (building/indoor terrain effect).
      // The move data already has: effect = { type: 'status-chance', status: 'paralysis', chance: 30 }
      // So the data-driven dispatch handles the secondary effect entirely.
      //
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_SECRET_POWER
      // Source: Bulbapedia — "In battle, Secret Power always has a 30% chance of inflicting
      //   a secondary effect. This effect varies depending on the terrain."
      return false; // Fall through to data-driven effects for paralysis chance + normal damage
    }

    // --- Torment ---
    case "torment": {
      // Torment: prevents the target from using the same move twice in a row.
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_TORMENT
      // Source: Bulbapedia — "Torment prevents the target from selecting the same move
      //   for use twice in a row."
      if (defender.volatileStatuses.has("torment")) {
        result.messages.push("But it failed!");
        return true;
      }
      result.volatileInflicted = "torment";
      const defenderNameT = defender.pokemon.nickname ?? "The foe";
      result.messages.push(`${defenderNameT} was subjected to torment!`);
      return true;
    }

    // --- Ingrain ---
    case "ingrain": {
      // Ingrain: user roots itself, gaining 1/16 HP recovery per turn.
      // Cannot switch out (except via Baton Pass). Phazing moves fail against the user.
      // The engine handles the 1/16 HP restoration via the "ingrain" end-of-turn effect.
      //
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_INGRAIN
      // Source: Bulbapedia — "Ingrain causes the user to restore 1/16 of its maximum HP
      //   at the end of each turn. The user cannot be switched out or flee."
      if (attacker.volatileStatuses.has("ingrain")) {
        result.messages.push("But it failed!");
        return true;
      }
      result.selfVolatileInflicted = "ingrain";
      result.messages.push(`${attackerName} planted its roots!`);
      return true;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute a move effect for Gen 3.
 *
 * Processing order:
 *   1. ID-based interceptors (knock-off, counter, mirror-coat, destiny-bond, etc.)
 *   2. If not intercepted and move has a data-driven effect, apply it
 *   3. Return the result
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */
export function executeGen3MoveEffect(context: MoveEffectContext): MoveEffectResult {
  const result: MutableResult = {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };

  // Step 1: ID-based interceptors
  const handled = handleIdInterceptedMove(context, result);

  // Step 2: Data-driven effect dispatch (if not fully handled)
  if (!handled && context.move.effect) {
    applyMoveEffect(context.move.effect, context.move, result, context);
  }

  return result;
}
