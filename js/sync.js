(function initializeSharedSync(globalScope) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    outbox: "soumyaHealthyDietSharedSyncOutboxV14C",
    bootstrap: "soumyaHealthyDietSharedBootstrapV14C",
    lastSync: "soumyaHealthyDietSharedLastSyncV14C"
  });
  const TABLES = Object.freeze({
    recipe: "shared_recipes",
    ingredient: "shared_ingredients"
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function createClientId(storage) {
    const key = "soumyaHealthyDietSyncClientIdV14C";
    const existing = storage.getItem(key);
    if (existing) return existing;
    const value = globalScope.crypto?.randomUUID?.()
      || `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(key, value);
    return value;
  }

  function normalizeSharedRecord(entity, record, now = new Date().toISOString()) {
    const source = record && typeof record === "object" ? clone(record) : {};
    const name = String(source.name || "").trim().replace(/\s+/g, " ");
    if (!source.id || !name) throw new Error(`A shared ${entity} requires a stable ID and name.`);
    return {
      ...source,
      id: String(source.id),
      name,
      revision: Math.max(1, Number(source.revision) || 1),
      createdAt: source.createdAt || source.updatedAt || now,
      updatedAt: source.updatedAt || source.createdAt || now,
      deletedAt: source.deletedAt || null,
      syncStatus: source.syncStatus || "pending"
    };
  }

  function toEnvelope(entity, record, clientId, now = new Date().toISOString()) {
    const normalized = normalizeSharedRecord(entity, record, now);
    return {
      entity,
      id: normalized.id,
      canonical_name: normalizeName(normalized.name),
      revision: normalized.revision,
      updated_at: normalized.updatedAt,
      deleted_at: normalized.deletedAt,
      client_id: clientId,
      payload: normalized
    };
  }

  function fromCloudRow(entity, row) {
    const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
    return normalizeSharedRecord(entity, {
      ...payload,
      id: row.id || payload.id,
      revision: Number(row.revision ?? payload.revision) || 1,
      updatedAt: row.updated_at || payload.updatedAt,
      deletedAt: row.deleted_at || payload.deletedAt || null,
      syncStatus: "synced"
    }, row.updated_at);
  }

  function compareRecords(left, right) {
    const leftTime = Date.parse(left?.updatedAt || "") || 0;
    const rightTime = Date.parse(right?.updatedAt || "") || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    const revisionDifference = (Number(left?.revision) || 0) - (Number(right?.revision) || 0);
    if (revisionDifference) return revisionDifference;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  }

  function deduplicateByName(records) {
    const byName = new Map();
    records.forEach(record => {
      const key = normalizeName(record.name);
      if (!key) return;
      const existing = byName.get(key);
      if (!existing || compareRecords(existing, record) <= 0) byName.set(key, record);
    });
    return Array.from(byName.values());
  }

  function mergeCollections(entity, localRecords = [], cloudRows = []) {
    const merged = (Array.isArray(localRecords) ? localRecords : [])
      .map(record => normalizeSharedRecord(entity, record));

    (Array.isArray(cloudRows) ? cloudRows : []).forEach(row => {
      const cloudRecord = fromCloudRow(entity, row);
      const canonicalName = normalizeName(cloudRecord.name);
      const index = merged.findIndex(local =>
        local.id === cloudRecord.id || normalizeName(local.name) === canonicalName
      );
      if (index < 0) {
        merged.push(cloudRecord);
        return;
      }
      if (compareRecords(merged[index], cloudRecord) <= 0) merged[index] = cloudRecord;
    });

    return deduplicateByName(merged);
  }

  function readOutbox(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.outbox) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeOutbox(storage, outbox) {
    storage.setItem(STORAGE_KEYS.outbox, JSON.stringify(outbox));
  }

  function queueMutation(storage, entity, record, now = new Date().toISOString()) {
    if (!TABLES[entity]) throw new Error(`Unsupported shared entity ${entity}.`);
    const clientId = createClientId(storage);
    const envelope = toEnvelope(entity, { ...record, syncStatus: "pending" }, clientId, now);
    const outbox = readOutbox(storage);
    const index = outbox.findIndex(item =>
      item.entity === entity
      && (item.id === envelope.id || item.canonical_name === envelope.canonical_name)
    );
    if (index >= 0) outbox[index] = envelope;
    else outbox.push(envelope);
    writeOutbox(storage, outbox);
    return envelope;
  }

  function queueMutations(storage, changes = [], now = new Date().toISOString()) {
    const clientId = createClientId(storage);
    const outbox = readOutbox(storage);
    const byIdentity = new Map(outbox.map((item, index) => [`${item.entity}:${item.canonical_name || item.id}`, index]));
    changes.forEach(({ entity, record }) => {
      if (!TABLES[entity]) throw new Error(`Unsupported shared entity ${entity}.`);
      const envelope = toEnvelope(entity, { ...record, syncStatus: "pending" }, clientId, now);
      const canonicalKey = `${entity}:${envelope.canonical_name}`;
      const idIndex = outbox.findIndex(item => item.entity === entity && item.id === envelope.id);
      const index = byIdentity.has(canonicalKey) ? byIdentity.get(canonicalKey) : idIndex;
      if (index >= 0) outbox[index] = envelope;
      else {
        byIdentity.set(canonicalKey, outbox.length);
        outbox.push(envelope);
      }
    });
    writeOutbox(storage, outbox);
    return outbox;
  }

  function cloudRowConfirmsEnvelope(row, envelope) {
    if (!row || !envelope) return false;
    const sameIdentity = String(row.id || "") === String(envelope.id || "")
      || String(row.canonical_name || "") === String(envelope.canonical_name || "");
    if (!sameIdentity) return false;
    const cloudTime = Date.parse(row.updated_at || "") || 0;
    const queuedTime = Date.parse(envelope.updated_at || "") || 0;
    return cloudTime > queuedTime
      || (cloudTime === queuedTime && Number(row.revision || 0) >= Number(envelope.revision || 0));
  }

  function acknowledgeVerifiedMutations(storage, sentOutbox, cloudRowsByEntity) {
    const verifiedSent = sentOutbox.filter(envelope =>
      (cloudRowsByEntity[envelope.entity] || []).some(row => cloudRowConfirmsEnvelope(row, envelope))
    );
    const currentOutbox = readOutbox(storage);
    const remaining = currentOutbox.filter(current => !verifiedSent.some(sent =>
      sent.entity === current.entity
      && sent.id === current.id
      && sent.canonical_name === current.canonical_name
      && Number(sent.revision) === Number(current.revision)
      && sent.updated_at === current.updated_at
      && (sent.deleted_at || null) === (current.deleted_at || null)
    ));
    writeOutbox(storage, remaining);
    return {
      acknowledgedCount: sentOutbox.length - sentOutbox.filter(sent => !verifiedSent.includes(sent)).length,
      unverifiedSent: sentOutbox.filter(sent => !verifiedSent.includes(sent)),
      remaining
    };
  }

  function isConfigured(config = {}) {
    return /^https:\/\/.+\.supabase\.co\/?$/.test(String(config.supabaseUrl || "").trim())
      && String(config.supabaseAnonKey || "").trim().length > 20;
  }

  function createManager({
    storage = globalScope.localStorage,
    fetchImpl = globalScope.fetch?.bind(globalScope),
    config = globalScope.SHDP_CONFIG || {},
    getState,
    applyState,
    onVerifiedSync,
    onError
  } = {}) {
    let activeRequest = null;
    let intervalId = null;
    const configured = isConfigured(config);
    const baseUrl = String(config.supabaseUrl || "").replace(/\/+$/, "");
    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json"
    };

    async function request(path, options = {}) {
      const response = await fetchImpl(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
      if (!response.ok) throw new Error(`Shared data request failed (${response.status}).`);
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    function bootstrap(state) {
      if (storage.getItem(STORAGE_KEYS.bootstrap) === "complete") return;
      queueMutations(storage, [
        ...(state.recipes || []).map(record => ({ entity: "recipe", record })),
        ...(state.ingredients || []).map(record => ({ entity: "ingredient", record }))
      ]);
    }

    async function pullAll(table) {
      const pageSize = 1000;
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await request(
          `/rest/v1/${table}?select=id,canonical_name,payload,revision,updated_at,deleted_at&limit=${pageSize}&offset=${offset}`
        );
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    }

    function queueLocallyMissingSharedRecords(state, cloudRowsByEntity) {
      const missing = [];
      [
        ["recipe", state.recipes || []],
        ["ingredient", state.ingredients || []]
      ].forEach(([entity, records]) => {
        records.forEach(record => {
          const canonicalName = normalizeName(record.name);
          const existsInCloud = (cloudRowsByEntity[entity] || []).some(row =>
            String(row.id || "") === String(record.id || "")
            || String(row.canonical_name || "") === canonicalName
          );
          if (!existsInCloud) missing.push({ entity, record });
        });
      });
      if (missing.length) queueMutations(storage, missing);
      return missing.length;
    }

    async function executeSync() {
      if (!configured || !fetchImpl || !storage || typeof getState !== "function") {
        return { status: configured ? "unavailable" : "disabled" };
      }
      if (globalScope.navigator && globalScope.navigator.onLine === false) return { status: "offline" };

      const state = getState();
      bootstrap(state);
      const outbox = readOutbox(storage);
      for (let offset = 0; offset < outbox.length; offset += 500) {
        await request("/rest/v1/rpc/merge_shared_records", {
          method: "POST",
          body: JSON.stringify({ p_records: outbox.slice(offset, offset + 500) })
        });
      }

      const [recipeRows, ingredientRows] = await Promise.all([
        pullAll(TABLES.recipe),
        pullAll(TABLES.ingredient)
      ]);
      const recipes = mergeCollections("recipe", state.recipes, recipeRows);
      const ingredients = mergeCollections("ingredient", state.ingredients, ingredientRows);
      if (typeof applyState === "function") applyState({ recipes, ingredients });
      const acknowledgement = acknowledgeVerifiedMutations(storage, outbox, {
        recipe: recipeRows,
        ingredient: ingredientRows
      });
      if (acknowledgement.unverifiedSent.length) {
        const error = new Error(
          `${acknowledgement.unverifiedSent.length} shared change(s) were not confirmed by cloud read-back.`
        );
        error.pendingEntities = Array.from(new Set(acknowledgement.unverifiedSent.map(item => item.entity)));
        throw error;
      }
      queueLocallyMissingSharedRecords(state, {
        recipe: recipeRows,
        ingredient: ingredientRows
      });
      storage.setItem(STORAGE_KEYS.bootstrap, "complete");
      const verifiedAt = new Date().toISOString();
      storage.setItem(STORAGE_KEYS.lastSync, verifiedAt);
      return {
        status: "synced",
        recipes,
        ingredients,
        verifiedAt,
        recipeCount: recipeRows.length,
        ingredientCount: ingredientRows.length
      };
    }

    async function synchronizeUntilCaughtUp() {
      let result;
      for (let pass = 0; pass < 10; pass += 1) {
        result = await executeSync();
        if (result.status !== "synced") return result;
        if (!readOutbox(storage).length) {
          if (typeof onVerifiedSync === "function") onVerifiedSync({
            readBackVerified: true,
            verifiedAt: result.verifiedAt,
            recipeCount: result.recipeCount,
            ingredientCount: result.ingredientCount
          });
          return result;
        }
      }
      return { ...result, status: "pending", pendingCount: readOutbox(storage).length };
    }

    function syncNow() {
      if (activeRequest) return activeRequest;
      activeRequest = synchronizeUntilCaughtUp()
        .catch(error => {
          if (typeof onError === "function") onError(error);
          return { status: "failed", error: error.message };
        })
        .finally(() => { activeRequest = null; });
      return activeRequest;
    }

    function start() {
      if (!configured) return { status: "disabled" };
      globalScope.addEventListener?.("online", syncNow);
      globalScope.addEventListener?.("visibilitychange", () => {
        if (globalScope.document?.visibilityState === "visible") syncNow();
      });
      intervalId = globalScope.setInterval?.(syncNow, 5 * 60 * 1000);
      syncNow();
      return { status: "started" };
    }

    function stop() {
      globalScope.removeEventListener?.("online", syncNow);
      if (intervalId) globalScope.clearInterval?.(intervalId);
      intervalId = null;
    }

    return { configured, syncNow, start, stop };
  }

  const api = Object.freeze({
    STORAGE_KEYS,
    TABLES,
    normalizeName,
    normalizeSharedRecord,
    toEnvelope,
    fromCloudRow,
    compareRecords,
    mergeCollections,
    readOutbox,
    queueMutation,
    queueMutations,
    cloudRowConfirmsEnvelope,
    acknowledgeVerifiedMutations,
    isConfigured,
    createManager
  });

  globalScope.SHDPSharedSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
