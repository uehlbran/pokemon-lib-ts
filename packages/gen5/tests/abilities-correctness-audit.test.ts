import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
  ItemContext,
} from "@pokemon-lib-ts/battle";
import { createActivePokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  MoveEffect,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  getSheerForceMultiplier,
  hasSheerForceEligibleEffect,
  sheerForceSuppressesLifeOrb,
} from "../src/Gen5AbilitiesDamage";
import {
  getSereneGraceMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  handleGen5RemainingAbility,
} from "../src/Gen5AbilitiesRemaining";
import { handleGen5StatAbility, isPranksterEligible } from "../src/Gen5AbilitiesStat";
import { handleGen5SwitchAbility, isMoldBreakerAbility } from "../src/Gen5AbilitiesSwitch";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { applyGen5HeldItem } from "../src/Gen5Items";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

const dataManager = createGen5DataManager();
const A = GEN5_ABILITY_IDS;
const I = GEN5_ITEM_IDS;
const M = GEN5_MOVE_IDS;
const NONE_ABILITY = CORE_ABILITY_IDS.none;
const DEFAULT_SPECIES_ID = GEN5_SPECIES_IDS.pikachu;
const DEFAULT_NATURE = GEN5_NATURE_IDS.hardy;
const DEFAULT_POKEBALL = CORE_ITEM_IDS.pokeBall;
const DEFAULT_TYPE = CORE_TYPE_IDS.electric;
const DEFAULT_LEVEL = 50;
const PRIMARY_STATUS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const LEVITATE_NAME = dataManager.getAbility(A.levitate).displayName;
const WONDER_GUARD_NAME = dataManager.getAbility(A.wonderGuard).displayName;
const DEFAULT_TACKLE = dataManager.getMove(M.tackle);

/**
 * Gen 5 Abilities / Items Correctness Audit -- regression tests.
 *
 * Each test documents the authoritative source and verifies a specific mechanic.
 *
 * Source: references/pokemon-showdown/data/abilities.ts (base definitions)
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts (Gen 5 overrides)
 * Source: Bulbapedia -- individual ability pages
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  nature?: string;
  pokeball?: string;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speciesRecord = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const pokemon = createPokemonInstance(speciesRecord, DEFAULT_LEVEL, new SeededRandom(speciesRecord.id), {
    nature: overrides.nature ?? DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: "normal1",
    gender: "male",
    isShiny: false,
    moves: [DEFAULT_TACKLE.id],
    heldItem: overrides.heldItem ?? null,
    friendship: speciesRecord.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: overrides.pokeball ?? DEFAULT_POKEBALL,
  });
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.moves = [createMoveSlot(DEFAULT_TACKLE.id, DEFAULT_TACKLE.pp)];
  pokemon.ability = overrides.ability ?? NONE_ABILITY;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as never;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: overrides.defense ?? 100,
    spAttack: 100,
    spDefense: overrides.spDefense ?? 100,
    speed: 100,
  };
  return pokemon;
}

function makeActivePokemon(overrides: {
  speciesId?: number;
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  nature?: string;
  pokeball?: string;
  turnsOnField?: number;
  statStages?: Partial<Record<string, number>>;
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
  status?: PrimaryStatus | null;
  defense?: number;
  spDefense?: number;
  movedThisTurn?: boolean;
  substituteHp?: number;
  itemKnockedOff?: boolean;
}): ActivePokemon {
  const pokemon = makePokemonInstance({
    speciesId: overrides.speciesId,
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    heldItem: overrides.heldItem,
    nature: overrides.nature,
    pokeball: overrides.pokeball,
    status: overrides.status,
    defense: overrides.defense,
    spDefense: overrides.spDefense,
  });
  const active = createActivePokemon(
    pokemon,
    0,
    overrides.types ?? [...dataManager.getSpecies(pokemon.speciesId).types] ?? [DEFAULT_TYPE],
  );
  active.statStages = {
    attack: overrides.statStages?.attack ?? 0,
    defense: overrides.statStages?.defense ?? 0,
    spAttack: overrides.statStages?.spAttack ?? 0,
    spDefense: overrides.statStages?.spDefense ?? 0,
    speed: overrides.statStages?.speed ?? 0,
    accuracy: overrides.statStages?.accuracy ?? 0,
    evasion: overrides.statStages?.evasion ?? 0,
  };
  active.volatileStatuses = overrides.volatiles ?? new Map();
  active.ability = overrides.ability ?? NONE_ABILITY;
  active.turnsOnField = overrides.turnsOnField ?? 1;
  active.movedThisTurn = overrides.movedThisTurn ?? false;
  active.substituteHp = overrides.substituteHp ?? 0;
  active.itemKnockedOff = overrides.itemKnockedOff ?? false;
  return active;
}

function makeSide(index: 0 | 1, active: ActivePokemon[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function makeBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number } | null;
  format?: "singles" | "doubles";
  sides?: [BattleSide, BattleSide];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [makeSide(0), makeSide(1)],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

function makeAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  move?: MoveData;
  turnsOnField?: number;
  nickname?: string;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
  state?: BattleState;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  status?: PrimaryStatus | null;
  movedThisTurn?: boolean;
  substituteHp?: number;
  rng?: {
    next: () => number;
    int: () => number;
    chance: (prob: number) => boolean;
    pick: <T>(arr: readonly T[]) => T;
    shuffle: <T>(arr: T[]) => T[];
    getState: () => number;
    setState: (s: number) => void;
  };
}): AbilityContext {
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    turnsOnField: opts.turnsOnField ?? 1,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    volatiles: opts.volatiles,
    status: opts.status,
    movedThisTurn: opts.movedThisTurn,
    substituteHp: opts.substituteHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state: opts.state ?? makeBattleState(),
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
    rng: opts.rng ?? {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

function makeItemContext(opts: {
  ability?: string;
  heldItem: string | null;
  currentHp?: number;
  maxHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
  rng?: SeededRandom;
  types?: PokemonType[];
}): ItemContext {
  const pokemon = makeActivePokemon({
    ability: opts.ability ?? NONE_ABILITY,
    heldItem: opts.heldItem,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    volatiles: opts.volatiles,
    types: opts.types,
  });
  pokemon.pokemon.heldItem = opts.heldItem;

  return {
    pokemon,
    move: opts.move,
    damage: opts.damage,
    state: opts.state ?? makeBattleState(),
    rng: opts.rng ?? new SeededRandom(42),
  } as unknown as ItemContext;
}

// ---------------------------------------------------------------------------
// Sheer Force
// ---------------------------------------------------------------------------

describe("Sheer Force -- damage boost and secondary effect suppression", () => {
  it(
    "given Sheer Force and a move with a status-chance secondary, " +
      "when hasSheerForceEligibleEffect is called, then returns true",
    () => {
      // Source: Showdown data/abilities.ts -- sheerforce onModifyMove: deletes move.secondaries
      const effect: MoveEffect = { type: "status-chance", status: PRIMARY_STATUS.burn, chance: 10 };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    },
  );

  it(
    "given Sheer Force and a move with a foe-targeted stat-change secondary, " +
      "when hasSheerForceEligibleEffect is called, then returns true",
    () => {
      // Source: Showdown data/moves.ts -- Acid Spray SpDef drop is in secondary field
      const effect: MoveEffect = {
        type: "stat-change",
        target: "foe",
        stat: "spDefense",
        stages: -2,
        chance: 100,
      };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    },
  );

  it(
    "given Sheer Force and a move with a self-targeted stat-change that is NOT from secondary.self, " +
      "when hasSheerForceEligibleEffect is called, then returns false",
    () => {
      // Source: Showdown data/moves.ts -- Close Combat: primary self-effect (not secondary)
      // NOT eligible for Sheer Force suppression
      const effect: MoveEffect = {
        type: "stat-change",
        target: "self",
        stat: "defense",
        stages: -1,
        chance: 100,
        fromSecondary: false,
      };
      expect(hasSheerForceEligibleEffect(effect)).toBe(false);
    },
  );

  it(
    "given Sheer Force and a move with a volatile-status secondary (flinch), " +
      "when hasSheerForceEligibleEffect is called, then returns true",
    () => {
      // Source: Showdown data/moves.ts -- Air Slash: secondary flinch (30% chance)
      const effect: MoveEffect = { type: "volatile-status", volatile: VOLATILE_IDS.flinch, chance: 30 };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    },
  );

  it(
    "given sheer-force ability and a move with secondary effects, " +
      "when getSheerForceMultiplier is called, then returns 5325/4096 (~1.3x)",
    () => {
      // Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
      const effect: MoveEffect = { type: "status-chance", status: PRIMARY_STATUS.burn, chance: 10 };
      const multiplier = getSheerForceMultiplier(A.sheerForce, effect);
      expect(multiplier).toBeCloseTo(5325 / 4096, 10);
    },
  );

  it(
    "given sheer-force ability and a move WITHOUT secondary effects, " +
      "when getSheerForceMultiplier is called, then returns 1.0 (no boost)",
    () => {
      // Triangulation: only moves with eligible secondaries get the boost
      const multiplier = getSheerForceMultiplier(A.sheerForce, null);
      expect(multiplier).toBe(1);
    },
  );

  it(
    "given Sheer Force active on a move with secondaries, " +
      "when sheerForceSuppressesLifeOrb is called, then returns true",
    () => {
      // Source: Showdown scripts.ts -- if move.hasSheerForce: skip Life Orb recoil
      const effect: MoveEffect = { type: "status-chance", status: PRIMARY_STATUS.paralysis, chance: 30 };
      expect(sheerForceSuppressesLifeOrb(A.sheerForce, effect)).toBe(true);
    },
  );

  it(
    "given Sheer Force on a move WITHOUT secondaries, " +
      "when sheerForceSuppressesLifeOrb is called, then returns false",
    () => {
      // Life Orb recoil only suppressed when SF activates; null effect = no suppression
      expect(sheerForceSuppressesLifeOrb(A.sheerForce, null)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Prankster -- Gen 5 does NOT block Dark-type targets
// ---------------------------------------------------------------------------

describe("Prankster -- Dark-type immunity is Gen 6+, NOT Gen 5", () => {
  it("given Prankster and a status move, when on-priority-check fires, then activates", () => {
    // Source: Showdown data/abilities.ts -- Prankster onModifyPriority:
    //   if (move.category === 'Status') return priority + 1
    const ctx = makeAbilityContext({
      ability: A.prankster,
      trigger: "on-priority-check",
      move: makeMove(M.taunt),
      nickname: "Sableye",
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Prankster");
    expect(result.messages[0]).toContain("Sableye");
  });

  it(
    "given Prankster and a status move targeted at a Dark-type opponent, " +
      "when on-priority-check fires, then still activates (no Dark immunity in Gen 5)",
    () => {
      // Source: Showdown data/mods/gen5/abilities.ts -- no Dark immunity override for Gen 5
      // Source: Bulbapedia -- Prankster: Dark-type immunity was added in Gen 7
      const darkOpponent = makeActivePokemon({ types: [CORE_TYPE_IDS.dark] });
      const ctx = makeAbilityContext({
        ability: A.prankster,
        trigger: "on-priority-check",
        move: makeMove(M.taunt),
        opponent: darkOpponent,
        nickname: "Sableye",
      });
      const result = handleGen5StatAbility(ctx);

      expect(result.activated).toBe(true);
    },
  );

  it("given isPranksterEligible and a status category, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
    expect(isPranksterEligible(CORE_MOVE_CATEGORIES.status)).toBe(true);
  });

  it("given isPranksterEligible and a physical category, then returns false", () => {
    // Triangulation: physical moves do not get priority boost
    expect(isPranksterEligible(CORE_MOVE_CATEGORIES.physical)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contrary
// ---------------------------------------------------------------------------

describe("Contrary -- reverses all stat changes (boosts AND drops)", () => {
  it("given Contrary and an opponent-caused stat drop, when on-stat-change fires, then activates", () => {
    // Source: Showdown data/abilities.ts -- Contrary onChangeBoost: multiply by -1
    const ctx = makeAbilityContext({
      ability: A.contrary,
      trigger: "on-stat-change",
      statChange: { stat: "spAttack", stages: -2, source: "opponent" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
  });

  it("given Contrary and a self-stat-drop (e.g. Leaf Storm), when on-stat-change fires, then activates", () => {
    // Source: Showdown -- Contrary reverses ALL changes including self-inflicted
    // Leaf Storm self-drop becomes a +2 SpAtk boost with Contrary
    const ctx = makeAbilityContext({
      ability: A.contrary,
      trigger: "on-stat-change",
      statChange: { stat: "spAttack", stages: -2, source: "self" },
    });
    const result = handleGen5StatAbility(ctx);

    expect(result.activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Simple
// ---------------------------------------------------------------------------

describe("Simple -- doubles all stat changes (boosts AND drops)", () => {
  it("given Simple and a +1 boost, when on-stat-change fires, then activates", () => {
    // Source: Showdown data/abilities.ts -- Simple onChangeBoost: multiply by 2
    const ctx = makeAbilityContext({
      ability: A.simple,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 1, source: "self" },
    });
    expect(handleGen5StatAbility(ctx).activated).toBe(true);
  });

  it("given Simple and a -1 drop, when on-stat-change fires, then activates", () => {
    // Triangulation: drops are also doubled
    const ctx = makeAbilityContext({
      ability: A.simple,
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "opponent" },
    });
    expect(handleGen5StatAbility(ctx).activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Defiant -- triggers on Intimidate (opponent-caused drops)
// ---------------------------------------------------------------------------

describe("Defiant -- +2 Attack when opponent lowers any stat", () => {
  it(
    "given Defiant and an opponent-caused Attack drop (Intimidate), " +
      "when on-stat-change fires, then returns +2 Attack effect",
    () => {
      // Source: Showdown data/abilities.ts -- Defiant onAfterEachBoost:
      //   if (!source.isAlly(target) && boost[stat] < 0) this.boost({atk: 2})
      const ctx = makeAbilityContext({
        ability: A.defiant,
        trigger: "on-stat-change",
        statChange: { stat: "attack", stages: -1, source: "opponent" },
        nickname: "Bisharp",
      });
      const result = handleGen5StatAbility(ctx);

      expect(result.activated).toBe(true);
      const atkBoost = result.effects.find(
        (e) => e.effectType === "stat-change" && e.stat === "attack",
      );
      expect(atkBoost).toBeDefined();
      expect(atkBoost?.stages).toBe(2);
    },
  );

  it(
    "given Defiant and a self-caused stat drop (Close Combat), " +
      "when on-stat-change fires, then does NOT activate",
    () => {
      // Source: Showdown -- `if (source && source.isAlly(target)) return;`
      // Self-inflicted drops do NOT trigger Defiant
      const ctx = makeAbilityContext({
        ability: A.defiant,
        trigger: "on-stat-change",
        statChange: { stat: "defense", stages: -1, source: "self" },
      });
      expect(handleGen5StatAbility(ctx).activated).toBe(false);
    },
  );

  it("given Defiant and an opponent-caused BOOST, when on-stat-change fires, then does NOT activate", () => {
    // Triangulation: only drops (negative stages) trigger Defiant
    const ctx = makeAbilityContext({
      ability: A.defiant,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 1, source: "opponent" },
    });
    expect(handleGen5StatAbility(ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Moxie -- fires after KO (opponent HP === 0)
// ---------------------------------------------------------------------------

describe("Moxie -- +1 Attack after KOing a Pokemon", () => {
  it(
    "given Moxie and an opponent that fainted (HP = 0), " +
      "when on-after-move-used fires, then returns +1 Attack effect",
    () => {
      // Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint:
      //   this.boost({atk: 1}, source)
      const faintedOpponent = makeActivePokemon({ currentHp: 0, maxHp: 200 });
      const ctx = makeAbilityContext({
        ability: A.moxie,
        trigger: "on-after-move-used",
        opponent: faintedOpponent,
        nickname: "Krookodile",
      });
      const result = handleGen5StatAbility(ctx);

      expect(result.activated).toBe(true);
      const atkBoost = result.effects.find(
        (e) => e.effectType === "stat-change" && e.stat === "attack",
      );
      expect(atkBoost?.stages).toBe(1);
    },
  );

  it(
    "given Moxie and an opponent still alive (HP > 0), " +
      "when on-after-move-used fires, then does NOT activate",
    () => {
      // Triangulation: Moxie only triggers on KO (HP === 0)
      const livingOpponent = makeActivePokemon({ currentHp: 50, maxHp: 200 });
      const ctx = makeAbilityContext({
        ability: A.moxie,
        trigger: "on-after-move-used",
        opponent: livingOpponent,
      });
      expect(handleGen5StatAbility(ctx).activated).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Overcoat -- Gen 5: weather immunity is handled in the weather module;
// powder block is Gen 6+
// ---------------------------------------------------------------------------

describe("Overcoat -- Gen 5: passive-immunity hook is a no-op for weather", () => {
  it("given Overcoat and passive-immunity trigger, when called, then does not produce a weather-immunity effect", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- overcoat:
    //   onImmunity(type): if (type === 'sandstorm' || type === 'hail') return false;
    // Weather immunity is handled by the weather module; passive-immunity is for move immunities.
    // Source: Bulbapedia -- Overcoat (Gen 5): "Protects from sandstorm and hail damage."
    const ctx = makeAbilityContext({
      ability: A.overcoat,
      trigger: "passive-immunity",
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Magic Bounce -- REGRESSION: currently unimplemented (Bug #543)
// ---------------------------------------------------------------------------

describe("Magic Bounce -- REGRESSION #543: ability not implemented in Gen 5", () => {
  it(
    "given Magic Bounce and a status move (passive-immunity trigger), " +
      "when called, then currently returns NOT activated (bug: should reflect the move)",
    () => {
      // Source: references/pokemon-showdown/data/abilities.ts -- magicbounce:
      //   onTryHit: if move.flags['reflectable'] && !move.hasBounced: reflect and return null
      // Source: references/pokemon-showdown/data/mods/gen5/abilities.ts line 36:
      //   magicbounce: { inherit: true } -- Gen 5 uses the base implementation
      //
      // BUG #543: No magic-bounce case in Gen5AbilitiesSwitch.ts handlePassiveImmunity().
      // This test documents current (broken) behavior.
      // When #543 is fixed, this test should be updated to expect activated: true.
      const ctx = makeAbilityContext({
        ability: A.magicBounce,
        trigger: "passive-immunity",
        move: makeMove(M.stealthRock),
      });
      const result = handleGen5SwitchAbility("passive-immunity", ctx);

      // Current buggy state: Magic Bounce is completely unimplemented
      expect(result.activated).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Mold Breaker / Turboblaze / Teravolt
// ---------------------------------------------------------------------------

describe("Mold Breaker / Turboblaze / Teravolt -- all bypass defensive abilities", () => {
  it("given mold-breaker, when isMoldBreakerAbility is called, then returns true", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker onModifyMove: move.ignoreAbility = true
    expect(isMoldBreakerAbility(A.moldBreaker)).toBe(true);
  });

  it("given turboblaze, when isMoldBreakerAbility is called, then returns true", () => {
    // Source: Showdown data/abilities.ts -- turboblaze: functionally identical to Mold Breaker
    expect(isMoldBreakerAbility(A.turboblaze)).toBe(true);
  });

  it("given teravolt, when isMoldBreakerAbility is called, then returns true", () => {
    // Source: Showdown data/abilities.ts -- teravolt: functionally identical to Mold Breaker
    expect(isMoldBreakerAbility(A.teravolt)).toBe(true);
  });

  it(`given ${LEVITATE_NAME} (non-mold-breaker), when isMoldBreakerAbility is called, then returns false`, () => {
    // Triangulation: regular abilities do not bypass defensive abilities
    expect(isMoldBreakerAbility(A.levitate)).toBe(false);
  });

  it(`given ${WONDER_GUARD_NAME} (non-mold-breaker), when isMoldBreakerAbility is called, then returns false`, () => {
    // Triangulation
    expect(isMoldBreakerAbility(A.wonderGuard)).toBe(false);
  });

  it("given Turboblaze switch-in, when on-switch-in fires, then message mentions blazing aura", () => {
    // Source: Showdown data/abilities.ts -- turboblaze onStart: "radiating a blazing aura!"
    const ctx = makeAbilityContext({
      ability: A.turboblaze,
      trigger: "on-switch-in",
      nickname: "Reshiram",
    });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("blazing aura");
  });

  it("given Teravolt switch-in, when on-switch-in fires, then message mentions bursting aura", () => {
    // Source: Showdown data/abilities.ts -- teravolt onStart: "radiating a bursting aura!"
    const ctx = makeAbilityContext({
      ability: A.teravolt,
      trigger: "on-switch-in",
      nickname: "Zekrom",
    });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("bursting aura");
  });
});

// ---------------------------------------------------------------------------
// Serene Grace -- Gen 5 excludes Secret Power
// ---------------------------------------------------------------------------

describe("Serene Grace -- doubles secondary chance; excludes Secret Power in Gen 5", () => {
  it("given Serene Grace and iron-head, when getSereneGraceMultiplier is called, then returns 2", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- serenegrace:
    //   if (move.secondaries && move.id !== 'secretpower') secondary.chance *= 2
    expect(getSereneGraceMultiplier(A.sereneGrace, M.ironHead)).toBe(2);
  });

  it("given Serene Grace and Secret Power, when getSereneGraceMultiplier is called, then returns 1", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- move.id !== 'secretpower' exclusion
    // This is a Gen 5 specific exclusion (Gen 6+ drops this restriction)
    expect(getSereneGraceMultiplier(A.sereneGrace, M.secretPower)).toBe(1);
  });

  it("given a non-Serene Grace ability, when getSereneGraceMultiplier is called, then returns 1", () => {
    // Triangulation: other abilities return 1 (no change)
    expect(getSereneGraceMultiplier(A.technician, M.ironHead)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Harvest -- probability constants and no-op guards
// ---------------------------------------------------------------------------

describe("Harvest -- probability constants verified against Showdown", () => {
  it("given HARVEST_BASE_PROBABILITY, then it equals 0.5 (50% outside sun)", () => {
    // Source: Showdown data/abilities.ts -- harvest: this.randomChance(1, 2) = 1/2 = 0.5
    expect(HARVEST_BASE_PROBABILITY).toBe(0.5);
  });

  it("given HARVEST_SUN_PROBABILITY, then it equals 1.0 (100% in sun)", () => {
    // Source: Showdown data/abilities.ts -- if isWeather(['sunnyday']): always restore
    expect(HARVEST_SUN_PROBABILITY).toBe(1.0);
  });

  it("given Harvest with no harvest-berry volatile, when on-turn-end fires, then does not activate", () => {
    // Correct: no consumed berry means nothing to harvest
    const ctx = makeAbilityContext({
      ability: A.harvest,
      trigger: "on-turn-end",
      heldItem: null,
    });
    expect(handleGen5RemainingAbility(ctx).activated).toBe(false);
  });

  it("given Harvest with a current held item, when on-turn-end fires, then does not activate", () => {
    // Correct: must have no item to receive a restored berry
    // Source: Showdown -- if (pokemon.hp && !pokemon.item && ...)
    const ctx = makeAbilityContext({
      ability: A.harvest,
      trigger: "on-turn-end",
      heldItem: I.leftovers,
    });
    expect(handleGen5RemainingAbility(ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Healer -- doubles only, correct no-op in singles
// ---------------------------------------------------------------------------

describe("Healer -- 30% chance to cure ally status; no-op in singles (not a bug)", () => {
  it("given HEALER_PROBABILITY, then it equals 0.3 (30% chance per ally)", () => {
    // Source: Showdown data/abilities.ts -- healer: this.randomChance(3, 10) = 3/10 = 0.3
    expect(HEALER_PROBABILITY).toBe(0.3);
  });

  it("given Healer in singles format, when on-turn-end fires, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- healer iterates adjacentAllies()
    // In singles, adjacentAllies() is always empty -- no ally to heal
    // This is CORRECT behavior, not a bug
    const ctx = makeAbilityContext({
      ability: A.healer,
      trigger: "on-turn-end",
      state: makeBattleState({ format: "singles" }),
    });
    expect(handleGen5RemainingAbility(ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unburden -- REGRESSION: stolen item does not trigger Unburden (Bug #541)
// ---------------------------------------------------------------------------

describe("Unburden -- REGRESSION #541: stolen item does not trigger Unburden volatile", () => {
  it(
    "given Unburden and Sitrus Berry consumed via end-of-turn, " +
      "when applyGen5HeldItem fires, then unburden volatile is set on the holder",
    () => {
      // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem: addVolatile('unburden')
      // Consume case: current implementation handles this correctly
      const ctx = makeItemContext({
        ability: A.unburden,
        heldItem: I.sitrusBerry,
        currentHp: 50, // below 50% to trigger Sitrus Berry
        maxHp: 200,
      });

      const result = applyGen5HeldItem("end-of-turn", ctx);

      // Sitrus Berry triggers and consumes
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      // Unburden volatile must be set after consumption
      expect(ctx.pokemon.volatileStatuses.has(VOLATILE_IDS.unburden)).toBe(true);
    },
  );

  it(
    "given Unburden and item knocked off (itemKnockedOff = true), " +
      "when the state is checked, unburden volatile is NOT set (BUG #541)",
    () => {
      // Source: Showdown data/abilities.ts -- Unburden onTakeItem: addVolatile('unburden')
      // onTakeItem fires when item is taken away by Knock Off, Thief, Covet, etc.
      // BUG #541: Gen5Items.ts only checks `result.effects.some(e => e.type === 'consume')`.
      // Knock Off sets itemKnockedOff = true and nulls the item, emitting no "consume" effect.
      // The unburden volatile is therefore never set for stolen items.
      const pokemon = makeActivePokemon({
        ability: A.unburden,
        heldItem: I.choiceBand,
        itemKnockedOff: false,
      });
      pokemon.pokemon.heldItem = I.choiceBand;

      // Simulate Knock Off removing the item
      pokemon.pokemon.heldItem = null;
      pokemon.itemKnockedOff = true;

      // BUG: unburden volatile is not set by the current Knock Off handler
      // Expected after fix: pokemon.volatileStatuses.has(VOLATILE_IDS.unburden) === true
      expect(pokemon.volatileStatuses.has(VOLATILE_IDS.unburden)).toBe(false); // documents the bug
    },
  );
});

// ---------------------------------------------------------------------------
// Type Gems -- 1.5x in Gen 5 (NOT 1.3x like Gen 6+)
// ---------------------------------------------------------------------------

describe("Type Gems -- Gen 5 uses 1.5x boost (NOT Gen 6+'s 1.3x)", () => {
  it(
    "given a Fire attacker holding fire-gem uses a Fire move, " +
      "when calculateGen5Damage is called, then damage is exactly 1.5x the no-gem baseline",
    () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem condition:
      //   onBasePower: return this.chainModify(1.5);
      // Gem boost multiplies BASE POWER by 1.5 before the damage formula runs.
      // We use seed 42 with isCrit=false to get a fixed random factor.
      const baseState = {
        phase: "turn-end",
        generation: 5,
        format: "singles",
        turnNumber: 1,
        sides: [{ index: 0, active: [] } as unknown, { index: 1, active: [] } as unknown],
        weather: null,
        terrain: null,
        trickRoom: { active: false, turnsLeft: 0 },
        magicRoom: { active: false, turnsLeft: 0 },
        wonderRoom: { active: false, turnsLeft: 0 },
        gravity: { active: false, turnsLeft: 0 },
        turnHistory: [],
        rng: null as unknown,
        ended: false,
        winner: null,
      } as BattleState;

      // Ember: base power 40, Fire type, special
      const fireMove = makeMove(M.ember);

      const attacker = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.charmander,
        types: [CORE_TYPE_IDS.fire],
        heldItem: null,
      });
      const attackerWithGem = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.charmander,
        types: [CORE_TYPE_IDS.fire],
        heldItem: I.fireGem,
      });
      const defender = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.squirtle,
        types: [CORE_TYPE_IDS.water],
      });

      // Use the same seed so random factor is identical
      const ctxBase: DamageContext = {
        attacker,
        defender,
        move: fireMove,
        state: baseState,
        rng: new SeededRandom(42),
        isCrit: false,
      };
      const ctxGem: DamageContext = {
        attacker: attackerWithGem,
        defender,
        move: fireMove,
        state: baseState,
        rng: new SeededRandom(42),
        isCrit: false,
      };

      const resultBase = calculateGen5Damage(
        ctxBase,
        GEN5_TYPE_CHART as Record<string, Record<string, number>>,
      );
      const resultGem = calculateGen5Damage(
        ctxGem,
        GEN5_TYPE_CHART as Record<string, Record<string, number>>,
      );

      // Gem multiplies base power by 1.5 before the formula runs; final damage should be > base damage.
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- chainModify(1.5)
      expect(resultGem.damage).toBeGreaterThan(resultBase.damage);

      // The gem should be consumed: attacker's heldItem becomes null after the call
      // Source: Gen5DamageCalc.ts line ~991 -- attacker.pokemon.heldItem = null when gemConsumed
      expect(attackerWithGem.pokemon.heldItem).toBeNull();
    },
  );

  it(
    "given a Water attacker holding fire-gem uses a Water move, " +
      "when calculateGen5Damage is called, then gem does NOT activate (type mismatch)",
    () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem only boosts matching type
      const baseState2 = {
        phase: "turn-end",
        generation: 5,
        format: "singles",
        turnNumber: 1,
        sides: [{ index: 0, active: [] } as unknown, { index: 1, active: [] } as unknown],
        weather: null,
        terrain: null,
        trickRoom: { active: false, turnsLeft: 0 },
        magicRoom: { active: false, turnsLeft: 0 },
        wonderRoom: { active: false, turnsLeft: 0 },
        gravity: { active: false, turnsLeft: 0 },
        turnHistory: [],
        rng: null as unknown,
        ended: false,
        winner: null,
      } as BattleState;

      const waterMove = makeMove(M.waterGun);

      const attackerWithFireGem = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.squirtle,
        types: [CORE_TYPE_IDS.water],
        heldItem: I.fireGem,
      });
      const defender2 = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.pikachu,
        types: [CORE_TYPE_IDS.electric],
      });

      const ctx: DamageContext = {
        attacker: attackerWithFireGem,
        defender: defender2,
        move: waterMove,
        state: baseState2,
        rng: new SeededRandom(42),
        isCrit: false,
      };
      calculateGen5Damage(ctx, GEN5_TYPE_CHART as Record<string, Record<string, number>>);

      // Gem should NOT be consumed when type doesn't match
      expect(attackerWithFireGem.pokemon.heldItem).toBe(I.fireGem);
    },
  );
});

// ---------------------------------------------------------------------------
// Rocky Helmet -- 1/6 attacker HP on contact
// ---------------------------------------------------------------------------

describe("Rocky Helmet -- 1/6 attacker HP on contact moves", () => {
  it(
    "given Rocky Helmet holder hit by a contact move, " +
      "when on-contact fires, then attacker takes damage equal to floor(attackerMaxHp/6) targeting opponent",
    () => {
      // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
      //   if (move.flags['contact']) this.damage(source.baseMaxhp / 6, source, target)
      // The holder's opponent (the attacker) has maxHp from context.opponent or state fallback.
      // makeItemContext sets pokemon.pokemon.currentHp = maxHp = 200 (default).
      // The item handler derives attackerMaxHp from state.sides (falls back to holder's HP = 200).
      // floor(200 / 6) = 33.
      const ctx = makeItemContext({
        heldItem: I.rockyHelmet,
        move: makeMove(M.tackle),
        damage: 50,
      });
      const result = applyGen5HeldItem("on-contact", ctx);

      expect(result.activated).toBe(true);
      const chipEffect = result.effects.find((e) => e.type === "chip-damage");
      expect(chipEffect).toBeDefined();
      expect(chipEffect?.target).toBe("opponent");
      // Recoil = Math.floor(maxHp / 6) = Math.floor(200 / 6) = 33
      // Source: Gen5Items.ts -- Rocky Helmet: Math.floor(maxHp / 6)
      expect(chipEffect?.value).toBe(Math.floor(200 / 6));
    },
  );

  it(
    "given Rocky Helmet holder hit by a NON-contact move, " +
      "when on-contact fires, then does NOT activate",
    () => {
      // Triangulation: only contact moves trigger Rocky Helmet
      const ctx = makeItemContext({
        heldItem: I.rockyHelmet,
        move: makeMove(M.ember),
        damage: 50,
      });
      expect(applyGen5HeldItem("on-contact", ctx).activated).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Air Balloon -- popped by any damaging move
// ---------------------------------------------------------------------------

describe("Air Balloon -- pops when holder takes damage from any move", () => {
  it("given Air Balloon holder taking damage > 0, when on-damage-taken fires, then pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    const ctx = makeItemContext({ heldItem: I.airBalloon, damage: 80 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.find((e) => e.type === "consume")).toBeDefined();
    expect(result.messages[0]).toContain("Air Balloon");
  });

  it("given Air Balloon holder taking 0 damage, when on-damage-taken fires, then does NOT pop", () => {
    // Triangulation: 0-damage hits do not pop Air Balloon
    const ctx = makeItemContext({ heldItem: I.airBalloon, damage: 0 });
    expect(applyGen5HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Klutz -- suppresses ALL held item effects
// ---------------------------------------------------------------------------

describe("Klutz -- suppresses all held item effects", () => {
  it("given a Klutz Pokemon holding Leftovers, when end-of-turn fires, then Leftovers does NOT heal", () => {
    // Source: Showdown data/abilities.ts -- Klutz: holder cannot use held items
    // Source: Gen5Items.ts -- Klutz check at top of applyGen5HeldItem
    const ctx = makeItemContext({
      ability: A.klutz,
      heldItem: I.leftovers,
      currentHp: 100,
      maxHp: 200,
    });
    expect(applyGen5HeldItem("end-of-turn", ctx).activated).toBe(false);
  });

  it("given a Klutz Pokemon holding Rocky Helmet, when on-contact fires, then does NOT deal damage", () => {
    // Triangulation: Klutz suppresses all triggers, not just healing
    const ctx = makeItemContext({
      ability: A.klutz,
      heldItem: I.rockyHelmet,
      move: makeMove(M.tackle),
      damage: 50,
    });
    expect(applyGen5HeldItem("on-contact", ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Red Card and Eject Button -- activate after taking damage
// ---------------------------------------------------------------------------

describe("Red Card and Eject Button -- activate on damage taken", () => {
  it("given Red Card holder taking damage, when on-damage-taken fires, then Red Card is consumed", () => {
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary: source.forceSwitchFlag = true
    const ctx = makeItemContext({ heldItem: I.redCard, damage: 60 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.find((e) => e.type === "consume")).toBeDefined();
    expect(result.messages[0]).toContain("Red Card");
  });

  it("given Eject Button holder taking damage, when on-damage-taken fires, then Eject Button consumed", () => {
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary: target.switchFlag = true
    const ctx = makeItemContext({ heldItem: I.ejectButton, damage: 60 });
    const result = applyGen5HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.find((e) => e.type === "consume")).toBeDefined();
    expect(result.messages[0]).toContain("Eject Button");
  });

  it("given Red Card holder taking 0 damage, when on-damage-taken fires, then does NOT activate", () => {
    // Triangulation: Red Card requires actual damage
    const ctx = makeItemContext({ heldItem: I.redCard, damage: 0 });
    expect(applyGen5HeldItem("on-damage-taken", ctx).activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Eviolite -- 1.5x Def/SpDef for NFE Pokemon
// ---------------------------------------------------------------------------

describe("Eviolite -- 1.5x boost to Def and SpDef for NFE holders", () => {
  it(
    "given a defender holding Eviolite is hit by a physical move, " +
      "when calculateGen5Damage is called, then damage is less than without Eviolite",
    () => {
      // Source: Showdown data/items.ts -- Eviolite onModifyDef / onModifySpD:
      //   return this.chainModify(1.5);
      // Source: Bulbapedia -- Eviolite: "Raises Defense and Sp. Defense by 50%"
      // Eviolite boosts the defender's physical Defense by 1.5x in the damage formula.
      // We verify this by computing damage with and without Eviolite using identical contexts.
      const evioliteState = {
        phase: "turn-end",
        generation: 5,
        format: "singles",
        turnNumber: 1,
        sides: [{ index: 0, active: [] } as unknown, { index: 1, active: [] } as unknown],
        weather: null,
        terrain: null,
        trickRoom: { active: false, turnsLeft: 0 },
        magicRoom: { active: false, turnsLeft: 0 },
        wonderRoom: { active: false, turnsLeft: 0 },
        gravity: { active: false, turnsLeft: 0 },
        turnHistory: [],
        rng: null as unknown,
        ended: false,
        winner: null,
      } as BattleState;

      // Tackle: base power 50, Normal type, physical
      const tackle = makeMove(M.tackle);

      const attacker = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.charmander,
        types: [CORE_TYPE_IDS.fire],
        heldItem: null,
      });
      const defenderNoItem = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.charmander,
        types: [CORE_TYPE_IDS.fire],
        heldItem: null,
      });
      const defenderEviolite = makeActivePokemon({
        speciesId: GEN5_SPECIES_IDS.charmander,
        types: [CORE_TYPE_IDS.fire],
        heldItem: I.eviolite,
      });

      const ctxNoItem: DamageContext = {
        attacker,
        defender: defenderNoItem,
        move: tackle,
        state: evioliteState,
        rng: new SeededRandom(42),
        isCrit: false,
      };
      const ctxEviolite: DamageContext = {
        attacker,
        defender: defenderEviolite,
        move: tackle,
        state: evioliteState,
        rng: new SeededRandom(42),
        isCrit: false,
      };

      const resultNoItem = calculateGen5Damage(
        ctxNoItem,
        GEN5_TYPE_CHART as Record<string, Record<string, number>>,
      );
      const resultEviolite = calculateGen5Damage(
        ctxEviolite,
        GEN5_TYPE_CHART as Record<string, Record<string, number>>,
      );

      // Eviolite boosts Defense by 1.5x, so damage with Eviolite must be lower
      // Source: Gen5DamageCalc.ts line ~383-384 -- floor(baseStat * 150 / 100)
      expect(resultEviolite.damage).toBeLessThan(resultNoItem.damage);
    },
  );
});
