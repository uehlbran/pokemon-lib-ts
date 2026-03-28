import type {
  AbilityContext,
  AbilityEffect,
  AbilityResult,
  ActivePokemon,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, DataManager, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_CATEGORIES,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN4_ABILITY_IDS, GEN4_ITEM_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";
import { canInflictGen4Status, isVolatileBlockedByAbility } from "./Gen4MoveEffects";
import { GEN4_TYPE_CHART } from "./Gen4TypeChart";

const ABILITY_EFFECT = BATTLE_ABILITY_EFFECT_TYPES;
const EFFECT_TARGET = BATTLE_EFFECT_TARGETS;

// ─── Weather Suppression ────────────────────────────────────────────────────

/**
 * Abilities that suppress weather effects while the holder is on the field.
 *
 * Source: pret/pokeplatinum src/battle/battle_lib.c — Cloud Nine / Air Lock check
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
export const GEN4_WEATHER_SUPPRESSING_ABILITIES: ReadonlySet<string> = new Set([
  CORE_ABILITY_IDS.cloudNine,
  CORE_ABILITY_IDS.airLock,
]);

/**
 * Check if weather effects are suppressed by an active Pokemon's ability.
 *
 * Returns true if either the pokemon or opponent has Cloud Nine / Air Lock,
 * meaning weather should be treated as absent for damage, accuracy, speed,
 * and end-of-turn weather effects.
 *
 * Source: pret/pokeplatinum — WEATHER_HAS_EFFECT-equivalent checks
 * Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
 */
export function isWeatherSuppressedGen4(
  pokemon: ActivePokemon | undefined,
  opponent: ActivePokemon | undefined,
): boolean {
  if (pokemon && GEN4_WEATHER_SUPPRESSING_ABILITIES.has(pokemon.ability)) return true;
  if (opponent && GEN4_WEATHER_SUPPRESSING_ABILITIES.has(opponent.ability)) return true;
  return false;
}

/**
 * Check if any active Pokemon on the field suppresses weather.
 *
 * Used for turn-order speed checks (Chlorophyll/Swift Swim) and weather chip damage,
 * where we need to scan the entire field rather than just an attacker/defender pair.
 *
 * Source: pret/pokeplatinum — WEATHER_HAS_EFFECT check scans all active battlers
 */
export function isWeatherSuppressedOnField(state: {
  sides: { active: ({ ability: string } | null)[] }[];
}): boolean {
  for (const side of state.sides) {
    for (const active of side.active) {
      if (active && GEN4_WEATHER_SUPPRESSING_ABILITIES.has(active.ability)) return true;
    }
  }
  return false;
}

/**
 * Maps Plate held items to their corresponding PokemonType for Multitype.
 * Source: Showdown Gen 4 mod — Multitype plate-to-type mapping
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Plate_(item)
 */
export const PLATE_TO_TYPE: Record<string, PokemonType> = {
  [GEN4_ITEM_IDS.flamePlate]: CORE_TYPE_IDS.fire,
  [GEN4_ITEM_IDS.splashPlate]: CORE_TYPE_IDS.water,
  [GEN4_ITEM_IDS.zapPlate]: CORE_TYPE_IDS.electric,
  [GEN4_ITEM_IDS.meadowPlate]: CORE_TYPE_IDS.grass,
  [GEN4_ITEM_IDS.iciclePlate]: CORE_TYPE_IDS.ice,
  [GEN4_ITEM_IDS.fistPlate]: CORE_TYPE_IDS.fighting,
  [GEN4_ITEM_IDS.toxicPlate]: CORE_TYPE_IDS.poison,
  [GEN4_ITEM_IDS.earthPlate]: CORE_TYPE_IDS.ground,
  [GEN4_ITEM_IDS.skyPlate]: CORE_TYPE_IDS.flying,
  [GEN4_ITEM_IDS.mindPlate]: CORE_TYPE_IDS.psychic,
  [GEN4_ITEM_IDS.insectPlate]: CORE_TYPE_IDS.bug,
  [GEN4_ITEM_IDS.stonePlate]: CORE_TYPE_IDS.rock,
  [GEN4_ITEM_IDS.spookyPlate]: CORE_TYPE_IDS.ghost,
  [GEN4_ITEM_IDS.dracoPlate]: CORE_TYPE_IDS.dragon,
  [GEN4_ITEM_IDS.dreadPlate]: CORE_TYPE_IDS.dark,
  [GEN4_ITEM_IDS.ironPlate]: CORE_TYPE_IDS.steel,
};

/**
 * Gen 4 Abilities — applyAbility dispatch.
 *
 * Handles triggers that the battle engine currently calls:
 *   - "on-switch-in": Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
 *                     Download, Anticipation, Forewarn, Frisk, Slow Start, Trace,
 *                     Mold Breaker, Multitype
 *   - "on-turn-end": Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
 *                    Hydration, Shed Skin, Bad Dreams, Poison Heal
 *   - "on-contact": Static, Flame Body, Poison Point, Rough Skin, Effect Spore,
 *                   Cute Charm, Aftermath
 *   - "passive-immunity": Water Absorb, Volt Absorb, Motor Drive, Dry Skin,
 *                         Flash Fire (with volatile boost), Levitate
 *   - "on-flinch": Steadfast
 *   - "on-after-move-hit": (no Gen 4 abilities use this trigger)
 *
 * Stat-modifying abilities (damage calc / speed calc integration):
 *   - Solar Power: 1.5x SpAtk in sun (damage calc) + 1/8 HP chip (turn-end)
 *   - Flower Gift: 1.5x Atk + 1.5x SpDef in sun (damage calc)
 *   - Normalize: moves become Normal type (damage calc type override)
 *   - Scrappy: Normal/Fighting hit Ghost neutrally (damage calc effectiveness override)
 *   - Slow Start: halve Attack/Speed for 5 turns (volatile tracking + damage calc + speed calc)
 *   - Download: compare foe Def/SpDef, raise Atk or SpAtk (switch-in)
 *
 * Implemented elsewhere:
 *   - Leaf Guard: status prevention in sun (canInflictGen4Status in Gen4MoveEffects.ts)
 *   - Klutz: item suppression (Gen4Items.ts, Gen4DamageCalc.ts, Gen4Ruleset.ts)
 *   - Storm Drain: redirect-only in doubles, no singles effect (Gen 4); Water immunity is Gen 5+
 *   - Suction Cups: forced switch prevention (Gen4MoveEffects.ts Whirlwind/Roar handler)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ability trigger dispatch
 * Source: Bulbapedia — individual ability mechanics
 */

/**
 * Dispatch an ability trigger for Gen 4.
 *
 * @param trigger - The ability trigger type
 * @param context - The ability context
 * @param dataManager - Optional DataManager for move lookups (Anticipation, Forewarn)
 */
export function applyGen4Ability(
  trigger: AbilityTrigger,
  context: AbilityContext,
  dataManager?: DataManager,
): AbilityResult {
  const abilityId = context.pokemon.ability;

  switch (trigger) {
    case CORE_ABILITY_TRIGGER_IDS.onSwitchIn:
      return handleSwitchIn(abilityId, context, dataManager);
    case CORE_ABILITY_TRIGGER_IDS.onTurnEnd:
      return handleTurnEnd(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onContact:
      return handleOnContact(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.passiveImmunity:
      return handlePassiveImmunity(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onFlinch:
      return handleOnFlinch(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onAfterMoveHit:
      return handleOnAfterMoveHit(abilityId, context);
    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// on-switch-in
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-in" abilities for Gen 4.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — switch-in ability triggers
 */
function handleSwitchIn(
  abilityId: string,
  context: AbilityContext,
  dataManager?: DataManager,
): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case GEN4_ABILITY_IDS.intimidate: {
      // Source: Showdown — Intimidate lowers opponent's Attack by 1 stage on switch-in
      // Source: Showdown Gen 4 — Intimidate is blocked by Substitute
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      if (context.opponent.substituteHp > 0) {
        return { activated: false, effects: [], messages: [] };
      }
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statChange,
        target: EFFECT_TARGET.opponent,
        stat: CORE_STAT_IDS.attack,
        stages: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case GEN4_ABILITY_IDS.pressure: {
      // Pressure: announce on switch-in. The PP cost increase is handled by
      // Gen4Ruleset.getPPCost() — this handler only emits the message.
      // Source: Showdown data/abilities.ts — Pressure onStart message
      // Source: Bulbapedia — "When a Pokémon with Pressure enters battle, the message
      //   '<Pokémon> is exerting its Pressure!' is displayed."
      const noneEffect: AbilityEffect = {
        effectType: ABILITY_EFFECT.none,
        target: EFFECT_TARGET.self,
      };
      return {
        activated: true,
        effects: [noneEffect],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case GEN4_ABILITY_IDS.drizzle: {
      // Source: Showdown Gen 4 mod — Drizzle sets permanent rain on switch-in
      // Gen 4: weather from abilities is permanent (-1 turns sentinel)
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: CORE_WEATHER_IDS.rain,
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case GEN4_ABILITY_IDS.drought: {
      // Source: Showdown Gen 4 mod — Drought sets permanent sun on switch-in
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: CORE_WEATHER_IDS.sun,
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case GEN4_ABILITY_IDS.sandStream: {
      // Source: Showdown Gen 4 mod — Sand Stream sets permanent sandstorm on switch-in
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: CORE_WEATHER_IDS.sand,
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case GEN4_ABILITY_IDS.snowWarning: {
      // NEW in Gen 4 — Abomasnow (Diamond/Pearl).
      // Snow Warning sets permanent hail on switch-in (same pattern as other weather abilities).
      // Source: Bulbapedia — Snow Warning: summons hail on switch-in (Gen 4: permanent)
      // Source: Showdown Gen 4 mod — Snow Warning trigger
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: CORE_WEATHER_IDS.hail,
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Snow Warning made it hail!`],
      };
    }

    case GEN4_ABILITY_IDS.download: {
      // NEW in Gen 4 — Porygon-Z, Genesect line (DPPt).
      // Compares foe's Defense vs Special Defense; raises the lower attacking stat.
      // +1 Attack if foe's Def < foe's SpDef, else +1 SpAtk.
      // Source: Bulbapedia — Download: raises Atk if foe Def < SpDef, else raises SpAtk
      // Source: Showdown Gen 4 mod — Download trigger
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const foeStats = context.opponent.pokemon.calculatedStats;
      if (!foeStats) return { activated: false, effects: [], messages: [] };

      const raisesAtk = foeStats.defense < foeStats.spDefense;
      const stat = raisesAtk ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
      const statName = raisesAtk ? "Attack" : "Sp. Atk";
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statChange,
        target: EFFECT_TARGET.self,
        stat,
        stages: 1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Download raised its ${statName}!`],
      };
    }

    case GEN4_ABILITY_IDS.anticipation: {
      // NEW in Gen 4 — Warns if foe has a super-effective or OHKO move.
      // Informational only — no mechanical effect on stats or state.
      // Source: Bulbapedia — Anticipation: alerts trainer if foe has SE or OHKO move
      // Source: Showdown data/abilities.ts — Anticipation onStart
      if (!context.opponent || !dataManager) {
        return { activated: false, effects: [], messages: [] };
      }

      const selfTypes = context.pokemon.types;
      const ohkoMoveIds: readonly string[] = [
        GEN4_MOVE_IDS.sheerCold,
        GEN4_MOVE_IDS.fissure,
        GEN4_MOVE_IDS.guillotine,
        GEN4_MOVE_IDS.hornDrill,
      ];
      const typeChart: TypeChart = GEN4_TYPE_CHART;

      let hasThreateningMove = false;
      for (const moveSlot of context.opponent.pokemon.moves) {
        if (!moveSlot) continue;
        try {
          const move = dataManager.getMove(moveSlot.moveId);
          if (!move) continue;
          // OHKO moves are always threatening
          if (ohkoMoveIds.includes(move.id)) {
            hasThreateningMove = true;
            break;
          }
          // Check type effectiveness — if SE against any of self's types
          if (move.power && move.power > 0) {
            let effectiveness = 1;
            for (const selfType of selfTypes) {
              effectiveness *= typeChart[move.type]?.[selfType] ?? 1;
            }
            if (effectiveness > 1) {
              hasThreateningMove = true;
              break;
            }
          }
        } catch {}
      }

      if (!hasThreateningMove) {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.none, target: EFFECT_TARGET.self }],
        messages: [`${name}'s Anticipation made it shudder!`],
      };
    }

    case GEN4_ABILITY_IDS.forewarn: {
      // NEW in Gen 4 — Reveals foe's move with highest base power.
      // Informational only — no mechanical effect on stats or state.
      // Source: Bulbapedia — Forewarn: reveals foe's strongest move on switch-in
      // Source: Showdown data/abilities.ts — Forewarn onStart
      if (!context.opponent || !dataManager) {
        return { activated: false, effects: [], messages: [] };
      }

      // OHKO moves count as base power 160 for Forewarn purposes
      // Source: Bulbapedia — Forewarn counts OHKO moves as BP 160
      const ohkoMoveIds: readonly string[] = [
        GEN4_MOVE_IDS.sheerCold,
        GEN4_MOVE_IDS.fissure,
        GEN4_MOVE_IDS.guillotine,
        GEN4_MOVE_IDS.hornDrill,
      ];
      // Counter/Mirror Coat/Metal Burst count as BP 120
      // Source: Showdown Gen 4 — Forewarn assigns 120 to Counter/Mirror Coat/Metal Burst
      const highBpMoveIds: readonly string[] = [
        GEN4_MOVE_IDS.counter,
        GEN4_MOVE_IDS.mirrorCoat,
        GEN4_MOVE_IDS.metalBurst,
      ];

      let strongestMove: string | null = null;
      let strongestPower = 0;

      for (const moveSlot of context.opponent.pokemon.moves) {
        if (!moveSlot) continue;
        try {
          const move = dataManager.getMove(moveSlot.moveId);
          if (!move) continue;
          // Source: Showdown data/abilities.ts — Forewarn power assignments:
          //   OHKO moves = 160, Counter/Mirror Coat/Metal Burst = 120,
          //   other 0-BP damaging moves = 80, status moves = 0
          const power = ohkoMoveIds.includes(move.id)
            ? 160
            : highBpMoveIds.includes(move.id)
              ? 120
              : (move.power ?? 0) === 0 && move.category !== CORE_MOVE_CATEGORIES.status
                ? 80
                : (move.power ?? 0);
          if (power > strongestPower) {
            strongestPower = power;
            strongestMove = move.displayName ?? move.id;
          }
        } catch {}
      }

      if (!strongestMove) {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.none, target: EFFECT_TARGET.self }],
        messages: [`${name}'s Forewarn alerted it to ${strongestMove}!`],
      };
    }

    case GEN4_ABILITY_IDS.frisk: {
      // NEW in Gen 4 — Reveals foe's held item on switch-in.
      // Informational only — no mechanical effect on stats or state.
      // Source: Bulbapedia — Frisk: reveals foe's held item on switch-in
      // Source: Showdown Gen 4 mod — Frisk (advisory, no game-state change)
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const itemName = context.opponent.pokemon.heldItem ?? "nothing";
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.none, target: EFFECT_TARGET.self }],
        messages: [`${name} frisked ${oppName} and found ${itemName}!`],
      };
    }

    case GEN4_ABILITY_IDS.slowStart: {
      // NEW in Gen 4 — Regigigas only. Halves Attack and Speed for 5 turns.
      // Sets "slow-start" volatile with turnsLeft=5. The damage calc and speed calc
      // check for this volatile to apply the halving. The EoT handler decrements it.
      // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns after switch-in
      // Source: Showdown Gen 4 mod — Slow Start counter initialized on switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.volatileInflict,
            target: EFFECT_TARGET.self,
            volatile: CORE_VOLATILE_IDS.slowStart,
            data: { turnsLeft: 5 },
          },
        ],
        messages: [`${name} can't get it going because of its Slow Start!`],
      };
    }

    case GEN4_ABILITY_IDS.trace: {
      // Trace: copies the opponent's ability on switch-in.
      // Cannot copy Trace, Multitype, or Forecast in Gen 4.
      // Wonder Guard and Flower Gift ARE copyable in Gen 4 (confirmed Showdown Gen 4 mod).
      // Source: Showdown references/pokemon-showdown/data/mods/gen4/abilities.ts
      //   Gen4 Trace banned list: ['forecast', 'multitype', 'trace'] only
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const uncopyable: readonly string[] = [
        GEN4_ABILITY_IDS.trace,
        GEN4_ABILITY_IDS.multitype,
        GEN4_ABILITY_IDS.forecast,
      ];
      const opponentAbility = context.opponent.ability;
      if (!opponentAbility || uncopyable.includes(opponentAbility)) {
        return { activated: false, effects: [], messages: [] };
      }
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.abilityChange,
        target: EFFECT_TARGET.self,
        newAbility: opponentAbility,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name} traced ${oppName}'s ${opponentAbility}!`],
      };
    }

    case GEN4_ABILITY_IDS.moldBreaker: {
      // Mold Breaker: announce on switch-in (informational only — the actual
      // ability bypass logic is in the damage calc and accuracy check)
      // Source: Showdown Gen 4 mod — Mold Breaker switch-in announcement
      // Source: Bulbapedia — Mold Breaker: "Moves used by the Pokemon with this
      //   Ability are unaffected by the target's Ability."
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.none, target: EFFECT_TARGET.self }],
        messages: [`${name} breaks the mold!`],
      };
    }

    case GEN4_ABILITY_IDS.multitype: {
      // Multitype: Arceus changes type based on held Plate item on switch-in.
      // Source: Showdown Gen 4 mod — Multitype type change on switch-in
      // Source: Bulbapedia — Multitype: "Changes Arceus's type and form to match
      //   its held Plate. If Arceus is not holding a Plate, it is Normal-type."
      const heldItem = context.pokemon.pokemon.heldItem;
      const plateType = heldItem ? PLATE_TO_TYPE[heldItem] : undefined;
      const newType: PokemonType = plateType ?? CORE_TYPE_IDS.normal;
      const typeName = newType.charAt(0).toUpperCase() + newType.slice(1);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.typeChange,
        target: EFFECT_TARGET.self,
        types: [newType],
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name} transformed into the ${typeName} type!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// on-turn-end
// ---------------------------------------------------------------------------

/**
 * Handle "on-turn-end" abilities for Gen 4.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — end-of-turn ability triggers
 */
function handleTurnEnd(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  const weather = context.state.weather?.type ?? null;
  const status = context.pokemon.pokemon.status;
  const maxHp = context.pokemon.pokemon.calculatedStats?.hp ?? context.pokemon.pokemon.currentHp;
  const currentHp = context.pokemon.pokemon.currentHp;

  switch (abilityId) {
    case GEN4_ABILITY_IDS.speedBoost: {
      // Source: pret/pokeplatinum src/battle/battle_lib.c:3555-3558 — Speed Boost:
      //   fakeOutTurnNumber != totalTurns + 1 — does NOT activate on the first turn
      //   after switching in.
      // turnsOnField is 0 on the first end-of-turn after switch-in (incremented after EoT).
      // Source: Bulbapedia — Speed Boost: raises Speed by 1 at end of each turn
      //   (but confirmed by decomp: not on the very first turn)
      if (context.pokemon.turnsOnField === 0) {
        return { activated: false, effects: [], messages: [] };
      }
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statChange,
        target: EFFECT_TARGET.self,
        stat: CORE_STAT_IDS.speed,
        stages: 1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Speed Boost raised its Speed!`],
      };
    }

    case GEN4_ABILITY_IDS.rainDish: {
      // Heal 1/16 max HP in rain.
      // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain each turn
      // Source: pret/pokeplatinum — weather abilities check WEATHER_HAS_EFFECT
      // Cloud Nine / Air Lock suppress weather, so Rain Dish does not activate.
      const effectiveWeatherRD = isWeatherSuppressedGen4(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherRD !== CORE_WEATHER_IDS.rain)
        return { activated: false, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [
          { effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
        ],
        messages: [`${name}'s Rain Dish restored its HP!`],
      };
    }

    case GEN4_ABILITY_IDS.iceBody: {
      // Heal 1/16 max HP in hail.
      // Source: Bulbapedia — Ice Body: restores 1/16 HP in hail each turn (introduced Gen 4)
      // Source: pret/pokeplatinum — weather abilities check WEATHER_HAS_EFFECT
      // Cloud Nine / Air Lock suppress weather, so Ice Body does not activate.
      const effectiveWeatherIB = isWeatherSuppressedGen4(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherIB !== CORE_WEATHER_IDS.hail)
        return { activated: false, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [
          { effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
        ],
        messages: [`${name}'s Ice Body restored its HP!`],
      };
    }

    case GEN4_ABILITY_IDS.drySkin: {
      // Heal 1/8 max HP in rain; take 1/8 max HP in sun (Sun damage handled here as chip).
      // Source: Bulbapedia — Dry Skin: heals 1/8 HP in rain, takes 1/8 HP in sun
      // Source: pret/pokeplatinum — weather abilities check WEATHER_HAS_EFFECT
      // Cloud Nine / Air Lock suppress weather, so Dry Skin does not activate.
      const effectiveWeatherDS = isWeatherSuppressedGen4(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherDS === CORE_WEATHER_IDS.rain) {
        const healAmount = Math.max(1, Math.floor(maxHp / 8));
        return {
          activated: true,
          effects: [
            { effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
          ],
          messages: [`${name}'s Dry Skin restored its HP!`],
        };
      }
      if (effectiveWeatherDS === CORE_WEATHER_IDS.sun) {
        const chipDamage = Math.max(1, Math.floor(maxHp / 8));
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.chipDamage,
              target: EFFECT_TARGET.self,
              value: chipDamage,
            },
          ],
          messages: [`${name}'s Dry Skin was hurt by the harsh sunlight!`],
        };
      }
      return { activated: false, effects: [], messages: [] };
    }

    case GEN4_ABILITY_IDS.solarPower: {
      // Take 1/8 max HP in sun (SpAtk boost handled in damage calc).
      // Source: Bulbapedia — Solar Power: takes 1/8 HP in sun, SpAtk boosted 1.5x
      // Source: pret/pokeplatinum — weather abilities check WEATHER_HAS_EFFECT
      // Cloud Nine / Air Lock suppress weather, so Solar Power does not activate.
      const effectiveWeatherSP = isWeatherSuppressedGen4(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherSP !== CORE_WEATHER_IDS.sun)
        return { activated: false, effects: [], messages: [] };
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [
          { effectType: ABILITY_EFFECT.chipDamage, target: EFFECT_TARGET.self, value: chipDamage },
        ],
        messages: [`${name} was hurt by Solar Power!`],
      };
    }

    case GEN4_ABILITY_IDS.hydration: {
      // Cures primary status in rain.
      // Source: Bulbapedia — Hydration: cures status conditions at end of each turn in rain
      // Source: pret/pokeplatinum — weather abilities check WEATHER_HAS_EFFECT
      // Cloud Nine / Air Lock suppress weather, so Hydration does not activate.
      const effectiveWeatherHY = isWeatherSuppressedGen4(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherHY !== CORE_WEATHER_IDS.rain)
        return { activated: false, effects: [], messages: [] };
      if (!status) return { activated: false, effects: [], messages: [] };
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statusCure,
        target: EFFECT_TARGET.self,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Hydration cured its ${status}!`],
      };
    }

    case GEN4_ABILITY_IDS.shedSkin: {
      // 33% chance to cure primary status each turn.
      // Source: Bulbapedia — Shed Skin: 33% chance (1/3) to cure status each turn
      // Source: Showdown Gen 4 mod — Shed Skin trigger (uses 33% = 1/3)
      if (!status) return { activated: false, effects: [], messages: [] };
      if (!context.rng.chance(1 / 3)) return { activated: false, effects: [], messages: [] };
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statusCure,
        target: EFFECT_TARGET.self,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Shed Skin cured its ${status}!`],
      };
    }

    case GEN4_ABILITY_IDS.badDreams: {
      // Sleeping opponents lose 1/8 max HP per turn.
      // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
      // Source: Showdown Gen 4 mod — Bad Dreams trigger
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      if (context.opponent.pokemon.status !== CORE_STATUS_IDS.sleep)
        return { activated: false, effects: [], messages: [] };
      const oppMaxHp =
        context.opponent.pokemon.calculatedStats?.hp ?? context.opponent.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(oppMaxHp / 8));
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.chipDamage,
            target: EFFECT_TARGET.opponent,
            value: chipDamage,
          },
        ],
        messages: [`${oppName} is tormented by ${name}'s Bad Dreams!`],
      };
    }

    case GEN4_ABILITY_IDS.poisonHeal: {
      // Heal 1/8 max HP when poisoned (instead of taking poison damage).
      // Even at full HP, Poison Heal MUST return activated:true to signal that the
      // poison-heal EoT slot handled the tick — preventing status-damage from
      // applying poison chip damage to this Pokemon.
      // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn if poisoned (instead of damage)
      // Source: Showdown Gen 4 mod — Poison Heal trigger
      if (status !== CORE_STATUS_IDS.poison && status !== CORE_STATUS_IDS.badlyPoisoned)
        return { activated: false, effects: [], messages: [] };
      // At full HP: ability still activates (suppresses poison damage) but deals no heal
      if (currentHp >= maxHp) return { activated: true, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [
          { effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
        ],
        messages: [`${name}'s Poison Heal restored its HP!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// on-contact
// ---------------------------------------------------------------------------

/**
 * Handle "on-contact" abilities for Gen 4.
 *
 * Fires when a contact move hits and deals damage. `context.pokemon` is the
 * defender (whose ability fires), `context.opponent` is the attacker who
 * made contact.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — on-contact ability triggers
 * Source: Bulbapedia — individual contact ability mechanics
 */
function handleOnContact(abilityId: string, context: AbilityContext): AbilityResult {
  const attacker = context.opponent;
  if (!attacker) return { activated: false, effects: [], messages: [] };

  const attackerMaxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  const attackerStatus = attacker.pokemon.status;

  switch (abilityId) {
    case GEN4_ABILITY_IDS.static: {
      // Source: Bulbapedia — Static: 30% chance to paralyze attacker on contact
      // Source: Showdown Gen 4 mod — Static trigger (30% = rng.next() < 0.3)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status(CORE_STATUS_IDS.paralysis, attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.paralysis,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.flameBody: {
      // Source: Bulbapedia — Flame Body: 30% chance to burn attacker on contact
      // Source: Showdown Gen 4 mod — Flame Body trigger (30%)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status(CORE_STATUS_IDS.burn, attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.burn,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.poisonPoint: {
      // Source: Bulbapedia — Poison Point: 30% chance to poison attacker on contact
      // Source: Showdown Gen 4 mod — Poison Point trigger (30%)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status(CORE_STATUS_IDS.poison, attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.poison,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.roughSkin: {
      // Source: Bulbapedia — Rough Skin: deals 1/8 attacker's max HP on contact (always)
      // Source: Showdown Gen 4 mod — Rough Skin trigger (guaranteed chip)
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.chipDamage,
            target: EFFECT_TARGET.opponent,
            value: chipDamage,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.effectSpore: {
      // Effect Spore: 30% total chance on contact. Uses a SINGLE random(100) roll
      // with ranges: 0-9 = sleep, 10-19 = paralysis, 20-29 = poison.
      // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
      //   effectspore.onDamagingHit: const r = this.random(100);
      //   if (r < 10) sleep, else if (r < 20) paralysis, else if (r < 30) poison
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      // Single RNG call matching Showdown's pattern for seeded determinism
      const roll = Math.floor(context.rng.next() * 100);
      if (roll < 10) {
        // 0-9: sleep
        if (!canInflictGen4Status(CORE_STATUS_IDS.sleep, attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.statusInflict,
              target: EFFECT_TARGET.opponent,
              status: CORE_STATUS_IDS.sleep,
            },
          ],
          messages: [],
        };
      }
      if (roll < 20) {
        // 10-19: paralysis
        if (!canInflictGen4Status(CORE_STATUS_IDS.paralysis, attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.statusInflict,
              target: EFFECT_TARGET.opponent,
              status: CORE_STATUS_IDS.paralysis,
            },
          ],
          messages: [],
        };
      }
      if (roll < 30) {
        // 20-29: poison
        if (!canInflictGen4Status(CORE_STATUS_IDS.poison, attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.statusInflict,
              target: EFFECT_TARGET.opponent,
              status: CORE_STATUS_IDS.poison,
            },
          ],
          messages: [],
        };
      }
      // 30-99: no effect
      return { activated: false, effects: [], messages: [] };
    }

    case GEN4_ABILITY_IDS.cuteCharm: {
      // Source: Bulbapedia — Cute Charm: 30% chance to infatuate attacker on contact;
      //   requires opposite genders, fails if either is genderless
      // Source: Showdown Gen 4 mod — Cute Charm trigger (30%, gender check)
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      const defenderGender = context.pokemon.pokemon.gender;
      const attackerGender = attacker.pokemon.gender;
      if (
        !defenderGender ||
        !attackerGender ||
        defenderGender === CORE_GENDERS.genderless ||
        attackerGender === CORE_GENDERS.genderless ||
        defenderGender === attackerGender
      ) {
        return { activated: false, effects: [], messages: [] };
      }
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability volatile infliction
      if (isVolatileBlockedByAbility(attacker, CORE_VOLATILE_IDS.infatuation))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.volatileInflict,
            target: EFFECT_TARGET.opponent,
            volatile: CORE_VOLATILE_IDS.infatuation,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.aftermath: {
      // Aftermath: when the holder faints from a contact move, the attacker takes 1/4
      // of its max HP in damage. Only triggers if the holder has 0 HP (fainted).
      // Source: Bulbapedia — Aftermath: "Damages the attacker landing the finishing hit
      //   by 1/4 its max HP"
      // Source: Showdown Gen 4 mod — Aftermath trigger (on-contact, holder must be fainted)
      const holderHp = context.pokemon.pokemon.currentHp;
      if (holderHp > 0) return { activated: false, effects: [], messages: [] };
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 4));
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.chipDamage,
            target: EFFECT_TARGET.opponent,
            value: chipDamage,
          },
        ],
        messages: [`${name}'s Aftermath hurt the attacker!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// passive-immunity
// ---------------------------------------------------------------------------

/**
 * Handle "passive-immunity" abilities for Gen 4.
 *
 * Fires when a move would hit a Pokemon and the ability grants immunity to
 * the move's type. `context.pokemon` is the defender (whose ability grants
 * immunity), `context.move` is the incoming move.
 *
 * Returns `activated: true` if the ability absorbs/negates the move,
 * `activated: false` if the move type doesn't match (regular type immunity
 * or normal damage should apply instead).
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — passive immunity ability checks
 * Source: Bulbapedia — individual immunity ability mechanics
 */
function handlePassiveImmunity(abilityId: string, context: AbilityContext): AbilityResult {
  const moveType = context.move?.type;
  if (!moveType) return { activated: false, effects: [], messages: [] };

  const maxHp = context.pokemon.pokemon.calculatedStats?.hp ?? context.pokemon.pokemon.currentHp;

  switch (abilityId) {
    case GEN4_ABILITY_IDS.waterAbsorb: {
      // Source: Bulbapedia — Water Absorb: Water moves heal 1/4 max HP instead of dealing damage
      // Source: Showdown Gen 4 mod — Water Absorb immunity + heal
      if (moveType !== CORE_TYPE_IDS.water) return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.voltAbsorb: {
      // Source: Bulbapedia — Volt Absorb: Electric moves heal 1/4 max HP instead of dealing damage
      // Source: Showdown Gen 4 mod — Volt Absorb immunity + heal
      if (moveType !== CORE_TYPE_IDS.electric)
        return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.motorDrive: {
      // Source: Bulbapedia — Motor Drive: Electric moves raise Speed by 1 instead of dealing damage
      // Source: Showdown Gen 4 mod — Motor Drive immunity + Speed boost
      if (moveType !== CORE_TYPE_IDS.electric)
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statChange,
            target: EFFECT_TARGET.self,
            stat: CORE_STAT_IDS.speed,
            stages: 1,
          },
        ],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.drySkin: {
      // Source: Bulbapedia — Dry Skin: Water moves heal 1/4 max HP (also takes 1.25x from Fire,
      //   but the Fire weakness is handled in damage calc, not here)
      // Source: Showdown Gen 4 mod — Dry Skin passive immunity (Water only)
      if (moveType !== CORE_TYPE_IDS.water) return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.flashFire: {
      // Source: Bulbapedia — Flash Fire: Fire moves are absorbed; powers up holder's Fire moves
      //   "Flash Fire raises the power of Fire-type moves by 50% while it is in effect."
      // Source: Showdown Gen 4 mod — Flash Fire immunity + volatile status for damage boost
      if (moveType !== CORE_TYPE_IDS.fire) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 — frozen Pokemon cannot activate Flash Fire;
      // the Fire move should proceed and thaw the frozen Pokemon instead
      if (context.pokemon.pokemon.status === CORE_STATUS_IDS.freeze) {
        return { activated: false, effects: [], messages: [] };
      }
      const hasBoost = context.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.flashFire);
      const effects: AbilityEffect[] = [];
      if (!hasBoost) {
        effects.push({
          effectType: ABILITY_EFFECT.volatileInflict,
          target: EFFECT_TARGET.self,
          volatile: CORE_VOLATILE_IDS.flashFire,
        });
      }
      return {
        activated: true,
        effects,
        messages: [
          hasBoost
            ? `${context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId)}'s Flash Fire is already boosted!`
            : `${context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId)}'s Flash Fire was activated!`,
        ],
      };
    }

    case GEN4_ABILITY_IDS.levitate: {
      // Source: Bulbapedia — Levitate: Ground moves have no effect
      // Source: Showdown Gen 4 mod — Levitate ground immunity
      if (moveType !== CORE_TYPE_IDS.ground) return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [],
        messages: [],
      };
    }

    case GEN4_ABILITY_IDS.stormDrain: {
      // Storm Drain in Gen 4: redirect-only ability in doubles. In singles, it has no effect.
      // There is no Water immunity and no SpAtk boost in Gen 4.
      //
      // Source: Bulbapedia — Storm Drain (Generation IV): "Draws all single-target Water-type
      //   moves to this Pokemon. Has no effect in single battles."
      // Source: Showdown Gen 4 mod — Storm Drain is a doubles redirect; no singles immunity
      //
      // The Water immunity + SpAtk boost behavior was introduced in Gen 5 (Bulbapedia Gen V entry).
      //
      // Bug #350/#351: Previous implementation granted Water immunity + SpAtk boost,
      // which is Gen 5+ behavior. Gen 4 Storm Drain does nothing in singles.
      return { activated: false, effects: [], messages: [] };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// on-flinch
// ---------------------------------------------------------------------------

/**
 * Handle "on-flinch" abilities for Gen 4.
 *
 * Fires when a Pokemon flinches (before the flinch prevents its move).
 * Currently only Steadfast uses this trigger.
 *
 * Source: Showdown Gen 4 mod — Steadfast on-flinch trigger
 * Source: Bulbapedia — Steadfast: "Raises the Pokemon's Speed by one stage
 *   each time it flinches."
 */
function handleOnFlinch(abilityId: string, context: AbilityContext): AbilityResult {
  if (abilityId !== CORE_ABILITY_IDS.steadfast) {
    return { activated: false, effects: [], messages: [] };
  }

  // Steadfast: raises Speed by 1 stage when the Pokemon flinches
  // Source: Showdown Gen 4 mod — Steadfast +1 Speed on flinch
  // Source: Bulbapedia — Steadfast: raises Speed by 1 stage when the holder flinches
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  const effect: AbilityEffect = {
    effectType: ABILITY_EFFECT.statChange,
    target: EFFECT_TARGET.self,
    stat: CORE_STAT_IDS.speed,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Steadfast raised its Speed!`],
  };
}

// ---------------------------------------------------------------------------
// on-after-move-hit
// ---------------------------------------------------------------------------

/**
 * Handle "on-after-move-hit" abilities for Gen 4.
 *
 * Fires after the attacker's move hits and deals damage. `context.pokemon`
 * is the attacker (whose ability triggers), `context.opponent` is the
 * defender that was hit.
 *
 * No Gen 4 abilities use this trigger in singles.
 *
 * Note on Stench: In Gen 4, Stench has NO battle effect. It only reduces the wild
 * encounter rate in the overworld. The 10% flinch chance was introduced in Gen 5.
 *
 * Source: Bulbapedia — Stench (Generation IV): "Has no effect in battle."
 * Source: Showdown — Stench onModifyMove flinch only exists in Gen 5+ scripts
 *
 * Bug #384: Previous implementation incorrectly gave Stench a 10% flinch chance,
 * which is Gen 5+ behavior.
 */
function handleOnAfterMoveHit(_abilityId: string, _context: AbilityContext): AbilityResult {
  return { activated: false, effects: [], messages: [] };
}
