const test = require("node:test");
const assert = require("node:assert/strict");

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }

  get length() {
    return this.entries.size;
  }

  key(index) {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null;
  }

  setItem(key, value) {
    this.entries.set(key, String(value));
  }
}

const storageApi = require("../js/storage.js");

function version13Fixture() {
  return {
    soumyaHealthyDietMeals: JSON.stringify([
      { id: "meal-1", date: "2026-07-10", mealType: "Lunch", totalCalories: 610 }
    ]),
    soumyaHealthyDietRecipes: JSON.stringify([
      { id: "recipe-1", name: "Vegetable Santula", category: "Vegetarian", caloriesPerServing: 255 }
    ]),
    soumyaHealthyDietSettings: JSON.stringify({
      dailyCalorieTarget: 1900,
      currentWeight: 188,
      goalWeight: 170,
      weightUnit: "lb"
    }),
    soumyaHealthyDietWeightHistory: JSON.stringify([
      { id: "weight-1", date: "2026-07-10", weight: 188 }
    ]),
    soumyaHealthyDietMetadata: JSON.stringify({ schemaVersion: 1, dashboardLayout: "mobile" }),
    soumyaHealthyDietInstallPromptDismissed: "true"
  };
}

test("migrates Version 1.3 by exact copy and retains an immutable backup", () => {
  const original = version13Fixture();
  const storage = new MemoryStorage(original);
  const result = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.equal(result.status, "completed");
  assert.equal(result.cloudSyncAllowed, true);
  assert.equal(result.backupRetained, true);
  assert.equal(result.migrationComplete, false);
  assert.equal(result.syncVerificationStatus, "pending");
  assert.deepEqual(
    Object.fromEntries(Object.keys(original).map(key => [key, storage.getItem(key)])),
    original,
    "Version 1.3 storage must remain byte-for-byte unchanged"
  );

  const backup = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.backup));
  const candidate = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.candidate));
  assert.deepEqual(backup.rawEntries, original);
  assert.deepEqual(candidate.rawEntries, original);
  assert.equal(candidate.counts.meals, 1);
  assert.equal(candidate.counts.recipes, 1);
  assert.equal(candidate.counts.weightHistory, 1);
  const marker = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.versionMarker));
  assert.equal(marker.release, "1.4A");
  assert.equal(marker.schemaVersion, 2);
  assert.equal(marker.migrationState, "local-validated");
});

test("is idempotent and does not create a second migration backup", () => {
  const storage = new MemoryStorage(version13Fixture());
  const first = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");
  const originalBackup = storage.getItem(storageApi.MIGRATION_STORAGE.backup);
  const second = storageApi.runMigration(storage, "2026-07-29T00:00:00.000Z");

  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(second.reusedVerifiedMigration, true);
  assert.equal(second.migrationComplete, false);
  assert.equal(storage.getItem(storageApi.MIGRATION_STORAGE.backup), originalBackup);
});

test("aborts safely when source data is invalid", () => {
  const original = version13Fixture();
  original.soumyaHealthyDietMeals = "{invalid-json";
  const storage = new MemoryStorage(original);
  const result = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.equal(result.status, "failed");
  assert.equal(result.cloudSyncAllowed, false);
  assert.equal(result.backupRetained, true);
  assert.deepEqual(
    Object.fromEntries(Object.keys(original).map(key => [key, storage.getItem(key)])),
    original,
    "failed migration must never rewrite Version 1.3 storage"
  );
});

test("rejects duplicate IDs without changing source records", () => {
  const original = version13Fixture();
  original.soumyaHealthyDietRecipes = JSON.stringify([
    { id: "recipe-1", name: "Recipe A" },
    { id: "recipe-1", name: "Recipe B" }
  ]);
  const storage = new MemoryStorage(original);
  const result = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.equal(result.status, "failed");
  assert.match(result.error, /duplicate ID/);
  assert.equal(storage.getItem("soumyaHealthyDietRecipes"), original.soumyaHealthyDietRecipes);
});

test("does nothing destructive on a fresh installation", () => {
  const storage = new MemoryStorage();
  const result = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.equal(result.status, "not-needed");
  assert.equal(result.migrated, false);
  assert.equal(result.migrationComplete, true);
  assert.equal(storage.getItem(storageApi.MIGRATION_STORAGE.backup), null);
  assert.equal(storage.getItem(storageApi.MIGRATION_STORAGE.candidate), null);
  const marker = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.versionMarker));
  assert.equal(marker.release, "1.4A");
  assert.equal(marker.schemaVersion, 2);
});

test("detects the explicit Version 1.4A marker before inspecting legacy keys", () => {
  const storage = new MemoryStorage();
  const marker = storageApi.createVersionMarker({
    installedAt: "2026-07-28T00:00:00.000Z",
    migrationState: "current",
    syncVerificationStatus: "not-required",
    migrationComplete: true
  });
  storage.setItem(storageApi.MIGRATION_STORAGE.versionMarker, JSON.stringify(marker));

  const detected = storageApi.detectInstallation(storage, {});
  assert.equal(detected.type, "current");
  assert.equal(detected.schemaVersion, 2);
  assert.equal(detected.sourceRelease, "1.4A");
});

test("rejects unsupported future schema versions without modifying data", () => {
  const marker = {
    applicationId: storageApi.APPLICATION_ID,
    release: "2.0",
    schemaVersion: 5
  };
  const storage = new MemoryStorage({
    [storageApi.MIGRATION_STORAGE.versionMarker]: JSON.stringify(marker),
    soumyaHealthyDietMeals: JSON.stringify([{ id: "meal-1" }])
  });
  const originalMeals = storage.getItem("soumyaHealthyDietMeals");
  const result = storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.equal(result.status, "failed");
  assert.match(result.error, /newer than supported/);
  assert.equal(storage.getItem("soumyaHealthyDietMeals"), originalMeals);
});

test("keeps migration incomplete and backup retained when Supabase synchronization fails", () => {
  const storage = new MemoryStorage(version13Fixture());
  storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");
  const backupBefore = storage.getItem(storageApi.MIGRATION_STORAGE.backup);
  const result = storageApi.markSupabaseSyncFailed(storage, "Network unavailable", "2026-07-28T01:00:00.000Z");

  assert.equal(result.migrationComplete, false);
  assert.equal(result.syncVerificationStatus, "failed");
  assert.equal(result.backupRetained, true);
  assert.equal(storage.getItem(storageApi.MIGRATION_STORAGE.backup), backupBefore);
});

test("marks migration complete only after verified Supabase read-back and still retains backup", () => {
  const storage = new MemoryStorage(version13Fixture());
  storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");
  const backupBefore = storage.getItem(storageApi.MIGRATION_STORAGE.backup);
  const result = storageApi.markSupabaseSyncVerified(storage, {
    readBackVerified: true,
    verifiedAt: "2026-07-28T02:00:00.000Z",
    recipeCount: 1,
    ingredientCount: 54
  });

  assert.equal(result.migrationComplete, true);
  assert.equal(result.syncVerificationStatus, "verified");
  assert.equal(result.eligibleForBackupCleanup, true);
  assert.equal(storage.getItem(storageApi.MIGRATION_STORAGE.backup), backupBefore);
  const marker = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.versionMarker));
  assert.equal(marker.migrationState, "sync-verified");
  assert.equal(marker.migrationComplete, true);
});

test("does not accept synchronization completion without read-back evidence", () => {
  const storage = new MemoryStorage(version13Fixture());
  storageApi.runMigration(storage, "2026-07-28T00:00:00.000Z");

  assert.throws(
    () => storageApi.markSupabaseSyncVerified(storage, { readBackVerified: false }),
    /read-back verification evidence/
  );
  const status = JSON.parse(storage.getItem(storageApi.MIGRATION_STORAGE.status));
  assert.equal(status.migrationComplete, false);
  assert.equal(status.syncVerificationStatus, "pending");
});
