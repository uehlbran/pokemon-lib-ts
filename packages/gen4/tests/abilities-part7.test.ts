import type { AbilityContext } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
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

/**
 * Gen 4 Ability Tests — Part 7: Steadfast, Trace, Flash Fire (volatile boost)
 *
 * Sources:
 *   - Showdown Gen 4 mod — ability trigger dispatch
 *   - Bulbapedia — Steadfast, Trace, Flash Fire mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers (consistent with abilities.test.ts)
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.bulbasaur);
const DEFAULT_MOVE = DATA_MANAGER.getMove(MOVES.tackle);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN4_NATURE_IDS.hardy).id;

const FIRE_MOVE = DATA_MANAGER.getMove(MOVES.firePunch);
const WATER_MOVE = DATA_MANAGER.getMove(MOVES.waterPulse);

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(4), {
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    isShiny: false,
    metLocation: "",
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
  });
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.moves = [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)];
  pokemon.ability = overrides.ability ?? ABILITIES.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return pokemon;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: PokemonInstance["status"];
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
  hasFlashFire?: boolean;
}) {
  const active = {
    pokemon: createSyntheticPokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
    }),
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
    volatileStatuses: new Map<string, { turnsLeft: number }>(),
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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
  };
  if (overrides.hasFlashFire) {
    active.volatileStatuses.set(VOLATILES.flashFire, { turnsLeft: -1 });
  }
  return active;
}

function createAbilityContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  move?: MoveData;
  hasFlashFire?: boolean;
}): AbilityContext {
  const state = {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
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
        gimmickUsed: false,
      },
      {
        index: 1,
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
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  };

  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    hasFlashFire: opts.hasFlashFire,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: TRIGGERS.onSwitchIn,
    move: opts.move,
    rng: state.rng,
  } as unknown as AbilityContext;
}

// ===========================================================================
// Steadfast (on-flinch)
// ===========================================================================

describe("applyGen4Ability on-flinch -- Steadfast", () => {
  // Source: Bulbapedia — Steadfast: "Raises the Pokemon's Speed by one stage each time it flinches."

  it("given a Pokemon with Steadfast at +0 Speed, when it flinches, then Speed stage effect is +1", () => {
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage when the holder flinches
    // Derivation: at +0 Speed, effect should produce stages: 1 (engine applies clamped to [−6, +6])
    const ctx = createAbilityContext({ ability: ABILITIES.steadfast });
    const result = applyGen4Ability(TRIGGERS.onFlinch, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Steadfast");
  });

  it("given a Pokemon with Steadfast at +2 Speed, when it flinches, then Speed stage effect is still +1", () => {
    // Source: Bulbapedia — Steadfast always raises Speed by exactly 1 stage per flinch
    // Derivation: the ability always returns stages: 1; clamping is done by the engine
    const ctx = createAbilityContext({ ability: ABILITIES.steadfast });
    // Simulate a Pokemon already at +2 Speed (ability returns +1 regardless)
    ctx.pokemon.statStages.speed = 2;
    const result = applyGen4Ability(TRIGGERS.onFlinch, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given a Pokemon WITHOUT Steadfast, when it flinches, then ability does not activate", () => {
    // Source: Bulbapedia — only Steadfast triggers on flinch
    const ctx = createAbilityContext({ ability: ABILITIES.intimidate });
    const result = applyGen4Ability(TRIGGERS.onFlinch, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ===========================================================================
// Trace (on-switch-in)
// ===========================================================================

describe("applyGen4Ability on-switch-in -- Trace", () => {
  // Source: Bulbapedia — Trace: "Copies the opponent's Ability when the Pokemon enters battle."
  // Source: Showdown Gen 4 mod — Trace copies foe's ability on switch-in

  it("given a Pokemon with Trace switching in against an opponent with Intimidate, then copies Intimidate", () => {
    // Source: Bulbapedia — Trace can copy any ability not on the uncopyable list
    const opponent = createOnFieldPokemon({ ability: ABILITIES.intimidate });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: ABILITIES.intimidate,
    });
    expect(result.messages[0]).toContain("traced");
    expect(result.messages[0]).toContain(ABILITIES.intimidate);
  });

  it("given a Pokemon with Trace switching in against an opponent with Levitate, then copies Levitate", () => {
    // Source: Bulbapedia — Trace can copy Levitate (it's not uncopyable)
    // Triangulation case: different ability than Intimidate above
    const opponent = createOnFieldPokemon({ ability: ABILITIES.levitate });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: ABILITIES.levitate,
    });
  });

  it("given a Pokemon with Trace switching in against a Pokemon with Trace, then does NOT copy Trace", () => {
    // Source: Bulbapedia — Trace cannot copy Trace
    // Source: Showdown Gen 4 mod — uncopyable list includes Trace
    const opponent = createOnFieldPokemon({ ability: ABILITIES.trace });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Trace switching in against Multitype, then does NOT copy Multitype", () => {
    // Source: Bulbapedia — Trace cannot copy Multitype
    // Source: Showdown Gen 4 mod — Multitype is uncopyable
    const opponent = createOnFieldPokemon({ ability: ABILITIES.multitype });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Trace switching in against Forecast, then does NOT copy Forecast", () => {
    // Source: Bulbapedia — Trace cannot copy Forecast
    const opponent = createOnFieldPokemon({ ability: ABILITIES.forecast });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Trace switching in against Flower Gift, then DOES copy Flower Gift in Gen 4", () => {
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
    //   Gen 4 Trace banned list is ['forecast', 'multitype', 'trace'] only.
    //   Flower Gift is copyable in Gen 4 (banned only in Gen 5+).
    const opponent = createOnFieldPokemon({ ability: ABILITIES.flowerGift });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "ability-change",
      newAbility: ABILITIES.flowerGift,
    });
  });

  it("given a Pokemon with Trace switching in against Wonder Guard, then DOES copy Wonder Guard in Gen 4", () => {
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
    //   Gen 4 Trace banned list is ['forecast', 'multitype', 'trace'] only.
    //   Wonder Guard is copyable in Gen 4; e.g., Gardevoir/Porygon2 Trace vs Shedinja was a known Gen 4 mechanic.
    const opponent = createOnFieldPokemon({ ability: ABILITIES.wonderGuard });
    const ctx = createAbilityContext({ ability: ABILITIES.trace, opponent });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "ability-change",
      newAbility: ABILITIES.wonderGuard,
    });
  });

  it("given a Pokemon with Trace switching in with no opponent, then does NOT activate", () => {
    // Edge case: no opponent present
    const ctx = createAbilityContext({ ability: ABILITIES.trace });
    const result = applyGen4Ability(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Flash Fire (passive-immunity with volatile boost)
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Flash Fire volatile boost", () => {
  // Source: Bulbapedia — Flash Fire: "raises the power of Fire-type moves by 50%
  //   while it is in effect"

  it("given a Pokemon with Flash Fire hit by a Fire move for the first time, then sets flash-fire volatile", () => {
    // Source: Bulbapedia — Flash Fire: "The Pokemon's Fire-type moves are powered up
    //   if it's hit by a Fire-type move."
    const ctx = createAbilityContext({
      ability: ABILITIES.flashFire,
      move: FIRE_MOVE,
    });
    const result = applyGen4Ability(TRIGGERS.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: VOLATILES.flashFire,
    });
    expect(result.messages[0]).toContain("Flash Fire was activated");
  });

  it("given a Pokemon with Flash Fire hit by a non-Fire move, then does NOT activate", () => {
    // Source: Bulbapedia — Flash Fire only triggers on Fire-type moves
    const ctx = createAbilityContext({
      ability: ABILITIES.flashFire,
      move: WATER_MOVE,
    });
    const result = applyGen4Ability(TRIGGERS.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Flash Fire already boosted hit by another Fire move, then blocks the move but does not add volatile again", () => {
    // Source: Bulbapedia — Flash Fire still blocks Fire moves even after activation
    const ctx = createAbilityContext({
      ability: ABILITIES.flashFire,
      move: FIRE_MOVE,
      hasFlashFire: true,
    });
    const result = applyGen4Ability(TRIGGERS.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
    expect(result.messages[0]).toContain("already boosted");
  });
});
