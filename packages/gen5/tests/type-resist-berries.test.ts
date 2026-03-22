import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, SeededRandom, TypeChart } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage, TYPE_RESIST_BERRIES } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

/**
 * Gen 5 Type Resist Berries -- damage calc integration tests.
 *
 * Type resist berries halve super-effective damage of the matching type, then are consumed.
 * In Gen 5+, the halving uses pokeRound(baseDamage, 2048) instead of floor(baseDamage * 0.5).
 * Chilan Berry (Normal) activates on any Normal-type hit (no SE requirement).
 *
 * Source: Showdown data/items.ts -- type resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries: "Weakens a supereffective [type]-type move"
 *
 * Fixes: #622 -- type resist berries fired on-damage-taken (post-damage) and damage-boost
 *   effect was ignored by the engine. Now applied in the damage calc (pre-damage).
 */

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
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
      speciesId: 1,
      nickname: null,
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
    generation: 5,
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
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

/** Create a fixed-roll RNG that returns max for rng.int (100 = no damage reduction) */
function makeFixedRng(): SeededRandom {
  return {
    next: () => 0.5,
    int: (_min: number, max: number) => max,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: makeFixedRng(),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN5_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Type Resist Berry -- basic activation
// ===========================================================================

describe("Gen 5 type resist berries -- damage calc integration", () => {
  it("given Grass-type defender with Occa Berry vs super-effective Fire move, when damage calculated, then damage is halved via pokeRound", () => {
    // Source: Showdown data/items.ts -- Occa Berry onSourceModifyDamage halves SE Fire damage
    // Derivation: L50, Fire 80BP, Atk=100, Def=100, rng=max (0 reduction)
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = 37
    //   random factor with int return 0 => floor(37 * (100-0)/100) = 37
    //   no STAB (attacker not Fire type), Fire vs Grass = 2x: 37*2 = 74
    //   Occa Berry: pokeRound(74, 2048) = floor((74*2048+2047)/4096) = floor(153599/4096) = 37
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(37);
    expect(result.effectiveness).toBe(2);
    // Berry should be consumed
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Grass-type defender WITHOUT Occa Berry vs super-effective Fire move, when damage calculated, then full 2x damage applies", () => {
    // Source: Showdown data/items.ts -- without resist berry, full SE damage
    // Derivation: same as above but no berry halving
    //   baseDmg = 37, Fire vs Grass = 2x: 37*2 = 74
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(74);
    expect(result.effectiveness).toBe(2);
  });

  it("given Grass-type defender with Occa Berry vs neutral Normal move, when damage calculated, then Occa Berry does NOT activate (wrong type)", () => {
    // Source: Showdown data/items.ts -- Occa Berry only activates for Fire-type moves
    // Attacker is Water-type to avoid STAB on Normal move
    const attacker = makeActive({ types: ["water"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const normalMove = makeMove({ type: "normal", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: normalMove }),
      typeChart,
    );

    // Berry NOT consumed (move type is Normal, not Fire)
    expect(defender.pokemon.heldItem).toBe("occa-berry");
    // Derivation: baseDmg = 37, no STAB (Water attacker, Normal move), Normal vs Grass = 1x: 37
    expect(result.damage).toBe(37);
  });

  it("given Normal-type defender with Occa Berry vs neutral Fire move, when damage calculated, then Occa Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- type resist berries only activate on SE damage
    // Fire vs Normal = 1x (neutral), so berry should not activate
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["normal"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    // Berry NOT consumed (fire is not SE against Normal)
    expect(defender.pokemon.heldItem).toBe("occa-berry");
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Chilan Berry -- special case (Normal type, no SE requirement)
// ===========================================================================

describe("Gen 5 Chilan Berry -- halves Normal-type damage without SE requirement", () => {
  it("given any-type defender with Chilan Berry vs Normal move, when damage calculated, then damage is halved", () => {
    // Source: Showdown data/items.ts -- Chilan Berry: onSourceModifyDamage (no SE check)
    // Source: Bulbapedia -- Chilan Berry: "halves Normal-type damage, consumed"
    // Attacker is Water-type to avoid STAB on Normal move
    // Derivation: L50, Normal 80BP, Atk=100, Def=100, no STAB, Normal vs Psychic = 1x
    //   baseDmg = 37, Chilan Berry: pokeRound(37, 2048) = floor((37*2048+2047)/4096) = floor(77823/4096) = 18
    const attacker = makeActive({ types: ["water"], attack: 100 });
    const defender = makeActive({
      types: ["psychic"],
      defense: 100,
      heldItem: "chilan-berry",
    });
    const normalMove = makeMove({ type: "normal", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: normalMove }),
      typeChart,
    );

    expect(result.damage).toBe(18);
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Psychic-type defender with Chilan Berry vs Fire move, when damage calculated, then Chilan Berry does NOT activate (wrong type)", () => {
    // Source: Showdown data/items.ts -- Chilan Berry only works for Normal-type moves
    // Attacker is Water-type to avoid STAB on Fire move
    const attacker = makeActive({ types: ["water"], attack: 100 });
    const defender = makeActive({
      types: ["psychic"],
      defense: 100,
      heldItem: "chilan-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe("chilan-berry");
    // Derivation: baseDmg = 37, no STAB (Water attacker, Fire move), Fire vs Psychic = 1x: 37
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Klutz and Embargo suppress resist berries
// ===========================================================================

describe("Gen 5 type resist berries -- suppression by Klutz and Embargo", () => {
  it("given defender with Klutz + Occa Berry vs SE Fire move, when damage calculated, then Klutz suppresses berry and full damage applies", () => {
    // Source: Showdown data/abilities.ts -- Klutz: prevents holder from using held item
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
      ability: "klutz",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(74);
    // Berry NOT consumed (Klutz suppresses)
    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given defender with Embargo + Yache Berry vs SE Ice move, when damage calculated, then Embargo suppresses berry and full damage applies", () => {
    // Source: Showdown data/moves.ts -- Embargo: suppresses item use
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const embargoVolatiles = new Map<string, { turnsLeft: number }>();
    embargoVolatiles.set("embargo", { turnsLeft: 3 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "yache-berry",
      volatiles: embargoVolatiles,
    });
    const iceMove = makeMove({ type: "ice", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: iceMove }),
      typeChart,
    );

    expect(result.damage).toBe(74);
    // Berry NOT consumed (Embargo suppresses)
    expect(defender.pokemon.heldItem).toBe("yache-berry");
  });
});

// ===========================================================================
// Unburden interaction
// ===========================================================================

describe("Gen 5 type resist berry + Unburden interaction", () => {
  it("given Unburden holder with Occa Berry vs SE Fire move, when damage calculated, then Unburden volatile is activated after berry consumption", () => {
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is consumed"
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
      ability: "unburden",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    calculateGen5Damage(makeDamageContext({ attacker, defender, move: fireMove }), typeChart);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ===========================================================================
// Breakdown tracking
// ===========================================================================

describe("Gen 5 type resist berry -- breakdown itemMultiplier", () => {
  it("given resist berry activates, when damage calculated, then breakdown itemMultiplier is 0.5", () => {
    // Source: internal consistency -- itemMultiplier should track berry contribution
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.breakdown?.itemMultiplier).toBe(0.5);
  });
});

// ===========================================================================
// Magic Room suppresses resist berries
// ===========================================================================

describe("Gen 5 type resist berries -- Magic Room suppression", () => {
  it("given Grass-type defender with Occa Berry vs SE Fire move under Magic Room, when damage calculated, then berry does NOT activate and full SE damage applies", () => {
    // Source: Showdown data/moves.ts -- Magic Room: "For 5 turns, held items have no effect"
    // Source: Bulbapedia -- Magic Room: "Nullifies the effect of each Pokémon's held item"
    // Without Magic Room the same setup gives 37 (halved). Under Magic Room: full 74.
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });
    const magicRoomState = {
      ...makeState(),
      magicRoom: { active: true, turnsLeft: 3 },
    } as unknown as BattleState;

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove, state: magicRoomState }),
      typeChart,
    );

    // Berry NOT consumed — Magic Room suppresses it
    expect(defender.pokemon.heldItem).toBe("occa-berry");
    // Full SE damage: 37 base * 2x Fire vs Grass = 74
    expect(result.damage).toBe(74);
  });

  it("given Grass-type defender with Yache Berry vs SE Ice move when Magic Room is inactive, when damage calculated, then berry activates normally", () => {
    // Source: Showdown data/moves.ts -- Magic Room only suppresses when active
    // With Magic Room inactive the berry should still halve damage.
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "yache-berry",
    });
    const iceMove = makeMove({ type: "ice", power: 80, category: "physical" });

    const result = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: iceMove }),
      typeChart,
    );

    // Berry consumed — Magic Room is not active
    expect(defender.pokemon.heldItem).toBeNull();
    // Halved SE damage: 37 base * 2x Ice vs Grass = 74 -> pokeRound(74, 2048) = 37
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Table completeness
// ===========================================================================

describe("Gen 5 TYPE_RESIST_BERRIES table", () => {
  it("given the table, then it has 17 entries (16 types + Chilan for Normal)", () => {
    // Source: Bulbapedia -- 17 type-resist berries exist in Gen 4-5 (Fairy not yet introduced)
    expect(Object.keys(TYPE_RESIST_BERRIES).length).toBe(17);
  });

  it("given the table, then Roseli Berry (Fairy) is NOT present in Gen 5", () => {
    // Source: Bulbapedia -- Roseli Berry introduced in Gen 6 alongside Fairy type
    expect(TYPE_RESIST_BERRIES["roseli-berry"]).toBeUndefined();
  });
});
