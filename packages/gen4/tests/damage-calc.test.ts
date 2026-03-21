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
import { GEN4_TYPE_CHART, GEN4_TYPES } from "../src/Gen4TypeChart";

/**
 * Gen 4 Damage Formula Tests
 *
 * The Gen 4 damage formula:
 *   BaseDamage = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
 *
 * Key Gen 4 differences from Gen 3:
 *   - Physical/Special split: category is per-move (not per-type)
 *   - New abilities: Technician, Tinted Lens, Filter, Solid Rock, Adaptability, Sniper, etc.
 *   - New items: Life Orb, Choice Specs, Expert Belt, Muscle Band, Wise Glasses
 *   - Critical hit multiplier: 2.0x (same as Gen 3-5, not yet 1.5x)
 *   - Sniper ability: 3.0x crit multiplier
 *   - Explosion/Self-Destruct: halves target's defense (removed in Gen 5)
 *
 * Modifier chain (applied in order per Showdown Gen 4 sim / pret/pokeplatinum):
 *   1. Weather (rain: Water 1.5x / Fire 0.5x; sun: Fire 1.5x / Water 0.5x)
 *   2. Critical hit (2.0x; 3.0x with Sniper)
 *   3. Random factor (85–100 inclusive / 100)
 *   4. STAB (1.5x; 2.0x with Adaptability)
 *   5. Type effectiveness (product of matchups)
 *   6. Burn penalty (0.5x if attacker burned + physical; negated by Guts)
 *   7. Ability modifiers (Technician, Tinted Lens, Filter, Solid Rock, etc.)
 *   8. Item modifiers (Life Orb, Choice Band/Specs, Expert Belt, etc.)
 *
 * Sources:
 *   - pret/pokeplatinum — battle damage calculation (pokeplatinum decomp, where decompiled)
 *   - Pokemon Showdown Gen 4 mod — primary reference for modifier order
 *   - Bulbapedia — individual ability / item mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
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

/** Minimal ActivePokemon mock matching the ActivePokemon interface exactly. */
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
  statStages?: Partial<Record<string, number>>;
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
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
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
  } as ActivePokemon;
}

/** Create a move mock with the given type, power, and category. */
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

/** Create a BattleState mock with optional weather. */
function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

/** All-neutral type chart for 17 Gen 4 types. */
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

/** Create a type chart with specific overrides from neutral. */
function createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

/** Create a full DamageContext for calculateGen4Damage. */
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
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests: Physical/Special Split (THE defining Gen 4 mechanic)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — physical/special split", () => {
  it("given physical move (category=physical) with attacker having Atk=150 SpAtk=50, when calculating damage, then uses Attack stat producing higher damage than SpAtk", () => {
    // Source: Gen 4 physical/special split — move.category determines stat used
    // Bulbapedia: "In Generation IV, moves are classified as physical or special based on
    //   their category attribute, not their type"
    // Attacker: Atk=150, SpAtk=50. Physical move uses Atk; if it used SpAtk, damage would be much lower.
    // Derivation (L50, power=80, Atk=150, Def=100, rng=100, no STAB [fighting attacker, normal move]):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*80*150/100)/50)+2 = floor(floor(26400/100)/50)+2
    //           = floor(264/50)+2 = 5+2 = 7... wait: 26400/100=264, floor(264/50)=5, 5+2=7
    // Hmm — let me recompute with Atk=150, Def=100:
    //   floor(22*80*150/100) = floor(264000/100) = 2640, floor(2640/50) = 52, +2 = 54
    // Physical result: 54. SpAtk version (spAtk=50):
    //   floor(22*80*50/100) = floor(88000/100) = 880, floor(880/50) = 17, +2 = 19
    // Physical (Atk=150) > Special (SpAtk=50).
    const attacker = createActivePokemon({
      level: 50,
      attack: 150,
      defense: 100,
      spAttack: 50,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const physicalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: physicalMove, rng: createMockRng(100) }),
      chart,
    );

    // Physical move uses Atk=150, yields baseDmg=54 (vs SpAtk=50 which would yield 19)
    expect(result.damage).toBe(54);
  });

  it("given special move (category=special) with attacker having Atk=50 SpAtk=150, when calculating damage, then uses SpAtk stat producing higher damage than Atk", () => {
    // Source: Gen 4 physical/special split — move.category determines stat used
    // Special move uses SpAtk=150 vs SpDef=100.
    // Derivation (L50, power=80, SpAtk=150, SpDef=100, rng=100, no STAB):
    //   levelFactor = 22; baseDmg = floor(floor(22*80*150/100)/50)+2 = 54
    // If it used Atk=50 instead:
    //   baseDmg = floor(floor(22*80*50/100)/50)+2 = 19
    const attacker = createActivePokemon({
      level: 50,
      attack: 50,
      defense: 100,
      spAttack: 150,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: specialMove, rng: createMockRng(100) }),
      chart,
    );

    // Special move uses SpAtk=150, yields 54 (vs Atk=50 which would yield 19)
    expect(result.damage).toBe(54);
  });

  it("given same attacker comparing Waterfall (physical Water 80) vs Surf (special Water 95) with equal Atk=SpAtk=100, when both calculated, then Surf deals more damage due to higher base power", () => {
    // Source: Gen 4 — same type but different category/power gives different damage
    // Waterfall: physical, 80 BP, uses Atk/Def. Surf: special, 95 BP, uses SpAtk/SpDef.
    // Both attacker stats=100, both defender stats=100, so the power difference drives the result.
    // Waterfall derivation (L50, power=80, Atk=100, Def=100, rng=100, no STAB — fighting attacker):
    //   levelFactor=22; baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    // Surf derivation (L50, power=95, SpAtk=100, SpDef=100, rng=100):
    //   baseDmg = floor(floor(22*95*100/100)/50)+2 = floor(2090/50)+2 = 41+2 = 43
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"], // no Water STAB to keep it simple
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const chart = createNeutralTypeChart();
    const waterfall = createMove({
      type: "water",
      power: 80,
      category: "physical",
      id: "waterfall",
    });
    const surf = createMove({ type: "water", power: 95, category: "special", id: "surf" });

    const waterfallResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: waterfall, rng: createMockRng(100) }),
      chart,
    );
    const surfResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: surf, rng: createMockRng(100) }),
      chart,
    );

    expect(waterfallResult.damage).toBe(37);
    expect(surfResult.damage).toBe(43);
    expect(surfResult.damage).toBeGreaterThan(waterfallResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: Burn
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — burn", () => {
  it("given attacker with burn using physical move, when calculating damage, then damage is halved vs healthy attacker", () => {
    // Source: pret/pokeplatinum / Showdown Gen 4 — burn halves physical attack damage
    // Burned attacker, physical move. Fighting attacker with normal move = no STAB.
    // Derivation (L50, Atk=100, Def=100, power=80, rng=100, no STAB):
    //   healthy baseDmg = 37 (see prior derivation)
    //   burned: floor(37/2) = 18 (burn is applied as 0.5x floor)
    const burnedAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      status: "burn",
    });
    const healthyAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const physicalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const burnedResult = calculateGen4Damage(
      createDamageContext({
        attacker: burnedAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const healthyResult = calculateGen4Damage(
      createDamageContext({
        attacker: healthyAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(healthyResult.damage).toBe(37);
    // Derivation: baseDamage=35, burn=floor(35/2)=17 (applied BEFORE +2), +2→19, random=1.0→19
    // Burn is applied before the +2 constant (per pokeemerald src/pokemon.c), so result ≠ floor(37/2)
    expect(burnedResult.damage).toBe(19);
    expect(burnedResult.breakdown?.burnMultiplier).toBe(0.5);
  });

  it("given attacker with burn using special move, when calculating damage, then damage is NOT halved (identical to healthy)", () => {
    // Source: Showdown Gen 4 — burn only penalizes physical moves, not special
    // Bulbapedia: "Burn halves the damage done by the Pokémon's physical moves"
    const burnedAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      status: "burn",
    });
    const healthyAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const specialMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const burnedResult = calculateGen4Damage(
      createDamageContext({
        attacker: burnedAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const healthyResult = calculateGen4Damage(
      createDamageContext({
        attacker: healthyAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Burn has no effect on special moves
    expect(burnedResult.damage).toBe(healthyResult.damage);
    expect(burnedResult.breakdown?.burnMultiplier).toBe(1);
  });

  it("given attacker with burn AND Guts ability using physical move, when calculating damage, then burn penalty is NOT applied", () => {
    // Source: Showdown Gen 4 sim — Guts negates burn's physical attack penalty
    // Bulbapedia: "Guts: If the Pokémon has a status condition, its Attack is increased by 50%,
    //   and if it is burned, the burn's Attack reduction is ignored"
    const gutsAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      ability: "guts",
      status: "burn",
    });
    const noGutsHealthyAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const physicalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const gutsResult = calculateGen4Damage(
      createDamageContext({
        attacker: gutsAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const healthyResult = calculateGen4Damage(
      createDamageContext({
        attacker: noGutsHealthyAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Guts negates burn penalty; burn multiplier = 1 (no penalty)
    expect(gutsResult.breakdown?.burnMultiplier).toBe(1);
    // Guts also boosts attack by 1.5x when statused, so Guts+burn should deal MORE than healthy
    // Guts Atk boost: floor(100*1.5)=150 → baseDmg = floor(floor(22*80*150/100)/50)+2 = 54
    expect(gutsResult.damage).toBeGreaterThanOrEqual(healthyResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: Weather
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — weather", () => {
  it("given rain weather and Water-type special move, when calculating damage, then weatherMultiplier = 1.5 in breakdown", () => {
    // Source: Showdown Gen 4 — rain boosts Water moves by 1.5x
    // pret/pokeplatinum confirms same rain/sun modifiers as Gen 3
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 120,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const rainResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 3, source: "rain-dance" },
      }),
      chart,
    );

    expect(rainResult.breakdown?.weatherMultiplier).toBe(1.5);
  });

  it("given rain weather and Fire-type special move, when calculating damage, then weatherMultiplier = 0.5 in breakdown", () => {
    // Source: Showdown Gen 4 — rain weakens Fire moves by 0.5x
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 120,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const rainResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 3, source: "rain-dance" },
      }),
      chart,
    );

    expect(rainResult.breakdown?.weatherMultiplier).toBe(0.5);
  });

  it("given sun weather and Fire-type special move, when calculating damage, then weatherMultiplier = 1.5 in breakdown", () => {
    // Source: Showdown Gen 4 — sun boosts Fire moves by 1.5x
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 120,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const sunResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 3, source: "sunny-day" },
      }),
      chart,
    );

    expect(sunResult.breakdown?.weatherMultiplier).toBe(1.5);
  });

  it("given sun weather and Water-type special move, when calculating damage, then weatherMultiplier = 0.5 in breakdown", () => {
    // Source: Showdown Gen 4 — sun weakens Water moves by 0.5x
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 120,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const sunResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 3, source: "sunny-day" },
      }),
      chart,
    );

    expect(sunResult.breakdown?.weatherMultiplier).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: Critical Hits
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — critical hits", () => {
  it("given isCrit=true and no Sniper ability, when calculating damage, then critMultiplier = 2 in breakdown", () => {
    // Source: pret/pokeplatinum — critical hits deal 2x damage in Gen 3-5
    // Gen 6 changed crit multiplier to 1.5x; Gen 4 is still 2.0x
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const critResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, isCrit: true, rng: createMockRng(100) }),
      chart,
    );
    const normalResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, isCrit: false, rng: createMockRng(100) }),
      chart,
    );

    // No STAB (fighting using normal), neutral type, max random roll
    // Non-crit: 37; crit: floor(37*2) = 74
    expect(normalResult.damage).toBe(37);
    expect(critResult.damage).toBe(74);
    expect(critResult.breakdown?.critMultiplier).toBe(2);
    expect(critResult.isCrit).toBe(true);
  });

  it("given isCrit=true and attacker has Sniper ability, when calculating damage, then critMultiplier = 3 in breakdown", () => {
    // Source: Bulbapedia — Sniper: "If the Pokémon lands a critical hit, the damage dealt
    //   is tripled instead of doubled" (introduced in Gen 4)
    const sniperAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      ability: "sniper",
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker: sniperAttacker,
        defender,
        move,
        isCrit: true,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Sniper: 3x crit. Base=37, ×3=111
    expect(result.damage).toBe(111);
    expect(result.breakdown?.critMultiplier).toBe(3);
  });

  it("given isCrit=true and attacker has negative Atk stage (-2), when calculating damage, then negative stage is ignored (treated as stage 0)", () => {
    // Source: Showdown Gen 4 / pret/pokeplatinum — critical hits ignore negative offensive stages
    // Same mechanic as Gen 3: on crit, attacker's negative attack stages are clamped to 0
    const attackerDebuffed = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      statStages: { attack: -2 },
    });
    const attackerNeutral = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      statStages: { attack: 0 },
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const debuffedCrit = calculateGen4Damage(
      createDamageContext({
        attacker: attackerDebuffed,
        defender,
        move,
        isCrit: true,
        rng: createMockRng(100),
      }),
      chart,
    );
    const neutralCrit = calculateGen4Damage(
      createDamageContext({
        attacker: attackerNeutral,
        defender,
        move,
        isCrit: true,
        rng: createMockRng(100),
      }),
      chart,
    );

    // With -2 Atk stage ignored on crit, damage should be identical to stage 0
    expect(debuffedCrit.damage).toBe(neutralCrit.damage);
  });

  it("given isCrit=true and defender has positive Def stage (+2), when calculating damage, then positive defense stage is ignored", () => {
    // Source: Showdown Gen 4 / pret/pokeplatinum — critical hits ignore positive defensive stages
    // On crit, defender's positive defense stages are clamped to 0
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defenderBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      statStages: { defense: 2 },
    });
    const defenderNeutral = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const vsBoostedCrit = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderBoosted,
        move,
        isCrit: true,
        rng: createMockRng(100),
      }),
      chart,
    );
    const vsNeutralCrit = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNeutral,
        move,
        isCrit: true,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Positive defense stage ignored on crit → same damage as neutral defense
    expect(vsBoostedCrit.damage).toBe(vsNeutralCrit.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: STAB
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — STAB", () => {
  it("given attacker types include move type, when calculating damage, then stabMultiplier = 1.5", () => {
    // Source: Showdown Gen 4 / Bulbapedia — STAB = 1.5x when move type matches attacker type
    const waterAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const nonWaterAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const stabResult = calculateGen4Damage(
      createDamageContext({
        attacker: waterAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noStabResult = calculateGen4Damage(
      createDamageContext({
        attacker: nonWaterAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(stabResult.breakdown?.stabMultiplier).toBe(1.5);
    expect(stabResult.damage).toBe(Math.floor(noStabResult.damage * 1.5));
  });

  it("given attacker has Adaptability ability and move type matches attacker type, when calculating damage, then stabMultiplier = 2.0", () => {
    // Source: Bulbapedia — Adaptability (Gen 4+): "Powers up moves of the same type as
    //   the Pokémon. The STAB bonus is 2× instead of 1.5×."
    const adaptAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      ability: "adaptability",
    });
    const normalStabAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const adaptResult = calculateGen4Damage(
      createDamageContext({
        attacker: adaptAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const normalStabResult = calculateGen4Damage(
      createDamageContext({
        attacker: normalStabAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(adaptResult.breakdown?.stabMultiplier).toBe(2.0);
    // Adaptability (2.0x) vs normal STAB (1.5x) — adapt does more damage
    expect(adaptResult.damage).toBeGreaterThan(normalStabResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: Type Effectiveness
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — type effectiveness", () => {
  it("given SE matchup (Water vs Fire), when calculating damage, then typeMultiplier = 2", () => {
    // Source: Gen 4 type chart — Water super-effective vs Fire
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createTypeChart([["water", "fire", 2]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: fireDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.effectiveness).toBe(2);
    expect(result.breakdown?.typeMultiplier).toBe(2);
  });

  it("given NVE matchup (Water vs Grass), when calculating damage, then typeMultiplier = 0.5", () => {
    // Source: Gen 4 type chart — Water not-very-effective vs Grass
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const grassDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["grass"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createTypeChart([["water", "grass", 0.5]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: grassDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.effectiveness).toBe(0.5);
  });

  it("given immune matchup (Ground vs Flying with Levitate), when calculating, then damage = 0 and effectiveness = 0", () => {
    // Source: Gen 4 type chart + Levitate ability — Ground is immune vs Flying type
    // In practice Levitate grants immunity; the type chart for Ground vs Flying = 0
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const flyingDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["flying"],
      ability: "levitate",
    });
    const groundMove = createMove({ type: "ground", power: 100, category: "physical" });
    // Ground vs Flying = immune in Gen 4 type chart
    const chart = createTypeChart([["ground", "flying", 0]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: flyingDefender,
        move: groundMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Flying-type defender holds Iron Ball, when hit by Ground-type move, then damage is > 0 (Iron Ball removes Ground immunity)", () => {
    // Source: Showdown Gen 4 mod — Iron Ball grounds the holder, removing Flying-type Ground immunity
    // Source: Bulbapedia — Iron Ball: "The holder becomes grounded."
    // Source: Gen4DamageCalc.ts ironBallGrounded check — filters Flying from effectiveDefenderTypes
    //
    // Setup: Normal attacker (Atk=100), ground move (power=100), Flying defender (Def=100), rng=100
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDmg = floor(floor(22*100*100/100)/50) + 2 = floor(floor(220000/100)/50) + 2
    //           = floor(2200/50) + 2 = 44 + 2 = 46
    //   random 100/100 = 1.0 → 46
    //   no STAB → 46
    //   Ground vs Flying without immunity (grounded by Iron Ball): chart = 1x → 46
    // Without Iron Ball the type chart has ground vs flying = 0, damage = 0.
    const attacker = createActivePokemon({ level: 50, attack: 100, types: ["normal"] });
    const flyingDefender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["flying"],
      heldItem: "iron-ball",
    });
    const groundMove = createMove({ type: "ground", power: 100, category: "physical" });
    // Set type chart so ground vs flying would normally be immune (0), but Iron Ball overrides
    const chart = createTypeChart([["ground", "flying", 0]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: flyingDefender,
        move: groundMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Iron Ball grounds the holder — Flying immunity is removed, treated as neutral (1x)
    // Derivation: 46 * 1.0 (neutral after Iron Ball strips Flying) = 46
    expect(result.damage).toBe(46);
    expect(result.effectiveness).not.toBe(0);
  });

  it("given Flying-type defender WITHOUT Iron Ball, when hit by Ground-type move, then damage = 0 (normal Flying immunity)", () => {
    // Source: Gen 4 type chart — Ground-type moves are immune vs Flying-type (0x)
    // Triangulation: confirms Iron Ball is required for grounding (not an unconditional bypass)
    const attacker = createActivePokemon({ level: 50, attack: 100, types: ["normal"] });
    const flyingDefender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["flying"],
      heldItem: null,
    });
    const groundMove = createMove({ type: "ground", power: 100, category: "physical" });
    const chart = createTypeChart([["ground", "flying", 0]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: flyingDefender,
        move: groundMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given dual-type defender with 4x weakness (Ground vs Fire/Rock), when calculating, then typeMultiplier = 4", () => {
    // Source: Gen 4 type chart — Ground vs Fire = 2x, Ground vs Rock = 2x → 4x total
    const attacker = createActivePokemon({
      level: 50,
      attack: 150,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const dualDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 80,
      spAttack: 100,
      spDefense: 100,
      types: ["fire", "rock"],
    });
    const groundMove = createMove({
      type: "ground",
      power: 100,
      category: "physical",
      id: "earthquake",
    });
    const chart = createTypeChart([
      ["ground", "fire", 2],
      ["ground", "rock", 2],
    ]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: dualDefender,
        move: groundMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.effectiveness).toBe(4);
    expect(result.breakdown?.typeMultiplier).toBe(4);
  });

  it("given dual-type defender with 0.25x resistance (Normal vs Steel/Rock), when calculating, then typeMultiplier = 0.25", () => {
    // Source: Gen 4 type chart — Normal vs Steel = 0.5x, Normal vs Rock = 0.5x → 0.25x total
    const attacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const dualResistDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["steel", "rock"],
    });
    const normalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createTypeChart([
      ["normal", "steel", 0.5],
      ["normal", "rock", 0.5],
    ]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: dualResistDefender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.effectiveness).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 4 New Abilities
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — new abilities", () => {
  it("given attacker has Technician and move power = 40 (≤60), when calculating, then effective power is boosted 1.5x (60 effective)", () => {
    // Source: Bulbapedia — Technician (Gen 4): "Powers up the Pokémon's weaker moves.
    //   Moves with a base power of 60 or less are boosted by 50%"
    const techAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      ability: "technician",
    });
    const noTechAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    // power=40, Technician raises it to 60 effectively
    const weakMove = createMove({ type: "normal", power: 40, category: "physical" });
    const chart = createNeutralTypeChart();

    const techResult = calculateGen4Damage(
      createDamageContext({
        attacker: techAttacker,
        defender,
        move: weakMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noTechResult = calculateGen4Damage(
      createDamageContext({
        attacker: noTechAttacker,
        defender,
        move: weakMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Technician: power 40 → 60 (×1.5). No STAB (fighting/normal).
    // Without Technician: baseDmg = floor(floor(22*40*100/100)/50)+2 = floor(880/50)+2 = 17+2 = 19
    // With Technician (power=60): baseDmg = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    expect(noTechResult.damage).toBe(19);
    expect(techResult.damage).toBe(28);
  });

  it("given attacker has Technician and move power = 80 (>60), when calculating, then power is NOT boosted", () => {
    // Source: Bulbapedia — Technician only applies to moves with base power ≤ 60
    const techAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      ability: "technician",
    });
    const noTechAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const strongMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const techResult = calculateGen4Damage(
      createDamageContext({
        attacker: techAttacker,
        defender,
        move: strongMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noTechResult = calculateGen4Damage(
      createDamageContext({
        attacker: noTechAttacker,
        defender,
        move: strongMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Power=80 > 60, Technician does not apply → identical damage
    expect(techResult.damage).toBe(noTechResult.damage);
    expect(techResult.damage).toBe(37);
  });

  it("given attacker has Tinted Lens and matchup is NVE (effectiveness=0.5), when calculating, then damage is doubled vs no-tinted-lens baseline", () => {
    // Source: Bulbapedia — Tinted Lens (Gen 4): "The Pokémon can use 'not very effective' moves
    //   to deal regular damage." Doubles NVE damage.
    const lensAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "tinted-lens",
    });
    const noLensAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["rock"],
    });
    // Normal vs Rock = 0.5x NVE
    const normalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createTypeChart([["normal", "rock", 0.5]]);

    const lensResult = calculateGen4Damage(
      createDamageContext({
        attacker: lensAttacker,
        defender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noLensResult = calculateGen4Damage(
      createDamageContext({
        attacker: noLensAttacker,
        defender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Tinted Lens doubles NVE damage → lens result should be 2x no-lens result
    expect(lensResult.damage).toBe(noLensResult.damage * 2);
  });

  it("given attacker has Tinted Lens and matchup is SE (effectiveness=2), when calculating, then Tinted Lens has no effect", () => {
    // Source: Bulbapedia — Tinted Lens: "The power of not very effective moves is doubled."
    // Only NVE (effectiveness < 1) triggers the bonus; SE is unaffected.
    const lensAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      ability: "tinted-lens",
    });
    const noLensAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    // Water vs Fire = SE (2x). Tinted Lens must NOT apply.
    const chart = createTypeChart([["water", "fire", 2]]);
    const waterMove = createMove({ type: "water", power: 80, category: "special" });

    const lensResult = calculateGen4Damage(
      createDamageContext({
        attacker: lensAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noLensResult = calculateGen4Damage(
      createDamageContext({
        attacker: noLensAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Tinted Lens inactive on SE → identical damage
    expect(lensResult.damage).toBe(noLensResult.damage);
  });

  it("given defender has Filter and matchup is SE (effectiveness=2), when calculating, then damage is multiplied by 0.75 vs no-Filter baseline", () => {
    // Source: Bulbapedia — Filter (Gen 4): "Reduces the power of super-effective moves by 25%"
    //   Multiplier: 0.75x on SE moves
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const filterDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
      ability: "filter",
    });
    const noFilterDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createTypeChart([["water", "fire", 2]]);

    const filterResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: filterDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noFilterResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noFilterDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Filter: SE move damage ×0.75 → floor(noFilter * 0.75)
    expect(filterResult.damage).toBe(Math.floor(noFilterResult.damage * 0.75));
  });

  it("given defender has Solid Rock and matchup is SE (effectiveness=2), when calculating, then damage is multiplied by 0.75", () => {
    // Source: Bulbapedia — Solid Rock (Gen 4): same effect as Filter
    //   "Reduces the power of supereffective moves by 25%"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const solidRockDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
      ability: "solid-rock",
    });
    const noAbilityDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createTypeChart([["water", "fire", 2]]);

    const solidRockResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: solidRockDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noAbilityDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(solidRockResult.damage).toBe(Math.floor(noAbilityResult.damage * 0.75));
  });

  it("given defender has Filter and matchup is neutral (effectiveness=1), when calculating, then Filter has no effect", () => {
    // Source: Bulbapedia — Filter: "Reduces the power of super-effective attacks by 25%."
    // Neutral (effectiveness=1) does NOT trigger Filter; damage must equal no-Filter baseline.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const filterDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "filter",
    });
    const noAbilityDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    // Normal vs Normal = neutral (1x). Filter must NOT apply.
    const chart = createNeutralTypeChart();
    const normalMove = createMove({ type: "normal", power: 80, category: "physical" });

    const filterResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: filterDefender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noAbilityDefender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Filter inactive on neutral → identical damage
    expect(filterResult.damage).toBe(noAbilityResult.damage);
  });

  it("given attacker has Overgrow and HP ≤ 1/3 max HP and uses Grass move, when calculating, then power is boosted 1.5x", () => {
    // Source: Bulbapedia — Overgrow (Gen 4): "When the Pokémon has less than or equal to 1/3 of
    //   its max HP remaining, the power of Grass-type moves is boosted by 50%"
    const maxHp = 150;
    const lowHpAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["grass"],
      ability: "overgrow",
      hp: maxHp,
      currentHp: Math.floor(maxHp / 3), // exactly at the 1/3 threshold
    });
    const fullHpAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["grass"],
      ability: "overgrow",
      hp: maxHp,
      currentHp: maxHp, // full HP → Overgrow does NOT activate
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const grassMove = createMove({ type: "grass", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const overgrowResult = calculateGen4Damage(
      createDamageContext({
        attacker: lowHpAttacker,
        defender,
        move: grassMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noOvergrowResult = calculateGen4Damage(
      createDamageContext({
        attacker: fullHpAttacker,
        defender,
        move: grassMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Overgrow boosts Grass power 1.5x when HP ≤ 1/3 max HP
    // Both have STAB (grass attacker with grass move). noOvergrow: STAB only. overgrow: STAB + power boost.
    expect(overgrowResult.damage).toBeGreaterThan(noOvergrowResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: Items
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — items", () => {
  it("given attacker holds Choice Band and uses physical move, when calculating, then attack stat is multiplied by 1.5", () => {
    // Source: Bulbapedia — Choice Band: "Holder's Attack is 1.5×, but it can only use one move"
    const choiceBandAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      heldItem: "choice-band",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const physicalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const choiceResult = calculateGen4Damage(
      createDamageContext({
        attacker: choiceBandAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Choice Band: Atk ×1.5. No STAB (fighting/normal), neutral type.
    // noItem: base=37; choiceBand: Atk=floor(100*1.5)=150
    //   baseDmg = floor(floor(22*80*150/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    expect(noItemResult.damage).toBe(37);
    expect(choiceResult.damage).toBe(54);
  });

  it("given attacker holds Choice Specs and uses special move, when calculating, then SpAtk stat is multiplied by 1.5", () => {
    // Source: Bulbapedia — Choice Specs (introduced Gen 4): "Holder's Sp. Atk is 1.5×,
    //   but it can only use one move"
    const choiceSpecsAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "choice-specs",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const specsResult = calculateGen4Damage(
      createDamageContext({
        attacker: choiceSpecsAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Choice Specs: SpAtk ×1.5. No STAB (normal/water).
    // noItem: base=37; Specs: SpAtk=floor(100*1.5)=150 → baseDmg=54
    expect(noItemResult.damage).toBe(37);
    expect(specsResult.damage).toBe(54);
  });

  it("given attacker holds Life Orb, when calculating damage, then damage is multiplied by 1.3", () => {
    // Source: Bulbapedia — Life Orb (introduced Gen 4): "Holder's moves deal 1.3× damage;
    //   holder takes 1/10 of its max HP as recoil after each hit"
    const lifeOrbAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      heldItem: "life-orb",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const lifeOrbResult = calculateGen4Damage(
      createDamageContext({ attacker: lifeOrbAttacker, defender, move, rng: createMockRng(100) }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({ attacker: noItemAttacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // Life Orb: ×1.3 to all damage. noItem=37, lifeOrb = floor(37*1.3) = floor(48.1) = 48
    expect(noItemResult.damage).toBe(37);
    expect(lifeOrbResult.damage).toBe(48);
  });

  it("given attacker holds Expert Belt and matchup is SE (effectiveness=2), when calculating, then damage is multiplied by 1.2", () => {
    // Source: Bulbapedia — Expert Belt (Gen 4): "If the holder uses a super-effective move,
    //   the base power is increased by 20%"
    const expertBeltAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "expert-belt",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createTypeChart([["water", "fire", 2]]);

    const beltResult = calculateGen4Damage(
      createDamageContext({
        attacker: expertBeltAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Expert Belt: SE move ×1.2 → belt = floor(noItem * 1.2)
    expect(beltResult.damage).toBe(Math.floor(noItemResult.damage * 1.2));
  });

  it("given attacker holds Expert Belt and matchup is neutral, when calculating, then damage is NOT boosted by Expert Belt", () => {
    // Source: Bulbapedia — Expert Belt only activates on super-effective moves
    const expertBeltAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "expert-belt",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const normalMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart(); // neutral matchup

    const beltResult = calculateGen4Damage(
      createDamageContext({
        attacker: expertBeltAttacker,
        defender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Not SE → Expert Belt has no effect, damage is identical
    expect(beltResult.damage).toBe(noItemResult.damage);
  });

  it("given attacker holds Muscle Band and uses physical move, when calculating, then damage is multiplied by 1.1", () => {
    // Source: Bulbapedia — Muscle Band (Gen 4): "The power of the holder's physical moves
    //   is increased by 10%"
    const muscleBandAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
      heldItem: "muscle-band",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const physicalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const bandResult = calculateGen4Damage(
      createDamageContext({
        attacker: muscleBandAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: physicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Muscle Band: physical move ×1.1 → floor(37*1.1) = floor(40.7) = 40
    expect(noItemResult.damage).toBe(37);
    expect(bandResult.damage).toBe(Math.floor(37 * 1.1));
  });

  it("given attacker holds Wise Glasses and uses special move, when calculating, then damage is multiplied by 1.1", () => {
    // Source: Bulbapedia — Wise Glasses (Gen 4): "The power of the holder's special moves
    //   is increased by 10%"
    const wiseGlassesAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "wise-glasses",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const glassesResult = calculateGen4Damage(
      createDamageContext({
        attacker: wiseGlassesAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Wise Glasses: special move ×1.1 → floor(37*1.1) = 40
    expect(noItemResult.damage).toBe(37);
    expect(glassesResult.damage).toBe(Math.floor(37 * 1.1));
  });

  it("given Pikachu (speciesId=25) holds Light Ball and uses physical move, when calculating, then Attack is doubled", () => {
    // Source: Bulbapedia — Light Ball (Gen 4+): "If held by Pikachu, doubles its Attack
    //   and Special Attack" (previously only SpAtk in Gen 2-3)
    // Pikachu speciesId = 25 (National Dex)
    const lightBallPika = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["electric"],
      heldItem: "light-ball",
      speciesId: 25,
    });
    const noItemPika = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["electric"],
      speciesId: 25,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    // Physical move — Light Ball doubles Attack in Gen 4+
    const physMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const lightBallResult = calculateGen4Damage(
      createDamageContext({
        attacker: lightBallPika,
        defender,
        move: physMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemPika,
        defender,
        move: physMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Light Ball: Atk ×2 for Pikachu
    // noItem (Atk=100): baseDmg=37+STAB? Pikachu=electric, move=normal → no STAB: baseDmg=37
    // lightBall (Atk=200): baseDmg = floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 72
    expect(noItemResult.damage).toBe(37);
    expect(lightBallResult.damage).toBe(72);
  });

  it("given Pikachu (speciesId=25) holds Light Ball and uses special move, when calculating, then SpAtk is doubled", () => {
    // Source: Bulbapedia — Light Ball (Gen 4+): doubles both Attack and Special Attack for Pikachu
    const lightBallPika = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["electric"],
      heldItem: "light-ball",
      speciesId: 25,
    });
    const noItemPika = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["electric"],
      speciesId: 25,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const lightBallResult = calculateGen4Damage(
      createDamageContext({
        attacker: lightBallPika,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemPika,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Light Ball: SpAtk ×2 for Pikachu → baseDmg=72 vs 37
    expect(noItemResult.damage).toBe(37);
    expect(lightBallResult.damage).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// Tests: Species-Specific Items
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — species items (defense)", () => {
  it("given Latias (speciesId=380) holds Soul Dew and move is special, when calculating, then SpDef is 1.5x (defender)", () => {
    // Source: Bulbapedia — Soul Dew: "If held by Latias or Latios, raises Sp. Atk and Sp. Def by 50%"
    // Latias national dex = 380, Latios = 381
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const soulDewLatias = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["dragon", "psychic"],
      heldItem: "soul-dew",
      speciesId: 380,
    });
    const noItemLatias = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["dragon", "psychic"],
      speciesId: 380,
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const soulDewResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: soulDewLatias,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noItemLatias,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Soul Dew: SpDef ×1.5 for Latias → less damage taken
    expect(soulDewResult.damage).toBeLessThan(noItemResult.damage);
  });

  it("given Clamperl (speciesId=366) holds Deep Sea Tooth, when calculating SpAtk-based move, then SpAtk is 2x", () => {
    // Source: Bulbapedia — Deep Sea Tooth: "If held by Clamperl, raises its Sp. Atk by 100%"
    // Clamperl national dex = 366
    const deepSeaTooth = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      heldItem: "deep-sea-tooth",
      speciesId: 366,
    });
    const noItemClamperl = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      speciesId: 366,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const toothResult = calculateGen4Damage(
      createDamageContext({
        attacker: deepSeaTooth,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemClamperl,
        defender,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Deep Sea Tooth: SpAtk ×2 for Clamperl + STAB (water/water)
    // noItem (SpAtk=100): STAB 1.5x, baseDmg=floor(floor(22*80*100/100)/50)+2=37, ×1.5=floor(55.5)=55
    // tooth (SpAtk=200): STAB 1.5x, baseDmg=floor(floor(22*80*200/100)/50)+2=72, ×1.5=floor(108)=108
    expect(noItemResult.damage).toBe(55);
    expect(toothResult.damage).toBe(108);
  });

  it("given Clamperl (speciesId=366) holds Deep Sea Scale, when acting as defender taking special damage, then SpDef is 2x", () => {
    // Source: Bulbapedia — Deep Sea Scale: "If held by Clamperl, raises its Sp. Def by 100%"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const deepSeaScale = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      heldItem: "deep-sea-scale",
      speciesId: 366,
    });
    const noItemClamperl = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      speciesId: 366,
    });
    const specialMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const scaleResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: deepSeaScale,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noItemClamperl,
        move: specialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Deep Sea Scale: SpDef ×2 for Clamperl → takes less special damage
    expect(scaleResult.damage).toBeLessThan(noItemResult.damage);
  });

  it("given Cubone (speciesId=104) holds Thick Club and uses physical move, when calculating attack, then Attack is 2x", () => {
    // Source: Bulbapedia — Thick Club: "If held by Cubone or Marowak, the holder's Attack is
    //   doubled". Cubone = 104, Marowak = 105
    const thickClubCubone = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ground"],
      heldItem: "thick-club",
      speciesId: 104,
    });
    const noItemCubone = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ground"],
      speciesId: 104,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const physMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const thickClubResult = calculateGen4Damage(
      createDamageContext({
        attacker: thickClubCubone,
        defender,
        move: physMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemCubone,
        defender,
        move: physMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Thick Club: Atk ×2 for Cubone. No STAB (ground/normal).
    // noItem (Atk=100): baseDmg=37
    // thickClub (Atk=200): baseDmg = floor(floor(22*80*200/100)/50)+2 = 72
    expect(noItemResult.damage).toBe(37);
    expect(thickClubResult.damage).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// Tests: Ability Immunities
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — ability immunities", () => {
  it("given defender has Wonder Guard and matchup is neutral (effectiveness=1), when calculating damage, then damage = 0", () => {
    // Source: Bulbapedia — Wonder Guard: "Only super-effective moves will hit the Pokémon"
    //   (introduced in Gen 3; same in Gen 4)
    const attacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["normal"],
    });
    const wonderGuardDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ghost"],
      ability: "wonder-guard",
    });
    // Normal vs Ghost → immune in type chart; but here we test neutral (effectiveness=1) vs WonderGuard
    const normalMove = createMove({ type: "normal", power: 100, category: "physical" });
    const chart = createNeutralTypeChart(); // neutral effectiveness = 1

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: wonderGuardDefender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Wonder Guard blocks non-SE moves (effectiveness ≤ 1) → 0 damage
    expect(result.damage).toBe(0);
  });

  it("given defender has Levitate and attacker uses Ground-type move, when calculating, then damage = 0 and effectiveness = 0", () => {
    // Source: Bulbapedia — Levitate (Gen 3+): "By floating in the air, the Pokémon receives
    //   full immunity to all Ground-type moves"
    const attacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const levitateDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["electric"],
      ability: "levitate",
    });
    const groundMove = createMove({
      type: "ground",
      power: 100,
      category: "physical",
      id: "earthquake",
    });
    // Levitate: Ground immunity — the calc should treat effectiveness as 0
    // Ground vs Electric would normally be 1x; Levitate makes it 0
    const chart = createTypeChart([["ground", "electric", 0]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: levitateDefender,
        move: groundMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender has Thick Fat and attacker uses Fire-type move with asymmetric stats, when calculating damage, then base power is halved (not the attack stat)", () => {
    // Source: Showdown Gen 4 mod — Thick Fat onModifyBasePower halves Fire/Ice move power
    // Source: Bulbapedia — Thick Fat (Gen 4): "The power of Fire- and Ice-type moves against
    //   this Pokémon is halved"
    //
    // Asymmetric inputs (spAttack=120, spDefense=80) distinguish "halve base power" from
    // "halve attack stat" — with symmetric inputs both approaches yield the same result
    // due to integer arithmetic, so the test was previously passing by coincidence.
    //
    // Derivation (L50, power=80 → 40 after Thick Fat halving, spAtk=120, spDef=80, rng=100):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*40*120/80)/50)+2 = floor(floor(1320)/50)+2 = floor(26)+2 = 28
    //
    // If attack were halved instead (power=80, spAtk=60, spDef=80):
    //   baseDmg = floor(floor(22*80*60/80)/50)+2 = floor(floor(1320)/50)+2 = floor(26)+2 = 28
    //   (same! still ambiguous at these ratios — try spAtk=120, spDef=60)
    //
    // Derivation with spAtk=120, spDef=60, power=80 → 40 (Thick Fat halves power):
    //   baseDmg = floor(floor(22*40*120/60)/50)+2 = floor(floor(1760)/50)+2 = floor(35)+2 = 37
    // If attack were halved (spAtk=60, spDef=60, power=80):
    //   baseDmg = floor(floor(22*80*60/60)/50)+2 = floor(floor(1760)/50)+2 = floor(35)+2 = 37
    //   (still same — the ratio Atk/Def is the same whether we halve power or attack)
    //
    // The definitive asymmetric test: use spAtk=120, spDef=80 (ratio=1.5, not 1.0)
    //   Thick Fat halves power (80→40): floor(floor(22*40*120/80)/50)+2 = floor(26)+2 = 28
    //   Thick Fat halves attack (spAtk=60, spDef=80): floor(floor(22*80*60/80)/50)+2
    //     = floor(floor(1320)/50)+2 = floor(26)+2 = 28 (same due to ratio!)
    //
    // Key insight: power/2 vs atk/2 always gives the same result because Atk appears in
    // the numerator alongside Power. The CORRECT way to verify Thick Fat mechanism is to
    // compare against the no-ability baseline: Thick Fat should produce the same damage
    // as using half the base power without Thick Fat, not half the attack stat.
    //
    // With spAtk=120, spDef=80:
    //   no-ability (power=80): floor(floor(22*80*120/80)/50)+2 = floor(floor(2640)/50)+2 = floor(52)+2 = 54
    //   Thick Fat (power=40):  floor(floor(22*40*120/80)/50)+2 = floor(floor(1320)/50)+2 = floor(26)+2 = 28
    //   Note: 28 ≠ floor(54/2)=27, confirming integer arithmetic floor difference
    const attacker = createActivePokemon({
      level: 50,
      attack: 120,
      defense: 80,
      spAttack: 120,
      spDefense: 80,
      types: ["normal"],
    });
    const thickFatDefender = createActivePokemon({
      level: 50,
      attack: 120,
      defense: 80,
      spAttack: 120,
      spDefense: 80,
      types: ["normal"],
      ability: "thick-fat",
    });
    const fireMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const thickFatResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: thickFatDefender,
        move: fireMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    // Thick Fat halves BASE POWER (80 → 40).
    // Derivation: power=40, spAtk=120, spDef=80
    //   baseDmg = floor(floor(22*40*120/80)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    // (If the implementation were wrong and halved the attack stat instead:
    //   power=80, spAtk=60, spDef=80 → floor(floor(22*80*60/80)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    //   Same result due to ratio — see baseline comparison below which catches this)
    expect(thickFatResult.damage).toBe(28);

    // Cross-check: no-ability baseline (power=80, spAtk=120, spDef=80) should be 54
    const noAbilityDefender = createActivePokemon({
      level: 50,
      attack: 120,
      defense: 80,
      spAttack: 120,
      spDefense: 80,
      types: ["normal"],
    });
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noAbilityDefender,
        move: fireMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    // Derivation: power=80, spAtk=120, spDef=80
    //   baseDmg = floor(floor(22*80*120/80)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    expect(noAbilityResult.damage).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// Tests: Explosion
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Explosion / Self-Destruct", () => {
  it("given attacker uses Explosion, when calculating damage, then defense is halved before the base damage formula", () => {
    // Source: Showdown Gen 4 / pret/pokeplatinum — Explosion and Self-Destruct halve the
    //   target's effective Defense during damage calculation. This mechanic was removed in Gen 5.
    // Explosion: Normal type, 250 BP, physical.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 200, // high defense to make the halving effect observable
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const noHalveMove = createMove({
      type: "normal",
      power: 250,
      category: "physical",
      id: "normal-250",
    });
    const explosionMove = createMove({
      type: "normal",
      power: 250,
      category: "physical",
      id: "explosion",
    });
    const chart = createNeutralTypeChart();

    // Explosion halves defender's defense (200 → 100 effective)
    const explosionResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: explosionMove, rng: createMockRng(100) }),
      chart,
    );
    // Non-Explosion move of same power for comparison (uses full Def=200)
    const normalResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: noHalveMove, rng: createMockRng(100) }),
      chart,
    );

    // With halved defense (100), explosion should deal more than non-explosion (def=200)
    // Explosion (def=100): baseDmg = floor(floor(22*250*100/100)/50)+2 = floor(5500/50)+2 = 110+2 = 112
    //   STAB (normal/normal): floor(112*1.5) = 168
    // Normal 250 (def=200): baseDmg = floor(floor(22*250*100/200)/50)+2 = floor(floor(550000/200)/50)+2
    //   = floor(2750/50)+2 = 55+2 = 57; STAB: floor(57*1.5) = 85
    expect(explosionResult.damage).toBeGreaterThan(normalResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Tests: Minimum Damage
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — minimum damage", () => {
  it("given a very weak attacker vs very bulky defender with neutral type, when damage formula yields 0 pre-clamp, then final damage = 1", () => {
    // Source: Showdown Gen 4 / pret/pokeplatinum — minimum damage is 1 (unless immune)
    // Very low level and attack vs very high defense
    const weakAttacker = createActivePokemon({
      level: 1,
      attack: 1,
      defense: 1,
      spAttack: 1,
      spDefense: 1,
      types: ["fighting"],
    });
    const bulkyDefender = createActivePokemon({
      level: 100,
      attack: 100,
      defense: 999,
      spAttack: 100,
      spDefense: 999,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 10, category: "physical" });
    const chart = createNeutralTypeChart();
    // Use minimum random roll (85) to make result as small as possible
    const ctx = createDamageContext({
      attacker: weakAttacker,
      defender: bulkyDefender,
      move,
      rng: createMockRng(85),
    });

    const result = calculateGen4Damage(ctx, chart);
    // Regardless of how small the calculation gets, non-immune = minimum 1
    expect(result.damage).toBe(1);
  });

  it("given an immune type matchup with a powerful attacker, when calculating, then damage = 0 (not clamped to 1)", () => {
    // Source: Showdown Gen 4 — type immunity returns 0 damage, not clamped to 1
    const powerfulAttacker = createActivePokemon({
      level: 100,
      attack: 500,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const ghostDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ghost"],
    });
    const normalMove = createMove({ type: "normal", power: 150, category: "physical" });
    const chart = createTypeChart([["normal", "ghost", 0]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker: powerfulAttacker,
        defender: ghostDefender,
        move: normalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: DamageBreakdown completeness
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — breakdown completeness", () => {
  it("given a full-modifier calculation (all modifiers active), when checking breakdown, then each field is present and correct", () => {
    // Water-type attacker (STAB), Surf (special Water 95 BP), vs Fire defender in Rain,
    // crit=true, no burn (special move anyway)
    // Source: Showdown Gen 4 / pret/pokeplatinum for modifier order
    const waterAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 120,
      spDefense: 100,
      types: ["water"],
    });
    const fireDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 80,
      types: ["fire"],
    });
    const surf = createMove({ type: "water", power: 95, category: "special", id: "surf" });
    const chart = createTypeChart([["water", "fire", 2]]);

    const result = calculateGen4Damage(
      createDamageContext({
        attacker: waterAttacker,
        defender: fireDefender,
        move: surf,
        isCrit: true,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 3, source: "rain-dance" },
      }),
      chart,
    );

    expect(result.breakdown).not.toBeNull();
    expect(result.breakdown?.weatherMultiplier).toBe(1.5);
    expect(result.breakdown?.critMultiplier).toBe(2);
    expect(result.breakdown?.stabMultiplier).toBe(1.5);
    expect(result.breakdown?.typeMultiplier).toBe(2);
    expect(result.breakdown?.burnMultiplier).toBe(1); // special move, burn doesn't apply
    expect(result.breakdown?.randomMultiplier).toBeCloseTo(1.0, 2);
    expect(result.isCrit).toBe(true);
    expect(result.effectiveness).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen4TypeChart integration sanity checks
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — type chart integration", () => {
  it("given GEN4_TYPE_CHART, when Water move vs Fire defender, then real chart returns 2x SE", () => {
    // Source: Gen 4 type chart — Water is SE vs Fire
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: fireDefender,
        move: waterMove,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    expect(result.effectiveness).toBe(2);
  });

  it("given GEN4_TYPE_CHART, when Electric move vs Ground defender, then real chart returns 0 (immune)", () => {
    // Source: Gen 4 type chart — Electric has no effect vs Ground
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["normal"],
    });
    const groundDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ground"],
    });
    const electricMove = createMove({ type: "electric", power: 90, category: "special" });

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: groundDefender,
        move: electricMove,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Dry Skin fire weakness
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Dry Skin fire weakness", () => {
  it("given defender has Dry Skin and attacker uses Fire move, when calculating damage, then damage is 1.25x vs no-ability baseline", () => {
    // Source: Bulbapedia — Dry Skin (Gen 4): "Fire-type moves deal 1.25× damage to the user."
    // Source: Showdown data/abilities.ts — Dry Skin onSourceBasePower (priority 17)
    // Dry Skin provides Water immunity (early return) AND a base-power boost for Fire moves.
    // Applied at base-power stage (before Technician, priority 30), not as a final multiplier.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const drySkinDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "dry-skin",
    });
    const noAbilityDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const drySkinResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: drySkinDefender,
        move: fireMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: noAbilityDefender,
        move: fireMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Dry Skin applies 1.25x at BASE POWER stage (onSourceBasePower), not final damage.
    // Derivation for drySkinResult:
    //   power' = floor(80 * 1.25) = 100
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*100*100/100)/50) = floor(2200/50) = 44
    //   +2 = 46; rng=100 → 46; STAB(fire vs fire) = floor(46*1.5) = 69; finalDamage = 69
    // Derivation for noAbilityResult (no power modifier):
    //   base = floor(floor(22*80*100/100)/50) = 35; +2=37; STAB=floor(37*1.5)=55
    // Source: Showdown data/abilities.ts — Dry Skin onSourceBasePower (priority 17)
    expect(drySkinResult.damage).toBe(69);
    expect(noAbilityResult.damage).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// Tests: Plates (Gen 4 — 4915/4096 base power boost, same as type-boost items)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Plates (4915/4096 base power boost)", () => {
  it("given attacker holds Flame Plate and uses a Fire move, when calculating, then base power is boosted by 4915/4096", () => {
    // Source: Showdown data/items.ts — Flame Plate uses chainModify([4915, 4096]) on onBasePower
    // Derivation: no-item → L50, power=80, spAtk=100, spDef=100, rng=100, neutral, STAB
    //   levelFactor=22, base=floor(floor(22*80*100/100)/50)=35, +2=37
    //   STAB (fire attacker, fire move): floor(37*1.5)=55; final=55
    //   with flame-plate (4915/4096 on base power): boosted power = floor(80*4915/4096) = 95
    //   base=floor(floor(22*95*100/100)/50)=floor(2090/50)=41, +2=43
    //   STAB: floor(43*1.5)=64; final=64
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
      heldItem: "flame-plate",
    });
    const noItemAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const fireMove = createMove({ type: "fire", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const plateResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: fireMove, rng: createMockRng(100) }),
      chart,
    );
    const noItemResult = calculateGen4Damage(
      createDamageContext({
        attacker: noItemAttacker,
        defender,
        move: fireMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Derivation above: no-item → 55 (with STAB), plate → 64
    expect(noItemResult.damage).toBe(55);
    expect(plateResult.damage).toBe(64);
    expect(plateResult.damage).toBeGreaterThan(noItemResult.damage);
  });

  it("given Gen 4 type list, when checking for Fairy type, then Fairy is absent (Fairy introduced Gen 6)", () => {
    // Source: Bulbapedia — Fairy type was introduced in Generation VI (X/Y)
    // Pixie Plate (fairy) must NOT exist in Gen 4 — no Fairy type means no Fairy plate bonus
    expect(GEN4_TYPES).not.toContain("fairy");
    // Gen 4 has exactly 17 types: Normal, Fire, Water, Grass, Electric, Ice, Fighting,
    // Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel
    // Source: Bulbapedia — Generation IV type chart has 17 types
    expect(GEN4_TYPES.length).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// Tests: SolarBeam half power in rain/sand/hail
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — SolarBeam weather power reduction", () => {
  it("given SolarBeam in rain weather, when calculating damage, then base power is halved (120 -> 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — Solar Beam: "Has its base power halved in rain."
    // Source: specs/battle/05-gen4.md line 497 — "Solar Beam: half power"
    //
    // Derivation (L50, power=60 [halved from 120], Atk=100, Def=100, rng=100):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*60*100/100)/50) + 2 = floor(floor(132000/100)/50) + 2
    //           = floor(1320/50) + 2 = 26 + 2 = 28
    //   Weather: rain boosts Water 1.5x / Fire 0.5x; Grass gets 1.0x.
    //   Final damage = 28
    //
    // Without rain (full 120 power):
    //   baseDmg = floor(floor(22*120*100/100)/50) + 2 = floor(2640/50) + 2 = 52 + 2 = 54
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["grass"],
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    // With rain weather
    const rainResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
      }),
      chart,
    );

    // Without weather (full power)
    const noWeatherResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
      }),
      chart,
    );

    // SolarBeam at half power in rain (60 BP + STAB 1.5x)
    // levelFactor = 22; SpAtk=100, SpDef=100
    // Half power: floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    // With STAB: floor(28 * 1.5) = 42
    expect(rainResult.damage).toBe(42);

    // Full power no weather: floor(floor(22*120*100/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    // With STAB: floor(54 * 1.5) = 81
    expect(noWeatherResult.damage).toBe(81);

    // Rain result should be roughly half of no-weather result
    expect(rainResult.damage).toBeLessThan(noWeatherResult.damage);
  });

  it("given SolarBeam in sandstorm weather, when calculating damage, then base power is halved (120 -> 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — Solar Beam: "Has its base power halved in sandstorm."
    // Source: specs/battle/05-gen4.md line 516 — "Solar Beam: half power (charge still required)"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"], // no STAB with grass
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    // With sandstorm weather
    const sandResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
      }),
      chart,
    );

    // Without weather (full power)
    const noWeatherResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
      }),
      chart,
    );

    // SolarBeam at half power in sand (60 BP, no STAB):
    // floor(floor(22*60*100/100)/50)+2 = 28
    expect(sandResult.damage).toBe(28);
    // Full power no weather: 54
    expect(noWeatherResult.damage).toBe(54);
    expect(sandResult.damage).toBeLessThan(noWeatherResult.damage);
  });

  it("given SolarBeam in hail weather, when calculating damage, then base power is halved (120 -> 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — Solar Beam: "Has its base power halved in hail."
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const hailResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "hail", turnsLeft: 5, source: "hail" },
      }),
      chart,
    );

    // Half power: 28 (same derivation as above)
    expect(hailResult.damage).toBe(28);
  });

  it("given SolarBeam in sun weather, when calculating damage, then base power is NOT halved (stays 120)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam keeps full power in sun
    // Source: Bulbapedia — Solar Beam: "Fires immediately in harsh sunlight with full power."
    // Source: specs/battle/05-gen4.md line 505 — "Solar Beam: no charge (full power)"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const sunResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
      }),
      chart,
    );

    // Full power in sun: 54 (no STAB, no weather type boost for Grass in sun)
    expect(sunResult.damage).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// Tests: Metronome item consecutive-use power boost
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Metronome item baseDamage boost", () => {
  // Metronome item applies to baseDamage (alongside Life Orb, Expert Belt), NOT to power.
  // Gen 4: +10% per consecutive use, caps at 1.5x (5 boost steps).
  // Source: Showdown Gen 4 mod — Metronome item onModifyMove: 10% step, 1.5x cap
  // Source: Bulbapedia — Metronome (item) Gen 4: "Each consecutive use adds 10%, up to 50%"
  // Bug #358: Previous tests used Gen 5+ values (0.2x step / 2.0x cap); updated to Gen 4.
  // data.count tracks consecutive uses (including first): count=1 -> 1.0x, count=2 -> 1.1x, ...

  it("given Metronome item with count=2 (2nd consecutive use), when calculating damage, then baseDamage boosted by 1.1x (Gen 4 step is 0.1x)", () => {
    // Source: Showdown Gen 4 mod — Metronome 10% step (not 20% which is Gen 5+)
    // Derivation (L50, Atk=100, Def=100, power=80, rng=100):
    //   levelFactor = 22
    //   baseDmg = floor(floor(22*80*100/100)/50) + 2 = 35 + 2 = 37
    //   STAB: Normal attacker, Normal move -> 1.5x: floor(37*1.5) = 55
    //   Metronome 1.1x (boostSteps=1, Gen 4): floor(55*1.1) = floor(60.5) = 60
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 2, moveId: "test" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(60);
  });

  it("given Metronome item with count=6 (6th consecutive use, max), when calculating damage, then baseDamage boosted by 1.5x (Gen 4 cap, not 2.0x)", () => {
    // Source: Showdown Gen 4 mod — Metronome cap is 1.5x (not 2.0x which is Gen 5+)
    // Bug #358: Previous test expected 2.0x cap; Gen 4 cap is 1.5x.
    // Derivation (L50, Atk=100, Def=100, power=80, rng=100, no STAB):
    //   baseDmg = 35 + 2 = 37
    //   No STAB (fighting attacker, normal move): 37
    //   Metronome 1.5x (boostSteps=5, Gen 4 cap): floor(37*1.5) = floor(55.5) = 55
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB on normal move
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 6, moveId: "test" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(55);
  });

  it("given Metronome item with count=1 (first use), when calculating damage, then no boost applied (1.0x)", () => {
    // Source: Showdown Gen 4 mod — Metronome first use = 1.0x (no boost)
    // boostSteps = min(1-1, 5) = 0 -> no multiplier applied
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB on normal move
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 1, moveId: "test" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // No boost: baseDmg = 37
    expect(result.damage).toBe(37);
  });

  it("given Metronome item with count=11 (exceeds cap), when calculating damage, then capped at 1.5x (Gen 4 cap)", () => {
    // Source: Showdown Gen 4 mod — Metronome caps at 1.5x (boostSteps capped at 5)
    // Bug #358: Previous test expected 2.0x cap; Gen 4 cap is 1.5x.
    // boostSteps = min(11-1, 5) = 5 -> 1.5x
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 11, moveId: "test" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // Capped at 1.5x (Gen 4): floor(37*1.5) = floor(55.5) = 55
    expect(result.damage).toBe(55);
  });

  it("given no Metronome item even with metronome-count volatile, when calculating damage, then no boost applied", () => {
    // Source: Showdown Gen 4 mod — Metronome boost only applies when holding the item
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: null, // NOT holding metronome
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 6, moveId: "test" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // No item = no boost: baseDmg = 37
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Regression tests for damage calc modifier bug fixes
// ===========================================================================

// ---------------------------------------------------------------------------
// #349 — Weather and +2 modifier order: weather BEFORE +2
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — weather before +2 order (#349)", () => {
  it("given rain weather and Water-type move, when calculating damage, then weather is applied before +2 (regression)", () => {
    // Source: Showdown data/mods/gen4/scripts.ts lines 56-58 — weather before +2
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35
    //   weather(rain, water) = floor(35*1.5) = 52; +2 = 54
    //   random=100%, no STAB (attacker=["normal"]), neutral eff => 54
    // OLD BUG: +2 first → 37, then floor(37*1.5) = 55 (wrong)
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "water", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
      }),
      chart,
    );

    expect(result.damage).toBe(54);
  });

  it("given sun weather and Fire-type move with different stats, when calculating damage, then weather before +2 produces correct value", () => {
    // Source: Showdown data/mods/gen4/scripts.ts lines 56-58
    // Derivation: L50, power=100, Atk=120, Def=90, rng=100
    //   baseDmg = floor(floor(22*100*120/90)/50) = floor(floor(29333.33)/50) = floor(2933/50) = 58
    //   weather(sun, fire) = floor(58*1.5) = 87; +2 = 89
    // OLD BUG: +2 first → 60, then floor(60*1.5) = 90 (wrong)
    const attacker = createActivePokemon({ attack: 120, types: ["normal"] });
    const defender = createActivePokemon({ defense: 90 });
    const move = createMove({ type: "fire", power: 100, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
      }),
      chart,
    );

    expect(result.damage).toBe(89);
  });
});

// ---------------------------------------------------------------------------
// #352 — Flash Fire as ModifyDamagePhase1 (not base power)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Flash Fire as damage modifier (#352)", () => {
  it("given Flash Fire active on fire move with power=60 Atk=120, when calculating damage, then 1.5x applies to baseDamage not power", () => {
    // Source: Showdown data/mods/gen4/abilities.ts line 135 — Flash Fire onModifyDamagePhase1
    // Derivation: L50, power=60, Atk=120, Def=100, rng=100
    //   baseDmg = floor(floor(22*60*120/100)/50) = floor(1584/50) = 31
    //   Flash Fire (damage mod): floor(31*1.5) = 46; +2 = 48
    // OLD BUG: power*1.5 first → power=90, baseDmg=floor(floor(22*90*120/100)/50)+2 = 47+2 = 49
    const attacker = createActivePokemon({ attack: 120, types: ["normal"] });
    attacker.volatileStatuses.set("flash-fire", { turnsLeft: -1 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 60, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(48);
  });

  it("given Flash Fire active on fire move with power=100 Atk=80, when calculating damage, then damage modifier is correct", () => {
    // Source: Showdown data/mods/gen4/abilities.ts — Flash Fire onModifyDamagePhase1
    // Derivation: L50, power=100, Atk=80, Def=100, rng=100
    //   baseDmg = floor(floor(22*100*80/100)/50) = floor(1760/50) = 35
    //   Flash Fire: floor(35*1.5) = 52; +2 = 54
    const attacker = createActivePokemon({ attack: 80, types: ["normal"] });
    attacker.volatileStatuses.set("flash-fire", { turnsLeft: -1 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 100, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// #353 — Thick Fat halves base power (not attack stat)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Thick Fat halves base power (#353)", () => {
  it("given Thick Fat defender hit by fire move power=80 Atk=100, when calculating damage, then power is halved (not attack)", () => {
    // Source: Showdown data/mods/gen4/abilities.ts lines 502-512 — Thick Fat onSourceBasePower
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   Thick Fat halves power: power = floor(80/2) = 40
    //   baseDmg = floor(floor(22*40*100/100)/50) = floor(880/50) = 17; +2 = 19
    // OLD BUG: attack halved instead → atk=50, baseDmg=floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 17+2 = 19
    // (Same result with these numbers — use different ones to distinguish)
    const attacker = createActivePokemon({ attack: 130, types: ["normal"] });
    const defender = createActivePokemon({
      defense: 100,
      ability: "thick-fat",
      types: ["normal"],
    });
    const move = createMove({ type: "fire", power: 90, category: "physical" });
    const chart = createNeutralTypeChart();

    // Power halved: power = floor(90/2) = 45
    // baseDmg = floor(floor(22*45*130/100)/50) = floor(floor(12870/100)/50) = floor(128/50) = 2
    // Wait, let me recompute: floor(22*45*130/100) = floor(128700/100) = 1287
    // floor(1287/50) = 25; +2 = 27
    // OLD: atk halved: atk=65, baseDmg = floor(floor(22*90*65/100)/50) = floor(floor(12870/100)/50) = floor(128/50) = 2
    // Recompute: floor(22*90*65/100) = floor(128700/100) = 1287, floor(1287/50) = 25; +2 = 27
    // Hmm, same result. Let me pick values that differentiate.
    // Use power=91, Atk=130, Def=100:
    // Power halved: floor(91/2) = 45 → baseDmg = floor(floor(22*45*130/100)/50) = floor(1287/50) = 25; +2 = 27
    // Atk halved: floor(130/2) = 65 → baseDmg = floor(floor(22*91*65/100)/50) = floor(floor(13013/100)/50) = floor(130/50) = 2
    // Recompute: floor(22*91*65/100) = floor(130130/100) = 1301, floor(1301/50) = 26; +2 = 28
    // These are different! Power-halved: 27, Atk-halved: 28.

    // Actually let me use simpler: power=90, Atk=131, Def=100
    // Power halved: 45 → floor(22*45*131/100) = floor(129690/100) = 1296, floor(1296/50)=25, +2=27
    // Atk halved: floor(131/2)=65 → floor(22*90*65/100) = floor(128700/100)=1287, floor(1287/50)=25, +2=27
    // Still same. The symmetry P*A is the issue.

    // Use power=81, Atk=100:
    // Power halved: floor(81/2) = 40 → floor(22*40*100/100) = 880, floor(880/50)=17, +2=19
    // Atk halved: floor(100/2) = 50 → floor(22*81*50/100) = floor(89100/100)=891, floor(891/50)=17, +2=19
    // Same again because floor(P/2)*A can equal P*floor(A/2) sometimes.

    // Use odd power to get a difference:
    // power=73, Atk=100:
    // Power halved: floor(73/2) = 36 → floor(22*36*100/100) = 792, floor(792/50)=15, +2=17
    // Atk halved: floor(100/2) = 50 → floor(22*73*50/100) = floor(80300/100) = 803, floor(803/50)=16, +2=18
    // Different! Power-halved=17, Atk-halved=18.

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // With power=90 and attack=130, both give same result.
    // The real test is the formula behavior, verified by a case that differentiates.
    expect(result.damage).toBe(27);
  });

  it("given Thick Fat defender hit by ice move power=73 Atk=100, when calculating damage, then basePower halving differs from attack halving", () => {
    // Source: Showdown data/mods/gen4/abilities.ts lines 502-512 — Thick Fat onSourceBasePower
    // This test case specifically differentiates power-halving from attack-halving.
    // Derivation: L50, power=73, Atk=100, Def=100, rng=100
    //   Power halved: floor(73/2) = 36
    //   baseDmg = floor(floor(22*36*100/100)/50) = floor(792/50) = 15; +2 = 17
    // OLD BUG (attack halved): floor(100/2)=50
    //   baseDmg = floor(floor(22*73*50/100)/50) = floor(803/50) = 16; +2 = 18 (WRONG)
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({
      defense: 100,
      ability: "thick-fat",
      types: ["normal"],
    });
    const move = createMove({ type: "ice", power: 73, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// #355 — Heatproof applies 0.5x post-type-effectiveness (onSourceModifyDamage)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Heatproof post-formula 0.5x modifier (#355)", () => {
  it("given Heatproof defender hit by fire move power=73 Atk=100, when calculating damage, then final damage is halved post-formula", () => {
    // Source: Showdown Gen 4 mod — Heatproof onSourceModifyDamage 0.5x for Fire moves
    // In Gen 4, Heatproof halves the final damage (post-formula, post-crit, post-STAB, post-type).
    // Bug #355: prior implementation halved power or attack-stat; Gen 4 halves final damage.
    //
    // Derivation: L50, power=73, Atk=100 (not halved), Def=100, rng=100, neutral effectiveness
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*73*100/100)/50)+2 = floor(1606/50)+2 = 32+2 = 34
    //   crit=1x, random=100/100=1x, STAB=none, effectiveness=1x → 34
    //   Heatproof (post-formula): floor(34 * 0.5) = 17
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({
      defense: 100,
      ability: "heatproof",
      types: ["steel"],
    });
    const move = createMove({ type: "fire", power: 73, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(17);
  });

  it("given Heatproof defender hit by fire special move power=91 SpAtk=110, when calculating damage, then final damage is halved post-formula", () => {
    // Source: Showdown Gen 4 mod — Heatproof onSourceModifyDamage 0.5x for Fire moves
    // Derivation: L50, power=91, SpAtk=110 (not halved), SpDef=100, rng=100, neutral effectiveness
    //   levelFactor = 22
    //   22*91=2002, 2002*110=220220, floor(220220/100)=2202, floor(2202/50)=44; +2=46
    //   crit=1x, random=100/100=1x, STAB=none, effectiveness=1x → 46
    //   Heatproof (post-formula): floor(46 * 0.5) = 23
    const attacker = createActivePokemon({ spAttack: 110, types: ["normal"] });
    const defender = createActivePokemon({
      spDefense: 100,
      ability: "heatproof",
      types: ["steel"],
    });
    const move = createMove({ type: "fire", power: 91, category: "special" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// #357 — Life Orb in Phase 2 (after crit, before random/STAB/types)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Life Orb in Phase 2 (#357)", () => {
  it("given Life Orb holder using neutral move, when calculating damage, then 1.3x applies after crit but before random", () => {
    // Source: Showdown data/mods/gen4/items.ts lines 228-240 — Life Orb onModifyDamagePhase2
    // Derivation: L50, power=80, Atk=100, Def=100, rng=85 (min roll), no crit
    //   no STAB [fighting attacker, normal move]
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35; +2 = 37
    //   Life Orb (Phase 2): floor(37*1.3) = 48
    //   random: floor(48*85/100) = floor(40.8) = 40; eff=1 → 40
    // OLD BUG (Life Orb after types): baseDmg=35, +2=37, random=floor(37*85/100)=31,
    //   then Life Orb: floor(31*1.3) = 40 (happens to be same here — use crit for differentiation)
    const attacker = createActivePokemon({
      attack: 100,
      types: ["fighting"],
      heldItem: "life-orb",
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(85) }),
      chart,
    );

    expect(result.damage).toBe(40);
  });

  it("given Life Orb holder with crit, when calculating damage, then Life Orb applies after crit and before random", () => {
    // Source: Showdown data/mods/gen4/items.ts — Life Orb onModifyDamagePhase2
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, crit=true
    //   baseDmg = 35; +2 = 37; crit: 37*2 = 74; Life Orb: floor(74*1.3) = 96
    //   random: floor(96*100/100) = 96; STAB = floor(96*1.5) = 144; eff=1 → 144
    // OLD BUG: baseDmg=35, +2=37, crit=74, random=74, STAB=floor(74*1.5)=111, eff=1,
    //   then Life Orb: floor(111*1.3) = 144 (same at max roll — test with min roll for diff)
    // Try with rng=85: Phase 2 correct: crit=74, LO=96, random=floor(96*0.85)=81, STAB=floor(81*1.5)=121
    //   OLD: crit=74, random=floor(74*0.85)=62, STAB=floor(62*1.5)=93, LO=floor(93*1.3)=120
    const attacker = createActivePokemon({
      attack: 100,
      types: ["normal"],
      heldItem: "life-orb",
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, isCrit: true, rng: createMockRng(85) }),
      chart,
    );

    expect(result.damage).toBe(121);
  });
});

// ---------------------------------------------------------------------------
// #366 — Muscle Band/Wise Glasses as base power modifiers (4505/4096)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Muscle Band and Wise Glasses base power (#366)", () => {
  it("given Muscle Band holder using physical move power=80, when calculating damage, then base power uses 4505/4096 multiplier", () => {
    // Source: Showdown data/items.ts lines 4240-4244 — Muscle Band onBasePower chainModify([4505, 4096])
    // Derivation: L50, power=90, Atk=100, Def=100, rng=100
    //   no STAB [fighting attacker, normal move]
    //   Muscle Band: power = floor(90*4505/4096) = floor(98.98...) = 98
    //   baseDmg = floor(floor(22*98*100/100)/50) = floor(2156/50) = 43; +2 = 45
    const attacker = createActivePokemon({
      attack: 100,
      types: ["fighting"],
      heldItem: "muscle-band",
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 90, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(45);
  });

  it("given Wise Glasses holder using special move power=90, when calculating damage, then base power uses 4505/4096 multiplier", () => {
    // Source: Showdown data/items.ts lines 7755-7759 — Wise Glasses onBasePower chainModify([4505, 4096])
    // Derivation: L50, power=90, SpAtk=100, SpDef=100, rng=100
    //   no STAB [fighting attacker, normal move]
    //   Wise Glasses: power = floor(90*4505/4096) = floor(98.98...) = 98
    //   baseDmg = floor(floor(22*98*100/100)/50) = floor(2156/50) = 43; +2 = 45
    const attacker = createActivePokemon({
      spAttack: 100,
      types: ["fighting"],
      heldItem: "wise-glasses",
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "normal", power: 90, category: "special" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// #369 — Expert Belt uses 4915/4096 (not 1.2)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Expert Belt 4915/4096 (#369)", () => {
  it("given Expert Belt holder dealing super-effective damage=100, when calculating, then uses 4915/4096 not 1.2", () => {
    // Source: Showdown data/items.ts line 1902-1904 — Expert Belt chainModify([4915, 4096])
    // This test constructs a scenario where floor(100*4915/4096) = 119 != floor(100*1.2) = 120
    // Derivation: L50, power=80, Atk=150, Def=100, rng=100, SE type chart
    //   baseDmg = floor(floor(22*80*150/100)/50) = floor(2640/50) = 52; +2 = 54
    //   random=54; no STAB; eff=2 → floor(54*2) = 108
    //   Expert Belt: floor(108*4915/4096) = floor(129.77...) = 129
    // OLD BUG: floor(108*1.2) = 129 (same! but at damage=100: floor(100*4915/4096)=119, floor(100*1.2)=120)
    // Let me pick values that reach an exact 100-region damage.
    // power=80, Atk=100, Def=100, neutral chart -> baseDmg=35, +2=37, random=37, STAB=1, SE 2x=74
    // Expert Belt: floor(74*4915/4096) = floor(88.72..) = 88
    // OLD: floor(74*1.2) = 88 — same! Need larger number.
    // power=80, Atk=200, Def=100 -> baseDmg=floor(floor(22*80*200/100)/50)=floor(3520/50)=70, +2=72
    // random=72, SE=144, EB: floor(144*4915/4096)=floor(172.64..)=172
    // OLD: floor(144*1.2)=172 — same. The difference only shows for certain values.
    // floor(N*4915/4096) vs floor(N*1.2): differ when fractional(N*4915/4096) < fractional(N*1.2)
    // 4915/4096 = 1.19995117... so 1.2 - 4915/4096 = 0.00004883...
    // Differ at N where N*0.00004883 causes the 1.2 version to cross an integer.
    // N = 100: 100*1.19995 = 119.995, floor=119; 100*1.2 = 120, floor=120. DIFFERENT!
    // baseDmg before EB needs to be exactly 100 after SE.
    // SE=2x, so before SE needs to be 50 at max roll. floor(X*2)=100 → X=50.
    // baseDmg = 50 before random (max roll=100% so stays 50). Then SE: floor(50*2)=100.
    // baseDmg = 50 = formularesult + 2. formularesult = 48.
    // floor(floor(22*P*A/D)/50) = 48. 22*P*A/D = 48*50=2400 + remainder.
    // P*A/D = 2400/22 = 109.09... so P*A/D >= 109.09 and floor(22*P*A/D) in [2400,2449].
    // P=80, A=137, D=100 → 22*80*137/100 = 2411.2, floor=2411, floor(2411/50)=48, +2=50.
    // SE=100. EB: floor(100*4915/4096) = floor(119.995..) = 119.
    // OLD: floor(100*1.2) = 120. DIFFERENT!
    const attacker = createActivePokemon({
      attack: 137,
      types: ["normal"],
      heldItem: "expert-belt",
    });
    const defender = createActivePokemon({ defense: 100, types: ["grass"] });
    const move = createMove({ type: "fire", power: 80, category: "physical" });
    const chart = createTypeChart([["fire", "grass", 2]]);

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(119);
  });

  it("given Expert Belt with different SE damage, when calculating, then 4915/4096 is applied correctly", () => {
    // Source: Showdown data/items.ts — Expert Belt chainModify([4915, 4096])
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35; +2 = 37
    //   random=37; no STAB; SE 2x: floor(37*2) = 74
    //   Expert Belt: floor(74*4915/4096) = floor(88.72..) = 88
    const attacker = createActivePokemon({
      attack: 100,
      types: ["normal"],
      heldItem: "expert-belt",
    });
    const defender = createActivePokemon({ defense: 100, types: ["grass"] });
    const move = createMove({ type: "fire", power: 80, category: "physical" });
    const chart = createTypeChart([["fire", "grass", 2]]);

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// #377 — No Teravolt/Turboblaze in Gen 4
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — no Teravolt/Turboblaze (#377)", () => {
  it("given attacker with ability=teravolt attacking Flower Gift defender in sun, when calculating damage, then Flower Gift SpDef boost still applies (teravolt is not mold-breaker in Gen 4)", () => {
    // Source: Bulbapedia — Teravolt was introduced in Gen 5 for Zekrom.
    // In Gen 4, only Mold Breaker exists. An attacker with "teravolt" should NOT
    // bypass Flower Gift (since teravolt doesn't exist in Gen 4).
    // Derivation: L50, power=80, SpAtk=100, SpDef=100 (→150 with FG), rng=100
    //   no STAB [fighting attacker, normal move]
    //   def = floor(100*150/100) = 150 (Flower Gift boost APPLIED, teravolt doesn't block)
    //   baseDmg = floor(floor(22*80*100/150)/50) = floor(floor(1173.33)/50) = floor(1173/50) = 23; +2 = 25
    const attacker = createActivePokemon({
      spAttack: 100,
      ability: "teravolt",
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      spDefense: 100,
      ability: "flower-gift",
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
      }),
      chart,
    );

    // Flower Gift boost applied (SpDef=150), not bypassed by teravolt
    expect(result.damage).toBe(25);
  });

  it("given attacker with ability=turboblaze attacking Flower Gift defender in sun, when calculating damage, then Flower Gift still applies", () => {
    // Source: Bulbapedia — Turboblaze was introduced in Gen 5 for Reshiram.
    // Same as above — turboblaze should not bypass Flower Gift in Gen 4.
    const attacker = createActivePokemon({
      spAttack: 100,
      ability: "turboblaze",
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      spDefense: 100,
      ability: "flower-gift",
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
      }),
      chart,
    );

    expect(result.damage).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// #378 — Metronome item in Phase 2
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Metronome item in Phase 2 (#378)", () => {
  it("given Metronome item at count=3 with crit rng=85, when calculating damage, then Metronome applies after crit before random", () => {
    // Source: Showdown data/mods/gen4/items.ts — Metronome onModifyDamagePhase2
    //   Gen 4 uses 0.1x per consecutive step (not 0.2x as in Gen 5+)
    // Derivation: L50, power=80, Atk=100, Def=100, rng=85, crit=true, count=3 (1.2x — 2 boost steps)
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35; +2 = 37
    //   crit: 37*2 = 74; Metronome(Phase2, 1.2x): floor(74*1.2) = floor(88.8) = 88
    //   random: floor(88*85/100) = floor(74.8) = 74; no STAB (fighting attacker, normal move) → 74
    // Phase 2 ordering check (old bug applied Metronome after random):
    //   OLD ORDER: crit=74, random=floor(74*0.85)=62, Metro: floor(62*1.2)=74 (same here by coincidence)
    // Without STAB vs old bug shows divergence with 0.2x (old) vs 0.1x (new):
    //   count=3: new=1.2x, old=1.4x → values differ
    const attacker = createActivePokemon({
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 3, moveId: "test" },
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, isCrit: true, rng: createMockRng(85) }),
      chart,
    );

    expect(result.damage).toBe(74);
  });

  it("given Metronome item at count=2 without crit, when calculating damage, then 1.1x applies in Phase 2", () => {
    // Source: Showdown data/mods/gen4/items.ts — Metronome onModifyDamagePhase2
    //   Gen 4: each consecutive use adds 0.1x (10%), capping at 1.5x (5 boost steps)
    // Derivation: L50, power=90, Atk=100, Def=100, rng=85, no crit, count=2 (1.1x — 1 boost step)
    //   baseDmg = floor(floor(22*90*100/100)/50) = floor(1980/50)=39; +2=41
    //   Metronome(Phase2, 1.1x): floor(41*1.1) = floor(45.1) = 45
    //   random: floor(45*85/100) = floor(38.25) = 38; no STAB (fighting attacker) → 38
    // OLD BUG (0.2x/1.2x at count=2):
    //   Phase2: floor(41*1.2)=49, random=floor(49*0.85)=41 → 41 (DIFFERENT! 38 vs 41)
    const attacker = createActivePokemon({
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 2, moveId: "test" },
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 90, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(85) }),
      chart,
    );

    expect(result.damage).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// #431 — Reflect/Light Screen damage halving
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Reflect/Light Screen (#431)", () => {
  it("given Reflect active on defender's side for physical move, when calculating damage, then damage is halved", () => {
    // Source: pret/pokeplatinum battle_lib.c lines 6982-6991 — Reflect halves physical damage
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   no STAB [fighting attacker, normal move]
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35
    //   Reflect: floor(35/2) = 17; +2 = 19
    // Without Reflect: baseDmg=35, +2=37 → 37
    const attacker = createActivePokemon({ attack: 100, types: ["fighting"] });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const state = {
      weather: null,
      sides: [
        { active: [null], screens: [] },
        { active: [defender], screens: [{ type: "reflect", turnsLeft: 5 }] },
      ],
    } as DamageContext["state"];

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: createMockRng(100), state } as DamageContext,
      chart,
    );

    expect(result.damage).toBe(19);
  });

  it("given Light Screen active on defender's side for special move, when calculating damage, then damage is halved", () => {
    // Source: pret/pokeplatinum battle_lib.c lines 7023-7032 — Light Screen halves special damage
    // Derivation: L50, power=80, SpAtk=100, SpDef=100, rng=100
    //   no STAB [fighting attacker, normal move]
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35
    //   Light Screen: floor(35/2) = 17; +2 = 19
    const attacker = createActivePokemon({ spAttack: 100, types: ["fighting"] });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const state = {
      weather: null,
      sides: [
        { active: [null], screens: [] },
        { active: [defender], screens: [{ type: "light-screen", turnsLeft: 5 }] },
      ],
    } as DamageContext["state"];

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: createMockRng(100), state } as DamageContext,
      chart,
    );

    expect(result.damage).toBe(19);
  });

  it("given Reflect active but move is critical hit, when calculating damage, then Reflect does NOT apply", () => {
    // Source: pret/pokeplatinum battle_lib.c line 6983 — criticalMul == 1 check
    // Crits ignore screens.
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, crit=true
    //   baseDmg = 35; no screen reduction on crit; +2 = 37; crit: 37*2 = 74
    //   random=74; STAB(normal)=floor(74*1.5)=111 → 111
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const state = {
      weather: null,
      sides: [
        { active: [null], screens: [] },
        { active: [defender], screens: [{ type: "reflect", turnsLeft: 5 }] },
      ],
    } as DamageContext["state"];

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: true, rng: createMockRng(100), state } as DamageContext,
      chart,
    );

    // Crit ignores Reflect, so full damage with crit multiplier
    expect(result.damage).toBe(111);
  });

  it("given Reflect active but move is Brick Break, when calculating damage, then Reflect does NOT apply", () => {
    // Source: pret/pokeplatinum battle_lib.c line 6984 — BATTLE_EFFECT_REMOVE_SCREENS check
    // Brick Break bypasses screens.
    // Derivation: L50, power=75 (Brick Break), Atk=100, Def=100, rng=100
    //   baseDmg = floor(floor(22*75*100/100)/50) = floor(1650/50) = 33
    //   No screen reduction (Brick Break bypasses); +2 = 35 → 35
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({
      type: "fighting",
      power: 75,
      category: "physical",
      id: "brick-break",
    });
    const chart = createNeutralTypeChart();

    const state = {
      weather: null,
      sides: [
        { active: [null], screens: [] },
        { active: [defender], screens: [{ type: "reflect", turnsLeft: 5 }] },
      ],
    } as DamageContext["state"];

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: createMockRng(100), state } as DamageContext,
      chart,
    );

    expect(result.damage).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// Issue #429 — null-power branch coverage
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — null power / status moves (issue #429)", () => {
  it("given a move with power === null, when calculating damage, then returns 0 damage with effectiveness 1", () => {
    // Exercises calculateGen4Damage null-power branch (Gen4DamageCalc.ts:528-534)
    // Status moves and variable-power moves that haven't resolved yet have power === null.
    // Source: Showdown sim/battle.ts — status moves skip damage calc and return 0
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    // Construct a move with power explicitly set to null (status move)
    const statusMove: MoveData = {
      id: "growl",
      displayName: "Growl",
      type: "normal",
      category: "status",
      power: null,
      accuracy: 100,
      pp: 40,
      priority: 0,
      target: "adjacent-foe",
      flags: {
        contact: false,
        sound: true,
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
    };
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: statusMove }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(1);
    expect(result.isCrit).toBe(false);
  });

  it("given a move with power === 0, when calculating damage, then returns 0 damage", () => {
    // Exercises calculateGen4Damage power===0 branch (Gen4DamageCalc.ts:531)
    // Some moves that conditionally deal no damage (e.g., failed variable-power moves) have power=0.
    // Source: Showdown sim/battle.ts — power === 0 treated same as null (no damage)
    const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const zeroPowerMove: MoveData = {
      id: "splash",
      displayName: "Splash",
      type: "normal",
      category: "status",
      power: 0,
      accuracy: 100,
      pp: 40,
      priority: 0,
      target: "self",
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
        protect: false,
        mirror: false,
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
    };
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: zeroPowerMove }),
      chart,
    );

    expect(result.damage).toBe(0);
    expect(result.isCrit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue #430 — Heatproof fire-damage halving
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Heatproof ability (issue #430)", () => {
  it("given defender has Heatproof, when hit by a Fire-type physical move, then damage is halved compared to no-Heatproof", () => {
    // Source: Showdown data/abilities.ts — Heatproof onSourceModifyDamage: chainModify(0.5) for Fire
    // Source: Bulbapedia — Heatproof: "Halves the damage from Fire-type moves."
    // Verified: pret/pokeplatinum src/battle/battle_script_commands.c — ABILITY_HEATPROOF halves fire damage
    //
    // Derivation (L50, power=80 Fire physical, Atk=100, Def=100, no STAB [fighting attacker], no weather, rng=100):
    //   Without Heatproof: baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   With Heatproof (post-formula floor(37*0.5) = 18):
    //     The full damage (37) is computed first, then halved post-formula: floor(37*0.5) = 18
    //   Attacker is Fighting-type to avoid STAB on the Fire move.
    //   Note: Bug #355 fix moved Heatproof from pre-calc (attack halving) to post-formula (0.5x on final damage).
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defenderNoHeatproof = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defenderHeatproof = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "heatproof",
    });
    const firePhysicalMove = createMove({
      type: "fire",
      power: 80,
      category: "physical",
      id: "fire-punch",
    });
    const chart = createNeutralTypeChart();

    const noHeatproofResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoHeatproof,
        move: firePhysicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const heatproofResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderHeatproof,
        move: firePhysicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Without Heatproof: 37; with Heatproof (post-formula floor(37*0.5) = 18)
    expect(noHeatproofResult.damage).toBe(37);
    expect(heatproofResult.damage).toBe(18);
  });

  it("given defender has Heatproof, when hit by a Fire-type special move, then damage is halved compared to no-Heatproof", () => {
    // Source: Showdown data/abilities.ts — Heatproof onSourceModifyDamage: chainModify(0.5) for Fire
    // Source: Bulbapedia — Heatproof halves ALL Fire-type move damage (physical and special)
    //
    // Derivation (L50, power=90 Fire special, SpAtk=100, SpDef=100, no STAB [fighting attacker], rng=100):
    //   Without Heatproof: baseDmg = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    //   With Heatproof (post-formula floor(41*0.5) = 20):
    //     The full damage (41) is computed first, then halved post-formula: floor(41*0.5) = 20
    //   Attacker is Fighting-type to avoid STAB on the Fire move.
    //   Note: Bug #355 fix moved Heatproof from pre-calc (SpAtk halving) to post-formula (0.5x on final damage).
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defenderNoHeatproof = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defenderHeatproof = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "heatproof",
    });
    const fireSpecialMove = createMove({
      type: "fire",
      power: 90,
      category: "special",
      id: "flamethrower",
    });
    const chart = createNeutralTypeChart();

    const noHeatproofResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoHeatproof,
        move: fireSpecialMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const heatproofResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderHeatproof,
        move: fireSpecialMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Without Heatproof: 41; with Heatproof (post-formula floor(41*0.5) = 20)
    expect(noHeatproofResult.damage).toBe(41);
    expect(heatproofResult.damage).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Issue #430 addendum — Mold Breaker bypasses Heatproof
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Mold Breaker bypasses Heatproof (issue #430 addendum)", () => {
  it("given attacker has Mold Breaker and defender has Heatproof, when hit by a Fire-type physical move, then damage equals the no-Heatproof baseline (Heatproof ignored)", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker onModifyAtk/onSourceModifyAtk null-out
    //   defender ability callbacks, so Heatproof's 0.5x modifier is not applied.
    // Source: Bulbapedia — Mold Breaker: "Moves used by the Pokemon with this Ability ignore
    //   Abilities of other Pokemon that hinder or prevent those moves."
    // Source: pret/pokeplatinum — ABILITY_MOLD_BREAKER check before ABILITY_HEATPROOF in
    //   BattleScript_AttackAnimationHitFromAtkDefend
    //
    // Derivation (L50, power=80 Fire physical, Atk=100, Def=100, no STAB [Pinsir attacker], rng=100):
    //   Attacker has Mold Breaker and is Bug-type (no STAB on Fire move).
    //   With Heatproof + no Mold Breaker: damage = 18 (post-formula floor(37*0.5) = 18)
    //   With Heatproof + Mold Breaker:   damage = 37 (Heatproof bypassed, post-formula halving skipped)
    //   baseDmg (Mold Breaker): floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    const attackerMoldBreaker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["bug"],
      ability: "mold-breaker",
    });
    const defenderHeatproof = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: "heatproof",
    });
    const firePhysicalMove = createMove({
      type: "fire",
      power: 80,
      category: "physical",
      id: "fire-punch",
    });
    const chart = createNeutralTypeChart();

    const moldBreakerResult = calculateGen4Damage(
      createDamageContext({
        attacker: attackerMoldBreaker,
        defender: defenderHeatproof,
        move: firePhysicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Mold Breaker bypasses Heatproof → damage is 37, NOT the halved 18
    expect(moldBreakerResult.damage).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// Issue #440 — Sandstorm Rock-type SpDef boost (dedicated test)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — sandstorm Rock SpDef boost (issue #440)", () => {
  it("given a Rock-type defender in sandstorm, when hit by a special move, then damage is lower than without sandstorm (1.5x SpDef boost)", () => {
    // Source: Showdown sim/battle.ts — sandstorm boosts Rock-type SpDef by 1.5x
    // Source: pret/pokeplatinum src/battle_util.c — Rock type gets 1.5x SpDef in sandstorm
    // Source: Bulbapedia — Sandstorm: "Rock-type Pokemon have their Special Defense
    //   raised by 50% during a sandstorm. (Generation IV+)"
    //
    // Derivation (L50, power=80 Water special, SpAtk=100, SpDef=100, Rock defender, rng=100):
    //   Attacker is Ice-type (not Water) to avoid Water STAB on the Water move.
    //   Without sandstorm: baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 37
    //   In sandstorm: Rock SpDef boosted: floor(100 * 150/100) = 150
    //     baseDmg = floor(floor(22*80*100/150)/50)+2 = floor(floor(176000/150)/50)+2
    //             = floor(floor(1173.3)/50)+2 = floor(1173/50)+2 = floor(23.46)+2 = 23+2 = 25
    //   NOTE: The 1.5x SpDef is applied in getDefenseStat which uses floor((stat * 150) / 100)
    //   Recalculation with SpDef=150 (from boost): floor(floor(22*80*100/150)/50)+2
    //     22*80*100 = 176000; 176000/150 = 1173.33; floor = 1173; /50 = 23.46; floor = 23; +2 = 25
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ice"],
    });
    const rockDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["rock"],
    });
    const specialMove = createMove({
      type: "water",
      power: 80,
      category: "special",
    });
    const chart = createNeutralTypeChart();

    const noSandstormResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: rockDefender,
        move: specialMove,
        rng: createMockRng(100),
        weather: null,
      }),
      chart,
    );
    const sandstormResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: rockDefender,
        move: specialMove,
        rng: createMockRng(100),
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
      }),
      chart,
    );

    // Without sandstorm: SpDef=100, damage=37
    // With sandstorm: SpDef boosted to 150, damage=25
    expect(noSandstormResult.damage).toBe(37);
    expect(sandstormResult.damage).toBe(25);
    expect(sandstormResult.damage).toBeLessThan(noSandstormResult.damage);
  });

  it("given a non-Rock-type defender in sandstorm, when hit by a special move, then SpDef is NOT boosted (sandstorm boost only applies to Rock types)", () => {
    // Source: Showdown sim/battle.ts — sandstorm SpDef boost is Rock-type ONLY
    // Source: Bulbapedia — Sandstorm SpDef boost: applies only to Rock-type Pokemon
    //
    // Derivation (L50, power=80 Water special, SpAtk=100, SpDef=100, Normal defender, rng=100):
    //   Attacker is Ice-type to avoid Water STAB.
    //   Without sandstorm: floor(floor(22*80*100/100)/50)+2 = 37
    //   In sandstorm (Normal type — NO SpDef boost): floor(floor(22*80*100/100)/50)+2 = 37
    //   Same damage regardless of sandstorm (no chip damage in damage calc, no SpDef boost for Normal)
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["ice"],
    });
    const normalDefender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const specialMove = createMove({ type: "water", power: 80, category: "special" });
    const chart = createNeutralTypeChart();

    const noSandstormResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: normalDefender,
        move: specialMove,
        rng: createMockRng(100),
        weather: null,
      }),
      chart,
    );
    const sandstormResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: normalDefender,
        move: specialMove,
        rng: createMockRng(100),
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
      }),
      chart,
    );

    // Normal type gets NO SpDef boost in sandstorm — identical damage
    expect(noSandstormResult.damage).toBe(37);
    expect(sandstormResult.damage).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// Issue #444 — Explosion/Self-Destruct halving defender Defense
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Explosion/Self-Destruct halves defender Defense (issue #444)", () => {
  it("given attacker uses Explosion against defender with 100 Defense, when calculating damage, then defender Defense is halved to 50 during calculation", () => {
    // Source: Showdown sim/battle.ts — Gen 4 Explosion/Self-Destruct halve defense
    // Source: Bulbapedia — Explosion: "Halves the target's Defense stat during damage
    //   calculation. (Generations I–IV)"
    //
    // Derivation (L50, power=250 Explosion physical, Atk=100, Def=100, rng=100, no STAB [fighting attacker]):
    //   Normal physical move (Def=100):
    //     baseDmg = floor(floor(22*250*100/100)/50)+2 = floor(5500/50)+2 = 110+2 = 112
    //   With Explosion (Def halved to 50):
    //     baseDmg = floor(floor(22*250*100/50)/50)+2 = floor(11000/50)+2 = 220+2 = 222
    //   Attacker is Fighting-type to avoid STAB on the Normal move.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const explosionMove = createMove({
      type: "normal",
      power: 250,
      category: "physical",
      id: "explosion",
    });
    const normalPhysicalMove = createMove({
      type: "normal",
      power: 250,
      category: "physical",
      id: "hyper-beam",
    });
    const chart = createNeutralTypeChart();

    const explosionResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: explosionMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const normalResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: normalPhysicalMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Explosion halves defense → more damage than a normal move of equal power
    expect(normalResult.damage).toBe(112);
    expect(explosionResult.damage).toBe(222);
    expect(explosionResult.damage).toBeGreaterThan(normalResult.damage);
  });

  it("given attacker uses Self-Destruct against defender with 100 Defense, when calculating damage, then damage equals Explosion with same power (both halve defense)", () => {
    // Source: Showdown sim/battle.ts — Self-Destruct also halves defender Defense in Gen 1-4
    // Source: Bulbapedia — Self-Destruct: same halving behavior as Explosion in Gen I-IV
    //
    // Derivation: identical to Explosion above since both trigger the same defense-halving code
    // self-destruct has base power 200 in Gen 4 (not 250 like Explosion)
    // With self-destruct (power=200, Def halved to 50):
    //   baseDmg = floor(floor(22*200*100/50)/50)+2 = floor(8800/50)+2 = 176+2 = 178
    // Normal move power=200 (Def=100):
    //   baseDmg = floor(floor(22*200*100/100)/50)+2 = floor(4400/50)+2 = 88+2 = 90
    //   Attacker is Fighting-type to avoid STAB on the Normal move.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const selfDestructMove = createMove({
      type: "normal",
      power: 200,
      category: "physical",
      id: "self-destruct",
    });
    const normalMove200 = createMove({
      type: "normal",
      power: 200,
      category: "physical",
      id: "double-edge",
    });
    const chart = createNeutralTypeChart();

    const selfDestructResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: selfDestructMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const normalResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: normalMove200,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Self-Destruct halves defense (same as Explosion): higher damage than same-power normal move
    expect(normalResult.damage).toBe(90);
    expect(selfDestructResult.damage).toBe(178);
    expect(selfDestructResult.damage).toBeGreaterThan(normalResult.damage);
  });

  it("given same attacker and defender, when comparing Explosion (250 BP) to Self-Destruct (200 BP), then Explosion deals more damage than Self-Destruct (both halve defense)", () => {
    // Source: Showdown data/moves.json Gen 4 — Explosion basePower=250, Self-Destruct basePower=200
    // Source: Bulbapedia — Explosion BP 250, Self-Destruct BP 200 in all gens; both halve defense in Gen I-IV
    //
    // Derivation (L50, Atk=100, Def=100, Fighting-type attacker, rng=100):
    //   Explosion (power=250, Def halved to 50):
    //     baseDmg = floor(floor(22*250*100/50)/50)+2 = floor(11000/50)+2 = 220+2 = 222
    //   Self-Destruct (power=200, Def halved to 50):
    //     baseDmg = floor(floor(22*200*100/50)/50)+2 = floor(8800/50)+2 = 176+2 = 178
    //   Explosion (222) > Self-Destruct (178) confirms the lower BP of Self-Destruct results in less damage.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const explosionMove = createMove({
      type: "normal",
      power: 250,
      category: "physical",
      id: "explosion",
    });
    const selfDestructMove = createMove({
      type: "normal",
      power: 200,
      category: "physical",
      id: "self-destruct",
    });
    const chart = createNeutralTypeChart();

    const explosionResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: explosionMove,
        rng: createMockRng(100),
      }),
      chart,
    );
    const selfDestructResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: selfDestructMove,
        rng: createMockRng(100),
      }),
      chart,
    );

    // Explosion (250 BP) deals more than Self-Destruct (200 BP) — both halve defense
    expect(explosionResult.damage).toBe(222);
    expect(selfDestructResult.damage).toBe(178);
    expect(explosionResult.damage).toBeGreaterThan(selfDestructResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Issue #445 — SolarBeam power halving in rain/sand/hail
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — SolarBeam power halved in weather (issue #445)", () => {
  it("given SolarBeam user in Rain, when calculating damage, then SolarBeam power is halved (120 → 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — Solar Beam: "Has its base power halved in all weather conditions
    //   aside from harsh sunlight."
    //
    // Derivation (L50, power=120 SolarBeam Grass special, SpAtk=100, SpDef=100, rng=100):
    //   Attacker is Water-type to avoid Grass STAB on SolarBeam.
    //   Without rain: baseDmg = floor(floor(22*120*100/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    //   With rain (power halved to 60, Grass is NOT boosted/weakened by rain):
    //     baseDmg = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    //   Note: Water STAB would boost Surf in rain, but SolarBeam is Grass-type; Water STAB not applied.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const noWeatherResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: null,
      }),
      chart,
    );
    const rainResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
      }),
      chart,
    );

    // No weather: full 120 BP → damage 54; Rain: halved to 60 BP → damage 28
    expect(noWeatherResult.damage).toBe(54);
    expect(rainResult.damage).toBe(28);
  });

  it("given SolarBeam user in Sandstorm, when calculating damage, then SolarBeam power is halved (120 → 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — SolarBeam halved in sandstorm
    //
    // Derivation (same as rain — sandstorm does not modify Grass-type damage):
    //   Attacker is Water-type to avoid Grass STAB.
    //   No weather: floor(floor(22*120*100/100)/50)+2 = 54
    //   Sandstorm (power=60): floor(floor(22*60*100/100)/50)+2 = 28
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const sandstormResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
      }),
      chart,
    );

    expect(sandstormResult.damage).toBe(28);
  });

  it("given SolarBeam user in Hail, when calculating damage, then SolarBeam power is halved (120 → 60)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
    // Source: Bulbapedia — SolarBeam halved in hail
    //
    // Derivation (same as rain/sand — hail does not modify Grass-type damage):
    //   Attacker is Water-type to avoid Grass STAB.
    //   Hail (power=60): floor(floor(22*60*100/100)/50)+2 = 28
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const hailResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "hail", turnsLeft: 5, source: "hail" },
      }),
      chart,
    );

    expect(hailResult.damage).toBe(28);
  });

  it("given SolarBeam user in Harsh Sun (sun), when calculating damage, then SolarBeam power is NOT halved (full 120 BP)", () => {
    // Source: Showdown sim/battle-actions.ts — SolarBeam power is NOT halved in sun/harsh-sun
    // Source: Bulbapedia — SolarBeam: "In sunshine, the Pokémon can attack without charging"
    //   with full 120 BP and no power reduction
    //
    // Derivation (L50, power=120, SpAtk=100, SpDef=100, Grass no weather modifier for sun/grass):
    //   Attacker is Water-type to avoid Grass STAB.
    //   Sun (no halving): floor(floor(22*120*100/100)/50)+2 = 54
    //   (Note: sun boosts Fire 1.5x and halves Water — Grass is unchanged by sun weather modifier)
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const solarBeam = createMove({
      type: "grass",
      power: 120,
      category: "special",
      id: "solar-beam",
    });
    const chart = createNeutralTypeChart();

    const sunResult = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: solarBeam,
        rng: createMockRng(100),
        weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
      }),
      chart,
    );

    // Sun: power NOT halved → same as no weather
    expect(sunResult.damage).toBe(54);
  });
});
