import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  applyGen3Ability,
} from "../../src";

/**
 * Gen 3 Trace ability tests.
 *
 * Trace copies the opponent's ability on switch-in. In Gen 3, only Trace
 * itself is uncopyable (no Multitype/Forecast — those don't exist in Gen 3).
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_TRACE
 * Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"
 */

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen3DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const GENDERS = CORE_GENDERS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN3_SPECIES_IDS.gardevoir);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN3_NATURE_IDS.hardy).id;
const TRACE_TARGETS = {
  intimidate: DATA_MANAGER.getSpecies(GEN3_SPECIES_IDS.mightyena),
  speedBoost: DATA_MANAGER.getSpecies(GEN3_SPECIES_IDS.ninjask),
} as const;
const TRACE_MOVE = createMoveSlot(DATA_MANAGER.getMove(GEN3_MOVE_IDS.tackle));

function createTracePokemon(opts: {
  speciesId?: number;
  nickname?: string | null;
  ability: string;
  types?: PokemonType[];
}): ActivePokemon {
  const species = opts.speciesId ? DATA_MANAGER.getSpecies(opts.speciesId) : DEFAULT_SPECIES;
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  const pokemon = {
    uid: "trace-test",
    speciesId: species.id,
    nickname: opts.nickname ?? species.displayName,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: 200,
    moves: [TRACE_MOVE],
    ability: opts.ability,
    abilitySlot: ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  };

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? (species.types as PokemonType[]),
    ability: opts.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createTraceContext(opts: {
  pokemonAbility: string;
  pokemonNickname?: string | null;
  opponentAbility?: string;
  opponentNickname?: string | null;
  hasOpponent?: boolean;
}): AbilityContext {
  const pokemon = createTracePokemon({
    ability: opts.pokemonAbility,
    nickname: opts.pokemonNickname,
  });
  const opponent =
    opts.hasOpponent !== false
      ? createTracePokemon({
          ability: opts.opponentAbility ?? CORE_ABILITY_IDS.none,
          nickname: opts.opponentNickname,
          speciesId: TRACE_TARGETS.intimidate.id,
        })
      : undefined;

  return {
    pokemon,
    opponent,
    state: { weather: null } as AbilityContext["state"],
    rng: {
      next: () => 0,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: readonly T[]) => [...arr],
      getState: () => 0,
      setState: () => {},
    },
    trigger: TRIGGERS.onSwitchIn,
  } as AbilityContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Trace", () => {
  it("given Trace Pokemon switches in against Intimidate opponent, when on-switch-in fires, then ability changes to Intimidate", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
    // Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"
    const ctx = createTraceContext({
      pokemonAbility: ABILITIES.trace,
      pokemonNickname: DEFAULT_SPECIES.displayName,
      opponentAbility: GEN3_ABILITY_IDS.intimidate,
      opponentNickname: TRACE_TARGETS.intimidate.displayName,
    });
    const result = applyGen3Ability(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("ability-change");
    if (result.effects[0]!.effectType === "ability-change") {
      expect(result.effects[0]!.newAbility).toBe(GEN3_ABILITY_IDS.intimidate);
      expect(result.effects[0]!.target).toBe("self");
    }
    expect(result.messages[0]).toBe("Gardevoir traced Mightyena's intimidate!");
  });

  it("given Trace Pokemon switches in against Speed Boost opponent, when on-switch-in fires, then ability changes to Speed Boost", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
    // Triangulation: second independent test with different ability
    const ctx = createTraceContext({
      pokemonAbility: ABILITIES.trace,
      pokemonNickname: DEFAULT_SPECIES.displayName,
      opponentAbility: GEN3_ABILITY_IDS.speedBoost,
      opponentNickname: TRACE_TARGETS.speedBoost.displayName,
    });
    const result = applyGen3Ability(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "ability-change") {
      expect(result.effects[0]!.newAbility).toBe(GEN3_ABILITY_IDS.speedBoost);
    }
    expect(result.messages[0]).toBe("Gardevoir traced Ninjask's speed-boost!");
  });

  it("given Trace Pokemon switches in against Trace opponent, when on-switch-in fires, then ability does NOT change", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE cannot copy itself
    // Source: Bulbapedia — "Trace cannot copy Trace"
    const ctx = createTraceContext({
      pokemonAbility: ABILITIES.trace,
      opponentAbility: ABILITIES.trace,
    });
    const result = applyGen3Ability(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
    expect(result.messages.length).toBe(0);
  });

  it("given Trace Pokemon switches in against no opponent, when on-switch-in fires, then no effect", () => {
    // Edge case: no opponent on field (all fainted)
    const ctx = createTraceContext({
      pokemonAbility: ABILITIES.trace,
      hasOpponent: false,
    });
    const result = applyGen3Ability(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Trace Pokemon switches in against opponent with empty ability string, when on-switch-in fires, then no effect", () => {
    // Edge case: opponent's ability is empty string (shouldn't happen but defensive)
    const ctx = createTraceContext({
      pokemonAbility: ABILITIES.trace,
      opponentAbility: "",
    });
    const result = applyGen3Ability(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });
});
