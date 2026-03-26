import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  type AbilityTrigger,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
} from "../../src";
import { applyGen3Ability } from "../../src/Gen3Abilities";

/**
 * Gen 3 Truant ability tests -- end-of-turn toggle.
 *
 * Bug #307 fix: the Truant toggle (loafing <-> acting) must happen at
 * ABILITYEFFECT_ENDTURN, not at move execution. This ensures the counter
 * advances even when the Pokemon is paralyzed/frozen/asleep and doesn't
 * execute a move.
 *
 * Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
 * Source: Bulbapedia -- "Truant causes the Pokemon to use a move only every other turn"
 */

const DATA_MANAGER = createGen3DataManager();
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const _TYPES = CORE_TYPE_IDS;
const SLAKING = DATA_MANAGER.getSpecies(GEN3_SPECIES_IDS.slaking);
const HARDY_NATURE = DATA_MANAGER.getNature(GEN3_NATURE_IDS.hardy).id;
const TACKLE = DATA_MANAGER.getMove(GEN3_MOVE_IDS.tackle);

function createMockRng() {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => 100,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createPokemonInstance(overrides: {
  ability?: string;
  currentHp?: number;
  maxHp?: number;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  types?: PokemonType[];
  volatiles?: Map<string, { turnsLeft: number }>;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: SLAKING.id,
    nickname: overrides.nickname ?? SLAKING.displayName,
    level: 50,
    experience: 0,
    nature: HARDY_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [TACKLE],
    ability: overrides.ability ?? GEN3_ABILITY_IDS.truant,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  currentHp?: number;
  maxHp?: number;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  types?: PokemonType[];
  volatiles?: Map<string, { turnsLeft: number }>;
}): ActivePokemon {
  const pokemon = createPokemonInstance({
    ability: overrides.ability,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    nickname: overrides.nickname,
    status: overrides.status,
    types: overrides.types,
    volatiles: overrides.volatiles,
  });

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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [...SLAKING.types],
    ability: overrides.ability ?? GEN3_ABILITY_IDS.truant,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleState(): AbilityContext["state"] {
  return {
    weather: null,
  } as AbilityContext["state"];
}

function createAbilityContext(pokemon: ActivePokemon, trigger: AbilityTrigger): AbilityContext {
  return {
    pokemon,
    state: createBattleState(),
    rng: createMockRng(),
    trigger,
  } as AbilityContext;
}

describe("Gen 3 Truant -- end-of-turn toggle (#307)", () => {
  it("given Truant Pokemon with no truant-turn volatile, when on-turn-end fires, then truant-turn volatile is set (will loaf next turn)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    const pokemon = createOnFieldPokemon({
      ability: GEN3_ABILITY_IDS.truant,
      nickname: SLAKING.displayName,
      types: [...SLAKING.types],
    });
    const ctx = createAbilityContext(pokemon, TRIGGERS.onTurnEnd);
    const result = applyGen3Ability(TRIGGERS.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given Truant Pokemon with truant-turn volatile, when on-turn-end fires, then truant-turn volatile is removed (can act next turn)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    const volatiles = new Map<string, { turnsLeft: number }>([["truant-turn", { turnsLeft: -1 }]]);
    const pokemon = createOnFieldPokemon({
      ability: GEN3_ABILITY_IDS.truant,
      nickname: SLAKING.displayName,
      types: [...SLAKING.types],
      volatiles,
    });
    const ctx = createAbilityContext(pokemon, TRIGGERS.onTurnEnd);
    const result = applyGen3Ability(TRIGGERS.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);
  });

  it("given Truant Pokemon with truant-turn volatile, when on-before-move fires, then movePrevented=true but volatile is not removed", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    const volatiles = new Map<string, { turnsLeft: number }>([["truant-turn", { turnsLeft: -1 }]]);
    const pokemon = createOnFieldPokemon({
      ability: GEN3_ABILITY_IDS.truant,
      nickname: SLAKING.displayName,
      types: [...SLAKING.types],
      volatiles,
    });
    const ctx = createAbilityContext(pokemon, TRIGGERS.onBeforeMove);
    const result = applyGen3Ability(TRIGGERS.onBeforeMove, ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toBe("Slaking is loafing around!");
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given paralyzed Truant Pokemon that cannot move on turn 1, when on-turn-end fires, then toggle still advances", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    const pokemon = createOnFieldPokemon({
      ability: GEN3_ABILITY_IDS.truant,
      nickname: SLAKING.displayName,
      types: [...SLAKING.types],
    });
    const ctx = createAbilityContext(pokemon, TRIGGERS.onTurnEnd);
    const result = applyGen3Ability(TRIGGERS.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given Truant Pokemon, when full act-loaf-act cycle via end-of-turn toggles, then cycle is correct", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    const pokemon = createOnFieldPokemon({
      ability: GEN3_ABILITY_IDS.truant,
      nickname: SLAKING.displayName,
      types: [...SLAKING.types],
    });

    const beforeMove1 = applyGen3Ability(
      TRIGGERS.onBeforeMove,
      createAbilityContext(pokemon, TRIGGERS.onBeforeMove),
    );
    expect(beforeMove1.movePrevented).toBeUndefined();

    applyGen3Ability(TRIGGERS.onTurnEnd, createAbilityContext(pokemon, TRIGGERS.onTurnEnd));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);

    const beforeMove2 = applyGen3Ability(
      TRIGGERS.onBeforeMove,
      createAbilityContext(pokemon, TRIGGERS.onBeforeMove),
    );
    expect(beforeMove2.movePrevented).toBe(true);

    applyGen3Ability(TRIGGERS.onTurnEnd, createAbilityContext(pokemon, TRIGGERS.onTurnEnd));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);

    const beforeMove3 = applyGen3Ability(
      TRIGGERS.onBeforeMove,
      createAbilityContext(pokemon, TRIGGERS.onBeforeMove),
    );
    expect(beforeMove3.movePrevented).toBeUndefined();
  });
});
