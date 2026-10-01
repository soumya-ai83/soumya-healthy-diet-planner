const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8");
const oldCache = "soumya-healthy-diet-v1.4c-ingredient-sync-fix-shell";

function harness(failedAsset) {
  const listeners = new Map();
  const buckets = new Map([[oldCache, new Map([["./index.html", { ok: true, body: "working old shell" }]])], ["other-app-cache", new Map()]]);
  const events = [];
  let skipWaiting = 0;
  let claimed = 0;
  const caches = {
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name);
      return {
        async addAll(assets) {
          // Model Cache.addAll's all-or-nothing batch, including failed HTTP responses.
          const responses = await Promise.all(assets.map(async asset => {
            if (asset === failedAsset) throw new Error("Required download failed");
            return [asset, { ok: true, body: asset }];
          }));
          responses.forEach(([asset, response]) => entries.set(asset, response));
        },
        async match(asset) { return entries.get(asset); }
      };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { events.push(`delete:${name}`); return buckets.delete(name); }
  };
  const environment = {
    caches,
    self: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      async skipWaiting() { skipWaiting += 1; events.push("skipWaiting"); },
      clients: { async claim() { claimed += 1; events.push("claim"); } }
    }
  };
  // Any personal storage, database, outbox, or cloud access would fail the lifecycle tests.
  for (const key of ["localStorage", "indexedDB", "sessionStorage", "fetch"]) {
    Object.defineProperty(environment, key, { get() { throw new Error(`Forbidden application-data access: ${key}`); } });
  }
  const context = vm.createContext(environment);
  vm.runInContext(source, context);
  return {
    buckets, events,
    required: Array.from(vm.runInContext("REQUIRED_APP_SHELL", context)),
    shell: vm.runInContext("SHELL_CACHE", context),
    counts: () => ({ skipWaiting, claimed }),
    async dispatch(name) {
      let completion;
      listeners.get(name)({ waitUntil(promise) { completion = promise; } });
      await completion;
    }
  };
}

test("a complete required shell installs before skipWaiting and activates normally", async () => {
  const h = harness();
  await h.dispatch("install");
  for (const asset of h.required) assert.ok(h.buckets.get(h.shell).has(asset));
  assert.equal(h.counts().skipWaiting, 1);
  // Install never deletes the old working shell.
  assert.ok(h.buckets.has(oldCache));
  await h.dispatch("activate");
  assert.equal(h.counts().claimed, 1);
});

for (const asset of harness().required) {
  test(`failed required asset ${asset} rejects installation and retains old offline shell`, async () => {
    const h = harness(asset);
    await assert.rejects(h.dispatch("install"), /download failed/);
    assert.deepEqual(h.counts(), { skipWaiting: 0, claimed: 0 });
    assert.equal(h.buckets.get(oldCache).get("./index.html").body, "working old shell");
    assert.ok(!h.events.some(event => event.startsWith("delete:")));
    // Defense in depth: even a forced activation event may not clear the old cache.
    await assert.rejects(h.dispatch("activate"), /incomplete/);
    assert.ok(h.buckets.has(oldCache));
    assert.equal(h.counts().claimed, 0);
  });
}

test("activation rechecks required shell after an installed asset disappears", async () => {
  const h = harness();
  await h.dispatch("install");
  h.buckets.get(h.shell).delete("./js/script.js");
  await assert.rejects(h.dispatch("activate"), /incomplete/);
  assert.ok(h.buckets.has(oldCache));
  assert.equal(h.counts().claimed, 0);
});

test("activation rejects an unsuccessful cached response before deleting old caches", async () => {
  const h = harness();
  await h.dispatch("install");
  h.buckets.get(h.shell).set("./index.html", { ok: false });
  await assert.rejects(h.dispatch("activate"), /incomplete/);
  assert.ok(h.buckets.has(oldCache));
});

test("successful update removes only obsolete app caches and leaves application storage untouched", async () => {
  const h = harness();
  const obsoleteRuntime = "soumya-healthy-diet-v1.5-recipe-serving-scaler-runtime";
  const currentRuntime = h.shell.replace(/-shell$/, "-runtime");
  h.buckets.set(obsoleteRuntime, new Map());
  h.buckets.set(currentRuntime, new Map());
  await h.dispatch("install");
  await h.dispatch("activate");
  assert.ok(!h.buckets.has(oldCache));
  assert.ok(!h.buckets.has(obsoleteRuntime));
  assert.ok(h.buckets.has(h.shell));
  assert.ok(h.buckets.has(currentRuntime));
  assert.ok(h.buckets.has("other-app-cache"));
  assert.equal(h.events.at(-1), "claim");
  assert.deepEqual(h.counts(), { skipWaiting: 1, claimed: 1 });
});
