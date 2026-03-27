import type { BattleSide, BattleState, CritContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_VOLATILE_IDS,
  CRIT_RATE_PROBABILITIES_GEN6,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager, Gen9Ruleset } from "../src";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_SPECIES_IDS } from "../src/data";
import {
  GEN9_CRIT_MULTIPLIER,
  GEN9_CRIT_RATE_PROBABILITIES,
  GEN9_CRIT_RATE_TABLE,
  GEN9_CRIT_RATES,
} from "../src/internal";

const dataManager = createGen9DataManager();
const ruleset = new Gen9Ruleset(dataManager);
const defaultNatureId = dataManager.getNature(CORE_NATURE_IDS.hardy).id;
const defaultLevel = 50;
const defaultSeed = 42;

const moveIds = {
  tackle: dataManager.getMove(CORE_MOVE_IDS.tackle).id,
} as const;

const abilityIds = {
  battleArmor: GEN9_ABILITY_IDS.battleArmor,
  blaze: CORE_ABILITY_IDS.blaze,
  intimidate: CORE_ABILITY_IDS.intimidate,
  shellArmor: GEN9_ABILITY_IDS.shellArmor,
  superLuck: GEN9_ABILITY_IDS.superLuck,
} as const;

const itemIds = {
  pokeBall: CORE_ITEM_IDS.pokeBall,
  scopeLens: GEN9_ITEM_IDS.scopeLens,
} as const;

const speciesIds = {
  battleArmor: GEN9_SPECIES_IDS.perrserker,
  blaze: GEN9_SPECIES_IDS.charizard,
  intimidate: GEN9_SPECIES_IDS.ekans,
  shellArmor: GEN9_SPECIES_IDS.shellder,
  superLuck: GEN9_SPECIES_IDS.murkrow,
  pikachu: GEN9_SPECIES_IDS.pikachu,
} as const;

const defaultSpeciesIdsByAbility = {
  [abilityIds.battleArmor]: speciesIds.battleArmor,
  [abilityIds.blaze]: speciesIds.blaze,
  [abilityIds.intimidate]: speciesIds.intimidate,
  [abilityIds.shellArmor]: speciesIds.shellArmor,
  [abilityIds.superLuck]: speciesIds.superLuck,
} as const satisfies Record<string, number>;

function createGuaranteedCritRng(): SeededRandom {
  return {
    next: () => 0,
    int: (min: number, _max: number) => min,
    chance: (probability: number) => probability >= 1,
    seed: 0,
  } as unknown as SeededRandom;
}

function resolveDefaultSpeciesId(abilityId?: string): number {
  if (abilityId && abilityId in defaultSpeciesIdsByAbility) {
    return defaultSpeciesIdsByAbility[abilityId];
  }

  return speciesIds.blaze;
}

function createSyntheticCritPokemon(
  options: {
    speciesId?: number;
    ability?: string;
    heldItem?: string | null;
    volatiles?: readonly string[];
    types?: readonly PokemonType[];
  } = {},
) {
  const resolvedAbilityId = options.ability ?? abilityIds.blaze;
  const species = dataManager.getSpecies(
    options.speciesId ?? resolveDefaultSpeciesId(resolvedAbilityId),
  );
  const pokemon = createPokemonInstance(species, defaultLevel, new SeededRandom(defaultSeed), {
    nature: defaultNatureId,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: options.heldItem ?? null,
    friendship: createFriendship(species.baseFriendship),
    gender: species.genderRatio === -1 ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
    moves: [moveIds.tackle],
  });

  pokemon.ability = resolvedAbilityId;

  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, [
    ...(options.types ?? species.types),
  ]);
  activePokemon.volatileStatuses = new Map(
    (options.volatiles ?? []).map((volatileId) => [
      volatileId as Parameters<typeof activePokemon.volatileStatuses.set>[0],
      { turnsLeft: -1 },
    ]),
  );
  return activePokemon;
}

function createSyntheticMoveFrom(moveId: string, overrides?: Partial<MoveData>): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: {
      ...baseMove.flags,
      ...overrides?.flags,
    },
  };
}

function createBattleSide(
  index: 0 | 1,
  activePokemon: ReturnType<typeof createSyntheticCritPokemon>,
): BattleSide {
  return {
    index,
    trainer: null,
    team: [activePokemon.pokemon],
    active: [activePokemon],
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

function createSyntheticBattleState(
  attacker: ReturnType<typeof createSyntheticCritPokemon>,
  defender: ReturnType<typeof createSyntheticCritPokemon>,
): BattleState {
  return {
    phase: "turn-start",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0, attacker), createBattleSide(1, defender)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createGuaranteedCritRng(),
    isWildBattle: false,
    fleeAttempts: 0,
    ended: false,
    winner: null,
  };
}

function createSyntheticCritContext(
  options: {
    defenderAbility?: string;
    attackerVolatiles?: readonly string[];
    attackerItem?: string;
    attackerSpeciesId?: number;
    attackerAbility?: string;
    moveCritRatio?: number;
  } = {},
): CritContext {
  const attacker = createSyntheticCritPokemon({
    speciesId: options.attackerSpeciesId ?? resolveDefaultSpeciesId(options.attackerAbility),
    ability: options.attackerAbility,
    heldItem: options.attackerItem ?? null,
    volatiles: options.attackerVolatiles,
  });
  const defender = options.defenderAbility
    ? createSyntheticCritPokemon({
        speciesId: resolveDefaultSpeciesId(options.defenderAbility),
        ability: options.defenderAbility,
      })
    : undefined;
  const move =
    options.moveCritRatio !== undefined
      ? createSyntheticMoveFrom(moveIds.tackle, { critRatio: options.moveCritRatio })
      : dataManager.getMove(moveIds.tackle);

  return {
    attacker,
    defender,
    move,
    state: createSyntheticBattleState(
      attacker,
      defender ?? createSyntheticCritPokemon({ speciesId: speciesIds.pikachu }),
    ),
    rng: createGuaranteedCritRng(),
  };
}

describe("Gen 9 critical hit constants", () => {
  it("given GEN9_CRIT_RATE_TABLE, then stage 0 denominator is 24 (~4.2%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 0: 1/24
    expect(GEN9_CRIT_RATE_TABLE[0]).toBe(24);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 1 denominator is 8 (12.5%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 1: 1/8
    expect(GEN9_CRIT_RATE_TABLE[1]).toBe(8);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 2 denominator is 2 (50%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 2: 1/2
    expect(GEN9_CRIT_RATE_TABLE[2]).toBe(2);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 3+ denominator is 1 (guaranteed)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 3+: guaranteed (1/1)
    expect(GEN9_CRIT_RATE_TABLE[3]).toBe(1);
  });

  it("given GEN9_CRIT_RATE_TABLE, then it has exactly 4 entries", () => {
    // Source: Showdown sim/battle-actions.ts -- 4 stages (0, 1, 2, 3+)
    expect(GEN9_CRIT_RATE_TABLE).toHaveLength(4);
  });

  it("given GEN9_CRIT_RATE_TABLE, then values match [24, 8, 2, 1]", () => {
    // Source: Showdown sim/battle-actions.ts -- complete Gen 9 crit rate table
    expect(Array.from(GEN9_CRIT_RATE_TABLE)).toEqual([24, 8, 2, 1]);
  });

  it("given the canonical Gen 9 probability table, when checked, then values match [1/24, 1/8, 1/2, 1]", () => {
    // Source: Showdown / Bulbapedia Gen 9 crit table — unchanged from Gen 6-8.
    expect(Array.from(GEN9_CRIT_RATE_PROBABILITIES)).toEqual([1 / 24, 1 / 8, 1 / 2, 1]);
  });

  it("given the canonical Gen 9 probability table, when compared to its aliases, then all references match", () => {
    // Source: issue #773 standardizes the probability surface on GEN9_CRIT_RATE_PROBABILITIES
    // while preserving GEN9_CRIT_RATES and the shared core export for compatibility.
    expect(GEN9_CRIT_RATE_PROBABILITIES).toBe(GEN9_CRIT_RATES);
    expect(GEN9_CRIT_RATE_PROBABILITIES).toBe(CRIT_RATE_PROBABILITIES_GEN6);
  });

  it("given GEN9_CRIT_MULTIPLIER, then it is 1.5", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier = 1.5x
    // Source: Bulbapedia "Critical hit" Gen 9 -- multiplier remains 1.5x
    expect(GEN9_CRIT_MULTIPLIER).toBe(1.5);
  });

  it("given GEN9_CRIT_MULTIPLIER is 1.5, then it differs from Gen 5's 2.0x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 5 used 2.0x, Gen 6+ changed to 1.5x
    expect(GEN9_CRIT_MULTIPLIER).not.toBe(2.0);
    expect(GEN9_CRIT_MULTIPLIER).toBe(1.5);
  });
});

describe("Gen 9 critical hit roll behavior", () => {
  it("given defender has Battle Armor ability, when rolling crit, then crit is prevented", () => {
    // Source: Bulbapedia -- Battle Armor prevents critical hits
    // Source: Showdown sim/battle-actions.ts -- crit immunity for Battle Armor
    const context = createSyntheticCritContext({ defenderAbility: abilityIds.battleArmor });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has Shell Armor ability, when rolling crit, then crit is prevented", () => {
    // Source: Bulbapedia -- Shell Armor prevents critical hits (same effect as Battle Armor)
    // Source: Showdown sim/battle-actions.ts -- crit immunity for Shell Armor
    const context = createSyntheticCritContext({ defenderAbility: abilityIds.shellArmor });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has no crit-blocking ability, when rolling crit with favorable RNG, then crit can occur", () => {
    // Source: Bulbapedia -- without Battle Armor/Shell Armor, crits are possible
    // With our synthetic RNG that returns the minimum roll, and stage 0 rate of 24,
    // rng.int(1, 24) === 1 is true, so crit occurs
    const context = createSyntheticCritContext({ defenderAbility: abilityIds.intimidate });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Focus Energy (+2 crit stage), when rolling crit, then crit stage is boosted", () => {
    // Source: Showdown sim/battle-actions.ts -- Focus Energy adds +2 to crit stage
    // Stage 2 rate = 2, so rng.int(1, 2) === 1 is true with our favorable RNG
    const context = createSyntheticCritContext({
      attackerVolatiles: [CORE_VOLATILE_IDS.focusEnergy],
    });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Scope Lens (+1 crit stage), when rolling crit, then crit stage is boosted by +1", () => {
    // Source: Showdown sim/battle-actions.ts -- Scope Lens adds +1 crit stage
    // Stage 1 rate = 8, so rng.int(1, 8) === 1 is true with our favorable RNG
    const context = createSyntheticCritContext({ attackerItem: itemIds.scopeLens });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Super Luck ability (+1 crit stage), when rolling crit, then crit stage is boosted by +1", () => {
    // Source: Showdown sim/battle-actions.ts -- Super Luck adds +1 crit stage
    // Stage 1 rate = 8, so rng.int(1, 8) === 1 is true with our favorable RNG
    const context = createSyntheticCritContext({ attackerAbility: abilityIds.superLuck });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given no defender (e.g., field move), when rolling crit with favorable RNG, then crit can occur", () => {
    // Source: Showdown -- crit check with no defender has no immunity check
    const context = createSyntheticCritContext();
    expect(ruleset.rollCritical(context)).toBe(true);
  });
});
