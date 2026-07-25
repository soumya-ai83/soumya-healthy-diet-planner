/*
================================================

Soumya Healthy Diet Planner

Version: 0.5.0
Project Codename: Project Jatibaba

Purpose:
Stores the application's initial recipe data.

================================================
*/


const recipeDatabase = [
    {
        id: "R001",
        name: "Vegetable Santula",
        foodType: "Vegetarian",
        category: "Vegetable Curry",
        totalServings: 2,
        totalCalories: 509,
        caloriesPerServing: 255
    }
];
/*
================================================
STARTER INGREDIENT NUTRITION DATABASE

These are initial reference values.
We can expand and refine this database over time.
================================================
*/

const ingredientDatabase = [
    {
        id: "I001",
        name: "Potato",
        aliases: ["Aloo", "Alu"],
        referenceCalories: 77,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I002",
        name: "Onion",
        aliases: [],
        referenceCalories: 40,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I003",
        name: "Tomato",
        aliases: [],
        referenceCalories: 18,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I004",
        name: "Garlic",
        aliases: [],
        referenceCalories: 149,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I005",
        name: "Ginger",
        aliases: [],
        referenceCalories: 80,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I006",
        name: "Pumpkin",
        aliases: [],
        referenceCalories: 26,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I007",
        name: "Brinjal",
        aliases: ["Eggplant"],
        referenceCalories: 25,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I008",
        name: "Carrot",
        aliases: [],
        referenceCalories: 41,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I009",
        name: "Green Beans",
        aliases: ["Beans"],
        referenceCalories: 31,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I010",
        name: "Green Peas",
        aliases: ["Peas"],
        referenceCalories: 81,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I011",
        name: "Raw Papaya",
        aliases: ["Green Papaya"],
        referenceCalories: 43,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I012",
        name: "Raw Banana",
        aliases: ["Green Banana", "Plantain"],
        referenceCalories: 122,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I013",
        name: "Arbi",
        aliases: ["Taro"],
        referenceCalories: 112,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I014",
        name: "Cooking Oil",
        aliases: [
            "Oil",
            "Olive Oil",
            "Mustard Oil",
            "Vegetable Oil"
        ],
        referenceCalories: 120,
        referenceAmount: 1,
        referenceUnit: "tbsp"
    },
    {
        id: "I015",
        name: "Ghee",
        aliases: [],
        referenceCalories: 112,
        referenceAmount: 1,
        referenceUnit: "tbsp"
    },
    {
        id: "I016",
        name: "Egg",
        aliases: ["Eggs"],
        referenceCalories: 72,
        referenceAmount: 1,
        referenceUnit: "piece"
    },
    {
        id: "I017",
        name: "Cooked Rice",
        aliases: ["Rice"],
        referenceCalories: 130,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I018",
        name: "Wheat Flour",
        aliases: ["Atta"],
        referenceCalories: 364,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I019",
        name: "Masur Dal",
        aliases: ["Red Lentils"],
        referenceCalories: 352,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I020",
        name: "Toor Dal",
        aliases: ["Arhar Dal"],
        referenceCalories: 343,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I021",
        name: "Chana Dal",
        aliases: [],
        referenceCalories: 360,
        referenceAmount: 100,
        referenceUnit: "g"
    },
    {
        id: "I022",
        name: "Moong Dal",
        aliases: [],
        referenceCalories: 347,
        referenceAmount: 100,
        referenceUnit: "g"
    }
];