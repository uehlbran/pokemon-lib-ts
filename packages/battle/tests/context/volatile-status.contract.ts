import type { ActivePokemonFor, MoveEffectResultFor } from "../../src";

type Gen1VolatileKey = Parameters<ActivePokemonFor<1>["volatileStatuses"]["set"]>[0];

const validGen1Volatile: Gen1VolatileKey = "rage";
void validGen1Volatile;

// @ts-expect-error Gen 9-only volatile must not be accepted by a Gen 1 battle view
const invalidGen1Volatile: Gen1VolatileKey = "silk-trap";
void invalidGen1Volatile;

const validGen4MoveVolatile: MoveEffectResultFor<4>["volatileInflicted"] = "ingrain";
void validGen4MoveVolatile;

// @ts-expect-error Gen 8-only volatile must not be accepted by a Gen 4 move result
const invalidGen4MoveVolatile: MoveEffectResultFor<4>["volatileInflicted"] = "no-retreat";
void invalidGen4MoveVolatile;
