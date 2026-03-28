import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Mold Breaker Ability Tests — Gen 4
 *
 * Mold Breaker (introduced in Gen 4) causes the user's moves to bypass the
 * target's defensive abilities during damage calculation.
 *
 * Abilities bypassed by Mold Breaker in damage calc:
 *   - Type immunity abilities: Levitate, Volt Absorb, Water Absorb, Flash Fire,
 *     Motor Drive, Dry Skin
 *   - Thick Fat (halves Fire/Ice damage)
 *   - Marvel Scale (Defense x1.5 when statused)
 *   - Wonder Guard (only SE moves hit)
 *   - Filter / Solid Rock (reduces SE damage by 0.75x)
 *
 * Source: Showdown Gen 4, Bulbapedia: https://bulbapedia.bulbagarden.net/wiki/Mold_Breaker
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const A = GEN4_ABILITY_IDS;
const CA = CORE_ABILITY_IDS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const ABILITY_TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const CORE_ITEMS = CORE_ITEM_IDS;
const T = CORE_TYPE_IDS;
const M = GEN4_MOVE_IDS;
const N = GEN4_NATURE_IDS;
const SP = GEN4_SPECIES_IDS;
const dataManager = createGen4DataManager();

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? SP.bulbasaur,
    nickname: null,
    level,
    experience: 0,
    nature: N.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? CA.none,
    abilitySlot: ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEMS.pokeBall,
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
    types: opts.types ?? [T.normal],
    ability: opts.ability ?? CA.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createMove(id: string): MoveData {
  return dataManager.getMove(id);
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
    gravity: { active: false, turnsLeft: 0 },
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Mold Breaker", () => {
  describe("on-switch-in message", () => {
    it("given a Pokemon with Mold Breaker, when it switches in, then the announcement message is emitted", () => {
      // Source: Showdown Gen 4 — Mold Breaker switch-in announcement
      const pokemon = createActivePokemon({ ability: A.moldBreaker, speciesId: SP.rampardos });
      pokemon.pokemon.nickname = "Rampardos";
      const result = applyGen4Ability(ABILITY_TRIGGERS.onSwitchIn, {
        pokemon,
        state: createMockState() as never,
        rng: createMockRng(100) as never,
        trigger: ABILITY_TRIGGERS.onSwitchIn,
      });
      expect(result.activated).toBe(true);
      expect(result.messages).toContain("Rampardos breaks the mold!");
    });
  });

  describe("Levitate bypass", () => {
    it("given attacker with Mold Breaker, when Ground move targets Levitate Pokemon, then Levitate immunity bypassed and damage dealt", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Levitate ground immunity
      // Source: Bulbapedia — Mold Breaker negates Levitate
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      const defender = createActivePokemon({ ability: A.levitate, types: [T.psychic] });
      const move = createMove(M.earthquake);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Without Mold Breaker, Ground vs Levitate = 0 damage (immune)
      // With Mold Breaker, Levitate is bypassed and damage is dealt
      // Source: Gen 4 formula: levelFactor=22, power=100(Earthquake), atk=150, def=100
      //   baseDamage = floor(floor(22*100*150/100)/50)+2 = floor(3300/50)+2 = 66+2 = 68
      //   random roll=100: floor(68*100/100)=68; Ground vs Psychic=1x → 68
      expect(result.damage).toBe(68);
      expect(result.effectiveness).not.toBe(0);
    });

    it("given attacker without Mold Breaker, when Ground move targets Levitate Pokemon, then Levitate immunity applies", () => {
      // Source: Showdown Gen 4 — Levitate grants Ground immunity normally
      const attacker = createActivePokemon({ attack: 150 });
      const defender = createActivePokemon({ ability: A.levitate, types: [T.psychic] });
      const move = createMove(M.earthquake);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });
  });

  describe("Wonder Guard bypass", () => {
    it("given attacker with Mold Breaker, when non-SE move targets Wonder Guard holder, then damage dealt", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Wonder Guard
      // Source: Bulbapedia — Mold Breaker negates Wonder Guard
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      // Shedinja with Bug/Ghost typing; Normal is NOT super effective (0x against Ghost)
      // Use Fighting which is resisted by Ghost (not very effective)
      // But actually Normal hits Ghost for 0x via type chart, not Wonder Guard
      // Let's use a Water move vs Bug/Ghost — Water is neutral to both
      const defender = createActivePokemon({
        ability: A.wonderGuard,
        speciesId: SP.shedinja,
        types: [T.bug, T.ghost],
      });
      const move = createMove(M.waterfall);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Water vs Bug/Ghost is 1x (neutral) — normally blocked by Wonder Guard
      // But Mold Breaker bypasses Wonder Guard so damage goes through
      // Source: Gen 4 formula: levelFactor=22, power=80(Waterfall), atk=150, def=100
      //   baseDamage = floor(floor(22*80*150/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
      //   random roll=100: floor(54*100/100)=54; Water vs Bug=1x, vs Ghost=1x → 54
      expect(result.damage).toBe(54);
      expect(result.effectiveness).toBe(1);
    });

    it("given attacker without Mold Breaker, when non-SE move targets Wonder Guard holder, then 0 damage", () => {
      // Source: Showdown Gen 4 — Wonder Guard blocks non-SE moves
      const attacker = createActivePokemon({ attack: 150 });
      const defender = createActivePokemon({
        ability: A.wonderGuard,
        speciesId: SP.shedinja,
        types: [T.bug, T.ghost],
      });
      const move = createMove(M.waterfall);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      expect(result.damage).toBe(0);
    });
  });

  describe("Filter / Solid Rock bypass", () => {
    it("given attacker with Mold Breaker, when SE move targets Filter holder, then damage not reduced (full SE damage)", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Filter
      // Source: Bulbapedia — Filter reduces SE damage by 25%
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      // Rock type, weak to Water (2x SE)
      const defender = createActivePokemon({ ability: A.filter, types: [T.rock] });
      const move = createMove(M.waterfall);

      const resultWithMoldBreaker = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      // Now same scenario without Mold Breaker — Filter should reduce damage
      const attackerNoMB = createActivePokemon({ attack: 150 });
      const defenderFilter = createActivePokemon({ ability: A.filter, types: [T.rock] });

      const resultWithFilter = calculateGen4Damage(
        createDamageContext({ attacker: attackerNoMB, defender: defenderFilter, move }),
        GEN4_TYPE_CHART,
      );

      // With Mold Breaker, damage should be higher (Filter bypassed)
      expect(resultWithMoldBreaker.damage).toBeGreaterThan(resultWithFilter.damage);
    });
  });

  describe("Volt Absorb bypass", () => {
    it("given attacker with Mold Breaker, when Electric move targets Volt Absorb holder, then damage dealt not absorbed", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Volt Absorb
      const attacker = createActivePokemon({ ability: A.moldBreaker, spAttack: 150 });
      const defender = createActivePokemon({ ability: A.voltAbsorb, types: [T.water] });
      const move = createMove(M.thunderbolt);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Without Mold Breaker, Volt Absorb absorbs Electric moves (0 damage)
      // With Mold Breaker, Volt Absorb is bypassed
      // Source: Gen 4 formula: levelFactor=22, power=95(Thunderbolt), spAtk=150, spDef=100
      //   baseDamage = floor(floor(22*95*150/100)/50)+2 = floor(3135/50)+2 = 62+2 = 64
      //   random roll=100: floor(64*100/100)=64; Electric vs Water=2x → floor(64*2)=128
      expect(result.damage).toBe(128);
      expect(result.effectiveness).toBe(2);
    });

    it("given attacker without Mold Breaker, when Electric move targets Volt Absorb holder, then 0 damage", () => {
      // Source: Showdown Gen 4 — Volt Absorb absorbs Electric moves
      const attacker = createActivePokemon({ spAttack: 150 });
      const defender = createActivePokemon({ ability: A.voltAbsorb, types: [T.water] });
      const move = createMove(M.thunderbolt);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });
  });

  describe("Thick Fat bypass", () => {
    it("given attacker with Mold Breaker, when Fire move targets Thick Fat holder, then damage not halved", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Thick Fat
      // Source: Bulbapedia — Thick Fat halves Fire/Ice damage
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      const defender = createActivePokemon({ ability: A.thickFat, types: [T.normal] });
      const move = createMove(M.blazeKick);

      const resultWithMoldBreaker = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      // Same scenario without Mold Breaker — Thick Fat halves damage
      const attackerNoMB = createActivePokemon({ attack: 150 });
      const defenderThickFat = createActivePokemon({ ability: A.thickFat, types: [T.normal] });

      const resultWithThickFat = calculateGen4Damage(
        createDamageContext({ attacker: attackerNoMB, defender: defenderThickFat, move }),
        GEN4_TYPE_CHART,
      );

      // With Mold Breaker, damage should be roughly 2x the Thick Fat damage
      expect(resultWithMoldBreaker.damage).toBeGreaterThan(resultWithThickFat.damage);
    });
  });

  describe("Dry Skin fire weakness bypass", () => {
    it("given attacker with Mold Breaker, when Fire move targets Dry Skin holder, then base power not boosted by 1.25x", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Dry Skin fire weakness boost
      // Source: Bulbapedia — Dry Skin increases Fire damage by 25%
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      const defender = createActivePokemon({ ability: A.drySkin, types: [T.grass] });
      const move = createMove(M.blazeKick);

      const resultWithMoldBreaker = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      // Without Mold Breaker — Dry Skin boosts fire damage by 1.25x
      const attackerNoMB = createActivePokemon({ attack: 150 });
      const defenderDrySkin = createActivePokemon({ ability: A.drySkin, types: [T.grass] });

      const resultWithDrySkin = calculateGen4Damage(
        createDamageContext({ attacker: attackerNoMB, defender: defenderDrySkin, move }),
        GEN4_TYPE_CHART,
      );

      // With Mold Breaker, Fire damage should be LESS because Dry Skin's 1.25x is bypassed
      expect(resultWithMoldBreaker.damage).toBeLessThan(resultWithDrySkin.damage);
    });
  });

  describe("Water Absorb bypass", () => {
    it("given attacker with Mold Breaker, when Water move targets Water Absorb holder, then damage dealt", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Water Absorb
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      const defender = createActivePokemon({ ability: A.waterAbsorb, types: [T.fire] });
      const move = createMove(M.waterfall);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Source: Gen 4 formula: levelFactor=22, power=80(Waterfall), atk=150, def=100
      //   baseDamage = floor(floor(22*80*150/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
      //   random roll=100: floor(54*100/100)=54; Water vs Fire=2x → floor(54*2)=108
      expect(result.damage).toBe(108);
      expect(result.effectiveness).toBe(2);
    });
  });

  describe("Flash Fire bypass", () => {
    it("given attacker with Mold Breaker, when Fire move targets Flash Fire holder, then damage dealt", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Flash Fire immunity
      const attacker = createActivePokemon({ ability: A.moldBreaker, attack: 150 });
      const defender = createActivePokemon({ ability: CA.flashFire, types: [T.grass] });
      const move = createMove(M.blazeKick);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Source: Gen 4 formula: levelFactor=22, power=85(Blaze Kick), atk=150, def=100
      //   baseDamage = floor(floor(22*85*150/100)/50)+2 = floor(2805/50)+2 = 56+2 = 58
      //   random roll=100: floor(58*100/100)=58; Fire vs Grass=2x → floor(58*2)=116
      expect(result.damage).toBe(116);
      expect(result.effectiveness).toBe(2);
    });
  });

  describe("Motor Drive bypass", () => {
    it("given attacker with Mold Breaker, when Electric move targets Motor Drive holder, then damage dealt", () => {
      // Source: Showdown Gen 4 — Mold Breaker bypasses Motor Drive
      const attacker = createActivePokemon({ ability: A.moldBreaker, spAttack: 150 });
      const defender = createActivePokemon({ ability: A.motorDrive, types: [T.normal] });
      const move = createMove(M.thunderbolt);

      const result = calculateGen4Damage(
        createDamageContext({ attacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      // Source: Gen 4 formula: levelFactor=22, power=95(Thunderbolt), spAtk=150, spDef=100
      //   baseDamage = floor(floor(22*95*150/100)/50)+2 = floor(3135/50)+2 = 62+2 = 64
      //   random roll=100: floor(64*100/100)=64; Electric vs Normal=1x → 64
      expect(result.damage).toBe(64);
      expect(result.effectiveness).toBe(1);
    });
  });
});
