---
"@pokemon-lib-ts/gen5": patch
---

Document Protect/Detect cap behavior divergence from Showdown at N>=8: we use 1/256 probability while Showdown uses ~1/4294967296, both effectively impossible in practice.
