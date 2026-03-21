import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";
import { canInflictGen4Status, isVolatileBlockedByAbility } from "./Gen4MoveEffects";

/**
 * Gen 4 Abilities — applyAbility dispatch.
 *
 * Handles triggers that the battle engine currently calls:
 *   - "on-switch-in": Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
 *                     Download, Anticipation, Forewarn, Frisk, Slow Start, Trace
 *   - "on-turn-end": Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
 *                    Hydration, Shed Skin, Bad Dreams, Poison Heal
 *   - "on-contact": Static, Flame Body, Poison Point, Rough Skin, Effect Spore,
 *                   Cute Charm, Aftermath
 *   - "passive-immunity": Water Absorb, Volt Absorb, Motor Drive, Dry Skin,
 *                         Flash Fire (with volatile boost), Levitate
 *   - "on-flinch": Steadfast
 *
 * Stat-modifying abilities (damage calc / speed calc integration):
 *   - Solar Power: 1.5x SpAtk in sun (damage calc) + 1/8 HP chip (turn-end)
 *   - Flower Gift: 1.5x Atk + 1.5x SpDef in sun (damage calc)
 *   - Normalize: moves become Normal type (damage calc type override)
 *   - Scrappy: Normal/Fighting hit Ghost neutrally (damage calc effectiveness override)
 *   - Slow Start: halve Attack/Speed for 5 turns (volatile tracking + damage calc + speed calc)
 *   - Download: compare foe Def/SpDef, raise Atk or SpAtk (switch-in)
 *
 * Deferred abilities (require engine hooks not yet available):
 *   - Leaf Guard: status prevention in sun
 *   - Klutz: item suppression
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
    case "on-contact":
      return handleOnContact(abilityId, context);
    case "passive-immunity":
      return handlePassiveImmunity(abilityId, context);
    case "on-flinch":
      return handleOnFlinch(abilityId, context);
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
      // Sets "slow-start" volatile with turnsLeft=5. The damage calc and speed calc
      // check for this volatile to apply the halving. The EoT handler decrements it.
      // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns after switch-in
      // Source: Showdown Gen 4 mod — Slow Start counter initialized on switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: "volatile-inflict",
            target: "self",
            volatile: "slow-start",
            data: { turnsLeft: 5 },
          },
        ],
        messages: [`${name} can't get it going because of its Slow Start!`],
      };
    }

    case "trace": {
      // Trace: copies the opponent's ability on switch-in.
      // Cannot copy Trace, Multitype, or Forecast in Gen 4.
      // Wonder Guard and Flower Gift ARE copyable in Gen 4 (confirmed Showdown Gen 4 mod).
      // Source: Showdown references/pokemon-showdown/data/mods/gen4/abilities.ts
      //   Gen4 Trace banned list: ['forecast', 'multitype', 'trace'] only
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const uncopyable = ["trace", "multitype", "forecast"];
      const opponentAbility = context.opponent.ability;
      if (!opponentAbility || uncopyable.includes(opponentAbility)) {
        return { activated: false, effects: [], messages: [] };
      }
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: "ability-change",
        target: "self",
        newAbility: opponentAbility,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name} traced ${oppName}'s ${opponentAbility}!`],
      };
    }

    case "mold-breaker": {
      // Mold Breaker: announce on switch-in (informational only — the actual
      // ability bypass logic is in the damage calc and accuracy check)
      // Source: Showdown Gen 4 mod — Mold Breaker switch-in announcement
      // Source: Bulbapedia — Mold Breaker: "Moves used by the Pokemon with this
      //   Ability are unaffected by the target's Ability."
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} breaks the mold!`],
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
        effects: [{ effectType: "heal", target: "self", value: healAmount }],
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
        effects: [{ effectType: "heal", target: "self", value: healAmount }],
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
          effects: [{ effectType: "heal", target: "self", value: healAmount }],
          messages: [`${name}'s Dry Skin restored its HP!`],
        };
      }
      if (weather === "sun") {
        const chipDamage = Math.max(1, Math.floor(maxHp / 8));
        return {
          activated: true,
          effects: [{ effectType: "chip-damage", target: "self", value: chipDamage }],
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
        effects: [{ effectType: "chip-damage", target: "self", value: chipDamage }],
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
      // Source: Bulbapedia — Shed Skin: 33% chance (1/3) to cure status each turn
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
        effects: [{ effectType: "chip-damage", target: "opponent", value: chipDamage }],
        messages: [`${oppName} is tormented by ${name}'s Bad Dreams!`],
      };
    }

    case "poison-heal": {
      // Heal 1/8 max HP when poisoned (instead of taking poison damage).
      // Even at full HP, Poison Heal MUST return activated:true to signal that the
      // poison-heal EoT slot handled the tick — preventing status-damage from
      // applying poison chip damage to this Pokemon.
      // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn if poisoned (instead of damage)
      // Source: Showdown Gen 4 mod — Poison Heal trigger
      if (status !== "poison" && status !== "badly-poisoned")
        return { activated: false, effects: [], messages: [] };
      // At full HP: ability still activates (suppresses poison damage) but deals no heal
      if (currentHp >= maxHp) return { activated: true, effects: [], messages: [] };
      const healAmount = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ effectType: "heal", target: "self", value: healAmount }],
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
    case "static": {
      // Source: Bulbapedia — Static: 30% chance to paralyze attacker on contact
      // Source: Showdown Gen 4 mod — Static trigger (30% = rng.next() < 0.3)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status("paralysis", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "paralysis" }],
        messages: [],
      };
    }

    case "flame-body": {
      // Source: Bulbapedia — Flame Body: 30% chance to burn attacker on contact
      // Source: Showdown Gen 4 mod — Flame Body trigger (30%)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status("burn", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "burn" }],
        messages: [],
      };
    }

    case "poison-point": {
      // Source: Bulbapedia — Poison Point: 30% chance to poison attacker on contact
      // Source: Showdown Gen 4 mod — Poison Point trigger (30%)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status("poison", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "poison" }],
        messages: [],
      };
    }

    case "rough-skin": {
      // Source: Bulbapedia — Rough Skin: deals 1/8 attacker's max HP on contact (always)
      // Source: Showdown Gen 4 mod — Rough Skin trigger (guaranteed chip)
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
      return {
        activated: true,
        effects: [{ effectType: "chip-damage", target: "opponent", value: chipDamage }],
        messages: [],
      };
    }

    case "effect-spore": {
      // Source: Bulbapedia — Effect Spore: 30% total chance on contact; if triggered,
      //   1/3 chance each for poison, paralysis, sleep
      // Source: Showdown Gen 4 mod — Effect Spore trigger (30% gate, then 1/3 splits)
      if (attackerStatus) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      const roll = context.rng.next();
      if (roll < 1 / 3) {
        // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
        if (!canInflictGen4Status("poison", attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [{ effectType: "status-inflict", target: "opponent", status: "poison" }],
          messages: [],
        };
      }
      if (roll < 2 / 3) {
        // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
        if (!canInflictGen4Status("paralysis", attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [{ effectType: "status-inflict", target: "opponent", status: "paralysis" }],
          messages: [],
        };
      }
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability status infliction
      if (!canInflictGen4Status("sleep", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "sleep" }],
        messages: [],
      };
    }

    case "cute-charm": {
      // Source: Bulbapedia — Cute Charm: 30% chance to infatuate attacker on contact;
      //   requires opposite genders, fails if either is genderless
      // Source: Showdown Gen 4 mod — Cute Charm trigger (30%, gender check)
      if (context.rng.next() >= 0.3) return { activated: false, effects: [], messages: [] };
      const defenderGender = context.pokemon.pokemon.gender;
      const attackerGender = attacker.pokemon.gender;
      if (
        !defenderGender ||
        !attackerGender ||
        defenderGender === "genderless" ||
        attackerGender === "genderless" ||
        defenderGender === attackerGender
      ) {
        return { activated: false, effects: [], messages: [] };
      }
      // Source: Showdown Gen 4 mod — type/ability immunity check before contact-ability volatile infliction
      if (isVolatileBlockedByAbility(attacker, "infatuation"))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "volatile-inflict", target: "opponent", volatile: "infatuation" }],
        messages: [],
      };
    }

    case "aftermath": {
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
        effects: [{ effectType: "chip-damage", target: "opponent", value: chipDamage }],
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
    case "water-absorb": {
      // Source: Bulbapedia — Water Absorb: Water moves heal 1/4 max HP instead of dealing damage
      // Source: Showdown Gen 4 mod — Water Absorb immunity + heal
      if (moveType !== "water") return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: "heal", target: "self", value: healAmt }],
        messages: [],
      };
    }

    case "volt-absorb": {
      // Source: Bulbapedia — Volt Absorb: Electric moves heal 1/4 max HP instead of dealing damage
      // Source: Showdown Gen 4 mod — Volt Absorb immunity + heal
      if (moveType !== "electric") return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: "heal", target: "self", value: healAmt }],
        messages: [],
      };
    }

    case "motor-drive": {
      // Source: Bulbapedia — Motor Drive: Electric moves raise Speed by 1 instead of dealing damage
      // Source: Showdown Gen 4 mod — Motor Drive immunity + Speed boost
      if (moveType !== "electric") return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
        messages: [],
      };
    }

    case "dry-skin": {
      // Source: Bulbapedia — Dry Skin: Water moves heal 1/4 max HP (also takes 1.25x from Fire,
      //   but the Fire weakness is handled in damage calc, not here)
      // Source: Showdown Gen 4 mod — Dry Skin passive immunity (Water only)
      if (moveType !== "water") return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: "heal", target: "self", value: healAmt }],
        messages: [],
      };
    }

    case "flash-fire": {
      // Source: Bulbapedia — Flash Fire: Fire moves are absorbed; powers up holder's Fire moves
      //   "Flash Fire raises the power of Fire-type moves by 50% while it is in effect."
      // Source: Showdown Gen 4 mod — Flash Fire immunity + volatile status for damage boost
      if (moveType !== "fire") return { activated: false, effects: [], messages: [] };
      const hasBoost = context.pokemon.volatileStatuses.has("flash-fire");
      const effects: AbilityEffect[] = [];
      if (!hasBoost) {
        effects.push({ effectType: "volatile-inflict", target: "self", volatile: "flash-fire" });
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

    case "levitate": {
      // Source: Bulbapedia — Levitate: Ground moves have no effect
      // Source: Showdown Gen 4 mod — Levitate ground immunity
      if (moveType !== "ground") return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [],
        messages: [],
      };
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
  if (abilityId !== "steadfast") {
    return { activated: false, effects: [], messages: [] };
  }

  // Steadfast: raises Speed by 1 stage when the Pokemon flinches
  // Source: Showdown Gen 4 mod — Steadfast +1 Speed on flinch
  // Source: Bulbapedia — Steadfast: raises Speed by 1 stage when the holder flinches
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  const effect: AbilityEffect = {
    effectType: "stat-change",
    target: "self",
    stat: "speed",
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Steadfast raised its Speed!`],
  };
}
