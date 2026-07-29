const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class MemoryStorage {
  constructor(entries = {}) { this.entries = new Map(Object.entries(entries)); }
  getItem(key) { return this.entries.has(key) ? this.entries.get(key) : null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
}

const ingredientApi = require("../js/ingredients.js");
const starters = [
  { id: "I001", name: "Potato, raw", aliases: ["Potato", "Aloo"], referenceCalories: 77, referenceAmount: 100, referenceUnit: "g" },
  { id: "I002", name: "Cooking Oil", aliases: ["Oil"], referenceCalories: 120, referenceAmount: 1, referenceUnit: "tbsp" }
];

test("creates a persistent Ingredient Master Database from starter data", () => {
  const storage = new MemoryStorage();
  const result = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  assert.equal(result.status, "ready");
  assert.equal(result.created, true);
  assert.equal(result.ingredients.length, 2);
  const persisted = JSON.parse(storage.getItem(ingredientApi.STORAGE_KEY));
  assert.deepEqual(
    [persisted[0].referenceCalories, persisted[0].referenceAmount, persisted[0].referenceUnit],
    [77, 100, "g"]
  );
  assert.equal(persisted[0].syncStatus, "pending");
});

test("merges missing starters without duplicates", () => {
  const storage = new MemoryStorage({
    [ingredientApi.STORAGE_KEY]: JSON.stringify([
      ingredientApi.normalizeIngredient(starters[0], 0, { now: "2026-07-28T00:00:00.000Z", source: "starter" })
    ])
  });
  const result = ingredientApi.initialize(storage, starters, "2026-07-28T01:00:00.000Z");
  assert.equal(result.status, "ready");
  assert.equal(result.ingredients.length, 2);
  assert.equal(result.addedStarterCount, 1);
  assert.equal(result.ingredients.filter(item => item.name === "Potato, raw").length, 1);
});

test("automatically adds an unknown recipe ingredient with standardized nutrition", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const result = ingredientApi.registerRecipeIngredients(storage, [{
    name: "Bottle Gourd", quantity: 580, unit: "g",
    manualCalories: 14, manualAmount: 100, manualUnit: "g"
  }], initialized.ingredients, "2026-07-28T02:00:00.000Z");
  assert.equal(result.status, "ready");
  assert.equal(result.created.length, 1);
  const created = result.created[0];
  assert.deepEqual(
    [created.referenceCalories, created.referenceAmount, created.referenceUnit],
    [14, 100, "g"]
  );
  assert.equal(created.source, "recipe");
  assert.equal(created.syncStatus, "pending");
  assert.equal(ingredientApi.findIngredient(result.ingredients, "bottle gourd").id, created.id);
});

test("prevents duplicates using case-insensitive names and aliases", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const result = ingredientApi.registerRecipeIngredients(storage, [
    { name: "POTATO", manualCalories: 77, manualAmount: 100, manualUnit: "g" },
    { name: "potato, raw", manualCalories: 77, manualAmount: 100, manualUnit: "g" },
    { name: "New Leaf", manualCalories: 20, manualAmount: 100, manualUnit: "g" },
    { name: "new leaf", manualCalories: 20, manualAmount: 100, manualUnit: "g" }
  ], initialized.ingredients, "2026-07-28T03:00:00.000Z");
  assert.equal(result.status, "ready");
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].name, "New Leaf");
});

test("does not mutate active data if persistence fails", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const before = JSON.stringify(initialized.ingredients);
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  const result = ingredientApi.registerRecipeIngredients(storage, [{
    name: "New Ingredient", manualCalories: 50, manualAmount: 100, manualUnit: "g"
  }], initialized.ingredients, "2026-07-28T04:00:00.000Z");
  assert.equal(result.status, "failed");
  assert.match(result.error, /Quota exceeded/);
  assert.equal(JSON.stringify(initialized.ingredients), before);
});

test("preserves invalid stored data instead of overwriting it", () => {
  const invalid = "{invalid-json";
  const storage = new MemoryStorage({ [ingredientApi.STORAGE_KEY]: invalid });
  const result = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  assert.equal(result.status, "failed");
  assert.equal(storage.getItem(ingredientApi.STORAGE_KEY), invalid);
  assert.equal(result.ingredients.length, starters.length);
});

test("preserves every Version 1.3 starter ingredient and nutrition value", () => {
  const dataPath = path.join(__dirname, "..", "js", "data.js");
  const source = `${fs.readFileSync(dataPath, "utf8")}\nglobalThis.__ingredientDatabase = ingredientDatabase;`;
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  const version13Ingredients = JSON.parse(JSON.stringify(context.__ingredientDatabase));
  const storage = new MemoryStorage();
  const result = ingredientApi.initialize(storage, version13Ingredients, "2026-07-28T00:00:00.000Z");
  const persisted = JSON.parse(storage.getItem(ingredientApi.STORAGE_KEY));

  assert.equal(version13Ingredients.length, 54);
  assert.equal(persisted.length, version13Ingredients.length);
  version13Ingredients.forEach((original, index) => {
    const preservedFields = {
      id: persisted[index].id,
      name: persisted[index].name,
      aliases: persisted[index].aliases,
      referenceCalories: persisted[index].referenceCalories,
      referenceAmount: persisted[index].referenceAmount,
      referenceUnit: persisted[index].referenceUnit
    };
    if (original.unitReferences) preservedFields.unitReferences = persisted[index].unitReferences;
    assert.deepEqual(preservedFields, original);
  });
});

test("creates, edits, categorizes, and soft-deletes an ingredient transactionally", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const created = ingredientApi.createIngredient(storage, initialized.ingredients, {
    name: "Cucumber",
    aliases: ["Kakdi"],
    category: "Vegetables",
    referenceCalories: 15,
    referenceAmount: 100,
    referenceUnit: "g"
  }, "2026-07-29T01:00:00.000Z");
  assert.equal(created.status, "ready");
  assert.equal(ingredientApi.findIngredient(initialized.ingredients, "kakdi").id, created.ingredient.id);
  assert.equal(created.ingredient.category, "Vegetables");

  const updated = ingredientApi.updateIngredient(storage, initialized.ingredients, created.ingredient.id, {
    name: "Cucumber",
    aliases: ["Kakdi", "Cucumber raw"],
    category: "Fresh Vegetables",
    referenceCalories: 16,
    referenceAmount: 100,
    referenceUnit: "g"
  }, "2026-07-29T02:00:00.000Z");
  assert.equal(updated.status, "ready");
  assert.equal(updated.ingredient.category, "Fresh Vegetables");
  assert.equal(updated.ingredient.revision, 2);
  assert.equal(ingredientApi.findIngredient(initialized.ingredients, "cucumber raw").id, created.ingredient.id);

  const deleted = ingredientApi.deleteIngredient(
    storage,
    initialized.ingredients,
    created.ingredient.id,
    "2026-07-29T03:00:00.000Z"
  );
  assert.equal(deleted.status, "ready");
  assert.equal(ingredientApi.findIngredient(initialized.ingredients, "Cucumber"), null);
  assert.equal(deleted.ingredient.deletedAt, "2026-07-29T03:00:00.000Z");
  assert.equal(deleted.ingredient.revision, 3);
  assert.ok(JSON.parse(storage.getItem(ingredientApi.STORAGE_KEY)).find(item => item.id === created.ingredient.id));
});

test("prevents collisions across ingredient names and aliases during add and edit", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const duplicateAlias = ingredientApi.createIngredient(storage, initialized.ingredients, {
    name: "Aloo",
    category: "Vegetables",
    referenceCalories: 77,
    referenceAmount: 100,
    referenceUnit: "g"
  });
  assert.equal(duplicateAlias.status, "failed");
  assert.match(duplicateAlias.error, /already belongs/i);

  const created = ingredientApi.createIngredient(storage, initialized.ingredients, {
    name: "Cucumber",
    aliases: ["Kakdi"],
    category: "Vegetables",
    referenceCalories: 15,
    referenceAmount: 100,
    referenceUnit: "g"
  });
  const conflictingEdit = ingredientApi.updateIngredient(storage, initialized.ingredients, created.ingredient.id, {
    name: "Cucumber",
    aliases: ["Oil"],
    category: "Vegetables",
    referenceCalories: 15,
    referenceAmount: 100,
    referenceUnit: "g"
  });
  assert.equal(conflictingEdit.status, "failed");
  assert.equal(ingredientApi.findIngredient(initialized.ingredients, "Kakdi").id, created.ingredient.id);
});

test("persists ingredient categories and collects current categories after refresh", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  ingredientApi.createIngredient(storage, initialized.ingredients, {
    name: "Cucumber",
    category: "Fresh Vegetables",
    referenceCalories: 15,
    referenceAmount: 100,
    referenceUnit: "g"
  });
  const refreshed = ingredientApi.initialize(storage, starters, "2026-07-29T00:00:00.000Z");
  assert.equal(refreshed.status, "ready");
  assert.equal(ingredientApi.findIngredient(refreshed.ingredients, "Cucumber").category, "Fresh Vegetables");
  assert.deepEqual(
    ingredientApi.collectCategories(refreshed.ingredients),
    ["Fresh Vegetables", "Uncategorized"]
  );
});

test("assigns a recipe category to automatically created ingredients", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const result = ingredientApi.registerRecipeIngredients(storage, [{
    name: "Curry Leaf",
    category: "Herbs",
    manualCalories: 108,
    manualAmount: 100,
    manualUnit: "g"
  }], initialized.ingredients, "2026-07-29T00:00:00.000Z");
  assert.equal(result.status, "ready");
  assert.equal(result.created[0].category, "Herbs");
});

test("does not mutate an ingredient during a failed edit or delete persistence", () => {
  const storage = new MemoryStorage();
  const initialized = ingredientApi.initialize(storage, starters, "2026-07-28T00:00:00.000Z");
  const before = JSON.stringify(initialized.ingredients);
  storage.setItem = () => { throw new Error("Quota exceeded"); };

  const edited = ingredientApi.updateIngredient(storage, initialized.ingredients, "I001", {
    name: "Potato, raw",
    aliases: ["Potato", "Aloo"],
    category: "Vegetables",
    referenceCalories: 78,
    referenceAmount: 100,
    referenceUnit: "g"
  });
  assert.equal(edited.status, "failed");
  assert.equal(JSON.stringify(initialized.ingredients), before);

  const deleted = ingredientApi.deleteIngredient(storage, initialized.ingredients, "I001");
  assert.equal(deleted.status, "failed");
  assert.equal(JSON.stringify(initialized.ingredients), before);
});
