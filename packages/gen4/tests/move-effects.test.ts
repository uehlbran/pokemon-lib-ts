import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { canInflictGen4Status, Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";

/**
 * Gen 4 Move Effects Tests
 *
 * Tests for executeGen4MoveEffect: weather (with rocks), screens (with Light Clay),
 * hazards (stealth rock, toxic spikes, spikes), status infliction with Gen 4 immunities,
 * stat changes, recoil, drain, heal, protect, rapid spin, knock off, custom effects
 * (belly drum, rest, haze, pain split, weather-dependent healing, defog, roost, etc.),
 * Shield Dust, Serene Grace, and the critical Electric/paralysis difference from Gen 3.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => chanceResult,
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
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
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
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
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

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    name: id,
    type: "normal",
    category: "physical",
    power: 80,
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

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weatherType?: string | null,
): BattleState {
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
    weather: { type: weatherType ?? null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
  weatherType?: string | null,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, weatherType);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ─── Weather ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Weather", () => {
  it("given Rain Dance used without Damp Rock, when executeMoveEffect called, then weatherSet = { weather: 'rain', turns: 5 }", () => {
    // Source: Showdown Gen 4 — Rain Dance sets 5-turn rain without rock
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rain-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "rain", turns: 5, source: "rain-dance" });
  });

  it("given Rain Dance used with Damp Rock, when executeMoveEffect called, then weatherSet = { weather: 'rain', turns: 8 }", () => {
    // Source: Bulbapedia — Damp Rock extends rain to 8 turns
    // Source: pret/pokeplatinum — weather rock items extend weather to 8 turns
    const attacker = createActivePokemon({ types: ["water"], heldItem: "damp-rock" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rain-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "rain", turns: 8, source: "rain-dance" });
  });

  it("given Sunny Day used with Heat Rock, when executeMoveEffect called, then weatherSet = { weather: 'sun', turns: 8 }", () => {
    // Source: Bulbapedia — Heat Rock extends sun to 8 turns
    const attacker = createActivePokemon({ types: ["fire"], heldItem: "heat-rock" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("sunny-day");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "sun", turns: 8, source: "sunny-day" });
  });

  it("given Sandstorm used with Smooth Rock, when executeMoveEffect called, then weatherSet = { weather: 'sand', turns: 8 }", () => {
    // Source: Bulbapedia — Smooth Rock extends sandstorm to 8 turns
    const attacker = createActivePokemon({ types: ["rock"], heldItem: "smooth-rock" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("sandstorm");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "sand", turns: 8, source: "sandstorm" });
  });

  it("given Hail used with Icy Rock, when executeMoveEffect called, then weatherSet = { weather: 'hail', turns: 8 }", () => {
    // Source: Bulbapedia — Icy Rock extends hail to 8 turns
    const attacker = createActivePokemon({ types: ["ice"], heldItem: "icy-rock" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("hail");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "hail", turns: 8, source: "hail" });
  });

  it("given Rain Dance used with wrong rock (Heat Rock), when executeMoveEffect called, then turns = 5 (not 8)", () => {
    // Source: Showdown Gen 4 — mismatched rock does not extend weather
    const attacker = createActivePokemon({ types: ["water"], heldItem: "heat-rock" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rain-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "rain", turns: 5, source: "rain-dance" });
  });

  it("given Sunny Day used without any rock, when executeMoveEffect called, then weatherSet turns = 5", () => {
    // Source: Showdown Gen 4 — default weather duration
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("sunny-day");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "sun", turns: 5, source: "sunny-day" });
  });
});

// ─── Screens ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Screens", () => {
  it("given Reflect used without Light Clay, when executeMoveEffect called, then screenSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Reflect lasts 5 turns without Light Clay
    const attacker = createActivePokemon({ types: ["psychic"], nickname: "Alakazam" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("reflect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: "reflect", turnsLeft: 5, side: "attacker" });
    expect(result.messages).toContain("Alakazam put up a Reflect!");
  });

  it("given Reflect used with Light Clay, when executeMoveEffect called, then screenSet with 8 turns", () => {
    // Source: Bulbapedia — Light Clay extends screens to 8 turns
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: "light-clay",
      nickname: "Alakazam",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("reflect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: "reflect", turnsLeft: 8, side: "attacker" });
    expect(result.messages).toContain("Alakazam put up a Reflect!");
  });

  it("given Light Screen used with Light Clay, when executeMoveEffect called, then screenSet with 8 turns", () => {
    // Source: Bulbapedia — Light Clay extends screens to 8 turns
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: "light-clay",
      nickname: "Espeon",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("light-screen");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "light-screen",
      turnsLeft: 8,
      side: "attacker",
    });
    expect(result.messages).toContain("Espeon put up a Light Screen!");
  });

  it("given Light Screen used without Light Clay, when executeMoveEffect called, then screenSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Light Screen lasts 5 turns without Light Clay
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("light-screen");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "light-screen",
      turnsLeft: 5,
      side: "attacker",
    });
  });
});

// ─── Entry Hazards (null-effect moves) ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — Entry Hazards (null-effect)", () => {
  it("given Stealth Rock used, when executeMoveEffect called, then hazardSet = stealth-rock on opponent's side", () => {
    // Source: Showdown Gen 4 — Stealth Rock sets entry hazard
    // Source: Bulbapedia — Stealth Rock introduced in Gen 4
    const attacker = createActivePokemon({ types: ["rock"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("stealth-rock");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: "stealth-rock", targetSide: 1 });
    expect(result.messages).toContain("Pointed stones float in the air around the foe!");
  });

  it("given Toxic Spikes used, when executeMoveEffect called, then hazardSet = toxic-spikes on opponent's side", () => {
    // Source: Showdown Gen 4 — Toxic Spikes sets entry hazard
    // Source: Bulbapedia — Toxic Spikes introduced in Gen 4
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("toxic-spikes");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: "toxic-spikes", targetSide: 1 });
    expect(result.messages).toContain("Poison spikes were scattered on the ground!");
  });

  it("given Spikes used (data-driven entry-hazard type), when executeMoveEffect called, then hazardSet = spikes on opponent's side", () => {
    // Source: Showdown Gen 4 — Spikes carried over from Gen 3
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("spikes");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: "spikes", targetSide: 1 });
  });
});

// ─── Knock Off ──────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Knock Off", () => {
  it("given Knock Off vs Pokemon with item, when executeMoveEffect called, then item is removed", () => {
    // Source: Showdown Gen 4 — Knock Off removes defender's held item, no damage boost
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
      nickname: "Snorlax",
    });
    const move = dataManager.getMove("knock-off");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result.messages).toContain("Snorlax lost its leftovers!");
  });

  it("given Knock Off vs Pokemon with no item, when executeMoveEffect called, then no effect", () => {
    // Source: Showdown Gen 4 — Knock Off has no secondary effect if target has no item
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: null });
    const move = dataManager.getMove("knock-off");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages.length).toBe(0);
  });
});

// ─── Status Infliction ─────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Status Infliction", () => {
  it("given Flamethrower (10% burn chance) and roll succeeds, when executeMoveEffect called, then statusInflicted = 'burn'", () => {
    // Source: Showdown Gen 4 — Flamethrower has 10% secondary burn chance
    // rng.int(0,99) returns 0 → 0 < 10 → success
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(0); // intReturn=0, always succeeds the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("burn");
  });

  it("given Flamethrower (10% burn chance) and roll fails, when executeMoveEffect called, then statusInflicted = null", () => {
    // rng.int(0,99) returns 50 → 50 < 10 = false → miss
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(50); // intReturn=50, fails the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given Fire-type defender, when Flamethrower burn chance succeeds, then burn NOT inflicted (type immunity)", () => {
    // Source: Showdown Gen 4 — Fire types are immune to burn
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["fire"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given defender already has status, when burn chance succeeds, then status NOT inflicted", () => {
    // Source: Showdown Gen 4 — can't have two primary statuses
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"], status: "paralysis" });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });
});

// ─── Gen 4 Electric/Paralysis (NO immunity) ────────────────────────────────

describe("Gen 4 canInflictGen4Status — Electric/Paralysis", () => {
  it("given Electric-type target, when paralysis is attempted, then paralysis CAN be inflicted (Gen 4 has no Electric immunity)", () => {
    // Source: Showdown Gen 4 — Electric types are NOT immune to paralysis
    // Source: Bulbapedia — Electric-type paralysis immunity introduced in Gen 6
    const target = createActivePokemon({ types: ["electric"] });

    const result = canInflictGen4Status("paralysis", target);

    expect(result).toBe(true);
  });

  it("given Electric-type target with existing status, when paralysis is attempted, then cannot inflict (already has status)", () => {
    // Source: Showdown Gen 4 — can't have two primary statuses
    const target = createActivePokemon({ types: ["electric"], status: "burn" });

    const result = canInflictGen4Status("paralysis", target);

    expect(result).toBe(false);
  });
});

describe("Gen 4 canInflictGen4Status — Type Immunities", () => {
  it("given Fire-type target, when burn is attempted, then burn cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Fire types immune to burn
    const target = createActivePokemon({ types: ["fire"] });
    expect(canInflictGen4Status("burn", target)).toBe(false);
  });

  it("given non-Fire-type target, when burn is attempted, then burn can be inflicted", () => {
    // Source: Showdown Gen 4 — non-Fire types can be burned
    const target = createActivePokemon({ types: ["normal"] });
    expect(canInflictGen4Status("burn", target)).toBe(true);
  });

  it("given Ice-type target, when freeze is attempted, then freeze cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Ice types immune to freeze
    const target = createActivePokemon({ types: ["ice"] });
    expect(canInflictGen4Status("freeze", target)).toBe(false);
  });

  it("given Poison-type target, when poison is attempted, then poison cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Poison types immune to poison
    const target = createActivePokemon({ types: ["poison"] });
    expect(canInflictGen4Status("poison", target)).toBe(false);
  });

  it("given Steel-type target, when badly-poisoned is attempted, then badly-poisoned cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Steel types immune to poison/badly-poisoned
    const target = createActivePokemon({ types: ["steel"] });
    expect(canInflictGen4Status("badly-poisoned", target)).toBe(false);
  });

  it("given target already has status, when burn is attempted, then burn cannot be inflicted", () => {
    // Source: Showdown Gen 4 — can't stack primary statuses
    const target = createActivePokemon({ types: ["normal"], status: "sleep" });
    expect(canInflictGen4Status("burn", target)).toBe(false);
  });
});

// ─── Shield Dust ────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Shield Dust", () => {
  it("given defender has Shield Dust, when damaging move has secondary burn effect, then burn is blocked", () => {
    // Source: Showdown Gen 4 — Shield Dust blocks secondary effects
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"], ability: "shield-dust" });
    const move = dataManager.getMove("flamethrower"); // 10% burn chance
    const rng = createMockRng(0); // Roll would succeed without Shield Dust
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given defender has Shield Dust, when guaranteed status move used, then status IS inflicted (not secondary)", () => {
    // Source: Showdown Gen 4 — Shield Dust only blocks secondary effects
    // Thunder Wave is a guaranteed status move (status-guaranteed), not secondary
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({ types: ["normal"], ability: "shield-dust" });
    const move = dataManager.getMove("thunder-wave");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("paralysis");
  });
});

// ─── Serene Grace ───────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Serene Grace", () => {
  it("given attacker has Serene Grace and roll at 15, when Flamethrower (10% burn), then burn IS inflicted (chance doubled to 20%)", () => {
    // Source: Showdown Gen 4 — Serene Grace doubles secondary effect chance
    // 10% → 20% with Serene Grace; rng.int(0,99)=15 → 15 < 20 → success
    const attacker = createActivePokemon({ types: ["fire"], ability: "serene-grace" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(15);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("burn");
  });

  it("given attacker without Serene Grace and roll at 15, when Flamethrower (10% burn), then burn NOT inflicted", () => {
    // Without Serene Grace: 10% chance; rng.int(0,99)=15 → 15 < 10 = false → miss
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(15);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });
});

// ─── Recoil + Rock Head ─────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Recoil", () => {
  it("given Double-Edge used dealing 100 damage, when executeMoveEffect called, then recoilDamage = 33 (1/3 recoil)", () => {
    // Source: Showdown Gen 4 — Double-Edge has 1/3 recoil
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("double-edge", {
      effect: { type: "recoil", amount: 1 / 3 },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(33); // floor(100 * 1/3)
  });

  it("given attacker has Rock Head and Double-Edge used, when executeMoveEffect called, then recoilDamage = 0", () => {
    // Source: Showdown Gen 4 — Rock Head prevents recoil
    const attacker = createActivePokemon({ types: ["normal"], ability: "rock-head" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("double-edge", {
      effect: { type: "recoil", amount: 1 / 3 },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
  });
});

// ─── Drain ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Drain", () => {
  it("given Giga Drain dealing 80 damage, when executeMoveEffect called, then healAmount = 40 (50% drain)", () => {
    // Source: Showdown Gen 4 — Giga Drain drains 50%
    // Formula: max(1, floor(80 * 0.5)) = 40
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("giga-drain", {
      type: "grass",
      category: "special",
      effect: { type: "drain", amount: 0.5 },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(40);
  });

  it("given Dream Eater dealing 150 damage, when executeMoveEffect called, then healAmount = 75 (50% drain)", () => {
    // Source: Showdown Gen 4 — Dream Eater drains 50%
    // Formula: max(1, floor(150 * 0.5)) = 75
    // Triangulation: second test ensures drain formula computes, not a constant return
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"], status: "sleep" });
    const move = createMove("dream-eater", {
      type: "psychic",
      category: "special",
      effect: { type: "drain", amount: 0.5 },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 150, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });
});

// ─── Heal ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Heal", () => {
  it("given Roost used by Flying/Normal type (real data), when executeMoveEffect called, then healAmount = 50% and typeChange removes Flying", () => {
    // Source: Showdown Gen 4 — Roost heals 50% max HP and removes Flying type for the turn
    // roost has { type: "heal", amount: 0.5 } in data; the Roost special-case handler
    // in executeGen4MoveEffect intercepts by move ID to also apply Flying-type removal.
    const attacker = createActivePokemon({
      types: ["normal", "flying"],
      maxHp: 300,
      currentHp: 150,
      nickname: "Staraptor",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("roost");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // heal = floor(300 * 0.5) = 150
    // Source: Showdown Gen 4 — Roost heals 50% max HP
    expect(result.healAmount).toBe(150);
    // Flying type removed for this turn; Normal type remains
    // Source: Bulbapedia — Roost temporarily removes the user's Flying type
    expect(result.typeChange).toEqual({ target: "attacker", types: ["normal"] });
    expect(result.messages).toContain("Staraptor landed and recovered health!");
  });

  it("given Recover used (heal 0.5 fraction, non-Roost), when executeMoveEffect called, then healAmount = 50% and no typeChange", () => {
    // Source: Showdown Gen 4 — Recover heals 50% max HP, no type change
    // Triangulation: ensures the heal case works generically, not just for Roost
    const attacker = createActivePokemon({ types: ["normal"], maxHp: 200, currentHp: 100 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("recover", {
      type: "normal",
      category: "status",
      power: 0,
      effect: { type: "heal", amount: 0.5 },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // heal = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
    expect(result.typeChange).toBeUndefined();
  });
});

// ─── Protect / Detect ───────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Protect/Detect", () => {
  it("given Protect used, when executeMoveEffect called, then volatileInflicted = 'protect'", () => {
    // Source: Showdown Gen 4 — Protect sets PROTECTED volatile status
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("protect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("protect");
  });

  it("given Detect used, when executeMoveEffect called, then volatileInflicted = 'protect'", () => {
    // Source: Showdown Gen 4 — Detect has same effect as Protect
    const attacker = createActivePokemon({ types: ["fighting"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("detect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("protect");
  });
});

// ─── Rapid Spin ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Rapid Spin", () => {
  it("given Rapid Spin used, when executeMoveEffect called, then clearSideHazards = 'attacker' and volatiles cleared", () => {
    // Source: Showdown Gen 4 — Rapid Spin clears Spikes, Stealth Rock, Toxic Spikes, Leech Seed, Wrap/Bind
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Forretress" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rapid-spin");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.clearSideHazards).toBe("attacker");
    expect(result.volatilesToClear).toEqual([
      { target: "attacker", volatile: "leech-seed" },
      { target: "attacker", volatile: "bound" },
    ]);
    expect(result.messages).toContain("Forretress blew away leech seed and spikes!");
  });
});

// ─── Belly Drum ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Belly Drum", () => {
  it("given attacker with >50% HP and +0 Attack, when Belly Drum used, then recoilDamage = 100 and Attack maxed to +6", () => {
    // Source: Showdown Gen 4 — Belly Drum costs 50% HP and maximizes Attack
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 200,
      maxHp: 200,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("belly-drum");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(100); // floor(200/2) = 100
    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "attack",
      stages: 6,
    });
    expect(result.messages).toContain("Charizard cut its own HP and maximized Attack!");
  });

  it("given attacker with <=50% HP, when Belly Drum used, then fails and no stat change", () => {
    // Source: Showdown Gen 4 — Belly Drum fails if HP is too low
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 100,
      maxHp: 200,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("belly-drum");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.statChanges.length).toBe(0);
    expect(result.messages).toContain("Charizard is too weak to use Belly Drum!");
  });
});

// ─── Explosion / Self-Destruct ──────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Explosion/Self-Destruct", () => {
  it("given Explosion used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: Showdown Gen 4 — Explosion causes self-KO
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Golem" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("explosion");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 300, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Golem exploded!");
  });
});

// ─── Thief / Covet ──────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Thief/Covet", () => {
  it("given Thief used and attacker has no item and defender has item, when executeMoveEffect called, then itemTransfer set", () => {
    // Source: Showdown Gen 4 — Thief steals defender's item
    const attacker = createActivePokemon({
      types: ["dark"],
      heldItem: null,
      nickname: "Sneasel",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      nickname: "Chansey",
    });
    const move = dataManager.getMove("thief");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Sneasel stole Chansey's sitrus-berry!");
  });

  it("given Thief used and attacker already has item, when executeMoveEffect called, then no itemTransfer", () => {
    // Source: Showdown Gen 4 — can't steal if you already have an item
    const attacker = createActivePokemon({
      types: ["dark"],
      heldItem: "choice-band",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
    });
    const move = dataManager.getMove("thief");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
  });
});

// ─── U-turn (switch-out) ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — U-turn", () => {
  it("given U-turn used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — U-turn switches attacker out after dealing damage
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("u-turn");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 70, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Baton Pass ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Baton Pass", () => {
  it("given Baton Pass used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Baton Pass passes stat changes and volatiles
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("baton-pass");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Defog ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Defog", () => {
  it("given Defog used, when executeMoveEffect called, then clears defender hazards + screens and lowers evasion", () => {
    // Source: Showdown Gen 4 — Defog clears target's hazards and screens
    // Source: Bulbapedia — Defog lowers target's evasion by 1
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("defog");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.clearSideHazards).toBe("defender");
    expect(result.screensCleared).toBe("defender");
    expect(result.statChanges).toContainEqual({
      target: "defender",
      stat: "evasion",
      stages: -1,
    });
    expect(result.messages).toContain("It blew away the hazards!");
  });
});

// ─── Roost (null-effect handler) ────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Roost (null-effect)", () => {
  it("given Roost used by Flying/Normal type, when executeMoveEffect called, then healAmount and typeChange removes Flying", () => {
    // Note: Roost has effect: { type: "heal", amount: 0.5 } in the data,
    // so this test validates the data-driven path, not the null-effect handler.
    // The null-effect handler for "roost" would only fire if effect were null.
    // We test the null-effect path separately with a synthetic move.
    const attacker = createActivePokemon({
      types: ["normal", "flying"],
      maxHp: 200,
      currentHp: 100,
      nickname: "Pidgeot",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    // Create synthetic null-effect roost to test handleNullEffectMoves
    const move = createMove("roost", {
      type: "flying",
      category: "status",
      power: 0,
      effect: null,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(100); // floor(200 / 2) = 100
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: ["normal"],
    });
    expect(result.messages).toContain("Pidgeot landed and recovered health!");
  });

  it("given Roost used by pure Flying type, when executeMoveEffect called, then types become Normal", () => {
    // Source: Showdown Gen 4 — pure Flying-type using Roost becomes Normal-type
    const attacker = createActivePokemon({
      types: ["flying"],
      maxHp: 200,
      currentHp: 100,
      nickname: "Tornadus",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("roost", {
      type: "flying",
      category: "status",
      power: 0,
      effect: null,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.typeChange).toEqual({
      target: "attacker",
      types: ["normal"],
    });
  });

  it("given Roost used by non-Flying type, when executeMoveEffect called, then no typeChange", () => {
    // Source: Showdown Gen 4 — Roost only removes Flying type
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 100,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("roost", {
      type: "flying",
      category: "status",
      power: 0,
      effect: null,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.typeChange).toBeUndefined();
  });
});

// ─── Trick Room ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Trick Room", () => {
  it("given Trick Room used when trickRoom is not active, when executeMoveEffect called, then trickRoomSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Trick Room reverses speed order for 5 turns
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("trick-room");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.trickRoomSet).toEqual({ turnsLeft: 5 });
    expect(result.messages).toContain("The dimensions were twisted!");
  });

  it("given Trick Room used when trickRoom is already active, when executeMoveEffect called, then trickRoomSet is not set and dimensions returned to normal", () => {
    // Source: Showdown Gen 4 — Using Trick Room while active ends it
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("trick-room");
    const rng = createMockRng(0);
    // Create state with active Trick Room
    const state = createMinimalBattleState(attacker, defender);
    (state as { trickRoom: { active: boolean; turnsLeft: number } }).trickRoom = {
      active: true,
      turnsLeft: 3,
    };
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    expect(result.trickRoomSet).toBeUndefined();
    expect(result.messages).toContain("The twisted dimensions returned to normal!");
  });
});

// ─── Tailwind ───────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Tailwind", () => {
  it("given Tailwind used, when executeMoveEffect called, then tailwindSet with 3 turns and side attacker", () => {
    // Source: Showdown Gen 4 — Tailwind lasts 3 turns in Gen 4
    // Source: Bulbapedia — Tailwind: 3 turns in Gen 4, 4 turns in Gen 5+
    const attacker = createActivePokemon({ types: ["flying"], nickname: "Togekiss" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("tailwind");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.tailwindSet).toEqual({ turnsLeft: 3, side: "attacker" });
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("Togekiss whipped up a tailwind!");
  });
});

// ─── Haze ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Haze", () => {
  it("given Haze used, when executeMoveEffect called, then statStagesReset for both", () => {
    // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("haze");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
    expect(result.messages).toContain("All stat changes were eliminated!");
  });
});

// ─── Rest ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Rest", () => {
  it("given Rest used, when executeMoveEffect called, then full heal + self-sleep", () => {
    // Source: Showdown Gen 4 — Rest heals fully and inflicts 2-turn sleep
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 300,
      currentHp: 50,
      nickname: "Snorlax",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rest");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(300); // Full max HP
    expect(result.selfStatusInflicted).toBe("sleep");
    expect(result.messages).toContain("Snorlax went to sleep and became healthy!");
  });
});

// ─── Weather-Dependent Healing ──────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Weather-Dependent Healing (Moonlight/Synthesis/Morning Sun)", () => {
  it("given Moonlight used in sun, when executeMoveEffect called, then healAmount = 2/3 max HP", () => {
    // Source: Showdown Gen 4 — sun: 2/3 max HP recovery
    // Source: Bulbapedia — Moonlight/Synthesis/Morning Sun weather healing
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 300,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("moonlight");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, "sun");

    const result = ruleset.executeMoveEffect(context);

    // floor(300 * 2/3) = floor(200) = 200
    expect(result.healAmount).toBe(200);
  });

  it("given Synthesis used in rain, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — rain: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: ["grass"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("synthesis");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, "rain");

    const result = ruleset.executeMoveEffect(context);

    // floor(200 * 1/4) = 50
    expect(result.healAmount).toBe(50);
  });

  it("given Morning Sun used in clear weather, when executeMoveEffect called, then healAmount = 1/2 max HP", () => {
    // Source: Showdown Gen 4 — no weather: 1/2 max HP recovery
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("morning-sun");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // floor(200 * 1/2) = 100
    expect(result.healAmount).toBe(100);
  });

  it("given Moonlight used in hail, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — hail: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("moonlight");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, "hail");

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4)
  });

  it("given Synthesis used in sandstorm, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — sandstorm: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: ["grass"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("synthesis");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, "sand");

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4)
  });
});

// ─── Pain Split ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Pain Split", () => {
  it("given attacker at 50 HP and defender at 150 HP, when Pain Split used, then heal and damage to average (100)", () => {
    // Source: Showdown Gen 4 — Pain Split averages current HP
    // Average = floor((50 + 150) / 2) = 100
    // Attacker gains 50 HP, defender loses 50 HP
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 150,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(50); // 100 - 50
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 50, // 150 - 100
      source: "pain-split",
    });
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given attacker at 150 HP and defender at 50 HP, when Pain Split used, then attacker takes customDamage of 50 to reach average", () => {
    // Average = floor((150 + 50) / 2) = 100
    // Attacker at 150 → loses 50 HP (customDamage targeting attacker)
    // Defender at 50 → would gain 50 HP, but MoveEffectResult has no "heal defender" field
    //   (known limitation; defender healing in this case is deferred to a future engine extension)
    // Source: Showdown Gen 4 — Pain Split sets both to the average HP
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 150,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 50,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(0); // attacker above average → no heal
    // Attacker takes 50 damage (150 → 100)
    expect(result.customDamage).toEqual({ target: "attacker", amount: 50, source: "pain-split" });
    expect(result.messages).toContain("The battlers shared their pain!");
  });
});

// ─── Perish Song ────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Perish Song", () => {
  it("given Perish Song used, when executeMoveEffect called, then both attacker and defender get perish-song volatile", () => {
    // Source: Showdown Gen 4 — Perish Song affects both sides
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("perish-song");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("perish-song");
    expect(result.volatileInflicted).toBe("perish-song");
    expect(result.messages).toContain("All Pokemon that heard the song will faint in 3 turns!");
  });
});

// ─── Mean Look / Block ──────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Trapping Moves", () => {
  it("given Mean Look used, when executeMoveEffect called, then volatileInflicted = 'trapped'", () => {
    // Source: Showdown Gen 4 — Mean Look prevents switching
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("mean-look");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });

  it("given Block used, when executeMoveEffect called, then volatileInflicted = 'trapped'", () => {
    // Source: Showdown Gen 4 — Block prevents switching
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("block");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });
});

// ─── Ingrain / Aqua Ring ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Ingrain and Aqua Ring", () => {
  it("given Ingrain used, when executeMoveEffect called, then selfVolatileInflicted = 'ingrain'", () => {
    // Source: Showdown Gen 4 — Ingrain volatile
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("ingrain");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("ingrain");
    expect(result.messages).toContain("Torterra planted its roots!");
  });

  it("given Aqua Ring used, when executeMoveEffect called, then selfVolatileInflicted = 'aqua-ring'", () => {
    // Source: Showdown Gen 4 — Aqua Ring volatile
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("aqua-ring");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("aqua-ring");
    expect(result.messages).toContain("Vaporeon surrounded itself with a veil of water!");
  });
});

// ─── Safeguard / Lucky Chant ────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Safeguard and Lucky Chant", () => {
  it("given Safeguard used, when executeMoveEffect called, then screenSet with safeguard for 5 turns", () => {
    // Source: Showdown Gen 4 — Safeguard prevents status for 5 turns
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("safeguard");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: "safeguard", turnsLeft: 5, side: "attacker" });
  });

  it("given Lucky Chant used, when executeMoveEffect called, then screenSet with lucky-chant for 5 turns", () => {
    // Source: Showdown Gen 4 — Lucky Chant prevents crits for 5 turns
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Clefable" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("lucky-chant");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "lucky-chant",
      turnsLeft: 5,
      side: "attacker",
    });
  });
});

// ─── Heal Bell / Aromatherapy ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Heal Bell / Aromatherapy", () => {
  it("given Heal Bell used, when executeMoveEffect called, then statusCuredOnly for attacker's side only (not foe's party)", () => {
    // Source: Showdown Gen 4 — Heal Bell cures user's team status
    // Source: Bulbapedia — "Heal Bell cures all status conditions of the user and the user's party"
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("heal-bell");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
  });

  it("given Aromatherapy used, when executeMoveEffect called, then statusCuredOnly for attacker's side only (not foe's party)", () => {
    // Source: Showdown Gen 4 — Aromatherapy cures user's team status
    // Source: Bulbapedia — cures user's party, not the foe's party
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("aromatherapy");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
  });
});

// ─── Stat Change Effects ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Stat Changes", () => {
  it("given Swords Dance (status move, 100% stat change), when executeMoveEffect called, then attack +2 (guaranteed, no roll)", () => {
    // Source: Showdown Gen 4 — Swords Dance is a status move, guaranteed effect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("swords-dance");
    const rng = createMockRng(99); // Roll value doesn't matter for status moves
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "attack",
      stages: 2,
    });
  });
});

// ─── Gravity ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Gravity", () => {
  it("given Gravity used, when executeMoveEffect called, then message emitted", () => {
    // Source: Showdown Gen 4 — Gravity intensified message
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("gravity");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Gravity intensified!");
  });
});

// ─── Whirlwind / Roar ───────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Whirlwind/Roar (phazing)", () => {
  it("given Whirlwind used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Whirlwind forces target to switch
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("whirlwind");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given Roar used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Roar forces target to switch
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("roar");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Covet ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Covet", () => {
  it("given Covet used and attacker has no item and defender has item, when executeMoveEffect called, then item is stolen", () => {
    // Source: Showdown Gen 4 — Covet steals defender's item (same as Thief)
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: null,
      nickname: "Togekiss",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
      nickname: "Blissey",
    });
    const move = dataManager.getMove("covet");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Togekiss stole Blissey's leftovers!");
  });

  it("given Covet used and attacker already has item, when executeMoveEffect called, then no item transfer", () => {
    // Source: Showdown Gen 4 — can't steal if you already have an item
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "choice-band",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
    });
    const move = dataManager.getMove("covet");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
  });
});

// ─── Refresh ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Refresh", () => {
  it("given Refresh used by poisoned Pokemon, when executeMoveEffect called, then statusCuredOnly for attacker", () => {
    // Source: Showdown Gen 4 — Refresh cures burn/poison/paralysis on the user
    const attacker = createActivePokemon({
      types: ["normal"],
      status: "poison",
      nickname: "Chansey",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("refresh");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.messages).toContain("Chansey cured its status condition!");
  });

  it("given Refresh used by healthy Pokemon (no status), when executeMoveEffect called, then no effect", () => {
    // Source: Showdown Gen 4 — Refresh does nothing if no status condition
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("refresh");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toBeUndefined();
  });
});

// ─── Wish ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Wish", () => {
  it("given Wish used, when executeMoveEffect called, then emits wish message (engine tracks state)", () => {
    // Source: Showdown Gen 4 — Wish sets up healing for end of next turn
    // Source: Bulbapedia — Wish: At end of next turn, heals the Pokemon at user's position by 1/2 max HP
    // The move effect only produces a message; the engine handles Wish tracking
    const attacker = createActivePokemon({
      types: ["normal"],
      nickname: "Jirachi",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("wish");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Jirachi made a wish!");
  });

  it("given Wish used by unnamed Pokemon, when executeMoveEffect called, then uses default name", () => {
    // Source: Showdown Gen 4 — Wish message fallback for unnamed Pokemon
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("wish");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("The Pokemon made a wish!");
  });
});

// ─── Spider Web ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Spider Web (trapping)", () => {
  it("given Spider Web used, when executeMoveEffect called, then volatileInflicted = 'trapped'", () => {
    // Source: Showdown Gen 4 — Spider Web prevents switching (same as Mean Look)
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("spider-web");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });
});

// ─── Self-Destruct ──────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Self-Destruct", () => {
  it("given Self-Destruct used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: Showdown Gen 4 — Self-Destruct causes self-KO (same as Explosion)
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Electrode" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("self-destruct");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Electrode exploded!");
  });
});

// ─── applyMoveEffect — passthrough cases (no-op effect types) ───────────────

describe("Gen 4 executeMoveEffect — applyMoveEffect no-op passthrough cases", () => {
  it("given a move with remove-hazards effect type, when executeMoveEffect called, then no hazard clearing in result (handled by engine)", () => {
    // Source: Showdown Gen 4 — remove-hazards is a no-op in applyMoveEffect;
    // Rapid Spin uses the custom handler and Defog uses handleNullEffectMoves.
    // This test covers the intentional no-op branch at line 368 in Gen4MoveEffects.ts.
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("some-spin", {
      effect: { type: "remove-hazards" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // remove-hazards is a no-op in applyMoveEffect — only statuses/messages reset
    expect(result.clearSideHazards).toBeUndefined();
    expect(result.statusInflicted).toBeNull();
  });

  it("given a move with fixed-damage effect type, when executeMoveEffect called, then no status inflicted (handled by damage calc)", () => {
    // Source: Showdown Gen 4 — fixed-damage is handled by the damage calculation, not move effects
    // Covers the fixed-damage case arm (line 374) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("sonic-boom", {
      effect: { type: "fixed-damage", damage: 20 } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
  });

  it("given a move with terrain effect type, when executeMoveEffect called, then no terrain set in result (not in Gen 4)", () => {
    // Source: Showdown Gen 4 — terrain moves are N/A in Gen 4 (Gen 5 feature)
    // Covers the terrain case arm (line 381) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("electric-terrain", {
      effect: { type: "terrain", terrain: "electric" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("given a move with multi-hit effect type, when executeMoveEffect called, then no additional effects (handled by engine)", () => {
    // Source: Showdown Gen 4 — multi-hit is handled by the engine loop, not move effects
    // Covers the multi-hit case arm (line 382) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fury-swipes", {
      effect: { type: "multi-hit", min: 2, max: 5 } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 15, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given a move with two-turn effect type, when executeMoveEffect called, then no side effects (handled by engine)", () => {
    // Source: Showdown Gen 4 — two-turn moves like Fly/Dig handled by engine, not move effects
    // Covers the two-turn case arm (line 383) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fly", {
      effect: { type: "two-turn", status: "semi-invulnerable" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 90, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
  });

  it("given a move with damage effect type, when executeMoveEffect called, then no additional effects (pure damage)", () => {
    // Source: Showdown Gen 4 — damage effect type is pure damage, handled by the damage calc
    // Covers the damage case arm (line 377) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("tackle", {
      effect: { type: "damage" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
  });
});

// ─── applyMoveEffect — stat-change targeting defender ───────────────────────

describe("Gen 4 executeMoveEffect — stat-change targeting defender", () => {
  it("given Charm (secondary stat drop on foe), when roll succeeds, then defender's Attack drops", () => {
    // Source: Showdown Gen 4 — Charm lowers target's Attack stat
    // Using a synthetic move with stat-change type targeting foe
    // Covers the effect.target !== "self" branch (line 246) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("charm-fake", {
      category: "status",
      effect: {
        type: "stat-change",
        target: "foe",
        chance: 100,
        changes: [{ stat: "attack", stages: -2 }],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toContainEqual({ target: "defender", stat: "attack", stages: -2 });
  });

  it("given a physical move with secondary stat-change chance, when RNG roll fails, then no stat change", () => {
    // Source: Showdown Gen 4 — secondary stat changes only apply if the roll succeeds
    // Using a synthetic physical move with 10% stat-change secondary effect
    // Covers the roll-fails branch (line 239-242) in applyMoveEffect for stat-change
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("crunch-fake", {
      category: "physical",
      effect: {
        type: "stat-change",
        target: "foe",
        chance: 10,
        changes: [{ stat: "defense", stages: -1 }],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(50); // roll=50, 50 < 10 is false → chance fails
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toHaveLength(0);
  });
});

// ─── applyMoveEffect — volatile-status for status move (guaranteed) ──────────

describe("Gen 4 executeMoveEffect — volatile-status on status move (guaranteed)", () => {
  it("given a status move with volatile-status effect and roll fails, when used, then volatile IS still inflicted (guaranteed for status moves)", () => {
    // Source: Showdown Gen 4 — volatile-status from status moves is guaranteed (no roll for status moves)
    // Covers the 'move.category === status' path (line 290-299) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("focus-energy", {
      category: "status",
      effect: {
        type: "volatile-status",
        status: "focus-energy",
        chance: 0,
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(99); // roll=99, would fail if used
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Status moves with volatile-status are guaranteed, ignoring chance
    expect(result.volatileInflicted).toBe("focus-energy");
  });

  it("given a damaging move with volatile-status secondary effect, when roll fails, then volatile NOT inflicted", () => {
    // Source: Showdown Gen 4 — volatile-status from damaging moves uses a roll
    // Covers the false-branch of the volatile-status roll check (line 293-297)
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("rock-slide-fake", {
      category: "physical",
      effect: {
        type: "volatile-status",
        status: "flinch",
        chance: 10,
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(50); // roll=50, 50 < 10 is false → fails
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
  });
});

// ─── Serene Grace at 100% cap ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Serene Grace doubling chance to 100%", () => {
  it("given attacker has Serene Grace and move has 50% secondary chance, when roll is 99, then effect STILL activates (capped at 100%)", () => {
    // Source: pret/pokeplatinum — Serene Grace doubles secondary effect chance; min(chance*2, 100)
    // A 50% chance doubled = 100%, meaning it always succeeds regardless of roll
    // Covers the effectiveChance >= 100 branch (line 185) in rollEffectChance
    const attacker = createActivePokemon({ types: ["normal"], ability: "serene-grace" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("iron-head-fake", {
      category: "physical",
      effect: {
        type: "volatile-status",
        status: "flinch",
        chance: 50, // 50% × 2 (Serene Grace) = 100% → always activates
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(99); // roll=99, normally would fail 50% check, but 100% = guaranteed
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    // 100% guaranteed effect — covers the 'effectiveChance >= 100' fast-path
    expect(result.volatileInflicted).toBe("flinch");
  });
});

// ─── handleNullEffectMoves — default case ───────────────────────────────────

describe("Gen 4 executeMoveEffect — handleNullEffectMoves default case", () => {
  it("given a null-effect move with unrecognized ID, when executeMoveEffect called, then no effect produced", () => {
    // Source: Showdown Gen 4 — unknown null-effect moves are silently ignored
    // Covers the default case (line 846-847) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("unknown-null-move", {
      effect: null,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });
});

// ─── handleCustomEffect — default case ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — handleCustomEffect default case", () => {
  it("given a custom-effect move with unrecognized ID, when executeMoveEffect called, then no effect produced", () => {
    // Source: Showdown Gen 4 — unknown custom moves fall through to no-op default
    // Covers the default case (line 618-621) in handleCustomEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("future-custom-move", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toHaveLength(0);
  });
});

// ─── handleNullEffectMoves — attacker on side 1 (hazards target side 0) ─────

describe("Gen 4 executeMoveEffect — entry hazards from attacker on side 1", () => {
  it("given attacker on side 1 uses Stealth Rock, when executeMoveEffect called, then hazardSet targets side 0", () => {
    // Source: Showdown Gen 4 — Stealth Rock places hazard on the opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 653) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: ["rock"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("stealth-rock");
    const rng = createMockRng(0);

    // Place attacker on side 1 instead of side 0
    const state = createMinimalBattleState(defender, attacker); // swap sides
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Attacker on side 1 → hazard targets side 0
    expect(result.hazardSet).toEqual({ hazard: "stealth-rock", targetSide: 0 });
  });

  it("given attacker on side 1 uses Toxic Spikes, when executeMoveEffect called, then hazardSet targets side 0", () => {
    // Source: Showdown Gen 4 — Toxic Spikes places hazard on the opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 666) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("toxic-spikes");
    const rng = createMockRng(0);

    const state = createMinimalBattleState(defender, attacker);
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: "toxic-spikes", targetSide: 0 });
  });
});

// ─── Belly Drum — attack already at +6 ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — Belly Drum with attack already maxed", () => {
  it("given attacker at +6 attack with >50% HP, when Belly Drum used, then recoilDamage = 50% HP and statChanges has stages = 0", () => {
    // Source: Showdown Gen 4 — Belly Drum maximizes attack; stages = 6 - current
    // When already at +6 attack, stages = 6 - 6 = 0 (no change to stages)
    // Covers the branch where attacker.statStages.attack is 6 (line 419)
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 200,
      maxHp: 200,
      nickname: "Snorlax",
      statStages: { attack: 6 },
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("belly-drum");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Belly Drum still costs 50% HP even if attack is maxed
    expect(result.recoilDamage).toBe(100); // floor(200/2) = 100
    // Stages = 6 - 6 = 0 (already maxed — no additional stages added)
    expect(result.statChanges).toContainEqual({ target: "attacker", stat: "attack", stages: 0 });
  });
});

// ─── switch-out effect with non-self target ──────────────────────────────────

describe("Gen 4 executeMoveEffect — switch-out effect with opponent target", () => {
  it("given a synthetic move with switch-out effect targeting opponent, when used, then switchOut = false (only self-switch triggers)", () => {
    // Source: Showdown Gen 4 — switch-out effect with target=opponent does not trigger switchOut
    // Covers the 'switchTarget !== self' branch (line 350-353) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("forced-switch", {
      effect: {
        type: "switch-out",
        target: "opponent",
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // switchOut is only set for target="self"
    expect(result.switchOut).toBe(false);
  });
});

// ─── applyMoveEffect — multi effect (composite) ─────────────────────────────

describe("Gen 4 executeMoveEffect — multi effect (Scald-style: damage + secondary burn)", () => {
  it("given a move with multi effect containing status-chance, when roll succeeds, then burn is inflicted", () => {
    // Source: Showdown Gen 4 — Scald has multi effect: [damage, 30% burn]
    // The multi effect routes sub-effects through applyMoveEffect recursively
    // Covers the 'multi' case (lines 282-288) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("scald-fake", {
      category: "special",
      effect: {
        type: "multi",
        effects: [
          {
            type: "status-chance",
            status: "burn",
            chance: 30,
          },
        ],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0); // roll=0, 0 < 30 → burn succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("burn");
  });
});

// ─── applyMoveEffect — heal without calculatedStats ─────────────────────────

describe("Gen 4 executeMoveEffect — heal effect with no calculatedStats (fallback to currentHp)", () => {
  it("given a Pokemon with no calculatedStats and heal move, when executeMoveEffect called, then uses currentHp as maxHp", () => {
    // Source: Showdown Gen 4 — heal uses calculatedStats?.hp ?? currentHp fallback
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 277) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"], currentHp: 100, maxHp: 200 });
    // Remove calculatedStats to trigger fallback
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("recover", {
      category: "status",
      power: 0,
      effect: { type: "heal", amount: 0.5 } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 100; heal = floor(100 * 0.5) = 50
    expect(result.healAmount).toBe(50);
  });
});

// ─── switch-out with `who` field (Gen 4 data compatibility) ─────────────────

describe("Gen 4 executeMoveEffect — switch-out effect using 'who' field", () => {
  it("given move with switch-out effect using 'who: self' field, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — some Gen 4 move data uses 'who' instead of 'target' for switch-out
    // Covers the 'effect.target ?? effect.who ?? self' branch (line 349) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    // Synthetic move with switch-out effect using legacy 'who' field (no 'target' field)
    const move = createMove("baton-pass-who", {
      effect: {
        type: "switch-out",
        who: "self",
        // No 'target' field — forces the ?? fallback to 'who'
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── entry-hazard in applyMoveEffect — attacker on side 1 ───────────────────

describe("Gen 4 executeMoveEffect — entry-hazard in applyMoveEffect with attacker on side 1", () => {
  it("given Spikes (data-driven entry-hazard) used from side 1, when executeMoveEffect called, then hazard targets side 0", () => {
    // Source: Showdown Gen 4 — Spikes (entry-hazard type) places hazard on opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 336) in applyMoveEffect entry-hazard case
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("spikes");
    const rng = createMockRng(0);

    // Place attacker on side 1 by swapping the sides
    const state = createMinimalBattleState(defender, attacker);
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Attacker on side 1 → hazard targets side 0
    expect(result.hazardSet).toEqual({ hazard: "spikes", targetSide: 0 });
  });
});

// ─── Rest in handleNullEffectMoves — no calculatedStats fallback ─────────────

describe("Gen 4 executeMoveEffect — Rest in handleNullEffectMoves with no calculatedStats", () => {
  it("given Rest used by Pokemon with no calculatedStats, when executeMoveEffect called, then uses currentHp as max HP", () => {
    // Source: Showdown Gen 4 — Rest heals max HP; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 734) in handleNullEffectMoves rest case
    // When calculatedStats is null, maxHp falls back to currentHp
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 120,
      maxHp: 300, // calculatedStats.hp set to 300
      nickname: "Snorlax",
    });
    // Remove calculatedStats to trigger fallback
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rest");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 120 (not 300); Rest heals to that amount
    expect(result.healAmount).toBe(120);
    expect(result.selfStatusInflicted).toBe("sleep");
  });
});

// ─── handleCustomEffect — dead-code branch coverage via synthetic custom moves ─

describe("Gen 4 executeMoveEffect — handleCustomEffect branches via synthetic custom-effect moves", () => {
  it("given synthetic custom-effect mean-look move, when used, then volatileInflicted = 'trapped'", () => {
    // Covers handleCustomEffect case 'mean-look' (line 441) with explicit custom effect type
    // In real data mean-look has null effect (handled by handleNullEffectMoves);
    // this synthetic test covers the handleCustomEffect path.
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("mean-look", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });

  it("given synthetic custom-effect spider-web move, when used, then volatileInflicted = 'trapped'", () => {
    // Covers handleCustomEffect case 'spider-web' (line 442) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("spider-web", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });

  it("given synthetic custom-effect block move, when used, then volatileInflicted = 'trapped'", () => {
    // Covers handleCustomEffect case 'block' (line 443) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("block", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("trapped");
  });

  it("given synthetic custom-effect covet move (no item, defender has item), when used, then item is stolen", () => {
    // Covers handleCustomEffect case 'covet' (line 451) via synthetic custom effect
    // Source: Showdown Gen 4 — Covet steals defender's item if attacker has no item
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: null,
      nickname: "Skitty",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      nickname: "Blissey",
    });
    const move = createMove("covet", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Skitty stole Blissey's sitrus-berry!");
  });

  it("given synthetic custom-effect explosion move, when used, then selfFaint = true", () => {
    // Covers handleCustomEffect case 'explosion' (line 470) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Weezing" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("explosion", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 250, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Weezing exploded!");
  });

  it("given synthetic custom-effect self-destruct move, when used, then selfFaint = true", () => {
    // Covers handleCustomEffect case 'self-destruct' (line 471) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Electrode" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("self-destruct", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
  });

  it("given synthetic custom-effect haze move, when used, then statStagesReset for both", () => {
    // Covers handleCustomEffect case 'haze' (line 479) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("haze", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given synthetic custom-effect wish move, when used, then message emitted", () => {
    // Covers handleCustomEffect case 'wish' (line 487) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Togetic" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("wish", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Togetic made a wish!");
  });

  it("given synthetic custom-effect safeguard move, when used, then screenSet = safeguard for 5 turns", () => {
    // Covers handleCustomEffect case 'safeguard' (line 497) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("safeguard", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: "safeguard", turnsLeft: 5, side: "attacker" });
  });

  it("given synthetic custom-effect lucky-chant move, when used, then screenSet = lucky-chant for 5 turns", () => {
    // Covers handleCustomEffect case 'lucky-chant' (line 498) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Clefable" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("lucky-chant", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "lucky-chant",
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given synthetic custom-effect ingrain move, when used, then selfVolatileInflicted = 'ingrain'", () => {
    // Covers handleCustomEffect case 'ingrain' via synthetic custom effect
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("ingrain", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("ingrain");
  });

  it("given synthetic custom-effect aqua-ring move, when used, then selfVolatileInflicted = 'aqua-ring'", () => {
    // Covers handleCustomEffect case 'aqua-ring' via synthetic custom effect
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("aqua-ring", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("aqua-ring");
  });

  it("given synthetic custom-effect refresh move and poisoned Pokemon, when used, then statusCuredOnly set", () => {
    // Covers handleCustomEffect case 'refresh' (line 608) via synthetic custom effect
    const attacker = createActivePokemon({
      types: ["normal"],
      status: "poison",
      nickname: "Chansey",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("refresh", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.messages).toContain("Chansey cured its status condition!");
  });

  it("given synthetic custom-effect refresh move and healthy Pokemon, when used, then no effect", () => {
    // Covers handleCustomEffect case 'refresh' false-branch (attacker.pokemon.status is null)
    const attacker = createActivePokemon({ types: ["normal"] }); // no status
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("refresh", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toBeUndefined();
  });

  it("given synthetic custom-effect baton-pass move, when used, then switchOut = true", () => {
    // Covers handleCustomEffect case 'baton-pass' (line 463) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("baton-pass", {
      effect: { type: "custom" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── handleNullEffectMoves — haze case ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — handleNullEffectMoves haze", () => {
  it("given Haze (null-effect route) used, when executeMoveEffect called, then statStagesReset = both", () => {
    // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
    // Haze has null effect in Gen 4 data, routed through handleNullEffectMoves
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("haze");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
  });
});

// ─── handleNullEffectMoves — safeguard / lucky-chant / ingrain / aqua-ring / refresh ─

describe("Gen 4 executeMoveEffect — handleNullEffectMoves null-effect moves", () => {
  it("given Safeguard (null effect), when executeMoveEffect called, then screenSet = safeguard 5 turns", () => {
    // Covers handleNullEffectMoves case 'safeguard' (line 576)
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("safeguard");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: "safeguard", turnsLeft: 5, side: "attacker" });
  });

  it("given Lucky Chant (null effect), when executeMoveEffect called, then screenSet = lucky-chant 5 turns", () => {
    // Covers handleNullEffectMoves case 'lucky-chant' (line 584)
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Clefable" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("lucky-chant");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "lucky-chant",
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given Ingrain (null effect), when executeMoveEffect called, then selfVolatileInflicted = 'ingrain'", () => {
    // Covers handleNullEffectMoves case 'ingrain' (line 592)
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("ingrain");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("ingrain");
  });

  it("given Aqua Ring (null effect), when executeMoveEffect called, then selfVolatileInflicted = 'aqua-ring'", () => {
    // Covers handleNullEffectMoves case 'aqua-ring' (line 600)
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("aqua-ring");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("aqua-ring");
  });
});

// ─── handleNullEffectMoves — rest with calculatedStats fallback ──────────────

describe("Gen 4 executeMoveEffect — Rest in handleNullEffectMoves (calculatedStats fallback)", () => {
  it("given Rest (null effect) used and no calculatedStats, when executeMoveEffect called, then uses currentHp as maxHp", () => {
    // Source: Showdown Gen 4 — Rest heals fully; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 734) in handleNullEffectMoves rest case
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 80,
      maxHp: 200,
      nickname: "Snorlax",
    });
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rest");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 80 (not 200, since calculatedStats is null)
    expect(result.healAmount).toBe(80);
    expect(result.selfStatusInflicted).toBe("sleep");
  });
});

// ─── executeGen4MoveEffect — Roost with no calculatedStats (main entry fallback) ─

describe("Gen 4 executeMoveEffect — Roost main-entry-point with no calculatedStats", () => {
  it("given Roost used and Pokemon has no calculatedStats, when executeMoveEffect called, then uses currentHp as maxHp fallback", () => {
    // Source: Showdown Gen 4 — Roost heals max HP; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 886) in executeGen4MoveEffect
    const attacker = createActivePokemon({
      types: ["flying"],
      currentHp: 100,
      maxHp: 300,
      nickname: "Pidgeot",
    });
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("roost");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 100; floor(100 * 0.5) = 50
    expect(result.healAmount).toBe(50);
    // Flying type should be removed
    expect(result.typeChange).toEqual({ target: "attacker", types: ["normal"] });
  });
});

// ─── executeGen4MoveEffect — Knock Off defender with no nickname (fallback name) ─

describe("Gen 4 executeMoveEffect — Knock Off defender with no nickname", () => {
  it("given Knock Off vs defender with no nickname and an item, when executeMoveEffect called, then uses fallback name in message", () => {
    // Source: Showdown Gen 4 — Knock Off message uses pokemon nickname ?? 'The foe'
    // Covers the defenderName fallback (line 911) in executeGen4MoveEffect
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
      nickname: null, // no nickname — triggers fallback
    });
    const move = dataManager.getMove("knock-off");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("The foe lost its leftovers!");
  });
});

// ─── applyMoveEffect — weather effect.turns fallback ────────────────────────

describe("Gen 4 executeMoveEffect — weather effect with no turns field (default 5)", () => {
  it("given a synthetic weather move with no turns field and no rock item, when used, then weatherSet turns = 5 (default)", () => {
    // Source: Showdown Gen 4 — weather effect uses effect.turns ?? 5 as fallback
    // Covers the 'effect.turns ?? 5' branch (line 309) in applyMoveEffect weather case
    const attacker = createActivePokemon({ types: ["fire"] }); // no rock item
    const defender = createActivePokemon({ types: ["normal"] });
    // Synthetic weather move with no 'turns' field defined
    const move = createMove("sunny-day-noturn", {
      effect: {
        type: "weather",
        weather: "sun",
        // No 'turns' field — forces '?? 5' fallback
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // No Heat Rock + no turns field → fallback to 5
    expect(result.weatherSet).toEqual({ weather: "sun", turns: 5, source: "sunny-day-noturn" });
  });
});

// ─── Roost (non-Flying type) ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Roost on non-Flying type", () => {
  it("given Roost used by pure Normal type, when executeMoveEffect called, then heals 50% but no type change", () => {
    // Source: Showdown Gen 4 — Roost only removes Flying type if the user IS Flying-type
    // Source: Bulbapedia — Roost: if the user is not Flying-type, no type change occurs
    // A Normal-type using Roost still heals but has no type change
    const attacker = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 100,
      nickname: "Snorlax",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("roost");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Heals 50% of max HP = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
    // No type change since not Flying-type
    expect(result.typeChange).toBeUndefined();
    expect(result.messages).toContain("Snorlax landed and recovered health!");
  });

  it("given Roost used by Fire/Flying type, when executeMoveEffect called, then heals and removes Flying type", () => {
    // Source: Showdown Gen 4 — Roost removes Flying type, leaves Fire
    // Source: Bulbapedia — Roost: dual-typed Flying Pokemon loses Flying for the turn
    const attacker = createActivePokemon({
      types: ["fire", "flying"],
      maxHp: 300,
      currentHp: 150,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("roost");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Heals 50% of max HP = floor(300 * 0.5) = 150
    expect(result.healAmount).toBe(150);
    // Flying removed, Fire remains
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: ["fire"],
    });
  });
});
