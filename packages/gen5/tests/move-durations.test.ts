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
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { handleGen5BehaviorMove } from "../src/Gen5MoveEffectsBehavior";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as move-effects-combat.test.ts)
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen5DataManager();
const MOVES = GEN5_MOVE_IDS;
const SPECIES = GEN5_SPECIES_IDS;
const NATURES = GEN5_NATURE_IDS;
const ITEMS = GEN5_ITEM_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const NONE = CORE_ABILITY_IDS.none;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const THUNDERBOLT = DATA_MANAGER.getMove(MOVES.thunderbolt);
const ICE_BEAM = DATA_MANAGER.getMove(MOVES.iceBeam);
const FLAMETHROWER = DATA_MANAGER.getMove(MOVES.flamethrower);
const SURF = DATA_MANAGER.getMove(MOVES.surf);
const ENCORE_TURNS = 3;
const TAUNT_TURNS = 3;
const DISABLE_TURNS = 4;

function createSyntheticOnFieldPokemon(overrides: {
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
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
      ability: overrides.ability ?? NONE,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? NONE,
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
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createCanonicalMove(id: string): MoveData {
  return DATA_MANAGER.getMove(id);
}

function createBattleState(): BattleState {
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

function createMoveEffectContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? createCanonicalMove(MOVES.tackle),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? createBattleState(),
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
    const defender = createSyntheticOnFieldPokemon({
      lastMoveUsed: THUNDERBOLT.id,
      nickname: "Pikachu",
    });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.encore),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.encore);
    expect(result!.volatileData).toEqual({
      turnsLeft: ENCORE_TURNS,
      data: { moveId: THUNDERBOLT.id },
    });
    expect(result!.messages).toContain("Pikachu got an encore!");
  });

  it("given target used a different move last turn, when Encore is used, then volatileData records that specific move with turnsLeft=3", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- encore: condition.duration = 3
    // Triangulation: different move ID to verify the moveId in volatileData is dynamic
    const defender = createSyntheticOnFieldPokemon({
      lastMoveUsed: ICE_BEAM.id,
      nickname: "Lapras",
    });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.encore),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.encore);
    expect(result!.volatileData).toEqual({
      turnsLeft: ENCORE_TURNS,
      data: { moveId: ICE_BEAM.id },
    });
    expect(result!.messages).toContain("Lapras got an encore!");
  });

  it("given target has no last move used, when Encore is used, then the move fails", () => {
    // Source: Showdown data/moves.ts -- encore: onTry checks target.lastMove
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: null });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.encore),
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
    volatiles.set(VOLATILES.encore, { turnsLeft: ENCORE_TURNS - 1, data: { moveId: TACKLE.id } });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: TACKLE.id, volatiles });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.encore),
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
    const defender = createSyntheticOnFieldPokemon({ nickname: "Slowpoke" });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.taunt),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.taunt);
    expect(result!.volatileData).toEqual({ turnsLeft: TAUNT_TURNS });
    expect(result!.messages).toContain("Slowpoke fell for the taunt!");
  });

  it("given a different target is not Taunted, when Taunt is used, then message uses that target's name", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- taunt: condition.duration = 3
    // Triangulation: different nickname to verify message is dynamic
    const defender = createSyntheticOnFieldPokemon({ nickname: "Blissey" });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.taunt),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.taunt);
    expect(result!.volatileData).toEqual({ turnsLeft: TAUNT_TURNS });
    expect(result!.messages).toContain("Blissey fell for the taunt!");
  });

  it("given target is already Taunted, when Taunt is used again, then the move fails", () => {
    // Source: Showdown data/moves.ts -- taunt: volatileStatus check prevents double application
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(VOLATILES.taunt, { turnsLeft: TAUNT_TURNS - 1 });
    const defender = createSyntheticOnFieldPokemon({ volatiles });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.taunt),
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
    const defender = createSyntheticOnFieldPokemon({
      lastMoveUsed: FLAMETHROWER.id,
      nickname: "Charizard",
    });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.disable),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.disable);
    expect(result!.volatileData).toEqual({
      turnsLeft: DISABLE_TURNS,
      data: { moveId: FLAMETHROWER.id },
    });
    expect(result!.messages).toContain("Charizard's flamethrower was disabled!");
  });

  it("given target used a different move last turn, when Disable is used, then volatileData records that specific move with turnsLeft=4", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- disable: condition.duration = 4
    // Triangulation: different move ID to verify the moveId in volatileData is dynamic
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: SURF.id, nickname: "Starmie" });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.disable),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(VOLATILES.disable);
    expect(result!.volatileData).toEqual({ turnsLeft: DISABLE_TURNS, data: { moveId: SURF.id } });
    expect(result!.messages).toContain("Starmie's surf was disabled!");
  });

  it("given target has no last move used, when Disable is used, then the move fails", () => {
    // Source: Showdown data/moves.ts -- disable: onTry checks target.lastMove
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: null });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.disable),
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
    volatiles.set(VOLATILES.disable, { turnsLeft: DISABLE_TURNS - 1, data: { moveId: TACKLE.id } });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: TACKLE.id, volatiles });
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.disable),
      defender,
    });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});
