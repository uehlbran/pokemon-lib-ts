import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../src/Gen3Abilities";

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
  const pokemon = {
    uid: "test",
    speciesId: 352, // Kecleon
    nickname: opts.nickname === undefined ? "Kecleon" : opts.nickname,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability,
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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

function createMove(type: PokemonType): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type,
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 3,
  } as MoveData;
}

function createDamageTakenContext(pokemon: ActivePokemon, move?: MoveData): AbilityContext {
  return {
    pokemon,
    state: { weather: null } as AbilityContext["state"],
    rng: createMockRng(),
    trigger: "on-damage-taken",
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
      types: ["normal"],
      ability: "color-change",
      nickname: "Kecleon",
    });
    const move = createMove("fire");
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("type-change");
    if (result.effects[0]!.effectType === "type-change") {
      expect(result.effects[0]!.types).toEqual(["fire"]);
      expect(result.effects[0]!.target).toBe("self");
    }
    expect(result.messages[0]).toBe("Kecleon's Color Change made it the fire type!");
  });

  it("given Color Change Pokemon hit by Water move, when on-damage-taken fires, then type changes to water", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Triangulation: second independent test with different move type
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "color-change",
      nickname: "Kecleon",
    });
    const move = createMove("water");
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "type-change") {
      expect(result.effects[0]!.types).toEqual(["water"]);
    }
    expect(result.messages[0]).toBe("Kecleon's Color Change made it the water type!");
  });

  it("given Color Change Pokemon already fire-type hit by Fire move, when on-damage-taken fires, then no type change", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Does not activate if already mono-typed to the move's type
    const pokemon = createActivePokemon({
      types: ["fire"],
      ability: "color-change",
      nickname: "Kecleon",
    });
    const move = createMove("fire");
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Color Change dual-type Pokemon hit by one of its types, when on-damage-taken fires, then Color Change does NOT activate", () => {
    // pokeemerald IS_BATTLER_OF_TYPE checks BOTH type slots:
    //   gBattleMons[battler].types[0] == type || gBattleMons[battler].types[1] == type
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE check at line 2757
    // A fire/water Pokemon hit by fire should NOT change (fire type already present in slot 0)
    const pokemon = createActivePokemon({
      types: ["fire", "water"],
      ability: "color-change",
      nickname: "Kecleon",
    });
    const move = createMove("fire");
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability("on-damage-taken", ctx);

    // Color Change does NOT activate — fire type already present
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Color Change Pokemon with no move context, when on-damage-taken fires, then no type change", () => {
    // Edge case: no move in context (should not happen in normal flow, but defensive)
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "color-change",
      nickname: "Kecleon",
    });
    const ctx = createDamageTakenContext(pokemon, undefined);
    const result = applyGen3Ability("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given non-Color-Change Pokemon, when on-damage-taken fires, then no effect", () => {
    // Non-Color-Change abilities should not trigger type change
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "huge-power",
      nickname: "Azumarill",
    });
    const move = createMove("fire");
    const ctx = createDamageTakenContext(pokemon, move);
    const result = applyGen3Ability("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });
});
