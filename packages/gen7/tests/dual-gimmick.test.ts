/**
 * Dual Gimmick Integration Tests -- Gen 7 Mega Evolution + Z-Move coexistence.
 *
 * Gen 7 is the only generation where two gimmicks (Mega Evolution and Z-Moves)
 * can be used in the same battle. This is tracked via internal per-side Sets
 * in each gimmick class, rather than the shared `side.gimmickUsed` boolean.
 *
 * Source: Showdown sim/side.ts:170 -- megaUsed and zMoveUsed are separate booleans
 * Source: Bulbapedia "Z-Move" -- "A Trainer can use both Mega Evolution and a Z-Move
 *   in a single battle, but cannot use more than one of each."
 */

import {
  type ActivePokemon,
  BATTLE_GIMMICK_IDS,
  type BattleSide,
  type BattleState,
} from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
} from "../src";
import { Gen7MegaEvolution } from "../src/Gen7MegaEvolution";
import { Gen7Ruleset } from "../src/Gen7Ruleset";
import { Gen7ZMove } from "../src/Gen7ZMove";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const GEN7_DATA = createGen7DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS };
const ITEMS = GEN7_ITEM_IDS;
const MOVES = { ...CORE_MOVE_IDS };
const NATURES = GEN7_NATURE_IDS;
const SPECIES = GEN7_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;

function makeMoveSlot(moveId: string) {
  const move = GEN7_DATA.getMove(moveId);
  return {
    moveId,
    currentPP: move.pp,
    maxPP: move.pp,
    ppUps: 0,
  };
}

function createSyntheticOnFieldPokemon(overrides: {
  uid?: string;
  speciesId?: number;
  heldItem?: string | null;
  types?: PokemonType[];
  ability?: string;
  isMega?: boolean;
  moves?: Array<{ moveId: string }>;
  transformed?: boolean;
}): ActivePokemon {
  const moveSlots = (overrides.moves ?? [{ moveId: MOVES.tackle }]).map((m) =>
    makeMoveSlot(m.moveId),
  );

  return {
    pokemon: {
      uid: overrides.uid ?? "test-uid",
      speciesId: overrides.speciesId ?? SPECIES.charizard,
      nickname: null,
      level: 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: moveSlots,
      ability: overrides.ability ?? ABILITIES.blaze,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
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
    types: overrides.types ?? [TYPES.fire, TYPES.flying],
    ability: overrides.ability ?? ABILITIES.blaze,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: overrides.transformed ?? false,
    transformedSpecies: null,
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: { id: "trainer", displayName: "Trainer", trainerClass: "Trainer" },
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as BattleSide;
}

function createBattleState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Dual Gimmick Coexistence
// ---------------------------------------------------------------------------

describe("Gen 7 Dual Gimmick -- Mega Evolution + Z-Move coexistence", () => {
  it("given a team that uses Mega first, when checking Z-Move availability, then Z-Move is still available", () => {
    // Source: Bulbapedia "Z-Move" -- "A Trainer can use both Mega Evolution and a Z-Move
    //   in a single battle, but cannot use more than one of each."
    // Source: Showdown sim/side.ts:170 -- megaUsed and zMoveUsed are separate
    const mega = new Gen7MegaEvolution();
    const zmove = new Gen7ZMove();
    const side = createBattleSide(0);
    const state = createBattleState();

    // Charizard holds Charizardite X for Mega Evolution
    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
    });

    // Pikachu holds Normalium Z for Z-Move
    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });

    // Step 1: Charizard uses Mega Evolution
    expect(mega.canUse(charizard, side, state)).toBe(true);
    const megaEvents = mega.activate(charizard, side, state);
    expect(megaEvents).toHaveLength(1);
    expect(charizard.isMega).toBe(true);

    // Step 2: Z-Move should still be available for Pikachu
    expect(zmove.canUse(pikachu, side, state)).toBe(true);
  });

  it("given a team that uses Z-Move first, when checking Mega availability, then Mega is still available", () => {
    // Source: Showdown sim/side.ts -- zMoveUsed does not block megaUsed
    const mega = new Gen7MegaEvolution();
    const zmove = new Gen7ZMove();
    const side = createBattleSide(0);
    const state = createBattleState();

    // Pikachu holds Normalium Z for Z-Move
    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });

    // Charizard holds Charizardite X for Mega Evolution
    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
    });

    // Step 1: Pikachu uses Z-Move
    expect(zmove.canUse(pikachu, side, state)).toBe(true);
    zmove.activate(pikachu, side, state);
    expect(zmove.hasUsedZMove(0)).toBe(true);

    // Step 2: Mega should still be available for Charizard
    expect(mega.canUse(charizard, side, state)).toBe(true);
  });

  it("given both gimmicks used on one side, when checking either gimmick, then both are blocked", () => {
    // Source: Showdown sim/side.ts -- one mega + one Z-Move per side per battle
    const mega = new Gen7MegaEvolution();
    const zmove = new Gen7ZMove();
    const side = createBattleSide(0);
    const state = createBattleState();

    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });
    const anotherMega = createSyntheticOnFieldPokemon({
      uid: "lucario",
      speciesId: SPECIES.lucario,
      heldItem: ITEMS.lucarionite,
      types: [TYPES.fighting, TYPES.steel],
      ability: ABILITIES.steadfast,
    });
    const anotherZ = createSyntheticOnFieldPokemon({
      uid: "pikachu2",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.electriumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.thunderbolt }],
    });

    // Use both gimmicks on side 0
    mega.activate(charizard, side, state);
    zmove.activate(pikachu, side, state);

    // Both second attempts should be blocked
    expect(mega.canUse(anotherMega, side, state)).toBe(false);
    expect(zmove.canUse(anotherZ, side, state)).toBe(false);
  });

  it("given Mega used on side 0, when checking Mega on side 1, then side 1 Mega is still available", () => {
    // Source: Showdown sim/side.ts -- gimmick tracking is per-side, not global
    const mega = new Gen7MegaEvolution();
    const side0 = createBattleSide(0);
    const side1 = createBattleSide(1);
    const state = createBattleState();

    const charizardP1 = createSyntheticOnFieldPokemon({
      uid: "charizard-p1",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const charizardP2 = createSyntheticOnFieldPokemon({
      uid: "charizard-p2",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeY,
    });

    // Side 0 uses Mega
    mega.activate(charizardP1, side0, state);
    expect(mega.hasUsedMega(0)).toBe(true);

    // Side 1 should still be able to Mega
    expect(mega.canUse(charizardP2, side1, state)).toBe(true);
    expect(mega.hasUsedMega(1)).toBe(false);
  });

  it("given second Mega attempt on same side, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" -- one per trainer per battle
    const mega = new Gen7MegaEvolution();
    const side = createBattleSide(0);
    const state = createBattleState();

    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const lucario = createSyntheticOnFieldPokemon({
      uid: "lucario",
      speciesId: SPECIES.lucario,
      heldItem: ITEMS.lucarionite,
      types: [TYPES.fighting, TYPES.steel],
      ability: ABILITIES.steadfast,
    });

    // First Mega succeeds
    mega.activate(charizard, side, state);
    expect(mega.hasUsedMega(0)).toBe(true);

    // Second Mega on same side blocked
    expect(mega.canUse(lucario, side, state)).toBe(false);
  });

  it("given second Z-Move attempt on same side, when calling canUse, then returns false", () => {
    // Source: Showdown sim/side.ts -- one Z-Move per side per battle
    const zmove = new Gen7ZMove();
    const side = createBattleSide(0);
    const state = createBattleState();

    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });
    const raichu = createSyntheticOnFieldPokemon({
      uid: "raichu",
      speciesId: SPECIES.raichu,
      heldItem: ITEMS.electriumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.thunderbolt }],
    });

    // First Z-Move succeeds
    zmove.activate(pikachu, side, state);
    expect(zmove.hasUsedZMove(0)).toBe(true);

    // Second Z-Move on same side blocked
    expect(zmove.canUse(raichu, side, state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ruleset-level dual gimmick access
// ---------------------------------------------------------------------------

describe("Gen7Ruleset -- dual gimmick access via getBattleGimmick", () => {
  it("given Gen7Ruleset, when requesting both gimmick types, then both are available and independent", () => {
    // Source: Showdown sim/battle.ts -- Gen 7 supports both mega and Z-Move gimmicks
    const ruleset = new Gen7Ruleset();
    const mega = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega);
    const zmove = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove);

    expect(mega).not.toBeNull();
    expect(zmove).not.toBeNull();
    expect(mega!.name).toBe("Mega Evolution");
    expect(zmove!.name).toBe("Z-Move");
    // They are different instances (not the same gimmick)
    expect(mega).not.toBe(zmove);
  });

  it("given Gen7Ruleset, when using Mega via ruleset, then Z-Move from same ruleset is unaffected", () => {
    // Source: Showdown sim/side.ts:170 -- megaUsed and zMoveUsed are separate
    const ruleset = new Gen7Ruleset();
    const mega = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega) as Gen7MegaEvolution;
    const zmove = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove) as Gen7ZMove;
    const side = createBattleSide(0);
    const state = createBattleState();

    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });

    // Use mega through the ruleset
    mega.activate(charizard, side, state);

    // Z-Move should remain available
    expect(zmove.canUse(pikachu, side, state)).toBe(true);
    expect(zmove.hasUsedZMove(0)).toBe(false);
  });

  it("given Gen7Ruleset, when Mega activates, then side.gimmickUsed is not set, preserving Z-Move availability", () => {
    // Source: Showdown sim/side.ts Gen 7 -- neither mega nor Z-Move sets side.gimmickUsed
    // The shared boolean is not used; each gimmick tracks internally.
    const ruleset = new Gen7Ruleset();
    const mega = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega);
    const side = createBattleSide(0);
    const state = createBattleState();

    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });

    mega!.activate(charizard, side, state);

    // side.gimmickUsed is NOT set by Gen 7's mega
    expect(side.gimmickUsed).toBe(false);
  });

  it("given gimmicks used in battle 1, when reset() is called, then battle 2 can use both gimmicks again", () => {
    // Source: Qodo review PR #699 -- gimmick state must be cleared between battles
    // when the same ruleset instance is reused (e.g., via GenerationRegistry).
    const ruleset = new Gen7Ruleset();
    const mega = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega) as Gen7MegaEvolution;
    const zmove = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove) as Gen7ZMove;
    const side = createBattleSide(0);
    const state = createBattleState();

    const charizard = createSyntheticOnFieldPokemon({
      uid: "charizard",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const pikachu = createSyntheticOnFieldPokemon({
      uid: "pikachu",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });

    // Battle 1: use both gimmicks on side 0
    mega.activate(charizard, side, state);
    zmove.activate(pikachu, side, state);
    expect(mega.hasUsedMega(0)).toBe(true);
    expect(zmove.hasUsedZMove(0)).toBe(true);

    // Simulate BattleEngine.start() calling reset on battle 2
    mega.reset();
    zmove.reset();

    // Battle 2: per-side tracking is cleared
    expect(mega.hasUsedMega(0)).toBe(false);
    expect(zmove.hasUsedZMove(0)).toBe(false);

    // Fresh Pokemon instances for battle 2 (the old ones were mutated by activate)
    const charizard2 = createSyntheticOnFieldPokemon({
      uid: "charizard-b2",
      speciesId: SPECIES.charizard,
      heldItem: ITEMS.charizarditeX,
    });
    const pikachu2 = createSyntheticOnFieldPokemon({
      uid: "pikachu-b2",
      speciesId: SPECIES.pikachu,
      heldItem: ITEMS.normaliumZ,
      types: [TYPES.electric],
      ability: ABILITIES.static,
      moves: [{ moveId: MOVES.tackle }],
    });
    const side2 = createBattleSide(0);
    expect(mega.canUse(charizard2, side2, state)).toBe(true);
    expect(zmove.canUse(pikachu2, side2, state)).toBe(true);
  });
});
