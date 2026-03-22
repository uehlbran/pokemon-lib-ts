import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";

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
  status?: "burn" | "poison" | "paralysis" | "sleep" | "freeze" | null;
  speciesId?: number;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
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
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    },
    effect: null,
    description: "",
    generation: 4,
  } as MoveData;
}

function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
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
      types: ["steel", "dragon"],
      heldItem: "adamant-orb",
      speciesId: 483, // Dialga
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "dragon", power: 80 });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Palkia holding Lustrous Orb using a Water-type move, when damage is calculated, then breakdown.itemMultiplier reflects the 1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb onBasePower: basePower * 0x1333 / 0x1000
    // Source: Bulbapedia -- Lustrous Orb boosts Palkia's Water/Dragon moves by 20%
    const attacker = createActivePokemon({
      types: ["water", "dragon"],
      heldItem: "lustrous-orb",
      speciesId: 484, // Palkia
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "water", power: 80, category: "special" });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Giratina holding Griseous Orb using a Ghost-type move, when damage is calculated, then breakdown.itemMultiplier reflects the 1.2x boost", () => {
    // Source: Showdown Gen 4 mod -- Griseous Orb onBasePower: Ghost/Dragon for Giratina
    // Source: Bulbapedia -- Griseous Orb boosts Giratina's Ghost/Dragon moves by 20%
    const attacker = createActivePokemon({
      types: ["ghost", "dragon"],
      heldItem: "griseous-orb",
      speciesId: 487, // Giratina
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "ghost", power: 80, category: "special" });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBeCloseTo(4915 / 4096, 5);
  });

  it("given Pikachu holding Light Ball using a physical move, when damage is calculated, then breakdown.itemMultiplier reflects the 2x boost", () => {
    // Source: Showdown Gen 4 mod -- Light Ball onBasePower: Pikachu => chainModify(2)
    // Source: Bulbapedia -- Light Ball: doubles base power for Pikachu in Gen 4
    const attacker = createActivePokemon({
      types: ["electric"],
      heldItem: "light-ball",
      speciesId: 25, // Pikachu
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "electric", power: 40, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBe(2);
  });

  it("given Dialga holding Adamant Orb using a Fire-type move (non-matching type), when damage is calculated, then breakdown.itemMultiplier is 1 (no boost)", () => {
    // Source: Bulbapedia -- Adamant Orb only boosts Dragon and Steel moves
    // Fire is neither Dragon nor Steel, so no boost should apply
    const attacker = createActivePokemon({
      types: ["steel", "dragon"],
      heldItem: "adamant-orb",
      speciesId: 483, // Dialga
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "fire", power: 80, category: "special" });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBe(1);
  });

  it("given Dialga with Klutz holding Adamant Orb using a Dragon-type move, when damage is calculated, then breakdown.itemMultiplier is 1 (Klutz suppresses item)", () => {
    // Source: Showdown -- Klutz suppresses held item effects
    // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
    const attacker = createActivePokemon({
      types: ["steel", "dragon"],
      heldItem: "adamant-orb",
      speciesId: 483, // Dialga
      ability: "klutz",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "dragon", power: 80 });
    const ctx = createDamageContext({ attacker, defender, move });

    const result = calculateGen4Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.itemMultiplier).toBe(1);
  });
});
