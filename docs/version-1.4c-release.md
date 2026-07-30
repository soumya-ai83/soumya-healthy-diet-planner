# Version 1.4C implementation and deployment

## Architecture and privacy boundary

Version 1.4C remains local-first. The application renders and writes local
storage immediately; `js/sync.js` separately maintains a durable outbox and
retries at startup, when the browser reports `online`, when the app becomes
visible, and every five minutes.

Only these collections enter a cloud request:

- Recipe Handbook (`shared_recipes`)
- Ingredient Database (`shared_ingredients`)

Meals, weight history, goals, progress, dashboard settings, preferences, and
migration artifacts have no cloud table or synchronization code. They remain
private to the browser/PWA profile. Supabase is optional: with blank
configuration the whole application continues to work offline.

## Shared synchronization

Every shared record has a stable ID, normalized canonical name, revision,
creation/update timestamps, optional deletion timestamp, client ID, and full
payload. Creates and edits are queued before synchronization. Deletes are
tombstones so an offline deletion cannot be recreated by another client.

The first configured run uploads all existing local Version 1.4B recipes and
ingredients, then reads both tables back. Later runs send only the coalesced
outbox. A canonical-name unique constraint and the merge RPC prevent duplicate
names. Conflicts use newest `updated_at`, then highest revision. The outbox is
cleared and migration sync marked verified only after a successful upload and
read-back. Failed requests retain the outbox and local migration backup.

Automatically created recipe ingredients still use the Version 1.4B
`ensureRecipeIngredients` behavior. Each returned created ingredient is also
queued, so it becomes globally available without another user action.

## Version 1.3 migration

The migration runs before application data is loaded:

1. Detect an explicit application marker or legacy Version 1.3 keys.
2. Capture every `soumyaHealthyDiet*` source value exactly.
3. Persist and checksum a local backup.
4. Parse and validate meals, recipes, settings, metadata, and weight history.
5. Reject malformed JSON and duplicate record IDs.
6. Persist and re-read a schema-2 migration candidate.
7. Restore a missing or empty live Version 1.3 key only from the validated
   candidate; never replace a non-empty live key.
8. Verify each restored write, rolling back that write if verification fails.
9. Mark local validation complete. Run once thereafter through the explicit
   release/schema marker.
10. Retain the backup through failures and offline use. Mark cloud verification
    complete only after shared Supabase upload and read-back succeeds.

No private record is transformed into a shared record except recipes. The
original keys remain the runtime storage model, preserving Version 1.4B
compatibility.

## Add Meal recipe search

The saved-recipe panel now filters while typing with case-insensitive partial
name matching. Its category selector is generated from persisted recipes, and
both filters combine before options are rendered. Filtering is local and does
not wait for the network.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run
   [`supabase-version-1.4c.sql`](supabase-version-1.4c.sql).
3. In **Project Settings → API**, copy the Project URL and public/publishable
   anon key.
4. Put those values in `js/config.js`:

   ```js
   window.SHDP_CONFIG = Object.freeze({
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY"
   });
   ```

5. Deploy the same configured file to every household user's installation.

The anon key is intended for browser use; never put the service-role key in
this project. The supplied schema permits global read access and controlled
merge-RPC access to anyone holding the deployment's anon key. If access must
be restricted beyond that household deployment boundary, enable Supabase Auth
and narrow the SQL roles/policies before production use.

There are no build-time environment variables in this static application.
Hosting platforms may generate `js/config.js` during deployment, but it must
exist before the service worker installs it.

## PWA and hosting configuration

The manifest starts at `./index.html`, stays within `./`, and requests
standalone display. The service worker pre-caches the complete app shell,
including configuration and sync scripts. Installed navigation returns the
cached shell first, so an offline launch does not traverse a hosting login
page.

A service worker cannot bypass Netlify site protection on the first visit.
Disable Netlify Password Protection/Visitor Access for the production site,
publish it at a stable HTTPS origin, and redirect all application routes to
`/index.html`. Do not move the deployed origin after installation. On iPhone,
remove an older Home Screen icon, visit the public HTTPS URL in Safari once,
choose **Add to Home Screen**, launch it online once, then verify Airplane Mode.

## Testing

Run automated tests:

```bash
node --test tests/*.test.js
node --check js/storage.js
node --check js/ingredients.js
node --check js/sync.js
node --check js/script.js
node --check service-worker.js
```

Manual acceptance test:

1. Export existing Version 1.3/1.4B data.
2. Upgrade a populated profile and compare meal/weight counts, dates, goals,
   settings, recipes, and ingredients before and after two restarts.
3. With two separate browser profiles, create/edit/delete one recipe and one
   ingredient; verify both profiles converge without duplicates.
4. Go offline, repeat changes, close/reopen, then reconnect and verify outbox
   delivery. Confirm an automatically created recipe ingredient also appears
   in the second profile.
5. In Add Meal, verify partial mixed-case search, category-only filtering, and
   combined filtering on a mobile width.
6. Exercise all Version 1.4B ingredient CRUD, categories, recipe CRUD/FABs,
   meals, calorie calculations, dashboard, progress, settings, import/export,
   and weight tracking.
7. Install on iPhone from the public URL. Verify direct Home Screen launch and
   a complete offline restart.

Supabase, iPhone installation, Netlify access settings, and true reconnect
behavior require external environments and therefore cannot be proven by the
local Node test suite alone.

## Future compatibility

The explicit marker accepts 1.4A, 1.4B, and 1.4C at schema 2 and rejects unknown
future schemas instead of downgrading them. Future releases must preserve
tombstones, stable IDs, retained backups, and the private/shared boundary.
