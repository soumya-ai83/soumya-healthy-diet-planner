# Version 1.5: temporary recipe serving calculator

The Recipe Handbook details dialog uses the saved `totalServings` as its
baseline. Ingredients contain `name`, `quantity`, `unit`, and `calories`;
recipes also store `totalCalories` and `caloriesPerServing`.

The native, labeled Prepare for selector offers integer targets from 1 through
10. Its state is a closure created each time `showRecipeDetails` opens a
recipe. Every displayed quantity is calculated from the saved original:

`originalQuantity * targetServings / defaultServings`

Quantities retain their units, use the existing US locale formatting convention
with at most three decimal places, and never feed rounded values back into the
calculation. Plain decimal numbers and decimal strings are scalable. Mixed
quantities, fractions expressed as text, and descriptions such as "to taste"
are preserved and HTML-escaped. Null quantities still show Quantity unspecified.
The existing recipe normalizer now preserves nonnumeric quantities instead of
turning them into zero.

Calories per serving always use the saved value. The existing ingredient
calorie column scales with the ingredient amount. At the default selection,
the existing total calorie display retains the saved total; at other targets
it displays saved calories per serving multiplied by target servings. Some
existing recipes round calories per serving independently of total calories,
so these displays may differ slightly from the summed ingredient calories.

No selector handler writes recipe storage, queues an outbox entry, or contacts
Supabase. Editing and meal logging continue through their existing workflows
using saved recipe values. No schema, ownership, configuration, migration,
or private-data workflow changes are made. The service-worker shell version
is bumped; its existing lifecycle refreshes assets without a PWA reinstall.

## Legacy and malformed data

Missing, nonpositive, nonnumeric, or nonfinite default servings use a baseline
of 1, retaining the existing normalization fallback and rejecting Infinity.
Scaling does not repair or overwrite the stored recipe. Existing startup,
editing, and sync persistence behavior is unchanged.

Positive fractional defaults and defaults above 10 remain the initial baseline
so original quantities are visible. They appear as a disabled selected option;
only integers 1–10 can be chosen. Reopening restores the saved baseline. Older
recipes without ingredients retain their existing unavailable-details message.
Display rounding may show quantities below 0.0005 as zero; no unit conversion
or fractional-text interpretation is introduced.

## Automated validation

`tests/recipe-scaling.test.js` executes the actual recipe-view functions in a
Node VM with minimal DOM nodes and persistence functions that throw if called.
It covers baseline rendering, factors 0.4 and 2, repeated changes and restoration,
locked calories, bounds, integers, units, descriptions, rounding, immutable
records, no storage/outbox calls, reopening, edited baselines, and legacy data.
It is not a real-browser or iPhone visual test. The existing PWA shell assertion
is updated for the new cache version.

Run the full existing suite and syntax checks:

```powershell
node --test tests/*.test.js
node --check js/script.js
node --check js/storage.js
node --check js/sync.js
node --check service-worker.js
git diff --check
```

During implementation, Node was unavailable on PATH and was not found in the
standard Node installation locations or under the local `.codex` directory.
The Node tests and syntax checks could not execute. `git diff --check` passed.
Browser, offline-update, and iPhone acceptance checks remain manual.

## Chicken Khorma manual acceptance

Use an existing Chicken Khorma recipe saved with default servings 5 and
540 kcal per serving. Do not change production data to manufacture a fixture;
use an isolated local test copy if these example ingredients are needed.

1. Open Chicken Khorma from Recipe Handbook. Confirm Default: 5,
   Prepare for: 5, and Calories per Serving: 540 kcal. Record every original
   quantity and unit.
2. Select 2. Confirm each numeric quantity is original × 2 / 5, with the same
   unit. Example chicken/onion/oil/yogurt quantities 1000/300/50/200 g become
   400/120/20/80 g. Calories per serving stay 540 kcal; total calories show
   1080 kcal. Descriptions stay readable.
3. Select 10. Confirm each numeric quantity is original × 10 / 5. The example
   becomes 2000/600/100/400 g. Calories per serving stay 540 kcal; total
   calories show 5400 kcal.
4. Select 5. Confirm all displayed quantities exactly match the recorded
   original values and total calories return to the saved value.
5. Select 2 again, close, and reopen. Confirm Prepare for: 5 and the original
   quantities. Inspect Edit Recipe without saving to verify default servings
   and quantities remain unchanged.
6. Repeat in the installed iPhone PWA, checking the selector's touch behavior
   and narrow-screen layout. After loading the updated assets online, test
   reopening and scaling offline. Do not clear site data or reinstall the PWA.
