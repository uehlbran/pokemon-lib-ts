/**
 * Targeted branch-coverage tests for Gen 8 Wave 9 — batch 5.
 *
 * Covers previously-uncovered false branches in Gen8Items.ts:
 *   1. getItemDamageModifier — non-matching type-boost, plate, incense; life-orb on status
 *   2. getPinchBerryThreshold — gluttony with fraction > 0.25 (no change); non-gluttony
 *   3. handleEndOfTurn — NO_ACTIVATION false branches for orbs, berries, mental-herb
 *   4. handleOnDamageTaken — NO_ACTIVATION paths for pinch berries, jaboca/rowap, absorb-bulb,
 *      cell-battery, weakness-policy, kee/maranga/luminous-moss/snowball
 *   5. handleOnHit — false branches for shell-bell, life-orb, kings-rock, razor-fang
 *   6. handleOnContact — rocky-helmet with non-contact or missing opponent
 *   7. Positive activation cases — cover the true branch of the same switch arms
 *
 * Source authority: Showdown data/items.ts (Gen 5–9 primary), Bulbapedia item pages.
 */

import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen8HeldItem, getItemDamageModifier, getPinchBerryThreshold } from "../src/Gen8Items";

// ---------------------------------------------------------------------------
// Helper factories (mirror the style used in items.test.ts)
// ---------------------------------------------------------------------------

function makePokemon(overrides: {
  heldItem?: string | null;
  ability?: string;
  types?: PokemonType[];
  hp?: number;
  currentHp?: number;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
      level: 50,
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
      calculatedStats: {
        hp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
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
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
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

function makeState(): BattleState {
  return {
    format: { generation: 8, battleType: "singles" },
    sides: [
      { active: [], bench: [], entryHazards: {} } as any,
      { active: [], bench: [], entryHazards: {} } as any,
    ],
    weather: null,
    terrain: null,
    trickRoom: null,
    magicRoom: null,
    wonderRoom: null,
    gravity: null,
    turnNumber: 1,
  } as BattleState;
}

function makeRng(flinch = false): any {
  return {
    chance: (_p: number) => flinch,
    next: () => 0.5,
    nextInt: (min: number) => min,
    seed: 12345,
    getState: () => 12345,
  };
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  flags?: Partial<{
    contact: boolean;
    sound: boolean;
    punch: boolean;
    bite: boolean;
  }>;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: "test",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: 80,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: overrides.flags?.contact ?? true,
      sound: overrides.flags?.sound ?? false,
      bullet: false,
      pulse: false,
      punch: overrides.flags?.punch ?? false,
      bite: overrides.flags?.bite ?? false,
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
    generation: 8,
    critRatio: 0,
    hasCrashDamage: false,
  } as MoveData;
}

function itemCtx(overrides: {
  heldItem?: string | null;
  ability?: string;
  types?: PokemonType[];
  hp?: number;
  currentHp?: number;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  damage?: number;
  move?: MoveData;
  opponent?: ActivePokemon;
  rng?: any;
}): ItemContext {
  return {
    pokemon: makePokemon({
      heldItem: overrides.heldItem ?? null,
      ability: overrides.ability ?? "none",
      types: overrides.types ?? ["normal"],
      hp: overrides.hp ?? 200,
      currentHp: overrides.currentHp ?? overrides.hp ?? 200,
      status: overrides.status ?? null,
      volatiles: overrides.volatiles ?? new Map(),
    }),
    state: makeState(),
    rng: overrides.rng ?? makeRng(),
    move: overrides.move,
    damage: overrides.damage,
    opponent: overrides.opponent,
  } as ItemContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: getItemDamageModifier — non-matching type (false branches)
// ─────────────────────────────────────────────────────────────────────────────

describe("getItemDamageModifier — non-matching type returns no boost", () => {
  it(
    "given charcoal (fire boost) and water move, " +
      "when getItemDamageModifier, then returns 4096 (no boost)",
    () => {
      // Source: Showdown data/items.ts — type-boost items only apply when type matches
      const result = getItemDamageModifier("charcoal", {
        moveType: "water",
        moveCategory: "physical",
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given flame-plate (fire boost) and grass move, " +
      "when getItemDamageModifier, then returns 4096",
    () => {
      // Source: Showdown data/items.ts — plate items only match the holder's plate type
      const result = getItemDamageModifier("flame-plate", {
        moveType: "grass",
        moveCategory: "physical",
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given odd-incense (psychic incense boost) and fire move, " +
      "when getItemDamageModifier, then returns 4096",
    () => {
      // Source: Showdown data/items.ts — incense items only match their specific type
      const result = getItemDamageModifier("odd-incense", {
        moveType: "fire",
        moveCategory: "special",
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given life-orb and status move, " +
      "when getItemDamageModifier, then returns 4096 (status moves are not damaging)",
    () => {
      // Source: Showdown data/items.ts — Life Orb onModifyDamage only fires for damaging moves
      const result = getItemDamageModifier("life-orb", {
        moveType: "fire",
        moveCategory: "status",
      });
      expect(result).toBe(4096);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: getPinchBerryThreshold
// ─────────────────────────────────────────────────────────────────────────────

describe("getPinchBerryThreshold", () => {
  it(
    "given gluttony and normalFraction = 0.25, " +
      "when getPinchBerryThreshold, then returns 0.5 (gluttony doubles threshold)",
    () => {
      // Source: Bulbapedia — Gluttony: makes Pokemon eat a held Berry when HP drops
      //   to 50% or less instead of the usual 25%
      const result = getPinchBerryThreshold({ ability: "gluttony" }, 0.25);
      expect(result).toBe(0.5);
    },
  );

  it(
    "given gluttony and normalFraction = 0.5 (> 0.25), " +
      "when getPinchBerryThreshold, then returns 0.5 unchanged (condition not met)",
    () => {
      // Source: Showdown data/abilities.ts — Gluttony only doubles fractions <= 0.25
      // 0.5 > 0.25 so the gluttony branch is skipped; returns normalFraction (0.5)
      const result = getPinchBerryThreshold({ ability: "gluttony" }, 0.5);
      expect(result).toBe(0.5);
    },
  );

  it(
    "given non-gluttony ability and normalFraction = 0.25, " +
      "when getPinchBerryThreshold, then returns 0.25 (no change)",
    () => {
      // Source: Showdown data/abilities.ts — only Gluttony modifies the pinch threshold
      const result = getPinchBerryThreshold({ ability: "blaze" }, 0.25);
      expect(result).toBe(0.25);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: handleEndOfTurn — NO_ACTIVATION false branches
// ─────────────────────────────────────────────────────────────────────────────

describe("handleEndOfTurn — NO_ACTIVATION paths", () => {
  it(
    "given toxic-orb holder already paralyzed, " +
      "when end-of-turn, then NO_ACTIVATION (already has status)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb onResidual: skip if pokemon already
      //   has a status condition
      const ctx = itemCtx({ heldItem: "toxic-orb", status: "paralysis" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given toxic-orb and steel type, " +
      "when end-of-turn, then NO_ACTIVATION (steel is immune to poison)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb immune check: steel and poison types
      const ctx = itemCtx({ heldItem: "toxic-orb", types: ["steel"] });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given toxic-orb and poison type, " +
      "when end-of-turn, then NO_ACTIVATION (poison type is immune to poisoning)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb immune check: steel and poison types
      const ctx = itemCtx({ heldItem: "toxic-orb", types: ["poison"] });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given flame-orb holder already burned, " +
      "when end-of-turn, then NO_ACTIVATION (already has status)",
    () => {
      // Source: Showdown data/items.ts — Flame Orb onResidual: skip if pokemon already
      //   has a status condition
      const ctx = itemCtx({ heldItem: "flame-orb", status: "burn" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given flame-orb and fire type, " +
      "when end-of-turn, then NO_ACTIVATION (fire type is immune to burn)",
    () => {
      // Source: Showdown data/items.ts — Flame Orb immune check: fire types
      const ctx = itemCtx({ heldItem: "flame-orb", types: ["fire"] });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given sitrus-berry holder at 60% HP, " +
      "when end-of-turn, then NO_ACTIVATION (HP above 50% threshold)",
    () => {
      // Source: Showdown data/items.ts — Sitrus Berry onUpdate: activates at <= 50% HP
      // 120/200 = 60% > 50%, so no activation
      const ctx = itemCtx({ heldItem: "sitrus-berry", hp: 200, currentHp: 120 });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given oran-berry holder at 60% HP, " +
      "when end-of-turn, then NO_ACTIVATION (HP above 50% threshold)",
    () => {
      // Source: Showdown data/items.ts — Oran Berry activates at <= 50% HP
      const ctx = itemCtx({ heldItem: "oran-berry", hp: 200, currentHp: 120 });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given lum-berry with no status and no confusion, " +
      "when end-of-turn, then NO_ACTIVATION (nothing to cure)",
    () => {
      // Source: Showdown data/items.ts — Lum Berry onUpdate: requires status or confusion
      const ctx = itemCtx({ heldItem: "lum-berry" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given cheri-berry holder with burn status, " +
      "when end-of-turn, then NO_ACTIVATION (cheri-berry only cures paralysis)",
    () => {
      // Source: Showdown data/items.ts — Cheri Berry cures paralysis only
      const ctx = itemCtx({ heldItem: "cheri-berry", status: "burn" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given chesto-berry holder with paralysis, " +
      "when end-of-turn, then NO_ACTIVATION (chesto-berry only cures sleep)",
    () => {
      // Source: Showdown data/items.ts — Chesto Berry cures sleep only
      const ctx = itemCtx({ heldItem: "chesto-berry", status: "paralysis" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given pecha-berry holder with burn, " +
      "when end-of-turn, then NO_ACTIVATION (pecha-berry only cures poison/badly-poisoned)",
    () => {
      // Source: Showdown data/items.ts — Pecha Berry cures poison and badly-poisoned only
      const ctx = itemCtx({ heldItem: "pecha-berry", status: "burn" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given rawst-berry holder with paralysis, " +
      "when end-of-turn, then NO_ACTIVATION (rawst-berry only cures burn)",
    () => {
      // Source: Showdown data/items.ts — Rawst Berry cures burn only
      const ctx = itemCtx({ heldItem: "rawst-berry", status: "paralysis" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given aspear-berry holder with sleep status, " +
      "when end-of-turn, then NO_ACTIVATION (aspear-berry only cures freeze)",
    () => {
      // Source: Showdown data/items.ts — Aspear Berry cures freeze only
      const ctx = itemCtx({ heldItem: "aspear-berry", status: "sleep" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given persim-berry holder without confusion, " +
      "when end-of-turn, then NO_ACTIVATION (nothing to cure)",
    () => {
      // Source: Showdown data/items.ts — Persim Berry cures confusion volatile only
      const ctx = itemCtx({ heldItem: "persim-berry" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );

  it(
    "given mental-herb holder without taunt or encore, " +
      "when end-of-turn, then NO_ACTIVATION (no mental volatile present)",
    () => {
      // Source: Showdown data/items.ts — Mental Herb onUpdate: requires one of the
      //   mental volatiles (infatuation, taunt, encore, disable, torment, heal-block)
      const ctx = itemCtx({ heldItem: "mental-herb" });
      expect(applyGen8HeldItem("end-of-turn", ctx).activated).toBe(false);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: handleOnDamageTaken — NO_ACTIVATION paths
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnDamageTaken — NO_ACTIVATION paths", () => {
  it("given sitrus-berry, when damage taken but HP stays above 50%, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Sitrus Berry activates at <= 50% HP
    // 150/200 = 75% HP, still above threshold
    const ctx = itemCtx({ heldItem: "sitrus-berry", hp: 200, currentHp: 150, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given oran-berry, when damage taken but HP stays above 50%, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Oran Berry activates at <= 50% HP
    const ctx = itemCtx({ heldItem: "oran-berry", hp: 200, currentHp: 150, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it(
    "given liechi-berry holder at 60% HP after damage, " +
      "when on-damage-taken, then NO_ACTIVATION (HP above 25% threshold)",
    () => {
      // Source: Showdown data/items.ts — Liechi Berry activates at <= 25% HP
      // 120/200 = 60% HP, above threshold
      const ctx = itemCtx({ heldItem: "liechi-berry", hp: 200, currentHp: 120, damage: 10 });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it("given ganlon-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Ganlon Berry activates at <= 25% HP
    const ctx = itemCtx({ heldItem: "ganlon-berry", hp: 200, currentHp: 120, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given salac-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Salac Berry activates at <= 25% HP
    const ctx = itemCtx({ heldItem: "salac-berry", hp: 200, currentHp: 120, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given petaya-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Petaya Berry activates at <= 25% HP
    const ctx = itemCtx({ heldItem: "petaya-berry", hp: 200, currentHp: 120, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given apicot-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Apicot Berry activates at <= 25% HP
    const ctx = itemCtx({ heldItem: "apicot-berry", hp: 200, currentHp: 120, damage: 10 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it(
    "given jaboca-berry and a special move, " +
      "when on-damage-taken, then NO_ACTIVATION (jaboca only reacts to physical moves)",
    () => {
      // Source: Showdown data/items.ts — Jaboca Berry onDamagingHit: physical only
      const ctx = itemCtx({
        heldItem: "jaboca-berry",
        damage: 50,
        move: makeMove({ category: "special" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it(
    "given rowap-berry and a physical move, " +
      "when on-damage-taken, then NO_ACTIVATION (rowap only reacts to special moves)",
    () => {
      // Source: Showdown data/items.ts — Rowap Berry onDamagingHit: special only
      const ctx = itemCtx({
        heldItem: "rowap-berry",
        damage: 50,
        move: makeMove({ category: "physical" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it(
    "given sticky-barb defender and a non-contact move, " +
      "when on-damage-taken, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Sticky Barb transfer: contact move required
      const ctx = itemCtx({
        heldItem: "sticky-barb",
        damage: 50,
        move: makeMove({ flags: { contact: false } }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it("given red-card and damage = 0, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Red Card requires actual damage dealt (> 0)
    const ctx = itemCtx({ heldItem: "red-card", damage: 0 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given eject-button and damage = 0, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Eject Button requires actual damage dealt (> 0)
    const ctx = itemCtx({ heldItem: "eject-button", damage: 0 });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it(
    "given absorb-bulb and a fire move (not water), " + "when on-damage-taken, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Absorb Bulb only triggers on Water-type moves
      const ctx = itemCtx({
        heldItem: "absorb-bulb",
        damage: 50,
        move: makeMove({ type: "fire" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it("given cell-battery and a water move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Cell Battery only triggers on Electric-type moves
    const ctx = itemCtx({
      heldItem: "cell-battery",
      damage: 50,
      move: makeMove({ type: "water" }),
    });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it(
    "given weakness-policy and normal-type holder hit by normal-type move (neutral effectiveness), " +
      "when on-damage-taken, then NO_ACTIVATION (not super-effective)",
    () => {
      // Source: Showdown data/items.ts — Weakness Policy requires >= 2x effectiveness
      // Normal vs Normal = 1x; condition `effectiveness >= 2` is false
      const ctx = itemCtx({
        heldItem: "weakness-policy",
        types: ["normal"],
        damage: 50,
        move: makeMove({ type: "normal" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it(
    "given kee-berry and a special move, " +
      "when on-damage-taken, then NO_ACTIVATION (kee-berry only triggers on physical moves)",
    () => {
      // Source: Showdown data/items.ts — Kee Berry onDamagingHit: physical category only
      const ctx = itemCtx({
        heldItem: "kee-berry",
        damage: 50,
        move: makeMove({ category: "special" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it(
    "given maranga-berry and a physical move, " +
      "when on-damage-taken, then NO_ACTIVATION (maranga-berry only triggers on special moves)",
    () => {
      // Source: Showdown data/items.ts — Maranga Berry onDamagingHit: special category only
      const ctx = itemCtx({
        heldItem: "maranga-berry",
        damage: 50,
        move: makeMove({ category: "physical" }),
      });
      expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
    },
  );

  it("given luminous-moss and a fire move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Luminous Moss only triggers on Water-type moves
    const ctx = itemCtx({
      heldItem: "luminous-moss",
      damage: 50,
      move: makeMove({ type: "fire" }),
    });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });

  it("given snowball and a fire move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Snowball only triggers on Ice-type moves
    const ctx = itemCtx({
      heldItem: "snowball",
      damage: 50,
      move: makeMove({ type: "fire" }),
    });
    expect(applyGen8HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5: handleOnHit — false branches (attacker perspective)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnHit — NO_ACTIVATION paths", () => {
  it("given shell-bell attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Shell Bell onAfterMoveSecondarySelf:
    //   requires damageDealt > 0
    const ctx = itemCtx({ heldItem: "shell-bell", damage: 0 });
    expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
  });

  it("given life-orb attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Life Orb onAfterMoveSecondarySelf:
    //   requires damageDealt > 0
    const ctx = itemCtx({ heldItem: "life-orb", damage: 0 });
    expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
  });

  it(
    "given kings-rock attacker with damage > 0 and RNG returns false, " +
      "when on-hit, then NO_ACTIVATION (no flinch)",
    () => {
      // Source: Showdown data/items.ts — King's Rock: 10% flinch via RNG chance
      // makeRng(false) means chance() always returns false → no flinch
      const ctx = itemCtx({ heldItem: "kings-rock", damage: 50, rng: makeRng(false) });
      expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
    },
  );

  it("given kings-rock attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — King's Rock: damage guard check before RNG
    const ctx = itemCtx({ heldItem: "kings-rock", damage: 0 });
    expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
  });

  it(
    "given razor-fang attacker with damage > 0 and RNG returns false, " +
      "when on-hit, then NO_ACTIVATION (no flinch)",
    () => {
      // Source: Showdown data/items.ts — Razor Fang: 10% flinch via RNG chance
      const ctx = itemCtx({ heldItem: "razor-fang", damage: 50, rng: makeRng(false) });
      expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
    },
  );

  it("given razor-fang attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Razor Fang: damage guard check before RNG
    const ctx = itemCtx({ heldItem: "razor-fang", damage: 0 });
    expect(applyGen8HeldItem("on-hit", ctx).activated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6: handleOnContact — false branches
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnContact — NO_ACTIVATION paths", () => {
  it(
    "given rocky-helmet defender and a non-contact move, " + "when on-contact, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Rocky Helmet onDamagingHit: contact flag required
      const ctx = itemCtx({
        heldItem: "rocky-helmet",
        move: makeMove({ flags: { contact: false } }),
      });
      expect(applyGen8HeldItem("on-contact", ctx).activated).toBe(false);
    },
  );

  it(
    "given rocky-helmet defender with a contact move but no opponent in state, " +
      "when on-contact, then NO_ACTIVATION (attacker HP cannot be resolved)",
    () => {
      // Source: Gen8Items.ts getOpponentMaxHp — returns null when context.opponent is
      //   undefined and pokemon cannot be found in state.sides; callers skip activation
      // The state.sides have empty active arrays and the pokemon is not in sides,
      // so getOpponentMaxHp returns null.
      const ctx = {
        pokemon: makePokemon({ heldItem: "rocky-helmet" }),
        state: makeState(),
        rng: makeRng(),
        move: makeMove({ flags: { contact: true } }),
        opponent: undefined,
      } as ItemContext;
      expect(applyGen8HeldItem("on-contact", ctx).activated).toBe(false);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 7: Positive activation cases (cover the true branch of the same arms)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleEndOfTurn — activation (true branches)", () => {
  it(
    "given toxic-orb and normal type with no status, " +
      "when end-of-turn, then activates and inflicts badly-poisoned",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb inflicts badly-poisoned at end of turn
      // Source: Gen8Items.ts line ~851 — effects: [{ type: "inflict-status", status: "badly-poisoned" }]
      const ctx = itemCtx({ heldItem: "toxic-orb", types: ["normal"] });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: "badly-poisoned" },
      ]);
    },
  );

  it(
    "given flame-orb and normal type with no status, " +
      "when end-of-turn, then activates and inflicts burn",
    () => {
      // Source: Showdown data/items.ts — Flame Orb inflicts burn at end of turn
      // Source: Gen8Items.ts line ~866 — effects: [{ type: "inflict-status", status: "burn" }]
      const ctx = itemCtx({ heldItem: "flame-orb", types: ["normal"] });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "inflict-status", target: "self", status: "burn" }]);
    },
  );

  it(
    "given sitrus-berry holder at 40% HP (80/200), " +
      "when end-of-turn, then activates and heals floor(200/4)=50 HP",
    () => {
      // Source: Showdown data/items.ts — Sitrus Berry heals 1/4 HP when at <= 50% HP
      // 80/200 = 40% HP, below 50% threshold. healAmount = floor(200/4) = 50
      // Source: Gen8Items.ts line ~877 — effects: [{ type: "heal", value: 50 }, { type: "consume" }]
      const ctx = itemCtx({ heldItem: "sitrus-berry", hp: 200, currentHp: 80 });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "heal", target: "self", value: 50 },
        { type: "consume", target: "self", value: "sitrus-berry" },
      ]);
    },
  );

  it(
    "given cheri-berry holder with paralysis, " +
      "when end-of-turn, then activates and cures paralysis",
    () => {
      // Source: Showdown data/items.ts — Cheri Berry cures paralysis at end of turn
      // Source: Gen8Items.ts line ~932 — effects: [{ type: "status-cure" }, { type: "consume" }]
      const ctx = itemCtx({ heldItem: "cheri-berry", status: "paralysis" });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "status-cure", target: "self" },
        { type: "consume", target: "self", value: "cheri-berry" },
      ]);
    },
  );
});

describe("handleOnHit — activation (true branches)", () => {
  it(
    "given kings-rock attacker with damage > 0 and RNG returns true, " +
      "when on-hit, then activates with flinch effect on opponent",
    () => {
      // Source: Showdown data/items.ts — King's Rock: 10% flinch chance on damaging hits
      // Source: Gen8Items.ts line ~1518 — effects: [{ type: "flinch", target: "opponent" }]
      const ctx = itemCtx({ heldItem: "kings-rock", damage: 50, rng: makeRng(true) });
      const result = applyGen8HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "flinch", target: "opponent" }]);
    },
  );

  it(
    "given shell-bell attacker with damage = 80, " +
      "when on-hit, then activates and heals floor(80/8)=10 HP",
    () => {
      // Source: Showdown data/items.ts — Shell Bell heals floor(damageDealt/8)
      // floor(80/8) = 10 HP heal
      // Source: Gen8Items.ts line ~1552 — effects: [{ type: "heal", target: "self", value: 10 }]
      const ctx = itemCtx({ heldItem: "shell-bell", damage: 80 });
      const result = applyGen8HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
    },
  );
});

describe("handleOnDamageTaken — activation (true branches)", () => {
  it(
    "given kee-berry and a physical move with damage > 0, " +
      "when on-damage-taken, then activates with +1 Defense stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Kee Berry raises Defense when hit by physical move
      // Source: Gen8Items.ts line ~1394 — effects: [{ type: "stat-boost", value: "defense" }, consume]
      const ctx = itemCtx({
        heldItem: "kee-berry",
        damage: 50,
        move: makeMove({ category: "physical" }),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "defense" },
        { type: "consume", target: "self", value: "kee-berry" },
      ]);
    },
  );

  it(
    "given maranga-berry and a special move with damage > 0, " +
      "when on-damage-taken, then activates with +1 SpDef stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Maranga Berry raises SpDef when hit by special move
      // Source: Gen8Items.ts line ~1410 — effects: [{ type: "stat-boost", value: "spDefense" }, consume]
      const ctx = itemCtx({
        heldItem: "maranga-berry",
        damage: 50,
        move: makeMove({ category: "special" }),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "spDefense" },
        { type: "consume", target: "self", value: "maranga-berry" },
      ]);
    },
  );

  it(
    "given absorb-bulb and a water move with damage > 0, " +
      "when on-damage-taken, then activates with +1 SpAtk stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Absorb Bulb raises SpAtk when hit by Water move
      // Source: Gen8Items.ts line ~1338 — effects: [{ type: "stat-boost", value: "spAttack" }, consume]
      const ctx = itemCtx({
        heldItem: "absorb-bulb",
        damage: 50,
        move: makeMove({ type: "water" }),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "spAttack" },
        { type: "consume", target: "self", value: "absorb-bulb" },
      ]);
    },
  );

  it(
    "given snowball and an ice move with damage > 0, " +
      "when on-damage-taken, then activates with +1 Attack stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Snowball raises Attack when hit by Ice move
      // Source: Gen8Items.ts line ~1441 — effects: [{ type: "stat-boost", value: "attack" }, consume]
      const ctx = itemCtx({
        heldItem: "snowball",
        damage: 50,
        move: makeMove({ type: "ice" }),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "attack" },
        { type: "consume", target: "self", value: "snowball" },
      ]);
    },
  );

  it(
    "given weakness-policy and water-type holder hit by electric move (2x SE), " +
      "when on-damage-taken, then activates with +2 Atk and +2 SpAtk and consume",
    () => {
      // Source: Showdown data/items.ts — Weakness Policy triggers on >= 2x effectiveness
      // Electric vs Water = 2x super-effective
      // Source: Gen8Items.ts line ~1376 — effects: [{ stat-boost Atk +2 }, { stat-boost SpAtk +2 }, consume]
      const ctx = itemCtx({
        heldItem: "weakness-policy",
        types: ["water"],
        damage: 50,
        move: makeMove({ type: "electric" }),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "attack", stages: 2 },
        { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
        { type: "consume", target: "self", value: "weakness-policy" },
      ]);
    },
  );
});
