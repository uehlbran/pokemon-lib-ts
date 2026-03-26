import { BATTLE_EFFECT_TARGETS } from "../constants/effect-protocol";
import type { ItemEffect } from "./types";

// These assignments intentionally use INVALID discriminants. They exist to make sure
// unsupported public variants continue to fail the package typecheck.
const damageBoostEffect: ItemEffect = {
  // @ts-expect-error - damage-boost is not a supported ItemEffect variant
  type: "damage-boost",
  target: BATTLE_EFFECT_TARGETS.self,
  value: 1,
};

const statusPreventionEffect: ItemEffect = {
  // @ts-expect-error - status-prevention is not a supported ItemEffect variant
  type: "status-prevention",
  target: BATTLE_EFFECT_TARGETS.opponent,
};

void damageBoostEffect;
void statusPreventionEffect;
