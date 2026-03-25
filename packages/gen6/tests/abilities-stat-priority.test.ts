import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_MOVE_IDS,
  GEN6_SPECIES_IDS,
  handleGen6StatAbility,
  isPranksterEligible,
} from "../src";

/**
 * Gen 6 stat-modifying and priority ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Gale Wings (Gen 6): +1 priority to Flying moves with NO HP restriction
 *   - Protean: type changes to match move type before attacking
 *   - Competitive: +2 SpAtk on opponent stat drop
 *   - Carry-forward: Prankster, Defiant, Weak Armor, Speed Boost, Moxie, Steadfast
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

const dataManager = createGen6DataManager();
const defaultSpecies = dataManager.getSpecies(GEN6_SPECIES_IDS.bulbasaur);
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;
const genderIds = CORE_GENDERS;
const natureIds = CORE_NATURE_IDS;
const coreAbilityIds = CORE_ABILITY_IDS;
const itemIds = CORE_ITEM_IDS;

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  gender?: typeof genderIds[keyof typeof genderIds];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(6 + species.id), {
    nature: natureIds.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? genderIds.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });
  pokemon.uid = `test-${species.id}`;
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.ability = overrides.ability ?? coreAbilityIds.none;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return pokemon;
}

function createSyntheticOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  turnsOnField?: number;
  statStages?: Partial<Record<string, number>>;
}) {
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
  });
  return {
    pokemon,
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
    ability: overrides.ability ?? coreAbilityIds.none,
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

function createSyntheticBattleSide(index: 0 | 1): BattleSide {
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

function createSyntheticBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: "singles",
    turnNumber: 1,
    sides: [createSyntheticBattleSide(0), createSyntheticBattleSide(1)],
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

function createSyntheticAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createSyntheticOnFieldPokemon>;
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  turnsOnField?: number;
  nickname?: string;
  statStages?: Partial<Record<string, number>>;
  rngPick?: <T>(arr: readonly T[]) => T;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = createSyntheticBattleState();
  const pokemon = createSyntheticOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
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

// ===========================================================================
// Gale Wings (NEW Gen 6 -- priority)
// ===========================================================================

describe("Gale Wings (Gen 6)", () => {
  it("given Gale Wings + Fly at full HP, when on-priority-check, then activates (+1 priority)", () => {
    // Source: Bulbapedia "Gale Wings" Gen 6 -- "+1 priority to Flying-type moves"
    // Source: Showdown data/mods/gen6/abilities.ts -- galeWings has no HP check
    const flyMove = dataManager.getMove(GEN6_MOVE_IDS.fly);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.galeWings,
      trigger: abilityTriggers.onPriorityCheck,
      move: flyMove,
      types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying],
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Gale Wings + Fly at 50% HP, when on-priority-check, then STILL activates (Gen 6 has NO HP restriction)", () => {
    // Source: Bulbapedia "Gale Wings" Gen 6 -- no HP requirement in Gen 6
    // Gen 7 added: "only when at full HP"
    // Source: Showdown data/mods/gen6/abilities.ts -- no hp check
    const flyMove = dataManager.getMove(GEN6_MOVE_IDS.fly);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.galeWings,
      trigger: abilityTriggers.onPriorityCheck,
      move: flyMove,
      currentHp: 100,
      maxHp: 200,
      types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying],
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Gale Wings + Tackle (Normal, not Flying), when on-priority-check, then does not activate", () => {
    // Source: Bulbapedia "Gale Wings" -- only Flying-type moves get priority boost
    const normalMove = dataManager.getMove(GEN6_MOVE_IDS.tackle);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.galeWings,
      trigger: abilityTriggers.onPriorityCheck,
      move: normalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Protean (NEW Gen 6 -- type change)
// ===========================================================================

describe("Protean (Gen 6)", () => {
  it("given Protean + Water-type move, when on-before-move, then type changes to Water", () => {
    // Source: Bulbapedia "Protean" Gen 6 -- type changes to match move type before attacking
    // Source: Showdown data/abilities.ts -- protean: onPrepareHit
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.waterPulse);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.protean,
      trigger: abilityTriggers.onBeforeMove,
      move: waterMove,
      types: [CORE_TYPE_IDS.normal], // current type is Normal, not Water
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.water] },
    ]);
  });

  it("given Protean + Fire-type move on a Fire-type Pokemon, when on-before-move, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- protean: no change if type already matches
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.protean,
      trigger: abilityTriggers.onBeforeMove,
      move: fireMove,
      types: [CORE_TYPE_IDS.fire], // already Fire-type
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Protean + Fighting-type move on a Normal/Flying Pokemon, when on-before-move, then type changes to Fighting", () => {
    // Source: Bulbapedia "Protean" -- type changes even for dual-type Pokemon
    const fightMove = dataManager.getMove(GEN6_MOVE_IDS.focusPunch);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.protean,
      trigger: abilityTriggers.onBeforeMove,
      move: fightMove,
      types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying], // neither type is Fighting
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: [CORE_TYPE_IDS.fighting],
    });
  });
});

// ===========================================================================
// Competitive (in Gen 5 but important Gen 6 carry-forward)
// ===========================================================================

describe("Competitive", () => {
  it("given Competitive + Intimidate stat drop (opponent-caused), when on-stat-change, then +2 SpAtk", () => {
    // Source: Bulbapedia "Competitive" Gen 6 -- "+2 SpAtk when any stat lowered by opponent"
    // Source: Showdown data/abilities.ts -- competitive onAfterEachBoost
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.competitive,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 2,
    });
  });

  it("given Competitive + self-caused stat drop (Close Combat), when on-stat-change, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- competitive: only opponent-caused drops trigger
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.competitive,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "defense", stages: -1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Competitive + stat BOOST from opponent, when on-stat-change, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- competitive: only drops (stages < 0) trigger
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.competitive,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "attack", stages: 1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Prankster
// ===========================================================================

describe("Prankster (carry-forward)", () => {
  it("given Prankster + status move, when on-priority-check, then activates", () => {
    // Source: Showdown data/abilities.ts -- Prankster: move.category === 'Status'
    const statusMove = dataManager.getMove(GEN6_MOVE_IDS.growl);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.prankster,
      trigger: abilityTriggers.onPriorityCheck,
      move: statusMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Prankster + physical move, when on-priority-check, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Prankster only for status moves
    const physicalMove = dataManager.getMove(GEN6_MOVE_IDS.tackle);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.prankster,
      trigger: abilityTriggers.onPriorityCheck,
      move: physicalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given isPranksterEligible with the status move category, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
    expect(isPranksterEligible(CORE_MOVE_CATEGORIES.status)).toBe(true);
  });

  it("given isPranksterEligible with the physical move category, then returns false", () => {
    // Source: Showdown -- only status moves eligible
    expect(isPranksterEligible(CORE_MOVE_CATEGORIES.physical)).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Defiant
// ===========================================================================

describe("Defiant (carry-forward)", () => {
  it("given Defiant + opponent-caused stat drop, when on-stat-change, then +2 Attack", () => {
    // Source: Showdown data/abilities.ts -- defiant onAfterEachBoost
    // Source: Bulbapedia -- Defiant: "+2 Attack when any stat lowered by opponent"
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.defiant,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 2,
    });
  });

  it("given Defiant + self-caused stat drop, when on-stat-change, then does not activate", () => {
    // Source: Showdown -- defiant only triggers on opponent-caused drops
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.defiant,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "defense", stages: -1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Speed Boost
// ===========================================================================

describe("Speed Boost (carry-forward)", () => {
  it("given Speed Boost + turnsOnField > 0, when on-turn-end, then +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: if activeTurns, boost spe
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.speedBoost,
      trigger: abilityTriggers.onTurnEnd,
      turnsOnField: 1,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Speed Boost + turnsOnField = 0, when on-turn-end, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost: only if activeTurns > 0
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.speedBoost,
      trigger: abilityTriggers.onTurnEnd,
      turnsOnField: 0,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Weak Armor (Gen 5-6 version: +1 Speed)
// ===========================================================================

describe("Weak Armor (Gen 5-6 version)", () => {
  it("given Weak Armor + physical hit, when on-damage-taken, then -1 Def and +1 Speed", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1, def -1
    // Gen 7+ changed to spe +2
    const physMove = dataManager.getMove(GEN6_MOVE_IDS.tackle);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.weakArmor,
      trigger: abilityTriggers.onDamageTaken,
      move: physMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "self", stat: "defense", stages: -1 },
      { effectType: "stat-change", target: "self", stat: "speed", stages: 1 },
    ]);
  });

  it("given Weak Armor + special hit, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Weak Armor only triggers on physical hits
    const specialMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.weakArmor,
      trigger: abilityTriggers.onDamageTaken,
      move: specialMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Justified
// ===========================================================================

describe("Justified (carry-forward)", () => {
  it("given Justified + Dark-type hit, when on-damage-taken, then +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- Justified: if Dark-type, boost atk
    const darkMove = dataManager.getMove(GEN6_MOVE_IDS.nightSlash);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.justified,
      trigger: abilityTriggers.onDamageTaken,
      move: darkMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Justified + Normal-type hit, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- only Dark-type moves trigger Justified
    const normalMove = dataManager.getMove(GEN6_MOVE_IDS.tackle);
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.justified,
      trigger: abilityTriggers.onDamageTaken,
      move: normalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Steadfast
// ===========================================================================

describe("Steadfast (carry-forward)", () => {
    it("given Steadfast, when on-flinch, then +1 Speed", () => {
      // Source: Showdown data/abilities.ts -- Steadfast: on flinch, boost spe
      const ctx = createSyntheticAbilityContext({
        ability: GEN6_ABILITY_IDS.steadfast,
        trigger: abilityTriggers.onFlinch,
      });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given non-Steadfast ability, when on-flinch, then does not activate", () => {
    // Source: Showdown -- only Steadfast triggers on flinch in this module
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.blaze,
      trigger: abilityTriggers.onFlinch,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Contrary
// ===========================================================================

describe("Contrary (carry-forward)", () => {
  it("given Contrary, when on-stat-change, then activates (signals reversal)", () => {
    // Source: Showdown data/abilities.ts -- Contrary: reverses all stat changes
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.contrary,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "attack", stages: 2, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Carry-forward: Simple
// ===========================================================================

describe("Simple (carry-forward)", () => {
  it("given Simple, when on-stat-change, then activates (signals doubling)", () => {
    // Source: Showdown data/abilities.ts -- Simple: doubles all stat changes
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.simple,
      trigger: abilityTriggers.onStatChange,
      statChange: { stat: "attack", stages: 1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Carry-forward: Moxie
// ===========================================================================

describe("Moxie (carry-forward)", () => {
  it("given Moxie + opponent fainted, when on-after-move-used, then +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint
    const faintedOpponent = createSyntheticOnFieldPokemon({ currentHp: 0 });
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.moxie,
      trigger: abilityTriggers.onAfterMoveUsed,
      opponent: faintedOpponent,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Moxie + opponent NOT fainted, when on-after-move-used, then does not activate", () => {
    // Source: Showdown -- Moxie only triggers on KO
    const aliveOpponent = createSyntheticOnFieldPokemon({ currentHp: 100 });
    const ctx = createSyntheticAbilityContext({
      ability: GEN6_ABILITY_IDS.moxie,
      trigger: abilityTriggers.onAfterMoveUsed,
      opponent: aliveOpponent,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
