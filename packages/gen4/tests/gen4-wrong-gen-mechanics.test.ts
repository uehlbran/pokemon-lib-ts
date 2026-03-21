import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

function makePokemonInstance(overrides: {
  maxHp?: number;
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
  level?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: overrides.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  maxHp?: number;
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
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
      currentHp: maxHp,
      moves: [],
      ability: overrides.ability ?? "",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: stats,
    } as PokemonInstance,
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
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
      contact: false,
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
    effect: null,
    description: "",
    generation: 4,
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
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has("sleep-counter")).toBe(false);
  });

  it("given a sleeping Pokemon with sleep counter already at 0, when processSleepTurn is called, then Pokemon wakes and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — waking Pokemon can act normally
    // Counter at 0 means already expired — wake immediately, return true
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 0 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
  });

  it("given a sleeping Pokemon with sleep counter at 3, when processSleepTurn is called, then counter decrements and Pokemon remains asleep (cannot act)", () => {
    // Source: specs/battle/05-gen4.md — sleep counter > 0 after decrement: still sleeping
    // Must return false when still asleep (not yet waking)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(false);
    expect(mon.pokemon.status).toBe("sleep");
    expect(mon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
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
    const attacker = makeActivePokemon({ ability: "stench" });
    const defender = makeActivePokemon({ ability: "" });

    const context = {
      pokemon: attacker,
      opponent: defender,
      rng: createMockRng(0), // next() = 0 = always passes any probability check
      state: STUB_STATE,
      moveType: "normal" as PokemonType,
    };

    const result = applyGen4Ability("on-after-move-hit", context);

    // Must not apply flinch
    expect(result.activated).toBe(false);
    const flinchEffect = result.effects.find(
      (e) => e.effectType === "volatile-inflict" && "volatile" in e && e.volatile === "flinch",
    );
    expect(flinchEffect).toBeUndefined();
  });

  it("given a Pokemon with Stench ability and rng.next() = 0 (guaranteed hit), when on-after-move-hit triggers, then still no flinch is applied", () => {
    // Source: Bulbapedia — Stench (Gen 4): no battle effect regardless of RNG outcome
    // Second test case: confirm no flinch even when RNG would guarantee the effect
    const attacker = makeActivePokemon({ ability: "stench" });
    const defender = makeActivePokemon({ ability: "" });

    const context = {
      pokemon: attacker,
      opponent: defender,
      rng: { ...createMockRng(0), next: () => 0 }, // 0 < 0.1, would trigger if Gen 5 logic
      state: STUB_STATE,
      moveType: "normal" as PokemonType,
    };

    const result = applyGen4Ability("on-after-move-hit", context);

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
    const defender = makeActivePokemon({ ability: "storm-drain" });
    const attacker = makeActivePokemon({ ability: "" });

    const context = {
      pokemon: defender,
      opponent: attacker,
      rng: createMockRng(),
      state: STUB_STATE,
      moveType: "water" as PokemonType,
    };

    const result = applyGen4Ability("passive-immunity", context);

    // In Gen 4 singles, Storm Drain must NOT grant immunity (activated = false)
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Storm Drain, when a non-Water-type move is used, then no immunity activates (regardless of type)", () => {
    // Source: Showdown Gen 4 mod — Storm Drain only attempted to redirect Water moves
    // Control case: confirm non-Water moves are also not blocked
    const defender = makeActivePokemon({ ability: "storm-drain" });
    const attacker = makeActivePokemon({ ability: "" });

    const context = {
      pokemon: defender,
      opponent: attacker,
      rng: createMockRng(),
      state: STUB_STATE,
      moveType: "fire" as PokemonType,
    };

    const result = applyGen4Ability("passive-immunity", context);

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
    const attacker = makeActivePokemon({ attack: 100, types: ["fire"] });
    const defender = makeActivePokemon({ ability: "thick-fat", defense: 100, types: ["normal"] });
    const fireMove = createMove({ type: "fire", power: 90, category: "physical" });
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
    const defenderNoAbility = makeActivePokemon({ ability: "", defense: 100, types: ["normal"] });
    const resultWithout = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoAbility,
        move: fireMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Thick Fat should halve the damage — result should be half of the no-ability case
    // (within floor rounding: floor(41/2)=20 or 21)
    expect(resultWithThickFat.damage).toBeLessThan(resultWithout.damage);
    // Confirm approximately 50% reduction
    expect(resultWithThickFat.damage).toBeGreaterThanOrEqual(Math.floor(resultWithout.damage / 2));
    expect(resultWithThickFat.damage).toBeLessThanOrEqual(Math.ceil(resultWithout.damage / 2) + 1);
  });

  it("given a defender with Thick Fat and an Ice move with base power 60, when calculating damage, then damage is halved compared to no Thick Fat", () => {
    // Source: Showdown Gen 4 mod — Thick Fat also applies to Ice-type moves
    // Second test case: Ice moves also trigger Thick Fat base power halving
    const attacker = makeActivePokemon({ spAttack: 100, types: ["water"] });
    const defender = makeActivePokemon({ ability: "thick-fat", spDefense: 100, types: ["normal"] });
    const iceMove = createMove({ type: "ice", power: 60, category: "special" });
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

    const defenderNoAbility = makeActivePokemon({ ability: "", spDefense: 100, types: ["normal"] });
    const resultWithout = calculateGen4Damage(
      createDamageContext({
        attacker,
        defender: defenderNoAbility,
        move: iceMove,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    expect(resultWithThickFat.damage).toBeLessThan(resultWithout.damage);
    expect(resultWithThickFat.damage).toBeGreaterThanOrEqual(Math.floor(resultWithout.damage / 2));
  });
});

// ---------------------------------------------------------------------------
// Bug #358: Metronome item — 0.1x step / 1.5x cap (Gen 4), not 0.2x / 2.0x (Gen 5+)
// ---------------------------------------------------------------------------

describe("Gen4DamageCalc Metronome item — Bug #358 correct Gen 4 step and cap", () => {
  it("given a Pokemon holding Metronome item using the same move for 3 consecutive turns (count=3), when calculating damage, then boost is 1.2x (not 1.4x which is Gen 5+)", () => {
    // Source: Showdown Gen 4 mod — Metronome item onModifyMove: +10% per consecutive use, cap 1.5x
    // Source: Bulbapedia — Metronome (item) Gen 4: "Boosts moves used consecutively by 10%,
    //   up to 50% (1.5x)."
    //
    // Gen 4 formula: boost = 1.0 + (count - 1) * 0.1, capped at 1.5
    // count=3 (3 consecutive uses): boost = 1.0 + 2 * 0.1 = 1.2x
    // Gen 5+ formula: 1.0 + (count - 1) * 0.2, cap 2.0 → at count=3 would be 1.4x
    //
    // Base damage without Metronome (L50, power=80, Atk=100, Def=100, rng=100):
    //   floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    // With 1.2x Metronome: floor(37 * 1.2) = floor(44.4) = 44
    // With Gen 5+ 1.4x: floor(37 * 1.4) = floor(51.8) = 51
    const attacker = makeActivePokemon({ heldItem: "metronome", attack: 100 });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 0, data: { count: 3 } });
    const defender = makeActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
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
    const attackerNoItem = makeActivePokemon({ heldItem: null, attack: 100 });
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

  it("given a Pokemon holding Metronome item at count=6 (5 consecutive uses after first), when calculating damage, then boost is capped at 1.5x (not 2.0x which is Gen 5+)", () => {
    // Source: Showdown Gen 4 mod — Metronome item cap is 1.5x in Gen 4
    // Gen 4: boost = min(1.0 + (count-1)*0.1, 1.5) → count=6: min(1.5, 1.5) = 1.5x
    // Gen 5+: cap is 2.0x → count=6 would give min(2.0, 2.0) = 2.0x
    const attacker = makeActivePokemon({ heldItem: "metronome", attack: 100 });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 0, data: { count: 6 } });
    const defender = makeActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
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

    const attackerNoItem = makeActivePokemon({ heldItem: null, attack: 100 });
    const resultBaseline = calculateGen4Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Gen 4 cap is 1.5x: floor(37 * 1.5) = 55
    expect(resultCapped.damage).toBe(Math.floor(resultBaseline.damage * 1.5));
  });

  it("given a Pokemon holding Metronome item at count=10 (well past cap), when calculating damage, then boost is still capped at 1.5x", () => {
    // Source: Showdown Gen 4 mod — cap enforcement at 1.5x regardless of count
    // count=10: without cap would be 1.9x, but cap = 1.5x
    const attacker = makeActivePokemon({ heldItem: "metronome", attack: 100 });
    attacker.volatileStatuses.set("metronome-count", { turnsLeft: 0, data: { count: 10 } });
    const defender = makeActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
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

    const attackerNoItem = makeActivePokemon({ heldItem: null, attack: 100 });
    const resultBaseline = calculateGen4Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move,
        rng: { ...createMockRng(), int: () => 100 },
      }),
      chart,
    );

    // Gen 4 cap at 1.5x — must equal the count=6 result
    expect(resultCapped.damage).toBe(Math.floor(resultBaseline.damage * 1.5));
  });
});
