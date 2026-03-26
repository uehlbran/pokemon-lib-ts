import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createEvs,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  createGen5DataManager,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "@pokemon-lib-ts/gen5";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEM_TYPES } from "../src/Gen5Items";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager();
const itemIds = GEN5_ITEM_IDS;
const moveIds = GEN5_MOVE_IDS;
const speciesIds = GEN5_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.pikachu);
const defaultNature = dataManager.getNature(GEN5_NATURE_IDS.hardy).id;
const syntheticGemTemplate = dataManager.getMove(moveIds.triAttack);

function createOnFieldPokemon(overrides: {
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
      speciesId: overrides.speciesId ?? defaultSpecies.id,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: defaultNature,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: defaultSpecies.baseFriendship,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    types: overrides.types ?? [...defaultSpecies.types],
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

function makeSyntheticGemMove(type: PokemonType): MoveData {
  // Synthetic probe: the gem suite only needs a stable, owned Gen 5 base move
  // whose type can be varied to isolate the gem boost behavior.
  return {
    ...syntheticGemTemplate,
    id: `synthetic-${type}-gem-probe`,
    displayName: syntheticGemTemplate.displayName,
    type,
    flags: { ...syntheticGemTemplate.flags },
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
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move: overrides.move ?? dataManager.getMove(moveIds.triAttack),
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

      const attacker = createOnFieldPokemon({
        heldItem: gemId,
        types: [gemType as PokemonType],
        attack: 100,
      });
      // Synthetic probe: use a real water-type defender species to keep the
      // gem comparison from colliding with immunity edge cases.
      const defender = createOnFieldPokemon({
        defense: 100,
        speciesId: speciesIds.vaporeon,
        types: [...dataManager.getSpecies(speciesIds.vaporeon).types],
      });
      const move = makeSyntheticGemMove(gemType as PokemonType);

      // Calculate damage WITH the gem
      const ctxWithGem = makeDamageContext({
        attacker,
        defender,
        move,
        seed: 100,
      });
      const resultWithGem = calculateGen5Damage(ctxWithGem, GEN5_TYPE_CHART as TypeChart);

      // Reset attacker for a no-gem comparison
      const attackerNoGem = createOnFieldPokemon({
        heldItem: null,
        types: [gemType as PokemonType],
        attack: 100,
      });
      const ctxNoGem = makeDamageContext({
        attacker: attackerNoGem,
        defender: createOnFieldPokemon({
          defense: 100,
          speciesId: speciesIds.vaporeon,
          types: [...dataManager.getSpecies(speciesIds.vaporeon).types],
        }),
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
  it("given a fire gem and a Fire-type move, when damage is calculated, then heldItem becomes null", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem:
    //   onSourceTryPrimaryHit: source.useItem()
    const attacker = createOnFieldPokemon({
      heldItem: itemIds.fireGem,
      speciesId: speciesIds.charizard,
      types: [...dataManager.getSpecies(speciesIds.charizard).types],
      attack: 150,
    });
    const defender = createOnFieldPokemon({
      defense: 100,
      speciesId: speciesIds.porygon,
      types: [...dataManager.getSpecies(speciesIds.porygon).types],
    });
    const move = dataManager.getMove(moveIds.firePunch);
    const ctx = makeDamageContext({ attacker, defender, move });
    calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
    expect(attacker.pokemon.heldItem).toBe(null);
  });

  it("given a fire gem and a Water-type move (non-matching), when damage is calculated, then the gem is NOT consumed", () => {
    // Gems only activate when the move type matches the gem type
    const attacker = createOnFieldPokemon({
      heldItem: itemIds.fireGem,
      speciesId: speciesIds.charizard,
      types: [...dataManager.getSpecies(speciesIds.charizard).types],
      attack: 150,
    });
    const defender = createOnFieldPokemon({
      defense: 100,
      speciesId: speciesIds.porygon,
      types: [...dataManager.getSpecies(speciesIds.porygon).types],
    });
    const move = dataManager.getMove(moveIds.waterPulse);
    const ctx = makeDamageContext({ attacker, defender, move });
    calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
    expect(attacker.pokemon.heldItem).toBe(itemIds.fireGem);
  });
});

// ---------------------------------------------------------------------------
// Gem + Klutz interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- Klutz suppression", () => {
  it("given a Pokemon with Klutz holding a fire-gem using a Fire move, when damage is calculated, then the gem does NOT boost and is NOT consumed", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppresses held item effects
    const attacker = createOnFieldPokemon({
      heldItem: itemIds.fireGem,
      ability: CORE_ABILITY_IDS.klutz,
      speciesId: speciesIds.charizard,
      types: [...dataManager.getSpecies(speciesIds.charizard).types],
      attack: 100,
    });
    const defender = createOnFieldPokemon({
      defense: 100,
      speciesId: speciesIds.porygon,
      types: [...dataManager.getSpecies(speciesIds.porygon).types],
    });
    const move = dataManager.getMove(moveIds.firePunch);

    const ctxKlutz = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultKlutz = calculateGen5Damage(ctxKlutz, GEN5_TYPE_CHART as TypeChart);

    // Compare with a no-gem baseline
    const attackerNoItem = createOnFieldPokemon({
      heldItem: null,
      speciesId: speciesIds.charizard,
      types: [...dataManager.getSpecies(speciesIds.charizard).types],
      attack: 100,
    });
    const ctxNoItem = makeDamageContext({
      attacker: attackerNoItem,
      defender: createOnFieldPokemon({
        defense: 100,
        speciesId: speciesIds.porygon,
        types: [...dataManager.getSpecies(speciesIds.porygon).types],
      }),
      move,
      seed: 100,
    });
    const resultNoItem = calculateGen5Damage(ctxNoItem, GEN5_TYPE_CHART as TypeChart);

    // With Klutz, damage should be the same as no item
    expect(resultKlutz.damage).toBe(resultNoItem.damage);
    // Gem should NOT be consumed
    expect(attacker.pokemon.heldItem).toBe(itemIds.fireGem);
  });
});

// ---------------------------------------------------------------------------
// Specific gem damage verification
// ---------------------------------------------------------------------------

describe("Gen 5 Gems -- specific damage values", () => {
  it("given a L50 Normal-type with normal gem using 80-power Tri Attack, then gem-boosted damage range is higher than unboosted", () => {
    const move = dataManager.getMove(moveIds.triAttack);
    const attackerSpecies = dataManager.getSpecies(speciesIds.porygon);

    const damages: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const a = createOnFieldPokemon({
        heldItem: itemIds.normalGem,
        speciesId: attackerSpecies.id,
        types: [...attackerSpecies.types],
        attack: 100,
      });
      const ctx = makeDamageContext({
        attacker: a,
        defender: createOnFieldPokemon({
          defense: 100,
          speciesId: speciesIds.alakazam,
          types: [...dataManager.getSpecies(speciesIds.alakazam).types],
        }),
        move,
        seed,
      });
      const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);
      damages.push(result.damage);
    }

    const minDamage = Math.min(...damages);
    const maxDamage = Math.max(...damages);

    expect(minDamage).toBe(67);
    expect(maxDamage).toBe(81);
  });

  it("given a dragon gem on a Dragon-type Pokemon using Dragon Claw vs Water defender, then the move does neutral damage with gem boost", () => {
    const attacker = createOnFieldPokemon({
      heldItem: itemIds.dragonGem,
      speciesId: speciesIds.kingdra,
      types: [...dataManager.getSpecies(speciesIds.kingdra).types],
      attack: 120,
    });
    const defender = createOnFieldPokemon({
      defense: 100,
      speciesId: speciesIds.vaporeon,
      types: [...dataManager.getSpecies(speciesIds.vaporeon).types],
    });
    const move = dataManager.getMove(moveIds.dragonClaw);
    const attackerNoGem = createOnFieldPokemon({
      heldItem: null,
      speciesId: speciesIds.kingdra,
      types: [...dataManager.getSpecies(speciesIds.kingdra).types],
      attack: 120,
    });
    const resultNoGem = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerNoGem,
        defender: createOnFieldPokemon({
          defense: 100,
          speciesId: speciesIds.vaporeon,
          types: [...dataManager.getSpecies(speciesIds.vaporeon).types],
        }),
        move,
        seed: 42,
      }),
      GEN5_TYPE_CHART as TypeChart,
    );
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART as TypeChart);

    // Gem should boost and be consumed
    // Source: the seeded Gen 5 damage calculation for this exact setup is 61
    // without the gem and 91 with the gem.
    expect(resultNoGem.damage).toBe(61);
    expect(result.damage).toBe(91);
    expect(result.damage).toBeGreaterThan(resultNoGem.damage);
    expect(attacker.pokemon.heldItem).toBe(null);
  });
});
