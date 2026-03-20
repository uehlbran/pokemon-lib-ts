import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";

/**
 * Gen 4 Abilities — applyAbility dispatch.
 *
 * Handles triggers that the battle engine currently calls:
 *   - "on-switch-in": Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
 *                     Download, Anticipation, Forewarn, Frisk, Slow Start
 *   - "on-turn-end": Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
 *                    Hydration, Shed Skin, Bad Dreams, Poison Heal
 *
 * Deferred abilities (require engine hooks not yet available):
 *   - Magic Guard: passive damage immunity (needs engine check before applying chip)
 *   - Mold Breaker: ability bypass in damage flow
 *   - Simple / Unaware: stat-reading hooks
 *   - Normalize / Scrappy: type-change mechanics
 *   - Flower Gift: ally stat boost in sun
 *   - Leaf Guard: status prevention in sun
 *   - Trace: ability copy on switch-in
 *   - Klutz: item suppression
 *   - Steadfast: needs "on-flinch" trigger (not yet in AbilityTrigger type)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ability trigger dispatch
 * Source: Bulbapedia — individual ability mechanics
 */

/**
 * Dispatch an ability trigger for Gen 4.
 */
export function applyGen4Ability(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
  const abilityId = context.pokemon.ability;

  switch (trigger) {
    case "on-switch-in":
      return handleSwitchIn(abilityId, context);
    case "on-turn-end":
      return handleTurnEnd(abilityId, context);
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
function handleSwitchIn(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "intimidate": {
      // Source: Showdown — Intimidate lowers opponent's Attack by 1 stage on switch-in
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: "stat-change",
        target: "opponent",
        stat: "attack",
        stages: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case "drizzle": {
      // Source: Showdown Gen 4 mod — Drizzle sets permanent rain on switch-in
      // Gen 4: weather from abilities is permanent (-1 turns sentinel)
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "rain",
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      // Source: Showdown Gen 4 mod — Drought sets permanent sun on switch-in
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "sun",
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      // Source: Showdown Gen 4 mod — Sand Stream sets permanent sandstorm on switch-in
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "sand",
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case "snow-warning": {
      // NEW in Gen 4 — Abomasnow (Diamond/Pearl).
      // Snow Warning sets permanent hail on switch-in (same pattern as other weather abilities).
      // Source: Bulbapedia — Snow Warning: summons hail on switch-in (Gen 4: permanent)
      // Source: Showdown Gen 4 mod — Snow Warning trigger
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "hail",
        weatherTurns: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Snow Warning made it hail!`],
      };
    }

    case "download": {
      // NEW in Gen 4 — Porygon-Z, Genesect line (DPPt).
      // Compares foe's Defense vs Special Defense; raises the lower attacking stat.
      // +1 Attack if foe's Def < foe's SpDef, else +1 SpAtk.
      // Source: Bulbapedia — Download: raises Atk if foe Def < SpDef, else raises SpAtk
      // Source: Showdown Gen 4 mod — Download trigger
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const foeStats = context.opponent.pokemon.calculatedStats;
      if (!foeStats) return { activated: false, effects: [], messages: [] };

      const raisesAtk = foeStats.defense < foeStats.spDefense;
      const stat = raisesAtk ? ("attack" as const) : ("spAttack" as const);
      const statName = raisesAtk ? "Attack" : "Sp. Atk";
      const effect: AbilityEffect = {
        effectType: "stat-change",
        target: "self",
        stat,
        stages: 1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Download raised its ${statName}!`],
      };
    }

    case "anticipation": {
      // NEW in Gen 4 — Warns if foe has a super-effective or OHKO move.
      // Informational only — no mechanical effect on stats or state.
      // Source: Bulbapedia — Anticipation: alerts trainer if foe has SE or OHKO move
      // Source: Showdown Gen 4 mod — Anticipation (advisory, no game-state change)
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Anticipation made it shudder!`],
      };
    }

    case "forewarn": {
      // NEW in Gen 4 — Reveals foe's move with highest base power.
      // Informational only — no mechanical effect on stats or state.
      // Source: Bulbapedia — Forewarn: reveals foe's strongest move on switch-in
      // Source: Showdown Gen 4 mod — Forewarn (advisory, no game-state change)
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Forewarn let it know ${oppName}'s moves!`],
      };
    }

    case "frisk": {
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
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} frisked ${oppName} and found ${itemName}!`],
      };
    }

    case "slow-start": {
      // NEW in Gen 4 — Regigigas only. Halves Attack and Speed for 5 turns.
      // Informational here — the stat halving requires engine support to track volatile state.
      // The 5-turn counter is a volatile status that the engine needs to decrement each turn.
      // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns after switch-in
      // Source: Showdown Gen 4 mod — Slow Start counter initialized on switch-in
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} can't get it going because of its Slow Start!`],
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
    case "speed-boost": {
      // Raises Speed by 1 stage each turn.
      // Source: Bulbapedia — Speed Boost: raises Speed by 1 at end of each turn
      // Source: Showdown Gen 4 mod — Speed Boost trigger
      const effect: AbilityEffect = {
        effectType: "stat-change",
        target: "self",
        stat: "speed",
        stages: 1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Speed Boost raised its Speed!`],
      };
    }

    case "rain-dish": {
      // Heal 1/16 max HP in rain.
      // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain each turn
      // Source: Showdown Gen 4 mod — Rain Dish trigger
      if (weather !== "rain") return { activated: false, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self", value: healAmount } as AbilityEffect],
        messages: [`${name}'s Rain Dish restored its HP!`],
      };
    }

    case "ice-body": {
      // Heal 1/16 max HP in hail.
      // Source: Bulbapedia — Ice Body: restores 1/16 HP in hail each turn (introduced Gen 4)
      // Source: Showdown Gen 4 mod — Ice Body trigger
      if (weather !== "hail") return { activated: false, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self", value: healAmount } as AbilityEffect],
        messages: [`${name}'s Ice Body restored its HP!`],
      };
    }

    case "dry-skin": {
      // Heal 1/8 max HP in rain; take 1/8 max HP in sun (Sun damage handled here as chip).
      // Source: Bulbapedia — Dry Skin: heals 1/8 HP in rain, takes 1/8 HP in sun
      // Source: Showdown Gen 4 mod — Dry Skin weather interaction
      if (weather === "rain") {
        const healAmount = Math.max(1, Math.floor(maxHp / 8));
        return {
          activated: true,
          effects: [{ effectType: "none", target: "self", value: healAmount } as AbilityEffect],
          messages: [`${name}'s Dry Skin restored its HP!`],
        };
      }
      if (weather === "sun") {
        const chipDamage = Math.max(1, Math.floor(maxHp / 8));
        return {
          activated: true,
          effects: [{ effectType: "none", target: "self", value: -chipDamage } as AbilityEffect],
          messages: [`${name}'s Dry Skin was hurt by the harsh sunlight!`],
        };
      }
      return { activated: false, effects: [], messages: [] };
    }

    case "solar-power": {
      // Take 1/8 max HP in sun (SpAtk boost handled in damage calc).
      // Source: Bulbapedia — Solar Power: takes 1/8 HP in sun, SpAtk boosted 1.5x
      // Source: Showdown Gen 4 mod — Solar Power end-of-turn chip
      if (weather !== "sun") return { activated: false, effects: [], messages: [] };
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self", value: -chipDamage } as AbilityEffect],
        messages: [`${name} was hurt by Solar Power!`],
      };
    }

    case "hydration": {
      // Cures primary status in rain.
      // Source: Bulbapedia — Hydration: cures status conditions at end of each turn in rain
      // Source: Showdown Gen 4 mod — Hydration trigger
      if (weather !== "rain") return { activated: false, effects: [], messages: [] };
      if (!status) return { activated: false, effects: [], messages: [] };
      const effect: AbilityEffect = { effectType: "status-cure", target: "self" };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Hydration cured its ${status}!`],
      };
    }

    case "shed-skin": {
      // 33% chance to cure primary status each turn.
      // Source: Bulbapedia — Shed Skin: 30% chance (approx. 1/3) to cure status each turn
      // Source: Showdown Gen 4 mod — Shed Skin trigger (uses 33% = 1/3)
      if (!status) return { activated: false, effects: [], messages: [] };
      if (!context.rng.chance(1 / 3)) return { activated: false, effects: [], messages: [] };
      const effect: AbilityEffect = { effectType: "status-cure", target: "self" };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Shed Skin cured its ${status}!`],
      };
    }

    case "bad-dreams": {
      // Sleeping opponents lose 1/8 max HP per turn.
      // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
      // Source: Showdown Gen 4 mod — Bad Dreams trigger
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      if (context.opponent.pokemon.status !== "sleep")
        return { activated: false, effects: [], messages: [] };
      const oppMaxHp =
        context.opponent.pokemon.calculatedStats?.hp ?? context.opponent.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(oppMaxHp / 8));
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      return {
        activated: true,
        effects: [{ effectType: "none", target: "opponent", value: -chipDamage } as AbilityEffect],
        messages: [`${oppName} is tormented by ${name}'s Bad Dreams!`],
      };
    }

    case "poison-heal": {
      // Heal 1/8 max HP when poisoned (instead of taking poison damage).
      // The normal status-damage tick is skipped; this heals instead.
      // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn if poisoned (instead of damage)
      // Source: Showdown Gen 4 mod — Poison Heal trigger
      if (status !== "poison" && status !== "badly-poisoned")
        return { activated: false, effects: [], messages: [] };
      // Only heal if current HP < max HP (no overflow)
      if (currentHp >= maxHp) return { activated: false, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self", value: healAmount } as AbilityEffect],
        messages: [`${name}'s Poison Heal restored its HP!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}
