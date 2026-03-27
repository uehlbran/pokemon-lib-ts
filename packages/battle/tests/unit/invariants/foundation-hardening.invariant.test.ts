import { CORE_MOVE_IDS, type PokemonInstance } from "@pokemon-lib-ts/core";
import { GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

function createInvariantEngine(team1: PokemonInstance[], team2?: PokemonInstance[]): BattleEngine {
  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [
      team1,
      team2 ?? [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, { uid: "blastoise-1" })],
    ],
    seed: 12345,
  };

  return new BattleEngine(config, new MockRuleset(), createMockDataManager());
}

describe("foundation hardening invariants - battle", () => {
  it("rejects invalid battle input before initialization with structured validation issues", () => {
    const result = BattleEngine.validateConfig(
      {
        generation: 1,
        format: "singles",
        teams: [
          [
            createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
              uid: "charizard-1",
              moves: [{ ...createMockMoveSlot(CORE_MOVE_IDS.tackle), moveId: "missing-move" }],
            }),
          ],
          [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, { uid: "blastoise-1" })],
        ],
        seed: 12345,
      },
      new MockRuleset(),
      createMockDataManager(),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      entity: "move",
      id: "missing-move",
      field: "teams[0][0].moves[0].moveId",
      message: 'Move "missing-move" is not available in Gen 1',
    });
  });

  it("does not mutate caller-owned pokemon during turn execution", () => {
    const originalPokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      currentHp: 17,
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    });
    const originalSnapshot = structuredClone(originalPokemon);

    const engine = createInvariantEngine([originalPokemon]);
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(originalPokemon).toEqual(originalSnapshot);
    expect(originalPokemon.timesAttacked).toBeUndefined();
    expect(originalPokemon.rageFistLastHitTurns).toBeUndefined();
  });

  it("preserves in-battle state on the internal clone across a switch while leaving caller-owned objects untouched", () => {
    const charizard = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      currentHp: 33,
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    });
    const pikachu = createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
      uid: "pikachu-1",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    });

    const engine = createInvariantEngine([charizard, pikachu]);
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damagedClone = engine.getTeam(0)[0];
    if (!damagedClone) {
      throw new Error("Expected the internal Charizard clone to exist");
    }

    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getTeam(0)[0]?.currentHp).toBe(damagedClone.currentHp);
    expect(charizard.currentHp).toBe(33);
  });
});
