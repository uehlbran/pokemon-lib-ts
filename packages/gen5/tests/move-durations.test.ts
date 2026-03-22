/**
 * Tests for Gen 5 Encore, Taunt, and Disable move duration overrides.
 *
 * Gen 5 changed these from variable random durations (Gen 4) to fixed values:
 *   - Encore: exactly 3 turns (Gen 4 was random 4-8)
 *   - Taunt: exactly 3 turns (Gen 4 was random 3-5)
 *   - Disable: exactly 4 turns (Gen 4 was random 4-7)
 *
 * Source: Showdown data/mods/gen5/moves.ts -- duration overrides
 * Source: Bulbapedia -- Generation V move mechanics changes
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen5BehaviorMove } from "../src/Gen5MoveEffectsBehavior";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as move-effects-combat.test.ts)
// ---------------------------------------------------------------------------

function makeActive(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  lastMoveUsed?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  priority?: number;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "status",
    power: overrides.power ?? null,
    accuracy: 100,
    pp: 5,
    priority: overrides.priority ?? 0,
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
    generation: 5,
  } as MoveData;
}

function makeState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    turnHistory: [],
  } as unknown as BattleState;
}

function makeContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
  };
}

// ===========================================================================
// Encore
// ===========================================================================

describe("Encore (Gen 5 fixed duration)", () => {
  it("given target used a move last turn, when Encore is used, then volatileInflicted is 'encore' with turnsLeft=3", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- encore: condition.duration = 3
    // Source: Bulbapedia -- "Encore lasts for 3 turns in Generation V onwards"
    const defender = makeActive({ lastMoveUsed: "thunderbolt", nickname: "Pikachu" });
    const ctx = makeContext({
      move: makeMove({ id: "encore" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("encore");
    expect(result!.volatileData).toEqual({ turnsLeft: 3, data: { moveId: "thunderbolt" } });
    expect(result!.messages).toContain("Pikachu got an encore!");
  });

  it("given target used a different move last turn, when Encore is used, then volatileData records that specific move with turnsLeft=3", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- encore: condition.duration = 3
    // Triangulation: different move ID to verify the moveId in volatileData is dynamic
    const defender = makeActive({ lastMoveUsed: "ice-beam", nickname: "Lapras" });
    const ctx = makeContext({
      move: makeMove({ id: "encore" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("encore");
    expect(result!.volatileData).toEqual({ turnsLeft: 3, data: { moveId: "ice-beam" } });
    expect(result!.messages).toContain("Lapras got an encore!");
  });

  it("given target has no last move used, when Encore is used, then the move fails", () => {
    // Source: Showdown data/moves.ts -- encore: onTry checks target.lastMove
    const defender = makeActive({ lastMoveUsed: null });
    const ctx = makeContext({
      move: makeMove({ id: "encore" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target is already Encored, when Encore is used again, then the move fails", () => {
    // Source: Showdown data/moves.ts -- encore: volatileStatus check prevents double application
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("encore", { turnsLeft: 2, data: { moveId: "tackle" } });
    const defender = makeActive({ lastMoveUsed: "tackle", volatiles });
    const ctx = makeContext({
      move: makeMove({ id: "encore" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Taunt
// ===========================================================================

describe("Taunt (Gen 5 fixed duration)", () => {
  it("given target is not Taunted, when Taunt is used, then volatileInflicted is 'taunt' with turnsLeft=3", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- taunt: condition.duration = 3
    // Source: Bulbapedia -- "Taunt lasts for 3 turns in Generation V onwards"
    const defender = makeActive({ nickname: "Slowpoke" });
    const ctx = makeContext({
      move: makeMove({ id: "taunt" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("taunt");
    expect(result!.volatileData).toEqual({ turnsLeft: 3 });
    expect(result!.messages).toContain("Slowpoke fell for the taunt!");
  });

  it("given a different target is not Taunted, when Taunt is used, then message uses that target's name", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- taunt: condition.duration = 3
    // Triangulation: different nickname to verify message is dynamic
    const defender = makeActive({ nickname: "Blissey" });
    const ctx = makeContext({
      move: makeMove({ id: "taunt" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("taunt");
    expect(result!.volatileData).toEqual({ turnsLeft: 3 });
    expect(result!.messages).toContain("Blissey fell for the taunt!");
  });

  it("given target is already Taunted, when Taunt is used again, then the move fails", () => {
    // Source: Showdown data/moves.ts -- taunt: volatileStatus check prevents double application
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("taunt", { turnsLeft: 2 });
    const defender = makeActive({ volatiles });
    const ctx = makeContext({
      move: makeMove({ id: "taunt" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Disable
// ===========================================================================

describe("Disable (Gen 5 fixed duration)", () => {
  it("given target used a move last turn, when Disable is used, then volatileInflicted is 'disable' with turnsLeft=4", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- disable: condition.duration = 4
    // Source: Bulbapedia -- "Disable lasts for 4 turns in Generation V onwards"
    const defender = makeActive({ lastMoveUsed: "flamethrower", nickname: "Charizard" });
    const ctx = makeContext({
      move: makeMove({ id: "disable" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("disable");
    expect(result!.volatileData).toEqual({ turnsLeft: 4, data: { moveId: "flamethrower" } });
    expect(result!.messages).toContain("Charizard's flamethrower was disabled!");
  });

  it("given target used a different move last turn, when Disable is used, then volatileData records that specific move with turnsLeft=4", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- disable: condition.duration = 4
    // Triangulation: different move ID to verify the moveId in volatileData is dynamic
    const defender = makeActive({ lastMoveUsed: "surf", nickname: "Starmie" });
    const ctx = makeContext({
      move: makeMove({ id: "disable" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("disable");
    expect(result!.volatileData).toEqual({ turnsLeft: 4, data: { moveId: "surf" } });
    expect(result!.messages).toContain("Starmie's surf was disabled!");
  });

  it("given target has no last move used, when Disable is used, then the move fails", () => {
    // Source: Showdown data/moves.ts -- disable: onTry checks target.lastMove
    const defender = makeActive({ lastMoveUsed: null });
    const ctx = makeContext({
      move: makeMove({ id: "disable" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target is already Disabled, when Disable is used again, then the move fails", () => {
    // Source: Showdown data/moves.ts -- disable: volatileStatus check prevents double application
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("disable", { turnsLeft: 3, data: { moveId: "tackle" } });
    const defender = makeActive({ lastMoveUsed: "tackle", volatiles });
    const ctx = makeContext({
      move: makeMove({ id: "disable" }),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});
