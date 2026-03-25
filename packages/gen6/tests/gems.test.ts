import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData } from "@pokemon-lib-ts/core";
import { CORE_ITEM_IDS, createPokemonInstance, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateGen6Damage,
  createGen6DataManager,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { GEM_TYPES } from "../src/Gen6Items";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen6DataManager();
const ITEMS = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const MOVES = GEN6_MOVE_IDS;
const NATURES = GEN6_NATURE_IDS;
const SPECIES = GEN6_SPECIES_IDS;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const EMBER = DATA_MANAGER.getMove(MOVES.ember);
const DEFAULT_LEVEL = 50;
const DEFAULT_NATURE = DATA_MANAGER.getNature(NATURES.hardy).id;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.rattata);
const ROCK_SPECIES = DATA_MANAGER.getSpecies(SPECIES.geodude);
const FIRE_SPECIES = DATA_MANAGER.getSpecies(SPECIES.charmander);
const GEN6_GEM_ITEM_IDS = DATA_MANAGER.getAllItems()
  .filter((item) => item.id.endsWith("-gem"))
  .map((item) => item.id);

function createSyntheticActivePokemon(overrides: {
  speciesId?: number;
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(6),
    {
      nature: DEFAULT_NATURE,
    },
  );

  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as any;
  if (overrides.ability != null) {
    pokemon.ability = overrides.ability;
  }
  pokemon.calculatedStats = {
    ...pokemon.calculatedStats,
    hp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };

  const onFieldPokemon = createBattleOnFieldPokemon(pokemon, 0, [...species.types]);
  onFieldPokemon.ability = overrides.ability ?? pokemon.ability;
  onFieldPokemon.volatileStatuses = overrides.volatiles ?? new Map();
  return onFieldPokemon;
}

function createSyntheticMoveFrom(
  baseMove: MoveData,
  overrides?: {
    power?: number | null;
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
  },
): MoveData {
  return {
    ...baseMove,
    power: overrides?.power ?? baseMove.power,
    flags: {
      ...baseMove.flags,
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? baseMove.effect ?? null,
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

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticActivePokemon({}),
    defender: overrides.defender ?? createSyntheticActivePokemon({}),
    move: overrides.move ?? TACKLE,
    state: createBattleState(),
    isCrit: overrides.isCrit ?? false,
    rng: new SeededRandom(overrides.seed ?? 42),
  };
}

// ---------------------------------------------------------------------------
// GEM_TYPES map verification
// ---------------------------------------------------------------------------

describe("Gen 6 Gems -- GEM_TYPES map", () => {
  it("given Gen 6 item data, when checking gem items, then only Normal Gem exists", () => {
    // Source: packages/gen6/data/items.json -- only Normal Gem is present in the committed Gen 6 item data
    expect(GEN6_GEM_ITEM_IDS).toEqual([ITEMS.normalGem]);
  });

  it("given GEM_TYPES map, when checking supported entries, then it matches the Gen 6 data surface", () => {
    // Source: packages/gen6/data/items.json + Gen6Items.ts -- Gen 6 only supports Normal Gem
    expect(GEM_TYPES).toEqual({ [ITEMS.normalGem]: TACKLE.type });
  });
});

// ---------------------------------------------------------------------------
// Gen 6 gem boost: 1.3x (not 1.5x)
// ---------------------------------------------------------------------------

describe("Gen 6 Gems -- 1.3x boost (nerfed from 1.5x in Gen 5)", () => {
  it("given a Normal-type attacker holding Normal Gem using Tackle (50 BP), when calculating damage, then gem applies 1.3x boost and is consumed", () => {
    // Source: Bulbapedia "Gem" -- Gen VI nerfed from 1.5x to 1.3x
    // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096]) in Gen 6+
    //
    // Without gem: base damage = floor((2*50/5+2) * 50 * 100/100 / 50) + 2 = 24
    // With gem: power boosted by pokeRound(50, 5325) = floor((50*5325+2047)/4096) = 65
    //   base damage = floor((2*50/5+2) * 65 * 100/100 / 50) + 2 = 30
    const attacker = createSyntheticActivePokemon({
      speciesId: SPECIES.rattata,
      heldItem: ITEMS.normalGem,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({
      speciesId: ROCK_SPECIES.id, // Rock resists Normal
      defense: 100,
    });
    const moveWithGem = TACKLE;
    const moveNoGem = TACKLE;

    // Calculate with gem
    const ctxWithGem = createDamageContext({
      attacker: { ...attacker },
      defender,
      move: moveWithGem,
      seed: 42,
    });
    const resultWithGem = calculateGen6Damage(
      ctxWithGem,
      GEN6_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // Calculate without gem (remove item)
    const attackerNoGem = createSyntheticActivePokemon({
      speciesId: SPECIES.rattata,
      heldItem: null,
      attack: 100,
    });
    const ctxNoGem = createDamageContext({
      attacker: attackerNoGem,
      defender,
      move: moveNoGem,
      seed: 42,
    });
    const resultNoGem = calculateGen6Damage(
      ctxNoGem,
      GEN6_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // Gem damage should be higher due to 1.3x boost.
    // Derivation (seed=42, Showdown Gen 6 formula, Rock resists Normal 0.5x):
    //   Boosted power = pokeRound(50, 5325) = floor((50*5325+2047)/4096) = 65
    //   Base damage without gem: floor((2*50/5+2)*50*100/100/50)+2 = 24; with 0.5x resist = 12
    //   Base damage with gem:    floor((2*50/5+2)*65*100/100/50)+2 = 30; with 0.5x resist = 15
    //   After seed=42 random roll (~85-100%): withGem=21, noGem=16
    //   If gem were 1.5x (Gen 5 rate), boosted power would be 75, damage would be > 21
    // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096]) in Gen 6+
    expect(resultNoGem.damage).toBe(16);
    expect(resultWithGem.damage).toBe(21);

    // Verify the gem was consumed (attacker's heldItem set to null by damage calc)
    expect(ctxWithGem.attacker.pokemon.heldItem).toBeNull();
  });

  it("given a Fire-type attacker holding Normal Gem using Ember, when calculating damage, then Normal Gem does not activate", () => {
    // Source: packages/gen6/data/items.json -- only Normal Gem exists in Gen 6
    const attacker = createSyntheticActivePokemon({
      speciesId: FIRE_SPECIES.id,
      heldItem: ITEMS.normalGem,
      spAttack: 100,
    });
    const defender = createSyntheticActivePokemon({
      speciesId: SPECIES.rattata,
      spDefense: 100,
    });
    const moveWithGem = createSyntheticMoveFrom(EMBER, {
      flags: { contact: false },
    });
    const moveNoGem = createSyntheticMoveFrom(EMBER, {
      flags: { contact: false },
    });

    const ctxWithGem = createDamageContext({
      attacker: { ...attacker },
      defender,
      move: moveWithGem,
      seed: 42,
    });
    const resultWithGem = calculateGen6Damage(
      ctxWithGem,
      GEN6_TYPE_CHART as Record<string, Record<string, number>>,
    );

    const attackerNoGem = createSyntheticActivePokemon({
      speciesId: FIRE_SPECIES.id,
      heldItem: null,
      spAttack: 100,
    });
    const ctxNoGem = createDamageContext({
      attacker: attackerNoGem,
      defender,
      move: moveNoGem,
      seed: 42,
    });
    const resultNoGem = calculateGen6Damage(
      ctxNoGem,
      GEN6_TYPE_CHART as Record<string, Record<string, number>>,
    );

    expect(resultNoGem.damage).toBe(25);
    expect(resultWithGem.damage).toBe(resultNoGem.damage);
    expect(ctxWithGem.attacker.pokemon.heldItem).toBe(ITEMS.normalGem);
  });

  it("given a Fire-type attacker holding Normal Gem using Tackle, when calculating damage, then Normal Gem still activates because the move is Normal-type", () => {
    // Source: packages/gen6/data/items.json + Gen6DamageCalc.ts -- the only supported Gem in Gen 6 is Normal Gem
    const attacker = createSyntheticActivePokemon({
      speciesId: FIRE_SPECIES.id,
      heldItem: ITEMS.normalGem,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({
      speciesId: SPECIES.rattata,
      defense: 100,
    });
    const move = TACKLE;

    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    calculateGen6Damage(ctx, GEN6_TYPE_CHART as Record<string, Record<string, number>>);

    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });
});
