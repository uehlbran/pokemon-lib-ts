---
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/core": patch
---

feat(gen4): weather accuracy overrides and item accuracy modifiers

- Thunder 100% accuracy in rain, 50% accuracy in sun
- Blizzard 100% accuracy in hail (Gen 4 addition)
- Zoom Lens +20% accuracy when attacker moves after target
- BrightPowder / Lax Incense -10% accuracy for defender held items
- SolarBeam half power in rain/sand/hail (not sun)
- Metronome item consecutive-use power boost (1.0x to 2.0x in 0.2x increments)
- Added "metronome-count" to VolatileStatus union type
