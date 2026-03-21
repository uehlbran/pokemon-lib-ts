---
"@pokemon-lib-ts/gen3": patch
---

fix(gen3): Shedinja HP=1 override, OHKO accuracy formula, and test coverage gaps

- Shedinja (#292) now correctly overrides `calculateStats` to pin HP to 1 after stat
  calculation (Gen 3 Wonder Guard prerequisite, confirmed by pokeemerald species data).
  Closes #379.

- OHKO accuracy now matches pokeemerald `battle_script_commands.c` exactly:
  auto-miss when `attackerLevel < defenderLevel`; hit when `rng(1-100) < (accuracy + levelDiff)`.
  Previous implementation used wrong auto-miss condition (`ohkoAccuracy <= 0`) and inclusive
  bound (`<= ohkoAccuracy`) instead of strict-less-than. Closes #392.

- Added test coverage for: freeze thaw chance (30%, pokeemerald `HandleFrozenStatus`) (#381),
  nature modifiers (±10% from Bulbapedia formula) (#389), Choice Band power boost (#382),
  and Reflect/Light Screen damage halving (#399 already implemented; tests verified).

- Replaced weak assertions (`toBeGreaterThan(0)`, `toBeDefined()`) with exact `toBe()` values
  backed by formula derivations and Showdown sources. Closes #395.
