/**
 * Tests for Gen 5 status/utility move effect handlers.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: Bulbapedia -- individual move pages
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { executeGen5MoveEffect } from "../src/Gen5MoveEffects";
import {
  ENTRAINMENT_SOURCE_BLOCKED,
  ENTRAINMENT_TARGET_BLOCKED,
  handleGen5StatusMove,
  isBerry,
} from "../src/Gen5MoveEffectsStatus";

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
  lastMoveUsed?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  priority?: number;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
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
    },
    effect: null,
    description: "",
    generation: 5,
  } as MoveData;
}

function makeState(overrides?: { sides?: any[] }): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: overrides?.sides ?? [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    turnHistory: [],
  } as unknown as BattleState;
}

function makeContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
  };
}

// ===========================================================================
// isBerry helper
// ===========================================================================

describe("isBerry", () => {
  it("given a sitrus-berry, when checked, then returns true", () => {
    // Source: Showdown data/items.ts -- sitrus-berry has isBerry: true
    expect(isBerry("sitrus-berry")).toBe(true);
  });

  it("given a lum-berry, when checked, then returns true", () => {
    // Source: Showdown data/items.ts -- lum-berry has isBerry: true
    expect(isBerry("lum-berry")).toBe(true);
  });

  it("given a leftovers (not a berry), when checked, then returns false", () => {
    // Source: Showdown data/items.ts -- leftovers is not a berry
    expect(isBerry("leftovers")).toBe(false);
  });

  it("given a life-orb (not a berry), when checked, then returns false", () => {
    // Source: Showdown data/items.ts -- life-orb is not a berry
    expect(isBerry("life-orb")).toBe(false);
  });

  it("given null, when checked, then returns false", () => {
    expect(isBerry(null)).toBe(false);
  });

  it("given undefined, when checked, then returns false", () => {
    expect(isBerry(undefined)).toBe(false);
  });

  it("given empty string, when checked, then returns false", () => {
    expect(isBerry("")).toBe(false);
  });
});

// ===========================================================================
// Heal Pulse
// ===========================================================================

describe("Heal Pulse", () => {
  it("given a target with 200 max HP, when Heal Pulse is used, then heals 100 HP (ceil of 50%)", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(target.baseMaxhp * 0.5)
    // 200 * 0.5 = 100, ceil(100) = 100
    const ctx = makeContext({
      defender: makeActive({ hp: 200, currentHp: 50 }),
      move: makeMove({ id: "heal-pulse", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(100);
  });

  it("given a target with 201 max HP, when Heal Pulse is used, then heals 101 HP (ceil rounds up)", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(target.baseMaxhp * 0.5)
    // 201 * 0.5 = 100.5, ceil(100.5) = 101
    const ctx = makeContext({
      defender: makeActive({ hp: 201, currentHp: 50 }),
      move: makeMove({ id: "heal-pulse", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(101);
  });

  it("given a target with 1 max HP (Shedinja), when Heal Pulse is used, then heals 1 HP", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(1 * 0.5) = 1
    const ctx = makeContext({
      defender: makeActive({ hp: 1, currentHp: 1 }),
      move: makeMove({ id: "heal-pulse", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(1);
  });
});

// ===========================================================================
// Aromatherapy
// ===========================================================================

describe("Aromatherapy", () => {
  it("given Aromatherapy is used, when executed, then cures status for the attacker's team", () => {
    // Source: Showdown gen5/moves.ts aromatherapy -- cures ALL allies, no Soundproof check
    const ctx = makeContext({
      move: makeMove({ id: "aromatherapy", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result!.messages).toContain("A soothing aroma wafted through the area!");
  });

  it("given Aromatherapy result, when checking, then does NOT reset stat stages", () => {
    // Source: Showdown gen5/moves.ts -- aromatherapy only cures status, no stat reset
    // statusCuredOnly (not statusCured) means no stat reset
    const ctx = makeContext({
      move: makeMove({ id: "aromatherapy", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // statusCuredOnly cures status without resetting stat stages
    expect(result!.statusCuredOnly).not.toBeNull();
    // statStagesReset should not be set
    expect(result!.statStagesReset).toBeUndefined();
  });
});

// ===========================================================================
// Heal Bell
// ===========================================================================

describe("Heal Bell", () => {
  it("given Heal Bell is used, when executed, then cures status for the attacker's team", () => {
    // Source: Showdown gen5/moves.ts healbell -- cures ALL allies, no Soundproof check
    const ctx = makeContext({
      move: makeMove({ id: "heal-bell", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result!.messages).toContain("A bell chimed!");
  });

  it("given Heal Bell result, when checking, then does NOT reset stat stages", () => {
    // Source: Showdown gen5/moves.ts -- healbell only cures status, no stat reset
    const ctx = makeContext({
      move: makeMove({ id: "heal-bell", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusCuredOnly).not.toBeNull();
    expect(result!.statStagesReset).toBeUndefined();
  });
});

// ===========================================================================
// Soak
// ===========================================================================

describe("Soak", () => {
  it("given a Normal-type target, when Soak is used, then changes target to Water type", () => {
    // Source: Showdown gen5/moves.ts soak -- sets target type to Water
    const ctx = makeContext({
      defender: makeActive({ types: ["normal"] }),
      move: makeMove({ id: "soak", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.typeChange).toEqual({ target: "defender", types: ["water"] });
  });

  it("given a Water-type target in Gen 5, when Soak is used, then SUCCEEDS (no Water-type failure check)", () => {
    // Source: Showdown gen5/moves.ts soak -- no `target.getTypes().join() === 'Water'` check
    // This is the key Gen 5 vs Gen 6+ difference: Gen 5 does NOT fail on Water-type targets.
    const ctx = makeContext({
      defender: makeActive({ types: ["water"] }),
      move: makeMove({ id: "soak", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.typeChange).toEqual({ target: "defender", types: ["water"] });
  });

  it("given a Fire/Flying target, when Soak is used, then changes to pure Water type", () => {
    // Source: Showdown gen5/moves.ts soak -- replaces all types with Water
    const ctx = makeContext({
      defender: makeActive({ types: ["fire", "flying"] }),
      move: makeMove({ id: "soak", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.typeChange).toEqual({ target: "defender", types: ["water"] });
  });

  it("given a target with Multitype, when Soak is used, then fails", () => {
    // Source: Showdown gen5/moves.ts soak -- fails if setType returns false
    // Multitype prevents type changes (cantsuppress flag)
    const ctx = makeContext({
      defender: makeActive({ types: ["normal"], ability: "multitype" }),
      move: makeMove({ id: "soak", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.typeChange).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Incinerate
// ===========================================================================

describe("Incinerate", () => {
  it("given a target holding a sitrus-berry, when Incinerate is used, then destroys the berry", () => {
    // Source: Showdown gen5/moves.ts incinerate -- if (item.isBerry) takeItem
    const defender = makeActive({ heldItem: "sitrus-berry" });
    const ctx = makeContext({
      defender,
      move: makeMove({ id: "incinerate", type: "fire", power: 30 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(defender.pokemon.heldItem).toBeNull();
    expect(result!.messages[0]).toContain("sitrus-berry");
    expect(result!.messages[0]).toContain("incinerated");
  });

  it("given a target holding a lum-berry, when Incinerate is used, then destroys the berry", () => {
    // Source: Showdown gen5/moves.ts incinerate -- if (item.isBerry) takeItem
    const defender = makeActive({ heldItem: "lum-berry" });
    const ctx = makeContext({
      defender,
      move: makeMove({ id: "incinerate", type: "fire", power: 30 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given a target holding a fire-gem in Gen 5, when Incinerate is used, then does NOT destroy the gem", () => {
    // Source: Showdown gen5/moves.ts incinerate -- only checks item.isBerry, NOT item.isGem
    // This is the key Gen 5 vs Gen 6+ difference: Gen 5 Incinerate only destroys Berries
    const defender = makeActive({ heldItem: "fire-gem" });
    const ctx = makeContext({
      defender,
      move: makeMove({ id: "incinerate", type: "fire", power: 30 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Gem should NOT be destroyed
    expect(defender.pokemon.heldItem).toBe("fire-gem");
    expect(result!.messages).toEqual([]);
  });

  it("given a target with no item, when Incinerate is used, then no item is destroyed", () => {
    // Source: Showdown gen5/moves.ts incinerate -- no item to destroy
    const defender = makeActive({ heldItem: null });
    const ctx = makeContext({
      defender,
      move: makeMove({ id: "incinerate", type: "fire", power: 30 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toEqual([]);
  });

  it("given a target holding leftovers, when Incinerate is used, then does not destroy it", () => {
    // Source: Showdown gen5/moves.ts incinerate -- leftovers is not a berry
    const defender = makeActive({ heldItem: "leftovers" });
    const ctx = makeContext({
      defender,
      move: makeMove({ id: "incinerate", type: "fire", power: 30 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(defender.pokemon.heldItem).toBe("leftovers");
    expect(result!.messages).toEqual([]);
  });
});

// ===========================================================================
// Bestow
// ===========================================================================

describe("Bestow", () => {
  it("given user has leftovers and target has no item, when Bestow is used, then transfers item", () => {
    // Source: Showdown data/moves.ts bestow -- source.takeItem() + target.setItem()
    const ctx = makeContext({
      attacker: makeActive({ heldItem: "leftovers", nickname: "Audino" }),
      defender: makeActive({ heldItem: null, nickname: "Chansey" }),
      move: makeMove({ id: "bestow", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "attacker", to: "defender" });
  });

  it("given target already has an item, when Bestow is used, then fails", () => {
    // Source: Showdown data/moves.ts bestow -- if (target.item) return false
    const ctx = makeContext({
      attacker: makeActive({ heldItem: "leftovers" }),
      defender: makeActive({ heldItem: "life-orb" }),
      move: makeMove({ id: "bestow", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given user has no item, when Bestow is used, then fails", () => {
    // Source: Showdown data/moves.ts bestow -- const myItem = source.takeItem(); if (!myItem) return false
    const ctx = makeContext({
      attacker: makeActive({ heldItem: null }),
      defender: makeActive({ heldItem: null }),
      move: makeMove({ id: "bestow", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Entrainment
// ===========================================================================

describe("Entrainment", () => {
  it("given user has Intimidate and target has Overgrow, when Entrainment is used, then succeeds", () => {
    // Source: Showdown data/moves.ts entrainment -- ability change succeeds
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "overgrow", nickname: "Serperior" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toContain("intimidate");
  });

  it("given target already has the same ability, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- target.ability === source.ability -> false
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "intimidate" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Truant, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- target.ability === 'truant' -> false
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "truant" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Multitype, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress flag blocks
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "multitype" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given target has Zen Mode, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress flag blocks
    const ctx = makeContext({
      attacker: makeActive({ ability: "intimidate" }),
      defender: makeActive({ ability: "zen-mode" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given user has Trace (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = makeContext({
      attacker: makeActive({ ability: "trace" }),
      defender: makeActive({ ability: "overgrow" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given user has Forecast (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = makeContext({
      attacker: makeActive({ ability: "forecast" }),
      defender: makeActive({ ability: "overgrow" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });

  it("given user has Illusion (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = makeContext({
      attacker: makeActive({ ability: "illusion" }),
      defender: makeActive({ ability: "overgrow" }),
      move: makeMove({ id: "entrainment", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Entrainment constants
// ===========================================================================

describe("Entrainment blocked sets", () => {
  it("given ENTRAINMENT_TARGET_BLOCKED, when checked, then contains multitype, zen-mode, truant", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress + truant check
    expect(ENTRAINMENT_TARGET_BLOCKED.has("multitype")).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.has("zen-mode")).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.has("truant")).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.size).toBe(3);
  });

  it("given ENTRAINMENT_SOURCE_BLOCKED, when checked, then contains noentrain abilities", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    // Source: Bulbapedia -- Entrainment: Flower Gift, Forecast, Illusion, Imposter, Trace, Zen Mode
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("flower-gift")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("forecast")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("illusion")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("imposter")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("trace")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has("zen-mode")).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.size).toBe(6);
  });
});

// ===========================================================================
// Round
// ===========================================================================

describe("Round", () => {
  it("given Round is used in singles, when executed, then returns a result (no doubling in singles)", () => {
    // Source: Showdown data/moves.ts round -- basePowerCallback doubles if move.sourceEffect === 'round'
    // In singles, there's no ally, so the doubling doesn't apply.
    const ctx = makeContext({
      move: makeMove({ id: "round", type: "normal", category: "special", power: 60 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // Round's effect handler returns a normal result; BP doubling is in damage calc
    expect(result!.messages).toEqual([]);
  });
});

// ===========================================================================
// Dispatch null-return for unrecognized moves
// ===========================================================================

describe("handleGen5StatusMove dispatch", () => {
  it("given an unrecognized move, when dispatched, then returns null", () => {
    // Source: dispatcher pattern -- returns null for unrecognized moves
    const ctx = makeContext({
      move: makeMove({ id: "thunderbolt", type: "electric", category: "special", power: 95 }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toBeNull();
  });

  it("given Heal Pulse, when dispatched through handleGen5StatusMove, then returns a heal result", () => {
    // Source: Showdown gen5/moves.ts healpulse -- verify dispatch routing
    const ctx = makeContext({
      defender: makeActive({ hp: 300 }),
      move: makeMove({ id: "heal-pulse", category: "status", power: null }),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    // 300 * 0.5 = 150, ceil(150) = 150
    expect(result!.healAmount).toBe(150);
  });
});

// ===========================================================================
// Master dispatcher integration
// ===========================================================================

describe("executeGen5MoveEffect integration", () => {
  it("given a status move (Heal Pulse), when dispatched through master dispatcher, then reaches status handler", () => {
    // Source: Gen5MoveEffects.ts master dispatcher -- step 4: status handler
    const ctx = makeContext({
      defender: makeActive({ hp: 400 }),
      move: makeMove({ id: "heal-pulse", category: "status", power: null }),
    });
    const rng = new SeededRandom(42);
    const rollProtectSuccess = () => true;

    const result = executeGen5MoveEffect(ctx, rng, rollProtectSuccess);

    expect(result).not.toBeNull();
    // 400 * 0.5 = 200, ceil(200) = 200
    expect(result!.healAmount).toBe(200);
  });

  it("given an unrecognized move, when dispatched through master dispatcher, then returns null", () => {
    // Source: Gen5MoveEffects.ts master dispatcher -- falls through all handlers
    const ctx = makeContext({
      move: makeMove({ id: "unknown-move" }),
    });
    const rng = new SeededRandom(42);
    const rollProtectSuccess = () => true;

    const result = executeGen5MoveEffect(ctx, rng, rollProtectSuccess);

    expect(result).toBeNull();
  });
});
