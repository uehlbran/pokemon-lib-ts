/**
 * Tests for smoke runner team generation improvements.
 *
 * Validates that teams use realistic diversity: full 6-member teams, randomized
 * items, varied natures, varied ability slots, and shuffled move selection.
 */

import { SeededRandom } from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "@pokemon-lib-ts/gen1";
import { createGen3DataManager } from "@pokemon-lib-ts/gen3";
import { createGen9DataManager } from "@pokemon-lib-ts/gen9";
import { describe, expect, it } from "vitest";
import { generateMinimalTeam } from "../src/smoke-runner.js";

const gen1DataManager = createGen1DataManager();
const gen3DataManager = createGen3DataManager();
const gen9DataManager = createGen9DataManager();

describe("smoke-runner generateMinimalTeam — realistic team diversity", () => {
  // ---------------------------------------------------------------------------
  // Team size
  // ---------------------------------------------------------------------------

  it("given gen9 with TEAM_SIZE=6, when generating a team, then team has 6 members", () => {
    const rng = new SeededRandom(0xdead_beef);
    const team = generateMinimalTeam(9, gen9DataManager, rng, "p1");
    expect(team.length).toBe(6);
  });

  it("given gen3 with TEAM_SIZE=6, when generating a team, then team has 6 members", () => {
    const rng = new SeededRandom(0xcafe_babe);
    const team = generateMinimalTeam(3, gen3DataManager, rng, "p1");
    expect(team.length).toBe(6);
  });

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  it("given gen9 across 5 different seeds, when generating teams, then at least one team has a non-null item", () => {
    // Source: items should be randomly sampled from the gen's item pool
    const seeds = [0x1111, 0x2222, 0x3333, 0x4444, 0x5555];
    const allMembers = seeds.flatMap((seed) => {
      const rng = new SeededRandom(seed);
      return generateMinimalTeam(9, gen9DataManager, rng, "p1");
    });
    const hasItem = allMembers.some((m) => m.heldItem !== null);
    expect(hasItem).toBe(true);
  });

  it("given gen9 across 5 different seeds, when generating teams, then items are not all the same", () => {
    // Source: items should vary between teams/members
    const seeds = [0xaaaa, 0xbbbb, 0xcccc, 0xdddd, 0xeeee];
    const allItems = seeds.flatMap((seed) => {
      const rng = new SeededRandom(seed);
      return generateMinimalTeam(9, gen9DataManager, rng, "p1").map((m) => m.heldItem);
    });
    const nonNullItems = allItems.filter((i) => i !== null);
    expect(nonNullItems.length).toBeGreaterThan(0);
    const uniqueItems = new Set(nonNullItems);
    expect(uniqueItems.size).toBeGreaterThan(1);
  });

  // ---------------------------------------------------------------------------
  // Natures
  // ---------------------------------------------------------------------------

  it("given gen9 across 10 different seeds, when generating teams, then natures are varied (not all serious/hardy)", () => {
    // Source: 25 natures available since Gen 3; should be randomly selected
    const seeds = Array.from({ length: 10 }, (_, i) => 0x1000 + i * 0x111);
    const allNatures = seeds.flatMap((seed) => {
      const rng = new SeededRandom(seed);
      return generateMinimalTeam(9, gen9DataManager, rng, "p1").map((m) => m.nature);
    });
    const uniqueNatures = new Set(allNatures);
    expect(uniqueNatures.size).toBeGreaterThan(2); // More than just serious/hardy
  });

  // ---------------------------------------------------------------------------
  // Ability slot randomization
  // ---------------------------------------------------------------------------

  it("given gen9 across 10 different seeds, when generating teams, then ability slots are varied", () => {
    // Source: ability slots should be randomly picked from available normal/hidden slots
    const seeds = Array.from({ length: 10 }, (_, i) => 0x2000 + i * 0x111);
    const allSlots = seeds.flatMap((seed) => {
      const rng = new SeededRandom(seed);
      return generateMinimalTeam(9, gen9DataManager, rng, "p1").map((m) => m.abilitySlot);
    });
    const uniqueSlots = new Set(allSlots);
    expect(uniqueSlots.size).toBeGreaterThan(1); // Not all normal1
  });

  // ---------------------------------------------------------------------------
  // Move randomization
  // ---------------------------------------------------------------------------

  it("given gen9 across 3 different seeds, when generating teams, then moves are shuffled (not always first 4)", () => {
    // Source: moves should be randomly sampled from the full learnset, not always first 4
    const teams = [0x3000, 0x4000, 0x5000].map((seed) => {
      const rng = new SeededRandom(seed);
      return generateMinimalTeam(9, gen9DataManager, rng, "p1");
    });
    // Collect all distinct first-move IDs across teams
    const firstMoveIds = new Set(
      teams.flatMap((team) => team.map((m) => m.moves[0]?.moveId ?? "")),
    );
    // With true randomization, different seeds should yield different first moves
    expect(firstMoveIds.size).toBeGreaterThan(1);
  });

  // ---------------------------------------------------------------------------
  // Gen 1 invariants (different code path: no abilities, no items, neutral nature)
  // ---------------------------------------------------------------------------

  it("given gen1 with TEAM_SIZE=6, when generating a team, then team has 6 members", () => {
    const rng = new SeededRandom(0xf00d_cafe);
    const team = generateMinimalTeam(1, gen1DataManager, rng, "p1");
    expect(team.length).toBe(6);
  });

  it("given gen1, when generating a team, then all members have null items", () => {
    // Source: Gen 1 has no held item mechanic
    const rng = new SeededRandom(0xabcd_1234);
    const team = generateMinimalTeam(1, gen1DataManager, rng, "p1");
    for (const member of team) {
      expect(member.heldItem).toBeNull();
    }
  });

  it("given gen1, when generating a team, then all members have neutral nature (serious)", () => {
    // Source: Gen 1 has no nature mechanic — neutral nature avoids stat modifiers
    const rng = new SeededRandom(0x1234_5678);
    const team = generateMinimalTeam(1, gen1DataManager, rng, "p1");
    for (const member of team) {
      expect(member.nature).toBe("serious");
    }
  });

  it("given gen1, when generating a team, then all members have empty ability string", () => {
    // Source: Gen 1 has no ability mechanic
    const rng = new SeededRandom(0x9abc_def0);
    const team = generateMinimalTeam(1, gen1DataManager, rng, "p1");
    for (const member of team) {
      expect(member.ability).toBe("");
    }
  });
});
