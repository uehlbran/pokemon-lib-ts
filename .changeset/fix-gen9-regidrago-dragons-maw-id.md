---
"@pokemon-lib-ts/gen9": minor
---

Fix Regidrago's Dragon's Maw ability ID mismatch in Gen 9 data

The ability was stored as `"dragon's-maw"` (with apostrophe) in `abilities.json`
and `reference-ids.ts`, but `pokemon.json` referenced `"dragons-maw"` (no apostrophe).
This caused Dragon's Maw to never be found for Regidrago in Gen 9 battles.

The canonical IDs now match Gen 8's consistent usage and the data importer's
`toKebab()` function which strips apostrophes. Keys corrected:
- `dragonSMaw: "dragon's-maw"` → `dragonsMaw: "dragons-maw"` (breaking key rename)
- `mindSEye: "mind's-eye"` → `mindsEye: "minds-eye"` (preemptive fix, same class)
