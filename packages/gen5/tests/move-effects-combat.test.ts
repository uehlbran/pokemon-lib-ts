/**
 * Tests for Gen 5 combat move effect handlers.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: Bulbapedia -- individual move pages
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  type MoveData,
  type PokemonType,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager, GEN5_MOVE_IDS, GEN5_NATURE_IDS, GEN5_SPECIES_IDS } from "../src";
import {
  didAllyFaintLastTurn,
  getAcrobaticsBP,
  getAcrobaticsPower,
  getElectroBallBP,
  getElectroBallPower,
  getGyroBallBP,
  getGyroBallPower,
  getRetaliateBP,
  getRetaliatePower,
  getWeightBasedBP,
  getWeightBasedPower,
  handleGen5CombatMove,
} from "../src/Gen5MoveEffectsCombat";

const DEFAULT_TEST_HP = 200;

const EMPTY_COMBAT_RESULT = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: [],
};

const DATA_MANAGER = createGen5DataManager();
const BASE_SPECIES = DATA_MANAGER.getSpecies(GEN5_SPECIES_IDS.bulbasaur);

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeScenarioActive(overrides: {
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
      speciesId: overrides.speciesId ?? BASE_SPECIES.id,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DATA_MANAGER.getNature(GEN5_NATURE_IDS.hardy).id,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
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
    types: overrides.types ?? [...BASE_SPECIES.types],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
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

function makeScenarioMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  priority?: number;
}): MoveData {
  const baseMove = DATA_MANAGER.getMove(overrides.id ?? GEN5_MOVE_IDS.tackle);
  return {
    ...baseMove,
    id: baseMove.id,
    displayName: baseMove.displayName,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    accuracy: baseMove.accuracy,
    pp: baseMove.pp,
    priority: overrides.priority ?? baseMove.priority,
    target: baseMove.target,
    flags: { ...baseMove.flags },
    effect: baseMove.effect,
    description: baseMove.description,
    generation: baseMove.generation,
  } as MoveData;
}

function createBattleState(overrides?: { turnHistory?: any[]; sides?: any[] }): BattleState {
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
    sides: overrides?.sides ?? [
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
    turnHistory: overrides?.turnHistory ?? [],
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
    attacker: overrides.attacker ?? makeScenarioActive({}),
    defender: overrides.defender ?? makeScenarioActive({}),
    move: overrides.move ?? makeScenarioMove({}),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(42),
  };
}

// ===========================================================================
// Explosion / Self-Destruct
// ===========================================================================

describe("Explosion / Self-Destruct", () => {
  it("given Explosion in Gen 5, when executed, then the user self-faints without halving defense", () => {
    // Source: Showdown gen5/moves.ts -- Explosion no longer halves defense in Gen 5
    // Source: Bulbapedia -- "Starting in Gen V, Explosion no longer halves target's Defense"
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.explosion,
        type: CORE_TYPE_IDS.normal,
        power: 250,
      }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.selfFaint).toBe(true);
    expect(result!.messages.length).toBeGreaterThan(0);
    // Critically: no defense modification field exists on MoveEffectResult.
    // Gen 5 Explosion is purely selfFaint + damage (damage calc does NOT halve defense).
  });

  it("given Self-Destruct in Gen 5, when executed, then the user self-faints", () => {
    // Source: Showdown data/moves.ts -- selfdestruct: same as explosion
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.selfDestruct,
        type: CORE_TYPE_IDS.normal,
        power: 200,
      }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.selfFaint).toBe(true);
  });
});

// ===========================================================================
// Dragon Tail / Circle Throw
// ===========================================================================

describe("Dragon Tail / Circle Throw", () => {
  it("given Dragon Tail, when it hits, then the defender is forced to switch", () => {
    // Source: Showdown data/moves.ts -- dragontail: forceSwitch: true, priority: -6
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.dragonTail,
        type: CORE_TYPE_IDS.dragon,
        power: 60,
        priority: -6,
      }),
      damage: 30,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.switchOut).toBe(true);
    expect(result!.forcedSwitch).toBe(true);
  });

  it("given Circle Throw, when it hits, then the defender is forced to switch", () => {
    // Source: Showdown data/moves.ts -- circlethrow: forceSwitch: true, priority: -6
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.circleThrow,
        type: CORE_TYPE_IDS.fighting,
        power: 60,
        priority: -6,
      }),
      damage: 25,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.switchOut).toBe(true);
    expect(result!.forcedSwitch).toBe(true);
  });
});

// ===========================================================================
// Acrobatics
// ===========================================================================

describe("Acrobatics", () => {
  it("given a user with no held item, when calculating Acrobatics BP, then returns 110", () => {
    // Source: Showdown data/moves.ts -- acrobatics:
    //   basePower: 55, basePowerCallback: if (!pokemon.item) return move.basePower * 2
    //   55 * 2 = 110
    const bp = getAcrobaticsBP(false);
    expect(bp).toBe(110);
  });

  it("given a user holding an item, when calculating Acrobatics BP, then returns 55", () => {
    // Source: Showdown data/moves.ts -- acrobatics: basePower: 55 (no doubling with item)
    const bp = getAcrobaticsBP(true);
    expect(bp).toBe(55);
  });

  it("given both Acrobatics export names, when calculating power, then they match", () => {
    // Source: Showdown data/moves.ts -- Acrobatics doubles from 55 to 110 with no held item.
    expect(getAcrobaticsPower(false)).toBe(110);
    expect(getAcrobaticsPower(false)).toBe(getAcrobaticsBP(false));
    expect(getAcrobaticsPower(true)).toBe(getAcrobaticsBP(true));
  });
});

// ===========================================================================
// Final Gambit
// ===========================================================================

describe("Final Gambit", () => {
  it("given a user with 150 HP, when Final Gambit is used, then deals 150 damage and user faints", () => {
    // Source: Showdown data/moves.ts -- finalgambit:
    //   damageCallback(pokemon) { const damage = pokemon.hp; pokemon.faint(); return damage; }
    const attacker = makeScenarioActive({ hp: 200, currentHp: 150 });
    const ctx = makeContext({
      attacker,
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.finalGambit,
        type: CORE_TYPE_IDS.fighting,
        power: 0,
      }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.selfFaint).toBe(true);
    expect(result!.customDamage).not.toBeNull();
    expect(result!.customDamage!.amount).toBe(150);
    expect(result!.customDamage!.target).toBe("defender");
    expect(result!.customDamage!.source).toBe(GEN5_MOVE_IDS.finalGambit);
  });

  it("given a user with 1 HP, when Final Gambit is used, then deals 1 damage and user faints", () => {
    // Source: Showdown data/moves.ts -- Final Gambit deals damage equal to user's current HP
    // Edge case: even at 1 HP, it still works (no failure condition for low HP)
    const attacker = makeScenarioActive({ hp: 200, currentHp: 1 });
    const ctx = makeContext({
      attacker,
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.finalGambit,
        type: CORE_TYPE_IDS.fighting,
        power: 0,
      }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.selfFaint).toBe(true);
    expect(result!.customDamage!.amount).toBe(1);
  });
});

// ===========================================================================
// Foul Play
// ===========================================================================

describe("Foul Play", () => {
  it("given Foul Play, when handled, then returns null (stat swap is in damage calc, not effect handler)", () => {
    // Source: Showdown data/moves.ts -- foulplay: overrideOffensivePokemon: 'target'
    // The effect handler has no secondary effects; the stat swap is damage-calc-level.
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.foulPlay, type: CORE_TYPE_IDS.dark, power: 95 }),
    });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.attacker.pokemon.currentHp).toBe(DEFAULT_TEST_HP);
    expect(ctx.defender.pokemon.currentHp).toBe(DEFAULT_TEST_HP);
  });

  it("given Foul Play against a different target, when handled, then also returns null", () => {
    // Source: Showdown data/moves.ts -- no secondary effects on foul play
    const ctx = makeContext({
      attacker: makeScenarioActive({ attack: 50 }),
      defender: makeScenarioActive({ attack: 200 }),
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.foulPlay, type: CORE_TYPE_IDS.dark, power: 95 }),
    });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.attacker.pokemon.calculatedStats?.attack).toBe(50);
    expect(ctx.defender.pokemon.calculatedStats?.attack).toBe(DEFAULT_TEST_HP);
  });
});

// ===========================================================================
// Shell Smash
// ===========================================================================

describe("Shell Smash", () => {
  it("given Shell Smash, when used, then raises Atk/SpAtk/Speed by 2 and lowers Def/SpDef by 1", () => {
    // Source: Showdown data/moves.ts -- shellsmash:
    //   boosts: { def: -1, spd: -1, atk: 2, spa: 2, spe: 2 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.shellSmash, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const changes = result!.statChanges;
    expect(changes).toEqual([
      { target: "attacker", stat: "attack", stages: 2 },
      { target: "attacker", stat: "spAttack", stages: 2 },
      { target: "attacker", stat: "speed", stages: 2 },
      { target: "attacker", stat: "defense", stages: -1 },
      { target: "attacker", stat: "spDefense", stages: -1 },
    ]);
  });

  it("given Shell Smash with a nicknamed user, when used, then message includes nickname", () => {
    // Source: Showdown -- Shell Smash message verification
    const attacker = makeScenarioActive({ nickname: "Cloyster" });
    const ctx = makeContext({
      attacker,
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.shellSmash, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).toEqual({
      ...EMPTY_COMBAT_RESULT,
      statChanges: [
        { target: "attacker", stat: "attack", stages: 2 },
        { target: "attacker", stat: "spAttack", stages: 2 },
        { target: "attacker", stat: "speed", stages: 2 },
        { target: "attacker", stat: "defense", stages: -1 },
        { target: "attacker", stat: "spDefense", stages: -1 },
      ],
      messages: ["Cloyster broke its shell!"],
    });
  });
});

// ===========================================================================
// Coil
// ===========================================================================

describe("Coil", () => {
  it("given Coil, when used, then raises Atk, Def, and Accuracy by 1", () => {
    // Source: Showdown data/moves.ts -- coil: boosts: { atk: 1, def: 1, accuracy: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.coil, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "defense", stages: 1 },
      { target: "attacker", stat: "accuracy", stages: 1 },
    ]);
  });

  it("given Coil, when used a second time, then still produces +1 stat changes (clamping is engine's job)", () => {
    // Source: Showdown -- stat stage clamping is separate from effect production
    const attacker = makeScenarioActive({});
    attacker.statStages.attack = 5; // Already high
    const ctx = makeContext({
      attacker,
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.coil, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    // Effect handler always returns +1; the engine clamps at +6
    const attackChange = result!.statChanges.find(
      (c) => c.stat === "attack" && c.target === "attacker",
    );
    expect(attackChange!.stages).toBe(1);
  });
});

// ===========================================================================
// Quiver Dance
// ===========================================================================

describe("Quiver Dance", () => {
  it("given Quiver Dance, when used, then raises SpAtk, SpDef, and Speed by 1", () => {
    // Source: Showdown data/moves.ts -- quiverdance: boosts: { spa: 1, spd: 1, spe: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.quiverDance, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "spAttack", stages: 1 },
      { target: "attacker", stat: "spDefense", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });

  it("given Quiver Dance, when used, then no other side effects occur", () => {
    // Source: Showdown data/moves.ts -- quiverdance has no secondary effects
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.quiverDance, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusInflicted).toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.recoilDamage).toBe(0);
    expect(result!.healAmount).toBe(0);
    expect(result!.switchOut).toBe(false);
  });
});

// ===========================================================================
// Flame Charge
// ===========================================================================

describe("Flame Charge", () => {
  it("given Flame Charge, when it hits, then raises the user's Speed by 1", () => {
    // Source: Showdown data/moves.ts -- flamecharge:
    //   secondary: { chance: 100, self: { boosts: { spe: 1 } } }
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.flameCharge,
        type: CORE_TYPE_IDS.fire,
        power: 50,
      }),
      damage: 20,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([{ target: "attacker", stat: "speed", stages: 1 }]);
  });

  it("given Flame Charge, when it hits, then only the attacker's Speed is boosted (no defender changes)", () => {
    // Source: Showdown -- Flame Charge only boosts user's Speed
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.flameCharge,
        type: CORE_TYPE_IDS.fire,
        power: 50,
      }),
      damage: 15,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const defenderChanges = result!.statChanges.filter((c) => c.target === "defender");
    expect(defenderChanges).toEqual([]);
  });
});

// ===========================================================================
// Work Up
// ===========================================================================

describe("Work Up", () => {
  it("given Work Up, when used, then raises Atk and SpAtk by 1", () => {
    // Source: Showdown data/moves.ts -- workup: boosts: { atk: 1, spa: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.workUp, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "spAttack", stages: 1 },
    ]);
  });

  it("given Work Up, when used, then no defensive stat changes occur", () => {
    // Source: Showdown -- Work Up only boosts offensive stats
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.workUp, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const defStats = result!.statChanges.filter(
      (c) => c.stat === "defense" || c.stat === "spDefense",
    );
    expect(defStats).toEqual([]);
  });
});

// ===========================================================================
// Hone Claws
// ===========================================================================

describe("Hone Claws", () => {
  it("given Hone Claws, when used, then raises Atk and Accuracy by 1", () => {
    // Source: Showdown data/moves.ts -- honeclaws: boosts: { atk: 1, accuracy: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.honeClaws, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "accuracy", stages: 1 },
    ]);
  });

  it("given Hone Claws, when used, then does not boost Speed", () => {
    // Source: Showdown -- Hone Claws only boosts Atk and Accuracy
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.honeClaws, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).toEqual({
      ...EMPTY_COMBAT_RESULT,
      statChanges: [
        { target: "attacker", stat: "attack", stages: 1 },
        { target: "attacker", stat: "accuracy", stages: 1 },
      ],
    });
  });
});

// ===========================================================================
// Bulk Up
// ===========================================================================

describe("Bulk Up", () => {
  it("given Bulk Up, when used, then raises Atk and Def by 1", () => {
    // Source: Showdown data/moves.ts -- bulkup: boosts: { atk: 1, def: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.bulkUp, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "defense", stages: 1 },
    ]);
  });

  it("given Bulk Up, when used, then does not affect SpAtk or SpDef", () => {
    // Source: Showdown -- Bulk Up is physical only
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.bulkUp, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const specialChanges = result!.statChanges.filter(
      (c) => c.stat === "spAttack" || c.stat === "spDefense",
    );
    expect(specialChanges).toEqual([]);
  });
});

// ===========================================================================
// Calm Mind
// ===========================================================================

describe("Calm Mind", () => {
  it("given Calm Mind, when used, then raises SpAtk and SpDef by 1", () => {
    // Source: Showdown data/moves.ts -- calmmind: boosts: { spa: 1, spd: 1 }
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.calmMind, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "spAttack", stages: 1 },
      { target: "attacker", stat: "spDefense", stages: 1 },
    ]);
  });

  it("given Calm Mind, when used, then does not affect Atk or Def", () => {
    // Source: Showdown -- Calm Mind is special only
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.calmMind, category: "status", power: null }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const physChanges = result!.statChanges.filter(
      (c) => c.stat === "attack" || c.stat === "defense",
    );
    expect(physChanges).toEqual([]);
  });
});

// ===========================================================================
// Electro Ball
// ===========================================================================

describe("Electro Ball", () => {
  it("given user is 4x faster than target, when calculating Electro Ball BP, then returns 150", () => {
    // Source: Showdown data/moves.ts -- electroball:
    //   ratio = floor(400/100) = 4; bp = [40,60,80,120,150][4] = 150
    expect(getElectroBallBP(400, 100)).toBe(150);
  });

  it("given user is 2x faster than target, when calculating Electro Ball BP, then returns 80", () => {
    // Source: Showdown data/moves.ts -- electroball:
    //   ratio = floor(200/100) = 2; bp = [40,60,80,120,150][2] = 80
    expect(getElectroBallBP(200, 100)).toBe(80);
  });

  it("given user is 3x faster than target, when calculating Electro Ball BP, then returns 120", () => {
    // Source: Showdown data/moves.ts -- electroball:
    //   ratio = floor(300/100) = 3; bp = [40,60,80,120,150][3] = 120
    expect(getElectroBallBP(300, 100)).toBe(120);
  });

  it("given user speed equals target speed, when calculating Electro Ball BP, then returns 60", () => {
    // Source: Showdown data/moves.ts -- electroball:
    //   ratio = floor(100/100) = 1; bp = [40,60,80,120,150][1] = 60
    expect(getElectroBallBP(100, 100)).toBe(60);
  });

  it("given user is slower than target, when calculating Electro Ball BP, then returns 40", () => {
    // Source: Showdown data/moves.ts -- electroball:
    //   ratio = floor(50/100) = 0; bp = [40,60,80,120,150][0] = 40
    expect(getElectroBallBP(50, 100)).toBe(40);
  });

  it("given target speed is 0, when calculating Electro Ball BP, then returns 40 (edge case)", () => {
    // Source: Showdown data/moves.ts -- ratio would be Infinity, capped to 0 by guard
    expect(getElectroBallBP(100, 0)).toBe(40);
  });

  it("given user is over 4x faster, when calculating Electro Ball BP, then returns 150 (capped)", () => {
    // Source: Showdown data/moves.ts -- Math.min(ratio, 4) caps at index 4
    expect(getElectroBallBP(1000, 100)).toBe(150);
  });

  it("given both Electro Ball export names, when calculating power, then they match", () => {
    // Source: Showdown data/moves.ts -- floor(300 / 100) = 3, so Electro Ball returns 120.
    expect(getElectroBallPower(300, 100)).toBe(120);
    expect(getElectroBallPower(300, 100)).toBe(getElectroBallBP(300, 100));
  });
});

// ===========================================================================
// Gyro Ball
// ===========================================================================

describe("Gyro Ball", () => {
  it("given target 200 speed and user 50 speed, when calculating Gyro Ball BP, then returns 101", () => {
    // Source: Showdown data/moves.ts -- gyroball:
    //   power = floor(25 * 200 / 50) + 1 = floor(100) + 1 = 101
    expect(getGyroBallBP(50, 200)).toBe(101);
  });

  it("given target 400 speed and user 50 speed, when calculating Gyro Ball BP, then returns 150 (capped)", () => {
    // Source: Showdown data/moves.ts -- gyroball:
    //   power = floor(25 * 400 / 50) + 1 = floor(200) + 1 = 201 -> capped at 150
    expect(getGyroBallBP(50, 400)).toBe(150);
  });

  it("given target and user same speed, when calculating Gyro Ball BP, then returns 26", () => {
    // Source: Showdown data/moves.ts -- gyroball:
    //   power = floor(25 * 100 / 100) + 1 = 25 + 1 = 26
    expect(getGyroBallBP(100, 100)).toBe(26);
  });

  it("given user speed is 0, when calculating Gyro Ball BP, then returns 1 (edge case)", () => {
    // Source: Showdown data/moves.ts -- division by zero guard
    expect(getGyroBallBP(0, 100)).toBe(1);
  });

  it("given both Gyro Ball export names, when calculating power, then they match", () => {
    // Source: Showdown data/moves.ts -- floor(25 * 200 / 50) + 1 = 101 for Gyro Ball.
    expect(getGyroBallPower(50, 200)).toBe(101);
    expect(getGyroBallPower(50, 200)).toBe(getGyroBallBP(50, 200));
  });
});

// ===========================================================================
// Heat Crash / Heavy Slam
// ===========================================================================

describe("Heat Crash / Heavy Slam", () => {
  it("given user 5x heavier than target, when calculating weight-based BP, then returns 120", () => {
    // Source: Showdown data/moves.ts -- heatcrash/heavyslam:
    //   pokemonWeight >= targetWeight * 5 -> 120
    expect(getWeightBasedBP(500, 100)).toBe(120);
  });

  it("given user 4x heavier but less than 5x, when calculating weight-based BP, then returns 100", () => {
    // Source: Showdown data/moves.ts -- pokemonWeight >= targetWeight * 4 -> 100
    expect(getWeightBasedBP(400, 100)).toBe(100);
  });

  it("given user 3x heavier but less than 4x, when calculating weight-based BP, then returns 80", () => {
    // Source: Showdown data/moves.ts -- pokemonWeight >= targetWeight * 3 -> 80
    expect(getWeightBasedBP(300, 100)).toBe(80);
  });

  it("given user 2x heavier but less than 3x, when calculating weight-based BP, then returns 60", () => {
    // Source: Showdown data/moves.ts -- pokemonWeight >= targetWeight * 2 -> 60
    expect(getWeightBasedBP(200, 100)).toBe(60);
  });

  it("given user less than 2x heavier, when calculating weight-based BP, then returns 40", () => {
    // Source: Showdown data/moves.ts -- else -> 40
    expect(getWeightBasedBP(150, 100)).toBe(40);
  });

  it("given target weight is 0, when calculating weight-based BP, then returns 120 (edge case)", () => {
    // Source: Showdown -- 0 weight target would make all ratios true; return maximum
    expect(getWeightBasedBP(100, 0)).toBe(120);
  });

  it("given both weight-based export names, when calculating power, then they match", () => {
    // Source: Showdown data/moves.ts -- 4x weight yields 100 BP for Heat Crash / Heavy Slam.
    expect(getWeightBasedPower(400, 100)).toBe(100);
    expect(getWeightBasedPower(400, 100)).toBe(getWeightBasedBP(400, 100));
  });
});

// ===========================================================================
// Retaliate
// ===========================================================================

describe("Retaliate", () => {
  it("given an ally fainted last turn, when calculating Retaliate BP, then returns 140", () => {
    // Source: Showdown data/moves.ts -- retaliate:
    //   onBasePower: if (pokemon.side.faintedLastTurn) return this.chainModify(2);
    //   70 * 2 = 140
    expect(getRetaliateBP(true)).toBe(140);
  });

  it("given no ally fainted last turn, when calculating Retaliate BP, then returns 70", () => {
    // Source: Showdown data/moves.ts -- retaliate: basePower: 70 (no doubling)
    expect(getRetaliateBP(false)).toBe(70);
  });

  it("given both Retaliate export names, when calculating power, then they match", () => {
    // Source: Showdown data/moves.ts -- Retaliate doubles from 70 to 140 after an ally faint.
    expect(getRetaliatePower(true)).toBe(140);
    expect(getRetaliatePower(true)).toBe(getRetaliateBP(true));
    expect(getRetaliatePower(false)).toBe(getRetaliateBP(false));
  });
});

// ===========================================================================
// didAllyFaintLastTurn helper
// ===========================================================================

describe("didAllyFaintLastTurn", () => {
  it("given a faint event on the attacker's side in the last turn, then returns true", () => {
    // Source: Showdown data/moves.ts -- retaliate checks side.faintedLastTurn
    const attacker = makeScenarioActive({});
    const sides = [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [attacker],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 1,
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
    ];

    const state = createBattleState({
      sides,
      turnHistory: [
        {
          turn: 1,
          actions: [],
          events: [{ type: "faint", side: 0, pokemon: GEN5_SPECIES_IDS.bulbasaur }],
        },
      ],
    });

    expect(didAllyFaintLastTurn(state, attacker)).toBe(true);
  });

  it("given no faint events in the last turn, then returns false", () => {
    // Source: Showdown -- no faint last turn means Retaliate stays at base power
    const attacker = makeScenarioActive({});
    const sides = [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [attacker],
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
    ];

    const state = createBattleState({
      sides,
      turnHistory: [
        {
          turn: 1,
          actions: [],
          events: [{ type: "damage", side: 0, pokemon: GEN5_SPECIES_IDS.bulbasaur }],
        },
      ],
    });

    expect(didAllyFaintLastTurn(state, attacker)).toBe(false);
  });

  it("given a faint event on the opponent's side (not attacker's), then returns false", () => {
    // Source: Showdown -- Retaliate only checks the user's own side
    const attacker = makeScenarioActive({});
    const sides = [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [attacker],
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
        faintCount: 1,
        gimmickUsed: false,
      },
    ];

    const state = createBattleState({
      sides,
      turnHistory: [
        {
          turn: 1,
          actions: [],
          events: [{ type: "faint", side: 1, pokemon: GEN5_SPECIES_IDS.charmander }],
        },
      ],
    });

    expect(didAllyFaintLastTurn(state, attacker)).toBe(false);
  });
});

// ===========================================================================
// Smack Down
// ===========================================================================

describe("Smack Down", () => {
  it("given Smack Down hits, when executed, then inflicts smackdown volatile on defender", () => {
    // Source: Showdown data/moves.ts -- smackdown: volatileStatus: 'smackdown'
    const ctx = makeContext({
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.smackDown, type: CORE_TYPE_IDS.rock, power: 50 }),
      damage: 25,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe(CORE_VOLATILE_IDS.smackDown);
  });

  it("given Smack Down, when executed against a flying target, then message says target fell", () => {
    // Source: Showdown data/moves.ts -- smackdown condition onStart message
    const defender = makeScenarioActive({
      nickname: "Skarmory",
      speciesId: GEN5_SPECIES_IDS.skarmory,
      types: [CORE_TYPE_IDS.steel, CORE_TYPE_IDS.flying],
    });
    const ctx = makeContext({
      defender,
      move: makeScenarioMove({ id: GEN5_MOVE_IDS.smackDown, type: CORE_TYPE_IDS.rock, power: 50 }),
      damage: 20,
    });

    const result = handleGen5CombatMove(ctx);

    // Derived from the move id: Gen 5 Smack Down applies the `smackdown` volatile.
    const expectedVolatile = CORE_VOLATILE_IDS.smackDown;
    expect(result).toEqual({
      ...EMPTY_COMBAT_RESULT,
      volatileInflicted: expectedVolatile,
      messages: [`${defender.pokemon.nickname} fell straight down!`],
    });
  });
});

// ===========================================================================
// Low Sweep
// ===========================================================================

describe("Low Sweep", () => {
  it("given Low Sweep hits, when executed, then lowers target Speed by 1", () => {
    // Source: Showdown data/moves.ts -- lowsweep:
    //   secondary: { chance: 100, boosts: { spe: -1 } }
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.lowSweep,
        type: CORE_TYPE_IDS.fighting,
        power: 65,
      }),
      damage: 30,
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([{ target: "defender", stat: "speed", stages: -1 }]);
  });

  it("given Low Sweep, when executed, then no attacker stat changes occur", () => {
    // Source: Showdown -- Low Sweep only affects defender's Speed
    const ctx = makeContext({
      move: makeScenarioMove({
        id: GEN5_MOVE_IDS.lowSweep,
        type: CORE_TYPE_IDS.fighting,
        power: 65,
      }),
    });

    const result = handleGen5CombatMove(ctx);

    expect(result).not.toBeNull();
    const attackerChanges = result!.statChanges.filter((c) => c.target === "attacker");
    expect(attackerChanges).toEqual([]);
  });
});

// ===========================================================================
// Storm Throw / Frost Breath (always crit)
// ===========================================================================

describe("Storm Throw / Frost Breath", () => {
  it("given Storm Throw, when handled by combat move handler, then returns null (willCrit is in move data / crit calc)", () => {
    // Source: Showdown data/moves.ts -- stormthrow: willCrit: true
    // The always-crit behavior is handled by the crit calculation, not the effect handler.
    const move = makeScenarioMove({
      id: GEN5_MOVE_IDS.stormThrow,
      type: CORE_TYPE_IDS.fighting,
      power: 60,
    });
    const ctx = makeContext({ move });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.move.id).toBe(move.id);
    expect(ctx.defender.pokemon.currentHp).toBe(DEFAULT_TEST_HP);
  });

  it("given Frost Breath, when handled by combat move handler, then returns null (willCrit is in move data / crit calc)", () => {
    // Source: Showdown data/moves.ts -- frostbreath: willCrit: true
    const move = makeScenarioMove({
      id: GEN5_MOVE_IDS.frostBreath,
      type: CORE_TYPE_IDS.ice,
      power: 60,
    });
    const ctx = makeContext({ move });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.move.id).toBe(move.id);
    expect(ctx.attacker.volatileStatuses.size).toBe(0);
  });
});

// ===========================================================================
// Unrecognized moves return null
// ===========================================================================

describe("Unrecognized moves", () => {
  it("given a move not handled by this module, when called, then returns null", () => {
    const move = makeScenarioMove({ id: GEN5_MOVE_IDS.tackle });
    const ctx = makeContext({ move });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.move.id).toBe(move.id);
    expect(ctx.defender.volatileStatuses.size).toBe(0);
  });

  it("given Thunderbolt (no special Gen 5 combat effect), when called, then returns null", () => {
    const move = makeScenarioMove({
      id: GEN5_MOVE_IDS.thunderbolt,
      type: CORE_TYPE_IDS.electric,
      power: 90,
    });
    const ctx = makeContext({ move });

    const result = handleGen5CombatMove(ctx);
    expect(result).toBeNull();
    expect(ctx.move.id).toBe(move.id);
    // Source: makeScenarioActive defaults current HP to the max-HP fixture value of 200.
    expect(ctx.attacker.pokemon.currentHp).toBe(DEFAULT_TEST_HP);
  });
});
