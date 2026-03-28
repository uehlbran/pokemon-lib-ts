---
"@pokemon-lib-ts/battle": patch
---

Clone submitted actions on ingress (submitAction) instead of only at resolution time, preventing caller-side mutations from affecting queued engine behavior.
