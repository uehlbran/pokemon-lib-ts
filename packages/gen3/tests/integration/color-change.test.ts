import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_TRIGGER_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
} from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../../src/Gen3Abilities";

/**
 * Gen 3 Color Change ability tests.
 *
 * Color Change changes the holder's type to match the type of the move that hit it.
 * Only activates on damaging moves. Does not activate if already mono-typed to
 * the incoming move's type.
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
 * Source: Bulbapedia — "Color Change changes the user's type to that of the move that hits it"
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;
const types = CORE_TYPE_IDS;
const abilityIds = GEN3_ABILITY_IDS;
const moveIds = GEN3_MOVE_IDS;
const speciesIds = GEN3_SPECIES_IDS;

type Gen3MoveId = (typeof moveIds)[keyof typeof moveIds];

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

function createActivePokemon(opts: {
  types: PokemonType[];
  ability: string;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  const speciesId = opts.speciesId ?? speciesIds.kecleon;
  const species = dataManager.getSpecies(speciesId);
  const pokemon = {
    uid: "test",
    speciesId,
    nickname: opts.nickname === undefined ? species.displayName : opts.nickname,
    level: 50,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

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
    types: opts.types,
    ability: opts.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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

function createCanonicalMove(moveId: Gen3MoveId): MoveData {
  return dataManager.getMove(moveId);
}

function createDamageTakenContext(pokemon: ActivePokemon, move?: MoveData): AbilityContext {
  return {
    pokemon,
    state: { weather: null } as AbilityContext["state"],
    rng: createMockRng(),
    trigger: abilityTriggers.onDamageTaken,
    move,
  } as AbilityContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Color Change", () => {
  it("given Color Change Pokemon hit by Fire move, when on-damage-taken fires, then type changes to fire", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Kecleon is Normal-type, hit by Fire move -> becomes Fire-type
    const pokemon = createActivePokemon({
      types: [types.normal],
      ability: abilityIds.colorChange,
      speciesId: speciesIds.kecleon,
      nickname: "Kecleon",
    });
    const move = createCanonicalMove(moveIds.flamethrower);
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("type-change");
    if (result.effects[0]!.effectType === "type-change") {
      expect(result.effects[0]!.types).toEqual([types.fire]);
      expect(result.effects[0]!.target).toBe("self");
    }
    expect(result.messages[0]).toBe(`Kecleon's Color Change made it the ${types.fire} type!`);
  });

  it("given Color Change Pokemon hit by Water move, when on-damage-taken fires, then type changes to water", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Triangulation: second independent test with different move type
    const pokemon = createActivePokemon({
      types: [types.normal],
      ability: abilityIds.colorChange,
      speciesId: speciesIds.kecleon,
      nickname: "Kecleon",
    });
    const move = createCanonicalMove(moveIds.surf);
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "type-change") {
      expect(result.effects[0]!.types).toEqual([types.water]);
    }
    expect(result.messages[0]).toBe(`Kecleon's Color Change made it the ${types.water} type!`);
  });

  it("given Color Change Pokemon already fire-type hit by Fire move, when on-damage-taken fires, then no type change", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Does not activate if already mono-typed to the move's type
    const pokemon = createActivePokemon({
      types: [types.fire],
      ability: abilityIds.colorChange,
      speciesId: speciesIds.kecleon,
      nickname: "Kecleon",
    });
    const move = createCanonicalMove(moveIds.flamethrower);
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Color Change dual-type Pokemon hit by one of its types, when on-damage-taken fires, then Color Change does NOT activate", () => {
    // pokeemerald IS_BATTLER_OF_TYPE checks BOTH type slots:
    //   gBattleMons[battler].types[0] == type || gBattleMons[battler].types[1] == type
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE check at line 2757
    // A fire/water Pokemon hit by fire should NOT change (fire type already present in slot 0)
    const pokemon = createActivePokemon({
      types: [types.fire, types.water],
      ability: abilityIds.colorChange,
      speciesId: speciesIds.kecleon,
      nickname: "Kecleon",
    });
    const move = createCanonicalMove(moveIds.flamethrower);
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    // Color Change does NOT activate — fire type already present
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Color Change Pokemon with no move context, when on-damage-taken fires, then no type change", () => {
    // Edge case: no move in context (should not happen in normal flow, but defensive)
    const pokemon = createActivePokemon({
      types: [types.normal],
      ability: abilityIds.colorChange,
      speciesId: speciesIds.kecleon,
      nickname: "Kecleon",
    });
    const ctx = createDamageTakenContext(pokemon, undefined);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given non-Color-Change Pokemon, when on-damage-taken fires, then no effect", () => {
    // Non-Color-Change abilities should not trigger type change
    const pokemon = createActivePokemon({
      types: [types.normal],
      ability: abilityIds.hugePower,
      speciesId: speciesIds.azumarill,
      nickname: "Azumarill",
    });
    const move = createCanonicalMove(moveIds.flamethrower);
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability(abilityTriggers.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });
});
