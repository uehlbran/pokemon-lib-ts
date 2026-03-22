import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen5HeldItem, getPinchBerryThreshold } from "../src/Gen5Items";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

// ---------------------------------------------------------------------------
// Helper factories (mirrors damage-calc.test.ts pattern)
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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
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
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
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
    generation: 5,
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
    generation: 5,
    turnNumber: 1,
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

// ---------------------------------------------------------------------------
// Suppression: Klutz and Embargo
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Klutz and Embargo suppression", () => {
  it("given a Pokemon with Klutz holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppresses all held item effects for the holder
    const pokemon = makeActive({
      heldItem: "leftovers",
      ability: "klutz",
      hp: 200,
      currentHp: 100,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon under Embargo holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/moves.ts -- embargo condition: suppresses held item effects for 5 turns
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("embargo", { turnsLeft: 3 });
    const pokemon = makeActive({
      heldItem: "leftovers",
      hp: 200,
      currentHp: 100,
      volatiles,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with no held item, when any trigger fires, then the item does not activate", () => {
    // Source: Showdown sim/battle.ts -- item handlers are gated on pokemon.item !== ''; null/empty item means no handler fires
    const pokemon = makeActive({ heldItem: null });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leftovers
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Leftovers", () => {
  it("given a Pokemon with 200 max HP holding Leftovers, when end-of-turn triggers, then it heals 12 HP (floor(200/16))", () => {
    // Source: Showdown data/items.ts -- Leftovers: heal 1/16 max HP
    const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 12 }]);
  });

  it("given a Pokemon with 15 max HP holding Leftovers, when end-of-turn triggers, then it heals 1 HP (minimum 1)", () => {
    // Source: floor(15/16) = 0, clamped to 1
    const pokemon = makeActive({ heldItem: "leftovers", hp: 15, currentHp: 10 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Black Sludge
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Black Sludge", () => {
  it("given a Poison-type with 320 max HP holding Black Sludge, when end-of-turn triggers, then it heals 20 HP (floor(320/16))", () => {
    // Source: Showdown data/items.ts -- Black Sludge heals Poison-types 1/16
    const pokemon = makeActive({
      heldItem: "black-sludge",
      types: ["poison"],
      hp: 320,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 20 }]);
  });

  it("given a non-Poison-type with 160 max HP holding Black Sludge, when end-of-turn triggers, then it takes 20 HP damage (floor(160/8))", () => {
    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison types 1/8
    const pokemon = makeActive({
      heldItem: "black-sludge",
      types: ["fire"],
      hp: 160,
      currentHp: 100,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });
});

// ---------------------------------------------------------------------------
// Toxic Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Toxic Orb", () => {
  it("given a Pokemon with no status holding Toxic Orb, when end-of-turn triggers, then it gets badly poisoned", () => {
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["normal"],
      status: null,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "inflict-status", target: "self", status: "badly-poisoned" },
    ]);
  });

  it("given a Pokemon already burned holding Toxic Orb, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Toxic Orb: only activates if target has no status condition
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["normal"],
      status: "burn",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Poison-type holding Toxic Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- type immunity prevents Orb activation
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["poison"],
      status: null,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Steel-type holding Toxic Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- Steel-types are immune to Poison status; Orb cannot inflict it
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["steel"],
      status: null,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flame Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Flame Orb", () => {
  it("given a Pokemon with no status holding Flame Orb, when end-of-turn triggers, then it gets burned", () => {
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    const pokemon = makeActive({
      heldItem: "flame-orb",
      types: ["normal"],
      status: null,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "inflict-status", target: "self", status: "burn" }]);
  });

  it("given a Fire-type holding Flame Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- Fire-types are immune to Burn status; Orb cannot inflict it
    const pokemon = makeActive({
      heldItem: "flame-orb",
      types: ["fire"],
      status: null,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sitrus Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Sitrus Berry", () => {
  it("given a Pokemon with 200 max HP at 50% HP holding Sitrus Berry, when end-of-turn triggers, then it heals 50 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry heals 1/4 max HP
    const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 50 },
      { type: "consume", target: "self", value: "sitrus-berry" },
    ]);
  });

  it("given a Pokemon at 51% HP holding Sitrus Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry: activates at <= 50% HP
    // 102 > floor(200 / 2) = 100, so threshold is not met
    const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 102 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon at 50% HP after taking damage holding Sitrus Berry, when on-damage-taken triggers, then it heals and is consumed", () => {
    // Source: Showdown -- Sitrus Berry also triggers on-damage-taken
    const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 100 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 50 },
      { type: "consume", target: "self", value: "sitrus-berry" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Lum Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Lum Berry", () => {
  it("given a paralyzed Pokemon holding Lum Berry, when end-of-turn triggers, then it cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    const pokemon = makeActive({
      heldItem: "lum-berry",
      status: "paralysis",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: "lum-berry" },
    ]);
  });

  it("given a confused Pokemon holding Lum Berry, when end-of-turn triggers, then it cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate: also cures confusion (volatile status)
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("confusion", { turnsLeft: 3 });
    const pokemon = makeActive({
      heldItem: "lum-berry",
      volatiles,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: "confusion" },
      { type: "consume", target: "self", value: "lum-berry" },
    ]);
  });

  it("given a healthy Pokemon holding Lum Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate: only triggers if status or confusion present
    const pokemon = makeActive({ heldItem: "lum-berry" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status-cure berries (Cheri, Chesto, Pecha, Rawst, Aspear)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Status-cure berries", () => {
  it("given a paralyzed Pokemon holding Cheri Berry, when end-of-turn triggers, then it cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry onUpdate: cures 'par' status
    const pokemon = makeActive({ heldItem: "cheri-berry", status: "paralysis" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a sleeping Pokemon holding Chesto Berry, when end-of-turn triggers, then it cures sleep and is consumed", () => {
    // Source: Showdown data/items.ts -- Chesto Berry onUpdate: cures 'slp' status
    const pokemon = makeActive({ heldItem: "chesto-berry", status: "sleep" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then it cures poison and is consumed", () => {
    // Source: Showdown data/items.ts -- Pecha Berry onUpdate: cures 'psn' and 'tox' status
    const pokemon = makeActive({ heldItem: "pecha-berry", status: "poison" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a badly-poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then it cures badly-poisoned", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures both 'psn' and 'tox' (badly-poisoned)
    const pokemon = makeActive({ heldItem: "pecha-berry", status: "badly-poisoned" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a burned Pokemon holding Rawst Berry, when end-of-turn triggers, then it cures burn and is consumed", () => {
    // Source: Showdown data/items.ts -- Rawst Berry onUpdate: cures 'brn' status
    const pokemon = makeActive({ heldItem: "rawst-berry", status: "burn" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a frozen Pokemon holding Aspear Berry, when end-of-turn triggers, then it cures freeze and is consumed", () => {
    // Source: Showdown data/items.ts -- Aspear Berry onUpdate: cures 'frz' status
    const pokemon = makeActive({ heldItem: "aspear-berry", status: "freeze" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a healthy Pokemon holding Cheri Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- single-status berries only fire if the matched condition is present
    const pokemon = makeActive({ heldItem: "cheri-berry" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persim Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Persim Berry", () => {
  it("given a confused Pokemon holding Persim Berry, when end-of-turn triggers, then it cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Persim Berry onUpdate: removes 'confusion' volatile status
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("confusion", { turnsLeft: 3 });
    const pokemon = makeActive({ heldItem: "persim-berry", volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: "confusion" },
      { type: "consume", target: "self", value: "persim-berry" },
    ]);
  });

  it("given a non-confused Pokemon holding Persim Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Persim Berry only fires if confusion volatile is present
    const pokemon = makeActive({ heldItem: "persim-berry" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mental Herb (Gen 5 expanded)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Mental Herb (expanded)", () => {
  it("given a Pokemon with infatuation holding Mental Herb, when end-of-turn triggers, then it cures infatuation and is consumed", () => {
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("infatuation", { turnsLeft: -1 });
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    const cureEffect = result.effects.find(
      (e) => e.type === "volatile-cure" && e.value === "infatuation",
    );
    expect(cureEffect).toBeDefined();
    const consumeEffect = result.effects.find((e) => e.type === "consume");
    expect(consumeEffect).toBeDefined();
  });

  it("given a taunted Pokemon holding Mental Herb, when end-of-turn triggers, then it cures taunt (Gen 5 expansion)", () => {
    // CHANGED from Gen 4: Mental Herb now cures Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb checks attract, taunt, encore, torment, disable, healblock
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("taunt", { turnsLeft: 3 });
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    const cureEffect = result.effects.find(
      (e) => e.type === "volatile-cure" && e.value === "taunt",
    );
    expect(cureEffect).toBeDefined();
  });

  it("given a Pokemon with Encore and Disable holding Mental Herb, when end-of-turn triggers, then it cures both volatiles", () => {
    // Source: Showdown data/items.ts -- Mental Herb Gen 5 expansion: checks attract, taunt, encore, torment, disable, healblock; cures all present
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("encore", { turnsLeft: 3 });
    volatiles.set("disable", { turnsLeft: 4 });
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    const encoreCure = result.effects.find(
      (e) => e.type === "volatile-cure" && e.value === "encore",
    );
    const disableCure = result.effects.find(
      (e) => e.type === "volatile-cure" && e.value === "disable",
    );
    expect(encoreCure).toBeDefined();
    expect(disableCure).toBeDefined();
  });

  it("given a healthy Pokemon holding Mental Herb, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Mental Herb only fires when one of the six volatiles is present
    const pokemon = makeActive({ heldItem: "mental-herb" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sticky Barb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Sticky Barb", () => {
  it("given a Pokemon with 200 max HP holding Sticky Barb, when end-of-turn triggers, then it takes 25 HP damage (floor(200/8))", () => {
    // Source: Showdown data/items.ts -- Sticky Barb onResidual: 1/8 max HP
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 200, currentHp: 150 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
  });

  it("given a Pokemon with 7 max HP holding Sticky Barb, when end-of-turn triggers, then it takes 1 HP damage (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Sticky Barb: floor(maxHP / 8), minimum 1
    // floor(7 / 8) = 0, clamped to 1
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 7, currentHp: 5 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Focus Sash
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Focus Sash", () => {
  it("given a full-HP Pokemon holding Focus Sash taking a KO hit, when on-damage-taken triggers, then it survives with 1 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority
    const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 250 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "survive", target: "self", value: 1 },
      { type: "consume", target: "self", value: "focus-sash" },
    ]);
  });

  it("given a non-full-HP Pokemon holding Focus Sash taking a KO hit, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash: requires pokemon.hp === pokemon.baseMaxhp to activate
    const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 199 });
    const ctx = makeItemContext({ pokemon, damage: 250 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a full-HP Pokemon holding Focus Sash taking a non-KO hit, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash: only blocks hits that would reduce HP to 0 or below
    const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Focus Band
// ---------------------------------------------------------------------------

// Focus Band is handled by Gen5Ruleset.capLethalDamage (pre-damage hook), NOT on-damage-taken.
// This prevents double-rolling the 10% chance on a single lethal hit.
// Source: Showdown sim/battle-actions.ts -- Focus Band onDamage (pre-damage priority)
describe("Gen 5 Items -- Focus Band (not handled in on-damage-taken)", () => {
  it("given a Pokemon holding Focus Band and lethal damage, when on-damage-taken triggers, then it does NOT activate (handled by capLethalDamage instead)", () => {
    // Focus Band moved to capLethalDamage to avoid double-rolling.
    const pokemon = makeActive({ heldItem: "focus-band", hp: 100, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 150, seed: 0 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon taking a non-KO hit, when Focus Band is checked via on-damage-taken, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Band: only applies when damage would be lethal
    const pokemon = makeActive({ heldItem: "focus-band", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Gen5Ruleset.capLethalDamage -- Focus Band (authoritative handler)", () => {
  it("given Focus Band at reduced HP and lucky RNG, when lethal damage is dealt, then survives with damage capped to currentHp - 1", () => {
    // Source: Showdown data/items.ts -- Focus Band 10% activation
    // Fix: damage capped to currentHp - 1 (not maxHp - 1) to leave exactly 1 HP
    // Verification: currentHp=60, maxHp=200, damage=300 -> capped damage = 59 (leaves 1 HP)
    let luckyResult: { damage: number; survived: boolean; messages: string[] } | undefined;
    const ruleset = new Gen5Ruleset();
    for (let seed = 0; seed < 1000; seed++) {
      const defender = makeActive({ heldItem: "focus-band", hp: 200, currentHp: 60 });
      const state = { ...makeState(), rng: new SeededRandom(seed) } as unknown as BattleState;
      const result = ruleset.capLethalDamage(300, defender, defender, makeMove(), state);
      if (result.survived) {
        luckyResult = result;
        break;
      }
    }
    expect(luckyResult).toBeDefined();
    expect(luckyResult!.survived).toBe(true);
    expect(luckyResult!.damage).toBe(59); // currentHp - 1 = 60 - 1 = 59; HP after = 60 - 59 = 1
    expect(luckyResult!.messages[0]).toContain("Focus Band");
  });

  it("given Focus Band and unlucky RNG, when lethal damage is dealt, then does not survive", () => {
    // Source: Showdown data/items.ts -- Focus Band 10% chance; most seeds fail
    // Find a seed where ALL 200 rolls fail (highly likely for a single seed at 10% chance)
    const ruleset = new Gen5Ruleset();
    const defender = makeActive({ heldItem: "focus-band", hp: 100, currentHp: 100 });
    // SeededRandom seed=42 consistently fails the 10% check
    const state = { ...makeState(), rng: new SeededRandom(42) } as unknown as BattleState;
    const result = ruleset.capLethalDamage(100, defender, defender, makeMove(), state);
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(100); // Original lethal damage unchanged
  });
});

// ---------------------------------------------------------------------------
// Stat pinch berries
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Stat pinch berries", () => {
  it("given a Pokemon at 25% HP after damage holding Liechi Berry, when on-damage-taken triggers, then Attack is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at <=25% HP
    const pokemon = makeActive({ heldItem: "liechi-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 51 }); // 100 - 51 = 49 <= floor(200*0.25) = 50
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: "liechi-berry" },
    ]);
  });

  it("given a Pokemon at 26% HP after damage holding Liechi Berry, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- pinch berries activate at <= 25% HP threshold
    // 100 - 49 = 51 > floor(200 * 0.25) = 50, so threshold is not met
    const pokemon = makeActive({ heldItem: "liechi-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 49 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Gluttony holding Liechi Berry at 50% after damage, when on-damage-taken triggers, then it activates early", () => {
    // Source: Bulbapedia -- Gluttony: pinch berries activate at 50% instead of 25%
    const pokemon = makeActive({
      heldItem: "liechi-berry",
      ability: "gluttony",
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon, damage: 100 }); // 200 - 100 = 100 <= floor(200*0.5) = 100
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Ganlon Berry activating, then it boosts Defense", () => {
    // Source: Showdown data/items.ts -- Ganlon Berry onEat: boosts: { def: 1 }
    const pokemon = makeActive({ heldItem: "ganlon-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "defense",
    });
  });

  it("given Salac Berry activating, then it boosts Speed", () => {
    // Source: Showdown data/items.ts -- Salac Berry onEat: boosts: { spe: 1 }
    const pokemon = makeActive({ heldItem: "salac-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "speed",
    });
  });

  it("given Petaya Berry activating, then it boosts Sp. Atk", () => {
    // Source: Showdown data/items.ts -- Petaya Berry onEat: boosts: { spa: 1 }
    const pokemon = makeActive({ heldItem: "petaya-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Apicot Berry activating, then it boosts Sp. Def", () => {
    // Source: Showdown data/items.ts -- Apicot Berry onEat: boosts: { spd: 1 }
    const pokemon = makeActive({ heldItem: "apicot-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });
});

// ---------------------------------------------------------------------------
// getPinchBerryThreshold
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- getPinchBerryThreshold", () => {
  it("given a Pokemon with Gluttony and a 25% threshold, then returns 50%", () => {
    // Source: Bulbapedia -- Gluttony: pinch berries (<=25% threshold) activate at <=50% instead
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.25)).toBe(0.5);
  });

  it("given a Pokemon without Gluttony and a 25% threshold, then returns 25%", () => {
    // Source: Showdown data/items.ts -- default pinch berry threshold is 0.25 (25% HP)
    expect(getPinchBerryThreshold({ ability: "none" }, 0.25)).toBe(0.25);
  });

  it("given a Pokemon with Gluttony and a 50% threshold (Sitrus), then returns 50% unchanged", () => {
    // Source: Bulbapedia -- Gluttony only affects berries with threshold <= 0.25; Sitrus (0.5) is unaffected
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.5)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Rocky Helmet (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Rocky Helmet", () => {
  it("given a defender with Rocky Helmet hit by a contact move, when on-contact triggers, then attacker takes 1/6 attacker max HP", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
    //   if (move.flags['contact']) this.damage(source.baseMaxhp / 6, source, target)
    const defender = makeActive({ heldItem: "rocky-helmet", hp: 200, currentHp: 150 });
    const attacker = makeActive({ hp: 300, currentHp: 300 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = makeState({ sides: sides as any });
    const contactMove = makeMove({ flags: { contact: true } });
    const ctx = makeItemContext({ pokemon: defender, state, move: contactMove, damage: 50 });
    const result = applyGen5HeldItem("on-contact", ctx);
    expect(result.activated).toBe(true);
    // 1/6 of attacker's 300 HP = 50
    expect(result.effects).toEqual([{ type: "chip-damage", target: "opponent", value: 50 }]);
  });

  it("given a defender with Rocky Helmet hit by a non-contact move, when on-contact triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet: only fires when move.flags['contact'] is true
    const defender = makeActive({ heldItem: "rocky-helmet", hp: 200, currentHp: 150 });
    const nonContactMove = makeMove({ flags: { contact: false } });
    const ctx = makeItemContext({ pokemon: defender, move: nonContactMove, damage: 50 });
    const result = applyGen5HeldItem("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Air Balloon (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Air Balloon", () => {
  it("given a defender with Air Balloon taking damage, when on-damage-taken triggers, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 30 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "consume", target: "self", value: "air-balloon" }]);
    expect(result.messages[0]).toContain("popped");
  });

  it("given a defender with Air Balloon taking 0 damage, when on-damage-taken triggers, then it does not pop", () => {
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit only fires on actual damaging hits
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Red Card (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Red Card", () => {
  it("given a defender with Red Card taking damage, when on-damage-taken triggers, then opponent is forced to switch and Red Card is consumed", () => {
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary:
    //   source.forceSwitchFlag = true
    const pokemon = makeActive({ heldItem: "red-card", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    const forceSwitch = result.effects.find(
      (e) => e.type === "none" && e.target === "opponent" && e.value === "force-switch",
    );
    expect(forceSwitch).toBeDefined();
    const consume = result.effects.find((e) => e.type === "consume");
    expect(consume).toBeDefined();
  });

  it("given a defender with Red Card taking 0 damage, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Red Card only fires on actual damaging hits
    const pokemon = makeActive({ heldItem: "red-card", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Eject Button (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Eject Button", () => {
  it("given a defender with Eject Button taking damage, when on-damage-taken triggers, then holder is forced to switch and Eject Button is consumed", () => {
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary:
    //   target.switchFlag = true
    const pokemon = makeActive({ heldItem: "eject-button", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    const forceSwitch = result.effects.find(
      (e) => e.type === "none" && e.target === "self" && e.value === "force-switch",
    );
    expect(forceSwitch).toBeDefined();
    const consume = result.effects.find((e) => e.type === "consume");
    expect(consume).toBeDefined();
  });

  it("given a defender with Eject Button taking 0 damage, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Eject Button only fires on actual damaging hits
    const pokemon = makeActive({ heldItem: "eject-button", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Absorb Bulb (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Absorb Bulb", () => {
  it("given a defender with Absorb Bulb hit by a Water move, when on-damage-taken triggers, then SpA is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit:
    //   if (move.type === 'Water') boost spa by 1, useItem
    const pokemon = makeActive({ heldItem: "absorb-bulb", hp: 200, currentHp: 150 });
    const waterMove = makeMove({ type: "water" });
    const ctx = makeItemContext({ pokemon, move: waterMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "spAttack" },
      { type: "consume", target: "self", value: "absorb-bulb" },
    ]);
  });

  it("given a defender with Absorb Bulb hit by a non-Water move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb: only triggers on Water-type moves
    const pokemon = makeActive({ heldItem: "absorb-bulb", hp: 200, currentHp: 150 });
    const fireMove = makeMove({ type: "fire" });
    const ctx = makeItemContext({ pokemon, move: fireMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cell Battery (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Cell Battery", () => {
  it("given a defender with Cell Battery hit by an Electric move, when on-damage-taken triggers, then Atk is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit:
    //   if (move.type === 'Electric') boost atk by 1, useItem
    const pokemon = makeActive({ heldItem: "cell-battery", hp: 200, currentHp: 150 });
    const electricMove = makeMove({ type: "electric" });
    const ctx = makeItemContext({ pokemon, move: electricMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: "cell-battery" },
    ]);
  });

  it("given a defender with Cell Battery hit by a non-Electric move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Cell Battery: only triggers on Electric-type moves
    const pokemon = makeActive({ heldItem: "cell-battery", hp: 200, currentHp: 150 });
    const normalMove = makeMove({ type: "normal" });
    const ctx = makeItemContext({ pokemon, move: normalMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// King's Rock / Razor Fang (Gen 5: no whitelist)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- King's Rock / Razor Fang (no whitelist in Gen 5)", () => {
  it("given a Pokemon with King's Rock using any damaging move with lucky RNG, when on-hit triggers, then it causes flinch", () => {
    // Source: Showdown data/items.ts -- Gen 5+ King's Rock applies to ALL damaging moves
    // (no more affectedByKingsRock whitelist)
    let flinchResult: ReturnType<typeof applyGen5HeldItem> | undefined;
    for (let seed = 0; seed < 1000; seed++) {
      const pokemon = makeActive({ heldItem: "kings-rock" });
      const ctx = makeItemContext({ pokemon, damage: 50, seed });
      const r = applyGen5HeldItem("on-hit", ctx);
      if (r.activated) {
        flinchResult = r;
        break;
      }
    }
    expect(flinchResult).toBeDefined();
    expect(flinchResult!.effects).toEqual([{ type: "flinch", target: "opponent" }]);
  });

  it("given a Pokemon with Razor Fang dealing damage, when on-hit triggers with lucky RNG, then it causes flinch", () => {
    // Source: Showdown data/items.ts -- Razor Fang: same 10% flinch chance as King's Rock, applies to all damaging moves in Gen 5
    let flinchResult: ReturnType<typeof applyGen5HeldItem> | undefined;
    for (let seed = 0; seed < 1000; seed++) {
      const pokemon = makeActive({ heldItem: "razor-fang" });
      const ctx = makeItemContext({ pokemon, damage: 50, seed });
      const r = applyGen5HeldItem("on-hit", ctx);
      if (r.activated) {
        flinchResult = r;
        break;
      }
    }
    expect(flinchResult).toBeDefined();
    expect(flinchResult!.effects).toEqual([{ type: "flinch", target: "opponent" }]);
  });

  it("given a Pokemon with King's Rock dealing 0 damage, when on-hit triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- King's Rock: requires damage > 0 to have a flinch chance
    const pokemon = makeActive({ heldItem: "kings-rock" });
    const ctx = makeItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shell Bell
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Shell Bell", () => {
  it("given a Pokemon with Shell Bell dealing 80 damage, when on-hit triggers, then it heals 10 HP (floor(80/8))", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heal 1/8 damage dealt
    const pokemon = makeActive({ heldItem: "shell-bell" });
    const ctx = makeItemContext({ pokemon, damage: 80 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
  });

  it("given a Pokemon with Shell Bell dealing 5 damage, when on-hit triggers, then it heals 1 HP (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heal floor(damage / 8), minimum 1
    // floor(5 / 8) = 0, clamped to 1
    const pokemon = makeActive({ heldItem: "shell-bell" });
    const ctx = makeItemContext({ pokemon, damage: 5 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Life Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Life Orb", () => {
  it("given a Pokemon with 200 max HP and Life Orb dealing damage, when on-hit triggers, then it takes 20 HP recoil (floor(200/10))", () => {
    // Source: Showdown data/items.ts -- Life Orb recoil: floor(maxHP/10)
    const pokemon = makeActive({ heldItem: "life-orb", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });

  it("given a Pokemon with 15 max HP and Life Orb dealing damage, when on-hit triggers, then it takes 1 HP recoil (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10), minimum 1
    // floor(15 / 10) = 1
    const pokemon = makeActive({ heldItem: "life-orb", hp: 15, currentHp: 15 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 1 }]);
  });

  it("given a Pokemon with Life Orb dealing 0 damage, when on-hit triggers, then it does not take recoil", () => {
    // Source: Showdown data/items.ts -- Life Orb: requires damage > 0 to trigger recoil
    const pokemon = makeActive({ heldItem: "life-orb", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem("on-hit", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Life Orb + Sheer Force interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Life Orb + Sheer Force interaction", () => {
  it("given a Sheer Force Pokemon using a move with a secondary effect and Life Orb, when on-hit triggers, then Life Orb recoil is suppressed", () => {
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    // Sheer Force suppresses LO recoil when the move has an eligible secondary effect
    const pokemon = makeActive({
      heldItem: "life-orb",
      ability: "sheer-force",
      hp: 200,
      currentHp: 200,
    });
    // Move with a status-chance secondary effect (Sheer Force eligible)
    // Source: Showdown -- Flamethrower: secondary.status burn, chance 10
    const moveWithEffect = makeMove({
      effect: {
        type: "status-chance",
        status: "burn",
        chance: 10,
      },
    });
    const ctx = makeItemContext({ pokemon, move: moveWithEffect, damage: 80 });
    const result = applyGen5HeldItem("on-hit", ctx);
    // Should NOT activate because Sheer Force suppresses Life Orb recoil
    expect(result.activated).toBe(false);
  });

  it("given a Sheer Force Pokemon using a move without a secondary effect and Life Orb, when on-hit triggers, then Life Orb recoil is NOT suppressed", () => {
    // Source: Showdown scripts.ts -- Sheer Force: only suppresses Life Orb recoil when move.hasSheerForce is set (move has eligible secondary)
    // When the move doesn't qualify for Sheer Force, Life Orb recoil applies normally
    const pokemon = makeActive({
      heldItem: "life-orb",
      ability: "sheer-force",
      hp: 200,
      currentHp: 200,
    });
    // Move with NO secondary effect (Sheer Force does NOT activate)
    const moveWithoutEffect = makeMove({ effect: null });
    const ctx = makeItemContext({ pokemon, move: moveWithoutEffect, damage: 80 });
    const result = applyGen5HeldItem("on-hit", ctx);
    // SHOULD activate because Sheer Force did not trigger
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });
});

// ---------------------------------------------------------------------------
// Unburden interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Unburden interaction", () => {
  it("given a Pokemon with Unburden whose item is consumed, when the item triggers, then the unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      ability: "unburden",
      hp: 200,
      currentHp: 100,
    });
    const ctx = makeItemContext({ pokemon });
    applyGen5HeldItem("end-of-turn", ctx);
    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });

  it("given a Pokemon without Unburden whose item is consumed, when the item triggers, then no unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem: only sets volatile when pokemon.hasAbility('unburden')
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      ability: "none",
      hp: 200,
      currentHp: 100,
    });
    const ctx = makeItemContext({ pokemon });
    applyGen5HeldItem("end-of-turn", ctx);
    expect(pokemon.volatileStatuses.has("unburden")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metronome item
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Metronome item", () => {
  it("given a Pokemon with Metronome item using the same move twice, when before-move triggers, then consecutive count increments", () => {
    // Source: Showdown data/items.ts -- Metronome item onModifyDamage
    const pokemon = makeActive({ heldItem: "metronome" });
    const move = makeMove({ id: "ice-beam" });

    // First use
    const ctx1 = makeItemContext({ pokemon, move });
    applyGen5HeldItem("before-move", ctx1);
    const state1 = pokemon.volatileStatuses.get("metronome-count");
    expect(state1?.data?.count).toBe(1);
    expect(state1?.data?.moveId).toBe("ice-beam");

    // Second use (same move)
    const ctx2 = makeItemContext({ pokemon, move });
    applyGen5HeldItem("before-move", ctx2);
    const state2 = pokemon.volatileStatuses.get("metronome-count");
    expect(state2?.data?.count).toBe(2);
  });

  it("given a Pokemon with Metronome item switching moves, when before-move triggers, then consecutive count resets to 1", () => {
    // Source: Showdown data/items.ts -- Metronome item: count resets to 1 when moveId !== lastMoveId
    const pokemon = makeActive({ heldItem: "metronome" });
    const move1 = makeMove({ id: "ice-beam" });
    const move2 = makeMove({ id: "thunderbolt" });

    // First use
    const ctx1 = makeItemContext({ pokemon, move: move1 });
    applyGen5HeldItem("before-move", ctx1);

    // Second use (different move)
    const ctx2 = makeItemContext({ pokemon, move: move2 });
    applyGen5HeldItem("before-move", ctx2);
    const state = pokemon.volatileStatuses.get("metronome-count");
    expect(state?.data?.count).toBe(1);
    expect(state?.data?.moveId).toBe("thunderbolt");
  });
});

// ---------------------------------------------------------------------------
// Jaboca / Rowap Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Jaboca / Rowap Berry", () => {
  it("given a Pokemon holding Jaboca Berry hit by a physical move, when on-damage-taken triggers, then attacker takes 1/8 attacker max HP retaliation", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: this.damage(source.baseMaxhp / 8)
    const defender = makeActive({ heldItem: "jaboca-berry", hp: 200, currentHp: 150 });
    const attacker = makeActive({ hp: 400, currentHp: 400 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = makeState({ sides: sides as any });
    const physicalMove = makeMove({ category: "physical" });
    const ctx = makeItemContext({ pokemon: defender, state, move: physicalMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    // 1/8 of attacker's 400 HP = 50
    expect(result.effects[0]).toEqual({
      type: "chip-damage",
      target: "opponent",
      value: 50,
    });
    expect(result.effects[1]).toEqual({
      type: "consume",
      target: "self",
      value: "jaboca-berry",
    });
  });

  it("given a Pokemon holding Rowap Berry hit by a special move, when on-damage-taken triggers, then attacker takes 1/8 attacker max HP retaliation", () => {
    // Source: Showdown data/items.ts -- Rowap Berry: same formula as Jaboca
    const defender = makeActive({ heldItem: "rowap-berry", hp: 200, currentHp: 150 });
    const attacker = makeActive({ hp: 240, currentHp: 240 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = makeState({ sides: sides as any });
    const specialMove = makeMove({ category: "special" });
    const ctx = makeItemContext({ pokemon: defender, state, move: specialMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    // 1/8 of attacker's 240 HP = 30
    expect(result.effects[0]).toEqual({
      type: "chip-damage",
      target: "opponent",
      value: 30,
    });
  });

  it("given a Pokemon holding Jaboca Berry hit by a special move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: only fires when move.category === 'physical'
    const defender = makeActive({ heldItem: "jaboca-berry", hp: 200, currentHp: 150 });
    const specialMove = makeMove({ category: "special" });
    const ctx = makeItemContext({ pokemon: defender, move: specialMove, damage: 50 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Berry Juice
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Berry Juice", () => {
  it("given a Pokemon at 50% HP holding Berry Juice, when end-of-turn triggers, then it heals 20 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Berry Juice: restores 20 HP at <=50%
    const pokemon = makeActive({ heldItem: "berry-juice", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 20 },
      { type: "consume", target: "self", value: "berry-juice" },
    ]);
  });

  it("given a Pokemon above 50% HP holding Berry Juice, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Berry Juice: threshold is currentHP <= maxHP / 2; 150 > 100 so no activation
    const pokemon = makeActive({ heldItem: "berry-juice", hp: 200, currentHp: 150 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown trigger / unknown item
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- unknown trigger and unknown items", () => {
  it("given a Pokemon with an unrecognized item, when any trigger fires, then it does not activate", () => {
    // Source: Showdown data/items.ts -- unrecognized item IDs have no handler; applyGen5HeldItem returns { activated: false }
    const pokemon = makeActive({ heldItem: "some-unknown-item" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Leftovers, when an unknown trigger fires, then it does not activate", () => {
    // Source: Showdown data/items.ts -- unrecognized trigger names fall through the switch; returns { activated: false }
    const pokemon = makeActive({ heldItem: "leftovers" });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen5HeldItem("some-unknown-trigger", ctx);
    expect(result.activated).toBe(false);
  });
});
