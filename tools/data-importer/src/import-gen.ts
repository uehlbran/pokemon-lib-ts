/**
 * Reusable data import script for generating per-gen JSON data files.
 *
 * Usage: npx tsx tools/data-importer/src/import-gen.ts --gen=N
 *
 * Sources:
 *   - @pkmn/dex + @pkmn/data for species, moves, types, items, learnsets
 *   - PokeAPI (https://pokeapi.co) for metadata not in Showdown:
 *     catchRate, baseExp, evYield, expGroup, height, baseFriendship
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Generations } from "@pkmn/data";
import type { Generation, Item, Move, Specie, Type } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

// ---------------------------------------------------------------------------
// Local interfaces for typed casts
// ---------------------------------------------------------------------------

interface ShowdownAbilities {
  "0"?: string;
  "1"?: string;
  H?: string;
  S?: string;
}

interface WithId {
  id: string;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const genArg = process.argv.find((a) => a.startsWith("--gen="));
if (!genArg) {
  console.error("Usage: npx tsx import-gen.ts --gen=N");
  process.exit(1);
}
const GEN_NUM = Number(genArg.split("=")[1]);
if (GEN_NUM < 1 || GEN_NUM > 9 || !Number.isInteger(GEN_NUM)) {
  console.error(`Invalid generation: ${GEN_NUM}. Must be 1-9.`);
  process.exit(1);
}

// National dex ranges (cumulative — each gen includes all prior Pokemon)
const DEX_RANGES: Record<number, { start: number; end: number }> = {
  1: { start: 1, end: 151 },
  2: { start: 1, end: 251 },
  3: { start: 1, end: 386 },
  4: { start: 1, end: 493 },
  5: { start: 1, end: 649 },
  6: { start: 1, end: 721 },
  7: { start: 1, end: 809 },
  8: { start: 1, end: 905 },
  9: { start: 1, end: 1025 },
};

const dexRange = DEX_RANGES[GEN_NUM];
const OUTPUT_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  `../../../packages/gen${GEN_NUM}/data`,
);

// ---------------------------------------------------------------------------
// Initialise @pkmn
// ---------------------------------------------------------------------------

const gens = new Generations(Dex);
const gen = gens.get(GEN_NUM as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9);

// ---------------------------------------------------------------------------
// PokeAPI helper — fetches metadata @pkmn/dex doesn't have
// ---------------------------------------------------------------------------

interface PokeApiSpeciesData {
  capture_rate: number;
  base_happiness: number;
  growth_rate: { name: string };
}

interface PokeApiPokemonData {
  base_experience: number;
  height: number; // decimetres
  weight: number; // hectograms
  stats: Array<{
    base_stat: number;
    effort: number;
    stat: { name: string };
  }>;
}

const API_DELAY_MS = 80; // ~12.5 req/s, well under PokeAPI rate limit

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

interface SpeciesMetadata {
  catchRate: number;
  baseExp: number;
  expGroup: string;
  evYield: Record<string, number>;
  height: number; // metres
  weight: number; // kg (fallback — prefer @pkmn/dex's weightkg)
  baseFriendship: number;
}

const GROWTH_RATE_MAP: Record<string, string> = {
  "medium-fast": "medium-fast",
  "medium-slow": "medium-slow",
  medium: "medium-fast",
  fast: "fast",
  slow: "slow",
  erratic: "erratic",
  fluctuating: "fluctuating",
};

const STAT_NAME_MAP: Record<string, string> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "spAttack",
  "special-defense": "spDefense",
  speed: "speed",
};

async function fetchSpeciesMetadata(dexNum: number): Promise<SpeciesMetadata> {
  const [speciesData, pokemonData] = await Promise.all([
    fetchJson<PokeApiSpeciesData>(`https://pokeapi.co/api/v2/pokemon-species/${dexNum}`),
    fetchJson<PokeApiPokemonData>(`https://pokeapi.co/api/v2/pokemon/${dexNum}`),
  ]);

  const evYield: Record<string, number> = {};
  for (const stat of pokemonData.stats) {
    if (stat.effort > 0) {
      const mapped = STAT_NAME_MAP[stat.stat.name];
      if (mapped) evYield[mapped] = stat.effort;
    }
  }

  return {
    catchRate: speciesData.capture_rate,
    baseExp: pokemonData.base_experience ?? 0,
    expGroup: GROWTH_RATE_MAP[speciesData.growth_rate.name] ?? speciesData.growth_rate.name,
    evYield,
    height: pokemonData.height / 10, // dm → m
    weight: pokemonData.weight / 10, // hg → kg
    baseFriendship: speciesData.base_happiness ?? 70,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert PascalCase/camelCase to kebab-case */
function toKebab(str: string): string {
  return str
    .replace(/['']/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** Convert Showdown move ID (lowercasenoseparators) to kebab-case */
function moveIdToKebab(showdownId: string, displayName: string): string {
  // Use displayName for reliable kebab conversion
  return displayName
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Showdown target → our MoveTarget */
function mapTarget(sdTarget: string): string {
  const TARGET_MAP: Record<string, string> = {
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
    scripted: "adjacent-foe", // Counter, Mirror Coat, etc.
    adjacentAlly: "adjacent-ally",
    adjacentAllyOrSelf: "self",
    adjacentFoe: "adjacent-foe",
  };
  return TARGET_MAP[sdTarget] ?? "adjacent-foe";
}

/**
 * In Gens 1-3, physical/special is determined by type, not per-move.
 * Physical types: normal, fighting, flying, ground, rock, bug, ghost, poison, steel
 * Special types: fire, water, electric, grass, ice, psychic, dragon, dark
 */
const PHYSICAL_TYPES = new Set([
  "normal",
  "fighting",
  "flying",
  "ground",
  "rock",
  "bug",
  "ghost",
  "poison",
  "steel",
]);

function getTypeBasedCategory(type: string, sdCategory: string): string {
  if (sdCategory.toLowerCase() === "status") return "status";
  const lowerType = type.toLowerCase();
  return PHYSICAL_TYPES.has(lowerType) ? "physical" : "special";
}

/** Map Showdown status abbreviations to our status names */
function mapStatus(sdStatus: string): string | null {
  const STATUS_MAP: Record<string, string> = {
    brn: "burn",
    par: "paralysis",
    psn: "poison",
    tox: "badly-poisoned",
    slp: "sleep",
    frz: "freeze",
  };
  return STATUS_MAP[sdStatus] ?? null;
}

/** Map Showdown volatile status to our volatile status */
function mapVolatile(sdVolatile: string): string | null {
  const VOLATILE_MAP: Record<string, string> = {
    confusion: "confusion",
    flinch: "flinch",
    attract: "infatuation",
    leechseed: "leech-seed",
    curse: "curse",
    nightmare: "nightmare",
    perishsong: "perish-song",
    taunt: "taunt",
    encore: "encore",
    disable: "disable",
    yawn: "yawn",
    substitute: "substitute",
    focusenergy: "focus-energy",
    protect: "protect",
    endure: "endure",
    partiallytrapped: "bound",
  };
  return VOLATILE_MAP[sdVolatile] ?? null;
}

/** Map Showdown boost stat names to our stat names */
function mapBoostStat(sdStat: string): string {
  const BOOST_MAP: Record<string, string> = {
    atk: "attack",
    def: "defense",
    spa: "spAttack",
    spd: "spDefense",
    spe: "speed",
    accuracy: "accuracy",
    evasion: "evasion",
  };
  return BOOST_MAP[sdStat] ?? sdStat;
}

/** Map Showdown weather names to our weather types */
function mapWeather(sdWeather: string): string | null {
  const lower = sdWeather.toLowerCase();
  if (lower === "raindance" || lower === "rain") return "rain";
  if (lower === "sunnyday" || lower === "sun") return "sun";
  if (lower === "sandstorm" || lower === "sand") return "sand";
  if (lower === "hail") return "hail";
  if (lower === "snow") return "snow";
  return null;
}

// ---------------------------------------------------------------------------
// Evolution helpers
// ---------------------------------------------------------------------------

interface EvolutionLink {
  speciesId: number;
  method: string;
  level?: number;
  item?: string;
  condition?: string;
  timeOfDay?: string;
  tradeItem?: string;
  knownMove?: string;
  minFriendship?: number;
}

function mapEvoType(sdEvoType: string | undefined, sdEvoCondition: string | undefined): string {
  if (!sdEvoType) return "level-up";
  switch (sdEvoType) {
    case "trade":
      return "trade";
    case "useItem":
      return "use-item";
    case "levelFriendship": {
      if (sdEvoCondition?.includes("day")) return "friendship-day";
      if (sdEvoCondition?.includes("night")) return "friendship-night";
      return "friendship";
    }
    case "levelMove":
      return "level-up";
    case "levelExtra":
      return "special";
    case "levelHold":
      return "level-up";
    default:
      return "special";
  }
}

function buildEvolutionLink(targetSpecies: Specie, gen: Generation): EvolutionLink {
  const method = mapEvoType(
    targetSpecies.evoType as string | undefined,
    targetSpecies.evoCondition as string | undefined,
  );

  const link: EvolutionLink = {
    speciesId: targetSpecies.num,
    method,
  };

  if (targetSpecies.evoLevel) {
    link.level = targetSpecies.evoLevel;
  }

  if (targetSpecies.evoItem) {
    link.item = toKebab(targetSpecies.evoItem);
  }

  if (method === "trade" && targetSpecies.evoItem) {
    link.tradeItem = toKebab(targetSpecies.evoItem);
    link.item = undefined;
  }

  if (method === "friendship" || method === "friendship-day" || method === "friendship-night") {
    link.minFriendship = 220; // Standard friendship threshold
  }

  if (method === "friendship-day") {
    link.timeOfDay = "day";
  } else if (method === "friendship-night") {
    link.timeOfDay = "night";
  }

  if (targetSpecies.evoMove) {
    link.knownMove = moveIdToKebab("", targetSpecies.evoMove);
  }

  if (targetSpecies.evoCondition && method !== "friendship-day" && method !== "friendship-night") {
    link.condition = targetSpecies.evoCondition;
  }

  return link;
}

// ---------------------------------------------------------------------------
// Move effect builder
// ---------------------------------------------------------------------------

function buildMoveEffect(move: Move): object | null {
  const effects: object[] = [];

  // Protect/Detect/Endure — check FIRST before volatile status
  if (move.id === "protect" || move.id === "detect") {
    return { type: "protect", variant: "standard" };
  }
  if (move.id === "endure") {
    return { type: "custom", handler: "endure" };
  }

  // Swagger — confusion + attack boost (special case)
  if (move.id === "swagger") {
    return {
      type: "multi",
      effects: [
        { type: "volatile-status", status: "confusion", chance: 100 },
        {
          type: "stat-change",
          changes: [{ stat: "attack", stages: 2 }],
          target: "foe",
          chance: 100,
        },
      ],
    };
  }

  // Flatter — confusion + spattack boost (Gen 3+)
  if (move.id === "flatter") {
    return {
      type: "multi",
      effects: [
        { type: "volatile-status", status: "confusion", chance: 100 },
        {
          type: "stat-change",
          changes: [{ stat: "spAttack", stages: 1 }],
          target: "foe",
          chance: 100,
        },
      ],
    };
  }

  // Fixed damage moves
  if (typeof move.damage === "number") {
    return { type: "fixed-damage", damage: move.damage };
  }
  if (move.damage === "level") {
    return { type: "level-damage" };
  }

  // OHKO moves
  if (move.ohko) {
    return { type: "ohko" };
  }

  // Multi-hit
  if (move.multihit) {
    const mh = move.multihit;
    if (Array.isArray(mh)) {
      return { type: "multi-hit", min: mh[0], max: mh[1] };
    }
    return { type: "multi-hit", min: mh, max: mh };
  }

  // Two-turn moves
  if (move.flags.charge) {
    const firstTurnMap: Record<string, string> = {
      solarbeam: "solar-beam",
      fly: "fly",
      dig: "dig",
      dive: "dive",
      bounce: "bounce",
      skulljbash: "charge",
      razorwind: "charge",
      skyattack: "charge",
    };
    const firstTurn = firstTurnMap[move.id] ?? "charge";
    effects.push({ type: "two-turn", firstTurn });
  }

  // Heal moves
  if (move.heal) {
    const [num, den] = move.heal;
    return { type: "heal", amount: num / den };
  }

  // Drain moves
  if (move.drain) {
    const [num, den] = move.drain;
    effects.push({ type: "drain", amount: num / den });
  }

  // Recoil moves
  if (move.recoil) {
    const [num, den] = move.recoil;
    effects.push({ type: "recoil", amount: num / den });
  }

  // Weather moves
  if (move.weather) {
    const weather = mapWeather(move.weather);
    if (weather) {
      return { type: "weather", weather, turns: 5 };
    }
  }

  // Status moves (guaranteed — e.g., Thunder Wave)
  if (move.status && !move.basePower) {
    const status = mapStatus(move.status);
    if (status) {
      return { type: "status-guaranteed", status };
    }
  }

  // Volatile status (guaranteed — e.g., Confuse Ray)
  if (move.volatileStatus && !move.basePower) {
    const vol = mapVolatile(move.volatileStatus);
    if (vol) {
      return { type: "volatile-status", status: vol, chance: 100 };
    }
  }

  // Self-boost moves (e.g., Swords Dance)
  if (move.boosts && !move.basePower) {
    const changes = Object.entries(move.boosts).map(([stat, stages]) => ({
      stat: mapBoostStat(stat),
      stages,
    }));
    return { type: "stat-change", changes, target: "self", chance: 100 };
  }

  // Entry hazards — check BEFORE screens
  if (move.sideCondition === "spikes") {
    return { type: "entry-hazard", hazard: "spikes" };
  }

  // Side condition (screens)
  if (move.sideCondition) {
    const screenMap: Record<string, string> = {
      reflect: "reflect",
      lightscreen: "light-screen",
      safeguard: "safeguard",
    };
    const screen = screenMap[move.sideCondition];
    if (screen === "reflect" || screen === "light-screen") {
      return { type: "screen", screen, turns: 5 };
    }
  }

  // Selfdestruct
  if (move.selfdestruct) {
    // Just a damage move — the self-destruct is handled by the engine
    // No special effect needed
  }

  // Self switch (Baton Pass, etc.)
  if (move.selfSwitch) {
    if (!move.basePower) {
      return { type: "switch-out", who: "self" };
    }
    effects.push({ type: "switch-out", who: "self" });
  }

  // Secondary effects on damaging moves
  if (move.secondary || (move.secondaries && move.secondaries.length > 0)) {
    const secondaries = move.secondaries ?? (move.secondary ? [move.secondary] : []);

    for (const sec of secondaries) {
      if (!sec) continue;

      if (sec.status) {
        const status = mapStatus(sec.status);
        if (status) {
          effects.push({
            type: "status-chance",
            status,
            chance: sec.chance ?? 100,
          });
        }
      }

      if (sec.volatileStatus) {
        const vol = mapVolatile(sec.volatileStatus);
        if (vol) {
          effects.push({
            type: "volatile-status",
            status: vol,
            chance: sec.chance ?? 100,
          });
        }
      }

      if (sec.boosts) {
        const changes = Object.entries(sec.boosts).map(([stat, stages]) => ({
          stat: mapBoostStat(stat),
          stages,
        }));
        effects.push({
          type: "stat-change",
          changes,
          target: "foe",
          chance: sec.chance ?? 100,
        });
      }

      if (sec.self?.boosts) {
        const changes = Object.entries(sec.self.boosts).map(([stat, stages]) => ({
          stat: mapBoostStat(stat),
          stages,
        }));
        effects.push({
          type: "stat-change",
          changes,
          target: "self",
          chance: sec.chance ?? 100,
        });
      }
    }
  }

  // Self boosts on damaging moves (e.g., moves that boost stats as a guaranteed effect)
  if (move.self?.boosts && move.basePower) {
    const changes = Object.entries(move.self.boosts).map(([stat, stages]) => ({
      stat: mapBoostStat(stat),
      stages,
    }));
    effects.push({
      type: "stat-change",
      changes,
      target: "self",
      chance: 100,
    });
  }

  // Status applied alongside damage (e.g., some moves inflict status at 100%)
  if (move.status && move.basePower) {
    const status = mapStatus(move.status);
    if (
      status &&
      !(effects as { type: string }[]).some(
        (e) => e.type === "status-chance" || e.type === "status-guaranteed",
      )
    ) {
      effects.push({
        type: "status-chance",
        status,
        chance: 100,
      });
    }
  }

  // Handle special/custom moves
  const customMoves: Record<string, string> = {
    metronome: "metronome",
    mirrormove: "mirror-move",
    transform: "transform",
    conversion: "conversion",
    conversion2: "conversion2",
    sketch: "sketch",
    sleeptalk: "sleep-talk",
    destinybond: "destiny-bond",
    spite: "spite",
    thief: "thief",
    present: "present",
    bellydrum: "belly-drum",
    painsplit: "pain-split",
    perishsong: "perish-song",
    attract: "attract",
    return: "return",
    frustration: "frustration",
    magnitude: "magnitude",
    batonpass: "baton-pass",
    pursuit: "pursuit",
    rapidspin: "rapid-spin",
    hiddenpower: "hidden-power",
    psych_up: "psych-up", // Psych Up
    psychup: "psych-up",
    futuresight: "future-sight",
    beatup: "beat-up",
    encore: "encore",
    moonlight: "moonlight",
    morningsun: "morning-sun",
    synthesis: "synthesis",
  };
  if (customMoves[move.id]) {
    const handler = customMoves[move.id];
    if (effects.length === 0 && !move.basePower) {
      return { type: "custom", handler };
    }
    // If it also has damage, add custom as an additional effect
    if (move.basePower && effects.length === 0) {
      return { type: "custom", handler };
    }
  }

  // If we collected multiple effects, wrap in multi
  if (effects.length > 1) {
    return { type: "multi", effects };
  }
  if (effects.length === 1) {
    return effects[0];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Learnset builder
// ---------------------------------------------------------------------------

interface LearnsetData {
  levelUp: Array<{ level: number; move: string }>;
  tm: string[];
  egg: string[];
  tutor: string[];
}

async function buildLearnset(speciesId: string, genNum: number): Promise<LearnsetData> {
  const result: LearnsetData = {
    levelUp: [],
    tm: [],
    egg: [],
    tutor: [],
  };

  const genPrefix = String(genNum);
  const learnset = await gen.learnsets.get(speciesId);
  if (!learnset?.learnset) return result;

  const tmSet = new Set<string>();
  const eggSet = new Set<string>();
  const tutorSet = new Set<string>();

  for (const [moveId, sources] of Object.entries(learnset.learnset)) {
    // Only process sources for our generation
    const genSources = sources.filter((s: string) => s.startsWith(genPrefix));
    if (genSources.length === 0) continue;

    // Look up the move to get its display name for kebab conversion
    const moveData = gen.moves.get(moveId);
    if (!moveData?.exists) continue;
    const kebabId = moveIdToKebab(moveId, moveData.name);

    for (const source of genSources) {
      const method = source[1]; // L, M, T, S, E, R, D
      const data = source.slice(2);

      switch (method) {
        case "L": {
          const level = Number.parseInt(data, 10);
          result.levelUp.push({ level, move: kebabId });
          break;
        }
        case "M":
          tmSet.add(kebabId);
          break;
        case "E":
          eggSet.add(kebabId);
          break;
        case "T":
          tutorSet.add(kebabId);
          break;
        case "S":
          // Special/event — skip for now
          break;
      }
    }
  }

  // Sort level-up by level, then alphabetically
  result.levelUp.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));

  // Deduplicate level-up entries (same level + same move)
  const seen = new Set<string>();
  result.levelUp = result.levelUp.filter((entry) => {
    const key = `${entry.level}:${entry.move}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  result.tm = [...tmSet].sort();
  result.egg = [...eggSet].sort();
  result.tutor = [...tutorSet].sort();

  return result;
}

// ---------------------------------------------------------------------------
// Pokemon builder
// ---------------------------------------------------------------------------

async function buildPokemonData() {
  console.log(`Generating pokemon.json for Gen ${GEN_NUM} (${dexRange.end} Pokemon)...`);

  const pokemon: object[] = [];

  for (let dexNum = dexRange.start; dexNum <= dexRange.end; dexNum++) {
    // Find the species by dex number
    let species: Specie | undefined;
    for (const s of gen.species) {
      if (s.num === dexNum && !s.forme) {
        species = s;
        break;
      }
    }

    if (!species) {
      console.warn(`  Warning: Species #${dexNum} not found, skipping`);
      continue;
    }

    // Fetch metadata from PokeAPI
    if (dexNum % 50 === 0 || dexNum === dexRange.end) {
      console.log(`  Fetching PokeAPI metadata... ${dexNum}/${dexRange.end}`);
    }
    const meta = await fetchSpeciesMetadata(dexNum);
    await delay(API_DELAY_MS);

    // Build learnset
    const learnset = await buildLearnset(species.id, GEN_NUM);

    // Gender ratio
    let genderRatio: number;
    if (species.gender === "N") {
      genderRatio = -1;
    } else if (species.genderRatio) {
      genderRatio = species.genderRatio.M * 100;
    } else {
      genderRatio = 50; // Default
    }

    // Types
    const types = species.types.map((t: string) => t.toLowerCase());

    // Base stats
    const baseStats = {
      hp: species.baseStats.hp,
      attack: species.baseStats.atk,
      defense: species.baseStats.def,
      spAttack: species.baseStats.spa,
      spDefense: species.baseStats.spd,
      speed: species.baseStats.spe,
    };

    // Abilities (empty for Gen 1-2)
    const abilities =
      GEN_NUM <= 2
        ? { normal: [] as string[], hidden: null }
        : (() => {
            const abils = species.abilities as ShowdownAbilities;
            const normal = Object.entries(abils)
              .filter(([k]) => k !== "H" && k !== "S")
              .map(([, v]) => toKebab(v as string))
              .filter((a): a is string => !!a);
            const hidden = abils.H ? toKebab(abils.H) : null;
            return { normal, hidden };
          })();

    // Evolution
    let evolution: object | null = null;
    const hasPrevo = species.prevo;
    const hasEvos = species.evos && species.evos.length > 0;

    if (hasPrevo || hasEvos) {
      // Build "from" link
      let from: EvolutionLink | null = null;
      if (hasPrevo) {
        from = buildEvolutionLink(species, gen);
        // The "from" link points to the prevo, with the method being how THIS species evolved
        const prevoSpecies = gen.species.get(species.prevo ?? "");
        if (prevoSpecies?.exists) {
          from.speciesId = prevoSpecies.num;
        }
      }

      // Build "to" links
      const to: EvolutionLink[] = [];
      if (hasEvos) {
        for (const evoName of species.evos) {
          const evoSpecies = gen.species.get(evoName);
          if (evoSpecies?.exists && evoSpecies.num <= dexRange.end) {
            to.push(buildEvolutionLink(evoSpecies, gen));
          }
        }
      }

      evolution = { from, to };
    } else {
      evolution = { from: null, to: [] };
    }

    // Legendary/Mythical detection
    const tags = species.tags ?? [];
    const isLegendary = tags.includes("Restricted Legendary") || tags.includes("Sub-Legendary");
    const isMythical = tags.includes("Mythical");

    // Dimensions — use @pkmn for weight, PokeAPI for height
    const dimensions = {
      height: meta.height,
      weight: species.weightkg ?? meta.weight,
    };

    // Name handling
    const name = species.id; // already lowercase no-spaces
    const displayName = species.name;

    pokemon.push({
      id: dexNum,
      name,
      displayName,
      types,
      baseStats,
      abilities,
      genderRatio,
      catchRate: meta.catchRate,
      baseExp: meta.baseExp,
      expGroup: meta.expGroup,
      evYield: meta.evYield,
      eggGroups: species.eggGroups.map((g: string) => g.toLowerCase()),
      learnset,
      evolution,
      dimensions,
      spriteKey: name,
      baseFriendship: meta.baseFriendship,
      generation: species.gen,
      isLegendary,
      isMythical,
    });
  }

  return pokemon;
}

// ---------------------------------------------------------------------------
// Move builder
// ---------------------------------------------------------------------------

function buildMovesData() {
  console.log(`Generating moves.json for Gen ${GEN_NUM}...`);

  const moves: object[] = [];

  for (const move of gen.moves) {
    if (!move.exists) continue;
    // Skip Max/Z-moves and G-Max moves
    if (move.isMax || move.isZ) continue;
    // Skip if nonstandard
    if (move.isNonstandard) continue;

    let type = move.type.toLowerCase();
    // Map the ??? type (used by Curse in Gen 2-4) to ghost
    if (type === "???") type = "ghost";

    // Category — type-based in Gen 1-3
    let category: string;
    if (GEN_NUM <= 3) {
      category = getTypeBasedCategory(type, move.category);
    } else {
      category = move.category.toLowerCase();
    }

    const kebabId = moveIdToKebab(move.id, move.name);

    // Flags
    const flags = {
      contact: !!move.flags.contact,
      sound: !!move.flags.sound,
      bullet: !!move.flags.bullet,
      pulse: false, // @pkmn doesn't track pulse in older gens
      punch: !!move.flags.punch,
      bite: !!move.flags.bite,
      wind: !!move.flags.wind,
      slicing: !!move.flags.slicing,
      powder: !!move.flags.powder,
      protect: !!move.flags.protect,
      mirror: !!move.flags.mirror,
      snatch: !!move.flags.snatch,
      gravity: !!move.flags.gravity,
      defrost: !!move.flags.defrost,
      recharge: !!move.flags.recharge,
      charge: !!move.flags.charge,
      bypassSubstitute: !!move.flags.bypasssub || !!move.flags.sound,
    };

    const effect = buildMoveEffect(move);

    moves.push({
      id: kebabId,
      displayName: move.name,
      type,
      category,
      power: move.basePower || null,
      accuracy: move.accuracy === true ? null : move.accuracy,
      pp: move.pp,
      priority: move.priority,
      target: mapTarget(move.target),
      flags,
      effect,
      description: move.desc || move.shortDesc || "",
      generation: move.gen,
    });
  }

  // Sort by generation then alphabetically
  (moves as WithId[]).sort((a, b) => a.id.localeCompare(b.id));

  return moves;
}

// ---------------------------------------------------------------------------
// Type chart builder
// ---------------------------------------------------------------------------

function buildTypeChart() {
  console.log(`Generating type-chart.json for Gen ${GEN_NUM}...`);

  // Define which types exist in each gen
  const GEN_TYPES: Record<number, string[]> = {
    1: [
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
    ],
    2: [
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
    ],
  };

  // Gen 3-5 same as Gen 2
  for (let g = 3; g <= 5; g++) GEN_TYPES[g] = GEN_TYPES[2];
  // Gen 6-9 add fairy
  for (let g = 6; g <= 9; g++) GEN_TYPES[g] = [...GEN_TYPES[2], "fairy"];

  const validTypes = new Set(GEN_TYPES[GEN_NUM]);
  const chart: Record<string, Record<string, number>> = {};

  for (const attackType of GEN_TYPES[GEN_NUM]) {
    chart[attackType] = {};
    const typeData = gen.types.get(attackType);
    if (!typeData?.exists) {
      console.warn(`  Warning: Type "${attackType}" not found`);
      // Fill with neutral
      for (const defType of GEN_TYPES[GEN_NUM]) {
        chart[attackType][defType] = 1;
      }
      continue;
    }

    for (const defType of GEN_TYPES[GEN_NUM]) {
      const defTypeData = gen.types.get(defType);
      if (!defTypeData?.exists) {
        chart[attackType][defType] = 1;
        continue;
      }

      // Use the effectiveness data from @pkmn/dex
      const effectiveness = typeData.effectiveness?.[defTypeData.name] ?? 1;
      chart[attackType][defType] = effectiveness;
    }
  }

  return chart;
}

// ---------------------------------------------------------------------------
// Items builder
// ---------------------------------------------------------------------------

function buildItemsData() {
  console.log(`Generating items.json for Gen ${GEN_NUM}...`);

  // Gen 1 has no items
  if (GEN_NUM === 1) return [];

  const items: object[] = [];

  for (const item of gen.items) {
    if (!item.exists) continue;
    if (item.isNonstandard) continue;

    const kebabId = toKebab(item.name);

    // Determine category
    let category: string;
    let pocket: string;
    if (item.isBerry) {
      category = "berry";
      pocket = "berries";
    } else if (item.isPokeball) {
      category = "pokeball";
      pocket = "pokeballs";
    } else if (
      item.name.includes("Stone") &&
      !item.name.includes("Hard") &&
      !item.name.includes("Ever")
    ) {
      category = "evolution-item";
      pocket = "items";
    } else if (
      item.name === "Up-Grade" ||
      item.name === "Dragon Scale" ||
      item.name === "Metal Coat" ||
      item.name === "King's Rock"
    ) {
      // Items that can be both held items and evolution items
      category = "held-item";
      pocket = "items";
    } else if (item.name === "Mail") {
      category = "mail";
      pocket = "items";
    } else {
      category = "held-item";
      pocket = "items";
    }

    // Build hold effect
    let holdEffect: object | undefined;

    // Type-boosting items
    const typeBoostItems: Record<string, string> = {
      charcoal: "fire",
      "mystic-water": "water",
      magnet: "electric",
      "miracle-seed": "grass",
      "never-melt-ice": "ice",
      "black-belt": "fighting",
      "poison-barb": "poison",
      "soft-sand": "ground",
      "sharp-beak": "flying",
      "twisted-spoon": "psychic",
      "silver-powder": "bug",
      "hard-stone": "rock",
      "spell-tag": "ghost",
      "dragon-fang": "dragon",
      "black-glasses": "dark",
      "metal-coat": "steel",
      "dragon-scale": "dragon",
      "pink-bow": "normal",
      "polkadot-bow": "normal",
    };

    if (typeBoostItems[kebabId]) {
      holdEffect = {
        type: "type-boost",
        moveType: typeBoostItems[kebabId],
        multiplier: 1.1,
      };
    }

    // Special held items
    if (kebabId === "leftovers") {
      holdEffect = { type: "leftovers", healFraction: 1 / 16 };
    }
    if (kebabId === "thick-club") {
      holdEffect = { type: "custom", handler: "thick-club" };
    }
    if (kebabId === "light-ball") {
      holdEffect = { type: "custom", handler: "light-ball" };
    }
    if (kebabId === "metal-powder") {
      holdEffect = { type: "custom", handler: "metal-powder" };
    }
    if (kebabId === "kings-rock" || kebabId === "king-s-rock") {
      holdEffect = { type: "custom", handler: "kings-rock" };
    }
    if (kebabId === "focus-band") {
      holdEffect = { type: "custom", handler: "focus-band" };
    }
    if (kebabId === "scope-lens") {
      holdEffect = { type: "custom", handler: "scope-lens" };
    }
    if (kebabId === "quick-claw") {
      holdEffect = { type: "custom", handler: "quick-claw" };
    }
    if (kebabId === "bright-powder") {
      holdEffect = { type: "custom", handler: "bright-powder" };
    }
    if (kebabId === "lucky-punch") {
      holdEffect = { type: "custom", handler: "lucky-punch" };
    }
    if (kebabId === "stick") {
      holdEffect = { type: "custom", handler: "stick" };
    }
    if (kebabId === "berserk-gene") {
      holdEffect = { type: "custom", handler: "berserk-gene" };
    }

    // Berry hold effects
    if (item.isBerry) {
      const berryEffects: Record<string, object> = {
        berry: {
          type: "berry",
          trigger: "hp-below-50",
          effect: "heal-10-hp",
        },
        "bitter-berry": {
          type: "berry",
          trigger: "confusion",
          effect: "cure-confusion",
        },
        "burnt-berry": {
          type: "berry",
          trigger: "freeze",
          effect: "cure-freeze",
        },
        "gold-berry": {
          type: "berry",
          trigger: "hp-below-50",
          effect: "heal-30-hp",
        },
        "ice-berry": {
          type: "berry",
          trigger: "burn",
          effect: "cure-burn",
        },
        "mint-berry": {
          type: "berry",
          trigger: "sleep",
          effect: "cure-sleep",
        },
        "miracle-berry": {
          type: "berry",
          trigger: "any-status",
          effect: "cure-all",
        },
        "mystery-berry": {
          type: "berry",
          trigger: "pp-zero",
          effect: "restore-5-pp",
        },
        "prz-cure-berry": {
          type: "berry",
          trigger: "paralysis",
          effect: "cure-paralysis",
        },
        "psn-cure-berry": {
          type: "berry",
          trigger: "poison",
          effect: "cure-poison",
        },
        "berry-juice": {
          type: "berry",
          trigger: "hp-below-50",
          effect: "heal-20-hp",
        },
      };
      if (berryEffects[kebabId]) {
        holdEffect = berryEffects[kebabId];
      }
    }

    const battleUsable = !!(holdEffect || item.isBerry);
    const fieldUsable = false;

    const entry: Record<string, unknown> = {
      id: kebabId,
      displayName: item.name,
      description: item.desc || item.shortDesc || "",
      category,
      pocket,
      price: 0, // @pkmn/dex doesn't have prices
      battleUsable,
      fieldUsable,
      generation: item.gen,
      spriteKey: kebabId,
    };

    if (holdEffect) {
      entry.holdEffect = holdEffect;
    }

    items.push(entry);
  }

  // Sort alphabetically
  (items as WithId[]).sort((a, b) => a.id.localeCompare(b.id));

  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Pokemon Data Importer - Generation ${GEN_NUM} ===\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Build type chart (sync, fast)
  const typeChart = buildTypeChart();
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "type-chart.json"),
    `${JSON.stringify(typeChart, null, 2)}\n`,
  );
  console.log(`  Wrote type-chart.json (${Object.keys(typeChart).length} types)\n`);

  // Build moves (sync, fast)
  const moves = buildMovesData();
  fs.writeFileSync(path.join(OUTPUT_DIR, "moves.json"), `${JSON.stringify(moves, null, 2)}\n`);
  console.log(`  Wrote moves.json (${moves.length} moves)\n`);

  // Build items (sync, fast)
  const items = buildItemsData();
  fs.writeFileSync(path.join(OUTPUT_DIR, "items.json"), `${JSON.stringify(items, null, 2)}\n`);
  console.log(`  Wrote items.json (${items.length} items)\n`);

  // Build pokemon (async — fetches from PokeAPI)
  const pokemon = await buildPokemonData();
  fs.writeFileSync(path.join(OUTPUT_DIR, "pokemon.json"), `${JSON.stringify(pokemon, null, 2)}\n`);
  console.log(`  Wrote pokemon.json (${pokemon.length} Pokemon)\n`);

  console.log("=== Done! ===\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
