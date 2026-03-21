/**
 * Gen 4 Move Effect Handlers
 *
 * Implements all data-driven and custom move effect execution for Gen 4
 * (Diamond/Pearl/Platinum/HeartGold/SoulSilver).
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
  MoveAction,
  MoveEffectContext,
  MoveEffectResult,
} from "@pokemon-lib-ts/battle";
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
  messages: string[];
  screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
  selfFaint?: boolean;
  customDamage?: {
    target: "attacker" | "defender";
    amount: number;
    source: string;
    type?: PokemonType | null;
  } | null;
  statusCured?: { target: "attacker" | "defender" | "both" } | null;
  weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
  clearSideHazards?: "attacker" | "defender";
  itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
  screensCleared?: "attacker" | "defender" | "both" | null;
  statStagesReset?: { target: "attacker" | "defender" | "both" } | null;
  statusCuredOnly?: { target: "attacker" | "defender" | "both" } | null;
  selfStatusInflicted?: PrimaryStatus | null;
  selfVolatileInflicted?: VolatileStatus | null;
  selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  typeChange?: { target: "attacker" | "defender"; types: readonly PokemonType[] } | null;
  tailwindSet?: { turnsLeft: number; side: "attacker" | "defender" } | null;
  trickRoomSet?: { turnsLeft: number } | null;
  volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  futureAttack?: { moveId: string; turnsLeft: number; sourceSide: 0 | 1 } | null;
  gravitySet?: boolean;
  forcedMoveSet?: {
    moveIndex: number;
    moveId: string;
    volatileStatus: VolatileStatus;
  } | null;
  itemConsumed?: boolean;
};

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
const GEN4_STATUS_IMMUNITIES: Record<string, readonly PokemonType[]> = {
  burn: ["fire"],
  poison: ["poison", "steel"],
  "badly-poisoned": ["poison", "steel"],
  freeze: ["ice"],
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
const ABILITY_STATUS_IMMUNITIES: Record<string, readonly string[]> = {
  immunity: ["poison", "badly-poisoned"],
  insomnia: ["sleep"],
  "vital-spirit": ["sleep"],
  limber: ["paralysis"],
  "water-veil": ["burn"],
  "magma-armor": ["freeze"],
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
export function isStatusBlockedByAbility(target: ActivePokemon, status: string): boolean {
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
const ABILITY_VOLATILE_IMMUNITIES: Record<string, readonly string[]> = {
  "inner-focus": ["flinch"],
  "own-tempo": ["confusion"],
  oblivious: ["infatuation"],
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
export function isVolatileBlockedByAbility(target: ActivePokemon, volatile: string): boolean {
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
  if (target.ability === "leaf-guard" && state?.weather?.type === "sun") {
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
const WEATHER_ROCK_ITEMS: Record<string, string> = {
  "damp-rock": "rain",
  "heat-rock": "sun",
  "smooth-rock": "sand",
  "icy-rock": "hail",
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
  if (isSecondary && defender?.ability === "shield-dust") {
    return false;
  }

  let effectiveChance = chance;

  // Serene Grace: double the secondary effect chance (cap at 100)
  // Source: pret/pokeplatinum — Serene Grace doubles percentChance
  if (attacker.ability === "serene-grace") {
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
        move.category !== "status" &&
        !rollEffectChance(effect.chance, rng, attacker, defender, true)
      ) {
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
      // Source: Showdown Gen 4 — Rock Head prevents recoil
      // Source: Bulbapedia — "Rock Head: Protects the Pokemon from recoil damage."
      if (attacker.ability === "rock-head") {
        break;
      }
      // Magic Guard: prevents recoil damage from moves (NOT Struggle recoil)
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents move recoil
      if (attacker.ability === "magic-guard") {
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
        move.category !== "status" &&
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
      const turns = attacker.pokemon.heldItem === "light-clay" ? 8 : 5;
      result.screenSet = { screen: screenName, turnsLeft: turns, side: "attacker" };
      const displayName = screenName === "reflect" ? "Reflect" : "Light Screen";
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
      result.volatileInflicted = "protect";
      break;
    }

    case "custom": {
      handleCustomEffect(move, result, context);
      break;
    }

    case "remove-hazards": {
      // Intentionally no-op: Rapid Spin is handled via "custom" case in handleCustomEffect.
      // Defog is handled in handleNullEffectMoves (it has effect: null in Gen 4 data).
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
  fly: "flying",
  bounce: "flying",
  dig: "underground",
  dive: "underwater",
  "shadow-force": "shadow-force-charging",
  "solar-beam": "charging",
  "skull-bash": "charging",
  "razor-wind": "charging",
  "sky-attack": "charging",
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
  "shadow-force": "{pokemon} vanished!",
  "solar-beam": "{pokemon} is absorbing sunlight!",
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

  const volatile = TWO_TURN_VOLATILE_MAP[move.id] ?? "charging";

  // SolarBeam in sun: skip charge, attack immediately
  // Source: Showdown Gen 4 mod — SolarBeam fires immediately in sun
  // Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
  if (move.id === "solar-beam" && context.state.weather?.type === "sun") {
    return; // No forcedMoveSet — engine proceeds with the attack immediately
  }

  // Power Herb: skip charge, consume the item
  // Source: Showdown Gen 4 mod — Power Herb allows immediate attack
  // Source: Bulbapedia — "Power Herb allows the holder to skip the charge turn of a
  //   two-turn move. It is consumed after use."
  if (attacker.pokemon.heldItem === "power-herb") {
    result.itemConsumed = true;
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
// Custom Move Effect Handler
// ---------------------------------------------------------------------------

/**
 * Handle custom move effects specific to Gen 4.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */
function handleCustomEffect(
  move: MoveData,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, defender, state } = context;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const defenderName = defender.pokemon.nickname ?? "The foe";

  switch (move.id) {
    case "belly-drum": {
      // Lose 50% max HP, maximize Attack to +6
      // Source: Showdown Gen 4 — Belly Drum cuts HP and maximizes Attack
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const halfHp = Math.floor(maxHp / 2);
      if (attacker.pokemon.currentHp > halfHp) {
        result.recoilDamage = halfHp;
        result.statChanges.push({
          target: "attacker",
          stat: "attack",
          stages: 6 - attacker.statStages.attack,
        });
        result.messages.push(`${attackerName} cut its own HP and maximized Attack!`);
      } else {
        result.messages.push(`${attackerName} is too weak to use Belly Drum!`);
      }
      break;
    }

    case "rapid-spin": {
      // Remove leech-seed and binding volatiles from user, hazards from user's side
      // Source: Showdown Gen 4 — Rapid Spin clears Spikes, Stealth Rock, Toxic Spikes,
      //   Leech Seed, and Wrap/Bind
      result.volatilesToClear = [
        { target: "attacker", volatile: "leech-seed" },
        { target: "attacker", volatile: "bound" },
      ];
      result.clearSideHazards = "attacker";
      result.messages.push(`${attackerName} blew away leech seed and spikes!`);
      break;
    }

    case "mean-look":
    case "spider-web":
    case "block": {
      // Trapping effect — prevents switching
      // Source: Showdown Gen 4 — Mean Look / Spider Web / Block set TRAPPED flag
      result.volatileInflicted = "trapped";
      break;
    }

    case "thief":
    case "covet": {
      // Steal defender's item if user has no item
      // Source: Showdown Gen 4 — Thief/Covet takes held item
      if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
        result.itemTransfer = { from: "defender", to: "attacker" };
        result.messages.push(
          `${attackerName} stole ${defenderName}'s ${defender.pokemon.heldItem}!`,
        );
      }
      break;
    }

    case "baton-pass": {
      // Switch out preserving stat changes and volatile statuses
      // Source: Showdown Gen 4 — Baton Pass
      result.switchOut = true;
      break;
    }

    case "explosion":
    case "self-destruct": {
      // Self-KO after damage
      // Source: Showdown Gen 4 — Explosion/Self-Destruct
      result.selfFaint = true;
      result.messages.push(`${attackerName} exploded!`);
      break;
    }

    case "haze": {
      // Reset stat stages for both Pokemon
      // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
      result.statStagesReset = { target: "both" };
      result.messages.push("All stat changes were eliminated!");
      break;
    }

    case "rest": {
      // Full heal + self-inflict sleep
      // Source: Showdown Gen 4 — Rest heals fully and inflicts sleep (2 turns)
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = maxHp;
      result.selfStatusInflicted = "sleep";
      result.messages.push(`${attackerName} went to sleep and became healthy!`);
      break;
    }

    case "heal-bell":
    case "aromatherapy": {
      // Cure all party members' status conditions (attacker's side only — not the foe's party)
      // Source: Showdown Gen 4 — Heal Bell / Aromatherapy cures user's team status
      // Source: Bulbapedia — "Heal Bell cures all status conditions of the user and the user's party"
      result.statusCuredOnly = { target: "attacker" };
      const moveName = move.id === "heal-bell" ? "Heal Bell" : "Aromatherapy";
      result.messages.push(`A bell chimed! ${moveName} cured the team's status!`);
      break;
    }

    case "perish-song": {
      // Both Pokemon get Perish Song volatile (3-turn countdown)
      // Source: Showdown Gen 4 — Perish Song affects both sides
      // Source: Bulbapedia — Perish Song: "All Pokemon that hear this song will faint in 3 turns."
      result.selfVolatileInflicted = "perish-song";
      result.selfVolatileData = { turnsLeft: 3 };
      result.volatileInflicted = "perish-song";
      result.volatileData = { turnsLeft: 3 };
      result.messages.push("All Pokemon that heard the song will faint in 3 turns!");
      break;
    }

    case "pain-split": {
      // Average HP between attacker and defender: floor((a + b) / 2)
      // Source: Showdown Gen 4 — Pain Split averages current HP
      // Source: Bulbapedia — Pain Split: "The user and the target each have their HP
      // set to the average of the two Pokémon's HP values."
      const average = Math.floor((attacker.pokemon.currentHp + defender.pokemon.currentHp) / 2);
      const attackerDiff = average - attacker.pokemon.currentHp;
      const defenderDiff = defender.pokemon.currentHp - average;

      if (attackerDiff > 0) {
        // Attacker has LESS HP than average → attacker heals
        result.healAmount = attackerDiff;
        if (defenderDiff > 0) {
          // Defender has MORE HP than average → defender takes damage
          result.customDamage = { target: "defender", amount: defenderDiff, source: "pain-split" };
        }
      } else if (attackerDiff < 0) {
        // Attacker has MORE HP than average → attacker takes damage
        // Source: Showdown Gen 4 — Pain Split reduces attacker HP when above average
        result.customDamage = {
          target: "attacker",
          amount: Math.abs(attackerDiff),
          source: "pain-split",
        };
        // Note: Defender gains HP when below average, but MoveEffectResult has no
        // "heal defender" field. Defender-side healing in this case requires an engine
        // extension (tracked as a known limitation).
      }
      result.messages.push("The battlers shared their pain!");
      break;
    }

    case "moonlight":
    case "morning-sun":
    case "synthesis": {
      // Weather-dependent healing
      // Source: Showdown Gen 4 — sun: 2/3, rain/sand/hail: 1/4, else: 1/2
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
      break;
    }

    case "wish": {
      // Set Wish to heal next turn — engine handles Wish tracking via side state
      // Source: Showdown Gen 4 — Wish heals at end of next turn
      result.messages.push(`${attackerName} made a wish!`);
      break;
    }

    case "safeguard": {
      // Set Safeguard on attacker's side (5 turns)
      // Source: Showdown Gen 4 — Safeguard prevents status for 5 turns
      result.screenSet = { screen: "safeguard", turnsLeft: 5, side: "attacker" };
      result.messages.push(`${attackerName}'s team became cloaked in a mystical veil!`);
      break;
    }

    case "lucky-chant": {
      // Set Lucky Chant on attacker's side (5 turns)
      // Source: Showdown Gen 4 — Lucky Chant prevents crits for 5 turns
      result.screenSet = { screen: "lucky-chant", turnsLeft: 5, side: "attacker" };
      result.messages.push(`${attackerName}'s team is shielded from critical hits!`);
      break;
    }

    case "ingrain": {
      // Root into the ground — heal each turn, cannot switch
      // Source: Showdown Gen 4 — Ingrain volatile
      result.selfVolatileInflicted = "ingrain";
      result.messages.push(`${attackerName} planted its roots!`);
      break;
    }

    case "aqua-ring": {
      // Surround with water — heal each turn
      // Source: Showdown Gen 4 — Aqua Ring volatile
      result.selfVolatileInflicted = "aqua-ring";
      result.messages.push(`${attackerName} surrounded itself with a veil of water!`);
      break;
    }

    case "refresh": {
      // Cure own status
      // Source: Showdown Gen 4 — Refresh cures burn/poison/paralysis
      if (attacker.pokemon.status) {
        result.statusCuredOnly = { target: "attacker" };
        result.messages.push(`${attackerName} cured its status condition!`);
      }
      break;
    }

    case "destiny-bond": {
      // Destiny Bond: if the user faints from the opponent's next move, the attacker faints too
      // Source: Bulbapedia — "If the user faints after using Destiny Bond, the Pokemon
      //   that KO'd it also faints"
      // Source: Showdown Gen 4 — sets destiny-bond volatile
      result.selfVolatileInflicted = "destiny-bond";
      result.messages.push(`${attackerName} is trying to take its foe down with it!`);
      break;
    }

    case "future-sight": {
      // Future Sight: schedules a hit 3 end-of-turns later; damage calculated at hit time in Gen 4
      // Source: Bulbapedia — "Future Sight hits 2 turns after being used (3 EoT ticks)"
      // Source: Showdown Gen 4 — Future Sight schedules future attack
      const attackerSideIndex = state.sides.findIndex((side) =>
        side.active.some((a) => a?.pokemon === attacker.pokemon),
      );

      // Fail if there's already a future attack pending on the target's side
      // Source: Showdown Gen 4 — Future Sight fails if a future attack is already set
      const targetSideIndex = attackerSideIndex === 0 ? 1 : 0;
      if (state.sides[targetSideIndex].futureAttack) {
        result.messages.push("But it failed!");
        break;
      }

      result.futureAttack = {
        moveId: "future-sight",
        turnsLeft: 3,
        sourceSide: (attackerSideIndex === 0 ? 0 : 1) as 0 | 1,
      };
      result.messages.push(`${attackerName} foresaw an attack!`);
      break;
    }

    default: {
      // Unknown custom effect — no-op
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Null-Effect Move Handler
// ---------------------------------------------------------------------------

/**
 * Handle moves with `effect: null` in the Gen 4 data that still need handlers.
 *
 * These moves have null effects in the JSON data but have Gen 4-specific behaviors
 * that must be implemented in the ruleset.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 */
function handleNullEffectMoves(
  moveId: string,
  result: MutableResult,
  context: MoveEffectContext,
): void {
  const { attacker, state } = context;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  switch (moveId) {
    case "stealth-rock": {
      // Place Stealth Rock on the foe's side
      // Source: Showdown Gen 4 — Stealth Rock entry hazard
      // Source: Bulbapedia — Stealth Rock introduced in Gen 4
      const attackerSideIndex = state.sides.findIndex((side) =>
        side.active.some((a) => a?.pokemon === attacker.pokemon),
      );
      const targetSide = (attackerSideIndex === 0 ? 1 : 0) as 0 | 1;
      result.hazardSet = { hazard: "stealth-rock", targetSide };
      result.messages.push("Pointed stones float in the air around the foe!");
      break;
    }

    case "toxic-spikes": {
      // Place Toxic Spikes on the foe's side
      // Source: Showdown Gen 4 — Toxic Spikes entry hazard
      // Source: Bulbapedia — Toxic Spikes introduced in Gen 4
      const attackerSideIndex = state.sides.findIndex((side) =>
        side.active.some((a) => a?.pokemon === attacker.pokemon),
      );
      const targetSide = (attackerSideIndex === 0 ? 1 : 0) as 0 | 1;
      result.hazardSet = { hazard: "toxic-spikes", targetSide };
      result.messages.push("Poison spikes were scattered on the ground!");
      break;
    }

    case "trick-room": {
      // Toggle Trick Room: if already active, end it; otherwise start it (5 turns)
      // Source: Showdown Gen 4 — Trick Room reverses speed order for 5 turns
      if (context.state.trickRoom.active) {
        // turnsLeft: 0 signals the engine to deactivate Trick Room
        result.trickRoomSet = { turnsLeft: 0 };
        result.messages.push("The twisted dimensions returned to normal!");
      } else {
        result.trickRoomSet = { turnsLeft: 5 };
        result.messages.push("The dimensions were twisted!");
      }
      break;
    }

    case "tailwind": {
      // Set Tailwind on attacker's side (3 turns in Gen 4)
      // Source: Showdown Gen 4 — Tailwind lasts 3 turns (including the turn it's used)
      // Source: Bulbapedia — Tailwind duration is 3 turns in Gen 4
      // Note: Gen 5+ extended Tailwind to 4 turns
      result.tailwindSet = { turnsLeft: 3, side: "attacker" };
      result.messages.push(`${attackerName} whipped up a tailwind!`);
      break;
    }

    case "defog": {
      // Clear defender's hazards + screens; -1 evasion on defender
      // Source: Showdown Gen 4 — Defog clears hazards, screens, and lowers evasion
      // Source: Bulbapedia — Defog lowers target's evasion by 1 and clears hazards
      result.clearSideHazards = "defender";
      result.screensCleared = "defender";
      result.statChanges.push({ target: "defender", stat: "evasion", stages: -1 });
      result.messages.push("It blew away the hazards!");
      break;
    }

    case "roost": {
      // Heal 50% max HP + temporarily remove Flying type for this turn
      // Source: Showdown Gen 4 — Roost heals 50% and removes Flying type
      // Source: Bulbapedia — Roost: the user temporarily loses its Flying type
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = Math.floor(maxHp / 2);
      // Remove Flying type for this turn (if the attacker is Flying-type)
      if (attacker.types.includes("flying")) {
        const newTypes = attacker.types.filter((t) => t !== "flying");
        result.typeChange = {
          target: "attacker",
          types: newTypes.length > 0 ? newTypes : ["normal"],
        };
      }
      result.messages.push(`${attackerName} landed and recovered health!`);
      break;
    }

    case "haze": {
      // Reset stat stages for both Pokemon
      // Source: Showdown Gen 4 — Haze resets all stat changes
      result.statStagesReset = { target: "both" };
      result.messages.push("All stat changes were eliminated!");
      break;
    }

    case "rest": {
      // Full heal + self-inflict sleep
      // Source: Showdown Gen 4 — Rest heals fully and inflicts 2-turn sleep
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      result.healAmount = maxHp;
      result.selfStatusInflicted = "sleep";
      result.messages.push(`${attackerName} went to sleep and became healthy!`);
      break;
    }

    case "safeguard": {
      // Set Safeguard on attacker's side (5 turns)
      // Source: Showdown Gen 4 — Safeguard prevents status for 5 turns
      result.screenSet = { screen: "safeguard", turnsLeft: 5, side: "attacker" };
      result.messages.push(`${attackerName}'s team became cloaked in a mystical veil!`);
      break;
    }

    case "heal-bell":
    case "aromatherapy": {
      // Cure all party members' status conditions (attacker's side only)
      // Source: Showdown Gen 4 — Heal Bell / Aromatherapy cures user's team status
      // Source: Bulbapedia — cures user's party, not the foe's party
      result.statusCuredOnly = { target: "attacker" };
      const moveName = moveId === "heal-bell" ? "Heal Bell" : "Aromatherapy";
      result.messages.push(`A bell chimed! ${moveName} cured the team's status!`);
      break;
    }

    case "wish": {
      // Set Wish to heal next turn — engine handles Wish tracking
      // Source: Showdown Gen 4 — Wish heals at end of next turn
      result.messages.push(`${attackerName} made a wish!`);
      break;
    }

    case "lucky-chant": {
      // Set Lucky Chant on attacker's side (5 turns)
      // Source: Showdown Gen 4 — Lucky Chant prevents crits for 5 turns
      result.screenSet = { screen: "lucky-chant", turnsLeft: 5, side: "attacker" };
      result.messages.push(`${attackerName}'s team is shielded from critical hits!`);
      break;
    }

    case "block":
    case "mean-look":
    case "spider-web": {
      // Trapping effect — prevents switching
      // Source: Showdown Gen 4 — trap volatile
      result.volatileInflicted = "trapped";
      break;
    }

    case "ingrain": {
      // Root into the ground
      // Source: Showdown Gen 4 — Ingrain volatile
      result.selfVolatileInflicted = "ingrain";
      result.messages.push(`${attackerName} planted its roots!`);
      break;
    }

    case "aqua-ring": {
      // Surround with water — heal each turn
      // Source: Showdown Gen 4 — Aqua Ring volatile
      result.selfVolatileInflicted = "aqua-ring";
      result.messages.push(`${attackerName} surrounded itself with a veil of water!`);
      break;
    }

    case "refresh": {
      // Cure own status
      // Source: Showdown Gen 4 — Refresh cures burn/poison/paralysis
      if (attacker.pokemon.status) {
        result.statusCuredOnly = { target: "attacker" };
        result.messages.push(`${attackerName} cured its status condition!`);
      }
      break;
    }

    case "explosion":
    case "self-destruct": {
      // Self-KO after damage
      // Source: Showdown Gen 4 — Explosion/Self-Destruct
      result.selfFaint = true;
      result.messages.push(`${attackerName} exploded!`);
      break;
    }

    case "covet": {
      // Steal defender's item if user has no item
      // Source: Showdown Gen 4 — Covet takes held item (same as Thief)
      const { defender } = context;
      const dName = defender.pokemon.nickname ?? "The foe";
      if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
        result.itemTransfer = { from: "defender", to: "attacker" };
        result.messages.push(`${attackerName} stole ${dName}'s ${defender.pokemon.heldItem}!`);
      }
      break;
    }

    case "gravity": {
      // Intensify gravity — engine applies the field state via gravitySet flag
      // Source: Showdown Gen 4 — Gravity lasts 5 turns, grounds all Pokemon
      // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Gravity_(move)
      result.gravitySet = true;
      result.messages.push("Gravity intensified!");
      break;
    }

    case "whirlwind":
    case "roar": {
      // Force switch — engine handles phazing logic
      // Source: Showdown Gen 4 — Whirlwind/Roar force random switch
      // Suction Cups: prevents forced switch effects (Whirlwind, Roar)
      // Source: Bulbapedia — Suction Cups: "Prevents the Pokemon from being forced to switch out"
      // Source: Showdown data/abilities.ts — Suction Cups onDragOut
      const { defender } = context;
      if (defender.ability === "suction-cups") {
        const dName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
        result.messages.push(`${dName} anchored itself with Suction Cups!`);
        break;
      }
      result.switchOut = true;
      break;
    }

    case "bind":
    case "wrap":
    case "fire-spin":
    case "clamp":
    case "whirlpool":
    case "sand-tomb":
    case "magma-storm": {
      // Binding moves: trap target for 4-5 turns (or 7 with Grip Claw).
      // Source: Showdown Gen 4 mod — binding moves set "bound" volatile with duration
      // Source: Bulbapedia — Binding moves last 4-5 turns in Gen 4 (2-5 in Gen 3);
      //   Grip Claw extends to 7 turns.
      const { attacker: bindAtk, defender: bindDef } = context;
      const defName = bindDef.pokemon.nickname ?? "The foe";
      if (bindDef.volatileStatuses.has("bound")) {
        break; // Already bound
      }
      // Grip Claw: binding lasts 7 turns instead of randomly 4-5
      // Source: Bulbapedia — Grip Claw: "Extends the duration of binding moves to 7 turns"
      // Source: Showdown Gen 4 mod — Grip Claw sets binding duration to 7
      const hasGripClaw = bindAtk.pokemon.heldItem === "grip-claw" && bindAtk.ability !== "klutz";
      const turnsLeft = hasGripClaw ? 7 : context.rng.int(4, 5);
      result.volatileInflicted = "bound";
      result.volatileData = { turnsLeft };
      result.messages.push(`${defName} was squeezed by ${moveId}!`);
      break;
    }

    case "power-swap": {
      // Swap Atk and SpAtk stat stages between attacker and defender.
      // Source: Showdown Gen 4 mod — Power Swap swaps Attack and SpAtk stat boosts/drops
      // Source: Bulbapedia — Power Swap: "The user swaps its Attack and Sp. Atk stat
      //   changes with the target's."
      const { attacker: pswAtk, defender: pswDef } = context;
      const pswAtkName = pswAtk.pokemon.nickname ?? "The Pokemon";

      const tempAtk = pswAtk.statStages.attack;
      const tempSpAtk = pswAtk.statStages.spAttack;
      pswAtk.statStages.attack = pswDef.statStages.attack;
      pswAtk.statStages.spAttack = pswDef.statStages.spAttack;
      pswDef.statStages.attack = tempAtk;
      pswDef.statStages.spAttack = tempSpAtk;

      result.messages.push(
        `${pswAtkName} switched all changes to its Attack and Sp. Atk with the target!`,
      );
      break;
    }

    case "guard-swap": {
      // Swap Def and SpDef stat stages between attacker and defender.
      // Source: Showdown Gen 4 mod — Guard Swap swaps Defense and SpDef stat boosts/drops
      // Source: Bulbapedia — Guard Swap: "The user swaps its Defense and Sp. Def stat
      //   changes with the target's."
      const { attacker: gswAtk, defender: gswDef } = context;
      const gswAtkName = gswAtk.pokemon.nickname ?? "The Pokemon";

      const tempDef = gswAtk.statStages.defense;
      const tempSpDef = gswAtk.statStages.spDefense;
      gswAtk.statStages.defense = gswDef.statStages.defense;
      gswAtk.statStages.spDefense = gswDef.statStages.spDefense;
      gswDef.statStages.defense = tempDef;
      gswDef.statStages.spDefense = tempSpDef;

      result.messages.push(
        `${gswAtkName} switched all changes to its Defense and Sp. Def with the target!`,
      );
      break;
    }

    case "heart-swap": {
      // Swap ALL stat stages between attacker and defender.
      // Source: Showdown Gen 4 mod — Heart Swap swaps all stat stage changes
      // Source: Bulbapedia — Heart Swap: "The user swaps all stat changes with the target."
      const { attacker: hswAtk, defender: hswDef } = context;
      const hswAtkName = hswAtk.pokemon.nickname ?? "The Pokemon";
      const allStats: Array<keyof typeof hswAtk.statStages> = [
        "attack",
        "defense",
        "spAttack",
        "spDefense",
        "speed",
        "accuracy",
        "evasion",
      ];
      for (const stat of allStats) {
        const temp = hswAtk.statStages[stat];
        hswAtk.statStages[stat] = hswDef.statStages[stat];
        hswDef.statStages[stat] = temp;
      }
      result.messages.push(`${hswAtkName} swapped all stat changes with the target!`);
      break;
    }

    case "counter": {
      // Counter: returns 2x the physical damage taken this turn
      // Source: Showdown Gen 4 sim — Counter returns double physical damage received this turn
      // Source: Bulbapedia — "Counter deals damage equal to twice the damage dealt by the
      //   last physical move that hit the user"
      if (attacker.lastDamageTaken <= 0 || attacker.lastDamageCategory !== "physical") {
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
      // Mirror Coat: returns 2x the special damage taken this turn
      // Source: Showdown Gen 4 sim — Mirror Coat returns double special damage received this turn
      // Source: Bulbapedia — "Mirror Coat deals damage equal to twice the damage dealt by the
      //   last special move that hit the user"
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

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute Gen 4 move effects after the damage step.
 *
 * This is the main entry point called by Gen4Ruleset.executeMoveEffect().
 * Handles data-driven effects via applyMoveEffect(), custom-tagged effects
 * via handleCustomEffect(), and null-effect moves via handleNullEffectMoves().
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
  if (context.move.id !== "destiny-bond" && context.attacker.volatileStatuses.has("destiny-bond")) {
    result.volatilesToClear = [
      ...(result.volatilesToClear ?? []),
      { target: "attacker", volatile: "destiny-bond" },
    ];
  }

  // Roost: heal + temporarily remove Flying type for this turn.
  // Roost has effect: { type: "heal", amount: 0.5 } in the Gen 4 data, so it routes
  // through applyMoveEffect's "heal" case which only heals — it cannot set typeChange.
  // We intercept by move ID before dispatch so both effects are applied correctly.
  // Source: Showdown Gen 4 — Roost heals 50% and removes Flying type
  // Source: Bulbapedia — Roost: the user temporarily loses its Flying type
  if (context.move.id === "roost") {
    const { attacker } = context;
    // Heal Block: prevent HP recovery
    // Source: Showdown Gen 4 mod — heal-block volatile gates all healing
    if (attacker.volatileStatuses.has("heal-block")) {
      const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
      result.messages.push(`${attackerName} is blocked from healing!`);
      return result;
    }
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    // Use the data's fraction if present (0.5), otherwise default to 0.5
    const healEffect = context.move.effect as { type: string; amount: number } | null;
    const healFraction = healEffect?.amount ?? 0.5;
    result.healAmount = Math.max(1, Math.floor(maxHp * healFraction));
    if (attacker.types.includes("flying")) {
      const newTypes = attacker.types.filter((t) => t !== "flying");
      result.typeChange = {
        target: "attacker",
        types: newTypes.length > 0 ? (newTypes as readonly PokemonType[]) : (["normal"] as const),
      };
    }
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    result.messages.push(`${attackerName} landed and recovered health!`);
    return result;
  }

  // Knock Off: custom handler — move data has effect: null so we handle by ID
  // Source: Showdown Gen 4 — Knock Off removes defender's item, no damage boost in Gen 4
  // (Gen 5+ adds 50% damage boost)
  // Note: Directly mutates defender.pokemon.heldItem (consistent with Gen 3 pattern).
  if (context.move.id === "knock-off") {
    if (context.defender.pokemon.heldItem) {
      const item = context.defender.pokemon.heldItem;
      context.defender.pokemon.heldItem = null;
      const defenderName = context.defender.pokemon.nickname ?? "The foe";
      result.messages.push(`${defenderName} lost its ${item}!`);
      // Unburden: if the defender had Unburden, set the volatile now that its item is gone
      // Source: Showdown Gen 4 mod — Unburden activates when item is knocked off
      if (
        context.defender.ability === "unburden" &&
        !context.defender.volatileStatuses.has("unburden")
      ) {
        context.defender.volatileStatuses.set("unburden", { turnsLeft: -1 });
      }
    }
    return result;
  }

  // Taunt: data has volatile-status "taunt" but we need to set turnsLeft randomly for Gen 4
  // Source: Showdown Gen 4 mod — `this.random(3, 6)` (exclusive max) = 3, 4, or 5 turns
  // Source: Bulbapedia — "Taunt lasts for 3–5 turns in Generation IV" (fixed to 3 in Gen 5+)
  if (context.move.id === "taunt") {
    result.volatileInflicted = "taunt";
    result.volatileData = { turnsLeft: context.rng.int(3, 5) };
    return result;
  }

  // Disable: data has volatile-status "disable" but we need turnsLeft and target's lastMoveUsed
  // Source: Showdown Gen 4 — Disable lasts 4-7 turns (this.random(4, 8) = exclusive upper bound)
  // Source: Bulbapedia — "Disable disables the target's last used move for 4-7 turns in Gen 4"
  if (context.move.id === "disable") {
    const { defender } = context;
    if (!defender.lastMoveUsed) {
      result.messages.push("But it failed!");
      return result;
    }
    // Disable fails if the target's last move is not a current move slot or has 0 PP
    // Source: Showdown Gen 4 — Disable fails if target's last move has 0 PP or is not in moveset
    const moveSlot = defender.pokemon.moves.find(
      (slot) => slot && slot.moveId === defender.lastMoveUsed,
    );
    if (!moveSlot || moveSlot.currentPP <= 0) {
      result.messages.push("But it failed!");
      return result;
    }
    result.volatileInflicted = "disable";
    result.volatileData = {
      turnsLeft: context.rng.int(4, 7),
      data: { moveId: defender.lastMoveUsed },
    };
    return result;
  }

  // Yawn: inflict "yawn" volatile on target — sleep comes at end of next turn
  // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at the end
  //   of the next turn"
  // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
  if (context.move.id === "yawn") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    // Yawn fails if target already has a primary status
    if (defender.pokemon.status !== null) {
      result.messages.push("But it failed!");
      return result;
    }
    // Yawn fails if target already has the yawn volatile
    if (defender.volatileStatuses.has("yawn")) {
      result.messages.push("But it failed!");
      return result;
    }
    // Yawn fails if target has Insomnia or Vital Spirit
    // Source: Showdown Gen 4 mod — Yawn blocked by sleep-preventing abilities
    if (defender.ability === "insomnia" || defender.ability === "vital-spirit") {
      result.messages.push("But it failed!");
      return result;
    }
    result.volatileInflicted = "yawn";
    result.volatileData = { turnsLeft: 1 };
    result.messages.push(`${defenderName} grew drowsy!`);
    return result;
  }

  // Encore: lock target into its last used move for 4-8 turns (Gen 4)
  // Source: Showdown Gen 4 mod — Encore duration: this.random(4, 9) (exclusive max) = 4..8 turns
  // Source: Bulbapedia — "Encore forces the target to repeat its last used move for 2-6 turns"
  // Note: Showdown Gen 4 uses 4-8 turns. Bulbapedia states 4-8 for Gen 4.
  if (context.move.id === "encore") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    // Fail if target has no last move or is already Encored
    if (!defender.lastMoveUsed || defender.volatileStatuses.has("encore")) {
      result.messages.push("But it failed!");
      return result;
    }
    // Source: Showdown Gen 4 mod — Encore lasts 4-8 turns
    const turnsLeft = context.rng.int(4, 8);
    result.volatileInflicted = "encore";
    result.volatileData = { turnsLeft, data: { moveId: defender.lastMoveUsed } };
    result.messages.push(`${defenderName} got an encore!`);
    return result;
  }

  // Heal Block: prevent HP recovery for 5 turns
  // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
  // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
  if (context.move.id === "heal-block") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    if (defender.volatileStatuses.has("heal-block")) {
      result.messages.push("But it failed!");
      return result;
    }
    result.volatileInflicted = "heal-block";
    result.volatileData = { turnsLeft: 5 };
    result.messages.push(`${defenderName} was prevented from healing!`);
    return result;
  }

  // Embargo: prevent item use for 5 turns
  // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
  // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
  if (context.move.id === "embargo") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    if (defender.volatileStatuses.has("embargo")) {
      result.messages.push("But it failed!");
      return result;
    }
    result.volatileInflicted = "embargo";
    result.volatileData = { turnsLeft: 5 };
    result.messages.push(`${defenderName} can't use items!`);
    return result;
  }

  // Worry Seed: change target's ability to Insomnia
  // Source: Bulbapedia — Worry Seed: "Changes the target's Ability to Insomnia"
  // Source: Showdown Gen 4 mod — Worry Seed fails vs Insomnia, Truant, Multitype
  if (context.move.id === "worry-seed") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    const failAbilities = ["insomnia", "truant", "multitype"];
    if (failAbilities.includes(defender.ability ?? "")) {
      result.messages.push("But it failed!");
      return result;
    }
    defender.ability = "insomnia";
    // If target is asleep, Insomnia immediately wakes it
    // Source: Showdown Gen 4 mod — Worry Seed cures sleep if the new ability blocks it
    if (defender.pokemon.status === "sleep") {
      defender.pokemon.status = null;
      defender.volatileStatuses.delete("sleep-counter");
      result.messages.push(`${defenderName}'s ability changed to Insomnia and it woke up!`);
    } else {
      result.messages.push(`${defenderName}'s ability changed to Insomnia!`);
    }
    return result;
  }

  // Gastro Acid: suppress target's ability (set to empty string)
  // Source: Bulbapedia — Gastro Acid: "suppresses the target's ability"
  // Source: Showdown Gen 4 mod — Gastro Acid fails vs Multitype
  if (context.move.id === "gastro-acid") {
    const { defender } = context;
    const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    if (defender.ability === "multitype") {
      result.messages.push("But it failed!");
      return result;
    }
    // Suppress ability by clearing it (persists until switch-out)
    // Source: Showdown Gen 4 mod — Gastro Acid sets suppressedAbility
    defender.ability = "";
    result.messages.push(`${defenderName}'s ability was suppressed!`);
    return result;
  }

  // Sucker Punch: fails if the target is not about to use a damaging move this turn.
  // Sucker Punch has +1 priority so it normally resolves before the target acts.
  // We check turnHistory for the current turn's actions (set by the engine before
  // action resolution) to determine whether the target selected a damaging move.
  // If turnHistory doesn't contain the current turn yet (engine hasn't recorded it),
  // fall back to checking whether the defender has a pending move action.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch onTry: fails if
  //   target is not using a damaging move or has already moved
  // Source: Bulbapedia — "Sucker Punch will fail if the target does not select a
  //   move that deals damage, or if the target moves before the user."
  if (context.move.id === "sucker-punch") {
    const { defender, state } = context;
    const defenderSideIndex = state.sides.findIndex((side) =>
      side.active.some((a) => a?.pokemon === defender.pokemon),
    );

    // If the defender already moved this turn, Sucker Punch fails (target acted first).
    // Source: Showdown Gen 4 — Sucker Punch fails if target already moved
    if (defender.movedThisTurn) {
      result.messages.push("But it failed!");
      return result;
    }

    // Check the current turn's recorded actions to see if the defender selected
    // a damaging move. The engine records actions in turnHistory at end of turn;
    // for mid-turn checking we look at the latest turnHistory entry matching the
    // current turn number.
    const currentTurnRecord = state.turnHistory.find((r) => r.turn === state.turnNumber);
    if (currentTurnRecord) {
      const defenderAction = currentTurnRecord.actions.find((a) => a.side === defenderSideIndex);
      // Fail if the defender didn't select a move action (e.g., switching)
      if (!defenderAction || defenderAction.type !== "move") {
        result.messages.push("But it failed!");
        return result;
      }
      // The defender selected a move action — check if it's a damaging move.
      // We need to verify the move category. Since we only have the moveIndex,
      // we check the defender's move slot. Status moves cause Sucker Punch to fail.
      const defMoveAction = defenderAction as MoveAction;
      const defMoveSlot = defender.pokemon.moves[defMoveAction.moveIndex];
      if (defMoveSlot) {
        // Look up the move in the defender's active moveset metadata.
        // Since we can't call DataManager from here, we use a heuristic:
        // if the move is known to be status (the engine should tag this),
        // Sucker Punch fails. For now, check if the defender's lastMoveUsed
        // has category info available via lastDamageCategory.
        // Note: Full integration requires engine to pass move metadata.
      }
    }

    // If we get here, Sucker Punch succeeds (default: damage already applied by engine)
    return result;
  }

  // Feint: only hits if the target has Protect or Detect active.
  // If the target is not protecting, Feint fails. If they are protecting,
  // Feint lifts the protection and deals damage normally.
  // Note: Detect and Protect both set the "protect" volatile in our system,
  // so we only need to check for "protect".
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Feint: breaks Protect/Detect
  // Source: Bulbapedia — "Feint will fail if the target has not used Protect or
  //   Detect during the turn. If successful, it lifts the effects of those moves."
  if (context.move.id === "feint") {
    const { defender } = context;
    const hasProtect = defender.volatileStatuses.has("protect");

    if (!hasProtect) {
      result.messages.push("But it failed!");
      return result;
    }

    // Remove the protection volatile
    // Source: Showdown Gen 4 — Feint removes Protect/Detect volatile
    result.volatilesToClear = [{ target: "defender", volatile: "protect" }];

    const defenderName = defender.pokemon.nickname ?? "The foe";
    result.messages.push(`${defenderName} fell for the feint!`);
    return result;
  }

  // Focus Punch: fails if the attacker took damage this turn before moving.
  // Focus Punch has -3 priority, so it always moves last. If the user was hit
  // by any damaging move before it could execute, Focus Punch fails.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Focus Punch: beforeTurn sets
  //   "focusing" message, onTry checks if user was hit
  // Source: Bulbapedia — "The user will lose its focus and be unable to attack
  //   if it is hit by a damaging move before it can execute Focus Punch."
  if (context.move.id === "focus-punch") {
    const { attacker } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

    // If the attacker took damage this turn, Focus Punch fails
    // Source: Showdown Gen 4 — Focus Punch fails if pokemon.lastDamageTaken > 0
    if (attacker.lastDamageTaken > 0) {
      result.messages.push(`${attackerName} lost its focus and couldn't move!`);
      return result;
    }

    // Otherwise Focus Punch succeeds — damage was already applied by engine
    return result;
  }

  // Trick / Switcheroo: swap held items between attacker and defender.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Trick/Switcheroo swap items
  // Source: Bulbapedia — "The user swaps held items with the target"
  // Fails if: both have no item, target has Sticky Hold, either has Multitype,
  //   or either holds a Mail or Griseous Orb.
  if (context.move.id === "trick" || context.move.id === "switcheroo") {
    const { attacker, defender } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const defenderName = defender.pokemon.nickname ?? "The foe";

    // Fail if neither Pokemon is holding an item
    // Source: Showdown Gen 4 — Trick fails if both have no item
    if (!attacker.pokemon.heldItem && !defender.pokemon.heldItem) {
      result.messages.push("But it failed!");
      return result;
    }

    // Fail if target has Sticky Hold
    // Source: Showdown data/abilities.ts — Sticky Hold blocks item removal
    // Source: Bulbapedia — Sticky Hold prevents item removal by the foe
    if (defender.ability === "sticky-hold") {
      result.messages.push(`${defenderName}'s Sticky Hold made Trick fail!`);
      return result;
    }

    // Fail if either has Multitype (Arceus's plates are bound)
    // Source: Showdown Gen 4 — Trick fails if either has Multitype
    if (attacker.ability === "multitype" || defender.ability === "multitype") {
      result.messages.push("But it failed!");
      return result;
    }

    // Perform the item swap
    // Source: Showdown Gen 4 — item swap is direct mutation
    const attackerItem = attacker.pokemon.heldItem;
    const defenderItem = defender.pokemon.heldItem;
    attacker.pokemon.heldItem = defenderItem;
    defender.pokemon.heldItem = attackerItem;

    result.itemTransfer = { from: "defender", to: "attacker" };

    if (attackerItem && defenderItem) {
      result.messages.push(`${attackerName} switched items with ${defenderName}!`);
    } else if (defenderItem) {
      result.messages.push(`${attackerName} obtained ${defenderItem} from ${defenderName}!`);
    } else if (attackerItem) {
      result.messages.push(`${attackerName} gave ${attackerItem} to ${defenderName}!`);
    }

    // Unburden: if either Pokemon had an item and now doesn't, and has Unburden, activate it.
    // Source: Showdown Gen 4 mod — Unburden activates when item is lost via Trick/Switcheroo
    if (
      attackerItem &&
      !attacker.pokemon.heldItem &&
      attacker.ability === "unburden" &&
      !attacker.volatileStatuses.has("unburden")
    ) {
      attacker.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }
    if (
      defenderItem &&
      !defender.pokemon.heldItem &&
      defender.ability === "unburden" &&
      !defender.volatileStatuses.has("unburden")
    ) {
      defender.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }

    return result;
  }

  // Doom Desire: schedule a delayed 2-turn Steel-type future attack.
  // Identical pattern to Future Sight but with Steel type and 120 power.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Doom Desire: future attack
  // Source: Bulbapedia — "Doom Desire deals typeless damage 2 turns after being used.
  //   It has 120 base power and is Steel-type in Gen 4."
  // Note: In Gen 4, Future Sight and Doom Desire deal typeless damage at hit time
  //   (type chart is not applied). The type is stored for completeness.
  if (context.move.id === "doom-desire") {
    const { attacker, state } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const attackerSideIndex = state.sides.findIndex((side) =>
      side.active.some((a) => a?.pokemon === attacker.pokemon),
    );

    // Fail if there's already a future attack pending on the target's side
    // Source: Showdown Gen 4 — Doom Desire fails if a future attack is already set
    const targetSideIndex = attackerSideIndex === 0 ? 1 : 0;
    if (state.sides[targetSideIndex].futureAttack) {
      result.messages.push("But it failed!");
      return result;
    }

    result.futureAttack = {
      moveId: "doom-desire",
      turnsLeft: 3,
      sourceSide: (attackerSideIndex === 0 ? 0 : 1) as 0 | 1,
    };
    result.messages.push(`${attackerName} chose Doom Desire as its destiny!`);
    return result;
  }

  // Magnet Rise: apply "magnet-rise" volatile to user for 5 turns.
  // Fails if user is already under Gravity or already has Magnet Rise.
  // Source: Showdown Gen 4 mod — Magnet Rise sets volatile on self for 5 turns
  // Source: Bulbapedia — Magnet Rise: "The user levitates using electrically generated
  //   magnetism for five turns." Fails under Gravity.
  if (context.move.id === "magnet-rise") {
    const { attacker, state } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    // Fail if Gravity is active
    if (state.gravity?.active) {
      result.messages.push("But it failed!");
      return result;
    }
    // Fail if already has Magnet Rise
    if (attacker.volatileStatuses.has("magnet-rise")) {
      result.messages.push("But it failed!");
      return result;
    }
    result.selfVolatileInflicted = "magnet-rise";
    result.selfVolatileData = { turnsLeft: 5 };
    result.messages.push(`${attackerName} levitated with electromagnetism!`);
    return result;
  }

  // Acupressure: +2 to a random stat stage (from stats not already at +6).
  // Source: Showdown Gen 4 mod — Acupressure boosts a random stat by 2
  // Source: Bulbapedia — Acupressure: "Sharply raises one of the user's stats at random"
  if (context.move.id === "acupressure") {
    const { attacker, rng } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const allStats: BattleStat[] = [
      "attack",
      "defense",
      "spAttack",
      "spDefense",
      "speed",
      "accuracy",
      "evasion",
    ];
    const boostableStats = allStats.filter((stat) => attacker.statStages[stat] < 6);
    if (boostableStats.length === 0) {
      result.messages.push("But it failed!");
      return result;
    }
    const chosenIndex = rng.int(0, boostableStats.length - 1);
    const chosen = boostableStats[chosenIndex] as BattleStat;
    result.statChanges.push({ target: "attacker", stat: chosen, stages: 2 });
    result.messages.push(`${attackerName}'s ${chosen} rose sharply!`);
    return result;
  }

  // Curse (Ghost-type): user loses 1/2 max HP, target gets "curse" volatile.
  // Non-Ghost Curse (stat changes) is handled by data-driven effect (stat-change type).
  // Ghost-type Curse is intercepted by ID + type check.
  // Source: Showdown Gen 4 mod — Ghost Curse: user sacrifices 1/2 HP, target gets cursed
  // Source: Bulbapedia — Curse: "If the user is a Ghost-type, the user loses 1/2 of its
  //   maximum HP and the target is cursed."
  if (context.move.id === "curse") {
    const { attacker, defender } = context;
    if (attacker.types.includes("ghost")) {
      const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
      const defenderName = defender.pokemon.nickname ?? "The foe";
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const hpCost = Math.max(1, Math.floor(maxHp / 2));
      // Already cursed — fail
      if (defender.volatileStatuses.has("curse")) {
        result.messages.push("But it failed!");
        return result;
      }
      result.customDamage = { target: "attacker", amount: hpCost, source: "curse" };
      result.volatileInflicted = "curse";
      result.messages.push(`${attackerName} cut its own HP and laid a curse on ${defenderName}!`);
      return result;
    }
    // Non-Ghost: fall through to data-driven effect (stat changes +Atk +Def -Spd)
  }

  // Natural Gift: type + power determined by held berry, berry consumed after use.
  // Fails if user has no held item, held item is not a berry, user has Klutz, or Embargo.
  // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Natural_Gift_(move)
  // Source: Showdown sim/battle-actions.ts Gen 4 — Natural Gift type/power lookup
  if (context.move.id === "natural-gift") {
    const { attacker } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const heldItem = attacker.pokemon.heldItem;
    // Fails if no held item, not a berry, Klutz, or Embargo
    if (
      !heldItem ||
      !NATURAL_GIFT_TABLE[heldItem] ||
      attacker.ability === "klutz" ||
      attacker.volatileStatuses.has("embargo")
    ) {
      result.messages.push("But it failed!");
      return result;
    }
    const berryData = NATURAL_GIFT_TABLE[heldItem];
    // Do NOT set customDamage — damage should go through the normal damage calc path.
    // The engine calls calculateDamage() before executeMoveEffect(), so the move's
    // base power and type in the data determine the damage output.
    // Source: Showdown Gen 4 — Natural Gift uses onModifyMove to set base power/type
    result.itemConsumed = true;
    result.messages.push(
      `${attackerName} used Natural Gift! (${berryData.type} / ${berryData.power} BP)`,
    );
    return result;
  }

  // Fling: throw held item at target for damage based on item's Fling power, item consumed.
  // Fails if user has no held item, item has no Fling power, user has Klutz, or Embargo.
  // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Fling_(move)
  // Source: Showdown sim/battle-actions.ts Gen 4 — Fling power lookup
  if (context.move.id === "fling") {
    const { attacker } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const heldItem = attacker.pokemon.heldItem;
    if (!heldItem || attacker.ability === "klutz" || attacker.volatileStatuses.has("embargo")) {
      result.messages.push("But it failed!");
      return result;
    }
    const flingPower = getFlingPower(heldItem);
    if (flingPower === 0) {
      result.messages.push("But it failed!");
      return result;
    }
    // Do NOT set customDamage — damage should go through the normal damage calc path.
    // The engine calls calculateDamage() before executeMoveEffect(), so the move's
    // base power in the data determines the damage output.
    // Source: Showdown Gen 4 — Fling uses onModifyMove to set base power
    result.itemConsumed = true;
    result.messages.push(`${attackerName} flung its ${heldItem}!`);
    return result;
  }

  // Pluck / Bug Bite: after dealing damage, steal and activate target's berry.
  // These are damaging moves (effect: null in data) that consume the target's berry.
  // Source: Bulbapedia — Pluck: "steals the target's held Berry if it is holding one"
  // Source: Bulbapedia — Bug Bite: same mechanic as Pluck
  // Source: Showdown sim/battle-actions.ts Gen 4 — Pluck/Bug Bite berry steal
  if (context.move.id === "pluck" || context.move.id === "bug-bite") {
    const { attacker, defender } = context;
    const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
    const defenderName = defender.pokemon.nickname ?? "The foe";
    const defenderItem = defender.pokemon.heldItem;
    // Check if defender holds a berry (berry IDs end with "-berry")
    if (defenderItem && defenderItem.endsWith("-berry")) {
      // Steal and consume the berry
      const stolenBerry = defenderItem;
      defender.pokemon.heldItem = null;
      // Apply the berry's effect to the attacker (simulate eating it)
      // For healing berries, we heal the attacker; for status berries, we cure attacker's status
      applyBerryEffectToAttacker(stolenBerry, attacker, result);
      result.messages.push(`${attackerName} stole and ate ${defenderName}'s ${stolenBerry}!`);
      // Unburden: if the defender had Unburden, set the volatile
      if (defender.ability === "unburden" && !defender.volatileStatuses.has("unburden")) {
        defender.volatileStatuses.set("unburden", { turnsLeft: -1 });
      }
    }
    // Even if no berry was stolen, the move's damage already happened (effect: null)
    return result;
  }

  // Handle null-effect moves (stealth-rock, toxic-spikes, trick-room, etc.)
  if (!context.move.effect) {
    handleNullEffectMoves(context.move.id, result, context);
    applyHealBlockGate(result, context);
    return result;
  }

  applyMoveEffect(context.move.effect, context.move, result, context);

  applyHealBlockGate(result, context);

  return result;
}

/**
 * Heal Block gate: if the attacker has heal-block, prevent HP recovery.
 * Called after both null-effect and data-driven effect handling.
 *
 * Source: Showdown Gen 4 mod — heal-block volatile gates all healing
 * Source: Bulbapedia — Heal Block: "prevents the target from recovering HP"
 */
function applyHealBlockGate(result: MutableResult, context: MoveEffectContext): void {
  if (result.healAmount > 0 && context.attacker.volatileStatuses.has("heal-block")) {
    result.healAmount = 0;
    const attackerName = context.attacker.pokemon.nickname ?? "The Pokemon";
    result.messages.push(`${attackerName} is blocked from healing!`);
  }
}

// ---------------------------------------------------------------------------
// Natural Gift Berry Table (Gen 4)
// ---------------------------------------------------------------------------

/**
 * Natural Gift type and power for each berry in Gen 4.
 *
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Natural_Gift_(move)
 *   (Generation IV column)
 * Source: Showdown sim/items.ts — naturalGift field per berry item
 */
export const NATURAL_GIFT_TABLE: Readonly<Record<string, { type: PokemonType; power: number }>> = {
  "cheri-berry": { type: "fire", power: 60 },
  "chesto-berry": { type: "water", power: 60 },
  "pecha-berry": { type: "electric", power: 60 },
  "rawst-berry": { type: "grass", power: 60 },
  "aspear-berry": { type: "ice", power: 60 },
  "leppa-berry": { type: "fighting", power: 60 },
  "oran-berry": { type: "poison", power: 60 },
  "persim-berry": { type: "ground", power: 60 },
  "lum-berry": { type: "flying", power: 60 },
  "sitrus-berry": { type: "psychic", power: 60 },
  "figy-berry": { type: "bug", power: 60 },
  "wiki-berry": { type: "rock", power: 60 },
  "mago-berry": { type: "ghost", power: 60 },
  "aguav-berry": { type: "dragon", power: 60 },
  "iapapa-berry": { type: "dark", power: 60 },
  "razz-berry": { type: "steel", power: 60 },
  "bluk-berry": { type: "fire", power: 70 },
  "nanab-berry": { type: "water", power: 70 },
  "wepear-berry": { type: "electric", power: 70 },
  "pinap-berry": { type: "grass", power: 70 },
  "pomeg-berry": { type: "ice", power: 70 },
  "kelpsy-berry": { type: "fighting", power: 70 },
  "qualot-berry": { type: "poison", power: 70 },
  "hondew-berry": { type: "ground", power: 70 },
  "grepa-berry": { type: "flying", power: 70 },
  "tamato-berry": { type: "psychic", power: 70 },
  "cornn-berry": { type: "bug", power: 70 },
  "magost-berry": { type: "rock", power: 70 },
  "rabuta-berry": { type: "ghost", power: 70 },
  "nomel-berry": { type: "dragon", power: 70 },
  "spelon-berry": { type: "dark", power: 70 },
  "pamtre-berry": { type: "steel", power: 70 },
  "watmel-berry": { type: "fire", power: 80 },
  "durin-berry": { type: "water", power: 80 },
  "belue-berry": { type: "electric", power: 80 },
  "occa-berry": { type: "fire", power: 60 },
  "passho-berry": { type: "water", power: 60 },
  "wacan-berry": { type: "electric", power: 60 },
  "rindo-berry": { type: "grass", power: 60 },
  "yache-berry": { type: "ice", power: 60 },
  "chople-berry": { type: "fighting", power: 60 },
  "kebia-berry": { type: "poison", power: 60 },
  "shuca-berry": { type: "ground", power: 60 },
  "coba-berry": { type: "flying", power: 60 },
  "payapa-berry": { type: "psychic", power: 60 },
  "tanga-berry": { type: "bug", power: 60 },
  "charti-berry": { type: "rock", power: 60 },
  "kasib-berry": { type: "ghost", power: 60 },
  "haban-berry": { type: "dragon", power: 60 },
  "colbur-berry": { type: "dark", power: 60 },
  "babiri-berry": { type: "steel", power: 60 },
  "liechi-berry": { type: "grass", power: 80 },
  "ganlon-berry": { type: "ice", power: 80 },
  "salac-berry": { type: "fighting", power: 80 },
  "petaya-berry": { type: "electric", power: 80 },
  "apicot-berry": { type: "ground", power: 80 },
  "lansat-berry": { type: "flying", power: 80 },
  "starf-berry": { type: "psychic", power: 80 },
  "enigma-berry": { type: "bug", power: 80 },
  "micle-berry": { type: "rock", power: 80 },
  "custap-berry": { type: "ghost", power: 80 },
  "jaboca-berry": { type: "dragon", power: 80 },
  "rowap-berry": { type: "dark", power: 80 },
};

// ---------------------------------------------------------------------------
// Fling Power Table (Gen 4)
// ---------------------------------------------------------------------------

/**
 * Fling power for commonly flung items in Gen 4.
 * Items not in this table with "-berry" suffix default to 10.
 * Items not in this table without "-berry" suffix have fling power 0 (fail).
 *
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Fling_(move)
 *   (Generation IV column)
 * Source: Showdown sim/items.ts — fling field per item
 */
const FLING_POWER_TABLE: Readonly<Record<string, number>> = {
  "iron-ball": 130,
  "hard-stone": 100,
  "rare-bone": 100,
  "poison-barb": 70,
  "power-bracer": 70,
  "power-belt": 70,
  "power-lens": 70,
  "power-band": 70,
  "power-anklet": 70,
  "power-weight": 70,
  "macho-brace": 60,
  "adamant-orb": 60,
  "lustrous-orb": 60,
  "griseous-orb": 60,
  "damp-rock": 60,
  "heat-rock": 60,
  "icy-rock": 60,
  "smooth-rock": 60,
  "thick-club": 90,
  "lucky-punch": 40,
  stick: 60,
  "metal-coat": 30,
  "kings-rock": 30,
  "razor-fang": 30,
  "deep-sea-tooth": 90,
  "deep-sea-scale": 30,
  "light-ball": 30,
  "flame-orb": 30,
  "toxic-orb": 30,
  "black-belt": 30,
  "black-glasses": 30,
  charcoal: 30,
  "dragon-fang": 30,
  magnet: 30,
  "miracle-seed": 30,
  "mystic-water": 30,
  "never-melt-ice": 30,
  "sharp-beak": 30,
  "silk-scarf": 30,
  "silver-powder": 30,
  "soft-sand": 30,
  "spell-tag": 30,
  "twisted-spoon": 30,
  "choice-band": 10,
  "choice-scarf": 10,
  "choice-specs": 10,
  leftovers: 10,
  "life-orb": 30,
  "scope-lens": 30,
  "wide-lens": 10,
  "zoom-lens": 10,
  "expert-belt": 10,
  "focus-sash": 10,
  "focus-band": 10,
  "muscle-band": 10,
  "wise-glasses": 10,
  "razor-claw": 80,
  "shell-bell": 30,
  "soul-dew": 30,
  "white-herb": 10,
  "mental-herb": 10,
  "power-herb": 10,
};

/**
 * Get the Fling power for a given item.
 * Berries not in the explicit table default to 10.
 * Other items not in the table return 0 (Fling fails).
 *
 * Source: Showdown sim/items.ts — fling basePower default for berries
 */
export function getFlingPower(item: string): number {
  const explicit = FLING_POWER_TABLE[item];
  if (explicit !== undefined) return explicit;
  // All berries default to 10 power
  if (item.endsWith("-berry")) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// Pluck / Bug Bite — Berry Effect Application
// ---------------------------------------------------------------------------

/**
 * Apply a stolen berry's effect to the attacker via Pluck/Bug Bite.
 * This simulates the attacker immediately eating the berry.
 * Only the most common berry effects are implemented.
 *
 * Source: Showdown sim/battle-actions.ts — Pluck/Bug Bite activate berry for user
 * Source: Bulbapedia — Pluck/Bug Bite: "eats it immediately, gaining its effects"
 */
function applyBerryEffectToAttacker(
  berry: string,
  attacker: ActivePokemon,
  result: MutableResult,
): void {
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;

  switch (berry) {
    case "oran-berry":
      result.healAmount = Math.min(10, maxHp - attacker.pokemon.currentHp);
      break;
    case "sitrus-berry":
      result.healAmount = Math.max(1, Math.floor(maxHp / 4));
      break;
    case "lum-berry": {
      if (attacker.pokemon.status) {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    }
    case "cheri-berry":
      if (attacker.pokemon.status === "paralysis") {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    case "chesto-berry":
      if (attacker.pokemon.status === "sleep") {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    case "pecha-berry":
      if (attacker.pokemon.status === "poison" || attacker.pokemon.status === "badly-poisoned") {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    case "rawst-berry":
      if (attacker.pokemon.status === "burn") {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    case "aspear-berry":
      if (attacker.pokemon.status === "freeze") {
        result.statusCuredOnly = { target: "attacker" };
      }
      break;
    case "persim-berry":
      if (attacker.volatileStatuses.has("confusion")) {
        result.volatilesToClear = [
          ...(result.volatilesToClear ?? []),
          { target: "attacker", volatile: "confusion" as VolatileStatus },
        ];
      }
      break;
    case "leppa-berry":
      // Restore 10 PP to the first depleted move
      // Source: Showdown — Leppa Berry restores 10 PP
      break;
    // Stat pinch berries — boost stat immediately when eaten via Pluck/Bug Bite
    case "liechi-berry":
      result.statChanges.push({ target: "attacker", stat: "attack", stages: 1 });
      break;
    case "ganlon-berry":
      result.statChanges.push({ target: "attacker", stat: "defense", stages: 1 });
      break;
    case "salac-berry":
      result.statChanges.push({ target: "attacker", stat: "speed", stages: 1 });
      break;
    case "petaya-berry":
      result.statChanges.push({ target: "attacker", stat: "spAttack", stages: 1 });
      break;
    case "apicot-berry":
      result.statChanges.push({ target: "attacker", stat: "spDefense", stages: 1 });
      break;
    default:
      // Many berries have no in-battle effect when consumed this way
      break;
  }
}
