import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";

/**
 * Gen 4 Wave 5A — Volatile/Status Move Effects Tests
 *
 * Tests for Yawn, Encore, Heal Block, Embargo, Worry Seed, and Gastro Acid.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — individual move/ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers (same pattern as move-effects.test.ts)
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
    gender: "male" as const,
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
    volatileStatuses: volatiles,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
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
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;
}

// ===========================================================================
// Yawn
// ===========================================================================

describe("Yawn", () => {
  it("given attacker uses Yawn on healthy target, when executed, then target gets yawn volatile with turnsLeft=1 and drowsy message", () => {
    // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at the end of the next turn"
    // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Snorlax" });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("yawn");
    expect(result.volatileData).toEqual({ turnsLeft: 1 });
    expect(result.messages).toContain("Snorlax grew drowsy!");
  });

  it("given target is already asleep, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target already has a primary status
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], status: "sleep" });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target has paralysis, when Yawn is used, then it fails because target already has a status", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target has any primary status
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["electric"], status: "paralysis" });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target already has yawn volatile, when Yawn is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target already drowsy
    const attacker = createActivePokemon({ types: ["normal"] });
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("yawn", { turnsLeft: 1 });
    const defender = createActivePokemon({ types: ["normal"], volatiles });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target has Insomnia, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn blocked by sleep-preventing abilities
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], ability: "insomnia" });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target has Vital Spirit, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Vital Spirit blocks Yawn
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], ability: "vital-spirit" });
    const move = createMove("yawn");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Encore
// ===========================================================================

describe("Encore", () => {
  it("given target used Tackle last turn, when Encore is used, then target gets encore volatile with moveId=tackle", () => {
    // Source: Showdown Gen 4 mod — Encore locks target into last move used
    // Source: Bulbapedia — Encore: "forces the target to repeat its last used move"
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Rattata",
      lastMoveUsed: "tackle",
    });
    const move = createMove("encore");
    const rng = createMockRng(5); // rng.int(4,8) will return 5
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("encore");
    expect(result.volatileData?.turnsLeft).toBe(5);
    expect(result.volatileData?.data).toEqual({ moveId: "tackle" });
    expect(result.messages).toContain("Rattata got an encore!");
  });

  it("given target has no last move, when Encore is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Encore fails if target hasn't used a move
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["normal"],
      lastMoveUsed: null,
    });
    const move = createMove("encore");
    const rng = createMockRng(5);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target already has encore volatile, when Encore is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot Encore a Pokemon that is already Encored
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("encore", { turnsLeft: 3, data: { moveId: "tackle" } });
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["normal"],
      lastMoveUsed: "tackle",
      volatiles,
    });
    const move = createMove("encore");
    const rng = createMockRng(5);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target used Ember last turn, when Encore is used with rng returning 8, then turnsLeft is 8", () => {
    // Source: Showdown Gen 4 mod — Encore duration range is 4-8 turns
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["fire"],
      nickname: "Charmander",
      lastMoveUsed: "ember",
    });
    const move = createMove("encore");
    const rng = createMockRng(8);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("encore");
    expect(result.volatileData?.turnsLeft).toBe(8);
    expect(result.volatileData?.data).toEqual({ moveId: "ember" });
  });
});

// ===========================================================================
// Heal Block
// ===========================================================================

describe("Heal Block", () => {
  it("given target without heal-block, when Heal Block is used, then target gets heal-block volatile for 5 turns", () => {
    // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
    // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const move = createMove("heal-block");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("heal-block");
    expect(result.volatileData).toEqual({ turnsLeft: 5 });
    expect(result.messages).toContain("Blissey was prevented from healing!");
  });

  it("given target already has heal-block, when Heal Block is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot stack Heal Block
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("heal-block", { turnsLeft: 3 });
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"], volatiles });
    const move = createMove("heal-block");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker has heal-block, when Recover is used (via data-driven heal effect), then healAmount is 0", () => {
    // Source: Showdown Gen 4 mod — heal-block volatile gates all healing
    // Source: Bulbapedia — Heal Block: "prevents the target from recovering HP"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("heal-block", { turnsLeft: 3 });
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("recover", {
      category: "status",
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.healAmount).toBe(0);
    expect(result.messages.some((m) => m.includes("blocked from healing"))).toBe(true);
  });

  it("given attacker has heal-block, when Roost is used, then healAmount is 0", () => {
    // Source: Showdown Gen 4 mod — Roost blocked by Heal Block
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("heal-block", { turnsLeft: 3 });
    const attacker = createActivePokemon({
      types: ["normal", "flying"],
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("roost", {
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.healAmount).toBe(0);
    expect(result.messages.some((m) => m.includes("blocked from healing"))).toBe(true);
  });

  it("given attacker without heal-block, when Recover is used, then healAmount is 100 (50% of 200)", () => {
    // Source: Showdown Gen 4 — Recover heals 50% of max HP
    // Derivation: floor(200 * 0.5) = 100
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 50,
      maxHp: 200,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("recover", {
      category: "status",
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.healAmount).toBe(100);
  });
});

// ===========================================================================
// Embargo
// ===========================================================================

describe("Embargo", () => {
  it("given target without embargo, when Embargo is used, then target gets embargo volatile for 5 turns", () => {
    // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
    // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Chansey" });
    const move = createMove("embargo");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("embargo");
    expect(result.volatileData).toEqual({ turnsLeft: 5 });
    expect(result.messages).toContain("Chansey can't use items!");
  });

  it("given target already has embargo, when Embargo is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot stack Embargo
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("embargo", { turnsLeft: 3 });
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"], volatiles });
    const move = createMove("embargo");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target has embargo volatile and holds Sitrus Berry, when item triggers, then item is blocked", () => {
    // Source: Showdown Gen 4 mod — Embargo blocks held item activation
    // Source: Bulbapedia — Embargo: "prevents the target from using its held item"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("embargo", { turnsLeft: 3 });
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state: {} as any,
      rng: createMockRng(0),
    });

    expect(result.activated).toBe(false);
  });

  it("given target without embargo and holds Sitrus Berry below 50% HP, when item triggers, then item activates", () => {
    // Baseline test: Sitrus Berry works normally without Embargo
    // Source: Bulbapedia — Sitrus Berry heals 1/4 max HP when HP drops to 50% or below
    // Derivation: maxHp=200, 50% = 100, currentHp=90 < 100 -> triggers, heals floor(200/4) = 50
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "sitrus-berry",
      currentHp: 90,
      maxHp: 200,
    });

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state: {} as any,
      rng: createMockRng(0),
    });

    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Worry Seed
// ===========================================================================

describe("Worry Seed", () => {
  it("given target with Chlorophyll, when Worry Seed is used, then ability becomes insomnia", () => {
    // Source: Bulbapedia — Worry Seed: "Changes the target's Ability to Insomnia"
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({
      types: ["grass"],
      nickname: "Bulbasaur",
      ability: "chlorophyll",
    });
    const move = createMove("worry-seed");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("insomnia");
    expect(result.messages).toContain("Bulbasaur's ability changed to Insomnia!");
  });

  it("given target already has Insomnia, when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails if target already has Insomnia
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({
      types: ["normal"],
      ability: "insomnia",
    });
    const move = createMove("worry-seed");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(defender.ability).toBe("insomnia");
  });

  it("given target has Truant, when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails vs Truant
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({
      types: ["normal"],
      ability: "truant",
    });
    const move = createMove("worry-seed");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(defender.ability).toBe("truant");
  });

  it("given target has Multitype (Arceus), when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails vs Multitype
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({
      types: ["normal"],
      ability: "multitype",
    });
    const move = createMove("worry-seed");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(defender.ability).toBe("multitype");
  });

  it("given target is asleep with Synchronize, when Worry Seed is used, then ability becomes Insomnia and target wakes up", () => {
    // Source: Showdown Gen 4 mod — Worry Seed cures sleep if new ability blocks it
    // Source: Bulbapedia — Insomnia: "Prevents the Pokemon from falling asleep"
    const attacker = createActivePokemon({ types: ["grass"] });
    const sleepVolatiles = new Map<string, { turnsLeft: number }>();
    sleepVolatiles.set("sleep-counter", { turnsLeft: 3 });
    const defender = createActivePokemon({
      types: ["psychic"],
      nickname: "Alakazam",
      ability: "synchronize",
      status: "sleep",
      volatiles: sleepVolatiles,
    });
    const move = createMove("worry-seed");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("insomnia");
    expect(defender.pokemon.status).toBeNull();
    expect(defender.volatileStatuses.has("sleep-counter")).toBe(false);
    expect(result.messages).toContain("Alakazam's ability changed to Insomnia and it woke up!");
  });
});

// ===========================================================================
// Gastro Acid
// ===========================================================================

describe("Gastro Acid", () => {
  it("given target has Intimidate, when Gastro Acid is used, then target ability becomes empty string (suppressed)", () => {
    // Source: Bulbapedia — Gastro Acid: "suppresses the target's ability"
    // Source: Showdown Gen 4 mod — Gastro Acid clears ability
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Gyarados",
      ability: "intimidate",
    });
    const move = createMove("gastro-acid");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("");
    expect(result.messages).toContain("Gyarados's ability was suppressed!");
  });

  it("given target has Multitype (Arceus), when Gastro Acid is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Gastro Acid fails vs Multitype
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({
      types: ["normal"],
      ability: "multitype",
    });
    const move = createMove("gastro-acid");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("multitype");
    expect(result.messages).toContain("But it failed!");
  });

  it("given target has Levitate, when Gastro Acid is used, then target ability becomes empty string", () => {
    // Source: Showdown Gen 4 mod — Gastro Acid works on any non-Multitype ability
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({
      types: ["ghost", "poison"],
      nickname: "Gengar",
      ability: "levitate",
    });
    const move = createMove("gastro-acid");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("");
    expect(result.messages).toContain("Gengar's ability was suppressed!");
  });
});
