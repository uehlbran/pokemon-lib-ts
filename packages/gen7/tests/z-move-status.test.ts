import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import {
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  createGen7DataManager,
  getSpeciesZMoves,
} from "@pokemon-lib-ts/gen7";
import { describe, expect, it } from "vitest";
import { Gen7ZMove, getZMovePower } from "../src/Gen7ZMove";

const DATA_MANAGER = createGen7DataManager();
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN7_SPECIES_IDS.pikachu);
const ZERO_STAT_STAGES = Object.fromEntries(
  ["attack", "defense", "spAttack", "spDefense", "speed", "accuracy", "evasion"].map((stat) => [stat, 0]),
) as ActivePokemon["statStages"];

// ---------------------------------------------------------------------------
// Helper factories (mirrors z-move.test.ts but kept local per project convention)
// ---------------------------------------------------------------------------

function createCanonicalMove(
  moveId: (typeof GEN7_MOVE_IDS)[keyof typeof GEN7_MOVE_IDS],
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

function createCanonicalStatusMoveWithZEffect(
  moveId: (typeof GEN7_MOVE_IDS)[keyof typeof GEN7_MOVE_IDS],
  zMoveEffect: string,
): MoveData {
  return createCanonicalMove(moveId, { zMoveEffect });
}

function createOnFieldPokemon(overrides: {
  heldItem?: string | null;
  moves?: Array<{ moveId: string }>;
  speciesId?: number;
}): ActivePokemon {
  const moveSlots = (overrides.moves ?? [{ moveId: GEN7_MOVE_IDS.swordsDance }]).map((m) =>
    createMoveSlot(m.moveId, DATA_MANAGER.getMove(m.moveId).pp),
  );

  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: overrides.speciesId ?? DEFAULT_SPECIES.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature: GEN7_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: 100,
      moves: moveSlots,
      ability: GEN7_ABILITY_IDS.static,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: DEFAULT_SPECIES.baseFriendship,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    statStages: { ...ZERO_STAT_STAGES },
    volatileStatuses: new Map(),
    types: [...DEFAULT_SPECIES.types] as PokemonType[],
    ability: GEN7_ABILITY_IDS.static,
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

// ═══════════════════════════════════════════════════════════════════════════
// Status Z-Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Z-Move: modifyMove preserves original move identity", () => {
  it("given Swords Dance with Normalium Z, when modifying, then keeps original move ID so effect still fires", () => {
    // Source: Showdown sim/battle-actions.ts:1435-1439 -- status Z-Moves keep original ID
    // Source: specs/battle/08-gen7.md -- "Status moves converted to Z-Moves perform the original
    //   status move's effect PLUS a bonus Z-Power effect."
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.normaliumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.swordsDance }],
    });

    const swordsDance = createCanonicalStatusMoveWithZEffect(
      GEN7_MOVE_IDS.swordsDance,
      "clearnegativeboost",
    );

    const result = zMove.modifyMove(swordsDance, pokemon);

    // The move ID must remain "swords-dance" so the engine executes the original stat boost
    expect(result.id).toBe(GEN7_MOVE_IDS.swordsDance);
    expect(result.displayName).toBe(`Z-${swordsDance.displayName}`);
    // Category stays status
    expect(result.category).toBe("status");
    // Z-Move power is 0 for status moves (they don't deal damage)
    expect(result.zMovePower).toBe(0);
  });

  it("given Calm Mind with Psychium Z, when modifying, then preserves original ID and sets zMoveEffect", () => {
    // Source: Showdown data/moves.ts -- calmmind: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- Calm Mind listed under clearnegativeboost
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.psychiumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.calmMind }],
    });

    const calmMind = createCanonicalStatusMoveWithZEffect(
      GEN7_MOVE_IDS.calmMind,
      "clearnegativeboost",
    );

    const result = zMove.modifyMove(calmMind, pokemon);

    expect(result.id).toBe(GEN7_MOVE_IDS.calmMind);
    expect(result.displayName).toBe(`Z-${calmMind.displayName}`);
    expect(result.zMoveEffect).toBe("clearnegativeboost");
  });
});

describe("Status Z-Move: heal effect", () => {
  it("given Memento with Darkinium Z and heal zMoveEffect, when modifying, then preserves the heal status-Z path", () => {
    // Source: Showdown sim/battle-actions.ts:1435-1439 -- matching type status moves convert through the
    // status Z-Move branch and preserve the original id plus zMoveEffect metadata.
    // The canonical Gen 7 move record does not carry zMoveEffect, so this test adds only that explicit
    // Gen 7-only field on top of the real Memento payload.
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.darkiniumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.memento }],
    });

    const statusMove = createCanonicalStatusMoveWithZEffect(GEN7_MOVE_IDS.memento, "heal");

    const result = zMove.modifyMove(statusMove, pokemon);

    // The zMoveEffect is preserved from the base move data
    expect(result.zMoveEffect).toBe("heal");
    // Move ID preserved so original effect fires
    expect(result.id).toBe(GEN7_MOVE_IDS.memento);
    // Power is 0 (status Z-Move)
    expect(result.zMovePower).toBe(0);
  });

  it("given a status move with heal zMoveEffect, when checking power, then getZMovePower returns 0", () => {
    // Source: Showdown sim/dex-moves.ts:551 -- status moves return 0 power
    const statusMove = createCanonicalStatusMoveWithZEffect(GEN7_MOVE_IDS.healingWish, "heal");

    expect(getZMovePower(statusMove)).toBe(0);
  });
});

describe("Status Z-Move: clearnegativeboost effect", () => {
  it("given Swords Dance with clearnegativeboost zMoveEffect, when modifying, then preserves the effect", () => {
    // Source: Showdown data/moves.ts -- swordsdance: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- "clearnegativeboost: Clears all negative stat changes"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.normaliumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.swordsDance }],
    });

    const swordsDance = createCanonicalStatusMoveWithZEffect(
      GEN7_MOVE_IDS.swordsDance,
      "clearnegativeboost",
    );

    const result = zMove.modifyMove(swordsDance, pokemon);

    expect(result.zMoveEffect).toBe("clearnegativeboost");
    expect(result.id).toBe(GEN7_MOVE_IDS.swordsDance);
  });

  it("given Bulk Up with clearnegativeboost zMoveEffect, when modifying, then preserves the effect", () => {
    // Source: Showdown data/moves.ts -- bulkup: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- Bulk Up listed under clearnegativeboost
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.fightiniumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.bulkUp }],
    });

    const bulkUp = createCanonicalStatusMoveWithZEffect(GEN7_MOVE_IDS.bulkUp, "clearnegativeboost");

    const result = zMove.modifyMove(bulkUp, pokemon);

    expect(result.zMoveEffect).toBe("clearnegativeboost");
    expect(result.id).toBe(GEN7_MOVE_IDS.bulkUp);
    expect(result.displayName).toBe(`Z-${bulkUp.displayName}`);
  });
});

describe("Status Z-Move: crit2 effect", () => {
  it("given Hone Claws with crit2 zMoveEffect, when modifying, then preserves +2 crit stage effect", () => {
    // Source: Showdown data/moves.ts -- honeclaws: zMove: { effect: 'crit2' }
    // Source: specs/battle/08-gen7.md -- "crit2: +2 crit stage"
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.darkiniumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.honeClaws }],
    });

    const honeClaws = createCanonicalStatusMoveWithZEffect(GEN7_MOVE_IDS.honeClaws, "crit2");

    const result = zMove.modifyMove(honeClaws, pokemon);

    expect(result.zMoveEffect).toBe("crit2");
    expect(result.id).toBe(GEN7_MOVE_IDS.honeClaws);
    expect(result.displayName).toBe(`Z-${honeClaws.displayName}`);
    expect(result.zMovePower).toBe(0);
  });

  it("given Focus Energy with crit2 zMoveEffect, when modifying, then preserves +2 crit stage effect", () => {
    // Source: Showdown data/moves.ts -- focusenergy: zMove: { effect: 'crit2' }
    // Source: specs/battle/08-gen7.md -- Focus Energy listed under crit2
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.normaliumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.focusEnergy }],
    });

    const focusEnergy = createCanonicalStatusMoveWithZEffect(GEN7_MOVE_IDS.focusEnergy, "crit2");

    const result = zMove.modifyMove(focusEnergy, pokemon);

    expect(result.zMoveEffect).toBe("crit2");
    expect(result.id).toBe(GEN7_MOVE_IDS.focusEnergy);
  });
});

describe("Status Z-Move: no zMoveEffect defined", () => {
  it("given a status move with no zMoveEffect, when modifying, then zMoveEffect is undefined", () => {
    // Some status moves may not define a Z-Power bonus effect.
    // The Z-Move variant should still transform (Z- prefix) but have no bonus effect.
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.normaliumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.growl }],
    });

    const growl = createCanonicalMove(GEN7_MOVE_IDS.growl);

    const result = zMove.modifyMove(growl, pokemon);

    expect(result.id).toBe(GEN7_MOVE_IDS.growl);
    expect(result.displayName).toBe(`Z-${growl.displayName}`);
    expect(result.zMoveEffect).toBeUndefined();
    expect(result.zMovePower).toBe(0);
  });
});

describe("Status Z-Move: does NOT convert to a damaging move", () => {
  it("given a status move with type Z-Crystal, when modifying, then category remains status", () => {
    // Source: Showdown sim/battle-actions.ts:1435-1439 -- status Z-Moves do NOT become damage moves
    // Source: specs/battle/08-gen7.md -- "They do NOT deal damage and do NOT convert to named attack moves."
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.electriumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.thunderWave }],
    });

    const thunderWave = createCanonicalStatusMoveWithZEffect(
      GEN7_MOVE_IDS.thunderWave,
      "clearnegativeboost",
    );

    const result = zMove.modifyMove(thunderWave, pokemon);

    expect(result.category).toBe("status");
    // Should NOT have power set (it's a status move, not damaging)
    expect(result.power).toBe(null);
  });

  it("given a status move with type Z-Crystal, when modifying, then move name is NOT the type Z-Move name", () => {
    // Status moves should NOT become "Breakneck Blitz" etc.
    // They keep their original ID with "Z-" prefix on display name
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.normaliumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.swordsDance }],
    });

    const swordsDance = createCanonicalStatusMoveWithZEffect(
      GEN7_MOVE_IDS.swordsDance,
      "clearnegativeboost",
    );

    const result = zMove.modifyMove(swordsDance, pokemon);

    // ID is NOT "breakneck-blitz" -- it stays as the original status move
    expect(result.id).not.toBe(GEN7_MOVE_IDS.breakneckBlitz);
    expect(result.id).toBe(GEN7_MOVE_IDS.swordsDance);
  });
});

describe("Status Z-Move: species-specific status Z-Move (Extreme Evoboost)", () => {
  it("given Eevee with Eevium Z and Last Resort, when modifying, then returns Extreme Evoboost as a status Z-Move", () => {
    // Source: Showdown data/moves.ts -- extremeevoboost: category "Status", basePower 0
    // Source: Showdown data/items.ts -- eeviumz: zMoveFrom: "Last Resort", zMove: "Extreme Evoboost"
    // Extreme Evoboost is unique: it's a species-specific Z-Move that is status category
    // (boosts all stats by +2) rather than a damaging move
    const zMove = new Gen7ZMove();
    const pokemon = createOnFieldPokemon({
      heldItem: GEN7_ITEM_IDS.eeviumZ,
      moves: [{ moveId: GEN7_MOVE_IDS.lastResort }],
      speciesId: GEN7_SPECIES_IDS.eevee,
    });

    // Last Resort is a Normal-type damaging move (base power 140)
    // but Eevium Z transforms it into the STATUS move Extreme Evoboost
    // For the purpose of this test, we mark it as status since the species Z-Move
    // handling checks move.category. In practice, the base move (Last Resort) is
    // actually a physical move -- the species-specific Z-Move overrides it.
    // Since Last Resort is actually physical/140, the getSpeciesZMove path
    // will use the damaging branch. Extreme Evoboost has 0 power in SPECIES_Z_POWER.
    const lastResort = createCanonicalMove(GEN7_MOVE_IDS.lastResort);

    const result = zMove.modifyMove(lastResort, pokemon);

    expect(result.id).toBe(getSpeciesZMoves()[GEN7_ITEM_IDS.eeviumZ]);
    // Extreme Evoboost has 0 power in the SPECIES_Z_POWER table
    // (it's a status-like Z-Move that boosts all stats)
    expect(result.power).toBe(0);
    expect(result.accuracy).toBe(null);
  });
});
