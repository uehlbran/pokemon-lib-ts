import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_ITEM_IDS, CORE_TYPE_IDS, SeededRandom } from "@pokemon-lib-ts/core";
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
const ABILITIES = CORE_ABILITY_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const MOVES = GEN6_MOVE_IDS;
const NATURES = GEN6_NATURE_IDS;
const SPECIES = GEN6_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const EMBER = DATA_MANAGER.getMove(MOVES.ember);
const GEN6_GEM_ITEM_IDS = DATA_MANAGER.getAllItems()
  .filter((item) => item.id.endsWith("-gem"))
  .map((item) => item.id);

function makeActive(overrides: {
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
  speciesId?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
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

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  const base = DATA_MANAGER.getMove(overrides?.id ?? MOVES.tackle);
  return {
    ...base,
    id: overrides?.id ?? base.id,
    displayName: base.displayName,
    type: overrides?.type ?? base.type,
    category: overrides?.category ?? base.category,
    power: overrides?.power ?? base.power,
    flags: {
      ...base.flags,
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? base.effect ?? null,
  } as MoveData;
}

function makeState(): BattleState {
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

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove(),
    state: makeState(),
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
    expect(GEM_TYPES).toEqual({ [ITEMS.normalGem]: TYPES.normal });
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
    const attacker = makeActive({
      heldItem: ITEMS.normalGem,
      types: [TYPES.normal],
      attack: 100,
    });
    const defender = makeActive({
      types: [TYPES.rock], // Rock resists Normal
      defense: 100,
    });
    const moveWithGem = makeMove({ id: TACKLE.id });
    const moveNoGem = makeMove({ id: TACKLE.id });

    // Calculate with gem
    const ctxWithGem = makeDamageContext({
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
    const attackerNoGem = makeActive({
      heldItem: null,
      types: [TYPES.normal],
      attack: 100,
    });
    const ctxNoGem = makeDamageContext({
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
    const attacker = makeActive({
      heldItem: ITEMS.normalGem,
      types: [TYPES.fire],
      spAttack: 100,
    });
    const defender = makeActive({
      types: [TYPES.normal],
      spDefense: 100,
    });
    const moveWithGem = makeMove({
      id: EMBER.id,
      category: "special",
      flags: { contact: false },
    });
    const moveNoGem = makeMove({
      id: EMBER.id,
      category: "special",
      flags: { contact: false },
    });

    const ctxWithGem = makeDamageContext({
      attacker: { ...attacker },
      defender,
      move: moveWithGem,
      seed: 42,
    });
    const resultWithGem = calculateGen6Damage(
      ctxWithGem,
      GEN6_TYPE_CHART as Record<string, Record<string, number>>,
    );

    const attackerNoGem = makeActive({
      heldItem: null,
      types: [TYPES.fire],
      spAttack: 100,
    });
    const ctxNoGem = makeDamageContext({
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
    const attacker = makeActive({
      heldItem: ITEMS.normalGem,
      types: [TYPES.fire],
      attack: 100,
    });
    const defender = makeActive({
      types: [TYPES.normal],
      defense: 100,
    });
    const move = makeMove({ id: TACKLE.id });

    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    calculateGen6Damage(ctx, GEN6_TYPE_CHART as Record<string, Record<string, number>>);

    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });
});
