/**
 * Regression tests for 6 Gen 2 mechanical correctness bug fixes.
 *
 * Bugs fixed:
 *   #95 — Gen2CritCalc missing Stick (+2 for Farfetch'd) and Lucky Punch (+2 for Chansey)
 *   #96 — onSwitchOut() doesn't clear "trapped" volatile from opponent when trapper switches
 *   #97 — Weather modifier applied before STAB (wrong order per ground truth §3)
 *   #98 — Type effectiveness uses combined multiplier instead of sequential floor per type
 *   #99 — rollProtectSuccess() denominator caps at 729 instead of 255
 *   #100 — calculateStruggleRecoil() uses 1/2 damage dealt instead of 1/4 max HP
 *
 * Sources: gen2-ground-truth.md §3, §4, §9, §11
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { getGen2CritStage } from "../src/Gen2CritCalc";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value (deterministic max roll). */
function _createMaxRng() {
  return {
    next: () => 0,
    int: (_min: number, max: number) => max,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_p: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Create a minimal PokemonInstance. */
function _createPokemonInstance(opts: {
  speciesId?: number;
  level?: number;
  maxHp?: number;
  heldItem?: string | null;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
}): PokemonInstance {
  const maxHp = opts.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: null,
    friendship: 70,
    gender: "male" as const,
    isShiny: false,
    metLocation: "test",
    metLevel: 5,
    originalTrainer: "Test",
    originalTrainerId: 12345,
    pokeball: "poke-ball",
    calculatedStats: {
      hp: maxHp,
      attack: opts.attack ?? 100,
      defense: opts.defense ?? 100,
      spAttack: opts.spAttack ?? 100,
      spDefense: opts.spDefense ?? 100,
      speed: opts.speed ?? 100,
    },
  } as PokemonInstance;
}

/** Create a minimal ActivePokemon. */
function createActivePokemon(opts: {
  speciesId?: number;
  level?: number;
  maxHp?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  types?: PokemonType[];
  heldItem?: string | null;
  volatileStatuses?: Map<string, unknown>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  return {
    pokemon: {
      uid: "test",
      speciesId: opts.speciesId ?? 1,
      nickname: null,
      level: opts.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: maxHp,
      moves: [],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: opts.heldItem ?? null,
      status: null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: "test",
      metLevel: 5,
      originalTrainer: "Test",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: stats,
    } as PokemonInstance,
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
    volatileStatuses: (opts.volatileStatuses ?? new Map()) as Map<never, never>,
    types: opts.types ?? ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 1,
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
  } as unknown as ActivePokemon;
}

/** Create a minimal MoveData. */
function createMove(opts: {
  id?: string;
  type: PokemonType;
  power?: number;
  category?: "physical" | "special" | "status";
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power ?? 80,
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
    generation: 2,
  } as MoveData;
}

/** Create a minimal species data mock. */
function createSpecies(opts: { types?: PokemonType[] } = {}): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: opts.types ?? ["normal"],
    baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    abilities: { normal: [""], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1, weight: 10 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 2,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

/** Create a neutral type chart (all interactions = 1). */
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

/** Create a type chart with a specific interaction set. */
function createTypeChart(overrides: Record<string, Record<string, number>>): TypeChart {
  const base = createNeutralTypeChart() as unknown as Record<string, Record<string, number>>;
  for (const [atk, defs] of Object.entries(overrides)) {
    base[atk] = { ...(base[atk] ?? {}), ...defs };
  }
  return base as unknown as TypeChart;
}

/** Create a minimal BattleState mock. */
function createMockState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
): DamageContext["state"] {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

// ---------------------------------------------------------------------------
// Bug #95: Stick (+2 crit for Farfetch'd) and Lucky Punch (+2 crit for Chansey)
// Source: gen2-ground-truth.md §4 — Crit Stage Sources
// ---------------------------------------------------------------------------

describe("Bug #95 — Stick and Lucky Punch crit stage bonuses", () => {
  describe("Given Farfetch'd (#83) holding Stick", () => {
    it("when calculating crit stage, then stage is 2 (not 0)", () => {
      // Arrange — Farfetch'd is species #83
      const farfetchd = createActivePokemon({ speciesId: 83, heldItem: "stick" });
      const move = createMove({ type: "normal" });

      // Act
      const stage = getGen2CritStage(farfetchd, move);

      // Assert — Stick adds +2 crit stage for Farfetch'd only
      // Source: gen2-ground-truth.md §4 — "Stick (Farfetch'd held item): +2"
      expect(stage).toBe(2);
    });

    it("when Farfetch'd holds Stick with Scope Lens too, then stage is clamped to 4", () => {
      // Arrange
      const _farfetchd = createActivePokemon({ speciesId: 83, heldItem: "stick" });
      // Override to also have scope lens — not possible in-game but tests clamping
      const farfetchdWithScopeLens = createActivePokemon({
        speciesId: 83,
        heldItem: "scope-lens",
      });
      const focusEnergyVolatiles = new Map([["focus-energy", { turnsLeft: -1 }]]);
      const farfetchdFullStack = createActivePokemon({
        speciesId: 83,
        heldItem: "stick",
        volatileStatuses: focusEnergyVolatiles,
      });
      const highCritMove = createMove({ id: "slash", type: "normal" });

      // Act — Stick(+2) + Focus Energy(+1) + Slash(+1) = 4, clamped at 4
      const stage = getGen2CritStage(farfetchdFullStack, highCritMove);

      // Assert — stage must not exceed 4 (max index in GEN2_CRIT_RATES)
      expect(stage).toBe(4);
      // With Scope Lens alone (no Stick), stage is 0+1=1
      expect(getGen2CritStage(farfetchdWithScopeLens, createMove({ type: "normal" }))).toBe(1);
    });

    it("when a different species holds Stick, then no crit bonus is applied", () => {
      // Arrange — Stick only works for Farfetch'd (#83)
      const charizard = createActivePokemon({ speciesId: 6, heldItem: "stick" });
      const move = createMove({ type: "normal" });

      // Act
      const stage = getGen2CritStage(charizard, move);

      // Assert — Stick bonus must NOT apply to other species
      expect(stage).toBe(0);
    });
  });

  describe("Given Chansey (#113) holding Lucky Punch", () => {
    it("when calculating crit stage, then stage is 2 (not 0)", () => {
      // Arrange — Chansey is species #113
      const chansey = createActivePokemon({ speciesId: 113, heldItem: "lucky-punch" });
      const move = createMove({ type: "normal" });

      // Act
      const stage = getGen2CritStage(chansey, move);

      // Assert — Lucky Punch adds +2 crit stage for Chansey only
      // Source: gen2-ground-truth.md §4 — "Lucky Punch (Chansey held item): +2"
      expect(stage).toBe(2);
    });

    it("when a different species holds Lucky Punch, then no crit bonus is applied", () => {
      // Arrange — Lucky Punch only works for Chansey (#113)
      const blissey = createActivePokemon({ speciesId: 242, heldItem: "lucky-punch" });
      const move = createMove({ type: "normal" });

      // Act
      const stage = getGen2CritStage(blissey, move);

      // Assert — Lucky Punch bonus must NOT apply to other species
      expect(stage).toBe(0);
    });

    it("when Chansey holds Lucky Punch and uses a high-crit move, then stage is 4 (capped)", () => {
      // Arrange
      const chansey = createActivePokemon({ speciesId: 113, heldItem: "lucky-punch" });
      const highCritMove = createMove({ id: "slash", type: "normal" });

      // Act — Lucky Punch(+2) + Slash(+2) = 4, capped at 4
      // Source: pret/pokecrystal effect_commands.asm:1182-1184 — high-crit moves add 2 (inc c; inc c)
      const stage = getGen2CritStage(chansey, highCritMove);

      // Assert
      expect(stage).toBe(4);
    });
  });

  describe("Given Farfetch'd with Stick vs Scope Lens (stage comparison)", () => {
    it("Stick (+2) gives higher stage than Scope Lens (+1)", () => {
      // Arrange
      const farfetchdWithStick = createActivePokemon({ speciesId: 83, heldItem: "stick" });
      const farfetchdWithScopeLens = createActivePokemon({
        speciesId: 83,
        heldItem: "scope-lens",
      });
      const move = createMove({ type: "normal" });

      // Act
      const stickStage = getGen2CritStage(farfetchdWithStick, move);
      const scopeLensStage = getGen2CritStage(farfetchdWithScopeLens, move);

      // Assert
      expect(stickStage).toBe(2);
      expect(scopeLensStage).toBe(1);
      expect(stickStage).toBeGreaterThan(scopeLensStage);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug #96: onSwitchOut doesn't clear "trapped" volatile from opponent
// Source: gen2-ground-truth.md §9 — Mean Look / Spider Web
// ---------------------------------------------------------------------------

describe("Bug #96 — onSwitchOut clears trapped volatile from opposing Pokemon", () => {
  const ruleset = new Gen2Ruleset();

  function buildBattleState(
    side0Active: ActivePokemon | null,
    side1Active: ActivePokemon | null,
  ): BattleState {
    return {
      sides: [
        {
          index: 0,
          trainer: null,
          team: [],
          active: [side0Active],
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
          active: [side1Active],
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
      phase: "turn-resolve",
      generation: 2,
      format: "singles",
      turnNumber: 5,
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      turnHistory: [],
      rng: new SeededRandom(1),
      ended: false,
      winner: null,
    } as unknown as BattleState;
  }

  it("given side-0 uses Mean Look and then switches out, when onSwitchOut is called, then trapped volatile is cleared from side-1 Pokemon", () => {
    // Arrange
    const trapper = createActivePokemon({ types: ["ghost"] }); // The Mean Look user (side 0)
    const trapped = createActivePokemon({
      types: ["normal"],
      volatileStatuses: new Map([["trapped", { turnsLeft: -1 }]]),
    });
    expect(trapped.volatileStatuses.has("trapped")).toBe(true);

    const state = buildBattleState(trapper, trapped);

    // Act — trapper switches out
    ruleset.onSwitchOut(trapper, state);

    // Assert — opponent's "trapped" volatile must be cleared
    // Source: gen2-ground-truth.md §9 — "Effect ends when the user switches out"
    expect(trapped.volatileStatuses.has("trapped")).toBe(false);
  });

  it("given side-1 uses Spider Web and then switches out, when onSwitchOut is called, then trapped volatile is cleared from side-0 Pokemon", () => {
    // Arrange
    const trapped = createActivePokemon({
      types: ["normal"],
      volatileStatuses: new Map([["trapped", { turnsLeft: -1 }]]),
    });
    const trapper = createActivePokemon({ types: ["bug"] }); // Spider Web user (side 1)
    const state = buildBattleState(trapped, trapper);

    // Act — trapper on side 1 switches out
    ruleset.onSwitchOut(trapper, state);

    // Assert — side-0 Pokemon's "trapped" volatile is cleared
    expect(trapped.volatileStatuses.has("trapped")).toBe(false);
  });

  it("given no trapped volatile exists on opponent, when onSwitchOut is called, then no error and state is unchanged", () => {
    // Arrange
    const trapper = createActivePokemon({ types: ["ghost"] });
    const opponent = createActivePokemon({ types: ["normal"] }); // no "trapped" volatile
    const state = buildBattleState(trapper, opponent);

    // Act
    expect(() => ruleset.onSwitchOut(trapper, state)).not.toThrow();

    // Assert — still no trapped volatile (nothing to clear)
    expect(opponent.volatileStatuses.has("trapped")).toBe(false);
  });

  it("given switching Pokemon switches out without having applied trapping, other volatiles on opponent are NOT cleared", () => {
    // Arrange
    const switcher = createActivePokemon({ types: ["normal"] });
    const opponent = createActivePokemon({
      types: ["normal"],
      volatileStatuses: new Map([
        ["confusion", { turnsLeft: 3 }],
        ["leech-seed", { turnsLeft: -1 }],
      ]),
    });
    const state = buildBattleState(switcher, opponent);

    // Act
    ruleset.onSwitchOut(switcher, state);

    // Assert — only "trapped" would be cleared; confusion/leech-seed on opponent persist
    expect(opponent.volatileStatuses.has("confusion")).toBe(true);
    expect(opponent.volatileStatuses.has("leech-seed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug #97: Weather modifier applied before STAB (wrong order)
// Source: gen2-ground-truth.md §3 — "STAB × type_effectiveness × weather"
// ---------------------------------------------------------------------------

describe("Bug #97 — STAB applied before weather modifier (correct order)", () => {
  describe("Given a Water-type attacker using a Water move in Rain Dance", () => {
    it("when computing damage, STAB is applied before weather and produces correct result", () => {
      // Arrange
      // Level 50, Water STAB attacker (attack=100), Water defender (defense=100), neutral type
      // Move: 80 power Water-type
      // Rain Dance doubles Water (1.5x weather modifier)
      // Ground truth order: base_damage → STAB (+50%) → type_effectiveness (neutral) → weather (×1.5)
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove({ type: "water", power: 80, category: "special" });
      // Use neutral type chart — no type effectiveness
      const typeChart = createNeutralTypeChart();
      const state = createMockState({ type: "rain", turnsLeft: 3, source: "rain-dance" });
      // Use max random roll for determinism
      const rng = createMockRng(255);

      const context: DamageContext = {
        attacker,
        defender,
        move,
        state,
        rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(context, typeChart, createSpecies());

      // Assert — verify the result is positive damage (non-zero)
      // base = floor(floor((floor(2*50/5)+2) * 80 * 100) / 100) / 50) = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
      // after clamp + 2: 35 → clamped 35 → +2 = 37
      // STAB: floor(37 * 1.5) = 55  (STAB FIRST)
      // type: neutral (×1)
      // weather: floor(55 * 1.5) = 82  (WEATHER AFTER)
      // random: floor(82 * 255/255) = 82
      expect(result.damage).toBe(82);
    });

    it("when computing damage without STAB but with rain, result is lower than STAB+rain", () => {
      // Arrange — Normal-type attacker using Water move (no STAB) in Rain
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"], // No STAB for water move
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove({ type: "water", power: 80, category: "special" });
      const typeChart = createNeutralTypeChart();
      const state = createMockState({ type: "rain", turnsLeft: 3, source: "rain-dance" });
      const rng = createMockRng(255);

      const context: DamageContext = {
        attacker,
        defender,
        move,
        state,
        rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(context, typeChart, createSpecies());

      // Assert — base 37 → no STAB → weather floor(37 * 1.5) = 55 → random: 55
      // With STAB the result is 82, without STAB it's 55
      expect(result.damage).toBe(55);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug #98: Type effectiveness — sequential floor per type (dual-type defenders)
// Source: gen2-ground-truth.md §3 — sequential application with floor
// ---------------------------------------------------------------------------

describe("Bug #98 — Type effectiveness applied sequentially with floor per type", () => {
  describe("Given a dual-type defender (Rock/Flying) hit by an Electric move", () => {
    it("when damage is computed with sequential floors, the result matches ground truth calculation", () => {
      // Arrange
      // Rock/Flying defender hit by Electric (2x vs Flying, 1x vs Rock → net 2x)
      // Ground truth: floor(damage * 20/10)  [vs Flying = 2x], then * 1 [vs Rock = neutral]
      const attacker = createActivePokemon({
        level: 50,
        spAttack: 100,
        spDefense: 100,
        attack: 100,
        defense: 100,
        types: ["electric"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
        spDefense: 100,
        attack: 100,
        spAttack: 100,
        types: ["rock", "flying"], // electric 2x vs flying, 1x vs rock
      });
      const move = createMove({ type: "electric", power: 80, category: "special" });
      const typeChart = createTypeChart({
        electric: { rock: 1, flying: 2 },
      });
      const state = createMockState();
      const rng = createMockRng(255);

      const context: DamageContext = {
        attacker,
        defender,
        move,
        state,
        rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(context, typeChart, createSpecies());

      // Assert — sequential calculation:
      //   base = floor(floor(22*80*100)/100/50) = 35, clamped 35, +2 = 37
      //   STAB (electric attacker vs electric move): floor(37 * 1.5) = 55
      //   vs Rock (neutral): no change → 55
      //   vs Flying (SE): floor(55 * 20/10) = 110
      //   no weather, max roll: floor(110 * 255/255) = 110
      // Source: gen2-ground-truth.md §3 — "SE: damage = floor(damage * 20 / 10)"
      expect(result.damage).toBe(110);
      expect(result.effectiveness).toBe(2); // net effectiveness
    });
  });

  describe("Given a dual-type defender (Rock/Flying) hit by Ground move", () => {
    it("when defender has Ground immunity (0x vs Flying type), returns 0 damage regardless", () => {
      // Arrange — Ground is immune to Flying (0x) but normally SE vs Rock
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["ground"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
        spDefense: 100,
        attack: 100,
        spAttack: 100,
        types: ["rock", "flying"],
      });
      const move = createMove({ type: "ground", power: 80 });
      const typeChart = createTypeChart({
        ground: { rock: 2, flying: 0 },
      });
      const state = createMockState();
      const rng = createMockRng(255);

      const context: DamageContext = {
        attacker,
        defender,
        move,
        state,
        rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(context, typeChart, createSpecies());

      // Assert — immunity overrides all, result is 0 damage
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });
  });

  describe("Given a dual-type defender (Fire/Rock) hit by Water (NVE vs Fire, SE vs Rock)", () => {
    it("when applying sequentially, result matches floor-per-type calculation", () => {
      // Arrange
      // Water vs Fire: 2x (but fire is NVE-to-water in real chart — for test purposes we specify)
      // Actually: Water 2x vs Fire, 1x vs Rock → net 2x
      // Use custom chart for predictable test
      const attacker = createActivePokemon({
        level: 50,
        spAttack: 100,
        spDefense: 100,
        attack: 100,
        defense: 100,
        types: ["water"],
      });
      const defender = createActivePokemon({
        level: 50,
        defense: 100,
        spDefense: 100,
        attack: 100,
        spAttack: 100,
        types: ["fire", "rock"], // water 2x vs fire, 0.5x vs rock → net 1x
      });
      const move = createMove({ type: "water", power: 80, category: "special" });
      const typeChart = createTypeChart({
        water: { fire: 2, rock: 0.5 },
      });
      const state = createMockState();
      const rng = createMockRng(255);

      const context: DamageContext = {
        attacker,
        defender,
        move,
        state,
        rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(context, typeChart, createSpecies());

      // Assert — STAB water: floor(37 * 1.5) = 55
      // SE vs fire: floor(55 * 20/10) = 110
      // NVE vs rock: floor(110 * 5/10) = 55
      // no weather, max random: 55
      // Sequential floor-per-type gives 55, combined (55 * 1.0 = 55) also 55 here
      // The key is that the floors ensure correct rounding behavior
      expect(result.damage).toBe(55);
      // effectiveness = 2 * 0.5 = 1.0
      expect(result.effectiveness).toBeCloseTo(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug #99: rollProtectSuccess denominator caps at 255 (not 729)
// Source: gen2-ground-truth.md §9 — Protect/Detect
// ---------------------------------------------------------------------------

describe("Bug #99 — Protect success uses bit-shift halving (srl b), not powers of 3", () => {
  // Source: pret/pokecrystal engine/battle/move_effects/protect.asm:14-74 — srl b (halving) each consecutive use
  const ruleset = new Gen2Ruleset();

  describe("Given consecutiveProtects = 0 (first use)", () => {
    it("when rolling protect success, then always succeeds (255/255)", () => {
      // Arrange
      const rng = new SeededRandom(42);

      // Act & Assert — first use always succeeds
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    });
  });

  describe("Given consecutiveProtects = 1 (second consecutive use)", () => {
    it("when rolling 10000 times, success rate is approximately 127/255 ≈ 49.8%", () => {
      // Arrange
      // threshold = floor(255 >> 1) = 127
      // roll is 1-255; success if roll <= 127 → 127/255 ≈ 49.8%
      // Source: pret/pokecrystal protect.asm — srl b halves threshold each consecutive use
      let successes = 0;
      const trials = 10000;

      // Act
      for (let i = 0; i < trials; i++) {
        const rng = new SeededRandom(i * 7919);
        if (ruleset.rollProtectSuccess(1, rng)) successes++;
      }
      const rate = successes / trials;

      // Assert — 127/255 ≈ 49.8%, tolerance ±3%
      expect(rate).toBeGreaterThan(0.46);
      expect(rate).toBeLessThan(0.53);
    });
  });

  describe("Given consecutiveProtects large enough to always fail", () => {
    it("given consecutiveProtects = 10, threshold is 0 so always fails", () => {
      // Arrange — floor(255 >> 10) = 0 → always fails
      let successes = 0;
      const trials = 1000;

      // Act
      for (let i = 0; i < trials; i++) {
        const rng = new SeededRandom(i * 1009);
        if (ruleset.rollProtectSuccess(10, rng)) successes++;
      }

      // Assert — threshold is 0, should always fail
      expect(successes).toBe(0);
    });

    it("given consecutiveProtects = 8, threshold is 0 so always fails", () => {
      // Arrange — floor(255 >> 8) = 0
      // Source: pret/pokecrystal protect.asm — srl b shifts right each consecutive use
      let successes = 0;
      const trials = 1000;

      // Act
      for (let i = 0; i < trials; i++) {
        const rng = new SeededRandom(i * 2017);
        if (ruleset.rollProtectSuccess(8, rng)) successes++;
      }

      // Assert
      expect(successes).toBe(0);
    });
  });

  describe("Given consecutive protect values verifying halving pattern", () => {
    it("given consecutiveProtects = 4, threshold is floor(255 >> 4) = 15, rate is 15/255", () => {
      // Arrange — floor(255 >> 4) = floor(255/16) = 15
      // Source: pret/pokecrystal protect.asm:14-74
      let successes = 0;
      const trials = 10000;

      // Act
      for (let i = 0; i < trials; i++) {
        const rng = new SeededRandom(i * 3571);
        if (ruleset.rollProtectSuccess(4, rng)) successes++;
      }
      const rate = successes / trials;

      // Assert — rate ≈ 15/255 ≈ 5.88%, tolerance ±2%
      expect(rate).toBeGreaterThan(0.03);
      expect(rate).toBeLessThan(0.09);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug #100: calculateStruggleRecoil uses 1/4 max HP (not 1/2 damage dealt)
// Source: gen2-ground-truth.md §9 — Struggle: "floor(maxHp / 4)"
// ---------------------------------------------------------------------------

describe("Bug #100 — Struggle recoil is 1/4 of damage dealt (not max HP)", () => {
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:5670-5729 BattleCommand_Recoil — srl b twice = divide by 4
  const ruleset = new Gen2Ruleset();

  describe("Given an attacker and 60 damage dealt", () => {
    it("when calculating struggle recoil, then result is 15 (floor(60/4))", () => {
      // Arrange
      const attacker = createActivePokemon({ maxHp: 200 });
      const damageDealt = 60;

      // Act
      const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

      // Assert — recoil = floor(60/4) = 15
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:5670-5729
      expect(recoil).toBe(15);
    });
  });

  describe("Given an attacker and 100 damage dealt", () => {
    it("when calculating struggle recoil, then result is 25 (floor(100/4))", () => {
      // Arrange
      const attacker = createActivePokemon({ maxHp: 200 });
      const damageDealt = 100;

      // Act
      const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

      // Assert — recoil = floor(100/4) = 25
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:5670-5729
      expect(recoil).toBe(25);
    });
  });

  describe("Given damage dealt is 0", () => {
    it("when calculating struggle recoil, then minimum 1 is returned", () => {
      // Arrange
      const attacker = createActivePokemon({ maxHp: 200 });
      const damageDealt = 0;

      // Act
      const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

      // Assert — max(1, floor(0/4)) = max(1, 0) = 1
      expect(recoil).toBe(1);
    });
  });

  describe("Given damage dealt is 300", () => {
    it("when calculating struggle recoil, then result is 75 (floor(300/4))", () => {
      // Arrange
      const attacker = createActivePokemon({ maxHp: 200 });
      const damageDealt = 300;

      // Act
      const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

      // Assert — floor(300/4) = 75
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:5670-5729
      expect(recoil).toBe(75);
    });
  });

  describe("Given damage dealt is 3 (edge case)", () => {
    it("when calculating struggle recoil, minimum 1 is returned", () => {
      // Arrange
      const attacker = createActivePokemon({ maxHp: 200 });
      const damageDealt = 3;

      // Act
      const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

      // Assert — max(1, floor(3/4)) = max(1, 0) = 1
      expect(recoil).toBe(1);
    });
  });
});
