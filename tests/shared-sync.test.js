const test = require("node:test");
const assert = require("node:assert/strict");

const sync = require("../js/sync.js");
const ingredientApi = require("../js/ingredients.js");

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body === null ? "" : JSON.stringify(body); }
  };
}

test("normalizes names and keeps the newest record for a duplicate shared name", () => {
  assert.equal(sync.normalizeName("  Fresh-Cúrry   Leaves "), "fresh curry leaves");
  const records = sync.mergeCollections("ingredient", [
    { id: "local", name: "Fresh Curry Leaves", revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" }
  ], [{
    id: "cloud",
    payload: { id: "cloud", name: "fresh curry leaves" },
    revision: 2,
    updated_at: "2026-01-02T00:00:00.000Z"
  }]);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "cloud");
});

test("coalesces repeated pending changes for the same canonical ingredient", () => {
  const storage = new MemoryStorage();
  sync.queueMutation(storage, "ingredient", {
    id: "ingredient-1", name: "Spinach", revision: 1
  }, "2026-01-01T00:00:00.000Z");
  sync.queueMutation(storage, "ingredient", {
    id: "ingredient-2", name: " spinach ", revision: 2
  }, "2026-01-02T00:00:00.000Z");
  const outbox = sync.readOutbox(storage);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].id, "ingredient-2");
  assert.equal(outbox[0].revision, 2);
});

test("bulk queues a large first-run shared collection without duplicate names", () => {
  const storage = new MemoryStorage();
  const changes = Array.from({ length: 1500 }, (_, index) => ({
    entity: "recipe",
    record: { id: `recipe-${index}`, name: `Recipe ${index}`, revision: 1 }
  }));
  changes.push({ entity: "recipe", record: { id: "replacement", name: " recipe 42 ", revision: 2 } });
  const outbox = sync.queueMutations(storage, changes);
  assert.equal(outbox.length, 1500);
  assert.equal(outbox.find(item => item.canonical_name === "recipe 42").id, "replacement");
});

test("keeps the local outbox after a failed synchronization", async () => {
  const storage = new MemoryStorage();
  sync.queueMutation(storage, "recipe", {
    id: "recipe-1", name: "Chicken Curry", revision: 1
  });
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({ recipes: [], ingredients: [] }),
    fetchImpl: async () => response({ message: "failure" }, 500)
  });
  const result = await manager.syncNow();
  assert.equal(result.status, "failed");
  assert.equal(sync.readOutbox(storage).length, 1);
});

test("retains a failed automatic ingredient upload in the outbox", async () => {
  const storage = new MemoryStorage({
    [sync.STORAGE_KEYS.bootstrap]: "complete"
  });
  const ingredient = {
    id: "ingredient-failed",
    name: "Kasuri Methi",
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  sync.queueMutation(storage, "ingredient", ingredient);
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({ recipes: [], ingredients: [ingredient] }),
    fetchImpl: async () => response({ message: "failure" }, 500)
  });
  assert.equal((await manager.syncNow()).status, "failed");
  const outbox = sync.readOutbox(storage);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].entity, "ingredient");
  assert.equal(outbox[0].canonical_name, "kasuri methi");
});

test("pushes shared records, reads them back, and clears the verified outbox", async () => {
  const storage = new MemoryStorage();
  const calls = [];
  let applied;
  let verified;
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({
      recipes: [{ id: "recipe-1", name: "Dal", revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" }],
      ingredients: [{ id: "ingredient-1", name: "Lentils", revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" }]
    }),
    applyState: state => { applied = state; },
    onVerifiedSync: result => { verified = result; },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("merge_shared_records")) return response(null, 204);
      if (url.includes("shared_recipes")) return response([{
        id: "recipe-1",
        payload: { id: "recipe-1", name: "Dal" },
        revision: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null
      }]);
      return response([{
        id: "ingredient-1",
        payload: { id: "ingredient-1", name: "Lentils" },
        revision: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null
      }]);
    }
  });
  const result = await manager.syncNow();
  assert.equal(result.status, "synced");
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[0].options.body).p_records.length, 2);
  assert.equal(applied.recipes.length, 1);
  assert.equal(applied.ingredients.length, 1);
  assert.equal(sync.readOutbox(storage).length, 0);
  assert.equal(verified.readBackVerified, true);
});

test("does not contact the cloud when Supabase is not configured", async () => {
  let calls = 0;
  const manager = sync.createManager({
    storage: new MemoryStorage(),
    config: {},
    getState: () => ({ recipes: [], ingredients: [] }),
    fetchImpl: async () => { calls += 1; return response([]); }
  });
  assert.equal((await manager.syncNow()).status, "disabled");
  assert.equal(calls, 0);
});

test("uploads an ingredient queued while recipe synchronization is already in flight", async () => {
  const storage = new MemoryStorage({
    [sync.STORAGE_KEYS.bootstrap]: "complete"
  });
  const state = {
    recipes: [{ id: "recipe-1", name: "Chicken Curry", revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" }],
    ingredients: []
  };
  const cloud = { recipe: [], ingredient: [] };
  let releaseFirstUpload;
  let signalFirstUpload;
  const firstUploadStarted = new Promise(resolve => { signalFirstUpload = resolve; });
  const firstUploadGate = new Promise(resolve => { releaseFirstUpload = resolve; });
  let uploadCount = 0;

  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => state,
    applyState: nextState => {
      state.recipes = nextState.recipes;
      state.ingredients = nextState.ingredients;
    },
    fetchImpl: async (url, options = {}) => {
      if (url.includes("merge_shared_records")) {
        uploadCount += 1;
        if (uploadCount === 1) {
          signalFirstUpload();
          await firstUploadGate;
        }
        const records = JSON.parse(options.body).p_records;
        records.forEach(record => {
          cloud[record.entity] = cloud[record.entity].filter(item =>
            item.id !== record.id && item.canonical_name !== record.canonical_name
          );
          cloud[record.entity].push({
            id: record.id,
            canonical_name: record.canonical_name,
            payload: record.payload,
            revision: record.revision,
            updated_at: record.updated_at,
            deleted_at: record.deleted_at
          });
        });
        return response(null, 204);
      }
      return response(url.includes("shared_recipes") ? cloud.recipe : cloud.ingredient);
    }
  });

  sync.queueMutation(storage, "recipe", state.recipes[0]);
  const runningSync = manager.syncNow();
  await firstUploadStarted;

  const automaticIngredient = {
    id: "ingredient-1",
    name: "Fresh Curry Leaves",
    revision: 1,
    updatedAt: "2026-01-01T00:00:01.000Z",
    referenceCalories: 1,
    referenceAmount: 5,
    referenceUnit: "g"
  };
  state.ingredients.push(automaticIngredient);
  sync.queueMutation(storage, "ingredient", automaticIngredient);
  const queuedIngredients = sync.readOutbox(storage).filter(item => item.entity === "ingredient");
  assert.equal(queuedIngredients.length, 1);
  assert.equal(queuedIngredients[0].canonical_name, "fresh curry leaves");
  manager.syncNow();
  releaseFirstUpload();
  await runningSync;

  assert.equal(cloud.ingredient.length, 1);
  assert.equal(cloud.ingredient[0].canonical_name, "fresh curry leaves");
  assert.equal(sync.readOutbox(storage).length, 0);
  assert.equal(uploadCount, 2);
});

test("manually created ingredients use the same verified shared queue path", async () => {
  const storage = new MemoryStorage({
    [sync.STORAGE_KEYS.bootstrap]: "complete"
  });
  const activeIngredients = [];
  const creation = ingredientApi.createIngredient(storage, activeIngredients, {
    name: "Cucumber",
    aliases: ["Kakdi"],
    category: "Vegetables",
    referenceCalories: 15,
    referenceAmount: 100,
    referenceUnit: "g"
  }, "2026-01-01T00:00:00.000Z");
  assert.equal(creation.status, "ready");
  sync.queueMutation(storage, "ingredient", creation.ingredient);
  let uploadedRecord;
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({ recipes: [], ingredients: activeIngredients }),
    fetchImpl: async (url, options = {}) => {
      if (url.includes("merge_shared_records")) {
        uploadedRecord = JSON.parse(options.body).p_records[0];
        return response(null, 204);
      }
      if (url.includes("shared_recipes")) return response([]);
      return response([{
        id: uploadedRecord.id,
        canonical_name: uploadedRecord.canonical_name,
        payload: uploadedRecord.payload,
        revision: uploadedRecord.revision,
        updated_at: uploadedRecord.updated_at,
        deleted_at: null
      }]);
    }
  });
  assert.equal((await manager.syncNow()).status, "synced");
  assert.equal(uploadedRecord.entity, "ingredient");
  assert.equal(uploadedRecord.canonical_name, "cucumber");
  assert.equal(sync.readOutbox(storage).length, 0);
});

test("repairs a previously lost outbox entry when the local ingredient is missing from cloud", async () => {
  const storage = new MemoryStorage({
    [sync.STORAGE_KEYS.bootstrap]: "complete"
  });
  const localIngredient = {
    id: "ingredient-recovery",
    name: "Fresh Curry Leaves",
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  let cloudIngredient = null;
  let uploadCount = 0;
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({ recipes: [], ingredients: [localIngredient] }),
    fetchImpl: async (url, options = {}) => {
      if (url.includes("merge_shared_records")) {
        uploadCount += 1;
        const record = JSON.parse(options.body).p_records[0];
        cloudIngredient = {
          id: record.id,
          canonical_name: record.canonical_name,
          payload: record.payload,
          revision: record.revision,
          updated_at: record.updated_at,
          deleted_at: record.deleted_at
        };
        return response(null, 204);
      }
      if (url.includes("shared_recipes")) return response([]);
      return response(cloudIngredient ? [cloudIngredient] : []);
    }
  });

  assert.equal(sync.readOutbox(storage).length, 0);
  assert.equal((await manager.syncNow()).status, "synced");
  assert.equal(uploadCount, 1);
  assert.equal(cloudIngredient.canonical_name, "fresh curry leaves");
  assert.equal(sync.readOutbox(storage).length, 0);
});

test("paginates cloud reads beyond one thousand shared records", async () => {
  const storage = new MemoryStorage();
  const manager = sync.createManager({
    storage,
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "a".repeat(30) },
    getState: () => ({ recipes: [], ingredients: [] }),
    applyState: state => storage.setItem("appliedCount", state.recipes.length),
    fetchImpl: async url => {
      if (url.includes("shared_ingredients")) return response([]);
      const offset = Number(new URL(url).searchParams.get("offset"));
      if (offset === 0) {
        return response(Array.from({ length: 1000 }, (_, index) => ({
          id: `recipe-${index}`,
          payload: { id: `recipe-${index}`, name: `Recipe ${index}` },
          revision: 1,
          updated_at: "2026-01-01T00:00:00.000Z"
        })));
      }
      return response([{
        id: "recipe-1000",
        payload: { id: "recipe-1000", name: "Recipe 1000" },
        revision: 1,
        updated_at: "2026-01-01T00:00:00.000Z"
      }]);
    }
  });
  assert.equal((await manager.syncNow()).status, "synced");
  assert.equal(storage.getItem("appliedCount"), "1001");
});
