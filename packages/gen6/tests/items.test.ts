import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen6HeldItem,
  getPinchBerryThreshold,
  isGen6PowderBlocked,
  isMegaStone,
} from "../src/Gen6Items";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

// ---------------------------------------------------------------------------
// Helper factories (mirrors Gen5 items.test.ts pattern)
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

describe("Gen 6 Items -- Klutz and Embargo suppression", () => {
  it("given a Pokemon with Klutz holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppresses all held item effects
    const pokemon = makeActive({
      heldItem: "leftovers",
      ability: "klutz",
      hp: 200,
      currentHp: 100,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon under Embargo holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/moves.ts -- embargo condition: suppresses held item effects
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("embargo", { turnsLeft: 3 });
    const pokemon = makeActive({
      heldItem: "leftovers",
      hp: 200,
      currentHp: 100,
      volatiles,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leftovers
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Leftovers", () => {
  it("given a Pokemon holding Leftovers with 200 max HP, when end-of-turn triggers, then heals 12 HP (floor(200/16)=12)", () => {
    // Source: Showdown data/items.ts -- Leftovers: heals 1/16 max HP per turn
    // Derivation: floor(200 / 16) = 12
    const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 150 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 12 }]);
  });

  it("given a Pokemon holding Leftovers with 100 max HP, when end-of-turn triggers, then heals 6 HP (floor(100/16)=6)", () => {
    // Source: Showdown data/items.ts -- Leftovers: heals 1/16 max HP per turn
    // Derivation: floor(100 / 16) = 6
    const pokemon = makeActive({ heldItem: "leftovers", hp: 100, currentHp: 80 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 6 }]);
  });
});

// ---------------------------------------------------------------------------
// Life Orb
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Life Orb", () => {
  it("given a Pokemon holding Life Orb with 200 max HP, when dealing damage on-hit, then takes 20 HP recoil (floor(200/10)=20)", () => {
    // Source: Showdown data/items.ts -- Life Orb: recoil = floor(maxHP / 10)
    // Derivation: floor(200 / 10) = 20
    const pokemon = makeActive({ heldItem: "life-orb", hp: 200, currentHp: 200 });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ id: "tackle" }),
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });

  it("given a Pokemon holding Life Orb with 300 max HP, when dealing damage on-hit, then takes 30 HP recoil (floor(300/10)=30)", () => {
    // Source: Showdown data/items.ts -- Life Orb: recoil = floor(maxHP / 10)
    // Derivation: floor(300 / 10) = 30
    const pokemon = makeActive({ heldItem: "life-orb", hp: 300, currentHp: 300 });
    const ctx = makeItemContext({
      pokemon,
      damage: 80,
      move: makeMove({ id: "tackle" }),
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 30 }]);
  });

  it("given a Pokemon with Sheer Force using a move with secondary effect, when Life Orb recoil check occurs, then recoil is suppressed", () => {
    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    const pokemon = makeActive({
      heldItem: "life-orb",
      ability: "sheer-force",
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({
        id: "flamethrower",
        type: "fire",
        category: "special",
        // status-chance effect triggers Sheer Force
        effect: { type: "status-chance", status: "burn", chance: 10 },
      }),
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Choice Band
// ---------------------------------------------------------------------------
// Note: Choice Band's 1.5x Atk boost is handled in Gen6DamageCalc.ts, not in applyHeldItem.
// Choice Lock is handled by the engine. No applyHeldItem test needed for damage boost.

// ---------------------------------------------------------------------------
// Rocky Helmet
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Rocky Helmet", () => {
  it("given a defender holding Rocky Helmet and attacker has 300 max HP, when hit by contact move, then attacker takes 50 damage (floor(300/6)=50)", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet: attacker takes 1/6 of its max HP
    // Derivation: floor(300 / 6) = 50
    const defender = makeActive({
      heldItem: "rocky-helmet",
      hp: 200,
      currentHp: 200,
    });
    const attacker = makeActive({ hp: 300, currentHp: 300 });
    const state = makeState({
      sides: [
        { active: [defender], hazards: {}, screens: {} },
        { active: [attacker], hazards: {}, screens: {} },
      ],
    });
    const ctx = makeItemContext({
      pokemon: defender,
      state,
      move: makeMove({ flags: { contact: true } }),
    });
    const result = applyGen6HeldItem("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "opponent", value: 50 }]);
  });

  it("given a defender holding Rocky Helmet, when hit by a non-contact move, then Rocky Helmet does NOT activate", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet only triggers on contact moves
    const defender = makeActive({
      heldItem: "rocky-helmet",
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({
      pokemon: defender,
      move: makeMove({ flags: { contact: false } }),
    });
    const result = applyGen6HeldItem("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weakness Policy (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Weakness Policy", () => {
  it("given a Water-type Pokemon holding Weakness Policy, when hit by a 2x super-effective Electric move, then gains +2 Atk and +2 SpAtk and item is consumed", () => {
    // Source: Showdown data/items.ts -- weaknesspolicy: onDamagingHit: if SE, +2 Atk/SpA
    // Source: Bulbapedia "Weakness Policy" -- introduced in Gen 6
    // Water is weak to Electric (2x effectiveness)
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["water"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 80,
      move: makeMove({ type: "electric", category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack", stages: 2 },
      { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
      { type: "consume", target: "self", value: "weakness-policy" },
    ]);
  });

  it("given a Grass/Poison Pokemon holding Weakness Policy, when hit by a 4x super-effective Psychic move, then gains +2 Atk and +2 SpAtk", () => {
    // Source: Showdown data/items.ts -- Weakness Policy: activates at 2x or 4x effectiveness
    // Grass/Poison vs Psychic: Grass=1x, Poison=2x => 2x total (super-effective)
    // Actually: need a dual type that gives 4x. Fire/Grass vs Rock = Fire(2x)*Grass(2x) = 4x
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["fire", "grass"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 120,
      move: makeMove({ type: "rock", category: "physical" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack", stages: 2 },
      { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
      { type: "consume", target: "self", value: "weakness-policy" },
    ]);
  });

  it("given a Water-type Pokemon holding Weakness Policy, when hit by a neutral Normal move, then Weakness Policy does NOT activate", () => {
    // Source: Showdown data/items.ts -- Weakness Policy only activates on SE hits (>= 2x)
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["water"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ type: "normal", category: "physical" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Kee Berry (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Kee Berry", () => {
  it("given a Pokemon holding Kee Berry, when hit by a physical move, then gains +1 Defense and berry is consumed", () => {
    // Source: Showdown data/items.ts -- keeberry: onDamagingHit physical: boost defense +1
    // Source: Bulbapedia "Kee Berry" -- raises Defense by 1 on physical hit
    const pokemon = makeActive({
      heldItem: "kee-berry",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ category: "physical" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "defense" },
      { type: "consume", target: "self", value: "kee-berry" },
    ]);
  });

  it("given a Pokemon holding Kee Berry, when hit by a special move, then Kee Berry does NOT activate", () => {
    // Source: Showdown data/items.ts -- Kee Berry only activates on physical hits
    const pokemon = makeActive({
      heldItem: "kee-berry",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Maranga Berry (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Maranga Berry", () => {
  it("given a Pokemon holding Maranga Berry, when hit by a special move, then gains +1 SpDef and berry is consumed", () => {
    // Source: Showdown data/items.ts -- marangaberry: onDamagingHit special: boost spd +1
    // Source: Bulbapedia "Maranga Berry" -- raises Sp. Def by 1 on special hit
    const pokemon = makeActive({
      heldItem: "maranga-berry",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "spDefense" },
      { type: "consume", target: "self", value: "maranga-berry" },
    ]);
  });

  it("given a Pokemon holding Maranga Berry, when hit by a physical move, then Maranga Berry does NOT activate", () => {
    // Source: Showdown data/items.ts -- Maranga Berry only activates on special hits
    const pokemon = makeActive({
      heldItem: "maranga-berry",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ category: "physical" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Roseli Berry (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Roseli Berry (moved to damage calc)", () => {
  it("given a Dragon-type Pokemon holding Roseli Berry, when on-damage-taken fires, then item handler does NOT activate (resist berries handled in damage calc now)", () => {
    // Type resist berries were moved from on-damage-taken to the damage calc (pre-damage)
    // to fix #622 -- the damage-boost effect was ignored by processItemResult.
    // See Gen6DamageCalc.ts for the actual resist berry logic.
    const pokemon = makeActive({
      heldItem: "roseli-berry",
      types: ["dragon"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 80,
      move: makeMove({ type: "fairy", category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Luminous Moss (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Luminous Moss", () => {
  it("given a Pokemon holding Luminous Moss, when hit by a Water-type move, then gains +1 SpDef and item is consumed", () => {
    // Source: Showdown data/items.ts -- luminousmoss: onDamagingHit Water: boost spd +1
    // Source: Bulbapedia "Luminous Moss" -- raises Sp. Def by 1 when hit by Water
    const pokemon = makeActive({
      heldItem: "luminous-moss",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ type: "water", category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "spDefense" },
      { type: "consume", target: "self", value: "luminous-moss" },
    ]);
  });

  it("given a Pokemon holding Luminous Moss, when hit by a Fire-type move, then item does NOT activate", () => {
    // Source: Showdown data/items.ts -- Luminous Moss only triggers on Water moves
    const pokemon = makeActive({
      heldItem: "luminous-moss",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ type: "fire", category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snowball (NEW Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Snowball", () => {
  it("given a Pokemon holding Snowball, when hit by an Ice-type move, then gains +1 Atk and item is consumed", () => {
    // Source: Showdown data/items.ts -- snowball: onDamagingHit Ice: boost atk +1
    // Source: Bulbapedia "Snowball" -- raises Atk by 1 when hit by Ice
    const pokemon = makeActive({
      heldItem: "snowball",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ type: "ice", category: "special" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: "snowball" },
    ]);
  });

  it("given a Pokemon holding Snowball, when hit by a Normal-type move, then item does NOT activate", () => {
    // Source: Showdown data/items.ts -- Snowball only triggers on Ice moves
    const pokemon = makeActive({
      heldItem: "snowball",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({ type: "normal", category: "physical" }),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mega Stone helpers
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- isMegaStone", () => {
  it("given 'venusaurite', when checking isMegaStone, then returns true", () => {
    // Source: Showdown data/items.ts -- venusaurite has megaStone property
    expect(isMegaStone("venusaurite")).toBe(true);
  });

  it("given 'charizardite-x', when checking isMegaStone, then returns true", () => {
    // Source: Showdown data/items.ts -- charizarditex has megaStone property
    expect(isMegaStone("charizardite-x")).toBe(true);
  });

  it("given 'charizardite-y', when checking isMegaStone, then returns true", () => {
    // Source: Showdown data/items.ts -- charizarditey has megaStone property
    expect(isMegaStone("charizardite-y")).toBe(true);
  });

  it("given 'blue-orb', when checking isMegaStone, then returns true (Primal Kyogre)", () => {
    // Source: Showdown data/items.ts -- blue-orb is a primal reversion item
    expect(isMegaStone("blue-orb")).toBe(true);
  });

  it("given 'red-orb', when checking isMegaStone, then returns true (Primal Groudon)", () => {
    // Source: Showdown data/items.ts -- red-orb is a primal reversion item
    expect(isMegaStone("red-orb")).toBe(true);
  });

  it("given 'leftovers', when checking isMegaStone, then returns false", () => {
    // Source: Showdown data/items.ts -- leftovers is not a mega stone
    expect(isMegaStone("leftovers")).toBe(false);
  });

  it("given 'life-orb', when checking isMegaStone, then returns false", () => {
    // Source: Showdown data/items.ts -- life-orb is not a mega stone
    expect(isMegaStone("life-orb")).toBe(false);
  });

  it("given empty string, when checking isMegaStone, then returns false", () => {
    expect(isMegaStone("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Safety Goggles powder blocking
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Safety Goggles powder blocking", () => {
  it("given Safety Goggles and a powder move, when checking isGen6PowderBlocked, then returns true", () => {
    // Source: Showdown data/items.ts -- safetygoggles: isPowderImmune
    // Source: Bulbapedia "Safety Goggles" -- blocks powder moves
    expect(isGen6PowderBlocked("safety-goggles", { powder: true })).toBe(true);
  });

  it("given Safety Goggles and a non-powder move, when checking isGen6PowderBlocked, then returns false", () => {
    // Source: Showdown data/items.ts -- Safety Goggles only blocks powder moves
    expect(isGen6PowderBlocked("safety-goggles", { powder: false })).toBe(false);
  });

  it("given a non-Safety-Goggles item and a powder move, when checking isGen6PowderBlocked, then returns false", () => {
    // Source: Only Safety Goggles has isPowderImmune property
    expect(isGen6PowderBlocked("leftovers", { powder: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flame Orb / Toxic Orb
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Status Orbs", () => {
  it("given a Normal-type Pokemon holding Flame Orb with no status, when end-of-turn triggers, then inflicts burn", () => {
    // Source: Showdown data/items.ts -- Flame Orb: inflicts burn at end of turn
    const pokemon = makeActive({
      heldItem: "flame-orb",
      types: ["normal"],
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "inflict-status", target: "self", status: "burn" }]);
  });

  it("given a Fire-type Pokemon holding Flame Orb, when end-of-turn triggers, then burn is NOT inflicted (Fire immunity)", () => {
    // Source: Showdown -- Fire types are immune to burn
    const pokemon = makeActive({
      heldItem: "flame-orb",
      types: ["fire"],
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Normal-type Pokemon holding Toxic Orb with no status, when end-of-turn triggers, then inflicts badly-poisoned", () => {
    // Source: Showdown data/items.ts -- Toxic Orb: inflicts badly-poisoned at end of turn
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["normal"],
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "inflict-status", target: "self", status: "badly-poisoned" },
    ]);
  });

  it("given a Poison-type Pokemon holding Toxic Orb, when end-of-turn triggers, then poison is NOT inflicted (Poison immunity)", () => {
    // Source: Showdown -- Poison types are immune to poison
    const pokemon = makeActive({
      heldItem: "toxic-orb",
      types: ["poison"],
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Black Sludge
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Black Sludge", () => {
  it("given a Poison-type Pokemon holding Black Sludge with 200 max HP, when end-of-turn triggers, then heals 12 HP (floor(200/16)=12)", () => {
    // Source: Showdown data/items.ts -- Black Sludge: heals Poison types 1/16 max HP
    // Derivation: floor(200 / 16) = 12
    const pokemon = makeActive({
      heldItem: "black-sludge",
      types: ["poison"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 12 }]);
  });

  it("given a Normal-type Pokemon holding Black Sludge with 200 max HP, when end-of-turn triggers, then takes 25 damage (floor(200/8)=25)", () => {
    // Source: Showdown data/items.ts -- Black Sludge: damages non-Poison types 1/8 max HP
    // Derivation: floor(200 / 8) = 25
    const pokemon = makeActive({
      heldItem: "black-sludge",
      types: ["normal"],
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen6HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
  });
});

// ---------------------------------------------------------------------------
// Focus Sash
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Focus Sash (moved to capLethalDamage, #784)", () => {
  it("given a Pokemon at full HP holding Focus Sash, when on-damage-taken triggers, then does NOT activate (handled by capLethalDamage now)", () => {
    // Focus Sash was moved from handleOnDamageTaken to capLethalDamage (pre-damage hook)
    // because handleOnDamageTaken fires post-damage, making currentHp === maxHp always false.
    // See: Gen6Ruleset.capLethalDamage and GitHub issue #784
    const pokemon = makeActive({
      heldItem: "focus-sash",
      hp: 200,
      currentHp: 200,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 250,
      move: makeMove({}),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon NOT at full HP holding Focus Sash, when on-damage-taken triggers, then does NOT activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash requires full HP
    const pokemon = makeActive({
      heldItem: "focus-sash",
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 200,
      move: makeMove({}),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pinch berries (stat boost)
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Pinch Berries", () => {
  it("given a Pokemon holding Liechi Berry at 49 HP (post-damage, below 25% of 200), when on-damage-taken triggers, then gains +1 Attack", () => {
    // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at <=25% HP
    // Derivation: 25% of 200 = 50; post-damage HP = 49 < 50
    // Note: on-damage-taken fires after BattleEngine subtracts damage from currentHp,
    // so currentHp is already post-damage here.
    const pokemon = makeActive({
      heldItem: "liechi-berry",
      hp: 200,
      currentHp: 49, // post-damage HP (was 200, took 151 damage)
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 151,
      move: makeMove({}),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: "liechi-berry" },
    ]);
  });

  it("given a Pokemon with Gluttony holding Salac Berry at 99 HP (post-damage, below 50% of 200), when on-damage-taken triggers, then Salac activates early", () => {
    // Source: Bulbapedia -- Gluttony: changes pinch berry threshold from 25% to 50%
    // Derivation: 50% of 200 = 100; post-damage HP = 99 < 100
    // Note: on-damage-taken fires after BattleEngine subtracts damage from currentHp,
    // so currentHp is already post-damage here.
    const pokemon = makeActive({
      heldItem: "salac-berry",
      ability: "gluttony",
      hp: 200,
      currentHp: 99, // post-damage HP (was 200, took 101 damage)
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 101,
      move: makeMove({}),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "speed" },
      { type: "consume", target: "self", value: "salac-berry" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getPinchBerryThreshold helper
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- getPinchBerryThreshold", () => {
  it("given a Pokemon without Gluttony, when checking pinch threshold, then returns 0.25", () => {
    // Source: Bulbapedia -- default pinch berry threshold is 25%
    expect(getPinchBerryThreshold({ ability: "none" }, 0.25)).toBe(0.25);
  });

  it("given a Pokemon with Gluttony, when checking pinch threshold, then returns 0.5", () => {
    // Source: Bulbapedia -- Gluttony raises pinch berry threshold to 50%
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.25)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Unburden interaction
// ---------------------------------------------------------------------------

describe("Gen 6 Items -- Unburden volatile on consume", () => {
  it("given a Pokemon with Unburden holding Sitrus Berry, when Sitrus Berry is consumed on damage, then 'unburden' volatile is set", () => {
    // Source: Bulbapedia -- Unburden: doubles Speed when held item is consumed
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    // Note: Focus Sash was moved to capLethalDamage (#784), so we use Sitrus Berry instead
    // to validate that Unburden still triggers on item consumption in on-damage-taken.
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      ability: "unburden",
      hp: 200,
      currentHp: 80, // <= 50% of 200 HP, triggers Sitrus Berry
    });
    const ctx = makeItemContext({
      pokemon,
      damage: 50,
      move: makeMove({}),
    });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset.applyHeldItem wiring
// ---------------------------------------------------------------------------

describe("Gen 6 Ruleset -- applyHeldItem wiring", () => {
  it("given Gen6Ruleset, when calling applyHeldItem with Leftovers at end-of-turn, then delegates to Gen6 item handler", () => {
    // Verify the Gen6Ruleset.applyHeldItem override correctly delegates to applyGen6HeldItem
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = ruleset.applyHeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    // Source: Leftovers: floor(200/16) = 12
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 12 }]);
  });
});
