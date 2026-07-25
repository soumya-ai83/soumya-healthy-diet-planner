/*
Soumya Healthy Diet Planner
Release 1.0 Final RC
Project Codename: Project Jatibaba
*/

const SCHEMA_VERSION = 1;
const STORAGE = {
  meals: "soumyaHealthyDietMeals",
  recipes: "soumyaHealthyDietRecipes",
  settings: "soumyaHealthyDietSettings",
  weightHistory: "soumyaHealthyDietWeightHistory",
  metadata: "soumyaHealthyDietMetadata"
};

const defaultSettings = {
  dailyCalorieTarget: 1900,
  currentWeight: 188,
  goalWeight: 170,
  weightUnit: "lb"
};

let applicationSettings = normalizeSettings(loadJson(STORAGE.settings, defaultSettings));
let savedMeals = normalizeMealCollection(loadJson(STORAGE.meals, []));
const starterRecipeMerge = mergeMissingStarterRecipes(loadJson(STORAGE.recipes, recipeDatabase));
let savedRecipes = starterRecipeMerge.recipes;
if (starterRecipeMerge.changed || !localStorage.getItem(STORAGE.recipes)) localStorage.setItem(STORAGE.recipes, JSON.stringify(savedRecipes));
let weightHistory = normalizeWeightCollection(loadJson(STORAGE.weightHistory, []));
let applicationMetadata = normalizeMetadata(loadJson(STORAGE.metadata, {}));
let currentMealItems = [];
let ingredientRowCounter = 0;
let toastTimer;
let editingRecipeId = null;
let selectedRecipeDetailsId = null;
let editingMealId = null;
let editingMealItemId = null;
let isSavingMeal = false;
let isSavingRecipe = false;
let isSavingWeight = false;
let isImportingData = false;

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
  if (Number.isNaN(date.getTime())) return dateString || "Date not available";
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

function normalizeRecipeRecord(recipe, index = 0) {
  const normalized = recipe && typeof recipe === "object" ? { ...recipe } : {};
  return {
    ...normalized,
    id: normalized.id || `R-legacy-${index + 1}`,
    name: String(normalized.name || "Untitled Recipe").trim(),
    foodType: String(normalized.foodType || "Unspecified").trim(),
    category: String(normalized.category || "Uncategorized").trim(),
    totalServings: Number(normalized.totalServings) > 0 ? Number(normalized.totalServings) : 1,
    totalCalories: Number(normalized.totalCalories) || 0,
    caloriesPerServing: Number(normalized.caloriesPerServing) || 0,
    totalProtein: Number(normalized.totalProtein) || 0,
    proteinPerServing: Number(normalized.proteinPerServing) || 0,
    ingredients: Array.isArray(normalized.ingredients)
      ? normalized.ingredients.map(ingredient => ({
          name: String(ingredient?.name || "Unnamed ingredient").trim(),
          quantity: Number(ingredient?.quantity) || 0,
          unit: String(ingredient?.unit || "").trim(),
          calories: Number(ingredient?.calories) || 0
        }))
      : null
  };
}

function normalizeRecipeCollection(recipes) {
  return (Array.isArray(recipes) ? recipes : recipeDatabase).map(normalizeRecipeRecord);
}

function isUntouchedLegacyVegetableSantula(recipe) {
  return recipe?.id === "R001"
    && String(recipe.name).trim().toLowerCase() === "vegetable santula"
    && Number(recipe.totalCalories) === 509
    && Number(recipe.caloriesPerServing) === 255
    && !recipe.updatedAt
    && !Array.isArray(recipe.ingredients);
}

function mergeMissingStarterRecipes(storedRecipes) {
  const existing = normalizeRecipeCollection(storedRecipes);
  const merged = [...existing];
  let changed = false;

  recipeDatabase.forEach(starter => {
    const stableIdIndex = merged.findIndex(recipe => recipe.id === starter.id);
    if (stableIdIndex >= 0) return;

    const sameNameIndex = merged.findIndex(recipe => String(recipe.name).trim().replace(/\s+/g, " ").toLowerCase()
      === String(starter.name).trim().replace(/\s+/g, " ").toLowerCase());
    if (sameNameIndex >= 0) {
      if (starter.id === "SR1017" && isUntouchedLegacyVegetableSantula(merged[sameNameIndex])) {
        merged[sameNameIndex] = normalizeRecipeRecord(starter, sameNameIndex);
        changed = true;
      }
      return;
    }

    merged.push(normalizeRecipeRecord(starter, merged.length));
    changed = true;
  });

  return { recipes: merged, changed };
}

function normalizeMealItem(item, index = 0) {
  const normalized = item && typeof item === "object" ? { ...item } : {};
  return {
    ...normalized,
    id: normalized.id || `mealitem-legacy-${index + 1}`,
    source: String(normalized.source || "Saved").trim(),
    name: String(normalized.name || "Saved meal item").trim(),
    details: String(normalized.details || "Details not available").trim(),
    calories: Math.max(0, Number(normalized.calories) || 0)
  };
}

function normalizeMealRecord(meal, index = 0) {
  const normalized = meal && typeof meal === "object" ? { ...meal } : {};
  const items = Array.isArray(normalized.items) ? normalized.items.map(normalizeMealItem) : [];
  const itemTotal = items.reduce((sum, item) => sum + item.calories, 0);
  return {
    ...normalized,
    id: normalized.id || `meal-legacy-${index + 1}`,
    date: String(normalized.date || "").trim(),
    mealType: String(normalized.mealType || "Meal").trim(),
    items,
    totalCalories: Number.isFinite(Number(normalized.totalCalories)) ? Math.max(0, Number(normalized.totalCalories)) : itemTotal
  };
}

function normalizeMealCollection(meals) {
  return (Array.isArray(meals) ? meals : []).map(normalizeMealRecord);
}

function normalizeWeightCollection(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record && typeof record === "object" && record.date && Number(record.weight) > 0)
    .map((record, index) => ({ ...record, id: record.id || `weight-legacy-${index + 1}`, date: String(record.date), weight: Number(record.weight) }));
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    ...defaultSettings,
    ...source,
    dailyCalorieTarget: Number(source.dailyCalorieTarget) > 0 ? Number(source.dailyCalorieTarget) : defaultSettings.dailyCalorieTarget,
    currentWeight: Number(source.currentWeight) > 0 ? Number(source.currentWeight) : defaultSettings.currentWeight,
    goalWeight: Number(source.goalWeight) > 0 ? Number(source.goalWeight) : defaultSettings.goalWeight,
    weightUnit: String(source.weightUnit || defaultSettings.weightUnit)
  };
}

function normalizeMetadata(metadata) {
  return { ...(metadata && typeof metadata === "object" ? metadata : {}), schemaVersion: SCHEMA_VERSION };
}

function saveAll() {
  applicationMetadata = { ...applicationMetadata, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE.meals, JSON.stringify(savedMeals));
  localStorage.setItem(STORAGE.recipes, JSON.stringify(savedRecipes));
  localStorage.setItem(STORAGE.settings, JSON.stringify(applicationSettings));
  localStorage.setItem(STORAGE.weightHistory, JSON.stringify(weightHistory));
  localStorage.setItem(STORAGE.metadata, JSON.stringify(applicationMetadata));
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
    if (entryType !== "edit") prepareNewMeal();
    $("meal-date").value ||= todayForInput;
    loadRecipeOptions();
    if (entryType && entryType !== "edit") selectEntryType(entryType);
  }
  if (id === "recipe-dialog") {
    if (entryType !== "edit") prepareNewRecipe();
    if ($("ingredients-container").children.length === 0) createIngredientRow();
  }
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
  const wasEditing = Boolean(editingMealItemId);
  if (editingMealItemId) {
    const index = currentMealItems.findIndex(existing => existing.id === editingMealItemId);
    if (index >= 0) currentMealItems[index] = { ...item, id: editingMealItemId };
    editingMealItemId = null;
    $("add-custom-item-button").textContent = "Add to Meal";
  } else {
    currentMealItems.push(item);
  }
  clearFieldError($("current-meal-items"));
  renderCurrentMeal();
  showMessage(`${item.name} ${wasEditing ? "updated" : "added to the current meal"}.`);
}

function renderCurrentMeal() {
  const container = $("current-meal-items");
  if (!currentMealItems.length) {
    container.innerHTML = '<div class="empty-state"><span>➕</span><h4>No items added</h4><p>Add a recipe, manual food or Jatibaba estimate.</p></div>';
  } else {
    container.innerHTML = currentMealItems.map(item => `
      <div class="meal-item-row">
        <div class="meal-item-information"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.details)}</span><small class="source-label">${escapeHtml(item.source)}</small></div>
        <div class="meal-item-actions"><strong>${formatCalories(item.calories)}</strong><div class="compact-action-group"><button class="secondary-button compact-button" data-edit-meal-item="${item.id}">Edit</button><button class="remove-item-button compact-button" data-remove-item="${item.id}">Remove</button></div></div>
      </div>`).join("");
    $all("[data-edit-meal-item]").forEach(button => button.addEventListener("click", () => editCurrentMealItem(button.dataset.editMealItem)));
    $all("[data-remove-item]").forEach(button => button.addEventListener("click", () => {
      currentMealItems = currentMealItems.filter(item => item.id !== button.dataset.removeItem);
      if (editingMealItemId === button.dataset.removeItem) clearCustomEntry();
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
  const details = $("custom-food-details").value.trim() || "Custom food";
  if (!name) return showMessage("Please enter the food name.");
  if (!(calories > 0)) return showMessage("Please enter valid calories.");
  const original = currentMealItems.find(item => item.id === editingMealItemId);
  addItemToCurrentMeal({ id: createUniqueId("mealitem"), source: original?.source || "Manual", name, details, calories: Math.round(calories) });
  clearCustomEntry();
});

$("add-jatibaba-item-button").addEventListener("click", () => {
  const calories = Number($("jatibaba-calories").value);
  const description = $("jatibaba-description").value.trim() || "Complete meal estimate";
  if (!(calories > 0)) return showMessage("Please enter Jatibaba's estimated calories.");
  addItemToCurrentMeal({ id: createUniqueId("mealitem"), source: "Estimated", name: "Jatibaba Estimate", details: description, calories: Math.round(calories) });
  clearJatibabaEntry();
});

function clearCustomEntry() {
  $("custom-food-name").value = "";
  $("custom-food-calories").value = "";
  $("custom-food-details").value = "";
  editingMealItemId = null;
  $("add-custom-item-button").textContent = "Add to Meal";
}

function editCurrentMealItem(itemId) {
  const item = currentMealItems.find(current => current.id === itemId);
  if (!item) return;
  editingMealItemId = item.id;
  $("custom-food-name").value = item.name;
  $("custom-food-calories").value = item.calories;
  $("custom-food-details").value = item.details;
  $("add-custom-item-button").textContent = "Update Item";
  selectEntryType("custom");
  $("custom-food-name").focus();
}
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
  const action = editingMealId ? "Discard these meal changes?" : "Discard the current unsaved meal?";
  if (currentMealItems.length && !confirm(action)) return;
  prepareNewMeal();
  closeDialog("meal-dialog");
});

$("save-meal-button").addEventListener("click", () => {
  if (isSavingMeal) return;
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
  isSavingMeal = true;
  try {
    const mealData = {
      date, mealType, items: structuredCloneSafe(currentMealItems),
      totalCalories: calculateCurrentMealTotal(), updatedAt: new Date().toISOString()
    };
    const existing = editingMealId ? savedMeals.find(meal => meal.id === editingMealId) : null;
    if (existing) Object.assign(existing, mealData);
    else savedMeals.push({ id: createUniqueId("meal"), ...mealData, savedAt: new Date().toISOString() });
    const message = existing ? `${mealType} updated successfully.` : `${mealType} saved successfully.`;
    saveAll();
    refreshApplicationUI();
    prepareNewMeal();
    closeDialog("meal-dialog");
    showMessage(message);
  } finally {
    isSavingMeal = false;
  }
});

function prepareNewMeal() {
  editingMealId = null;
  editingMealItemId = null;
  currentMealItems = [];
  $("meal-dialog-title").textContent = "Add Meal";
  $("meal-dialog-description").textContent = "Everything you need without leaving Home.";
  $("save-meal-button").textContent = "Save Meal";
  $("meal-date").value = todayForInput;
  $("meal-type").value = "";
  $("recipe-selection").value = "";
  $("serving-amount").value = 1;
  clearCustomEntry();
  clearJatibabaEntry();
  selectEntryType("recipe");
  renderCurrentMeal();
  [$("meal-date"), $("meal-type"), $("current-meal-items")].forEach(clearFieldError);
}

function editMeal(mealId) {
  const meal = savedMeals.find(item => item.id === mealId);
  if (!meal) return showMessage("The selected meal could not be found.");
  editingMealId = meal.id;
  editingMealItemId = null;
  currentMealItems = structuredCloneSafe(meal.items || []).map(normalizeMealItem);
  $("meal-dialog-title").textContent = `Edit ${meal.mealType}`;
  $("meal-dialog-description").textContent = "Update this saved meal without changing its meal ID.";
  $("save-meal-button").textContent = "Save Meal Changes";
  $("meal-date").value = meal.date;
  $("meal-type").value = meal.mealType;
  clearCustomEntry();
  clearJatibabaEntry();
  selectEntryType("recipe");
  renderCurrentMeal();
  openDialog("meal-dialog", "edit");
}

function deleteMeal(mealId) {
  const meal = savedMeals.find(item => item.id === mealId);
  if (!meal) return;
  const dateLabel = meal.date ? formatDisplayDate(meal.date) : "its saved date";
  if (!confirm(`Delete ${meal.mealType} from ${dateLabel}? This cannot be undone.`)) return;
  savedMeals = savedMeals.filter(item => item.id !== meal.id);
  saveAll();
  refreshApplicationUI();
  showMessage(`${meal.mealType} deleted.`);
}

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
  const summary = $("dashboard-meal-type-summary");
  if (!meals.length) {
    summary.innerHTML = "";
    container.innerHTML = '<div class="empty-state"><span>🍽️</span><h4>No meals recorded today</h4><p>Tap Add Meal to begin tracking.</p></div>';
    return;
  }
  const byType = meals.reduce((groups, meal) => {
    groups[meal.mealType] = (groups[meal.mealType] || 0) + Number(meal.totalCalories || 0);
    return groups;
  }, {});
  summary.innerHTML = Object.entries(byType).map(([type, calories]) => `<span><strong>${escapeHtml(type)}</strong> ${formatCalories(calories)}</span>`).join("");
  container.innerHTML = meals.map(meal => `
    <div class="dashboard-meal-card">
      <div class="dashboard-meal-heading"><div><h4>${escapeHtml(meal.mealType)}</h4><small>${formatDisplayDate(meal.date)}</small></div><strong>${formatCalories(meal.totalCalories)}</strong></div>
      <ul class="dashboard-meal-items">${meal.items.length ? meal.items.map(item => `<li><span>${escapeHtml(item.name)}</span><strong>${formatCalories(item.calories)}</strong></li>`).join("") : '<li><span>Item details are not available for this older meal.</span></li>'}</ul>
      <div class="meal-card-actions"><button class="secondary-button compact-button" data-edit-meal="${meal.id}">Edit</button><button class="delete-button compact-button" data-delete-meal="${meal.id}">Delete</button></div>
    </div>`).join("");
  bindMealActions(container);
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
      <ul class="history-meal-items">${meal.items.length ? meal.items.map(item => `<li><div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.details)}</small></div><strong>${formatCalories(item.calories)}</strong></li>`).join("") : '<li><span>Item details are not available for this older meal.</span></li>'}</ul>
      <div class="meal-card-actions"><button class="secondary-button compact-button" data-edit-meal="${meal.id}">Edit Meal</button><button class="delete-button compact-button" data-delete-meal="${meal.id}">Delete Meal</button></div>
    </article>`).join("");
  bindMealActions(container);
}

function bindMealActions(container) {
  container.querySelectorAll("[data-edit-meal]").forEach(button => button.addEventListener("click", () => editMeal(button.dataset.editMeal)));
  container.querySelectorAll("[data-delete-meal]").forEach(button => button.addEventListener("click", () => deleteMeal(button.dataset.deleteMeal)));
}

// Recipe Builder
const ingredientsContainer = $("ingredients-container");
function normalize(value) { return String(value || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function findIngredient(name) {
  const query = normalize(name);
  return ingredientDatabase.find(item => normalize(item.name) === query || (item.aliases || []).some(alias => normalize(alias) === query));
}

function populateIngredientOptions() {
  const uniqueNames = new Map();
  ingredientDatabase.forEach(item => {
    [item.name, ...(item.aliases || [])].forEach(name => {
      const cleaned = String(name || "").trim().replace(/\s+/g, " ");
      const key = normalize(cleaned);
      if (key && !uniqueNames.has(key)) uniqueNames.set(key, cleaned);
    });
  });
  $("ingredient-options").innerHTML = [...uniqueNames.values()]
    .sort((a, b) => a.localeCompare(b))
    .map(name => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
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
  if (seed.calories > 0 && !findIngredient(seed.name)) {
    row.querySelector(".manual-calories").value = seed.calories;
    row.querySelector(".manual-amount").value = seed.quantity || 1;
    row.querySelector(".manual-unit").value = seed.unit || "g";
  }
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
    const convertedQuantity = convertCompatibleUnit(quantity, unit, known.referenceUnit);
    if (convertedQuantity !== null && quantity > 0) calories = convertedQuantity / known.referenceAmount * known.referenceCalories;
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

function convertCompatibleUnit(quantity, fromUnit, toUnit) {
  if (fromUnit === toUnit) return quantity;
  if (fromUnit === "tsp" && toUnit === "tbsp") return quantity / 3;
  if (fromUnit === "tbsp" && toUnit === "tsp") return quantity * 3;
  return null;
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

function prepareNewRecipe() {
  editingRecipeId = null;
  $("recipe-dialog-title").textContent = "Create New Recipe";
  $("recipe-dialog-description").textContent = "Build a measured recipe with automatic ingredient calculations.";
  $("save-new-recipe-button").textContent = "Add to Master Database";
  resetNewRecipeForm();
}

function editRecipe(recipeId) {
  const recipe = savedRecipes.find(item => item.id === recipeId);
  if (!recipe) return showMessage("The selected recipe could not be found.");
  editingRecipeId = recipe.id;
  $("recipe-dialog-title").textContent = `Edit ${recipe.name}`;
  $("recipe-dialog-description").textContent = "Update this recipe while keeping its existing recipe ID.";
  $("save-new-recipe-button").textContent = "Save Recipe Changes";
  $("new-recipe-name").value = recipe.name;
  $("food-type").value = recipe.foodType;
  if (!$("food-type").value) {
    const option = document.createElement("option");
    option.value = recipe.foodType;
    option.textContent = recipe.foodType;
    $("food-type").appendChild(option);
    $("food-type").value = recipe.foodType;
  }
  $("recipe-category").value = recipe.category;
  $("total-servings").value = recipe.totalServings;
  ingredientsContainer.innerHTML = "";
  ingredientRowCounter = 0;
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) recipe.ingredients.forEach(createIngredientRow);
  else createIngredientRow();
  calculateRecipeNutrition();
  closeDialog("recipe-details-dialog");
  openDialog("recipe-dialog", "edit");
}

$("ignore-new-recipe-button").addEventListener("click", () => {
  const hasData = $("new-recipe-name").value.trim() || calculateRecipeNutrition().total > 0;
  const action = editingRecipeId ? "Discard these recipe changes?" : "Ignore this recipe and clear the entered information?";
  if (hasData && !confirm(action)) return;
  prepareNewRecipe(); closeDialog("recipe-dialog");
});

$("save-new-recipe-button").addEventListener("click", () => {
  if (isSavingRecipe) return;
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
  if (savedRecipes.some(recipe => recipe.id !== editingRecipeId && normalize(recipe.name) === normalize(name))) return showMessage("A recipe with this name already exists.");
  isSavingRecipe = true;
  try {
    const ingredients = $all(".ingredient-entry-row").map(row => ({
      name: row.querySelector(".ingredient-name-input").value.trim(),
      quantity: Number(row.querySelector(".ingredient-quantity-input").value),
      unit: row.querySelector(".ingredient-unit-input").value,
      calories: Number(row.querySelector(".ingredient-total-input").value)
    })).filter(item => item.name && item.quantity > 0);
    const recipeData = {
      name, foodType, category: category || "Uncategorized", ingredients,
      totalServings: nutrition.servings,
      totalCalories: Math.round(nutrition.total),
      caloriesPerServing: Math.round(nutrition.perServing)
    };
    const editedRecipe = editingRecipeId ? savedRecipes.find(recipe => recipe.id === editingRecipeId) : null;
    if (editedRecipe) {
      Object.assign(editedRecipe, recipeData, { updatedAt: new Date().toISOString() });
    } else {
      savedRecipes.push({
        id: `R${String(savedRecipes.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`,
        ...recipeData,
        createdAt: new Date().toISOString()
      });
    }
    const successMessage = editedRecipe ? `${name} updated successfully.` : `${name} added to the Recipe Master Database.`;
    saveAll();
    loadRecipeOptions();
    populateRecipeFilters();
    renderRecipeHandbook();
    prepareNewRecipe();
    closeDialog("recipe-dialog");
    showMessage(successMessage);
  } finally {
    isSavingRecipe = false;
  }
});

// Recipe handbook
const RECIPES_PER_PAGE = 10;
let recipeHandbookPage = 1;

["recipe-search", "recipe-food-type-filter", "recipe-category-filter", "recipe-sort"].forEach(id => {
  $(id).addEventListener(id === "recipe-search" ? "input" : "change", () => {
    recipeHandbookPage = 1;
    renderRecipeHandbook();
  });
});

function populateRecipeFilters() {
  const foodTypeSelect = $("recipe-food-type-filter");
  const categorySelect = $("recipe-category-filter");
  const selectedFoodType = foodTypeSelect.value;
  const selectedCategory = categorySelect.value;
  const foodTypes = [...new Set(savedRecipes.map(recipe => recipe.foodType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set(savedRecipes.map(recipe => recipe.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  foodTypeSelect.innerHTML = '<option value="">All food types</option>' + foodTypes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  categorySelect.innerHTML = '<option value="">All categories</option>' + categories.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (foodTypes.includes(selectedFoodType)) foodTypeSelect.value = selectedFoodType;
  if (categories.includes(selectedCategory)) categorySelect.value = selectedCategory;
}

function renderRecipeHandbook() {
  $("recipe-saved-count").textContent = `${savedRecipes.length} recipe${savedRecipes.length === 1 ? "" : "s"} saved`;
  const query = normalize($("recipe-search").value);
  const foodType = normalize($("recipe-food-type-filter").value);
  const category = normalize($("recipe-category-filter").value);
  const sortMode = $("recipe-sort").value;
  const recipes = savedRecipes.filter(recipe =>
    (!query || normalize(recipe.name).includes(query)) &&
    (!foodType || normalize(recipe.foodType) === foodType) &&
    (!category || normalize(recipe.category) === category)
  );
  recipes.sort((a, b) => {
    if (sortMode === "name-desc") return b.name.localeCompare(a.name);
    if (sortMode === "calories-asc") return Number(a.caloriesPerServing) - Number(b.caloriesPerServing) || a.name.localeCompare(b.name);
    if (sortMode === "calories-desc") return Number(b.caloriesPerServing) - Number(a.caloriesPerServing) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  const container = $("recipe-handbook-container");
  if (!savedRecipes.length) {
    container.innerHTML = '<div class="empty-state recipe-empty-state"><span>📖</span><h4>No recipes saved yet.</h4><button class="primary-button" data-empty-new-recipe>+ New Recipe</button></div>';
    container.querySelector("[data-empty-new-recipe]").addEventListener("click", () => openDialog("recipe-dialog"));
    return;
  }
  if (!recipes.length) {
    container.innerHTML = '<div class="empty-state recipe-empty-state"><span>🔎</span><h4>No recipes match your search or filters.</h4><button class="secondary-button" data-clear-recipe-filters>Clear Filters</button></div>';
    container.querySelector("[data-clear-recipe-filters]").addEventListener("click", clearRecipeFilters);
    return;
  }
  const totalPages = Math.ceil(recipes.length / RECIPES_PER_PAGE);
  recipeHandbookPage = Math.min(Math.max(recipeHandbookPage, 1), totalPages);
  const startIndex = (recipeHandbookPage - 1) * RECIPES_PER_PAGE;
  const pageRecipes = recipes.slice(startIndex, startIndex + RECIPES_PER_PAGE);
  const startNumber = startIndex + 1;
  const endNumber = startIndex + pageRecipes.length;

  container.innerHTML = `
    <div class="recipe-list-summary"><p class="recipe-result-count">Showing ${startNumber}–${endNumber} of ${recipes.length} recipes</p></div>
    <div class="recipe-list" role="table" aria-label="Saved recipes">
      <div class="recipe-list-header" role="row">
        <span role="columnheader">Recipe</span><span role="columnheader">Category</span><span role="columnheader">Food Type</span><span role="columnheader">Calories / Serving</span><span role="columnheader">Servings</span><span role="columnheader">Action</span>
      </div>
      ${pageRecipes.map(recipe => `
        <div class="recipe-list-row" role="row">
          <div class="recipe-list-name" role="cell"><strong>${escapeHtml(recipe.name)}</strong><span class="recipe-mobile-meta">${escapeHtml(recipe.category || "Uncategorized")} • ${escapeHtml(recipe.foodType || "Unspecified")}</span></div>
          <span class="recipe-list-category" role="cell">${escapeHtml(recipe.category || "Uncategorized")}</span>
          <span class="recipe-list-food-type" role="cell">${escapeHtml(recipe.foodType || "Unspecified")}</span>
          <strong class="recipe-list-calories" role="cell">${formatCalories(recipe.caloriesPerServing)}<span> / serving</span></strong>
          <span class="recipe-list-servings" role="cell">${recipe.totalServings}</span>
          <div class="recipe-list-action" role="cell"><button class="recipe-view-button" data-view-recipe="${recipe.id}">View <span aria-hidden="true">›</span></button></div>
        </div>`).join("")}
    </div>
    <nav class="recipe-pagination" aria-label="Recipe pages">
      <button class="secondary-button compact-button" data-recipe-page="previous" ${recipeHandbookPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${recipeHandbookPage} of ${totalPages}</span>
      <button class="secondary-button compact-button" data-recipe-page="next" ${recipeHandbookPage === totalPages ? "disabled" : ""}>Next</button>
    </nav>`;

  container.querySelectorAll("[data-view-recipe]").forEach(button => button.addEventListener("click", () => showRecipeDetails(button.dataset.viewRecipe)));
  container.querySelectorAll("[data-recipe-page]").forEach(button => button.addEventListener("click", () => {
    recipeHandbookPage += button.dataset.recipePage === "next" ? 1 : -1;
    renderRecipeHandbook();
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function clearRecipeFilters() {
  $("recipe-search").value = "";
  $("recipe-food-type-filter").value = "";
  $("recipe-category-filter").value = "";
  $("recipe-sort").value = "name-asc";
  recipeHandbookPage = 1;
  renderRecipeHandbook();
}

function openMealFromRecipe(recipeId) {
  const recipe = savedRecipes.find(item => item.id === recipeId);
  if (!recipe) return showMessage("The selected recipe could not be found.");
  closeDialog("recipe-details-dialog");
  openDialog("meal-dialog", "recipe");
  $("recipe-selection").value = recipe.id;
}

function deleteRecipe(recipeId) {
  const recipe = savedRecipes.find(item => item.id === recipeId);
  if (!recipe || !confirm(`Delete "${recipe.name}" from the Recipe Handbook? Historical meals already logged with this recipe will not be changed.`)) return;
  savedRecipes = savedRecipes.filter(item => item.id !== recipe.id);
  selectedRecipeDetailsId = null;
  saveAll();
  closeDialog("recipe-details-dialog");
  loadRecipeOptions();
  populateRecipeFilters();
  renderRecipeHandbook();
  showMessage(`${recipe.name} deleted. Historical meals were preserved.`);
}

function showRecipeDetails(recipeId) {
  const recipe = savedRecipes.find(item => item.id === recipeId);
  if (!recipe) return showMessage("The selected recipe could not be found.");
  selectedRecipeDetailsId = recipe.id;
  $("recipe-details-title").textContent = recipe.name;
  const ingredientsMarkup = Array.isArray(recipe.ingredients) && recipe.ingredients.length
    ? `<ul class="recipe-detail-ingredients">${recipe.ingredients.map(ingredient => `
        <li class="recipe-detail-ingredient"><strong>${escapeHtml(ingredient.name)}</strong><span>${Number(ingredient.quantity).toLocaleString("en-US")} ${escapeHtml(ingredient.unit || "")}</span><span>${formatCalories(ingredient.calories)}</span></li>`).join("")}</ul>`
    : '<div class="older-recipe-message">Ingredient details are not available for this older recipe.</div>';
  $("recipe-details-content").innerHTML = `
    <div class="recipe-details-summary">
      <div class="recipe-detail-stat"><span>Food Type</span><strong>${escapeHtml(recipe.foodType)}</strong></div>
      <div class="recipe-detail-stat"><span>Category</span><strong>${escapeHtml(recipe.category)}</strong></div>
      <div class="recipe-detail-stat"><span>Calories per Serving</span><strong>${formatCalories(recipe.caloriesPerServing)}</strong></div>
      <div class="recipe-detail-stat"><span>Total Calories</span><strong>${formatCalories(recipe.totalCalories)}</strong></div>
      <div class="recipe-detail-stat"><span>Total Servings</span><strong>${recipe.totalServings}</strong></div>
    </div>
    <section class="recipe-details-section"><h3>Ingredients</h3>${ingredientsMarkup}</section>`;
  openDialog("recipe-details-dialog");
}

$("edit-recipe-from-details-button").addEventListener("click", () => {
  if (selectedRecipeDetailsId) editRecipe(selectedRecipeDetailsId);
});
$("add-meal-from-details-button").addEventListener("click", () => {
  if (selectedRecipeDetailsId) openMealFromRecipe(selectedRecipeDetailsId);
});
$("delete-recipe-from-details-button").addEventListener("click", () => {
  if (selectedRecipeDetailsId) deleteRecipe(selectedRecipeDetailsId);
});

// Weight tracking
$("save-weight-button").addEventListener("click", () => {
  if (isSavingWeight) return;
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

  isSavingWeight = true;
  try {
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
  } finally {
    isSavingWeight = false;
  }
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

function refreshApplicationUI() {
  populateSettings();
  loadRecipeOptions();
  populateRecipeFilters();
  updateDashboard();
  renderMealHistory();
  renderRecipeHandbook();
  renderWeeklyProgress();
}

function buildBackupData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    application: "Soumya Healthy Diet Planner",
    meals: structuredCloneSafe(savedMeals),
    recipes: structuredCloneSafe(savedRecipes),
    settings: structuredCloneSafe(applicationSettings),
    weightHistory: structuredCloneSafe(weightHistory)
  };
}

function getBackupFilename() {
  return `soumya-healthy-diet-planner-backup-${getLocalDateString(new Date())}.json`;
}

$("export-data-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(buildBackupData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getBackupFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showMessage("Backup exported successfully.");
});

function prepareImportedData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The selected file is not a valid backup object.");
  const version = Number(data.schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) throw new Error("This backup uses an unsupported schema version.");
  if (!Array.isArray(data.meals)) throw new Error("The backup does not contain a valid meals list.");
  if (!Array.isArray(data.recipes)) throw new Error("The backup does not contain a valid recipes list.");
  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) throw new Error("The backup does not contain valid settings.");
  if (!Array.isArray(data.weightHistory)) throw new Error("The backup does not contain a valid weight-history list.");
  return {
    meals: normalizeMealCollection(data.meals),
    recipes: mergeMissingStarterRecipes(data.recipes).recipes,
    settings: normalizeSettings(data.settings),
    weightHistory: normalizeWeightCollection(data.weightHistory),
    metadata: normalizeMetadata({ schemaVersion: version, importedAt: new Date().toISOString() })
  };
}

$("import-data-input").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file || isImportingData) return;
  isImportingData = true;
  try {
    const data = JSON.parse(await file.text());
    const prepared = prepareImportedData(data);
    const summary = [
      `${prepared.meals.length} meal${prepared.meals.length === 1 ? "" : "s"}`,
      `${prepared.recipes.length} recipe${prepared.recipes.length === 1 ? "" : "s"}`,
      `${prepared.weightHistory.length} weight record${prepared.weightHistory.length === 1 ? "" : "s"}`
    ].join(", ");
    if (!confirm(`Import this backup containing ${summary}? This will replace the app data currently stored on this device.`)) return;
    savedMeals = prepared.meals;
    savedRecipes = prepared.recipes;
    applicationSettings = prepared.settings;
    weightHistory = prepared.weightHistory;
    applicationMetadata = prepared.metadata;
    saveAll();
    refreshApplicationUI();
    showMessage("Backup imported successfully.");
  } catch (error) {
    console.error("Unable to import backup", error);
    showMessage(`Import failed: ${error.message || "invalid backup file"}`);
  } finally {
    isImportingData = false;
    event.target.value = "";
  }
});

$("reset-data-button").addEventListener("click", () => {
  if (!confirm("Reset all application data? Meals and weight history will be cleared, recipes will return to the starter set, and settings will return to defaults.")) return;
  if (prompt('Type RESET to confirm. This action cannot be undone.') !== "RESET") {
    showMessage("Reset cancelled. Type RESET exactly to confirm.");
    return;
  }
  savedMeals = [];
  savedRecipes = normalizeRecipeCollection(structuredCloneSafe(recipeDatabase));
  applicationSettings = normalizeSettings(defaultSettings);
  weightHistory = [];
  applicationMetadata = normalizeMetadata({ resetAt: new Date().toISOString() });
  prepareNewMeal();
  prepareNewRecipe();
  saveAll();
  refreshApplicationUI();
  showMessage("Application data reset to starter defaults.");
});

// Initial application start
populateIngredientOptions();
populateSettings();
createIngredientRow();
loadRecipeOptions();
renderCurrentMeal();
updateDashboard();
renderMealHistory();
populateRecipeFilters();
renderRecipeHandbook();
renderWeeklyProgress();
