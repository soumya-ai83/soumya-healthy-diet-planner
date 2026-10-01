const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
const feature = script.slice(script.indexOf("// Strict decimal parsing:"), script.indexOf('$("edit-recipe-from-details-button")'));
const normalization = script.slice(script.indexOf("function normalizeRecipeRecord("), script.indexOf("function normalizeRecipeCollection("));

function harness(recipe) {
  const nodes = new Map();
  let opened = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", value: "", addEventListener(event, callback) { this[event] = callback; } });
    return nodes.get(id);
  }
  const context = vm.createContext({
    savedRecipes: [recipe], selectedRecipeDetailsId: null,
    $: node, escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    formatCalories: value => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} kcal`,
    openDialog: () => { opened += 1; }, showMessage: message => assert.fail(message),
    normalizeCategoryLabel: value => value || "Uncategorized", getRecipeCategoryValue: recipe => recipe.category,
    // Any persistence call in the real view functions fails this test immediately.
    localStorage: { getItem: () => assert.fail("Storage read"), setItem: () => assert.fail("Storage write") },
    saveAll: () => assert.fail("Persistence"), queueSharedMutation: () => assert.fail("Sync mutation"),
    sharedSyncManager: { queueMutation: () => assert.fail("Outbox write") }
  });
  vm.runInContext(normalization + feature, context);
  function open() {
    context.showRecipeDetails(recipe.id);
    node("recipe-target-servings").value = String(context.recipeServingBaseline(recipe));
  }
  function select(value) {
    node("recipe-target-servings").value = String(value);
    node("recipe-target-servings").change();
  }
  return { context, node, open, select, opened: () => opened };
}

function fixture() {
  return {
    id: "khorma", name: "Chicken Khorma", totalServings: 5,
    caloriesPerServing: 540, totalCalories: 2700, category: "Main", foodType: "Non-Vegetarian",
    ingredients: [
      { name: "Chicken", quantity: 1000, unit: "g", calories: 1500 },
      { name: "Onion", quantity: 300, unit: "g", calories: 120 },
      { name: "Oil", quantity: 50, unit: "g", calories: 450 },
      { name: "Yogurt", quantity: 200, unit: "g", calories: 630 }
    ]
  };
}

test("details render original quantities, locked calories, and accessible integer options", () => {
  const h = harness(fixture());
  h.open();
  const html = h.node("recipe-details-content").innerHTML;
  assert.match(html, /Default: 5/);
  assert.match(html, /value="5" selected/);
  assert.equal((html.match(/<option /g) || []).length, 10);
  assert.match(html, /for="recipe-target-servings"/);
  assert.match(html, /Calories per Serving<\/span><strong>540 kcal/);
  assert.match(html, /1,000 g/);
});

test("5 → 2 → 7 → 3 → 5 → 10 scales from originals without mutation or persistence", () => {
  const recipe = fixture();
  const before = JSON.stringify(recipe);
  recipe.ingredients.forEach(Object.freeze);
  Object.freeze(recipe.ingredients);
  Object.freeze(recipe);
  const h = harness(recipe);
  h.open();
  for (const target of [2, 7, 3, 5, 10]) {
    h.select(target);
    const markup = h.node("recipe-scaled-ingredients").innerHTML;
    for (const ingredient of recipe.ingredients) {
      const expected = (ingredient.quantity * target / 5).toLocaleString("en-US", { maximumFractionDigits: 3 });
      assert.ok(markup.includes(`${expected} g`));
    }
    assert.equal(h.node("recipe-scaled-total-calories").textContent, `${(540 * target).toLocaleString("en-US")} kcal`);
    assert.match(h.node("recipe-details-content").innerHTML, /Calories per Serving<\/span><strong>540 kcal/);
    assert.equal(JSON.stringify(recipe), before);
  }
  h.select(2);
  h.open();
  assert.equal(h.node("recipe-target-servings").value, "5");
  assert.match(h.node("recipe-details-content").innerHTML, /1,000 g/);
  assert.equal(h.opened(), 2);
});

test("rejects out-of-range, fractional, and nonnumeric selections", () => {
  const h = harness(fixture());
  h.open();
  h.select(2);
  const before = h.node("recipe-scaled-ingredients").innerHTML;
  for (const invalid of [0, -1, 11, 2.5, "NaN", "Infinity", ""]) {
    h.select(invalid);
    assert.equal(h.node("recipe-target-servings").value, "2");
    assert.equal(h.node("recipe-scaled-ingredients").innerHTML, before);
  }
  h.select(1);
  assert.match(h.node("recipe-scaled-ingredients").innerHTML, /200 g/);
  h.select(10);
  assert.match(h.node("recipe-scaled-ingredients").innerHTML, /2,000 g/);
});

test("keeps cooking precision, units, descriptions, and default formatting", () => {
  const h = harness(fixture());
  for (const unit of ["g", "kg", "ml", "L", "tbsp", "tsp", "cup", "piece"]) {
    assert.equal(h.context.formatRecipeQuantity({ quantity: 2, unit }, 2, 5), `0.8 ${unit}`);
  }
  assert.equal(h.context.formatRecipeQuantity({ quantity: 93.75, unit: "g" }, 2, 5), "37.5 g");
  assert.equal(h.context.formatRecipeQuantity({ quantity: 0.1 + 0.2, unit: "tsp" }, 5, 5), "0.3 tsp");
  assert.equal(h.context.formatRecipeQuantity({ quantity: 1, unit: "cup" }, 2, 3), "0.667 cup");
  for (const quantity of ["to taste", "as required", "for garnish", "1/2", "1–2", ""]) {
    assert.equal(h.context.formatRecipeQuantity({ quantity, unit: "" }, 2, 5), `${quantity} `);
    const normalized = h.context.normalizeRecipeRecord({ ingredients: [{ quantity }] });
    assert.equal(normalized.ingredients[0].quantity, quantity);
  }
  assert.equal(h.context.formatRecipeQuantity({ quantity: null }, 2, 5), "Quantity unspecified");
  assert.equal(h.context.parseRecipeQuantity(" 2.5 "), 2.5);
  assert.equal(h.context.parseRecipeQuantity(Infinity), null);
});

test("legacy recipes keep unusual saved baselines and safely fall back for invalid servings", () => {
  for (const value of [undefined, null, 0, -1, "bad", Infinity]) {
    const h = harness({ ...fixture(), totalServings: value, ingredients: null });
    assert.equal(h.context.recipeServingBaseline({ totalServings: value }), 1);
    assert.equal(h.context.normalizeRecipeRecord({ totalServings: value }).totalServings, 1);
    h.open();
    assert.match(h.node("recipe-details-content").innerHTML, /older recipe/);
  }
  for (const totalServings of [12, 2.5]) {
    const h = harness({ ...fixture(), totalServings });
    h.open();
    assert.match(h.node("recipe-details-content").innerHTML, new RegExp(`value="${totalServings}" selected disabled`));
    assert.match(h.node("recipe-details-content").innerHTML, /1,000 g/);
    h.select(2);
    assert.ok(h.node("recipe-scaled-ingredients").innerHTML.includes((1000 * 2 / totalServings).toLocaleString("en-US", { maximumFractionDigits: 3 }) + " g"));
  }
});

test("reopening after an explicit recipe edit uses the newly saved baseline", () => {
  const recipe = fixture();
  const h = harness(recipe);
  h.open();
  h.select(2);
  recipe.totalServings = 4;
  recipe.ingredients[0].quantity = 800;
  h.open();
  assert.equal(h.node("recipe-target-servings").value, "4");
  assert.match(h.node("recipe-details-content").innerHTML, /800 g/);
  h.select(2);
  assert.match(h.node("recipe-scaled-ingredients").innerHTML, /400 g/);
});
