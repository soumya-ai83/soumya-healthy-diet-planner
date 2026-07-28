/*
Soumya Healthy Diet Planner
Version 1.4A persistent Ingredient Master Database

Phase 2 keeps ingredients local-first and prepares sync-ready records without
adding a network dependency. Supabase synchronization is introduced later.
*/

(function initializeIngredientStore(globalScope) {
  "use strict";

  const STORAGE_KEY = "soumyaHealthyDietIngredients";
  const STORE_SCHEMA_VERSION = 1;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
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
    const names = new Set();
    ingredients.forEach((ingredient, index) => {
      if (!ingredient || typeof ingredient !== "object") throw new Error(`Ingredient ${index + 1} is invalid.`);
      const id = String(ingredient.id || "").trim();
      const nameKey = normalizedName(ingredient.name);
      if (!id || !nameKey) throw new Error(`Ingredient ${index + 1} is missing an ID or name.`);
      if (ids.has(id)) throw new Error(`Ingredient Master Database contains duplicate ID ${id}.`);
      if (!ingredient.deletedAt && names.has(nameKey)) {
        throw new Error(`Ingredient Master Database contains duplicate name ${ingredient.name}.`);
      }
      if (Number(ingredient.referenceAmount) <= 0 || Number(ingredient.referenceCalories) < 0) {
        throw new Error(`Ingredient ${ingredient.name} has invalid nutrition reference information.`);
      }
      ids.add(id);
      if (!ingredient.deletedAt) names.add(nameKey);
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
        persist(storage, working);
        activeIngredients.splice(0, activeIngredients.length, ...working);
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

  const api = Object.freeze({
    STORAGE_KEY,
    STORE_SCHEMA_VERSION,
    normalizedName,
    normalizeIngredient,
    findIngredient,
    assertValidCollection,
    mergeMissingStarters,
    initialize,
    registerRecipeIngredients
  });

  globalScope.SHDPIngredients = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
