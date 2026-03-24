import type { AbilityEffect } from "../../src/context";

const assertAbilityEffect = (_effect: AbilityEffect) => undefined;

// @ts-expect-error move-prevented is not a supported AbilityEffect variant
assertAbilityEffect({ effectType: "move-prevented", target: "self" });
