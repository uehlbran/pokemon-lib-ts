import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen3Ability,
  isGen3AbilityStatusImmune,
  isGen3VolatileBlockedByAbility,
} from "../src/Gen3Abilities";
import { canInflictGen3Status } from "../src/Gen3Ruleset";

/**
 * Gen 3 Status Immunity Ability Tests
 *
 * Tests for abilities that grant immunity to status conditions:
 *   - Immunity: blocks poison/badly-poisoned
 *   - Insomnia / Vital Spirit: blocks sleep
 *   - Limber: blocks paralysis
 *   - Water Veil: blocks burn
 *   - Magma Armor: blocks freeze
 *   - Inner Focus: blocks flinch (volatile)
 *   - Own Tempo: blocks confusion (volatile)
 *   - Oblivious: blocks infatuation (volatile)
 *
 * Also tests passive immunity abilities (Volt Absorb, Water Absorb, Flash Fire,
 * Levitate, Soundproof, Sturdy, Lightning Rod).
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(nextValues: number[] = [0.5]) {
  let index = 0;
  return {
    next: () => {
      const val = nextValues[index % nextValues.length]!;
      index++;
      return val;
    },
    int: (_min: number, _max: number) => 85,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createMockPokemon(opts: {
  types?: PokemonType[];
  ability?: string;
  status?: string | null;
  hp?: number;
  maxHp?: number;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.hp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: null,
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
  };

  return {
    pokemon,
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
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
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
  } as unknown as ActivePokemon;
}

function createMinimalBattleState(
  side0Active: ActivePokemon,
  side1Active: ActivePokemon,
): BattleState {
  return {
    sides: [
      {
        active: [side0Active],
        team: [side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [side1Active],
        team: [side1Active.pokemon],
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

// ===========================================================================
// isGen3AbilityStatusImmune — direct unit tests
// ===========================================================================

describe("isGen3AbilityStatusImmune", () => {
  // Source: pret/pokeemerald src/battle_util.c -- ability immunity checks

  it("given Immunity ability, when checking poison, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_IMMUNITY blocks STATUS_POISON
    expect(isGen3AbilityStatusImmune("immunity", "poison")).toBe(true);
  });

  it("given Immunity ability, when checking badly-poisoned, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_IMMUNITY blocks STATUS_TOXIC_POISON
    expect(isGen3AbilityStatusImmune("immunity", "badly-poisoned")).toBe(true);
  });

  it("given Immunity ability, when checking burn, then returns false", () => {
    // Source: pret/pokeemerald -- ABILITY_IMMUNITY only blocks poison
    expect(isGen3AbilityStatusImmune("immunity", "burn")).toBe(false);
  });

  it("given Insomnia ability, when checking sleep, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_INSOMNIA blocks STATUS_SLEEP
    expect(isGen3AbilityStatusImmune("insomnia", "sleep")).toBe(true);
  });

  it("given Vital Spirit ability, when checking sleep, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_VITAL_SPIRIT blocks STATUS_SLEEP
    expect(isGen3AbilityStatusImmune("vital-spirit", "sleep")).toBe(true);
  });

  it("given Limber ability, when checking paralysis, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_LIMBER blocks STATUS_PARALYSIS
    expect(isGen3AbilityStatusImmune("limber", "paralysis")).toBe(true);
  });

  it("given Water Veil ability, when checking burn, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_WATER_VEIL blocks STATUS_BURN
    expect(isGen3AbilityStatusImmune("water-veil", "burn")).toBe(true);
  });

  it("given Magma Armor ability, when checking freeze, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_MAGMA_ARMOR blocks STATUS_FREEZE
    expect(isGen3AbilityStatusImmune("magma-armor", "freeze")).toBe(true);
  });

  it("given no relevant ability, when checking any status, then returns false", () => {
    expect(isGen3AbilityStatusImmune("blaze", "burn")).toBe(false);
    expect(isGen3AbilityStatusImmune("overgrow", "poison")).toBe(false);
  });
});

// ===========================================================================
// isGen3VolatileBlockedByAbility — volatile immunity tests
// ===========================================================================

describe("isGen3VolatileBlockedByAbility", () => {
  // Source: pret/pokeemerald src/battle_util.c -- volatile ability immunity checks

  it("given Inner Focus ability, when checking flinch, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_INNER_FOCUS blocks flinch
    expect(isGen3VolatileBlockedByAbility("inner-focus", "flinch")).toBe(true);
  });

  it("given Inner Focus ability, when checking confusion, then returns false", () => {
    expect(isGen3VolatileBlockedByAbility("inner-focus", "confusion")).toBe(false);
  });

  it("given Own Tempo ability, when checking confusion, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_OWN_TEMPO blocks confusion
    expect(isGen3VolatileBlockedByAbility("own-tempo", "confusion")).toBe(true);
  });

  it("given Oblivious ability, when checking infatuation, then returns true", () => {
    // Source: pret/pokeemerald -- ABILITY_OBLIVIOUS blocks infatuation
    expect(isGen3VolatileBlockedByAbility("oblivious", "infatuation")).toBe(true);
  });

  it("given no relevant ability, when checking flinch, then returns false", () => {
    expect(isGen3VolatileBlockedByAbility("blaze", "flinch")).toBe(false);
  });
});

// ===========================================================================
// canInflictGen3Status — integration with ability immunities
// ===========================================================================

describe("canInflictGen3Status with ability immunities", () => {
  // Source: pret/pokeemerald src/battle_util.c -- full status infliction check

  it("given target has Immunity ability, when trying to inflict poison, then returns false", () => {
    const target = createMockPokemon({ types: ["normal"], ability: "immunity" });
    expect(canInflictGen3Status("poison", target)).toBe(false);
  });

  it("given target has Immunity ability, when trying to inflict badly-poisoned, then returns false", () => {
    const target = createMockPokemon({ types: ["normal"], ability: "immunity" });
    expect(canInflictGen3Status("badly-poisoned", target)).toBe(false);
  });

  it("given target has Insomnia, when trying to inflict sleep, then returns false", () => {
    const target = createMockPokemon({ types: ["normal"], ability: "insomnia" });
    expect(canInflictGen3Status("sleep", target)).toBe(false);
  });

  it("given target has Limber, when trying to inflict paralysis, then returns false", () => {
    const target = createMockPokemon({ types: ["normal"], ability: "limber" });
    expect(canInflictGen3Status("paralysis", target)).toBe(false);
  });

  it("given target has Water Veil, when trying to inflict burn, then returns false", () => {
    const target = createMockPokemon({ types: ["water"], ability: "water-veil" });
    expect(canInflictGen3Status("burn", target)).toBe(false);
  });

  it("given target has Magma Armor, when trying to inflict freeze, then returns false", () => {
    const target = createMockPokemon({ types: ["fire"], ability: "magma-armor" });
    expect(canInflictGen3Status("freeze", target)).toBe(false);
  });

  it("given target has no immunity ability, when trying to inflict poison, then returns true", () => {
    const target = createMockPokemon({ types: ["normal"], ability: "blaze" });
    expect(canInflictGen3Status("poison", target)).toBe(true);
  });
});

// ===========================================================================
// Passive Immunity — Volt Absorb, Water Absorb, Flash Fire, Levitate
// ===========================================================================

describe("Gen 3 passive immunity abilities", () => {
  describe("Volt Absorb", () => {
    // Source: pret/pokeemerald -- ABILITY_VOLT_ABSORB: Electric moves heal 1/4 max HP
    // Source: Bulbapedia -- Volt Absorb absorbs Electric moves, heals 1/4 max HP

    it("given defender has Volt Absorb and incoming Electric move, then heals 1/4 max HP", () => {
      const defender = createMockPokemon({
        types: ["electric"],
        ability: "volt-absorb",
        maxHp: 200,
      });
      const attacker = createMockPokemon({ types: ["electric"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "thunderbolt", type: "electric", category: "special", power: 90 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
      // floor(200/4) = 50
      expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 50 });
    });

    it("given defender has Volt Absorb and incoming non-Electric move, then does not activate", () => {
      const defender = createMockPokemon({ types: ["electric"], ability: "volt-absorb" });
      const attacker = createMockPokemon({ types: ["water"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "surf",
          type: "water",
          category: "special",
          power: 90,
          effect: { type: "damage" },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(false);
    });
  });

  describe("Water Absorb", () => {
    // Source: pret/pokeemerald -- ABILITY_WATER_ABSORB: Water moves heal 1/4 max HP

    it("given defender has Water Absorb and incoming Water move, then heals 1/4 max HP", () => {
      const defender = createMockPokemon({ types: ["water"], ability: "water-absorb", maxHp: 160 });
      const attacker = createMockPokemon({ types: ["water"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "surf",
          type: "water",
          category: "special",
          power: 90,
          effect: { type: "damage" },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
      // floor(160/4) = 40
      expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 40 });
    });
  });

  describe("Flash Fire", () => {
    // Source: pret/pokeemerald -- ABILITY_FLASH_FIRE: absorbs Fire, sets volatile for 50% boost
    // Source: Bulbapedia -- Flash Fire grants immunity and powers up Fire moves

    it("given defender has Flash Fire and incoming Fire move with no prior boost, then sets volatile", () => {
      const defender = createMockPokemon({ types: ["fire"], ability: "flash-fire" });
      const attacker = createMockPokemon({ types: ["fire"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "flamethrower", type: "fire", category: "special", power: 95 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toEqual({
        effectType: "volatile-inflict",
        target: "self",
        volatile: "flash-fire",
      });
    });

    it("given defender has Flash Fire with existing boost, when hit by Fire, then no new volatile", () => {
      const defender = createMockPokemon({ types: ["fire"], ability: "flash-fire" });
      // Set the flash-fire volatile
      (defender as any).volatileStatuses.set("flash-fire", { turnsLeft: -1 });
      const attacker = createMockPokemon({ types: ["fire"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "flamethrower", type: "fire", category: "special", power: 95 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(0); // no new volatile, just immunity
    });
  });

  describe("Levitate", () => {
    // Source: pret/pokeemerald -- ABILITY_LEVITATE: Ground moves have no effect

    it("given defender has Levitate and incoming Ground move, then move is negated", () => {
      const defender = createMockPokemon({ types: ["ghost", "poison"], ability: "levitate" });
      const attacker = createMockPokemon({ types: ["ground"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "earthquake", type: "ground", category: "physical", power: 100 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(0); // just immunity, no effect
    });

    it("given defender has Levitate and incoming non-Ground move, then does not activate", () => {
      const defender = createMockPokemon({ types: ["ghost", "poison"], ability: "levitate" });
      const attacker = createMockPokemon({ types: ["fire"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "flamethrower", type: "fire", category: "special", power: 95 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(false);
    });
  });

  describe("Lightning Rod", () => {
    // Source: pret/pokeemerald -- Lightning Rod only redirects in doubles, NO immunity in Gen 3
    // Source: Bulbapedia -- "In Generation III-IV, Lightning Rod does not grant immunity."

    it("given defender has Lightning Rod and incoming Electric move, then does NOT activate (Gen 3)", () => {
      const defender = createMockPokemon({ types: ["ground"], ability: "lightning-rod" });
      const attacker = createMockPokemon({ types: ["electric"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: { id: "thunderbolt", type: "electric", category: "special", power: 90 } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(false);
    });
  });

  describe("Soundproof", () => {
    // Source: pret/pokeemerald -- ABILITY_SOUNDPROOF blocks sound-based moves
    // Source: Bulbapedia -- Soundproof makes Pokemon immune to sound-based moves

    it("given defender has Soundproof and incoming Hyper Voice, then blocks the move", () => {
      const defender = createMockPokemon({ types: ["normal"], ability: "soundproof" });
      const attacker = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "hyper-voice",
          type: "normal",
          category: "special",
          power: 90,
          flags: {
            sound: true,
            contact: false,
            protect: true,
            mirror: true,
            bypassSubstitute: false,
          },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
    });

    it("given defender has Soundproof and incoming non-sound move, then does not activate", () => {
      const defender = createMockPokemon({ types: ["normal"], ability: "soundproof" });
      const attacker = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "tackle",
          type: "normal",
          category: "physical",
          power: 40,
          flags: {
            sound: false,
            contact: true,
            protect: true,
            mirror: true,
            bypassSubstitute: false,
          },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(false);
    });
  });

  describe("Sturdy", () => {
    // Source: pret/pokeemerald -- Sturdy only blocks OHKO moves in Gen 3-4
    // Source: Bulbapedia -- "In Generation III-IV, Sturdy only blocks one-hit knockout moves."

    it("given defender has Sturdy and incoming Fissure, then blocks the OHKO move", () => {
      const defender = createMockPokemon({ types: ["rock"], ability: "sturdy" });
      const attacker = createMockPokemon({ types: ["ground"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "fissure",
          type: "ground",
          category: "physical",
          power: 0,
          effect: { type: "ohko" },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(true);
    });

    it("given defender has Sturdy and incoming regular move, then does NOT activate (no Focus Sash in Gen 3)", () => {
      const defender = createMockPokemon({ types: ["rock"], ability: "sturdy" });
      const attacker = createMockPokemon({ types: ["water"] });
      const state = createMinimalBattleState(attacker, defender);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon: defender,
        opponent: attacker,
        state,
        rng,
        trigger: "passive-immunity",
        move: {
          id: "surf",
          type: "water",
          category: "special",
          power: 90,
          effect: { type: "damage" },
        } as MoveData,
      };

      const result = applyGen3Ability("passive-immunity", context);
      expect(result.activated).toBe(false);
    });
  });
});

// ===========================================================================
// On-Turn-End abilities
// ===========================================================================

describe("Gen 3 on-turn-end abilities", () => {
  describe("Speed Boost", () => {
    // Source: pret/pokeemerald -- Speed Boost raises Speed by 1 at end of turn
    // Source: Bulbapedia -- "Speed Boost raises Speed by 1 stage at the end of each turn"

    it("given Pokemon with Speed Boost, when turn ends, then Speed is raised by 1 stage", () => {
      const pokemon = createMockPokemon({ types: ["bug"], ability: "speed-boost" });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "self",
        stat: "speed",
        stages: 1,
      });
    });
  });

  describe("Rain Dish", () => {
    // Source: pret/pokeemerald -- Rain Dish heals 1/16 max HP in rain
    // Source: Bulbapedia -- "Rain Dish heals 1/16 of max HP each turn during rain"

    it("given Pokemon with Rain Dish in rain, when turn ends, then heals 1/16 max HP", () => {
      const pokemon = createMockPokemon({ types: ["water"], ability: "rain-dish", maxHp: 160 });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      (state as any).weather = { type: "rain", turnsLeft: 5, source: "drizzle" };
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(true);
      // floor(160/16) = 10
      expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 10 });
    });

    it("given Pokemon with Rain Dish NOT in rain, when turn ends, then does not activate", () => {
      const pokemon = createMockPokemon({ types: ["water"], ability: "rain-dish" });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      const rng = createMockRng([]);

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(false);
    });
  });

  describe("Shed Skin", () => {
    // Source: pret/pokeemerald -- Shed Skin: 1/3 chance to cure status
    // Source: Bulbapedia -- "Shed Skin has a 1/3 chance of curing status at end of turn"

    it("given Pokemon with Shed Skin and a status and rng < 1/3, when turn ends, then status is cured", () => {
      const pokemon = createMockPokemon({
        types: ["bug"],
        ability: "shed-skin",
        status: "paralysis",
      });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      const rng = createMockRng([0.2]); // < 1/3

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "self" });
    });

    it("given Pokemon with Shed Skin and rng >= 1/3, when turn ends, then status is NOT cured", () => {
      const pokemon = createMockPokemon({ types: ["bug"], ability: "shed-skin", status: "burn" });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      const rng = createMockRng([0.5]); // >= 1/3

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(false);
    });

    it("given Pokemon with Shed Skin and no status, when turn ends, then does not activate", () => {
      const pokemon = createMockPokemon({ types: ["bug"], ability: "shed-skin" });
      const opponent = createMockPokemon({ types: ["normal"] });
      const state = createMinimalBattleState(pokemon, opponent);
      const rng = createMockRng([0.1]); // would trigger if status existed

      const context: AbilityContext = {
        pokemon,
        opponent,
        state,
        rng,
        trigger: "on-turn-end",
      };

      const result = applyGen3Ability("on-turn-end", context);
      expect(result.activated).toBe(false);
    });
  });
});
