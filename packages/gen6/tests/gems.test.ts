import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen6Damage } from "../src/Gen6DamageCalc";
import { GEM_TYPES } from "../src/Gen6Items";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

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
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
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
      pokeball: "pokeball",
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
  return {
    id: overrides?.id ?? "tackle",
    displayName: overrides?.id ?? "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
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
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? null,
    description: "",
    generation: 6,
    critRatio: 0,
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
  it("given GEM_TYPES map, when checking entries, then contains 18 types including fairy", () => {
    // Source: Bulbapedia "Gem" -- Gen 6 has all 18 types of gems including Fairy
    expect(Object.keys(GEM_TYPES).length).toBe(18);
    expect(GEM_TYPES["fairy-gem"]).toBe("fairy");
  });

  it("given GEM_TYPES map, when checking for all 18 types, then each is present", () => {
    // Source: Bulbapedia "Gem" -- full list of gem types in Gen 6
    const expectedTypes = [
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
      "dark",
      "steel",
      "fairy",
    ];
    for (const type of expectedTypes) {
      expect(GEM_TYPES[`${type}-gem`]).toBe(type);
    }
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
      heldItem: "normal-gem",
      types: ["normal"],
      attack: 100,
    });
    const defender = makeActive({
      types: ["rock"], // Rock resists Normal
      defense: 100,
    });
    const moveWithGem = makeMove({ id: "tackle", type: "normal", power: 50 });
    const moveNoGem = makeMove({ id: "tackle", type: "normal", power: 50 });

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
      types: ["normal"],
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

  it("given a Fire-type attacker holding Fire Gem using Ember (40 BP), when calculating damage, then fire gem applies 1.3x boost", () => {
    // Source: Bulbapedia "Gem" -- Gen VI: 1.3x boost
    // Source: Showdown data/items.ts -- firegem: type Fire, gem boost
    //
    // Fire Gem with Fire-type move should get the 1.3x boost
    const attacker = makeActive({
      heldItem: "fire-gem",
      types: ["fire"],
      spAttack: 100,
    });
    const defender = makeActive({
      types: ["normal"],
      spDefense: 100,
    });
    const moveWithGem = makeMove({
      id: "ember",
      type: "fire",
      power: 40,
      category: "special",
      flags: { contact: false },
    });
    const moveNoGem = makeMove({
      id: "ember",
      type: "fire",
      power: 40,
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
      types: ["fire"],
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

    // Derivation (seed=42, Showdown Gen 6 formula, Normal takes 1x from Fire, special move):
    //   Boosted power = pokeRound(40, 5325) = floor((40*5325+2047)/4096) = 52
    //   Base damage without gem: floor((2*50/5+2)*40*100/100/50)+2 = 19; 1x = 19
    //   Base damage with gem:    floor((2*50/5+2)*52*100/100/50)+2 = 24; 1x = 24
    //   After seed=42 random roll: withGem=33, noGem=25
    //   (Fire is STAB for attacker, boosting by 1.5x)
    //   If gem were 1.5x (Gen 5 rate), boosted power would be 60, damage would be > 33
    // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096]) in Gen 6+
    expect(resultNoGem.damage).toBe(25);
    expect(resultWithGem.damage).toBe(33);
    // Gem should be consumed
    expect(ctxWithGem.attacker.pokemon.heldItem).toBeNull();
  });

  it("given a Normal-type attacker holding Fire Gem using Tackle (Normal move), when calculating damage, then Fire Gem does NOT activate (type mismatch)", () => {
    // Source: Showdown data/items.ts -- gems only activate for matching move type
    const attacker = makeActive({
      heldItem: "fire-gem",
      types: ["normal"],
      attack: 100,
    });
    const defender = makeActive({
      types: ["normal"],
      defense: 100,
    });
    const move = makeMove({ id: "tackle", type: "normal", power: 50 });

    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    calculateGen6Damage(ctx, GEN6_TYPE_CHART as Record<string, Record<string, number>>);

    // Fire gem should NOT be consumed because move type doesn't match
    expect(ctx.attacker.pokemon.heldItem).toBe("fire-gem");
  });
});
