import type { ItemEffect } from "./types";

// These assignments intentionally fail the package typecheck until the dead
// public variants are removed from ItemEffect.
// @ts-expect-error - damage-boost is not a supported ItemEffect variant
const damageBoostEffect: ItemEffect = { type: "damage-boost", target: "self", value: 1 };

// @ts-expect-error - status-prevention is not a supported ItemEffect variant
const statusPreventionEffect: ItemEffect = { type: "status-prevention", target: "opponent" };

void damageBoostEffect;
void statusPreventionEffect;
