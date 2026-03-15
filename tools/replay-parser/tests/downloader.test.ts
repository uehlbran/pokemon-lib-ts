import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadAndSave,
  downloadBatch,
  downloadReplay,
  searchReplays,
} from "../src/downloader.js";
import type { ReplaySearchResult, ShowdownReplayJson } from "../src/replay-types.js";

// Mock node:fs/promises so no real disk writes occur
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error("not ok")),
  } as unknown as Response;
}

const sampleReplay: ShowdownReplayJson = {
  id: "gen1ou-123456",
  format: "Gen 1 OU",
  formatid: "gen1ou",
  log: "|turn|1\n|move|p1a: Pikachu|Thunderbolt|p2a: Squirtle\n|win|Player1",
  uploadtime: 1_700_000_000,
  views: 42,
  players: ["Player1", "Player2"],
};

const sampleSearchResults: ReplaySearchResult[] = [
  {
    id: "gen1ou-1",
    format: "gen1ou",
    uploadtime: 1_700_000_000,
    players: ["a", "b"],
    rating: 1500,
  },
  { id: "gen1ou-2", format: "gen1ou", uploadtime: 1_700_000_001, players: ["c", "d"] },
  {
    id: "gen1ou-3",
    format: "gen1ou",
    uploadtime: 1_700_000_002,
    players: ["e", "f"],
    rating: 1600,
  },
];

// ---------------------------------------------------------------------------
// downloadReplay
// ---------------------------------------------------------------------------

describe("downloadReplay", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Use fake timers so rate-limit sleeps complete instantly via runAllTimersAsync
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("given a replay id, when downloadReplay is called, then fetches from correct URL", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleReplay));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = downloadReplay("gen1ou-123456");
    await vi.runAllTimersAsync();
    await promise;

    // Assert
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("https://replay.pokemonshowdown.com/gen1ou-123456.json");
  });

  it("given a valid response, when downloadReplay is called, then returns ShowdownReplayJson", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleReplay));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = downloadReplay("gen1ou-123456");
    await vi.runAllTimersAsync();
    const result = await promise;

    // Assert
    expect(result).toEqual(sampleReplay);
    expect(result.id).toBe("gen1ou-123456");
    expect(result.formatid).toBe("gen1ou");
    expect(result.log).toContain("|turn|1");
  });

  it("given a 404 response, when downloadReplay is called, then throws an error", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(404, "Not Found"));
    vi.stubGlobal("fetch", mockFetch);

    // Act & Assert — attach a catch before running timers to avoid unhandled rejection warnings
    const promise = downloadReplay("gen1ou-nonexistent");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(
      "Failed to fetch replay gen1ou-nonexistent: 404 Not Found",
    );
  });

  it("given a network error, when downloadReplay is called, then throws an error", async () => {
    // Arrange
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    // Act & Assert — attach a catch before running timers to avoid unhandled rejection warnings
    const promise = downloadReplay("gen1ou-123456");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("Network error");
  });

  it("given a response missing the log field, when downloadReplay is called, then throws", async () => {
    // Arrange
    const badData = { id: "gen1ou-123456", format: "gen1ou" }; // no log field
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(badData));
    vi.stubGlobal("fetch", mockFetch);

    // Act & Assert — attach a catch before running timers to avoid unhandled rejection warnings
    const promise = downloadReplay("gen1ou-123456");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(
      "Unexpected response shape for replay gen1ou-123456: missing 'log' field",
    );
  });
});

// ---------------------------------------------------------------------------
// searchReplays
// ---------------------------------------------------------------------------

describe("searchReplays", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("given a format, when searchReplays is called, then fetches from search URL with format param", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleSearchResults));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = searchReplays({ format: "gen1ou" });
    await vi.runAllTimersAsync();
    await promise;

    // Assert
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://replay.pokemonshowdown.com/search.json?format=gen1ou",
    );
  });

  it("given a valid search response, when searchReplays is called, then returns array of ReplaySearchResult", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleSearchResults));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = searchReplays({ format: "gen1ou" });
    await vi.runAllTimersAsync();
    const results = await promise;

    // Assert
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ id: "gen1ou-1", format: "gen1ou" });
    expect(results[1]).toMatchObject({ id: "gen1ou-2" });
  });

  it("given count option, when searchReplays is called, then returns at most count results", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleSearchResults));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = searchReplays({ format: "gen1ou", count: 2 });
    await vi.runAllTimersAsync();
    const results = await promise;

    // Assert
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("gen1ou-1");
    expect(results[1]?.id).toBe("gen1ou-2");
  });

  it("given empty results, when searchReplays is called, then returns empty array", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = searchReplays({ format: "gen1ou" });
    await vi.runAllTimersAsync();
    const results = await promise;

    // Assert
    expect(results).toEqual([]);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// downloadAndSave
// ---------------------------------------------------------------------------

describe("downloadAndSave", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    // Mock timers so rate-limit sleep resolves instantly
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("given a replay id and output dir, when downloadAndSave is called, then saves .log file", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleReplay));
    vi.stubGlobal("fetch", mockFetch);
    const outputDir = "/tmp/replays";

    // Act
    const promise = downloadAndSave("gen1ou-123456", outputDir);
    await vi.runAllTimersAsync();
    await promise;

    // Assert
    expect(mockMkdir).toHaveBeenCalledWith(outputDir, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      join(outputDir, "gen1ou-123456.log"),
      sampleReplay.log,
      "utf-8",
    );
  });

  it("given a replay id, when downloadAndSave is called, then returns the file path", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleReplay));
    vi.stubGlobal("fetch", mockFetch);
    const outputDir = "/tmp/replays";

    // Act
    const promise = downloadAndSave("gen1ou-123456", outputDir);
    await vi.runAllTimersAsync();
    const filePath = await promise;

    // Assert
    expect(filePath).toBe(join(outputDir, "gen1ou-123456.log"));
  });

  it("given a download error, when downloadAndSave is called, then throws", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(500, "Internal Server Error"));
    vi.stubGlobal("fetch", mockFetch);

    // Act & Assert — attach a catch before running timers to avoid unhandled rejection warnings
    const promise = downloadAndSave("gen1ou-bad", "/tmp/replays");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(
      "Failed to fetch replay gen1ou-bad: 500 Internal Server Error",
    );
  });

  it("given an ID with path traversal characters, when downloadAndSave is called, then throws", async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(sampleReplay));
    vi.stubGlobal("fetch", mockFetch);

    // Act & Assert — validation is synchronous, throws before any fetch or timer
    await expect(downloadAndSave("../evil/path", "/tmp/replays")).rejects.toThrow(
      'Invalid replay ID: "../evil/path"',
    );
    await expect(downloadAndSave("gen1ou/../../etc/passwd", "/tmp/replays")).rejects.toThrow(
      "Invalid replay ID:",
    );
  });
});

// ---------------------------------------------------------------------------
// downloadBatch
// ---------------------------------------------------------------------------

describe("downloadBatch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("given a format and count, when downloadBatch is called, then searches and downloads each replay", async () => {
    // Arrange: mock searchReplays returning 2 results, downloadAndSave returning paths
    const twoResults = sampleSearchResults.slice(0, 2);
    const replayForId1: ShowdownReplayJson = { ...sampleReplay, id: "gen1ou-1" };
    const replayForId2: ShowdownReplayJson = { ...sampleReplay, id: "gen1ou-2" };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOkResponse(twoResults))
      .mockResolvedValueOnce(makeOkResponse(replayForId1))
      .mockResolvedValueOnce(makeOkResponse(replayForId2));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = downloadBatch({ format: "gen1ou", count: 2, outputDir: "/tmp/replays" });
    await vi.runAllTimersAsync();
    const paths = await promise;

    // Assert: returns array of file paths, one per result
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe(join("/tmp/replays", "gen1ou-1.log"));
    expect(paths[1]).toBe(join("/tmp/replays", "gen1ou-2.log"));
  });

  it("given an onProgress callback, when downloadBatch is called, then calls progress for each replay", async () => {
    // Arrange
    const twoResults = sampleSearchResults.slice(0, 2);
    const replayForId1: ShowdownReplayJson = { ...sampleReplay, id: "gen1ou-1" };
    const replayForId2: ShowdownReplayJson = { ...sampleReplay, id: "gen1ou-2" };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOkResponse(twoResults))
      .mockResolvedValueOnce(makeOkResponse(replayForId1))
      .mockResolvedValueOnce(makeOkResponse(replayForId2));
    vi.stubGlobal("fetch", mockFetch);
    const onProgress = vi.fn();

    // Act
    const promise = downloadBatch({
      format: "gen1ou",
      count: 2,
      outputDir: "/tmp/replays",
      onProgress,
    });
    await vi.runAllTimersAsync();
    await promise;

    // Assert: onProgress called with (id, index, total)
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, "gen1ou-1", 0, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, "gen1ou-2", 1, 2);
  });

  it("given empty search results, when downloadBatch is called, then returns empty array", async () => {
    // Arrange: mock searchReplays returning []
    const mockFetch = vi.fn().mockResolvedValueOnce(makeOkResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    // Act
    const promise = downloadBatch({ format: "gen1ou", count: 5, outputDir: "/tmp/replays" });
    await vi.runAllTimersAsync();
    const paths = await promise;

    // Assert
    expect(paths).toEqual([]);
    expect(paths).toHaveLength(0);
  });
});
