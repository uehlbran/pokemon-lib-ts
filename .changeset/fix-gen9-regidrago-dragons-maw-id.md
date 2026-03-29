---
"@pokemon-lib-ts/gen9": patch
---

Fix Regidrago's Dragon's Maw ability ID mismatch in Gen 9 data

The ability was stored as `"dragon's-maw"` (with apostrophe) in `abilities.json`
and `reference-ids.ts`, but `pokemon.json` referenced `"dragons-maw"` (no apostrophe).
This caused Dragon's Maw to never be found for Regidrago in Gen 9 battles.

The canonical ID `"dragons-maw"` now matches Gen 8's consistent usage and the
data importer's `toKebab()` function which strips apostrophes. The reference key
is corrected from `dragonSMaw` to `dragonsMaw` to match Gen 8.
