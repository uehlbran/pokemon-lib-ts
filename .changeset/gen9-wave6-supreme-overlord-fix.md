---
"@pokemon-lib-ts/gen9": patch
---

fix(gen9): Supreme Overlord handler now correctly returns NO_ACTIVATION when no allies have fainted (0 fainted = 1.0x modifier = no actual boost), preventing spurious activation messages.
