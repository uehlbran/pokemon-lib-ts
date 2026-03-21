import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { applyGen5Ability } from "../src/Gen5Abilities";
import { applyGen5HeldItem } from "../src/Gen5Items";
import { executeGen5MoveEffect } from "../src/Gen5MoveEffects";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import { applyGen5WeatherEffects } from "../src/Gen5Weather";

describe("Gen5Ruleset smoke tests", () => {
  it("given Gen5Ruleset, when checking generation property, then returns 5", () => {
    // Source: Gen5Ruleset.generation is set to 5 in the class definition
    // (Generation V: Black/White/Black2/White2, 2010-2012)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.generation).toBe(5);
  });

  it("given Gen5Ruleset, when checking name, then includes Gen 5", () => {
    // Source: Gen5Ruleset.name is set to "Gen 5 (Black/White/Black2/White2)" in the class definition
    const ruleset = new Gen5Ruleset();
    expect(ruleset.name).toContain("Gen 5");
  });

  it("given Gen5Ruleset, when getting type chart, then returns non-empty type chart", () => {
    // Source: Gen 5 has 17 types (same as Gen 2-4)
    const ruleset = new Gen5Ruleset();
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBeGreaterThan(0);
  });

  it("given Gen5Ruleset, when getting available types, then returns array of 17 types", () => {
    // Source: Gen 5 has 17 types (no Fairy, which was added in Gen 6)
    const ruleset = new Gen5Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types.length).toBe(17);
  });

  it("given Gen5Ruleset, when getting available types, then does not include fairy", () => {
    // Source: Fairy type was introduced in Gen 6
    const ruleset = new Gen5Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types).not.toContain("fairy");
  });

  it("given Gen5Ruleset, when getting crit rate table, then first stage is 1/16", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1625
    // Gen 3-5 crit rate: stage 0 = 1/16 chance (denominator 16)
    const ruleset = new Gen5Ruleset();
    const table = ruleset.getCritRateTable();
    expect(table[0]).toBe(16);
  });

  it("given Gen5Ruleset, when getting crit rate table, then has 5 stages [16, 8, 4, 3, 2]", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1625-1627
    // Gen 3-5: 5-stage crit table
    const ruleset = new Gen5Ruleset();
    const table = ruleset.getCritRateTable();
    expect([...table]).toEqual([16, 8, 4, 3, 2]);
  });

  it("given Gen5Ruleset, when getting crit multiplier, then returns 2.0", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
    // Gen 2-5: critical hits deal 2x damage (Gen 6+ reduced to 1.5x)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });

  it("given Gen5Ruleset, when checking hasAbilities, then returns true", () => {
    // Source: Abilities introduced in Gen 3, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasAbilities()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasHeldItems, then returns true", () => {
    // Source: Held items introduced in Gen 2, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasHeldItems()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasWeather, then returns true", () => {
    // Source: Weather introduced in Gen 2, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasWeather()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasTerrain, then returns false", () => {
    // Source: Terrain was not introduced until Gen 7
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasTerrain()).toBe(false);
  });

  it("given Gen5Ruleset, when checking getBattleGimmick, then returns null", () => {
    // Source: No battle gimmick in Gen 5 (Mega Evolution introduced in Gen 6)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getBattleGimmick()).toBeNull();
  });

  it("given Gen5Ruleset, when checking shouldExecutePursuitPreSwitch, then returns true", () => {
    // Source: Pursuit executes before switch in Gen 2-7 (removed in Gen 8)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(true);
  });

  it("given Gen5Ruleset, when checking available hazards, then includes stealth-rock and spikes and toxic-spikes", () => {
    // Source: Stealth Rock, Spikes, Toxic Spikes all available in Gen 5
    const ruleset = new Gen5Ruleset();
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain("stealth-rock");
    expect(hazards).toContain("spikes");
    expect(hazards).toContain("toxic-spikes");
  });

  it("given Gen5Ruleset, when getting confusion self-hit chance, then returns 0.5", () => {
    // Source: Gen 1-6 confusion self-hit is 50% (Gen 7+ reduced to 33%)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getConfusionSelfHitChance()).toBe(0.5);
  });

  it("given Gen5Ruleset, when calling applyWeatherEffects, then returns empty array (stub)", () => {
    // Source: Weather effects stub -- will be implemented in Wave 2
    const ruleset = new Gen5Ruleset();
    const state = { weather: null } as unknown as BattleState;
    const result = ruleset.applyWeatherEffects(state);
    expect(result).toEqual([]);
  });

  it("given Gen5Ruleset, when calling applyStatusDamage with burn, then returns 1/8 max HP", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Gen 3-6 burn damage is 1/8 max HP
    const ruleset = new Gen5Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 200 },
        currentHp: 200,
        status: "burn",
      },
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    // 200 / 8 = 25
    expect(damage).toBe(25);
  });

  it("given Gen5Ruleset, when calling applyStatusDamage with burn and low HP, then returns at least 1", () => {
    // Source: Gen 5 burn damage minimum is 1 HP
    const ruleset = new Gen5Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 1 },
        currentHp: 1,
        status: "burn",
      },
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(1);
  });

  it("given Gen5Ruleset, when calling applyStatusDamage with poison, then delegates to BaseRuleset (1/8 max HP)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    const ruleset = new Gen5Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 160 },
        currentHp: 160,
        status: "poison",
      },
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "poison", state);
    // 160 / 8 = 20
    expect(damage).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Stub function smoke tests (for coverage)
// ---------------------------------------------------------------------------

describe("Gen 5 stub functions", () => {
  it("given applyGen5Ability stub, when called, then returns empty array", () => {
    // Source: Stub -- will be implemented in Waves 3-4
    const result = applyGen5Ability();
    expect(result).toEqual([]);
  });

  it("given applyGen5HeldItem stub, when called, then returns empty array", () => {
    // Source: Stub -- will be implemented in Wave 4
    const result = applyGen5HeldItem();
    expect(result).toEqual([]);
  });

  it("given executeGen5MoveEffect stub, when called, then returns default MoveEffectResult", () => {
    // Source: Stub -- will be implemented in Waves 5-6
    const result = executeGen5MoveEffect();
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
    expect(result.recoilDamage).toBe(0);
    expect(result.healAmount).toBe(0);
    expect(result.switchOut).toBe(false);
    expect(result.messages).toEqual([]);
  });

  it("given applyGen5WeatherEffects with no weather, when called, then returns empty array", () => {
    // Source: No weather = no chip damage effects
    const state = { weather: null, sides: [] } as unknown as BattleState;
    const result = applyGen5WeatherEffects(state);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset canHitSemiInvulnerable
// ---------------------------------------------------------------------------

describe("Gen5Ruleset canHitSemiInvulnerable", () => {
  const ruleset = new Gen5Ruleset();

  it("given flying volatile and Thunder, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Thunder can hit Pokemon using Fly/Bounce
    expect(ruleset.canHitSemiInvulnerable("thunder", "flying")).toBe(true);
  });

  it("given flying volatile and Hurricane, when checking canHit, then returns true (Gen 5 addition)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/scripts.ts -- Hurricane added in Gen 5
    expect(ruleset.canHitSemiInvulnerable("hurricane", "flying")).toBe(true);
  });

  it("given flying volatile and Smack Down, when checking canHit, then returns true (Gen 5 addition)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/scripts.ts -- Smack Down added in Gen 5
    expect(ruleset.canHitSemiInvulnerable("smack-down", "flying")).toBe(true);
  });

  it("given flying volatile and Tackle, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- regular moves cannot hit semi-invulnerable Pokemon
    expect(ruleset.canHitSemiInvulnerable("tackle", "flying")).toBe(false);
  });

  it("given underground volatile and Earthquake, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Earthquake can hit Pokemon using Dig
    expect(ruleset.canHitSemiInvulnerable("earthquake", "underground")).toBe(true);
  });

  it("given underground volatile and Magnitude, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Magnitude can hit Pokemon using Dig
    expect(ruleset.canHitSemiInvulnerable("magnitude", "underground")).toBe(true);
  });

  it("given underground volatile and Tackle, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- regular moves cannot hit underground Pokemon
    expect(ruleset.canHitSemiInvulnerable("tackle", "underground")).toBe(false);
  });

  it("given underwater volatile and Surf, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Surf can hit Pokemon using Dive
    expect(ruleset.canHitSemiInvulnerable("surf", "underwater")).toBe(true);
  });

  it("given underwater volatile and Tackle, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- regular moves cannot hit underwater Pokemon
    expect(ruleset.canHitSemiInvulnerable("tackle", "underwater")).toBe(false);
  });

  it("given shadow-force-charging volatile, when checking canHit with any move, then returns false", () => {
    // Source: Showdown -- nothing bypasses Shadow Force
    expect(ruleset.canHitSemiInvulnerable("tackle", "shadow-force-charging")).toBe(false);
    expect(ruleset.canHitSemiInvulnerable("thunder", "shadow-force-charging")).toBe(false);
  });

  it("given charging volatile (SolarBeam etc.), when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- charging moves are NOT semi-invulnerable; all moves can hit
    expect(ruleset.canHitSemiInvulnerable("tackle", "charging")).toBe(true);
  });

  it("given unknown volatile, when checking canHit, then returns false", () => {
    // Source: default case -- unknown volatiles are not hittable
    expect(ruleset.canHitSemiInvulnerable("tackle", "unknown" as any)).toBe(false);
  });
});
