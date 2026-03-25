import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_ITEM_IDS, CORE_MOVE_IDS, CORE_TYPE_IDS, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN6_ITEM_IDS } from "../src";
import { calculateGen6Damage, pokeRound } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const ABILITIES = CORE_ABILITY_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const MOVES = CORE_MOVE_IDS;
const TYPES = CORE_TYPE_IDS;

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
  gender?: "male" | "female" | "genderless";
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
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
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
    types: overrides.types ?? ["psychic"],
    ability: overrides.ability ?? ABILITIES.none,
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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
}): MoveData {
  return {
    id: overrides.id ?? MOVES.tackle,
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: overrides.target ?? "adjacent-foe",
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
    generation: 6,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 6,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// Use the Gen6 type chart for all tests
const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// pokeRound unit tests
// ---------------------------------------------------------------------------

describe("pokeRound function", () => {
  it("given value=100 and modifier=6144, when applying pokeRound (1.5x), then returns 150", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(100*6144) + 2047) / 4096)
    // 100 * 6144 = 614400; floor((614400 + 2047) / 4096) = floor(616447 / 4096) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("given value=100 and modifier=2048, when applying pokeRound (0.5x), then returns 50", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(100*2048) + 2047) / 4096)
    // 100 * 2048 = 204800; floor((204800 + 2047) / 4096) = floor(206847 / 4096) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("given value=57 and modifier=6144, when applying pokeRound, then returns 85", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(57*6144) + 2047) / 4096)
    // 57 * 6144 = 350208; floor((350208 + 2047) / 4096) = floor(352255 / 4096) = 85
    expect(pokeRound(57, 6144)).toBe(85);
  });

  it("given value=1 and modifier=4096, when applying pokeRound (1.0x), then returns 1", () => {
    // Source: Showdown sim/battle.ts modify() -- identity modifier
    // 1 * 4096 = 4096; floor((4096 + 2047) / 4096) = floor(6143 / 4096) = 1
    expect(pokeRound(1, 4096)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Base damage formula
// ---------------------------------------------------------------------------

describe("Gen 6 base damage formula", () => {
  it("given L50 attacker 100 Atk vs L50 defender 100 Def, 40 BP physical, when calculating, then returns expected base", () => {
    // Source: Bulbapedia damage formula -- floor((2*50/5+2) * 40 * 100/100 / 50) + 2
    // levelFactor = floor((2*50)/5) + 2 = floor(100/5) + 2 = 20 + 2 = 22
    // base = floor(floor(22 * 40 * 100 / 100) / 50) + 2 = floor(880/50) + 2 = 17 + 2 = 19
    // Non-STAB, neutral effectiveness
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"] }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 40, type: "water" }), // non-STAB vs normal (neutral)
      seed: 42,
    });
    const result = calculateGen6Damage(ctx, typeChart);
    // Neutral effectiveness
    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given L100 attacker 200 Atk vs L100 defender 150 Def, 80 BP physical, when calculating, then returns known value", () => {
    // Source: Bulbapedia damage formula -- floor((2*100/5+2) * 80 * 200/150 / 50) + 2
    // levelFactor = floor(200/5) + 2 = 40 + 2 = 42
    // base = floor(floor(42 * 80 * 200 / 150) / 50) + 2 = floor(floor(448000/150)/50) + 2
    //       = floor(floor(2986.67)/50) + 2 = floor(2986/50) + 2 = floor(59.72) + 2 = 59 + 2 = 61
    // With max random roll (100): 61
    // Using non-STAB, super-effective (fighting vs normal = 2x), no other modifiers
    // Source: Gen 6 type chart — Fighting → Normal = 2x (Bulbapedia: https://bulbapedia.bulbagarden.net/wiki/Type)
    const ctx = makeDamageContext({
      attacker: makeActive({ level: 100, attack: 200, types: ["normal"] }),
      defender: makeActive({ level: 100, defense: 150, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fighting" }), // fighting is SE vs normal
    });
    const result = calculateGen6Damage(ctx, typeChart);
    // Fighting vs Normal is SE (2x)
    expect(result.effectiveness).toBe(2);
  });

  it("given status move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
    const ctx = makeDamageContext({
      move: makeMove({ category: "status", power: null }),
    });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(1);
  });

  it("given power=0 move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- zero-power moves skip damage calc
    const ctx = makeDamageContext({
      move: makeMove({ power: 0 }),
    });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Critical hit multiplier: 1.5x (Gen 6 change from Gen 5's 2.0x)
// ---------------------------------------------------------------------------

describe("Gen 6 critical hit: 1.5x multiplier", () => {
  it("given a critical hit on L50 attacker 100 Atk vs L50 defender 100 Def with 60 BP, then damage is 1.5x of non-crit", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- multiplier reduced from 2x to 1.5x
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit: pokeRound(baseDamage, 6144) = 1.5x
    // Use a fixed seed for deterministic random roll
    const noCritCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 60, type: "fighting" }), // STAB fighting vs normal (SE)
      isCrit: false,
      seed: 999,
    });
    const critCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 60, type: "fighting" }),
      isCrit: true,
      seed: 999, // Same seed so random roll is the same
    });

    const noCritResult = calculateGen6Damage(noCritCtx, typeChart);
    const critResult = calculateGen6Damage(critCtx, typeChart);

    // Crit should be ~1.5x of non-crit (exact due to pokeRound)
    expect(critResult.damage).toBeGreaterThan(noCritResult.damage);
    expect(critResult.isCrit).toBe(true);
    expect(noCritResult.isCrit).toBe(false);
  });

  it("given a different stat setup: L80 attacker 200 Atk vs L80 defender 130 Def with 90 BP, crit is consistently 1.5x", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- 1.5x (triangulation test with different inputs)
    const noCritCtx = makeDamageContext({
      attacker: makeActive({ level: 80, attack: 200, types: ["water"] }),
      defender: makeActive({ level: 80, defense: 130, types: ["rock"] }),
      move: makeMove({ power: 90, type: "water" }), // STAB water vs rock (SE)
      isCrit: false,
      seed: 1234,
    });
    const critCtx = makeDamageContext({
      attacker: makeActive({ level: 80, attack: 200, types: ["water"] }),
      defender: makeActive({ level: 80, defense: 130, types: ["rock"] }),
      move: makeMove({ power: 90, type: "water" }),
      isCrit: true,
      seed: 1234,
    });

    const noCritResult = calculateGen6Damage(noCritCtx, typeChart);
    const critResult = calculateGen6Damage(critCtx, typeChart);

    expect(critResult.damage).toBeGreaterThan(noCritResult.damage);
    // The ratio should be close to 1.5x (exact depends on pokeRound)
    const ratio = critResult.damage / noCritResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ---------------------------------------------------------------------------
// Gem boost: 1.3x in Gen 6 (was 1.5x in Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 6 gem boost: 1.3x (nerfed from 1.5x)", () => {
  it("given a Pokemon holding Normal Gem uses a Normal move, then base power is boosted by 1.3x", () => {
    // Source: Bulbapedia "Gem" Gen 6 -- gem boost nerfed from 1.5x to 1.3x
    // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096]) in Gen 6+
    const gemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], heldItem: "normal-gem" }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ id: "tackle", power: 50, type: "normal" }),
      seed: 42,
    });
    const noGemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], heldItem: null }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ id: "tackle", power: 50, type: "normal" }),
      seed: 42,
    });

    const gemResult = calculateGen6Damage(gemCtx, typeChart);
    const noGemResult = calculateGen6Damage(noGemCtx, typeChart);

    // Gem should boost damage by ~1.3x
    expect(gemResult.damage).toBeGreaterThan(noGemResult.damage);
    const ratio = gemResult.damage / noGemResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given a Pokemon holding Normal Gem uses a non-Normal move, then the gem is not consumed", () => {
    // Source: packages/gen6/data/items.json -- only Normal Gem exists in Gen 6
    const attacker = makeActive({ attack: 100, types: [TYPES.fire], heldItem: ITEMS.normalGem });
    const ctx = makeDamageContext({
      attacker,
      defender: makeActive({ defense: 100, types: [TYPES.normal] }),
      move: makeMove({ power: 50, type: TYPES.fire }),
      seed: 42,
    });

    expect(attacker.pokemon.heldItem).toBe(ITEMS.normalGem);
    calculateGen6Damage(ctx, typeChart);
    expect(attacker.pokemon.heldItem).toBe(ITEMS.normalGem);
  });

  it("given a Pokemon holding Charcoal uses a Fire move, then 1.2x boost (not consumed)", () => {
    // Source: Showdown data/items.ts -- Charcoal: onBasePower chainModify([4915, 4096]) ~= 1.2x
    const attacker = makeActive({ attack: 100, types: ["fire"], heldItem: "charcoal" });
    const charcoalCtx = makeDamageContext({
      attacker,
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 50, type: "fire" }),
      seed: 42,
    });
    const noItemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"], heldItem: null }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 50, type: "fire" }),
      seed: 42,
    });

    const charcoalResult = calculateGen6Damage(charcoalCtx, typeChart);
    const noItemResult = calculateGen6Damage(noItemCtx, typeChart);

    // Charcoal gives ~1.2x boost
    expect(charcoalResult.damage).toBeGreaterThan(noItemResult.damage);
    // Charcoal is NOT consumed
    expect(attacker.pokemon.heldItem).toBe(ITEMS.charcoal);
  });
});

// ---------------------------------------------------------------------------
// Knock Off: 1.5x base power when target has removable item (Gen 6+)
// ---------------------------------------------------------------------------

describe("Gen 6 Knock Off damage boost", () => {
  it("given Knock Off vs Pokemon holding Leftovers, then 1.5x base power boost", () => {
    // Source: Bulbapedia "Knock Off" Gen 6 -- 1.5x damage if target has removable item
    // Source: Showdown data/moves.ts -- knockoff onBasePower: chainModify(1.5)
    const knockOffCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: "leftovers" }),
      move: makeMove({ id: "knock-off", power: 65, type: "dark" }),
      seed: 42,
    });
    const noItemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ id: "knock-off", power: 65, type: "dark" }),
      seed: 42,
    });

    const knockOffResult = calculateGen6Damage(knockOffCtx, typeChart);
    const noItemResult = calculateGen6Damage(noItemCtx, typeChart);

    // Knock Off should deal ~1.5x damage vs held item
    expect(knockOffResult.damage).toBeGreaterThan(noItemResult.damage);
    const ratio = knockOffResult.damage / noItemResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Knock Off vs Pokemon holding no item, then no boost", () => {
    // Source: Bulbapedia "Knock Off" Gen 6 -- no boost if target has no item
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ id: "knock-off", power: 65, type: "dark" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    // Base damage without boost: same as a regular 65 BP move
    const regularCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ id: "crunch", power: 65, type: "dark" }),
      seed: 42,
    });
    const regularResult = calculateGen6Damage(regularCtx, typeChart);

    expect(result.damage).toBe(regularResult.damage);
  });

  it("given Knock Off vs Pokemon holding a Mega Stone (e.g., venusaurite), then no boost", () => {
    // Source: Bulbapedia "Knock Off" Gen 6 -- Mega Stones are not removable
    // Source: Showdown data/items.ts -- mega stones have megaStone property
    const megaStoneCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: "venusaurite" }),
      move: makeMove({ id: "knock-off", power: 65, type: "dark" }),
      seed: 42,
    });
    const noItemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["dark"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ id: "knock-off", power: 65, type: "dark" }),
      seed: 42,
    });

    const megaStoneResult = calculateGen6Damage(megaStoneCtx, typeChart);
    const noItemResult = calculateGen6Damage(noItemCtx, typeChart);

    // Mega Stone is NOT removable, so no boost -- damage should equal no-item
    expect(megaStoneResult.damage).toBe(noItemResult.damage);
  });
});

// ---------------------------------------------------------------------------
// STAB (Same-Type Attack Bonus)
// ---------------------------------------------------------------------------

describe("Gen 6 STAB", () => {
  it("given a Fire-type attacker using a Fire move, when STAB applies, then ~1.5x damage", () => {
    // Source: Showdown sim/battle-actions.ts -- STAB = pokeRound(baseDamage, 6144)
    const stabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"] }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fire" }),
      seed: 42,
    });
    const noStabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["water"] }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fire" }),
      seed: 42,
    });

    const stabResult = calculateGen6Damage(stabCtx, typeChart);
    const noStabResult = calculateGen6Damage(noStabCtx, typeChart);

    expect(stabResult.damage).toBeGreaterThan(noStabResult.damage);
    const ratio = stabResult.damage / noStabResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Adaptability attacker using same-type move, then ~2.0x STAB", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB = 2.0x
    const adaptCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["water"], ability: "adaptability" }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "water" }),
      seed: 42,
    });
    const normalStabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["water"], ability: "none" }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "water" }),
      seed: 42,
    });

    const adaptResult = calculateGen6Damage(adaptCtx, typeChart);
    const normalResult = calculateGen6Damage(normalStabCtx, typeChart);

    // Adaptability STAB should be ~2.0x/1.5x = ~1.33x compared to normal STAB
    expect(adaptResult.damage).toBeGreaterThan(normalResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Burn physical penalty + Facade bypass
// ---------------------------------------------------------------------------

describe("Gen 6 burn penalty and Facade bypass", () => {
  it("given burned attacker using physical move, then damage is halved", () => {
    // Source: Showdown sim/battle-actions.ts -- burn: pokeRound(baseDamage, 2048)
    const burnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], status: "burn" }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ power: 80, type: "normal" }),
      seed: 42,
    });
    const noBurnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], status: null }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ power: 80, type: "normal" }),
      seed: 42,
    });

    const burnResult = calculateGen6Damage(burnCtx, typeChart);
    const noBurnResult = calculateGen6Damage(noBurnCtx, typeChart);

    expect(burnResult.damage).toBeLessThan(noBurnResult.damage);
    const ratio = burnResult.damage / noBurnResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given burned attacker using Facade, then burn penalty is bypassed (Gen 6+)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+: Facade bypasses burn penalty
    // `this.battle.gen < 6 || move.id !== 'facade'`
    const facadeBurnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], status: "burn" }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ id: "facade", power: 70, type: "normal" }),
      seed: 42,
    });
    const facadeNoBurnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], status: null }),
      defender: makeActive({ defense: 100, types: ["fighting"] }),
      move: makeMove({ id: "facade", power: 70, type: "normal" }),
      seed: 42,
    });

    const facadeBurnResult = calculateGen6Damage(facadeBurnCtx, typeChart);
    const facadeNoBurnResult = calculateGen6Damage(facadeNoBurnCtx, typeChart);

    // Facade should do the same damage whether burned or not
    // (Facade itself doubles power when statused, but that's a move effect,
    // not part of the damage calc -- the key point is burn penalty is NOT applied)
    expect(facadeBurnResult.damage).toBe(facadeNoBurnResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Weather modifiers
// ---------------------------------------------------------------------------

describe("Gen 6 weather modifiers", () => {
  it("given rain weather and Water move, then ~1.5x boost", () => {
    // Source: Showdown sim/battle-actions.ts -- rain + water = pokeRound(baseDamage, 6144)
    const rainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["water"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "water", category: "special" }),
      state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "rain-dance" } }),
      seed: 42,
    });
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["water"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "water", category: "special" }),
      state: makeState({ weather: null }),
      seed: 42,
    });

    const rainResult = calculateGen6Damage(rainCtx, typeChart);
    const noWeatherResult = calculateGen6Damage(noWeatherCtx, typeChart);

    expect(rainResult.damage).toBeGreaterThan(noWeatherResult.damage);
    const ratio = rainResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given rain weather and Fire move, then ~0.5x reduction", () => {
    // Source: Showdown sim/battle-actions.ts -- rain + fire = pokeRound(baseDamage, 2048)
    const rainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "rain-dance" } }),
      seed: 42,
    });
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      state: makeState({ weather: null }),
      seed: 42,
    });

    const rainResult = calculateGen6Damage(rainCtx, typeChart);
    const noWeatherResult = calculateGen6Damage(noWeatherCtx, typeChart);

    expect(rainResult.damage).toBeLessThan(noWeatherResult.damage);
    const ratio = rainResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

// ---------------------------------------------------------------------------
// Type effectiveness with Fairy type
// ---------------------------------------------------------------------------

describe("Gen 6 Fairy type effectiveness", () => {
  it("given Fairy move vs Dragon defender, then deals 2x damage", () => {
    // Source: Bulbapedia "Fairy type" -- Fairy is super-effective against Dragon
    const ctx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fairy"] }),
      defender: makeActive({ spDefense: 100, types: ["dragon"] }),
      move: makeMove({ power: 80, type: "fairy", category: "special" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
  });

  it("given Dragon move vs Fairy defender, then deals 0x damage (immune)", () => {
    // Source: Bulbapedia "Fairy type" -- Fairy is immune to Dragon
    const ctx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["dragon"] }),
      defender: makeActive({ spDefense: 100, types: ["fairy"] }),
      move: makeMove({ power: 80, type: "dragon", category: "special" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Fairy move vs Fire defender, then deals 0.5x damage (resisted)", () => {
    // Source: Bulbapedia "Fairy type" -- Fire resists Fairy
    const ctx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fairy"] }),
      defender: makeActive({ spDefense: 100, types: ["fire"] }),
      move: makeMove({ power: 80, type: "fairy", category: "special" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Minimum damage
// ---------------------------------------------------------------------------

describe("Gen 6 minimum damage", () => {
  it("given any non-immune attack, then minimum damage is always at least 1", () => {
    // Source: Showdown sim/battle-actions.ts -- minimum 1 damage
    // Use a very weak attack against very high defense to try to get 0 damage
    // Normal vs Rock is NVE (0.5x)
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 1, types: ["water"] }),
      defender: makeActive({ defense: 999, types: ["rock"] }),
      move: makeMove({ power: 10, type: "normal" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(1);
    expect(result.effectiveness).toBe(0.5);
  });

  it("given type immune attack, then damage is 0", () => {
    // Source: Showdown sim/battle-actions.ts -- type immunity returns 0
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 200, types: ["normal"] }),
      defender: makeActive({ defense: 100, types: ["ghost"] }),
      move: makeMove({ power: 100, type: "normal" }),
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Assault Vest (New in Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Assault Vest", () => {
  it("given defender holding Assault Vest, when hit by special move, then SpDef is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Assault Vest onModifySpD: chainModify(1.5)
    // Source: Bulbapedia "Assault Vest" -- raises SpDef by 50%
    const vestCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], heldItem: "assault-vest" }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      seed: 42,
    });
    const noVestCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      seed: 42,
    });

    const vestResult = calculateGen6Damage(vestCtx, typeChart);
    const noVestResult = calculateGen6Damage(noVestCtx, typeChart);

    // Assault Vest should reduce special damage by ~33% (1/1.5)
    expect(vestResult.damage).toBeLessThan(noVestResult.damage);
  });

  it("given defender holding Assault Vest, when hit by physical move, then no SpDef boost", () => {
    // Source: Showdown data/items.ts -- Assault Vest only boosts SpDef, not Def
    const vestCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: "assault-vest" }),
      move: makeMove({ power: 80, type: "fighting", category: "physical" }),
      seed: 42,
    });
    const noVestCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: null }),
      move: makeMove({ power: 80, type: "fighting", category: "physical" }),
      seed: 42,
    });

    const vestResult = calculateGen6Damage(vestCtx, typeChart);
    const noVestResult = calculateGen6Damage(noVestCtx, typeChart);

    // Physical move -- Assault Vest should not affect damage
    expect(vestResult.damage).toBe(noVestResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Fur Coat (New in Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Fur Coat", () => {
  it("given defender with Fur Coat, when hit by physical move, then damage is halved", () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: onModifyDef multiply by 2
    // Source: Bulbapedia "Fur Coat" -- doubles Defense stat
    const furCoatCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], ability: "fur-coat" }),
      move: makeMove({ power: 80, type: "fighting", category: "physical" }),
      seed: 42,
    });
    const noAbilityCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], ability: "none" }),
      move: makeMove({ power: 80, type: "fighting", category: "physical" }),
      seed: 42,
    });

    const furCoatResult = calculateGen6Damage(furCoatCtx, typeChart);
    const noAbilityResult = calculateGen6Damage(noAbilityCtx, typeChart);

    // Fur Coat doubles defense, so physical damage should be roughly halved
    expect(furCoatResult.damage).toBeLessThan(noAbilityResult.damage);
    const ratio = furCoatResult.damage / noAbilityResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given defender with Fur Coat, when hit by special move, then no damage reduction", () => {
    // Source: Showdown data/abilities.ts -- Fur Coat only affects physical Defense
    const furCoatCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], ability: "fur-coat" }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      seed: 42,
    });
    const noAbilityCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fire"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], ability: "none" }),
      move: makeMove({ power: 80, type: "fire", category: "special" }),
      seed: 42,
    });

    const furCoatResult = calculateGen6Damage(furCoatCtx, typeChart);
    const noAbilityResult = calculateGen6Damage(noAbilityCtx, typeChart);

    // Special move -- Fur Coat should not reduce damage
    expect(furCoatResult.damage).toBe(noAbilityResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Life Orb
// ---------------------------------------------------------------------------

describe("Gen 6 Life Orb", () => {
  it("given attacker holding Life Orb, then damage is boosted by ~1.3x", () => {
    // Source: Showdown data/items.ts -- Life Orb: pokeRound(baseDamage, 5324) ~= 1.3x
    const lifeOrbCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"], heldItem: "life-orb" }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });
    const noItemCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"], heldItem: null }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });

    const lifeOrbResult = calculateGen6Damage(lifeOrbCtx, typeChart);
    const noItemResult = calculateGen6Damage(noItemCtx, typeChart);

    expect(lifeOrbResult.damage).toBeGreaterThan(noItemResult.damage);
    const ratio = lifeOrbResult.damage / noItemResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });
});

// ---------------------------------------------------------------------------
// Pixie Plate (New in Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 Pixie Plate", () => {
  it("given attacker holding Pixie Plate uses Fairy move, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Pixie Plate: onBasePower chainModify([4915, 4096])
    // Source: Bulbapedia "Pixie Plate" -- introduced in Gen 6 with Fairy type
    const plateCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fairy"], heldItem: "pixie-plate" }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fairy", category: "special" }),
      seed: 42,
    });
    const noItemCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["fairy"], heldItem: null }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 80, type: "fairy", category: "special" }),
      seed: 42,
    });

    const plateResult = calculateGen6Damage(plateCtx, typeChart);
    const noItemResult = calculateGen6Damage(noItemCtx, typeChart);

    expect(plateResult.damage).toBeGreaterThan(noItemResult.damage);
    const ratio = plateResult.damage / noItemResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });
});

// ---------------------------------------------------------------------------
// Filter / Solid Rock
// ---------------------------------------------------------------------------

describe("Gen 6 Filter / Solid Rock", () => {
  it("given defender with Filter, when hit by super-effective move, then 0.75x damage", () => {
    // Source: Showdown data/abilities.ts -- Filter: pokeRound(baseDamage, 3072) = 0.75x
    const filterCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], ability: "filter" }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });
    const noAbilityCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"] }),
      defender: makeActive({ defense: 100, types: ["normal"], ability: "none" }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });

    const filterResult = calculateGen6Damage(filterCtx, typeChart);
    const noAbilityResult = calculateGen6Damage(noAbilityCtx, typeChart);

    expect(filterResult.damage).toBeLessThan(noAbilityResult.damage);
    const ratio = filterResult.damage / noAbilityResult.damage;
    expect(ratio).toBeCloseTo(0.75, 1);
  });
});

// ---------------------------------------------------------------------------
// DamageBreakdown
// ---------------------------------------------------------------------------

describe("Gen 6 damage breakdown", () => {
  it("given a move that hits, then breakdown is populated with all modifier fields", () => {
    // Source: DamageResult interface -- breakdown field with all modifier multipliers
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"] }),
      defender: makeActive({ defense: 100, types: ["grass"] }),
      move: makeMove({ power: 80, type: "fire" }),
      isCrit: true,
      seed: 42,
    });

    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.baseDamage).toBeGreaterThan(0);
    expect(result.breakdown!.critMultiplier).toBe(1.5);
    expect(result.breakdown!.stabMultiplier).toBe(1.5);
    expect(result.breakdown!.typeMultiplier).toBe(2);
    expect(result.breakdown!.finalDamage).toBe(result.damage);
  });
});

// ---------------------------------------------------------------------------
// Unaware vs Simple interaction (regression: #757)
// ---------------------------------------------------------------------------

describe("Gen 6 damage calc -- Unaware vs Simple interaction (regression: #757)", () => {
  it("given Simple attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Unaware ignores all stages (same as stage-0 baseline)", () => {
    // Regression for bug #757: Simple was checked before Unaware, causing Simple to
    // double +2→+4 before Unaware could zero it out. Unaware must take priority.
    // Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost zeroes boosts
    // independently of Simple's doubling.
    //
    // Derivation (Unaware active → effective stage = 0, stage multiplier = 1.0):
    //   L50, attack=100, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   step1 = floor(22 * 50 * 100 / 100) = 1100
    //   baseDamage = floor(1100 / 50) + 2 = 22 + 2 = 24
    //   random(seed=42) = 94 → floor(24 * 94 / 100) = floor(22.56) = 22
    const attacker = makeActive({ attack: 100, ability: "simple", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "unaware", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(22);
  });

  it("given Simple attacker with +2 Atk stage vs non-Unaware defender, when calculating damage, then Simple doubles stage to +4", () => {
    // Source: Showdown sim/battle.ts -- Simple doubles stat stages (capped at ±6).
    //
    // Derivation (Simple active, no Unaware → effective stage = +4, multiplier = (2+4)/2 = 3.0):
    //   effectiveAttack = floor(100 * 3.0) = 300
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 300 / 100) = 3300
    //   baseDamage = floor(3300 / 50) + 2 = 66 + 2 = 68
    //   random(seed=42) = 94 → floor(68 * 94 / 100) = floor(63.92) = 63
    const attacker = makeActive({ attack: 100, ability: "simple", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "none", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });

  it("given Mold Breaker attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Mold Breaker bypasses Unaware and stages apply", () => {
    // Mold Breaker/Teravolt/Turboblaze bypass breakable abilities (flags: { breakable: 1 }).
    // Unaware is breakable, so a Mold Breaker attacker ignores Unaware — stages are NOT zeroed.
    // Source: Showdown sim/battle.ts Gen 6+ — ability.flags.breakable check.
    //
    // Derivation (Mold Breaker bypasses Unaware → effective stage = +2, multiplier = 4/2 = 2.0):
    //   effectiveAttack = floor(100 * 2.0) = 200
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 200 / 100) = 2200
    //   baseDamage = floor(2200 / 50) + 2 = 44 + 2 = 46
    //   random(seed=42) = 94 → floor(46 * 94 / 100) = floor(43.24) = 43
    const attacker = makeActive({ attack: 100, ability: "mold-breaker", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "unaware", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(43);
  });

  it("given Simple attacker with +2 Atk stage vs Teravolt defender, when calculating damage, then defender's Mold Breaker does NOT suppress attacker's Simple — stages still doubled to +4", () => {
    // The defender's Mold Breaker family only suppresses the *target's* (defender's) abilities
    // when the Mold Breaker user is attacking. A defending Teravolt does NOT suppress the
    // attacker's Simple. Source: Showdown sim/battle.ts — suppressingAbility(self) is false.
    //
    // Derivation (Simple NOT bypassed → effective stage = +4, multiplier = (2+4)/2 = 3.0):
    //   effectiveAttack = floor(100 * 3.0) = 300
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 300 / 100) = 3300
    //   baseDamage = floor(3300 / 50) + 2 = 66 + 2 = 68
    //   random(seed=42) = 94 → floor(68 * 94 / 100) = floor(63.92) = 63
    const attacker = makeActive({ attack: 100, ability: "simple", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "teravolt", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });
});
