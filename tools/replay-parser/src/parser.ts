import type {
  ParsedReplay,
  ParsedTurn,
  PokemonIdent,
  ReconstructedPokemon,
  ShowdownEvent,
  ShowdownHp,
} from "./replay-types.js";

export * from "./replay-types.js";

// ---------------------------------------------------------------------------
// parsePokemonIdent
// ---------------------------------------------------------------------------

/**
 * Parse a Showdown pokemon ident string like "p1a: Jolteon" or "p2b: Mr. Mime"
 * into a structured PokemonIdent.
 */
export function parsePokemonIdent(ident: string): PokemonIdent {
  // Format: "p<1|2><position>: <nickname>"
  const match = /^p([12])([a-z]+): (.+)$/.exec(ident);
  if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new Error(`Cannot parse pokemon ident: "${ident}"`);
  }
  const side = (Number.parseInt(match[1], 10) - 1) as 0 | 1;
  const position = match[2];
  const nickname = match[3];
  return { side, position, nickname };
}

// ---------------------------------------------------------------------------
// parseHp
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["par", "brn", "frz", "slp", "psn", "tox"]);

/**
 * Parse a Showdown HP string like "81/100 par" or "100/100" or "0/100 fnt"
 * into a structured ShowdownHp.
 */
export function parseHp(hp: string): ShowdownHp {
  const parts = hp.split(" ");
  const hpPart = parts[0] ?? "0/0";
  const slashIdx = hpPart.indexOf("/");
  const current = Number.parseInt(hpPart.slice(0, slashIdx), 10);
  const max = Number.parseInt(hpPart.slice(slashIdx + 1), 10);
  const rawStatus = parts[1] ?? null;

  // "fnt" (fainted) is not a status condition - treat as null
  let status: ShowdownHp["status"] = null;
  if (rawStatus !== null && rawStatus !== "fnt" && VALID_STATUSES.has(rawStatus)) {
    status = rawStatus as ShowdownHp["status"];
  }

  return { current, max, status };
}

// ---------------------------------------------------------------------------
// normalizeMoveName
// ---------------------------------------------------------------------------

/**
 * Normalize a Showdown move name to a kebab-case move ID.
 * Handles both space-separated ("Thunder Wave" -> "thunder-wave")
 * and CamelCase ("SolarBeam" -> "solar-beam").
 */
export function normalizeMoveName(name: string): string {
  // First handle CamelCase by inserting hyphens before uppercase letters
  // that follow a lowercase letter or digit
  const withHyphens = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
  // Then replace spaces with hyphens and lowercase everything
  return withHyphens.replace(/ /g, "-").toLowerCase();
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, string> = {
  par: "paralysis",
  slp: "sleep",
  brn: "burn",
  psn: "poison",
  tox: "badly-poisoned",
  frz: "freeze",
};

// ---------------------------------------------------------------------------
// Lines to skip entirely (return null)
// ---------------------------------------------------------------------------

const SKIP_TYPES = new Set([
  "raw",
  "j",
  "l",
  "t:",
  "c",
  "inactive",
  "inactiveoff",
  "rated",
  "-activate",
  "player",
  "gen",
  "tier",
  "rule",
  "teamsize",
  "gametype",
  "upkeep",
  "clearpoke",
  "poke",
  "teampreview",
  "choice",
  "battlelog",
  "chat",
  "seed",
  "html",
  "",
]);

// ---------------------------------------------------------------------------
// Helpers to safely index split arrays
// ---------------------------------------------------------------------------

/** Get a required split part; throws if missing */
function req(parts: (string | undefined)[], idx: number): string {
  const v = parts[idx];
  if (v === undefined) throw new Error(`Missing part at index ${idx}`);
  return v;
}

/** Get an optional split part, returns undefined if missing or empty */
function opt(parts: (string | undefined)[], idx: number): string | undefined {
  const v = parts[idx];
  return v !== undefined && v !== "" ? v : undefined;
}

// ---------------------------------------------------------------------------
// parseLine
// ---------------------------------------------------------------------------

/**
 * Parse a single Showdown protocol line into a ShowdownEvent or null (if the
 * line should be skipped).
 */
export function parseLine(line: string): ShowdownEvent | null {
  if (!line.startsWith("|")) {
    return null;
  }

  const parts = line.split("|");
  // parts[0] is always "" because line starts with "|"
  const msgType = parts[1] ?? "";

  // |start| (no args, battle-start marker) - skip
  if (msgType === "start" && opt(parts, 2) === undefined) {
    return null;
  }

  if (SKIP_TYPES.has(msgType)) {
    return null;
  }

  switch (msgType) {
    case "switch":
    case "-switch":
    case "-drag":
    case "-replace": {
      return parseSwitchLine(parts);
    }

    case "move": {
      return parseMoveLine(parts);
    }

    case "-damage": {
      return parseDamageHealLine(parts, "damage");
    }

    case "-heal": {
      return parseDamageHealLine(parts, "heal");
    }

    case "-status": {
      const ident = parsePokemonIdent(req(parts, 2));
      const statusId = req(parts, 3);
      const statusName = STATUS_MAP[statusId] ?? statusId;
      return { type: "status", ident, statusId, statusName };
    }

    case "-curestatus": {
      const ident = parsePokemonIdent(req(parts, 2));
      const statusId = req(parts, 3);
      return { type: "curestatus", ident, statusId };
    }

    case "-crit": {
      const ident = parsePokemonIdent(req(parts, 2));
      return { type: "crit", ident };
    }

    case "-supereffective": {
      const ident = parsePokemonIdent(req(parts, 2));
      return { type: "supereffective", ident };
    }

    case "-resisted": {
      const ident = parsePokemonIdent(req(parts, 2));
      return { type: "resisted", ident };
    }

    case "-immune": {
      const ident = parsePokemonIdent(req(parts, 2));
      return { type: "immune", ident };
    }

    case "-boost": {
      const ident = parsePokemonIdent(req(parts, 2));
      const stat = req(parts, 3) as
        | "atk"
        | "def"
        | "spa"
        | "spd"
        | "spe"
        | "spc"
        | "accuracy"
        | "evasion";
      const amount = Number.parseInt(req(parts, 4), 10);
      return { type: "boost", ident, stat, amount };
    }

    case "-unboost": {
      const ident = parsePokemonIdent(req(parts, 2));
      const stat = req(parts, 3) as
        | "atk"
        | "def"
        | "spa"
        | "spd"
        | "spe"
        | "spc"
        | "accuracy"
        | "evasion";
      const amount = Number.parseInt(req(parts, 4), 10);
      return { type: "unboost", ident, stat, amount };
    }

    case "-miss":
    case "miss": {
      const userIdent = parsePokemonIdent(req(parts, 2));
      const targetRaw = opt(parts, 3);
      const targetIdent = targetRaw !== undefined ? parsePokemonIdent(targetRaw) : null;
      return { type: "miss", userIdent, targetIdent };
    }

    case "-fail": {
      const ident = parsePokemonIdent(req(parts, 2));
      const reason = opt(parts, 3);
      if (reason !== undefined) {
        return { type: "fail", ident, reason };
      }
      return { type: "fail", ident };
    }

    case "cant": {
      const ident = parsePokemonIdent(req(parts, 2));
      const reason = req(parts, 3);
      const moveName = opt(parts, 4);
      if (moveName !== undefined) {
        return { type: "cant", ident, reason, moveName };
      }
      return { type: "cant", ident, reason };
    }

    case "faint": {
      const ident = parsePokemonIdent(req(parts, 2));
      return { type: "faint", ident };
    }

    case "win": {
      const winner = req(parts, 2);
      return { type: "win", winner };
    }

    case "tie": {
      // Players will be filled in by parseReplay; use placeholders here
      return { type: "tie", players: ["", ""] };
    }

    case "turn": {
      const turnNumber = Number.parseInt(req(parts, 2), 10);
      return { type: "turn", turnNumber };
    }

    case "-hitcount": {
      const ident = parsePokemonIdent(req(parts, 2));
      const count = Number.parseInt(req(parts, 3), 10);
      return { type: "hitcount", ident, count };
    }

    case "-start": {
      const ident = parsePokemonIdent(req(parts, 2));
      const effect = req(parts, 3);
      const fromPart = opt(parts, 4);
      const from = fromPart?.startsWith("[from]") ? fromPart.slice(7).trim() : undefined;
      if (from !== undefined) {
        return { type: "start", ident, effect, from };
      }
      return { type: "start", ident, effect };
    }

    case "-end": {
      const ident = parsePokemonIdent(req(parts, 2));
      const effect = req(parts, 3);
      return { type: "end", ident, effect };
    }

    default: {
      return { type: "unknown", raw: line };
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: parse switch/drag lines
// ---------------------------------------------------------------------------

function parseSwitchLine(parts: (string | undefined)[]): ShowdownEvent {
  const ident = parsePokemonIdent(req(parts, 2));
  const detailsRaw = req(parts, 3);
  const hpRaw = opt(parts, 4) ?? "0/0";

  // detailsRaw: "Charizard, L50" or "Charizard" (no level = level 100)
  const commaIdx = detailsRaw.indexOf(",");
  let species: string;
  let level = 100;
  if (commaIdx !== -1) {
    species = detailsRaw.slice(0, commaIdx).trim();
    const rest = detailsRaw.slice(commaIdx + 1).trim();
    const levelMatch = /L(\d+)/.exec(rest);
    if (levelMatch?.[1] !== undefined) {
      level = Number.parseInt(levelMatch[1], 10);
    }
  } else {
    species = detailsRaw.trim();
  }

  const hp = parseHp(hpRaw);
  return { type: "switch", ident, species, level, hp };
}

// ---------------------------------------------------------------------------
// Helper: parse move lines
// ---------------------------------------------------------------------------

function parseMoveLine(parts: (string | undefined)[]): ShowdownEvent {
  const userIdent = parsePokemonIdent(req(parts, 2));
  const moveName = req(parts, 3);
  const moveId = normalizeMoveName(moveName);
  const targetRaw = opt(parts, 4);
  const targetIdent = targetRaw !== undefined ? parsePokemonIdent(targetRaw) : null;
  return { type: "move", userIdent, moveName, moveId, targetIdent };
}

// ---------------------------------------------------------------------------
// Helper: parse damage/heal lines
// ---------------------------------------------------------------------------

function parseDamageHealLine(
  parts: (string | undefined)[],
  eventType: "damage" | "heal",
): ShowdownEvent {
  const ident = parsePokemonIdent(req(parts, 2));
  const hp = parseHp(req(parts, 3));
  const fromPart = opt(parts, 4);
  const from = fromPart?.startsWith("[from]") ? fromPart.slice(7).trim() : undefined;
  if (from !== undefined) {
    return { type: eventType, ident, hp, from };
  }
  return { type: eventType, ident, hp };
}

// ---------------------------------------------------------------------------
// parseReplay
// ---------------------------------------------------------------------------

interface MutablePokemon {
  species: string;
  level: number;
  knownMoves: string[];
  nickname: string;
}

/**
 * Parse a full Showdown battle log text into a structured ParsedReplay.
 */
export function parseReplay(logText: string): ParsedReplay {
  const lines = logText.split("\n");

  // ---- Pass 1: extract metadata from header lines ----
  let generation = 0;
  let format = "";
  const rawPlayers: [string, string] = ["", ""];

  for (const line of lines) {
    if (line.startsWith("|gen|")) {
      generation = Number.parseInt(line.slice(5), 10);
    } else if (line.startsWith("|tier|")) {
      format = line.slice(6);
    } else if (line.startsWith("|player|")) {
      const parts = line.split("|");
      const slot = parts[2];
      const playerName = parts[3];
      if (slot === "p1" && playerName !== undefined) rawPlayers[0] = playerName;
      else if (slot === "p2" && playerName !== undefined) rawPlayers[1] = playerName;
    }
  }

  // ---- Pass 2: parse all events and group into turns ----
  const turns: ParsedTurn[] = [];
  // Turn 0 collects pre-battle events (team preview, initial switches, etc.)
  let currentTurnNumber = 0;
  let currentEvents: ShowdownEvent[] = [];

  const flushTurn = () => {
    if (currentEvents.length > 0) {
      turns.push({ turnNumber: currentTurnNumber, events: currentEvents });
    }
  };

  for (const line of lines) {
    const event = parseLine(line);
    if (event === null) continue;

    if (event.type === "turn") {
      // Flush accumulated events into the previous turn
      flushTurn();
      currentTurnNumber = event.turnNumber;
      currentEvents = [];
      // The TurnEvent itself goes into the new turn's events
      currentEvents.push(event);
    } else {
      currentEvents.push(event);
    }
  }
  // Flush the last turn
  flushTurn();

  // ---- Pass 3: reconstruct teams from switch and move events ----
  // Use a Map keyed by species to deduplicate (pokemon can switch in
  // multiple times). Track insertion order per side.
  const teamMaps: [Map<string, MutablePokemon>, Map<string, MutablePokemon>] = [
    new Map(),
    new Map(),
  ];

  // We process all events in order across all turns (including turn 0)
  const allEvents: ShowdownEvent[] = turns.flatMap((t) => t.events);

  for (const event of allEvents) {
    if (event.type === "switch") {
      const { side } = event.ident;
      const key = event.species;
      if (!teamMaps[side].has(key)) {
        teamMaps[side].set(key, {
          species: event.species,
          level: event.level,
          knownMoves: [],
          nickname: event.ident.nickname,
        });
      }
    } else if (event.type === "move") {
      const { side } = event.userIdent;
      const nickname = event.userIdent.nickname;
      // Find the pokemon by nickname on this side
      let pokemon: MutablePokemon | undefined;
      for (const p of teamMaps[side].values()) {
        if (p.nickname === nickname) {
          pokemon = p;
          break;
        }
      }
      if (pokemon !== undefined) {
        const moveId = normalizeMoveName(event.moveName);
        if (!pokemon.knownMoves.includes(moveId)) {
          pokemon.knownMoves.push(moveId);
        }
      }
    }
  }

  // Build final teams as readonly arrays
  const buildTeam = (map: Map<string, MutablePokemon>): readonly ReconstructedPokemon[] =>
    Array.from(map.values()).map((p) => ({
      species: p.species,
      level: p.level,
      knownMoves: p.knownMoves as readonly string[],
      nickname: p.nickname,
    }));

  const teams: readonly [readonly ReconstructedPokemon[], readonly ReconstructedPokemon[]] = [
    buildTeam(teamMaps[0]),
    buildTeam(teamMaps[1]),
  ];

  // ---- Extract winner ----
  let winner: string | null = null;
  for (const event of allEvents) {
    if (event.type === "win") {
      winner = event.winner;
      break;
    }
    // TieEvent means winner stays null
  }

  return {
    id: "",
    format,
    generation,
    players: rawPlayers,
    teams,
    turns,
    winner,
  };
}
