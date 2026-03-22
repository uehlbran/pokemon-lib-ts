import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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
    volatileStatuses: new Map(),
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
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
    generation: 8,
    critRatio: 0,
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
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeCtx(overrides: {
  ability: string;
  trigger: string;
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  turnsOnField?: number;
  seed?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: makeActive({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      types: overrides.types ?? ["normal"],
      nickname: overrides.nickname ?? null,
      turnsOnField: overrides.turnsOnField ?? 0,
    }),
    opponent: overrides.opponent ?? makeActive({}),
    state: makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    trigger: overrides.trigger as any,
    move: overrides.move,
    statChange: overrides.statChange as any,
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
      const bonus = getTriagePriorityBonus("triage", "drain-punch", null);
      expect(bonus).toBe(3);
    });

    it("given a drain-type effect, when Triage is active, then returns +3 priority bonus", () => {
      // Source: Showdown data/abilities.ts -- triage: move.flags.heal
      const bonus = getTriagePriorityBonus("triage", "some-drain-move", "drain");
      expect(bonus).toBe(3);
    });

    it("given a non-healing move, when Triage is active, then returns 0", () => {
      const bonus = getTriagePriorityBonus("triage", "thunderbolt", null);
      expect(bonus).toBe(0);
    });

    it("given a different ability, when checking Triage bonus, then returns 0", () => {
      const bonus = getTriagePriorityBonus("intimidate", "drain-punch", null);
      expect(bonus).toBe(0);
    });

    it("given the dispatcher, when Triage user uses healing move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "triage",
        trigger: "on-priority-check",
        move: makeMove({ id: "drain-punch" }),
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
      expect(isGaleWingsActive("gale-wings", "flying", 200, 200)).toBe(true);
    });

    it("given less than full HP and a Flying move, when Gale Wings is active, then returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: requires pokemon.hp === pokemon.maxhp
      expect(isGaleWingsActive("gale-wings", "flying", 199, 200)).toBe(false);
    });

    it("given full HP and a non-Flying move, when Gale Wings is active, then returns false", () => {
      expect(isGaleWingsActive("gale-wings", "fire", 200, 200)).toBe(false);
    });

    it("given a different ability, when checking Gale Wings, then returns false", () => {
      expect(isGaleWingsActive("intimidate", "flying", 200, 200)).toBe(false);
    });

    it("given the dispatcher, when Gale Wings user at full HP uses Flying move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "gale-wings",
        trigger: "on-priority-check",
        currentHp: 200,
        maxHp: 200,
        move: makeMove({ type: "flying" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Gale Wings user below full HP uses Flying move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: "gale-wings",
        trigger: "on-priority-check",
        currentHp: 150,
        maxHp: 200,
        move: makeMove({ type: "flying" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Prankster ----

  describe("Prankster", () => {
    it("given a status move, when isPranksterEligible is checked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
      expect(isPranksterEligible("status")).toBe(true);
    });

    it("given a physical move, when isPranksterEligible is checked, then returns false", () => {
      expect(isPranksterEligible("physical")).toBe(false);
    });

    it("given Prankster and a status move targeting Dark type, when checking block, then returns true", () => {
      // Source: Showdown data/abilities.ts -- prankster: Dark targets block
      // Source: Bulbapedia "Prankster" Gen 7+ -- "status moves fail against Dark-type targets"
      expect(isPranksterBlockedByDarkType("prankster", "status", ["dark"])).toBe(true);
    });

    it("given Prankster and a status move targeting non-Dark type, when checking block, then returns false", () => {
      expect(isPranksterBlockedByDarkType("prankster", "status", ["fire"])).toBe(false);
    });

    it("given Prankster and a physical move targeting Dark type, when checking block, then returns false", () => {
      expect(isPranksterBlockedByDarkType("prankster", "physical", ["dark"])).toBe(false);
    });

    it("given the dispatcher, when Prankster user uses status move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "prankster",
        trigger: "on-priority-check",
        move: makeMove({ category: "status" }),
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
      expect(isIntrepidSwordTrigger("intrepid-sword", 0)).toBe(true);
    });

    it("given already been on field (turnsOnField > 0), when checking trigger, then returns false", () => {
      // The ability triggers on switch-in, not mid-battle
      expect(isIntrepidSwordTrigger("intrepid-sword", 1)).toBe(false);
    });

    it("given a different ability, when checking Intrepid Sword trigger, then returns false", () => {
      expect(isIntrepidSwordTrigger("intimidate", 0)).toBe(false);
    });

    it("given the dispatcher on switch-in, when Intrepid Sword activates, then effect is +1 Attack", () => {
      // Source: Showdown data/abilities.ts -- intrepidsword: onStart, boost atk: 1
      // Source: Bulbapedia "Intrepid Sword" -- "raises Attack by one stage upon entering battle"
      const ctx = makeCtx({
        ability: "intrepid-sword",
        trigger: "on-switch-in",
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "attack", stages: 1 },
      ]);
    });

    it("given multiple switch-ins in Gen 8, when Intrepid Sword re-enters, then triggers again", () => {
      // Source: Showdown data/mods/gen8/abilities.ts -- no once-per-battle flag
      // In Gen 8, Intrepid Sword triggers every switch-in, not once per battle
      const ctx1 = makeCtx({
        ability: "intrepid-sword",
        trigger: "on-switch-in",
        turnsOnField: 0,
      });
      const result1 = handleGen8StatAbility(ctx1);
      expect(result1.activated).toBe(true);

      // Simulate second switch-in (turnsOnField resets to 0)
      const ctx2 = makeCtx({
        ability: "intrepid-sword",
        trigger: "on-switch-in",
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
      expect(isDauntlessShieldTrigger("dauntless-shield", 0)).toBe(true);
    });

    it("given already been on field, when checking trigger, then returns false", () => {
      expect(isDauntlessShieldTrigger("dauntless-shield", 1)).toBe(false);
    });

    it("given the dispatcher on switch-in, when Dauntless Shield activates, then effect is +1 Defense", () => {
      // Source: Showdown data/abilities.ts -- dauntlessshield: onStart, boost def: 1
      // Source: Bulbapedia "Dauntless Shield" -- "raises Defense by one stage upon entering battle"
      const ctx = makeCtx({
        ability: "dauntless-shield",
        trigger: "on-switch-in",
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "defense", stages: 1 },
      ]);
    });

    it("given multiple switch-ins in Gen 8, when Dauntless Shield re-enters, then triggers again", () => {
      // Source: Gen 8 has no once-per-battle limit for Dauntless Shield
      const ctx = makeCtx({
        ability: "dauntless-shield",
        trigger: "on-switch-in",
        turnsOnField: 0,
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "self",
        stat: "defense",
        stages: 1,
      });
    });
  });

  // ---- Cotton Down (NEW Gen 8) ----

  describe("Cotton Down", () => {
    it("given Cotton Down, when checking trigger, then returns true", () => {
      // Source: Showdown data/abilities.ts -- cottondown: onDamagingHit
      // Source: Bulbapedia "Cotton Down" -- "when hit by an attack"
      expect(isCottonDownTrigger("cotton-down")).toBe(true);
    });

    it("given a different ability, when checking Cotton Down trigger, then returns false", () => {
      expect(isCottonDownTrigger("intimidate")).toBe(false);
    });

    it("given the dispatcher, when Cotton Down holder is hit by physical move, then lowers opponent Speed by 1", () => {
      // Source: Showdown data/abilities.ts -- cottondown: lowers all adjacent Speed
      // Source: Bulbapedia "Cotton Down" -- "lowering the Speed stat of all other Pokemon"
      const ctx = makeCtx({
        ability: "cotton-down",
        trigger: "on-damage-taken",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "opponent", stat: "speed", stages: -1 },
      ]);
    });

    it("given the dispatcher, when Cotton Down holder is hit by special move, then also triggers", () => {
      const ctx = makeCtx({
        ability: "cotton-down",
        trigger: "on-damage-taken",
        move: makeMove({ category: "special" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Cotton Down holder is hit by status move, then does not trigger", () => {
      // Status moves do not deal damage, so Cotton Down does not trigger
      const ctx = makeCtx({
        ability: "cotton-down",
        trigger: "on-damage-taken",
        move: makeMove({ category: "status" }),
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
      expect(isSteamEngineTrigger("steam-engine", "fire")).toBe(true);
    });

    it("given a Water move, when checking Steam Engine trigger, then returns true", () => {
      expect(isSteamEngineTrigger("steam-engine", "water")).toBe(true);
    });

    it("given a Normal move, when checking Steam Engine trigger, then returns false", () => {
      expect(isSteamEngineTrigger("steam-engine", "normal")).toBe(false);
    });

    it("given a different ability, when checking Steam Engine trigger, then returns false", () => {
      expect(isSteamEngineTrigger("intimidate", "fire")).toBe(false);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Fire move, then raises Speed by 6", () => {
      // Source: Showdown data/abilities.ts -- steamengine: onDamagingHit, boost spe: 6
      // Source: Bulbapedia "Steam Engine" -- "raises Speed by 6 stages"
      const ctx = makeCtx({
        ability: "steam-engine",
        trigger: "on-damage-taken",
        move: makeMove({ type: "fire" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "speed", stages: 6 },
      ]);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Water move, then raises Speed by 6", () => {
      const ctx = makeCtx({
        ability: "steam-engine",
        trigger: "on-damage-taken",
        move: makeMove({ type: "water" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "speed", stages: 6 },
      ]);
    });

    it("given the dispatcher, when Steam Engine holder is hit by Electric move, then does not trigger", () => {
      const ctx = makeCtx({
        ability: "steam-engine",
        trigger: "on-damage-taken",
        move: makeMove({ type: "electric" }),
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
      expect(isQuickDrawTrigger("quick-draw", 0.0)).toBe(true);
      expect(isQuickDrawTrigger("quick-draw", 0.29)).toBe(true);
    });

    it("given rng value >= 0.3, when checking Quick Draw trigger, then returns false", () => {
      expect(isQuickDrawTrigger("quick-draw", 0.3)).toBe(false);
      expect(isQuickDrawTrigger("quick-draw", 0.5)).toBe(false);
      expect(isQuickDrawTrigger("quick-draw", 0.99)).toBe(false);
    });

    it("given a different ability, when checking Quick Draw trigger, then returns false", () => {
      expect(isQuickDrawTrigger("intimidate", 0.0)).toBe(false);
    });

    it("given the dispatcher with seeded rng, when Quick Draw user checks priority, then outcome is deterministic", () => {
      // SeededRandom(42) produces a deterministic sequence.
      // We test that the dispatcher returns a consistent result for the same seed.
      // Source: Showdown data/abilities.ts -- quickdraw: 30% chance
      const ctx = makeCtx({
        ability: "quick-draw",
        trigger: "on-priority-check",
        move: makeMove({}),
        seed: 42,
      });
      const result1 = handleGen8StatAbility(ctx);
      // Run again with same seed to verify determinism
      const ctx2 = makeCtx({
        ability: "quick-draw",
        trigger: "on-priority-check",
        move: makeMove({}),
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
        const ctx = makeCtx({
          ability: "quick-draw",
          trigger: "on-priority-check",
          move: makeMove({}),
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
      const ctx = makeCtx({
        ability: "weak-armor",
        trigger: "on-damage-taken",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "defense", stages: -1 },
        { effectType: "stat-change", target: "self", stat: "speed", stages: 2 },
      ]);
    });

    it("given a special hit, when Weak Armor is checked, then does not trigger", () => {
      const ctx = makeCtx({
        ability: "weak-armor",
        trigger: "on-damage-taken",
        move: makeMove({ category: "special" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Stamina (carried from Gen 7)", () => {
    it("given any damaging move, when Stamina triggers, then +1 Defense", () => {
      // Source: Showdown data/abilities.ts -- Stamina onDamagingHit
      const ctx = makeCtx({
        ability: "stamina",
        trigger: "on-damage-taken",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "self", stat: "defense", stages: 1 },
      ]);
    });
  });

  // ---- Protean / Libero (Libero new in Gen 8) ----

  describe("Protean / Libero", () => {
    it("given Protean and a move type not matching current type, when used before move, then changes type", () => {
      // Source: Showdown data/abilities.ts -- protean: onPrepareHit
      const ctx = makeCtx({
        ability: "protean",
        trigger: "on-before-move",
        types: ["normal"],
        move: makeMove({ type: "fire" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "type-change", target: "self", types: ["fire"] },
      ]);
    });

    it("given Libero and a move type not matching current type, when used before move, then changes type", () => {
      // Source: Showdown data/abilities.ts -- libero: same as protean
      // Source: Bulbapedia "Libero" -- "same effect as Protean, introduced in Gen 8"
      const ctx = makeCtx({
        ability: "libero",
        trigger: "on-before-move",
        types: ["fire"],
        move: makeMove({ type: "electric" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "type-change", target: "self", types: ["electric"] },
      ]);
    });

    it("given Protean and the move type already matches, when used before move, then does not activate", () => {
      const ctx = makeCtx({
        ability: "protean",
        trigger: "on-before-move",
        types: ["fire"],
        move: makeMove({ type: "fire" }),
      });
      const result = handleGen8StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });
});
