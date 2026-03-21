---
"@pokemon-lib-ts/gen2": patch
---

Fix five Gen 2 move correctness bugs: guaranteed-status moves (Spore, Thunder Wave) bypassed Safeguard; Safeguard decremented twice per turn halving its duration; Safeguard/Mean Look/Spider Web never activated due to null effect guard in executeMoveEffect; explosion/self-destruct had unreachable dead-code handler.
