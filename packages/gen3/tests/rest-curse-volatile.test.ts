import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";

/**
 * Gen 3 Rest, Curse, Taunt, Encore, Disable, Endure Tests
 *
 * Tests for issues #222 (Rest, Curse) and #206 (Taunt, Encore, Disable).
 *
 * Gen 3 specifics:
 * - Rest: full heal + self-inflict 2-turn sleep
 * - Curse: Ghost-type loses 50% HP + curse volatile; non-Ghost gets stat changes
 * - Taunt: 2 turns (not 3-5 like Gen 4)
 * - Encore: 2-5 turns (not 4-8 like Gen 4)
 * - Disable: 2-5 turns (not fixed 4 like Gen 4)
 * - Endure: selfVolatileInflicted = "endure"
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
  lastMoveUsed?: string | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
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
    currentHp: opts.currentHp ?? 200,
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

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
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
  damage: number,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Rest
// ---------------------------------------------------------------------------

describe("Gen 3 Rest", () => {
  it("given attacker at half HP, when Rest used, then healAmount = maxHp and selfStatusInflicted = sleep", () => {
    // Source: pret/pokeemerald — Rest heals fully and inflicts sleep
    const attacker = createActivePokemon({
      types: ["normal"],
      currentHp: 100,
      nickname: "Snorlax",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("rest");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    // Source: pret/pokeemerald — healAmount = maxHp (200)
    expect(result.healAmount).toBe(200);
    expect(result.selfStatusInflicted).toBe("sleep");
    expect(result.messages).toContain("Snorlax went to sleep and became healthy!");
  });

  it("given attacker at full HP, when Rest used, then healAmount still = maxHp", () => {
    // Source: pret/pokeemerald — Rest always heals full HP regardless of current HP
    const attacker = createActivePokemon({ types: ["normal"], currentHp: 200 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("rest");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(200);
    expect(result.selfStatusInflicted).toBe("sleep");
  });
});

// ---------------------------------------------------------------------------
// Curse (Ghost-type)
// ---------------------------------------------------------------------------

describe("Gen 3 Curse (Ghost-type)", () => {
  it("given ghost-type attacker, when Curse used, then recoilDamage = 50% maxHp and volatileInflicted = curse", () => {
    // Source: pret/pokeemerald — Ghost-type Curse: lose 50% HP, inflict curse volatile
    const attacker = createActivePokemon({ types: ["ghost"], nickname: "Dusclops" });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Slaking" });
    const move = createMove("curse", { type: "ghost" });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    // Source: pret/pokeemerald — floor(200 / 2) = 100
    expect(result.recoilDamage).toBe(100);
    expect(result.volatileInflicted).toBe("curse");
    expect(result.messages).toContain("Dusclops cut its own HP and laid a curse on Slaking!");
  });

  it("given ghost/dark dual-type attacker, when Curse used, then ghost-type path activates", () => {
    // Source: pret/pokeemerald — Curse checks if user includes ghost type
    const attacker = createActivePokemon({ types: ["ghost", "dark"], nickname: "Sableye" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("curse", { type: "ghost" });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(100);
    expect(result.volatileInflicted).toBe("curse");
  });
});

// ---------------------------------------------------------------------------
// Curse (Non-Ghost)
// ---------------------------------------------------------------------------

describe("Gen 3 Curse (Non-Ghost)", () => {
  it("given non-ghost attacker, when Curse used, then stat changes = -1 Speed, +1 Attack, +1 Defense", () => {
    // Source: pret/pokeemerald — non-Ghost Curse: -1 Speed, +1 Atk, +1 Def
    const attacker = createActivePokemon({ types: ["steel"], nickname: "Steelix" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("curse", { type: "ghost" });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "speed", stages: -1 },
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "defense", stages: 1 },
    ]);
  });

  it("given normal-type attacker, when Curse used, then non-ghost path activates (no recoil, no curse volatile)", () => {
    // Source: pret/pokeemerald — Curse path depends on whether user has ghost type
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("curse", { type: "ghost" });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Taunt
// ---------------------------------------------------------------------------

describe("Gen 3 Taunt", () => {
  it("given defender not taunted, when Taunt used, then volatileInflicted = taunt with turnsLeft = 2", () => {
    // Source: pret/pokeemerald — Taunt lasts 2 turns in Gen 3
    // Source: Bulbapedia — "In Generation III, Taunt lasts for 2 turns"
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const move = createMove("taunt");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("taunt");
    expect(result.volatileData).toEqual({ turnsLeft: 2 });
    expect(result.messages).toContain("Blissey fell for the taunt!");
  });

  it("given defender with no nickname, when Taunt used, then default name in message", () => {
    // Source: pret/pokeemerald — Taunt message format
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("taunt");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("taunt");
    expect(result.volatileData).toEqual({ turnsLeft: 2 });
    expect(result.messages).toContain("The foe fell for the taunt!");
  });
});

// ---------------------------------------------------------------------------
// Encore
// ---------------------------------------------------------------------------

describe("Gen 3 Encore", () => {
  it("given defender used a move last turn, when Encore used with rng=2, then volatileInflicted = encore with turnsLeft = 2", () => {
    // Source: pret/pokeemerald — Encore lasts 2-5 turns in Gen 3
    // Source: Bulbapedia — "In Generation III, Encore lasts 2-5 turns"
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Snorlax" });
    defender.lastMoveUsed = "body-slam";
    const move = createMove("encore");
    const context = createContext(attacker, defender, move, 0, createMockRng(2));

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("encore");
    expect(result.volatileData).toEqual({ turnsLeft: 2, data: { moveId: "body-slam" } });
    expect(result.messages).toContain("Snorlax got an encore!");
  });

  it("given defender used a move last turn, when Encore used with rng=5, then volatileInflicted = encore with turnsLeft = 5", () => {
    // Source: pret/pokeemerald — Encore lasts 2-5 turns, upper bound
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    defender.lastMoveUsed = "thunderbolt";
    const move = createMove("encore");
    const context = createContext(attacker, defender, move, 0, createMockRng(5));

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("encore");
    expect(result.volatileData).toEqual({ turnsLeft: 5, data: { moveId: "thunderbolt" } });
  });

  it("given defender has no last move, when Encore used, then it fails", () => {
    // Source: pret/pokeemerald — Encore fails if no last move
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("encore");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender already encored, when Encore used, then it fails", () => {
    // Source: pret/pokeemerald — Encore fails if already affected
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    defender.lastMoveUsed = "tackle";
    defender.volatileStatuses.set("encore", { turnsLeft: 3 });
    const move = createMove("encore");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Disable
// ---------------------------------------------------------------------------

describe("Gen 3 Disable", () => {
  it("given defender used a move last turn, when Disable used with rng=2, then volatileInflicted = disable with turnsLeft = 2", () => {
    // Source: pret/pokeemerald — Disable lasts 2-5 turns in Gen 3
    // Source: Bulbapedia — "In Generation III, Disable lasts 2-5 turns"
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Snorlax" });
    defender.lastMoveUsed = "body-slam";
    const move = createMove("disable");
    const context = createContext(attacker, defender, move, 0, createMockRng(2));

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData).toEqual({ turnsLeft: 2, data: { moveId: "body-slam" } });
    expect(result.messages).toContain("Snorlax's body-slam was disabled!");
  });

  it("given defender used a move last turn, when Disable used with rng=5, then turnsLeft = 5", () => {
    // Source: pret/pokeemerald — Disable lasts 2-5 turns, upper bound
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    defender.lastMoveUsed = "ice-beam";
    const move = createMove("disable");
    const context = createContext(attacker, defender, move, 0, createMockRng(5));

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData).toEqual({ turnsLeft: 5, data: { moveId: "ice-beam" } });
  });

  it("given defender has no last move, when Disable used, then it fails", () => {
    // Source: pret/pokeemerald — Disable fails if no last move to disable
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("disable");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Endure
// ---------------------------------------------------------------------------

describe("Gen 3 Endure", () => {
  it("given attacker uses Endure, when executeMoveEffect called, then selfVolatileInflicted = endure", () => {
    // Source: pret/pokeemerald — Endure sets ENDURE volatile
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Blissey" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("endure");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("endure");
    expect(result.messages).toContain("Blissey braced itself!");
  });

  it("given attacker with no nickname uses Endure, when executeMoveEffect called, then default name in message", () => {
    // Source: pret/pokeemerald — Endure message
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("endure");
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("endure");
    expect(result.messages).toContain("The Pokemon braced itself!");
  });
});
