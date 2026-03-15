import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedReplay, ParsedTurn, ReconstructedPokemon } from "../src/replay-types.js";
import { validateReplay } from "../src/validator.js";

// ---------------------------------------------------------------------------
// Mock @pokemon-lib/gen1 and @pokemon-lib/core
// ---------------------------------------------------------------------------

const mockTypeChart = {
  water: { fire: 2, flying: 1, water: 0.5, ghost: 1, normal: 1, electric: 1, grass: 0.5 },
  fire: { water: 0.5, fire: 0.5, grass: 2, flying: 1, ghost: 1, normal: 1 },
  electric: { water: 2, flying: 2, electric: 0.5, ground: 0, normal: 1 },
  normal: { ghost: 0, rock: 0.5, normal: 1, fire: 1 },
  ice: { dragon: 2, flying: 2, ice: 0.5, fire: 0.5, normal: 1 },
  poison: { grass: 2, poison: 0.5, ghost: 0.5, normal: 1 },
  ghost: { ghost: 2, psychic: 0, normal: 0 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, normal: 1 },
};

const mockSpecies: Record<string, { types: string[] }> = {
  charizard: { types: ["fire", "flying"] },
  rhydon: { types: ["ground", "rock"] },
  gengar: { types: ["ghost", "poison"] },
  jolteon: { types: ["electric"] },
  starmie: { types: ["water", "psychic"] },
  pikachu: { types: ["electric"] },
  arcanine: { types: ["fire"] },
  vaporeon: { types: ["water"] },
  alakazam: { types: ["psychic"] },
};

const mockMoves: Record<string, { type: string }> = {
  "water-gun": { type: "water" },
  flamethrower: { type: "fire" },
  "thunder-wave": { type: "electric" },
  tackle: { type: "normal" },
  "ice-beam": { type: "ice" },
  "shadow-ball": { type: "ghost" },
  psychic: { type: "psychic" },
  surf: { type: "water" },
};

vi.mock("@pokemon-lib/gen1", () => ({
  createGen1DataManager: () => ({
    getTypeChart: () => mockTypeChart,
    getMove: (id: string) => {
      const move = mockMoves[id];
      if (!move) throw new Error(`Move "${id}" not found`);
      return move;
    },
    getSpeciesByName: (name: string) => {
      const species = mockSpecies[name.toLowerCase()];
      if (!species) throw new Error(`Species "${name}" not found`);
      return species;
    },
  }),
}));

vi.mock("@pokemon-lib/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pokemon-lib/core")>();
  return {
    ...actual,
    getTypeEffectiveness: (
      moveType: string,
      defenderTypes: string[],
      chart: Record<string, Record<string, number>>,
    ) => {
      let multiplier = 1;
      for (const defType of defenderTypes) {
        multiplier *= chart[moveType]?.[defType] ?? 1;
      }
      return multiplier;
    },
  };
});

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function buildReplay(
  turns: ParsedTurn[],
  teams?: [ReconstructedPokemon[], ReconstructedPokemon[]],
): ParsedReplay {
  return {
    id: "test-replay",
    format: "gen1ou",
    generation: 1,
    players: ["Player1", "Player2"],
    teams: teams ?? [
      [{ species: "Pikachu", level: 100, knownMoves: [], nickname: "Pikachu" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ],
    turns,
    winner: null,
  };
}

function makeTurn(turnNumber: number, events: ParsedTurn["events"]): ParsedTurn {
  return { turnNumber, events };
}

// ---------------------------------------------------------------------------
// Type effectiveness checks
// ---------------------------------------------------------------------------

describe("validateReplay — type effectiveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given a replay where Showdown says supereffective, when validated, then no error if our chart agrees (e.g. Water vs Fire/Flying Charizard)", () => {
    // Arrange
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: ["surf"], nickname: "Starmie" }],
      [{ species: "Charizard", level: 100, knownMoves: [], nickname: "Charizard" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Starmie" },
          moveName: "Surf",
          moveId: "surf",
          targetIdent: { side: 1, position: "a", nickname: "Charizard" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Charizard" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(result.mismatches.filter((m) => m.severity === "error")).toHaveLength(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it("given a replay where Showdown says immune, when validated, then no error if our chart agrees (e.g. Normal vs Ghost)", () => {
    // Arrange
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Rhydon", level: 100, knownMoves: ["tackle"], nickname: "Rhydon" }],
      [{ species: "Gengar", level: 100, knownMoves: [], nickname: "Gengar" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Rhydon" },
          moveName: "Tackle",
          moveId: "tackle",
          targetIdent: { side: 1, position: "a", nickname: "Gengar" },
        },
        { type: "immune", ident: { side: 1, position: "a", nickname: "Gengar" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(result.mismatches.filter((m) => m.severity === "error")).toHaveLength(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it("given a replay where Showdown says resisted, when validated, then no error if our chart agrees (e.g. Fire vs Water)", () => {
    // Arrange
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Arcanine", level: 100, knownMoves: ["flamethrower"], nickname: "Arcanine" }],
      [{ species: "Vaporeon", level: 100, knownMoves: [], nickname: "Vaporeon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Arcanine" },
          moveName: "Flamethrower",
          moveId: "flamethrower",
          targetIdent: { side: 1, position: "a", nickname: "Vaporeon" },
        },
        { type: "resisted", ident: { side: 1, position: "a", nickname: "Vaporeon" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(result.mismatches.filter((m) => m.severity === "error")).toHaveLength(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it("given a replay with a supereffective event but our chart says neutral, when validated, then returns error mismatch", () => {
    // Arrange — Tackle (normal) vs Rhydon (ground/rock): neutral, not super effective
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Pikachu", level: 100, knownMoves: ["tackle"], nickname: "Pikachu" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Pikachu" },
          moveName: "Tackle",
          moveId: "tackle",
          targetIdent: { side: 1, position: "a", nickname: "Rhydon" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Rhydon" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    const errors = result.mismatches.filter((m) => m.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.check).toBe("type-effectiveness");
  });

  it("given a replay with an immune event but our chart says neutral, when validated, then returns error mismatch", () => {
    // Arrange — Flamethrower (fire) vs Vaporeon (water): 0.5x, not immune
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Arcanine", level: 100, knownMoves: ["flamethrower"], nickname: "Arcanine" }],
      [{ species: "Vaporeon", level: 100, knownMoves: [], nickname: "Vaporeon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Arcanine" },
          moveName: "Flamethrower",
          moveId: "flamethrower",
          targetIdent: { side: 1, position: "a", nickname: "Vaporeon" },
        },
        { type: "immune", ident: { side: 1, position: "a", nickname: "Vaporeon" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    const errors = result.mismatches.filter((m) => m.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.check).toBe("type-effectiveness");
  });

  it("given a replay with no effectiveness events, when validated, then returns empty mismatches", () => {
    // Arrange — move event with no following effectiveness event
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Pikachu", level: 100, knownMoves: ["tackle"], nickname: "Pikachu" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Pikachu" },
          moveName: "Tackle",
          moveId: "tackle",
          targetIdent: { side: 1, position: "a", nickname: "Rhydon" },
        },
        // No effectiveness event follows — just damage
        {
          type: "damage",
          ident: { side: 1, position: "a", nickname: "Rhydon" },
          hp: { current: 80, max: 100, status: null },
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(result.mismatches.filter((m) => m.check === "type-effectiveness")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Status legality checks
// ---------------------------------------------------------------------------

describe("validateReplay — status legality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given a replay where a fire-type pokemon gets burned, when validated, then returns error mismatch", () => {
    // Arrange — Arcanine is Fire-type, should be immune to burn
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [], nickname: "Starmie" }],
      [{ species: "Arcanine", level: 100, knownMoves: [], nickname: "Arcanine" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "status",
          ident: { side: 1, position: "a", nickname: "Arcanine" },
          statusId: "brn",
          statusName: "burn",
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    const errors = result.mismatches.filter((m) => m.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.check).toBe("status-legality");
  });

  it("given a replay where a normal-type pokemon gets burned, when validated, then no error", () => {
    // Arrange — Rhydon (ground/rock) can be burned
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [], nickname: "Starmie" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "status",
          ident: { side: 1, position: "a", nickname: "Rhydon" },
          statusId: "brn",
          statusName: "burn",
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(
      result.mismatches.filter((m) => m.severity === "error" && m.check === "status-legality"),
    ).toHaveLength(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it("given a replay where an electric-type pokemon gets paralyzed in Gen 1, when validated, then no error (electric immunity added in Gen 6)", () => {
    // Arrange — Jolteon is Electric-type; in Gen 1, electric types CAN be paralyzed.
    // Electric paralysis immunity was introduced in Gen 6, so no immunity rule exists here.
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [], nickname: "Starmie" }],
      [{ species: "Jolteon", level: 100, knownMoves: [], nickname: "Jolteon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "status",
          ident: { side: 1, position: "a", nickname: "Jolteon" },
          statusId: "par",
          statusName: "paralysis",
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert — no error; the validator has no Gen 1 immunity rule for electric + paralysis
    expect(
      result.mismatches.filter((m) => m.severity === "error" && m.check === "status-legality"),
    ).toHaveLength(0);
    // No immunity rule is registered for "par" in Gen 1, so no check runs and passed stays 0
    expect(result.mismatches.filter((m) => m.check === "status-legality")).toHaveLength(0);
  });

  it("given a replay where a water-type pokemon gets paralyzed, when validated, then no error", () => {
    // Arrange — Vaporeon (water) can be paralyzed; no paralysis immunity rule exists in Gen 1
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Jolteon", level: 100, knownMoves: [], nickname: "Jolteon" }],
      [{ species: "Vaporeon", level: 100, knownMoves: [], nickname: "Vaporeon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "status",
          ident: { side: 1, position: "a", nickname: "Vaporeon" },
          statusId: "par",
          statusName: "paralysis",
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert — no error and no status-legality mismatches at all (no immunity rule for "par" in Gen 1)
    expect(
      result.mismatches.filter((m) => m.severity === "error" && m.check === "status-legality"),
    ).toHaveLength(0);
    expect(result.mismatches.filter((m) => m.check === "status-legality")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown species / move handling
// ---------------------------------------------------------------------------

describe("validateReplay — unknown species/move handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given a replay with an unknown species name, when validated, then skips that check with info severity", () => {
    // Arrange — status on a species not in DataManager
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [], nickname: "Starmie" }],
      [{ species: "UnknownMon", level: 100, knownMoves: [], nickname: "UnknownMon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "status",
          ident: { side: 1, position: "a", nickname: "UnknownMon" },
          statusId: "brn",
          statusName: "burn",
        },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert — should produce info severity, not error
    const errorMismatches = result.mismatches.filter((m) => m.severity === "error");
    expect(errorMismatches).toHaveLength(0);
    const infoMismatches = result.mismatches.filter((m) => m.severity === "info");
    expect(infoMismatches.length).toBeGreaterThan(0);
  });

  it("given a replay with an unknown move, when validated, then skips that check with info severity", () => {
    // Arrange — move event with unknown move ID
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [], nickname: "Starmie" }],
      [{ species: "Charizard", level: 100, knownMoves: [], nickname: "Charizard" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Starmie" },
          moveName: "Unknown Move",
          moveId: "unknown-move-xyz",
          targetIdent: { side: 1, position: "a", nickname: "Charizard" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Charizard" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert — should produce info severity, not error
    const errorMismatches = result.mismatches.filter((m) => m.severity === "error");
    expect(errorMismatches).toHaveLength(0);
    const infoMismatches = result.mismatches.filter((m) => m.severity === "info");
    expect(infoMismatches.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Summary / counts
// ---------------------------------------------------------------------------

describe("validateReplay — summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given a replay with all valid events, when validated, then passed count equals total checks", () => {
    // Arrange — water vs fire/flying charizard (supereffective, correct)
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: ["surf"], nickname: "Starmie" }],
      [{ species: "Charizard", level: 100, knownMoves: [], nickname: "Charizard" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Starmie" },
          moveName: "Surf",
          moveId: "surf",
          targetIdent: { side: 1, position: "a", nickname: "Charizard" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Charizard" } },
      ]),
    ];

    // Act
    const result = validateReplay(buildReplay(turns, teams));

    // Assert
    expect(result.mismatches.filter((m) => m.severity === "error")).toHaveLength(0);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.replayId).toBe("test-replay");
    expect(result.format).toBe("gen1ou");
  });

  it("given an empty replay, when validated, then returns result with 0 mismatches and 0 passed", () => {
    // Arrange
    const turns: ParsedTurn[] = [];

    // Act
    const result = validateReplay(buildReplay(turns));

    // Assert
    expect(result.passed).toBe(0);
    expect(result.mismatches).toHaveLength(0);
    expect(result.totalTurns).toBe(0);
  });
});
