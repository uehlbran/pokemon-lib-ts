import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  ItemContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen7NewAbility } from "../src/Gen7AbilitiesNew";
import { handleGen7StatAbility } from "../src/Gen7AbilitiesStat";
import { applyGen7HeldItem } from "../src/Gen7Items";
import {
  canRayquazaMegaEvolve,
  Gen7MegaEvolution,
  MEGA_RAYQUAZA_DATA,
} from "../src/Gen7MegaEvolution";
import { Gen7Ruleset } from "../src/Gen7Ruleset";

/**
 * Phase 2 bugfix tests for Gen 7 issues:
 *   - #701: Rayquaza Mega Evolution via Dragon Ascent
 *   - #687: Disguise blocks non-lethal hits (via capLethalDamage)
 *   - #688: Beast Boost / Moxie / Battle Bond on-after-move-used
 *   - #683: Stat-pinch berries at end of turn
 */

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  uid?: string;
  speciesId?: number;
  heldItem?: string | null;
  types?: PokemonType[];
  ability?: string;
  isMega?: boolean;
  currentHp?: number;
  maxHp?: number;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  nickname?: string | null;
  calculatedStats?: {
    hp?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    speed?: number;
  };
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? overrides.calculatedStats?.hp ?? 200;
  const cs = overrides.calculatedStats ?? {};
  return {
    pokemon: {
      uid: overrides.uid ?? "test-uid",
      speciesId: overrides.speciesId ?? 6,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? maxHp,
      moves: overrides.moves ?? [],
      ability: overrides.ability ?? "blaze",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: cs.hp ?? maxHp,
        attack: cs.attack ?? 100,
        defense: cs.defense ?? 100,
        spAttack: cs.spAttack ?? 100,
        spDefense: cs.spDefense ?? 100,
        speed: cs.speed ?? 100,
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
    types: overrides.types ?? ["fire", "flying"],
    ability: overrides.ability ?? "blaze",
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function makeSide(overrides: { gimmickUsed?: boolean; index?: 0 | 1 } = {}): BattleSide {
  return {
    index: overrides.index ?? 0,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: overrides.gimmickUsed ?? false,
  } as BattleSide;
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
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeMoveData(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.displayName ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 40,
    accuracy: overrides.accuracy ?? 100,
    pp: overrides.pp ?? 35,
    priority: overrides.priority ?? 0,
    flags: overrides.flags ?? [],
    ...overrides,
  } as MoveData;
}

function makeAbilityContext(overrides: {
  trigger: string;
  ability: string;
  speciesId?: number;
  currentHp?: number;
  maxHp?: number;
  opponentHp?: number;
  types?: PokemonType[];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  move?: MoveData;
  calculatedStats?: {
    hp?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    speed?: number;
  };
}): AbilityContext {
  const pokemon = makeActivePokemon({
    ability: overrides.ability,
    speciesId: overrides.speciesId,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    types: overrides.types,
    volatiles: overrides.volatiles,
    calculatedStats: overrides.calculatedStats,
  });
  const opponent =
    overrides.opponentHp !== undefined
      ? makeActivePokemon({ currentHp: overrides.opponentHp })
      : undefined;
  return {
    trigger: overrides.trigger,
    pokemon,
    opponent,
    state: makeState(),
    rng: { next: () => 0.5, nextInt: (min: number, max: number) => min } as unknown as SeededRandom,
    move: overrides.move ?? undefined,
  } as AbilityContext;
}

function makeItemContext(overrides: {
  item: string;
  ability?: string;
  currentHp: number;
  maxHp: number;
  types?: PokemonType[];
}): ItemContext {
  const pokemon = makeActivePokemon({
    heldItem: overrides.item,
    ability: overrides.ability ?? "none",
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    calculatedStats: { hp: overrides.maxHp },
    types: overrides.types ?? ["normal"],
  });
  return {
    pokemon,
    state: makeState(),
    rng: { next: () => 0.5, nextInt: (min: number, max: number) => min } as unknown as SeededRandom,
  } as ItemContext;
}

// ===========================================================================
// #701 — Rayquaza Mega Evolution (Dragon Ascent check)
// ===========================================================================

describe("#701 — Rayquaza Mega Evolution via Dragon Ascent", () => {
  it("given Rayquaza (species 384) knowing dragon-ascent, when checking canRayquazaMegaEvolve, then returns true", () => {
    // Source: Bulbapedia "Mega Evolution" — Rayquaza can Mega Evolve if it knows Dragon Ascent
    const pokemon = makeActivePokemon({
      speciesId: 384,
      ability: "air-lock",
      types: ["dragon", "flying"],
      moves: [{ moveId: "dragon-ascent", currentPP: 5, maxPP: 5 }],
    });
    expect(canRayquazaMegaEvolve(pokemon)).toBe(true);
  });

  it("given Rayquaza WITHOUT dragon-ascent, when checking canRayquazaMegaEvolve, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts — Rayquaza needs Dragon Ascent to Mega Evolve
    const pokemon = makeActivePokemon({
      speciesId: 384,
      ability: "air-lock",
      types: ["dragon", "flying"],
      moves: [{ moveId: "outrage", currentPP: 10, maxPP: 10 }],
    });
    expect(canRayquazaMegaEvolve(pokemon)).toBe(false);
  });

  it("given Rayquaza with dragon-ascent BUT holding a Z-Crystal, when checking canRayquazaMegaEvolve, then returns false", () => {
    // Source: Bulbapedia — "Rayquaza cannot Mega Evolve if it is holding a Z-Crystal"
    const pokemon = makeActivePokemon({
      speciesId: 384,
      ability: "air-lock",
      types: ["dragon", "flying"],
      heldItem: "dragonium-z",
      moves: [{ moveId: "dragon-ascent", currentPP: 5, maxPP: 5 }],
    });
    expect(canRayquazaMegaEvolve(pokemon)).toBe(false);
  });

  it("given non-Rayquaza Pokemon with dragon-ascent, when checking canRayquazaMegaEvolve, then returns false", () => {
    // Only Rayquaza (species 384) can use the Dragon Ascent mega path
    const pokemon = makeActivePokemon({
      speciesId: 6,
      ability: "blaze",
      moves: [{ moveId: "dragon-ascent", currentPP: 5, maxPP: 5 }],
    });
    expect(canRayquazaMegaEvolve(pokemon)).toBe(false);
  });

  it("given Gen7MegaEvolution.canUse with Rayquaza + dragon-ascent, when called, then returns true without Mega Stone", () => {
    // Source: Showdown sim/battle-actions.ts — Rayquaza mega via Dragon Ascent, no stone
    const mega = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      speciesId: 384,
      ability: "air-lock",
      types: ["dragon", "flying"],
      moves: [{ moveId: "dragon-ascent", currentPP: 5, maxPP: 5 }],
      // No Mega Stone held
    });
    const side = makeSide();
    const state = makeState();
    expect(mega.canUse(pokemon, side, state)).toBe(true);
  });

  it("given Gen7MegaEvolution.activate with Rayquaza + dragon-ascent, when called, then transforms to Mega Rayquaza", () => {
    // Source: Bulbapedia "Mega Rayquaza" — types Dragon/Flying, ability Delta Stream,
    //   base stats: 105/180/100/180/100/115
    const mega = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      speciesId: 384,
      ability: "air-lock",
      types: ["dragon", "flying"],
      moves: [{ moveId: "dragon-ascent", currentPP: 5, maxPP: 5 }],
    });
    const side = makeSide();
    const state = makeState();

    const events = mega.activate(pokemon, side, state);

    // Should emit a mega-evolve event
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("mega-evolve");
    expect((events[0] as any).form).toBe("mega-rayquaza");

    // Types should be updated
    expect(pokemon.types).toEqual(["dragon", "flying"]);
    // Ability should be Delta Stream
    expect(pokemon.ability).toBe("delta-stream");
    // Should be marked as mega
    expect(pokemon.isMega).toBe(true);
  });

  it("given MEGA_RAYQUAZA_DATA, when checking base stats, then matches Bulbapedia values", () => {
    // Source: Bulbapedia "Mega Rayquaza" — HP 105, Atk 180, Def 100, SpA 180, SpD 100, Spe 115
    expect(MEGA_RAYQUAZA_DATA.baseStats.hp).toBe(105);
    expect(MEGA_RAYQUAZA_DATA.baseStats.attack).toBe(180);
    expect(MEGA_RAYQUAZA_DATA.baseStats.defense).toBe(100);
    expect(MEGA_RAYQUAZA_DATA.baseStats.spAttack).toBe(180);
    expect(MEGA_RAYQUAZA_DATA.baseStats.spDefense).toBe(100);
    expect(MEGA_RAYQUAZA_DATA.baseStats.speed).toBe(115);
    expect(MEGA_RAYQUAZA_DATA.ability).toBe("delta-stream");
    expect(MEGA_RAYQUAZA_DATA.baseSpeciesId).toBe(384);
  });
});

// ===========================================================================
// #687 — Disguise blocks non-lethal hits (Gen 7: no chip damage)
// ===========================================================================

describe("#687 — Disguise blocks non-lethal hits via capLethalDamage (Gen 7)", () => {
  const ruleset = new Gen7Ruleset();

  it("given Mimikyu with intact Disguise hit by a 10 HP physical move, when capLethalDamage fires, then damage is reduced to 0", () => {
    // Source: Showdown data/abilities.ts — disguise: onDamage priority 1, blocks all hits
    // Source: Bulbapedia "Disguise" — absorbs the first damaging hit
    const defender = makeActivePokemon({
      ability: "disguise",
      currentHp: 200,
      maxHp: 200,
    });
    const attacker = makeActivePokemon({});
    const move = makeMoveData({ category: "physical", power: 10 });
    const state = makeState();

    const result = ruleset.capLethalDamage(10, defender, attacker, move, state);

    expect(result.damage).toBe(0);
    expect(result.survived).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("Disguise was busted");
    // Disguise should now be broken
    expect(defender.volatileStatuses.has("disguise-broken")).toBe(true);
  });

  it("given Mimikyu with intact Disguise hit by a 100 HP special move, when capLethalDamage fires, then damage is reduced to 0", () => {
    // Source: Showdown data/abilities.ts — disguise blocks special moves too
    const defender = makeActivePokemon({
      ability: "disguise",
      currentHp: 200,
      maxHp: 200,
    });
    const attacker = makeActivePokemon({});
    const move = makeMoveData({ category: "special", power: 100 });
    const state = makeState();

    const result = ruleset.capLethalDamage(100, defender, attacker, move, state);

    expect(result.damage).toBe(0);
    expect(result.survived).toBe(true);
  });

  it("given Mimikyu with BUSTED Disguise, when capLethalDamage fires with 50 damage, then full damage passes through", () => {
    // Source: Showdown data/abilities.ts — once broken, Disguise doesn't activate again
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("disguise-broken", { turnsLeft: -1 });
    const defender = makeActivePokemon({
      ability: "disguise",
      currentHp: 200,
      maxHp: 200,
      volatiles,
    });
    const attacker = makeActivePokemon({});
    const move = makeMoveData({ category: "physical", power: 50 });
    const state = makeState();

    const result = ruleset.capLethalDamage(50, defender, attacker, move, state);

    expect(result.damage).toBe(50);
    expect(result.survived).toBe(false);
  });

  it("given Mimikyu with intact Disguise hit by a status move, when capLethalDamage fires, then Disguise does NOT activate", () => {
    // Source: Showdown data/abilities.ts — disguise only blocks damaging moves
    const defender = makeActivePokemon({
      ability: "disguise",
      currentHp: 200,
      maxHp: 200,
    });
    const attacker = makeActivePokemon({});
    const move = makeMoveData({ category: "status", power: 0 });
    const state = makeState();

    const result = ruleset.capLethalDamage(0, defender, attacker, move, state);

    expect(result.damage).toBe(0);
    // Disguise should NOT be broken by status moves
    expect(defender.volatileStatuses.has("disguise-broken")).toBe(false);
  });

  it("given Mimikyu with intact Disguise (Gen 7), when Disguise busts, then NO chip damage is applied", () => {
    // Source: Bulbapedia "Disguise" — Gen 7: no chip damage when Disguise breaks
    //   (1/8 chip damage was added in Gen 8)
    const defender = makeActivePokemon({
      ability: "disguise",
      currentHp: 200,
      maxHp: 200,
    });
    const attacker = makeActivePokemon({});
    const move = makeMoveData({ category: "physical", power: 80 });
    const state = makeState();

    const result = ruleset.capLethalDamage(80, defender, attacker, move, state);

    // Gen 7: damage should be exactly 0 (no chip)
    expect(result.damage).toBe(0);
  });
});

// ===========================================================================
// #688 — Beast Boost / Moxie / Battle Bond on-after-move-used
// ===========================================================================

describe("#688 — Beast Boost raises highest stat after KO", () => {
  it("given Pokemon with beast-boost and highest stat = attack, when opponent faints, then +1 Attack boost effect returned", () => {
    // Source: Showdown data/abilities.ts — beastboost: onSourceAfterFaint, raises highest stat
    // Source: Bulbapedia "Beast Boost" — "raises the user's highest stat by one stage"
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "beast-boost",
      calculatedStats: {
        hp: 200,
        attack: 150,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        speed: 130,
      },
      opponentHp: 0, // fainted
    });

    const result = handleGen7StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0].effectType).toBe("stat-change");
    expect((result.effects[0] as any).stat).toBe("attack");
    expect((result.effects[0] as any).stages).toBe(1);
  });

  it("given Pokemon with beast-boost and highest stat = spAttack, when opponent faints, then +1 Sp. Atk boost effect returned", () => {
    // Source: Showdown data/abilities.ts — beastboost checks all 5 battle stats
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "beast-boost",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 180,
        spDefense: 100,
        speed: 130,
      },
      opponentHp: 0,
    });

    const result = handleGen7StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("stat-change");
    expect((result.effects[0] as any).stat).toBe("spAttack");
  });

  it("given Pokemon with beast-boost, when opponent is still alive, then no activation", () => {
    // Must KO to trigger
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "beast-boost",
      calculatedStats: {
        hp: 200,
        attack: 150,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        speed: 130,
      },
      opponentHp: 50, // still alive
    });

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("#688 — Moxie raises Attack after KO", () => {
  it("given Pokemon with moxie, when opponent faints from a move, then +1 Attack boost returned", () => {
    // Source: Showdown data/abilities.ts — moxie: onSourceAfterFaint, raises Attack by 1
    // Source: Bulbapedia "Moxie" — "Raises Attack by one stage when it knocks out another Pokemon"
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "moxie",
      opponentHp: 0,
    });

    const result = handleGen7StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0].effectType).toBe("stat-change");
    expect((result.effects[0] as any).stat).toBe("attack");
    expect((result.effects[0] as any).stages).toBe(1);
  });

  it("given Pokemon with moxie, when opponent survives, then no activation", () => {
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "moxie",
      opponentHp: 1,
    });

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("#688 — Battle Bond transforms Greninja after KO", () => {
  it("given Greninja with battle-bond, when opponent faints from a move, then transform volatile is returned", () => {
    // Source: Showdown data/abilities.ts — battlebond: onSourceAfterFaint, transforms to Ash form
    // Source: Bulbapedia "Battle Bond" — transforms Greninja after KO
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "battle-bond",
      speciesId: 658, // Greninja
      opponentHp: 0,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0].effectType).toBe("volatile-inflict");
    expect((result.effects[0] as any).volatile).toBe("battle-bond-transformed");
  });

  it("given Greninja already transformed via battle-bond, when another KO occurs, then no activation", () => {
    // Battle Bond only transforms once per battle
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("battle-bond-transformed", { turnsLeft: -1 });
    const ctx = makeAbilityContext({
      trigger: "on-after-move-used",
      ability: "battle-bond",
      speciesId: 658,
      opponentHp: 0,
      volatiles,
    });

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// #683 — Stat-pinch berries trigger at end of turn
// ===========================================================================

describe("#683 — Stat-pinch berries trigger via stat-boost-between-turns", () => {
  it("given Pokemon holding Liechi Berry with HP at 25%, when stat-boost-between-turns fires, then Attack boost + consume", () => {
    // Source: Showdown data/items.ts — liechiberry: onEat raises Attack by 1
    // Source: Bulbapedia "Liechi Berry" — "Raises Attack by one stage when HP drops to 1/4 or less"
    // 200 max HP, 25% = 50 HP, threshold = floor(200 * 0.25) = 50
    const ctx = makeItemContext({
      item: "liechi-berry",
      currentHp: 50,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.type === "stat-boost" && e.value === "attack")).toBe(
      true,
    );
    expect(result.effects.some((e: any) => e.type === "consume")).toBe(true);
  });

  it("given Pokemon holding Ganlon Berry with HP at 20%, when stat-boost-between-turns fires, then Defense boost + consume", () => {
    // Source: Showdown data/items.ts — ganlonberry: onEat raises Defense by 1
    // 200 max HP, 20% = 40 HP, threshold = floor(200 * 0.25) = 50
    const ctx = makeItemContext({
      item: "ganlon-berry",
      currentHp: 40,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.type === "stat-boost" && e.value === "defense")).toBe(
      true,
    );
  });

  it("given Pokemon holding Salac Berry with HP at 25%, when stat-boost-between-turns fires, then Speed boost + consume", () => {
    // Source: Showdown data/items.ts — salacberry: onEat raises Speed by 1
    const ctx = makeItemContext({
      item: "salac-berry",
      currentHp: 50,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.type === "stat-boost" && e.value === "speed")).toBe(
      true,
    );
  });

  it("given Pokemon holding Petaya Berry with HP at 10%, when stat-boost-between-turns fires, then Sp. Atk boost + consume", () => {
    // Source: Showdown data/items.ts — petayaberry: onEat raises Sp. Atk by 1
    const ctx = makeItemContext({
      item: "petaya-berry",
      currentHp: 20,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.type === "stat-boost" && e.value === "spAttack")).toBe(
      true,
    );
  });

  it("given Pokemon holding Apicot Berry with HP at 25%, when stat-boost-between-turns fires, then Sp. Def boost + consume", () => {
    // Source: Showdown data/items.ts — apicotberry: onEat raises Sp. Def by 1
    const ctx = makeItemContext({
      item: "apicot-berry",
      currentHp: 50,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(
      result.effects.some((e: any) => e.type === "stat-boost" && e.value === "spDefense"),
    ).toBe(true);
  });

  it("given Pokemon holding Liechi Berry with HP above 25%, when stat-boost-between-turns fires, then no activation", () => {
    // HP at 60% — above the 25% threshold
    const ctx = makeItemContext({
      item: "liechi-berry",
      currentHp: 120,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Pokemon with Gluttony holding Liechi Berry at 50% HP, when stat-boost-between-turns fires, then activates (Gluttony raises threshold)", () => {
    // Source: Bulbapedia "Gluttony" — raises pinch berry threshold from 25% to 50%
    // 200 max HP, Gluttony threshold = 50% = floor(200 * 0.5) = 100
    const ctx = makeItemContext({
      item: "liechi-berry",
      ability: "gluttony",
      currentHp: 100,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.type === "stat-boost" && e.value === "attack")).toBe(
      true,
    );
  });

  it("given Pokemon holding Leftovers at 25% HP, when stat-boost-between-turns fires, then no activation (not a stat-pinch berry)", () => {
    // Leftovers is an end-of-turn heal item, not a stat-pinch berry
    const ctx = makeItemContext({
      item: "leftovers",
      currentHp: 50,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(false);
  });

  it("given fainted Pokemon holding Liechi Berry, when stat-boost-between-turns fires, then no activation", () => {
    // Dead Pokemon can't eat berries
    const ctx = makeItemContext({
      item: "liechi-berry",
      currentHp: 0,
      maxHp: 200,
    });

    const result = applyGen7HeldItem("stat-boost-between-turns", ctx);

    expect(result.activated).toBe(false);
  });
});
