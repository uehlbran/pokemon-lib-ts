import {
  type ActivePokemon,
  BATTLE_EFFECT_TARGETS,
  type BattleState,
  type MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_MOVE_TARGET_IDS,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen7DataManager } from "../src/data";
import {
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
} from "../src/data/reference-ids";
import {
  calculateSpikyShieldDamage,
  executeGen7MoveEffect,
  executeGen7PreDamageMoveEffect,
  handleDrainEffect,
  isBlockedByBanefulBunker,
  isBlockedByCraftyShield,
  isBlockedByKingsShield,
  isBlockedByMatBlock,
  isBlockedBySpikyShield,
  isGen7GrassPowderBlocked,
} from "../src/Gen7MoveEffects";
import { Gen7Ruleset } from "../src/Gen7Ruleset";

const dataManager = createGen7DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const itemIds = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const moveIds = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const moveCategories = CORE_MOVE_CATEGORIES;
const moveTargetIds = CORE_MOVE_TARGET_IDS;
const statIds = CORE_STAT_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const defaultSpecies = dataManager.getSpecies(GEN7_SPECIES_IDS.pikachu);
const defaultNature = dataManager.getNature(GEN7_NATURE_IDS.hardy).id;
const defaultTackleMove = dataManager.getMove(moveIds.tackle);
const defaultSyntheticHp = 200;
const defaultSyntheticBattleStat = 100;
const diveVolatile = volatileIds.underwater;
const BIG_ROOT_NAME = dataManager.getItem(itemIds.bigRoot).displayName;
const POWER_HERB_NAME = dataManager.getItem(itemIds.powerHerb).displayName;

const EMPTY_EFFECT_RESULT = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: [],
};

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createSyntheticBattleStats(maxHp = defaultSyntheticHp) {
  return {
    hp: maxHp,
    attack: defaultSyntheticBattleStat,
    defense: defaultSyntheticBattleStat,
    spAttack: defaultSyntheticBattleStat,
    spDefense: defaultSyntheticBattleStat,
    speed: defaultSyntheticBattleStat,
  };
}

function createCanonicalMove(moveId: (typeof moveIds)[keyof typeof moveIds]): MoveData {
  const move = dataManager.getMove(moveId);
  return { ...move, flags: { ...move.flags } };
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : { ...baseMove.flags },
    effect: "effect" in overrides ? overrides.effect : baseMove.effect,
  } as MoveData;
}

function createCanonicalMoveSlots(moveIdList: readonly (typeof moveIds)[keyof typeof moveIds][]) {
  return moveIdList.map((moveId) => {
    const move = dataManager.getMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  turnsOnField?: number;
  nickname?: string;
  maxHp?: number;
  currentHp?: number;
  moves?: Array<{ moveId: (typeof moveIds)[keyof typeof moveIds] }>;
  moveIds?: readonly (typeof moveIds)[keyof typeof moveIds][];
  types?: readonly PokemonType[];
  status?: PrimaryStatus | null;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? defaultSyntheticHp;
  const speciesRecord = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(speciesRecord, 50, new SeededRandom(7), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [defaultTackleMove.id],
    heldItem: overrides.heldItem ?? null,
    friendship: speciesRecord.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;
  const moveIdList = overrides.moveIds ??
    overrides.moves?.map((move) => move.moveId) ?? [moveIds.tackle];
  pokemon.moves = createCanonicalMoveSlots(moveIdList);
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.calculatedStats = createSyntheticBattleStats(maxHp);

  const active = createBattleOnFieldPokemon(pokemon, 0, [
    ...(overrides.types ?? [...speciesRecord.types]),
  ] as PokemonType[]);
  active.ability = overrides.ability ?? abilityIds.none;
  active.volatileStatuses = overrides.volatileStatuses ?? new Map();
  active.consecutiveProtects = overrides.consecutiveProtects ?? 0;
  active.turnsOnField = overrides.turnsOnField ?? 0;
  return active;
}

function createBattleState(overrides?: Partial<BattleState>): BattleState {
  return {
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    weather: null,
    terrain: null,
    rng: new SeededRandom(42),
    ...overrides,
  } as unknown as BattleState;
}

function createMoveEffectContext(
  moveId: (typeof moveIds)[keyof typeof moveIds],
  options?: {
    state?: Partial<BattleState>;
    attacker?: Parameters<typeof createOnFieldPokemon>[0];
    defender?: Parameters<typeof createOnFieldPokemon>[0];
    moveOverrides?: Partial<MoveData>;
    damage?: number;
  },
): MoveEffectContext {
  const baseMove = createCanonicalMove(moveId);
  return {
    attacker: createOnFieldPokemon(options?.attacker ?? {}),
    defender: createOnFieldPokemon(options?.defender ?? {}),
    move: options?.moveOverrides
      ? createSyntheticMoveFrom(baseMove, options.moveOverrides)
      : baseMove,
    damage: options?.damage ?? 0,
    state: createBattleState(options?.state),
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

// Transitional aliases while the remaining call sites in this file are migrated.
const _MOVE_IDS = moveIds;
const _ITEM_IDS = itemIds;
const _ABILITY_IDS = abilityIds;
const _TYPE_IDS = typeIds;
const _VOLATILE_IDS = volatileIds;
const _WEATHER_IDS = weatherIds;
const _MOVE_CATEGORIES = moveCategories;
const _getCanonicalGen7Move = createCanonicalMove;
const _makeContext = createMoveEffectContext;

/** Always-succeed protect roll for testing guard moves */
function alwaysSucceedProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return true;
}

/** Always-fail protect roll for testing guard move failure */
function alwaysFailProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return false;
}

// ===========================================================================
// King's Shield
// ===========================================================================

describe("Gen7 King's Shield -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when King's Shield is used, then succeeds and sets kings-shield volatile", () => {
    // Source: Showdown data/moves.ts -- kingsshield: volatileStatus: 'kingsshield', duration: 1
    const ctx = createMoveEffectContext(moveIds.kingsShield);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe(moveIds.kingsShield);
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given consecutive protect uses exceeded, when King's Shield is used, then fails", () => {
    // Source: Showdown data/moves.ts -- stallingMove: true, stall counter shared with Protect
    const ctx = createMoveEffectContext(moveIds.kingsShield);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has consecutiveProtects=3, when King's Shield used, then passes correct count to rollProtectSuccess", () => {
    // Source: Showdown -- King's Shield shares stall counter with Protect
    const ctx = createMoveEffectContext(moveIds.kingsShield, {
      attacker: { consecutiveProtects: 3 },
    });
    const rng = new SeededRandom(42);

    const protectRollObservation = { count: -1 };
    const captureProtectRoll = (count: number, _rng: SeededRandom): boolean => {
      protectRollObservation.count = count;
      return true;
    };

    executeGen7MoveEffect(ctx, rng, captureProtectRoll);
    expect(protectRollObservation.count).toBe(3);
  });
});

describe("Gen7 isBlockedByKingsShield", () => {
  it("given physical contact move with protect flag, when checking, then blocked with -2 Attack penalty", () => {
    // Source: Showdown mods/gen7/moves.ts line 580 -- this.boost({ atk: -2 }, ...)
    // Gen 7 changed contact penalty from -1 (Gen 6) to -2.
    const result = isBlockedByKingsShield(moveCategories.physical, true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.attackDropStages).toBe(-2);
  });

  it("given physical non-contact move with protect flag, when checking, then blocked without penalty", () => {
    // Source: Showdown -- blocked but no contact means no boost
    const result = isBlockedByKingsShield(moveCategories.physical, true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(false);
    expect(result.attackDropStages).toBe(0);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown mods/gen7/moves.ts line 567 --
    //   if (!move.flags['protect'] || move.category === 'Status') return;
    const result = isBlockedByKingsShield(moveCategories.status, true, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
  });

  it("given special contact move with protect flag, when checking, then blocked with -2 Attack penalty", () => {
    // Source: Showdown -- only Status excluded; Special moves with contact ARE blocked
    const result = isBlockedByKingsShield(moveCategories.special, true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.attackDropStages).toBe(-2);
  });

  it("given physical move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect'] || ...) return;
    const result = isBlockedByKingsShield(moveCategories.physical, false, true);
    expect(result.blocked).toBe(false);
  });
});

// ===========================================================================
// Spiky Shield
// ===========================================================================

describe("Gen7 Spiky Shield -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when Spiky Shield is used, then succeeds and sets volatile", () => {
    // Source: Showdown data/moves.ts -- spikyshield: volatileStatus, duration: 1
    const ctx = createMoveEffectContext(moveIds.spikyShield);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe(moveIds.spikyShield);
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given stalling check fails, when Spiky Shield is used, then fails", () => {
    // Source: Showdown -- stallingMove: true
    const ctx = createMoveEffectContext(moveIds.spikyShield);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen7 isBlockedBySpikyShield", () => {
  it("given physical contact move with protect flag, when checking, then blocked with contact damage", () => {
    // Source: Showdown data/moves.ts -- spikyshield: if contact, damage 1/8 max HP
    const result = isBlockedBySpikyShield(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(true);
  });

  it("given status move with protect flag, when checking, then blocked (unlike King's Shield)", () => {
    // Source: Showdown -- Spiky Shield checks only flags.protect, no category exception
    const result = isBlockedBySpikyShield(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    const result = isBlockedBySpikyShield(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactDamage).toBe(false);
  });
});

describe("Gen7 calculateSpikyShieldDamage", () => {
  it("given attacker with 200 max HP, when calculating contact damage, then returns 25 (floor(200/8))", () => {
    // Source: Showdown -- this.damage(source.baseMaxhp / 8, ...)
    // 200 / 8 = 25
    expect(calculateSpikyShieldDamage(200)).toBe(25);
  });

  it("given attacker with 7 max HP, when calculating contact damage, then returns 1 (minimum)", () => {
    // Source: Showdown -- damage function enforces minimum 1
    // floor(7 / 8) = 0, clamped to 1
    expect(calculateSpikyShieldDamage(7)).toBe(1);
  });

  it("given attacker with 300 max HP, when calculating contact damage, then returns 37 (floor(300/8))", () => {
    // Source: Showdown -- floor(300/8) = 37
    expect(calculateSpikyShieldDamage(300)).toBe(37);
  });
});

// ===========================================================================
// Baneful Bunker (NEW in Gen 7)
// ===========================================================================

describe("Gen7 Baneful Bunker -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when Baneful Bunker is used, then succeeds and sets baneful-bunker volatile", () => {
    // Source: Showdown data/moves.ts -- banefulbunker: volatileStatus: 'banefulbunker', duration: 1
    const ctx = createMoveEffectContext(moveIds.banefulBunker);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe(moveIds.banefulBunker);
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given stalling check fails, when Baneful Bunker is used, then fails", () => {
    // Source: Showdown -- stallingMove: true
    const ctx = createMoveEffectContext(moveIds.banefulBunker);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has consecutiveProtects=2, when Baneful Bunker used, then passes correct count", () => {
    // Source: Showdown -- Baneful Bunker shares stall counter with Protect
    const ctx = createMoveEffectContext(moveIds.banefulBunker, {
      attacker: { consecutiveProtects: 2 },
    });
    const rng = new SeededRandom(42);

    const protectRollObservation = { count: -1 };
    const captureProtectRoll = (count: number, _rng: SeededRandom): boolean => {
      protectRollObservation.count = count;
      return true;
    };

    executeGen7MoveEffect(ctx, rng, captureProtectRoll);
    expect(protectRollObservation.count).toBe(2);
  });
});

describe("Gen7 isBlockedByBanefulBunker", () => {
  it("given physical contact move with protect flag, when checking, then blocked with contact poison", () => {
    // Source: Showdown data/moves.ts lines 1059-1060 --
    //   if (this.checkMoveMakesContact(move, source, target))
    //     source.trySetStatus('psn', target);
    const result = isBlockedByBanefulBunker(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(true);
  });

  it("given status move with protect flag and no contact, when checking, then blocked without poison", () => {
    // Source: Showdown data/moves.ts -- Baneful Bunker blocks ALL moves with protect flag
    //   (unlike King's Shield, it does NOT exclude Status moves)
    const result = isBlockedByBanefulBunker(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(false);
  });

  it("given move without protect flag and no contact, when checking, then NOT blocked and no poison", () => {
    // Source: Showdown -- if (!move.flags['protect']) return; -- both false means neither blocked nor poisoned
    const result = isBlockedByBanefulBunker(false, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPoison).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown data/moves.ts line 1042 -- if (!move.flags['protect']) return;
    const result = isBlockedByBanefulBunker(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactPoison).toBe(false);
  });
});

// ===========================================================================
// Mat Block
// ===========================================================================

describe("Gen7 Mat Block -- executeGen7MoveEffect", () => {
  it("given first turn (turnsOnField=0), when Mat Block is used, then succeeds and sets volatile", () => {
    // Source: Showdown data/moves.ts -- matblock: onTry checks activeMoveActions
    //   In our system, turnsOnField === 0 means first turn
    const ctx = createMoveEffectContext(moveIds.matBlock, { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe(moveIds.matBlock);
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Mat Block");
  });

  it("given second turn (turnsOnField=1), when Mat Block is used, then fails", () => {
    // Source: Showdown -- onTry: if (source.activeMoveActions > 1) return false;
    const ctx = createMoveEffectContext(moveIds.matBlock, { attacker: { turnsOnField: 1 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given first turn but stalling check fails, when Mat Block is used, then fails", () => {
    // Source: Showdown -- stallingMove: true; if stall check fails, move fails
    const ctx = createMoveEffectContext(moveIds.matBlock, { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen7 isBlockedByMatBlock", () => {
  it("given physical move with protect flag, when checking, then blocked", () => {
    // Source: Showdown -- blocks damaging moves with protect flag
    expect(isBlockedByMatBlock(moveCategories.physical, true, typeIds.normal)).toBe(true);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (move.target === 'self' || move.category === 'Status') return;
    expect(isBlockedByMatBlock(moveCategories.status, true, typeIds.normal)).toBe(false);
  });

  it("given self-targeting move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (move.target === 'self' || ...) return;
    expect(isBlockedByMatBlock(moveCategories.physical, true, moveTargetIds.self)).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    expect(isBlockedByMatBlock(moveCategories.physical, false, typeIds.normal)).toBe(false);
  });
});

// ===========================================================================
// Crafty Shield
// ===========================================================================

describe("Gen7 Crafty Shield -- executeGen7MoveEffect", () => {
  it("given Crafty Shield used, when called, then succeeds without stall check and sets volatile", () => {
    // Source: Showdown data/moves.ts -- craftyshield has no stallingMove property
    // It succeeds even when protect roll would fail
    const ctx = createMoveEffectContext(moveIds.craftyShield, { attacker: { nickname: "Klefki" } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe(moveIds.craftyShield);
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Crafty Shield");
  });
});

describe("Gen7 isBlockedByCraftyShield", () => {
  it("given status move targeting normal, when checking, then blocked", () => {
    // Source: Showdown -- blocks status moves that don't target self or all
    expect(isBlockedByCraftyShield(moveCategories.status, typeIds.normal)).toBe(true);
  });

  it("given status move targeting self, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (['self', 'all'].includes(move.target)) return;
    expect(isBlockedByCraftyShield(moveCategories.status, moveTargetIds.self)).toBe(false);
  });

  it("given status move targeting entire-field, when checking, then NOT blocked", () => {
    // Source: Showdown -- 'all' maps to our 'entire-field' for field-wide moves
    expect(isBlockedByCraftyShield(moveCategories.status, moveTargetIds.entireField)).toBe(false);
  });

  it("given physical move targeting normal, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (... move.category !== 'Status') return;
    expect(isBlockedByCraftyShield(moveCategories.physical, typeIds.normal)).toBe(false);
  });

  it("given stealth-rock (target foe-field), when checking, then NOT blocked", () => {
    // Source: Bulbapedia -- Crafty Shield does not protect against entry hazards
    // Source: Showdown data/moves.ts -- stealth-rock target: foeSide (maps to foe-field)
    expect(isBlockedByCraftyShield(moveCategories.status, moveTargetIds.foeField)).toBe(false);
  });

  it("given spikes (target foe-field), when checking, then NOT blocked", () => {
    // Source: Bulbapedia -- entry hazard moves pass through Crafty Shield
    // Source: Showdown data/moves.ts -- spikes target: foeSide
    expect(isBlockedByCraftyShield(moveCategories.status, moveTargetIds.foeField)).toBe(false);
  });

  it("given user-field targeting status move, when checking, then NOT blocked", () => {
    // Source: Showdown -- user-field hazards (e.g. Sticky Web vs opponent side) are side-condition setters
    // that should pass through Crafty Shield per Bulbapedia ruling
    expect(isBlockedByCraftyShield(moveCategories.status, moveTargetIds.userField)).toBe(false);
  });
});

// ===========================================================================
// Drain Effects
// ===========================================================================

describe("Gen7 Drain Effects -- handleDrainEffect", () => {
  it("given Giga Drain dealing 100 damage with 50% drain, when handling, then heals 50 HP", () => {
    // Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
    // 100 * 0.5 = 50
    const ctx = createMoveEffectContext(moveIds.gigaDrain, {
      damage: 100,
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(50);
    expect(result!.recoilDamage).toBe(0);
  });

  it("given Draining Kiss dealing 80 damage with 75% drain, when handling, then heals 60 HP", () => {
    // Source: Showdown data/moves.ts -- drainingkiss: { drain: [3, 4] } = 75%
    // floor(80 * 0.75) = 60
    const ctx = createMoveEffectContext(moveIds.drainingKiss, {
      damage: 80,
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(60);
  });

  it(`given drain move with ${BIG_ROOT_NAME}, when handling, then heals 30% more (1.3x)`, () => {
    // Source: Showdown data/items.ts -- bigroot: this.chainModify([5324, 4096]) ~= 1.3x
    // Source: Bulbapedia -- "Big Root increases the amount of HP recovered by 30%"
    // Base: 100 * 0.5 = 50. With Big Root: floor(50 * 1.3) = 65
    const ctx = createMoveEffectContext(moveIds.gigaDrain, {
      damage: 100,
      attacker: { heldItem: itemIds.bigRoot },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(65);
  });

  it("given drain move against Liquid Ooze, when handling, then attacker takes damage instead of healing", () => {
    // Source: Showdown data/abilities.ts -- liquidooze: return -heal
    // Source: Bulbapedia -- "Liquid Ooze causes the attacker to lose HP instead of gaining it"
    // Base drain: 100 * 0.5 = 50. Instead of healing 50, take 50 damage.
    const ctx = createMoveEffectContext(moveIds.gigaDrain, {
      damage: 100,
      defender: { ability: abilityIds.liquidOoze },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(0);
    expect(result!.recoilDamage).toBe(50);
    expect(result!.messages[0]).toContain("liquid ooze");
  });

  it("given drain move against Liquid Ooze with zero damage dealt, when handling, then no recoil occurs", () => {
    // Source: Showdown data/abilities.ts -- liquidooze: return -heal
    // When ctx.damage is 0 (e.g., move dealt 0 damage), healAmount=0 and recoil must also be 0.
    // Previously Math.max(1, 0)=1 caused phantom 1-damage recoil even on a 0-damage drain.
    const ctx = createMoveEffectContext(moveIds.gigaDrain, {
      damage: 0,
      defender: { ability: abilityIds.liquidOoze },
    });
    const result = handleDrainEffect(ctx);

    // Wave 6 added an early guard: ctx.damage <= 0 returns null immediately
    // (before the Liquid Ooze check), so no recoil occurs when drain damage is zero.
    // Source: Showdown sim/battle-actions.ts -- drain only triggers when damage > 0
    expect(result).toBeNull();
    expect(ctx.attacker.pokemon.heldItem).toBeNull();
    expect(ctx.defender.ability).toBe(abilityIds.liquidOoze);
  });

  it("given move without drain effect, when handling, then returns null", () => {
    // Non-drain moves should fall through
    const ctx = createMoveEffectContext(moveIds.tackle, {
      damage: 50,
    });
    const result = handleDrainEffect(ctx);

    expect(result).toBeNull();
    expect(ctx.move.effect).toBeNull();
    // Source: test fixture above sets ctx.damage to 50; this confirms the no-drain path does not mutate it.
    expect(ctx.damage).toBe(50);
  });

  it("given Leech Life dealing 120 damage with 50% drain, when handling, then heals 60 HP", () => {
    // Source: Showdown data/moves.ts -- leechlife: { drain: [1, 2] } = 50%
    // Gen 7 buffed Leech Life to 80 BP (was 20 in Gen 1-6)
    // floor(120 * 0.5) = 60
    const ctx = createMoveEffectContext(moveIds.leechLife, {
      damage: 120,
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(60);
  });
});

// ===========================================================================
// Two-Turn Moves
// ===========================================================================

describe("Gen7 Two-Turn Moves -- executeGen7MoveEffect", () => {
  it("given Fly with no charge volatile, when used (charge turn), then sets flying volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- fly: condition.onInvulnerability: false
    //   First turn: charge, become semi-invulnerable (flying)
    const ctx = createMoveEffectContext(moveIds.fly, {
      attacker: {
        nickname: "Pidgeot",
        moveIds: [moveIds.fly, moveIds.tackle],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.fly,
      volatileStatus: volatileIds.flying,
    });
    expect(result!.messages[0]).toBe("Pidgeot flew up high!");
  });

  it("given Fly with flying volatile already set, when used (attack turn), then returns null for engine damage handling", () => {
    // Source: Showdown -- if (attacker.removeVolatile(move.id)) return; (attack turn)
    const chargeVolatiles = new Map<string, { turnsLeft: number }>();
    chargeVolatiles.set(volatileIds.flying, { turnsLeft: 1 });

    const ctx = createMoveEffectContext(moveIds.fly, {
      attacker: {
        volatileStatuses: chargeVolatiles,
        moveIds: [moveIds.fly],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    // null means "not handled -- let engine handle normal damage"
    expect(result).toBeNull();
    expect(ctx.attacker.volatileStatuses.has(volatileIds.flying)).toBe(true);
    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });

  it("given Dig on charge turn, when used, then sets underground volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- dig: condition volatile volatileIds.underground
    const ctx = createMoveEffectContext(moveIds.dig, {
      attacker: {
        nickname: "Dugtrio",
        moveIds: [moveIds.dig],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.dig,
      volatileStatus: volatileIds.underground,
    });
    expect(result!.messages[0]).toBe("Dugtrio dug underground!");
  });

  it("given Dive on charge turn, when used, then sets underwater volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- dive sets the underwater volatile
    const ctx = createMoveEffectContext(moveIds.dive, {
      attacker: {
        nickname: "Gyarados",
        moveIds: [moveIds.dive],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.dive,
      volatileStatus: diveVolatile,
    });
    expect(result!.messages[0]).toBe("Gyarados dived underwater!");
  });

  it("given Solar Beam on charge turn WITHOUT sun, when used, then sets charging volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- solarbeam: two-turn move, charge unless sun
    // Source: Bulbapedia -- "Solar Beam requires a turn to charge unless in harsh sunlight."
    const ctx = createMoveEffectContext(moveIds.solarBeam, {
      attacker: {
        nickname: "Venusaur",
        moveIds: [moveIds.solarBeam],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.solarBeam,
      volatileStatus: volatileIds.charging,
    });
    expect(result!.messages[0]).toBe("Venusaur is absorbing sunlight!");
  });

  it("given Solar Beam on charge turn WITH sun, when used, then fires immediately (no forcedMoveSet)", () => {
    // Source: Showdown data/moves.ts -- solarbeam: fires immediately in sun
    // Source: Bulbapedia -- "In harsh sunlight, Solar Beam can be used without a charging turn."
    const ctx = createMoveEffectContext(moveIds.solarBeam, {
      attacker: {
        nickname: "Venusaur",
        moveIds: [moveIds.solarBeam],
      },
      state: { weather: { type: weatherIds.sun, turnsLeft: 5, source: abilityIds.drought } },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual(EMPTY_EFFECT_RESULT);
  });

  it("given Solar Blade on charge turn WITH sun, when used, then fires immediately (no forcedMoveSet)", () => {
    // Source: Showdown data/moves.ts -- solarblade: same behavior as solarbeam in sun
    // Source: Bulbapedia -- "Solar Blade executes immediately in harsh sunlight."
    const ctx = createMoveEffectContext(moveIds.solarBlade, {
      attacker: {
        nickname: "Lurantis",
        moveIds: [moveIds.solarBlade],
      },
      state: { weather: { type: weatherIds.sun, turnsLeft: 5, source: abilityIds.drought } },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual(EMPTY_EFFECT_RESULT);
  });

  it("given Solar Blade on charge turn WITHOUT sun, when used, then sets charging volatile", () => {
    // Source: Showdown data/moves.ts -- solarblade requires charge without sun
    const ctx = createMoveEffectContext(moveIds.solarBlade, {
      attacker: {
        nickname: "Lurantis",
        moveIds: [moveIds.solarBlade],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.solarBlade,
      volatileStatus: volatileIds.charging,
    });
    expect(result!.messages[0]).toBe("Lurantis is absorbing sunlight!");
  });

  it("given Phantom Force on charge turn, when used, then sets shadow-force-charging and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- phantomforce shares shadow-force-charging volatile
    const ctx = createMoveEffectContext(moveIds.phantomForce, {
      attacker: {
        nickname: "Trevenant",
        moveIds: [moveIds.phantomForce, moveIds.tackle],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.phantomForce,
      volatileStatus: volatileIds.shadowForceCharging,
    });
    expect(result!.messages[0]).toBe("Trevenant vanished!");
  });

  it("given Phantom Force with shadow-force-charging volatile, when used (attack turn), then returns null", () => {
    // Source: Showdown -- attack turn: removeVolatile and proceed with damage
    const chargeVolatiles = new Map<string, { turnsLeft: number }>();
    chargeVolatiles.set(volatileIds.shadowForceCharging, { turnsLeft: 1 });

    const ctx = createMoveEffectContext(moveIds.phantomForce, {
      attacker: {
        volatileStatuses: chargeVolatiles,
        moveIds: [moveIds.phantomForce],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
    expect(ctx.attacker.volatileStatuses.has(volatileIds.shadowForceCharging)).toBe(true);
    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });

  it("given Shadow Force on charge turn, when used, then sets shadow-force-charging volatile", () => {
    // Source: Showdown data/moves.ts -- shadowforce: condition volatile volatileIds.shadowForceCharging
    const ctx = createMoveEffectContext(moveIds.shadowForce, {
      attacker: {
        nickname: "Giratina",
        moveIds: [moveIds.shadowForce],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.shadowForce,
      volatileStatus: volatileIds.shadowForceCharging,
    });
    expect(result!.messages[0]).toBe("Giratina vanished!");
  });

  it("given Sky Attack on charge turn, when used, then sets charging volatile", () => {
    // Source: Showdown data/moves.ts -- skyattack: two-turn move, not semi-invulnerable
    const ctx = createMoveEffectContext(moveIds.skyAttack, {
      attacker: {
        nickname: "Moltres",
        moveIds: [moveIds.skyAttack],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.skyAttack,
      volatileStatus: volatileIds.charging,
    });
    expect(result!.messages[0]).toBe("Moltres is glowing!");
  });

  it(`given Fly on charge turn with ${POWER_HERB_NAME}, when used, then fires immediately and skips charge`, () => {
    // Source: Showdown data/items.ts -- powerherb: skip charge turn, consume
    // Source: Bulbapedia -- "Power Herb allows the holder to skip the charge turn"
    const ctx = createMoveEffectContext(moveIds.fly, {
      attacker: {
        nickname: "Pidgeot",
        heldItem: itemIds.powerHerb,
        moveIds: [moveIds.fly],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      messages: ["Pidgeot became fully charged due to its Power Herb!"],
    });
    // Power Herb is consumed (single-use)
    // Source: Showdown data/items.ts -- powerherb onTryMove: item is consumed after activation
    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });

  it("given Bounce on charge turn, when used, then sets flying volatile", () => {
    // Source: Showdown data/moves.ts -- bounce shares flying volatile with fly
    const ctx = createMoveEffectContext(moveIds.bounce, {
      attacker: {
        nickname: "Lopunny",
        moveIds: [moveIds.bounce],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: moveIds.bounce,
      volatileStatus: volatileIds.flying,
    });
    expect(result!.messages[0]).toBe("Lopunny sprang up!");
  });

  it("given Fly used when move is not in moveset (Mirror Move scenario), when charging, then returns null", () => {
    // Source: Showdown -- two-turn moves invoked via Mirror Move/Metronome won't be in moveset
    // When findIndex() returns -1, return null to avoid defaulting to slot 0 (wrong move).
    const ctx = createMoveEffectContext(moveIds.fly, {
      attacker: {
        nickname: "Pidgeot",
        // Moveset does NOT contain fly -- simulates Mirror Move / Metronome scenario
        moveIds: [moveIds.tackle, moveIds.roost],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    // Should return null (no forced charge) to prevent slot-0 fallback executing wrong move
    expect(result).toBeNull();
    expect(ctx.attacker.volatileStatuses.size).toBe(0);
    expect(ctx.attacker.pokemon.moves).toEqual(
      createCanonicalMoveSlots([moveIds.tackle, moveIds.roost]),
    );
  });
});

// ===========================================================================
// Powder / Spore Immunity (Grass type)
// ===========================================================================

describe("Gen7 Grass-type Powder Immunity -- isGen7GrassPowderBlocked", () => {
  it("given a powder-immune target and Sleep Powder, when checking, then blocked", () => {
    // Source: Showdown data/moves.ts -- sleeppowder: flags: { powder: 1 }
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."
    const move = createCanonicalMove(moveIds.sleepPowder);
    expect(isGen7GrassPowderBlocked(move, [typeIds.grass])).toBe(true);
  });

  it("given a powder-immune target and Spore, when checking, then blocked", () => {
    // Source: Showdown data/moves.ts -- spore: flags: { powder: 1 }
    const move = createCanonicalMove(moveIds.spore);
    expect(isGen7GrassPowderBlocked(move, [typeIds.grass])).toBe(true);
  });

  it("given non-Grass target and Sleep Powder, when checking, then NOT blocked", () => {
    // Source: Only Grass types are immune; other types are affected normally
    const move = createCanonicalMove(moveIds.sleepPowder);
    expect(isGen7GrassPowderBlocked(move, [typeIds.normal])).toBe(false);
  });

  it("given a powder-immune target and a non-powder move, when checking, then it is not blocked", () => {
    // Source: Only moves with the powder flag are blocked, not all Grass-type moves
    const move = createCanonicalMove(moveIds.razorLeaf);
    expect(isGen7GrassPowderBlocked(move, [typeIds.grass])).toBe(false);
  });

  it("given a dual-type target that includes the powder-immune type, when checking Stun Spore, then it is blocked", () => {
    // Source: Any Pokemon with Grass as one of its types is immune
    const move = createCanonicalMove(moveIds.stunSpore);
    expect(isGen7GrassPowderBlocked(move, [typeIds.grass, typeIds.poison])).toBe(true);
  });
});

// ===========================================================================
// Dispatch: unrecognized moves return null
// ===========================================================================

describe("Gen7 executeGen7MoveEffect -- dispatch", () => {
  it("given unrecognized move, when dispatch called, then returns null", () => {
    // Unrecognized moves should fall through to BaseRuleset
    const ctx = createMoveEffectContext(moveIds.thunderbolt);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
    expect(ctx.attacker.volatileStatuses.size).toBe(0);
    expect(ctx.move.id).toBe(moveIds.thunderbolt);
  });

  it("given the shield move handled by the engine/BaseRuleset, when dispatch called, then returns null", () => {
    // Protect is handled by the engine directly, not Gen7MoveEffects
    const ctx = createMoveEffectContext(moveIds.protect);
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
    expect(ctx.attacker.volatileStatuses.size).toBe(0);
    expect(ctx.move.id).toBe(moveIds.protect);
  });

  it("given Spectral Thief with defender positive boosts, when pre-damage dispatch runs, then it steals only positive stages", () => {
    const ctx = createMoveEffectContext(moveIds.spectralThief, {
      attacker: { ability: abilityIds.none },
      defender: {
        ability: abilityIds.none,
        volatileStatuses: new Map(),
      },
    });
    ctx.defender.statStages.attack = 2;
    ctx.defender.statStages.defense = 1;
    ctx.defender.statStages.spAttack = -1;

    const result = executeGen7PreDamageMoveEffect(ctx);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      statChanges: [
        // Spectral Thief steals the target's positive raw stages before damage.
        // Source: references/pokemon-showdown/sim/battle-actions.ts -- hitStepStealBoosts
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: statIds.attack, stages: 2 },
        { target: BATTLE_EFFECT_TARGETS.defender, stat: statIds.attack, stages: -2 },
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: statIds.defense, stages: 1 },
        { target: BATTLE_EFFECT_TARGETS.defender, stat: statIds.defense, stages: -1 },
      ],
    });
  });

  it("given Spectral Thief with Simple attacker, when pre-damage dispatch runs, then it stores the raw stolen stages for the attacker", () => {
    const ctx = createMoveEffectContext(moveIds.spectralThief, {
      attacker: { ability: abilityIds.simple },
      defender: { ability: abilityIds.none },
    });
    ctx.defender.statStages.attack = 2;

    const result = executeGen7PreDamageMoveEffect(ctx);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      statChanges: [
        // The repo stores raw stages and lets getEffectiveStatStage() apply Simple on read.
        // Source: packages/battle/src/utils/statStageHelpers.ts -- Simple doubles read-side stage effects
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: statIds.attack, stages: 2 },
        { target: BATTLE_EFFECT_TARGETS.defender, stat: statIds.attack, stages: -2 },
      ],
    });
  });

  it("given Spectral Thief with Contrary attacker, when pre-damage dispatch runs, then stolen boosts are inverted on the attacker while still cleared from the defender", () => {
    const ctx = createMoveEffectContext(moveIds.spectralThief, {
      attacker: { ability: abilityIds.contrary },
      defender: { ability: abilityIds.none },
    });
    ctx.defender.statStages.spAttack = 3;

    const result = executeGen7PreDamageMoveEffect(ctx);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      statChanges: [
        // Contrary still inverts the stolen raw stage on write because MoveEffectResult
        // statChanges do not pass through the on-stat-change ability pipeline.
        // Source: packages/gen7/src/Gen7AbilitiesStat.ts -- Contrary is modeled as stat-change inversion
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: statIds.spAttack, stages: -3 },
        { target: BATTLE_EFFECT_TARGETS.defender, stat: statIds.spAttack, stages: -3 },
      ],
    });
  });
});

// ===========================================================================
// Gen7Ruleset.executeMoveEffect integration
// ===========================================================================

describe("Gen7Ruleset.executeMoveEffect -- integration", () => {
  const ruleset = new Gen7Ruleset();

  it("given Gen7Ruleset, when executing King's Shield, then returns kings-shield volatile", () => {
    // Source: Showdown mods/gen7/moves.ts -- kingsshield
    const ctx = createMoveEffectContext(moveIds.kingsShield);
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe(moveIds.kingsShield);
  });

  it("given Gen7Ruleset, when executing Baneful Bunker, then returns baneful-bunker volatile", () => {
    // Source: Showdown data/moves.ts -- banefulbunker: volatileStatus
    const ctx = createMoveEffectContext(moveIds.banefulBunker);
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe(moveIds.banefulBunker);
  });

  it("given Gen7Ruleset, when executing unrecognized move, then falls through to BaseRuleset", () => {
    // Source: Gen7Ruleset.executeMoveEffect falls through to super.executeMoveEffect
    const ctx = createMoveEffectContext(moveIds.tackle);
    const result = ruleset.executeMoveEffect(ctx);

    // BaseRuleset returns default empty result for unrecognized moves
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
  });

  it("given Gen7Ruleset, when executing Sleep Powder against Grass-type, then blocked by powder immunity", () => {
    // Source: Showdown data/moves.ts -- powder moves check target.hasType('Grass')
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."

    const ctx = createMoveEffectContext(moveIds.sleepPowder, {
      defender: { types: [typeIds.grass, typeIds.poison], nickname: "Bulbasaur" },
    });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      messages: ["It doesn't affect Bulbasaur..."],
    });
  });

  it("given Gen7Ruleset, when executing Sleep Powder against non-Grass, then NOT blocked", () => {
    // Source: Powder immunity only applies to Grass types

    const ctx = createMoveEffectContext(moveIds.sleepPowder, {
      defender: { types: [typeIds.normal] },
    });
    const result = ruleset.executeMoveEffect(ctx);

    // Non-Grass target: falls through to BaseRuleset (default empty result = no messages, no effects)
    // Source: Gen7Ruleset delegates to super.executeMoveEffect which returns createBaseResult()
    expect(result.messages).toEqual([]);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Gen7Ruleset, when executing Spectral Thief before damage, then returns the stolen boosts", () => {
    const ctx = createMoveEffectContext(moveIds.spectralThief);
    ctx.defender.statStages.speed = 2;

    const result = ruleset.executePreDamageMoveEffect(ctx);

    expect(result).toEqual({
      ...EMPTY_EFFECT_RESULT,
      statChanges: [
        // The defender's +2 Speed is stolen as a raw +2 to the attacker and cleared from the target.
        // Source: references/pokemon-showdown/sim/battle-actions.ts -- hitStepStealBoosts
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: statIds.speed, stages: 2 },
        { target: BATTLE_EFFECT_TARGETS.defender, stat: statIds.speed, stages: -2 },
      ],
    });
  });
});
