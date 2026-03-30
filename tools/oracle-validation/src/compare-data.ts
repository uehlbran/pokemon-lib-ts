import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { GEN_NUMBERS } from "@pokemon-lib-ts/core";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

interface LocalSpecies {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly types: readonly string[];
  readonly baseStats: Record<string, number>;
  readonly abilities: {
    readonly normal: readonly string[];
    readonly hidden: string | null;
    readonly special?: string | null;
  };
}

interface LocalItem {
  readonly id: string;
  readonly flingPower?: number;
  readonly flingEffect?: string;
}

interface LocalMoveEffect {
  readonly type?: string;
  readonly target?: string;
}

interface LocalMove {
  readonly id: string;
  readonly target?: string;
  readonly effect?: LocalMoveEffect | null;
  readonly critRatio?: number;
}

/**
 * Maps every Showdown move target to the expected StatChangeEffect.target value.
 * Every entry must be named explicitly — no silent default fallback.
 * Source: @pkmn/data move.target vocabulary.
 */
export const STAT_CHANGE_TARGET_MAP: Record<string, string> = {
  self: "self",
  adjacentAllyOrSelf: "self",
  adjacentAlly: "ally",
  normal: "foe",
  adjacentFoe: "foe",
  allAdjacentFoes: "foe",
  allAdjacent: "foe",
  allySide: "self", // sets condition on user's side — no pure stat-change move uses this today
  allyTeam: "self", // targets user's full team — no pure stat-change move uses this today
  foeSide: "foe",
  all: "foe",
  randomNormal: "foe",
  any: "foe",
  scripted: "foe",
  allies: "self",
};

export function mapStatChangeTarget(showdownTarget: string): string {
  const mapped = STAT_CHANGE_TARGET_MAP[showdownTarget];
  if (mapped === undefined) {
    throw new Error(
      `Unknown Showdown target for stat-change mapping: "${showdownTarget}" — add explicit handling to STAT_CHANGE_TARGET_MAP in compare-data.ts`,
    );
  }
  return mapped;
}

type LocalTypeChart = Record<string, Record<string, number>>;
interface OracleSpeciesRecord {
  readonly id: string;
  readonly name: string;
  readonly types: readonly string[];
  readonly baseSpecies: string;
}

const ORACLE_GENERATIONS = new Generations(Dex);
const DATA_SUITE_NAME = "data";

function normalizeSpeciesId(id: string): string {
  return id.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function normalizeKebab(value: string): string {
  return value
    .replace(/['']/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function normalizeMoveId(value: string): string {
  const normalized = normalizeSpeciesId(normalizeKebab(value));
  return normalized === "visegrip" ? "vicegrip" : normalized;
}

function isLocalStatChangeMove(move: LocalMove): boolean {
  return move.effect?.type === "stat-change";
}

function mapExpectedFlingEffect(item: {
  fling?: { status?: string; volatileStatus?: string };
}): string | null {
  if (item.fling?.status) {
    const statuses: Record<string, string> = {
      brn: "burn",
      par: "paralysis",
      psn: "poison",
      tox: "badly-poisoned",
      slp: "sleep",
      frz: "freeze",
    };
    return statuses[item.fling.status] ?? item.fling.status;
  }

  if (item.fling?.volatileStatus) {
    const volatiles: Record<string, string> = {
      confusion: "confusion",
      flinch: "flinch",
      attract: "attract",
      encore: "encore",
      embargo: "embargo",
      healblock: "heal-block",
      ingrain: "ingrain",
      taunt: "taunt",
      telekinesis: "telekinesis",
      torment: "torment",
    };
    return volatiles[item.fling.volatileStatus] ?? item.fling.volatileStatus;
  }

  return null;
}

function normalizeOracleSpecies(generation: ImplementedGeneration): OracleSpeciesRecord[] {
  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  return [...oracle.species]
    .filter((species) => species.baseSpecies === species.name)
    .map((species) => ({
      id: species.id,
      name: species.name,
      types: species.types.map((type) => type.toLowerCase()),
      baseSpecies: species.baseSpecies,
    }));
}

function buildCheckId(
  generation: ImplementedGeneration,
  scope: string,
  target: string,
  field: string,
): string {
  return `gen${generation.gen}:${DATA_SUITE_NAME}:${scope}:${target}:${field}`;
}

export function runDataSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const oracleChecks: OracleCheck[] = [];

  const localPokemon = JSON.parse(
    readFileSync(join(generation.dataDir, "pokemon.json"), "utf8"),
  ) as LocalSpecies[];
  const localMoves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];
  const itemsPath = join(generation.dataDir, "items.json");
  const localItems = existsSync(itemsPath)
    ? (JSON.parse(readFileSync(itemsPath, "utf8")) as LocalItem[])
    : [];
  const localTypeChart = JSON.parse(
    readFileSync(join(generation.dataDir, "type-chart.json"), "utf8"),
  ) as LocalTypeChart;
  const localMovesById = new Map(
    localMoves.map((move) => [normalizeMoveId(move.id), move] as const),
  );
  const localItemsById = new Map(
    localItems.map((item) => [normalizeSpeciesId(item.id), item] as const),
  );
  const localSpeciesById = new Map(
    localPokemon.map((species) => [normalizeSpeciesId(species.name), species] as const),
  );

  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  const oracleMovesById = new Map(
    [...oracle.moves]
      .filter((move) => move.exists && !move.isNonstandard && !move.isMax && !move.isZ)
      .map((move) => [normalizeMoveId(move.name), move] as const),
  );
  const oracleSpecies = normalizeOracleSpecies(generation);
  const oracleSpeciesById = new Map(
    oracleSpecies.map((species) => [normalizeSpeciesId(species.id), species] as const),
  );
  const oracleTypeNames = [...oracle.types]
    .map((type) => type.name.toLowerCase())
    .filter((type) => type !== "???");
  const oracleFormCount = [...oracle.species].length - oracleSpecies.length;

  oracleChecks.push({
    id: buildCheckId(generation, "species", "base", "count"),
    suite: DATA_SUITE_NAME,
    description: "Base-species count matches the oracle base-species count",
    ourValue: localPokemon.length,
    oracleValue: oracleSpecies.length,
  });

  for (const species of localPokemon) {
    const oracleSpeciesEntry = oracleSpeciesById.get(normalizeSpeciesId(species.name));
    oracleChecks.push({
      id: buildCheckId(generation, "species", normalizeSpeciesId(species.name), "exists"),
      suite: DATA_SUITE_NAME,
      description: `Species ${species.name} exists in the oracle base-species dataset`,
      ourValue: true,
      oracleValue: oracleSpeciesEntry !== undefined,
    });
    if (!oracleSpeciesEntry) {
      continue;
    }

    const localTypes = [...species.types];
    const oracleTypes = [...oracleSpeciesEntry.types];
    oracleChecks.push({
      id: buildCheckId(generation, "species", normalizeSpeciesId(species.name), "types"),
      suite: DATA_SUITE_NAME,
      description: `Species ${species.name} types match the oracle`,
      ourValue: localTypes,
      oracleValue: oracleTypes,
    });
  }

  for (const move of localMoves) {
    const moveId = normalizeMoveId(move.id);
    oracleChecks.push({
      id: buildCheckId(generation, "moves", moveId, "exists"),
      suite: DATA_SUITE_NAME,
      description: `Move ${move.id} exists in the oracle move dataset`,
      ourValue: true,
      oracleValue: oracleMovesById.has(moveId),
    });
  }

  for (const move of oracle.moves) {
    if (!move.exists || move.isNonstandard || move.isMax || move.isZ) {
      continue;
    }

    const localMove = localMovesById.get(normalizeMoveId(move.name));
    if (!localMove) {
      continue;
    }

    if (move.boosts && !move.basePower && isLocalStatChangeMove(localMove)) {
      oracleChecks.push({
        id: buildCheckId(generation, "moves", normalizeSpeciesId(move.name), "stat-change-target"),
        suite: DATA_SUITE_NAME,
        description: `Move ${move.name} preserves the correct stat-change target`,
        ourValue: localMove.effect?.target ?? null,
        oracleValue: mapStatChangeTarget(move.target),
      });
    }

    if (typeof move.critRatio === "number" && move.critRatio > 1) {
      oracleChecks.push({
        id: buildCheckId(generation, "moves", normalizeSpeciesId(move.name), "crit-ratio"),
        suite: DATA_SUITE_NAME,
        description: `Move ${move.name} preserves high-crit metadata`,
        ourValue: localMove.critRatio ?? null,
        oracleValue: move.critRatio - 1,
      });
    }
  }

  for (const item of oracle.items) {
    if (!item.exists || item.isNonstandard) {
      continue;
    }

    if (generation.gen < 4 || !item.fling) {
      continue;
    }

    const localItem = localItemsById.get(normalizeSpeciesId(normalizeKebab(item.name)));
    if (!localItem) {
      continue;
    }

    oracleChecks.push({
      id: buildCheckId(generation, "items", normalizeSpeciesId(item.name), "fling-power"),
      suite: DATA_SUITE_NAME,
      description: `Item ${item.name} preserves Fling base power`,
      ourValue: localItem.flingPower ?? null,
      oracleValue: item.fling.basePower ?? null,
    });

    const expectedFlingEffect = mapExpectedFlingEffect(item);
    if (expectedFlingEffect !== null) {
      oracleChecks.push({
        id: buildCheckId(generation, "items", normalizeSpeciesId(item.name), "fling-effect"),
        suite: DATA_SUITE_NAME,
        description: `Item ${item.name} preserves Fling side-effect metadata`,
        ourValue: localItem.flingEffect ?? null,
        oracleValue: expectedFlingEffect,
      });
    }
  }

  for (const species of oracle.species) {
    if (!species.exists || species.baseSpecies !== species.name) {
      continue;
    }

    const abilities = species.abilities as { S?: string };
    if (!abilities.S) {
      continue;
    }

    const localSpecies = localSpeciesById.get(normalizeSpeciesId(species.id));
    oracleChecks.push({
      id: buildCheckId(generation, "species", normalizeSpeciesId(species.name), "special-ability"),
      suite: DATA_SUITE_NAME,
      description: `Species ${species.name} preserves special ability-slot metadata`,
      ourValue: localSpecies?.abilities.special ?? null,
      oracleValue: normalizeKebab(abilities.S),
    });
  }

  const localTypes = Object.keys(localTypeChart).sort();
  const expectedTypeCount =
    generation.gen === GEN_NUMBERS.gen1 ? 15 : generation.gen <= GEN_NUMBERS.gen5 ? 17 : 18;
  if (localTypes.length !== expectedTypeCount) {
    failures.push(
      `Gen ${generation.gen}: type count mismatch (ours=${localTypes.length}, expected=${expectedTypeCount})`,
    );
  }

  const oracleOnlyTypes = oracleTypeNames.filter((type) => !localTypes.includes(type));
  if (oracleOnlyTypes.length > 0) {
    notes.push(`Gen ${generation.gen}: oracle-only types ${oracleOnlyTypes.join(", ")}`);
  }
  if (oracleFormCount > 0) {
    notes.push(
      `Gen ${generation.gen}: ignored ${oracleFormCount} oracle alt-form entries to compare against base-species data`,
    );
  }

  for (const attacker of localTypes) {
    for (const defender of localTypes) {
      const ours = localTypeChart[attacker]?.[defender];
      if (typeof ours !== "number") {
        failures.push(`Gen ${generation.gen}: missing type-chart entry ${attacker} -> ${defender}`);
        continue;
      }

      const oracleAttacker = oracle.types.get(attacker);
      const oracleDefender = oracle.types.get(defender);
      if (!oracleAttacker?.exists || !oracleDefender?.exists) {
        failures.push(
          `Gen ${generation.gen}: oracle missing type metadata for ${attacker} -> ${defender}`,
        );
        continue;
      }
      const oracleValue = oracleAttacker.effectiveness[oracleDefender.name];

      oracleChecks.push({
        id: buildCheckId(generation, "type-chart", `${attacker}-to-${defender}`, "effectiveness"),
        suite: DATA_SUITE_NAME,
        description: `Type effectiveness ${attacker} -> ${defender} matches the oracle`,
        ourValue: ours,
        oracleValue,
      });
    }
  }

  // Stat-change target checks: verify effect.target on pure stat-change moves matches oracle.
  // Uses exhaustive STAT_CHANGE_TARGET_MAP — no silent default. Unknown targets throw.
  for (const oracleMove of oracle.moves) {
    if (!oracleMove.boosts || oracleMove.basePower) continue;
    const moveId = oracleMove.id;
    const localMove = localMovesById.get(moveId);
    if (!localMove) continue;
    if (localMove.effect?.type !== "stat-change") continue;

    let expectedTarget: string;
    try {
      expectedTarget = mapStatChangeTarget(oracleMove.target);
    } catch {
      failures.push(
        `Gen ${generation.gen}: unknown oracle target "${oracleMove.target}" for move ${moveId} — update STAT_CHANGE_TARGET_MAP`,
      );
      continue;
    }

    oracleChecks.push({
      id: buildCheckId(generation, "moves", moveId, "stat-change-target"),
      suite: DATA_SUITE_NAME,
      description: `Move ${moveId} stat-change effect.target matches oracle (oracle target: ${oracleMove.target})`,
      ourValue: localMove.effect?.target ?? null,
      oracleValue: expectedTarget,
    });
  }

  const resolvedOracleChecks = resolveOracleChecks(
    DATA_SUITE_NAME,
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
