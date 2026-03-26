import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createMoveSlot,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
  GEN4_TYPES,
  Gen4Ruleset,
} from "../src";

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS };
const END_OF_TURN = CORE_END_OF_TURN_EFFECT_IDS;
const HAZARDS = CORE_HAZARD_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS };
const MOVES = CORE_MOVE_IDS;
const SPECIES = GEN4_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN4_NATURE_IDS.hardy;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const EXPECTED_HAZARDS = [HAZARDS.stealthRock, HAZARDS.spikes, HAZARDS.toxicSpikes] as const;
const EXPECTED_END_OF_TURN_ORDER = [
  END_OF_TURN.weatherDamage,
  END_OF_TURN.futureAttack,
  END_OF_TURN.wish,
  END_OF_TURN.weatherHealing,
  ABILITIES.shedSkin,
  VOLATILES.leechSeed,
  ITEMS.leftovers,
  ITEMS.blackSludge,
  VOLATILES.aquaRing,
  VOLATILES.ingrain,
  ABILITIES.poisonHeal,
  END_OF_TURN.statusDamage,
  VOLATILES.nightmare,
  VOLATILES.curse,
  ABILITIES.badDreams,
  MOVES.bind,
  END_OF_TURN.yawnCountdown,
  END_OF_TURN.encoreCountdown,
  END_OF_TURN.tauntCountdown,
  END_OF_TURN.disableCountdown,
  END_OF_TURN.healBlockCountdown,
  END_OF_TURN.embargoCountdown,
  END_OF_TURN.magnetRiseCountdown,
  MOVES.perishSong,
  END_OF_TURN.screenCountdown,
  END_OF_TURN.safeguardCountdown,
  END_OF_TURN.tailwindCountdown,
  END_OF_TURN.trickRoomCountdown,
  END_OF_TURN.gravityCountdown,
  END_OF_TURN.weatherCountdown,
  END_OF_TURN.toxicOrbActivation,
  END_OF_TURN.flameOrbActivation,
  END_OF_TURN.slowStartCountdown,
  ABILITIES.speedBoost,
  END_OF_TURN.healingItems,
] as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(DATA_MANAGER);
}

/** Minimal PokemonInstance for mechanic tests. */
function createSyntheticPokemonInstance(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  return {
    uid: "test",
    speciesId: SPECIES.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: maxHp,
    moves: [],
    ability: ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: overrides.status ?? null,
    friendship: createFriendship(0),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed,
    },
  } as PokemonInstance;
}

/** Minimal ActivePokemon for mechanic tests. */
function createOnFieldPokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
}): ActivePokemon {
  return {
    pokemon: createSyntheticPokemonInstance(overrides),
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: overrides.types ?? [TYPES.normal],
    ability: ABILITIES.none,
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

/** Minimal BattleState stub — enough for applyStatusDamage and resolveTurnOrder. */
const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

describe("Gen4Ruleset identity", () => {
  it("given Gen4Ruleset, when accessing generation, then returns 4", () => {
    // Source: Gen 4 = Diamond / Pearl / Platinum / HeartGold / SoulSilver
    const ruleset = makeRuleset();
    expect(ruleset.generation).toBe(4);
  });

  it("given Gen4Ruleset, when accessing name, then contains 'Gen 4'", () => {
    // Source: naming convention for the library
    const ruleset = makeRuleset();
    expect(ruleset.name).toBe("Gen 4 (Diamond/Pearl/Platinum)");
  });
});

// ---------------------------------------------------------------------------
// Available types
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getAvailableTypes", () => {
  it("given Gen4Ruleset, when getAvailableTypes, then returns the canonical Gen 4 type list", () => {
    // Source: Gen4Ruleset.getAvailableTypes delegates to GEN4_TYPES
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes()).toEqual(GEN4_TYPES);
  });

  it("given Gen4Ruleset, when getAvailableTypes, then Fairy is not present", () => {
    // Source: Fairy type introduced in Gen 6 (X/Y), not present in Gen 4
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes()).not.toContain(TYPES.fairy);
  });
});

// ---------------------------------------------------------------------------
// Available hazards
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getAvailableHazards", () => {
  it("given Gen4Ruleset, when getAvailableHazards, then returns the canonical Gen 4 hazard set", () => {
    // Source: Gen4Ruleset.getAvailableHazards returns [stealth-rock, spikes, toxic-spikes]
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).toEqual(EXPECTED_HAZARDS);
  });

  it("given Gen4Ruleset, when getAvailableHazards, then does NOT include sticky-web", () => {
    // Source: Sticky Web was introduced in Gen 6, not available in Gen 4
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).not.toContain(HAZARDS.stickyWeb);
  });
});

// ---------------------------------------------------------------------------
// Sleep turns (1-4 effective turns in Gen 4)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollSleepTurns", () => {
  it("given rollSleepTurns with seed 42, when called, then returns a value in range [1, 4]", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts line 32 —
    //   this.effectState.time = this.random(2, 6); // counter 2-5
    //   Effective sleep turns = counter - 1 = 1-4 turns
    const ruleset = makeRuleset();
    const rng = new SeededRandom(42);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(4);
  });

  it("given rollSleepTurns called 1000 times, then always returns 1-4 and never 0 or 5+", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts — counter is random(2,6)
    //   giving 2-5 inclusive; effective sleep turns are 1-4.
    // Triangulation: 1000 iterations across different seeds exhausts the rng distribution
    const ruleset = makeRuleset();
    const observed = new Set<number>();

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const turns = ruleset.rollSleepTurns(rng);
      observed.add(turns);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(4);
    }

    expect([...observed].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// Burn damage (1/8 maxHP in Gen 3-6; Gen 7+ changed to 1/16)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyStatusDamage — burn", () => {
  it("given a Pokemon with 160 maxHP and burn status, when applyStatusDamage, then returns 20", () => {
    // Source: pret/pokeplatinum — burn tick = maxHP / 8
    // Source: specs/battle/05-gen4.md — "Burn damage is 1/8 max HP"
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 160, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(mon, STATUSES.burn, STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP and burn status, when applyStatusDamage, then returns 25", () => {
    // Source: pret/pokeplatinum — burn tick = floor(maxHP / 8)
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 200, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(mon, STATUSES.burn, STUB_STATE)).toBe(25);
  });

  it("given a Pokemon with 1 maxHP and burn status, when applyStatusDamage, then returns 1 (minimum)", () => {
    // Source: pret/pokeplatinum — damage always >= 1
    // Derivation: floor(1 / 8) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 1, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(mon, STATUSES.burn, STUB_STATE)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Poison damage (delegates to BaseRuleset: 1/8 maxHP)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyStatusDamage — poison", () => {
  it("given a Pokemon with 160 maxHP and poison status, when applyStatusDamage, then returns 20", () => {
    // Source: BaseRuleset — poison tick = floor(maxHP / 8) (same in Gen 3-6)
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 160, status: STATUSES.poison });
    expect(ruleset.applyStatusDamage(mon, STATUSES.poison, STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP and poison status, when applyStatusDamage, then returns 25", () => {
    // Source: BaseRuleset — poison tick = floor(maxHP / 8)
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 200, status: STATUSES.poison });
    expect(ruleset.applyStatusDamage(mon, STATUSES.poison, STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Multi-hit count (Gen 1-4 weighted distribution)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollMultiHitCount", () => {
  it("given rollMultiHitCount called 1000 times, then always returns 2, 3, 4, or 5", () => {
    // Source: pret/pokeplatinum — multi-hit uses same 8-entry lookup table as Gen 1-3
    // Distribution: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%)
    // Source: packages/core/src/logic/gen12-shared.ts gen1to4MultiHitRoll
    const ruleset = makeRuleset();
    const attacker = createOnFieldPokemon({});

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const count = ruleset.rollMultiHitCount(attacker, rng);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it("given rollMultiHitCount called 1000 times, then never returns 1 or 6+", () => {
    // Source: pret/pokeplatinum — gen1to4MultiHitRoll only produces 2, 3, 4, or 5
    const ruleset = makeRuleset();
    const attacker = createOnFieldPokemon({});

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const count = ruleset.rollMultiHitCount(attacker, rng);
      expect(count).not.toBe(1);
      expect(count).not.toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Bind damage (1/16 maxHP in Gen 2-4; Gen 5+ uses 1/8)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset calculateBindDamage", () => {
  it("given a Pokemon with 200 maxHP, when calculateBindDamage, then returns 12", () => {
    // Source: Bulbapedia — Binding move damage is 1/16 in Gen 2-4
    // Source: pret/pokeplatinum — trap damage = maxHP / 16
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 200 });
    expect(ruleset.calculateBindDamage(mon)).toBe(12);
  });

  it("given a Pokemon with 160 maxHP, when calculateBindDamage, then returns 10", () => {
    // Source: pret/pokeplatinum — trap damage = maxHP / 16
    // Derivation: floor(160 / 16) = 10
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 160 });
    expect(ruleset.calculateBindDamage(mon)).toBe(10);
  });

  it("given a Pokemon with 1 maxHP (Shedinja), when calculateBindDamage, then returns 1 (minimum)", () => {
    // Source: pret/pokeplatinum — damage always >= 1
    // Derivation: floor(1 / 16) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = createOnFieldPokemon({ maxHp: 1 });
    expect(ruleset.calculateBindDamage(mon)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Protect success rate
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollProtectSuccess", () => {
  it("given consecutiveProtects=0, when rollProtectSuccess, then always returns true", () => {
    // Source: pret/pokeplatinum battle_script.c:5351-5356 — sProtectSuccessRate[0] = 0xFFFF (100%)
    // First Protect always succeeds; no RNG roll needed
    const ruleset = makeRuleset();
    const rng = new SeededRandom(42);
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given consecutiveProtects=0 called 20 times, when rollProtectSuccess, then always returns true", () => {
    // Source: pret/pokeplatinum — 0 consecutive uses = guaranteed success (100%)
    // Triangulation: verify across multiple seeds
    const ruleset = makeRuleset();
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeededRandom(seed);
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given consecutiveProtects=3, when rollProtectSuccess with 10000 trials, then success rate is ~12.5%", () => {
    // Source: pret/pokeplatinum battle_script.c:5351-5356 — sProtectSuccessRate caps at index 3
    // sProtectSuccessRate = [0xFFFF, 0x7FFF, 0x3FFF, 0x1FFF]; index 3 (line 5405) = 12.5%
    // After 3+ consecutive uses, rate is fixed at 1/8 = 12.5%
    const ruleset = makeRuleset();
    let successes = 0;
    const trials = 10000;

    for (let seed = 1; seed <= trials; seed++) {
      const rng = new SeededRandom(seed);
      if (ruleset.rollProtectSuccess(3, rng)) {
        successes++;
      }
    }

    const rate = successes / trials;
    // Expected: 12.5% ± 2% tolerance for statistical variation
    expect(rate).toBeGreaterThan(0.105);
    expect(rate).toBeLessThan(0.145);
  });

  it("given consecutiveProtects=4 (beyond cap), when rollProtectSuccess, then capped same as 3 consecutive", () => {
    // Source: pret/pokeplatinum — counter caps at index 3 (min 12.5%); never reaches 1/256
    // Verify that 4+ consecutive uses does NOT further reduce the rate below 12.5%
    const ruleset = makeRuleset();
    let successes3 = 0;
    let successes4 = 0;
    const trials = 500;

    // Use same seeds for both to compare identically
    for (let seed = 1; seed <= trials; seed++) {
      const rng3 = new SeededRandom(seed);
      const rng4 = new SeededRandom(seed);
      if (ruleset.rollProtectSuccess(3, rng3)) successes3++;
      if (ruleset.rollProtectSuccess(4, rng4)) successes4++;
    }

    // Both should produce the same result (cap at 3)
    expect(successes3).toBe(successes4);
  });
});

// ---------------------------------------------------------------------------
// Paralysis speed penalty (0.25x in Gen 3-6; Gen 7+ uses 0.5x)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getEffectiveSpeed (via resolveTurnOrder)", () => {
  /**
   * Build a minimal BattleState with two sides for turn order tests.
   */
  function buildTwoSideState(
    side0Pokemon: ActivePokemon,
    side1Pokemon: ActivePokemon,
  ): BattleState {
    const createBattleSide = (index: 0 | 1, active: ActivePokemon) => ({
      index,
      trainer: null,
      team: [],
      active: [active],
      hazards: [],
      screens: [],
      tailwind: { active: false, turnsLeft: 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    });

    return {
      phase: "action-select",
      generation: 4,
      format: "singles",
      turnNumber: 1,
      sides: [createBattleSide(0, side0Pokemon), createBattleSide(1, side1Pokemon)],
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

  it("given paralyzed Pokemon (100 speed) vs healthy Pokemon (50 speed), when turn order is resolved, then healthy moves first", () => {
    // Source: pret/pokeplatinum — paralyzed speed = floor(speed / 4) in Gen 3-6
    // Gen 7+ changed the penalty to 0.5x (BaseRuleset default)
    // Derivation: paralyzed effective speed = floor(100 * 0.25) = 25; healthy = 50
    // Result: healthy (50) > paralyzed (25), so healthy moves first
    const paralyzedMon = createOnFieldPokemon({ speed: 100, status: STATUSES.paralysis });
    const healthyMon = createOnFieldPokemon({ speed: 50, status: null });

    paralyzedMon.pokemon.moves.push(createMoveSlot(TACKLE.id, TACKLE.pp));
    healthyMon.pokemon.moves.push(createMoveSlot(TACKLE.id, TACKLE.pp));

    const state = buildTwoSideState(paralyzedMon, healthyMon);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 1 (healthy, 50 speed) should move before side 0 (paralyzed, 25 eff. speed)
    expect(ordered[0]).toEqual(actions[1]); // healthy moves first
    expect(ordered[1]).toEqual(actions[0]); // paralyzed moves second
  });

  it("given paralyzed Pokemon (100 speed) vs slow healthy Pokemon (20 speed), when turn order is resolved, then paralyzed moves first", () => {
    // Source: pret/pokeplatinum — paralyzed speed = floor(speed / 4) = floor(100 * 0.25) = 25
    // Derivation: paralyzed effective speed = 25; healthy slow mon = 20
    // Result: paralyzed (25) > slow healthy (20), so paralyzed moves first
    const paralyzedMon = createOnFieldPokemon({ speed: 100, status: STATUSES.paralysis });
    const slowMon = createOnFieldPokemon({ speed: 20, status: null });

    paralyzedMon.pokemon.moves.push(createMoveSlot(TACKLE.id, TACKLE.pp));
    slowMon.pokemon.moves.push(createMoveSlot(TACKLE.id, TACKLE.pp));

    const state = buildTwoSideState(paralyzedMon, slowMon);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 0 (paralyzed, 25 eff. speed) should move before side 1 (healthy slow, 20 speed)
    expect(ordered[0]).toEqual(actions[0]); // paralyzed moves first (still faster)
    expect(ordered[1]).toEqual(actions[1]); // slow mon moves second
  });
});

// ---------------------------------------------------------------------------
// EXP gain (classic formula: Gen 3-4)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset calculateExpGain", () => {
  it("given a wild level 50 Pokemon with Abra stats, when calculateExpGain, then returns classic formula result", () => {
    // Source: pret/pokeplatinum — same classic EXP formula as Gen 3 (no level scaling)
    // Classic formula: floor((b * L_d / 7) * (1 / s) * t)
    // Abra base EXP = 62 (verified via gen4 DataManager)
    // Wild: t = 1.0; s (participants) = 1
    // Result: floor((62 * 50 / 7) / 1 * 1.0) = floor(442.857...) = 442
    const ruleset = makeRuleset();
    const abra = DATA_MANAGER.getSpecies(SPECIES.abra);
    const result = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });
    // Derivation: floor(62 * 50 / 7 / 1 * 1.0) = floor(442.857) = 442
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 2439-2461
    expect(result).toBe(442);
  });

  it("given a trainer battle level 30 Bulbasaur, when calculateExpGain, then trainer result exceeds wild result", () => {
    // Source: pret/pokeplatinum — trainer battles give 1.5x EXP (same as Gen 3)
    // Classic formula with t=1.5 for trainer battles vs t=1.0 for wild
    const ruleset = makeRuleset();
    const bulbasaur = DATA_MANAGER.getSpecies(SPECIES.bulbasaur);

    const wildResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });
    const trainerResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: true,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    // Trainer battle gives more EXP than wild battle
    expect(trainerResult).toBeGreaterThan(wildResult);
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9960-9988
    // Derivation: floor(64 * 30 / 7 / 1 * 1.5) = floor(274.285 * 1.5) = floor(411.428) = 411
    // Bulbasaur baseExp=64, verified from packages/gen4/data/pokemon.json
    expect(trainerResult).toBe(411);
  });
});

// ---------------------------------------------------------------------------
// hasHeldItems
// ---------------------------------------------------------------------------

describe("Gen4Ruleset hasHeldItems", () => {
  it("given Gen4Ruleset, when hasHeldItems, then returns true", () => {
    // Source: Gen 4 has full held item support (items modernized in Gen 3)
    const ruleset = makeRuleset();
    expect(ruleset.hasHeldItems()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEndOfTurnOrder
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getEndOfTurnOrder", () => {
  it("given Gen4Ruleset, when getEndOfTurnOrder, then returns array starting with weather-damage", () => {
    // Source: Showdown sim/battle.ts Gen 4 mod — weather chip is first EoT effect
    // Source: Bulbapedia — Diamond/Pearl/Platinum EoT order: weather damage is first
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe(END_OF_TURN.weatherDamage);
  });

  it("given Gen4Ruleset, when getEndOfTurnOrder, then returns all 35 Gen 4 EoT effects in correct order", () => {
    // Source: Showdown sim/battle.ts Gen 4 mod — full EoT ordering
    // Source: Bulbapedia — Diamond/Pearl/Platinum end-of-turn processing order
    // Key Gen 4 ordering: weather-damage first, toxic/flame orb after weather-countdown,
    // speed-boost and healing-items at end
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toEqual(EXPECTED_END_OF_TURN_ORDER);
  });

  it("given Gen4Ruleset, when getEndOfTurnOrder, then poison-heal comes before status-damage", () => {
    // Source: Showdown Gen 4 mod — Poison Heal replaces poison tick (must process first)
    // Source: Bulbapedia — Poison Heal activates instead of taking poison damage
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    const poisonHealIndex = order.indexOf(ABILITIES.poisonHeal);
    const statusDamageIndex = order.indexOf(END_OF_TURN.statusDamage);
    expect(poisonHealIndex).toBeLessThan(statusDamageIndex);
  });
});

// ---------------------------------------------------------------------------
// applyHeldItem delegation
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyHeldItem", () => {
  it("given Gen4Ruleset with Leftovers context, when applyHeldItem called for end-of-turn, then delegates to Gen4Items", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals 1/16 max HP at end of turn
    // This tests that the Gen4Ruleset.applyHeldItem method correctly delegates
    const ruleset = makeRuleset();
    const pokemon = createSyntheticPokemonInstance({ maxHp: 160, speed: 100 });
    pokemon.heldItem = ITEMS.leftovers;
    pokemon.currentHp = 100;
    const active = createOnFieldPokemon({ maxHp: 160, speed: 100 });
    active.pokemon = pokemon;

    const ctx = {
      pokemon: active,
      state: {} as BattleState,
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
      damage: undefined,
    } as unknown as import("@pokemon-lib-ts/battle").ItemContext;

    const result = ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.endOfTurn, ctx);
    // Leftovers heals 1/16 max HP = floor(160/16) = 10
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });
});
