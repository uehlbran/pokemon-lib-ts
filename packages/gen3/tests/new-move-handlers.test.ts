import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";

/**
 * Gen 3 New Move Handler Tests
 *
 * Tests for issue #225: Whirlwind/Roar, Trick, Morning Sun/Synthesis/Moonlight,
 * and Explosion/Self-Destruct defense halving.
 * Also tests the getEndOfTurnOrder() override.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intValue = 0) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intValue,
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
  ability?: string;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 300,
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
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 300,
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
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: null,
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
    power: null,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: [],
    effect: null,
    critRatio: 0,
    generation: 3,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
}

function createBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weather: { type: string | null; turnsLeft: number; source: string | null } | null = null,
): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: weather ?? { type: null, turnsLeft: 0, source: null },
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
  weather: { type: string | null; turnsLeft: number; source: string | null } | null = null,
): MoveEffectContext {
  const state = createBattleState(attacker, defender, weather);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Whirlwind / Roar
// ---------------------------------------------------------------------------

describe("Gen 3 Whirlwind / Roar", () => {
  it("given defender without Suction Cups, when Whirlwind used, then switchOut = true", () => {
    // Source: pret/pokeemerald — Whirlwind forces switch
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("whirlwind");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given defender without Suction Cups, when Roar used, then switchOut = true", () => {
    // Source: pret/pokeemerald — Roar forces switch
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("roar");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given defender has Suction Cups, when Whirlwind used, then switchOut = false", () => {
    // Source: pret/pokeemerald — ABILITY_SUCTION_CUPS blocks phazing
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["rock"],
      ability: "suction-cups",
      nickname: "Octillery",
    });
    const move = createMove("whirlwind");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
    expect(result.messages).toContain("Octillery anchored itself with Suction Cups!");
  });

  it("given defender has Suction Cups, when Roar used, then switchOut = false", () => {
    // Source: pret/pokeemerald — ABILITY_SUCTION_CUPS blocks phazing
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["water"], ability: "suction-cups" });
    const move = createMove("roar");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trick
// ---------------------------------------------------------------------------

describe("Gen 3 Trick", () => {
  it("given both have items, when Trick used, then itemTransfer from attacker to defender", () => {
    // Source: pret/pokeemerald — Trick swaps held items
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: "choice-band",
      nickname: "Alakazam",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
    });
    const move = createMove("trick");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "attacker", to: "defender" });
    expect(result.messages).toContain("Alakazam switched items with its target!");
  });

  it("given attacker has item but defender has none, when Trick used, then itemTransfer succeeds", () => {
    // Source: pret/pokeemerald — Trick works as long as at least one has an item
    const attacker = createActivePokemon({ types: ["psychic"], heldItem: "choice-band" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("trick");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "attacker", to: "defender" });
  });

  it("given neither has items, when Trick used, then it fails", () => {
    // Source: pret/pokeemerald — Trick fails if neither has an item
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("trick");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender has Sticky Hold, when Trick used, then it fails", () => {
    // Source: pret/pokeemerald — Sticky Hold blocks item transfer
    const attacker = createActivePokemon({ types: ["psychic"], heldItem: "choice-band" });
    const defender = createActivePokemon({
      types: ["poison"],
      ability: "sticky-hold",
      heldItem: "leftovers",
      nickname: "Muk",
    });
    const move = createMove("trick");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toContain("Muk's Sticky Hold prevents item transfer!");
  });
});

// ---------------------------------------------------------------------------
// Morning Sun / Synthesis / Moonlight
// ---------------------------------------------------------------------------

describe("Gen 3 Morning Sun / Synthesis / Moonlight", () => {
  it("given no weather, when Morning Sun used, then healAmount = floor(maxHp * 1/2) = 150", () => {
    // Source: pret/pokeemerald — No weather: 1/2 maxHP recovery
    // Source: Bulbapedia — "Heals 50% HP normally"
    // floor(300 * 1/2) = 150
    const attacker = createActivePokemon({ types: ["normal"], currentHp: 100 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("morning-sun");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(150);
  });

  it("given sun weather, when Synthesis used, then healAmount = floor(maxHp * 2/3) = 200", () => {
    // Source: pret/pokeemerald — Sun: 2/3 maxHP recovery
    // Source: Bulbapedia — "Heals 2/3 HP in sun"
    // floor(300 * 2/3) = floor(200) = 200
    const attacker = createActivePokemon({ types: ["grass"], currentHp: 50 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("synthesis");
    const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(200);
  });

  it("given rain weather, when Moonlight used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Rain/Sand/Hail: 1/4 maxHP recovery
    // Source: Bulbapedia — "Heals 25% HP in rain, sand, or hail"
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: ["fairy"], currentHp: 50 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("moonlight");
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });

  it("given sand weather, when Morning Sun used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Sand: 1/4 maxHP recovery
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: ["normal"], currentHp: 50 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("morning-sun");
    const weather = { type: "sand", turnsLeft: 3, source: "sandstorm" };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });

  it("given hail weather, when Synthesis used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Hail: 1/4 maxHP recovery
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: ["grass"], currentHp: 50 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("synthesis");
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// getEndOfTurnOrder
// ---------------------------------------------------------------------------

describe("Gen 3 getEndOfTurnOrder", () => {
  it("given Gen3Ruleset, when getEndOfTurnOrder called, then returns Gen 3 specific EoT sequence", () => {
    // Source: pret/pokeemerald src/battle_main.c — end-of-turn phase ordering
    const order = ruleset.getEndOfTurnOrder();

    // Verify weather-damage comes first
    expect(order[0]).toBe("weather-damage");

    // Verify perish-song comes before speed-boost
    const perishIdx = order.indexOf("perish-song");
    const speedBoostIdx = order.indexOf("speed-boost");
    expect(perishIdx).toBeGreaterThan(-1);
    expect(speedBoostIdx).toBeGreaterThan(-1);
    expect(perishIdx).toBeLessThan(speedBoostIdx);

    // Verify weather-countdown comes last
    expect(order[order.length - 1]).toBe("weather-countdown");

    // Verify total count matches expected (20 items: original 16 + wish + ingrain + uproar + stat-boosting-items)
    expect(order).toHaveLength(20);

    // Verify key effects are present
    expect(order).toContain("future-attack");
    expect(order).toContain("leftovers");
    expect(order).toContain("ingrain");
    expect(order).toContain("status-damage");
    expect(order).toContain("leech-seed");
    expect(order).toContain("curse");
    expect(order).toContain("bind");
    expect(order).toContain("encore-countdown");
    expect(order).toContain("disable-countdown");
    expect(order).toContain("taunt-countdown");
    expect(order).toContain("shed-skin");

    // Verify uproar is present between perish-song and speed-boost
    // Source: pret/pokeemerald src/battle_main.c — Uproar processing in end-of-turn loop
    // Source: Spec 04-gen3.md line 1038 — "13. Uproar wake-up check"
    const uproarIdx = order.indexOf("uproar");
    expect(uproarIdx).toBeGreaterThan(-1);
    expect(uproarIdx).toBeGreaterThan(perishIdx);
    expect(uproarIdx).toBeLessThan(speedBoostIdx);
  });

  it("given Gen3Ruleset, when getEndOfTurnOrder called, then status-damage comes before leech-seed", () => {
    // Source: pret/pokeemerald — burn/poison damage resolves before leech seed
    const order = ruleset.getEndOfTurnOrder();
    const statusIdx = order.indexOf("status-damage");
    const leechIdx = order.indexOf("leech-seed");
    expect(statusIdx).toBeLessThan(leechIdx);
  });
});
