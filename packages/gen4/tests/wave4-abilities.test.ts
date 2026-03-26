import type {
  AbilityContext,
  BattleSide,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  Gender,
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
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
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { canInflictGen4Status, executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Wave 4 — Status/Utility Ability Tests
 *
 * Tests for: Leaf Guard, Storm Drain, Klutz, Suction Cups, Stench,
 *            Anticipation (fix), Forewarn (fix)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const itemIds = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const moveIds = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const triggerIds = CORE_ABILITY_TRIGGER_IDS;
const itemTriggerIds = CORE_ITEM_TRIGGER_IDS;
const speciesIds = GEN4_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.pikachu);
const defaultMove = dataManager.getMove(moveIds.tackle);
const DEFAULT_TYPES: PokemonType[] = [typeIds.normal];
const GRASS_TYPES: PokemonType[] = [typeIds.grass];
const WATER_TYPES: PokemonType[] = [typeIds.water];
const GROUND_TYPES: PokemonType[] = [typeIds.ground];
const ROCK_TYPES: PokemonType[] = [typeIds.rock];
const FIRE_TYPES: PokemonType[] = [typeIds.fire];

type TestStatus = PrimaryStatus | null;
type TestMoveSlot = { moveId: string; currentPP: number; maxPP: number; ppUps: number };

function createCanonicalMoveSlot(moveId: (typeof moveIds)[keyof typeof moveIds]): TestMoveSlot {
  const move = dataManager.getMove(moveId);
  return createMoveSlot(move.id, move.pp) as TestMoveSlot;
}

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: TestMoveSlot[];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(4 + species.id), {
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
    moves: overrides.moves?.map((move) => move.moveId) ?? [defaultMove.id],
  });
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.moves = overrides.moves ?? [];
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };
  return pokemon;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: TestMoveSlot[];
}) {
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    speciesId: overrides.speciesId,
    nickname: overrides.nickname,
    status: overrides.status,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    heldItem: overrides.heldItem,
    defense: overrides.defense,
    spDefense: overrides.spDefense,
    attack: overrides.attack,
    spAttack: overrides.spAttack,
    speed: overrides.speed,
    gender: overrides.gender,
    moves: overrides.moves,
  });
  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  activePokemon.ability = overrides.ability ?? abilityIds.none;
  return {
    ...activePokemon,
    types: overrides.types ?? [...(species.types as PokemonType[])],
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
  return {
    index,
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
  };
}

function createBattleState(weather?: {
  type: WeatherType;
  turnsLeft: number;
  source: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: weather ?? null,
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
  } as unknown as BattleState;
}

function createCanonicalMove(moveId: (typeof moveIds)[keyof typeof moveIds]): MoveData {
  return dataManager.getMove(moveId);
}

function createAbilityContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  weather?: { type: WeatherType; turnsLeft: number; source: string };
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  rngNextValues?: number[];
  rngChance?: boolean;
  move?: MoveData;
  trigger?: (typeof triggerIds)[keyof typeof triggerIds];
}): AbilityContext {
  const state = createBattleState(opts.weather);
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger ?? triggerIds.onSwitchIn,
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ---------------------------------------------------------------------------
// Leaf Guard
// ---------------------------------------------------------------------------

describe("Leaf Guard — prevent all status in sun", () => {
  it("given Leaf Guard in sun, when status infliction attempted, then status blocked", () => {
    // Source: Bulbapedia — Leaf Guard: "Prevents status conditions in sunny weather"
    // Source: Showdown data/abilities.ts — Leaf Guard onSetStatus
    const target = createOnFieldPokemon({ ability: abilityIds.leafGuard, types: GRASS_TYPES });
    const state = createBattleState({
      type: weatherIds.sun,
      turnsLeft: -1,
      source: abilityIds.drought,
    });

    const result = canInflictGen4Status(statusIds.paralysis, target, state);

    expect(result).toBe(false);
  });

  it("given Leaf Guard NOT in sun, when status infliction attempted, then status applied normally", () => {
    // Source: Bulbapedia — Leaf Guard only activates in harsh sunlight
    const target = createOnFieldPokemon({ ability: abilityIds.leafGuard, types: GRASS_TYPES });
    const state = createBattleState({
      type: weatherIds.rain,
      turnsLeft: 5,
      source: abilityIds.drizzle,
    });

    const result = canInflictGen4Status(statusIds.paralysis, target, state);

    expect(result).toBe(true);
  });

  it("given no Leaf Guard in sun, when status infliction attempted, then status applied normally", () => {
    // Triangulation: confirm Leaf Guard is ability-specific, not weather-only
    const target = createOnFieldPokemon({ ability: abilityIds.overgrow, types: GRASS_TYPES });
    const state = createBattleState({
      type: weatherIds.sun,
      turnsLeft: -1,
      source: abilityIds.drought,
    });

    const result = canInflictGen4Status(statusIds.paralysis, target, state);

    expect(result).toBe(true);
  });

  it("given Leaf Guard in sun, when burn attempted, then burn also blocked", () => {
    // Source: Bulbapedia — Leaf Guard blocks ALL primary status conditions in sun
    const target = createOnFieldPokemon({ ability: abilityIds.leafGuard, types: GRASS_TYPES });
    const state = createBattleState({
      type: weatherIds.sun,
      turnsLeft: -1,
      source: abilityIds.drought,
    });

    const result = canInflictGen4Status(statusIds.burn, target, state);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storm Drain
// ---------------------------------------------------------------------------

describe("Storm Drain — Gen 4: redirect-only in doubles, no singles immunity", () => {
  it("given Storm Drain, when hit by Water move in singles, then damage is NOT blocked (no immunity in Gen 4)", () => {
    // Source: Bulbapedia — Storm Drain (Generation IV): "Draws all single-target Water-type
    //   moves to this Pokemon. Has no effect in single battles."
    // Source: Showdown Gen 4 mod — Storm Drain is doubles-redirect only; no Water immunity
    //
    // Bug #350/#351: Previous behavior granted Water immunity + SpAtk boost (Gen 5+).
    // Gen 4 Storm Drain does nothing in singles — Water moves deal normal damage.
    const attacker = createOnFieldPokemon({ types: WATER_TYPES, spAttack: 100 });
    const defender = createOnFieldPokemon({ ability: abilityIds.stormDrain, types: GROUND_TYPES });
    const move = createCanonicalMove(moveIds.surf);
    const state = createBattleState();

    const damageResult = calculateGen4Damage(
      {
        attacker,
        defender,
        move,
        state,
        rng: { next: () => 0.5, int: () => 100, chance: () => false } as any,
        isCrit: false,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // In Gen 4 singles, Storm Drain does NOT grant Water immunity — Water deals normal damage.
    // Derivation: level=50, spAtk=100, spDef=100, power=95, Water vs Ground = 2x (super effective)
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDamage = floor(floor((22*95*100)/100)/50) = floor(2090/50) = 41
    //   +2 = 43; random=100 → floor(43*1.0)=43; STAB (water/water) 1.5x → floor(64.5)=64
    //   effectiveness 2.0 → floor(64*2) = 128; no items → 128
    // Source: Bulbapedia — Storm Drain (Gen 4): "Has no effect in single battles."
    // Source: Gen 4 type chart — Water is super effective against Ground (2x)
    expect(damageResult.damage).toBe(128);
    expect(damageResult.effectiveness).toBe(2);
  });

  it("given Storm Drain, when passive-immunity is checked for Water move in singles, then ability does not activate", () => {
    // Source: Bulbapedia — Storm Drain (Gen 4): no effect in singles
    // Triangulation: passive-immunity must return not-activated for Water moves
    const ctx = createAbilityContext({
      ability: abilityIds.stormDrain,
      types: GROUND_TYPES,
      trigger: triggerIds.passiveImmunity,
      move: createCanonicalMove(moveIds.surf),
    });
    const result = applyGen4Ability(triggerIds.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Storm Drain, when hit by non-Water move, then ability does not activate", () => {
    // Triangulation: Storm Drain also does nothing against non-Water moves
    const ctx = createAbilityContext({
      ability: abilityIds.stormDrain,
      types: GROUND_TYPES,
      trigger: triggerIds.passiveImmunity,
      move: createCanonicalMove(moveIds.flamethrower),
    });
    const result = applyGen4Ability(triggerIds.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Klutz
// ---------------------------------------------------------------------------

describe("Klutz — held item has no effect", () => {
  it("given Klutz holding Choice Scarf, when getEffectiveSpeed called (via damage calc item check), then Choice Band does not boost attack", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates item modifiers
    // Test via damage calc: Choice Band should NOT boost attack when holder has Klutz
    const attacker = createOnFieldPokemon({
      ability: abilityIds.klutz,
      types: DEFAULT_TYPES,
      heldItem: itemIds.choiceBand,
      attack: 100,
    });
    const attackerNoKlutz = createOnFieldPokemon({
      ability: abilityIds.intimidate,
      types: DEFAULT_TYPES,
      heldItem: itemIds.choiceBand,
      attack: 100,
    });
    const defender = createOnFieldPokemon({ types: DEFAULT_TYPES, defense: 100 });
    const move = createCanonicalMove(moveIds.tackle);
    const state = createBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Choice Band 1.5x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });

  it("given Klutz holding Sitrus Berry, when item trigger fires, then Sitrus Berry does NOT heal", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.klutz,
      heldItem: itemIds.sitrusBerry,
      currentHp: 50,
      maxHp: 200,
    });
    const state = createBattleState();

    const result = applyGen4HeldItem(itemTriggerIds.endOfTurn, {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(false);
  });

  it("given no Klutz holding Sitrus Berry, when HP drops to 50% at end of turn, then Sitrus Berry DOES heal", () => {
    // Triangulation: without Klutz, Sitrus Berry activates normally
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.overgrow,
      heldItem: itemIds.sitrusBerry,
      currentHp: 50,
      maxHp: 200,
    });
    const state = createBattleState();

    const result = applyGen4HeldItem(itemTriggerIds.endOfTurn, {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "heal", value: 50 })]),
    );
  });

  it("given Klutz holding Life Orb, when damage calc runs, then Life Orb 1.3x boost is NOT applied", () => {
    // Source: Showdown data/abilities.ts — Klutz gates all item damage modifiers
    const attacker = createOnFieldPokemon({
      ability: abilityIds.klutz,
      types: DEFAULT_TYPES,
      heldItem: itemIds.lifeOrb,
      attack: 100,
    });
    const attackerNoKlutz = createOnFieldPokemon({
      ability: abilityIds.intimidate,
      types: DEFAULT_TYPES,
      heldItem: itemIds.lifeOrb,
      attack: 100,
    });
    const defender = createOnFieldPokemon({ types: DEFAULT_TYPES, defense: 100 });
    const move = createCanonicalMove(moveIds.tackle);
    const state = createBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Life Orb 1.3x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });
});

// ---------------------------------------------------------------------------
// Suction Cups
// ---------------------------------------------------------------------------

describe("Suction Cups — prevent forced switching", () => {
  it("given Suction Cups defender, when Whirlwind is used, then forced switch is prevented", () => {
    // Source: Bulbapedia — Suction Cups: "Prevents the Pokemon from being forced to switch out"
    // Source: Showdown data/abilities.ts — Suction Cups onDragOut
    const attacker = createOnFieldPokemon({ types: DEFAULT_TYPES });
    const defender = createOnFieldPokemon({ ability: abilityIds.suctionCups, types: ROCK_TYPES });
    const move = createCanonicalMove(moveIds.whirlwind);
    const state = createBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should NOT happen
    expect(result.switchOut).toBe(false);
    // Message should mention Suction Cups
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });

  it("given no Suction Cups, when Whirlwind is used, then forced switch succeeds", () => {
    // Triangulation: without Suction Cups, Whirlwind forces switch
    const attacker = createOnFieldPokemon({ types: DEFAULT_TYPES });
    const defender = createOnFieldPokemon({ ability: abilityIds.sturdy, types: ROCK_TYPES });
    const move = createCanonicalMove(moveIds.whirlwind);
    const state = createBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should happen
    expect(result.switchOut).toBe(true);
  });

  it("given Suction Cups defender, when Roar is used, then forced switch is also prevented", () => {
    // Source: Showdown — Suction Cups blocks both Whirlwind and Roar
    const attacker = createOnFieldPokemon({ types: DEFAULT_TYPES });
    const defender = createOnFieldPokemon({ ability: abilityIds.suctionCups, types: ROCK_TYPES });
    const move = createCanonicalMove(moveIds.roar);
    const state = createBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    expect(result.switchOut).toBe(false);
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stench
// ---------------------------------------------------------------------------

describe("Stench — Gen 4: no battle effect (flinch is Gen 5+)", () => {
  it("given Stench and RNG < 0.1 (guaranteed flinch check), when on-after-move-hit triggers, then flinch is NOT applied (Stench has no Gen 4 battle effect)", () => {
    // Source: Bulbapedia — Stench (Generation IV): "Has no effect in battle."
    //   The 10% flinch chance was introduced in Generation volatileIds.
    // Source: Showdown — Stench onModifyMove flinch only in Gen 5+ scripts
    //
    // Bug #384: Previous code gave Stench a 10% flinch chance (Gen 5+ behavior).
    // In Gen 4, Stench only reduces wild encounter rate in the overworld.
    const ctx = createAbilityContext({
      ability: abilityIds.stench,
      trigger: triggerIds.onAfterMoveHit,
      rngNextValues: [0.05], // < 0.1 threshold (would trigger Gen 5+ flinch if bug present)
    });

    const result = applyGen4Ability(triggerIds.onAfterMoveHit, ctx);

    expect(result.activated).toBe(false);
    const flinchEffect = result.effects.find(
      (e) =>
        e.effectType === "volatile-inflict" && "volatile" in e && e.volatile === volatileIds.flinch,
    );
    expect(flinchEffect).toBeUndefined();
  });

  it("given Stench with any RNG value, when on-after-move-hit triggers, then no flinch is applied (battle-inert in Gen 4)", () => {
    // Triangulation: Stench is always no-op in Gen 4, regardless of RNG
    const ctx = createAbilityContext({
      ability: abilityIds.stench,
      trigger: triggerIds.onAfterMoveHit,
      rngNextValues: [0.5],
    });

    const result = applyGen4Ability(triggerIds.onAfterMoveHit, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Anticipation
// ---------------------------------------------------------------------------

describe("Anticipation — scan opponent moveset for SE/OHKO moves", () => {
  it("given foe has a SE move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation: warns if foe has SE or OHKO move
    // Source: Showdown data/abilities.ts — Anticipation onStart
    const opponent = createOnFieldPokemon({
      types: FIRE_TYPES,
      moves: [createCanonicalMoveSlot(moveIds.flamethrower)],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.anticipation,
      types: GRASS_TYPES, // Fire is SE against Grass
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });

  it("given foe has only neutral/resisted moves, when Pokemon with Anticipation switches in, then no activation", () => {
    // Triangulation: Anticipation should NOT trigger for neutral/resisted moves
    const opponent = createOnFieldPokemon({
      types: DEFAULT_TYPES,
      moves: [createCanonicalMoveSlot(moveIds.tackle)],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.anticipation,
      types: DEFAULT_TYPES, // Normal is neutral against Normal
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(false);
  });

  it("given foe has an OHKO move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation triggers for OHKO moves regardless of type
    const opponent = createOnFieldPokemon({
      types: GROUND_TYPES,
      moves: [createCanonicalMoveSlot(moveIds.fissure)],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.anticipation,
      types: [typeIds.steel], // Ground is SE against Steel, but OHKO should trigger regardless
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });
});

// ---------------------------------------------------------------------------
// Forewarn
// ---------------------------------------------------------------------------

describe("Forewarn — identify strongest move by base power", () => {
  it("given foe has moves of varying power, when Pokemon with Forewarn switches in, then strongest move is revealed", () => {
    // Source: Bulbapedia — Forewarn: reveals opponent's highest base power move
    // Source: Showdown data/abilities.ts — Forewarn onStart
    const opponent = createOnFieldPokemon({
      types: FIRE_TYPES,
      moves: [createCanonicalMoveSlot(moveIds.ember), createCanonicalMoveSlot(moveIds.fireBlast)],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.forewarn,
      types: GRASS_TYPES,
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention the strongest move (Fire Blast, 110 BP)
    expect(result.messages[0]).toContain("Fire Blast");
  });

  it("given foe has an OHKO move, when Pokemon with Forewarn switches in, then OHKO move treated as 160 BP (revealed as strongest)", () => {
    // Source: Bulbapedia — Forewarn counts OHKO moves as BP 160
    const opponent = createOnFieldPokemon({
      types: GROUND_TYPES,
      moves: [
        createCanonicalMoveSlot(moveIds.earthquake),
        createCanonicalMoveSlot(moveIds.fissure),
      ],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.forewarn,
      types: [typeIds.steel],
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention Fissure (treated as 160 BP, > Earthquake's 100 BP)
    expect(result.messages[0]).toContain("Fissure");
  });

  it("given foe has no moves with power, when Pokemon with Forewarn switches in, then no activation", () => {
    // Edge case: foe with only status moves (no base power)
    const opponent = createOnFieldPokemon({
      types: [typeIds.psychic],
      moves: [createCanonicalMoveSlot(moveIds.thunderWave)],
    });

    const ctx = createAbilityContext({
      ability: abilityIds.forewarn,
      types: DEFAULT_TYPES,
      opponent,
    });

    const result = applyGen4Ability(triggerIds.onSwitchIn, ctx, dataManager);

    expect(result.activated).toBe(false);
  });
});
