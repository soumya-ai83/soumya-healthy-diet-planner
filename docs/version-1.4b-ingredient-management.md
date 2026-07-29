# Version 1.4B Ingredient Management

## Scope

Version 1.4B completes the local Ingredient Master Database user interface. It
does not add cloud synchronization and does not change meal, recipe, settings,
weight-history, migration-backup, or migration-candidate storage formats.

## Architecture

The release continues using the Version 1.4A local-first foundation:

- `js/storage.js` protects Version 1.3 migration source, backup, and candidate
  data and advances a valid schema-2 Version 1.4A marker to Version 1.4B.
- `js/ingredients.js` owns validation and persistent ingredient operations.
- `js/script.js` coordinates the Ingredient Database, recipe builder, category
  views, and mobile interactions.
- `index.html` and `css/style.css` provide the screen, form dialog, list, and
  mobile floating action button.

The Ingredient Database remains stored in
`soumyaHealthyDietIngredients`. Existing records are normalized in memory and
saved only through validated operations.

## Ingredient record compatibility

Version 1.4B advances the ingredient-store schema from 1 to 2 and adds a
normalized `category`. Existing Version 1.4A records without a category become
`Uncategorized`. IDs, names, aliases, nutrition references, creation
timestamps, revisions, deletion metadata, source metadata, and synchronization
status are retained.

## Create, edit, and delete safety

Create and edit operations:

1. Clone the complete current collection.
2. Validate the submitted name and nutrition reference.
3. Check the proposed name and every alias against every active ingredient.
4. Normalize the record and update its revision metadata.
5. Validate the complete proposed collection.
6. Persist and re-read the exact serialized value.
7. Update the live in-memory collection only after persistence succeeds.

Delete operations create a tombstone by setting `deletedAt`, increasing the
revision, and marking synchronization status as pending. Existing recipes and
historical meals retain their embedded ingredient information.

If the Ingredient Database fails its startup safety check, Version 1.4B refuses
management and recipe-driven ingredient writes so invalid stored data is not
overwritten.

## Duplicate prevention

Names and aliases share one case-insensitive uniqueness namespace. For example,
an ingredient cannot be added as `Aloo` if `Aloo` is already an alias of
`Potato, raw`. An edit excludes its own stable ID while checking every other
active record.

Recipe-driven creation uses the same lookup behavior. Repeated unknown names
inside one recipe save are coalesced, and known canonical names or aliases are
not recreated.

## Category synchronization

Recipe categories are collected from the current persisted recipe collection.
Ingredient categories are collected from active persistent ingredient records.
A shared UI refresh routine rebuilds:

- Recipe Handbook category filtering.
- Recipe category suggestions.
- Ingredient Database category filtering.
- Ingredient category suggestions.
- Recipe-builder ingredient search choices.

The refresh runs after recipe create/edit/delete, ingredient
create/edit/delete, automatic recipe-driven expansion, import/reset, and
application initialization.

## Mobile behavior

The Ingredient Database is reachable from the Recipe Handbook without adding a
sixth mobile navigation item. Its floating Add Ingredient button is fixed above
the existing bottom navigation, honors safe-area insets, uses a large touch
target, and the page includes extra bottom spacing so the button does not cover
the final ingredient row.

Desktop retains a conventional Add Ingredient button for development and
review, while the release remains optimized for smartphone use.

## Persistence and offline use

All operations use browser `localStorage`; no internet connection is required.
The PWA app-shell cache is advanced to `v1.4b-ingredient-management` so the new
HTML, CSS, and JavaScript load together. Saved ingredient and recipe changes
remain available after refresh, browser restart, and normal installed-PWA
updates unless the user clears site data.

## Automated verification

Tests cover:

- all Version 1.4A migration protections;
- Version 1.4A to Version 1.4B marker advancement without remigration;
- fresh-install reopen behavior;
- preservation of all 54 starter ingredient nutrition references;
- create, edit, category update, and soft delete;
- persistence across reinitialization;
- canonical-name and alias collision prevention;
- recipe-driven creation and category assignment;
- storage failure isolation; and
- invalid stored-data preservation.
