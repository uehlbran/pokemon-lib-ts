import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  Gen7ZMove,
  getSpeciesZBaseMove,
  getSpeciesZMoves,
  getZMoveName,
  getZMovePower,
} from "../src";

const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const TYPE_IDS = CORE_TYPE_IDS;
const DATA_MANAGER = createGen7DataManager();
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN7_SPECIES_IDS.pikachu);
const SPECIES_Z_MOVES = getSpeciesZMoves();
const TEST_TRAINER = Object.freeze({
  id: "ash",
  displayName: "Ash",
  trainerClass: "Trainer",
});

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createCanonicalMove(
  moveId: (typeof MOVE_IDS)[keyof typeof MOVE_IDS],
  overrides?: Partial<MoveData>,
): MoveData {
  const move = DATA_MANAGER.getMove(moveId);
  return {
    ...move,
    ...overrides,
    flags: overrides?.flags ? { ...move.flags, ...overrides.flags } : { ...move.flags },
    effect: overrides && "effect" in overrides ? overrides.effect : move.effect,
  } as MoveData;
}

function createSyntheticZPowerMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES];
  power?: number | null;
  effect?: MoveData["effect"];
  zMoveEffect?: string;
}): MoveData {
  const move = DATA_MANAGER.getMove(MOVE_IDS.tackle);
  return {
    ...move,
    id: overrides?.id ?? "synthetic-z-power-probe",
    displayName: overrides?.id ?? "Synthetic Z Power Probe",
    type: overrides?.type ?? TYPE_IDS.normal,
    category: overrides?.category ?? CORE_MOVE_CATEGORIES.physical,
    power: overrides?.power ?? 50,
    effect: overrides?.effect ?? null,
    flags: { ...move.flags },
    zMoveEffect: overrides?.zMoveEffect,
  } as MoveData;
}

function createOnFieldPokemon(overrides: {
  heldItem?: string | null;
  moves?: Array<{ moveId: string }>;
  types?: PokemonType[];
  ability?: string;
  transformed?: boolean;
  isMega?: boolean;
}): ActivePokemon {
  const moveSlots = (overrides.moves ?? [{ moveId: MOVE_IDS.tackle }]).map((m) =>
    createMoveSlot(m.moveId, DATA_MANAGER.getMove(m.moveId).pp),
  );

  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: DEFAULT_SPECIES.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature: GEN7_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: 100,
      moves: moveSlots,
      ability: overrides.ability ?? ABILITY_IDS.static,
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
      pokeball: ITEM_IDS.pokeBall,
      calculatedStats: {
        hp: 100,
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
    types: overrides.types ?? [...DEFAULT_SPECIES.types],
    ability: overrides.ability ?? ABILITY_IDS.static,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: TEST_TRAINER,
    team: [],
    active: [],
    screens: {},
    hazards: {},
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as unknown as BattleSide;
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

// ═══════════════════════════════════════════════════════════════════════════
// Z-Move Power Table
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Move Power Table", () => {
  it("given a 50 BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:576 -- basePower < 60 -> 100
    const move = createSyntheticZPowerMove({ power: 50 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a 55 BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:576 -- basePower < 60 -> 100
    const move = createSyntheticZPowerMove({ power: 55 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a 60 BP move, when calculating Z-Move power, then returns 120", () => {
    // Source: Showdown sim/dex-moves.ts:574 -- basePower >= 60 -> 120
    const move = createSyntheticZPowerMove({ power: 60 });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 65 BP move, when calculating Z-Move power, then returns 120", () => {
    // Source: Showdown sim/dex-moves.ts:574 -- basePower >= 60 -> 120
    const move = createSyntheticZPowerMove({ power: 65 });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 70 BP move, when calculating Z-Move power, then returns 140", () => {
    // Source: Showdown sim/dex-moves.ts:572 -- basePower >= 70 -> 140
    const move = createSyntheticZPowerMove({ power: 70 });
    expect(getZMovePower(move)).toBe(140);
  });

  it("given an 80 BP move (Dragon Claw), when calculating Z-Move power, then returns 160", () => {
    // Source: Showdown sim/dex-moves.ts:570 -- basePower >= 80 -> 160
    // Source: Bulbapedia "Dragon Claw" -- 80 BP
    const move = createCanonicalMove(MOVE_IDS.dragonClaw);
    expect(getZMovePower(move)).toBe(160);
  });

  it("given a 90 BP move (Thunderbolt), when calculating Z-Move power, then returns 175", () => {
    // Source: Showdown sim/dex-moves.ts:568 -- basePower >= 90 -> 175
    // Source: Bulbapedia "Thunderbolt" -- 90 BP
    // Source: specs/battle/08-gen7.md -- "Thunderbolt (90 power) -> Gigavolt Havoc (175 power)"
    const move = createCanonicalMove(MOVE_IDS.thunderbolt);
    expect(getZMovePower(move)).toBe(175);
  });

  it("given a 100 BP move, when calculating Z-Move power, then returns 180", () => {
    // Source: Showdown sim/dex-moves.ts:566 -- basePower >= 100 -> 180
    const move = createSyntheticZPowerMove({ power: 100 });
    expect(getZMovePower(move)).toBe(180);
  });

  it("given a 110 BP move, when calculating Z-Move power, then returns 185", () => {
    // Source: Showdown sim/dex-moves.ts:564 -- basePower >= 110 -> 185
    const move = createSyntheticZPowerMove({ power: 110 });
    expect(getZMovePower(move)).toBe(185);
  });

  it("given a 120 BP move (Close Combat), when calculating Z-Move power, then returns 190", () => {
    // Source: Showdown sim/dex-moves.ts:562 -- basePower >= 120 -> 190
    // Source: specs/battle/08-gen7.md -- "Close Combat (120 power) -> All-Out Pummeling (190 power, NOT 180)"
    const move = createCanonicalMove(MOVE_IDS.closeCombat);
    expect(getZMovePower(move)).toBe(190);
  });

  it("given a 130 BP move, when calculating Z-Move power, then returns 195", () => {
    // Source: Showdown sim/dex-moves.ts:560 -- basePower >= 130 -> 195
    const move = createSyntheticZPowerMove({ power: 130 });
    expect(getZMovePower(move)).toBe(195);
  });

  it("given a 131 BP move, when calculating Z-Move power, then returns 195", () => {
    // Source: Showdown sim/dex-moves.ts:560 -- basePower >= 130 -> 195
    const move = createSyntheticZPowerMove({ power: 131 });
    expect(getZMovePower(move)).toBe(195);
  });

  it("given a 140 BP move, when calculating Z-Move power, then returns 200", () => {
    // Source: Showdown sim/dex-moves.ts:558 -- basePower >= 140 -> 200
    const move = createSyntheticZPowerMove({ power: 140 });
    expect(getZMovePower(move)).toBe(200);
  });

  it("given a 180 BP move (V-Create), when calculating Z-Move power, then returns 200", () => {
    // Source: Showdown sim/dex-moves.ts:558 -- basePower >= 140 -> 200
    // Source: specs/battle/08-gen7.md -- "V-Create (180 power) -> Z-V-Create (200 power)"
    const move = createCanonicalMove(MOVE_IDS.vCreate);
    expect(getZMovePower(move)).toBe(200);
  });

  it("given a 0 BP move (no base power), when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:556 -- `if (!basePower)` -> 100
    const move = createSyntheticZPowerMove({ power: 0 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a null BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:556 -- `if (!basePower)` -> 100
    const move = createSyntheticZPowerMove({ power: null });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a status move, when calculating Z-Move power, then returns 0", () => {
    // Source: Showdown sim/dex-moves.ts:551 -- status moves skipped entirely
    const move = createCanonicalMove(MOVE_IDS.protect);
    expect(getZMovePower(move)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Hit Z-Move Power
// ═══════════════════════════════════════════════════════════════════════════

describe("Multi-Hit Z-Move Power", () => {
  it("given a 25 BP multi-hit move (Bullet Seed), when calculating Z-Move power, then uses 75 BP -> 140", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // Source: specs/battle/08-gen7.md -- "Bullet Seed 25 BP x 3 = 75 -> 140 Z-power"
    // 25 * 3 = 75, 75 >= 70 -> 140
    const move = createCanonicalMove(MOVE_IDS.bulletSeed);
    expect(getZMovePower(move)).toBe(140);
  });

  it("given a 20 BP multi-hit move, when calculating Z-Move power, then uses 60 BP -> 120", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // 20 * 3 = 60, 60 >= 60 -> 120
    const move = createSyntheticZPowerMove({
      id: "synthetic-z-multi-hit-20",
      power: 20,
      effect: { type: "multi-hit", min: 2, max: 5 },
    });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 15 BP multi-hit move, when calculating Z-Move power, then uses 45 BP -> 100", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // 15 * 3 = 45, 45 < 60 -> 100
    const move = createSyntheticZPowerMove({
      id: "synthetic-z-multi-hit-15",
      power: 15,
      effect: { type: "multi-hit", min: 2, max: 5 },
    });
    expect(getZMovePower(move)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Z-Move Names
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Move Names", () => {
  it("given electric type, when getting Z-Move name, then returns gigavolt-havoc", () => {
    // Source: Showdown sim/battle-actions.ts:40 -- Electric: "Gigavolt Havoc"
    expect(getZMoveName(TYPE_IDS.electric)).toBe("gigavolt-havoc");
  });

  it("given fire type, when getting Z-Move name, then returns inferno-overdrive", () => {
    // Source: Showdown sim/battle-actions.ts:42 -- Fire: "Inferno Overdrive"
    expect(getZMoveName(TYPE_IDS.fire)).toBe("inferno-overdrive");
  });

  it("given dragon type, when getting Z-Move name, then returns devastating-drake", () => {
    // Source: Showdown sim/battle-actions.ts:39 -- Dragon: "Devastating Drake"
    expect(getZMoveName(TYPE_IDS.dragon)).toBe("devastating-drake");
  });

  it("given fighting type, when getting Z-Move name, then returns all-out-pummeling", () => {
    // Source: Showdown sim/battle-actions.ts:33 -- Fighting: "All-Out Pummeling"
    expect(getZMoveName(TYPE_IDS.fighting)).toBe("all-out-pummeling");
  });

  it("given fairy type, when getting Z-Move name, then returns twinkle-tackle", () => {
    // Source: Showdown sim/battle-actions.ts:49 -- Fairy: "Twinkle Tackle"
    expect(getZMoveName(TYPE_IDS.fairy)).toBe("twinkle-tackle");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Species-Specific Z-Move Base Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Species-Specific Z-Move Data", () => {
  it("given Pikanium Z, when getting base move, then returns volt-tackle", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    expect(getSpeciesZBaseMove(ITEM_IDS.pikaniumZ)).toBe(MOVE_IDS.voltTackle);
  });

  it("given Decidium Z, when getting base move, then returns spirit-shackle", () => {
    // Source: Showdown data/items.ts -- decidiumz: zMoveFrom: "Spirit Shackle"
    expect(getSpeciesZBaseMove(ITEM_IDS.decidiumZ)).toBe(MOVE_IDS.spiritShackle);
  });

  it("given a non-species Z-Crystal, when getting base move, then returns null", () => {
    expect(getSpeciesZBaseMove(ITEM_IDS.electriumZ)).toBe(null);
  });

  it("given a non-Z-Crystal item, when getting base move, then returns null", () => {
    expect(getSpeciesZBaseMove(ITEM_IDS.leftovers)).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.canUse
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.canUse", () => {
  it("given a Pokemon holding a type-specific Z-Crystal, when checking canUse, then returns true", () => {
    // Source: Showdown sim/battle-actions.ts:1450-1456 -- canZMove checks
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a Pokemon holding no item, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1405 -- item check
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: null,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding a non-Z-Crystal item, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1456 -- `if (!item.zMove) return;`
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.leftovers,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a species Z-Crystal with the required signature move, when checking canUse, then returns true", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pikaniumZ,
      moves: [{ moveId: MOVE_IDS.voltTackle }, { moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a species Z-Crystal WITHOUT the required signature move, when checking canUse, then returns false", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    // Pokemon has Thunderbolt but NOT Volt Tackle
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pikaniumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given the side has already used a Z-Move, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1404,1451 -- zMoveUsed check
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    // First use should succeed
    expect(zMove.canUse(pokemon, side, state)).toBe(true);

    // Activate to mark as used
    zMove.activate(pokemon, side, state);

    // Second attempt should fail
    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a transformed Mega Pokemon, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1452-1454 -- transformed mega block
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
      transformed: true,
      isMega: true,
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.activate
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.activate", () => {
  it("given a valid Z-Move activation with type Z-Crystal, when activating, then marks side as used", () => {
    // Source: Showdown sim/side.ts:170 -- zMoveUsed set to true
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.hasUsedZMove(0)).toBe(false);
    zMove.activate(pokemon, side, state);
    expect(zMove.hasUsedZMove(0)).toBe(true);
  });

  it("given a valid Z-Move activation, when activating, then emits a ZMoveEvent", () => {
    // Source: Showdown sim/battle.ts:2626-2631 -- Z-Move activation emits event
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    const events = zMove.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("z-move");
    const zmEvent = events[0] as { type: "z-move"; side: 0 | 1; pokemon: string; move: string };
    expect(zmEvent.side).toBe(0);
    expect(zmEvent.pokemon).toBe("test-pokemon");
    expect(zmEvent.move).toBe(getZMoveName(TYPE_IDS.electric));
  });

  it("given a species Z-Crystal activation, when activating, then emits event with species Z-Move name", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMove: "Catastropika"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pikaniumZ,
      moves: [{ moveId: MOVE_IDS.voltTackle }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    const events = zMove.activate(pokemon, side, state);
    const zmEvent = events[0] as { type: "z-move"; move: string };
    expect(zmEvent.move).toBe(SPECIES_Z_MOVES[ITEM_IDS.pikaniumZ]);
  });

  it("given side 0 uses Z-Move, when side 1 checks canUse, then returns true (independent tracking)", () => {
    // Source: Showdown sim/side.ts -- zMoveUsed is per-side
    const zMove = new Gen7ZMove();

    const pokemon0 = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side0 = createBattleSide(0);

    const pokemon1 = createOnFieldPokemon({
      heldItem: ITEM_IDS.firiumZ,
      moves: [{ moveId: MOVE_IDS.flamethrower }],
    });
    const side1 = createBattleSide(1);
    const state = createBattleState();

    zMove.activate(pokemon0, side0, state);

    // Side 0 used Z-Move, side 1 should still be able to use theirs
    expect(zMove.canUse(pokemon1, side1, state)).toBe(true);
  });

  it("given Z-Move activation, when checking side.gimmickUsed, then it is NOT set (separate tracking)", () => {
    // Source: Showdown sim/side.ts:170 -- zMoveUsed is separate from megaUsed
    // Gen 7 allows both Mega + Z-Move in same battle (different Pokemon)
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    zMove.activate(pokemon, side, state);

    // side.gimmickUsed should NOT be set by Z-Move activation
    // (it's reserved for Mega Evolution)
    expect(side.gimmickUsed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.modifyMove -- Damaging Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.modifyMove (damaging)", () => {
  it("given a 90 BP Electric move with Electrium Z, when modifying, then returns Gigavolt Havoc with 175 BP", () => {
    // Source: Showdown sim/battle-actions.ts:1441-1447 -- getActiveZMove
    // Source: specs/battle/08-gen7.md -- "Thunderbolt (90 power) -> Gigavolt Havoc (175 power)"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });

    const thunderbolt = createCanonicalMove(MOVE_IDS.thunderbolt);
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.id).toBe(getZMoveName(TYPE_IDS.electric));
    expect(result.power).toBe(175);
    expect(result.accuracy).toBe(null); // Z-Moves never miss
    expect(result.zMovePower).toBe(175);
  });

  it("given a 120 BP Fighting move with Fightinium Z, when modifying, then returns All-Out Pummeling with 190 BP", () => {
    // Source: specs/battle/08-gen7.md -- "Close Combat (120 power) -> All-Out Pummeling (190 power)"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.fightiniumZ,
      moves: [{ moveId: MOVE_IDS.closeCombat }],
    });

    const closeCombat = createCanonicalMove(MOVE_IDS.closeCombat);
    const result = zMove.modifyMove(closeCombat, pokemon);

    expect(result.id).toBe(getZMoveName(TYPE_IDS.fighting));
    expect(result.power).toBe(190);
  });

  it("given a move that doesn't match the Z-Crystal type, when modifying, then returns unchanged move", () => {
    // Source: Showdown sim/battle-actions.ts:1415 -- type check: `move.type === item.zMoveType`
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.flamethrower }],
    });

    const flamethrower = createCanonicalMove(MOVE_IDS.flamethrower);
    const result = zMove.modifyMove(flamethrower, pokemon);

    // Should return unchanged because Fire doesn't match Electrium Z (Electric)
    expect(result.id).toBe(MOVE_IDS.flamethrower);
    expect(result.power).toBe(90);
  });

  it("given a damaging move converted to Z-Move, when checking category, then preserves original category", () => {
    // Source: Showdown sim/battle-actions.ts:1443 -- `zMove.category = move.category;`
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });

    const thunderbolt = createCanonicalMove(MOVE_IDS.thunderbolt);
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.category).toBe(CORE_MOVE_CATEGORIES.special);
  });

  it("given a physical move converted to Z-Move, when checking category, then preserves physical", () => {
    // Source: Showdown sim/battle-actions.ts:1443 -- category preserved
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.wildCharge }],
    });

    const wildCharge = createCanonicalMove(MOVE_IDS.wildCharge);
    const result = zMove.modifyMove(wildCharge, pokemon);

    expect(result.category).toBe(CORE_MOVE_CATEGORIES.physical);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.modifyMove -- Species-Specific Z-Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.modifyMove (species-specific)", () => {
  it("given Pikachu with Pikanium Z and Volt Tackle, when modifying, then returns Catastropika with 210 BP", () => {
    // Source: Showdown data/moves.ts -- catastropika: basePower 210
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle", zMove: "Catastropika"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pikaniumZ,
      moves: [{ moveId: MOVE_IDS.voltTackle }],
    });

    const voltTackle = createCanonicalMove(MOVE_IDS.voltTackle);
    const result = zMove.modifyMove(voltTackle, pokemon);

    expect(result.id).toBe(SPECIES_Z_MOVES[ITEM_IDS.pikaniumZ]);
    expect(result.power).toBe(210);
    expect(result.accuracy).toBe(null);
  });

  it("given Snorlax with Snorlium Z and Giga Impact, when modifying, then returns Pulverizing Pancake with 210 BP", () => {
    // Source: Showdown data/moves.ts -- pulverizingpancake: basePower 210
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.snorliumZ,
      moves: [{ moveId: MOVE_IDS.gigaImpact }],
    });

    const gigaImpact = createCanonicalMove(MOVE_IDS.gigaImpact);
    const result = zMove.modifyMove(gigaImpact, pokemon);

    expect(result.id).toBe(SPECIES_Z_MOVES[ITEM_IDS.snorliumZ]);
    expect(result.power).toBe(210);
  });

  it("given species Z-Crystal but wrong move, when modifying, then returns unchanged move", () => {
    // Source: Showdown sim/battle-actions.ts:1413 -- only transforms if move.name === item.zMoveFrom
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pikaniumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });

    // Thunderbolt is NOT Volt Tackle, so Pikanium Z doesn't trigger
    const thunderbolt = createCanonicalMove(MOVE_IDS.thunderbolt);
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.id).toBe(MOVE_IDS.thunderbolt);
    expect(result.power).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// One Per Battle
// ═══════════════════════════════════════════════════════════════════════════

describe("One Z-Move Per Battle", () => {
  it("given first Z-Move attempt, when checking canUse, then returns true", () => {
    // Source: Showdown sim/battle-actions.ts:1404 -- zMoveUsed check
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given Z-Move already used, when second Pokemon attempts Z-Move, then canUse returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1404,1451 -- zMoveUsed check per side
    const zMove = new Gen7ZMove();

    const pokemon1 = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const pokemon2 = createOnFieldPokemon({
      heldItem: ITEM_IDS.firiumZ,
      moves: [{ moveId: MOVE_IDS.flamethrower }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    // First Pokemon uses Z-Move
    zMove.activate(pokemon1, side, state);

    // Second Pokemon on same side tries Z-Move
    expect(zMove.canUse(pokemon2, side, state)).toBe(false);
  });

  it("given Z-Move used, when reset() is called, then canUse returns true again", () => {
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.electriumZ,
      moves: [{ moveId: MOVE_IDS.thunderbolt }],
    });
    const side = createBattleSide(0);
    const state = createBattleState();

    zMove.activate(pokemon, side, state);
    expect(zMove.canUse(pokemon, side, state)).toBe(false);

    zMove.reset();
    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove class properties
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove class properties", () => {
  it("reports the Z-Move class name", () => {
    const zMove = new Gen7ZMove();
    expect(zMove.name).toBe("Z-Move");
  });

  it("exposes generation 7 as its supported generation", () => {
    const zMove = new Gen7ZMove();
    expect(zMove.generations).toEqual([7]);
  });
});
