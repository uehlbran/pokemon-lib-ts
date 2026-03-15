import type { Invariant } from "../types.js";

/** Invariant 8: Status type immunities */
export const statusTypeImmunity: Invariant = {
  name: "status-type-immunity",
  description: "Type-based status immunities must be respected (Fire can't burn, etc.)",
  check(_events, _config) {
    // Type immunity checks require type data not available in the event stream.
    // PokemonSnapshot (emitted on switch-in) does not include a `types` field,
    // and StatusInflictEvent only carries the pokemon name string — not type data.
    // This invariant is reserved for future implementation when type data is surfaced in events.
    return [];
  },
};
