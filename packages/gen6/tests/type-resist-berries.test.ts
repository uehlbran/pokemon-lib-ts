import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, PrimaryStatus, SeededRandom } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { calculateGen6Damage, TYPE_RESIST_BERRIES } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

/**
 * Gen 6 Type Resist Berries -- damage calc integration tests.
 *
 * Same mechanics as Gen 5, plus Roseli Berry (Fairy).
 * Gen 6 crit multiplier is 1.5x (not 2.0x) and Facade bypasses burn, but
 * those don't affect berry mechanics.
 *
 * Source: Showdown data/items.ts -- type resist berries onSourceModifyDamage
 * Source: Bulbapedia -- "Roseli Berry" halves damage from Fairy-type moves
 *
 * Fixes: #622 -- type resist berries fired on-damage-taken (post-damage) and damage-boost
 *   effect was ignored by the engine. Now applied in the damage calc (pre-damage).
 */

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

const ABILITIES = CORE_ABILITY_IDS;
const CORE_ITEMS = CORE_ITEM_IDS;
const CORE_MOVES = CORE_MOVE_IDS;
const GEN6_ITEMS = GEN6_ITEM_IDS;
const GEN6_MOVES = GEN6_MOVE_IDS;
const NATURES = GEN6_NATURE_IDS;
const SPECIES = GEN6_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const gen6Data = createGen6DataManager();

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: SPECIES.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: GEN6_ITEMS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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

function createCanonicalMove(
  moveId: string = CORE_MOVES.tackle,
  overrides: {
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
  } = {},
): MoveData {
  const move = gen6Data.getMove(moveId);
  return {
    ...move,
    ...overrides,
    flags: { ...move.flags, ...overrides.flags },
    effect: overrides.effect ?? move.effect,
  } as MoveData;
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
    generation: 6,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

/** Create a fixed-roll RNG that returns max for rng.int (100 = no damage reduction) */
function makeFixedRng(): SeededRandom {
  return {
    next: () => 0.5,
    int: (_min: number, max: number) => max,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? createCanonicalMove(),
    state: overrides.state ?? createBattleState(),
    rng: makeFixedRng(),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART;

// ===========================================================================
// Type Resist Berry -- basic activation
// ===========================================================================

describe("Gen 6 type resist berries -- damage calc integration", () => {
  it("given Grass-type defender with Occa Berry vs super-effective Fire move, when damage calculated, then damage is halved via pokeRound", () => {
    // Source: Showdown data/items.ts -- Occa Berry onSourceModifyDamage halves SE Fire damage
    // Derivation: L50, Fire 80BP, Atk=100, Def=100, rng=max (0 reduction)
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = 37
    //   random factor with int return 0 => floor(37 * (100-0)/100) = 37
    //   no STAB, Fire vs Grass = 2x: 37*2 = 74
    //   Occa Berry: pokeRound(74, 2048) = floor((74*2048+2047)/4096) = 37
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.grass],
      defense: 100,
      heldItem: CORE_ITEMS.occaBerry,
    });
    const fireMove = createCanonicalMove(CORE_MOVES.firePledge);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(37);
    expect(result.effectiveness).toBe(2);
    // Berry should be consumed
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Grass-type defender WITHOUT Occa Berry vs super-effective Fire move, when damage calculated, then full 2x damage applies", () => {
    // Source: Showdown data/items.ts -- without resist berry, full SE damage
    // Derivation: baseDmg = 37, Fire vs Grass = 2x: 37*2 = 74
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.grass],
      defense: 100,
    });
    const fireMove = createCanonicalMove(CORE_MOVES.firePledge);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(74);
    expect(result.effectiveness).toBe(2);
  });

  it("given Normal-type defender with Occa Berry vs neutral Fire move, when damage calculated, then Occa Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- type resist berries only activate on SE damage
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      defense: 100,
      heldItem: CORE_ITEMS.occaBerry,
    });
    const fireMove = createCanonicalMove(CORE_MOVES.firePledge);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    // Berry NOT consumed
    expect(defender.pokemon.heldItem).toBe(CORE_ITEMS.occaBerry);
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Roseli Berry (Fairy) -- Gen 6 exclusive
// ===========================================================================

describe("Gen 6 Roseli Berry -- halves Fairy-type SE damage", () => {
  it("given Dragon-type defender with Roseli Berry vs SE Fairy move, when damage calculated, then damage is halved", () => {
    // Source: Bulbapedia -- Roseli Berry: "Weakens a supereffective Fairy-type attack"
    // Attacker is Normal-type to avoid STAB on Fairy move
    // Derivation using canonical Gen 6 Moonblast (95 BP), SpA=100, SpDef=100, no STAB:
    //   pre-type damage = 43, Fairy vs Dragon = 2x => 86
    //   Roseli Berry halves via pokeRound(86, 2048) => 43
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.dragon],
      spDefense: 100,
      heldItem: GEN6_ITEMS.roseliBerry,
    });
    const fairyMove = createCanonicalMove(GEN6_MOVES.moonblast);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    expect(result.damage).toBe(43);
    expect(result.effectiveness).toBe(2);
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Fire-type defender with Roseli Berry vs NVE Fairy move, when damage calculated, then Roseli Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- resist berries only activate when SE
    // Fairy vs Fire = 0.5x (NVE), so berry should not activate
    // Attacker is Normal-type to avoid STAB on Fairy move
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.fire],
      spDefense: 100,
      heldItem: GEN6_ITEMS.roseliBerry,
    });
    const fairyMove = createCanonicalMove(GEN6_MOVES.moonblast);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe(GEN6_ITEMS.roseliBerry);
    // Fairy vs Fire = 0.5x (NVE)
    expect(result.effectiveness).toBe(0.5);
  });
});

// ===========================================================================
// Magic Room suppresses resist berries (Gen 6)
// ===========================================================================

describe("Gen 6 type resist berries -- Magic Room suppression", () => {
  it("given Dragon-type defender with Roseli Berry vs SE Fairy move under Magic Room, when damage calculated, then berry does NOT activate and full SE damage applies", () => {
    // Source: Showdown data/moves.ts -- Magic Room: "For 5 turns, held items have no effect"
    // Source: Bulbapedia -- Magic Room: "Nullifies the effect of each Pokémon's held item"
    // Without Magic Room the same setup gives 43 (halved). Under Magic Room: full 86.
    // Attacker is Normal-type to avoid STAB on Fairy move.
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.dragon],
      spDefense: 100,
      heldItem: GEN6_ITEMS.roseliBerry,
    });
    const fairyMove = createCanonicalMove(GEN6_MOVES.moonblast);
    const magicRoomState = {
      ...createBattleState(),
      magicRoom: { active: true, turnsLeft: 3 },
    } as unknown as BattleState;

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fairyMove, state: magicRoomState }),
      typeChart,
    );

    // Berry NOT consumed — Magic Room suppresses it
    expect(defender.pokemon.heldItem).toBe(GEN6_ITEMS.roseliBerry);
    // Full SE damage with canonical Moonblast: 43 pre-type * 2 = 86
    expect(result.damage).toBe(86);
  });

  it("given Dragon-type defender with Roseli Berry vs SE Fairy move when Magic Room is inactive, when damage calculated, then berry activates normally", () => {
    // Source: Showdown data/moves.ts -- Magic Room only suppresses when active
    // Without Magic Room the berry should halve SE damage as expected.
    // Attacker is Normal-type to avoid STAB on Fairy move.
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.dragon],
      spDefense: 100,
      heldItem: GEN6_ITEMS.roseliBerry,
    });
    const fairyMove = createCanonicalMove(GEN6_MOVES.moonblast);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    // Berry consumed — Magic Room not active
    expect(defender.pokemon.heldItem).toBeNull();
    // Halved SE damage with canonical Moonblast: 86 -> pokeRound(86, 2048) = 43
    expect(result.damage).toBe(43);
  });
});

// ===========================================================================
// Table completeness
// ===========================================================================

describe("Gen 6 TYPE_RESIST_BERRIES table", () => {
  it("given the table, then it has 18 entries (17 from Gen 5 + Roseli Berry for Fairy)", () => {
    // Source: Bulbapedia -- 18 type-resist berries in Gen 6 (added Roseli for Fairy)
    expect(Object.keys(TYPE_RESIST_BERRIES).length).toBe(18);
  });

  it("given the table, then Roseli Berry maps to fairy type", () => {
    // Source: Bulbapedia -- Roseli Berry: "halves damage from Fairy-type moves"
    expect(TYPE_RESIST_BERRIES[GEN6_ITEMS.roseliBerry]).toBe(TYPES.fairy);
  });
});

// ===========================================================================
// Klutz suppression (Gen 6)
// ===========================================================================

describe("Gen 6 type resist berries -- Klutz suppression", () => {
  it("given defender with Klutz + Roseli Berry vs SE Fairy move, when damage calculated, then Klutz suppresses berry", () => {
    // Source: Showdown data/abilities.ts -- Klutz prevents item usage
    // Attacker is Normal-type to avoid STAB on Fairy move
    const attacker = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.dragon],
      spDefense: 100,
      heldItem: GEN6_ITEMS.roseliBerry,
      ability: ABILITIES.klutz,
    });
    const fairyMove = createCanonicalMove(GEN6_MOVES.moonblast);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    // Full SE damage with canonical Moonblast: 43 pre-type * 2 = 86, berry NOT consumed
    expect(result.damage).toBe(86);
    expect(defender.pokemon.heldItem).toBe(GEN6_ITEMS.roseliBerry);
  });
});
