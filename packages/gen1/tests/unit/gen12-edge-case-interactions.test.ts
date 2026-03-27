/**
 * Gen 1 Edge Case and Interaction Regression Tests
 *
 * Covers:
 *   - Substitute: selective status interactions, multi-hit rules
 *   - Confusion self-hit: uses pokemon's own Defense stat (NOT opponent's)
 *   - Confusion self-hit + Substitute: confusionSelfHitTargetsOpponentSub() returns true
 *   - Counter: only Normal/Fighting, Ghost immunity
 *   - Disable: targets a random move, duration 1-8 turns
 *   - Rage: Attack +1 per hit, forced repeat
 *   - Transform: copies stats except HP, copies moves with 5 PP each
 *   - Mimic: replaces Mimic slot, 5 PP, invalidates certain sources
 *   - 1/256 miss bug: roll of 255 misses for a 100% accurate move
 *
 * Sources:
 *   - pret/pokered engine/battle/core.asm (primary authority)
 *   - pret/pokered engine/battle/effect_commands.asm
 *   - specs/reference/gen1-ground-truth.md
 *   - specs/battle/02-gen1.md
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_EFFECT_TYPES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS, Gen1Ruleset } from "../../src";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

const ruleset = new Gen1Ruleset();
const dataManager = createGen1DataManager();
const ABILITIES = CORE_ABILITY_IDS;
const MOVES = { ...CORE_MOVE_IDS, ...GEN1_MOVE_IDS };
const SPECIES = GEN1_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0]!;
const DEFAULT_SPECIES = dataManager.getSpecies(SPECIES.pikachu);
const TACKLE = dataManager.getMove(MOVES.tackle);
const THUNDERBOLT = dataManager.getMove(MOVES.thunderbolt);
const MIMIC = dataManager.getMove(MOVES.mimic);
const REST = dataManager.getMove(MOVES.rest);
const COUNTER = dataManager.getMove(MOVES.counter);
const DISABLE = dataManager.getMove(MOVES.disable);
const RAGE = dataManager.getMove(MOVES.rage);
const TRANSFORM = dataManager.getMove(MOVES.transform);
const FLAMETHROWER = dataManager.getMove(MOVES.flamethrower);
const FIRE_BLAST = dataManager.getMove(MOVES.fireBlast);
const EMBER = dataManager.getMove(MOVES.ember);
const SMOKESCREEN = dataManager.getMove(MOVES.smokescreen);
const METRONOME = dataManager.getMove(MOVES.metronome);
const BODY_SLAM = dataManager.getMove(MOVES.bodySlam);
const DEFAULT_MOVE_FLAGS: MoveData["flags"] = { ...TACKLE.flags };

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData> = {}): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
  };
}

function getCanonicalMove(moveId: (typeof GEN1_MOVE_IDS)[keyof typeof GEN1_MOVE_IDS]): MoveData {
  return dataManager.getMove(moveId);
}

function createSyntheticSelfTargetingAccuracyProbe(): MoveData {
  return createSyntheticMoveFrom(getCanonicalMove(MOVES.swordsDance), {
    // Synthetic probe: Gen 1 self-targeting moves generally have null accuracy.
    // This forces the 100%-accuracy 1/256 exemption path while retaining the
    // canonical Swords Dance payload for every other field.
    accuracy: 100,
  });
}

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const pokemon = createPokemonInstance(DEFAULT_SPECIES, 50, new SeededRandom(1), {
    nature: DEFAULT_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    moves: [],
    isShiny: false,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.moves = [
    createMoveSlot(TACKLE.id, TACKLE.pp),
    createMoveSlot(THUNDERBOLT.id, THUNDERBOLT.pp),
    createMoveSlot(MIMIC.id, MIMIC.pp),
    createMoveSlot(REST.id, REST.pp),
  ];
  pokemon.currentHp = 100;
  pokemon.ability = ABILITIES.none;
  pokemon.calculatedStats = {
    hp: 100,
    attack: 80,
    defense: 60,
    spAttack: 80,
    spDefense: 60,
    speed: 120,
  };
  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...DEFAULT_SPECIES.types] as PokemonType[],
    ability: ABILITIES.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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

function createBattleState(
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

function createMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: createSyntheticOnFieldPokemon(),
    defender: createSyntheticOnFieldPokemon({ types: [TYPES.normal] }),
    move: TACKLE,
    damage: 0,
    brokeSubstitute: false,
    state: createBattleState(),
    rng,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Substitute: selective status interactions
// ---------------------------------------------------------------------------

describe("Gen 1 Substitute: selective status interactions", () => {
  it("given defender has Substitute, when Sleep Powder resolves, then the ruleset still inflicts sleep", () => {
    // Source: gen1-ground-truth.md §7 — Substitute does NOT block sleep from status moves.
    const defenderWithSubstitute = createSyntheticOnFieldPokemon({
      substituteHp: 40,
      types: [TYPES.normal],
    });
    const context = createMoveEffectContext({
      move: getCanonicalMove(MOVES.sleepPowder),
      defender: defenderWithSubstitute,
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(STATUSES.sleep);
  });

  it("given defender has Substitute, when Thunder Wave resolves, then the ruleset still inflicts paralysis", () => {
    // Source: gen1-ground-truth.md §7 — Substitute does NOT block paralysis from status moves.
    const defenderWithSubstitute = createSyntheticOnFieldPokemon({
      substituteHp: 40,
      types: [TYPES.normal],
    });
    const context = createMoveEffectContext({
      move: getCanonicalMove(MOVES.thunderWave),
      defender: defenderWithSubstitute,
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(STATUSES.paralysis);
  });

  it("given defender has Substitute, when Smokescreen resolves, then foe-targeted stat drops are blocked", () => {
    // Source: gen1-ground-truth.md §7 — Substitute blocks most non-bypass status moves.
    const defenderWithSubstitute = createSyntheticOnFieldPokemon({
      substituteHp: 40,
      types: [TYPES.normal],
    });
    const context = createMoveEffectContext({
      move: getCanonicalMove(MOVES.smokescreen),
      defender: defenderWithSubstitute,
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([]);
  });

  it("given defender has Substitute, when Confuse Ray resolves, then confusion is blocked", () => {
    // Source: gen1-ground-truth.md §7 — Substitute blocks confusion from status moves.
    const defenderWithSubstitute = createSyntheticOnFieldPokemon({
      substituteHp: 40,
      types: [TYPES.normal],
    });
    const context = createMoveEffectContext({
      move: getCanonicalMove(MOVES.confuseRay),
      defender: defenderWithSubstitute,
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
  });

  it("given defender has Substitute with HP=40, when a damaging move's secondary status resolves, then statusInflicted is null", () => {
    // Source: gen1-ground-truth.md §7 — Substitute blocks secondary status effects from moves
    // that hit the substitute. Use a synthetic 100% status proc so the assertion is independent
    // of RNG and proves the substitute-blocking branch directly.
    const guaranteedParalysisProbe = createSyntheticMoveFrom(getCanonicalMove(MOVES.thunder), {
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statusChance,
        status: STATUSES.paralysis,
        chance: 100,
      },
    });
    const defenderWithSub = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      substituteHp: 40,
    });
    // When brokeSubstitute is true, engine already decided the hit went into the sub.
    // The ruleset's status-chance handler doesn't check substituteHp directly —
    // the engine passes brokeSubstitute in context. Simulate a hit that hit the sub.
    const context = createMoveEffectContext({
      move: guaranteedParalysisProbe,
      defender: defenderWithSub,
      damage: 40, // hit absorbed by sub
      brokeSubstitute: false, // sub still alive
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Substitute is active, when checking confusionSelfHitTargetsOpponentSub, then returns true (Gen 1 bug)", () => {
    // Source: pret/pokered engine/battle/core.asm — Gen 1 cartridge bug:
    // confusion self-hit damage is checked against the OPPONENT's Substitute,
    // not the confused Pokemon's own Substitute. This is confirmed in gen1-ground-truth.md §7.
    const result = ruleset.confusionSelfHitTargetsOpponentSub();
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Confusion self-hit uses pokemon's own Attack and Defense (not opponent's)
// ---------------------------------------------------------------------------

describe("Gen 1 Confusion self-hit damage formula", () => {
  // Source: pret/pokered engine/battle/core.asm lines 4388-4450 — confusion self-hit
  // uses the CONFUSED pokemon's own Attack and Defense stats (via wBattleMonAttack and
  // wBattleMonDefense), NOT the opponent's stats. The `_state` param is unused in
  // calculateConfusionDamage, confirming there is no cross-lookup to the opponent.
  //
  // Note: The task description mentions "opponent's Defense" as the bug, but that
  // description refers to the Showdown gen1 implementation. The cartridge (pret/pokered)
  // uses the confused pokemon's OWN defense. Our implementation correctly uses own stats.
  // See: Showdown gen1/conditions.ts:147-149, pokered source confirms same pokemon's stats.

  it("given a L50 pokemon with atk=80 def=60, when calculating confusion self-hit damage, then damage uses own Attack and Defense stats", () => {
    // Source: pret/pokered engine/battle/core.asm — own Attack and Defense
    // Formula: floor(floor(floor((2*L/5+2) * 40 * Atk) / Def) / 50) + 2
    // levelFactor = floor(2*50/5) + 2 = 20+2 = 22
    // inner = floor(22 * 40 * 80) = floor(70400) = 70400
    // mid = floor(70400 / 60) = floor(1173.33) = 1173
    // outer = floor(1173 / 50) = floor(23.46) = 23
    // damage = 23 + 2 = 25
    // Source derivation: manual application of formula from gen1-ground-truth.md §4
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        level: 50,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      },
    });
    const damage = ruleset.calculateConfusionDamage(
      pokemon,
      createBattleState(),
      new SeededRandom(1),
    );
    expect(damage).toBe(25);
  });

  it("given a L50 pokemon with atk=100 def=100, when calculating confusion self-hit damage, then result is deterministic and matches formula", () => {
    // Source: pret/pokered — formula derivation:
    // levelFactor = floor(2*50/5) + 2 = 22
    // inner = floor(22 * 40 * 100) = 88000
    // mid = floor(88000 / 100) = 880
    // outer = floor(880 / 50) = 17
    // damage = 17 + 2 = 19
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        level: 50,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      },
    });
    const damage = ruleset.calculateConfusionDamage(
      pokemon,
      createBattleState(),
      new SeededRandom(2),
    );
    expect(damage).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// Counter: Normal/Fighting type restriction
// ---------------------------------------------------------------------------

describe("Gen 1 Counter: type restrictions", () => {
  // Source: pret/pokered engine/battle/effect_commands.asm CounterEffect
  // Counter only works if the last move that hit the user was Normal or Fighting type.

  const counterMove = COUNTER;

  it("given a Ghost-type damaging move hit the user last turn, when Counter is used, then Counter fails", () => {
    // Source: pret/pokered — Counter checks lastDamageType for normal/fighting only.
    // Ghost-type moves are physical in Gen 1, but Counter still fails because
    // Counter only counters normal and fighting, not all physical types.
    const attacker = createSyntheticOnFieldPokemon({
      lastDamageTaken: 40,
      lastDamageType: TYPES.ghost as PokemonType,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    // Counter should fail — no customDamage set, failure message emitted
    expect(result.customDamage).toBeUndefined();
  });

  it("given a Psychic-type move hit the user last turn, when Counter is used, then Counter fails (special type)", () => {
    // Source: pret/pokered — Counter checks for Normal/Fighting specifically.
    // Psychic is a special type in Gen 1, so Counter must fail.
    const attacker = createSyntheticOnFieldPokemon({
      lastDamageTaken: 60,
      lastDamageType: TYPES.psychic as PokemonType,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage).toBeUndefined();
  });

  it("given a Rock-type physical move hit the user last turn, when Counter is used, then Counter fails", () => {
    // Source: pret/pokered — Rock is physical in Gen 1 but Counter only reflects
    // Normal and Fighting typed moves specifically.
    const attacker = createSyntheticOnFieldPokemon({
      lastDamageTaken: 50,
      lastDamageType: TYPES.rock as PokemonType,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage).toBeUndefined();
  });

  it("given a Normal-type move dealt 50 damage last turn, when Counter is used, then deals 100 damage", () => {
    // Source: pret/pokered CounterEffect — doubles the damage received.
    const attacker = createSyntheticOnFieldPokemon({
      lastDamageTaken: 50,
      lastDamageType: TYPES.normal as PokemonType,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage?.amount).toBe(100);
    expect(result.customDamage?.target).toBe("defender");
  });

  it("given a Fighting-type move dealt 30 damage last turn, when Counter is used, then deals 60 damage", () => {
    // Source: pret/pokered CounterEffect — 2x the last damage taken.
    const attacker = createSyntheticOnFieldPokemon({
      lastDamageTaken: 30,
      lastDamageType: TYPES.fighting as PokemonType,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage?.amount).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Disable: random move slot, duration 1-8 turns
// ---------------------------------------------------------------------------

describe("Gen 1 Disable mechanic", () => {
  // Source: pret/pokered DisableEffect — picks a RANDOM non-zero move slot
  // and disables it. Duration is 1-8 turns (and 7 + inc a = [1,8]).
  // Unlike Gen 2, Gen 1 Disable does NOT target the last-used move specifically;
  // it picks a random move from the available slots with PP > 0.

  const disableMove = DISABLE;

  it("given defender has valid moves with PP, when Disable is used, then a disable volatile is inflicted", () => {
    // Source: pret/pokered DisableEffect — sets SUBSTATUS_DISABLED on a random move slot.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
      },
    });
    const context = createMoveEffectContext({ attacker, defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBe(VOLATILES.disable);
  });

  it("given defender already has disable volatile, when Disable is used again, then it fails", () => {
    // Source: pret/pokered DisableEffect — fails if already disabled.
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    defender.volatileStatuses.set(VOLATILES.disable, { turnsLeft: 3, data: { moveId: TACKLE.id } });
    const context = createMoveEffectContext({ defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toEqual(["But it failed!"]);
  });

  it("given Disable duration is sampled 500 times, then all durations are in range [1, 8]", () => {
    // Source: pret/pokered DisableEffect — `and 7; inc a` = random(0-7)+1 = [1,8]
    const durations: number[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const defender = createSyntheticOnFieldPokemon({
        types: [TYPES.normal],
        pokemon: {
          ...createSyntheticOnFieldPokemon().pokemon,
          moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
        },
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        defender,
        move: disableMove,
        rng: new SeededRandom(seed),
      });
      const result = ruleset.executeMoveEffect(context);
      if (result.volatileData) {
        durations.push(result.volatileData.turnsLeft);
      }
    }
    expect([...new Set(durations)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("given Disable duration is sampled 500 times, then both minimum (1) and maximum (8) are observed", () => {
    // Triangulation: ensures the range is actually [1,8] not a subset like [2,7].
    const durations: number[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const defender = createSyntheticOnFieldPokemon({
        types: [TYPES.normal],
        pokemon: {
          ...createSyntheticOnFieldPokemon().pokemon,
          moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
        },
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        defender,
        move: disableMove,
        rng: new SeededRandom(seed),
      });
      const result = ruleset.executeMoveEffect(context);
      if (result.volatileData) {
        durations.push(result.volatileData.turnsLeft);
      }
    }
    expect(Math.min(...durations)).toBe(1);
    expect(Math.max(...durations)).toBe(8);
  });

  it("given defender has moves with 0 PP, when Disable is used, then it fails (no valid move to disable)", () => {
    // Source: pret/pokered DisableEffect — loops until finding a non-zero move slot.
    // If all moves have 0 PP, Disable fails.
    const depletedTackleSlot = createMoveSlot(TACKLE.id, TACKLE.pp);
    depletedTackleSlot.currentPP = 0;
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [depletedTackleSlot],
      },
    });
    const context = createMoveEffectContext({ defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rage: Attack rises +1 on each hit received
// ---------------------------------------------------------------------------

describe("Gen 1 Rage: Attack rises with each hit", () => {
  // Source: pret/pokered RageEffect — when in Rage and hit, Attack stage +1.
  // The boost happens via onDamageReceived hook on the raging pokemon.
  // Rage locks the user in via forcedMoveSet.

  const rageMove = RAGE;

  it("given pokemon is not in Rage, when Rage is first used, then rage volatile is set and user is locked in", () => {
    // Source: pret/pokered RageEffect — first activation sets SUBSTATUS_RAGE
    const attacker = createSyntheticOnFieldPokemon();
    const context = createMoveEffectContext({ attacker, move: rageMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.selfVolatileInflicted).toBe(VOLATILES.rage);
    expect(result.forcedMoveSet?.moveId).toBe(RAGE.id);
  });

  it("given pokemon is Raging, when it receives a hit, then Attack stage increases by 1", () => {
    // Source: pret/pokered RageEffect — onDamageReceived triggers +1 Attack per hit
    const raging = createSyntheticOnFieldPokemon();
    raging.volatileStatuses.set(VOLATILES.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    raging.statStages.attack = 0;

    // Simulate receiving 30 damage while raging
    const fakeMove = TACKLE;
    ruleset.onDamageReceived(raging, 30, fakeMove, createBattleState());

    expect(raging.statStages.attack).toBe(1);
  });

  it("given pokemon is Raging and already at +3 Attack, when hit twice more, then Attack reaches +5", () => {
    // Source: pret/pokered RageEffect — Attack accumulates up to +6 cap.
    const raging = createSyntheticOnFieldPokemon();
    raging.volatileStatuses.set(VOLATILES.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    raging.statStages.attack = 3;

    const fakeMove = TACKLE;
    ruleset.onDamageReceived(raging, 20, fakeMove, createBattleState());
    ruleset.onDamageReceived(raging, 20, fakeMove, createBattleState());

    expect(raging.statStages.attack).toBe(5);
  });

  it("given pokemon is Raging and at +6 Attack, when hit again, then Attack stays at +6 (cap)", () => {
    // Source: pret/pokered — stat stage cap is +6; Math.min(6, stage+1) enforces this.
    const raging = createSyntheticOnFieldPokemon();
    raging.volatileStatuses.set(VOLATILES.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    raging.statStages.attack = 6;

    const fakeMove = TACKLE;
    ruleset.onDamageReceived(raging, 20, fakeMove, createBattleState());

    expect(raging.statStages.attack).toBe(6);
  });

  it("given pokemon is NOT Raging, when it receives a hit, then Attack stage does not change", () => {
    // Source: pret/pokered RageEffect — boost only applies when rage volatile is active.
    const notRaging = createSyntheticOnFieldPokemon();
    notRaging.statStages.attack = 0;

    const fakeMove = TACKLE;
    ruleset.onDamageReceived(notRaging, 30, fakeMove, createBattleState());

    expect(notRaging.statStages.attack).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Transform: copies stats except HP, moves with 5 PP each
// ---------------------------------------------------------------------------

describe("Gen 1 Transform mechanic", () => {
  // Source: pret/pokered TransformEffect — copies types, stat stages, calculated stats
  // (all except HP), and moves with exactly 5 PP per slot.
  // Does NOT copy HP stat. User retains their own HP value.

  const transformMove = createSyntheticMoveFrom(getCanonicalMove(MOVES.transform), {
    flags: { ...DEFAULT_MOVE_FLAGS, bypassSubstitute: true },
  });

  it("given Transform targets a pokemon with high SpAttack (200), when Transform is used, then attacker's spAttack becomes 200", () => {
    // Source: pret/pokered TransformEffect — copies the target's in-battle calculated stats.
    // If defender has 200 spAttack (e.g., from high base stats or EVs), attacker gets 200.
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      },
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.psychic],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        calculatedStats: {
          hp: 150,
          attack: 120,
          defense: 90,
          spAttack: 200,
          spDefense: 200,
          speed: 80,
        },
      },
    });
    const context = createMoveEffectContext({ attacker, defender, move: transformMove });
    ruleset.executeMoveEffect(context);
    // After Transform, attacker's calculatedStats should reflect defender's (except HP)
    expect(attacker.pokemon.calculatedStats?.spAttack).toBe(200);
    expect(attacker.pokemon.calculatedStats?.attack).toBe(120);
    expect(attacker.pokemon.calculatedStats?.defense).toBe(90);
    expect(attacker.pokemon.calculatedStats?.speed).toBe(80);
  });

  it("given Transform, when used, then attacker's HP stat is NOT copied (retains own HP)", () => {
    // Source: pret/pokered TransformEffect — HP is explicitly excluded from the copy.
    // The attacker's currentHp and maxHP stat remain unchanged.
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 75,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      },
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.water],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 200,
        calculatedStats: {
          hp: 300,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      },
    });
    const context = createMoveEffectContext({ attacker, defender, move: transformMove });
    ruleset.executeMoveEffect(context);
    // HP stat does NOT change
    expect(attacker.pokemon.calculatedStats?.hp).toBe(100);
    expect(attacker.pokemon.currentHp).toBe(75);
  });

  it("given Transform targets a 4-move pokemon, when used, then attacker gets those 4 moves each with exactly 5 PP", () => {
    // Source: pret/pokered TransformEffect — transformed moves all receive exactly 5 PP.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.fire],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          createMoveSlot(FLAMETHROWER.id, FLAMETHROWER.pp),
          createMoveSlot(FIRE_BLAST.id, FIRE_BLAST.pp),
          createMoveSlot(EMBER.id, EMBER.pp),
          createMoveSlot(SMOKESCREEN.id, SMOKESCREEN.pp),
        ],
      },
    });
    const context = createMoveEffectContext({ attacker, defender, move: transformMove });
    ruleset.executeMoveEffect(context);
    // All copied moves have exactly 5 PP
    expect(attacker.pokemon.moves.length).toBe(4);
    for (const m of attacker.pokemon.moves) {
      expect(m.currentPP).toBe(5);
      expect(m.maxPP).toBe(5);
    }
    // Move IDs are copied
    const moveIds = attacker.pokemon.moves.map((m) => m.moveId);
    expect(moveIds).toContain(FLAMETHROWER.id);
    expect(moveIds).toContain(FIRE_BLAST.id);
  });

  it("given Transform, when used, then attacker's types change to match the defender's types", () => {
    // Source: pret/pokered TransformEffect — type change is applied.
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.electric] });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.water, TYPES.ice] });
    const context = createMoveEffectContext({ attacker, defender, move: transformMove });
    const result = ruleset.executeMoveEffect(context);
    // typeChange result signals the engine to update attacker's types
    expect(result.typeChange?.target).toBe("attacker");
    expect(result.typeChange?.types).toContain(TYPES.water);
    expect(result.typeChange?.types).toContain(TYPES.ice);
  });

  it("given Transform, when used, then attacker's stat stages are copied from the defender", () => {
    // Source: pret/pokered TransformEffect — stat stages are copied directly.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    defender.statStages.attack = 3;
    defender.statStages.defense = -1;
    defender.statStages.speed = 2;
    const context = createMoveEffectContext({ attacker, defender, move: transformMove });
    ruleset.executeMoveEffect(context);
    // After Transform, attacker gets defender's stat stages
    expect(attacker.statStages.attack).toBe(3);
    expect(attacker.statStages.defense).toBe(-1);
    expect(attacker.statStages.speed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Mimic: replaces Mimic slot, invalidates certain sources
// ---------------------------------------------------------------------------

describe("Gen 1 Mimic mechanic", () => {
  // Source: pret/pokered MimicEffect — Mimic copies the opponent's last used move
  // into the Mimic slot with 5 PP. Cannot copy Mimic, Transform, Metronome, or Struggle.

  const mimicMove = MIMIC;

  it("given the defender last used Tackle, when Mimic is used, then the Mimic slot is replaced with Tackle at 5 PP", () => {
    // Source: pret/pokered MimicEffect — replaces Mimic in the user's moveset
    // with the opponent's last-used move (5 PP, not the move's max PP).
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [createMoveSlot(MIMIC.id, MIMIC.pp), createMoveSlot(THUNDERBOLT.id, THUNDERBOLT.pp)],
      },
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      lastMoveUsed: TACKLE.id,
    });
    const context = createMoveEffectContext({ attacker, defender, move: mimicMove });
    const result = ruleset.executeMoveEffect(context);
    // The Mimic slot (index 0) is replaced with Tackle
    expect(result.moveSlotChange?.newMoveId).toBe(TACKLE.id);
    expect(result.moveSlotChange?.newPP).toBe(5);
    expect(result.moveSlotChange?.slot).toBe(0);
  });

  it("given the defender last used Mimic, when Mimic is used, then Mimic fails (cannot copy Mimic)", () => {
    // Source: pret/pokered MimicEffect — checks invalidMoves set which includes "mimic".
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      lastMoveUsed: MIMIC.id,
    });
    const context = createMoveEffectContext({ attacker, defender, move: mimicMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.moveSlotChange).toBeUndefined();
    expect(result.messages).toEqual(["But it failed!"]);
  });

  it("given the defender last used Transform, when Mimic is used, then Mimic fails (cannot copy Transform)", () => {
    // Source: pret/pokered MimicEffect — Transform is in the invalid set.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      lastMoveUsed: TRANSFORM.id,
    });
    const context = createMoveEffectContext({ attacker, defender, move: mimicMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.moveSlotChange).toBeUndefined();
  });

  it("given the defender last used Metronome, when Mimic is used, then Mimic fails (cannot copy Metronome)", () => {
    // Source: pret/pokered MimicEffect — Metronome is in the invalid set.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      lastMoveUsed: METRONOME.id,
    });
    const context = createMoveEffectContext({ attacker, defender, move: mimicMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.moveSlotChange).toBeUndefined();
  });

  it("given the defender has not used any move yet, when Mimic is used, then Mimic fails", () => {
    // Source: pret/pokered MimicEffect — no lastMoveUsed means Mimic cannot determine
    // which move to copy.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], lastMoveUsed: null });
    const context = createMoveEffectContext({ attacker, defender, move: mimicMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.moveSlotChange).toBeUndefined();
    expect(result.messages).toEqual(["But it failed!"]);
  });
});

// ---------------------------------------------------------------------------
// 1/256 miss bug: 100% accurate moves can miss on roll = 255
// ---------------------------------------------------------------------------

describe("Gen 1 1/256 miss bug", () => {
  // Source: pret/pokered engine/battle/core.asm:5348 CalcHitChance
  // For moves with accuracy 100, the threshold is stored as 255 (0xFF).
  // The hit check is: random(0..255) < threshold — strictly less than.
  // If random roll = 255 and threshold = 255, then 255 < 255 is false → MISS.
  // This is the infamous 1/256 miss bug.
  //
  // Exception: self-targeting moves get threshold = min(256, 255+1) = 256,
  // so they always hit (256/256 chance).

  function makeRngWithFixedRoll(roll: number) {
    return {
      next: () => 0,
      int: (_min: number, _max: number) => roll,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: readonly T[]) => [...arr],
      getState: () => 0,
      setState: () => {},
    } as SeededRandom;
  }

  it("given a 100% accurate move and RNG roll = 254, when checking accuracy, then move HITS", () => {
    // Source: pret/pokered CalcHitChance — 254 < 255 → true → HIT
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const move = BODY_SLAM;
    const rng = makeRngWithFixedRoll(254);
    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      rng,
      state: createBattleState(),
    });
    expect(result).toBe(true);
  });

  it("given a 100% accurate move and RNG roll = 255, when checking accuracy, then move MISSES (1/256 bug)", () => {
    // Source: pret/pokered CalcHitChance — 255 < 255 → false → MISS (the 1/256 bug)
    // This is the cartridge behavior: accuracy 100% maps to threshold 255,
    // and roll=255 is NOT less than 255, causing a miss.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const move = THUNDERBOLT;
    const rng = makeRngWithFixedRoll(255);
    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      rng,
      state: createBattleState(),
    });
    expect(result).toBe(false);
  });

  it("given a self-targeting 100% accurate move and RNG roll = 255, when checking accuracy, then move HITS (self-targeting is exempt)", () => {
    // Source: Showdown scripts.ts:408 — self-targeting moves get +1 to threshold (→ 256),
    // meaning they cannot miss. Swords Dance, Growl, etc.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const selfMove = createSyntheticSelfTargetingAccuracyProbe();
    const rng = makeRngWithFixedRoll(255);
    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move: selfMove,
      rng,
      state: createBattleState(),
    });
    expect(result).toBe(true);
  });
});
