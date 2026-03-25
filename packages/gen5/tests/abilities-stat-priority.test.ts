import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  createMoveSlot,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { createGen5DataManager } from "../src/data/index.ts";
import { handleGen5StatAbility, isPranksterEligible } from "../src/Gen5AbilitiesStat";

const abilityIds = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS };
const itemIds = GEN5_ITEM_IDS;
const moveIds = GEN5_MOVE_IDS;
const speciesIds = GEN5_SPECIES_IDS;
const typeIds = CORE_TYPE_IDS;
const natureIds = GEN5_NATURE_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const dataManager = createGen5DataManager();
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const thunderWave = dataManager.getMove(moveIds.thunderWave);
const growl = dataManager.getMove(moveIds.growl);
const tackle = dataManager.getMove(moveIds.tackle);
const flamethrower = dataManager.getMove(moveIds.flamethrower);
const crunch = dataManager.getMove(moveIds.crunch);
const darkPulse = dataManager.getMove(moveIds.darkPulse);
const closeCombat = dataManager.getMove(moveIds.closeCombat);
const INVALID_GEN5_STAT_ABILITY_ID = "__invalid-gen5-stat-ability__";

/**
 * Gen 5 stat-modifying and priority ability tests.
 *
 * Source: references/pokemon-showdown/data/abilities.ts (base definitions)
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts (Gen 5 overrides)
 * Source: references/pokemon-showdown/data/mods/gen6/abilities.ts (Weak Armor Gen 5-6 override)
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createAbilityPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speciesId = overrides.speciesId ?? speciesIds.bulbasaur;
  return {
    uid: "test-pokemon",
    speciesId,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: natureIds.hardy,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [createMoveSlot(tackle.id, tackle.pp)],
    ability: overrides.ability ?? abilityIds.none,
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
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
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  turnsOnField?: number;
  statStages?: Partial<Record<string, number>>;
}) {
  return {
    pokemon: createAbilityPokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
    }),
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? [...defaultSpecies.types],
    ability: overrides.ability ?? abilityIds.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
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
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function createBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
    ...overrides,
  };
}

function createAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  move?: MoveData;
  turnsOnField?: number;
  nickname?: string;
  statStages?: Partial<Record<string, number>>;
  rngPick?: <T>(arr: readonly T[]) => T;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    turnsOnField: opts.turnsOnField,
    statStages: opts.statStages,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: opts.rngPick ?? (<T>(arr: readonly T[]) => arr[0] as T),
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ---------------------------------------------------------------------------
// Prankster (on-priority-check)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Prankster", () => {
  it("given Prankster and a status move, when on-priority-check fires, then activates with priority boost message", () => {
    // Source: Showdown data/abilities.ts -- Prankster onModifyPriority:
    //   if (move?.category === 'Status') return priority + 1
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
      move: thunderWave,
      nickname: "Sableye",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Prankster");
    expect(result.messages[0]).toContain("Sableye");
  });

  it("given Prankster and a physical move, when on-priority-check fires, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Prankster only checks Status category
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
      move: tackle,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Prankster and a special move, when on-priority-check fires, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Prankster ignores special moves
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
      move: flamethrower,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Prankster but no move in context, when on-priority-check fires, then does not activate", () => {
    // Edge case: trigger without move data
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

describe("isPranksterEligible", () => {
  it("given status category, when checked, then returns true", () => {
    // Source: Showdown data/abilities.ts -- move.category === 'Status'
    expect(isPranksterEligible(thunderWave.category)).toBe(true);
  });

  it("given physical category, when checked, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only Status qualifies
    expect(isPranksterEligible(tackle.category)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Moxie (on-after-move-used)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Moxie", () => {
  it("given Moxie and a fainted opponent, when on-after-move-used fires, then raises Attack by 1 stage", () => {
    // Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint:
    //   this.boost({atk: length}, source) where length is faint count (1 in singles)
    // Source: Bulbapedia -- Moxie: "+1 Attack on KO"
    const opponent = createOnFieldPokemon({ currentHp: 0, maxHp: 200 });
    const ctx = createAbilityContext({
      ability: abilityIds.moxie,
      trigger: "on-after-move-used",
      opponent,
      nickname: "Krookodile",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Moxie");
    expect(result.messages[0]).toContain("Krookodile");
  });

  it("given Moxie and opponent still alive, when on-after-move-used fires, then does not activate", () => {
    // Source: Showdown -- Moxie only triggers when target faints
    const opponent = createOnFieldPokemon({ currentHp: 100, maxHp: 200 });
    const ctx = createAbilityContext({
      ability: abilityIds.moxie,
      trigger: "on-after-move-used",
      opponent,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Moxie but no opponent in context, when on-after-move-used fires, then does not activate", () => {
    // Edge case: no opponent reference
    const ctx = createAbilityContext({
      ability: abilityIds.moxie,
      trigger: "on-after-move-used",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defiant (on-stat-change)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Defiant", () => {
  it("given Defiant and opponent-caused stat drop, when on-stat-change fires, then raises Attack by 2 stages", () => {
    // Source: Showdown data/abilities.ts -- Defiant onAfterEachBoost:
    //   this.boost({atk: 2}, target, target, null, false, true)
    // Source: Bulbapedia -- Defiant: "+2 Attack when any stat lowered by opponent"
    const opponent = createOnFieldPokemon({ ability: abilityIds.intimidate });
    const ctx = createAbilityContext({
      ability: abilityIds.defiant,
      trigger: "on-stat-change",
      opponent,
      nickname: "Bisharp",
      // Must supply statChange with a drop caused by opponent
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 2,
    });
    expect(result.messages[0]).toContain("Defiant");
    expect(result.messages[0]).toContain("sharply raised");
    expect(result.messages[0]).toContain("Bisharp");
  });

  it("given Defiant and self-inflicted stat drop, when on-stat-change fires, then does not activate", () => {
    // Source: Showdown -- Defiant checks: if (!source || target.isAlly(source)) return;
    // Self-inflicted drops (e.g., Close Combat own stat drop) should not trigger Defiant.
    const ctx = createAbilityContext({
      ability: abilityIds.defiant,
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "self" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Defiant and opponent-caused stat boost (not a drop), when on-stat-change fires, then does not activate", () => {
    // Source: Showdown -- Defiant only fires on negative boosts, not positive
    const opponent = createOnFieldPokemon({ ability: abilityIds.moody });
    const ctx = createAbilityContext({
      ability: abilityIds.defiant,
      trigger: "on-stat-change",
      opponent,
      statChange: { stat: "attack", stages: 2, source: "opponent" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Contrary (on-stat-change)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Contrary", () => {
  it("given Contrary, when on-stat-change fires, then activates with empty effects (engine handles inversion)", () => {
    // Source: Showdown data/abilities.ts -- Contrary onChangeBoost:
    //   for (i in boost) { boost[i]! *= -1; }
    // The handler signals activation; the engine reads this and inverts the stat changes.
    const ctx = createAbilityContext({
      ability: abilityIds.contrary,
      trigger: "on-stat-change",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    // No AbilityEffect produced -- the engine handles inversion itself
    expect(result.effects).toHaveLength(0);
  });

  it("given Contrary, when on-stat-change fires with move context, then still activates", () => {
    // Source: Showdown -- Contrary always activates regardless of move/source
    // (no Z-Power check in Gen 5 since Z-moves don't exist)
    const ctx = createAbilityContext({
      ability: abilityIds.contrary,
      trigger: "on-stat-change",
      move: growl,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Simple (on-stat-change)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Simple", () => {
  it("given Simple, when on-stat-change fires, then activates with empty effects (engine doubles stat changes)", () => {
    // Source: Showdown data/abilities.ts -- Simple onChangeBoost:
    //   for (i in boost) { boost[i]! *= 2; }
    // The handler signals activation; the engine reads this and doubles all pending changes.
    const ctx = createAbilityContext({
      ability: abilityIds.simple,
      trigger: "on-stat-change",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it("given Simple, when on-stat-change fires a second time, then still activates (no one-time limit)", () => {
    // Source: Showdown -- Simple has no activation counter; applies to every stat change
    const ctx = createAbilityContext({
      ability: abilityIds.simple,
      trigger: "on-stat-change",
    });
    const result1 = handleGen5StatAbility(ctx);
    const result2 = handleGen5StatAbility(ctx);

    expect(result1.activated).toBe(true);
    expect(result2.activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Justified (on-damage-taken)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Justified", () => {
  it("given Justified and hit by Dark-type move, when on-damage-taken fires, then raises Attack by 1 stage", () => {
    // Source: Showdown data/abilities.ts -- Justified onDamagingHit:
    //   if (move.type === 'Dark') { this.boost({atk: 1}); }
    // Source: Bulbapedia -- Justified: "+1 Attack when hit by Dark-type move"
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: "on-damage-taken",
      move: crunch,
      nickname: "Lucario",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Justified");
    expect(result.messages[0]).toContain("Lucario");
  });

  it("given Justified and hit by Dark-type special move, when on-damage-taken fires, then still raises Attack by 1", () => {
    // Source: Showdown -- Justified checks move.type only, not category
    // Dark Pulse (special) should still trigger Justified
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: "on-damage-taken",
      move: darkPulse,
      nickname: "Cobalion",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Justified and hit by non-Dark move, when on-damage-taken fires, then does not activate", () => {
    // Source: Showdown -- Justified only checks for Dark type
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: "on-damage-taken",
      move: createSyntheticMoveFrom(flamethrower, {
        // Synthetic probe: Justified only branches on Dark typing, so this forces
        // a non-canonical Fire physical hit without rebuilding a move payload.
        category: tackle.category,
        power: tackle.power,
        flags: tackle.flags,
      }),
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Justified but no move in context, when on-damage-taken fires, then does not activate", () => {
    // Edge case: damage without move data
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: "on-damage-taken",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weak Armor (on-damage-taken)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Weak Armor", () => {
  it("given Weak Armor and hit by physical move, when on-damage-taken fires, then lowers Def by 1 and raises Speed by 1", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6 override:
    //   this.boost({def: -1, spe: 1}, target, target)
    // Note: base data (Gen 7+) has spe: 2, but Gen 5 uses spe: 1
    // Source: Bulbapedia -- Weak Armor (Gen V-VI): "-1 Defense, +1 Speed"
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: "on-damage-taken",
      move: tackle,
      nickname: "Vanilluxe",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "defense",
      stages: -1,
    });
    expect(result.effects[1]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Weak Armor");
    expect(result.messages[0]).toContain("Vanilluxe");
  });

  it("given Weak Armor and hit by special move, when on-damage-taken fires, then does not activate", () => {
    // Source: Showdown -- Weak Armor checks move.category === 'Physical'
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: "on-damage-taken",
      move: flamethrower,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Weak Armor and hit by status move, when on-damage-taken fires, then does not activate", () => {
    // Source: Showdown -- Weak Armor checks move.category === 'Physical'
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: "on-damage-taken",
      move: thunderWave,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Speed Boost (on-turn-end)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Speed Boost", () => {
  it("given Speed Boost and turnsOnField=1, when on-turn-end fires, then raises Speed by 1 stage", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual:
    //   if (pokemon.activeTurns) { this.boost({spe: 1}); }
    // Source: Bulbapedia -- Speed Boost: "+1 Speed at end of each turn"
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: "on-turn-end",
      turnsOnField: 1,
      nickname: "Blaziken",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Speed Boost");
    expect(result.messages[0]).toContain("Blaziken");
  });

  it("given Speed Boost and turnsOnField=0, when on-turn-end fires, then does not activate (first turn)", () => {
    // Source: Showdown -- Speed Boost checks pokemon.activeTurns; 0 means no boost
    // The Pokemon just switched in this turn, no boost yet
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: "on-turn-end",
      turnsOnField: 0,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Speed Boost and turnsOnField=3, when on-turn-end fires, then still raises Speed by 1", () => {
    // Source: Showdown -- Speed Boost triggers every turn after the first
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: "on-turn-end",
      turnsOnField: 3,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Moody (on-turn-end)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Moody", () => {
  it("given Moody with all stats at 0, when on-turn-end fires, then raises one stat by 2 and lowers a different one by 1", () => {
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody onResidual:
    //   picks a random stat below +6 to raise by 2, then a different stat above -6 to lower by 1
    // Source: Bulbapedia -- Moody: "+2 random stat, -1 different random stat per turn"
    // With rng.pick returning first element: attack is raised, defense is lowered
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: "on-turn-end",
      nickname: "Glalie",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody onResidual: first effect is stat-change type
    // First effect: raise (rng.pick returns first eligible stat = attack)
    expect(result.effects[0].effectType).toBe("stat-change");
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody raises chosen stat by +2 stages
    expect((result.effects[0] as { stages: number }).stages).toBe(2);
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody onResidual: second effect is stat-change type
    // Second effect: lower (rng.pick returns first eligible stat != raised = defense)
    expect(result.effects[1].effectType).toBe("stat-change");
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody lowers different chosen stat by -1 stage
    expect((result.effects[1] as { stages: number }).stages).toBe(-1);
    // The raised and lowered stats must differ
    const raisedStat = (result.effects[0] as { stat: string }).stat;
    const loweredStat = (result.effects[1] as { stat: string }).stat;
    expect(raisedStat).not.toBe(loweredStat);
  });

  it("given Moody, when on-turn-end fires, then accuracy and evasion are eligible stats (Gen 5-7 behavior)", () => {
    // Source: Showdown data/mods/gen7/abilities.ts -- NO accuracy/evasion filter
    //   (Gen 8+ base data adds: if (statPlus === 'accuracy' || statPlus === 'evasion') continue)
    // Source: Bulbapedia -- Moody Gen V-VII: "All seven stats are eligible"
    // Force rng.pick to return the last element (evasion) to verify it's in the pool
    let pickCount = 0;
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: "on-turn-end",
      rngPick: <T>(arr: readonly T[]) => {
        pickCount++;
        // First pick (raise): return last element (evasion)
        if (pickCount === 1) return arr[arr.length - 1] as T;
        // Second pick (lower): return last element of remaining pool
        return arr[arr.length - 1] as T;
      },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    // With last-element picks, evasion should be the raised stat
    const raisedStat = (result.effects[0] as { stat: string }).stat;
    // Source: Bulbapedia -- Moody Gen V-VII includes accuracy and evasion in the eligible stat pool
    expect(raisedStat).toBe("evasion");
  });

  it("given Moody with attack at +6, when on-turn-end fires, then attack is excluded from raise pool", () => {
    // Source: Showdown -- Moody filters stats already at +6 from the raise pool:
    //   if (pokemon.boosts[statPlus] < 6) stats.push(statPlus)
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: "on-turn-end",
      statStages: { attack: 6 },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    // The raised stat should NOT be attack (it's at +6)
    const raisedStat = (result.effects[0] as { stat: string }).stat;
    expect(raisedStat).not.toBe("attack");
  });

  it("given Moody with all stats at +6, when on-turn-end fires, then no stat is raised but one is still lowered", () => {
    // Source: Showdown -- if no stat can be raised, randomStat is undefined, only lower fires
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: "on-turn-end",
      statStages: {
        attack: 6,
        defense: 6,
        spAttack: 6,
        spDefense: 6,
        speed: 6,
        accuracy: 6,
        evasion: 6,
      },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    // Only the lower effect should be present
    expect(result.effects).toHaveLength(1);
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody lowers chosen stat by -1 stage
    expect((result.effects[0] as { stages: number }).stages).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Steadfast (on-flinch)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Steadfast", () => {
  it("given Steadfast, when on-flinch fires, then raises Speed by 1 stage", () => {
    // Source: Showdown data/abilities.ts -- Steadfast onFlinch:
    //   this.boost({spe: 1});
    // Source: Bulbapedia -- Steadfast: "+1 Speed when flinched"
    const ctx = createAbilityContext({
      ability: abilityIds.steadfast,
      trigger: "on-flinch",
      nickname: "Lucario",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Steadfast");
    expect(result.messages[0]).toContain("Lucario");
  });

  it("given non-Steadfast ability, when on-flinch fires, then does not activate", () => {
    // Source: Showdown -- only Steadfast has an on-flinch handler
    const ctx = createAbilityContext({
      ability: abilityIds.blaze,
      trigger: "on-flinch",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unnerve (on-item-use)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Unnerve", () => {
  it("given Unnerve, when on-item-use fires, then activates with prevention message", () => {
    // Unnerve prevents berry consumption; fires on the on-item-use trigger (not passive-immunity).
    // Source: Showdown data/abilities.ts -- Unnerve onFoeTryEatItem:
    //   `if (this.effectState.target.hasAbility('unnerve')) return null;`
    // Source: Bulbapedia -- Unnerve: "Prevents opposing Pokemon from eating Berries"
    const ctx = createAbilityContext({
      ability: abilityIds.unnerve,
      trigger: "on-item-use",
      nickname: "Axew",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0); // No stat change effects
    expect(result.messages[0]).toContain("Unnerve");
    expect(result.messages[0]).toContain("Axew");
    expect(result.messages[0]).toContain("Berries");
  });

  it("given non-Unnerve ability, when on-item-use fires, then does not activate", () => {
    // Source: Showdown -- only Unnerve has this item-consumption prevention
    const ctx = createAbilityContext({
      ability: abilityIds.blaze,
      trigger: "on-item-use",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Unnerve, when passive-immunity check fires (wrong trigger), then does not activate", () => {
    // Regression: Unnerve was previously incorrectly wired to passive-immunity.
    // Verify it no longer activates on that trigger.
    const ctx = createAbilityContext({
      ability: abilityIds.unnerve,
      trigger: "passive-immunity",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown trigger / unknown ability
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- unknown trigger", () => {
  it("given any ability with an unhandled trigger, when dispatch runs, then returns inactive", () => {
    // Triggers that this module doesn't handle should return INACTIVE
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: "on-switch-in",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });
});

describe("handleGen5StatAbility -- unknown ability for handled trigger", () => {
  it("given a generation-invalid stat ability id, when on-stat-change fires, then dispatch stays inactive", () => {
    // Regression: Gen 5 previously handled a foreign-generation stat-boost ability here.
    // Any unsupported stat ability id must remain inactive instead of silently reintroducing it.
    const ctx = createAbilityContext({
      ability: INVALID_GEN5_STAT_ABILITY_ID,
      trigger: "on-stat-change",
      statChange: { stat: "spAttack", stages: -2, source: "opponent" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result).toEqual({
      activated: false,
      effects: [],
      messages: [],
    });
  });

  it("given an unhandled ability with on-turn-end trigger, when dispatch runs, then returns inactive", () => {
    // Abilities not in this module's scope should return INACTIVE
    const ctx = createAbilityContext({
      ability: abilityIds.blaze,
      trigger: "on-turn-end",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 specific: Prankster NOT blocked by Dark types
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Prankster Gen 5 Dark-type interaction", () => {
  it("given Prankster and Dark-type opponent, when on-priority-check fires with status move, then still activates (Gen 5 has no Dark-type block)", () => {
    // Source: Bulbapedia -- Prankster Gen 7 change:
    //   "Status moves affected by Prankster will now fail against Dark-type Pokemon."
    //   This restriction did NOT exist in Gen 5.
    // Source: Showdown data/abilities.ts -- Gen 7+ base data adds pranksterBoosted check
    //   but the Gen 5 mod doesn't override this, and our implementation for Gen 5 simply
    //   doesn't check the target's type at all.
    const opponent = createOnFieldPokemon({ types: [typeIds.dark], ability: abilityIds.innerFocus });
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
      move: thunderWave,
      opponent,
    });
    const result = handleGen5StatAbility(ctx);

    // In Gen 5, Prankster should still activate even against Dark types
    expect(result.activated).toBe(true);
  });

  it("given Prankster and Dark/Steel opponent, when on-priority-check fires with status move, then still activates", () => {
    // Source: Bulbapedia -- dual Dark-type also not blocked in Gen 5
    const opponent = createOnFieldPokemon({
      types: [typeIds.dark, typeIds.steel],
      ability: abilityIds.innerFocus,
    });
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: "on-priority-check",
      move: thunderWave,
      opponent,
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 specific: Weak Armor +1 Speed (not +2)
// ---------------------------------------------------------------------------

describe("handleGen5StatAbility -- Weak Armor Gen 5 Speed boost amount", () => {
  it("given Weak Armor in Gen 5, when hit by physical move, then Speed boost is exactly +1 (not +2 like Gen 7+)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6:
    //   this.boost({def: -1, spe: 1}, target, target)
    //   Gen 7+ base data uses spe: 2
    // Source: Bulbapedia -- Weak Armor Gen V-VI: "+1 Speed, -1 Defense"
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: "on-damage-taken",
      move: closeCombat,
    });
    const result = handleGen5StatAbility(ctx);

    const speedEffect = result.effects.find(
      (e) => e.effectType === "stat-change" && (e as { stat: string }).stat === "speed",
    );
    expect(speedEffect).toBeDefined();
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor (Gen 5-6): this.boost({def: -1, spe: 1}) raises Speed by +1 stage
    expect((speedEffect as { stages: number }).stages).toBe(1);
  });
});
