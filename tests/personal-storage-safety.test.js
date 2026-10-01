const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
// Execute the actual startup reads, normalizers, and saveAll against browser-like storage.
const startup = source.slice(0, source.indexOf("let currentMealItems = []"));
const helpers = source.slice(source.indexOf("function $(id)"), source.indexOf("function queueSharedMutation("));
const quantityParser = source.slice(source.indexOf("function parseRecipeQuantity("), source.indexOf("function recipeServingBaseline("));
const keys = {
  meals: "soumyaHealthyDietMeals", recipes: "soumyaHealthyDietRecipes",
  settings: "soumyaHealthyDietSettings", weightHistory: "soumyaHealthyDietWeightHistory",
  metadata: "soumyaHealthyDietMetadata"
};

function harness(entries = {}, failedReads = []) {
  const original = new Map(Object.entries(entries));
  const readsToFail = new Set(failedReads);
  const writes = [];
  const diagnostics = [];
  const nodes = new Map();
  const storage = {
    getItem(key) { if (readsToFail.has(key)) throw new Error("PRIVATE read failure detail"); return original.get(key) ?? null; },
    setItem(key, value) { writes.push(key); original.set(key, String(value)); }
  };
  const context = vm.createContext({
    window: {}, localStorage: storage,
    recipeDatabase: [{ id: "starter", name: "Starter", totalServings: 2, caloriesPerServing: 100 }],
    ingredientDatabase: [],
    document: { getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { disabled: false, addEventListener(name, callback) { this[name] = callback; } });
      return nodes.get(id);
    } },
    console: { error: (...args) => diagnostics.push(args) },
    showMessage: () => {}
  });
  vm.runInContext(startup + helpers + quantityParser, context);
  return {
    context, original, writes, diagnostics, readsToFail, nodes,
    run: code => vm.runInContext(code, context),
    state: key => vm.runInContext(`storageReadState.get(${JSON.stringify(key)})`, context),
    save: () => context.saveAll()
  };
}

test("missing primary keys initialize and save normally on first run", () => {
  const h = harness();
  for (const key of Object.values(keys)) assert.equal(h.state(key), "missing");
  h.save();
  assert.deepEqual(JSON.parse(h.original.get(keys.meals)), []);
  assert.deepEqual(JSON.parse(h.original.get(keys.weightHistory)), []);
  assert.equal(JSON.parse(h.original.get(keys.settings)).dailyCalorieTarget, 1900);
  assert.equal(JSON.parse(h.original.get(keys.recipes))[0].id, "starter");
});

test("valid empty arrays and objects are accepted and empty recipes are not reseeded", () => {
  const entries = Object.fromEntries(Object.entries(keys).map(([category, key]) =>
    [key, ["meals", "recipes", "weightHistory"].includes(category) ? "[]" : "{}"]));
  const h = harness(entries);
  for (const key of Object.values(keys)) assert.equal(h.state(key), "valid-empty");
  assert.equal(h.writes.length, 0);
  h.save();
  for (const category of ["meals", "recipes", "weightHistory"]) assert.equal(h.original.get(keys[category]), "[]");
});

for (const [category, key] of Object.entries(keys)) {
  test(`malformed ${category} JSON survives later bulk saves and healthy data remains usable`, () => {
    const raw = '{"PRIVATE_CONTENT": broken';
    const h = harness({ [key]: raw });
    h.run("savedMeals.push({id:'new-meal',date:'2026-10-01',totalCalories:500}); weightHistory.push({id:'new-weight',date:'2026-10-01',weight:180}); applicationSettings.dailyCalorieTarget=2200;");
    h.save();
    h.save();
    assert.equal(h.state(key), "read-failed");
    assert.equal(h.original.get(key), raw);
    assert.ok(!h.writes.includes(key));
    for (const healthy of Object.values(keys).filter(candidate => candidate !== key)) assert.ok(h.original.has(healthy));
    if (category !== "meals") assert.equal(JSON.parse(h.original.get(keys.meals))[0].totalCalories, 500);
    if (category !== "weightHistory") assert.equal(JSON.parse(h.original.get(keys.weightHistory))[0].weight, 180);
    if (category !== "settings") assert.equal(JSON.parse(h.original.get(keys.settings)).dailyCalorieTarget, 2200);
    assert.ok(!JSON.stringify(h.diagnostics).includes("PRIVATE_CONTENT"));
  });
}

test("empty strings, null, and incompatible JSON types fail instead of becoming missing data", () => {
  for (const [key, raw] of [[keys.meals, ""], [keys.meals, "{}"], [keys.weightHistory, "null"], [keys.settings, "[]"], [keys.metadata, "42"]]) {
    const h = harness({ [key]: raw });
    h.save();
    assert.equal(h.state(key), "read-failed");
    assert.equal(h.original.get(key), raw);
  }
});

test("storage read exceptions protect the original and log only key and failure type", () => {
  const raw = '[{"PRIVATE_CONTENT":"kept"}]';
  const h = harness({ [keys.meals]: raw }, [keys.meals]);
  h.save();
  assert.equal(h.original.get(keys.meals), raw);
  assert.ok(!h.writes.includes(keys.meals));
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics[0][1])), { key: keys.meals, failureType: "read-error" });
  assert.ok(!JSON.stringify(h.diagnostics).includes("PRIVATE"));
});

test("a failed read remains write-protected for the session after a successful reread", () => {
  const h = harness({ [keys.meals]: "[]" }, [keys.meals]);
  h.readsToFail.clear();
  h.context.loadJson(keys.meals, []);
  assert.equal(h.state(keys.meals), "read-failed");
  h.run("savedMeals.push({id:'unsaved',date:'2026-10-01',totalCalories:500})");
  h.save();
  assert.equal(h.original.get(keys.meals), "[]");
});

test("failed recipe startup and shared-state application cannot replace corrupt recipes", () => {
  const h = harness({ [keys.recipes]: "broken recipes" });
  const shared = source.slice(source.indexOf("function applySharedState("), source.indexOf("function markInitialSharedSyncVerified("));
  vm.runInContext(shared, h.context);
  assert.throws(() => h.context.applySharedState({ recipes: [], ingredients: [] }), /failed to load/);
  assert.equal(h.original.get(keys.recipes), "broken recipes");
  assert.ok(!h.writes.includes(keys.recipes));
});

test("failure notice disables affected and bulk controls while healthy save controls remain usable", () => {
  const h = harness({ [keys.meals]: "broken" });
  h.context.reportStorageReadFailures();
  assert.equal(h.nodes.get("save-meal-button").disabled, true);
  for (const id of ["import-data-input", "reset-data-button", "export-data-button"]) assert.equal(h.nodes.get(id).disabled, true);
  assert.equal(h.context.canEditDataset(keys.meals), false);
  assert.equal(h.context.canEditDataset(keys.weightHistory), true);
});

test("normal valid V1.4C personal data loads and saves without losing additional fields", () => {
  const meals = [{ id: "m1", date: "2026-09-01", mealType: "Lunch", items: [{ id: "i1", name: "Food", details: "Lunch", source: "Manual", calories: 610 }], totalCalories: 610, savedAt: "2026-09-01", note: "kept" }];
  const weights = [{ id: "w1", date: "2026-09-01", weight: 188, note: "kept" }];
  const settings = { dailyCalorieTarget: 2100, currentWeight: 188, goalWeight: 170, weightUnit: "lb", customProfile: "kept" };
  const h = harness({ [keys.meals]: JSON.stringify(meals), [keys.weightHistory]: JSON.stringify(weights), [keys.settings]: JSON.stringify(settings) });
  // Loading performs no writes to any personal history/settings key.
  for (const key of [keys.meals, keys.weightHistory, keys.settings]) assert.ok(!h.writes.includes(key));
  h.save();
  assert.deepEqual(JSON.parse(h.original.get(keys.meals)), meals);
  assert.deepEqual(JSON.parse(h.original.get(keys.weightHistory)), weights);
  assert.deepEqual(JSON.parse(h.original.get(keys.settings)), settings);
  h.run("applicationSettings.dailyCalorieTarget=2300");
  h.save();
  assert.equal(JSON.parse(h.original.get(keys.settings)).dailyCalorieTarget, 2300);
});
