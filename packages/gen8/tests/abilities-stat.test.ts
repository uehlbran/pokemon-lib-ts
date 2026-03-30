import type {
  AbilityContext,
  AbilityEffect,
  ActivePokemon,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TYPES,
  CORE_NATURE_IDS,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import {
  getTriagePriorityBonus,
  handleGen8StatAbility,
  isCottonDownTrigger,
  isDauntlessShieldTrigger,
  isGaleWingsActive,
  isIntrepidSwordTrigger,
  isPranksterBlockedByDarkType,
  isPranksterEligible,
  isQuickDrawTrigger,
  isSteamEngineTrigger,
} from "../src/Gen8AbilitiesStat";

const dataManager = createGen8DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const triggerIds = CORE_ABILITY_TRIGGER_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const typeIds = CORE_TYPE_IDS;
const moveIds = GEN8_MOVE_IDS;
const speciesIds = GEN8_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultNature = dataManager.getNature(CORE_NATURE_IDS.hardy).id;
const defaultMove = dataManager.getMove(moveIds.tackle);

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const DEFAULT_SYNTHETIC_STATS = {
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

let nextTestUid = 0;
function createTestUid() {
  return `gen8-stat-${nextTestUid++}`;
}

function createTestRng(seed = 42) {
  return new SeededRandom(seed);
}

function createSyntheticPokemonInstance(overrides: {
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
  primaryStatus?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
}): ReturnType<typeof createPokemonInstance> {
  const hp = overrides.hp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, createTestRng(), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: GEN8_ITEM_IDS.pokeBall,
    moves: [defaultMove.id],
  });
  return {
    ...pokemon,
    uid: createTestUid(),
    speciesId: species.id,
    nickname: overrides.nickname ?? pokemon.nickname ?? null,
    currentHp: overrides.currentHp ?? hp,
    ability: overrides.ability ?? abilityIds.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.primaryStatus ?? null,
    calculatedStats: {
      hp,
      attack: overrides.attack ?? DEFAULT_SYNTHETIC_STATS.attack,
      defense: overrides.defense ?? DEFAULT_SYNTHETIC_STATS.defense,
      spAttack: overrides.spAttack ?? DEFAULT_SYNTHETIC_STATS.spAttack,
      spDefense: overrides.spDefense ?? DEFAULT_SYNTHETIC_STATS.spDefense,
      speed: overrides.speed ?? DEFAULT_SYNTHETIC_STATS.speed,
    },
  };
}

function createOnFieldPokemon(overrides: {
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
  primaryStatus?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  turnsOnField?: number;
}): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance({
    level: overrides.level,
    attack: overrides.attack,
    defense: overrides.defense,
    spAttack: overrides.spAttack,
    spDefense: overrides.spDefense,
    speed: overrides.speed,
    hp: overrides.hp,
    currentHp: overrides.currentHp,
    ability: overrides.ability,
    heldItem: overrides.heldItem,
    primaryStatus: overrides.primaryStatus,
    speciesId: overrides.speciesId,
    nickname: overrides.nickname,
  });
  const species = dataManager.getSpecies(pokemon.speciesId);
  const active = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? species.types);
  return {
    ...active,
    ability: overrides.ability ?? abilityIds.none,
    teamSlot: 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
  };
}

function createCanonicalMove(moveId: (typeof moveIds)[keyof typeof moveIds]): MoveData {
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
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createAbilityContext(overrides: {
  ability: string;
  trigger: (typeof triggerIds)[keyof typeof triggerIds];
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  turnsOnField?: number;
  seed?: number;
  statChange?: { stat: string; stages: number; source: keyof typeof BATTLE_EFFECT_TARGETS };
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: createOnFieldPokemon({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      types: overrides.types,
      nickname: overrides.nickname ?? null,
      turnsOnField: overrides.turnsOnField ?? 0,
    }),
    opponent: overrides.opponent ?? createOnFieldPokemon({}),
    state: createBattleState(),
    rng: createTestRng(overrides.seed ?? 42),
    trigger: overrides.trigger,
    move: overrides.move,
    statChange: overrides.statChange as unknown as AbilityContext["statChange"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 8 Stat Abilities", () => {
  // ---- Triage ----

  describe("Triage", () => {
    it("given a healing move, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3
      // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
      const bonus = getTriagePriorityBonus(abilityIds.triage, moveIds.drainPunch, null);
      expect(bonus).toBe(3);
    });

    it("given a drain-type effect, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/abilities.ts -- triage: move.flags.heal
      const bonus = getTriagePriorityBonus(
        abilityIds.triage,
        "some-drain-move",
        CORE_MOVE_EFFECT_TYPES.drain,
      );
      expect(bonus).toBe(3);
    });

    it("given a non-healing move, when Triage is active, then returns 0", () => {
      const bonus = getTriagePriorityBonus(abilityIds.triage, moveIds.thunderbolt, null);
      expect(bonus).toBe(0);
    });

    it("given a different ability, when checking Triage bonus, then returns 0", () => {
      const bonus = getTriagePriorityBonus(abilityIds.intimidate, moveIds.drainPunch, null);
      expect(bonus).toBe(0);
    });

    it("given life-dew, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/moves.ts -- life-dew has heal flag
      // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
      const bonus = getTriagePriorityBonus(abilityIds.triage, moveIds.lifeDew, null);
      expect(bonus).toBe(3);
    });

    it("given jungle-healing, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/moves.ts -- jungle-healing has heal flag
      // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
      const bonus = getTriagePriorityBonus(abilityIds.triage, moveIds.jungleHealing, null);
      expect(bonus).toBe(3);
    });

    it("given non-allowlisted move with effectType heal, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/abilities.ts -- triage: move.flags.heal check
      // Verifies the effectType "heal" fallback for future moves not yet in the HEALING_MOVES allowlist
      const bonus = getTriagePriorityBonus(
        abilityIds.triage,
        "custom-heal-move",
        CORE_MOVE_EFFECT_TYPES.heal,
      );
      expect(bonus).toBe(3);
    });

    it("given the dispatcher, when Triage user uses healing move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.triage,
        trigger: triggerIds.onPriorityCheck,
        move: createCanonicalMove(moveIds.drainPunch),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Gale Wings ----

  describe("Gale Wings", () => {
    it("given full HP and a Flying move, when Gale Wings is active, then returns true", () => {
      // Source: Showdown data/abilities.ts -- galeWings: requires full HP
      // Source: Bulbapedia "Gale Wings" Gen 7+ -- "only at full HP"
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.flying, 200, 200)).toBe(true);
    });

    it("given less than full HP and a Flying move, when Gale Wings is active, then returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: requires pokemon.hp === pokemon.maxhp
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.flying, 199, 200)).toBe(false);
    });

    it("given full HP and a non-Flying move, when Gale Wings is active, then returns false", () => {
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.fire, 200, 200)).toBe(false);
    });

    it("given a different ability, when checking Gale Wings, then returns false", () => {
      expect(isGaleWingsActive(abilityIds.intimidate, typeIds.flying, 200, 200)).toBe(false);
    });

    it("given the dispatcher, when Gale Wings user at full HP uses Flying move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.galeWings,
        trigger: triggerIds.onPriorityCheck,
        currentHp: 200,
        maxHp: 200,
        move: createCanonicalMove(moveIds.aerialAce),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Gale Wings user below full HP uses Flying move, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.galeWings,
        trigger: triggerIds.onPriorityCheck,
        currentHp: 150,
        maxHp: 200,
        move: createCanonicalMove(moveIds.aerialAce),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Prankster ----

  describe("Prankster", () => {
    it("given a status move, when isPranksterEligible is checked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
      expect(isPranksterEligible(moveCategories.status)).toBe(true);
    });

    it("given a physical move, when isPranksterEligible is checked, then returns false", () => {
      expect(isPranksterEligible(moveCategories.physical)).toBe(false);
    });

    it("given Prankster and a status move targeting Dark type, when checking block, then returns true", () => {
      // Source: Showdown data/abilities.ts -- prankster: Dark targets block
      // Source: Bulbapedia "Prankster" Gen 7+ -- "status moves fail against Dark-type targets"
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.dark],
          createCanonicalMove(moveIds.thunderWave).target,
        ),
      ).toBe(true);
    });

    it("given Prankster and a status move targeting non-Dark type, when checking block, then returns false", () => {
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.fire],
          createCanonicalMove(moveIds.thunderWave).target,
        ),
      ).toBe(false);
    });

    it("given Prankster and a physical move targeting Dark type, when checking block, then returns false", () => {
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.physical,
          [typeIds.dark],
          createCanonicalMove(moveIds.tackle).target,
        ),
      ).toBe(false);
    });

    it("given Prankster and a self-targeting status move, when checking block, then returns false", () => {
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.dark],
          createCanonicalMove(moveIds.agility).target,
        ),
      ).toBe(false);
    });

    it("given the dispatcher, when Prankster user uses status move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.prankster,
        trigger: triggerIds.onPriorityCheck,
        move: createCanonicalMove(moveIds.agility),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Intrepid Sword (NEW Gen 8) ----

  describe("Intrepid Sword", () => {
    it("given first turn on field (turnsOnField === 0), when checking trigger, then returns true", () => {
      // Source: Showdown data/abilities.ts -- intrepidsword: onStart (no once flag in Gen 8)
      // Source: Bulbapedia "Intrepid Sword" -- triggers on entry
      expect(isIntrepidSwordTrigger(abilityIds.intrepidSword, 0)).toBe(true);
    });

    it("given already been on field (turnsOnField > 0), when checking trigger, then returns false", () => {
      // The ability triggers on switch-in, not mid-battle
      expect(isIntrepidSwordTrigger(abilityIds.intrepidSword, 1)).toBe(false);
    });

    it("given a different ability, when checking Intrepid Sword trigger, then returns false", () => {
      expect(isIntrepidSwordTrigger(abilityIds.intimidate, 0)).toBe(false);
    });

    it("given the dispatcher on switch-in, when Intrepid Sword activates, then effect is +1 Attack", () => {
      // Source: Showdown data/abilities.ts -- intrepidsword: onStart, boost atk: 1
      // Source: Bulbapedia "Intrepid Sword" -- "raises Attack by one stage upon entering battle"
      const ctx = createAbilityContext({
        ability: abilityIds.intrepidSword,
        trigger: triggerIds.onSwitchIn,
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.attack,
          stages: 1,
        },
      ]);
    });

    it("given multiple switch-ins in Gen 8, when Intrepid Sword re-enters, then triggers again", () => {
      // Source: Showdown data/mods/gen8/abilities.ts -- no once-per-battle flag
      // In Gen 8, Intrepid Sword triggers every switch-in, not once per battle
      const ctx1 = createAbilityContext({
        ability: abilityIds.intrepidSword,
        trigger: triggerIds.onSwitchIn,
        turnsOnField: 0,
      });
      const result1 = handleGen8StatAbility(ctx1);
      expect(result1.activated).toBe(true);

      // Simulate second switch-in (turnsOnField resets to 0)
      const ctx2 = createAbilityContext({
        ability: abilityIds.intrepidSword,
        trigger: triggerIds.onSwitchIn,
        turnsOnField: 0,
      });
      const result2 = handleGen8StatAbility(ctx2);
      expect(result2.activated).toBe(true);
    });
  });

  // ---- Dauntless Shield (NEW Gen 8) ----

  describe("Dauntless Shield", () => {
    it("given first turn on field, when checking trigger, then returns true", () => {
      // Source: Showdown data/abilities.ts -- dauntlessshield: onStart
      // Source: Bulbapedia "Dauntless Shield" -- triggers on entry
      expect(isDauntlessShieldTrigger(abilityIds.dauntlessShield, 0)).toBe(true);
    });

    it("given already been on field, when checking trigger, then returns false", () => {
      expect(isDauntlessShieldTrigger(abilityIds.dauntlessShield, 1)).toBe(false);
    });

    it("given the dispatcher on switch-in, when Dauntless Shield activates, then effect is +1 Defense", () => {
      // Source: Showdown data/abilities.ts -- dauntlessshield: onStart, boost def: 1
      // Source: Bulbapedia "Dauntless Shield" -- "raises Defense by one stage upon entering battle"
      const ctx = createAbilityContext({
        ability: abilityIds.dauntlessShield,
        trigger: triggerIds.onSwitchIn,
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.defense,
          stages: 1,
        },
      ]);
    });

    it("given multiple switch-ins in Gen 8, when Dauntless Shield re-enters, then triggers again", () => {
      // Source: Gen 8 has no once-per-battle limit for Dauntless Shield
      const ctx = createAbilityContext({
        ability: abilityIds.dauntlessShield,
        trigger: triggerIds.onSwitchIn,
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        stat: CORE_STAT_IDS.defense,
        stages: 1,
      });
    });
  });

  // ---- Cotton Down (NEW Gen 8) ----

  describe("Cotton Down", () => {
    it("given Cotton Down, when checking trigger, then returns true", () => {
      // Source: Showdown data/abilities.ts -- cottondown: onDamagingHit
      // Source: Bulbapedia "Cotton Down" -- "when hit by an attack"
      expect(isCottonDownTrigger(abilityIds.cottonDown)).toBe(true);
    });

    it("given a different ability, when checking Cotton Down trigger, then returns false", () => {
      expect(isCottonDownTrigger(abilityIds.intimidate)).toBe(false);
    });

    it("given the dispatcher, when Cotton Down holder is hit by physical move, then lowers opponent Speed by 1", () => {
      // Source: Showdown data/abilities.ts -- cottondown: lowers all adjacent Speed
      // Source: Bulbapedia "Cotton Down" -- "lowering the Speed stat of all other Pokemon"
      const ctx = createAbilityContext({
        ability: abilityIds.cottonDown,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.opponent,
          stat: CORE_STAT_IDS.speed,
          stages: -1,
        },
      ]);
    });

    it("given the dispatcher, when Cotton Down holder is hit by special move, then also triggers", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.cottonDown,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Cotton Down holder is hit by status move, then does not trigger", () => {
      // Status moves do not deal damage, so Cotton Down does not trigger
      const ctx = createAbilityContext({
        ability: abilityIds.cottonDown,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.agility),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Steam Engine (NEW Gen 8) ----

  describe("Steam Engine", () => {
    it("given a Fire move, when checking Steam Engine trigger, then returns true", () => {
      // Source: Showdown data/abilities.ts -- steamengine: Fire or Water type
      // Source: Bulbapedia "Steam Engine" -- "Fire- or Water-type move"
      expect(isSteamEngineTrigger(abilityIds.steamEngine, typeIds.fire)).toBe(true);
    });

    it("given a Water move, when checking Steam Engine trigger, then returns true", () => {
      expect(isSteamEngineTrigger(abilityIds.steamEngine, typeIds.water)).toBe(true);
    });

    it("given a Normal move, when checking Steam Engine trigger, then returns false", () => {
      expect(isSteamEngineTrigger(abilityIds.steamEngine, typeIds.normal)).toBe(false);
    });

    it("given a different ability, when checking Steam Engine trigger, then returns false", () => {
      expect(isSteamEngineTrigger(abilityIds.intimidate, typeIds.fire)).toBe(false);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Fire move, then raises Speed by 6", () => {
      // Source: Showdown data/abilities.ts -- steamengine: onDamagingHit, boost spe: 6
      // Source: Bulbapedia "Steam Engine" -- "raises Speed by 6 stages"
      const ctx = createAbilityContext({
        ability: abilityIds.steamEngine,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.flamethrower),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.speed,
          stages: 6,
        },
      ]);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Water move, then raises Speed by 6", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.steamEngine,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.surf),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.speed,
          stages: 6,
        },
      ]);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Electric move, then does not trigger", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.steamEngine,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Quick Draw (NEW Gen 8) ----

  describe("Quick Draw", () => {
    it("given rng value < 0.3, when checking Quick Draw trigger, then returns true (30% chance)", () => {
      // Source: Showdown data/abilities.ts -- quickdraw: onFractionalPriority, 30% chance
      // Source: Bulbapedia "Quick Draw" -- "30% chance of acting first"
      expect(isQuickDrawTrigger(abilityIds.quickDraw, 0.0)).toBe(true);
      expect(isQuickDrawTrigger(abilityIds.quickDraw, 0.29)).toBe(true);
    });

    it("given rng value >= 0.3, when checking Quick Draw trigger, then returns false", () => {
      expect(isQuickDrawTrigger(abilityIds.quickDraw, 0.3)).toBe(false);
      expect(isQuickDrawTrigger(abilityIds.quickDraw, 0.5)).toBe(false);
      expect(isQuickDrawTrigger(abilityIds.quickDraw, 0.99)).toBe(false);
    });

    it("given a different ability, when checking Quick Draw trigger, then returns false", () => {
      expect(isQuickDrawTrigger(abilityIds.intimidate, 0.0)).toBe(false);
    });

    it("given the dispatcher with seeded rng, when Quick Draw user checks priority, then outcome is deterministic", () => {
      // SeededRandom(42) produces a deterministic sequence.
      // We test that the dispatcher returns a consistent result for the same seed.
      // Source: Showdown data/abilities.ts -- quickdraw: 30% chance
      const ctx = createAbilityContext({
        ability: abilityIds.quickDraw,
        trigger: triggerIds.onPriorityCheck,
        move: createCanonicalMove(moveIds.tackle),
        seed: 42,
      });
      const result1 = handleGen8StatAbility(ctx);
      // Run again with same seed to verify determinism
      const ctx2 = createAbilityContext({
        ability: abilityIds.quickDraw,
        trigger: triggerIds.onPriorityCheck,
        move: createCanonicalMove(moveIds.tackle),
        seed: 42,
      });
      const result2 = handleGen8StatAbility(ctx2);
      expect(result1.activated).toBe(result2.activated);
    });

    it("given Quick Draw, when testing across many seeds, then approximately 30% activate", () => {
      // Source: Showdown data/abilities.ts -- quickdraw: 30% chance
      // Statistical test: with 1000 trials, ~300 should activate (allow +/- 50 for variance)
      let activations = 0;
      for (let seed = 0; seed < 1000; seed++) {
        const ctx = createAbilityContext({
          ability: abilityIds.quickDraw,
          trigger: triggerIds.onPriorityCheck,
          move: createCanonicalMove(moveIds.tackle),
          seed,
        });
        const result = handleGen8StatAbility(ctx);
        if (result.activated) activations++;
      }
      // Expect approximately 30% (300 +/- 50)
      expect(activations).toBeGreaterThan(250);
      expect(activations).toBeLessThan(350);
    });
  });

  // ---- Carried-forward abilities: Weak Armor, Stamina, Rattled ----

  describe("Weak Armor (carried from Gen 7)", () => {
    it("given a physical hit, when Weak Armor triggers, then -1 Def and +2 Speed", () => {
      // Source: Showdown data/abilities.ts -- Weak Armor Gen 7+: spe +2
      // Source: Bulbapedia "Weak Armor" -- "+2 Speed from Gen VII onwards"
      const ctx = createAbilityContext({
        ability: abilityIds.weakArmor,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.defense,
          stages: -1,
        },
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.speed,
          stages: 2,
        },
      ]);
    });

    it("given a special hit, when Weak Armor is checked, then does not trigger", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.weakArmor,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Stamina (carried from Gen 7)", () => {
    it("given any damaging move, when Stamina triggers, then +1 Defense", () => {
      // Source: Showdown data/abilities.ts -- Stamina onDamagingHit
      const ctx = createAbilityContext({
        ability: abilityIds.stamina,
        trigger: triggerIds.onDamageTaken,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
          target: BATTLE_EFFECT_TARGETS.self,
          stat: CORE_STAT_IDS.defense,
          stages: 1,
        },
      ]);
    });
  });

  // ---- Protean / Libero (Libero new in Gen 8) ----

  describe("Protean / Libero", () => {
    it("given Protean and a move type not matching current type, when used before move, then changes type", () => {
      // Source: Showdown data/abilities.ts -- protean: onPrepareHit
      const flamethrowerMove = createCanonicalMove(moveIds.flamethrower);
      const ctx = createAbilityContext({
        ability: abilityIds.protean,
        trigger: triggerIds.onBeforeMove,
        types: [typeIds.normal],
        move: flamethrowerMove,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
          target: BATTLE_EFFECT_TARGETS.self,
          types: [flamethrowerMove.type],
        },
      ]);
    });

    it("given Libero and a move type not matching current type, when used before move, then changes type", () => {
      // Source: Showdown data/abilities.ts -- libero: same as protean
      // Source: Bulbapedia "Libero" -- "same effect as Protean, introduced in Gen 8"
      const thunderboltMove = createCanonicalMove(moveIds.thunderbolt);
      const ctx = createAbilityContext({
        ability: abilityIds.libero,
        trigger: triggerIds.onBeforeMove,
        types: [typeIds.fire],
        move: thunderboltMove,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        {
          effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
          target: BATTLE_EFFECT_TARGETS.self,
          types: [thunderboltMove.type],
        },
      ]);
    });

    it("given Protean and the move type already matches, when used before move, then does not activate", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.protean,
        trigger: triggerIds.onBeforeMove,
        types: [typeIds.fire],
        move: createCanonicalMove(moveIds.flamethrower),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Moody — Gen 8 vs Gen 5-7 cross-gen boundary test
// ---------------------------------------------------------------------------

describe("Gen 8 Moody — accuracy/evasion excluded from stat pool", () => {
  // Source: Showdown data/abilities.ts -- Moody in Gen 8 only uses atk/def/spa/spd/spe
  // Source: Bulbapedia "Moody" -- "From Generation VIII onwards, Moody can no longer
  //   raise or lower Accuracy or Evasion"

  const ELIGIBLE_STATS = [
    CORE_STAT_IDS.attack,
    CORE_STAT_IDS.defense,
    CORE_STAT_IDS.spAttack,
    CORE_STAT_IDS.spDefense,
    CORE_STAT_IDS.speed,
  ] as const;

  it("given Moody in Gen 8, when on-turn-end fires with all stats at 0, then raises one of the 5 eligible stats by 2", () => {
    // Source: Showdown data/abilities.ts -- Moody onResidual: boost one of [atk,def,spa,spd,spe] by +2
    // Source: Bulbapedia "Moody" -- Gen 8 pool is exactly these 5 stats
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: triggerIds.onTurnEnd,
      seed: 42,
    });
    const result = handleGen8StatAbility(ctx);

    expect(result.activated).toBe(true);
    const raiseEffect = result.effects.find(
      (e) =>
        e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
        (e as Extract<AbilityEffect, { effectType: "stat-change" }>).stages === 2,
    );
    const raisedStat = (
      raiseEffect as Extract<AbilityEffect, { effectType: "stat-change" }> | undefined
    )?.stat;
    expect(ELIGIBLE_STATS).toContain(raisedStat);
    // Accuracy and evasion must NOT be raised by Gen 8 Moody
    expect(raisedStat).not.toBe(CORE_STAT_IDS.accuracy);
    expect(raisedStat).not.toBe(CORE_STAT_IDS.evasion);
  });

  it("given Moody in Gen 8, when on-turn-end fires, then lowers one of the 5 eligible stats by 1", () => {
    // Source: Showdown data/abilities.ts -- Moody onResidual: lower a different stat by -1
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: triggerIds.onTurnEnd,
      seed: 42,
    });
    const result = handleGen8StatAbility(ctx);

    expect(result.activated).toBe(true);
    const lowerEffect = result.effects.find(
      (e) =>
        e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
        (e as Extract<AbilityEffect, { effectType: "stat-change" }>).stages === -1,
    );
    const loweredStat = (
      lowerEffect as Extract<AbilityEffect, { effectType: "stat-change" }> | undefined
    )?.stat;
    expect(ELIGIBLE_STATS).toContain(loweredStat);
    // Accuracy and evasion must NOT be lowered by Gen 8 Moody either
    expect(loweredStat).not.toBe(CORE_STAT_IDS.accuracy);
    expect(loweredStat).not.toBe(CORE_STAT_IDS.evasion);
  });

  it("given Moody in Gen 8, when on-turn-end fires, then raised stat and lowered stat are different", () => {
    // Source: Showdown data/abilities.ts -- Moody raises one stat and lowers a DIFFERENT one
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: triggerIds.onTurnEnd,
      seed: 42,
    });
    const result = handleGen8StatAbility(ctx);

    const raiseEffect = result.effects.find(
      (e) =>
        e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
        (e as Extract<AbilityEffect, { effectType: "stat-change" }>).stages === 2,
    );
    const lowerEffect = result.effects.find(
      (e) =>
        e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
        (e as Extract<AbilityEffect, { effectType: "stat-change" }>).stages === -1,
    );
    expect(
      (raiseEffect as Extract<AbilityEffect, { effectType: "stat-change" }> | undefined)?.stat,
    ).not.toBe(
      (lowerEffect as Extract<AbilityEffect, { effectType: "stat-change" }> | undefined)?.stat,
    );
  });

  it("given Moody in Gen 8, when a stat is already at +6, then that stat is excluded from the raise pool", () => {
    // Source: Showdown data/abilities.ts -- Moody plusPool excludes stats already at +6
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: triggerIds.onTurnEnd,
      seed: 99,
    });
    // Set attack to +6 (maxed) — should not be raised further
    ctx.pokemon.statStages.attack = 6;
    ctx.pokemon.statStages.defense = 6;
    ctx.pokemon.statStages.spAttack = 6;
    ctx.pokemon.statStages.spDefense = 6;
    // Only speed can be raised
    ctx.pokemon.statStages.speed = 0;

    const result = handleGen8StatAbility(ctx);
    if (result.activated) {
      const raiseEffect = result.effects.find(
        (e) =>
          e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
          (e as Extract<AbilityEffect, { effectType: "stat-change" }>).stages === 2,
      );
      if (raiseEffect) {
        expect((raiseEffect as Extract<AbilityEffect, { effectType: "stat-change" }>).stat).toBe(
          CORE_STAT_IDS.speed,
        );
      }
    }
  });

  it("given Moody in Gen 8 vs Gen 5-7 cross-gen boundary, then Gen 8 pool is exactly 5 stats (no accuracy/evasion)", () => {
    // Cross-gen regression: Gen 5-7 Moody can raise/lower all 7 stats including accuracy/evasion.
    // Gen 8 Moody is restricted to the 5 battle stats only.
    // Source: Bulbapedia "Moody" -- "From Generation VIII onwards, Moody can no longer
    //   raise or lower Accuracy or Evasion. This changed in Generation VIII."
    // This test runs 100 seeds to confirm accuracy/evasion never appear in Gen 8 Moody pool.
    const INELIGIBLE_STATS = [CORE_STAT_IDS.accuracy, CORE_STAT_IDS.evasion];
    for (let seed = 0; seed < 100; seed++) {
      const ctx = createAbilityContext({
        ability: abilityIds.moody,
        trigger: triggerIds.onTurnEnd,
        seed,
      });
      const result = handleGen8StatAbility(ctx);
      for (const effect of result.effects) {
        if (effect.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange) {
          const stat = (effect as Extract<AbilityEffect, { effectType: "stat-change" }>).stat;
          expect(INELIGIBLE_STATS).not.toContain(stat);
        }
      }
    }
  });
});
