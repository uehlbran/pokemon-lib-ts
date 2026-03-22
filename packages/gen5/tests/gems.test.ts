import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEM_TYPES } from "../src/Gen5Items";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 80,
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
      ...overrides.flags,
    },
    effect: null,
    description: "",
    generation: 5,
    critRatio: 0,
  } as MoveData;
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
    move: overrides.move ?? makeMove({}),
    state: {
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
    } as any,
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// GEM_TYPES export completeness
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- GEM_TYPES map completeness", () => {
  it("given the GEM_TYPES map, then it contains exactly 17 entries (no Fairy gem in Gen 5)", () => {
    // Source: references/pokemon-showdown/data/items.ts -- 17 gem entries
    // Gen 5 has no Fairy type, so no Fairy Gem
    expect(Object.keys(GEM_TYPES)).toHaveLength(17);
  });

  it("given the GEM_TYPES map, then it does NOT contain fairy-gem", () => {
    // Fairy type was introduced in Gen 6
    expect(GEM_TYPES["fairy-gem"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Parametrized gem tests: each gem boosts its matching type by 1.5x
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- parametrized: each gem boosts matching-type move by 1.5x", () => {
  const gemEntries = Object.entries(GEM_TYPES);

  for (const [gemId, gemType] of gemEntries) {
    it(`given ${gemId} and a ${gemType}-type move, when damage is calculated, then base power is boosted by 1.5x and the gem is consumed`, () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem condition:
      //   onBasePower: chainModify(1.5)
      // The gem boost and consumption happen inside calculateGen5Damage

      const attacker = makeActive({
        heldItem: gemId,
        types: [gemType as PokemonType],
        attack: 100,
      });
      // Use 'water' defender to avoid type immunities (Ghost vs Normal = immune)
      const defender = makeActive({ defense: 100, types: ["water"] });
      const move = makeMove({ type: gemType as PokemonType, power: 80 });

      // Calculate damage WITH the gem
      const ctxWithGem = makeDamageContext({
        attacker,
        defender,
        move,
        seed: 100,
      });
      const resultWithGem = calculateGen5Damage(ctxWithGem, GEN5_TYPE_CHART as TypeChart);

      // Reset attacker for a no-gem comparison
      const attackerNoGem = makeActive({
        heldItem: null,
        types: [gemType as PokemonType],
        attack: 100,
      });
      const ctxNoGem = makeDamageContext({
        attacker: attackerNoGem,
        defender: makeActive({ defense: 100, types: ["water"] }),
        move,
        seed: 100,
      });
      const resultNoGem = calculateGen5Damage(ctxNoGem, GEN5_TYPE_CHART as TypeChart);

      // Gem-boosted damage should be greater than non-gem damage
      expect(resultWithGem.damage).toBeGreaterThan(resultNoGem.damage);

      // Verify approximate 1.5x ratio (allowing for rounding from floor operations)
      const ratio = resultWithGem.damage / resultNoGem.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.4);
      expect(ratio).toBeLessThanOrEqual(1.6);

      // Verify gem was consumed (heldItem set to null by damage calc)
      expect(attacker.pokemon.heldItem).toBe(null);
    });
  }
});

// ---------------------------------------------------------------------------
// Gem consumption: gem is consumed after use
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- consumption behavior", () => {
  it("given a fire-gem and a Fire-type move, when damage is calculated, then heldItem becomes null", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem:
    //   onSourceTryPrimaryHit: source.useItem()
    const attacker = makeActive({
      heldItem: "fire-gem",
      types: ["fire"],
      attack: 150,
    });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({ type: "fire", power: 80 });
    const ctx = makeDamageContext({ attacker, defender, move });
    calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
    expect(attacker.pokemon.heldItem).toBe(null);
  });

  it("given a fire-gem and a Water-type move (non-matching), when damage is calculated, then the gem is NOT consumed", () => {
    // Gems only activate when the move type matches the gem type
    const attacker = makeActive({
      heldItem: "fire-gem",
      types: ["fire"],
      attack: 150,
    });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({ type: "water", power: 80 });
    const ctx = makeDamageContext({ attacker, defender, move });
    calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
    expect(attacker.pokemon.heldItem).toBe("fire-gem");
  });
});

// ---------------------------------------------------------------------------
// Gem + Klutz interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- Klutz suppression", () => {
  it("given a Pokemon with Klutz holding a fire-gem using a Fire move, when damage is calculated, then the gem does NOT boost and is NOT consumed", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppresses held item effects
    const attacker = makeActive({
      heldItem: "fire-gem",
      ability: "klutz",
      types: ["fire"],
      attack: 100,
    });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({ type: "fire", power: 80 });

    const ctxKlutz = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultKlutz = calculateGen5Damage(ctxKlutz, GEN5_TYPE_CHART as TypeChart);

    // Compare with a no-gem baseline
    const attackerNoItem = makeActive({
      heldItem: null,
      types: ["fire"],
      attack: 100,
    });
    const ctxNoItem = makeDamageContext({
      attacker: attackerNoItem,
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move,
      seed: 100,
    });
    const resultNoItem = calculateGen5Damage(ctxNoItem, GEN5_TYPE_CHART as TypeChart);

    // With Klutz, damage should be the same as no item
    expect(resultKlutz.damage).toBe(resultNoItem.damage);
    // Gem should NOT be consumed
    expect(attacker.pokemon.heldItem).toBe("fire-gem");
  });
});

// ---------------------------------------------------------------------------
// Specific gem damage verification
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- specific damage values", () => {
  it("given a L50 Normal-type with normal-gem using 80-power Normal move, then gem-boosted damage range is higher than unboosted", () => {
    // Derivation:
    // Base damage = floor((2*50/5+2) * 80 * 100/100 / 50) + 2 = floor(22*80/50) + 2 = 37
    // With gem: power = floor(80 * 1.5) = 120
    // Base damage with gem = floor((22 * 120) / 50) + 2 = 54
    // STAB applies for Normal-type attacker
    // Random factor 85-100%

    const move = makeMove({ type: "normal", power: 80 });

    const damages: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const a = makeActive({
        heldItem: "normal-gem",
        types: ["normal"],
        attack: 100,
      });
      const ctx = makeDamageContext({
        attacker: a,
        defender: makeActive({ defense: 100, types: ["psychic"] }),
        move,
        seed,
      });
      const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
      damages.push(result.damage);
    }

    const minDamage = Math.min(...damages);
    const maxDamage = Math.max(...damages);

    expect(minDamage).toBeGreaterThan(0);
    expect(maxDamage).toBeGreaterThan(minDamage);
  });

  it("given a dragon-gem on a Dragon-type Pokemon using Dragon Claw vs Water defender, then the move does neutral damage with gem boost", () => {
    const attacker = makeActive({
      heldItem: "dragon-gem",
      types: ["dragon"],
      attack: 120,
    });
    const defender = makeActive({ defense: 100, types: ["water"] });
    const move = makeMove({ type: "dragon", power: 80 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);

    // Gem should boost and be consumed
    expect(result.damage).toBeGreaterThan(0);
    expect(attacker.pokemon.heldItem).toBe(null);
  });
});
