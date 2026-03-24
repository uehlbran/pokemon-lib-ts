import type { ActivePokemonFor, MoveEffectResultFor } from "../../src";

type Gen1VolatileKey = Parameters<ActivePokemonFor<1>["volatileStatuses"]["set"]>[0];

// Provenance:
// - packages/core/src/entities/status.ts: GEN1_VOLATILE_STATUSES includes "rage".
// - packages/gen9/src/Gen9MoveEffects.ts introduces the "silk-trap" volatile for Silk Trap.
const validGen1Volatile: Gen1VolatileKey = "rage";
void validGen1Volatile;

// @ts-expect-error Gen 9-only volatile must not be accepted by a Gen 1 battle view
const invalidGen1Volatile: Gen1VolatileKey = "silk-trap";
void invalidGen1Volatile;

// Provenance:
// - packages/core/src/entities/status.ts: Gen4VolatileStatus includes inherited "ingrain".
// - packages/gen8/src/Gen8MoveEffects.ts introduces the "no-retreat" volatile for No Retreat.
const validGen4MoveVolatile: MoveEffectResultFor<4>["volatileInflicted"] = "ingrain";
void validGen4MoveVolatile;

// @ts-expect-error Gen 8-only volatile must not be accepted by a Gen 4 move result
const invalidGen4MoveVolatile: MoveEffectResultFor<4>["volatileInflicted"] = "no-retreat";
void invalidGen4MoveVolatile;
