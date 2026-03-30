/**
 * Tests for Gen 5 ability-change move handlers.
 *
 * Covers: Simple Beam, Worry Seed, Gastro Acid, Role Play, Skill Swap.
 *
 * Source: references/pokemon-showdown/data/moves.ts (base definitions)
 * Source: references/pokemon-showdown/sim/battle.ts (skillSwap helper)
 * Source: Bulbapedia -- individual move pages
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, PrimaryStatus, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager, GEN5_ABILITY_IDS, GEN5_MOVE_IDS } from "../src";
import {
  GEN5_CANTSUPPRESS,
  GEN5_FAIL_ROLE_PLAY,
  GEN5_FAIL_SKILL_SWAP,
  handleGen5StatusMove,
} from "../src/Gen5MoveEffectsStatus";

const dataManager = createGen5DataManager();
const A = GEN5_ABILITY_IDS;
const M = GEN5_MOVE_IDS;
const NONE_ABILITY = CORE_ABILITY_IDS.none;
const NONE_TYPE = CORE_TYPE_IDS.normal;
const SLEEP_COUNTER = CORE_VOLATILE_IDS.sleepCounter;

const FAILED_STATUS_RESULT = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: ["But it failed!"],
};

// ---------------------------------------------------------------------------
// Helper factories (duplicated from move-effects-status.test.ts for isolation)
// ---------------------------------------------------------------------------

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
  status?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  lastMoveUsed?: string | null;
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
  suppressedAbility?: string | null;
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
      nature: CORE_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? NONE_ABILITY,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    types: overrides.types ?? [NONE_TYPE],
    ability: overrides.ability ?? NONE_ABILITY,
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
    suppressedAbility: overrides.suppressedAbility ?? null,
    forcedMove: null,
  } as ActivePokemon;
}

function createCanonicalMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
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
    move: overrides.move ?? createCanonicalMove(CORE_MOVE_IDS.tackle),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(42),
  };
}

// ===========================================================================
// Simple Beam
// ===========================================================================

describe("Simple Beam", () => {
  it("given Simple Beam, when used on a target with Overgrow, then target ability becomes Simple", () => {
    // Source: Showdown data/moves.ts simplebeam.onHit -- target.setAbility('simple')
    // Source: Bulbapedia -- "Simple Beam changes the target's Ability to Simple"
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate, nickname: "Audino" }),
      defender: createSyntheticOnFieldPokemon({ ability: A.overgrow, nickname: "Serperior" }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: A.simple });
    expect(result!.messages[0]).toContain("Simple");
  });

  it("given Simple Beam, when used on a target with Blaze, then target ability becomes Simple", () => {
    // Source: Showdown data/moves.ts simplebeam.onHit -- target.setAbility('simple')
    // Second triangulation case with different input ability
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.healer }),
      defender: createSyntheticOnFieldPokemon({ ability: A.blaze }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: A.simple });
  });

  it("given target already has Simple, when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'simple'
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.simple }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.simple);
  });

  it("given target has Truant, when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'truant'
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.truant }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.truant);
  });

  it("given target has Multitype (cantsuppress), when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- cantsuppress flag
    // Source: Showdown data/abilities.ts -- multitype has flags.cantsuppress
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.multitype }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.multitype);
  });

  it("given target has Zen Mode (cantsuppress), when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- cantsuppress flag
    // Source: Showdown data/abilities.ts -- zen-mode has flags.cantsuppress
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.zenMode }),
      move: createCanonicalMove(M.simpleBeam),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.zenMode);
  });
});

// ===========================================================================
// Worry Seed
// ===========================================================================

describe("Worry Seed", () => {
  it("given Worry Seed, when used on a target with Overgrow, then target ability becomes Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- target.setAbility('insomnia')
    // Source: Bulbapedia -- "Worry Seed changes the target's Ability to Insomnia"
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.chlorophyll, nickname: "Whimsicott" }),
      defender: createSyntheticOnFieldPokemon({ ability: A.overgrow, nickname: "Serperior" }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: A.insomnia });
    expect(result!.messages[0]).toContain("Insomnia");
  });

  it("given Worry Seed, when used on a target with Intimidate, then target ability becomes Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- target.setAbility('insomnia')
    // Second triangulation case with different input ability
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: A.insomnia });
  });

  it("given target is asleep, when Worry Seed is used, then target wakes up and gains Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- if (target.status === 'slp') target.cureStatus()
    // Source: Bulbapedia -- "If the target is sleeping, it will wake up"
    const sleepVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    sleepVolatiles.set(SLEEP_COUNTER, { turnsLeft: 3 });
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({
        ability: A.naturalCure,
        status: CORE_STATUS_IDS.sleep,
        volatiles: sleepVolatiles,
        nickname: "Chansey",
      }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: A.insomnia });
    // Direct mutation: sleep status is cured and sleep-counter volatile is removed
    expect(ctx.defender.pokemon.status).toBeNull();
    expect(ctx.defender.volatileStatuses.has(SLEEP_COUNTER)).toBe(false);
    expect(result!.messages[0]).toContain("woke up");
  });

  it("given target already has Insomnia, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryImmunity -- target.ability === 'insomnia'
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.insomnia }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.insomnia);
  });

  it("given target has Truant, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryImmunity -- target.ability === 'truant'
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.truant }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.truant);
  });

  it("given target has Multitype, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryHit -- cantsuppress flag
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.multitype }),
      move: createCanonicalMove(M.worrySeed),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.defender.ability).toBe(A.multitype);
  });
});

// ===========================================================================
// Gastro Acid
// ===========================================================================

describe("Gastro Acid", () => {
  it("given Gastro Acid, when used on a target with Intimidate, then target ability is suppressed", () => {
    // Source: Showdown data/moves.ts gastroacid -- volatileStatus: 'gastroacid'
    // Source: Bulbapedia -- "Gastro Acid suppresses the target's Ability"
    // Source: Gen4MoveEffects.ts lines 1517-1518 -- same suppressedAbility pattern
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.prankster, nickname: "Sableye" }),
      defender: createSyntheticOnFieldPokemon({ ability: A.intimidate, nickname: "Gyarados" }),
      move: createCanonicalMove(M.gastroAcid),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Direct mutation: defender's ability is set to "" and original is stored
    expect(ctx.defender.ability).toBe("");
    expect(ctx.defender.suppressedAbility).toBe(A.intimidate);
    expect(result!.messages[0]).toContain("suppressed");
  });

  it("given Gastro Acid, when used on a target with Mold Breaker, then target ability is suppressed", () => {
    // Source: Showdown data/moves.ts gastroacid -- volatileStatus: 'gastroacid'
    // Second triangulation case with different ability
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.moldBreaker }),
      move: createCanonicalMove(M.gastroAcid),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.ability).toBe("");
    expect(ctx.defender.suppressedAbility).toBe(A.moldBreaker);
  });

  it("given target has Multitype, when Gastro Acid is used, then fails", () => {
    // Source: Showdown data/moves.ts gastroacid.onTryHit -- cantsuppress flag
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ ability: A.multitype }),
      move: createCanonicalMove(M.gastroAcid),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // Ability should NOT be changed
    expect(ctx.defender.ability).toBe(A.multitype);
    expect(ctx.defender.suppressedAbility).toBeNull();
  });

  it("given target ability is already suppressed, when Gastro Acid is used again, then fails", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid is idempotent
    // Source: Gen4MoveEffects.ts -- if (defender.suppressedAbility != null) fail
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({
        ability: "",
        suppressedAbility: A.intimidate,
      }),
      move: createCanonicalMove(M.gastroAcid),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // suppressedAbility should remain unchanged (still holds the original)
    expect(ctx.defender.suppressedAbility).toBe(A.intimidate);
  });
});

// ===========================================================================
// Role Play
// ===========================================================================

describe("Role Play", () => {
  it("given Role Play, when used, then user copies target's ability", () => {
    // Source: Showdown data/moves.ts roleplay.onHit -- source.setAbility(target.ability)
    // Source: Bulbapedia -- "Role Play copies the target's Ability, replacing the user's"
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate, nickname: "Gardevoir" }),
      defender: createSyntheticOnFieldPokemon({ ability: A.speedBoost, nickname: "Blaziken" }),
      move: createCanonicalMove(M.rolePlay),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "attacker", ability: A.speedBoost });
    expect(result!.messages[0]).toBe(`Gardevoir copied ${A.speedBoost}!`);
  });

  it("given Role Play, when used to copy Levitate, then user gains Levitate", () => {
    // Source: Showdown data/moves.ts roleplay.onHit -- source.setAbility(target.ability)
    // Second triangulation case with different ability
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.synchronize }),
      defender: createSyntheticOnFieldPokemon({ ability: A.levitate }),
      move: createCanonicalMove(M.rolePlay),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "attacker", ability: A.levitate });
  });

  it("given target and source have the same ability, when Role Play is used, then fails", () => {
    // Source: Showdown data/moves.ts roleplay.onTryHit -- target.ability === source.ability
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      move: createCanonicalMove(M.rolePlay),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.attacker.ability).toBe(A.intimidate);
    expect(ctx.defender.ability).toBe(A.intimidate);
  });

  it("given target has Illusion (failroleplay), when Role Play is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- illusion has flags.failroleplay
    // Source: Showdown data/moves.ts roleplay.onTryHit -- target.getAbility().flags['failroleplay']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.synchronize }),
      defender: createSyntheticOnFieldPokemon({ ability: A.illusion }),
      move: createCanonicalMove(M.rolePlay),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.attacker.ability).toBe(A.synchronize);
    expect(ctx.defender.ability).toBe(A.illusion);
  });

  it("given source has Multitype (cantsuppress), when Role Play is used, then fails", () => {
    // Source: Showdown data/moves.ts roleplay.onTryHit -- source.getAbility().flags['cantsuppress']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.multitype }),
      defender: createSyntheticOnFieldPokemon({ ability: A.overgrow }),
      move: createCanonicalMove(M.rolePlay),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.attacker.ability).toBe(A.multitype);
    expect(ctx.defender.ability).toBe(A.overgrow);
  });
});

// ===========================================================================
// Skill Swap
// ===========================================================================

describe("Skill Swap", () => {
  it("given Skill Swap, when used, then user and target exchange abilities", () => {
    // Source: Showdown sim/battle.ts skillSwap -- source.ability = targetAbility.id; target.ability = sourceAbility.id
    // Source: Bulbapedia -- "Skill Swap swaps the user's Ability with the target's"
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.levitate, nickname: "Bronzong" }),
      defender: createSyntheticOnFieldPokemon({ ability: A.ironBarbs, nickname: "Ferrothorn" }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Direct mutation: abilities are swapped
    expect(ctx.attacker.ability).toBe(A.ironBarbs);
    expect(ctx.defender.ability).toBe(A.levitate);
    expect(result!.messages[0]).toContain("swapped");
  });

  it("given Skill Swap, when Intimidate and Overgrow are swapped, then abilities are exchanged", () => {
    // Source: Showdown sim/battle.ts skillSwap -- swap logic
    // Second triangulation case with different abilities
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: A.overgrow }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.attacker.ability).toBe(A.overgrow);
    expect(ctx.defender.ability).toBe(A.intimidate);
  });

  it("given both have the same ability in Gen 5, when Skill Swap is used, then fails", () => {
    // Source: Showdown sim/battle.ts skillSwap -- "if (this.gen <= 5 && sourceAbility.id === targetAbility.id) return false"
    // Gen 5 specific: same-ability Skill Swap fails (Gen 6+ allows it)
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    // Abilities should remain unchanged
    expect(ctx.attacker.ability).toBe(A.intimidate);
    expect(ctx.defender.ability).toBe(A.intimidate);
  });

  it("given source has Wonder Guard (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- wonder-guard has flags.failskillswap
    // Source: Showdown sim/battle.ts skillSwap -- sourceAbility.flags['failskillswap']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.wonderGuard }),
      defender: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    // Abilities unchanged
    expect(ctx.attacker.ability).toBe(A.wonderGuard);
    expect(ctx.defender.ability).toBe(A.intimidate);
  });

  it("given target has Multitype (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- multitype has flags.failskillswap
    // Source: Showdown sim/battle.ts skillSwap -- targetAbility.flags['failskillswap']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: A.multitype }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.attacker.ability).toBe(A.intimidate);
    expect(ctx.defender.ability).toBe(A.multitype);
  });

  it("given target has Illusion (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- illusion has flags.failskillswap
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: A.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: A.illusion }),
      move: createCanonicalMove(M.skillSwap),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(FAILED_STATUS_RESULT);
    expect(ctx.attacker.ability).toBe(A.intimidate);
    expect(ctx.defender.ability).toBe(A.illusion);
  });
});

// ===========================================================================
// Blocked ability constant sets
// ===========================================================================

describe("Ability-change blocked sets", () => {
  it("given GEN5_CANTSUPPRESS, when checked, then contains multitype and zen-mode", () => {
    // Source: Showdown data/abilities.ts -- multitype/zen-mode have flags.cantsuppress in Gen 5
    expect(GEN5_CANTSUPPRESS.has(A.multitype)).toBe(true);
    expect(GEN5_CANTSUPPRESS.has(A.zenMode)).toBe(true);
    expect(GEN5_CANTSUPPRESS.size).toBe(2);
  });

  it("given GEN5_FAIL_ROLE_PLAY, when checked, then contains the correct Gen 5 failroleplay abilities", () => {
    // Source: Showdown data/abilities.ts -- abilities with flags.failroleplay that exist in Gen 5
    expect(GEN5_FAIL_ROLE_PLAY.has(A.multitype)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.zenMode)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.flowerGift)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.forecast)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.illusion)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.imposter)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has(A.trace)).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.size).toBe(7);
  });

  it("given GEN5_FAIL_SKILL_SWAP, when checked, then contains the correct Gen 5 failskillswap abilities", () => {
    // Source: Showdown data/abilities.ts -- abilities with flags.failskillswap that exist in Gen 5
    expect(GEN5_FAIL_SKILL_SWAP.has(A.multitype)).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has(A.zenMode)).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has(A.illusion)).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has(A.imposter)).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has(A.wonderGuard)).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.size).toBe(5);
  });
});
