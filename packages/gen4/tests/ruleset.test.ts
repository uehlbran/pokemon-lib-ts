import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

/** Minimal PokemonInstance for mechanic tests. */
function makePokemonInstance(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed,
    },
  } as PokemonInstance;
}

/** Minimal ActivePokemon for mechanic tests. */
function makeActivePokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance(overrides),
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
    types: overrides.types ?? ["normal"],
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

/** Minimal BattleState stub — enough for applyStatusDamage and resolveTurnOrder. */
const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

describe("Gen4Ruleset identity", () => {
  it("given Gen4Ruleset, when accessing generation, then returns 4", () => {
    // Source: Gen 4 = Diamond / Pearl / Platinum / HeartGold / SoulSilver
    const ruleset = makeRuleset();
    expect(ruleset.generation).toBe(4);
  });

  it("given Gen4Ruleset, when accessing name, then contains 'Gen 4'", () => {
    // Source: naming convention for the library
    const ruleset = makeRuleset();
    expect(ruleset.name).toContain("Gen 4");
  });
});

// ---------------------------------------------------------------------------
// Available types
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getAvailableTypes", () => {
  it("given Gen4Ruleset, when getAvailableTypes, then returns exactly 17 types", () => {
    // Source: pret/pokeplatinum — 17 types (Normal through Steel; Fairy added in Gen 6)
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes().length).toBe(17);
  });

  it("given Gen4Ruleset, when getAvailableTypes, then Fairy is not present", () => {
    // Source: Fairy type introduced in Gen 6 (X/Y), not present in Gen 4
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes()).not.toContain("fairy");
  });
});

// ---------------------------------------------------------------------------
// Available hazards
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getAvailableHazards", () => {
  it("given Gen4Ruleset, when getAvailableHazards, then includes stealth-rock", () => {
    // Source: pret/pokeplatinum — Stealth Rock introduced in Gen 4 (Diamond/Pearl)
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).toContain("stealth-rock");
  });

  it("given Gen4Ruleset, when getAvailableHazards, then includes spikes", () => {
    // Source: pret/pokeplatinum — Spikes available since Gen 2
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).toContain("spikes");
  });

  it("given Gen4Ruleset, when getAvailableHazards, then includes toxic-spikes", () => {
    // Source: pret/pokeplatinum — Toxic Spikes introduced in Gen 4 (Diamond/Pearl)
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).toContain("toxic-spikes");
  });

  it("given Gen4Ruleset, when getAvailableHazards, then does NOT include sticky-web", () => {
    // Source: Sticky Web was introduced in Gen 6, not available in Gen 4
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).not.toContain("sticky-web");
  });
});

// ---------------------------------------------------------------------------
// Sleep turns (1-5 in Gen 4 international)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollSleepTurns", () => {
  it("given rollSleepTurns with seed 42, when called, then returns a value in range [1, 5]", () => {
    // Source: Bulbapedia — Sleep (status condition), international Gen 4: 1-5 turns
    // Source: specs/battle/05-gen4.md — "Duration: 1-5 turns (international Gen 4)"
    // Gen 3 was 2-5 turns; Gen 4 expanded range to 1-5 turns
    const ruleset = makeRuleset();
    const rng = new SeededRandom(42);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(5);
  });

  it("given rollSleepTurns called 1000 times, then always returns 1-5 and never 0 or 6+", () => {
    // Source: Bulbapedia — Gen 4 international sleep: 1-5 turns
    // Triangulation: 1000 iterations across different seeds exhausts the rng distribution
    const ruleset = makeRuleset();
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const turns = ruleset.rollSleepTurns(rng);
      if (turns < min) min = turns;
      if (turns > max) max = turns;
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(5);
    }

    // With 1000 seeds, we expect to see both the minimum (1) and maximum (5)
    expect(min).toBe(1);
    expect(max).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Burn damage (1/8 maxHP in Gen 3-6; Gen 7+ changed to 1/16)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyStatusDamage — burn", () => {
  it("given a Pokemon with 160 maxHP and burn status, when applyStatusDamage, then returns 20", () => {
    // Source: pret/pokeplatinum — burn tick = maxHP / 8
    // Source: specs/battle/05-gen4.md — "Burn damage is 1/8 max HP"
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 160, status: "burn" });
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP and burn status, when applyStatusDamage, then returns 25", () => {
    // Source: pret/pokeplatinum — burn tick = floor(maxHP / 8)
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, status: "burn" });
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(25);
  });

  it("given a Pokemon with 1 maxHP and burn status, when applyStatusDamage, then returns 1 (minimum)", () => {
    // Source: pret/pokeplatinum — damage always >= 1
    // Derivation: floor(1 / 8) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 1, status: "burn" });
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Poison damage (delegates to BaseRuleset: 1/8 maxHP)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyStatusDamage — poison", () => {
  it("given a Pokemon with 160 maxHP and poison status, when applyStatusDamage, then returns 20", () => {
    // Source: BaseRuleset — poison tick = floor(maxHP / 8) (same in Gen 3-6)
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 160, status: "poison" });
    expect(ruleset.applyStatusDamage(mon, "poison", STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP and poison status, when applyStatusDamage, then returns 25", () => {
    // Source: BaseRuleset — poison tick = floor(maxHP / 8)
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, status: "poison" });
    expect(ruleset.applyStatusDamage(mon, "poison", STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Multi-hit count (Gen 1-4 weighted distribution)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollMultiHitCount", () => {
  it("given rollMultiHitCount called 1000 times, then always returns 2, 3, 4, or 5", () => {
    // Source: pret/pokeplatinum — multi-hit uses same 8-entry lookup table as Gen 1-3
    // Distribution: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%)
    // Source: packages/core/src/logic/gen12-shared.ts gen14MultiHitRoll
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({});

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const count = ruleset.rollMultiHitCount(attacker, rng);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it("given rollMultiHitCount called 1000 times, then never returns 1 or 6+", () => {
    // Source: pret/pokeplatinum — gen14MultiHitRoll only produces 2, 3, 4, or 5
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({});

    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const count = ruleset.rollMultiHitCount(attacker, rng);
      expect(count).not.toBe(1);
      expect(count).not.toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Bind damage (1/16 maxHP in Gen 2-4; Gen 5+ uses 1/8)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset calculateBindDamage", () => {
  it("given a Pokemon with 200 maxHP, when calculateBindDamage, then returns 12", () => {
    // Source: Bulbapedia — Binding move damage is 1/16 in Gen 2-4
    // Source: pret/pokeplatinum — trap damage = maxHP / 16
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200 });
    expect(ruleset.calculateBindDamage(mon)).toBe(12);
  });

  it("given a Pokemon with 160 maxHP, when calculateBindDamage, then returns 10", () => {
    // Source: pret/pokeplatinum — trap damage = maxHP / 16
    // Derivation: floor(160 / 16) = 10
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 160 });
    expect(ruleset.calculateBindDamage(mon)).toBe(10);
  });

  it("given a Pokemon with 1 maxHP (Shedinja), when calculateBindDamage, then returns 1 (minimum)", () => {
    // Source: pret/pokeplatinum — damage always >= 1
    // Derivation: floor(1 / 16) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 1 });
    expect(ruleset.calculateBindDamage(mon)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Protect success rate
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollProtectSuccess", () => {
  it("given consecutiveProtects=0, when rollProtectSuccess, then always returns true", () => {
    // Source: pret/pokeplatinum battle_script.c:5351-5356 — sProtectSuccessRate[0] = 0xFFFF (100%)
    // First Protect always succeeds; no RNG roll needed
    const ruleset = makeRuleset();
    const rng = new SeededRandom(42);
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given consecutiveProtects=0 called 20 times, when rollProtectSuccess, then always returns true", () => {
    // Source: pret/pokeplatinum — 0 consecutive uses = guaranteed success (100%)
    // Triangulation: verify across multiple seeds
    const ruleset = makeRuleset();
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeededRandom(seed);
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given consecutiveProtects=3, when rollProtectSuccess with 10000 trials, then success rate is ~12.5%", () => {
    // Source: pret/pokeplatinum battle_script.c:5351-5356 — sProtectSuccessRate caps at index 3
    // sProtectSuccessRate = [0xFFFF, 0x7FFF, 0x3FFF, 0x1FFF]; index 3 (line 5405) = 12.5%
    // After 3+ consecutive uses, rate is fixed at 1/8 = 12.5%
    const ruleset = makeRuleset();
    let successes = 0;
    const trials = 10000;

    for (let seed = 1; seed <= trials; seed++) {
      const rng = new SeededRandom(seed);
      if (ruleset.rollProtectSuccess(3, rng)) {
        successes++;
      }
    }

    const rate = successes / trials;
    // Expected: 12.5% ± 2% tolerance for statistical variation
    expect(rate).toBeGreaterThan(0.105);
    expect(rate).toBeLessThan(0.145);
  });

  it("given consecutiveProtects=4 (beyond cap), when rollProtectSuccess, then capped same as 3 consecutive", () => {
    // Source: pret/pokeplatinum — counter caps at index 3 (min 12.5%); never reaches 1/256
    // Verify that 4+ consecutive uses does NOT further reduce the rate below 12.5%
    const ruleset = makeRuleset();
    let successes3 = 0;
    let successes4 = 0;
    const trials = 500;

    // Use same seeds for both to compare identically
    for (let seed = 1; seed <= trials; seed++) {
      const rng3 = new SeededRandom(seed);
      const rng4 = new SeededRandom(seed);
      if (ruleset.rollProtectSuccess(3, rng3)) successes3++;
      if (ruleset.rollProtectSuccess(4, rng4)) successes4++;
    }

    // Both should produce the same result (cap at 3)
    expect(successes3).toBe(successes4);
  });
});

// ---------------------------------------------------------------------------
// Paralysis speed penalty (0.25x in Gen 3-6; Gen 7+ uses 0.5x)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getEffectiveSpeed (via resolveTurnOrder)", () => {
  /**
   * Build a minimal BattleState with two sides for turn order tests.
   */
  function buildTwoSideState(
    side0Pokemon: ActivePokemon,
    side1Pokemon: ActivePokemon,
  ): BattleState {
    const makeSide = (index: 0 | 1, active: ActivePokemon) => ({
      index,
      trainer: null,
      team: [],
      active: [active],
      hazards: [],
      screens: [],
      tailwind: { active: false, turnsLeft: 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    });

    return {
      phase: "action-select",
      generation: 4,
      format: "singles",
      turnNumber: 1,
      sides: [makeSide(0, side0Pokemon), makeSide(1, side1Pokemon)],
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      turnHistory: [],
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
      ended: false,
      winner: null,
    } as unknown as BattleState;
  }

  it("given paralyzed Pokemon (100 speed) vs healthy Pokemon (50 speed), when turn order is resolved, then healthy moves first", () => {
    // Source: pret/pokeplatinum — paralyzed speed = floor(speed / 4) in Gen 3-6
    // Gen 7+ changed the penalty to 0.5x (BaseRuleset default)
    // Derivation: paralyzed effective speed = floor(100 * 0.25) = 25; healthy = 50
    // Result: healthy (50) > paralyzed (25), so healthy moves first
    const paralyzedMon = makeActivePokemon({ speed: 100, status: "paralysis" });
    const healthyMon = makeActivePokemon({ speed: 50, status: null });

    (paralyzedMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });
    (healthyMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });

    const state = buildTwoSideState(paralyzedMon, healthyMon);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 1 (healthy, 50 speed) should move before side 0 (paralyzed, 25 eff. speed)
    expect(ordered[0]).toEqual(actions[1]); // healthy moves first
    expect(ordered[1]).toEqual(actions[0]); // paralyzed moves second
  });

  it("given paralyzed Pokemon (100 speed) vs slow healthy Pokemon (20 speed), when turn order is resolved, then paralyzed moves first", () => {
    // Source: pret/pokeplatinum — paralyzed speed = floor(speed / 4) = floor(100 * 0.25) = 25
    // Derivation: paralyzed effective speed = 25; healthy slow mon = 20
    // Result: paralyzed (25) > slow healthy (20), so paralyzed moves first
    const paralyzedMon = makeActivePokemon({ speed: 100, status: "paralysis" });
    const slowMon = makeActivePokemon({ speed: 20, status: null });

    (paralyzedMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });
    (slowMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });

    const state = buildTwoSideState(paralyzedMon, slowMon);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 0 (paralyzed, 25 eff. speed) should move before side 1 (healthy slow, 20 speed)
    expect(ordered[0]).toEqual(actions[0]); // paralyzed moves first (still faster)
    expect(ordered[1]).toEqual(actions[1]); // slow mon moves second
  });
});

// ---------------------------------------------------------------------------
// EXP gain (classic formula: Gen 3-4)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset calculateExpGain", () => {
  it("given a wild level 50 Pokemon with Abra stats, when calculateExpGain, then returns classic formula result", () => {
    // Source: pret/pokeplatinum — same classic EXP formula as Gen 3 (no level scaling)
    // Classic formula: floor((b * L_d / 7) * (1 / s) * t)
    // Abra base EXP = 62 (verified via gen4 DataManager)
    // Wild: t = 1.0; s (participants) = 1
    // Result: floor((62 * 50 / 7) / 1 * 1.0) = floor(442.857...) = 442
    const ruleset = makeRuleset();
    const dm = createGen4DataManager();
    const abra = dm.getSpeciesByName("abra");
    const result = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });
    // Derivation: floor((abra.baseExp * 50 / 7) / 1 * 1.0)
    expect(result).toBe(Math.max(1, Math.floor(((abra.baseExp * 50) / 7 / 1) * 1.0)));
  });

  it("given a trainer battle level 30 Bulbasaur, when calculateExpGain, then trainer result exceeds wild result", () => {
    // Source: pret/pokeplatinum — trainer battles give 1.5x EXP (same as Gen 3)
    // Classic formula with t=1.5 for trainer battles vs t=1.0 for wild
    const ruleset = makeRuleset();
    const dm = createGen4DataManager();
    const bulbasaur = dm.getSpeciesByName("bulbasaur");

    const wildResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });
    const trainerResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: true,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    // Trainer battle gives more EXP than wild battle
    expect(trainerResult).toBeGreaterThan(wildResult);
    // Trainer result = floor(wild * 1.5) approximately
    expect(trainerResult).toBe(Math.max(1, Math.floor(((bulbasaur.baseExp * 30) / 7 / 1) * 1.5)));
  });
});

// ---------------------------------------------------------------------------
// hasHeldItems
// ---------------------------------------------------------------------------

describe("Gen4Ruleset hasHeldItems", () => {
  it("given Gen4Ruleset, when hasHeldItems, then returns true", () => {
    // Source: Gen 4 has full held item support (items modernized in Gen 3)
    const ruleset = makeRuleset();
    expect(ruleset.hasHeldItems()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEndOfTurnOrder
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getEndOfTurnOrder", () => {
  it("given Gen4Ruleset, when getEndOfTurnOrder, then returns array starting with weather-damage", () => {
    // Source: Showdown sim/battle.ts Gen 4 mod — weather chip is first EoT effect
    // Source: Bulbapedia — Diamond/Pearl/Platinum EoT order: weather damage is first
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe("weather-damage");
  });

  it("given Gen4Ruleset, when getEndOfTurnOrder, then returns all 34 Gen 4 EoT effects in correct order", () => {
    // Source: Showdown sim/battle.ts Gen 4 mod — full EoT ordering
    // Source: Bulbapedia — Diamond/Pearl/Platinum end-of-turn processing order
    // Key Gen 4 ordering: weather-damage first, toxic/flame orb after weather-countdown,
    // speed-boost and healing-items at end
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toEqual([
      "weather-damage",
      "future-attack",
      "wish",
      "weather-healing",
      "shed-skin",
      "leftovers",
      "black-sludge",
      "aqua-ring",
      "ingrain",
      "leech-seed",
      "poison-heal",
      "status-damage",
      "nightmare",
      "curse",
      "bad-dreams",
      "bind",
      "yawn-countdown",
      "encore-countdown",
      "taunt-countdown",
      "disable-countdown",
      "heal-block-countdown",
      "embargo-countdown",
      "magnet-rise-countdown",
      "perish-song",
      "screen-countdown",
      "safeguard-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
      "gravity-countdown",
      "weather-countdown",
      "toxic-orb-activation",
      "flame-orb-activation",
      "slow-start-countdown",
      "speed-boost",
      "healing-items",
    ]);
  });

  it("given Gen4Ruleset, when getEndOfTurnOrder, then poison-heal comes before status-damage", () => {
    // Source: Showdown Gen 4 mod — Poison Heal replaces poison tick (must process first)
    // Source: Bulbapedia — Poison Heal activates instead of taking poison damage
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    const poisonHealIndex = order.indexOf("poison-heal");
    const statusDamageIndex = order.indexOf("status-damage");
    expect(poisonHealIndex).toBeLessThan(statusDamageIndex);
  });
});

// ---------------------------------------------------------------------------
// applyHeldItem delegation
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyHeldItem", () => {
  it("given Gen4Ruleset with Leftovers context, when applyHeldItem called for end-of-turn, then delegates to Gen4Items", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals 1/16 max HP at end of turn
    // This tests that the Gen4Ruleset.applyHeldItem method correctly delegates
    const ruleset = makeRuleset();
    const pokemon = makePokemonInstance({ maxHp: 160, speed: 100 });
    pokemon.heldItem = "leftovers";
    pokemon.currentHp = 100;
    const active = makeActivePokemon({ maxHp: 160, speed: 100 });
    active.pokemon = pokemon;

    const ctx = {
      pokemon: active,
      state: {} as BattleState,
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
      damage: undefined,
    } as unknown as import("@pokemon-lib-ts/battle").ItemContext;

    const result = ruleset.applyHeldItem("end-of-turn", ctx);
    // Leftovers heals 1/16 max HP = floor(160/16) = 10
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });
});
