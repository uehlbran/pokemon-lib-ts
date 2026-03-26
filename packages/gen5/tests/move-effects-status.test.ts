/**
 * Tests for Gen 5 status/utility move effect handlers.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: Bulbapedia -- individual move pages
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  executeGen5MoveEffect,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  ENTRAINMENT_SOURCE_BLOCKED,
  ENTRAINMENT_TARGET_BLOCKED,
  handleGen5StatusMove,
  isBerry,
} from "../src/Gen5MoveEffectsStatus";

const TYPES = CORE_TYPE_IDS;
const CORE_ABILITIES = CORE_ABILITY_IDS;
const CORE_ITEMS = CORE_ITEM_IDS;
const ABILITIES = GEN5_ABILITY_IDS;
const ITEMS = GEN5_ITEM_IDS;
const MOVES = GEN5_MOVE_IDS;
const NATURES = GEN5_NATURE_IDS;
const SPECIES = GEN5_SPECIES_IDS;
const gen5Data = createGen5DataManager();

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createSyntheticOnFieldPokemon(overrides: {
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
  movedThisTurn?: boolean;
  lastMoveUsed?: string | null;
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
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? CORE_ABILITIES.none,
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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

function createCanonicalMove(
  moveId: string = MOVES.tackle,
  overrides: {
    priority?: number;
  } = {},
): MoveData {
  const move = gen5Data.getMove(moveId);
  return {
    ...move,
    ...overrides,
    priority: overrides.priority ?? move.priority,
  } as MoveData;
}

function createSyntheticMove(
  reason: string,
  overrides: {
    id?: string;
    baseMoveId?: string;
  },
): MoveData {
  // Intentional synthetic move for dispatch fallthrough scenarios with no owning Gen 5 move id.
  void reason;
  const base = createCanonicalMove(overrides.baseMoveId ?? MOVES.tackle);
  return {
    ...base,
    id: overrides.id ?? base.id,
    displayName: overrides.id ?? base.displayName,
  } as MoveData;
}

function createBattleState(overrides?: { sides?: any[] }): BattleState {
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
    sides: overrides?.sides ?? [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
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
        active: [null],
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
    turnHistory: [],
  } as unknown as BattleState;
}

function createMoveEffectContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? createCanonicalMove(),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(42),
  };
}

function baseMoveResult(overrides: Record<string, unknown>) {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    ...overrides,
  };
}

// ===========================================================================
// isBerry helper
// ===========================================================================

describe("isBerry", () => {
  it("given a sitrus-berry, when checked, then returns true", () => {
    // Source: Showdown data/items.ts -- sitrus-berry has isBerry: true
    expect(isBerry(ITEMS.sitrusBerry)).toBe(true);
  });

  it("given a lum-berry, when checked, then returns true", () => {
    // Source: Showdown data/items.ts -- lum-berry has isBerry: true
    expect(isBerry(ITEMS.lumBerry)).toBe(true);
  });

  it("given a leftovers (not a berry), when checked, then returns false", () => {
    // Source: Showdown data/items.ts -- leftovers is not a berry
    expect(isBerry(CORE_ITEMS.leftovers)).toBe(false);
  });

  it("given a life-orb (not a berry), when checked, then returns false", () => {
    // Source: Showdown data/items.ts -- life-orb is not a berry
    expect(isBerry(ITEMS.lifeOrb)).toBe(false);
  });

  it("given null, when checked, then returns false", () => {
    // Guard clause: falsy itemId always returns false (no valid item to check)
    // Source: isBerry implementation -- `if (!itemId) return false`
    expect(isBerry(null)).toBe(false);
  });

  it("given undefined, when checked, then returns false", () => {
    // Guard clause: falsy itemId always returns false (no valid item to check)
    // Source: isBerry implementation -- `if (!itemId) return false`
    expect(isBerry(undefined)).toBe(false);
  });

  it("given empty string, when checked, then returns false", () => {
    // Guard clause: empty string is falsy, so returns false (no valid item to check)
    // Source: isBerry implementation -- `if (!itemId) return false`
    expect(isBerry("")).toBe(false);
  });
});

// ===========================================================================
// Heal Pulse
// ===========================================================================

describe("Heal Pulse", () => {
  it("given a target with 200 max HP, when Heal Pulse is used, then heals 100 HP (ceil of 50%)", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(target.baseMaxhp * 0.5)
    // 200 * 0.5 = 100, ceil(100) = 100
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ hp: 200, currentHp: 50 }),
      move: createCanonicalMove(MOVES.healPulse),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.defenderHealAmount).toBe(100);
  });

  it("given a target with 201 max HP, when Heal Pulse is used, then heals 101 HP (ceil rounds up)", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(target.baseMaxhp * 0.5)
    // 201 * 0.5 = 100.5, ceil(100.5) = 101
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ hp: 201, currentHp: 50 }),
      move: createCanonicalMove(MOVES.healPulse),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.defenderHealAmount).toBe(101);
  });

  it("given a target with 1 max HP (Shedinja), when Heal Pulse is used, then heals 1 HP", () => {
    // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(1 * 0.5) = 1
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ hp: 1, currentHp: 1 }),
      move: createCanonicalMove(MOVES.healPulse),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.defenderHealAmount).toBe(1);
  });
});

// ===========================================================================
// Aromatherapy
// ===========================================================================

describe("Aromatherapy", () => {
  it("given Aromatherapy is used, when executed, then cures status for the attacker's team", () => {
    // Source: Showdown gen5/moves.ts aromatherapy -- cures ALL allies, no Soundproof check
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.aromatherapy),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toMatchObject({
      teamStatusCure: { side: "attacker" },
      messages: ["A soothing aroma wafted through the area!"],
    });
  });

  it("given Aromatherapy result, when checking, then does NOT reset stat stages", () => {
    // Source: Showdown gen5/moves.ts -- aromatherapy only cures status, no stat reset
    // teamStatusCure (not statusCured) means no stat reset -- just cures team status
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.aromatherapy),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        teamStatusCure: { side: "attacker" },
        messages: ["A soothing aroma wafted through the area!"],
      }),
    );
  });
});

// ===========================================================================
// Heal Bell
// ===========================================================================

describe("Heal Bell", () => {
  it("given Heal Bell is used, when executed, then cures status for the attacker's team", () => {
    // Source: Showdown gen5/moves.ts healbell -- cures ALL allies, no Soundproof check
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.healBell),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toMatchObject({
      teamStatusCure: { side: "attacker" },
      messages: ["A bell chimed!"],
    });
  });

  it("given Heal Bell result, when checking, then does NOT reset stat stages", () => {
    // Source: Showdown gen5/moves.ts -- healbell only cures status, no stat reset
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.healBell),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        teamStatusCure: { side: "attacker" },
        messages: ["A bell chimed!"],
      }),
    );
  });
});

// ===========================================================================
// Soak
// ===========================================================================

describe("Soak", () => {
  it("given a Normal-type target, when Soak is used, then changes target to Water type", () => {
    // Source: Showdown gen5/moves.ts soak -- sets target type to Water
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.soak),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        typeChange: { target: "defender", types: [TYPES.water] },
        messages: ["The target transformed into the Water type!"],
      }),
    );
  });

  it("given a Water-type target in Gen 5, when Soak is used, then SUCCEEDS (no Water-type failure check)", () => {
    // Source: Showdown gen5/moves.ts soak -- no `target.getTypes().join() === 'Water'` check
    // This is the key Gen 5 vs Gen 6+ difference: Gen 5 does NOT fail on Water-type targets.
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ types: [TYPES.water] }),
      move: createCanonicalMove(MOVES.soak),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        typeChange: { target: "defender", types: [TYPES.water] },
        messages: ["The target transformed into the Water type!"],
      }),
    );
  });

  it("given a Fire/Flying target, when Soak is used, then changes to pure Water type", () => {
    // Source: Showdown gen5/moves.ts soak -- replaces all types with Water
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ types: [TYPES.fire, TYPES.flying] }),
      move: createCanonicalMove(MOVES.soak),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        typeChange: { target: "defender", types: [TYPES.water] },
        messages: ["The target transformed into the Water type!"],
      }),
    );
  });

  it("given a target with Multitype, when Soak is used, then fails", () => {
    // Source: Showdown gen5/moves.ts soak -- fails if setType returns false
    // Multitype prevents type changes (cantsuppress flag)
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({
        types: [TYPES.normal],
        ability: ABILITIES.multitype,
      }),
      move: createCanonicalMove(MOVES.soak),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
    expect(result!.typeChange).toBeUndefined();
  });
});

// ===========================================================================
// Incinerate
// ===========================================================================

describe("Incinerate", () => {
  it("given a target holding a sitrus-berry, when Incinerate is used, then destroys the berry", () => {
    // Source: Showdown gen5/moves.ts incinerate -- if (item.isBerry) takeItem
    const defender = createSyntheticOnFieldPokemon({ heldItem: ITEMS.sitrusBerry });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({ messages: [`The target's ${ITEMS.sitrusBerry} was incinerated!`] }),
    );
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given a target holding a lum-berry, when Incinerate is used, then destroys the berry", () => {
    // Source: Showdown gen5/moves.ts incinerate -- if (item.isBerry) takeItem
    const defender = createSyntheticOnFieldPokemon({ heldItem: ITEMS.lumBerry });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({ messages: [`The target's ${ITEMS.lumBerry} was incinerated!`] }),
    );
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given a target holding a fire-gem in Gen 5, when Incinerate is used, then does NOT destroy the gem", () => {
    // Source: Showdown gen5/moves.ts incinerate -- only checks item.isBerry, NOT item.isGem
    // This is the key Gen 5 vs Gen 6+ difference: Gen 5 Incinerate only destroys Berries
    const defender = createSyntheticOnFieldPokemon({ heldItem: ITEMS.fireGem });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: [] }));
    expect(defender.pokemon.heldItem).toBe(ITEMS.fireGem);
  });

  it("given a target with no item, when Incinerate is used, then no item is destroyed", () => {
    // Source: Showdown gen5/moves.ts incinerate -- no item to destroy
    const defender = createSyntheticOnFieldPokemon({ heldItem: null });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: [] }));
  });

  it("given a target holding leftovers, when Incinerate is used, then does not destroy it", () => {
    // Source: Showdown gen5/moves.ts incinerate -- leftovers is not a berry
    const defender = createSyntheticOnFieldPokemon({ heldItem: CORE_ITEMS.leftovers });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: [] }));
    expect(defender.pokemon.heldItem).toBe(CORE_ITEMS.leftovers);
  });

  it("given a target with Unburden holding a berry, when Incinerate is used, then sets unburden volatile", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem:
    //   activates when item is lost by any means (consumed, stolen, knocked off, incinerated).
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
    const defender = createSyntheticOnFieldPokemon({
      heldItem: ITEMS.sitrusBerry,
      ability: ABILITIES.unburden,
    });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({ messages: [`The target's ${ITEMS.sitrusBerry} was incinerated!`] }),
    );
    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has(ABILITIES.unburden)).toBe(true);
  });

  it("given a target without Unburden holding a berry, when Incinerate is used, then does NOT set unburden volatile", () => {
    // Source: Showdown data/abilities.ts -- Unburden only activates for holders of the ability
    const defender = createSyntheticOnFieldPokemon({
      heldItem: ITEMS.sitrusBerry,
      ability: CORE_ABILITIES.blaze,
    });
    const ctx = createMoveEffectContext({
      defender,
      move: createCanonicalMove(MOVES.incinerate),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({ messages: [`The target's ${ITEMS.sitrusBerry} was incinerated!`] }),
    );
    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has(ABILITIES.unburden)).toBe(false);
  });
});

// ===========================================================================
// Bestow
// ===========================================================================

describe("Bestow", () => {
  it("given user has leftovers and target has no item, when Bestow is used, then transfers item", () => {
    // Source: Showdown data/moves.ts bestow -- source.takeItem() + target.setItem()
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({
        heldItem: CORE_ITEMS.leftovers,
        nickname: "Audino",
      }),
      defender: createSyntheticOnFieldPokemon({ heldItem: null, nickname: "Chansey" }),
      move: createCanonicalMove(MOVES.bestow),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        itemTransfer: { from: "attacker", to: "defender" },
        messages: [`Audino gave its ${CORE_ITEMS.leftovers} to Chansey!`],
      }),
    );
  });

  it("given target already has an item, when Bestow is used, then fails", () => {
    // Source: Showdown data/moves.ts bestow -- if (target.item) return false
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ heldItem: CORE_ITEMS.leftovers }),
      defender: createSyntheticOnFieldPokemon({ heldItem: ITEMS.lifeOrb }),
      move: createCanonicalMove(MOVES.bestow),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
    expect(result!.itemTransfer).toBeUndefined();
  });

  it("given user has no item, when Bestow is used, then fails", () => {
    // Source: Showdown data/moves.ts bestow -- const myItem = source.takeItem(); if (!myItem) return false
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ heldItem: null }),
      defender: createSyntheticOnFieldPokemon({ heldItem: null }),
      move: createCanonicalMove(MOVES.bestow),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
    expect(result!.itemTransfer).toBeUndefined();
  });
});

// ===========================================================================
// Entrainment
// ===========================================================================

describe("Entrainment", () => {
  it("given user has Intimidate and target has Overgrow, when Entrainment is used, then changes target ability to Intimidate", () => {
    // Source: Showdown data/moves.ts entrainment -- target.setAbility(source.ability)
    // Source: Bulbapedia -- "Entrainment changes the target's Ability to match the user's"
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      defender: createSyntheticOnFieldPokemon({
        ability: ABILITIES.overgrow,
        nickname: "Serperior",
      }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(
      baseMoveResult({
        abilityChange: { target: "defender", ability: ABILITIES.intimidate },
        messages: ["Serperior acquired intimidate!"],
      }),
    );
  });

  it("given target already has the same ability, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- target.ability === source.ability -> false
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given target has Truant, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- target.ability === 'truant' -> false
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.truant }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given target has Multitype, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress flag blocks
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.multitype }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given target has Zen Mode, when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress flag blocks
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.intimidate }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.zenMode }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given user has Trace (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.trace }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.overgrow }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given user has Forecast (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.forecast }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.overgrow }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: ["But it failed!"] }));
  });

  it("given user has Illusion (source-blocked), when Entrainment is used, then fails", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    const ctx = createMoveEffectContext({
      attacker: createSyntheticOnFieldPokemon({ ability: ABILITIES.illusion }),
      defender: createSyntheticOnFieldPokemon({ ability: ABILITIES.overgrow }),
      move: createCanonicalMove(MOVES.entrainment),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toMatchObject({ messages: ["But it failed!"] });
  });
});

// ===========================================================================
// Entrainment constants
// ===========================================================================

describe("Entrainment blocked sets", () => {
  it("given ENTRAINMENT_TARGET_BLOCKED, when checked, then contains multitype, zen-mode, truant", () => {
    // Source: Showdown data/moves.ts entrainment -- cantsuppress + truant check
    expect(ENTRAINMENT_TARGET_BLOCKED.has(ABILITIES.multitype)).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.has(ABILITIES.zenMode)).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.has(ABILITIES.truant)).toBe(true);
    expect(ENTRAINMENT_TARGET_BLOCKED.size).toBe(3);
  });

  it("given ENTRAINMENT_SOURCE_BLOCKED, when checked, then contains noentrain abilities", () => {
    // Source: Showdown data/moves.ts entrainment -- source.getAbility().flags['noentrain']
    // Source: Bulbapedia -- Entrainment: Flower Gift, Forecast, Illusion, Imposter, Trace, Zen Mode
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.flowerGift)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.forecast)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.illusion)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.imposter)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.trace)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.has(ABILITIES.zenMode)).toBe(true);
    expect(ENTRAINMENT_SOURCE_BLOCKED.size).toBe(6);
  });
});

// ===========================================================================
// Round
// ===========================================================================

describe("Round", () => {
  it("given Round is used in singles, when executed, then returns a result (no doubling in singles)", () => {
    // Source: Showdown data/moves.ts round -- basePowerCallback doubles if move.sourceEffect === 'round'
    // In singles, there's no ally, so the doubling doesn't apply.
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.round),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ messages: [] }));
  });
});

// ===========================================================================
// Dispatch null-return for unrecognized moves
// ===========================================================================

describe("handleGen5StatusMove dispatch", () => {
  it("given an unrecognized move, when dispatched, then returns null", () => {
    // Source: dispatcher pattern -- returns null for unrecognized moves
    const ctx = createMoveEffectContext({
      move: createCanonicalMove(MOVES.thunderbolt),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(null);
  });

  it("given Heal Pulse, when dispatched through handleGen5StatusMove, then returns a heal result", () => {
    // Source: Showdown gen5/moves.ts healpulse -- verify dispatch routing
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ hp: 300 }),
      move: createCanonicalMove(MOVES.healPulse),
    });

    const result = handleGen5StatusMove(ctx);

    expect(result).toEqual(baseMoveResult({ defenderHealAmount: 150, messages: [] }));
  });
});

// ===========================================================================
// Master dispatcher integration
// ===========================================================================

describe("executeGen5MoveEffect integration", () => {
  it("given a status move (Heal Pulse), when dispatched through master dispatcher, then reaches status handler", () => {
    // Source: Gen5MoveEffects.ts master dispatcher -- step 4: status handler
    const ctx = createMoveEffectContext({
      defender: createSyntheticOnFieldPokemon({ hp: 400 }),
      move: createCanonicalMove(MOVES.healPulse),
    });
    const rng = new SeededRandom(42);
    const rollProtectSuccess = () => true;

    const result = executeGen5MoveEffect(ctx, rng, rollProtectSuccess);

    expect(result).toEqual(baseMoveResult({ defenderHealAmount: 200, messages: [] }));
  });

  it("given an unrecognized move, when dispatched through master dispatcher, then returns null", () => {
    // Source: Gen5MoveEffects.ts master dispatcher -- falls through all handlers
    const ctx = createMoveEffectContext({
      move: createSyntheticMove("Exercise the unrecognized move dispatcher path.", {
        id: "unknown-move",
      }),
    });
    const rng = new SeededRandom(42);
    const rollProtectSuccess = () => true;

    const result = executeGen5MoveEffect(ctx, rng, rollProtectSuccess);

    expect(result).toEqual(null);
  });
});
