import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";

/**
 * Gen 4 Two-Turn Move Tests
 *
 * Tests for two-turn move charge handling (Fly, Dig, Dive, Bounce, Shadow Force,
 * Solar Beam) including skip-charge exceptions (SolarBeam in sun, Power Herb)
 * and semi-invulnerable hit checks (canHitSemiInvulnerable).
 *
 * Source: Showdown Gen 4 mod — two-turn move handling
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
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
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
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
    moves: opts.moves ?? [],
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
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
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
    flags: {
      contact: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      sound: false,
      wind: false,
      powder: false,
      bullet: false,
      pulse: false,
      bite: false,
      punch: false,
      slicing: false,
    },
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
  gravityActive = false,
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
    gravity: { active: gravityActive, turnsLeft: gravityActive ? 5 : 0 },
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
  gravityActive = false,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, weatherType, gravityActive);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ─── Two-Turn Move Charge Handling ────────────────────────────────────────

describe("Gen 4 Two-Turn Moves — Charge Turn", () => {
  it("given Fly on charge turn, when executed, then sets flying volatile and forcedMove", () => {
    // Source: Showdown Gen 4 — Fly sets flying volatile on charge turn
    // Source: Bulbapedia — "Fly: The user flies up on the first turn and attacks on the second."
    const attacker = createActivePokemon({
      types: ["normal", "flying"],
      moves: [{ moveId: "fly", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fly", {
      type: "flying",
      power: 90,
      effect: { type: "two-turn" } as any,
      flags: {
        contact: true,
        protect: true,
        mirror: true,
        snatch: false,
        gravity: true,
        defrost: false,
        recharge: false,
        charge: true,
        sound: false,
        wind: false,
        powder: false,
        bullet: false,
        pulse: false,
        bite: false,
        punch: false,
        slicing: false,
      },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "fly",
      volatileStatus: "flying",
    });
    expect(result.messages).toContain("The Pokemon flew up high!");
  });

  it("given Dig on charge turn, when executed, then sets underground volatile and forcedMove", () => {
    // Source: Showdown Gen 4 — Dig sets underground volatile on charge turn
    // Source: Bulbapedia — "Dig: The user digs underground on the first turn and attacks on the second."
    const attacker = createActivePokemon({
      types: ["ground"],
      moves: [{ moveId: "dig", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("dig", {
      type: "ground",
      power: 80,
      effect: { type: "two-turn" } as any,
      flags: {
        contact: true,
        protect: true,
        mirror: true,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: true,
        sound: false,
        wind: false,
        powder: false,
        bullet: false,
        pulse: false,
        bite: false,
        punch: false,
        slicing: false,
      },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dig",
      volatileStatus: "underground",
    });
    expect(result.messages).toContain("The Pokemon dug underground!");
  });

  it("given Shadow Force on charge turn, when executed, then sets shadow-force-charging volatile", () => {
    // Source: Showdown Gen 4 — Shadow Force sets shadow-force-charging volatile
    // Source: Bulbapedia — "Shadow Force: The user vanishes on the first turn and attacks on the second."
    const attacker = createActivePokemon({
      types: ["ghost"],
      moves: [{ moveId: "shadow-force", pp: 5, maxPp: 5 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("shadow-force", {
      type: "ghost",
      power: 120,
      effect: { type: "two-turn" } as any,
      flags: {
        contact: true,
        protect: false,
        mirror: true,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: true,
        sound: false,
        wind: false,
        powder: false,
        bullet: false,
        pulse: false,
        bite: false,
        punch: false,
        slicing: false,
      },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "shadow-force",
      volatileStatus: "shadow-force-charging",
    });
    expect(result.messages).toContain("The Pokemon vanished!");
  });

  it("given Bounce on charge turn, when executed, then sets flying volatile (same as Fly)", () => {
    // Source: Showdown Gen 4 — Bounce uses the same flying volatile as Fly
    // Source: Bulbapedia — "Bounce: The user bounces up on the first turn and attacks on the second."
    const attacker = createActivePokemon({
      types: ["normal"],
      moves: [{ moveId: "bounce", pp: 5, maxPp: 5 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("bounce", {
      type: "flying",
      power: 85,
      effect: { type: "two-turn" } as any,
      flags: {
        contact: true,
        protect: true,
        mirror: true,
        snatch: false,
        gravity: true,
        defrost: false,
        recharge: false,
        charge: true,
        sound: false,
        wind: false,
        powder: false,
        bullet: false,
        pulse: false,
        bite: false,
        punch: false,
        slicing: false,
      },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "bounce",
      volatileStatus: "flying",
    });
    expect(result.messages).toContain("The Pokemon sprang up!");
  });

  it("given Dive on charge turn, when executed, then sets underwater volatile", () => {
    // Source: Showdown Gen 4 — Dive sets underwater volatile on charge turn
    const attacker = createActivePokemon({
      types: ["water"],
      moves: [{ moveId: "dive", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("dive", {
      type: "water",
      power: 80,
      effect: { type: "two-turn" } as any,
      flags: {
        contact: true,
        protect: true,
        mirror: true,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: true,
        sound: false,
        wind: false,
        powder: false,
        bullet: false,
        pulse: false,
        bite: false,
        punch: false,
        slicing: false,
      },
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dive",
      volatileStatus: "underwater",
    });
    expect(result.messages).toContain("The Pokemon dived underwater!");
  });
});

// ─── SolarBeam Sun Exception ──────────────────────────────────────────────

describe("Gen 4 Two-Turn Moves — SolarBeam Sun Exception", () => {
  it("given Solar Beam in sun weather, when executed, then attacks immediately without charge", () => {
    // Source: Showdown Gen 4 — SolarBeam fires immediately in harsh sunlight
    // Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
    const attacker = createActivePokemon({
      types: ["grass"],
      moves: [{ moveId: "solar-beam", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["water"] });
    const move = createMove("solar-beam", {
      type: "grass",
      category: "special",
      power: 120,
      effect: { type: "two-turn" } as any,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, "sun");

    const result = ruleset.executeMoveEffect(context);

    // No forcedMoveSet means the attack proceeds immediately
    expect(result.forcedMoveSet).toBeUndefined();
  });

  it("given Solar Beam without sun, when executed, then sets forcedMove on first turn", () => {
    // Source: Showdown Gen 4 — SolarBeam charges in non-sun weather
    // Source: Bulbapedia — "Solar Beam requires a turn to charge before attacking."
    const attacker = createActivePokemon({
      types: ["grass"],
      moves: [{ moveId: "solar-beam", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["water"] });
    const move = createMove("solar-beam", {
      type: "grass",
      category: "special",
      power: 120,
      effect: { type: "two-turn" } as any,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "solar-beam",
      volatileStatus: "charging",
    });
    expect(result.messages).toContain("The Pokemon is absorbing sunlight!");
  });
});

// ─── Power Herb Exception ─────────────────────────────────────────────────

describe("Gen 4 Two-Turn Moves — Power Herb", () => {
  it("given Pokemon with Power Herb, when using Fly, then skips charge and consumes item", () => {
    // Source: Showdown Gen 4 — Power Herb skips charge turn and is consumed
    // Source: Bulbapedia — "Power Herb allows the holder to skip the charge turn of a
    //   two-turn move. It is consumed after use."
    const attacker = createActivePokemon({
      types: ["normal", "flying"],
      heldItem: "power-herb",
      moves: [{ moveId: "fly", pp: 10, maxPp: 10 }],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("fly", {
      type: "flying",
      power: 90,
      effect: { type: "two-turn" } as any,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // No forcedMoveSet — attack proceeds immediately
    expect(result.forcedMoveSet).toBeUndefined();
    // Item is consumed
    expect(result.itemConsumed).toBe(true);
    expect(result.messages).toContain("The Pokemon became fully charged due to its Power Herb!");
  });
});

// ─── canHitSemiInvulnerable ───────────────────────────────────────────────

describe("Gen 4 canHitSemiInvulnerable", () => {
  it("given defender in flying state, when canHitSemiInvulnerable called with Thunder, then returns true", () => {
    // Source: Showdown Gen 4 — Thunder hits flying targets
    // Source: Bulbapedia — "Thunder has perfect accuracy and can hit a Pokemon using Fly or Bounce."
    expect(ruleset.canHitSemiInvulnerable("thunder", "flying")).toBe(true);
  });

  it("given defender in flying state, when canHitSemiInvulnerable called with Gust, then returns true", () => {
    // Source: Showdown Gen 4 — Gust hits flying targets
    // Source: Bulbapedia — "Gust can hit a Pokemon during the semi-invulnerable turn of Fly."
    expect(ruleset.canHitSemiInvulnerable("gust", "flying")).toBe(true);
  });

  it("given defender in flying state, when canHitSemiInvulnerable called with Twister, then returns true", () => {
    // Source: Showdown Gen 4 — Twister hits flying targets
    expect(ruleset.canHitSemiInvulnerable("twister", "flying")).toBe(true);
  });

  it("given defender in flying state, when canHitSemiInvulnerable called with Sky Uppercut, then returns true", () => {
    // Source: Showdown Gen 4 — Sky Uppercut hits flying targets
    // Source: Bulbapedia — "Sky Uppercut can hit a target during the semi-invulnerable turn of Fly."
    expect(ruleset.canHitSemiInvulnerable("sky-uppercut", "flying")).toBe(true);
  });

  it("given defender in flying state, when canHitSemiInvulnerable called with Flamethrower, then returns false", () => {
    // Source: Showdown Gen 4 — Flamethrower cannot hit flying targets
    expect(ruleset.canHitSemiInvulnerable("flamethrower", "flying")).toBe(false);
  });

  it("given defender in underground state, when canHitSemiInvulnerable called with Earthquake, then returns true", () => {
    // Source: Showdown Gen 4 — Earthquake hits underground targets
    // Source: Bulbapedia — "Earthquake can hit a Pokemon during the semi-invulnerable turn of Dig."
    expect(ruleset.canHitSemiInvulnerable("earthquake", "underground")).toBe(true);
  });

  it("given defender in underground state, when canHitSemiInvulnerable called with Magnitude, then returns true", () => {
    // Source: Showdown Gen 4 — Magnitude hits underground targets
    expect(ruleset.canHitSemiInvulnerable("magnitude", "underground")).toBe(true);
  });

  it("given defender in underground state, when canHitSemiInvulnerable called with Fissure, then returns true", () => {
    // Source: Showdown Gen 4 — Fissure hits underground targets
    expect(ruleset.canHitSemiInvulnerable("fissure", "underground")).toBe(true);
  });

  it("given defender in underground state, when canHitSemiInvulnerable called with Surf, then returns false", () => {
    // Source: Showdown Gen 4 — Surf cannot hit underground targets (only underwater)
    expect(ruleset.canHitSemiInvulnerable("surf", "underground")).toBe(false);
  });

  it("given defender in underwater state, when canHitSemiInvulnerable called with Surf, then returns true", () => {
    // Source: Showdown Gen 4 — Surf hits underwater targets
    // Source: Bulbapedia — "Surf can hit a Pokemon during the semi-invulnerable turn of Dive."
    expect(ruleset.canHitSemiInvulnerable("surf", "underwater")).toBe(true);
  });

  it("given defender in underwater state, when canHitSemiInvulnerable called with Whirlpool, then returns true", () => {
    // Source: Showdown Gen 4 — Whirlpool hits underwater targets
    expect(ruleset.canHitSemiInvulnerable("whirlpool", "underwater")).toBe(true);
  });

  it("given defender in shadow-force-charging state, when canHitSemiInvulnerable called with any move, then returns false", () => {
    // Source: Showdown Gen 4 — Nothing can hit a Pokemon during Shadow Force's charge
    // Source: Bulbapedia — "Shadow Force bypasses Protect and Detect."
    expect(ruleset.canHitSemiInvulnerable("thunder", "shadow-force-charging")).toBe(false);
    expect(ruleset.canHitSemiInvulnerable("earthquake", "shadow-force-charging")).toBe(false);
    expect(ruleset.canHitSemiInvulnerable("surf", "shadow-force-charging")).toBe(false);
  });

  it("given defender in charging state (generic), when canHitSemiInvulnerable called with any move, then returns true", () => {
    // Source: Showdown Gen 4 — Generic charging (SolarBeam, Skull Bash) is NOT semi-invulnerable
    // These moves do not grant evasion during the charge turn
    expect(ruleset.canHitSemiInvulnerable("flamethrower", "charging")).toBe(true);
    expect(ruleset.canHitSemiInvulnerable("tackle", "charging")).toBe(true);
  });
});
