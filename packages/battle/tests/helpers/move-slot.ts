import type { MoveData } from "@pokemon-lib-ts/core";
import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { createMockDataManager } from "./mock-data-manager";

const TEST_DATA_MANAGER = createMockDataManager();
const MOVE_PP_OVERRIDES = new Map<string, number>([
  [CORE_MOVE_IDS.futureSight, 10],
  [CORE_MOVE_IDS.growl, 40],
  [CORE_MOVE_IDS.pursuit, 20],
  [CORE_MOVE_IDS.sleepTalk, 10],
  [CORE_MOVE_IDS.snore, 15],
]);

export function createMockMoveSlot(
  moveId: string,
  overrides: Partial<{ currentPP: number; maxPP: number; ppUps: number }> = {},
) {
  let moveData: MoveData | null;
  try {
    moveData = TEST_DATA_MANAGER.getMove(moveId);
  } catch {
    moveData = null;
  }
  const defaultPp = MOVE_PP_OVERRIDES.get(moveId) ?? moveData?.pp;
  if (defaultPp === undefined) {
    throw new Error(`Move "${moveId}" not found`);
  }

  return {
    moveId,
    currentPP: overrides.currentPP ?? defaultPp,
    maxPP: overrides.maxPP ?? defaultPp,
    ppUps: overrides.ppUps ?? 0,
  };
}
