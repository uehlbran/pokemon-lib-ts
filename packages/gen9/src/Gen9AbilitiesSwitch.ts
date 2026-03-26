import type { AbilityContext, AbilityResult, BattleState } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, ScreenType, TerrainType } from "@pokemon-lib-ts/core";
import {
  CORE_ITEM_IDS,
  CORE_SCREEN_IDS,
  CORE_TERRAIN_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN9_ABILITY_IDS } from "./data/reference-ids";

/**
 * Gen 9 switch-in, switch-out, contact, and passive ability handlers.
 *
 * Carries forward Gen 8 switch/contact abilities with Gen 9 changes:
 *   - Snow Warning: sets Snow instead of Hail (Gen 9 weather change)
 *   - Intrepid Sword: once per battle (Gen 9 nerf, handled in Gen9AbilitiesNew.ts)
 *   - Dauntless Shield: once per battle (Gen 9 nerf, handled in Gen9AbilitiesNew.ts)
 *   - Protean/Libero: once per switch-in (Gen 9 nerf, handled in Gen9AbilitiesNew.ts)
 *   - Orichalcum Pulse (new): sets Sun on entry
 *   - Hadron Engine (new): sets Electric Terrain on entry
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

function getOpponentName(ctx: AbilityContext): string {
  if (!ctx.opponent) return "the opposing Pokemon";
  return ctx.opponent.pokemon.nickname ?? String(ctx.opponent.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Abilities that cannot be copied by Trace in Gen 9.
 *
 * Source: Showdown data/abilities.ts -- trace.onUpdate ban list
 */
export const TRACE_UNCOPYABLE_ABILITIES = new Set([
  "trace",
  "multitype",
  "forecast",
  "illusion",
  "flower-gift",
  "imposter",
  "zen-mode",
  "stance-change",
  "power-construct",
  "schooling",
  "comatose",
  "shields-down",
  "disguise",
  "rks-system",
  "battle-bond",
  "receiver",
  "power-of-alchemy",
  // Gen 8 additions
  "hunger-switch",
  "gulp-missile",
  "ice-face",
  "neutralizing-gas",
  "intrepid-sword",
  "dauntless-shield",
  // Gen 9 additions
  GEN9_ABILITY_IDS.protosynthesis,
  GEN9_ABILITY_IDS.quarkDrive,
  GEN9_ABILITY_IDS.orichalcumPulse,
  GEN9_ABILITY_IDS.hadronEngine,
  GEN9_ABILITY_IDS.embodyAspectTeal,
  GEN9_ABILITY_IDS.embodyAspectHearthflame,
  GEN9_ABILITY_IDS.embodyAspectWellspring,
  GEN9_ABILITY_IDS.embodyAspectCornerstone,
]);

/**
 * Abilities that cannot be overwritten by Mummy or suppressed by Gastro Acid.
 *
 * Source: Showdown data/abilities.ts -- cantsuppress
 */
export const UNSUPPRESSABLE_ABILITIES = new Set([
  "multitype",
  "stance-change",
  "schooling",
  "comatose",
  "shields-down",
  "disguise",
  "rks-system",
  "battle-bond",
  "power-construct",
  // Gen 8 additions
  "gulp-missile",
  "ice-face",
  "neutralizing-gas",
  // Gen 9 additions
  GEN9_ABILITY_IDS.protosynthesis,
  GEN9_ABILITY_IDS.quarkDrive,
  GEN9_ABILITY_IDS.orichalcumPulse,
  GEN9_ABILITY_IDS.hadronEngine,
  GEN9_ABILITY_IDS.embodyAspectTeal,
  GEN9_ABILITY_IDS.embodyAspectHearthflame,
  GEN9_ABILITY_IDS.embodyAspectWellspring,
  GEN9_ABILITY_IDS.embodyAspectCornerstone,
  GEN9_ABILITY_IDS.goodAsGold,
]);

/**
 * Mold Breaker ability variants.
 *
 * Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
 */
export const MOLD_BREAKER_ALIASES = new Set(["mold-breaker", "teravolt", "turboblaze"]);

/**
 * Weather duration extension by weather rocks: 5 turns base, 8 with rock.
 *
 * Source: Bulbapedia -- individual rock item pages
 * Source: Showdown data/items.ts -- damprock/heatrock/smoothrock/icyrock
 */
const WEATHER_ROCK_MAP: Readonly<Record<string, { weather: string; turns: number }>> = {
  [CORE_ITEM_IDS.dampRock]: { weather: CORE_WEATHER_IDS.rain, turns: 8 },
  [CORE_ITEM_IDS.heatRock]: { weather: CORE_WEATHER_IDS.sun, turns: 8 },
  [CORE_ITEM_IDS.smoothRock]: { weather: CORE_WEATHER_IDS.sand, turns: 8 },
  [CORE_ITEM_IDS.icyRock]: { weather: CORE_WEATHER_IDS.snow, turns: 8 },
};

const BASE_WEATHER_TURNS = 5;

/**
 * Terrain duration extension: 5 turns base, 8 with Terrain Extender.
 *
 * Source: Showdown data/items.ts -- terrainextender
 */
const BASE_TERRAIN_TURNS = 5;
const EXTENDED_TERRAIN_TURNS = 8;

/**
 * Screen types removed by Screen Cleaner.
 *
 * Source: Showdown data/abilities.ts -- Screen Cleaner onStart
 */
export const SCREEN_CLEANER_SCREENS: readonly ScreenType[] = [
  CORE_SCREEN_IDS.reflect,
  CORE_SCREEN_IDS.lightScreen,
  CORE_SCREEN_IDS.auroraVeil,
];

/**
 * Map of Surge ability names to the terrain they set.
 *
 * Source: Showdown data/abilities.ts -- Electric Surge, Grassy Surge, etc.
 */
const SURGE_ABILITIES: Readonly<Record<string, TerrainType>> = {
  [GEN9_ABILITY_IDS.electricSurge]: CORE_TERRAIN_IDS.electric,
  [GEN9_ABILITY_IDS.grassySurge]: CORE_TERRAIN_IDS.grassy,
  [GEN9_ABILITY_IDS.psychicSurge]: CORE_TERRAIN_IDS.psychic,
  [GEN9_ABILITY_IDS.mistySurge]: CORE_TERRAIN_IDS.misty,
};

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Weather helpers
// ---------------------------------------------------------------------------

/**
 * Get the weather duration based on held item.
 *
 * Source: Showdown data/items.ts -- weather rocks
 */
export function getWeatherDuration(heldItem: string | null, weather: string): number {
  if (heldItem) {
    const rock = WEATHER_ROCK_MAP[heldItem];
    if (rock && rock.weather === weather) {
      return rock.turns;
    }
  }
  return BASE_WEATHER_TURNS;
}

/**
 * Get terrain duration based on held item.
 */
function getTerrainDuration(heldItem: string | null): number {
  if (heldItem === "terrain-extender") return EXTENDED_TERRAIN_TURNS;
  return BASE_TERRAIN_TURNS;
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a Gen 9 switch-in/switch-out/contact/passive ability trigger.
 */
export function handleGen9SwitchAbility(
  trigger: AbilityTrigger,
  context: AbilityContext,
): AbilityResult {
  switch (trigger) {
    case "on-switch-in":
      return handleSwitchIn(context);
    case "on-switch-out":
      return handleSwitchOut(context);
    case "on-contact":
      return handleOnContact(context);
    case "on-status-inflicted":
      return handleOnStatusInflicted(context);
    case "on-turn-end":
      return handleTurnEnd(context);
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-in
// ---------------------------------------------------------------------------

function handleSwitchIn(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "intimidate": {
      // Source: Showdown data/abilities.ts -- Intimidate lowers opponent's Attack by 1 stage
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.substituteHp > 0) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [{ effectType: "stat-change", target: "opponent", stat: "attack", stages: -1 }],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case "pressure": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case "drizzle": {
      const turns = getWeatherDuration(ctx.pokemon.pokemon.heldItem, "rain");
      return {
        activated: true,
        effects: [
          { effectType: "weather-set", target: "field", weather: "rain", weatherTurns: turns },
        ],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      const turns = getWeatherDuration(ctx.pokemon.pokemon.heldItem, "sun");
      return {
        activated: true,
        effects: [
          { effectType: "weather-set", target: "field", weather: "sun", weatherTurns: turns },
        ],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      const turns = getWeatherDuration(ctx.pokemon.pokemon.heldItem, "sand");
      return {
        activated: true,
        effects: [
          { effectType: "weather-set", target: "field", weather: "sand", weatherTurns: turns },
        ],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case "snow-warning": {
      // Gen 9: Snow Warning sets Snow instead of Hail
      // Source: Showdown data/abilities.ts -- snowwarning: sets "snow" in Gen 9
      // Source: specs/battle/10-gen9.md -- "Snow replaces Hail"
      const turns = getWeatherDuration(ctx.pokemon.pokemon.heldItem, "snow");
      return {
        activated: true,
        effects: [
          { effectType: "weather-set", target: "field", weather: "snow", weatherTurns: turns },
        ],
        messages: [`${name}'s Snow Warning made it snow!`],
      };
    }

    case "orichalcum-pulse": {
      // Source: Showdown data/abilities.ts:3016-3035
      // Sets Sun on entry; Attack boost handled as a stat modifier during damage calc
      const turns = getWeatherDuration(ctx.pokemon.pokemon.heldItem, "sun");
      return {
        activated: true,
        effects: [
          { effectType: "weather-set", target: "field", weather: "sun", weatherTurns: turns },
        ],
        messages: [`${name}'s Orichalcum Pulse turned the sunlight harsh!`],
      };
    }

    case "hadron-engine": {
      // Source: Showdown data/abilities.ts:1725-1742
      // Sets Electric Terrain on entry; SpA boost handled as a stat modifier during damage calc
      const turns = getTerrainDuration(ctx.pokemon.pokemon.heldItem);
      // Directly set terrain on state
      const mutableState = ctx.state as BattleState;
      mutableState.terrain = {
        type: "electric",
        turnsLeft: turns,
        source: "hadron-engine",
      };
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Hadron Engine set Electric Terrain!`],
      };
    }

    case "download": {
      if (!ctx.opponent) return NO_EFFECT;
      const foeStats = ctx.opponent.pokemon.calculatedStats;
      if (!foeStats) return NO_EFFECT;
      const raisesAtk = foeStats.defense < foeStats.spDefense;
      const stat = raisesAtk ? ("attack" as const) : ("spAttack" as const);
      const statName = raisesAtk ? "Attack" : "Sp. Atk";
      return {
        activated: true,
        effects: [{ effectType: "stat-change", target: "self", stat, stages: 1 }],
        messages: [`${name}'s Download raised its ${statName}!`],
      };
    }

    case "trace": {
      if (!ctx.opponent) return NO_EFFECT;
      const opponentAbility = ctx.opponent.ability;
      if (!opponentAbility || TRACE_UNCOPYABLE_ABILITIES.has(opponentAbility)) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [{ effectType: "ability-change", target: "self", newAbility: opponentAbility }],
        messages: [`${name} traced ${oppName}'s ${opponentAbility}!`],
      };
    }

    case "mold-breaker": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} breaks the mold!`],
      };
    }

    case "teravolt": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} is radiating a bursting aura!`],
      };
    }

    case "turboblaze": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} is radiating a blazing aura!`],
      };
    }

    case "imposter": {
      if (!ctx.opponent) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name} transformed into ${oppName}!`],
      };
    }

    case "illusion": {
      return {
        activated: true,
        effects: [{ effectType: "volatile-inflict", target: "self", volatile: "illusion" }],
        messages: [],
      };
    }

    case "screen-cleaner": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "field" }],
        messages: [`${name}'s Screen Cleaner removed all screens!`],
      };
    }

    // Surge abilities
    case "electric-surge":
    case "grassy-surge":
    case "psychic-surge":
    case "misty-surge": {
      return handleSurgeAbilitySwitchIn(ctx);
    }

    // Speed Boost announces on switch-in (actual boost is end-of-turn)
    case "speed-boost": {
      return NO_EFFECT; // Speed Boost activates at end-of-turn, not switch-in
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// Surge ability handler
// ---------------------------------------------------------------------------

function handleSurgeAbilitySwitchIn(ctx: AbilityContext): AbilityResult {
  const terrainType = SURGE_ABILITIES[ctx.pokemon.ability];
  if (!terrainType) return NO_EFFECT;

  if (ctx.pokemon.suppressedAbility !== null) return NO_EFFECT;

  const duration = getTerrainDuration(ctx.pokemon.pokemon.heldItem);

  // Directly set terrain on state
  const mutableState = ctx.state as BattleState;
  mutableState.terrain = {
    type: terrainType,
    turnsLeft: duration,
    source: ctx.pokemon.ability,
  };

  const name = getName(ctx);
  const terrainDisplayNames: Record<TerrainType, string> = {
    electric: "Electric Terrain",
    grassy: "Grassy Terrain",
    psychic: "Psychic Terrain",
    misty: "Misty Terrain",
  };

  return {
    activated: true,
    effects: [],
    messages: [`${name}'s ${ctx.pokemon.ability} set ${terrainDisplayNames[terrainType]}!`],
  };
}

// ---------------------------------------------------------------------------
// on-switch-out
// ---------------------------------------------------------------------------

function handleSwitchOut(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "regenerator": {
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const healAmount = Math.max(1, Math.floor(maxHp / 3));
      return {
        activated: true,
        effects: [{ effectType: "heal", target: "self", value: healAmount }],
        messages: [`${name}'s Regenerator restored its HP!`],
      };
    }

    case "natural-cure": {
      if (!ctx.pokemon.pokemon.status) return NO_EFFECT;
      return {
        activated: true,
        effects: [{ effectType: "status-cure", target: "self" }],
        messages: [`${name}'s Natural Cure cured its status!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-contact
// ---------------------------------------------------------------------------

function handleOnContact(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const other = ctx.opponent;
  if (!other) return NO_EFFECT;

  const name = getName(ctx);

  switch (abilityId) {
    case "static": {
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "paralysis" }],
        messages: [`${name}'s Static paralyzed the attacker!`],
      };
    }

    case "flame-body": {
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "burn" }],
        messages: [`${name}'s Flame Body burned the attacker!`],
      };
    }

    case "poison-point": {
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: "poison" }],
        messages: [`${name}'s Poison Point poisoned the attacker!`],
      };
    }

    case "rough-skin":
    case "iron-barbs": {
      const maxHp = other.pokemon.calculatedStats?.hp ?? other.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      const abilityName = abilityId === "rough-skin" ? "Rough Skin" : "Iron Barbs";
      return {
        activated: true,
        effects: [{ effectType: "chip-damage", target: "opponent", value: chipDamage }],
        messages: [`${name}'s ${abilityName} hurt the attacker!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-status-inflicted
// ---------------------------------------------------------------------------

function handleOnStatusInflicted(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "synchronize": {
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.pokemon.status) return NO_EFFECT;
      const myStatus = ctx.pokemon.pokemon.status;
      if (!myStatus || (myStatus !== "burn" && myStatus !== "poison" && myStatus !== "paralysis")) {
        return NO_EFFECT;
      }
      return {
        activated: true,
        effects: [{ effectType: "status-inflict", target: "opponent", status: myStatus }],
        messages: [`${name}'s Synchronize passed the status!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-turn-end
// ---------------------------------------------------------------------------

function handleTurnEnd(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "speed-boost": {
      // Source: Showdown data/abilities.ts -- Speed Boost: +1 Speed at end of turn
      return {
        activated: true,
        effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
        messages: [`${name}'s Speed Boost raised its Speed!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// Passive ability check helpers
// ---------------------------------------------------------------------------

/**
 * Check if an ability is a Mold Breaker variant.
 */
export function isMoldBreakerAbility(abilityId: string): boolean {
  return MOLD_BREAKER_ALIASES.has(abilityId);
}

/**
 * Check if a Surge ability ID maps to a terrain type.
 */
export function isSurgeAbility(abilityId: string): boolean {
  return abilityId in SURGE_ABILITIES;
}
