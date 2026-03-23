/**
 * Targeted coverage tests for Gen6Items.ts
 *
 * Covers the on-damage-taken, on-contact, on-hit, before-move, and end-of-turn
 * item triggers that were not covered by existing tests.
 *
 * Source: Showdown data/items.ts -- individual item entries
 */

import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen6HeldItem } from "../src/Gen6Items";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActive(overrides: {
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  nickname?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: 1,
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
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: overrides?.id ?? "tackle",
    displayName: overrides?.id ?? "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 50,
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
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? null,
    description: "",
    generation: 6,
    critRatio: 0,
  } as MoveData;
}

function makeState(overrides?: { sides?: [any, any] }): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 6,
    turnNumber: 1,
    rng: new SeededRandom(42),
    sides: overrides?.sides ?? [{}, {}],
  } as unknown as BattleState;
}

function makeItemContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  move?: MoveData;
  damage?: number;
  seed?: number;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    move: overrides.move,
    damage: overrides.damage,
  };
}

// ===========================================================================
// End-of-turn items
// ===========================================================================

describe("Gen 6 Items -- Status cure berries (end-of-turn)", () => {
  it("given Cheri Berry + paralysis status, when end-of-turn triggers, then cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry cures paralysis
    const pokemon = makeActive({ heldItem: "cheri-berry", status: "paralysis" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "cheri-berry" },
    ]);
  });

  it("given Cheri Berry without paralysis, when end-of-turn triggers, then does not activate", () => {
    const pokemon = makeActive({ heldItem: "cheri-berry", status: null });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Chesto Berry + sleep status, when end-of-turn triggers, then cures sleep", () => {
    // Source: Showdown data/items.ts -- Chesto Berry cures sleep
    const pokemon = makeActive({ heldItem: "chesto-berry", status: "sleep" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "chesto-berry" },
    ]);
  });

  it("given Pecha Berry + poison status, when end-of-turn triggers, then cures poison", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures poison/badly-poisoned
    const pokemon = makeActive({ heldItem: "pecha-berry", status: "poison" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "pecha-berry" },
    ]);
  });

  it("given Pecha Berry + badly-poisoned, when end-of-turn triggers, then cures it", () => {
    // Source: Showdown data/items.ts -- Pecha Berry also cures badly-poisoned
    const pokemon = makeActive({ heldItem: "pecha-berry", status: "badly-poisoned" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
  });

  it("given Rawst Berry + burn status, when end-of-turn triggers, then cures burn", () => {
    // Source: Showdown data/items.ts -- Rawst Berry cures burn
    const pokemon = makeActive({ heldItem: "rawst-berry", status: "burn" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "rawst-berry" },
    ]);
  });

  it("given Aspear Berry + freeze status, when end-of-turn triggers, then cures freeze", () => {
    // Source: Showdown data/items.ts -- Aspear Berry cures freeze
    const pokemon = makeActive({ heldItem: "aspear-berry", status: "freeze" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "aspear-berry" },
    ]);
  });
});

describe("Gen 6 Items -- Persim Berry", () => {
  it("given Persim Berry + confusion, when end-of-turn triggers, then cures confusion", () => {
    // Source: Showdown data/items.ts -- Persim Berry cures confusion
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("confusion", { turnsLeft: 3 });
    const pokemon = makeActive({ heldItem: "persim-berry", volatiles });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: "confusion" },
      { type: "consume", target: "self", value: "persim-berry" },
    ]);
  });

  it("given Persim Berry without confusion, when end-of-turn triggers, then does not activate", () => {
    const pokemon = makeActive({ heldItem: "persim-berry" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Lum Berry", () => {
  it("given Lum Berry + burn status, when end-of-turn triggers, then cures status", () => {
    // Source: Showdown data/items.ts -- Lum Berry cures any primary status OR confusion
    const pokemon = makeActive({ heldItem: "lum-berry", status: "burn" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "status-cure", target: "self" });
    expect(result.effects).toContainEqual({ type: "consume", target: "self", value: "lum-berry" });
  });

  it("given Lum Berry + confusion (no primary status), when end-of-turn triggers, then cures confusion", () => {
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("confusion", { turnsLeft: 2 });
    const pokemon = makeActive({ heldItem: "lum-berry", volatiles });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: "confusion",
    });
  });

  it("given Lum Berry with neither status nor confusion, when end-of-turn triggers, then does not activate", () => {
    const pokemon = makeActive({ heldItem: "lum-berry" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Mental Herb", () => {
  it("given Mental Herb + taunt volatile, when end-of-turn triggers, then cures taunt and is consumed", () => {
    // Source: Showdown data/items.ts -- Mental Herb cures mental volatiles
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("taunt", { turnsLeft: 2 });
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: "taunt",
    });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: "mental-herb",
    });
  });

  it("given Mental Herb + infatuation + encore, when end-of-turn triggers, then cures BOTH", () => {
    // Source: Showdown data/items.ts -- Mental Herb cures all 6 mental volatiles at once
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("infatuation", { turnsLeft: -1 });
    volatiles.set("encore", { turnsLeft: 3 });
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: "infatuation",
    });
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: "encore",
    });
  });

  it("given Mental Herb without any mental volatiles, when end-of-turn triggers, then does not activate", () => {
    const pokemon = makeActive({ heldItem: "mental-herb" });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Sticky Barb end-of-turn", () => {
  it("given Sticky Barb with 200 max HP, when end-of-turn triggers, then deals 25 chip damage (floor(200/8))", () => {
    // Source: Showdown data/items.ts -- Sticky Barb: 1/8 max HP per turn
    // Derivation: floor(200/8) = 25
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
  });

  it("given Sticky Barb with 100 max HP, when end-of-turn triggers, then deals 12 chip damage (floor(100/8))", () => {
    // Derivation: floor(100/8) = 12
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 100, currentHp: 80 });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 12 }]);
  });
});

describe("Gen 6 Items -- Berry Juice", () => {
  it("given Berry Juice with HP <= 50%, when end-of-turn triggers, then heals 20 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Berry Juice: heals 20 HP
    const pokemon = makeActive({ heldItem: "berry-juice", hp: 200, currentHp: 90 });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 20 },
      { type: "consume", target: "self", value: "berry-juice" },
    ]);
  });

  it("given Berry Juice with HP > 50%, when end-of-turn triggers, then does not activate", () => {
    const pokemon = makeActive({ heldItem: "berry-juice", hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Oran Berry end-of-turn", () => {
  it("given Oran Berry with HP <= 50%, when end-of-turn triggers, then heals 10 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Oran Berry: heals 10 HP
    const pokemon = makeActive({ heldItem: "oran-berry", hp: 100, currentHp: 40 });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 10 },
      { type: "consume", target: "self", value: "oran-berry" },
    ]);
  });
});

// ===========================================================================
// On-damage-taken items
// ===========================================================================

describe("Gen 6 Items -- Focus Sash (moved to capLethalDamage, #784)", () => {
  it("given Focus Sash at full HP with lethal damage, when on-damage-taken triggers, then does NOT activate (handled by capLethalDamage now)", () => {
    // Focus Sash was moved from handleOnDamageTaken to capLethalDamage (pre-damage hook)
    // because handleOnDamageTaken fires post-damage, making currentHp === maxHp always false.
    // See: Gen6Ruleset.capLethalDamage and GitHub issue #784
    const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 200 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 300 }));
    expect(result.activated).toBe(false);
  });

  it("given Focus Sash NOT at full HP with lethal damage, when on-damage-taken triggers, then does NOT activate", () => {
    const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 200 }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Pinch berries on-damage-taken", () => {
  it("given Liechi Berry at 25% HP after taking damage, when on-damage-taken triggers, then +1 Attack", () => {
    // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at 25% HP
    // 200 HP * 0.25 = 50 threshold
    const pokemon = makeActive({ heldItem: "liechi-berry", hp: 200, currentHp: 45 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "attack" });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: "liechi-berry",
    });
  });

  it("given Ganlon Berry at 25% HP, when on-damage-taken triggers, then +1 Defense", () => {
    // Source: Showdown data/items.ts -- Ganlon Berry: +1 Def at 25% HP
    const pokemon = makeActive({ heldItem: "ganlon-berry", hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "defense" });
  });

  it("given Salac Berry at 25% HP, when on-damage-taken triggers, then +1 Speed", () => {
    // Source: Showdown data/items.ts -- Salac Berry: +1 Speed at 25% HP
    const pokemon = makeActive({ heldItem: "salac-berry", hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "speed" });
  });

  it("given Petaya Berry at 25% HP, when on-damage-taken triggers, then +1 SpAtk", () => {
    // Source: Showdown data/items.ts -- Petaya Berry: +1 SpAtk at 25% HP
    const pokemon = makeActive({ heldItem: "petaya-berry", hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Apicot Berry at 25% HP, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Apicot Berry: +1 SpDef at 25% HP
    const pokemon = makeActive({ heldItem: "apicot-berry", hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });

  it("given Gluttony ability with Liechi Berry, when on-damage-taken at 50% HP, then berry activates early", () => {
    // Source: Showdown data/abilities.ts -- Gluttony: activates pinch berries at 50% instead of 25%
    const pokemon = makeActive({
      heldItem: "liechi-berry",
      hp: 200,
      currentHp: 90,
      ability: "gluttony",
    });
    const result = applyGen6HeldItem("on-damage-taken", makeItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "attack" });
  });
});

describe("Gen 6 Items -- Jaboca Berry and Rowap Berry", () => {
  it("given Jaboca Berry + physical damage, when on-damage-taken triggers, then deals 1/8 attacker's max HP", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: 1/8 of ATTACKER's max HP on physical hit
    const defender = makeActive({ heldItem: "jaboca-berry", hp: 200, currentHp: 100 });
    const attacker = makeActive({ hp: 300, currentHp: 300 });
    const state = makeState({
      sides: [
        {
          active: [defender],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [attacker],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const physicalMove = makeMove({ category: "physical" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon: defender,
        state,
        damage: 50,
        move: physicalMove,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(300/8) = 37
    expect(result.effects).toContainEqual({ type: "chip-damage", target: "opponent", value: 37 });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: "jaboca-berry",
    });
  });

  it("given Jaboca Berry + special damage, when on-damage-taken triggers, then does NOT activate", () => {
    const defender = makeActive({ heldItem: "jaboca-berry" });
    const specialMove = makeMove({ category: "special" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon: defender,
        damage: 50,
        move: specialMove,
      }),
    );
    expect(result.activated).toBe(false);
  });

  it("given Rowap Berry + special damage, when on-damage-taken triggers, then deals 1/8 attacker's max HP", () => {
    // Source: Showdown data/items.ts -- Rowap Berry: 1/8 of ATTACKER's max HP on special hit
    const defender = makeActive({ heldItem: "rowap-berry", hp: 200, currentHp: 100 });
    const attacker = makeActive({ hp: 240, currentHp: 240 });
    const state = makeState({
      sides: [
        {
          active: [defender],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [attacker],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const specialMove = makeMove({ category: "special" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon: defender,
        state,
        damage: 50,
        move: specialMove,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(240/8) = 30
    expect(result.effects).toContainEqual({ type: "chip-damage", target: "opponent", value: 30 });
  });
});

describe("Gen 6 Items -- Air Balloon, Red Card, Eject Button", () => {
  it("given Air Balloon + damage > 0, when on-damage-taken triggers, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon pops on any damaging hit
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "consume", target: "self", value: "air-balloon" }]);
  });

  it("given Red Card + damage > 0, when on-damage-taken triggers, then force-switch opponent", () => {
    // Source: Showdown data/items.ts -- Red Card: force switch on damaging hit
    const pokemon = makeActive({ heldItem: "red-card", hp: 200, currentHp: 100 });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "none",
      target: "opponent",
      value: "force-switch",
    });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: "red-card",
    });
  });

  it("given Eject Button + damage > 0, when on-damage-taken triggers, then force-switch self", () => {
    // Source: Showdown data/items.ts -- Eject Button: self switches on damaging hit
    const pokemon = makeActive({ heldItem: "eject-button", hp: 200, currentHp: 100 });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "none",
      target: "self",
      value: "force-switch",
    });
  });
});

describe("Gen 6 Items -- Absorb Bulb, Cell Battery, Snowball, Luminous Moss, Kee, Maranga", () => {
  it("given Absorb Bulb + Water hit, when on-damage-taken triggers, then +1 SpAtk", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb: +1 SpAtk on Water hit
    const pokemon = makeActive({ heldItem: "absorb-bulb" });
    const waterMove = makeMove({ type: "water" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: waterMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Cell Battery + Electric hit, when on-damage-taken triggers, then +1 Atk", () => {
    // Source: Showdown data/items.ts -- Cell Battery: +1 Atk on Electric hit
    const pokemon = makeActive({ heldItem: "cell-battery" });
    const elecMove = makeMove({ type: "electric" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: elecMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Snowball + Ice hit, when on-damage-taken triggers, then +1 Atk", () => {
    // Source: Showdown data/items.ts -- Snowball: +1 Atk on Ice hit
    const pokemon = makeActive({ heldItem: "snowball" });
    const iceMove = makeMove({ type: "ice" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: iceMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Luminous Moss + Water hit, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Luminous Moss: +1 SpDef on Water hit
    const pokemon = makeActive({ heldItem: "luminous-moss" });
    const waterMove = makeMove({ type: "water" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: waterMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });

  it("given Kee Berry + physical hit, when on-damage-taken triggers, then +1 Def", () => {
    // Source: Showdown data/items.ts -- Kee Berry: +1 Def on physical hit
    const pokemon = makeActive({ heldItem: "kee-berry" });
    const physMove = makeMove({ category: "physical" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: physMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "defense",
    });
  });

  it("given Maranga Berry + special hit, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Maranga Berry: +1 SpDef on special hit
    const pokemon = makeActive({ heldItem: "maranga-berry" });
    const specMove = makeMove({ category: "special" });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
        move: specMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });
});

describe("Gen 6 Items -- Sitrus/Oran Berry on-damage-taken", () => {
  it("given Sitrus Berry post-damage HP <= 50%, when on-damage-taken triggers, then heals 1/4 max HP", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry: heals 1/4 max HP at <= 50%
    const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 80 });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(200/4) = 50
    expect(result.effects).toContainEqual({ type: "heal", target: "self", value: 50 });
  });

  it("given Oran Berry post-damage HP <= 50%, when on-damage-taken triggers, then heals 10 HP", () => {
    // Source: Showdown data/items.ts -- Oran Berry: heals 10 HP
    const pokemon = makeActive({ heldItem: "oran-berry", hp: 100, currentHp: 40 });
    const result = applyGen6HeldItem(
      "on-damage-taken",
      makeItemContext({
        pokemon,
        damage: 30,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "heal", target: "self", value: 10 });
  });
});

// ===========================================================================
// On-hit items (attacker perspective)
// ===========================================================================

describe("Gen 6 Items -- Shell Bell", () => {
  it("given Shell Bell dealing 80 damage, when on-hit triggers, then heals 10 HP (floor(80/8))", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heals 1/8 of damage dealt
    // Derivation: floor(80/8) = 10
    const pokemon = makeActive({ heldItem: "shell-bell", hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(
      "on-hit",
      makeItemContext({
        pokemon,
        damage: 80,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
  });

  it("given Shell Bell dealing 0 damage, when on-hit triggers, then does NOT activate", () => {
    const pokemon = makeActive({ heldItem: "shell-bell" });
    const result = applyGen6HeldItem("on-hit", makeItemContext({ pokemon, damage: 0 }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- King's Rock and Razor Fang flinch", () => {
  it("given King's Rock dealing damage with seed producing flinch, when on-hit triggers, then flinch effect fires", () => {
    // Source: Showdown data/items.ts -- King's Rock: 10% flinch on all damaging moves
    // We use a seed that produces flinch (we test multiple seeds)
    const pokemon = makeActive({ heldItem: "kings-rock" });
    let flinched = false;
    // Try multiple seeds to find one that flinches
    for (let seed = 0; seed < 100; seed++) {
      const result = applyGen6HeldItem(
        "on-hit",
        makeItemContext({
          pokemon,
          damage: 50,
          seed,
        }),
      );
      if (result.activated) {
        expect(result.effects).toContainEqual({ type: "flinch", target: "opponent" });
        flinched = true;
        break;
      }
    }
    expect(flinched).toBe(true);
  });

  it("given Razor Fang dealing damage, when on-hit triggers with a flinch-producing seed, then flinch fires", () => {
    // Source: Showdown data/items.ts -- Razor Fang: 10% flinch on all damaging moves
    const pokemon = makeActive({ heldItem: "razor-fang" });
    let flinched = false;
    for (let seed = 0; seed < 100; seed++) {
      const result = applyGen6HeldItem(
        "on-hit",
        makeItemContext({
          pokemon,
          damage: 50,
          seed,
        }),
      );
      if (result.activated) {
        expect(result.effects).toContainEqual({ type: "flinch", target: "opponent" });
        flinched = true;
        break;
      }
    }
    expect(flinched).toBe(true);
  });
});

// ===========================================================================
// before-move: Metronome item
// ===========================================================================

describe("Gen 6 Items -- Metronome before-move", () => {
  it("given Metronome holding Pokemon, when before-move triggers with a move, then metronome-count volatile is set", () => {
    // Source: Showdown sim/items.ts -- Metronome item tracks consecutive-use counter
    const pokemon = makeActive({ heldItem: "metronome" });
    const move = makeMove({ id: "flamethrower" });
    const result = applyGen6HeldItem(
      "before-move",
      makeItemContext({
        pokemon,
        move,
      }),
    );
    // Metronome doesn't "activate" visibly, but sets the volatile
    expect(result.activated).toBe(false);
    // Verify volatile was set
    const vol = pokemon.volatileStatuses.get("metronome-count");
    expect(vol).toBeDefined();
    expect(vol?.data?.moveId).toBe("flamethrower");
    expect(vol?.data?.count).toBe(1);
  });

  it("given Metronome with existing count for same move, when before-move triggers, then count increments", () => {
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", {
      turnsLeft: -1,
      data: { moveId: "flamethrower", count: 2 },
    });
    const pokemon = makeActive({ heldItem: "metronome", volatiles });
    const move = makeMove({ id: "flamethrower" });
    applyGen6HeldItem("before-move", makeItemContext({ pokemon, move }));
    const vol = pokemon.volatileStatuses.get("metronome-count");
    expect(vol?.data?.count).toBe(3);
  });

  it("given Metronome with existing count for DIFFERENT move, when before-move triggers, then count resets to 1", () => {
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", {
      turnsLeft: -1,
      data: { moveId: "flamethrower", count: 4 },
    });
    const pokemon = makeActive({ heldItem: "metronome", volatiles });
    const move = makeMove({ id: "ice-beam" });
    applyGen6HeldItem("before-move", makeItemContext({ pokemon, move }));
    const vol = pokemon.volatileStatuses.get("metronome-count");
    expect(vol?.data?.moveId).toBe("ice-beam");
    expect(vol?.data?.count).toBe(1);
  });
});

// ===========================================================================
// Unburden volatile
// ===========================================================================

describe("Gen 6 Items -- Unburden on item consumption", () => {
  it("given Unburden ability + consumed berry, when item triggers consume effect, then unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden: sets volatile after item consumption
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      hp: 200,
      currentHp: 80,
      ability: "unburden",
    });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    // Sitrus activates -> consume effect -> Unburden volatile should be set
    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ===========================================================================
// Unknown trigger
// ===========================================================================

describe("Gen 6 Items -- Unknown trigger", () => {
  it("given a valid item, when an unknown trigger fires, then item does not activate", () => {
    const pokemon = makeActive({ heldItem: "leftovers" });
    const result = applyGen6HeldItem("unknown-trigger", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// No item
// ===========================================================================

describe("Gen 6 Items -- No held item", () => {
  it("given no held item, when any trigger fires, then returns no activation", () => {
    const pokemon = makeActive({ heldItem: null });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Toxic Orb / Flame Orb type immunity
// ===========================================================================

describe("Gen 6 Items -- Toxic/Flame Orb type immunity", () => {
  it("given Toxic Orb on a Poison-type, when end-of-turn triggers, then does NOT activate (type immune to poison)", () => {
    // Source: Showdown -- Poison and Steel types immune to poisoning
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["poison"],
    });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Toxic Orb on a Steel-type, when end-of-turn triggers, then does NOT activate", () => {
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["steel"],
    });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Flame Orb on a Fire-type, when end-of-turn triggers, then does NOT activate (type immune to burn)", () => {
    // Source: Showdown -- Fire types immune to burn
    const pokemon = makeActive({
      heldItem: "flame-orb",
      types: ["fire"],
    });
    const result = applyGen6HeldItem("end-of-turn", makeItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});
