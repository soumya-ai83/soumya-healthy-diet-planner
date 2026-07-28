# Version 1.4A Phase 1 Migration Safety

## Status

Phase 1 is complete on `release-1.4a-daily-productivity`. It adds a
non-destructive local migration foundation and the two approval-gate
improvements: an explicit version marker and a backup lifecycle tied to a
verified first Supabase synchronization. Phase 1 does not contact Supabase.

## Architecture overview

The main application continues to read and write the Version 1.3 keys:

| Purpose | Key |
| --- | --- |
| Meals, calorie history, and saved nutrition | `soumyaHealthyDietMeals` |
| Recipes and recipe categories | `soumyaHealthyDietRecipes` |
| Weight goals, calorie target, and preferences | `soumyaHealthyDietSettings` |
| Weight history | `soumyaHealthyDietWeightHistory` |
| Application metadata | `soumyaHealthyDietMetadata` |

`js/storage.js` loads before application data and creates separate safety
records:

| Purpose | Key |
| --- | --- |
| Exact Version 1.3 raw-value backup | `soumyaHealthyDietMigrationBackupV13` |
| Parsed candidate and exact raw copy | `soumyaHealthyDietMigrationCandidateV14A` |
| Migration and synchronization status | `soumyaHealthyDietMigrationStatusV14A` |
| Explicit application/schema version | `soumyaHealthyDietApplicationVersion` |

No Version 1.3 release file or branch is modified.

## Version detection

The explicit marker is now authoritative. It contains the application ID,
release (`1.4A`), numeric schema version (`2`), source release, migration
state, synchronization-verification state, and timestamps.

- A valid schema-2/Version-1.4A marker identifies the current release.
- A marker with a supported older schema identifies a legacy installation.
- A future schema or incompatible release is rejected without changing data.
- If no marker exists, known Version 1.3 keys and optional schema-1 metadata
  identify a Version 1.3 installation.
- If neither a marker nor Version 1.3 data exists, the installation is fresh
  and receives a Version 1.4A marker.

This is backward compatible because Version 1.3 never required the marker.
Existing users are detected by their original keys, backed up, validated, and
then given the marker. Future releases can route migrations by the explicit
release/schema pair instead of guessing from key presence.

## Migration sequence

1. Capture every application-prefixed local-storage value except
   migration-owned records.
2. Detect the installation version.
3. Reject unsupported or internally inconsistent version states.
4. Create an exact raw-value Version 1.3 backup if none exists.
5. Re-read the backup and compare its per-entry checksums with the live source.
6. Parse and type-check meals, recipes, settings, weight history, and metadata.
7. reject duplicate non-empty meal, recipe, or weight-entry IDs.
8. Build a separate schema-2 candidate; do not replace Version 1.3 source keys.
9. Compare candidate/source counts and raw-entry checksums.
10. Persist, re-read, and revalidate the candidate.
11. Write the Version 1.4A marker with `local-validated`, sync `pending`, and
    `migrationComplete: false`.
12. Permit a later cloud phase to attempt synchronization.
13. Only a successful Supabase read-back verification may set
    `migrationComplete: true`.

Any guarded failure records a failed state, disables cloud synchronization,
and leaves the Version 1.3 source keys and any successfully written backup in
place.

## Backup and synchronization gate

The backup contains exact string values for every `soumyaHealthyDiet*`
application entry plus per-entry checksums. It normally survives refreshes,
browser restarts, PWA updates, and service-worker cache changes because it is
stored in `localStorage`.

`markSupabaseSyncVerified` requires:

- a completed and revalidated local migration;
- the retained backup and candidate;
- explicit `readBackVerified: true`; and
- a verification timestamp.

It then marks migration complete but does **not** delete the backup. It only
marks the backup eligible for a separately controlled cleanup decision.
`markSupabaseSyncFailed` records the error, leaves migration incomplete, and
retains the backup.

The local backup is not an off-device backup. Clearing site storage, losing the
browser profile/device, or some uninstall flows can remove it. A user export
remains the independent recovery mechanism until cloud verification succeeds.

## Rollback and recovery

Phase 1 avoids destructive rollback: it never converts or deletes the original
Version 1.3 keys. An interruption before backup completion retries from those
keys. An interruption after backup or candidate creation revalidates available
artifacts on the next startup. Corrupted JSON, duplicates, unsupported
versions, and failed cloud synchronization do not authorize source overwrite
or backup deletion.

There is no operator restore screen yet. Recovery data is retained
programmatically, and cloud synchronization is blocked after migration
validation failure.

## Validation

Automated validation covers exact application-prefixed raw capture, expected
top-level types, record counts, duplicate non-empty IDs, checksums, backup and
candidate read-back, idempotent startup, fresh installs, explicit version
detection, unsupported future versions, sync failure, and the verified-sync
completion gate.

Historical dates, calories, nutrition fields, categories, settings, and other
metadata remain inside the exact raw source copy. Phase 2 separately validates
all 54 static Version 1.3 ingredient records and nutrition references while
creating their persistent store.

## Offline behavior and assumptions

Phase 1 has no network or cloud dependency. Its files are part of the PWA app
shell. It assumes individual `localStorage.setItem` operations are atomic and
that the device has enough storage for source, backup, and candidate copies.

## Future compatibility

Future migrations must preserve the marker and add explicit routes such as
`1.4A/schema 2` to `1.4B/schema 3`. A future release must never silently
downgrade an unknown marker. Backup deletion requires a separate, auditable
policy after verified cloud read-back; Phase 1 deliberately provides no
automatic deletion.
