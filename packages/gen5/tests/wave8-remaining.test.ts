/**
 * Gen 5 Wave 8 -- Remaining mechanics tests.
 *
 * Tests for:
 *   - Venoshock: 2x base power when target is poisoned/badly-poisoned
 *   - Hex: 2x base power when target has any primary status
 *   - Clear Smog: resets target's stat stages to 0
 *   - Synchronoise: fails if no shared type between user and target
 *   - Chip Away / Sacred Sword: ignore target's defensive stat stages
 *   - Nature Power: calls Tri Attack in Gen 5
 *   - Multi-hit distribution: 35/35/15/15 (inherited from BaseRuleset)
 *
 * Source: Pokemon Showdown (primary authority for Gen 5)
 */

import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import {
  createOnFieldPokemon as createBattleOnFieldPokemon,
  createDefaultStatStages,
} from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
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
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { handleGen5CombatMove } from "../src/Gen5MoveEffectsCombat";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const itemIds = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS } as const;
const moveIds = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const;
const typeIds = CORE_TYPE_IDS;
const statusIds = CORE_STATUS_IDS;
const speciesIds = GEN5_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultNatureId = dataManager.getNature(GEN5_NATURE_IDS.hardy).id;
const DEFAULT_LEVEL = 50;
const DEFAULT_CONTEXT_SEED = 42;
const DEFAULT_TEST_STATS = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

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
  nature?: string;
  statStages?: Partial<Record<string, number>>;
  nickname?: string | null;
}): ActivePokemon {
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const hp = overrides.hp ?? DEFAULT_TEST_STATS.hp;
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(DEFAULT_CONTEXT_SEED),
    {
      nickname: overrides.nickname ?? null,
      nature: overrides.nature ?? defaultNatureId,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      friendship: createFriendship(species.baseFriendship),
      gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: itemIds.pokeBall,
    },
  );

  pokemon.uid = `test-${species.id}-${pokemon.level}`;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.status = (overrides.status ?? null) as typeof pokemon.status;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? DEFAULT_TEST_STATS.attack,
    defense: overrides.defense ?? DEFAULT_TEST_STATS.defense,
    spAttack: overrides.spAttack ?? DEFAULT_TEST_STATS.spAttack,
    spDefense: overrides.spDefense ?? DEFAULT_TEST_STATS.spDefense,
    speed: overrides.speed ?? DEFAULT_TEST_STATS.speed,
  };

  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    // Synthetic scenario default: neutral Normal typing unless the test opts into real typing.
    overrides.types ?? [typeIds.normal],
  );
  activePokemon.statStages = {
    ...createDefaultStatStages(),
    attack: overrides.statStages?.attack ?? 0,
    defense: overrides.statStages?.defense ?? 0,
    spAttack: overrides.statStages?.spAttack ?? 0,
    spDefense: overrides.statStages?.spDefense ?? 0,
    speed: overrides.statStages?.speed ?? 0,
    accuracy: overrides.statStages?.accuracy ?? 0,
    evasion: overrides.statStages?.evasion ?? 0,
  };
  return activePokemon;
}

function getCanonicalMove(id: string, overrides?: Partial<MoveData>): MoveData {
  const baseMove = dataManager.getMove(id);
  return {
    ...baseMove,
    ...overrides,
    id: baseMove.id,
    displayName: baseMove.displayName,
    flags: {
      ...baseMove.flags,
      ...overrides?.flags,
    },
  } as MoveData;
}

function createSyntheticMoveFrom(id: string, overrides: Partial<MoveData>): MoveData {
  return getCanonicalMove(id, overrides);
}

function createBattleState(overrides?: {
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
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
    rng: new SeededRandom(DEFAULT_CONTEXT_SEED),
  } as unknown as BattleState;
}

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? getCanonicalMove(moveIds.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? DEFAULT_CONTEXT_SEED),
    isCrit: overrides.isCrit ?? false,
  };
}

function createMoveEffectContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  damage?: number;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? getCanonicalMove(moveIds.tackle),
    state: overrides.state ?? createBattleState(),
    damage: overrides.damage ?? 0,
  } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Venoshock tests
// ---------------------------------------------------------------------------

describe("Venoshock base power doubling", () => {
  it("given target is poisoned, when Venoshock hits, then base power doubles from 65 to 130", () => {
    // Source: Showdown data/moves.ts -- venoshock onBasePower:
    //   if (target.status === 'psn' || target.status === 'tox') return this.chainModify(2)
    // Source: Bulbapedia -- "If the target is poisoned, Venoshock's base power doubles."
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.poison] });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100, status: statusIds.poison });
    const move = getCanonicalMove(moveIds.venoshock);

    const poisoned = calculateGen5Damage(
      createDamageContext({ attacker, defender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const healthyDefender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const normal = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Poisoned damage should be exactly 2x normal damage (base power doubles 65 -> 130)
    // Source: Showdown -- chainModify(2) is exact 2x multiplier in 4096-based system
    expect(poisoned.damage / normal.damage).toBeCloseTo(2, 0);
  });

  it("given target is badly-poisoned, when Venoshock hits, then base power doubles from 65 to 130", () => {
    // Source: Showdown data/moves.ts -- venoshock: checks 'tox' status too
    // Source: Bulbapedia -- badly poisoned counts as poisoned for Venoshock
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.poison] });
    const defender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      status: statusIds.badlyPoisoned,
    });
    const move = getCanonicalMove(moveIds.venoshock);

    const badlyPoisoned = calculateGen5Damage(
      createDamageContext({ attacker, defender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const healthyDefender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const normal = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    expect(badlyPoisoned.damage / normal.damage).toBeCloseTo(2, 0);
  });

  it("given target has paralysis (not poison), when Venoshock hits, then base power stays at 65", () => {
    // Source: Showdown data/moves.ts -- venoshock: no modifier if no psn/tox
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.poison] });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const move = getCanonicalMove(moveIds.venoshock);

    const result = calculateGen5Damage(
      createDamageContext({ attacker, defender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // With paralyzed target (non-poison status), should NOT double
    const paralyzedDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      status: statusIds.paralysis,
    });
    const paralyzed = calculateGen5Damage(
      createDamageContext({ attacker, defender: paralyzedDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Paralysis is NOT poison, so Venoshock should not double
    expect(paralyzed.damage).toBe(result.damage);
  });
});

// ---------------------------------------------------------------------------
// Hex tests
// ---------------------------------------------------------------------------

describe("Hex base power doubling", () => {
  it("given target is burned, when Hex hits, then base power doubles from 50 to 100", () => {
    // Source: Showdown data/moves.ts -- hex onBasePower:
    //   if (target.status || target.volatiles['comatose']) return this.chainModify(2)
    // Source: Bulbapedia -- "If the target has a major status condition, Hex's
    //   base power doubles."
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.ghost] });
    // Use Fire-type target to avoid Ghost immunity on Normal
    const healthyDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      types: [typeIds.fire],
    });
    const burnedFireDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      status: statusIds.burn,
      types: [typeIds.fire],
    });
    const move = getCanonicalMove(moveIds.hex);

    const normal = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const statusd = calculateGen5Damage(
      createDamageContext({ attacker, defender: burnedFireDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    expect(statusd.damage / normal.damage).toBeCloseTo(2, 0);
  });

  it("given target is paralyzed, when Hex hits, then base power doubles from 50 to 100", () => {
    // Source: Showdown data/moves.ts -- hex: any status triggers doubling
    // Source: Bulbapedia -- paralysis is a major status condition
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.ghost] });
    const healthyDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      types: [typeIds.fire],
    });
    const paralyzedDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      status: statusIds.paralysis,
      types: [typeIds.fire],
    });
    const move = getCanonicalMove(moveIds.hex);

    const normal = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const paralyzed = calculateGen5Damage(
      createDamageContext({ attacker, defender: paralyzedDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    expect(paralyzed.damage / normal.damage).toBeCloseTo(2, 0);
  });

  it("given target has no status, when Hex hits, then base power stays at 50", () => {
    // Source: Showdown data/moves.ts -- hex: no modifier without status
    const attacker = createSyntheticOnFieldPokemon({ spAttack: 100, types: [typeIds.ghost] });
    const healthyDefender = createSyntheticOnFieldPokemon({
      spDefense: 100,
      types: [typeIds.fire],
    });
    const move = getCanonicalMove(moveIds.hex);
    // Use a generic 50 BP Ghost move for comparison
    const genericGhost = createSyntheticMoveFrom(moveIds.shadowBall, {
      power: 50,
      flags: { contact: false },
    });

    const hexDmg = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const genericDmg = calculateGen5Damage(
      createDamageContext({ attacker, defender: healthyDefender, move: genericGhost, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Without status, Hex should deal the same damage as any 50 BP Ghost move
    expect(hexDmg.damage).toBe(genericDmg.damage);
  });
});

// ---------------------------------------------------------------------------
// Chip Away / Sacred Sword tests (ignore defense stages)
// ---------------------------------------------------------------------------

describe("Chip Away ignoring defense stages", () => {
  it("given defender has +2 Defense, when Chip Away hits, then defense stages are ignored", () => {
    // Source: Showdown data/moves.ts -- chipaway: { ignoreDefensive: true }
    // Source: Bulbapedia -- "Chip Away ignores the target's stat stage changes
    //   to Defense and Special Defense."
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, types: [typeIds.normal] });
    const boostedDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.fire],
      statStages: { defense: 2 },
    });
    const normalDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.fire],
      statStages: { defense: 0 },
    });
    const chipAway = getCanonicalMove(moveIds.chipAway);

    const vsBoosted = calculateGen5Damage(
      createDamageContext({ attacker, defender: boostedDefender, move: chipAway, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const vsNormal = calculateGen5Damage(
      createDamageContext({ attacker, defender: normalDefender, move: chipAway, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Chip Away should deal the same damage regardless of defense stages
    expect(vsBoosted.damage).toBe(vsNormal.damage);
  });

  it("given defender has -2 Defense, when Chip Away hits, then defense stage drop is also ignored", () => {
    // Source: Showdown data/moves.ts -- chipaway: ignoreDefensive means
    //   BOTH positive and negative defense stages are ignored
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, types: [typeIds.normal] });
    const droppedDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.fire],
      statStages: { defense: -2 },
    });
    const normalDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.fire],
      statStages: { defense: 0 },
    });
    const chipAway = getCanonicalMove(moveIds.chipAway);

    const vsDropped = calculateGen5Damage(
      createDamageContext({ attacker, defender: droppedDefender, move: chipAway, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const vsNormal = calculateGen5Damage(
      createDamageContext({ attacker, defender: normalDefender, move: chipAway, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Chip Away ignores both positive AND negative defense stages
    expect(vsDropped.damage).toBe(vsNormal.damage);
  });
});

describe("Sacred Sword ignoring defense stages", () => {
  it("given defender has +3 Defense, when Sacred Sword hits, then defense stages are ignored", () => {
    // Source: Showdown data/moves.ts -- sacredsword: { ignoreDefensive: true, ignoreEvasion: true }
    // Source: Bulbapedia -- "Sacred Sword ignores the target's stat stage changes
    //   to Defense, Special Defense, and evasion."
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, types: [typeIds.fighting] });
    const boostedDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.normal],
      statStages: { defense: 3 },
    });
    const normalDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.normal],
      statStages: { defense: 0 },
    });
    const sacredSword = getCanonicalMove(moveIds.sacredSword);

    const vsBoosted = calculateGen5Damage(
      createDamageContext({ attacker, defender: boostedDefender, move: sacredSword, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const vsNormal = calculateGen5Damage(
      createDamageContext({ attacker, defender: normalDefender, move: sacredSword, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Sacred Sword should deal the same damage regardless of defense stages
    expect(vsBoosted.damage).toBe(vsNormal.damage);
  });

  it("given a non-ignoring move vs +3 Defense, when it hits, then defense boost DOES reduce damage", () => {
    // Negative control: prove that a normal physical move IS affected by +3 Defense
    // Source: Showdown -- normal moves respect defense stages
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, types: [typeIds.fighting] });
    const boostedDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.normal],
      statStages: { defense: 3 },
    });
    const normalDefender = createSyntheticOnFieldPokemon({
      defense: 100,
      types: [typeIds.normal],
      statStages: { defense: 0 },
    });
    const closeCombat = getCanonicalMove(moveIds.closeCombat);

    const vsBoosted = calculateGen5Damage(
      createDamageContext({ attacker, defender: boostedDefender, move: closeCombat, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    const vsNormal = calculateGen5Damage(
      createDamageContext({ attacker, defender: normalDefender, move: closeCombat, seed: 1 }),
      GEN5_TYPE_CHART,
    );

    // Close Combat SHOULD be affected by the +3 Defense boost
    expect(vsBoosted.damage).toBeLessThan(vsNormal.damage);
  });
});

// ---------------------------------------------------------------------------
// Clear Smog tests (stat reset)
// ---------------------------------------------------------------------------

describe("Clear Smog stat reset", () => {
  it("given defender has +2 Attack and +1 Speed, when Clear Smog hits, then stat stages are reset", () => {
    // Source: Showdown data/moves.ts -- clearsmog:
    //   onHit(target) { target.clearBoosts(); }
    // Source: Bulbapedia -- "Clear Smog resets all of the target's stat stage
    //   changes to 0 upon dealing damage."
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.poison] });
    const defender = createSyntheticOnFieldPokemon({
      types: [typeIds.fire],
      statStages: { attack: 2, speed: 1 },
    });
    const clearSmog = getCanonicalMove(moveIds.clearSmog);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: clearSmog,
        damage: 30,
      }),
    );

    expect(result).not.toBeNull();
    // The result should signal stat stages reset on the defender
    expect(result!.statStagesReset).toEqual({ target: "defender" });
    expect(result!.messages).toEqual(["The target's stat changes were removed!"]);
  });

  it("given defender has no stat changes, when Clear Smog hits, then still signals reset (no-op but valid)", () => {
    // Source: Showdown data/moves.ts -- clearsmog: always calls clearBoosts,
    //   even if there are no boosts to clear (no failure condition on boosts)
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.poison] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.fire] });
    const clearSmog = getCanonicalMove(moveIds.clearSmog);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: clearSmog,
        damage: 30,
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.statStagesReset).toEqual({ target: "defender" });
  });
});

// ---------------------------------------------------------------------------
// Synchronoise tests (type-match check)
// ---------------------------------------------------------------------------

describe("Synchronoise type-match check", () => {
  it("given user and target share a type (both Psychic), when Synchronoise is used, then returns null (normal damage)", () => {
    // Source: Showdown data/moves.ts -- synchronoise:
    //   onTryHit(target, source) { if (target.hasType(source.getTypes())) return; return false; }
    // Source: Bulbapedia -- "Synchronoise only hits targets that share a type with the user."
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.psychic] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.psychic, typeIds.flying] });
    const synchronoise = getCanonicalMove(moveIds.synchronoise);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: synchronoise,
      }),
    );

    // Should return null (let normal damage calc handle it)
    expect(result).toBeNull();
  });

  it("given user and target share no types, when Synchronoise is used, then move fails", () => {
    // Source: Showdown data/moves.ts -- synchronoise: returns false if no shared type
    // Source: Bulbapedia -- "If the target does not share a type with the user,
    //   the move fails."
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.psychic] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.fire] });
    const synchronoise = getCanonicalMove(moveIds.synchronoise);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: synchronoise,
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.messages).toContain("But it failed!");
    // customDamage should signal 0 damage
    expect(result!.customDamage?.amount).toBe(0);
  });

  it("given dual-type user shares second type with target, when Synchronoise is used, then succeeds", () => {
    // Source: Showdown -- hasType checks all of the source's types against target's types
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.psychic, typeIds.fire] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.fire, typeIds.rock] });
    const synchronoise = getCanonicalMove(moveIds.synchronoise);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: synchronoise,
      }),
    );

    // Fire is shared -- should succeed (return null for normal damage calc)
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nature Power tests
// ---------------------------------------------------------------------------

describe("Nature Power in Gen 5", () => {
  it("given Gen 5 standard battle (no terrain), when Nature Power is used, then calls Tri Attack", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- naturepower:
    //   onTryHit(target, pokemon) { this.actions.useMove('triattack', pokemon, target); }
    // Source: Bulbapedia -- "In Generation V, Nature Power becomes Tri Attack
    //   in a standard battle."
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.grass] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.fire] });
    const naturePower = getCanonicalMove(moveIds.naturePower);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: naturePower,
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.recursiveMove).toBe(moveIds.triAttack);
    expect(result!.messages).toContain("Nature Power turned into Tri Attack!");
  });

  it(`given Nature Power calls ${moveIds.triAttack}, when resolved, then the recursive move ID matches the owned move constant`, () => {
    // Source: Showdown data/mods/gen5/moves.ts -- naturepower uses 'triattack'
    // Our move ids use kebab-case, so the recursive id matches the owned Tri Attack constant.
    const attacker = createSyntheticOnFieldPokemon({ types: [typeIds.normal] });
    const defender = createSyntheticOnFieldPokemon({ types: [typeIds.water] });
    const naturePower = getCanonicalMove(moveIds.naturePower);

    const result = handleGen5CombatMove(
      createMoveEffectContext({
        attacker,
        defender,
        move: naturePower,
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.recursiveMove).toBe(moveIds.triAttack);
  });
});

// ---------------------------------------------------------------------------
// Multi-hit distribution tests (35/35/15/15, inherited from BaseRuleset)
// ---------------------------------------------------------------------------

describe("Gen 5 multi-hit distribution (35/35/15/15)", () => {
  it("given Gen5Ruleset, when rolling multi-hit 1000 times, then distribution matches 35/35/15/15", () => {
    // Source: Showdown sim/battle-actions.ts lines 865-867:
    //   if (this.battle.gen >= 5) uses [2,2,2,2,2,2,2,3,3,3,3,3,3,3,4,4,4,5,5,5]
    //   = 7/20 each for 2 and 3, 3/20 each for 4 and 5
    //   = 35% 2-hits, 35% 3-hits, 15% 4-hits, 15% 5-hits
    const ruleset = new Gen5Ruleset();
    const rng = new SeededRandom(12345);
    const attacker = createSyntheticOnFieldPokemon({});
    const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };

    for (let i = 0; i < 1000; i++) {
      const hits = ruleset.rollMultiHitCount(attacker, rng);
      counts[hits]++;
    }

    // With 1000 samples, expect distributions within reasonable tolerance
    // 35% = 350 +/- 70; 15% = 150 +/- 60
    expect(counts[2]).toBeGreaterThan(280);
    expect(counts[2]).toBeLessThan(420);
    expect(counts[3]).toBeGreaterThan(280);
    expect(counts[3]).toBeLessThan(420);
    expect(counts[4]).toBeGreaterThan(90);
    expect(counts[4]).toBeLessThan(210);
    expect(counts[5]).toBeGreaterThan(90);
    expect(counts[5]).toBeLessThan(210);
  });

  it("given Skill Link ability, when rolling multi-hit, then always returns 5", () => {
    // Source: Showdown data/abilities.ts -- Skill Link: multi-hit moves always hit 5 times
    // Source: Bulbapedia -- "Multi-hit moves will always hit the maximum number of times."
    const ruleset = new Gen5Ruleset();
    const rng = new SeededRandom(42);
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.skillLink });

    for (let i = 0; i < 10; i++) {
      expect(ruleset.rollMultiHitCount(attacker, rng)).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Protect formula (2^N doubling, capped at 256)
// ---------------------------------------------------------------------------

describe("Gen 5 Protect consecutive use formula", () => {
  it("given 0 consecutive protects, when rolling, then always succeeds", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- stall: first use always succeeds
    const ruleset = new Gen5Ruleset();
    const rng = new SeededRandom(42);

    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given 1 consecutive protect, when rolling, then success rate is 1/2", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- stall:
    //   counter starts at 2, success = randomChance(1, counter)
    //   After 1 success: counter = 2, chance = 1/2
    // With 1000 trials, roughly 50% should succeed
    const ruleset = new Gen5Ruleset();
    let successes = 0;
    for (let i = 0; i < 1000; i++) {
      const rng = new SeededRandom(i);
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    // 50% = 500 +/- 80
    expect(successes).toBeGreaterThan(400);
    expect(successes).toBeLessThan(600);
  });

  it("given 8 consecutive protects, when rolling, then success rate is 1/256", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- stall:
    //   counter = 2^8 = 256, chance = 1/256 (cap)
    const ruleset = new Gen5Ruleset();
    let successes = 0;
    for (let i = 0; i < 5000; i++) {
      const rng = new SeededRandom(i);
      if (ruleset.rollProtectSuccess(8, rng)) successes++;
    }
    // 1/256 ~ 0.39%, so from 5000 trials ~19-20 successes
    // Allow broad range since PRNG variance is high at low probability
    expect(successes).toBeLessThan(100); // Far less than 2% threshold
  });
});
