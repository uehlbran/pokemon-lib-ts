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

  it("given defender has Thick Fat and attacker uses Fire-type move, when calculating damage, then effective attack is halved", () => {
    // Source: Bulbapedia — Thick Fat (Gen 3+): "The power of Fire- and Ice-type moves against
    //   this Pokémon is halved"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const thickFatDefender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
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
    // Thick Fat halves the *attack stat* before the formula, not the final damage.
    // Derivation: attack=100 halved to 50 → baseDamage=floor(floor(22*80*50/100)/50)=17, +2→19
    // (noAbilityResult=37; floor(37*0.5)=18 would be wrong due to integer arithmetic differences)
    expect(thickFatResult.damage).toBe(19);
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
// Tests: Plates (Gen 4 new item type — 1.2x boost, vs 1.1x for type-boost items)
// ---------------------------------------------------------------------------

describe("Gen 4 damage calc — Plates (1.2x type boost)", () => {
  it("given attacker holds Flame Plate and uses a Fire move, when calculating, then boost is 1.2x vs no item", () => {
    // Source: Bulbapedia — Plates (Gen 4): "Raises the power of [type] moves by 20%."
    // Source: Showdown sim/items.ts — all Plates use 1.2x boost (not 1.1x like type-boost items)
    // Derivation: no-item → L50, power=80, spAtk=100, spDef=100, rng=100, neutral, STAB
    //   levelFactor=22, base=floor(floor(22*80*100/100)/50)=35, +2=37
    //   STAB (fire attacker, fire move): floor(37*1.5)=55; final=55
    //   with flame-plate (1.2x to spAtk): spAtk=floor(100*120/100)=120
    //   base=floor(floor(22*80*120/100)/50)=floor(2112/50)=42, +2=44
    //   STAB: floor(44*1.5)=66; final=66
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

    // Derivation above: no-item → 55 (with STAB), plate → 66
    expect(noItemResult.damage).toBe(55);
    expect(plateResult.damage).toBe(66);
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

describe("Gen 4 damage calc — Metronome item power boost", () => {
  it("given Metronome item with 1 consecutive use, when calculating damage, then power is boosted by 1.2x", () => {
    // Source: Showdown sim/items.ts — Metronome item consecutive use boost
    // Source: Bulbapedia — Metronome (item): "Each consecutive use adds 20% to power"
    // Source: specs/battle/05-gen4.md line 599 — "1.0x, 1.2x, 1.4x, 1.6x, 1.8x, 2.0x"
    //
    // Derivation (L50, power=80*1.2=96, Atk=100, Def=100, rng=100):
    //   levelFactor = 22
    //   baseDmg = floor(floor(22*96*100/100)/50)+2 = floor(2112/50)+2 = 42+2 = 44
    // Without Metronome boost (power=80):
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"],
      heldItem: "metronome",
    });
    // Set up metronome-count volatile: 1 consecutive use
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 1 });

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

    // Power 80 * 1.2 = 96 (floor)
    // floor(floor(22*96*100/100)/50)+2 = floor(2112/50)+2 = 42+2 = 44
    // STAB: attacker is Normal, move is Normal -> 1.5x
    // 44 * 1.5 = 66
    expect(result.damage).toBe(66);
  });

  it("given Metronome item with 5 consecutive uses (max), when calculating damage, then power is boosted by 2.0x", () => {
    // Source: Showdown sim/items.ts — Metronome item caps at 2.0x
    // Source: specs/battle/05-gen4.md line 599 — "1.0x, 1.2x, 1.4x, 1.6x, 1.8x, 2.0x"
    //
    // Derivation (L50, power=80*2.0=160, Atk=100, Def=100, rng=100):
    //   baseDmg = floor(floor(22*160*100/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB on normal move
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 5 });

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

    // Power 80 * 2.0 = 160 (no STAB: fighting attacker, normal move)
    // floor(floor(22*160*100/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
    expect(result.damage).toBe(72);
  });

  it("given Metronome item with 0 consecutive uses, when calculating damage, then no boost is applied (1.0x)", () => {
    // Source: Showdown sim/items.ts — Metronome first use = 1.0x (no boost)
    // Source: specs/battle/05-gen4.md line 599 — "1.0x" for first use
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB on normal move
      heldItem: "metronome",
    });
    // metronome-count turnsLeft = 0 means no consecutive uses yet
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 0 });

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

    // No boost: power=80
    // floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    expect(result.damage).toBe(37);
  });

  it("given Metronome item with 10 consecutive uses (exceeds cap), when calculating damage, then capped at 2.0x", () => {
    // Source: Showdown sim/items.ts — Metronome caps at 2.0x (5 consecutive uses)
    // Even with more consecutive uses, the multiplier cannot exceed 2.0x.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 10 });

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

    // Capped at 2.0x: same as 5 consecutive uses → 72
    expect(result.damage).toBe(72);
  });

  it("given no Metronome item even with metronome-count volatile, when calculating damage, then no boost is applied", () => {
    // Source: Showdown sim/items.ts — Metronome boost only applies when holding the item
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: null, // NOT holding metronome
    });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 5 });

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

    // No item = no boost: power=80 → 37
    expect(result.damage).toBe(37);
  });
});
