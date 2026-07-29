const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "js", "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("includes the complete Ingredient Database screen and editor controls", () => {
  [
    'id="ingredient-database"',
    'id="ingredient-database-search"',
    'id="ingredient-category-filter"',
    'id="ingredient-database-container"',
    'id="ingredient-dialog"',
    'id="ingredient-name"',
    'id="ingredient-category"',
    'id="ingredient-aliases"',
    'id="ingredient-reference-calories"',
    'id="ingredient-reference-amount"',
    'id="ingredient-reference-unit"',
    'id="save-ingredient-button"'
  ].forEach(marker => assert.ok(html.includes(marker), `Missing ${marker}`));
});

test("keeps the mobile Add Ingredient FAB on the Ingredient Database screen", () => {
  const ingredientSection = html.match(/<section id="ingredient-database"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(ingredientSection, /class="ingredient-fab"/);
  assert.match(css, /\.ingredient-fab\s*\{/);
  assert.match(css, /bottom:calc\(82px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /#ingredient-database\{padding-bottom:96px\}/);
});

test("wires category refresh after recipe and ingredient changes", () => {
  assert.match(script, /function refreshCategoryViews\(\)/);
  assert.match(script, /recipe-category-options/);
  assert.match(script, /ingredient-category-options/);
  assert.match(script, /SHDPIngredients\.collectCategories\(activeIngredientDatabase\)/);
  assert.ok((script.match(/refreshCategoryViews\(\);/g) || []).length >= 6);
});

test("advances the offline app shell for Version 1.4B", () => {
  assert.match(serviceWorker, /v1\.4b-ingredient-management/);
  ["./js/storage.js", "./js/data.js", "./js/ingredients.js", "./js/script.js"].forEach(asset =>
    assert.ok(serviceWorker.includes(asset), `Missing ${asset} from app shell`)
  );
});
