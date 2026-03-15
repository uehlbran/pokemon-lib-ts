import { describe, expect, it } from "vitest";
import {
  normalizeMoveName,
  parseHp,
  parseLine,
  parsePokemonIdent,
  parseReplay,
} from "../src/parser.js";
import type { ShowdownEvent } from "../src/replay-types.js";

// ---------------------------------------------------------------------------
// parsePokemonIdent
// ---------------------------------------------------------------------------
describe("parsePokemonIdent", () => {
  it("given p1a: Jolteon, when parsed, then returns {side:0, position:'a', nickname:'Jolteon'}", () => {
    // Arrange
    const input = "p1a: Jolteon";

    // Act
    const result = parsePokemonIdent(input);

    // Assert
    expect(result).toEqual({ side: 0, position: "a", nickname: "Jolteon" });
  });

  it("given p2b: Charizard, when parsed, then returns {side:1, position:'b', nickname:'Charizard'}", () => {
    // Arrange
    const input = "p2b: Charizard";

    // Act
    const result = parsePokemonIdent(input);

    // Assert
    expect(result).toEqual({ side: 1, position: "b", nickname: "Charizard" });
  });

  it("given p1a: Mr. Mime, when parsed, then nickname handles spaces", () => {
    // Arrange
    const input = "p1a: Mr. Mime";

    // Act
    const result = parsePokemonIdent(input);

    // Assert
    expect(result).toEqual({ side: 0, position: "a", nickname: "Mr. Mime" });
  });
});

// ---------------------------------------------------------------------------
// parseHp
// ---------------------------------------------------------------------------
describe("parseHp", () => {
  it("given '81/100 par', when parsed, then returns {current:81, max:100, status:'par'}", () => {
    // Arrange / Act
    const result = parseHp("81/100 par");

    // Assert
    expect(result).toEqual({ current: 81, max: 100, status: "par" });
  });

  it("given '100/100', when parsed, then status is null", () => {
    // Arrange / Act
    const result = parseHp("100/100");

    // Assert
    expect(result).toEqual({ current: 100, max: 100, status: null });
  });

  it("given '0/100', when parsed, then current is 0", () => {
    // Arrange / Act
    const result = parseHp("0/100");

    // Assert
    expect(result).toEqual({ current: 0, max: 100, status: null });
  });

  it("given '150/250 slp', when parsed, then sleep status parsed", () => {
    // Arrange / Act
    const result = parseHp("150/250 slp");

    // Assert
    expect(result).toEqual({ current: 150, max: 250, status: "slp" });
  });

  it("given '0/100 fnt', when parsed, then treats fnt (fainted) as status null", () => {
    // Arrange / Act
    const result = parseHp("0/100 fnt");

    // Assert
    expect(result).toEqual({ current: 0, max: 100, status: null });
  });
});

// ---------------------------------------------------------------------------
// normalizeMoveName
// ---------------------------------------------------------------------------
describe("normalizeMoveName", () => {
  it("given 'Thunder Wave', when normalized, then returns 'thunder-wave'", () => {
    // Arrange / Act
    const result = normalizeMoveName("Thunder Wave");

    // Assert
    expect(result).toBe("thunder-wave");
  });

  it("given 'SolarBeam', when normalized, then converts CamelCase to kebab-case", () => {
    // Arrange / Act
    const result = normalizeMoveName("SolarBeam");

    // Assert
    expect(result).toBe("solar-beam");
  });

  it("given 'Hyper Beam', when normalized, then returns 'hyper-beam'", () => {
    // Arrange / Act
    const result = normalizeMoveName("Hyper Beam");

    // Assert
    expect(result).toBe("hyper-beam");
  });

  it("given 'Swords Dance', when normalized, then returns 'swords-dance'", () => {
    // Arrange / Act
    const result = normalizeMoveName("Swords Dance");

    // Assert
    expect(result).toBe("swords-dance");
  });
});

// ---------------------------------------------------------------------------
// parseLine
// ---------------------------------------------------------------------------
describe("parseLine", () => {
  it("given switch line, when parsed, then returns SwitchEvent with correct fields", () => {
    // Arrange
    const line = "|switch|p1a: Charizard|Charizard, L50|100/100";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.type).toBe("switch");
    const ev = result as Extract<ShowdownEvent, { type: "switch" }>;
    expect(ev.ident).toEqual({ side: 0, position: "a", nickname: "Charizard" });
    expect(ev.species).toBe("Charizard");
    expect(ev.level).toBe(50);
    expect(ev.hp).toEqual({ current: 100, max: 100, status: null });
  });

  it("given move line with target, when parsed, then returns MoveEvent", () => {
    // Arrange
    const line = "|move|p1a: Jolteon|Thunder Wave|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("move");
    const ev = result as Extract<ShowdownEvent, { type: "move" }>;
    expect(ev.userIdent).toEqual({ side: 0, position: "a", nickname: "Jolteon" });
    expect(ev.moveName).toBe("Thunder Wave");
    expect(ev.moveId).toBe("thunder-wave");
    expect(ev.targetIdent).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
  });

  it("given move line without target, when parsed, then targetIdent is null", () => {
    // Arrange
    const line = "|move|p1a: Jolteon|Thunder Wave|";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("move");
    const ev = result as Extract<ShowdownEvent, { type: "move" }>;
    expect(ev.targetIdent).toBeNull();
  });

  it("given damage line, when parsed, then returns DamageEvent", () => {
    // Arrange
    const line = "|-damage|p2a: Rhydon|50/100 par";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("damage");
    const ev = result as Extract<ShowdownEvent, { type: "damage" }>;
    expect(ev.ident).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
    expect(ev.hp).toEqual({ current: 50, max: 100, status: "par" });
  });

  it("given -supereffective line, when parsed, then returns SuperEffectiveEvent", () => {
    // Arrange
    const line = "|-supereffective|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("supereffective");
    const ev = result as Extract<ShowdownEvent, { type: "supereffective" }>;
    expect(ev.ident).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
  });

  it("given -resisted line, when parsed, then returns ResistedEvent", () => {
    // Arrange
    const line = "|-resisted|p1a: Charizard";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("resisted");
  });

  it("given -immune line, when parsed, then returns ImmuneEvent", () => {
    // Arrange
    const line = "|-immune|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("immune");
  });

  it("given -crit line, when parsed, then returns CritEvent", () => {
    // Arrange
    const line = "|-crit|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("crit");
    const ev = result as Extract<ShowdownEvent, { type: "crit" }>;
    expect(ev.ident).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
  });

  it("given -status line with par, when parsed, then status maps to paralysis", () => {
    // Arrange
    const line = "|-status|p2a: Rhydon|par";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("status");
    const ev = result as Extract<ShowdownEvent, { type: "status" }>;
    expect(ev.statusId).toBe("par");
    expect(ev.statusName).toBe("paralysis");
  });

  it("given faint line, when parsed, then returns FaintEvent", () => {
    // Arrange
    const line = "|faint|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("faint");
    const ev = result as Extract<ShowdownEvent, { type: "faint" }>;
    expect(ev.ident).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
  });

  it("given win line, when parsed, then returns WinEvent", () => {
    // Arrange
    const line = "|win|PlayerOne";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("win");
    const ev = result as Extract<ShowdownEvent, { type: "win" }>;
    expect(ev.winner).toBe("PlayerOne");
  });

  it("given turn line, when parsed, then returns TurnEvent with turnNumber", () => {
    // Arrange
    const line = "|turn|5";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("turn");
    const ev = result as Extract<ShowdownEvent, { type: "turn" }>;
    expect(ev.turnNumber).toBe(5);
  });

  it("given -boost line, when parsed, then returns BoostEvent with amount", () => {
    // Arrange
    const line = "|-boost|p1a: Gengar|atk|2";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("boost");
    const ev = result as Extract<ShowdownEvent, { type: "boost" }>;
    expect(ev.ident).toEqual({ side: 0, position: "a", nickname: "Gengar" });
    expect(ev.stat).toBe("atk");
    expect(ev.amount).toBe(2);
  });

  it("given -unboost line, when parsed, then returns UnboostEvent", () => {
    // Arrange
    const line = "|-unboost|p2a: Rhydon|def|1";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("unboost");
    const ev = result as Extract<ShowdownEvent, { type: "unboost" }>;
    expect(ev.stat).toBe("def");
    expect(ev.amount).toBe(1);
  });

  it("given |raw| line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|raw|some html content";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });

  it("given |j| line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|j|☆SomePlayer";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });

  it("given unknown line type, when parsed, then returns UnknownEvent", () => {
    // Arrange
    const line = "|somefuturetype|p1a: Pikachu|data";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("unknown");
    const ev = result as Extract<ShowdownEvent, { type: "unknown" }>;
    expect(ev.raw).toBe(line);
  });

  it("given heal line, when parsed, then returns HealEvent", () => {
    // Arrange
    const line = "|-heal|p1a: Chansey|200/250";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("heal");
    const ev = result as Extract<ShowdownEvent, { type: "heal" }>;
    expect(ev.ident).toEqual({ side: 0, position: "a", nickname: "Chansey" });
    expect(ev.hp).toEqual({ current: 200, max: 250, status: null });
  });

  it("given curestatus line, when parsed, then returns CureStatusEvent", () => {
    // Arrange
    const line = "|-curestatus|p1a: Chansey|par";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("curestatus");
    const ev = result as Extract<ShowdownEvent, { type: "curestatus" }>;
    expect(ev.statusId).toBe("par");
  });

  it("given miss line, when parsed, then returns MissEvent", () => {
    // Arrange
    const line = "|-miss|p1a: Jolteon|p2a: Rhydon";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("miss");
    const ev = result as Extract<ShowdownEvent, { type: "miss" }>;
    expect(ev.userIdent).toEqual({ side: 0, position: "a", nickname: "Jolteon" });
    expect(ev.targetIdent).toEqual({ side: 1, position: "a", nickname: "Rhydon" });
  });

  it("given -fail line, when parsed, then returns FailEvent", () => {
    // Arrange
    const line = "|-fail|p1a: Gengar|unboost";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("fail");
    const ev = result as Extract<ShowdownEvent, { type: "fail" }>;
    expect(ev.reason).toBe("unboost");
  });

  it("given cant line, when parsed, then returns CantEvent", () => {
    // Arrange
    const line = "|cant|p1a: Jolteon|par|Thunder Wave";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("cant");
    const ev = result as Extract<ShowdownEvent, { type: "cant" }>;
    expect(ev.reason).toBe("par");
    expect(ev.moveName).toBe("Thunder Wave");
  });

  it("given tie line, when parsed, then returns TieEvent", () => {
    // Arrange
    const line = "|tie";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("tie");
  });

  it("given hitcount line, when parsed, then returns HitCountEvent", () => {
    // Arrange
    const line = "|-hitcount|p2a: Rhydon|5";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("hitcount");
    const ev = result as Extract<ShowdownEvent, { type: "hitcount" }>;
    expect(ev.count).toBe(5);
  });

  it("given -start line, when parsed, then returns StartEvent", () => {
    // Arrange
    const line = "|-start|p1a: Gengar|confusion";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("start");
    const ev = result as Extract<ShowdownEvent, { type: "start" }>;
    expect(ev.effect).toBe("confusion");
  });

  it("given -end line, when parsed, then returns EndEvent", () => {
    // Arrange
    const line = "|-end|p1a: Gengar|confusion";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("end");
    const ev = result as Extract<ShowdownEvent, { type: "end" }>;
    expect(ev.effect).toBe("confusion");
  });

  it("given |start| (battle start, no ident) line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|start";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });

  it("given damage line with [from] annotation, when parsed, then from field is set", () => {
    // Arrange
    const line = "|-damage|p1a: Gengar|80/100|[from] psn";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("damage");
    const ev = result as Extract<ShowdownEvent, { type: "damage" }>;
    expect(ev.from).toBe("psn");
  });

  it("given switch line without level, when parsed, then level defaults to 100", () => {
    // Arrange
    const line = "|switch|p2a: Pikachu|Pikachu|243/243";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("switch");
    const ev = result as Extract<ShowdownEvent, { type: "switch" }>;
    expect(ev.level).toBe(100);
  });

  it("given -drag line (forced switch), when parsed, then returns SwitchEvent", () => {
    // Arrange
    const line = "|-drag|p2a: Starmie|Starmie, L50|200/200";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result?.type).toBe("switch");
    const ev = result as Extract<ShowdownEvent, { type: "switch" }>;
    expect(ev.species).toBe("Starmie");
  });

  it("given |tier| line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|tier|[Gen 1] OU";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });

  it("given |gen| line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|gen|1";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });

  it("given |player| line, when parsed, then returns null (skipped)", () => {
    // Arrange
    const line = "|player|p1|PlayerOne|1";

    // Act
    const result = parseLine(line);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseReplay
// ---------------------------------------------------------------------------
describe("parseReplay", () => {
  const minimalLog = [
    "|gen|1",
    "|tier|[Gen 1] OU",
    "|player|p1|PlayerOne|1",
    "|player|p2|PlayerTwo|2",
    "|teamsize|p1|6",
    "|teamsize|p2|6",
    "|gametype|singles",
    "|start",
    "|switch|p1a: Charizard|Charizard, L50|281/281",
    "|switch|p2a: Rhydon|Rhydon, L50|263/263",
    "|turn|1",
    "|move|p1a: Charizard|Flamethrower|p2a: Rhydon",
    "|-damage|p2a: Rhydon|200/263",
    "|turn|2",
    "|move|p2a: Rhydon|Horn Drill|p1a: Charizard",
    "|-miss|p2a: Rhydon|p1a: Charizard",
    "|win|PlayerOne",
  ].join("\n");

  it("given minimal log with gen, tier, players, then ParsedReplay has correct metadata", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    expect(result.generation).toBe(1);
    expect(result.format).toBe("[Gen 1] OU");
    expect(result.players).toEqual(["PlayerOne", "PlayerTwo"]);
  });

  it("given log with turn events, then turns are correctly grouped", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    // Turn 0 holds pre-battle switch events; turns 1 and 2 are battle turns
    expect(result.turns.length).toBe(3);
    const turn1 = result.turns.find((t) => t.turnNumber === 1);
    const turn2 = result.turns.find((t) => t.turnNumber === 2);
    expect(turn1).toBeDefined();
    expect(turn2).toBeDefined();
    expect(turn1?.turnNumber).toBe(1);
    expect(turn2?.turnNumber).toBe(2);
  });

  it("given log with switch events, then teams are reconstructed", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    expect(result.teams[0].length).toBeGreaterThan(0);
    expect(result.teams[0][0].species).toBe("Charizard");
    expect(result.teams[0][0].level).toBe(50);
    expect(result.teams[1][0].species).toBe("Rhydon");
    expect(result.teams[1][0].level).toBe(50);
  });

  it("given log with move events, then known moves are collected", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    const charizard = result.teams[0].find((p) => p.species === "Charizard");
    expect(charizard?.knownMoves).toContain("flamethrower");
    const rhydon = result.teams[1].find((p) => p.species === "Rhydon");
    expect(rhydon?.knownMoves).toContain("horn-drill");
  });

  it("given log with win event, then winner is set", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    expect(result.winner).toBe("PlayerOne");
  });

  it("given log with tie event, then winner is null", () => {
    // Arrange
    const tieLog = [
      "|gen|1",
      "|tier|[Gen 1] OU",
      "|player|p1|PlayerOne|1",
      "|player|p2|PlayerTwo|2",
      "|start",
      "|turn|1",
      "|tie",
    ].join("\n");

    // Act
    const result = parseReplay(tieLog);

    // Assert
    expect(result.winner).toBeNull();
  });

  it("given log without win or tie, then winner is null", () => {
    // Arrange
    const incompleteLog = [
      "|gen|1",
      "|tier|[Gen 1] OU",
      "|player|p1|PlayerOne|1",
      "|player|p2|PlayerTwo|2",
      "|start",
      "|turn|1",
    ].join("\n");

    // Act
    const result = parseReplay(incompleteLog);

    // Assert
    expect(result.winner).toBeNull();
  });

  it("given log with multiple switches of same pokemon, then no duplicate team entries", () => {
    // Arrange
    const log = [
      "|gen|1",
      "|tier|[Gen 1] OU",
      "|player|p1|PlayerOne|1",
      "|player|p2|PlayerTwo|2",
      "|start",
      "|switch|p1a: Jolteon|Jolteon, L50|273/273",
      "|turn|1",
      "|switch|p1a: Gengar|Gengar, L50|261/261",
      "|turn|2",
      "|switch|p1a: Jolteon|Jolteon, L50|273/273",
    ].join("\n");

    // Act
    const result = parseReplay(log);

    // Assert
    const p1Team = result.teams[0];
    const jolteonEntries = p1Team.filter((p) => p.species === "Jolteon");
    expect(jolteonEntries.length).toBe(1);
  });

  it("given log with pre-turn switch events, then those events go into turn 0", () => {
    // Arrange
    const log = [
      "|gen|1",
      "|tier|[Gen 1] OU",
      "|player|p1|PlayerOne|1",
      "|player|p2|PlayerTwo|2",
      "|start",
      "|switch|p1a: Charizard|Charizard, L50|281/281",
      "|switch|p2a: Rhydon|Rhydon, L50|263/263",
      "|turn|1",
    ].join("\n");

    // Act
    const result = parseReplay(log);

    // Assert
    // Turn 0 should exist with the pre-battle switches
    const turn0 = result.turns.find((t) => t.turnNumber === 0);
    expect(turn0).toBeDefined();
    expect(turn0?.events.some((e) => e.type === "switch")).toBe(true);
  });

  it("given replay id is empty string by default (caller sets it), then id is empty", () => {
    // Arrange / Act
    const result = parseReplay(minimalLog);

    // Assert
    expect(result.id).toBe("");
  });

  it("given log with status events in a turn, then those events appear in the turn", () => {
    // Arrange
    const log = [
      "|gen|1",
      "|tier|[Gen 1] OU",
      "|player|p1|PlayerOne|1",
      "|player|p2|PlayerTwo|2",
      "|start",
      "|turn|1",
      "|move|p1a: Jolteon|Thunder Wave|p2a: Rhydon",
      "|-status|p2a: Rhydon|par",
    ].join("\n");

    // Act
    const result = parseReplay(log);

    // Assert
    const turn1 = result.turns.find((t) => t.turnNumber === 1);
    expect(turn1?.events.some((e) => e.type === "status")).toBe(true);
  });
});
