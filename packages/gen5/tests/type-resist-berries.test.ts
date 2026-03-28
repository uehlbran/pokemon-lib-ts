import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  type MoveData,
  type PokemonType,
  type PrimaryStatus,
  type SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateGen5Damage,
  createGen5DataManager,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
  TYPE_RESIST_BERRIES,
} from "../src";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

/**
 * Gen 5 Type Resist Berries -- damage calc integration tests.
 *
 * Type resist berries halve super-effective damage of the matching type, then are consumed.
 * In Gen 5+, the halving uses pokeRound(baseDamage, 2048) instead of floor(baseDamage * 0.5).
 * Chilan Berry (Normal) activates on any Normal-type hit (no SE requirement).
 *
 * Source: Showdown data/items.ts -- type resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries: "Weakens a supereffective [type]-type move"
 *
 * Fixes: #622 -- type resist berries fired on-damage-taken (post-damage) and damage-boost
 *   effect was ignored by the engine. Now applied in the damage calc (pre-damage).
 */

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  speciesId?: number;
  nature?: string;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
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
      speciesId: overrides.speciesId ?? BASE_SPECIES.id,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: overrides.nature ?? DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    types: overrides.types ?? [...BASE_SPECIES.types],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
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

const dataManager = createGen5DataManager();
const BASE_SPECIES = dataManager.getSpecies(GEN5_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = dataManager.getNature(GEN5_NATURE_IDS.hardy).id;

function createCanonicalMove(moveId: string): ReturnType<typeof dataManager.getMove> {
  const move = dataManager.getMove(moveId);
  return { ...move, flags: { ...move.flags } };
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
    generation: 5,
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
    move: overrides.move ?? createCanonicalMove(GEN5_MOVE_IDS.tackle),
    state: overrides.state ?? createBattleState(),
    rng: makeFixedRng(),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN5_TYPE_CHART;

// ===========================================================================
// Type Resist Berry -- basic activation
// ===========================================================================

describe("Gen 5 type resist berries -- damage calc integration", () => {
  it("given Grass-type defender with Occa Berry vs super-effective Fire move, when damage calculated, then damage is halved via pokeRound", () => {
    // Source: Showdown data/items.ts -- Occa Berry onSourceModifyDamage halves SE Fire damage
    // Derivation: L50, Flamethrower 95BP, Atk=100, Def=100, rng=max (0 reduction)
    //   baseDmg = floor(floor(22*95*100/100)/50)+2 = 43
    //   random factor with int return 0 => floor(43 * (100-0)/100) = 43
    //   no STAB (attacker not Fire type), Fire vs Grass = 2x: 43*2 = 86
    //   Occa Berry: pokeRound(86, 2048) = floor((86*2048+2047)/4096) = floor(178175/4096) = 43
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(43);
    expect(result.effectiveness).toBe(2);
    // Berry should be consumed
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Grass-type defender WITHOUT Occa Berry vs super-effective Fire move, when damage calculated, then full 2x damage applies", () => {
    // Source: Showdown data/items.ts -- without resist berry, full SE damage
    // Derivation: same as above but no berry halving
    //   baseDmg = 43, Fire vs Grass = 2x: 43*2 = 86
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(86);
    expect(result.effectiveness).toBe(2);
  });

  it("given Grass-type defender with Occa Berry vs neutral Normal move, when damage calculated, then Occa Berry does NOT activate (wrong type)", () => {
    // Source: Showdown data/items.ts -- Occa Berry only activates for Fire-type moves
    // Attacker is Water-type to avoid STAB on Normal move
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.water], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
    });
    const normalMove = createCanonicalMove(GEN5_MOVE_IDS.tackle);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: normalMove }),
      typeChart,
    );

    // Berry NOT consumed (move type is Normal, not Fire)
    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.occaBerry);
    // Derivation: baseDmg = 24, Normal vs Grass = 1x: 24
    expect(result.damage).toBe(24);
  });

  it("given Normal-type defender with Occa Berry vs neutral Fire move, when damage calculated, then Occa Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- type resist berries only activate on SE damage
    // Fire vs Normal = 1x (neutral), so berry should not activate
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.normal],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    // Berry NOT consumed (fire is not SE against Normal)
    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.occaBerry);
    expect(result.damage).toBe(43);
  });
});

// ===========================================================================
// Chilan Berry -- special case (Normal type, no SE requirement)
// ===========================================================================

describe("Gen 5 Chilan Berry -- halves Normal-type damage without SE requirement", () => {
  it("given any-type defender with Chilan Berry vs Normal move, when damage calculated, then damage is halved", () => {
    // Source: Showdown data/items.ts -- Chilan Berry: onSourceModifyDamage (no SE check)
    // Source: Bulbapedia -- Chilan Berry: "halves Normal-type damage, consumed"
    // Attacker is Water-type to avoid STAB on the move
    // Derivation: L50, Tackle 50BP, Atk=100, Def=100, no STAB, Normal vs Psychic = 1x
    //   baseDmg = 24, Chilan Berry: pokeRound(24, 2048) = floor((24*2048+2047)/4096) = 12
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.water], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.psychic],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.chilanBerry,
    });
    const normalMove = createCanonicalMove(GEN5_MOVE_IDS.tackle);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: normalMove }),
      typeChart,
    );

    expect(result.damage).toBe(12);
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Psychic-type defender with Chilan Berry vs Fire move, when damage calculated, then Chilan Berry does NOT activate (wrong type)", () => {
    // Source: Showdown data/items.ts -- Chilan Berry only works for Normal-type moves
    // Attacker is Water-type to avoid STAB on Fire move
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.water], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.psychic],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.chilanBerry,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.chilanBerry);
    // Derivation: baseDmg = 43, no STAB (Water attacker, Fire move), Fire vs Psychic = 1x: 43
    expect(result.damage).toBe(43);
  });
});

// ===========================================================================
// Klutz and Embargo suppress resist berries
// ===========================================================================

describe("Gen 5 type resist berries -- suppression by Klutz and Embargo", () => {
  it("given defender with Klutz + Occa Berry vs SE Fire move, when damage calculated, then Klutz suppresses berry and full damage applies", () => {
    // Source: Showdown data/abilities.ts -- Klutz: prevents holder from using held item
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
      ability: CORE_ABILITY_IDS.klutz,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(86);
    // Berry NOT consumed (Klutz suppresses)
    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.occaBerry);
  });

  it("given defender with Embargo + Yache Berry vs SE Ice move, when damage calculated, then Embargo suppresses berry and full damage applies", () => {
    // Source: Showdown data/moves.ts -- Embargo: suppresses item use
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const embargoVolatiles = new Map<string, { turnsLeft: number }>();
    embargoVolatiles.set(CORE_VOLATILE_IDS.embargo, { turnsLeft: 3 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.yacheBerry,
      volatiles: embargoVolatiles,
    });
    const iceMove = createCanonicalMove(GEN5_MOVE_IDS.iceBeam);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: iceMove }),
      typeChart,
    );

    expect(result.damage).toBe(86);
    // Berry NOT consumed (Embargo suppresses)
    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.yacheBerry);
  });
});

// ===========================================================================
// Unburden interaction
// ===========================================================================

describe("Gen 5 type resist berry + Unburden interaction", () => {
  it("given Unburden holder with Occa Berry vs SE Fire move, when damage calculated, then Unburden volatile is activated after berry consumption", () => {
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is consumed"
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
      ability: CORE_ABILITY_IDS.unburden,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    calculateGen5Damage(createDamageContext({ attacker, defender, move: fireMove }), typeChart);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)).toBe(true);
  });
});

// ===========================================================================
// Breakdown tracking
// ===========================================================================

describe("Gen 5 type resist berry -- breakdown itemMultiplier", () => {
  it("given resist berry activates, when damage calculated, then breakdown itemMultiplier is 0.5", () => {
    // Source: internal consistency -- itemMultiplier should track berry contribution
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.breakdown?.itemMultiplier).toBe(0.5);
  });
});

// ===========================================================================
// Magic Room suppresses resist berries
// ===========================================================================

describe("Gen 5 type resist berries -- Magic Room suppression", () => {
  it("given Grass-type defender with Occa Berry vs SE Fire move under Magic Room, when damage calculated, then berry does NOT activate and full SE damage applies", () => {
    // Source: Showdown data/moves.ts -- Magic Room: "For 5 turns, held items have no effect"
    // Source: Bulbapedia -- Magic Room: "Nullifies the effect of each Pokémon's held item"
    // Without Magic Room the same setup gives 43 (halved). Under Magic Room: full 86.
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.occaBerry,
    });
    const fireMove = createCanonicalMove(GEN5_MOVE_IDS.flamethrower);
    const magicRoomState = {
      ...createBattleState(),
      magicRoom: { active: true, turnsLeft: 3 },
    } as unknown as BattleState;

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove, state: magicRoomState }),
      typeChart,
    );

    // Berry NOT consumed — Magic Room suppresses it
    expect(defender.pokemon.heldItem).toBe(GEN5_ITEM_IDS.occaBerry);
    // Full SE damage: 43 base * 2x Fire vs Grass = 86
    expect(result.damage).toBe(86);
  });

  it("given Grass-type defender with Yache Berry vs SE Ice move when Magic Room is inactive, when damage calculated, then berry activates normally", () => {
    // Source: Showdown data/moves.ts -- Magic Room only suppresses when active
    // With Magic Room inactive the berry should still halve damage.
    const attacker = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], attack: 100 });
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      defense: 100,
      heldItem: GEN5_ITEM_IDS.yacheBerry,
    });
    const iceMove = createCanonicalMove(GEN5_MOVE_IDS.iceBeam);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: iceMove }),
      typeChart,
    );

    // Berry consumed — Magic Room is not active
    expect(defender.pokemon.heldItem).toBeNull();
    // Halved SE damage: 43 base * 2x Ice vs Grass = 86 -> pokeRound(86, 2048) = 43
    expect(result.damage).toBe(43);
  });
});

// ===========================================================================
// Table completeness
// ===========================================================================

describe("Gen 5 TYPE_RESIST_BERRIES table", () => {
  it("given the table, then it has 17 entries (16 types + Chilan for Normal)", () => {
    // Source: Bulbapedia -- 17 type-resist berries exist in Gen 4-5 (Fairy not yet introduced)
    expect(Object.keys(TYPE_RESIST_BERRIES).length).toBe(17);
  });

  it("given the table, then Chilan Berry maps to Normal in Gen 5", () => {
    // Source: Showdown data/items.ts -- chilan-berry is the Normal-type resist berry
    expect(TYPE_RESIST_BERRIES[GEN5_ITEM_IDS.chilanBerry]).toBe(CORE_TYPE_IDS.normal);
  });
});
