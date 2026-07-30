/*
Soumya Healthy Diet Planner
Version 1.4C using the Version 1.4A migration safety foundation

This file runs before the main application. It never rewrites Version 1.3
application records. It creates and validates a separate migration backup and
candidate snapshot so a later cloud synchronization phase can only start from
verified local data.
*/

(function initializeMigrationSafety(globalScope) {
  "use strict";

  const SOURCE_SCHEMA_VERSION = 1;
  const TARGET_SCHEMA_VERSION = 2;
  const SOURCE_RELEASE = "1.3";
  const TARGET_RELEASE = "1.4C";
  const COMPATIBLE_SCHEMA_2_RELEASES = Object.freeze(["1.4A", "1.4B", "1.4C"]);
  const APPLICATION_ID = "soumya-healthy-diet-planner";
  const APP_STORAGE_PREFIX = "soumyaHealthyDiet";
  const MIGRATION_STORAGE = Object.freeze({
    backup: "soumyaHealthyDietMigrationBackupV13",
    candidate: "soumyaHealthyDietMigrationCandidateV14A",
    status: "soumyaHealthyDietMigrationStatusV14A",
    versionMarker: "soumyaHealthyDietApplicationVersion"
  });
  const VERSION_13_STORAGE = Object.freeze({
    meals: "soumyaHealthyDietMeals",
    recipes: "soumyaHealthyDietRecipes",
    settings: "soumyaHealthyDietSettings",
    weightHistory: "soumyaHealthyDietWeightHistory",
    metadata: "soumyaHealthyDietMetadata"
  });

  function stableHash(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isMigrationKey(key) {
    return Object.values(MIGRATION_STORAGE).includes(key);
  }

  function captureApplicationEntries(storage) {
    const entries = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(APP_STORAGE_PREFIX) || isMigrationKey(key)) continue;
      entries[key] = storage.getItem(key);
    }
    return entries;
  }

  function parseJsonEntry(entries, key, fallback, expectedType) {
    if (!(key in entries) || entries[key] === null) return clone(fallback);
    let parsed;
    try {
      parsed = JSON.parse(entries[key]);
    } catch (error) {
      throw new Error(`${key} contains invalid JSON.`);
    }
    if (expectedType === "array" && !Array.isArray(parsed)) {
      throw new Error(`${key} must contain a list.`);
    }
    if (expectedType === "object" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
      throw new Error(`${key} must contain an object.`);
    }
    return parsed;
  }

  function assertNoDuplicateIds(records, label) {
    const ids = new Set();
    records.forEach(record => {
      const id = String(record?.id || "").trim();
      if (!id) return;
      if (ids.has(id)) throw new Error(`${label} contains duplicate ID ${id}.`);
      ids.add(id);
    });
  }

  function buildCounts(data) {
    return {
      meals: data.meals.length,
      recipes: data.recipes.length,
      weightHistory: data.weightHistory.length,
      settings: Object.keys(data.settings).length,
      metadata: Object.keys(data.metadata).length,
      appStorageEntries: Object.keys(data.rawEntries).length
    };
  }

  function buildEntryChecksums(entries) {
    return Object.fromEntries(
      Object.keys(entries)
        .sort()
        .map(key => [key, stableHash(entries[key])])
    );
  }

  function buildCandidate(entries, now) {
    const meals = parseJsonEntry(entries, VERSION_13_STORAGE.meals, [], "array");
    const recipes = parseJsonEntry(entries, VERSION_13_STORAGE.recipes, [], "array");
    const settings = parseJsonEntry(entries, VERSION_13_STORAGE.settings, {}, "object");
    const weightHistory = parseJsonEntry(entries, VERSION_13_STORAGE.weightHistory, [], "array");
    const metadata = parseJsonEntry(entries, VERSION_13_STORAGE.metadata, {}, "object");

    assertNoDuplicateIds(meals, "Meal history");
    assertNoDuplicateIds(recipes, "Recipe Handbook");
    assertNoDuplicateIds(weightHistory, "Weight history");

    const candidate = {
      sourceSchemaVersion: Number(metadata.schemaVersion) || SOURCE_SCHEMA_VERSION,
      targetSchemaVersion: TARGET_SCHEMA_VERSION,
      preparedAt: now,
      meals,
      recipes,
      settings,
      weightHistory,
      metadata,
      rawEntries: clone(entries)
    };
    candidate.counts = buildCounts(candidate);
    candidate.entryChecksums = buildEntryChecksums(entries);
    return candidate;
  }

  function validateCandidate(candidate, originalEntries) {
    if (!candidate || typeof candidate !== "object") throw new Error("Migration candidate is missing.");
    if (candidate.targetSchemaVersion !== TARGET_SCHEMA_VERSION) throw new Error("Migration candidate has the wrong target version.");
    if (!Array.isArray(candidate.meals)) throw new Error("Migrated meals are invalid.");
    if (!Array.isArray(candidate.recipes)) throw new Error("Migrated recipes are invalid.");
    if (!Array.isArray(candidate.weightHistory)) throw new Error("Migrated weight history is invalid.");
    if (!candidate.settings || typeof candidate.settings !== "object" || Array.isArray(candidate.settings)) {
      throw new Error("Migrated settings are invalid.");
    }

    const expectedChecksums = buildEntryChecksums(originalEntries);
    const candidateChecksums = buildEntryChecksums(candidate.rawEntries || {});
    if (JSON.stringify(expectedChecksums) !== JSON.stringify(candidateChecksums)) {
      throw new Error("Migration candidate does not exactly match Version 1.3 source data.");
    }

    const expectedCounts = buildCounts({
      meals: parseJsonEntry(originalEntries, VERSION_13_STORAGE.meals, [], "array"),
      recipes: parseJsonEntry(originalEntries, VERSION_13_STORAGE.recipes, [], "array"),
      settings: parseJsonEntry(originalEntries, VERSION_13_STORAGE.settings, {}, "object"),
      weightHistory: parseJsonEntry(originalEntries, VERSION_13_STORAGE.weightHistory, [], "array"),
      metadata: parseJsonEntry(originalEntries, VERSION_13_STORAGE.metadata, {}, "object"),
      rawEntries: originalEntries
    });
    if (JSON.stringify(expectedCounts) !== JSON.stringify(candidate.counts)) {
      throw new Error("Migration record counts do not match Version 1.3.");
    }

    assertNoDuplicateIds(candidate.meals, "Migrated meal history");
    assertNoDuplicateIds(candidate.recipes, "Migrated Recipe Handbook");
    assertNoDuplicateIds(candidate.weightHistory, "Migrated weight history");
    return true;
  }

  function readJson(storage, key) {
    const value = storage.getItem(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function hasVersion13Data(entries) {
    return Object.values(VERSION_13_STORAGE).some(key => Object.prototype.hasOwnProperty.call(entries, key));
  }

  function createVersionMarker({
    installedAt,
    sourceRelease = SOURCE_RELEASE,
    migrationState,
    syncVerificationStatus,
    migrationComplete
  }) {
    return {
      applicationId: APPLICATION_ID,
      release: TARGET_RELEASE,
      schemaVersion: TARGET_SCHEMA_VERSION,
      sourceRelease,
      migrationState,
      syncVerificationStatus,
      migrationComplete,
      installedAt,
      updatedAt: installedAt
    };
  }

  function validateVersionMarker(marker) {
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      throw new Error("Application version marker is invalid.");
    }
    if (marker.applicationId !== APPLICATION_ID) {
      throw new Error("Application version marker belongs to a different application.");
    }
    if (!Number.isInteger(Number(marker.schemaVersion))) {
      throw new Error("Application schema version is invalid.");
    }
    if (Number(marker.schemaVersion) > TARGET_SCHEMA_VERSION) {
      throw new Error(`Application schema ${marker.schemaVersion} is newer than supported schema ${TARGET_SCHEMA_VERSION}.`);
    }
    if (Number(marker.schemaVersion) === TARGET_SCHEMA_VERSION && !COMPATIBLE_SCHEMA_2_RELEASES.includes(marker.release)) {
      throw new Error(`Application release ${marker.release || "unknown"} is not supported by this Version 1.4C build.`);
    }
    return marker;
  }

  function detectInstallation(storage, entries) {
    const markerRaw = storage.getItem(MIGRATION_STORAGE.versionMarker);
    if (markerRaw) {
      let marker;
      try {
        marker = JSON.parse(markerRaw);
      } catch (error) {
        return { type: "invalid", error: "Application version marker contains invalid JSON." };
      }
      try {
        validateVersionMarker(marker);
        return {
          type: Number(marker.schemaVersion) === TARGET_SCHEMA_VERSION ? "current" : "legacy",
          sourceRelease: marker.release,
          schemaVersion: Number(marker.schemaVersion),
          marker
        };
      } catch (error) {
        return { type: "invalid", error: error.message };
      }
    }

    const metadata = (() => {
      try {
        return entries[VERSION_13_STORAGE.metadata]
          ? JSON.parse(entries[VERSION_13_STORAGE.metadata])
          : null;
      } catch (error) {
        return null;
      }
    })();
    const metadataVersion = Number(metadata?.schemaVersion);
    if (metadataVersion > SOURCE_SCHEMA_VERSION) {
      return {
        type: "invalid",
        error: `Schema ${metadataVersion} was found without an application version marker.`
      };
    }
    if (hasVersion13Data(entries)) {
      return {
        type: "legacy",
        sourceRelease: SOURCE_RELEASE,
        schemaVersion: metadataVersion || SOURCE_SCHEMA_VERSION,
        marker: null
      };
    }
    return { type: "fresh", sourceRelease: null, schemaVersion: null, marker: null };
  }

  function writeVersionMarker(storage, marker) {
    storage.setItem(MIGRATION_STORAGE.versionMarker, JSON.stringify(marker));
    const persisted = readJson(storage, MIGRATION_STORAGE.versionMarker);
    validateVersionMarker(persisted);
    if (JSON.stringify(persisted) !== JSON.stringify(marker)) {
      throw new Error("Application version marker could not be verified.");
    }
    return persisted;
  }

  function advanceReleaseMarker(storage, marker, now) {
    if (marker.release === TARGET_RELEASE) return marker;
    return writeVersionMarker(storage, {
      ...marker,
      previousRelease: marker.release,
      release: TARGET_RELEASE,
      updatedAt: now
    });
  }

  function isEmptyStoredValue(rawValue, expectedType) {
    if (rawValue === null) return true;
    let parsed;
    try {
      parsed = JSON.parse(rawValue);
    } catch (error) {
      return false;
    }
    if (expectedType === "array") return Array.isArray(parsed) && parsed.length === 0;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0;
  }

  function rehydrateValidatedCandidate(storage, candidate, backup) {
    validateCandidate(candidate, backup?.rawEntries || {});
    const recoveryFields = [
      [VERSION_13_STORAGE.meals, candidate.meals, "array"],
      [VERSION_13_STORAGE.recipes, candidate.recipes, "array"],
      [VERSION_13_STORAGE.settings, candidate.settings, "object"],
      [VERSION_13_STORAGE.weightHistory, candidate.weightHistory, "array"],
      [VERSION_13_STORAGE.metadata, candidate.metadata, "object"]
    ];
    const originalValues = new Map();
    const restoredKeys = [];

    try {
      recoveryFields.forEach(([key, protectedValue, expectedType]) => {
        const liveRaw = storage.getItem(key);
        const protectedHasData = expectedType === "array"
          ? Array.isArray(protectedValue) && protectedValue.length > 0
          : protectedValue && typeof protectedValue === "object" && Object.keys(protectedValue).length > 0;
        if (!protectedHasData || !isEmptyStoredValue(liveRaw, expectedType)) return;
        originalValues.set(key, liveRaw);
        const serialized = JSON.stringify(protectedValue);
        storage.setItem(key, serialized);
        if (storage.getItem(key) !== serialized) throw new Error(`${key} could not be restored and verified.`);
        restoredKeys.push(key);
      });
      return restoredKeys;
    } catch (error) {
      restoredKeys.forEach(key => {
        const previous = originalValues.get(key);
        if (previous === null && typeof storage.removeItem === "function") storage.removeItem(key);
        else storage.setItem(key, previous);
      });
      throw error;
    }
  }

  function runMigration(storage = globalScope.localStorage, now = new Date().toISOString()) {
    if (!storage) {
      return { status: "failed", migrated: false, error: "Browser storage is unavailable." };
    }

    const originalEntries = captureApplicationEntries(storage);
    const installation = detectInstallation(storage, originalEntries);
    if (installation.type === "invalid") {
      return {
        status: "failed",
        migrated: false,
        targetSchemaVersion: TARGET_SCHEMA_VERSION,
        targetRelease: TARGET_RELEASE,
        backupRetained: Boolean(storage.getItem(MIGRATION_STORAGE.backup)),
        cloudSyncAllowed: false,
        migrationComplete: false,
        error: installation.error
      };
    }
    if (installation.type === "fresh") {
      try {
        const marker = writeVersionMarker(storage, createVersionMarker({
          installedAt: now,
          sourceRelease: null,
          migrationState: "current",
          syncVerificationStatus: "not-required",
          migrationComplete: true
        }));
        const result = {
          status: "not-needed",
          migrated: false,
          sourceSchemaVersion: null,
          targetSchemaVersion: TARGET_SCHEMA_VERSION,
          targetRelease: TARGET_RELEASE,
          migrationComplete: true,
          versionMarker: marker
        };
        storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(result));
        return result;
      } catch (error) {
        return {
          status: "failed",
          migrated: false,
          cloudSyncAllowed: false,
          migrationComplete: false,
          error: error.message || "Fresh installation version initialization failed."
        };
      }
    }

    const existingStatus = readJson(storage, MIGRATION_STORAGE.status);
    const existingBackup = readJson(storage, MIGRATION_STORAGE.backup);
    const existingCandidate = readJson(storage, MIGRATION_STORAGE.candidate);
    if (installation.type === "current" && existingStatus?.status === "completed" && existingBackup && existingCandidate) {
      try {
        validateCandidate(existingCandidate, existingBackup.rawEntries || {});
        const restoredKeys = rehydrateValidatedCandidate(storage, existingCandidate, existingBackup);
        const marker = advanceReleaseMarker(storage, installation.marker, now);
        return {
          ...existingStatus,
          targetRelease: TARGET_RELEASE,
          versionMarker: marker,
          migrated: false,
          reusedVerifiedMigration: true,
          restoredKeys,
          migrationComplete: existingStatus.syncVerificationStatus === "verified"
        };
      } catch (error) {
        // Continue with a fresh candidate built from untouched Version 1.3 keys.
      }
    }
    if (installation.type === "current" && existingStatus?.status === "not-needed" && installation.marker?.migrationState === "current") {
      try {
        const marker = advanceReleaseMarker(storage, installation.marker, now);
        const result = {
          ...existingStatus,
          targetRelease: TARGET_RELEASE,
          versionMarker: marker,
          migrated: false,
          reusedCurrentInstallation: true,
          migrationComplete: true
        };
        storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(result));
        return result;
      } catch (error) {
        return {
          status: "failed",
          migrated: false,
          cloudSyncAllowed: false,
          migrationComplete: false,
          error: error.message || "Application release marker could not be advanced."
        };
      }
    }

    const backup = existingBackup || {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      createdAt: now,
      retainUntilSyncVerified: true,
      rawEntries: clone(originalEntries),
      entryChecksums: buildEntryChecksums(originalEntries)
    };

    try {
      if (!existingBackup) storage.setItem(MIGRATION_STORAGE.backup, JSON.stringify(backup));
      const persistedBackup = readJson(storage, MIGRATION_STORAGE.backup);
      if (!persistedBackup || JSON.stringify(buildEntryChecksums(persistedBackup.rawEntries || {})) !== JSON.stringify(buildEntryChecksums(originalEntries))) {
        throw new Error("The local Version 1.3 migration backup could not be verified.");
      }

      const candidate = buildCandidate(originalEntries, now);
      validateCandidate(candidate, originalEntries);
      storage.setItem(MIGRATION_STORAGE.candidate, JSON.stringify(candidate));

      const persistedCandidate = readJson(storage, MIGRATION_STORAGE.candidate);
      validateCandidate(persistedCandidate, originalEntries);

      const marker = writeVersionMarker(storage, createVersionMarker({
        installedAt: now,
        migrationState: "local-validated",
        syncVerificationStatus: "pending",
        migrationComplete: false
      }));
      const result = {
        status: "completed",
        migrated: true,
        sourceSchemaVersion: candidate.sourceSchemaVersion,
        targetSchemaVersion: TARGET_SCHEMA_VERSION,
        completedAt: now,
        counts: clone(candidate.counts),
        backupRetained: true,
        cloudSyncAllowed: true,
        syncVerificationStatus: "pending",
        migrationComplete: false,
        versionMarker: marker
      };
      storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(result));
      return result;
    } catch (error) {
      const result = {
        status: "failed",
        migrated: false,
        sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
        targetSchemaVersion: TARGET_SCHEMA_VERSION,
        failedAt: now,
        backupRetained: Boolean(storage.getItem(MIGRATION_STORAGE.backup)),
        cloudSyncAllowed: false,
        syncVerificationStatus: "not-started",
        migrationComplete: false,
        error: error.message || "Migration validation failed."
      };
      storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(result));
      return result;
    }
  }

  function markSupabaseSyncVerified(storage = globalScope.localStorage, verification = {}, now = new Date().toISOString()) {
    if (!storage) throw new Error("Browser storage is unavailable.");
    const status = readJson(storage, MIGRATION_STORAGE.status);
    const marker = readJson(storage, MIGRATION_STORAGE.versionMarker);
    const backup = readJson(storage, MIGRATION_STORAGE.backup);
    const candidate = readJson(storage, MIGRATION_STORAGE.candidate);
    validateVersionMarker(marker);
    if (status?.status !== "completed" || !backup || !candidate) {
      throw new Error("A verified local migration is required before synchronization can be completed.");
    }
    validateCandidate(candidate, backup.rawEntries || {});
    if (verification.readBackVerified !== true || !verification.verifiedAt) {
      throw new Error("Supabase read-back verification evidence is required.");
    }

    const nextMarker = {
      ...marker,
      migrationState: "sync-verified",
      syncVerificationStatus: "verified",
      migrationComplete: true,
      firstVerifiedSyncAt: verification.verifiedAt,
      updatedAt: now
    };
    writeVersionMarker(storage, nextMarker);
    const nextStatus = {
      ...status,
      syncVerificationStatus: "verified",
      migrationComplete: true,
      firstVerifiedSyncAt: verification.verifiedAt,
      syncVerification: clone(verification),
      backupRetained: Boolean(storage.getItem(MIGRATION_STORAGE.backup)),
      eligibleForBackupCleanup: true
    };
    storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(nextStatus));
    return nextStatus;
  }

  function markSupabaseSyncFailed(storage = globalScope.localStorage, errorMessage = "Synchronization failed.", now = new Date().toISOString()) {
    if (!storage) throw new Error("Browser storage is unavailable.");
    const status = readJson(storage, MIGRATION_STORAGE.status) || {};
    const marker = readJson(storage, MIGRATION_STORAGE.versionMarker);
    if (marker) {
      validateVersionMarker(marker);
      writeVersionMarker(storage, {
        ...marker,
        migrationState: "sync-pending",
        syncVerificationStatus: "failed",
        migrationComplete: false,
        updatedAt: now
      });
    }
    const nextStatus = {
      ...status,
      syncVerificationStatus: "failed",
      migrationComplete: false,
      backupRetained: Boolean(storage.getItem(MIGRATION_STORAGE.backup)),
      eligibleForBackupCleanup: false,
      lastSyncFailureAt: now,
      lastSyncError: String(errorMessage)
    };
    storage.setItem(MIGRATION_STORAGE.status, JSON.stringify(nextStatus));
    return nextStatus;
  }

  const api = Object.freeze({
    APPLICATION_ID,
    SOURCE_SCHEMA_VERSION,
    TARGET_SCHEMA_VERSION,
    SOURCE_RELEASE,
    TARGET_RELEASE,
    COMPATIBLE_SCHEMA_2_RELEASES,
    MIGRATION_STORAGE,
    VERSION_13_STORAGE,
    buildCandidate,
    captureApplicationEntries,
    createVersionMarker,
    detectInstallation,
    validateVersionMarker,
    stableHash,
    validateCandidate,
    rehydrateValidatedCandidate,
    runMigration,
    markSupabaseSyncVerified,
    markSupabaseSyncFailed
  });

  globalScope.SHDPStorage = api;
  if (globalScope.localStorage) globalScope.SHDPMigrationResult = runMigration(globalScope.localStorage);

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
