import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  GEN3_TYPE_CHART,
} from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";

const dataManager = createGen3DataManager();
const NINETALES = dataManager.getSpecies(GEN3_SPECIES_IDS.ninetales);
const VAPOREON = dataManager.getSpecies(GEN3_SPECIES_IDS.vaporeon);
const FLAMETHROWER = dataManager.getMove(GEN3_MOVE_IDS.flamethrower);
const FIRE_BLAST = dataManager.getMove(GEN3_MOVE_IDS.fireBlast);
const THUNDERBOLT = dataManager.getMove(GEN3_MOVE_IDS.thunderbolt);
const HARDY_NATURE = dataManager.getNature(GEN3_NATURE_IDS.hardy).id;

/**
 * Gen 3 Flash Fire Damage Boost Tests
 *
 * Tests for:
 *   - Flash Fire volatile: 1.5x boost to fire moves when attacker has Flash Fire volatile
 *   - Boost applied post-formula (to damage variable), NOT to the attack stat
 *   - No boost for non-fire moves
 *   - Flash Fire immunity is still handled (separate from boost)
 *
 * Source: pret/pokeemerald src/pokemon.c CalculateBaseDamage — Flash Fire multiplies
 *         the damage variable after base formula/weather but before +2, not the attack stat.
 */

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createSyntheticDamageStats(overrides: {
  hp?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
}) {
  return {
    hp: overrides.hp ?? 200,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: 100,
  };
}

function createOnFieldPokemon(
  speciesId: number,
  opts: {
    level?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    types?: PokemonType[];
    ability?: string;
    heldItem?: string | null;
    status?: string | null;
    hasFlashFire?: boolean;
  } = {},
): ActivePokemon {
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(species, opts.level ?? 50, new SeededRandom(species.id), {
    nature: HARDY_NATURE,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    abilitySlot: "normal1",
    gender: "male",
    isShiny: false,
    moves: [FLAMETHROWER.id],
    heldItem: opts.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.currentHp = 200;
  pokemon.moves = [createMoveSlot(FLAMETHROWER.id, FLAMETHROWER.pp)];
  pokemon.ability = opts.ability ?? CORE_ABILITY_IDS.none;
  pokemon.status = opts.status ?? null;
  pokemon.heldItem = opts.heldItem ?? null;
  pokemon.calculatedStats = createSyntheticDamageStats({
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
  });

  const volatileStatuses = new Map<string, unknown>();
  if (opts.hasFlashFire) {
    volatileStatuses.set(CORE_VOLATILE_IDS.flashFire, true);
  }

  const active = createBattleOnFieldPokemon(pokemon, 0, opts.types ?? [...species.types]);
  active.volatileStatuses = volatileStatuses as ActivePokemon["volatileStatuses"];
  active.ability = opts.ability ?? CORE_ABILITY_IDS.none;
  return active;
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: {
      weather: opts.weather ?? null,
    } as DamageContext["state"],
  } as DamageContext;
}

const chart = GEN3_TYPE_CHART;

describe("Gen 3 Flash Fire damage boost", () => {
  it("given attacker with flash-fire volatile, when using Flamethrower, then damage is boosted by 1.5x post-formula", () => {
    // Source: pret/pokeemerald src/pokemon.c CalculateBaseDamage — Flash Fire multiplies
    // the damage variable (after base formula, weather, etc.) NOT the attack stat.
    // The exact seeded Gen 3 damage for this setup is 47.
    const attacker = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spAttack: 100,
      ability: GEN3_ABILITY_IDS.flashFire,
      hasFlashFire: true,
    });
    const defender = createOnFieldPokemon(VAPOREON.id, {
      level: 50,
      spDefense: 100,
    });

    const boostResult = calculateGen3Damage(
      createDamageContext({
        attacker,
        defender,
        move: FLAMETHROWER,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(boostResult.damage).toBe(47);
  });

  it("given attacker with flash-fire volatile and spAttack=107, when using Fire Blast, then post-formula rounding differs from stat-based", () => {
    // Source: pret/pokeemerald src/pokemon.c CalculateBaseDamage — Flash Fire on damage.
    // The exact seeded Gen 3 damage for this setup is 64.
    const attacker = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spAttack: 107,
      ability: GEN3_ABILITY_IDS.flashFire,
      hasFlashFire: true,
    });
    const defender = createOnFieldPokemon(VAPOREON.id, {
      level: 50,
      spDefense: 100,
    });

    const result = calculateGen3Damage(
      createDamageContext({
        attacker,
        defender,
        move: FIRE_BLAST,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(64);
  });

  it("given attacker with flash-fire volatile, when using a non-fire move, then no boost applied", () => {
    // Source: pret/pokeemerald — Flash Fire only boosts fire-type moves.
    // The exact seeded Gen 3 damage for this setup is 86.
    const attacker = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spAttack: 100,
      ability: GEN3_ABILITY_IDS.flashFire,
      hasFlashFire: true,
    });
    const defender = createOnFieldPokemon(VAPOREON.id, {
      level: 50,
      spDefense: 100,
    });

    const result = calculateGen3Damage(
      createDamageContext({
        attacker,
        defender,
        move: THUNDERBOLT,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(86);
  });

  it("given attacker with flash-fire ability but NO volatile, when using Flamethrower, then no boost", () => {
    // Source: pret/pokeemerald — the boost requires the Flash Fire volatile to be set
    // (which happens when absorbing a fire move). Just having the ability is not enough.
    // The exact seeded Gen 3 damage for this setup is 32.
    const attacker = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spAttack: 100,
      ability: GEN3_ABILITY_IDS.flashFire,
      hasFlashFire: false,
    });
    const defender = createOnFieldPokemon(VAPOREON.id, {
      level: 50,
      spDefense: 100,
    });

    const result = calculateGen3Damage(
      createDamageContext({
        attacker,
        defender,
        move: FLAMETHROWER,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(32);
  });

  it("given attacker with flash-fire volatile, when Flamethrower targets a flash-fire defender, then defender is immune (damage 0)", () => {
    // Source: pret/pokeemerald — Flash Fire on defender side grants immunity.
    // The immunity check runs before the boost check.
    const attacker = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spAttack: 100,
      ability: GEN3_ABILITY_IDS.flashFire,
      hasFlashFire: true,
    });
    const defender = createOnFieldPokemon(NINETALES.id, {
      level: 50,
      spDefense: 100,
      ability: GEN3_ABILITY_IDS.flashFire,
    });

    const result = calculateGen3Damage(
      createDamageContext({
        attacker,
        defender,
        move: FLAMETHROWER,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});
