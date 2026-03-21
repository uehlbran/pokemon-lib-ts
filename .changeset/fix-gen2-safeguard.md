---
"@pokemon-lib-ts/gen2": patch
---

Fix three Safeguard correctness bugs from PR #234: guaranteed-status moves (Spore, Thunder Wave) bypassed Safeguard; Safeguard decremented twice per turn halving its duration; Safeguard move itself never activated due to null effect guard.
