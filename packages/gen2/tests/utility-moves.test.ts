import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  SeededRandom,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { applyMoveEffect, type MutableResult } from "../src/Gen2MoveEffects";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number): SeededRandom {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as SeededRandom;
}

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  types?: PokemonType[];
  status?: "burn" | "paralysis" | "sleep" | "poison" | "freeze" | null;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
  nickname?: string | null;
  lastMoveUsed?: string | null;
  friendship?: number;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  currentHp?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.currentHp ?? 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 200,
    moves: opts.moves ?? [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: opts.friendship ?? 70,
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
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
    ability: "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
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

/** Create a move mock with the given type and power. */
function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "normal",
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    },
    effect: null,
    description: "",
    generation: 2,
    ...overrides,
  } as MoveData;
}

function createMockState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    weather: null,
    sides: [
      {
        index: 0 as const,
        active: [attacker],
        team: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
      {
        index: 1 as const,
        active: [defender],
        team: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
    ],
  } as unknown as BattleState;
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

/** Minimal species data mock. */
function createSpecies() {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"],
    baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    abilities: { normal: [""], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1, weight: 10 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 2,
    isLegendary: false,
    isMythical: false,
  };
}

/** Create a fresh MutableResult for effect testing. */
function createEmptyResult(): MutableResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Utility Moves", () => {
  // -------------------------------------------------------------------
  // Encore
  // -------------------------------------------------------------------

  describe("Encore", () => {
    it("given defender has used a move with PP remaining, when Encore is used, then volatile is set with moveIndex", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore forces the target to repeat its last used move for 2-6 turns
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "tackle",
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35 },
          { moveId: "growl", currentPP: 40, maxPP: 40 },
        ],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(4); // rng.int(2, 6) returns 4 turns

      const result = createEmptyResult();
      const move = createMove("encore", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "encore", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBe("encore");
      expect(result.volatileData).toBeDefined();
      expect(result.volatileData?.turnsLeft).toBe(4);
      expect(result.volatileData?.data?.moveIndex).toBe(0);
    });

    it("given defender has not used a move yet, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore fails if the target has not yet used a move
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: null,
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("encore", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "encore", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move has 0 PP, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore fails if the encored move has 0 PP
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "tackle",
        moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("encore", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "encore", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move is not in its current moveset, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal — Encore fails if the target no longer knows the move
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "fire-blast",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("encore", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "encore", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // -------------------------------------------------------------------
  // Disable
  // -------------------------------------------------------------------

  describe("Disable", () => {
    it("given defender has used a move with PP remaining, when Disable is used, then volatile is set with moveId", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect
      // Disable prevents the target from using its last-used move for 1-7 turns
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "tackle",
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35 },
          { moveId: "growl", currentPP: 40, maxPP: 40 },
        ],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(5); // rng.int(1, 7) returns 5 turns

      const result = createEmptyResult();
      const move = createMove("disable", {
        category: "status",
        power: null,
        accuracy: 55,
        effect: { type: "volatile-status", status: "disable", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBe("disable");
      expect(result.volatileData).toBeDefined();
      expect(result.volatileData?.turnsLeft).toBe(5);
      expect(result.volatileData?.data?.moveId).toBe("tackle");
    });

    it("given defender has not used a move yet, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect
      // Disable fails if the target has not yet used a move
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: null,
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("disable", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "disable", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender already has Disable volatile, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal — Disable fails if the target already has a disabled move
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "tackle",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      defender.volatileStatuses.set("disable", { turnsLeft: 3, data: { moveId: "growl" } });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("disable", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "disable", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move has 0 PP, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal — Disable fails if the move has 0 PP
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({
        lastMoveUsed: "tackle",
        moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = createMove("disable", {
        category: "status",
        power: null,
        effect: { type: "volatile-status", status: "disable", chance: 100 } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // -------------------------------------------------------------------
  // Baton Pass
  // -------------------------------------------------------------------

  describe("Baton Pass", () => {
    it("given switch-out effect with baton-pass id, when used, then switchOut and batonPass are true", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // Baton Pass sets switchOut and batonPass flags for the engine
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({});
      const state = createMockState(attacker, defender);
      const rng = createMockRng(0);

      const result = createEmptyResult();
      const move = createMove("baton-pass", {
        category: "status",
        power: null,
        effect: { type: "switch-out", target: "self" } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.batonPass).toBe(true);
    });

    it("given custom-effect baton-pass, when used, then switchOut and batonPass are true", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // The custom handler also sets both flags
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({});
      const state = createMockState(attacker, defender);
      const rng = createMockRng(0);

      const result = createEmptyResult();
      const move = createMove("baton-pass", {
        category: "status",
        power: null,
        effect: { type: "custom" } as any,
      });

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.batonPass).toBe(true);
    });

    it("given Baton Pass switch, when onSwitchOut is called, then confusion and focus-energy are preserved", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // Baton Pass preserves confusion, focus-energy, leech-seed for the incoming Pokemon
      const ruleset = new Gen2Ruleset();
      const pokemon = createActivePokemon({ lastMoveUsed: "baton-pass" });
      pokemon.volatileStatuses.set("confusion", { turnsLeft: 3 });
      pokemon.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
      pokemon.volatileStatuses.set("leech-seed", { turnsLeft: -1 });

      const state = createMockState(pokemon, createActivePokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: baton-passable volatiles are preserved
      expect(pokemon.volatileStatuses.has("confusion")).toBe(true);
      expect(pokemon.volatileStatuses.has("focus-energy")).toBe(true);
      expect(pokemon.volatileStatuses.has("leech-seed")).toBe(true);
    });

    it("given normal switch, when onSwitchOut is called, then confusion and focus-energy are cleared", () => {
      // Source: pret/pokecrystal engine/battle/core.asm NewBattleMonStatus
      // Normal switch clears all non-persistent volatiles
      const ruleset = new Gen2Ruleset();
      const pokemon = createActivePokemon({ lastMoveUsed: "tackle" });
      pokemon.volatileStatuses.set("confusion", { turnsLeft: 3 });
      pokemon.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
      pokemon.volatileStatuses.set("leech-seed", { turnsLeft: -1 });

      const state = createMockState(pokemon, createActivePokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: volatiles are cleared
      expect(pokemon.volatileStatuses.has("confusion")).toBe(false);
      expect(pokemon.volatileStatuses.has("focus-energy")).toBe(false);
      expect(pokemon.volatileStatuses.has("leech-seed")).toBe(false);
    });

    it("given Baton Pass switch, when onSwitchOut is called, then encore/disable are still cleared", () => {
      // Source: pret/pokecrystal — encore and disable are tied to the user, not baton-passable
      const ruleset = new Gen2Ruleset();
      const pokemon = createActivePokemon({ lastMoveUsed: "baton-pass" });
      pokemon.volatileStatuses.set("encore", { turnsLeft: 3, data: { moveIndex: 0 } });
      pokemon.volatileStatuses.set("disable", { turnsLeft: 5, data: { moveId: "tackle" } });

      const state = createMockState(pokemon, createActivePokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: encore and disable are always cleared (not baton-passable)
      expect(pokemon.volatileStatuses.has("encore")).toBe(false);
      expect(pokemon.volatileStatuses.has("disable")).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Return and Frustration
  // -------------------------------------------------------------------

  describe("Return", () => {
    it("given max friendship (255), when Return is used, then base power = floor(255/2.5) = 102", () => {
      // Source: Bulbapedia — "Return does damage, and its base power is friendship / 2.5 (rounded down)"
      // floor(255 / 2.5) = floor(102) = 102
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        friendship: 255,
        types: ["fighting"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies();

      // Using max roll (255) for predictable damage
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: createMove("return", {
            type: "normal",
            category: "physical",
            power: null,
            effect: { type: "custom" } as any,
          }),
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species as any,
      );

      // With power=102, L50, 100 Atk vs 100 Def, no STAB, max roll (255):
      // levelFactor = floor(2*50/5)+2 = 22
      // Step 1: floor(floor(22 * 102 * 100) / 100 / 50) = floor(224400/100/50) = floor(44.88) = 44
      // Step 5: +2 = 46
      // Step 9: floor(46 * 255/255) = 46
      // Source: inline formula derivation
      expect(result.damage).toBe(46);
      expect(result.effectiveness).toBe(1);
    });

    it("given friendship 0, when Return is used, then base power = max(1, floor(0/2.5)) = 1", () => {
      // Source: Bulbapedia — "Return: base power = friendship / 2.5, minimum 1"
      // floor(0 / 2.5) = 0, minimum 1
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        friendship: 0,
        types: ["fighting"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies();
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: createMove("return", {
            type: "normal",
            category: "physical",
            power: null,
            effect: { type: "custom" } as any,
          }),
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species as any,
      );

      // With power=1, L50, 100 Atk vs 100 Def, no STAB:
      // levelFactor = 22
      // Step 1: floor(floor(22 * 1 * 100) / 100 / 50) = floor(2200/100/50) = floor(0.44) = 0
      // Step 4: clamp to min 1
      // Step 5: +2 = 3
      // Step 9: floor(3 * 255/255) = 3
      // Source: inline formula derivation
      expect(result.damage).toBe(3);
    });

    it("given friendship 100, when Return is used, then base power = floor(100/2.5) = 40", () => {
      // Source: Bulbapedia — "Return: base power = friendship / 2.5 (rounded down)"
      // floor(100 / 2.5) = floor(40) = 40
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        friendship: 100,
        types: ["fighting"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies();
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: createMove("return", {
            type: "normal",
            category: "physical",
            power: null,
            effect: { type: "custom" } as any,
          }),
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species as any,
      );

      // With power=40, L50, 100 Atk vs 100 Def, no STAB, max roll:
      // levelFactor = 22
      // Step 1: floor(floor(22 * 40 * 100) / 100 / 50) = floor(88000/100/50) = floor(17.6) = 17
      // Step 5: +2 = 19
      // Step 9: floor(19 * 255/255) = 19
      // Source: inline formula derivation
      expect(result.damage).toBe(19);
    });
  });

  describe("Frustration", () => {
    it("given friendship 0, when Frustration is used, then base power = floor((255-0)/2.5) = 102", () => {
      // Source: Bulbapedia — "Frustration: base power = (255 - friendship) / 2.5, rounded down"
      // floor(255 / 2.5) = 102
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        friendship: 0,
        types: ["fighting"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies();
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: createMove("frustration", {
            type: "normal",
            category: "physical",
            power: null,
            effect: { type: "custom" } as any,
          }),
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species as any,
      );

      // Same calc as Return at max friendship: power = 102, no STAB
      // levelFactor = 22
      // Step 1: floor(floor(22 * 102 * 100) / 100 / 50) = 44
      // Step 5: +2 = 46
      // Step 9: floor(46 * 255/255) = 46
      // Source: inline formula derivation
      expect(result.damage).toBe(46);
    });

    it("given friendship 255, when Frustration is used, then base power = max(1, floor(0/2.5)) = 1", () => {
      // Source: Bulbapedia — "Frustration: base power = (255 - friendship) / 2.5, minimum 1"
      // (255-255) / 2.5 = 0, minimum 1
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        friendship: 255,
        types: ["fighting"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies();
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: createMove("frustration", {
            type: "normal",
            category: "physical",
            power: null,
            effect: { type: "custom" } as any,
          }),
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species as any,
      );

      // Power = 1, same as Return at friendship=0, no STAB
      // levelFactor = 22
      // Step 1: floor(floor(22 * 1 * 100) / 100 / 50) = 0
      // Step 4: clamp to min 1
      // Step 5: +2 = 3
      // Step 9: floor(3 * 255/255) = 3
      // Source: inline formula derivation
      expect(result.damage).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // End-of-Turn Order
  // -------------------------------------------------------------------

  describe("End-of-Turn Order", () => {
    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then disable-countdown is included", () => {
      // Source: pret/pokecrystal — Disable has a finite duration that counts down each turn
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      expect(eotOrder).toContain("disable-countdown");
    });

    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then disable-countdown is before encore-countdown", () => {
      // Source: pret/pokecrystal engine/battle/core.asm HandleBetweenTurnEffects
      // Disable countdown fires before Encore (jp HandleEncore is the final call)
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      const encoreIdx = eotOrder.indexOf("encore-countdown");
      const disableIdx = eotOrder.indexOf("disable-countdown");
      expect(encoreIdx).toBeGreaterThanOrEqual(0);
      expect(disableIdx).toBeGreaterThanOrEqual(0);
      expect(disableIdx).toBeLessThan(encoreIdx);
    });

    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then encore-countdown is the last effect", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:296 — jp HandleEncore is the final call
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      expect(eotOrder[eotOrder.length - 1]).toBe("encore-countdown");
    });
  });

  // -------------------------------------------------------------------
  // onSwitchOut clears encore and disable
  // -------------------------------------------------------------------

  describe("onSwitchOut volatile cleanup", () => {
    it("given Pokemon has encore volatile, when switching out normally, then encore is cleared", () => {
      // Source: pret/pokecrystal — volatile statuses are cleared on switch-out
      const ruleset = new Gen2Ruleset();
      const pokemon = createActivePokemon({ lastMoveUsed: "tackle" });
      pokemon.volatileStatuses.set("encore", { turnsLeft: 3, data: { moveIndex: 0 } });
      const state = createMockState(pokemon, createActivePokemon({}));

      ruleset.onSwitchOut(pokemon, state);

      expect(pokemon.volatileStatuses.has("encore")).toBe(false);
    });

    it("given Pokemon has disable volatile, when switching out normally, then disable is cleared", () => {
      // Source: pret/pokecrystal — volatile statuses are cleared on switch-out
      const ruleset = new Gen2Ruleset();
      const pokemon = createActivePokemon({ lastMoveUsed: "tackle" });
      pokemon.volatileStatuses.set("disable", { turnsLeft: 5, data: { moveId: "growl" } });
      const state = createMockState(pokemon, createActivePokemon({}));

      ruleset.onSwitchOut(pokemon, state);

      expect(pokemon.volatileStatuses.has("disable")).toBe(false);
    });
  });
});
