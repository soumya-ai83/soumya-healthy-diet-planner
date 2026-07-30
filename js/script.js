/*
Soumya Healthy Diet Planner
Release 1.0 Final RC
Project Codename: Project JatiaBaba
*/

const SCHEMA_VERSION = window.SHDPStorage?.TARGET_SCHEMA_VERSION || 2;
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
const ingredientStore = window.SHDPIngredients?.initialize(localStorage, ingredientDatabase);
const activeIngredientDatabase = ingredientStore?.ingredients || ingredientDatabase;
let currentMealItems = [];
let ingredientRowCounter = 0;
let toastTimer;
let editingRecipeId = null;
let editingIngredientId = null;
let selectedRecipeDetailsId = null;
let editingMealId = null;
let editingMealItemId = null;
let isSavingMeal = false;
let isSavingRecipe = false;
let isSavingIngredient = false;
let isSavingWeight = false;
let isImportingData = false;
let sharedSyncManager = null;

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
  const numericValue = Number(value) || 0;
  return `${numericValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} kcal`;
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

function getRecipeCategoryValue(recipe) {
  if (!recipe || typeof recipe !== "object") return "";
  const candidates = [
    recipe.category,
    recipe.Category,
    recipe.recipeCategory,
    recipe["Recipe Category"],
    recipe.foodCategory,
    recipe.type
  ];
  for (const candidate of candidates) {
    const value = candidate && typeof candidate === "object"
      ? candidate.name ?? candidate.label ?? candidate.value
      : candidate;
    if (String(value ?? "").trim()) return value;
  }
  return "";
}

function normalizeCategoryLabel(value) {
  const label = String(value ?? "").trim().replace(/\s+/g, " ");
  return label || "Uncategorized";
}

function normalizeCategoryKey(value) {
  const label = String(value ?? "").trim().replace(/\s+/g, " ");
  return label ? normalize(label) : "";
}

function collectRecipeCategories(recipes) {
  const categoriesByKey = new Map();

  (Array.isArray(recipes) ? recipes : []).forEach(recipe => {
    const label = normalizeCategoryLabel(getRecipeCategoryValue(recipe));
    const key = normalizeCategoryKey(label);
    if (!categoriesByKey.has(key)) categoriesByKey.set(key, label);
  });

  return Array.from(categoriesByKey, ([key, label]) => ({ key, label })).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

function normalizeRecipeRecord(recipe, index = 0) {
  const normalized = recipe && typeof recipe === "object" ? { ...recipe } : {};
  return {
    ...normalized,
    id: normalized.id || `R-legacy-${index + 1}`,
    name: String(normalized.name || "Untitled Recipe").trim(),
    foodType: String(normalized.foodType || "Unspecified").trim(),
    category: normalizeCategoryLabel(getRecipeCategoryValue(normalized)),
    totalServings: Number(normalized.totalServings) > 0 ? Number(normalized.totalServings) : 1,
    totalCalories: Number(normalized.totalCalories) || 0,
    caloriesPerServing: Number(normalized.caloriesPerServing) || 0,
    totalProtein: normalized.totalProtein == null ? null : Number(normalized.totalProtein) || 0,
    proteinPerServing: normalized.proteinPerServing == null ? null : Number(normalized.proteinPerServing) || 0,
    ingredients: Array.isArray(normalized.ingredients)
      ? normalized.ingredients.map(ingredient => ({
          name: String(ingredient?.name || "Unnamed ingredient").trim(),
          quantity: ingredient?.quantity == null ? null : Number(ingredient.quantity) || 0,
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

function queueSharedMutation(entity, record) {
  if (!window.SHDPSharedSync || !record) return;
  try {
    window.SHDPSharedSync.queueMutation(localStorage, entity, record);
    sharedSyncManager?.syncNow();
  } catch (error) {
    console.warn(`[V1.4C Sync] Unable to queue ${entity}.`, error);
  }
}

function showMessage(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function reportMigrationStatus() {
  const migration = window.SHDPMigrationResult;
  if (!migration) return;
  if (migration.status === "failed") {
    console.error("[V1.4A Migration] Migration stopped safely.", migration.error);
    showMessage("Upgrade safety check failed. Version 1.3 data was preserved; synchronization is disabled.");
  } else if (migration.status === "completed" && migration.migrated) {
    showMessage("Version 1.3 data backup and migration safety checks passed.");
  }
}

function reportIngredientStoreStatus() {
  if (ingredientStore?.status !== "failed") return;
  console.error("[V1.4A Ingredients] Persistent Ingredient Master Database is unavailable.", ingredientStore.error);
  showMessage("Ingredient database safety check failed. Stored ingredient data was preserved.");
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
$("current-date").dateTime = todayForInput;
$("mobile-current-date").textContent = today.toLocaleDateString("en-US", {
  weekday: "short", month: "long", day: "numeric"
});
$("mobile-current-date").dateTime = todayForInput;
const hour = today.getHours();
const greetingPeriod = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
$("greeting").innerHTML = `${greetingPeriod},<br><span>Soumya! 👋</span>`;
$("meal-date").value = todayForInput;
$("history-date").value = todayForInput;
$("weight-date").value = todayForInput;
$("weight-value").value = applicationSettings.currentWeight;

// Navigation
function openPage(pageName) {
  $all(".app-page").forEach(page => page.classList.remove("active-page"));
  $all(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.page === pageName));
  const mobilePageLabels = {
    dashboard: "Home",
    "meal-history": "Meals",
    "recipe-handbook": "Recipes",
    "ingredient-database": "Ingredients",
    progress: "Progress",
    settings: "More"
  };
  const mobileNavigationPage = pageName === "ingredient-database" ? "settings" : pageName;
  $all(".mobile-nav-button").forEach(button => {
    const isActive = button.dataset.mobilePage === mobileNavigationPage;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if ($("mobile-page-title")) $("mobile-page-title").textContent = mobilePageLabels[pageName] || "Healthy Diet Planner";
  const page = $(pageName);
  if (page) page.classList.add("active-page");
  if (pageName === "meal-history") renderMealHistory();
  if (pageName === "recipe-handbook") renderRecipeHandbook();
  if (pageName === "ingredient-database") renderIngredientDatabase();
  if (pageName === "progress") renderWeeklyProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$all(".nav-button").forEach(button => button.addEventListener("click", () => openPage(button.dataset.page)));
$all(".mobile-nav-button").forEach(button => button.addEventListener("click", () => openPage(button.dataset.mobilePage)));
$all("[data-dashboard-page]").forEach(button => button.addEventListener("click", () => openPage(button.dataset.dashboardPage)));

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
  if (id === "ingredient-dialog" && entryType !== "edit") prepareIngredientDialog();
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
$all("[data-open-ingredient-dialog]").forEach(button => button.addEventListener("click", () => {
  if (ingredientStore?.status !== "ready") {
    showMessage("Ingredient management is unavailable because its storage safety check did not pass.");
    return;
  }
  openDialog("ingredient-dialog");
}));
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
  const searchInput = $("meal-recipe-search");
  const categorySelect = $("meal-recipe-category-filter");
  const previousRecipeId = select.value;
  const searchText = String(searchInput?.value || "").trim().toLocaleLowerCase();
  const selectedCategory = String(categorySelect?.value || "");
  const categories = Array.from(new Set(savedRecipes.map(recipe => String(recipe.category || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">All categories</option>';
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : "";
  }

  const matchingRecipes = savedRecipes
    .filter(recipe => !searchText || String(recipe.name || "").toLocaleLowerCase().includes(searchText))
    .filter(recipe => !categorySelect?.value || recipe.category === categorySelect.value)
    .sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="">Choose a saved recipe</option>';
  matchingRecipes.forEach(recipe => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = `${recipe.name} — ${formatCalories(recipe.caloriesPerServing)}/serving`;
    select.appendChild(option);
  });
  if (matchingRecipes.some(recipe => recipe.id === previousRecipeId)) select.value = previousRecipeId;
  const resultCount = $("meal-recipe-result-count");
  if (resultCount) {
    resultCount.textContent = `${matchingRecipes.length} recipe${matchingRecipes.length === 1 ? "" : "s"} available`;
  }
}
$("meal-recipe-search")?.addEventListener("input", loadRecipeOptions);
$("meal-recipe-category-filter")?.addEventListener("change", loadRecipeOptions);

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
    container.innerHTML = '<div class="empty-state"><span>➕</span><h4>No items added</h4><p>Add a recipe, manual food or JatiaBaba estimate.</p></div>';
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
    calories: Number((recipe.caloriesPerServing * servings).toFixed(2))
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
  if (!(calories > 0)) return showMessage("Please enter JatiaBaba's estimated calories.");
  addItemToCurrentMeal({ id: createUniqueId("mealitem"), source: "Estimated", name: "JatiaBaba Estimate", details: description, calories: Math.round(calories) });
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
$("ignore-recipe-button").addEventListener("click", () => {
  $("meal-recipe-search").value = "";
  $("meal-recipe-category-filter").value = "";
  $("recipe-selection").value = "";
  $("serving-amount").value = 1;
  loadRecipeOptions();
});
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
  const weightDifference = Number(applicationSettings.currentWeight) - Number(applicationSettings.goalWeight);
  $("dashboard-weight-remaining").textContent = weightDifference > 0
    ? `${weightDifference.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${applicationSettings.weightUnit} remaining`
    : weightDifference < 0
      ? `${Math.abs(weightDifference).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${applicationSettings.weightUnit} below goal`
      : "Goal reached";
  $("dashboard-progress-text").textContent = `${formatCalories(consumed)} / ${formatCalories(target)}`;
  $("dashboard-progress-target").textContent = `${formatCalories(target)} target`;
  $("calorie-progress").style.width = `${percentage}%`;
  renderDashboardMeals();
}

function renderDashboardMeals() {
  const meals = getMealsForDate(todayForInput);
  const container = $("dashboard-meals-container");
  const slots = [
    { label: "Breakfast", addType: "Breakfast", icon: "sunrise", matches: ["Breakfast"] },
    { label: "Lunch", addType: "Lunch", icon: "sun", matches: ["Lunch"] },
    { label: "Snack", addType: "Evening Snack", icon: "apple", matches: ["Morning Snack", "Snack", "Evening Snack"] },
    { label: "Dinner", addType: "Dinner", icon: "moon", matches: ["Dinner"] }
  ];
  const matchedIds = new Set();
  const slotMarkup = slots.map(slot => {
    const slotMeals = meals.filter(meal => slot.matches.includes(meal.mealType));
    slotMeals.forEach(meal => matchedIds.add(meal.id));
    const total = slotMeals.reduce((sum, meal) => sum + Number(meal.totalCalories || 0), 0);
    const iconPaths = {
      sunrise: '<path d="M5 18h14M7 14a5 5 0 0 1 10 0M12 3v3M4.5 7.5l2 2M19.5 7.5l-2 2"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
      apple: '<path d="M12 8c-4-3-8 0-7 5 1 6 5 8 7 5 2 3 6 1 7-5 1-5-3-8-7-5Zm0 0c0-3 2-5 5-5M12 6c-2 0-3-1-4-2"/>',
      moon: '<path d="M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5Z"/>'
    };
    return `
      <article class="dashboard-meal-slot ${slotMeals.length ? "is-logged" : ""}">
        <span class="meal-slot-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${iconPaths[slot.icon]}</svg></span>
        <div class="meal-slot-copy">
          <h3>${slot.label}</h3>
          <p>${slotMeals.length ? `${formatCalories(total)} · ${slotMeals.length === 1 ? "Logged" : `${slotMeals.length} entries logged`}` : "Not logged yet"}</p>
        </div>
        <span class="meal-slot-status">${slotMeals.length ? "Logged" : "Open"}</span>
        <div class="meal-slot-actions">
          ${slotMeals.map(meal => `<button class="dashboard-row-action" data-edit-meal="${meal.id}" aria-label="Edit ${escapeHtml(meal.mealType)}">Edit</button><button class="dashboard-row-action danger-row-action" data-delete-meal="${meal.id}" aria-label="Delete ${escapeHtml(meal.mealType)}">Delete</button>`).join("")}
          ${slotMeals.length ? "" : `<button class="dashboard-row-action primary-row-action" data-add-meal-type="${slot.addType}">Add</button>`}
        </div>
      </article>`;
  }).join("");
  const unmatchedMeals = meals.filter(meal => !matchedIds.has(meal.id));
  const unmatchedMarkup = unmatchedMeals.map(meal => `
    <article class="dashboard-meal-slot is-logged">
      <span class="meal-slot-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3v8M3 7h6M6 11v10M14 4v17M14 12c4 0 5-3 5-5V4c-3 0-5 3-5 8Z"/></svg></span>
      <div class="meal-slot-copy"><h3>${escapeHtml(meal.mealType)}</h3><p>${formatCalories(meal.totalCalories)} · Logged</p></div>
      <span class="meal-slot-status">Logged</span>
      <div class="meal-slot-actions"><button class="dashboard-row-action" data-edit-meal="${meal.id}">Edit</button><button class="dashboard-row-action danger-row-action" data-delete-meal="${meal.id}">Delete</button></div>
    </article>`).join("");
  container.innerHTML = slotMarkup + unmatchedMarkup;
  container.querySelectorAll("[data-add-meal-type]").forEach(button => button.addEventListener("click", () => {
    openDialog("meal-dialog");
    $("meal-type").value = button.dataset.addMealType;
  }));
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
function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function findIngredient(name) {
  const query = normalize(name);
  return activeIngredientDatabase.find(item => normalize(item.name) === query || (item.aliases || []).some(alias => normalize(alias) === query));
}

function populateIngredientOptions() {
  updateIngredientOptions("");
}

function updateIngredientOptions(searchText) {
  const query = normalize(searchText);
  const uniqueNames = new Map();
  activeIngredientDatabase.forEach(item => {
    const searchableNames = [item.name, ...(item.aliases || [])];
    if (query && !searchableNames.some(name => normalize(name).includes(query))) return;
    const canonicalName = String(item.name || "").trim().replace(/\s+/g, " ");
    const key = normalize(canonicalName);
    if (key && !uniqueNames.has(key)) uniqueNames.set(key, canonicalName);
  });
  $("ingredient-options").innerHTML = [...uniqueNames.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
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
    <div class="form-group"><label>Unit</label><select class="ingredient-unit-input"><option value="g">g</option><option value="ml">ml</option><option value="tsp">tsp</option><option value="tbsp">tbsp</option><option value="piece">piece</option><option value="unspecified">unspecified</option></select></div>
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
  ["input", "change"].forEach(eventName => row.addEventListener(eventName, event => {
    if (event.target.classList.contains("ingredient-name-input")) updateIngredientOptions(event.target.value);
    updateIngredientRow(row);
  }));
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
    const unitReference = known.unitReferences?.[unit];
    const referenceCalories = Number(unitReference?.calories ?? known.referenceCalories);
    const referenceAmount = Number(unitReference?.amount ?? known.referenceAmount);
    const referenceUnit = unitReference ? unit : known.referenceUnit;
    referenceText.textContent = `${referenceCalories} kcal / ${referenceAmount} ${referenceUnit}`;
    const convertedQuantity = convertCompatibleUnit(quantity, unit, referenceUnit);
    if (convertedQuantity !== null && quantity > 0) calories = convertedQuantity / referenceAmount * referenceCalories;
    else if (quantity > 0) statusText.textContent = `Choose ${referenceUnit} for automatic calculation.`;
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

$all("[data-add-recipe-ingredient]").forEach(button =>
  button.addEventListener("click", () => createIngredientRow())
);
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
    const recipeIngredientRows = $all(".ingredient-entry-row").map(row => ({
      name: row.querySelector(".ingredient-name-input").value.trim(),
      quantity: Number(row.querySelector(".ingredient-quantity-input").value),
      unit: row.querySelector(".ingredient-unit-input").value,
      calories: Number(row.querySelector(".ingredient-total-input").value),
      manualCalories: Number(row.querySelector(".manual-calories").value),
      manualAmount: Number(row.querySelector(".manual-amount").value),
      manualUnit: row.querySelector(".manual-unit").value,
      category: category || "Uncategorized"
    })).filter(item => item.name && item.quantity > 0);
    const ingredients = recipeIngredientRows.map(({ name: ingredientName, quantity, unit, calories }) => ({
      name: ingredientName,
      quantity,
      unit,
      calories
    }));
    const recipeData = {
      name, foodType, category: category || "Uncategorized", ingredients,
      totalServings: nutrition.servings,
      totalCalories: Math.round(nutrition.total),
      caloriesPerServing: Math.round(nutrition.perServing)
    };
    const editedRecipe = editingRecipeId ? savedRecipes.find(recipe => recipe.id === editingRecipeId) : null;
    const recipeUpdatedAt = new Date().toISOString();
    let savedRecipe;
    if (editedRecipe) {
      Object.assign(editedRecipe, recipeData, {
        revision: Number(editedRecipe.revision || 0) + 1,
        updatedAt: recipeUpdatedAt,
        syncStatus: "pending"
      });
      savedRecipe = editedRecipe;
    } else {
      savedRecipe = {
        id: `R${String(savedRecipes.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`,
        ...recipeData,
        revision: 1,
        createdAt: recipeUpdatedAt,
        updatedAt: recipeUpdatedAt,
        syncStatus: "pending"
      };
      savedRecipes.push(savedRecipe);
    }
    const successMessage = editedRecipe ? `${name} updated successfully.` : `${name} added to the Recipe Master Database.`;
    saveAll();
    const ingredientExpansion = ingredientStore?.status === "ready"
      ? window.SHDPIngredients.registerRecipeIngredients(
        localStorage,
        recipeIngredientRows,
        activeIngredientDatabase
      )
      : {
        status: "failed",
        created: [],
        error: "Stored ingredient data was preserved because its safety check did not pass."
      };
    queueSharedMutation("recipe", savedRecipe);
    ingredientExpansion.created.forEach(ingredient => queueSharedMutation("ingredient", ingredient));
    loadRecipeOptions();
    refreshCategoryViews();
    renderRecipeHandbook();
    prepareNewRecipe();
    closeDialog("recipe-dialog");
    const expansionMessage = ingredientExpansion.status === "failed"
      ? ` Ingredient database update needs attention: ${ingredientExpansion.error}`
      : ingredientExpansion.created.length
        ? ` ${ingredientExpansion.created.length} new ingredient${ingredientExpansion.created.length === 1 ? "" : "s"} saved automatically.`
        : "";
    showMessage(`${successMessage}${expansionMessage}`);
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

function populateRecipeFilters(recipes = savedRecipes) {
  const foodTypeSelect = $("recipe-food-type-filter");
  const categorySelect = $("recipe-category-filter");
  const selectedFoodType = foodTypeSelect.value;
  const selectedCategoryKey = normalizeCategoryKey(categorySelect.value);
  const completeRecipeCollection = Array.isArray(recipes) ? recipes : [];
  const foodTypes = [...new Set(completeRecipeCollection.map(recipe => recipe.foodType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = collectRecipeCategories(completeRecipeCollection);
  foodTypeSelect.innerHTML = '<option value="">All food types</option>' + foodTypes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  categorySelect.innerHTML = '<option value="">All categories</option>' + categories
    .map(({ key, label }) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
    .join("");
  if (foodTypes.includes(selectedFoodType)) foodTypeSelect.value = selectedFoodType;
  if (categories.some(({ key }) => key === selectedCategoryKey)) {
    categorySelect.value = selectedCategoryKey;
  } else if (selectedCategoryKey) {
    categorySelect.value = "";
    recipeHandbookPage = 1;
  }
}

function refreshCategoryViews() {
  populateRecipeFilters(savedRecipes);
  const recipeCategories = collectRecipeCategories(savedRecipes);
  $("recipe-category-options").innerHTML = recipeCategories
    .map(({ label }) => `<option value="${escapeHtml(label)}"></option>`)
    .join("");

  const ingredientCategories = window.SHDPIngredients.collectCategories(activeIngredientDatabase);
  const categoryFilter = $("ingredient-category-filter");
  const selectedCategory = window.SHDPIngredients.normalizedName(categoryFilter.value);
  categoryFilter.innerHTML = '<option value="">All categories</option>' + ingredientCategories
    .map(category => `<option value="${escapeHtml(window.SHDPIngredients.normalizedName(category))}">${escapeHtml(category)}</option>`)
    .join("");
  if (ingredientCategories.some(category => window.SHDPIngredients.normalizedName(category) === selectedCategory)) {
    categoryFilter.value = selectedCategory;
  }
  $("ingredient-category-options").innerHTML = ingredientCategories
    .map(category => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
  populateIngredientOptions();
}

function renderRecipeHandbook() {
  populateRecipeFilters(savedRecipes);
  $("recipe-saved-count").textContent = `${savedRecipes.length} recipe${savedRecipes.length === 1 ? "" : "s"} saved`;
  const query = normalize($("recipe-search").value);
  const foodType = normalize($("recipe-food-type-filter").value);
  const category = normalizeCategoryKey($("recipe-category-filter").value);
  const sortMode = $("recipe-sort").value;
  const recipes = savedRecipes.filter(recipe =>
    (!query || normalize(recipe.name).includes(query)) &&
    (!foodType || normalize(recipe.foodType) === foodType) &&
    (!category || normalizeCategoryKey(normalizeCategoryLabel(getRecipeCategoryValue(recipe))) === category)
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
        <span role="columnheader">Recipe</span><span role="columnheader">Category</span><span role="columnheader">Food Type</span><span role="columnheader">Calories / Serving</span><span role="columnheader">Action</span>
      </div>
      ${pageRecipes.map(recipe => `
        <div class="recipe-list-row" role="row">
          <div class="recipe-list-name" role="cell"><strong>${escapeHtml(recipe.name)}</strong><span class="recipe-mobile-meta">${escapeHtml(normalizeCategoryLabel(getRecipeCategoryValue(recipe)))} • ${escapeHtml(recipe.foodType || "Unspecified")}</span></div>
          <span class="recipe-list-category" role="cell">${escapeHtml(normalizeCategoryLabel(getRecipeCategoryValue(recipe)))}</span>
          <span class="recipe-list-food-type" role="cell">${escapeHtml(recipe.foodType || "Unspecified")}</span>
          <strong class="recipe-list-calories" role="cell">${formatCalories(recipe.caloriesPerServing)}<span> / serving</span></strong>
          <div class="recipe-list-action" role="cell"><button class="recipe-view-button" data-view-recipe="${recipe.id}">View <span aria-hidden="true">›</span></button></div>
        </div>`).join("")}
    </div>
    ${totalPages > 1 ? `<nav class="recipe-pagination" aria-label="Recipe pages">
      <button class="secondary-button compact-button" data-recipe-page="previous" ${recipeHandbookPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${recipeHandbookPage} of ${totalPages}</span>
      <button class="secondary-button compact-button" data-recipe-page="next" ${recipeHandbookPage === totalPages ? "disabled" : ""}>Next</button>
    </nav>` : ""}`;

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
  const deletedAt = new Date().toISOString();
  const recipeTombstone = {
    ...recipe,
    revision: Number(recipe.revision || 0) + 1,
    updatedAt: deletedAt,
    deletedAt,
    syncStatus: "pending"
  };
  savedRecipes = savedRecipes.filter(item => item.id !== recipe.id);
  selectedRecipeDetailsId = null;
  saveAll();
  queueSharedMutation("recipe", recipeTombstone);
  closeDialog("recipe-details-dialog");
  loadRecipeOptions();
  refreshCategoryViews();
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
        <li class="recipe-detail-ingredient"><strong>${escapeHtml(ingredient.name)}</strong><span>${ingredient.quantity == null ? "Quantity unspecified" : `${Number(ingredient.quantity).toLocaleString("en-US")} ${escapeHtml(ingredient.unit || "")}`}</span><span>${formatCalories(ingredient.calories)}</span></li>`).join("")}</ul>`
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

// Ingredient Database
function getActiveIngredients() {
  return activeIngredientDatabase.filter(ingredient => !ingredient.deletedAt);
}

function renderIngredientDatabase() {
  const query = normalize($("ingredient-database-search").value);
  const category = window.SHDPIngredients.normalizedName($("ingredient-category-filter").value);
  const activeIngredients = getActiveIngredients();
  const ingredients = activeIngredients
    .filter(ingredient => {
      const names = [ingredient.name, ...(ingredient.aliases || [])];
      return (!query || names.some(name => normalize(name).includes(query)))
        && (!category || window.SHDPIngredients.normalizedName(ingredient.category) === category);
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  $("ingredient-saved-count").textContent = `${activeIngredients.length} ingredient${activeIngredients.length === 1 ? "" : "s"} saved`;
  const container = $("ingredient-database-container");
  if (!activeIngredients.length) {
    container.innerHTML = '<div class="empty-state"><span>🌱</span><h4>No ingredients saved yet.</h4><p>Use Add Ingredient to create your first nutrition reference.</p></div>';
    return;
  }
  if (!ingredients.length) {
    container.innerHTML = '<div class="empty-state"><span>🔎</span><h4>No ingredients match these filters.</h4><button class="secondary-button" data-clear-ingredient-filters>Clear Filters</button></div>';
    container.querySelector("[data-clear-ingredient-filters]").addEventListener("click", () => {
      $("ingredient-database-search").value = "";
      $("ingredient-category-filter").value = "";
      renderIngredientDatabase();
    });
    return;
  }

  container.innerHTML = `
    <p class="ingredient-result-count">Showing ${ingredients.length} of ${activeIngredients.length} ingredients</p>
    <div class="ingredient-list" role="table" aria-label="Ingredient Master Database">
      <div class="ingredient-list-header" role="row">
        <span role="columnheader">Ingredient</span><span role="columnheader">Category</span><span role="columnheader">Nutrition Reference</span><span role="columnheader">Actions</span>
      </div>
      ${ingredients.map(ingredient => `
        <div class="ingredient-list-row" role="row">
          <div class="ingredient-list-name" role="cell"><strong>${escapeHtml(ingredient.name)}</strong><small>${ingredient.aliases?.length ? `Also: ${escapeHtml(ingredient.aliases.join(", "))}` : "No aliases"}</small></div>
          <span class="ingredient-list-category" role="cell">${escapeHtml(ingredient.category || "Uncategorized")}</span>
          <span class="ingredient-list-reference" role="cell">${formatCalories(ingredient.referenceCalories)} / ${Number(ingredient.referenceAmount).toLocaleString("en-US")} ${escapeHtml(ingredient.referenceUnit)}</span>
          <div class="ingredient-list-actions" role="cell"><button class="secondary-button compact-button" data-edit-ingredient="${ingredient.id}">Edit</button><button class="delete-button compact-button" data-delete-ingredient="${ingredient.id}">Delete</button></div>
        </div>`).join("")}
    </div>`;

  container.querySelectorAll("[data-edit-ingredient]").forEach(button =>
    button.addEventListener("click", () => editIngredient(button.dataset.editIngredient))
  );
  container.querySelectorAll("[data-delete-ingredient]").forEach(button =>
    button.addEventListener("click", () => removeIngredient(button.dataset.deleteIngredient))
  );
}

function prepareIngredientDialog(ingredient = null) {
  editingIngredientId = ingredient?.id || null;
  $("ingredient-dialog-title").textContent = ingredient ? `Edit ${ingredient.name}` : "Add Ingredient";
  $("ingredient-dialog-description").textContent = ingredient
    ? "Update this reusable nutrition reference."
    : "Save a reusable nutrition reference.";
  $("save-ingredient-button").textContent = ingredient ? "Save Changes" : "Save Ingredient";
  $("ingredient-name").value = ingredient?.name || "";
  $("ingredient-category").value = ingredient?.category === "Uncategorized" ? "" : ingredient?.category || "";
  $("ingredient-aliases").value = ingredient?.aliases?.join(", ") || "";
  $("ingredient-reference-calories").value = ingredient?.referenceCalories ?? "";
  $("ingredient-reference-amount").value = ingredient?.referenceAmount ?? "";
  $("ingredient-reference-unit").value = ingredient?.referenceUnit || "g";
  [
    "ingredient-name",
    "ingredient-category",
    "ingredient-aliases",
    "ingredient-reference-calories",
    "ingredient-reference-amount",
    "ingredient-reference-unit"
  ].forEach(id => clearFieldError($(id)));
}

function editIngredient(ingredientId) {
  if (ingredientStore?.status !== "ready") return showMessage("Ingredient management is unavailable because its storage safety check did not pass.");
  const ingredient = activeIngredientDatabase.find(item => item.id === ingredientId && !item.deletedAt);
  if (!ingredient) return showMessage("The selected ingredient could not be found.");
  prepareIngredientDialog(ingredient);
  openDialog("ingredient-dialog", "edit");
}

function removeIngredient(ingredientId) {
  if (ingredientStore?.status !== "ready") return showMessage("Ingredient management is unavailable because its storage safety check did not pass.");
  const ingredient = activeIngredientDatabase.find(item => item.id === ingredientId && !item.deletedAt);
  if (!ingredient || !confirm(`Delete "${ingredient.name}" from the Ingredient Database? Existing recipes and meal history will not be changed.`)) return;
  const result = window.SHDPIngredients.deleteIngredient(localStorage, activeIngredientDatabase, ingredientId);
  if (result.status === "failed") return showMessage(`Ingredient could not be deleted: ${result.error}`);
  queueSharedMutation("ingredient", result.ingredient);
  refreshCategoryViews();
  renderIngredientDatabase();
  showMessage(`${ingredient.name} deleted. Existing recipes were preserved.`);
}

$("ingredient-database-search").addEventListener("input", renderIngredientDatabase);
$("ingredient-category-filter").addEventListener("change", renderIngredientDatabase);

$("save-ingredient-button").addEventListener("click", () => {
  if (isSavingIngredient) return;
  if (ingredientStore?.status !== "ready") return showMessage("Ingredient management is unavailable because its storage safety check did not pass.");
  const input = {
    name: $("ingredient-name").value.trim(),
    category: $("ingredient-category").value.trim() || "Uncategorized",
    aliases: $("ingredient-aliases").value.split(",").map(value => value.trim()).filter(Boolean),
    referenceCalories: Number($("ingredient-reference-calories").value),
    referenceAmount: Number($("ingredient-reference-amount").value),
    referenceUnit: $("ingredient-reference-unit").value
  };
  const invalid = [];
  clearFieldError($("ingredient-name"));
  clearFieldError($("ingredient-reference-calories"));
  clearFieldError($("ingredient-reference-amount"));
  if (!input.name) {
    setFieldError($("ingredient-name"), "Ingredient name is required.");
    invalid.push($("ingredient-name"));
  }
  if ($("ingredient-reference-calories").value === "" || input.referenceCalories < 0) {
    setFieldError($("ingredient-reference-calories"), "Enter calories of zero or greater.");
    invalid.push($("ingredient-reference-calories"));
  }
  if (!(input.referenceAmount > 0)) {
    setFieldError($("ingredient-reference-amount"), "Enter an amount greater than zero.");
    invalid.push($("ingredient-reference-amount"));
  }
  if (invalid.length) {
    showMessage("Please correct the highlighted ingredient fields.");
    focusFirstInvalid(invalid[0]);
    return;
  }

  isSavingIngredient = true;
  try {
    const result = editingIngredientId
      ? window.SHDPIngredients.updateIngredient(localStorage, activeIngredientDatabase, editingIngredientId, input)
      : window.SHDPIngredients.createIngredient(localStorage, activeIngredientDatabase, input);
    if (result.status === "failed") {
      showMessage(`Ingredient could not be saved: ${result.error}`);
      return;
    }
    queueSharedMutation("ingredient", result.ingredient);
    const message = editingIngredientId ? `${result.ingredient.name} updated.` : `${result.ingredient.name} added.`;
    closeDialog("ingredient-dialog");
    editingIngredientId = null;
    refreshCategoryViews();
    renderIngredientDatabase();
    showMessage(message);
  } finally {
    isSavingIngredient = false;
  }
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
  refreshCategoryViews();
  updateDashboard();
  renderMealHistory();
  renderRecipeHandbook();
  renderIngredientDatabase();
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
refreshCategoryViews();
populateSettings();
createIngredientRow();
loadRecipeOptions();
renderCurrentMeal();
updateDashboard();
renderMealHistory();
renderRecipeHandbook();
renderIngredientDatabase();
renderWeeklyProgress();
reportMigrationStatus();
reportIngredientStoreStatus();

// Version 1.4C PWA support
const INSTALL_PROMPT_DISMISSED_KEY = "soumyaHealthyDietInstallPromptDismissed";
let deferredInstallPrompt = null;

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function updateInstallAppUI() {
  const message = $("pwa-install-message");
  const installButton = $("pwa-install-button");
  const dismissButton = $("pwa-install-dismiss-button");
  if (!message || !installButton || !dismissButton) return;

  installButton.hidden = true;
  dismissButton.hidden = true;

  if (isStandaloneMode()) {
    message.textContent = "Healthy Diet is installed and running in standalone mode.";
    return;
  }

  if (deferredInstallPrompt) {
    message.textContent = "Install Healthy Diet for quick access from this device.";
    installButton.hidden = false;
    return;
  }

  if (isIosDevice()) {
    if (localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "true") {
      message.textContent = "To install later, open this page in Safari, tap Share, then Add to Home Screen.";
      return;
    }
    message.textContent = "Install on iPhone: open in Safari, tap Share, then Add to Home Screen.";
    dismissButton.hidden = false;
    return;
  }

  message.textContent = "Use your browser's Install app menu when installation is available.";
}

$("pwa-install-button")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  const result = await promptEvent.userChoice;
  showMessage(result.outcome === "accepted" ? "Healthy Diet installation started." : "Installation was dismissed.");
  updateInstallAppUI();
});

$("pwa-install-dismiss-button")?.addEventListener("click", () => {
  localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "true");
  updateInstallAppUI();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallAppUI();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
  updateInstallAppUI();
  showMessage("Healthy Diet was installed successfully.");
});

updateInstallAppUI();

function applySharedState({ recipes, ingredients }) {
  const nextRecipes = normalizeRecipeCollection((recipes || []).filter(recipe => !recipe.deletedAt));
  const nextIngredients = Array.isArray(ingredients) ? ingredients : [];
  window.SHDPIngredients.assertValidCollection(nextIngredients);
  const previousRecipesRaw = localStorage.getItem(STORAGE.recipes);
  const previousIngredientsRaw = localStorage.getItem(window.SHDPIngredients.STORAGE_KEY);
  const recipesRaw = JSON.stringify(nextRecipes);
  const ingredientsRaw = JSON.stringify(nextIngredients);
  try {
    localStorage.setItem(STORAGE.recipes, recipesRaw);
    localStorage.setItem(window.SHDPIngredients.STORAGE_KEY, ingredientsRaw);
    if (localStorage.getItem(STORAGE.recipes) !== recipesRaw
      || localStorage.getItem(window.SHDPIngredients.STORAGE_KEY) !== ingredientsRaw) {
      throw new Error("Shared records could not be verified after local persistence.");
    }
  } catch (error) {
    if (previousRecipesRaw === null) localStorage.removeItem(STORAGE.recipes);
    else localStorage.setItem(STORAGE.recipes, previousRecipesRaw);
    if (previousIngredientsRaw === null) localStorage.removeItem(window.SHDPIngredients.STORAGE_KEY);
    else localStorage.setItem(window.SHDPIngredients.STORAGE_KEY, previousIngredientsRaw);
    throw error;
  }
  savedRecipes = nextRecipes;
  activeIngredientDatabase.splice(0, activeIngredientDatabase.length, ...nextIngredients);
  loadRecipeOptions();
  refreshCategoryViews();
  renderRecipeHandbook();
  renderIngredientDatabase();
}

function markInitialSharedSyncVerified(verification) {
  const migration = window.SHDPMigrationResult;
  if (migration?.status !== "completed" || migration.syncVerificationStatus === "verified") return;
  try {
    window.SHDPStorage?.markSupabaseSyncVerified(localStorage, verification);
  } catch (error) {
    console.warn("[V1.4C Migration] Shared synchronization was verified, but the migration gate remains pending.", error);
  }
}

if (window.SHDPSharedSync && window.SHDPMigrationResult?.status !== "failed") {
  sharedSyncManager = window.SHDPSharedSync.createManager({
    storage: localStorage,
    config: window.SHDP_CONFIG,
    getState: () => ({
      recipes: savedRecipes,
      ingredients: activeIngredientDatabase
    }),
    applyState: applySharedState,
    onVerifiedSync: markInitialSharedSyncVerified,
    onError: error => {
      const pending = window.SHDPSharedSync.readOutbox(localStorage);
      const pendingEntities = pending.reduce((counts, item) => {
        counts[item.entity] = (counts[item.entity] || 0) + 1;
        return counts;
      }, {});
      const safeDiagnostic = {
        message: error.message,
        pendingCount: pending.length,
        pendingEntities
      };
      const isDevelopmentHost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
      if (isDevelopmentHost) {
        console.error("[V1.4C Sync] Shared synchronization failed; queued changes were retained.", safeDiagnostic);
      } else {
        console.warn("[V1.4C Sync] Shared data synchronization will retry.", safeDiagnostic);
      }
      if (window.SHDPMigrationResult?.status === "completed") {
        window.SHDPStorage?.markSupabaseSyncFailed(localStorage, error.message);
      }
    }
  });
  sharedSyncManager.start();
}

if ("serviceWorker" in navigator) {
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if (window.isSecureContext || isLocalDevelopment) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
        .then(registration => registration.update())
        .catch(error => console.warn("[PWA] Service worker registration failed.", error));
    });
  }
}
