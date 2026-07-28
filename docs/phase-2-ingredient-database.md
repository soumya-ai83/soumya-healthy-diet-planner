# Version 1.4A Phase 2 Ingredient Master Database

## Status and scope

Phase 2 creates a persistent, local-first Ingredient Master Database and
automatically adds unknown recipe ingredients after a recipe is saved.
Supabase synchronization remains Phase 3 work; no internet dependency is added
here.

## Architecture

`js/data.js` remains the unchanged source of the 54 Version 1.3 starter
ingredients. `js/ingredients.js` converts those records into sync-ready local
records and stores them at:

`soumyaHealthyDietIngredients`

`js/script.js` reads ingredient search and calorie references from the
persistent collection. Existing recipe, meal, weight, settings, dashboard, and
calculation storage formats are unchanged.

## Ingredient record

Each record retains the original ID, name, aliases, reference calories,
reference amount, reference unit, and optional unit-specific references. It
adds:

- `normalizedName` for deterministic duplicate matching;
- `source` (`starter`, `recipe`, or `user`);
- `schemaVersion`;
- `revision`;
- `createdAt` and `updatedAt`;
- `deletedAt` for future synchronized deletion; and
- `syncStatus: pending` for Phase 3.

## First-run initialization

1. Read `soumyaHealthyDietIngredients`.
2. If it is absent, normalize all Version 1.3 starter ingredients.
3. Validate IDs, canonical names, and nutrition references.
4. Persist the full collection.
5. Re-read the exact serialized value to verify the write.
6. If a valid store already exists, add only missing starter records.
7. If stored data is invalid or cannot be persisted, preserve it unchanged,
   use starter records in memory, disable automatic expansion for that
   session, and report the safety failure.

The application does not overwrite malformed ingredient storage with fallback
data.

## Automatic expansion after recipe save

The existing recipe is saved first using its unchanged Version 1.3-compatible
ingredient shape (`name`, `quantity`, `unit`, and calculated `calories`).
Phase 2 then examines the form's nutrition-reference fields:

1. Match each ingredient by case-insensitive canonical name or alias.
2. Skip known ingredients.
3. Coalesce repeated unknown names in the same recipe.
4. For each unknown ingredient, require a positive reference amount and a
   non-negative calorie reference.
5. Create a sync-ready record using that standardized reference.
6. Validate and persist the complete proposed collection.
7. Only after persistence succeeds, update the live searchable collection.

If ingredient persistence fails, the recipe remains saved, existing ingredient
data remains unchanged, and the user receives a warning.

## Duplicate prevention

Active canonical names must be unique. New recipe ingredients are matched
case-insensitively against canonical names and aliases, so `Potato`,
`POTATO`, and an existing `Potato` alias resolve to the same ingredient. IDs
must also be unique. Phase 3 must enforce equivalent database constraints and
conflict rules in Supabase.

## Offline behavior

All Phase 2 operations use browser `localStorage`. The ingredient module is
included in the Phase 2 PWA app-shell cache. Recipe building, nutrition
calculation, ingredient search, and automatic expansion require no connection.
New records remain `pending` until a later synchronization phase.

## Validation and compatibility

Automated tests verify initialization, missing-starter merge, exact
preservation of all 54 Version 1.3 ingredient identities and nutrition values,
unknown-ingredient creation, immediate searchability, alias/name duplicate
prevention, persistence failure isolation, and preservation of malformed stored
data.

No recipe schema, historical record, calculation formula, or existing
Version 1.3 storage key is changed in Phase 2.

## Assumptions and future compatibility

- A recipe's manually entered reference calories/amount/unit are the
  standardized local reference requested by the user.
- Local storage has enough capacity for the ingredient collection.
- Phase 3 will map stable local IDs and revisions to household-scoped Supabase
  records, upload pending changes, read them back, and only then invoke the
  Phase 1 verified-sync completion gate.
- Tombstones and revision fields are present now so later synchronization does
  not require destructive changes to existing ingredient records.
