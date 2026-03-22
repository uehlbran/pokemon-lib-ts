import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";

/**
 * Gen 4 Bugfix Tests — Wave 8b (Moderate Complexity)
 *
 * Bugs fixed:
 *   #265 + #269: Type-boost items wrong multiplier (1.1x -> 4915/4096) AND wrong placement
 *               (attack stat -> base power)
 *   #266: Destiny Bond not cleared when user makes a different move
 *   #257: Fling and Natural Gift deal 0 damage due to customDamage override
 *   #262: Sticky Barb contact transfer not implemented
 *   #275: Fire Fang bypasses Wonder Guard in Gen 4 (Showdown-confirmed cartridge bug)
 *
 * Sources:
 *   - Showdown data/items.ts — Charcoal/Silk Scarf use chainModify([4915, 4096]) = ~1.2x
 *   - Showdown data/items.ts — Plates use chainModify([4915, 4096]) = ~1.2x (same as type-boost)
 *   - Showdown data/items.ts — type-boost items and Plates use onBasePower (not attack stat)
 *   - Showdown data/mods/gen4/abilities.ts — Wonder Guard firefang exception
 *   - Showdown Gen 4 mod — Destiny Bond volatile cleared in onBeforeMove
 *   - Showdown Gen 4 mod — Natural Gift / Fling use onModifyMove for power/type
 *   - Bulbapedia — Sticky Barb contact transfer mechanic
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_p: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "paralysis" | "sleep" | "freeze" | null;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
  nickname?: string | null;
  gender?: "male" | "female" | "genderless";
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
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
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: opts.gender ?? ("male" as const),
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
    ability: opts.ability ?? "",
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
  contact?: boolean;
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: opts.contact ?? false,
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
    effect: opts.effect ?? null,
    critRatio: 0,
    description: "",
    generation: 4,
  } as MoveData;
}

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

function _createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

function createMockState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
): DamageContext["state"] {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  };
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weatherType?: string | null,
): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: weatherType ?? null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    gravity: { active: false, turnsLeft: 0 },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createMoveEffectContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
  weatherType?: string | null,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, weatherType);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Bug #265 + #269: Type-boost items -- correct multiplier (4915/4096) and
// correct placement (base power, not attack stat)
// ---------------------------------------------------------------------------

describe("Bug #265 + #269: Type-boost items use 4915/4096 multiplier on base power", () => {
  it("given Charcoal holder using Fire move, when calculating damage, then base power is boosted by 4915/4096 (~1.2x)", () => {
    // Source: Showdown data/items.ts — Charcoal: chainModify([4915, 4096]) on onBasePower
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, neutral effectiveness
    //   Without item: levelFactor=22, base=floor(floor(22*80*100/100)/50)=35, +2=37; final=37
    //   With Charcoal: boosted power = floor(80*4915/4096) = floor(95.99...) = 95
    //     base=floor(floor(22*95*100/100)/50)=floor(2090/50)=41, +2=43; final=43
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
      heldItem: "charcoal",
    });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const fireMove = createMove({ type: "fire", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: fireMove, rng: createMockRng(100) }),
      chart,
    );

    // With STAB (fire type attacker, fire move): floor(43*1.5) = 64
    expect(result.damage).toBe(64);
  });

  it("given Silk Scarf holder using Normal move, when calculating damage, then base power is boosted by 4915/4096", () => {
    // Source: Showdown data/items.ts — Silk Scarf: chainModify([4915, 4096]) on onBasePower
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   Without item: levelFactor=22, base=floor(floor(22*80*100/100)/50)=35, +2=37
    //     STAB (normal attacker, normal move): floor(37*1.5)=55; final=55
    //   With Silk Scarf: boosted power = floor(80*4915/4096) = 95
    //     base=floor(floor(22*95*100/100)/50)=41, +2=43
    //     STAB: floor(43*1.5) = 64; final=64
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["normal"],
      heldItem: "silk-scarf",
    });
    const defender = createActivePokemon({ defense: 100, types: ["fire"] });
    const normalMove = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: normalMove, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(64);
  });

  it("given Flame Plate holder using Fire move, when calculating damage, then base power is boosted by 4915/4096 (same as type-boost items)", () => {
    // Source: Showdown data/items.ts — Flame Plate: chainModify([4915, 4096]) on onBasePower
    // Both Plates and type-boost items use the same 4915/4096 multiplier in Showdown
    // Derivation: same as Charcoal test above — L50, power=80, Atk=100, Def=100, rng=100
    //   boosted power = floor(80*4915/4096) = 95
    //   base=floor(floor(22*95*100/100)/50)=41, +2=43
    //   STAB: floor(43*1.5) = 64; final=64
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
      heldItem: "flame-plate",
    });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const fireMove = createMove({ type: "fire", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: fireMove, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(64);
  });

  it("given type-boost item with mismatched type, when calculating damage, then no boost is applied", () => {
    // Source: Showdown data/items.ts — type-boost items only activate on matching type
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   Charcoal (fire) with Water move: no boost
    //   base=floor(floor(22*80*100/100)/50)=35, +2=37; final=37
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["water"],
      heldItem: "charcoal",
    });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const waterMove = createMove({ type: "water", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: waterMove, rng: createMockRng(100) }),
      chart,
    );

    // STAB (water attacker, water move): floor(37*1.5)=55
    expect(result.damage).toBe(55);
  });

  it("given Klutz holder with type-boost item, when calculating damage, then no boost is applied", () => {
    // Source: Showdown data/abilities.ts — Klutz prevents all held item effects
    // Derivation: same as base — L50, power=80, Atk=100, Def=100, rng=100
    //   Klutz negates Charcoal: base=35, +2=37, STAB=floor(37*1.5)=55
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
      heldItem: "charcoal",
      ability: "klutz",
    });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const fireMove = createMove({ type: "fire", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: fireMove, rng: createMockRng(100) }),
      chart,
    );

    expect(result.damage).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// Bug #266: Destiny Bond not cleared when user makes a different move
// ---------------------------------------------------------------------------

describe("Bug #266: Destiny Bond cleared when user makes a different move", () => {
  it("given attacker has destiny-bond volatile and uses Tackle, when executing move effect, then destiny-bond is in volatilesToClear", () => {
    // Source: Showdown Gen 4 — destiny-bond volatile is cleared in onBeforeMove
    // when the user uses any move other than Destiny Bond
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("destiny-bond", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const tackle = createMove({ type: "normal", power: 40, id: "tackle" });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, tackle, 40, rng);

    const result = executeGen4MoveEffect(context);

    expect(result.volatilesToClear).toBeDefined();
    expect(result.volatilesToClear).toContainEqual({
      target: "attacker",
      volatile: "destiny-bond",
    });
  });

  it("given attacker has destiny-bond volatile and uses Destiny Bond again, when executing move effect, then destiny-bond is NOT cleared", () => {
    // Source: Showdown Gen 4 — using Destiny Bond again refreshes it (doesn't clear it)
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("destiny-bond", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const destinyBond = createMove({
      type: "ghost",
      power: 0,
      category: "status",
      id: "destiny-bond",
      effect: { type: "custom", tag: "destiny-bond" } as MoveData["effect"],
    });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, destinyBond, 0, rng);

    const result = executeGen4MoveEffect(context);

    // Should NOT contain destiny-bond in volatilesToClear
    const clearsDestinyBond = result.volatilesToClear?.some(
      (v) => v.volatile === "destiny-bond" && v.target === "attacker",
    );
    expect(clearsDestinyBond ?? false).toBe(false);
  });

  it("given attacker does NOT have destiny-bond volatile, when using Tackle, then no destiny-bond clearing entry", () => {
    // Regression: don't add clearing entries when the volatile isn't present
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const tackle = createMove({ type: "normal", power: 40, id: "tackle" });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, tackle, 40, rng);

    const result = executeGen4MoveEffect(context);

    const clearsDestinyBond = result.volatilesToClear?.some(
      (v) => v.volatile === "destiny-bond" && v.target === "attacker",
    );
    expect(clearsDestinyBond ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug #257: Fling and Natural Gift deal 0 damage
// ---------------------------------------------------------------------------

describe("Bug #257: Natural Gift does not set customDamage (damage goes through normal calc)", () => {
  it("given attacker holds Cheri Berry and uses Natural Gift, when executing move effect, then customDamage is null/undefined", () => {
    // Source: Showdown Gen 4 — Natural Gift uses onModifyMove to set base power/type,
    // NOT customDamage. The damage goes through the normal damage calculation.
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "cheri-berry",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const naturalGift = createMove({
      type: "normal",
      power: 1,
      category: "physical",
      id: "natural-gift",
    });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, naturalGift, 0, rng);

    const result = executeGen4MoveEffect(context);

    // customDamage must NOT be set — damage goes through normal calc
    // Field is either null or undefined (both mean "no custom damage")
    expect(result.customDamage == null).toBe(true);
    // Item should still be consumed
    expect(result.itemConsumed).toBe(true);
  });

  it("given attacker holds Cheri Berry and uses Natural Gift, when executing, then messages mention the berry's type and power", () => {
    // Source: Bulbapedia — Natural Gift (Gen 4): Cheri Berry = Fire type, 60 BP
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "cheri-berry",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const naturalGift = createMove({
      type: "normal",
      power: 1,
      category: "physical",
      id: "natural-gift",
    });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, naturalGift, 0, rng);

    const result = executeGen4MoveEffect(context);

    expect(result.messages.some((m) => m.includes("fire") || m.includes("Fire"))).toBe(true);
    expect(result.messages.some((m) => m.includes("60"))).toBe(true);
  });
});

describe("Bug #257: Fling does not set customDamage (damage goes through normal calc)", () => {
  it("given attacker holds Iron Ball and uses Fling, when executing move effect, then customDamage is null/undefined", () => {
    // Source: Showdown Gen 4 — Fling uses the item's Fling power as move base power
    // in the normal damage calc, NOT customDamage
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "iron-ball",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const fling = createMove({
      type: "dark",
      power: 0,
      category: "physical",
      id: "fling",
    });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, fling, 0, rng);

    const result = executeGen4MoveEffect(context);

    // customDamage must NOT be set — damage goes through normal calc
    // Field is either null or undefined (both mean "no custom damage")
    expect(result.customDamage == null).toBe(true);
    // Item should still be consumed
    expect(result.itemConsumed).toBe(true);
  });

  it("given attacker has no held item and uses Fling, when executing, then move fails", () => {
    // Source: Showdown Gen 4 — Fling fails if no held item
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({ types: ["normal"] });
    const fling = createMove({
      type: "dark",
      power: 0,
      category: "physical",
      id: "fling",
    });
    const rng = createMockRng(100);
    const context = createMoveEffectContext(attacker, defender, fling, 0, rng);

    const result = executeGen4MoveEffect(context);

    expect(result.messages).toContainEqual("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Bug #262: Sticky Barb contact transfer
// ---------------------------------------------------------------------------

describe("Bug #262: Sticky Barb contact transfer on hit", () => {
  it("given defender holds Sticky Barb and is hit by a contact move, when attacker has no item, then item transfer is signaled", () => {
    // Source: Bulbapedia — Sticky Barb: "If the holder is hit with a contact move,
    //   the Sticky Barb transfers to the attacker (unless the attacker already holds an item)"
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "sticky-barb" });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: true }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    // Should signal a transfer effect
    expect(result.messages.some((m) => m.includes("Sticky Barb"))).toBe(true);
  });

  it("given defender holds Sticky Barb and is hit by a non-contact move, when attacker has no item, then no transfer", () => {
    // Source: Bulbapedia — Sticky Barb only transfers on contact moves
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "sticky-barb" });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: false }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });

  it("given defender holds Sticky Barb and is hit by a contact move, when attacker already holds an item, then no transfer", () => {
    // Source: Bulbapedia — Sticky Barb does not transfer if attacker already holds an item
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
    });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "sticky-barb" });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: true }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug #518: Sticky Barb transfer skips Unburden volatile
// ---------------------------------------------------------------------------

describe("Bug #518: Sticky Barb transfer triggers Unburden volatile", () => {
  it("given holder has Sticky Barb and Unburden ability, when Sticky Barb transfers on contact, then holder gains Unburden volatile", () => {
    // Source: Showdown Gen 4 mod — Unburden activates on any item loss,
    //   including Sticky Barb transfer to attacker on contact
    // Source: Bulbapedia — Unburden: "doubles the Pokémon's Speed stat when
    //   its held item is lost"
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sticky-barb",
      ability: "unburden",
    });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: true }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
    // -1 is the permanent volatile sentinel: turnsLeft < 0 means "never expires" (never ticked down)
    // Source: BattleEngine.ts processScreenCountdown — "if (screen.turnsLeft < 0) return true; // permanent sentinel"
    // Unburden lasts for the rest of the battle (until the Pokemon holds an item again), so turnsLeft = -1
    expect(defender.volatileStatuses.get("unburden")?.turnsLeft).toBe(-1);
  });

  it("given holder has Sticky Barb but not Unburden ability, when Sticky Barb transfers on contact, then no Unburden volatile is set", () => {
    // Source: Showdown Gen 4 mod — Unburden only triggers for Pokemon with the Unburden ability
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sticky-barb",
      ability: "blaze",
    });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: true }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(defender.volatileStatuses.has("unburden")).toBe(false);
  });

  it("given holder has Sticky Barb, Unburden ability, and already has Unburden volatile, when Sticky Barb transfers, then Unburden volatile is not duplicated", () => {
    // Source: Showdown Gen 4 mod — Unburden volatile is only set if not already present;
    //   Map.set semantics naturally prevent duplication but the guard check prevents
    //   resetting an existing entry
    const attacker = createActivePokemon({ types: ["normal"], heldItem: null });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "sticky-barb",
      ability: "unburden",
    });
    // Pre-set Unburden volatile with a distinctive turnsLeft value so we can verify it is NOT overwritten
    defender.volatileStatuses.set("unburden", { turnsLeft: 99 });
    const state = createMinimalBattleState(attacker, defender);

    const ctx: ItemContext = {
      pokemon: defender,
      state,
      rng: createMockRng(100),
      move: createMove({ type: "normal", power: 80, contact: true }),
      damage: 50,
    };

    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
    // The existing volatile must NOT be overwritten — guard is
    // Asserting turnsLeft remained 99 (not reset to -1) proves the guard prevented an overwrite
    // Source: Gen4Items.ts Sticky Barb handler — volatile only set if !pokemon.volatileStatuses.has("unburden")
    expect(defender.volatileStatuses.get("unburden")?.turnsLeft).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Bug #275: Fire Fang bypasses Wonder Guard in Gen 4
// ---------------------------------------------------------------------------

describe("Bug #275: Fire Fang bypasses Wonder Guard in Gen 4", () => {
  it("given defender has Wonder Guard and Fire Fang is not super effective, when calculating damage, then Fire Fang still deals damage", () => {
    // Source: Showdown data/mods/gen4/abilities.ts — Wonder Guard has explicit
    //   firefang exception: move.id === 'firefang' returns (allows hit)
    // Source: Bulbapedia — In Gen 4, Fire Fang can bypass Wonder Guard due to a
    //   cartridge bug
    // Derivation: L50, power=65, Atk=100, Def=100, rng=100, fire vs bug/ghost
    //   Fire vs Bug = 2x, Fire vs Ghost = 1x => effectiveness = 2x (super effective)
    //   But even if it WEREN'T super effective, Fire Fang should still hit.
    //   Use a neutral type chart to demonstrate the bypass:
    //     base=floor(floor(22*65*100/100)/50)=28, +2=30; final=30
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      defense: 100,
      types: ["normal"],
      ability: "wonder-guard",
    });
    // Fire vs Normal = neutral (1x) in neutral chart — normally blocked by Wonder Guard
    const fireFang = createMove({
      type: "fire",
      power: 65,
      id: "fire-fang",
      contact: true,
    });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: fireFang, rng: createMockRng(100) }),
      chart,
    );

    // Fire Fang bypasses Wonder Guard — should deal damage even though not SE
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1); // neutral
  });

  it("given defender has Wonder Guard and a non-Fire-Fang neutral move is used, when calculating damage, then Wonder Guard blocks it", () => {
    // Source: Showdown Gen 4 — Wonder Guard blocks all non-SE moves except Fire Fang
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      defense: 100,
      types: ["normal"],
      ability: "wonder-guard",
    });
    const tackle = createMove({ type: "normal", power: 40, id: "tackle" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: tackle, rng: createMockRng(100) }),
      chart,
    );

    // Normal move blocked by Wonder Guard
    expect(result.damage).toBe(0);
  });
});
