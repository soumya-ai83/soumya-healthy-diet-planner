/*
Soumya Healthy Diet Planner
Version 0.5.2B — Dashboard workflow + Recipe Master Database saving
Project Codename: Project Jatibaba
*/

const STORAGE = {
  meals: "soumyaHealthyDietMeals",
  recipes: "soumyaHealthyDietRecipes",
  settings: "soumyaHealthyDietSettings",
  weightHistory: "soumyaHealthyDietWeightHistory"
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
let weightHistory = loadJson(STORAGE.weightHistory, []);
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
  localStorage.setItem(STORAGE.weightHistory, JSON.stringify(weightHistory));
}

function showMessage(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("field-error");
  field.removeAttribute("aria-invalid");
  const error = field.parentElement?.querySelector(".field-error-message");
  if (error) error.remove();
}

function setFieldError(field, message) {
  if (!field) return;
  clearFieldError(field);
  field.classList.add("field-error");
  field.setAttribute("aria-invalid", "true");
  const error = document.createElement("div");
  error.className = "field-error-message";
  error.textContent = message;
  field.insertAdjacentElement("afterend", error);
}

function focusFirstInvalid(field) {
  if (!field) return;
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => field.focus({ preventScroll: true }), 250);
}

document.addEventListener("input", event => {
  if (event.target.matches("input, select, textarea") && String(event.target.value).trim()) clearFieldError(event.target);
});
document.addEventListener("change", event => {
  if (event.target.matches("input, select, textarea") && String(event.target.value).trim()) clearFieldError(event.target);
});

// Header and greeting
$("current-date").textContent = today.toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});
const hour = today.getHours();
$("greeting").textContent = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, Soumya`;
$("meal-date").value = todayForInput;
$("history-date").value = todayForInput;
$("weight-date").value = todayForInput;
$("weight-value").value = applicationSettings.currentWeight;

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
  if (id === "weight-dialog") {
    $("weight-date").value = todayForInput;
    const todayRecord = weightHistory.find(record => record.date === todayForInput);
    $("weight-value").value = todayRecord?.weight ?? applicationSettings.currentWeight;
    clearFieldError($("weight-date"));
    clearFieldError($("weight-value"));
  }
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
  clearFieldError($("current-meal-items"));
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
  const invalid = [];
  clearFieldError($("meal-date"));
  clearFieldError($("meal-type"));
  clearFieldError($("current-meal-items"));
  if (!date) {
    setFieldError($("meal-date"), "Meal date is required.");
    invalid.push({ field: $("meal-date"), label: "meal date" });
  }
  if (!mealType) {
    setFieldError($("meal-type"), "Meal type is required.");
    invalid.push({ field: $("meal-type"), label: "meal type" });
  }
  if (!currentMealItems.length) {
    const mealItems = $("current-meal-items");
    mealItems.tabIndex = -1;
    setFieldError(mealItems, "Add at least one meal item.");
    invalid.push({ field: mealItems, label: "meal items" });
  }
  if (invalid.length) {
    showMessage(`Please correct: ${invalid.map(item => item.label).join(", ")}.`);
    focusFirstInvalid(invalid[0].field);
    return;
  }
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
    <button type="button" class="remove-ingredient-button" aria-label="Delete ingredient" title="Delete ingredient">Delete Ingredient</button>
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
  if (calories > 0) clearFieldError(ingredientsContainer);
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
  const invalid = [];
  clearFieldError($("new-recipe-name"));
  clearFieldError($("food-type"));
  clearFieldError($("total-servings"));
  clearFieldError(ingredientsContainer);
  if (!name) {
    setFieldError($("new-recipe-name"), "Recipe name is required.");
    invalid.push({ field: $("new-recipe-name"), label: "recipe name" });
  }
  if (!foodType) {
    setFieldError($("food-type"), "Food type is required.");
    invalid.push({ field: $("food-type"), label: "food type" });
  }
  if (!(nutrition.servings > 0)) {
    setFieldError($("total-servings"), "Enter a valid number of servings.");
    invalid.push({ field: $("total-servings"), label: "valid servings" });
  }
  if (!(nutrition.total > 0)) {
    ingredientsContainer.tabIndex = -1;
    setFieldError(ingredientsContainer, "Add at least one ingredient with calculated calories.");
    invalid.push({ field: ingredientsContainer, label: "calculated ingredients" });
  }
  if (invalid.length) {
    showMessage(`Please correct: ${invalid.map(item => item.label).join(", ")}.`);
    focusFirstInvalid(invalid[0].field);
    return;
  }
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

// Weight tracking
$("save-weight-button").addEventListener("click", () => {
  const date = $("weight-date").value;
  const weight = Number($("weight-value").value);
  const invalid = [];
  clearFieldError($("weight-date"));
  clearFieldError($("weight-value"));
  if (!date) {
    setFieldError($("weight-date"), "Weight date is required.");
    invalid.push({ field: $("weight-date"), label: "weight date" });
  }
  if (!(weight > 0)) {
    setFieldError($("weight-value"), "Enter a valid weight.");
    invalid.push({ field: $("weight-value"), label: "valid weight" });
  }
  if (invalid.length) {
    showMessage(`Please correct: ${invalid.map(item => item.label).join(", ")}.`);
    focusFirstInvalid(invalid[0].field);
    return;
  }

  const existing = weightHistory.find(record => record.date === date);
  if (existing) existing.weight = weight;
  else weightHistory.push({ id: createUniqueId("weight"), date, weight });
  weightHistory.sort((a, b) => a.date.localeCompare(b.date));

  if (date === todayForInput) applicationSettings.currentWeight = weight;
  saveAll();
  populateSettings();
  updateDashboard();
  renderWeeklyProgress();
  closeDialog("weight-dialog");
  showMessage(existing ? "Weight record updated." : "Weight saved.");
});

// Progress charts
function formatShortDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function emptyChart(container, title, message) {
  container.innerHTML = `<div class="chart-empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
}

function renderLineChart({ container, points, referenceValue, referenceLabel, valueLabel, tooltipFormatter, minimumY = null }) {
  if (points.length < 2) {
    emptyChart(container, "Not enough data yet", `Add ${points.length ? "one more record" : "at least two records"} to display this chart.`);
    return;
  }

  const visiblePoints = points.slice(-14);
  const width = 760;
  const height = 300;
  const margin = { top: 28, right: 26, bottom: 52, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = [...visiblePoints.map(point => point.value), referenceValue];
  let low = minimumY === null ? Math.min(...values) : Math.min(minimumY, ...values);
  let high = Math.max(...values);
  const spread = Math.max(high - low, Math.abs(high) * 0.08, 1);
  low = minimumY === null ? Math.max(0, low - spread * 0.18) : minimumY;
  high += spread * 0.18;

  const x = index => margin.left + index * plotWidth / (visiblePoints.length - 1);
  const y = value => margin.top + (high - value) / (high - low) * plotHeight;
  const path = visiblePoints.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
  const referenceY = y(referenceValue);
  const labelEvery = Math.max(1, Math.ceil(visiblePoints.length / 7));
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const gridY = margin.top + plotHeight * fraction;
    const gridValue = high - (high - low) * fraction;
    return `<line class="chart-grid" x1="${margin.left}" y1="${gridY}" x2="${width - margin.right}" y2="${gridY}"></line><text class="chart-axis-label" x="${margin.left - 8}" y="${gridY + 4}" text-anchor="end">${Math.round(gridValue)}</text>`;
  }).join("");
  const dateLabels = visiblePoints.map((point, index) => {
    if (index % labelEvery && index !== visiblePoints.length - 1) return "";
    return `<text class="chart-axis-label" x="${x(index)}" y="${height - 18}" text-anchor="middle">${formatShortDate(point.date)}</text>`;
  }).join("");
  const pointMarkup = visiblePoints.map((point, index) => `
    <g class="chart-interactive" data-index="${index}" tabindex="0" role="button" aria-label="${formatShortDate(point.date)}, ${point.value} ${valueLabel}">
      <circle class="chart-hit-area" cx="${x(index)}" cy="${y(point.value)}" r="16"></circle>
      <circle class="chart-point" cx="${x(index)}" cy="${y(point.value)}" r="5"></circle>
    </g>`).join("");

  container.innerHTML = `<div class="chart-wrap">
    <svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${valueLabel} progress line chart">
      ${gridLines}
      <line class="chart-reference" x1="${margin.left}" y1="${referenceY}" x2="${width - margin.right}" y2="${referenceY}"></line>
      <text class="chart-reference-label" x="${width - margin.right}" y="${Math.max(14, referenceY - 7)}" text-anchor="end">${escapeHtml(referenceLabel)}</text>
      <path class="chart-line" d="${path}"></path>
      ${dateLabels}
      ${pointMarkup}
    </svg>
    <div class="chart-tooltip" role="status">Tap, click, or hover over a point for details.</div>
  </div>`;

  const tooltip = container.querySelector(".chart-tooltip");
  container.querySelectorAll(".chart-interactive").forEach(element => {
    const showDetails = () => {
      const point = visiblePoints[Number(element.dataset.index)];
      tooltip.innerHTML = tooltipFormatter(point);
    };
    element.addEventListener("mouseenter", showDetails);
    element.addEventListener("click", showDetails);
    element.addEventListener("focus", showDetails);
    element.addEventListener("touchstart", showDetails, { passive: true });
  });
}

function renderWeightChart() {
  const points = weightHistory
    .filter(record => record?.date && Number(record.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(record => ({ date: record.date, value: Number(record.weight) }));
  const goal = Number(applicationSettings.goalWeight);
  renderLineChart({
    container: $("weight-chart-container"),
    points,
    referenceValue: goal,
    referenceLabel: `Goal ${goal} lb`,
    valueLabel: "lb",
    tooltipFormatter: point => {
      const difference = point.value - goal;
      const comparison = difference === 0 ? "At goal" : `${Math.abs(difference).toFixed(1)} lb ${difference > 0 ? "above" : "below"} goal`;
      return `<strong>${formatDisplayDate(point.date)}</strong>${point.value.toFixed(1)} lb · ${comparison}`;
    }
  });
}

function renderCalorieChart() {
  const totals = savedMeals.reduce((byDate, meal) => {
    if (meal?.date) byDate[meal.date] = (byDate[meal.date] || 0) + Number(meal.totalCalories || 0);
    return byDate;
  }, {});
  const points = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  const target = Number(applicationSettings.dailyCalorieTarget);
  renderLineChart({
    container: $("calorie-chart-container"),
    points,
    referenceValue: target,
    referenceLabel: `Target ${target.toLocaleString("en-US")} kcal`,
    valueLabel: "kcal",
    minimumY: 0,
    tooltipFormatter: point => {
      const difference = point.value - target;
      const comparison = difference === 0 ? "At target" : `${Math.abs(Math.round(difference)).toLocaleString("en-US")} kcal ${difference > 0 ? "above" : "below"} target`;
      return `<strong>${formatDisplayDate(point.date)}</strong>${Math.round(point.value).toLocaleString("en-US")} kcal consumed · Target ${target.toLocaleString("en-US")} kcal · ${comparison}`;
    }
  });
}

function renderWeeklyProgress() {
  renderWeightChart();
  renderCalorieChart();
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
