---
"@pokemon-lib-ts/gen9": minor
---

Narrow the Gen 9 root public API to a single canonical ability-handler surface.

The package root now exports `handleGen9IntrepidSword`, `handleGen9DauntlessShield`,
and `handleGen9Protean` instead of exposing both canonical handlers and lower-level
state-mutation helpers for the same mechanics. The ambiguous floating-point
`getSupremeOverlordMultiplier` helper is also no longer exported from the package
root; use `getSupremeOverlordModifier` from the root API for fixed-point damage math.
