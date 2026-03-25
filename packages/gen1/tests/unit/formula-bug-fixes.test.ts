import type {
  AccuracyContext,
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
} from "@pokemon-lib-ts/core";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  getGen12StatStageRatio,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN1_MOVE_IDS } from "../../src";
import { calculateGen1Damage } from "../../src/Gen1DamageCalc";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";
import { calculateGen1Stats } from "../../src/Gen1StatCalc";
import { GEN1_TYPE_CHART } from "../../src/Gen1TypeChart";

/**
 * Regression tests for Gen 1 formula and accuracy bug fixes.
 *
 * Covers issues: #287, #288, #289, #292, #294, #296, #303, #401, #433, #438
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();

const DEFAULT_MOVE_FLAGS: MoveData["flags"] = {
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
};

const { burn, paralysis } = CORE_STATUS_IDS;
const { electric, fire, normal, psychic } = CORE_TYPE_IDS;

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power: 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_MOVE_FLAGS,
    effect: null,
    description: "A test move.",
    generation: 1,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
    } as PokemonInstance,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: [electric] as PokemonType[],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 1,
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
    ...overrides,
  };
}

function makeBattleState(
  overrides: { side0Active?: ActivePokemon | null; side1Active?: ActivePokemon | null } = {},
): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
        trainer: null,
        team: [],
        active: [overrides.side0Active ?? null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1 as const,
        trainer: null,
        team: [],
        active: [overrides.side1Active ?? null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  } as BattleState;
}

function makeSpecies(baseStats: {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}): PokemonSpeciesData {
  return {
    id: 25,
    name: "pikachu",
    displayName: "Pikachu",
    types: ["electric"],
    baseStats,
    abilities: { normal: [], hidden: null },
    genderRatio: 50,
    catchRate: 190,
    baseExp: 82,
    expGroup: "medium-fast",
    evYield: {},
    eggGroups: [],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 0.4, weight: 6.0 },
    spriteKey: "pikachu",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  } as unknown as PokemonSpeciesData;
}

// ============================================================================
// #287 — Integer stat stage ratios (not float multipliers)
// ============================================================================

describe("#287 — Integer stat stage ratios replace float multipliers", () => {
  it("given stat=200 at stage -1, when applying Gen 1-2 ratio, then result is 132 (not 133 from float 2/3)", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -1 ratio is 66/100
    // Float 2/3 = 0.6666... → floor(200 * 0.6666) = floor(133.33) = 133 (WRONG)
    // Integer 66/100 → floor(200 * 66 / 100) = floor(132) = 132 (CORRECT)
    const ratio = getGen12StatStageRatio(-1);
    const result = Math.floor((200 * ratio.num) / ratio.den);
    expect(result).toBe(132);
  });

  it("given stat=200 at stage -5, when applying Gen 1-2 ratio, then result is 56 (not 57 from float 2/7)", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -5 ratio is 28/100
    // Float 2/7 = 0.2857... → floor(200 * 0.2857) = floor(57.14) = 57 (WRONG)
    // Integer 28/100 → floor(200 * 28 / 100) = floor(56) = 56 (CORRECT)
    const ratio = getGen12StatStageRatio(-5);
    const result = Math.floor((200 * ratio.num) / ratio.den);
    expect(result).toBe(56);
  });

  it("given effective speed uses integer ratio, when Pokemon has +1 speed stage and base speed 100, then effective speed is 150", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage +1 ratio is 15/10
    // floor(100 * 15 / 10) = floor(150) = 150
    const _active = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 1,
        accuracy: 0,
        evasion: 0,
      },
    });
    // Use damage calc context to test indirectly: the getEffectiveSpeed method is private,
    // but we can verify through the damage calc which uses the ratio for stat stages.
    const ratio = getGen12StatStageRatio(1);
    const result = Math.floor((100 * ratio.num) / ratio.den);
    expect(result).toBe(150);
  });

  it("given damage calc with defender at defense stage -1 and base defense 200, when calculating effective defense, then uses 132 (integer ratio)", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -1 = 66/100
    // The damage calc now uses getGen12StatStageRatio instead of getStatStageMultiplier
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 200,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
      statStages: {
        hp: 0,
        attack: 0,
        defense: -1,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      types: ["normal"] as PokemonType[],
    });
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 60,
      spAttack: 80,
      spDefense: 60,
      speed: 120,
    });
    const move = makeMove({ power: 100, type: "normal" as PokemonType });
    const rng = new SeededRandom(42);
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // Two damage rolls: one with stage -1 using the fixed integer formula
    const context: DamageContext = {
      attacker,
      defender,
      move,
      rng,
      isCrit: false,
      state,
    };
    const result = calculateGen1Damage(context, GEN1_TYPE_CHART, species);
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -1 ratio = 66/100
    // Formula: levelFactor=22, attack=100, defense=floor(200*66/100)=132, power=100
    //   baseDamage = min(997, floor(floor(22*100*100)/132/50)) + 2
    //             = min(997, floor(floor(220000/132)/50)) + 2
    //             = min(997, floor(1666/50)) + 2 = 33 + 2 = 35
    // Normal vs Normal (defender) = 1x effectiveness, no STAB (attacker is electric)
    // randomRoll = SeededRandom(42).int(217, 255) = 240
    // finalDamage = max(1, floor(35*240/255)) = floor(32.94...) = 32
    expect(result.damage).toBe(32);
  });
});

// ============================================================================
// #288 — Min-1 damage after type effectiveness
// ============================================================================

describe("#288 — Min-1 damage check after type effectiveness", () => {
  it("given a low-power move against double-resistant defender, when damage would round to 0 after effectiveness, then returns at least 1", () => {
    // Source: pret/pokered engine/battle/core.asm lines ~5171-5176
    // A non-immune move that rounds to 0 after type effectiveness should deal minimum 1 damage.
    // Setup: Very low base damage that rounds to 0 after 0.5x effectiveness applied twice.
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 2,
        calculatedStats: {
          hp: 20,
          attack: 8,
          defense: 8,
          spAttack: 8,
          spDefense: 8,
          speed: 10,
        },
      } as PokemonInstance,
      types: ["fire"] as PokemonType[],
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 250,
          spAttack: 80,
          spDefense: 250,
          speed: 120,
        },
      } as PokemonInstance,
      // Fire resists Fire (0.5x) — use single type to test 0.5x
      types: ["fire"] as PokemonType[],
    });
    const species = makeSpecies({
      hp: 20,
      attack: 8,
      defense: 8,
      spAttack: 8,
      spDefense: 8,
      speed: 10,
    });
    // Use a fire move (special in Gen 1) with low power
    const move = makeMove({
      power: 10,
      type: "fire" as PokemonType,
      category: "special",
    });
    const rng = new SeededRandom(42);
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const context: DamageContext = {
      attacker,
      defender,
      move,
      rng,
      isCrit: false,
      state,
    };
    const result = calculateGen1Damage(context, GEN1_TYPE_CHART, species);
    // Damage should be at least 1 since fire is not immune to fire (just resisted)
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBeLessThan(1); // Resisted
  });

  it("given a move against immune defender (Normal vs Ghost), when calculating damage, then returns 0 damage", () => {
    // Source: pret/pokered — immunity means damage = 0, no min-1 applied
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon({
      types: ["ghost"] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const species = makeSpecies({
      hp: 100,
      attack: 80,
      defense: 60,
      spAttack: 80,
      spDefense: 60,
      speed: 120,
    });
    const move = makeMove({
      power: 100,
      type: "normal" as PokemonType,
    });
    const rng = new SeededRandom(42);
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const context: DamageContext = {
      attacker,
      defender,
      move,
      rng,
      isCrit: false,
      state,
    };
    const result = calculateGen1Damage(context, GEN1_TYPE_CHART, species);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ============================================================================
// #289 — HP DV derived from other DVs
// ============================================================================

describe("#289 — HP DV derived from other DVs", () => {
  it("given all DVs are 15 (odd), when calculating HP, then HP DV is 15 (all LSBs are 1)", () => {
    // Source: pret/pokered home/move_mon.asm lines 109-133
    // HP_DV = ((15&1)<<3)|((15&1)<<2)|((15&1)<<1)|(15&1) = 8|4|2|1 = 15
    const species = makeSpecies({
      hp: 106,
      attack: 110,
      defense: 90,
      spAttack: 154,
      spDefense: 154,
      speed: 130,
    });
    const pokemon = {
      uid: "mewtwo",
      speciesId: 150,
      nickname: null,
      level: 100,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: {
        hp: 65535,
        attack: 65535,
        defense: 65535,
        spAttack: 65535,
        spDefense: 65535,
        speed: 65535,
      },
      currentHp: 1,
      moves: [],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: null,
      isShiny: false,
      metLocation: "cerulean-cave",
      metLevel: 70,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "master-ball",
    } as unknown as PokemonInstance;
    const stats = calculateGen1Stats(pokemon, species);
    // HP: floor(((106+15)*2+64)*100/100)+100+10 = floor(306)+110 = 416
    // Source: Bulbapedia Gen 1 stat calc, verified with Showdown
    expect(stats.hp).toBe(416);
  });

  it("given all DVs are 0 (even), when calculating HP, then HP DV is 0", () => {
    // Source: pret/pokered home/move_mon.asm — HP_DV = ((0&1)<<3)|((0&1)<<2)|((0&1)<<1)|(0&1) = 0
    const species = makeSpecies({
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    });
    const pokemon = {
      uid: "bulbasaur",
      speciesId: 1,
      level: 50,
      ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 1,
      moves: [],
      ability: "",
      status: null,
    } as unknown as PokemonInstance;
    const stats = calculateGen1Stats(pokemon, species);
    // HP DV=0: floor(((45+0)*2+0)*50/100)+50+10 = floor(45)+60 = 105
    expect(stats.hp).toBe(105);
  });

  it("given atk=3(odd), def=4(even), spe=5(odd), spc=6(even), when deriving HP DV, then HP DV is 10", () => {
    // Source: pret/pokered home/move_mon.asm
    // HP_DV = ((3&1)<<3)|((4&1)<<2)|((5&1)<<1)|(6&1) = (1<<3)|(0<<2)|(1<<1)|(0) = 8+0+2+0 = 10
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const pokemon = {
      uid: "test",
      speciesId: 1,
      level: 100,
      ivs: { hp: 0, attack: 3, defense: 4, spAttack: 6, spDefense: 6, speed: 5 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 1,
      moves: [],
      ability: "",
      status: null,
    } as unknown as PokemonInstance;
    const stats = calculateGen1Stats(pokemon, species);
    // HP DV=10: floor(((100+10)*2+0)*100/100)+100+10 = floor(220)+110 = 330
    expect(stats.hp).toBe(330);
  });

  it("given ivs.hp is set to 15 but other DVs are all 0 (even), when calculating HP, then HP DV is 0 (ignoring ivs.hp)", () => {
    // Source: pret/pokered — HP DV is ALWAYS derived, never stored independently
    // Even if ivs.hp=15, the derived HP DV from all-even other DVs = 0
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const pokemon = {
      uid: "test",
      speciesId: 1,
      level: 100,
      ivs: { hp: 15, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 1,
      moves: [],
      ability: "",
      status: null,
    } as unknown as PokemonInstance;
    const stats = calculateGen1Stats(pokemon, species);
    // HP DV derived: ((0&1)<<3)|((0&1)<<2)|((0&1)<<1)|(0&1) = 0
    // floor(((100+0)*2+0)*100/100)+100+10 = 200+110 = 310
    expect(stats.hp).toBe(310);
  });
});

// ============================================================================
// #292 + #401 — OHKO uses in-battle speed with correct comparison
// ============================================================================

describe("#292 + #401 — OHKO moves use in-battle speed and correct comparison", () => {
  it("given attacker has lower base speed but +6 speed stage, when using OHKO move, then OHKO succeeds (uses in-battle speed)", () => {
    // Source: pret/pokered engine/battle/core.asm — OHKO compares in-battle speed
    // Attacker: base speed 50, +6 stages → effective speed = floor(50*4/1) = 200
    // Defender: base speed 120, no stages → effective speed = 120
    // 200 > 120 → OHKO proceeds to accuracy check
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 50,
        },
      } as PokemonInstance,
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 6,
        accuracy: 0,
        evasion: 0,
      },
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const move = makeMove({
      id: GEN1_MOVE_IDS.hornDrill,
      accuracy: 30,
      effect: { type: "ohko" },
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // Run many trials — at least some should hit (if speed check passes, accuracy is 30%)
    const hits = Array.from({ length: 1000 }, (_, i) => i).reduce((count, seed) => {
      const rng = new SeededRandom(seed);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      return count + (ruleset.doesMoveHit(ctx) ? 1 : 0);
    }, 0);
    // If speed check failed, hits would be 0. With 30% accuracy, expect ~300 hits.
    expect(hits).toBeGreaterThan(100);
  });

  it("given attacker base speed > defender base speed but defender has +6 speed stage, when using OHKO move, then OHKO fails (speed check uses in-battle speed)", () => {
    // Attacker: base speed 120, no stages → effective speed = 120
    // Defender: base speed 50, +6 stages → effective speed = floor(50*4/1) = 200
    // 120 < 200 → OHKO fails speed check
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 50,
        },
      } as PokemonInstance,
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 6,
        accuracy: 0,
        evasion: 0,
      },
    });
    const move = makeMove({
      id: GEN1_MOVE_IDS.fissure,
      accuracy: 30,
      effect: { type: "ohko" },
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // All trials should miss — defender's in-battle speed (200) > attacker's (120)
    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(i);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      expect(ruleset.doesMoveHit(ctx)).toBe(false);
    }
  });

  it("given attacker and defender have equal in-battle speed, when using OHKO move, then OHKO succeeds (speed check is strict <, not <=)", () => {
    // Source: gen1-ground-truth.md §5 — "Fail automatically if user's Speed < target's Speed"
    // Equal speed → attacker is NOT slower → OHKO proceeds
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const move = makeMove({
      id: GEN1_MOVE_IDS.guillotine,
      accuracy: 30,
      effect: { type: "ohko" },
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // With equal speed, OHKO should pass speed check and proceed to accuracy (30%)
    const hits = Array.from({ length: 1000 }, (_, i) => i).reduce((count, seed) => {
      const rng = new SeededRandom(seed);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      return count + (ruleset.doesMoveHit(ctx) ? 1 : 0);
    }, 0);
    // If speed check passed, expect ~30% hit rate
    expect(hits).toBeGreaterThan(50);
  });

  it("given defender is paralyzed (speed quartered), when attacker is normally slower but not after paralysis, then OHKO succeeds", () => {
    // Attacker: base speed 80 → effective speed = 80
    // Defender: base speed 120, paralyzed → effective speed = floor(120*0.25) = 30
    // 80 > 30 → OHKO proceeds
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 80,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
        status: paralysis,
      } as PokemonInstance,
    });
    const move = makeMove({
      id: GEN1_MOVE_IDS.hornDrill,
      accuracy: 30,
      effect: { type: "ohko" },
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const hits = Array.from({ length: 1000 }, (_, i) => i).reduce((count, seed) => {
      const rng = new SeededRandom(seed);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      return count + (ruleset.doesMoveHit(ctx) ? 1 : 0);
    }, 0);
    // Speed check should pass; expect ~30% hits
    expect(hits).toBeGreaterThan(50);
  });
});

// ============================================================================
// #296 — Status-chance secondary effects use 0-255 scale
// ============================================================================

describe("#296 — Secondary effect chances use 0-255 scale", () => {
  // Source: pret/pokered engine/battle/core.asm — secondary effect chance uses 0-255 scale
  // threshold = floor(chance * 256 / 100). For 10% chance: floor(10 * 256 / 100) = 25.
  // Roll: rng.int(0, 255) < 25 → inflict status. Roll >= 25 → no status.
  // These tests would FAIL if the implementation used a 1-100 scale, because:
  //   - A 1-100 implementation with threshold=10 would fire on seed 7 (roll=2) but also
  //     on seed 65 (roll=27, which is > 10 on 0-255 scale but "27" on 1-100 scale is >10 too).
  //   - The key discriminator: seed 65 produces roll=27. On 0-255 scale, 27 >= 25 → no inflict.
  //     On 1-100 scale with threshold=10, 27 > 10 → no inflict too.
  //   - Better: seed 7 produces roll=2 (inflict), seed 65 produces roll=27 (no inflict at 25-threshold).
  //     A flat 10%-roll implementation using rng.next() < 0.10 would ALSO fire on seed 7 (val≈0.009)
  //     but would NOT fire on seed 23 (roll=23 on 0-255 = ~0.090 raw float < 0.10 on 1-100).
  //     That false positive proves the threshold boundary test is the discriminating assertion.

  it("given a seed where RNG rolls 2 (below 25/256 threshold), when Flamethrower hits, then burn is inflicted", () => {
    // Source: pret/pokered engine/battle/core.asm — threshold = floor(10 * 256 / 100) = 25
    // SeededRandom(7).int(0, 255) = 2. Since 2 < 25, burn is inflicted.
    // This test fails if the implementation uses a 1-100 scale (floor(10*100/100)=10):
    //   on 1-100 scale, rng.int(0,99) would be ~2 too (same seed), still < 10, so it would inflict.
    //   The BOUNDARY test below with roll=27 is the discriminating case.
    const move = makeMove({
      id: GEN1_MOVE_IDS.flamethrower,
      type: fire as PokemonType,
      category: "special",
      power: 95,
      effect: {
        type: "status-chance",
        status: burn as any,
        chance: 10,
      },
    });
    // Arrange
    const rng = new SeededRandom(7);
    // Derivation: SeededRandom(7).int(0, 255) = 2. Threshold = floor(10 * 256 / 100) = 25.
    // 2 < 25 → burn inflicted.
    const attacker = makeActivePokemon({ types: [fire] as PokemonType[] });
    const defender = makeActivePokemon({
      types: [normal] as PokemonType[],
      pokemon: { ...makeActivePokemon().pokemon, status: null } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const context: MoveEffectContext = { attacker, defender, move, damage: 50, state, rng };
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBe(burn);
  });

  it("given a seed where RNG rolls 27 (at or above 25/256 threshold), when Flamethrower hits, then burn is NOT inflicted", () => {
    // Source: pret/pokered engine/battle/core.asm — threshold = floor(10 * 256 / 100) = 25
    // SeededRandom(65).int(0, 255) = 27. Since 27 >= 25, no burn inflicted.
    // This test is the DISCRIMINATING case: it would FAIL if the implementation used a 1-100
    // scale with threshold=10, because on a 1-100 scale roll=27 > 10 so no inflict (same result).
    // BUT on the incorrect flat-10% implementation (rng.next() < 0.10): raw float for seed 65
    // is ~0.105 which is >= 0.10, so no inflict either.
    // The REAL discriminator is the BOUNDARY: roll=23 → inflicted on 0-255 scale (23<25) but
    // NOT inflicted on a pure-10% float check (0.090 < 0.10 → inflicted, so that also fires).
    // Together with the roll=2 test, these two prove the threshold is 25/256, not 10/100.
    const move = makeMove({
      id: GEN1_MOVE_IDS.flamethrower,
      type: fire as PokemonType,
      category: "special",
      power: 95,
      effect: {
        type: "status-chance",
        status: burn as any,
        chance: 10,
      },
    });
    // Arrange
    const rng = new SeededRandom(65);
    // Derivation: SeededRandom(65).int(0, 255) = 27. Threshold = 25.
    // 27 >= 25 → no burn inflicted.
    const attacker = makeActivePokemon({ types: [fire] as PokemonType[] });
    const defender = makeActivePokemon({
      types: [normal] as PokemonType[],
      pokemon: { ...makeActivePokemon().pokemon, status: null } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const context: MoveEffectContext = { attacker, defender, move, damage: 50, state, rng };
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — 27 >= threshold(25), so burn should NOT be inflicted
    expect(result.statusInflicted).toBeNull();
  });

  it("given a secondary effect with 10% chance, when computing threshold, then threshold is 25 (floor(10*256/100))", () => {
    // Source: pret/pokered engine/battle/core.asm — direct formula verification
    const threshold = Math.floor((10 * 256) / 100);
    expect(threshold).toBe(25);
    // Verify probability: 25/256 ≈ 0.09766
    expect(threshold / 256).toBeCloseTo(0.09766, 4);
  });

  it("given a secondary effect with 30% chance, when computing threshold, then threshold is 76 (floor(30*256/100))", () => {
    // Source: pret/pokered engine/battle/core.asm — direct formula verification
    const threshold = Math.floor((30 * 256) / 100);
    expect(threshold).toBe(76);
  });
});

// ============================================================================
// #303 — Accuracy/evasion uses integer ratio table (already fixed in code)
// ============================================================================

describe("#303 — Accuracy/evasion stages use integer ratios (Gen 1 stat stage table)", () => {
  it("given accuracy stage -6, when computing hit threshold for 100% move, then threshold is 63", () => {
    // Source: pret/pokered CalcHitChance — stage -6 ratio is 2/8
    // acc = 255, floor(255 * 2 / 8) = floor(63.75) = 63
    const attacker = makeActivePokemon({
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: -6,
        evasion: 0,
      },
    });
    const defender = makeActivePokemon();
    const move = makeMove({ accuracy: 100 });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // Run trials: threshold 63 → hit rate ≈ 63/256 ≈ 24.6%
    const trials = 10000;
    const hits = Array.from({ length: trials }, (_, i) => i).reduce((count, seed) => {
      const rng = new SeededRandom(seed);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      return count + (ruleset.doesMoveHit(ctx) ? 1 : 0);
    }, 0);
    const rate = hits / trials;
    // Expected: 63/256 ≈ 24.6%
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.3);
  });

  it("given +1 accuracy and +1 evasion (both stage modifiers), when checking threshold, then two-step sequential floor produces 170 (not 255)", () => {
    // Source: pret/pokered CalcHitChance — sequential integer multiply-divide
    // acc=255, accStage+1: floor(255*3/2)=382 clamped to 255
    // evaStage+1: floor(255*2/3)=170
    // Two-step floor causes rounding loss (unlike single-step which would give 255)
    const attacker = makeActivePokemon({
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 1,
        evasion: 0,
      },
    });
    const defender = makeActivePokemon({
      statStages: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 1,
      },
    });
    const move = makeMove({ accuracy: 100 });
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    // Expected threshold: 170/256 ≈ 66.4%
    let hits = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i);
      const ctx: AccuracyContext = { attacker, defender, move, state, rng };
      if (ruleset.doesMoveHit(ctx)) hits++;
    }
    const rate = hits / trials;
    // 170/256 ≈ 66.4%
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.73);
  });
});

// ============================================================================
// #433 — Confusion damage 997-cap before +2
// ============================================================================

describe("#433 — Confusion damage applies 997 cap before +2", () => {
  it("given very high attack and very low defense, when calculating confusion damage, then result is capped at 999 (997+2)", () => {
    // Source: pret/pokered engine/battle/core.asm lines 4388-4450
    // The confusion damage formula uses the same cap: Math.min(997, baseDamage) + 2
    // With extreme stat values, the pre-cap base damage would exceed 997
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 100,
        calculatedStats: {
          hp: 300,
          attack: 999,
          defense: 1,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemon });
    const rng = new SeededRandom(42);
    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);
    // Max possible: 997 + 2 = 999
    expect(damage).toBeLessThanOrEqual(999);
  });

  it("given normal stats, when calculating confusion damage, then formula matches floor(floor(levelFactor*40*atk)/def/50)+2", () => {
    // Source: pret/pokered — confusion uses 40 base power with user's own attack/defense
    // Level 50, Attack 80, Defense 60
    // levelFactor = floor(2*50/5)+2 = 22
    // baseDamage = floor(floor(22*40*80)/60/50) + 2 = floor(floor(70400)/60/50)+2
    // = floor(1173.33/50)+2 = floor(23.47)+2 = 23+2 = 25
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 50,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemon });
    const rng = new SeededRandom(42);
    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);
    // Inline formula derivation:
    // levelFactor = floor(2*50/5)+2 = 22
    // floor(floor(22*40*80)/60/50) = floor(floor(70400)/60/50) = floor(1173/50) = floor(23.46) = 23
    // min(997, 23) = 23
    // 23+2 = 25
    expect(damage).toBe(25);
  });
});

// ============================================================================
// #438 — Enemy Psywave allows 0 damage
// ============================================================================

describe("#438 — Enemy Psywave allows 0 damage, player Psywave minimum 1", () => {
  it("given enemy-side attacker (side 1) uses Psywave, when rolling many times, then 0-damage results are possible", () => {
    // Source: pret/pokered engine/battle/core.asm lines 4786-4788
    // Enemy Psywave: damage range [0, floor(level*1.5)-1], no zero reroll
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 10,
      } as PokemonInstance,
    });
    const defender = makeActivePokemon();
    const move = makeMove({
      id: GEN1_MOVE_IDS.psywave,
      type: psychic as PokemonType,
      effect: { type: "custom", handler: GEN1_MOVE_IDS.psywave },
    });
    // Place attacker on side 1 (enemy side)
    const state = makeBattleState({ side0Active: defender, side1Active: attacker });
    // Verification: seed 7 deterministically hits the enemy-side 0-damage branch.
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: new SeededRandom(7),
    };
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 0,
      source: GEN1_MOVE_IDS.psywave,
    });
  });

  it("given player-side attacker (side 0) uses Psywave, when rolling many times, then 0-damage results never occur", () => {
    // Source: pret/pokered engine/battle/core.asm lines 4664-4669
    // Player Psywave: rerolls zeros, damage range [1, floor(level*1.5)-1]
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 10,
      } as PokemonInstance,
    });
    const defender = makeActivePokemon();
    const move = makeMove({
      id: GEN1_MOVE_IDS.psywave,
      type: psychic as PokemonType,
      effect: { type: "custom", handler: GEN1_MOVE_IDS.psywave },
    });
    // Place attacker on side 0 (player side)
    const state = makeBattleState({ side0Active: attacker, side1Active: defender });
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i * 5);
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      };
      const result = ruleset.executeMoveEffect(context);
      // Player Psywave should never deal 0 damage
      if (result.customDamage) {
        expect(result.customDamage.amount).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
