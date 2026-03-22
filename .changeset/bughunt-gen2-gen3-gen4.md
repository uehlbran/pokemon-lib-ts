---
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": minor
---

Deep bughunt Gen 2-4: sequential type effectiveness, Metal Powder, Marvel Scale int math, HP DV derivation, ability trigger rates, Cloud Nine/Air Lock field suppression

Gen 2: HP DV now derived from lower bits of Atk/Def/Spe/Spc DVs per pokecrystal (BUG-8); DV clamping consistent across all stats.

Gen 3: Metal Powder doubles Ditto (species 132) physical Defense per pokeemerald (BUG-7); contact ability rates corrected from 30% to 33.3% (1/3) per pokeemerald; Effect Spore corrected from 30% to 10%.

Gen 4: Sequential type effectiveness with intermediate floor per defender type matching pokeplatinum ApplyTypeMultiplier (BUG-3); Marvel Scale uses integer arithmetic floor((stat*150)/100) per pokeplatinum (BUG-6); Cloud Nine/Air Lock now suppresses weather chip damage, Rain Dish/Ice Body, Chlorophyll/Swift Swim speed, Thunder/Blizzard accuracy, and all weather-dependent stat boosts; Speed Boost skips activation on switch-in turn; new isWeatherSuppressedOnField(state) helper exported for field-wide suppression checks.
