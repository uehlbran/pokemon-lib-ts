import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

// Helper to create a Gen3Ruleset instance for testing
function makeRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(createGen3DataManager());
}

// Helper to create a minimal ActivePokemon stub for mechanic tests
function makeActivePokemon(maxHp: number): Parameters<Gen3Ruleset["calculateBindDamage"]>[0] {
  return {
    pokemon: {
      speciesId: 1,
      level: 50,
      currentHp: maxHp,
      status: null,
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      heldItem: null,
      nature: "hardy",
      gender: "male",
      nickname: null,
      isShiny: false,
      experiencePoints: 0,
      happiness: 255,
    },
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
    ability: null,
    sideIndex: 0,
    slotIndex: 0,
    lastUsedMove: null,
    mustRecharge: false,
    twoTurnMove: null,
    consecutiveProtects: 0,
  };
}

// Helper to create a minimal ActivePokemon with a given status
function makeActivePokemonWithStatus(
  maxHp: number,
  status: "burn" | "paralysis" | "poison" | "badly-poisoned" | null,
): Parameters<Gen3Ruleset["calculateBindDamage"]>[0] {
  const mon = makeActivePokemon(maxHp);
  (mon.pokemon as { status: typeof status }).status = status;
  return mon;
}

// Minimal BattleState stub — enough for applyStatusDamage
const STUB_STATE = {} as Parameters<Gen3Ruleset["applyStatusDamage"]>[2];

describe("Gen3Ruleset simple overrides", () => {
  // --- Identity ---

  it("given Gen3Ruleset, when accessing generation, then returns 3", () => {
    // Source: Gen 3 = Ruby / Sapphire / Emerald
    const ruleset = makeRuleset();
    expect(ruleset.generation).toBe(3);
  });

  it("given Gen3Ruleset, when accessing name, then contains 'Gen 3'", () => {
    // Source: naming convention for the library
    const ruleset = makeRuleset();
    expect(ruleset.name).toContain("Gen 3");
  });

  // --- Entry Hazards ---

  it("given Gen3Ruleset, when getAvailableHazards, then only spikes is available", () => {
    // Source: pret/pokeemerald — only MOVE_SPIKES creates hazards in Gen 3
    // Stealth Rock (Gen 4), Toxic Spikes (Gen 4), Sticky Web (Gen 6) don't exist
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).toEqual(["spikes"]);
  });

  it("given Gen3Ruleset, when getAvailableHazards, then stealth-rock is not available", () => {
    // Source: Stealth Rock move was introduced in Gen 4 (Diamond/Pearl)
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableHazards()).not.toContain("stealth-rock");
  });

  // --- Bind Damage ---

  it("given a Pokemon with 160 max HP, when calculateBindDamage, then returns 10", () => {
    // Source: pret/pokeemerald src/battle_util.c — bind/wrap damage = maxHP / 16
    // 160 / 16 = 10
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(160);
    expect(ruleset.calculateBindDamage(mon)).toBe(10);
  });

  it("given a Pokemon with 200 max HP, when calculateBindDamage, then returns 12", () => {
    // Source: pret/pokeemerald src/battle_util.c — bind/wrap damage = floor(maxHP / 16)
    // floor(200 / 16) = floor(12.5) = 12
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(200);
    expect(ruleset.calculateBindDamage(mon)).toBe(12);
  });

  it("given a Pokemon with 1 max HP (Shedinja), when calculateBindDamage, then returns 1 (minimum)", () => {
    // Source: pret/pokeemerald — damage always >= 1; Shedinja has 1 HP
    // floor(1 / 16) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(1);
    expect(ruleset.calculateBindDamage(mon)).toBe(1);
  });

  // --- Struggle Recoil ---

  it("given 100 damage dealt, when calculateStruggleRecoil, then returns 25", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2636-2639
    // "case MOVE_EFFECT_RECOIL_25: gBattleMoveDamage = (gHpDealt) / 4;"
    // Struggle recoil = floor(100 / 4) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(200);
    expect(ruleset.calculateStruggleRecoil(mon, 100)).toBe(25);
  });

  it("given 75 damage dealt, when calculateStruggleRecoil, then returns 18", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2637
    // Struggle recoil = floor(75 / 4) = 18
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(200);
    expect(ruleset.calculateStruggleRecoil(mon, 75)).toBe(18);
  });

  it("given 1 damage dealt, when calculateStruggleRecoil, then returns 1 (minimum)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2638-2639
    // "if (gBattleMoveDamage == 0) gBattleMoveDamage = 1;"
    // floor(1 / 4) = 0 → clamped to 1
    const ruleset = makeRuleset();
    const mon = makeActivePokemon(200);
    expect(ruleset.calculateStruggleRecoil(mon, 1)).toBe(1);
  });

  // --- Sleep Turns ---

  it("given rollSleepTurns, when called 1000 times with varied seeds, then always returns 2-5", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c
    // Sleep counter = Random(4) + 2 → range is [2, 5]
    const ruleset = makeRuleset();
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRandom(seed);
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(2);
      expect(turns).toBeLessThanOrEqual(5);
    }
  });

  it("given rollSleepTurns with seed 42, when called, then returns a value in range [2, 5]", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep is 2-5 turns
    const ruleset = makeRuleset();
    const rng = new SeededRandom(42);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(turns).toBeLessThanOrEqual(5);
  });

  // --- Types ---

  it("given Gen3Ruleset, when getAvailableTypes, then returns 17 types", () => {
    // Source: Gen 3 has 17 types (Normal through Steel; Fairy added in Gen 6)
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes().length).toBe(17);
  });

  it("given Gen3Ruleset, when getAvailableTypes, then Fairy is not present", () => {
    // Source: Fairy type introduced in Gen 6 (X/Y), not present in Gen 3
    const ruleset = makeRuleset();
    expect(ruleset.getAvailableTypes()).not.toContain("fairy");
  });

  // --- Crit Multiplier ---

  it("given Gen3Ruleset, when getCritMultiplier, then returns 2.0", () => {
    // Source: pret/pokeemerald src/battle_util.c — critical hits double damage
    // Gen 3-5: 2.0x (Gen 6+ changed to 1.5x)
    const ruleset = makeRuleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });

  it("given Gen3Ruleset, when getCritRateTable, then stage 0 denominator is 16", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 0 = 1/16 chance
    const ruleset = makeRuleset();
    expect(ruleset.getCritRateTable()[0]).toBe(16);
  });

  it("given Gen3Ruleset, when getCritRateTable, then stage 1 denominator is 8", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 1 (Scope Lens / high-crit move) = 1/8 chance
    const ruleset = makeRuleset();
    expect(ruleset.getCritRateTable()[1]).toBe(8);
  });

  // --- Burn Damage ---

  it("given a Pokemon with 160 max HP and burn status, when applyStatusDamage, then returns 20", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn damage = maxHP / 8
    // 160 / 8 = 20
    // Gen 3-6: 1/8 max HP (Gen 7+ changed to 1/16)
    const ruleset = makeRuleset();
    const mon = makeActivePokemonWithStatus(160, "burn");
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 max HP and burn status, when applyStatusDamage, then returns 25", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn damage = floor(maxHP / 8)
    // floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemonWithStatus(200, "burn");
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(25);
  });

  it("given a Pokemon with 200 max HP and poison status, when applyStatusDamage, then returns 25", () => {
    // Source: BaseRuleset default — poison = floor(maxHP / 8) = 25
    // Poison fraction is the same in Gen 3 as the BaseRuleset default
    const ruleset = makeRuleset();
    const mon = makeActivePokemonWithStatus(200, "poison");
    expect(ruleset.applyStatusDamage(mon, "poison", STUB_STATE)).toBe(25);
  });

  // --- Exp Gain ---

  it("given a wild level 50 Pokemon with 64 base EXP, when calculateExpGain, then returns classic formula result", () => {
    // Source: pret/pokeemerald src/battle_util.c GiveExpToMon
    // Classic formula: floor((b * L_d / 7) * (1 / s) * t)
    // = floor((64 * 50 / 7) * (1/1) * 1.0) = floor(3200 / 7) = floor(457.14) = 457
    const ruleset = makeRuleset();
    const dm = createGen3DataManager();
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
    // Abra base EXP = 62; floor((62 * 50 / 7) / 1 * 1.0) = floor(442.857) = 442
    expect(result).toBe(Math.max(1, Math.floor(((abra.baseExp * 50) / 7 / 1) * 1.0)));
  });

  it("given a trainer battle level 30 Pokemon, when calculateExpGain, then applies 1.5x trainer bonus", () => {
    // Source: pret/pokeemerald src/battle_util.c GiveExpToMon — trainer battles give 1.5x EXP
    // Classic formula: floor((b * L_d / 7) * (1 / s) * t)  where t = 1.5 for trainer battles
    const ruleset = makeRuleset();
    const dm = createGen3DataManager();
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
    // Trainer battle should give more EXP than wild battle
    expect(trainerResult).toBeGreaterThan(wildResult);
    // Trainer bonus is 1.5x: floor(wild * 1.5) approximately
    expect(trainerResult).toBe(Math.max(1, Math.floor(((bulbasaur.baseExp * 30) / 7 / 1) * 1.5)));
  });
});
