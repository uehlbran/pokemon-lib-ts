import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  createPokemonInstance,
  NEUTRAL_NATURES,
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
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

/**
 * Gen 4 Wrong-Gen Mechanics Bug Fix Tests
 *
 * Covers bugs where Gen 5+ mechanics were incorrectly applied to Gen 4:
 *   #354: Sleep wake turn — Pokemon CAN act on wake turn (Gen 3-4 behavior)
 *   #384: Stench has no battle effect in Gen 4 (flinch is Gen 5+)
 *   #350/#351: Storm Drain — redirect-only in doubles, no immunity or SpAtk boost in singles
 *   #353: Thick Fat halves BASE POWER, not the attacker's stat
 *   #358: Metronome item uses 0.1x step and 1.5x cap (not Gen 5+ 0.2x / 2.0x)
 *   #377: Teravolt/Turboblaze are Gen 5 abilities — removed from Gen 4 damage calc
 *
 * Sources:
 *   - Showdown Gen 4 mod — primary reference for Gen 4 mechanics
 *   - Bulbapedia — Stench (Gen 4): "Has no effect in battle"
 *   - Bulbapedia — Storm Drain (Gen 4): redirect in doubles only
 *   - specs/battle/05-gen4.md line 531 — "if counter reaches 0, Pokemon wakes and acts normally"
 */

const gen4Data = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = GEN4_ITEM_IDS;
const MOVES = GEN4_MOVE_IDS;
const SPECIES = GEN4_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN4_NATURE_IDS.hardy;
const DEFAULT_MOVE = gen4Data.getMove(CORE_MOVE_IDS.tackle);
const DEFAULT_SPECIES = gen4Data.getSpecies(SPECIES.bidoof);
const DEFAULT_LEVEL = 50;
const DEFAULT_ABILITY = ABILITIES.none;
const METRONOME_COUNT_VOLATILE = "metronome-count";

// No canonical Gen 4 move is exactly 90 BP Fire physical, so this stays synthetic on purpose.
const SYNTHETIC_FIRE_90_PHYSICAL_MOVE = createSyntheticMoveFrom(MOVES.strength, {
  id: "synthetic-fire-90-physical",
  displayName: "Synthetic Fire 90 Physical",
  type: TYPES.fire,
  power: 90,
  category: "physical",
});

// No canonical Gen 4 move is exactly 60 BP Ice special, so this stays synthetic on purpose.
const SYNTHETIC_ICE_60_SPECIAL_MOVE = createSyntheticMoveFrom(MOVES.iceBeam, {
  id: "synthetic-ice-60-special",
  displayName: "Synthetic Ice 60 Special",
  type: TYPES.ice,
  power: 60,
  category: "special",
});

// No canonical Gen 4 move is exactly 80 BP Fire physical, so this stays synthetic on purpose.
const SYNTHETIC_FIRE_80_PHYSICAL_MOVE = createSyntheticMoveFrom(MOVES.strength, {
  id: "synthetic-fire-80-physical",
  displayName: "Synthetic Fire 80 Physical",
  type: TYPES.fire,
  power: 80,
  category: "physical",
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(gen4Data);
}

function createScenarioPokemonInstance(overrides: {
  maxHp?: number;
  ability?: string;
  heldItem?: string | null;
  primaryStatus?: PrimaryStatus | null;
  level?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const pokemon = createPokemonInstance(
    DEFAULT_SPECIES,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(0),
    {
      nature: DEFAULT_NATURE,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      moves: [DEFAULT_MOVE.id],
      heldItem: overrides.heldItem ?? null,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "test",
      originalTrainer: "test",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
    },
  );

  pokemon.moves = [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)];
  pokemon.currentHp = maxHp;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.primaryStatus ?? null;
  pokemon.ability = overrides.ability ?? DEFAULT_ABILITY;
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
  maxHp?: number;
  ability?: string;
  heldItem?: string | null;
  primaryStatus?: PrimaryStatus | null;
  types?: PokemonType[];
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: 100,
  };
  const pokemon = createScenarioPokemonInstance({
    maxHp,
    ability: overrides.ability,
    heldItem: overrides.heldItem,
    primaryStatus: overrides.primaryStatus,
    level: overrides.level,
  });
  pokemon.calculatedStats = stats;

  return {
    pokemon,
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
    volatileStatuses: new Map(),
    types: overrides.types ?? [...DEFAULT_SPECIES.types],
    ability: overrides.ability ?? DEFAULT_ABILITY,
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

function createCanonicalMove(moveId: string): MoveData {
  return gen4Data.getMove(moveId);
}

function createSyntheticMoveFrom(
  baseMoveId: string,
  overrides: Pick<MoveData, "id" | "displayName" | "type" | "power" | "category"> &
    Partial<MoveData>,
): MoveData {
  const baseMove = createCanonicalMove(baseMoveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides.effect ?? baseMove.effect,
  } as MoveData;
}

function createMockRng(nextReturnValue = 0.5) {
  return {
    next: () => nextReturnValue,
    int: (_min: number, _max: number) => 100,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** All-neutral type chart for 17 Gen 4 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    TYPES.normal,
    TYPES.fire,
    TYPES.water,
    TYPES.electric,
    TYPES.grass,
    TYPES.ice,
    TYPES.fighting,
    TYPES.poison,
    TYPES.ground,
    TYPES.flying,
    TYPES.psychic,
    TYPES.bug,
    TYPES.rock,
    TYPES.ghost,
    TYPES.dragon,
    TYPES.dark,
    TYPES.steel,
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
    rng: opts.rng ?? createMockRng(),
    state: { weather: opts.weather ?? null } as DamageContext["state"],
  } as DamageContext;
}

const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// Bug #354: Sleep — Pokemon CAN act on wake turn (Gen 3-4 behavior)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset processSleepTurn — Bug #354 wake-turn behavior", () => {
  it("given a sleeping Pokemon with sleep counter at 1, when processSleepTurn is called, then Pokemon wakes and returns true (can act on wake turn)", () => {
    // Source: specs/battle/05-gen4.md line 531 —
    //   "Counter decrements at start of turn before action selection;
    //    if counter reaches 0, Pokemon wakes and acts normally that turn"
    // Source: Showdown Gen 4 mod — BaseRuleset.processSleepTurn returns true on wake
    // This is the CORRECTED Gen 4 behavior: can act on wake turn (unlike Gen 1-2)
    const ruleset = createRuleset();
    const mon = createOnFieldPokemon({ primaryStatus: STATUSES.sleep });
    mon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 1 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has(VOLATILES.sleepCounter)).toBe(false);
  });

  it("given a sleeping Pokemon with sleep counter already at 0, when processSleepTurn is called, then Pokemon wakes and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — waking Pokemon can act normally
    // Counter at 0 means already expired — wake immediately, return true
    const ruleset = createRuleset();
    const mon = createOnFieldPokemon({ primaryStatus: STATUSES.sleep });
    mon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 0 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
  });

  it("given a sleeping Pokemon with sleep counter at 3, when processSleepTurn is called, then counter decrements and Pokemon remains asleep (cannot act)", () => {
    // Source: specs/battle/05-gen4.md — sleep counter > 0 after decrement: still sleeping
    // Must return false when still asleep (not yet waking)
    const ruleset = createRuleset();
    const mon = createOnFieldPokemon({ primaryStatus: STATUSES.sleep });
    mon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 3 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(false);
    expect(mon.pokemon.status).toBe(STATUSES.sleep);
    expect(mon.volatileStatuses.get(VOLATILES.sleepCounter)?.turnsLeft).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Bug #384: Stench — no battle effect in Gen 4 (flinch is Gen 5+)
// ---------------------------------------------------------------------------

describe("Gen4Abilities on-after-move-hit Stench — Bug #384 Gen 4 has no flinch", () => {
  it("given a Pokemon with Stench ability, when on-after-move-hit triggers, then flinch is not applied (Stench has no battle effect in Gen 4)", () => {
    // Source: Bulbapedia — Stench (Generation IV): "Has no effect in battle."
    //   The 10% flinch effect was introduced in Generation V.
    // Source: Showdown — Stench onModifyMove flinch chance only exists in Gen 5+
    const attacker = createOnFieldPokemon({ ability: ABILITIES.stench });
    const defender = createOnFieldPokemon({ ability: ABILITIES.none });

    const context = {
      pokemon: attacker,
      opponent: defender,
      rng: createMockRng(0), // next() = 0 = always passes any probability check
      state: STUB_STATE,
      moveType: TYPES.normal,
    };

    const result = applyGen4Ability(CORE_ABILITY_TRIGGER_IDS.onAfterMoveHit, context);

    // Must not apply flinch
    expect(result.activated).toBe(false);
    const flinchEffect = result.effects.find(
      (e) =>
        e.effectType === "volatile-inflict" && "volatile" in e && e.volatile === VOLATILES.flinch,
    );
    expect(flinchEffect).toBeUndefined();
  });

  it("given a Pokemon with Stench ability and rng.next() = 0 (guaranteed hit), when on-after-move-hit triggers, then still no flinch is applied", () => {
    // Source: Bulbapedia — Stench (Gen 4): no battle effect regardless of RNG outcome
    // Second test case: confirm no flinch even when RNG would guarantee the effect
    const attacker = createOnFieldPokemon({ ability: ABILITIES.stench });
    const defender = createOnFieldPokemon({ ability: ABILITIES.none });

    const context = {
      pokemon: attacker,
      opponent: defender,
      rng: { ...createMockRng(0), next: () => 0 }, // 0 < 0.1, would trigger if Gen 5 logic
      state: STUB_STATE,
      moveType: TYPES.normal,
    };

    const result = applyGen4Ability(CORE_ABILITY_TRIGGER_IDS.onAfterMoveHit, context);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bug #350/#351: Storm Drain — no immunity in Gen 4 singles
// ---------------------------------------------------------------------------

describe("Gen4Abilities passive-immunity Storm Drain — Bug #350/#351 no Water immunity in singles", () => {
  it("given a Pokemon with Storm Drain, when a Water-type move is used in singles, then the move is not blocked (no immunity)", () => {
    // Source: Bulbapedia — Storm Drain (Generation IV): "Draws all single-target Water-type moves
    //   to this Pokemon. Has no effect in single battles."
    // Source: Showdown Gen 4 mod — Storm Drain is redirect-only in doubles;
    //   in singles there is no Water immunity and no SpAtk boost
    const defender = createOnFieldPokemon({ ability: ABILITIES.stormDrain });
    const attacker = createOnFieldPokemon({ ability: ABILITIES.none });

    const context = {
      pokemon: defender,
      opponent: attacker,
      rng: createMockRng(),
      state: STUB_STATE,
      moveType: TYPES.water,
    };

    const result = applyGen4Ability(CORE_ABILITY_TRIGGER_IDS.passiveImmunity, context);

    // In Gen 4 singles, Storm Drain must NOT grant immunity (activated = false)
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Storm Drain, when a non-Water-type move is used, then no immunity activates (regardless of type)", () => {
    // Source: Showdown Gen 4 mod — Storm Drain only attempted to redirect Water moves
    // Control case: confirm non-Water moves are also not blocked
    const defender = createOnFieldPokemon({ ability: ABILITIES.stormDrain });
    const attacker = createOnFieldPokemon({ ability: ABILITIES.none });

    const context = {
      pokemon: defender,
      opponent: attacker,
      rng: createMockRng(),
      state: STUB_STATE,
      moveType: TYPES.fire,
    };

    const result = applyGen4Ability(CORE_ABILITY_TRIGGER_IDS.passiveImmunity, context);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug #353: Thick Fat — halves BASE POWER, not the attacker's stat
// ---------------------------------------------------------------------------

describe("Gen4DamageCalc Thick Fat — Bug #353 halves base power not attack stat", () => {
  it("given a defender with Thick Fat and a Fire move with base power 90, when calculating damage, then the effective damage equals what BP 45 would produce (base power halved)", () => {
    // Source: Showdown Gen 4 mod — Thick Fat onModifyBasePower halves Fire/Ice move power
    // Source: Bulbapedia — Thick Fat (Gen 4): halves damage from Fire and Ice moves
    // In Gen 4 Thick Fat halves BASE POWER; in Gen 5+ it halves the attacker's stat.
    //
    // Derivation for reference (L50, power=90→45, Atk=100, Def=100, no STAB, rng=100):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*45*100/100)/50)+2 = floor(floor(990)/50)+2 = floor(19)+2 = 21
    //
    // Without Thick Fat (BP=90):
    //   baseDmg = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPES.fire] });
    const defender = createOnFieldPokemon({
      ability: ABILITIES.thickFat,
      defense: 100,
      types: [TYPES.normal],
    });
    const fireMove = SYNTHETIC_FIRE_90_PHYSICAL_MOVE;
    const chart = createNeutralTypeChart();

    const resultWithThickFat = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // No-ability defender for comparison
    const defenderNoAbility = createOnFieldPokemon({
      ability: ABILITIES.none,
      defense: 100,
      types: [TYPES.normal],
    });
    const resultWithout = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoAbility,
        move: fireMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Derivation (L50, power=90 → 45 after Thick Fat halving, Atk=100, Def=100, rng=100):
    // Attacker is Fire-type using Fire move → STAB 1.5x applies
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*45*100/100)/50)+2 = floor(990/50)+2 = 19+2 = 21
    //   STAB: floor(21 * 1.5) = floor(31.5) = 31
    // Without Thick Fat (power=90, Atk=100, Def=100, STAB 1.5x):
    //   baseDmg = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    //   STAB: floor(41 * 1.5) = floor(61.5) = 61
    // Note: 31 ≠ floor(61/2)=30 — proves Thick Fat halves base power, not final damage
    expect(resultWithThickFat.damage).toBe(31);
    expect(resultWithout.damage).toBe(61);
  });

  it("given a defender with Thick Fat and an Ice move with base power 60, when calculating damage, then damage is halved compared to no Thick Fat", () => {
    // Source: Showdown Gen 4 mod — Thick Fat also applies to Ice-type moves
    // Second test case: Ice moves also trigger Thick Fat base power halving
    const attacker = createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] });
    const defender = createOnFieldPokemon({
      ability: ABILITIES.thickFat,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const iceMove = SYNTHETIC_ICE_60_SPECIAL_MOVE;
    const chart = createNeutralTypeChart();

    const resultWithThickFat = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: iceMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    const defenderNoAbility = createOnFieldPokemon({
      ability: ABILITIES.none,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const resultWithout = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoAbility,
        move: iceMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Derivation (L50, power=60 → 30 after Thick Fat halving, spAtk=100, spDef=100, rng=100):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*30*100/100)/50)+2 = floor(660/50)+2 = 13+2 = 15
    // Without Thick Fat (power=60, spAtk=100, spDef=100):
    //   baseDmg = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    expect(resultWithThickFat.damage).toBe(15);
    expect(resultWithout.damage).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// Bug #559: Metronome item — 0.1x step with NO cap (Gen 4), not 0.2x / 2.0x (Gen 5+)
// ---------------------------------------------------------------------------

describe("Gen4DamageCalc Metronome item — Gen 4 step size (0.1x) with no cap", () => {
  it("given a Pokemon holding Metronome item using the same move for 3 consecutive turns (count=3), when calculating damage, then boost is 1.2x (not 1.4x which is Gen 5+)", () => {
    // Source: Showdown data/mods/gen4/items.ts — Metronome onModifyDamagePhase2:
    //   return damage * (1 + (this.effectState.numConsecutive / 10));
    //   No Math.min cap — Gen 4 boost accumulates indefinitely.
    //
    // Gen 4 formula: boost = damage * (10 + boostSteps) / 10, no cap (Bug #559)
    // count=3 (3 consecutive uses): boost = 1.0 + 2 * 0.1 = 1.2x
    // Gen 5+ formula: 1.0 + (count - 1) * 0.2, cap 2.0 → at count=3 would be 1.4x
    //
    // Base damage without Metronome (L50, power=80, Atk=100, Def=100, rng=100):
    //   floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    // With 1.2x Metronome: floor(37 * 1.2) = floor(44.4) = 44
    // With Gen 5+ 1.4x: floor(37 * 1.4) = floor(51.8) = 51
    const attacker = createOnFieldPokemon({ heldItem: ITEMS.metronome, attack: 100 });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, { turnsLeft: 0, data: { count: 3 } });
    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createCanonicalMove(MOVES.strength);
    const chart = createNeutralTypeChart();

    const resultWithMetronome = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Baseline without item
    const attackerNoItem = createOnFieldPokemon({ heldItem: null, attack: 100 });
    const resultBaseline = calculateGen4Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // 3 consecutive uses: Gen 4 boost = 1.2x (not Gen 5+ 1.4x)
    // floor(37 * 1.2) = 44
    expect(resultWithMetronome.damage).toBe(Math.floor(resultBaseline.damage * 1.2));
  });

  it("given a Pokemon holding Metronome item at count=6 (5 consecutive uses after first), when calculating damage, then boost is 1.5x", () => {
    // Source: Showdown data/mods/gen4/items.ts — damage * (1 + numConsecutive/10), no cap
    // count=6: boostSteps=5 → multiplier = 1 + 5*0.1 = 1.5x
    const attacker = createOnFieldPokemon({ heldItem: ITEMS.metronome, attack: 100 });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, { turnsLeft: 0, data: { count: 6 } });
    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createCanonicalMove(MOVES.strength);
    const chart = createNeutralTypeChart();

    const resultCapped = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    const attackerNoItem = createOnFieldPokemon({ heldItem: null, attack: 100 });
    const resultBaseline = calculateGen4Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // count=6: boostSteps=5, multiplier=1.5x
    expect(resultCapped.damage).toBe(Math.floor(resultBaseline.damage * 1.5));
  });

  it("given a Pokemon holding Metronome item at count=10, when calculating damage, then boost is 1.9x (no cap in Gen 4)", () => {
    // Source: Showdown data/mods/gen4/items.ts — no cap on numConsecutive in Gen 4
    // count=10: boostSteps=9 → multiplier = 1 + 9*0.1 = 1.9x
    const attacker = createOnFieldPokemon({ heldItem: ITEMS.metronome, attack: 100 });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, { turnsLeft: 0, data: { count: 10 } });
    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createCanonicalMove(MOVES.strength);
    const chart = createNeutralTypeChart();

    const resultCapped = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // No cap in Gen 4: Metronome is applied to baseDmg before STAB.
    // baseDmg=37, Metronome 1.9x: floor(37*1.9)=70, STAB 1.5x: floor(70*1.5)=105
    expect(resultCapped.damage).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Bug #355: Heatproof — 0.5x modifier applied POST-type-effectiveness (onSourceModifyDamage)
// ---------------------------------------------------------------------------

describe("Gen4DamageCalc Heatproof — Bug #355 post-type-effectiveness 0.5x modifier", () => {
  it("given a Pokemon with Heatproof ability, when hit by a Fire move, then damage is halved (0.5x post-formula modifier)", () => {
    // Source: Showdown Gen 4 mod — Heatproof uses onSourceModifyDamage with 0.5x for Fire moves
    // onSourceModifyDamage runs AFTER crit, random roll, STAB, and type effectiveness.
    //
    // Derivation (L50, power=80 physical, Atk=100, Def=100, no STAB, neutral, rng=100, no crit):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   crit=1x, random=100/100=1x, STAB=none, effectiveness=1x → 37
    //   Heatproof: floor(37 * 0.5) = 18
    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPES.normal] });
    const defender = createOnFieldPokemon({
      ability: ABILITIES.heatproof,
      defense: 100,
      types: [TYPES.normal],
    });
    const fireMove = SYNTHETIC_FIRE_80_PHYSICAL_MOVE;
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    expect(result.damage).toBe(18);
  });

  it("given a Pokemon with Heatproof, when hit by a critical Fire move, then crit is applied first, then Heatproof halves the result", () => {
    // Source: Showdown Gen 4 mod — Heatproof onSourceModifyDamage runs after crit
    // If crit were applied AFTER Heatproof the result would differ.
    //
    // Derivation (L50, power=80 physical, Atk=100, Def=100, no STAB, neutral, rng=100, crit=2x):
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = 35+2 = 37
    //   crit=2x: 37*2 = 74
    //   random=100/100=1x: 74
    //   STAB=none, effectiveness=1x: 74
    //   Heatproof (post-type-effectiveness): floor(74 * 0.5) = 37
    //
    // If Heatproof were applied pre-crit (wrong order):
    //   floor(37*0.5)=18, then crit: 18*2=36 (≠ 37 — distinguishes order)
    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPES.normal] });
    const defender = createOnFieldPokemon({
      ability: ABILITIES.heatproof,
      defense: 100,
      types: [TYPES.normal],
    });
    const fireMove = SYNTHETIC_FIRE_80_PHYSICAL_MOVE;
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        isCrit: true,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // crit first (74), then Heatproof (floor(74*0.5)=37)
    // Wrong pre-crit order would give: floor(37*0.5)=18, *2=36
    expect(result.damage).toBe(37);
  });
});
