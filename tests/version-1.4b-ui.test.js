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
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?#ingredient-database\.active-page \.ingredient-fab\s*\{/);
  assert.match(css, /bottom:calc\(82px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /#ingredient-database\{padding-bottom:96px\}/);
  assert.match(css, /body:has\(\.app-dialog\[open\]\) \.ingredient-fab\{display:none\}/);
});

test("makes the Ingredient Database reachable through the mobile More screen", () => {
  const settingsSection = html.match(/<section id="settings"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(settingsSection, /class="panel mobile-more-navigation"/);
  assert.match(settingsSection, /data-dashboard-page="ingredient-database"/);
  assert.match(css, /\.mobile-more-navigation\{display:none\}/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.mobile-more-navigation\s*\{[\s\S]*?display:flex/);
  assert.match(script, /const mobileNavigationPage = pageName === "ingredient-database" \? "settings" : pageName;/);
  assert.match(script, /button\.dataset\.mobilePage === mobileNavigationPage/);
});

test("shows one Delete Ingredient label in every mobile recipe ingredient row", () => {
  assert.match(script, /class="remove-ingredient-button"[^>]*>Delete Ingredient<\/button>/);
  assert.doesNotMatch(css, /content:"[^"]*Delete Ingredient[^"]*"/);
  assert.match(css, /\.remove-ingredient-button::before\{content:"🗑"/);
});

test("keeps a mobile Add Ingredient FAB inside the shared Create/Edit Recipe modal", () => {
  const recipeDialog = html.match(/<dialog id="recipe-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(recipeDialog, /id="add-ingredient-button" data-add-recipe-ingredient/);
  assert.match(recipeDialog, /class="recipe-ingredient-fab"[^>]*data-add-recipe-ingredient/);
  assert.match(recipeDialog, /class="recipe-dialog-actions"[\s\S]*?recipe-ingredient-fab[\s\S]*?recipe-save-actions/);
  assert.equal((recipeDialog.match(/class="recipe-ingredient-fab"/g) || []).length, 1);
  assert.equal((html.match(/class="recipe-ingredient-fab"/g) || []).length, 1);
  assert.match(script, /\$all\("\[data-add-recipe-ingredient\]"\)[\s\S]*?createIngredientRow\(\)/);
  assert.match(script, /function editRecipe\(recipeId\)[\s\S]*?openDialog\("recipe-dialog", "edit"\)/);
  assert.match(css, /\.recipe-ingredient-fab\{display:none\}/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.recipe-ingredient-fab\s*\{[\s\S]*?display:flex/);
  assert.match(css, /\.recipe-dialog-actions\s*\{[\s\S]*?border-top:[^;]+;[\s\S]*?background:[^;]+;/);
  assert.match(css, /\.recipe-dialog-actions \.recipe-save-actions\s*\{[\s\S]*?grid-template-columns:1fr 1fr/);
});

test("wires category refresh after recipe and ingredient changes", () => {
  assert.match(script, /function refreshCategoryViews\(\)/);
  assert.match(script, /recipe-category-options/);
  assert.match(script, /ingredient-category-options/);
  assert.match(script, /SHDPIngredients\.collectCategories\(activeIngredientDatabase\)/);
  assert.ok((script.match(/refreshCategoryViews\(\);/g) || []).length >= 6);
});

test("advances the offline app shell for Version 1.4C", () => {
  assert.match(serviceWorker, /v1\.4c-ingredient-sync-fix/);
  ["./js/storage.js", "./js/data.js", "./js/ingredients.js", "./js/config.js", "./js/sync.js", "./js/script.js"].forEach(asset =>
    assert.ok(serviceWorker.includes(asset), `Missing ${asset} from app shell`)
  );
});

test("filters saved recipes by partial name and category inside Add Meal", () => {
  [
    'id="meal-recipe-search"',
    'id="meal-recipe-category-filter"',
    'id="meal-recipe-result-count"'
  ].forEach(marker => assert.ok(html.includes(marker), `Missing ${marker}`));
  assert.match(script, /addEventListener\("input", loadRecipeOptions\)/);
  assert.match(script, /toLocaleLowerCase\(\)\.includes\(searchText\)/);
  assert.match(script, /recipe\.category === categorySelect\.value/);
  assert.match(css, /\.meal-recipe-filters\s*\{/);
});

test("gates shared sync after a failed migration and persists cloud state safely", () => {
  assert.match(script, /window\.SHDPMigrationResult\?\.status !== "failed"/);
  assert.match(script, /SHDPIngredients\.assertValidCollection\(nextIngredients\)/);
  assert.match(script, /Shared records could not be verified after local persistence/);
  assert.match(script, /previousRecipesRaw[\s\S]*?previousIngredientsRaw[\s\S]*?throw error/);
});

test("queues both automatic and manual ingredient creation through the common shared path", () => {
  assert.match(script, /ingredientExpansion\.created\.forEach\(ingredient => queueSharedMutation\("ingredient", ingredient\)\)/);
  assert.match(script, /SHDPIngredients\.createIngredient[\s\S]*?queueSharedMutation\("ingredient", result\.ingredient\)/);
});

test("reports safe development diagnostics while retaining failed shared changes", () => {
  assert.match(script, /SHDPSharedSync\.readOutbox\(localStorage\)/);
  assert.match(script, /console\.error\("\[V1\.4C Sync\] Shared synchronization failed; queued changes were retained\."/);
  assert.match(script, /pendingCount/);
  assert.match(script, /pendingEntities/);
  assert.doesNotMatch(script, /console\.(?:log|warn|error)\([^)]*supabaseAnonKey/);
});
