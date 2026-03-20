import type { ItemContext } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4HeldItem } from "../src/Gen4Items";

/**
 * Gen 4 Held Item Tests
 *
 * Focus on Gen 4 changes and new items:
 *   - Sitrus Berry: 1/4 max HP (was flat 30 in Gen 3) — KEY CHANGE
 *   - Black Sludge: heals Poison-types 1/16, damages others 1/8 (NEW)
 *   - Toxic Orb / Flame Orb: badly poisons / burns holder at EoT (NEW)
 *   - Focus Sash: survive at 1 HP if full HP, single-use consumed (NEW)
 *   - Life Orb: recoil floor(maxHP/10) per hit (1.3x boost in damage calc) (NEW)
 *   - Razor Fang: 10% flinch on contact (NEW, same as King's Rock)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ItemBattleEffects
 * Source: Bulbapedia — individual Gen 4 item mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 160;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
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
      speed: 100,
    },
  } as PokemonInstance;
}

function makeContext(opts: {
  heldItem?: string | null;
  types?: PokemonType[];
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  damage?: number;
  rngChance?: boolean;
  hasConfusion?: boolean;
  hasInfatuation?: boolean;
}): ItemContext {
  const volatileStatuses = new Map<string, unknown>();
  if (opts.hasConfusion) volatileStatuses.set("confusion", true);
  if (opts.hasInfatuation) volatileStatuses.set("infatuation", true);

  return {
    pokemon: {
      pokemon: makePokemonInstance({
        heldItem: opts.heldItem ?? null,
        status: opts.status,
        currentHp: opts.currentHp,
        maxHp: opts.maxHp ?? 160,
      }),
      types: opts.types ?? ["normal"],
      volatileStatuses,
      ability: "",
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
    },
    state: {
      weather: null,
      sides: [],
      ended: false,
    } as unknown as ItemContext["state"],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    damage: opts.damage,
  } as unknown as ItemContext;
}

// ---------------------------------------------------------------------------
// end-of-turn: Leftovers
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Leftovers", () => {
  it("given Leftovers and 160 max HP, when end-of-turn triggers, then heals 10 HP (floor(160/16))", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals floor(maxHP/16) each turn
    // Derivation: floor(160 / 16) = 10
    const ctx = makeContext({ heldItem: "leftovers", maxHp: 160 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.messages[0]).toContain("Leftovers");
  });

  it("given Leftovers and 200 max HP, when end-of-turn triggers, then heals 12 HP (floor(200/16))", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals floor(maxHP/16)
    // Derivation: floor(200 / 16) = 12
    const ctx = makeContext({ heldItem: "leftovers", maxHp: 200 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.effects[0]).toMatchObject({ type: "heal", value: 12 });
  });
});

// ---------------------------------------------------------------------------
// end-of-turn: Black Sludge (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Black Sludge (NEW in Gen 4)", () => {
  it("given Black Sludge and a Poison-type holder with 160 max HP, when end-of-turn triggers, then heals 10 HP (floor(160/16))", () => {
    // Source: Bulbapedia — Black Sludge: Poison-types heal floor(maxHP/16) each turn
    // Derivation: floor(160 / 16) = 10
    const ctx = makeContext({ heldItem: "black-sludge", types: ["poison"], maxHp: 160 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.messages[0]).toContain("Black Sludge");
  });

  it("given Black Sludge and a non-Poison-type holder with 160 max HP, when end-of-turn triggers, then damages 20 HP (floor(160/8))", () => {
    // Source: Bulbapedia — Black Sludge: non-Poison-types take floor(maxHP/8) damage each turn
    // Derivation: floor(160 / 8) = 20
    const ctx = makeContext({ heldItem: "black-sludge", types: ["normal"], maxHp: 160 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "none", value: -20 });
    expect(result.messages[0]).toContain("Black Sludge");
  });

  it("given Black Sludge and a dual Poison/Normal-type holder, when end-of-turn triggers, then heals (Poison takes priority)", () => {
    // Source: Bulbapedia — Black Sludge: any Poison typing grants healing
    const ctx = makeContext({ heldItem: "black-sludge", types: ["poison", "normal"], maxHp: 160 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.effects[0]?.type).toBe("heal");
  });
});

// ---------------------------------------------------------------------------
// end-of-turn: Toxic Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Toxic Orb (NEW in Gen 4)", () => {
  it("given Toxic Orb and no current status, when end-of-turn triggers, then activates and inflicts badly-poisoned", () => {
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of turn if no status
    // Source: Showdown Gen 4 mod — Toxic Orb trigger
    const ctx = makeContext({ heldItem: "toxic-orb", status: null });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ value: "badly-poisoned" });
    expect(result.messages[0]).toContain("Toxic Orb");
  });

  it("given Toxic Orb and existing status (burn), when end-of-turn triggers, then does not activate (status already present)", () => {
    // Source: Bulbapedia — Toxic Orb only activates if holder has no status
    const ctx = makeContext({ heldItem: "toxic-orb", status: "burn" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end-of-turn: Flame Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Flame Orb (NEW in Gen 4)", () => {
  it("given Flame Orb and no current status, when end-of-turn triggers, then activates and inflicts burn", () => {
    // Source: Bulbapedia — Flame Orb: burns holder at end of turn if no status
    // Source: Showdown Gen 4 mod — Flame Orb trigger
    const ctx = makeContext({ heldItem: "flame-orb", status: null });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ value: "burn" });
    expect(result.messages[0]).toContain("Flame Orb");
  });

  it("given Flame Orb and existing status (poison), when end-of-turn triggers, then does not activate", () => {
    // Source: Bulbapedia — Flame Orb only activates if holder has no status
    const ctx = makeContext({ heldItem: "flame-orb", status: "poison" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end-of-turn: Sitrus Berry (GEN 4 CHANGE: 1/4 max HP, not flat 30)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Sitrus Berry (Gen 4 CHANGE: 1/4 max HP)", () => {
  it("given Sitrus Berry and HP at 50% (exactly), when end-of-turn triggers, then heals floor(maxHP/4)", () => {
    // CHANGED vs Gen 3: Gen 4 Sitrus Berry heals 1/4 max HP (not flat 30)
    // Source: Bulbapedia — Sitrus Berry: Gen 4+ heals floor(maxHP/4) when HP <= 50%
    // Derivation: maxHp=160, currentHp=80 (50%), floor(160/4) = 40
    const ctx = makeContext({ heldItem: "sitrus-berry", maxHp: 160, currentHp: 80 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 40 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "sitrus-berry" });
  });

  it("given Sitrus Berry and HP above 50%, when end-of-turn triggers, then does not activate", () => {
    // Source: Bulbapedia — Sitrus Berry: only triggers when HP <= floor(maxHP/2)
    const ctx = makeContext({ heldItem: "sitrus-berry", maxHp: 160, currentHp: 120 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Sitrus Berry and 200 max HP at 80 HP (40%), when end-of-turn triggers, then heals floor(200/4) = 50", () => {
    // Source: Bulbapedia — Sitrus Berry: heals floor(maxHP/4)
    // Derivation: maxHp=200, currentHp=80, floor(200/4) = 50
    const ctx = makeContext({ heldItem: "sitrus-berry", maxHp: 200, currentHp: 80 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.effects[0]).toMatchObject({ type: "heal", value: 50 });
  });
});

// ---------------------------------------------------------------------------
// on-damage-taken: Focus Sash (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-damage-taken — Focus Sash (NEW in Gen 4)", () => {
  it("given Focus Sash, full HP, and a would-be KO hit, when damage is taken, then survives at 1 HP and Focus Sash is consumed", () => {
    // Source: Bulbapedia — Focus Sash: survive at 1 HP if at full HP and damage would KO; consumed
    // Derivation: maxHp=160, currentHp=160 (full), damage=200 (KO) → survive at 1 HP, consume
    const ctx = makeContext({ heldItem: "focus-sash", maxHp: 160, currentHp: 160, damage: 200 });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "survive", value: 1 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "focus-sash" });
    expect(result.messages[0]).toContain("Focus Sash");
  });

  it("given Focus Sash and HP not at full, when a KO hit is taken, then does not activate (must be full HP)", () => {
    // Source: Bulbapedia — Focus Sash: MUST be at full HP to activate
    const ctx = makeContext({ heldItem: "focus-sash", maxHp: 160, currentHp: 100, damage: 200 });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Focus Sash and full HP, when a non-KO hit is taken, then does not activate (damage does not KO)", () => {
    // Source: Bulbapedia — Focus Sash: only activates when hit would KO
    const ctx = makeContext({ heldItem: "focus-sash", maxHp: 160, currentHp: 160, damage: 50 });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-damage-taken: Sitrus Berry post-damage (Gen 4: 1/4 max HP)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-damage-taken — Sitrus Berry (Gen 4 CHANGE)", () => {
  it("given Sitrus Berry and HP drops to 50% after damage, when damage is taken, then heals floor(maxHP/4)", () => {
    // CHANGED vs Gen 3: Gen 4 Sitrus Berry heals 1/4 max HP (not flat 30)
    // Source: Bulbapedia — Sitrus Berry: post-damage check in Gen 4 heals floor(maxHP/4)
    // Derivation: maxHp=160, currentHp=120, damage=40 → hpAfterDamage=80 (50%), heal floor(160/4)=40
    const ctx = makeContext({
      heldItem: "sitrus-berry",
      maxHp: 160,
      currentHp: 120,
      damage: 40,
    });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 40 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "sitrus-berry" });
  });

  it("given Sitrus Berry and HP stays above 50% after damage, when damage is taken, then does not activate", () => {
    // Source: Bulbapedia — Sitrus Berry only triggers when HP <= floor(maxHP/2) after damage
    const ctx = makeContext({
      heldItem: "sitrus-berry",
      maxHp: 160,
      currentHp: 160,
      damage: 20,
    });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-hit: Razor Fang (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-hit — Razor Fang (NEW in Gen 4)", () => {
  it("given Razor Fang and RNG succeeds, when on-hit triggers, then causes flinch on opponent", () => {
    // Source: Bulbapedia — Razor Fang: 10% flinch chance (same mechanic as King's Rock)
    // Source: Showdown Gen 4 mod — Razor Fang trigger
    const ctx = makeContext({ heldItem: "razor-fang", damage: 50, rngChance: true });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "flinch", target: "opponent" });
    expect(result.messages[0]).toContain("Razor Fang");
  });

  it("given Razor Fang and RNG fails, when on-hit triggers, then does not cause flinch", () => {
    // Source: Bulbapedia — Razor Fang: 10% chance (RNG fail = no flinch)
    const ctx = makeContext({ heldItem: "razor-fang", damage: 50, rngChance: false });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-hit: Life Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-hit — Life Orb (NEW in Gen 4)", () => {
  it("given Life Orb with 160 max HP, when on-hit triggers with damage dealt, then recoil = floor(160/10) = 16", () => {
    // Source: Bulbapedia — Life Orb: floor(maxHP/10) recoil per hit (1.3x boost in damage calc)
    // Derivation: floor(160/10) = 16
    const ctx = makeContext({ heldItem: "life-orb", maxHp: 160, damage: 80 });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "none", value: -16 });
    expect(result.messages[0]).toContain("Life Orb");
  });

  it("given Life Orb with 200 max HP, when on-hit triggers with damage dealt, then recoil = floor(200/10) = 20", () => {
    // Source: Bulbapedia — Life Orb recoil = floor(maxHP/10)
    // Derivation: floor(200/10) = 20
    const ctx = makeContext({ heldItem: "life-orb", maxHp: 200, damage: 100 });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.effects[0]).toMatchObject({ type: "none", value: -20 });
  });

  it("given Life Orb and 0 damage dealt, when on-hit triggers, then does not activate (status moves)", () => {
    // Source: Showdown Gen 4 mod — Life Orb does not trigger on 0-damage moves
    const ctx = makeContext({ heldItem: "life-orb", maxHp: 160, damage: 0 });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-hit: King's Rock (same as Gen 3)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-hit — King's Rock", () => {
  it("given King's Rock and RNG succeeds, when on-hit triggers, then causes flinch", () => {
    // Source: Showdown Gen 4 mod — King's Rock 10% flinch (unchanged from Gen 3)
    const ctx = makeContext({ heldItem: "kings-rock", damage: 50, rngChance: true });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "flinch", target: "opponent" });
  });
});

// ---------------------------------------------------------------------------
// on-hit: Shell Bell (same as Gen 3)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-hit — Shell Bell", () => {
  it("given Shell Bell and 80 damage dealt, when on-hit triggers, then heals 10 HP (floor(80/8))", () => {
    // Source: Showdown Gen 4 mod — Shell Bell heals floor(damageDealt/8) (unchanged from Gen 3)
    // Derivation: floor(80/8) = 10
    const ctx = makeContext({ heldItem: "shell-bell", damage: 80 });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });

  it("given Shell Bell and 0 damage dealt, when on-hit triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Shell Bell requires damage > 0
    const ctx = makeContext({ heldItem: "shell-bell", damage: 0 });
    const result = applyGen4HeldItem("on-hit", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-damage-taken: Oran Berry
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on-damage-taken — Oran Berry", () => {
  it("given Oran Berry and HP drops to 50% after damage, when damage is taken, then heals 10 HP", () => {
    // Source: Showdown Gen 4 mod — Oran Berry heals 10 HP flat (unchanged from Gen 3)
    // Derivation: maxHp=160, currentHp=120, damage=40 → hpAfterDamage=80 (50%), heal 10
    const ctx = makeContext({ heldItem: "oran-berry", maxHp: 160, currentHp: 120, damage: 40 });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "oran-berry" });
  });
});

// ---------------------------------------------------------------------------
// end-of-turn: remaining status-curing berries (coverage)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — Chesto Berry", () => {
  it("given Chesto Berry and sleep status, when end-of-turn triggers, then wakes up and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Chesto Berry cures sleep (same as Gen 3)
    const ctx = makeContext({ heldItem: "chesto-berry", status: "sleep" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure", value: "sleep" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "chesto-berry" });
  });

  it("given Chesto Berry but no sleep status, when end-of-turn triggers, then does not activate", () => {
    const ctx = makeContext({ heldItem: "chesto-berry", status: null });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end-of-turn — Rawst Berry", () => {
  it("given Rawst Berry and burn status, when end-of-turn triggers, then cures burn and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Rawst Berry cures burn (same as Gen 3)
    const ctx = makeContext({ heldItem: "rawst-berry", status: "burn" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure", value: "burn" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "rawst-berry" });
  });
});

describe("applyGen4HeldItem end-of-turn — Aspear Berry", () => {
  it("given Aspear Berry and freeze status, when end-of-turn triggers, then thaws out and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Aspear Berry cures freeze (same as Gen 3)
    const ctx = makeContext({ heldItem: "aspear-berry", status: "freeze" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure", value: "freeze" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "aspear-berry" });
  });
});

describe("applyGen4HeldItem end-of-turn — Persim Berry", () => {
  it("given Persim Berry and confusion, when end-of-turn triggers, then cures confusion and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Persim Berry cures confusion (same as Gen 3)
    const ctx = makeContext({ heldItem: "persim-berry", hasConfusion: true });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "volatile-cure", value: "confusion" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "persim-berry" });
  });

  it("given Persim Berry and no confusion, when end-of-turn triggers, then does not activate", () => {
    const ctx = makeContext({ heldItem: "persim-berry" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end-of-turn — Mental Herb", () => {
  it("given Mental Herb and infatuation, when end-of-turn triggers, then cures infatuation and consumes herb", () => {
    // Source: Showdown Gen 4 mod — Mental Herb cures infatuation (same as Gen 3)
    const ctx = makeContext({ heldItem: "mental-herb", hasInfatuation: true });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "volatile-cure", value: "infatuation" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "mental-herb" });
  });

  it("given Mental Herb and no infatuation, when end-of-turn triggers, then does not activate", () => {
    const ctx = makeContext({ heldItem: "mental-herb" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end-of-turn — Oran Berry", () => {
  it("given Oran Berry and HP at 50%, when end-of-turn triggers, then heals 10 HP and consumes", () => {
    // Source: Showdown Gen 4 mod — Oran Berry heals 10 HP flat (same as Gen 3)
    const ctx = makeContext({ heldItem: "oran-berry", maxHp: 160, currentHp: 80 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });

  it("given Oran Berry and HP above 50%, when end-of-turn triggers, then does not activate", () => {
    const ctx = makeContext({ heldItem: "oran-berry", maxHp: 160, currentHp: 120 });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No item / unknown item
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem — no item or unknown trigger", () => {
  it("given no held item, when any trigger fires, then does not activate", () => {
    const ctx = makeContext({ heldItem: null });
    const endResult = applyGen4HeldItem("end-of-turn", ctx);
    const hitResult = applyGen4HeldItem("on-hit", ctx);
    const damageResult = applyGen4HeldItem("on-damage-taken", ctx);

    expect(endResult.activated).toBe(false);
    expect(hitResult.activated).toBe(false);
    expect(damageResult.activated).toBe(false);
  });

  it("given an item and unknown trigger, when trigger fires, then does not activate", () => {
    const ctx = makeContext({ heldItem: "leftovers" });
    const result = applyGen4HeldItem("on-something-weird", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status-curing berries (same as Gen 3, spot-check for Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end-of-turn — status-curing berries", () => {
  it("given Cheri Berry and paralysis status, when end-of-turn triggers, then cures paralysis and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Cheri Berry cures paralysis (same as Gen 3)
    const ctx = makeContext({ heldItem: "cheri-berry", status: "paralysis" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure", value: "paralysis" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: "cheri-berry" });
  });

  it("given Pecha Berry and badly-poisoned status, when end-of-turn triggers, then cures badly-poisoned", () => {
    // Source: Showdown Gen 4 mod — Pecha Berry cures both poison and badly-poisoned
    const ctx = makeContext({ heldItem: "pecha-berry", status: "badly-poisoned" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure", value: "badly-poisoned" });
  });

  it("given Lum Berry with both burn status and confusion, when end-of-turn triggers, then cures both and consumes", () => {
    // Source: Showdown Gen 4 mod — Lum Berry cures all statuses and confusion
    const ctx = makeContext({ heldItem: "lum-berry", status: "burn", hasConfusion: true });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    const types = result.effects.map((e) => e.type);
    expect(types).toContain("status-cure");
    expect(types).toContain("volatile-cure");
    expect(types).toContain("consume");
  });
});
