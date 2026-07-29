/*
Soumya Healthy Diet Planner
Version 1.4B persistent Ingredient Master Database

The store remains local-first and keeps Version 1.4A records backward
compatible while adding safe ingredient management and categories.
*/

(function initializeIngredientStore(globalScope) {
  "use strict";

  const STORAGE_KEY = "soumyaHealthyDietIngredients";
  const STORE_SCHEMA_VERSION = 2;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  }

  function normalizeCategory(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ") || "Uncategorized";
  }

  function createId() {
    if (globalScope.crypto?.randomUUID) return globalScope.crypto.randomUUID();
    return `ingredient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeAliases(aliases, canonicalName) {
    const canonicalKey = normalizedName(canonicalName);
    const unique = new Map();
    (Array.isArray(aliases) ? aliases : []).forEach(alias => {
      const label = String(alias ?? "").trim().replace(/\s+/g, " ");
      const key = normalizedName(label);
      if (key && key !== canonicalKey && !unique.has(key)) unique.set(key, label);
    });
    return Array.from(unique.values());
  }

  function normalizeIngredient(record, index = 0, defaults = {}) {
    const source = record && typeof record === "object" ? record : {};
    const name = String(source.name || `Unnamed ingredient ${index + 1}`).trim().replace(/\s+/g, " ");
    const now = defaults.now || new Date().toISOString();
    return {
      ...source,
      id: String(source.id || defaults.id || createId()),
      name,
      normalizedName: normalizedName(name),
      aliases: normalizeAliases(source.aliases, name),
      category: normalizeCategory(source.category),
      referenceCalories: Math.max(0, Number(source.referenceCalories) || 0),
      referenceAmount: Number(source.referenceAmount) > 0 ? Number(source.referenceAmount) : 1,
      referenceUnit: String(source.referenceUnit || "g"),
      unitReferences: source.unitReferences && typeof source.unitReferences === "object"
        ? clone(source.unitReferences)
        : undefined,
      source: String(source.source || defaults.source || "user"),
      schemaVersion: STORE_SCHEMA_VERSION,
      revision: Number(source.revision) > 0 ? Number(source.revision) : 1,
      createdAt: source.createdAt || now,
      updatedAt: source.updatedAt || now,
      deletedAt: source.deletedAt || null,
      syncStatus: String(source.syncStatus || defaults.syncStatus || "pending")
    };
  }

  function findIngredient(ingredients, name) {
    const query = normalizedName(name);
    if (!query) return null;
    return (Array.isArray(ingredients) ? ingredients : []).find(ingredient =>
      !ingredient.deletedAt &&
      (normalizedName(ingredient.name) === query ||
        (ingredient.aliases || []).some(alias => normalizedName(alias) === query))
    ) || null;
  }

  function assertValidCollection(ingredients) {
    if (!Array.isArray(ingredients)) throw new Error("Ingredient Master Database must contain a list.");
    const ids = new Set();
    const searchTerms = new Map();
    ingredients.forEach((ingredient, index) => {
      if (!ingredient || typeof ingredient !== "object") throw new Error(`Ingredient ${index + 1} is invalid.`);
      const id = String(ingredient.id || "").trim();
      const nameKey = normalizedName(ingredient.name);
      if (!id || !nameKey) throw new Error(`Ingredient ${index + 1} is missing an ID or name.`);
      if (ids.has(id)) throw new Error(`Ingredient Master Database contains duplicate ID ${id}.`);
      if (Number(ingredient.referenceAmount) <= 0 || Number(ingredient.referenceCalories) < 0) {
        throw new Error(`Ingredient ${ingredient.name} has invalid nutrition reference information.`);
      }
      ids.add(id);
      if (!ingredient.deletedAt) {
        [ingredient.name, ...(ingredient.aliases || [])].forEach(term => {
          const key = normalizedName(term);
          const owner = searchTerms.get(key);
          if (owner && owner !== id) {
            throw new Error(`Ingredient name or alias "${term}" is already used by another ingredient.`);
          }
          if (key) searchTerms.set(key, id);
        });
      }
    });
    return true;
  }

  function persist(storage, ingredients) {
    assertValidCollection(ingredients);
    const serialized = JSON.stringify(ingredients);
    storage.setItem(STORAGE_KEY, serialized);
    if (storage.getItem(STORAGE_KEY) !== serialized) {
      throw new Error("Ingredient Master Database could not be verified after saving.");
    }
  }

  function commitCollection(storage, activeIngredients, working) {
    persist(storage, working);
    activeIngredients.splice(0, activeIngredients.length, ...working);
    return activeIngredients;
  }

  function assertNutritionInput(input) {
    if (!String(input?.name || "").trim()) throw new Error("Ingredient name is required.");
    if (Number(input.referenceCalories) < 0 || !Number.isFinite(Number(input.referenceCalories))) {
      throw new Error("Reference calories must be zero or greater.");
    }
    if (!(Number(input.referenceAmount) > 0)) throw new Error("Reference amount must be greater than zero.");
    if (!String(input.referenceUnit || "").trim()) throw new Error("Reference unit is required.");
  }

  function assertNoTermCollision(ingredients, input, excludedId = null) {
    const terms = [
      String(input?.name || "").trim(),
      ...normalizeAliases(input?.aliases, input?.name)
    ].filter(Boolean);
    terms.forEach(term => {
      const match = findIngredient(
        (Array.isArray(ingredients) ? ingredients : []).filter(item => item.id !== excludedId),
        term
      );
      if (match) throw new Error(`"${term}" already belongs to ${match.name}.`);
    });
  }

  function mergeMissingStarters(storedIngredients, starterIngredients, now) {
    const merged = storedIngredients.map((ingredient, index) =>
      normalizeIngredient(ingredient, index, { now })
    );
    let changed = false;
    (Array.isArray(starterIngredients) ? starterIngredients : []).forEach(starter => {
      const match = merged.find(ingredient =>
        ingredient.id === starter.id || normalizedName(ingredient.name) === normalizedName(starter.name)
      );
      if (match) return;
      merged.push(normalizeIngredient(starter, merged.length, {
        now,
        source: "starter",
        syncStatus: "pending"
      }));
      changed = true;
    });
    assertValidCollection(merged);
    return { ingredients: merged, changed };
  }

  function initialize(storage = globalScope.localStorage, starterIngredients = [], now = new Date().toISOString()) {
    const starters = (Array.isArray(starterIngredients) ? starterIngredients : []).map((ingredient, index) =>
      normalizeIngredient(ingredient, index, { now, source: "starter", syncStatus: "pending" })
    );
    if (!storage) {
      return { status: "memory-only", ingredients: starters, created: false, error: "Browser storage is unavailable." };
    }

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      try {
        persist(storage, starters);
        return { status: "ready", ingredients: starters, created: true, addedStarterCount: starters.length };
      } catch (error) {
        return { status: "failed", ingredients: starters, created: false, error: error.message };
      }
    }

    try {
      const parsed = JSON.parse(raw);
      assertValidCollection(parsed);
      const merged = mergeMissingStarters(parsed, starters, now);
      if (merged.changed) persist(storage, merged.ingredients);
      return {
        status: "ready",
        ingredients: merged.ingredients,
        created: false,
        addedStarterCount: merged.ingredients.length - parsed.length
      };
    } catch (error) {
      return {
        status: "failed",
        ingredients: starters,
        created: false,
        error: error.message || "Ingredient Master Database could not be loaded."
      };
    }
  }

  function registerRecipeIngredients(
    storage = globalScope.localStorage,
    recipeIngredients = [],
    activeIngredients = [],
    now = new Date().toISOString()
  ) {
    if (!storage) {
      return { status: "failed", created: [], ingredients: activeIngredients, error: "Browser storage is unavailable." };
    }

    const working = clone(Array.isArray(activeIngredients) ? activeIngredients : []);
    const created = [];
    try {
      recipeIngredients.forEach(item => {
        const name = String(item?.name || "").trim().replace(/\s+/g, " ");
        if (!name || findIngredient(working, name)) return;
        const referenceCalories = Number(item.manualCalories);
        const referenceAmount = Number(item.manualAmount);
        const referenceUnit = String(item.manualUnit || item.unit || "g");
        if (referenceCalories < 0 || !(referenceAmount > 0)) {
          throw new Error(`Nutrition reference information is incomplete for ${name}.`);
        }
        const record = normalizeIngredient({
          id: createId(),
          name,
          aliases: [],
          category: normalizeCategory(item.category),
          referenceCalories,
          referenceAmount,
          referenceUnit,
          source: "recipe",
          revision: 1,
          createdAt: now,
          updatedAt: now,
          syncStatus: "pending"
        }, working.length, { now });
        working.push(record);
        created.push(record);
      });

      if (created.length) {
        commitCollection(storage, activeIngredients, working);
      }
      return { status: "ready", created, ingredients: activeIngredients };
    } catch (error) {
      return {
        status: "failed",
        created: [],
        ingredients: activeIngredients,
        error: error.message || "New ingredients could not be saved."
      };
    }
  }

  function createIngredient(
    storage = globalScope.localStorage,
    activeIngredients = [],
    input = {},
    now = new Date().toISOString()
  ) {
    if (!storage) return { status: "failed", ingredient: null, error: "Browser storage is unavailable." };
    try {
      assertNutritionInput(input);
      assertNoTermCollision(activeIngredients, input);
      const working = clone(activeIngredients);
      const ingredient = normalizeIngredient({
        name: input.name,
        aliases: input.aliases,
        category: input.category,
        referenceCalories: input.referenceCalories,
        referenceAmount: input.referenceAmount,
        referenceUnit: input.referenceUnit,
        source: input.source || "user",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        syncStatus: "pending"
      }, working.length, { now });
      working.push(ingredient);
      commitCollection(storage, activeIngredients, working);
      return { status: "ready", ingredient, ingredients: activeIngredients };
    } catch (error) {
      return { status: "failed", ingredient: null, ingredients: activeIngredients, error: error.message };
    }
  }

  function updateIngredient(
    storage = globalScope.localStorage,
    activeIngredients = [],
    ingredientId,
    input = {},
    now = new Date().toISOString()
  ) {
    if (!storage) return { status: "failed", ingredient: null, error: "Browser storage is unavailable." };
    try {
      const existing = activeIngredients.find(item => item.id === ingredientId && !item.deletedAt);
      if (!existing) throw new Error("Ingredient could not be found.");
      assertNutritionInput(input);
      assertNoTermCollision(activeIngredients, input, ingredientId);
      const working = clone(activeIngredients);
      const index = working.findIndex(item => item.id === ingredientId);
      const ingredient = normalizeIngredient({
        ...working[index],
        name: input.name,
        aliases: input.aliases,
        category: input.category,
        referenceCalories: input.referenceCalories,
        referenceAmount: input.referenceAmount,
        referenceUnit: input.referenceUnit,
        revision: Number(working[index].revision || 0) + 1,
        updatedAt: now,
        syncStatus: "pending"
      }, index, { now });
      working[index] = ingredient;
      commitCollection(storage, activeIngredients, working);
      return { status: "ready", ingredient, ingredients: activeIngredients };
    } catch (error) {
      return { status: "failed", ingredient: null, ingredients: activeIngredients, error: error.message };
    }
  }

  function deleteIngredient(
    storage = globalScope.localStorage,
    activeIngredients = [],
    ingredientId,
    now = new Date().toISOString()
  ) {
    if (!storage) return { status: "failed", ingredient: null, error: "Browser storage is unavailable." };
    try {
      const working = clone(activeIngredients);
      const index = working.findIndex(item => item.id === ingredientId && !item.deletedAt);
      if (index < 0) throw new Error("Ingredient could not be found.");
      working[index] = normalizeIngredient({
        ...working[index],
        revision: Number(working[index].revision || 0) + 1,
        updatedAt: now,
        deletedAt: now,
        syncStatus: "pending"
      }, index, { now });
      commitCollection(storage, activeIngredients, working);
      return { status: "ready", ingredient: working[index], ingredients: activeIngredients };
    } catch (error) {
      return { status: "failed", ingredient: null, ingredients: activeIngredients, error: error.message };
    }
  }

  function collectCategories(ingredients) {
    const categories = new Map();
    (Array.isArray(ingredients) ? ingredients : []).forEach(ingredient => {
      if (ingredient.deletedAt) return;
      const label = normalizeCategory(ingredient.category);
      const key = normalizedName(label);
      if (!categories.has(key)) categories.set(key, label);
    });
    return Array.from(categories.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }

  const api = Object.freeze({
    STORAGE_KEY,
    STORE_SCHEMA_VERSION,
    normalizedName,
    normalizeCategory,
    normalizeIngredient,
    findIngredient,
    assertValidCollection,
    mergeMissingStarters,
    initialize,
    registerRecipeIngredients,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    collectCategories
  });

  globalScope.SHDPIngredients = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
