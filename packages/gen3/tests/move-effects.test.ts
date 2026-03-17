import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { canInflictGen3Status, Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";

/**
 * Gen 3 Move Effects Tests
 *
 * Tests for executeMoveEffect: weather, hazards, status infliction with immunity,
 * stat changes, recoil, drain, heal, protect, rapid spin, knock off, and custom effects.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
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
  level?: number;
  statStages?: Partial<Record<string, number>>;
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
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 200,
    moves: [],
    ability: "",
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
    ability: "",
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

function _createMove(id: string, overrides?: Partial<MoveData>): MoveData {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 executeMoveEffect — Weather", () => {
  it("given Rain Dance used, when executeMoveEffect called, then weatherSet = { weather: 'rain', turns: 5 }", () => {
    // Source: pret/pokeemerald — Rain Dance sets 5-turn rain
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("rain-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "rain", turns: 5, source: "rain-dance" });
  });

  it("given Sunny Day used, when executeMoveEffect called, then weatherSet = { weather: 'sun', turns: 5 }", () => {
    // Source: pret/pokeemerald — Sunny Day sets 5-turn sun
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("sunny-day");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "sun", turns: 5, source: "sunny-day" });
  });

  it("given Sandstorm used, when executeMoveEffect called, then weatherSet = { weather: 'sand', turns: 5 }", () => {
    // Source: pret/pokeemerald — Sandstorm sets 5-turn sandstorm
    const attacker = createActivePokemon({ types: ["rock"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("sandstorm");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "sand", turns: 5, source: "sandstorm" });
  });

  it("given Hail used, when executeMoveEffect called, then weatherSet = { weather: 'hail', turns: 5 }", () => {
    // Source: pret/pokeemerald — Hail sets 5-turn hail
    const attacker = createActivePokemon({ types: ["ice"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("hail");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: "hail", turns: 5, source: "hail" });
  });
});

describe("Gen 3 executeMoveEffect — Entry Hazards", () => {
  it("given Spikes used, when executeMoveEffect called, then hazardSet targets opponent's side", () => {
    // Source: pret/pokeemerald — Spikes placed on foe's side
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("spikes");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: "spikes", targetSide: 1 });
  });
});

describe("Gen 3 executeMoveEffect — Rapid Spin", () => {
  it("given Rapid Spin used, when executeMoveEffect called, then clearSideHazards = 'attacker' and volatiles cleared", () => {
    // Source: pret/pokeemerald — Rapid Spin clears Spikes, Leech Seed, and binding
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

describe("Gen 3 executeMoveEffect — Protect/Detect", () => {
  it("given Protect used, when executeMoveEffect called, then volatileInflicted = 'protect'", () => {
    // Source: pret/pokeemerald — Protect sets PROTECTED volatile status
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("protect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("protect");
  });

  it("given Detect used, when executeMoveEffect called, then volatileInflicted = 'protect'", () => {
    // Source: pret/pokeemerald — Detect has same effect as Protect
    const attacker = createActivePokemon({ types: ["fighting"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("detect");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("protect");
  });
});

describe("Gen 3 executeMoveEffect — Knock Off", () => {
  it("given Knock Off vs Pokemon with item, when executeMoveEffect called, then item is removed", () => {
    // Source: pret/pokeemerald — Knock Off removes defender's held item, no damage boost in Gen 3
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
    // Source: pret/pokeemerald — Knock Off has no secondary effect if target has no item
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: null });
    const move = dataManager.getMove("knock-off");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages.length).toBe(0);
  });
});

describe("Gen 3 executeMoveEffect — Status Infliction", () => {
  it("given Flamethrower (10% burn chance) and roll succeeds, when executeMoveEffect called, then statusInflicted = 'burn'", () => {
    // Source: pret/pokeemerald — Flamethrower has 10% secondary burn chance
    // 10% → effectChance = floor(10 * 255 / 100) = 25
    // rng.int(0,255) returns 0 → 0 < 25 → success
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(0); // intReturn=0, always succeeds the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("burn");
  });

  it("given Flamethrower (10% burn chance) and roll fails, when executeMoveEffect called, then statusInflicted = null", () => {
    // 10% → effectChance = 25; rng.int(0,255) returns 200 → 200 < 25 = false → miss
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(200); // intReturn=200, fails the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given Fire-type defender, when Flamethrower burn chance succeeds, then burn NOT inflicted (type immunity)", () => {
    // Source: pret/pokeemerald — Fire types are immune to burn
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["fire"] });
    const move = dataManager.getMove("flamethrower");
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given Electric-type defender, when Thunderbolt paralysis chance succeeds, then paralysis NOT inflicted (Gen 3 type immunity)", () => {
    // Source: pret/pokeemerald — Electric types are immune to paralysis in Gen 3+
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({ types: ["electric"] });
    const move = dataManager.getMove("thunderbolt");
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given Toxic used on non-immune target, when executeMoveEffect called, then statusInflicted = 'badly-poisoned'", () => {
    // Source: pret/pokeemerald — Toxic is guaranteed badly-poisoned
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("toxic");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe("badly-poisoned");
  });

  it("given Toxic used on Steel-type, when executeMoveEffect called, then statusInflicted = null (type immunity)", () => {
    // Source: pret/pokeemerald — Steel types are immune to poison
    const attacker = createActivePokemon({ types: ["poison"] });
    const defender = createActivePokemon({ types: ["steel"] });
    const move = dataManager.getMove("toxic");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });

  it("given defender already has a status, when status-guaranteed move used, then no new status inflicted", () => {
    // Source: pret/pokeemerald — can't have two primary statuses
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({ types: ["normal"], status: "burn" });
    const move = dataManager.getMove("thunder-wave");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });
});

describe("Gen 3 executeMoveEffect — Stat Changes", () => {
  it("given Swords Dance used, when executeMoveEffect called, then stat +2 attack for attacker", () => {
    // Source: pret/pokeemerald — Swords Dance raises Attack by 2 stages
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("swords-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "attack", stages: 2 }]);
  });

  it("given Dragon Dance used, when executeMoveEffect called, then +1 attack and +1 speed for attacker", () => {
    // Source: pret/pokeemerald — Dragon Dance raises Attack and Speed by 1 each
    const attacker = createActivePokemon({ types: ["dragon"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("dragon-dance");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });

  it("given Overheat used, when executeMoveEffect called, then -2 spAttack for attacker", () => {
    // Source: pret/pokeemerald — Overheat lowers SpAtk by 2 stages on the user
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("overheat");
    // Overheat has chance: 100 but is a special move (not status)
    // effectChance = floor(100 * 255 / 100) = 255; rng.int(0,255) returns 0 → 0 < 255 → success
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 120, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "spAttack", stages: -2 }]);
  });

  it("given Shadow Ball (20% SpDef drop), when roll fails, then no stat change applied", () => {
    // Shadow Ball has 20% chance → effectChance = floor(20*255/100) = 51
    // rng.int(0,255) returns 200 → 200 < 51 = false → miss
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("shadow-ball");
    const rng = createMockRng(200);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([]);
  });
});

describe("Gen 3 executeMoveEffect — No Secondary Effect", () => {
  it("given Earthquake (no secondary), when executeMoveEffect called, then no effects applied", () => {
    // Source: pret/pokeemerald — Earthquake has no secondary effect
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("earthquake");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
    expect(result.recoilDamage).toBe(0);
    expect(result.healAmount).toBe(0);
  });
});

describe("Gen 3 executeMoveEffect — Recoil and Drain", () => {
  it("given Double-Edge (1/3 recoil), when executeMoveEffect called, then recoilDamage = floor(damage/3)", () => {
    // Source: pret/pokeemerald — Double-Edge has 1/3 recoil of damage dealt
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("double-edge");
    const rng = createMockRng(0);
    // 99 damage dealt; recoil = floor(99 * 1/3) = floor(33) = 33
    const context = createContext(attacker, defender, move, 99, rng);

    const result = ruleset.executeMoveEffect(context);

    // Source: floor(99 * 0.333...) = 33
    expect(result.recoilDamage).toBe(33);
  });

  it("given Giga Drain (50% drain), when executeMoveEffect called, then healAmount = floor(damage/2)", () => {
    // Source: pret/pokeemerald — Giga Drain heals 50% of damage dealt
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("giga-drain");
    const rng = createMockRng(0);
    // 60 damage dealt; heal = floor(60 * 0.5) = 30
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    // Source: floor(60 * 0.5) = 30
    expect(result.healAmount).toBe(30);
  });

  it("given Recover used, when executeMoveEffect called, then healAmount = floor(maxHP/2)", () => {
    // Source: pret/pokeemerald — Recover heals 50% of max HP
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("recover");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHP = 200 (from mock), heal = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
  });
});

describe("Gen 3 executeMoveEffect — Explosion/Self-Destruct", () => {
  it("given Explosion used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: pret/pokeemerald — Explosion causes user to faint
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Golem" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("explosion");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Golem exploded!");
  });
});

describe("Gen 3 executeMoveEffect — Volatile Status", () => {
  it("given Focus Energy used, when executeMoveEffect called, then volatileInflicted = 'focus-energy'", () => {
    // Source: pret/pokeemerald — Focus Energy sets focus-energy volatile
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("focus-energy");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("focus-energy");
  });
});

describe("Gen 3 executeMoveEffect — Baton Pass / Switch Out", () => {
  it("given Baton Pass used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: pret/pokeemerald — Baton Pass switches out user
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("baton-pass");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

describe("Gen 3 canInflictGen3Status — Type Immunities", () => {
  it("given Fire-type defender, when checking burn infliction, then returns false", () => {
    // Source: pret/pokeemerald — Fire types are immune to burn
    const defender = createActivePokemon({ types: ["fire"] });
    expect(canInflictGen3Status("burn", defender)).toBe(false);
  });

  it("given Normal-type defender, when checking burn infliction, then returns true", () => {
    const defender = createActivePokemon({ types: ["normal"] });
    expect(canInflictGen3Status("burn", defender)).toBe(true);
  });

  it("given Ice-type defender, when checking freeze infliction, then returns false", () => {
    // Source: pret/pokeemerald — Ice types are immune to freeze
    const defender = createActivePokemon({ types: ["ice"] });
    expect(canInflictGen3Status("freeze", defender)).toBe(false);
  });

  it("given Electric-type defender, when checking paralysis infliction, then returns false (Gen 3 immunity)", () => {
    // Source: pret/pokeemerald — Electric types gained paralysis immunity in Gen 3
    const defender = createActivePokemon({ types: ["electric"] });
    expect(canInflictGen3Status("paralysis", defender)).toBe(false);
  });

  it("given Poison-type defender, when checking poison infliction, then returns false", () => {
    // Source: pret/pokeemerald — Poison types are immune to poison
    const defender = createActivePokemon({ types: ["poison"] });
    expect(canInflictGen3Status("poison", defender)).toBe(false);
  });

  it("given Steel-type defender, when checking badly-poisoned infliction, then returns false", () => {
    // Source: pret/pokeemerald — Steel types are immune to badly-poisoned
    const defender = createActivePokemon({ types: ["steel"] });
    expect(canInflictGen3Status("badly-poisoned", defender)).toBe(false);
  });

  it("given defender already has a status, when checking any status infliction, then returns false", () => {
    const defender = createActivePokemon({ types: ["normal"], status: "paralysis" });
    expect(canInflictGen3Status("burn", defender)).toBe(false);
  });

  it("given dual-type Fire/Steel defender, when checking burn, then returns false (Fire immunity)", () => {
    // Source: pret/pokeemerald — any matching type triggers immunity
    const defender = createActivePokemon({ types: ["fire", "steel"] });
    expect(canInflictGen3Status("burn", defender)).toBe(false);
  });
});

describe("Gen 3 executeMoveEffect — Pursuit", () => {
  it.todo(
    "Pursuit doubled damage on switch-out is handled at engine level, not in executeMoveEffect",
  );
});
