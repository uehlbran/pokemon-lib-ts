import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage, TYPE_RESIST_BERRIES } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem, getPinchBerryThreshold } from "../src/Gen4Items";
import { executeGen4MoveEffect, getFlingPower, NATURAL_GIFT_TABLE } from "../src/Gen4MoveEffects";

/**
 * Gen 4 Wave 6B -- Berry Moves, Type-Resist Berries, Stat Pinch Berries, Jaboca/Rowap
 *
 * Covers:
 *   Move Effects: Natural Gift, Fling, Pluck, Bug Bite
 *   Damage Calc:  16 type-resist berries
 *   Items:        5 stat pinch berries (Liechi/Ganlon/Salac/Petaya/Apicot), Jaboca, Rowap
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia -- individual move/item/berry pages
 */

// ---------------------------------------------------------------------------
// Test helpers (same pattern as wave6a-moves-items.test.ts)
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, nextValue = 0) {
  return {
    next: () => nextValue,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: string;
  lastMoveUsed?: string | null;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  statStages?: Partial<Record<string, number>>;
  gender?: string;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves ?? [
      { moveId: "tackle", currentPP: 35, maxPP: 35 },
      { moveId: "ember", currentPP: 25, maxPP: 25 },
    ],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: (opts.gender ?? "male") as "male" | "female" | "genderless",
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  const volatiles =
    opts.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  const defaultStages = {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
    ...(opts.statStages ?? {}),
  };

  return {
    pokemon,
    teamSlot: 0,
    statStages: defaultStages,
    volatileStatuses: volatiles,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    name: id,
    type: "normal",
    category: "status",
    power: 0,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: [],
    effect: null,
    critRatio: 0,
    generation: 4,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
    gravity: { active: false, turnsLeft: 0 },
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  rng: ReturnType<typeof createMockRng>,
  stateOverrides?: Partial<BattleState>,
): MoveEffectContext {
  const state = { ...createMinimalBattleState(attacker, defender), ...stateOverrides };
  return { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;
}

// -- Damage calc helpers (same pattern as damage-calc.test.ts) --

function createDamageMove(opts: {
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

function createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
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
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ===========================================================================
// Natural Gift
// ===========================================================================

describe("Natural Gift", () => {
  it("given attacker holds cheri-berry, when using Natural Gift, then consumes berry and uses normal damage calc (no customDamage)", () => {
    // Source: Showdown Gen 4 -- Natural Gift uses onModifyMove to set base power/type,
    // then goes through the normal damage calc path (not customDamage).
    // Bug fix #257: Natural Gift should NOT set customDamage.
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "cheri-berry",
      nickname: "Ambipom",
    });
    const defender = createActivePokemon({ types: ["grass"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.itemConsumed).toBe(true);
    expect(result.messages).toContain("Ambipom used Natural Gift! (fire / 60 BP)");
  });

  it("given attacker holds yache-berry, when using Natural Gift, then consumes berry and uses normal damage calc (no customDamage)", () => {
    // Source: Showdown Gen 4 -- Natural Gift uses onModifyMove to set base power/type,
    // then goes through the normal damage calc path (not customDamage).
    // Bug fix #257: Natural Gift should NOT set customDamage.
    const attacker = createActivePokemon({
      types: ["dragon"],
      heldItem: "yache-berry",
      nickname: "Garchomp",
    });
    const defender = createActivePokemon({ types: ["flying"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.itemConsumed).toBe(true);
    expect(result.messages).toContain("Garchomp used Natural Gift! (ice / 60 BP)");
  });

  it("given attacker holds no item, when using Natural Gift, then fails", () => {
    // Source: Bulbapedia -- Natural Gift fails if user has no held Berry
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker has Klutz and holds a berry, when using Natural Gift, then fails", () => {
    // Source: Bulbapedia -- Klutz prevents use of held items, including Natural Gift
    // Source: Showdown Gen 4 -- Klutz suppresses Natural Gift
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "cheri-berry",
      ability: "klutz",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker has Embargo volatile and holds a berry, when using Natural Gift, then fails", () => {
    // Source: Bulbapedia -- Embargo prevents use of held items
    // Source: Showdown Gen 4 -- Embargo suppresses Natural Gift
    const embargoVolatiles = new Map([["embargo", { turnsLeft: 3 }]]);
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "cheri-berry",
      volatiles: embargoVolatiles,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker holds a non-berry item, when using Natural Gift, then fails", () => {
    // Source: Bulbapedia -- Natural Gift only works with berries
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "life-orb",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("natural-gift", { type: "normal" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

describe("Natural Gift table completeness", () => {
  it("given the NATURAL_GIFT_TABLE, then all type-resist berries have entries", () => {
    // Source: Bulbapedia -- Natural Gift table lists entries for all berries including type-resist
    // Spot check: Occa (fire-resist) = fire/60, Yache (ice-resist) = ice/60
    expect(NATURAL_GIFT_TABLE["occa-berry"]).toEqual({ type: "fire", power: 60 });
    expect(NATURAL_GIFT_TABLE["yache-berry"]).toEqual({ type: "ice", power: 60 });
  });

  it("given the NATURAL_GIFT_TABLE, then stat pinch berries have entries with power 80", () => {
    // Source: Bulbapedia -- Natural Gift: Liechi/Ganlon/Salac/Petaya/Apicot = 80 power (Gen IV)
    expect(NATURAL_GIFT_TABLE["liechi-berry"]).toEqual({ type: "grass", power: 80 });
    expect(NATURAL_GIFT_TABLE["ganlon-berry"]).toEqual({ type: "ice", power: 80 });
    expect(NATURAL_GIFT_TABLE["salac-berry"]).toEqual({ type: "fighting", power: 80 });
    expect(NATURAL_GIFT_TABLE["petaya-berry"]).toEqual({ type: "electric", power: 80 });
    expect(NATURAL_GIFT_TABLE["apicot-berry"]).toEqual({ type: "ground", power: 80 });
  });
});

// ===========================================================================
// Fling
// ===========================================================================

describe("Fling", () => {
  it("given attacker holds iron-ball, when using Fling, then consumes item and uses normal damage calc (no customDamage)", () => {
    // Source: Showdown Gen 4 -- Fling uses onModifyMove to set base power,
    // then goes through the normal damage calc path (not customDamage).
    // Bug fix #257: Fling should NOT set customDamage.
    const attacker = createActivePokemon({
      types: ["dark"],
      heldItem: "iron-ball",
      nickname: "Weavile",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fling", { type: "dark" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.itemConsumed).toBe(true);
    expect(result.messages).toContain("Weavile flung its iron-ball!");
  });

  it("given attacker holds a berry, when using Fling, then consumes item and uses normal damage calc (no customDamage)", () => {
    // Source: Showdown Gen 4 -- Fling uses onModifyMove to set base power,
    // then goes through the normal damage calc path (not customDamage).
    // Bug fix #257: Fling should NOT set customDamage.
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      nickname: "Ambipom",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fling", { type: "dark" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.itemConsumed).toBe(true);
    expect(result.messages).toContain("Ambipom flung its sitrus-berry!");
  });

  it("given attacker holds no item, when using Fling, then fails", () => {
    // Source: Bulbapedia -- Fling fails if user has no held item
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fling", { type: "dark" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker has Klutz and holds an item, when using Fling, then fails", () => {
    // Source: Bulbapedia -- Klutz prevents Fling
    // Source: Showdown Gen 4 -- Klutz suppresses Fling
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "iron-ball",
      ability: "klutz",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fling", { type: "dark" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

describe("getFlingPower", () => {
  it("given iron-ball, when getting Fling power, then returns 130", () => {
    // Source: Bulbapedia -- Iron Ball Fling power = 130
    expect(getFlingPower("iron-ball")).toBe(130);
  });

  it("given razor-claw, when getting Fling power, then returns 80", () => {
    // Source: Bulbapedia -- Razor Claw Fling power = 80
    expect(getFlingPower("razor-claw")).toBe(80);
  });

  it("given a berry not in the explicit table, when getting Fling power, then returns 10", () => {
    // Source: Showdown sim/items.ts -- all berries default to 10 Fling power
    expect(getFlingPower("sitrus-berry")).toBe(10);
    expect(getFlingPower("oran-berry")).toBe(10);
  });

  it("given an unknown non-berry item, when getting Fling power, then returns 0 (Fling fails)", () => {
    // Source: Showdown -- items not in the table with no berry suffix have no Fling power
    expect(getFlingPower("unknown-item")).toBe(0);
  });
});

// ===========================================================================
// Pluck / Bug Bite
// ===========================================================================

describe("Pluck / Bug Bite -- berry stealing", () => {
  it("given defender holds oran-berry, when attacker uses Pluck, then defender loses berry and attacker heals 10 HP", () => {
    // Source: Bulbapedia -- Pluck: "steals and eats the target's held Berry"
    // Source: Showdown Gen 4 -- Pluck steals and activates defender's berry
    // Oran Berry heals 10 HP
    const attacker = createActivePokemon({
      types: ["flying"],
      nickname: "Staraptor",
      currentHp: 150,
      maxHp: 200,
    });
    const defender = createActivePokemon({
      types: ["grass"],
      heldItem: "oran-berry",
      nickname: "Roserade",
    });
    const move = createMove("pluck", { type: "flying", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Defender's berry was stolen
    expect(defender.pokemon.heldItem).toBeNull();
    // Attacker heals 10 HP from Oran Berry
    expect(result.healAmount).toBe(10);
    expect(result.messages).toContain("Staraptor stole and ate Roserade's oran-berry!");
  });

  it("given defender holds sitrus-berry, when attacker uses Bug Bite, then attacker heals 1/4 max HP", () => {
    // Source: Bulbapedia -- Bug Bite: same berry-stealing mechanic as Pluck
    // Source: Showdown -- Sitrus Berry heals 1/4 max HP in Gen 4
    // Attacker maxHp = 200, so heals floor(200/4) = 50
    const attacker = createActivePokemon({
      types: ["bug"],
      nickname: "Scizor",
      currentHp: 100,
      maxHp: 200,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      nickname: "Blissey",
    });
    const move = createMove("bug-bite", { type: "bug", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result.healAmount).toBe(50);
    expect(result.messages).toContain("Scizor stole and ate Blissey's sitrus-berry!");
  });

  it("given defender holds lum-berry and attacker is paralyzed, when attacker uses Pluck, then attacker's status is cured", () => {
    // Source: Bulbapedia -- Lum Berry cures all status conditions
    // Source: Showdown -- Pluck/Bug Bite activate the berry's effect for the user
    const attacker = createActivePokemon({
      types: ["flying"],
      status: "paralysis",
      heldItem: null,
      nickname: "Staraptor",
    });
    const defender = createActivePokemon({
      types: ["grass"],
      heldItem: "lum-berry",
    });
    const move = createMove("pluck", { type: "flying", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
  });

  it("given defender holds liechi-berry, when attacker uses Pluck, then attacker gets +1 Attack", () => {
    // Source: Bulbapedia -- Liechi Berry: when eaten, boosts Attack by 1 stage
    // Source: Showdown -- Pluck/Bug Bite eat stat pinch berries for their effect
    const attacker = createActivePokemon({ types: ["flying"], nickname: "Staraptor" });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "liechi-berry",
    });
    const move = createMove("pluck", { type: "flying", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result.statChanges).toEqual(
      expect.arrayContaining([{ target: "attacker", stat: "attack", stages: 1 }]),
    );
  });

  it("given defender holds no berry, when attacker uses Pluck, then no berry effect occurs and move resolves normally", () => {
    // Source: Bulbapedia -- Pluck: "If the target is not holding a Berry, the move functions normally"
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: null });
    const move = createMove("pluck", { type: "flying", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // No berry-related effects
    expect(result.healAmount).toBe(0);
    expect(result.statChanges).toEqual([]);
  });

  it("given defender holds a non-berry item, when attacker uses Bug Bite, then item is NOT stolen", () => {
    // Source: Bulbapedia -- Bug Bite/Pluck only steal berries, not other items
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "leftovers" });
    const move = createMove("bug-bite", { type: "bug", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Leftovers should not be stolen
    expect(defender.pokemon.heldItem).toBe("leftovers");
    expect(result.healAmount).toBe(0);
  });

  it("given defender holds a berry and has Unburden, when attacker uses Pluck, then defender gets unburden volatile", () => {
    // Source: Bulbapedia -- Unburden: "Speed stat is doubled when the Pokemon's held item
    //   is used or lost"
    // Source: Showdown -- Unburden activates when item is consumed/stolen
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "oran-berry",
      ability: "unburden",
    });
    const move = createMove("pluck", { type: "flying", power: 60, category: "physical" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ===========================================================================
// Type-Resist Berries (16 in damage calc)
// ===========================================================================

describe("Type-resist berries -- damage calc", () => {
  it("given defender holds occa-berry and takes SE fire damage, when calculating damage, then damage is halved by the berry", () => {
    // Source: Bulbapedia -- Occa Berry: "Weakens a supereffective Fire-type attack"
    // Source: Showdown sim/items.ts -- Occa Berry onSourceModifyDamage: 0.5x
    //
    // Setup: Normal-type attacker (no STAB), fire move (power 80) vs. Grass-type defender (SE 2x)
    // L50, Atk=100, Def=100, rng=100 (max roll)
    // levelFactor = floor(2*50/5) + 2 = 22
    // baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(35.2) = 35
    // +2 = 37
    // random: 100/100 = 1.0 -> 37
    // no STAB -> 37
    // SE 2x -> 74
    // berry 0.5x -> floor(74 * 0.5) = 37
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const move = createDamageMove({ type: "fire", power: 80, category: "physical" });
    const typeChart = createTypeChart([["fire", "grass", 2]]);
    const rng = createMockRng(100); // max roll

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // Without berry: 37 * 2.0 SE = 74
    // With berry: floor(74 * 0.5) = 37
    expect(result.damage).toBe(37);
    // Berry is consumed (defender's held item is now null)
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given defender holds yache-berry and takes SE ice damage, when calculating damage, then damage is halved by the berry", () => {
    // Source: Bulbapedia -- Yache Berry: "Weakens a supereffective Ice-type attack"
    // Source: Showdown sim/items.ts -- Yache Berry onSourceModifyDamage: 0.5x
    //
    // Normal-type attacker (no STAB), ice move vs dragon defender (SE 2x)
    // Same formula as occa test: baseDamage=37, SE=74, berry=37
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["dragon"],
      defense: 100,
      heldItem: "yache-berry",
    });
    const move = createDamageMove({ type: "ice", power: 80, category: "physical" });
    const typeChart = createTypeChart([["ice", "dragon", 2]]);
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // Without berry: 37 * 2 = 74; with berry: floor(74 * 0.5) = 37
    expect(result.damage).toBe(37);
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given defender holds occa-berry but takes neutral fire damage, when calculating damage, then berry does NOT activate", () => {
    // Source: Bulbapedia -- type-resist berries only activate on super effective hits
    // Source: Showdown sim/items.ts -- condition: effectiveness > 1
    // Normal-type attacker (no STAB), fire move vs normal-type defender (neutral 1x)
    // baseDamage=37, neutral=37 (no berry reduction because not SE)
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["normal"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const move = createDamageMove({ type: "fire", power: 80, category: "physical" });
    const typeChart = createNeutralTypeChart(); // all 1x
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // Neutral: baseDamage = 37, * 1.0 = 37 (no berry reduction)
    expect(result.damage).toBe(37);
    // Berry is NOT consumed
    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given defender holds occa-berry but attacker uses water move (SE vs ground), when calculating damage, then occa-berry does NOT activate (wrong type)", () => {
    // Source: Bulbapedia -- type-resist berries are type-specific: Occa = fire only
    // Normal-type attacker (no STAB), water move vs ground defender (SE 2x)
    // baseDamage=37, SE 2x=74, no berry (wrong type)
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["ground"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const move = createDamageMove({ type: "water", power: 80, category: "physical" });
    const typeChart = createTypeChart([["water", "ground", 2]]);
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // SE water, but occa-berry resists fire. No reduction.
    // 37 * 2 = 74
    expect(result.damage).toBe(74);
    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given defender has Klutz and holds occa-berry, when hit by SE fire move, then berry does NOT activate", () => {
    // Source: Bulbapedia -- Klutz: prevents use of held items
    // Source: Showdown -- Klutz suppresses type-resist berries
    // Normal-type attacker (no STAB), fire move vs grass defender (SE 2x), Klutz blocks berry
    // baseDamage=37, SE=74 (no berry reduction due to Klutz)
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
      ability: "klutz",
    });
    const move = createDamageMove({ type: "fire", power: 80, category: "physical" });
    const typeChart = createTypeChart([["fire", "grass", 2]]);
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // No berry reduction: 37 * 2 = 74
    expect(result.damage).toBe(74);
    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given defender has Embargo volatile and holds yache-berry, when hit by SE ice move, then berry does NOT activate", () => {
    // Source: Bulbapedia -- Embargo prevents use of held items
    // Source: Showdown -- Embargo suppresses type-resist berries
    // Normal-type attacker (no STAB), ice move vs dragon defender (SE 2x), Embargo blocks berry
    // baseDamage=37, SE=74 (no berry reduction due to Embargo)
    const embargoVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>(
      [["embargo", { turnsLeft: 3 }]],
    );
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["dragon"],
      defense: 100,
      heldItem: "yache-berry",
      volatiles: embargoVolatiles,
    });
    const move = createDamageMove({ type: "ice", power: 80, category: "physical" });
    const typeChart = createTypeChart([["ice", "dragon", 2]]);
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen4Damage(ctx, typeChart);

    // No berry reduction: 37 * 2 = 74
    expect(result.damage).toBe(74);
    expect(defender.pokemon.heldItem).toBe("yache-berry");
  });

  it("given defender holds occa-berry and has Unburden, when hit by SE fire move, then Unburden activates after berry consumption", () => {
    // Source: Bulbapedia -- Unburden: doubles Speed when held item is consumed
    // Source: Showdown -- Unburden activates on type-resist berry consumption
    const attacker = createActivePokemon({ types: ["normal"], attack: 100 });
    const defender = createActivePokemon({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
      ability: "unburden",
    });
    const move = createDamageMove({ type: "fire", power: 80, category: "physical" });
    const typeChart = createTypeChart([["fire", "grass", 2]]);
    const rng = createMockRng(100);

    const ctx = createDamageContext({ attacker, defender, move, rng });
    calculateGen4Damage(ctx, typeChart);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
  });
});

describe("TYPE_RESIST_BERRIES constant", () => {
  it("given the TYPE_RESIST_BERRIES constant, then all 16 type-resist berries are present", () => {
    // Source: Bulbapedia -- 16 type-resist berries introduced in Gen 4
    const expected: Record<string, string> = {
      "occa-berry": "fire",
      "passho-berry": "water",
      "wacan-berry": "electric",
      "rindo-berry": "grass",
      "yache-berry": "ice",
      "chople-berry": "fighting",
      "kebia-berry": "poison",
      "shuca-berry": "ground",
      "coba-berry": "flying",
      "payapa-berry": "psychic",
      "tanga-berry": "bug",
      "charti-berry": "rock",
      "kasib-berry": "ghost",
      "haban-berry": "dragon",
      "colbur-berry": "dark",
      "babiri-berry": "steel",
    };

    expect(Object.keys(TYPE_RESIST_BERRIES).length).toBe(16);
    for (const [berry, type] of Object.entries(expected)) {
      expect(TYPE_RESIST_BERRIES[berry]).toBe(type);
    }
  });
});

// ===========================================================================
// Stat Pinch Berries (held item triggers)
// ===========================================================================

describe("Stat pinch berries -- on-damage-taken triggers", () => {
  it("given holder has Liechi Berry at 24% HP after damage, when triggered, then Attack is boosted", () => {
    // Source: Bulbapedia -- Liechi Berry: raises Attack by 1 stage when HP falls to 25% or below
    // Source: Showdown sim/items.ts -- Liechi Berry onUpdate: pinch check
    // maxHp=200, currentHp=200, damage=152 -> hpAfterDamage=48, threshold=floor(200*0.25)=50
    // 48 <= 50 => activates
    const pokemon = createActivePokemon({
      types: ["grass"],
      heldItem: "liechi-berry",
      maxHp: 200,
      currentHp: 200,
      nickname: "Sceptile",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 152,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "stat-boost", target: "self", value: "attack" },
        { type: "consume", target: "self", value: "liechi-berry" },
      ]),
    );
    expect(result.messages).toContain("Sceptile's Liechi Berry raised its Attack!");
  });

  it("given holder has Ganlon Berry at 26% HP after damage (above threshold), when triggered, then does NOT activate", () => {
    // Source: Bulbapedia -- Ganlon Berry: activates at 25% HP or below
    // maxHp=200, threshold=floor(200*0.25)=50, hpAfterDamage=52 (26%) > 50 => no activation
    const pokemon = createActivePokemon({
      types: ["steel"],
      heldItem: "ganlon-berry",
      maxHp: 200,
      currentHp: 200,
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 148,
    });

    expect(result.activated).toBe(false);
  });

  it("given holder has Salac Berry and Gluttony ability, when at 49% HP after damage, then activates at 50% threshold", () => {
    // Source: Bulbapedia -- Gluttony: "makes the Pokemon eat a held Berry when its
    //   HP drops to 50% or below instead of the usual 25%"
    // Source: Showdown -- Gluttony changes pinch berry threshold from 0.25 to 0.5
    // maxHp=200, threshold=floor(200*0.5)=100, hpAfterDamage=98 (49%) <= 100 => activates
    const pokemon = createActivePokemon({
      types: ["water"],
      heldItem: "salac-berry",
      maxHp: 200,
      currentHp: 200,
      ability: "gluttony",
      nickname: "Floatzel",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 102,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "stat-boost", target: "self", value: "speed" },
        { type: "consume", target: "self", value: "salac-berry" },
      ]),
    );
    expect(result.messages).toContain("Floatzel's Salac Berry raised its Speed!");
  });

  it("given holder has Petaya Berry at 25% HP after damage, when triggered, then Sp. Atk is boosted", () => {
    // Source: Bulbapedia -- Petaya Berry: raises Sp. Atk by 1 stage
    // maxHp=200, threshold=50, hpAfterDamage=50 (exactly 25%) <= 50 => activates
    const pokemon = createActivePokemon({
      types: ["psychic"],
      heldItem: "petaya-berry",
      maxHp: 200,
      currentHp: 200,
      nickname: "Alakazam",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 150,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "stat-boost", target: "self", value: "spAttack" },
        { type: "consume", target: "self", value: "petaya-berry" },
      ]),
    );
    expect(result.messages).toContain("Alakazam's Petaya Berry raised its Sp. Atk!");
  });

  it("given holder has Apicot Berry at 10% HP after damage, when triggered, then Sp. Def is boosted", () => {
    // Source: Bulbapedia -- Apicot Berry: raises Sp. Def by 1 stage
    // maxHp=200, threshold=50, hpAfterDamage=20 (10%) <= 50 => activates
    const pokemon = createActivePokemon({
      types: ["ice"],
      heldItem: "apicot-berry",
      maxHp: 200,
      currentHp: 200,
      nickname: "Regice",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 180,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "stat-boost", target: "self", value: "spDefense" },
        { type: "consume", target: "self", value: "apicot-berry" },
      ]),
    );
    expect(result.messages).toContain("Regice's Apicot Berry raised its Sp. Def!");
  });

  it("given holder would be KO'd (0 HP after damage), when Liechi Berry check runs, then does NOT activate", () => {
    // Source: Showdown -- pinch berries require hpAfterDamage > 0 (alive)
    // maxHp=200, damage=200, hpAfterDamage=0 => does not activate
    const pokemon = createActivePokemon({
      types: ["grass"],
      heldItem: "liechi-berry",
      maxHp: 200,
      currentHp: 200,
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 200,
    });

    expect(result.activated).toBe(false);
  });
});

describe("getPinchBerryThreshold", () => {
  it("given a Pokemon without Gluttony, when checking 0.25 threshold, then returns 0.25", () => {
    // Source: Bulbapedia -- normal pinch berry threshold is 25%
    expect(getPinchBerryThreshold({ ability: "" }, 0.25)).toBe(0.25);
  });

  it("given a Pokemon with Gluttony, when checking 0.25 threshold, then returns 0.5", () => {
    // Source: Bulbapedia -- Gluttony raises pinch threshold from 25% to 50%
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.25)).toBe(0.5);
  });

  it("given a Pokemon with Gluttony, when checking a threshold above 0.25 (e.g. 0.5), then returns unchanged", () => {
    // Source: Showdown -- Gluttony only affects <= 0.25 thresholds
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.5)).toBe(0.5);
  });
});

// ===========================================================================
// Jaboca Berry / Rowap Berry (retaliation berries)
// ===========================================================================

describe("Jaboca Berry", () => {
  it("given holder holds Jaboca Berry and is hit by a physical move, when triggered, then attacker takes 1/8 max HP damage", () => {
    // Source: Bulbapedia -- Jaboca Berry: "If hit by a physical move, the attacker
    //   loses 1/8 of its max HP."
    // Source: Showdown sim/items.ts -- Jaboca Berry onDamagingHit
    // maxHp=200, retaliation = floor(200/8) = 25
    const pokemon = createActivePokemon({
      types: ["steel"],
      heldItem: "jaboca-berry",
      maxHp: 200,
      currentHp: 150,
      nickname: "Skarmory",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 50,
      move: { category: "physical" } as MoveData,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "self-damage", target: "opponent", value: 25 },
        { type: "consume", target: "self", value: "jaboca-berry" },
      ]),
    );
    expect(result.messages).toContain("Skarmory's Jaboca Berry hurt the attacker!");
  });

  it("given holder holds Jaboca Berry and is hit by a special move, when triggered, then Jaboca Berry does NOT activate", () => {
    // Source: Bulbapedia -- Jaboca Berry only activates on physical moves
    const pokemon = createActivePokemon({
      types: ["steel"],
      heldItem: "jaboca-berry",
      maxHp: 200,
      currentHp: 150,
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 50,
      move: { category: "special" } as MoveData,
    });

    expect(result.activated).toBe(false);
  });
});

describe("Rowap Berry", () => {
  it("given holder holds Rowap Berry and is hit by a special move, when triggered, then attacker takes 1/8 max HP damage", () => {
    // Source: Bulbapedia -- Rowap Berry: "If hit by a special move, the attacker
    //   loses 1/8 of its max HP."
    // Source: Showdown sim/items.ts -- Rowap Berry onDamagingHit
    // maxHp=200, retaliation = floor(200/8) = 25
    const pokemon = createActivePokemon({
      types: ["psychic"],
      heldItem: "rowap-berry",
      maxHp: 200,
      currentHp: 150,
      nickname: "Bronzong",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 50,
      move: { category: "special" } as MoveData,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { type: "self-damage", target: "opponent", value: 25 },
        { type: "consume", target: "self", value: "rowap-berry" },
      ]),
    );
    expect(result.messages).toContain("Bronzong's Rowap Berry hurt the attacker!");
  });

  it("given holder holds Rowap Berry and is hit by a physical move, when triggered, then Rowap Berry does NOT activate", () => {
    // Source: Bulbapedia -- Rowap Berry only activates on special moves
    const pokemon = createActivePokemon({
      types: ["psychic"],
      heldItem: "rowap-berry",
      maxHp: 200,
      currentHp: 150,
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 50,
      move: { category: "physical" } as MoveData,
    });

    expect(result.activated).toBe(false);
  });

  it("given holder holds Rowap Berry with maxHp=1 and is hit by a special move, when triggered, then retaliation damage is at least 1", () => {
    // Source: Showdown -- Math.max(1, floor(maxHp/8)) ensures minimum 1 damage
    // maxHp=1, floor(1/8)=0, max(1,0)=1
    const pokemon = createActivePokemon({
      types: ["bug"],
      heldItem: "rowap-berry",
      maxHp: 1,
      currentHp: 1,
      nickname: "Shedinja",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("on-damage-taken", {
      pokemon,
      state,
      rng,
      damage: 1,
      move: { category: "special" } as MoveData,
    });

    expect(result.activated).toBe(true);
    const selfDamageEffect = result.effects!.find((e) => e.type === "self-damage");
    expect(selfDamageEffect).toBeDefined();
    expect(selfDamageEffect!.value).toBe(1);
  });
});
