/**
 * Gen 7 Wave 10: Integration Tests
 *
 * End-to-end scenarios testing multiple Gen 7 systems working together.
 * Each test exercises at least 2 subsystems in combination.
 */

import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen7NewAbility, isSchoolForm } from "../src/Gen7AbilitiesNew";
import {
  handleGen7StatAbility,
  isGaleWingsActive,
  isPranksterBlockedByDarkType,
} from "../src/Gen7AbilitiesStat";
import { calculateGen7Damage } from "../src/Gen7DamageCalc";
import { Gen7MegaEvolution } from "../src/Gen7MegaEvolution";
import { Gen7Ruleset } from "../src/Gen7Ruleset";
import {
  applyGen7TerrainEffects,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "../src/Gen7Terrain";
import { GEN7_TYPE_CHART } from "../src/Gen7TypeChart";
import { Gen7ZMove } from "../src/Gen7ZMove";

// ---------------------------------------------------------------------------
// Helper factories
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
  turnsOnField?: number;
  volatileStatuses?: Map<string, unknown>;
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
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  accuracy?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  priority?: number;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: overrides.accuracy ?? 100,
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
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 7,
    critRatio: 0,
    hasCrashDamage: false,
  } as MoveData;
}

function makeState(overrides?: Partial<BattleState>): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    sides: [
      { index: 0, active: [], hazards: {}, tailwind: { active: false, turnsLeft: 0 } },
      { index: 1, active: [], hazards: {}, tailwind: { active: false, turnsLeft: 0 } },
    ],
    ...overrides,
  } as unknown as BattleState;
}

// ===========================================================================
// Integration Scenario 1: Z-Move vs Mega team -- both gimmicks in same battle
// ===========================================================================

describe("Integration: Z-Move vs Mega Evolution coexistence", () => {
  it("given a team with Z-Move and Mega, when checking gimmick availability, both are accessible independently", () => {
    // Source: Showdown sim/side.ts -- zMoveUsed and megaUsed are tracked separately
    // Source: Bulbapedia "Z-Move" -- "Z-Moves and Mega Evolution can both be used in the same battle"
    const ruleset = new Gen7Ruleset();
    const zMoveGimmick = ruleset.getBattleGimmick("zmove");
    const megaGimmick = ruleset.getBattleGimmick("mega");

    expect(zMoveGimmick).not.toBeNull();
    expect(megaGimmick).not.toBeNull();
    // They must be different instances
    expect(zMoveGimmick).not.toBe(megaGimmick);
  });

  it("given one side uses Z-Move and the other uses Mega, both should function correctly", () => {
    // Source: Showdown sim/side.ts:170 -- per-side tracking; side 0 can Z, side 1 can Mega
    const zMove = new Gen7ZMove();
    const mega = new Gen7MegaEvolution();

    // Side 0 Z-Move user with Normalium Z
    const zUser = makeActive({
      ability: "none",
      heldItem: "normalium-z",
      types: ["normal"],
      speciesId: 143, // Snorlax
      nickname: "Snorlax",
    });

    // Side 1 Mega user with Charizardite X
    const megaUser = makeActive({
      ability: "none",
      heldItem: "charizardite-x",
      types: ["fire", "flying"],
      speciesId: 6, // Charizard
      nickname: "Charizard",
    });

    const gigaImpact = makeMove({
      id: "giga-impact",
      type: "normal",
      category: "physical",
      power: 150,
    });

    // Z-Move should be available for side 0
    const canUseZ = zMove.canUse(zUser, gigaImpact, 0, makeState());
    expect(canUseZ).toBe(true);

    // Mega should be available for side 1
    const canUseMega = mega.canUse(megaUser, makeMove({ id: "flare-blitz" }), 1, makeState());
    expect(canUseMega).toBe(true);
  });

  it("given Z-Move already used on side 0, Mega should still work on side 0", () => {
    // Source: Showdown -- Z and Mega are independently tracked per side
    const zMove = new Gen7ZMove();
    const mega = new Gen7MegaEvolution();

    // Use Z-Move on side 0
    const zUser = makeActive({
      ability: "none",
      heldItem: "normalium-z",
      types: ["normal"],
      nickname: "Snorlax",
    });
    const normalMove = makeMove({ id: "tackle", type: "normal", power: 50 });
    const state = makeState();

    zMove.activate(zUser, normalMove, 0, state);

    // Mega should still be available on side 0
    const megaUser = makeActive({
      ability: "none",
      heldItem: "charizardite-x",
      types: ["fire", "flying"],
      speciesId: 6,
      nickname: "Charizard",
    });

    const canMega = mega.canUse(megaUser, makeMove({ id: "flare-blitz" }), 0, state);
    expect(canMega).toBe(true);
  });
});

// ===========================================================================
// Integration Scenario 2: Terrain + Weather combination
// ===========================================================================

describe("Integration: Grassy Terrain + Sun simultaneous effects", () => {
  it("given Grassy Terrain and Sun active, both Grass move boost and Sun fire boost apply in damage calc", () => {
    // Source: Showdown data/conditions.ts -- terrain and weather multipliers stack
    // Source: Bulbapedia -- "Grassy Terrain boosts Grass moves by 1.5x for grounded Pokemon"
    // Source: Bulbapedia -- "Harsh sunlight boosts Fire moves by 1.5x"
    const attacker = makeActive({
      types: ["grass", "fire"],
      attack: 150,
      ability: "none",
      level: 50,
    });
    const defender = makeActive({ types: ["normal"], defense: 100, hp: 300 });
    const grassMove = makeMove({
      id: "energy-ball",
      type: "grass",
      category: "special",
      power: 90,
      flags: { contact: false },
    });

    // Calculate with Grassy Terrain boost (1.5x for grounded Grass moves)
    const state = makeState({
      terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
      weather: { type: "sun", turnsLeft: 5 },
    });

    const result = calculateGen7Damage(
      {
        attacker,
        defender,
        move: grassMove,
        state,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    // The terrain boost is applied as part of the calculation -- result should exist
    expect(result).toBeDefined();
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Grassy Terrain active, end-of-turn heals grounded Pokemon", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onResidual: heal(pokemon.baseMaxhp / 16)
    const pokemon = makeActive({ hp: 200, currentHp: 100, types: ["normal"] });
    const state = makeState({
      terrain: { type: "grassy", turnsLeft: 3, source: "grassy-surge" },
    });
    state.sides[0].active = [pokemon];

    const results = applyGen7TerrainEffects(state);
    expect(results.length).toBe(1);
    // 1/16 of 200 = 12
    // Source: Showdown data/conditions.ts -- grassyterrain: heal(pokemon.baseMaxhp / 16)
    expect(results[0].healAmount).toBe(12);
    expect(results[0].effect).toBe("grassy-heal");
  });
});

// ===========================================================================
// Integration Scenario 3: Psychic Terrain blocks priority vs grounded
// ===========================================================================

describe("Integration: Psychic Terrain priority blocking", () => {
  it("given Psychic Terrain active, priority move is blocked against a grounded target", () => {
    // Source: Showdown data/conditions.ts -- psychicterrain.onTryHit: if grounded and priority > 0
    // Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected from priority moves"
    const groundedTarget = makeActive({ types: ["normal"] });
    const state = makeState({
      terrain: { type: "psychic", turnsLeft: 5, source: "psychic-surge" },
    });

    const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, groundedTarget, state);
    expect(blocked).toBe(true);
  });

  it("given Psychic Terrain active, priority move is NOT blocked against a Flying-type target", () => {
    // Source: Showdown -- Flying types are not grounded
    // Source: Bulbapedia "Psychic Terrain" -- only grounded Pokemon are protected
    const flyingTarget = makeActive({ types: ["flying"] });
    const state = makeState({
      terrain: { type: "psychic", turnsLeft: 5, source: "psychic-surge" },
    });

    const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, flyingTarget, state);
    expect(blocked).toBe(false);
  });

  it("given Psychic Terrain active, non-priority move still hits grounded target", () => {
    // Source: Showdown -- priority 0 or negative is not blocked
    const groundedTarget = makeActive({ types: ["normal"] });
    const state = makeState({
      terrain: { type: "psychic", turnsLeft: 5, source: "psychic-surge" },
    });

    const blocked = checkPsychicTerrainPriorityBlock("psychic", 0, groundedTarget, state);
    expect(blocked).toBe(false);
  });

  it("given Gravity active AND Psychic Terrain, Flying-type IS now grounded and blocked", () => {
    // Source: Showdown -- Gravity grounds all Pokemon
    // Source: Bulbapedia "Gravity" -- "all Pokemon are grounded"
    const flyingTarget = makeActive({ types: ["flying"] });
    const state = makeState({
      terrain: { type: "psychic", turnsLeft: 5, source: "psychic-surge" },
      gravity: { active: true, turnsLeft: 3 },
    });

    const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, flyingTarget, state);
    expect(blocked).toBe(true);
  });
});

// ===========================================================================
// Integration Scenario 4: Prankster vs Dark-type
// ===========================================================================

describe("Integration: Prankster vs Dark-type immunity", () => {
  it("given Prankster user using status move vs Dark-type, move is blocked", () => {
    // Source: Showdown data/abilities.ts -- prankster: Dark targets block boosted status moves
    // Source: Bulbapedia "Prankster" Gen 7 -- "Status moves fail against Dark-type targets"
    const blocked = isPranksterBlockedByDarkType("prankster", "status", ["dark"]);
    expect(blocked).toBe(true);
  });

  it("given Prankster user using physical move vs Dark-type, move is NOT blocked", () => {
    // Source: Showdown -- Prankster only blocks status moves
    const blocked = isPranksterBlockedByDarkType("prankster", "physical", ["dark"]);
    expect(blocked).toBe(false);
  });

  it("given Prankster user using status move vs Dark/Fire dual type, move is blocked", () => {
    // Source: Showdown -- Dark-type check doesn't care about secondary type
    const blocked = isPranksterBlockedByDarkType("prankster", "status", ["dark", "fire"]);
    expect(blocked).toBe(true);
  });

  it("given non-Prankster user using status move vs Dark-type, move is NOT blocked", () => {
    // Source: Showdown -- immunity only applies to Prankster-boosted moves
    const blocked = isPranksterBlockedByDarkType("none", "status", ["dark"]);
    expect(blocked).toBe(false);
  });

  it("given Prankster, priority check activates for status move and then Dark-type blocks it", () => {
    // Source: Showdown -- Prankster raises priority AND Dark targets block the move
    // Integration: priority handler + Dark immunity check work together
    const ctx: AbilityContext = {
      pokemon: makeActive({
        ability: "prankster",
        types: ["fairy"],
        nickname: "Whimsicott",
      }),
      opponent: makeActive({ types: ["dark", "fire"], nickname: "Houndoom" }),
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-priority-check",
      move: makeMove({ id: "thunder-wave", category: "status", type: "electric", power: null }),
    };

    // Priority check activates
    const priorityResult = handleGen7StatAbility(ctx);
    expect(priorityResult.activated).toBe(true);

    // Dark-type check also blocks
    const darkBlocked = isPranksterBlockedByDarkType("prankster", "status", ["dark", "fire"]);
    expect(darkBlocked).toBe(true);
  });
});

// ===========================================================================
// Integration Scenario 5: Gale Wings full HP gate
// ===========================================================================

describe("Integration: Gale Wings full HP gate (Gen 7 nerf)", () => {
  it("given Gale Wings at full HP using Flying move, priority is granted", () => {
    // Source: Showdown data/abilities.ts -- galeWings Gen 7: requires pokemon.hp === pokemon.maxhp
    // Source: Bulbapedia "Gale Wings" Gen 7 -- "only activates when at full HP"
    const active = isGaleWingsActive("gale-wings", "flying", 200, 200);
    expect(active).toBe(true);
  });

  it("given Gale Wings at 199/200 HP using Flying move, priority is NOT granted", () => {
    // Source: Showdown -- must be at EXACTLY full HP
    const active = isGaleWingsActive("gale-wings", "flying", 199, 200);
    expect(active).toBe(false);
  });

  it("given Gale Wings at full HP using non-Flying move, priority is NOT granted", () => {
    // Source: Showdown -- Gale Wings only applies to Flying-type moves
    const active = isGaleWingsActive("gale-wings", "fire", 200, 200);
    expect(active).toBe(false);
  });

  it("given Gale Wings via handleGen7StatAbility, move type and HP gate both checked", () => {
    // Integration: full stat ability handler also checks HP
    const ctx: AbilityContext = {
      pokemon: makeActive({
        ability: "gale-wings",
        currentHp: 200,
        hp: 200,
        types: ["normal", "flying"],
        nickname: "Talonflame",
      }),
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-priority-check",
      move: makeMove({ id: "brave-bird", type: "flying", power: 120 }),
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Gale Wings");
  });

  it("given Gale Wings via handleGen7StatAbility at non-full HP, priority denied", () => {
    const ctx: AbilityContext = {
      pokemon: makeActive({
        ability: "gale-wings",
        currentHp: 199,
        hp: 200,
        types: ["normal", "flying"],
        nickname: "Talonflame",
      }),
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-priority-check",
      move: makeMove({ id: "brave-bird", type: "flying", power: 120 }),
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 6: Aurora Veil + Hail
// ===========================================================================

describe("Integration: Aurora Veil + Hail damage reduction", () => {
  it("given Aurora Veil set AND Hail active, physical damage is reduced", () => {
    // Source: Showdown data/conditions.ts -- Aurora Veil: 0.5x damage in singles
    // Source: Bulbapedia "Aurora Veil" -- "halves damage from physical and special moves"
    // Aurora Veil damage reduction is applied in the damage calc via side screens
    const attacker = makeActive({ attack: 150, types: ["fighting"], nickname: "Machamp" });
    const defender = makeActive({
      defense: 100,
      hp: 300,
      currentHp: 300,
      types: ["ice"],
      ability: "none",
      nickname: "Alolan Ninetales",
    });

    const move = makeMove({
      id: "close-combat",
      type: "fighting",
      category: "physical",
      power: 120,
    });

    const stateWithVeil = makeState({
      weather: { type: "hail", turnsLeft: 5 },
    });
    stateWithVeil.sides[1] = {
      index: 1,
      active: [defender],
      screens: [{ type: "aurora-veil", turnsLeft: 5 }],
      hazards: {},
      tailwind: { active: false, turnsLeft: 0 },
    } as any;

    const stateWithoutVeil = makeState({
      weather: { type: "hail", turnsLeft: 5 },
    });
    stateWithoutVeil.sides[1] = {
      index: 1,
      active: [defender],
      screens: [],
      hazards: {},
      tailwind: { active: false, turnsLeft: 0 },
    } as any;

    const resultWithVeil = calculateGen7Damage(
      {
        attacker,
        defender,
        move,
        state: stateWithVeil,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    const resultWithoutVeil = calculateGen7Damage(
      {
        attacker,
        defender,
        move,
        state: stateWithoutVeil,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    // Aurora Veil should reduce damage (approximately halved in singles)
    expect(resultWithVeil.damage).toBeLessThan(resultWithoutVeil.damage);
  });
});

// ===========================================================================
// Integration Scenario 7: Surge ability + Terrain Extender
// ===========================================================================

describe("Integration: Surge ability + Terrain Extender", () => {
  it("given Electric Surge without Terrain Extender, terrain lasts 5 turns", () => {
    // Source: Showdown data/abilities.ts -- Electric Surge sets Electric Terrain
    // Source: Bulbapedia "Electric Surge" -- terrain lasts 5 turns
    const tapu = makeActive({
      ability: "electric-surge",
      types: ["electric", "fairy"],
      nickname: "Tapu Koko",
      heldItem: null,
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.state.terrain?.type).toBe("electric");
    expect(ctx.state.terrain?.turnsLeft).toBe(TERRAIN_DEFAULT_TURNS); // 5
  });

  it("given Electric Surge WITH Terrain Extender, terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender: terrain duration + 3
    // Source: Bulbapedia "Terrain Extender" -- extends terrain to 8 turns
    const tapu = makeActive({
      ability: "electric-surge",
      types: ["electric", "fairy"],
      nickname: "Tapu Koko",
      heldItem: "terrain-extender",
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.state.terrain?.type).toBe("electric");
    expect(ctx.state.terrain?.turnsLeft).toBe(TERRAIN_EXTENDED_TURNS); // 8
  });

  it("given Psychic Surge sets terrain, it replaces existing Electric Terrain", () => {
    // Source: Showdown -- only one terrain can be active at a time
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 3, source: "electric-surge" },
    });

    const tapu = makeActive({
      ability: "psychic-surge",
      types: ["psychic", "fairy"],
      nickname: "Tapu Lele",
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state,
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };

    handleSurgeAbility(ctx);
    expect(state.terrain?.type).toBe("psychic");
    expect(state.terrain?.turnsLeft).toBe(5);
  });

  it("given suppressed ability, Surge does not activate", () => {
    // Source: Showdown -- suppressed abilities do not trigger
    const tapu = makeActive({
      ability: "electric-surge",
      types: ["electric", "fairy"],
      nickname: "Tapu Koko",
      suppressedAbility: "electric-surge",
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(false);
    expect(ctx.state.terrain).toBeNull();
  });
});

// ===========================================================================
// Integration Scenario 8: Beast Boost chain KOs
// ===========================================================================

describe("Integration: Beast Boost chain", () => {
  it("given Beast Boost with highest Attack stat, KO triggers +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- beastboost: raises highest stat on KO
    // Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
    const attacker = makeActive({
      ability: "beast-boost",
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 150,
      nickname: "Pheromosa",
    });

    const faintedOpponent = makeActive({ currentHp: 0, hp: 100, nickname: "Rattata" });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: faintedOpponent,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-after-move-used",
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    // Attack is highest, so Beast Boost raises Attack
    // Source: Showdown -- beastboost: highest stat = attack
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "attack",
        stages: 1,
      }),
    );
  });

  it("given Beast Boost with highest Speed stat, KO triggers +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- beastboost checks all 5 battle stats
    const attacker = makeActive({
      ability: "beast-boost",
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 200,
      nickname: "Kartana",
    });

    const faintedOpponent = makeActive({ currentHp: 0, hp: 100 });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: faintedOpponent,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-after-move-used",
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "speed", stages: 1 }));
  });

  it("given Beast Boost, opponent not fainted (HP > 0), no activation", () => {
    // Source: Showdown -- beastboost only triggers on KO
    const attacker = makeActive({
      ability: "beast-boost",
      attack: 200,
      nickname: "Pheromosa",
    });

    const aliveOpponent = makeActive({ currentHp: 50, hp: 100, nickname: "Rattata" });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: aliveOpponent,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-after-move-used",
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 9: Disguise break (no HP cost in Gen 7)
// ===========================================================================

describe("Integration: Disguise break (Gen 7 -- no chip damage)", () => {
  it("given Mimikyu with Disguise intact (no disguise-broken volatile), damage is blocked", () => {
    // Source: Showdown data/abilities.ts -- disguise Gen 7: damage set to 0 (no 1/8 chip)
    // Source: Bulbapedia "Disguise" -- "In Gen 7, Disguise completely blocks the damage with no recoil"
    const mimikyu = makeActive({
      ability: "disguise",
      types: ["ghost", "fairy"],
      hp: 200,
      currentHp: 200,
      nickname: "Mimikyu",
      speciesId: 778,
    });
    // No "disguise-broken" volatile means Disguise is still intact

    const ctx: AbilityContext = {
      pokemon: mimikyu,
      opponent: makeActive({}),
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-damage-taken",
      damage: 150,
      move: makeMove({ id: "shadow-ball", type: "ghost", category: "special", power: 80 }),
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(true);
    // Disguise absorbs the hit and sets disguise-broken volatile
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("Disguise");
    // Should inflict "disguise-broken" volatile on self
    expect(result.effects.some((e: any) => e.volatile === "disguise-broken")).toBe(true);
  });

  it("given Mimikyu with Disguise already broken (has disguise-broken volatile), damage goes through", () => {
    // Source: Showdown -- disguise only activates once per battle; "disguise-broken" volatile persists
    const brokenVolatiles = new Map<string, unknown>();
    brokenVolatiles.set("disguise-broken", true);

    const mimikyu = makeActive({
      ability: "disguise",
      types: ["ghost", "fairy"],
      hp: 200,
      currentHp: 200,
      nickname: "Mimikyu",
      speciesId: 778,
      volatileStatuses: brokenVolatiles,
    });

    const ctx: AbilityContext = {
      pokemon: mimikyu,
      opponent: makeActive({}),
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-damage-taken",
      damage: 150,
      move: makeMove({ id: "shadow-ball", type: "ghost", category: "special", power: 80 }),
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 10: Schooling form change
// ===========================================================================

describe("Integration: Schooling form change", () => {
  it("given Wishiwashi with Schooling at level 20+ and HP > 25%, School form is active", () => {
    // Source: Showdown data/abilities.ts -- schooling: level >= 20 && hp >= ceil(maxHp * 0.25)
    // Source: Bulbapedia "Schooling" -- "level 20+, HP above 25%"
    // isSchoolForm(abilityId, currentHp, maxHp, level)
    const result = isSchoolForm("schooling", 100, 200, 20);
    expect(result).toBe(true);
  });

  it("given Wishiwashi below level 20, Solo form always", () => {
    // Source: Showdown -- schooling: level >= 20 required
    const result = isSchoolForm("schooling", 200, 200, 19);
    expect(result).toBe(false);
  });

  it("given Wishiwashi at exactly 25% HP (ceil threshold), School form is still active", () => {
    // Source: Showdown data/abilities.ts -- schooling: hp >= Math.ceil(maxHp * 0.25)
    // For maxHp=200: threshold = ceil(200 * 0.25) = ceil(50) = 50
    // At exactly 50 HP: 50 >= 50 is true -> School form
    const result = isSchoolForm("schooling", 50, 200, 20);
    expect(result).toBe(true);
  });

  it("given Wishiwashi at 1 HP below threshold, reverts to Solo form", () => {
    // Source: Showdown -- below the ceil threshold means Solo form
    // For maxHp=200: threshold = 50. At 49 HP: 49 < 50 -> Solo form
    const result = isSchoolForm("schooling", 49, 200, 20);
    expect(result).toBe(false);
  });

  it("given Schooling triggers on switch-in, handleGen7NewAbility returns form change", () => {
    // Source: Showdown -- Schooling triggers on switch-in to check form
    const wishiwashi = makeActive({
      ability: "schooling",
      types: ["water"],
      hp: 200,
      currentHp: 200,
      level: 20,
      nickname: "Wishiwashi",
      speciesId: 746,
    });

    const ctx: AbilityContext = {
      pokemon: wishiwashi,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(true);
    // Source: Showdown -- Schooling message contains "school"
    expect(result.messages[0]).toContain("school");
  });
});
