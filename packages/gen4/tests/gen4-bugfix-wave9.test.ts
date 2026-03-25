import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

/**
 * Gen 4 Bugfix Tests -- Wave 9 (Engine-Dependent Bugs)
 *
 * Bugs fixed:
 *   #259: Pressure ability not implemented (PP cost 2 for opposing moves)
 *   #254: Gastro Acid sets ability to empty string with no restoration on switch-out
 *   #271 + #274: Knock Off suppresses item; Trick/Switcheroo checks flag
 *   #255: Pain Split only damages attacker, never heals defender
 *   #256: Sucker Punch never fails against status moves
 *
 * Sources:
 *   - Showdown sim/battle.ts Gen 4 mod -- Pressure, Gastro Acid, Knock Off, Sucker Punch
 *   - Bulbapedia -- Pressure, Gastro Acid, Pain Split, Sucker Punch mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ABILITIES = GEN4_ABILITY_IDS;
const ITEMS = GEN4_ITEM_IDS;
const MOVES = GEN4_MOVE_IDS;
const SPECIES = GEN4_SPECIES_IDS;
const NATURES = GEN4_NATURE_IDS;

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  currentHp?: number;
  maxHp?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  suppressedAbility?: ActivePokemon["suppressedAbility"];
  itemKnockedOff?: boolean;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: SPECIES.bulbasaur,
    nickname: opts.nickname ?? null,
    level: 50,
    experience: 0,
    nature: NATURES.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    suppressedAbility: opts.suppressedAbility ?? null,
    itemKnockedOff: opts.itemKnockedOff ?? false,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: opts.movedThisTurn ?? false,
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

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    ...dataManager.getMove(id),
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  overrides?: Partial<BattleState>,
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
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    turnHistory: [],
    phase: "action-select" as const,
    winner: null,
    ended: false,
    ...overrides,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  rng: ReturnType<typeof createMockRng>,
  stateOverrides?: Partial<BattleState>,
  contextOverrides?: Partial<MoveEffectContext>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, stateOverrides);
  return {
    attacker,
    defender,
    move,
    damage: 0,
    state,
    rng,
    ...contextOverrides,
  } as MoveEffectContext;
}

// ===========================================================================
// Bug #259 -- Pressure ability
// ===========================================================================

describe("Bug #259 -- Pressure ability", () => {
  it("given defender has Pressure, when getPPCost is called, then returns 2", () => {
    // Source: Showdown sim/battle.ts Gen 4 -- ABILITY_PRESSURE deducts 2 PP
    // Source: Bulbapedia -- "When this Pokemon is the target of a foe's move,
    //   one additional PP is deducted."
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["psychic"], ability: "pressure" });
    const state = createMinimalBattleState(attacker, defender);

    const cost = ruleset.getPPCost(attacker, defender, state);

    expect(cost).toBe(2);
  });

  it("given defender does not have Pressure, when getPPCost is called, then returns 1", () => {
    // Source: Showdown sim/battle.ts Gen 4 -- default PP cost is 1
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], ability: "blaze" });
    const state = createMinimalBattleState(attacker, defender);

    const cost = ruleset.getPPCost(attacker, defender, state);

    expect(cost).toBe(1);
  });

  it("given defender is null (no target), when getPPCost is called, then returns 1", () => {
    // Source: Showdown -- no target means no Pressure effect
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = createActivePokemon({ types: ["normal"] });
    const state = createMinimalBattleState(attacker, createActivePokemon({ types: ["normal"] }));

    const cost = ruleset.getPPCost(attacker, null, state);

    expect(cost).toBe(1);
  });

  it("given Pressure Pokemon switches in, when on-switch-in ability triggers, then 'exerting its Pressure!' message is emitted", () => {
    // Source: Bulbapedia -- "When a Pokemon with Pressure enters battle,
    //   the message '<Pokemon> is exerting its Pressure!' is displayed."
    // Source: Showdown data/abilities.ts -- Pressure onStart
    const pokemon = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: ABILITIES.pressure,
      nickname: "Mewtwo",
    });
    const opponent = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createMinimalBattleState(pokemon, opponent);
    const rng = createMockRng(0);

    const result = applyGen4Ability("on-switch-in", {
      pokemon,
      opponent,
      state,
      rng,
      trigger: "on-switch-in",
    });

    expect(result.activated).toBe(true);
    expect(result.messages).toContain("Mewtwo is exerting its Pressure!");
  });
});

// ===========================================================================
// Bug #254 -- Gastro Acid suppressedAbility
// ===========================================================================

describe("Bug #254 -- Gastro Acid suppressedAbility", () => {
  it("given Gastro Acid is used, when it hits, then defender.suppressedAbility stores original ability", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid sets suppressedAbility
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.poison] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: ABILITIES.intimidate,
      nickname: "Gyarados",
    });
    const move = createMove(MOVES.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("");
    expect(defender.suppressedAbility).toBe(ABILITIES.intimidate);
  });

  it("given Gastro Acid suppressed ability, when Pokemon switches out, then ability is restored", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid suppression cleared on switch-out
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const pokemon = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: "",
      suppressedAbility: ABILITIES.intimidate,
    });
    // Simulate that Gastro Acid was used: ability="" and suppressedAbility=intimidate
    pokemon.suppressedAbility = ABILITIES.intimidate;
    pokemon.ability = "";
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: [CORE_TYPE_IDS.normal] }));

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.ability).toBe(ABILITIES.intimidate);
    expect(pokemon.suppressedAbility).toBeNull();
  });

  it("given Gastro Acid used on Multitype, when effect executes, then it fails", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid fails vs Multitype
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.poison] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: ABILITIES.multitype,
    });
    const move = createMove(MOVES.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(defender.ability).toBe(ABILITIES.multitype);
    expect(defender.suppressedAbility).toBeNull();
  });

  it("given defender's ability is already suppressed, when Gastro Acid is used again, then it fails and does not overwrite the saved ability", () => {
    // Source: Showdown Gen 4 mod -- Gastro Acid is idempotent; second use fails
    // When suppressedAbility is set, the defender's original ability is already stored.
    // A second Gastro Acid would overwrite suppressedAbility with "" (the suppressed value),
    // permanently losing the original ability. The idempotency guard prevents this.
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.poison] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: "",
      suppressedAbility: ABILITIES.intimidate,
    });
    const move = createMove(MOVES.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // Original ability must not be overwritten
    expect(defender.suppressedAbility).toBe(ABILITIES.intimidate);
    expect(defender.ability).toBe("");
  });
});

// ===========================================================================
// Bug #271 + #274 -- Knock Off itemKnockedOff flag + Trick/Switcheroo guard
// ===========================================================================

describe("Bug #271 + #274 -- Knock Off flag and Trick/Switcheroo guard", () => {
  it("given Knock Off is used on a defender with an item, when it hits, then itemKnockedOff is set to true", () => {
    // Source: Showdown Gen 4 -- Knock Off sets itemKnockedOff flag
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: CORE_ITEM_IDS.leftovers,
      nickname: "Blissey",
    });
    const move = createMove(MOVES.knockOff);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.itemKnockedOff).toBe(true);
    expect(result.messages).toContain(`Blissey lost its ${CORE_ITEM_IDS.leftovers}!`);
  });

  it("given defender had item knocked off, when Trick is used, then it fails", () => {
    // Source: Showdown Gen 4 -- itemKnockedOff flag prevents Trick/Switcheroo
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      heldItem: ITEMS.choiceScarf,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      itemKnockedOff: true,
    });
    const move = createMove(MOVES.trick);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // Item should NOT be swapped
    expect(attacker.pokemon.heldItem).toBe(ITEMS.choiceScarf);
  });

  it("given attacker had item knocked off, when Switcheroo is used, then it fails", () => {
    // Source: Showdown Gen 4 -- itemKnockedOff flag prevents Trick/Switcheroo
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      itemKnockedOff: true,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: CORE_ITEM_IDS.leftovers,
    });
    const move = createMove(MOVES.switcheroo);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(defender.pokemon.heldItem).toBe(CORE_ITEM_IDS.leftovers);
  });

  it("given no items knocked off, when Trick is used normally, then items are swapped", () => {
    // Source: Showdown Gen 4 -- Trick swaps items when no Knock Off flag
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      heldItem: ITEMS.choiceScarf,
      nickname: "Alakazam",
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: CORE_ITEM_IDS.leftovers,
      nickname: "Blissey",
    });
    const move = createMove(MOVES.trick);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(attacker.pokemon.heldItem).toBe(CORE_ITEM_IDS.leftovers);
    expect(defender.pokemon.heldItem).toBe(ITEMS.choiceScarf);
    expect(result.messages).not.toContain("But it failed!");
  });
});

// ===========================================================================
// Bug #255 -- Pain Split correctly heals/damages both sides
// ===========================================================================

describe("Bug #255 -- Pain Split heals both sides", () => {
  it("given attacker at 50 HP and defender at 150 HP, when Pain Split used, then result signals attacker heal and defender damage", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // Source: Bulbapedia -- "each have their HP set to the average of the two"
    // Average = floor((50 + 150) / 2) = 100
    // Attacker gains 50 (100 - 50), defender loses 50 (150 - 100)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.ghost],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 150,
    });
    const move = createMove(MOVES.painSplit);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Attacker heals via healAmount (engine applies this)
    expect(result.healAmount).toBe(50);
    // Defender loses HP via customDamage (engine applies this)
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 50,
      source: MOVES.painSplit,
    });
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given attacker at 180 HP and defender at 20 HP, when Pain Split used, then attacker takes recoil and defender is healed", () => {
    // Average = floor((180 + 20) / 2) = 100
    // Attacker loses 80 (180 - 100), defender gains 80 (100 - 20)
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.ghost],
      maxHp: 200,
      currentHp: 180,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 20,
    });
    const move = createMove(MOVES.painSplit);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Attacker loses HP via recoilDamage (engine applies this)
    expect(result.recoilDamage).toBe(80);
    // Defender gains HP -- direct mutation (no defenderHealAmount field in MoveEffectResult)
    expect(defender.pokemon.currentHp).toBe(100);
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given average exceeds defender maxHp, when Pain Split used, then defender HP capped at maxHp", () => {
    // Average = floor((300 + 50) / 2) = 175, but defender's maxHp is 150
    // Attacker new HP = min(175, 400) = 175, loses 125 (300 - 175)
    // Defender new HP = min(175, 150) = 150, gains 100 (150 - 50)
    // Source: Showdown Gen 4 -- Pain Split caps at maxHp
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.ghost],
      maxHp: 400,
      currentHp: 300,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 150,
      currentHp: 50,
    });
    const move = createMove(MOVES.painSplit);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Attacker loses 125 HP via recoilDamage (engine applies this)
    expect(result.recoilDamage).toBe(125);
    // Defender heals to maxHp (direct mutation -- capped at maxHp 150)
    expect(defender.pokemon.currentHp).toBe(150);
    expect(result.messages).toContain("The battlers shared their pain!");
  });
});

// ===========================================================================
// Bug #256 -- Sucker Punch fails against status moves
// ===========================================================================

describe("Bug #256 -- Sucker Punch vs status moves", () => {
  it("given defender selected a physical move, when Sucker Punch used, then it succeeds", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 -- Sucker Punch succeeds if
    //   target selected a damaging move
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createMove(MOVES.suckerPunch);
    const rng = createMockRng(0);
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: MOVES.earthquake, category: "physical" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender selected a special move, when Sucker Punch used, then it succeeds", () => {
    // Source: Showdown Gen 4 -- Sucker Punch succeeds against special moves too
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const move = createMove(MOVES.suckerPunch);
    const rng = createMockRng(0);
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: MOVES.flamethrower, category: "special" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender selected a status move, when Sucker Punch used, then it fails", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 -- Sucker Punch fails if
    //   target selected a status move
    // Source: Bulbapedia -- "Sucker Punch will fail if the target does not select
    //   a move that deals damage"
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createMove(MOVES.suckerPunch);
    const rng = createMockRng(0);
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: MOVES.toxic, category: "status" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });

  it("given defender is not using a move (switching), when Sucker Punch used, then it fails", () => {
    // Source: Showdown Gen 4 -- Sucker Punch fails if target is not attacking
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createMove(MOVES.suckerPunch);
    const rng = createMockRng(0);
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: null,
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });

  it("given defender already moved this turn, when Sucker Punch used, then it fails", () => {
    // Source: Showdown Gen 4 -- Sucker Punch fails if target already moved
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.dark] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      movedThisTurn: true,
    });
    const move = createMove(MOVES.suckerPunch);
    const rng = createMockRng(0);
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: MOVES.tackle, category: "physical" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });
});
