import { CORE_MOVE_IDS, CORE_STATUS_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { ParsedReplay, ParsedTurn, ReconstructedPokemon } from "../src/replay-types.js";
import { validateReplay } from "../src/validator.js";

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

function getErrors(result: ReturnType<typeof validateReplay>) {
  return result.mismatches.filter((m) => m.severity === "error");
}

function getInfos(result: ReturnType<typeof validateReplay>) {
  return result.mismatches.filter((m) => m.severity === "info");
}

describe("validateReplay — type effectiveness", () => {
  it("given a replay where Showdown says super-effective, when validated, then the real chart agrees for Surf into Charizard", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [CORE_MOVE_IDS.surf], nickname: "Starmie" }],
      [{ species: "Charizard", level: 100, knownMoves: [], nickname: "Charizard" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Starmie" },
          moveName: "Surf",
          moveId: CORE_MOVE_IDS.surf,
          targetIdent: { side: 1, position: "a", nickname: "Charizard" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Charizard" } },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(1);
  });

  it("given a replay where Showdown says immune, when validated, then the real chart agrees for Tackle into Gengar", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Rhydon", level: 100, knownMoves: [CORE_MOVE_IDS.tackle], nickname: "Rhydon" }],
      [{ species: "Gengar", level: 100, knownMoves: [], nickname: "Gengar" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Rhydon" },
          moveName: "Tackle",
          moveId: CORE_MOVE_IDS.tackle,
          targetIdent: { side: 1, position: "a", nickname: "Gengar" },
        },
        { type: "immune", ident: { side: 1, position: "a", nickname: "Gengar" } },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(1);
  });

  it("given a replay where Showdown says resisted, when validated, then the real chart agrees for Flamethrower into Vaporeon", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Arcanine", level: 100, knownMoves: [CORE_MOVE_IDS.flamethrower], nickname: "Arcanine" }],
      [{ species: "Vaporeon", level: 100, knownMoves: [], nickname: "Vaporeon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Arcanine" },
          moveName: "Flamethrower",
          moveId: CORE_MOVE_IDS.flamethrower,
          targetIdent: { side: 1, position: "a", nickname: "Vaporeon" },
        },
        { type: "resisted", ident: { side: 1, position: "a", nickname: "Vaporeon" } },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(1);
  });

  it("given a replay with a super-effective marker on a neutral hit, when validated, then returns an error mismatch", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Pikachu", level: 100, knownMoves: [CORE_MOVE_IDS.tackle], nickname: "Pikachu" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Pikachu" },
          moveName: "Tackle",
          moveId: CORE_MOVE_IDS.tackle,
          targetIdent: { side: 1, position: "a", nickname: "Rhydon" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Rhydon" } },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));
    const errors = getErrors(result);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ check: "type-effectiveness", severity: "error" });
    expect(result.passed).toBe(0);
  });

  it("given a move with no following effectiveness marker, when validated, then skips the type-effectiveness check", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Pikachu", level: 100, knownMoves: [CORE_MOVE_IDS.tackle], nickname: "Pikachu" }],
      [{ species: "Rhydon", level: 100, knownMoves: [], nickname: "Rhydon" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Pikachu" },
          moveName: "Tackle",
          moveId: CORE_MOVE_IDS.tackle,
          targetIdent: { side: 1, position: "a", nickname: "Rhydon" },
        },
        {
          type: "damage",
          ident: { side: 1, position: "a", nickname: "Rhydon" },
          hp: { current: 80, max: 100, status: null },
        },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toHaveLength(0);
    expect(result.passed).toBe(0);
  });
});

describe("validateReplay — status legality", () => {
  it("given a fire-type pokemon that gets burned, when validated, then returns a status-legality error", () => {
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
          statusName: CORE_STATUS_IDS.burn,
        },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));
    const errors = getErrors(result);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ check: "status-legality", severity: "error" });
    expect(result.passed).toBe(0);
  });

  it("given a non-fire pokemon that gets burned, when validated, then the status is allowed", () => {
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
          statusName: CORE_STATUS_IDS.burn,
        },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(1);
  });

  it("given an electric-type pokemon that gets paralyzed in Gen 1, when validated, then the status is allowed", () => {
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
          statusName: CORE_STATUS_IDS.paralysis,
        },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(0);
  });
});

describe("validateReplay — unknown species/move handling", () => {
  it("given a replay with an unknown species name, when validated, then it emits an info mismatch instead of failing", () => {
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
          statusName: CORE_STATUS_IDS.burn,
        },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));
    const infos = getInfos(result);

    expect(getErrors(result)).toHaveLength(0);
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({ check: "status-legality", severity: "info" });
  });

  it("given a replay with an unknown move, when validated, then it emits an info mismatch instead of failing", () => {
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

    const result = validateReplay(buildReplay(turns, teams));
    const infos = getInfos(result);

    expect(getErrors(result)).toHaveLength(0);
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({ check: "type-effectiveness", severity: "info" });
  });
});

describe("validateReplay — summary", () => {
  it("given a replay with valid events, when validated, then it preserves the report identity and counts", () => {
    const teams: [ReconstructedPokemon[], ReconstructedPokemon[]] = [
      [{ species: "Starmie", level: 100, knownMoves: [CORE_MOVE_IDS.surf], nickname: "Starmie" }],
      [{ species: "Charizard", level: 100, knownMoves: [], nickname: "Charizard" }],
    ];
    const turns = [
      makeTurn(1, [
        {
          type: "move",
          userIdent: { side: 0, position: "a", nickname: "Starmie" },
          moveName: "Surf",
          moveId: CORE_MOVE_IDS.surf,
          targetIdent: { side: 1, position: "a", nickname: "Charizard" },
        },
        { type: "supereffective", ident: { side: 1, position: "a", nickname: "Charizard" } },
      ]),
    ];

    const result = validateReplay(buildReplay(turns, teams));

    expect(result).toMatchObject({
      replayId: "test-replay",
      format: "gen1ou",
      totalTurns: 1,
      winner: null,
      passed: 1,
    });
    expect(result.mismatches).toHaveLength(0);
  });

  it("given an empty replay, when validated, then it returns an empty result", () => {
    const result = validateReplay(buildReplay([]));

    expect(result.passed).toBe(0);
    expect(result.mismatches).toHaveLength(0);
    expect(result.totalTurns).toBe(0);
  });
});
