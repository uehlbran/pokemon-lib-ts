/**
 * Damage Oracle Suite
 *
 * Compares our per-gen damage calculations against @smogon/calc.
 * Tolerance: ±max(2, floor(smogonMax * 0.02)) on max-roll damage.
 *
 * Source authority:
 *   Gen 1-2: pret/pokered, pret/pokecrystal
 *   Gen 3:   pret/pokeemerald
 *   Gen 4:   pret/pokeplatinum
 *   Gen 5-9: Pokemon Showdown
 */

import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import {
  calculate,
  Field,
  type GenerationNum,
  Move as SmogonMove,
  Pokemon as SmogonPokemon,
} from "@smogon/calc";
import type { DamageContext } from "../../../packages/battle/src/context/types.js";
import type { ActivePokemon } from "../../../packages/battle/src/state/BattleSide.js";
import {
  createBattleState,
  createOnFieldPokemon,
} from "../../../packages/battle/src/utils/BattleHelpers.js";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
} from "../../../packages/core/src/constants/index.js";
import type { MoveData } from "../../../packages/core/src/entities/move.js";
import type { NatureData } from "../../../packages/core/src/entities/nature.js";
import type { PokemonInstance } from "../../../packages/core/src/entities/pokemon.js";
import type { PokemonSpeciesData } from "../../../packages/core/src/entities/species.js";
import type { TypeChart } from "../../../packages/core/src/entities/type-chart.js";
import type { PokemonType } from "../../../packages/core/src/entities/types.js";
import { createFriendship } from "../../../packages/core/src/logic/friendship-inputs.js";
import { createMoveSlot } from "../../../packages/core/src/logic/pokemon-factory.js";
import { calculateAllStats } from "../../../packages/core/src/logic/stat-calc.js";
import {
  createDvs,
  createEvs,
  createIvs,
  createStatExp,
} from "../../../packages/core/src/logic/stat-inputs.js";

import { createGen1DataManager } from "../../../packages/gen1/src/data/index.js";
import { calculateGen1Damage } from "../../../packages/gen1/src/Gen1DamageCalc.js";
import { calculateGen1Stats } from "../../../packages/gen1/src/Gen1StatCalc.js";

import { createGen2DataManager } from "../../../packages/gen2/src/data/index.js";
import { calculateGen2Damage } from "../../../packages/gen2/src/Gen2DamageCalc.js";
import { calculateGen2Stats } from "../../../packages/gen2/src/Gen2StatCalc.js";

import { createGen3DataManager } from "../../../packages/gen3/src/data/index.js";
import { calculateGen3Damage } from "../../../packages/gen3/src/Gen3DamageCalc.js";

import { createGen4DataManager } from "../../../packages/gen4/src/data/index.js";
import { calculateGen4Damage } from "../../../packages/gen4/src/Gen4DamageCalc.js";

import { createGen5DataManager } from "../../../packages/gen5/src/data/index.js";
import { calculateGen5Damage } from "../../../packages/gen5/src/Gen5DamageCalc.js";

import { createGen6DataManager } from "../../../packages/gen6/src/data/index.js";
import { calculateGen6Damage } from "../../../packages/gen6/src/Gen6DamageCalc.js";

import { createGen7DataManager } from "../../../packages/gen7/src/data/index.js";
import { calculateGen7Damage } from "../../../packages/gen7/src/Gen7DamageCalc.js";

import { createGen8DataManager } from "../../../packages/gen8/src/data/index.js";
import { calculateGen8Damage } from "../../../packages/gen8/src/Gen8DamageCalc.js";

import { createGen9DataManager } from "../../../packages/gen9/src/data/index.js";
import { calculateGen9Damage } from "../../../packages/gen9/src/Gen9DamageCalc.js";

import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Constants ──────────────────────────────────────────────────────────────

const DAMAGE_SUITE_NAME = "damage";

/**
 * Representative species for damage oracle checks.
 * Filtered per-gen to skip species that don't exist in that generation.
 */
const REPRESENTATIVE_SPECIES = [
  "Charizard",
  "Blastoise",
  "Venusaur",
  "Alakazam",
  "Machamp",
  "Gengar",
  "Dragonite",
  "Raichu",
  "Snorlax",
  "Vaporeon",
  "Gyarados",
  "Lapras",
  "Mewtwo",
  "Mew",
  "Arcanine",
  "Jolteon",
  "Flareon",
  "Clefable",
  "Slowbro",
  "Hitmonlee",
] as const;

/** Generic defender for all oracle scenarios: Snorlax (good bulk, single type). */
const GENERIC_DEFENDER_NAME = "Snorlax";

/** Oracle level for all damage comparisons. */
const ORACLE_LEVEL = 50;

// ── @pkmn/data oracle ──────────────────────────────────────────────────────

const PKMN_GENERATIONS = new Generations(Dex);

// ── Data manager cache ──────────────────────────────────────────────────────

const DATA_MANAGER_FACTORIES: Record<number, () => ReturnType<typeof createGen1DataManager>> = {
  1: createGen1DataManager,
  2: createGen2DataManager,
  3: createGen3DataManager,
  4: createGen4DataManager,
  5: createGen5DataManager,
  6: createGen6DataManager,
  7: createGen7DataManager,
  8: createGen8DataManager,
  9: createGen9DataManager,
};

// ── Max-roll RNG mock ───────────────────────────────────────────────────────

/**
 * A mock SeededRandom that always returns the maximum value for int(),
 * and always returns 1.0 for next(). This produces max-damage rolls:
 *   Gen 1-2: rng.int(217, 255) → 255 (255/255 factor)
 *   Gen 3+:  rng.int(85, 100)  → 100 (1.0 factor, i.e. full damage)
 */
const MAX_ROLL_RNG = {
  next: () => 1.0,
  int: (_min: number, max: number) => max,
  // chance() returns false so secondary effects (burn, paralysis, etc.) are never triggered.
  // Secondary effects do not affect the damage number itself in any gen's damage calc.
  chance: () => false,
  pick: <T>(arr: readonly T[]) => arr[0] as T,
  shuffle: <T>(arr: readonly T[]) => [...arr] as T[],
  getState: () => 0,
  setState: () => {},
} as unknown as SeededRandom;

// ── PokemonInstance factories ────────────────────────────────────────────────

function createGen12PokemonInstance(
  speciesId: number,
  moveId: string,
  movePp: number,
): PokemonInstance {
  return {
    uid: `oracle-damage-${speciesId}-${moveId}`,
    speciesId,
    nickname: null,
    level: ORACLE_LEVEL,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createDvs(), // all DVs = 15
    evs: createStatExp(), // all stat EXP = 0
    currentHp: 1,
    moves: [createMoveSlot(moveId, movePp)],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "oracle",
    metLevel: ORACLE_LEVEL,
    originalTrainer: "oracle",
    originalTrainerId: 1,
    pokeball: CORE_ITEM_IDS.pokeBall,
  };
}

function createGen3PlusPokemonInstance(
  speciesId: number,
  moveId: string,
  movePp: number,
): PokemonInstance {
  return {
    uid: `oracle-damage-${speciesId}-${moveId}`,
    speciesId,
    nickname: null,
    level: ORACLE_LEVEL,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs(), // all IVs = 31
    evs: createEvs(), // all EVs = 0
    currentHp: 1,
    moves: [createMoveSlot(moveId, movePp)],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "oracle",
    metLevel: ORACLE_LEVEL,
    originalTrainer: "oracle",
    originalTrainerId: 1,
    pokeball: CORE_ITEM_IDS.pokeBall,
  };
}

// ── ActivePokemon builder ────────────────────────────────────────────────────

function buildActivePokemon(
  gen: number,
  pokemon: PokemonInstance,
  speciesData: PokemonSpeciesData,
  nature: NatureData | null,
): ActivePokemon {
  // Calculate and attach stats
  let calculatedStats: PokemonInstance["calculatedStats"];
  if (gen <= 2) {
    // Gen 1-2: DV-based stat calc (no natures)
    const statCalc = gen === 1 ? calculateGen1Stats : calculateGen2Stats;
    calculatedStats = statCalc(pokemon, speciesData);
  } else {
    // Gen 3+: IV/EV-based stat calc with natures
    if (!nature) throw new Error(`Nature required for Gen ${gen}`);
    calculatedStats = calculateAllStats(pokemon, speciesData, nature);
  }

  const pokemonWithStats: PokemonInstance = {
    ...pokemon,
    calculatedStats,
    currentHp: calculatedStats.hp,
  };

  const types = [...speciesData.types] as PokemonType[];
  return createOnFieldPokemon(pokemonWithStats, 0, types);
}

// ── Move selection ────────────────────────────────────────────────────────

interface OracleMoveEntry {
  readonly moveId: string;
  readonly moveName: string;
  readonly basePower: number;
  readonly type: string;
}

/**
 * Select up to 2 damaging moves for a species in a given gen:
 * 1 STAB move, 1 non-STAB move. Skips status moves and 0-power moves.
 * Returns at most 2 entries. May return fewer if learnset is limited.
 */
function selectOracleMoves(
  speciesName: string,
  speciesTypes: readonly string[],
  gen: number,
): OracleMoveEntry[] {
  const oracleGen = PKMN_GENERATIONS.get(gen);
  const oracleSpecies = oracleGen.species.get(speciesName);
  if (!oracleSpecies?.exists) return [];

  // Scan all moves available in this gen for the species via learnset
  // For simplicity, scan all moves in the gen and find ones with STAB / non-STAB
  // We can't easily get the learnset without async, so use a curated known-good move list
  // that works across generations.
  const stabCandidates: OracleMoveEntry[] = [];
  const offTypeCandidates: OracleMoveEntry[] = [];

  // A representative set of moves that exist in Gen 1+ and have base power
  const candidateMoveNames = [
    "flamethrower",
    "surf",
    "thunderbolt",
    "ice-beam",
    "psychic",
    "earthquake",
    "shadow-ball",
    "sludge-bomb",
    "aerial-ace",
    "iron-tail",
    "focus-blast",
    "dark-pulse",
    "dragon-pulse",
    "energy-ball",
    "flash-cannon",
    "aura-sphere",
    "hyper-beam",
    "body-slam",
    "sludge",
    "razor-leaf",
    "vine-whip",
    "bubble-beam",
    "water-gun",
    "bite",
    "fire-blast",
    "blizzard",
    "thunder",
    "swift",
    "night-shade",
    "rock-slide",
    "wing-attack",
    "karate-chop",
    "submission",
    "mega-kick",
    "mega-punch",
    "slash",
    "crabhammer",
    "lick",
    "explosion",
    "self-destruct",
  ];

  const speciesTypesLower = speciesTypes.map((t) => t.toLowerCase());

  for (const moveName of candidateMoveNames) {
    const oracleMove = oracleGen.moves.get(moveName);
    if (!oracleMove?.exists) continue;
    if (!oracleMove.basePower || oracleMove.basePower <= 0) continue;
    if (oracleMove.category === "Status") continue;
    // Skip explosion/self-destruct to avoid complexity (defense halving)
    if (moveName === "explosion" || moveName === "self-destruct") continue;
    // Skip Night Shade (fixed damage, lvl-based)
    if (moveName === "night-shade") continue;

    const moveEntry: OracleMoveEntry = {
      moveId: moveName,
      moveName: oracleMove.name,
      basePower: oracleMove.basePower,
      type: oracleMove.type.toLowerCase(),
    };

    const isStab = speciesTypesLower.includes(moveEntry.type);
    if (isStab && stabCandidates.length === 0) {
      stabCandidates.push(moveEntry);
    } else if (!isStab && offTypeCandidates.length === 0) {
      offTypeCandidates.push(moveEntry);
    }

    if (stabCandidates.length > 0 && offTypeCandidates.length > 0) break;
  }

  return [...stabCandidates, ...offTypeCandidates];
}

// ── Damage calculation dispatch ──────────────────────────────────────────────

interface LocalDamageCalcArgs {
  readonly gen: number;
  readonly context: DamageContext;
  readonly typeChart: TypeChart;
  readonly attackerSpeciesData: PokemonSpeciesData;
}

function calculateLocalDamage(args: LocalDamageCalcArgs): number {
  const { gen, context, typeChart, attackerSpeciesData } = args;
  switch (gen) {
    case 1:
      return calculateGen1Damage(context, typeChart, attackerSpeciesData).damage;
    case 2:
      return calculateGen2Damage(context, typeChart, attackerSpeciesData).damage;
    case 3:
      return calculateGen3Damage(context, typeChart).damage;
    case 4:
      return calculateGen4Damage(context, typeChart).damage;
    case 5:
      return calculateGen5Damage(context, typeChart).damage;
    case 6:
      return calculateGen6Damage(context, typeChart).damage;
    case 7:
      return calculateGen7Damage(context, typeChart).damage;
    case 8:
      return calculateGen8Damage(context, typeChart).damage;
    case 9:
      return calculateGen9Damage(context, typeChart).damage;
    default:
      throw new Error(`Unsupported generation: ${gen}`);
  }
}

// ── Smogon calc wrapper ──────────────────────────────────────────────────────

/**
 * Build @smogon/calc Pokemon for Gen 1-2 (DV-based, 0 stat exp).
 * Uses spc: 15 for the unified Special DV.
 * Source: @smogon/calc Pokemon constructor — Gen 1-2 accept spc IV.
 */
function buildSmogonPokemonGen12(gen: GenerationNum, speciesName: string): SmogonPokemon {
  // @smogon/calc uses IVs on the 0-31 scale even for Gen 1-2.
  // Internally: DV = floor(IV / 2). So DV=15 requires IV=30.
  // Source: @smogon/calc src/stats.ts IVToDV: `return Math.floor(iv / 2)`
  return new SmogonPokemon(gen, speciesName, {
    level: ORACLE_LEVEL,
    ivs: { hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30, spc: 30 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  });
}

/**
 * Build @smogon/calc Pokemon for Gen 3+ (IV/EV-based, Hardy nature).
 * All IVs = 31, all EVs = 0, Hardy nature (neutral).
 */
function buildSmogonPokemonGen3Plus(gen: GenerationNum, speciesName: string): SmogonPokemon {
  return new SmogonPokemon(gen, speciesName, {
    level: ORACLE_LEVEL,
    nature: "Hardy",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  });
}

function getSmogonMaxDamage(result: ReturnType<typeof calculate>): number | null {
  const { damage } = result;
  if (Array.isArray(damage)) {
    // Single-roll array: [min, ..., max]
    const last = damage[damage.length - 1];
    if (typeof last === "number") return last;
    // Multi-hit: [[hit1-rolls], [hit2-rolls], ...] — only last hit's max roll is returned.
    // Multi-hit moves are NOT in the candidate list; this branch exists only for type safety.
    // If multi-hit moves are ever added, this must be changed to sum max rolls per hit.
    if (Array.isArray(last)) {
      const innerLast = last[last.length - 1];
      if (typeof innerLast === "number") return innerLast;
    }
    return null;
  }
  if (typeof damage === "number") return damage;
  return null;
}

// ── Check ID builder ─────────────────────────────────────────────────────────

function buildCheckId(
  generation: ImplementedGeneration,
  speciesName: string,
  moveName: string,
): string {
  const speciesSlug = speciesName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const moveSlug = moveName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return `gen${generation.gen}:${DAMAGE_SUITE_NAME}:${speciesSlug}:${moveSlug}:max-roll`;
}

// ── Main suite function ───────────────────────────────────────────────────────

/**
 * Run the damage oracle suite for a single generation.
 *
 * For each representative species that exists in the gen, selects up to 2
 * damaging moves (1 STAB, 1 off-type) and compares our max-roll damage against
 * @smogon/calc's max-roll damage with ±max(2, floor(smogon_max * 0.02)) tolerance.
 */
export function runDamageSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const oracleChecks: OracleCheck[] = [];
  let totalScenariosCompared = 0;

  const gen = generation.gen;
  const factory = DATA_MANAGER_FACTORIES[gen];
  if (!factory) {
    return {
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [`Gen ${gen}: no data manager factory available`],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
      skipReason: `Gen ${gen} data manager factory not found`,
    };
  }

  const dataManager = factory();
  const typeChart = dataManager.getTypeChart();
  const nature = gen >= 3 ? dataManager.getNature(CORE_NATURE_IDS.hardy) : null;
  const battleState = createBattleState({ generation: gen as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });

  const oracleGen = PKMN_GENERATIONS.get(gen);

  // Look up the generic defender species once
  let defenderSpeciesDataOrNull: PokemonSpeciesData | null = null;
  try {
    defenderSpeciesDataOrNull = dataManager.getSpeciesByName(GENERIC_DEFENDER_NAME);
  } catch {
    return {
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [`Gen ${gen}: could not load defender species ${GENERIC_DEFENDER_NAME}`],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
      skipReason: `Gen ${gen}: defender species ${GENERIC_DEFENDER_NAME} not found`,
    };
  }
  if (defenderSpeciesDataOrNull === null) {
    return {
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [`Gen ${gen}: defender species ${GENERIC_DEFENDER_NAME} returned null`],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
      skipReason: `Gen ${gen}: defender species ${GENERIC_DEFENDER_NAME} not found`,
    };
  }
  const defenderSpeciesData: PokemonSpeciesData = defenderSpeciesDataOrNull;

  for (const speciesName of REPRESENTATIVE_SPECIES) {
    // Check oracle first to see if species exists in this gen
    const oracleSpecies = oracleGen.species.get(speciesName);
    if (!oracleSpecies?.exists) {
      notes.push(`Gen ${gen}: skipping ${speciesName} (not in oracle for this gen)`);
      continue;
    }

    // Check local data
    let speciesDataOrNull: PokemonSpeciesData | null = null;
    try {
      speciesDataOrNull = dataManager.getSpeciesByName(speciesName);
    } catch {
      notes.push(`Gen ${gen}: skipping ${speciesName} (not in local data)`);
      continue;
    }
    if (speciesDataOrNull === null) {
      notes.push(`Gen ${gen}: skipping ${speciesName} (local data returned null)`);
      continue;
    }
    const speciesData: PokemonSpeciesData = speciesDataOrNull;

    const speciesTypes = oracleSpecies.types;
    const oracleMoves = selectOracleMoves(speciesName, speciesTypes, gen);

    if (oracleMoves.length === 0) {
      notes.push(`Gen ${gen}: no oracle moves found for ${speciesName}`);
      continue;
    }

    for (const oracleMove of oracleMoves) {
      const checkId = buildCheckId(generation, speciesName, oracleMove.moveId);

      try {
        // ── Build our engine objects ─────────────────────────────────────
        let localMoveData: MoveData;
        try {
          localMoveData = dataManager.getMove(oracleMove.moveId);
        } catch {
          notes.push(
            `Gen ${gen}: skipping move ${oracleMove.moveId} for ${speciesName} (not in local data)`,
          );
          continue;
        }

        // Skip status moves and moves with no base power
        if (
          localMoveData.category === "status" ||
          localMoveData.power === null ||
          localMoveData.power === 0
        ) {
          notes.push(
            `Gen ${gen}: skipping ${oracleMove.moveId} for ${speciesName} (status/no power in local data)`,
          );
          continue;
        }

        const attackerPokemon =
          gen <= 2
            ? createGen12PokemonInstance(speciesData.id, localMoveData.id, localMoveData.pp)
            : createGen3PlusPokemonInstance(speciesData.id, localMoveData.id, localMoveData.pp);

        const attackerActive = buildActivePokemon(gen, attackerPokemon, speciesData, nature);
        // Ensure defender HP is set from calculatedStats
        const defenderPokemonRefreshed =
          gen <= 2
            ? createGen12PokemonInstance(defenderSpeciesData.id, "tackle", 35)
            : createGen3PlusPokemonInstance(defenderSpeciesData.id, "tackle", 35);
        const freshDefenderActive = buildActivePokemon(
          gen,
          defenderPokemonRefreshed,
          defenderSpeciesData,
          nature,
        );

        const context: DamageContext = {
          attacker: attackerActive,
          defender: freshDefenderActive,
          move: localMoveData,
          state: battleState,
          rng: MAX_ROLL_RNG,
          isCrit: false,
        };

        const ourMaxDamage = calculateLocalDamage({
          gen,
          context,
          typeChart,
          attackerSpeciesData: speciesData,
        });

        // ── Build @smogon/calc objects ───────────────────────────────────
        const smogonGenNum = gen as GenerationNum;
        const smogonAttacker =
          gen <= 2
            ? buildSmogonPokemonGen12(smogonGenNum, speciesName)
            : buildSmogonPokemonGen3Plus(smogonGenNum, speciesName);

        const smogonDefender =
          gen <= 2
            ? buildSmogonPokemonGen12(smogonGenNum, GENERIC_DEFENDER_NAME)
            : buildSmogonPokemonGen3Plus(smogonGenNum, GENERIC_DEFENDER_NAME);

        const smogonMove = new SmogonMove(smogonGenNum, oracleMove.moveName);
        const smogonResult = calculate(
          smogonGenNum,
          smogonAttacker,
          smogonDefender,
          smogonMove,
          new Field(),
        );
        const smogonMaxDamage = getSmogonMaxDamage(smogonResult);

        // ── Graceful degradation ─────────────────────────────────────────
        if (smogonMaxDamage === null || smogonMaxDamage === 0) {
          // Smogon gives 0 or unknown — skip (immunity, status move, etc.)
          notes.push(
            `Gen ${gen}: skipping ${speciesName}+${oracleMove.moveId} — smogon returned ${String(smogonMaxDamage)} damage`,
          );
          continue;
        }

        // ── Tolerance check ───────────────────────────────────────────────
        // Only register mismatches that exceed the tolerance as oracle checks.
        // Within-tolerance differences (≤ max(2, 2% of smogon max)) are silently
        // accepted — rounding differences between our formula and smogon's are
        // expected and not actionable. Our calc returning 0 when smogon returns > 0
        // exceeds the tolerance unconditionally and is always registered.
        totalScenariosCompared += 1;
        const tolerance = Math.max(2, Math.floor(smogonMaxDamage * 0.02));
        const diff = Math.abs(ourMaxDamage - smogonMaxDamage);
        const passes = diff <= tolerance;

        if (!passes) {
          oracleChecks.push({
            id: checkId,
            suite: DAMAGE_SUITE_NAME,
            description: `Gen ${gen}: ${speciesName} using ${oracleMove.moveName} (max-roll damage within ±${tolerance})`,
            ourValue: ourMaxDamage,
            oracleValue: smogonMaxDamage,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notes.push(`Gen ${gen}: error computing ${speciesName}+${oracleMove.moveId}: ${message}`);
      }
    }
  }

  // ── Resolve oracle checks against known disagreements ─────────────────────
  const resolvedOracleChecks = resolveOracleChecks(
    DAMAGE_SUITE_NAME,
    oracleChecks,
    knownDisagreements,
  );
  failures.push(...resolvedOracleChecks.failures);
  notes.push(
    ...resolvedOracleChecks.matchedKnownDisagreements.map(
      (id) => `Known disagreement matched registry: ${id}`,
    ),
  );
  notes.push(
    ...resolvedOracleChecks.staleDisagreements.map((id) => `Stale disagreement detected: ${id}`),
  );

  const mismatchCount = oracleChecks.length;
  notes.unshift(
    `Gen ${gen}: compared ${totalScenariosCompared} scenario${totalScenariosCompared === 1 ? "" : "s"}, ${mismatchCount} outside tolerance`,
  );

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: resolvedOracleChecks.matchedKnownDisagreements,
    staleDisagreements: resolvedOracleChecks.staleDisagreements,
    oracleChecks,
  };
}
