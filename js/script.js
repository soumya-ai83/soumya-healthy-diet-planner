/*
Soumya Healthy Diet Planner
Version 0.5.2B — Dashboard workflow + Recipe Master Database saving
Project Codename: Project Jatibaba
*/

const STORAGE = {
  meals: "soumyaHealthyDietMeals",
  recipes: "soumyaHealthyDietRecipes",
  settings: "soumyaHealthyDietSettings"
};

const defaultSettings = {
  dailyCalorieTarget: 1900,
  currentWeight: 188,
  goalWeight: 170,
  weightUnit: "lb"
};

let applicationSettings = loadJson(STORAGE.settings, defaultSettings);
let savedMeals = loadJson(STORAGE.meals, []);
let savedRecipes = loadJson(STORAGE.recipes, recipeDatabase);
let currentMealItems = [];
let ingredientRowCounter = 0;
let toastTimer;

const today = new Date();
const todayForInput = getLocalDateString(today);

function $(id) { return document.getElementById(id); }
function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

function getLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateString, compact = false) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", compact
    ? { month: "short", day: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" });
}

function formatCalories(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("en-US")} kcal`;
}

function createUniqueId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredCloneSafe(fallback);
    const parsed = JSON.parse(raw);
    return parsed ?? structuredCloneSafe(fallback);
  } catch (error) {
    console.error(`Unable to load ${key}`, error);
    return structuredCloneSafe(fallback);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveAll() {
  localStorage.setItem(STORAGE.meals, JSON.stringify(savedMeals));
  localStorage.setItem(STORAGE.recipes, JSON.stringify(savedRecipes));
  localStorage.setItem(STORAGE.settings, JSON.stringify(applicationSettings));
}

function showMessage(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// Header and greeting
$("current-date").textContent = today.toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});
const hour = today.getHours();
$("greeting").textContent = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, Soumya`;
$("meal-date").value = todayForInput;
$("history-date").value = todayForInput;

// Navigation
function openPage(pageName) {
  $all(".app-page").forEach(page => page.classList.remove("active-page"));
  $all(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.page === pageName));
  const page = $(pageName);
  if (page) page.classList.add("active-page");
  if (pageName === "meal-history") renderMealHistory();
  if (pageName === "recipe-handbook") renderRecipeHandbook();
  if (pageName === "progress") renderWeeklyProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$all(".nav-button").forEach(button => button.addEventListener("click", () => openPage(button.dataset.page)));
$("today-button").addEventListener("click", () => {
  $("meal-date").value = todayForInput;
  $("history-date").value = todayForInput;
  openPage("dashboard");
  updateDashboard();
});

// Dialog controls
function openDialog(id, entryType) {
  const dialog = $(id);
  if (!dialog) return;
  if (id === "meal-dialog") {
    $("meal-date").value ||= todayForInput;
    loadRecipeOptions();
    if (entryType) selectEntryType(entryType);
  }
  if (id === "recipe-dialog" && $("ingredients-container").children.length === 0) createIngredientRow();
  dialog.showModal();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog?.open) dialog.close();
}

$all("[data-open-dialog]").forEach(button => button.addEventListener("click", () => openDialog(button.dataset.openDialog, button.dataset.entry)));
$all("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog(button.dataset.closeDialog)));
$all(".app-dialog").forEach(dialog => dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
}));

// Entry type
function selectEntryType(type) {
  $all(".entry-type-card").forEach(button => button.classList.toggle("active", button.dataset.entryType === type));
  $all(".entry-panel").forEach(panel => panel.classList.toggle("active-entry-panel", panel.id === `${type}-entry`));
}
$all(".entry-type-card").forEach(button => button.addEventListener("click", () => selectEntryType(button.dataset.entryType)));

// Recipe options
function loadRecipeOptions() {
  const select = $("recipe-selection");
  select.innerHTML = '<option value="">Choose a saved recipe</option>';
  [...savedRecipes].sort((a, b) => a.name.localeCompare(b.name)).forEach(recipe => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = `${recipe.name} — ${formatCalories(recipe.caloriesPerServing)}/serving`;
    select.appendChild(option);
  });
}

// Current meal
function calculateCurrentMealTotal() {
  return currentMealItems.reduce((sum, item) => sum + Number(item.calories || 0), 0);
}

function addItemToCurrentMeal(item) {
  currentMealItems.push(item);
  renderCurrentMeal();
  showMessage(`${item.name} added to the current meal.`);
}

function renderCurrentMeal() {
  const container = $("current-meal-items");
  if (!currentMealItems.length) {
    container.innerHTML = '<div class="empty-state"><span>➕</span><h4>No items added</h4><p>Add a recipe, manual food or Jatibaba estimate.</p></div>';
  } else {
    container.innerHTML = currentMealItems.map(item => `
      <div class="meal-item-row">
        <div class="meal-item-information"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.details)}</span><small class="source-label">${escapeHtml(item.source)}</small></div>
        <div class="meal-item-actions"><strong>${formatCalories(item.calories)}</strong><button class="remove-item-button" data-remove-item="${item.id}">Remove</button></div>
      </div>`).join("");
    $all("[data-remove-item]").forEach(button => button.addEventListener("click", () => {
      currentMealItems = currentMealItems.filter(item => item.id !== button.dataset.removeItem);
      renderCurrentMeal();
    }));
  }
  $("current-meal-total").textContent = `Meal Total: ${formatCalories(calculateCurrentMealTotal())}`;
}

$("add-recipe-item-button").addEventListener("click", () => {
  const recipe = savedRecipes.find(item => item.id === $("recipe-selection").value);
  const servings = Number($("serving-amount").value);
  if (!recipe) return showMessage("Please select a recipe.");
  if (!(servings > 0)) return showMessage("Please enter a valid serving amount.");
  addItemToCurrentMeal({
    id: createUniqueId("mealitem"), source: "Measured", name: recipe.name,
    details: `${servings} serving${servings === 1 ? "" : "s"}`,
    calories: Math.round(recipe.caloriesPerServing * servings)
  });
  $("recipe-selection").value = "";
  $("serving-amount").value = 1;
});

$("add-custom-item-button").addEventListener("click", () => {
  const name = $("custom-food-name").value.trim();
  const calories = Number($("custom-food-calories").value);
  if (!name) return showMessage("Please enter the food name.");
  if (!(calories > 0)) return showMessage("Please enter valid calories.");
  addItemToCurrentMeal({ id: createUniqueId("mealitem"), source: "Manual", name, details: "Custom food", calories: Math.round(calories) });
  clearCustomEntry();
});

$("add-jatibaba-item-button").addEventListener("click", () => {
  const calories = Number($("jatibaba-calories").value);
  const description = $("jatibaba-description").value.trim() || "Complete meal estimate";
  if (!(calories > 0)) return showMessage("Please enter Jatibaba's estimated calories.");
  addItemToCurrentMeal({ id: createUniqueId("mealitem"), source: "Estimated", name: "Jatibaba Estimate", details: description, calories: Math.round(calories) });
  clearJatibabaEntry();
});

function clearCustomEntry() { $("custom-food-name").value = ""; $("custom-food-calories").value = ""; }
function clearJatibabaEntry() {
  $("jatibaba-description").value = ""; $("jatibaba-calories").value = ""; $("jatibaba-photo").value = "";
  $("jatibaba-preview").hidden = true; $("jatibaba-preview").removeAttribute("src");
}
$("ignore-recipe-button").addEventListener("click", () => { $("recipe-selection").value = ""; $("serving-amount").value = 1; });
$("ignore-custom-button").addEventListener("click", clearCustomEntry);
$("ignore-jatibaba-button").addEventListener("click", clearJatibabaEntry);

$("jatibaba-photo").addEventListener("change", event => {
  const file = event.target.files?.[0];
  const preview = $("jatibaba-preview");
  if (!file) { preview.hidden = true; return; }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});

$("cancel-meal-button").addEventListener("click", () => {
  if (currentMealItems.length && !confirm("Discard the current unsaved meal?")) return;
  currentMealItems = [];
  renderCurrentMeal();
  closeDialog("meal-dialog");
});

$("save-meal-button").addEventListener("click", () => {
  const date = $("meal-date").value;
  const mealType = $("meal-type").value;
  if (!date) return showMessage("Please select the meal date.");
  if (!mealType) return showMessage("Please select the meal type.");
  if (!currentMealItems.length) return showMessage("Please add at least one item.");
  savedMeals.push({
    id: createUniqueId("meal"), date, mealType, items: structuredCloneSafe(currentMealItems),
    totalCalories: calculateCurrentMealTotal(), savedAt: new Date().toISOString()
  });
  currentMealItems = [];
  $("meal-type").value = "";
  renderCurrentMeal();
  saveAll();
  updateDashboard();
  renderMealHistory();
  renderWeeklyProgress();
  closeDialog("meal-dialog");
  showMessage(`${mealType} saved successfully.`);
});

// Dashboard
function getMealsForDate(dateString) { return savedMeals.filter(meal => meal.date === dateString); }
function calculateCaloriesForDate(dateString) { return getMealsForDate(dateString).reduce((sum, meal) => sum + Number(meal.totalCalories || 0), 0); }

function updateDashboard() {
  const target = Number(applicationSettings.dailyCalorieTarget);
  const consumed = calculateCaloriesForDate(todayForInput);
  const remaining = Math.max(target - consumed, 0);
  const percentage = target > 0 ? Math.min(consumed / target * 100, 100) : 0;
  $("dashboard-target").textContent = formatCalories(target);
  $("dashboard-consumed").textContent = formatCalories(consumed);
  $("dashboard-remaining").textContent = formatCalories(remaining);
  $("dashboard-weight").textContent = `${applicationSettings.currentWeight} ${applicationSettings.weightUnit}`;
  $("dashboard-goal-weight").textContent = `Goal: ${applicationSettings.goalWeight} ${applicationSettings.weightUnit}`;
  $("dashboard-progress-text").textContent = `${formatCalories(consumed)} / ${formatCalories(target)}`;
  $("dashboard-progress-target").textContent = `${formatCalories(target)} target`;
  $("calorie-progress").style.width = `${percentage}%`;
  renderDashboardMeals();
}

function renderDashboardMeals() {
  const meals = getMealsForDate(todayForInput);
  const container = $("dashboard-meals-container");
  if (!meals.length) {
    container.innerHTML = '<div class="empty-state"><span>🍽️</span><h4>No meals recorded today</h4><p>Tap Add Meal to begin tracking.</p></div>';
    return;
  }
  container.innerHTML = meals.map(meal => `
    <div class="dashboard-meal-card">
      <div class="dashboard-meal-heading"><div><h4>${escapeHtml(meal.mealType)}</h4><small>${formatDisplayDate(meal.date)}</small></div><strong>${formatCalories(meal.totalCalories)}</strong></div>
      <ul class="dashboard-meal-items">${meal.items.map(item => `<li><span>${escapeHtml(item.name)}</span><strong>${formatCalories(item.calories)}</strong></li>`).join("")}</ul>
    </div>`).join("");
}

// History
$("history-date").addEventListener("change", renderMealHistory);
function renderMealHistory() {
  const date = $("history-date").value;
  const meals = getMealsForDate(date);
  $("history-daily-total").textContent = formatCalories(calculateCaloriesForDate(date));
  const container = $("meal-history-container");
  if (!meals.length) {
    container.innerHTML = '<div class="empty-state"><span>📅</span><h4>No meals recorded for this date</h4><p>Choose another date or add a new meal.</p></div>';
    return;
  }
  container.innerHTML = meals.map(meal => `
    <article class="history-meal-card">
      <div class="history-meal-heading"><div><h3>${escapeHtml(meal.mealType)}</h3><small>${formatDisplayDate(meal.date)}</small></div><strong>${formatCalories(meal.totalCalories)}</strong></div>
      <ul class="history-meal-items">${meal.items.map(item => `<li><div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.details)}</small></div><strong>${formatCalories(item.calories)}</strong></li>`).join("")}</ul>
      <div class="button-row"><button class="delete-meal-button" data-delete-meal="${meal.id}">Delete Meal</button></div>
    </article>`).join("");
  $all("[data-delete-meal]").forEach(button => button.addEventListener("click", () => {
    const meal = savedMeals.find(item => item.id === button.dataset.deleteMeal);
    if (!meal || !confirm(`Delete this ${meal.mealType} entry?`)) return;
    savedMeals = savedMeals.filter(item => item.id !== meal.id);
    saveAll(); updateDashboard(); renderMealHistory(); renderWeeklyProgress(); showMessage("Meal deleted.");
  }));
}

// Recipe Builder
const ingredientsContainer = $("ingredients-container");
function normalize(value) { return String(value || "").trim().toLowerCase(); }
function findIngredient(name) {
  const query = normalize(name);
  return ingredientDatabase.find(item => normalize(item.name) === query || item.aliases.some(alias => normalize(alias) === query));
}

function populateIngredientOptions() {
  $("ingredient-options").innerHTML = ingredientDatabase.map(item => `<option value="${escapeHtml(item.name)}"></option>`).join("");
}

function createIngredientRow(seed = {}) {
  ingredientRowCounter += 1;
  const row = document.createElement("div");
  row.className = "ingredient-entry-row";
  row.dataset.rowId = ingredientRowCounter;
  row.innerHTML = `
    <div class="form-group"><label>Ingredient</label><input class="ingredient-name-input" list="ingredient-options" placeholder="Example: Potato" value="${escapeHtml(seed.name || "")}"><div class="ingredient-reference">Start typing an ingredient.</div></div>
    <div class="form-group"><label>Quantity</label><input type="number" class="ingredient-quantity-input" min="0" step="0.01" inputmode="decimal" placeholder="150" value="${seed.quantity || ""}"></div>
    <div class="form-group"><label>Unit</label><select class="ingredient-unit-input"><option value="g">g</option><option value="ml">ml</option><option value="tsp">tsp</option><option value="tbsp">tbsp</option><option value="piece">piece</option></select></div>
    <div class="form-group"><label>Total Calories</label><input class="ingredient-total-input" type="number" readonly value="0"><div class="ingredient-reference ingredient-status"></div></div>
    <button type="button" class="remove-ingredient-button">Remove</button>
    <div class="manual-reference"><div class="form-group"><label>Reference Calories</label><input type="number" class="manual-calories" min="0" step="0.01" placeholder="77"></div><div class="form-group"><label>Reference Amount</label><input type="number" class="manual-amount" min="0" step="0.01" placeholder="100"></div><div class="form-group"><label>Reference Unit</label><select class="manual-unit"><option value="g">g</option><option value="ml">ml</option><option value="tsp">tsp</option><option value="tbsp">tbsp</option><option value="piece">piece</option></select></div></div>`;
  ingredientsContainer.appendChild(row);
  row.querySelector(".ingredient-unit-input").value = seed.unit || "g";
  ["input", "change"].forEach(eventName => row.addEventListener(eventName, () => updateIngredientRow(row)));
  row.querySelector(".remove-ingredient-button").addEventListener("click", () => {
    if (ingredientsContainer.children.length === 1) return showMessage("A recipe must contain at least one ingredient.");
    row.remove(); calculateRecipeNutrition();
  });
  updateIngredientRow(row);
}

function updateIngredientRow(row) {
  const name = row.querySelector(".ingredient-name-input").value;
  const quantity = Number(row.querySelector(".ingredient-quantity-input").value);
  const unit = row.querySelector(".ingredient-unit-input").value;
  const known = findIngredient(name);
  const manual = row.querySelector(".manual-reference");
  const referenceText = row.querySelector(".ingredient-reference");
  const statusText = row.querySelector(".ingredient-status");
  let calories = 0;
  if (known) {
    manual.classList.remove("active");
    referenceText.textContent = `${known.referenceCalories} kcal / ${known.referenceAmount} ${known.referenceUnit}`;
    if (unit === known.referenceUnit && quantity > 0) calories = quantity / known.referenceAmount * known.referenceCalories;
    else if (quantity > 0) statusText.textContent = `Choose ${known.referenceUnit} for automatic calculation.`;
  } else if (name.trim()) {
    manual.classList.add("active");
    referenceText.textContent = "Not found locally — enter a manual reference.";
    const refCalories = Number(row.querySelector(".manual-calories").value);
    const refAmount = Number(row.querySelector(".manual-amount").value);
    const refUnit = row.querySelector(".manual-unit").value;
    if (unit === refUnit && quantity > 0 && refAmount > 0 && refCalories >= 0) calories = quantity / refAmount * refCalories;
  } else {
    manual.classList.remove("active");
    referenceText.textContent = "Start typing an ingredient.";
  }
  row.querySelector(".ingredient-total-input").value = Math.round(calories);
  statusText.textContent = calories > 0 ? `${formatCalories(calories)} calculated` : statusText.textContent;
  calculateRecipeNutrition();
}

function calculateRecipeNutrition() {
  const total = $all(".ingredient-total-input").reduce((sum, input) => sum + Number(input.value || 0), 0);
  const servings = Number($("total-servings").value);
  $("recipe-total-calories").textContent = formatCalories(total);
  $("recipe-total-servings-summary").textContent = servings > 0 ? servings : 0;
  $("recipe-calories-per-serving").textContent = formatCalories(servings > 0 ? total / servings : 0);
  return { total, servings, perServing: servings > 0 ? total / servings : 0 };
}

$("add-ingredient-button").addEventListener("click", () => createIngredientRow());
$("total-servings").addEventListener("input", calculateRecipeNutrition);

function resetNewRecipeForm() {
  $("new-recipe-name").value = ""; $("food-type").value = ""; $("recipe-category").value = ""; $("total-servings").value = 2;
  ingredientsContainer.innerHTML = ""; ingredientRowCounter = 0; createIngredientRow(); calculateRecipeNutrition();
}

$("ignore-new-recipe-button").addEventListener("click", () => {
  const hasData = $("new-recipe-name").value.trim() || calculateRecipeNutrition().total > 0;
  if (hasData && !confirm("Ignore this recipe and clear the entered information?")) return;
  resetNewRecipeForm(); closeDialog("recipe-dialog");
});

$("save-new-recipe-button").addEventListener("click", () => {
  const name = $("new-recipe-name").value.trim();
  const foodType = $("food-type").value;
  const category = $("recipe-category").value.trim();
  const nutrition = calculateRecipeNutrition();
  if (!name) return showMessage("Please enter a recipe name.");
  if (!foodType) return showMessage("Please select a food type.");
  if (!(nutrition.servings > 0)) return showMessage("Please enter valid servings.");
  if (!(nutrition.total > 0)) return showMessage("Please add ingredients with calculated calories.");
  if (savedRecipes.some(recipe => normalize(recipe.name) === normalize(name))) return showMessage("A recipe with this name already exists.");
  const ingredients = $all(".ingredient-entry-row").map(row => ({
    name: row.querySelector(".ingredient-name-input").value.trim(),
    quantity: Number(row.querySelector(".ingredient-quantity-input").value),
    unit: row.querySelector(".ingredient-unit-input").value,
    calories: Number(row.querySelector(".ingredient-total-input").value)
  })).filter(item => item.name && item.quantity > 0);
  savedRecipes.push({
    id: `R${String(savedRecipes.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`,
    name, foodType, category: category || "Uncategorized", ingredients,
    totalServings: nutrition.servings,
    totalCalories: Math.round(nutrition.total),
    caloriesPerServing: Math.round(nutrition.perServing),
    createdAt: new Date().toISOString()
  });
  saveAll(); loadRecipeOptions(); renderRecipeHandbook(); resetNewRecipeForm(); closeDialog("recipe-dialog");
  showMessage(`${name} added to the Recipe Master Database.`);
});

// Recipe handbook
$("recipe-search").addEventListener("input", renderRecipeHandbook);
function renderRecipeHandbook() {
  const query = normalize($("recipe-search").value);
  const recipes = savedRecipes.filter(recipe => !query || normalize(recipe.name).includes(query) || normalize(recipe.category).includes(query));
  const container = $("recipe-handbook-container");
  if (!recipes.length) {
    container.innerHTML = '<div class="empty-state"><span>📖</span><h4>No matching recipes</h4><p>Create a new recipe or change your search.</p></div>';
    return;
  }
  container.innerHTML = `<div class="recipe-grid">${[...recipes].sort((a,b)=>a.name.localeCompare(b.name)).map(recipe => `
    <article class="recipe-card">
      <div class="recipe-card-header"><div><h3>${escapeHtml(recipe.name)}</h3><small>${escapeHtml(recipe.category || "Uncategorized")}</small></div><strong>${formatCalories(recipe.caloriesPerServing)}</strong></div>
      <div class="recipe-meta"><span class="badge">${escapeHtml(recipe.foodType)}</span><span class="badge">${recipe.totalServings} servings</span><span class="badge">${formatCalories(recipe.totalCalories)} total</span></div>
      <div class="button-row"><button class="primary-button compact-button" data-use-recipe="${recipe.id}">Add Meal</button>${recipe.id !== "R001" ? `<button class="recipe-delete-button" data-delete-recipe="${recipe.id}">Delete</button>` : ""}</div>
    </article>`).join("")}</div>`;
  $all("[data-use-recipe]").forEach(button => button.addEventListener("click", () => {
    openDialog("meal-dialog", "recipe"); $("recipe-selection").value = button.dataset.useRecipe;
  }));
  $all("[data-delete-recipe]").forEach(button => button.addEventListener("click", () => {
    const recipe = savedRecipes.find(item => item.id === button.dataset.deleteRecipe);
    if (!recipe || !confirm(`Delete ${recipe.name} from the Recipe Master Database?`)) return;
    savedRecipes = savedRecipes.filter(item => item.id !== recipe.id);
    saveAll(); loadRecipeOptions(); renderRecipeHandbook(); showMessage("Recipe deleted.");
  }));
}

// Progress
function renderWeeklyProgress() {
  const rows = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate() - offset);
    const key = getLocalDateString(date);
    const calories = calculateCaloriesForDate(key);
    const pct = Math.min(calories / applicationSettings.dailyCalorieTarget * 100, 100);
    rows.push(`<div class="week-row"><strong>${date.toLocaleDateString("en-US",{weekday:"short"})}<br><small>${formatDisplayDate(key,true)}</small></strong><div class="mini-track"><div class="mini-fill" style="width:${pct}%"></div></div><span>${formatCalories(calories)}</span></div>`);
  }
  $("weekly-progress-list").innerHTML = rows.join("");
}

// Settings
function populateSettings() {
  $("daily-calorie-target").value = applicationSettings.dailyCalorieTarget;
  $("current-weight").value = applicationSettings.currentWeight;
  $("goal-weight").value = applicationSettings.goalWeight;
}
$("save-settings-button").addEventListener("click", () => {
  const target = Number($("daily-calorie-target").value);
  const current = Number($("current-weight").value);
  const goal = Number($("goal-weight").value);
  if (!(target > 0 && current > 0 && goal > 0)) return showMessage("Please enter valid settings.");
  applicationSettings = { ...applicationSettings, dailyCalorieTarget: target, currentWeight: current, goalWeight: goal };
  saveAll(); updateDashboard(); renderWeeklyProgress(); showMessage("Settings saved.");
});

// Initial application start
populateIngredientOptions();
populateSettings();
createIngredientRow();
loadRecipeOptions();
renderCurrentMeal();
updateDashboard();
renderMealHistory();
renderRecipeHandbook();
renderWeeklyProgress();
