import { createMockDataManager } from "./mock-data-manager";

const TEST_DATA_MANAGER = createMockDataManager();

export function createMockMoveSlot(
  moveId: string,
  overrides: Partial<{ currentPP: number; maxPP: number; ppUps: number }> = {},
) {
  const moveData = TEST_DATA_MANAGER.getMove(moveId);

  return {
    moveId,
    currentPP: overrides.currentPP ?? moveData.pp,
    maxPP: overrides.maxPP ?? moveData.pp,
    ppUps: overrides.ppUps ?? 0,
  };
}
