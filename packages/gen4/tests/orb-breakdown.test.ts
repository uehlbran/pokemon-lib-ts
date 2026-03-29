import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { createSyntheticOnFieldPokemon } from "./helpers/createSyntheticOnFieldPokemon";

/**
 * Gen 4 Damage Calc — Orb and Light Ball breakdown.itemMultiplier tests.
 *
 * Bug #306 fix: Adamant Orb, Lustrous Orb, Griseous Orb, and Light Ball
 * boost base power but didn't update breakdown.itemMultiplier. This test
 * verifies the breakdown accurately reflects the item contribution.
 *
 * Source: Showdown data/items.ts — Adamant Orb / Lustrous Orb / Griseous Orb onBasePower
 * Source: Showdown Gen 4 mod — Light Ball onBasePower
 * Source: Bulbapedia — Adamant Orb, Lustrous Orb, Griseous Orb, Light Ball
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = opts.hp ?? 200;
  const calculatedStats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };
  return createSyntheticOnFieldPokemon({
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: opts.currentHp ?? maxHp,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    level: opts.level ?? 50,
    nature: GEN4_NATURE_IDS.hardy,
    pokeball: CORE_ITEM_IDS.pokeBall,
    speciesId: opts.speciesId ?? GEN4_SPECIES_IDS.bulbasaur,
    status: opts.status ?? null,
    types: opts.types ?? [CORE_TYPE_IDS.normal],
  });
}

const gen4DataManager = createGen4DataManager();

function getGen4Move(moveId: string): MoveData {
  return gen4DataManager.getMove(moveId);
}

function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc -- Orb/Light Ball breakdown.itemMultiplier (#306)", () => {
  const typeChart = createNeutralTypeChart();

  it("given Dialga holding Adamant Orb using a Dragon-type move, when damage is calculated, then breakdown.itemMultiplier reflects the 1.2x boost", () => {
    // Source: Showdown data/items.ts -- Adamant Orb onBasePower: basePower * 0x1333 / 0x1000
    // Source: Bulbapedia -- Adamant Orb boosts Dialga's Dragon/Steel moves by 20%
    // 4915/4096 = ~1.19995... (the exact Gen 4 fraction for 1.2x)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.steel, CORE_TYPE_IDS.dragon],
      heldItem: GEN4_ITEM_IDS.adamantOrb,
      speciesId: GEN4_SPECIES_IDS.dialga,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.dragonClaw);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Palkia holding Lustrous Orb using a Water-type move, when damage is calculated, then breakdown.itemMultiplier reflects the 1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb onBasePower: basePower * 0x1333 / 0x1000
    // Source: Bulbapedia -- Lustrous Orb boosts Palkia's Water/Dragon moves by 20%
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.dragon],
      heldItem: GEN4_ITEM_IDS.lustrousOrb,
      speciesId: GEN4_SPECIES_IDS.palkia,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.surf);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Giratina holding Griseous Orb using a Ghost-type move, when damage is calculated, then breakdown.itemMultiplier reflects the 1.2x boost", () => {
    // Source: Showdown Gen 4 mod -- Griseous Orb onBasePower: Ghost/Dragon for Giratina
    // Source: Bulbapedia -- Griseous Orb boosts Giratina's Ghost/Dragon moves by 20%
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.dragon],
      heldItem: GEN4_ITEM_IDS.griseousOrb,
      speciesId: GEN4_SPECIES_IDS.giratina,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.shadowBall);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Pikachu holding Light Ball using a physical move, when damage is calculated, then breakdown.itemMultiplier reflects the 2x boost", () => {
    // Source: Showdown Gen 4 mod -- Light Ball onBasePower: Pikachu => chainModify(2)
    // Source: Bulbapedia -- Light Ball: doubles base power for Pikachu in Gen 4
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.electric],
      heldItem: GEN4_ITEM_IDS.lightBall,
      speciesId: GEN4_SPECIES_IDS.pikachu,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.thunderbolt);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBe(2);
  });

  it("given Dialga holding Adamant Orb using a Fire-type move (non-matching type), when damage is calculated, then breakdown.itemMultiplier is 1 (no boost)", () => {
    // Source: Bulbapedia -- Adamant Orb only boosts Dragon and Steel moves
    // Fire is neither Dragon nor Steel, so no boost should apply
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.steel, CORE_TYPE_IDS.dragon],
      heldItem: GEN4_ITEM_IDS.adamantOrb,
      speciesId: GEN4_SPECIES_IDS.dialga,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.flamethrower);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBe(1);
  });

  it("given Dialga with Klutz holding Adamant Orb using a Dragon-type move, when damage is calculated, then breakdown.itemMultiplier is 1 (Klutz suppresses item)", () => {
    // Source: Showdown -- Klutz suppresses held item effects
    // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.steel, CORE_TYPE_IDS.dragon],
      heldItem: GEN4_ITEM_IDS.adamantOrb,
      speciesId: GEN4_SPECIES_IDS.dialga,
      ability: GEN4_ABILITY_IDS.klutz,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.dragonClaw);
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown?.itemMultiplier).toBe(1);
  });
});
