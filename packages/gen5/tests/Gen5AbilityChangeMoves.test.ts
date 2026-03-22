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
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN5_CANTSUPPRESS,
  GEN5_FAIL_ROLE_PLAY,
  GEN5_FAIL_SKILL_SWAP,
  handleGen5StatusMove,
} from "../src/Gen5MoveEffectsStatus";

// ---------------------------------------------------------------------------
// Helper factories (duplicated from move-effects-status.test.ts for isolation)
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
    suppressedAbility: overrides.suppressedAbility ?? null,
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
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: overrides.priority ?? 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
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
// Simple Beam
// ===========================================================================

describe("Simple Beam", () => {
  it("given Simple Beam, when used on a target with Overgrow, then target ability becomes Simple", () => {
    // Source: Showdown data/moves.ts simplebeam.onHit -- target.setAbility('simple')
    // Source: Bulbapedia -- "Simple Beam changes the target's Ability to Simple"
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate", nickname: "Audino" }),
      defender: makeActive({ ability: "overgrow", nickname: "Serperior" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: "simple" });
    expect(result!.messages[0]).toContain("Simple");
  });

  it("given Simple Beam, when used on a target with Blaze, then target ability becomes Simple", () => {
    // Source: Showdown data/moves.ts simplebeam.onHit -- target.setAbility('simple')
    // Second triangulation case with different input ability
    const ctx = makeContext({
      attacker: makeActive({ ability: "healer" }),
      defender: makeActive({ ability: "blaze" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: "simple" });
  });

  it("given target already has Simple, when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'simple'
    const ctx = makeContext({
      defender: makeActive({ ability: "simple" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Truant, when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'truant'
    const ctx = makeContext({
      defender: makeActive({ ability: "truant" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Multitype (cantsuppress), when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- cantsuppress flag
    // Source: Showdown data/abilities.ts -- multitype has flags.cantsuppress
    const ctx = makeContext({
      defender: makeActive({ ability: "multitype" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Zen Mode (cantsuppress), when Simple Beam is used, then fails", () => {
    // Source: Showdown data/moves.ts simplebeam.onTryHit -- cantsuppress flag
    // Source: Showdown data/abilities.ts -- zen-mode has flags.cantsuppress
    const ctx = makeContext({
      defender: makeActive({ ability: "zen-mode" }),
      move: makeMove({ id: "simple-beam", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Worry Seed
// ===========================================================================

describe("Worry Seed", () => {
  it("given Worry Seed, when used on a target with Overgrow, then target ability becomes Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- target.setAbility('insomnia')
    // Source: Bulbapedia -- "Worry Seed changes the target's Ability to Insomnia"
    const ctx = makeContext({
      attacker: makeActive({ ability: "chlorophyll", nickname: "Whimsicott" }),
      defender: makeActive({ ability: "overgrow", nickname: "Serperior" }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: "insomnia" });
    expect(result!.messages[0]).toContain("Insomnia");
  });

  it("given Worry Seed, when used on a target with Intimidate, then target ability becomes Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- target.setAbility('insomnia')
    // Second triangulation case with different input ability
    const ctx = makeContext({
      defender: makeActive({ ability: "intimidate" }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: "insomnia" });
  });

  it("given target is asleep, when Worry Seed is used, then target wakes up and gains Insomnia", () => {
    // Source: Showdown data/moves.ts worryseed.onHit -- if (target.status === 'slp') target.cureStatus()
    // Source: Bulbapedia -- "If the target is sleeping, it will wake up"
    const sleepVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    sleepVolatiles.set("sleep-counter", { turnsLeft: 3 });
    const ctx = makeContext({
      defender: makeActive({
        ability: "natural-cure",
        status: "sleep",
        volatiles: sleepVolatiles,
        nickname: "Chansey",
      }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "defender", ability: "insomnia" });
    // Direct mutation: sleep status is cured and sleep-counter volatile is removed
    expect(ctx.defender.pokemon.status).toBeNull();
    expect(ctx.defender.volatileStatuses.has("sleep-counter")).toBe(false);
    expect(result!.messages[0]).toContain("woke up");
  });

  it("given target already has Insomnia, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryImmunity -- target.ability === 'insomnia'
    const ctx = makeContext({
      defender: makeActive({ ability: "insomnia" }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Truant, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryImmunity -- target.ability === 'truant'
    const ctx = makeContext({
      defender: makeActive({ ability: "truant" }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Multitype, when Worry Seed is used, then fails", () => {
    // Source: Showdown data/moves.ts worryseed.onTryHit -- cantsuppress flag
    const ctx = makeContext({
      defender: makeActive({ ability: "multitype" }),
      move: makeMove({ id: "worry-seed", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
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
    const ctx = makeContext({
      attacker: makeActive({ ability: "prankster", nickname: "Sableye" }),
      defender: makeActive({ ability: "intimidate", nickname: "Gyarados" }),
      move: makeMove({ id: "gastro-acid", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Direct mutation: defender's ability is set to "" and original is stored
    expect(ctx.defender.ability).toBe("");
    expect(ctx.defender.suppressedAbility).toBe("intimidate");
    expect(result!.messages[0]).toContain("suppressed");
  });

  it("given Gastro Acid, when used on a target with Mold Breaker, then target ability is suppressed", () => {
    // Source: Showdown data/moves.ts gastroacid -- volatileStatus: 'gastroacid'
    // Second triangulation case with different ability
    const ctx = makeContext({
      defender: makeActive({ ability: "mold-breaker" }),
      move: makeMove({ id: "gastro-acid", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.ability).toBe("");
    expect(ctx.defender.suppressedAbility).toBe("mold-breaker");
  });

  it("given target has Multitype, when Gastro Acid is used, then fails", () => {
    // Source: Showdown data/moves.ts gastroacid.onTryHit -- cantsuppress flag
    const ctx = makeContext({
      defender: makeActive({ ability: "multitype" }),
      move: makeMove({ id: "gastro-acid", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // Ability should NOT be changed
    expect(ctx.defender.ability).toBe("multitype");
    expect(ctx.defender.suppressedAbility).toBeNull();
  });

  it("given target ability is already suppressed, when Gastro Acid is used again, then fails", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid is idempotent
    // Source: Gen4MoveEffects.ts -- if (defender.suppressedAbility != null) fail
    const ctx = makeContext({
      defender: makeActive({
        ability: "",
        suppressedAbility: "intimidate",
      }),
      move: makeMove({ id: "gastro-acid", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // suppressedAbility should remain unchanged (still holds the original)
    expect(ctx.defender.suppressedAbility).toBe("intimidate");
  });
});

// ===========================================================================
// Role Play
// ===========================================================================

describe("Role Play", () => {
  it("given Role Play, when used, then user copies target's ability", () => {
    // Source: Showdown data/moves.ts roleplay.onHit -- source.setAbility(target.ability)
    // Source: Bulbapedia -- "Role Play copies the target's Ability, replacing the user's"
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate", nickname: "Gardevoir" }),
      defender: makeActive({ ability: "speed-boost", nickname: "Blaziken" }),
      move: makeMove({ id: "role-play", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "attacker", ability: "speed-boost" });
    expect(result!.messages[0]).toContain("speed-boost");
  });

  it("given Role Play, when used to copy Levitate, then user gains Levitate", () => {
    // Source: Showdown data/moves.ts roleplay.onHit -- source.setAbility(target.ability)
    // Second triangulation case with different ability
    const ctx = makeContext({
      attacker: makeActive({ ability: "synchronize" }),
      defender: makeActive({ ability: "levitate" }),
      move: makeMove({ id: "role-play", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toEqual({ target: "attacker", ability: "levitate" });
  });

  it("given target and source have the same ability, when Role Play is used, then fails", () => {
    // Source: Showdown data/moves.ts roleplay.onTryHit -- target.ability === source.ability
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "intimidate" }),
      move: makeMove({ id: "role-play", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Illusion (failroleplay), when Role Play is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- illusion has flags.failroleplay
    // Source: Showdown data/moves.ts roleplay.onTryHit -- target.getAbility().flags['failroleplay']
    const ctx = makeContext({
      attacker: makeActive({ ability: "synchronize" }),
      defender: makeActive({ ability: "illusion" }),
      move: makeMove({ id: "role-play", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given source has Multitype (cantsuppress), when Role Play is used, then fails", () => {
    // Source: Showdown data/moves.ts roleplay.onTryHit -- source.getAbility().flags['cantsuppress']
    const ctx = makeContext({
      attacker: makeActive({ ability: "multitype" }),
      defender: makeActive({ ability: "overgrow" }),
      move: makeMove({ id: "role-play", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.abilityChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Skill Swap
// ===========================================================================

describe("Skill Swap", () => {
  it("given Skill Swap, when used, then user and target exchange abilities", () => {
    // Source: Showdown sim/battle.ts skillSwap -- source.ability = targetAbility.id; target.ability = sourceAbility.id
    // Source: Bulbapedia -- "Skill Swap swaps the user's Ability with the target's"
    const ctx = makeContext({
      attacker: makeActive({ ability: "levitate", nickname: "Bronzong" }),
      defender: makeActive({ ability: "iron-barbs", nickname: "Ferrothorn" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Direct mutation: abilities are swapped
    expect(ctx.attacker.ability).toBe("iron-barbs");
    expect(ctx.defender.ability).toBe("levitate");
    expect(result!.messages[0]).toContain("swapped");
  });

  it("given Skill Swap, when Intimidate and Overgrow are swapped, then abilities are exchanged", () => {
    // Source: Showdown sim/battle.ts skillSwap -- swap logic
    // Second triangulation case with different abilities
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "overgrow" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.attacker.ability).toBe("overgrow");
    expect(ctx.defender.ability).toBe("intimidate");
  });

  it("given both have the same ability in Gen 5, when Skill Swap is used, then fails", () => {
    // Source: Showdown sim/battle.ts skillSwap -- "if (this.gen <= 5 && sourceAbility.id === targetAbility.id) return false"
    // Gen 5 specific: same-ability Skill Swap fails (Gen 6+ allows it)
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "intimidate" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // Abilities should remain unchanged
    expect(ctx.attacker.ability).toBe("intimidate");
    expect(ctx.defender.ability).toBe("intimidate");
  });

  it("given source has Wonder Guard (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- wonder-guard has flags.failskillswap
    // Source: Showdown sim/battle.ts skillSwap -- sourceAbility.flags['failskillswap']
    const ctx = makeContext({
      attacker: makeActive({ ability: "wonder-guard" }),
      defender: makeActive({ ability: "intimidate" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // Abilities unchanged
    expect(ctx.attacker.ability).toBe("wonder-guard");
    expect(ctx.defender.ability).toBe("intimidate");
  });

  it("given target has Multitype (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- multitype has flags.failskillswap
    // Source: Showdown sim/battle.ts skillSwap -- targetAbility.flags['failskillswap']
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "multitype" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    expect(ctx.attacker.ability).toBe("intimidate");
    expect(ctx.defender.ability).toBe("multitype");
  });

  it("given target has Illusion (failskillswap), when Skill Swap is used, then fails", () => {
    // Source: Showdown data/abilities.ts -- illusion has flags.failskillswap
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "illusion" }),
      move: makeMove({ id: "skill-swap", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Blocked ability constant sets
// ===========================================================================

describe("Ability-change blocked sets", () => {
  it("given GEN5_CANTSUPPRESS, when checked, then contains multitype and zen-mode", () => {
    // Source: Showdown data/abilities.ts -- multitype/zen-mode have flags.cantsuppress in Gen 5
    expect(GEN5_CANTSUPPRESS.has("multitype")).toBe(true);
    expect(GEN5_CANTSUPPRESS.has("zen-mode")).toBe(true);
    expect(GEN5_CANTSUPPRESS.size).toBe(2);
  });

  it("given GEN5_FAIL_ROLE_PLAY, when checked, then contains the correct Gen 5 failroleplay abilities", () => {
    // Source: Showdown data/abilities.ts -- abilities with flags.failroleplay that exist in Gen 5
    expect(GEN5_FAIL_ROLE_PLAY.has("multitype")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("zen-mode")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("flower-gift")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("forecast")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("illusion")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("imposter")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.has("trace")).toBe(true);
    expect(GEN5_FAIL_ROLE_PLAY.size).toBe(7);
  });

  it("given GEN5_FAIL_SKILL_SWAP, when checked, then contains the correct Gen 5 failskillswap abilities", () => {
    // Source: Showdown data/abilities.ts -- abilities with flags.failskillswap that exist in Gen 5
    expect(GEN5_FAIL_SKILL_SWAP.has("multitype")).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has("zen-mode")).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has("illusion")).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has("imposter")).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.has("wonder-guard")).toBe(true);
    expect(GEN5_FAIL_SKILL_SWAP.size).toBe(5);
  });
});
