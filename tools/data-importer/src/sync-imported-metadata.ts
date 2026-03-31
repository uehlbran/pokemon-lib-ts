import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Specie } from "@pkmn/data";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { CORE_MOVE_EFFECT_TARGETS } from "@pokemon-lib-ts/core";

interface ShowdownAbilities {
  "0"?: string;
  "1"?: string;
  H?: string;
  S?: string;
}

interface LocalMove {
  id: string;
  target?: string;
  effect?: {
    type?: string;
    target?: string;
  } | null;
  critRatio?: number;
}

interface LocalItem {
  id: string;
  flingPower?: number;
  flingEffect?: string;
}

interface LocalSpecies {
  name: string;
  abilities: {
    normal: string[];
    hidden: string | null;
    special?: string | null;
  };
}

const gens = new Generations(Dex);
const repoRoot = resolve(import.meta.dirname ?? __dirname, "../../..");

function parseGenerations(argv: string[]): number[] {
  const genArg = argv.find((arg) => arg.startsWith("--gen="));
  if (!genArg) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  const generations = genArg
    .split("=")[1]
    ?.split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 9);

  if (!generations || generations.length === 0) {
    throw new Error(`Invalid --gen argument "${genArg}"`);
  }

  return generations;
}

function toKebab(value: string): string {
  return value
    .replace(/['']/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function moveIdToKebab(_showdownId: string, displayName: string): string {
  return displayName
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function mapTarget(sdTarget: string): string {
  const targetMap: Record<string, string> = {
    normal: "adjacent-foe",
    allAdjacentFoes: "all-adjacent-foes",
    allAdjacent: "all-adjacent",
    self: "self",
    allySide: "user-field",
    allyTeam: "user-and-allies",
    foeSide: "foe-field",
    all: "entire-field",
    randomNormal: "random-foe",
    any: "any",
    scripted: "adjacent-foe",
    adjacentAlly: "adjacent-ally",
    adjacentAllyOrSelf: "self",
    adjacentFoe: "adjacent-foe",
    allies: "user-and-allies",
  };
  return targetMap[sdTarget] ?? "adjacent-foe";
}

function mapStatChangeTarget(localTarget: string, moveId: string, showdownTarget: string): string {
  const targetMap: Record<string, string> = {
    self: CORE_MOVE_EFFECT_TARGETS.self,
    "adjacent-ally": CORE_MOVE_EFFECT_TARGETS.ally,
    "adjacent-foe": CORE_MOVE_EFFECT_TARGETS.foe,
    "all-adjacent-foes": CORE_MOVE_EFFECT_TARGETS.foe,
    "all-adjacent": CORE_MOVE_EFFECT_TARGETS.foe,
    "user-field": CORE_MOVE_EFFECT_TARGETS.foe,
    "user-and-allies": CORE_MOVE_EFFECT_TARGETS.self,
    "foe-field": CORE_MOVE_EFFECT_TARGETS.foe,
    "entire-field": CORE_MOVE_EFFECT_TARGETS.foe,
    "random-foe": CORE_MOVE_EFFECT_TARGETS.foe,
    any: CORE_MOVE_EFFECT_TARGETS.foe,
  };

  const mapped = targetMap[localTarget];
  if (!mapped) {
    throw new Error(
      `Unknown move target for stat-change effect mapping: "${localTarget}" (move: ${moveId}, Showdown target: ${showdownTarget})`,
    );
  }

  return mapped;
}

function mapStatus(sdStatus: string): string | null {
  const statusMap: Record<string, string> = {
    brn: "burn",
    par: "paralysis",
    psn: "poison",
    tox: "badly-poisoned",
    slp: "sleep",
    frz: "freeze",
  };
  return statusMap[sdStatus] ?? null;
}

function mapVolatile(sdVolatile: string): string | null {
  const volatileMap: Record<string, string> = {
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
  return volatileMap[sdVolatile] ?? null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function findBaseSpecies(genNum: number, localSpecies: LocalSpecies): Specie | undefined {
  const generation = gens.get(genNum as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9);
  const direct = generation.species.get(localSpecies.name);
  if (direct?.exists && !direct.forme) {
    return direct;
  }

  for (const species of generation.species) {
    if (species.exists && !species.forme && species.id === localSpecies.name) {
      return species;
    }
  }

  return undefined;
}

function syncMoves(genNum: number, filePath: string): void {
  const generation = gens.get(genNum as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9);
  const moves = readJson<LocalMove[]>(filePath);
  const movesById = new Map(moves.map((move) => [move.id, move] as const));

  for (const move of generation.moves) {
    if (!move.exists || move.isNonstandard || move.isMax || move.isZ) {
      continue;
    }

    const localMove = movesById.get(moveIdToKebab(move.id, move.name));
    if (!localMove) {
      continue;
    }

    const localEffect = localMove.effect;
    localMove.target = mapTarget(move.target);
    if (move.boosts && !move.basePower && localEffect?.type === "stat-change") {
      localEffect.target = mapStatChangeTarget(localMove.target, move.id, move.target);
    }

    if (typeof move.critRatio === "number" && move.critRatio > 1) {
      localMove.critRatio = move.critRatio - 1;
    } else {
      delete localMove.critRatio;
    }
  }

  writeJson(filePath, moves);
}

function syncItems(genNum: number, filePath: string): void {
  const generation = gens.get(genNum as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9);
  const items = readJson<LocalItem[]>(filePath);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  for (const item of generation.items) {
    if (!item.exists || item.isNonstandard) {
      continue;
    }

    const localItem = itemsById.get(toKebab(item.name));
    if (!localItem) {
      continue;
    }

    if (typeof item.fling?.basePower === "number") {
      localItem.flingPower = item.fling.basePower;
    } else {
      delete localItem.flingPower;
    }

    if (item.fling?.status) {
      localItem.flingEffect = mapStatus(item.fling.status) ?? item.fling.status;
    } else if (item.fling?.volatileStatus) {
      localItem.flingEffect = mapVolatile(item.fling.volatileStatus) ?? item.fling.volatileStatus;
    } else {
      delete localItem.flingEffect;
    }
  }

  writeJson(filePath, items);
}

function syncPokemon(genNum: number, filePath: string): void {
  const pokemon = readJson<LocalSpecies[]>(filePath);

  for (const localSpecies of pokemon) {
    const species = findBaseSpecies(genNum, localSpecies);
    if (!species) {
      continue;
    }

    const abilities = species.abilities as ShowdownAbilities;
    if (abilities.S) {
      localSpecies.abilities.special = toKebab(abilities.S);
    } else {
      delete localSpecies.abilities.special;
    }
  }

  writeJson(filePath, pokemon);
}

function main(): void {
  const generations = parseGenerations(process.argv.slice(2));

  for (const genNum of generations) {
    const dataDir = join(repoRoot, "packages", `gen${genNum}`, "data");
    syncMoves(genNum, join(dataDir, "moves.json"));
    if (genNum >= 2) {
      syncItems(genNum, join(dataDir, "items.json"));
    }
    syncPokemon(genNum, join(dataDir, "pokemon.json"));
    console.log(`Synced imported metadata for Gen ${genNum}`);
  }
}

main();
