/*
================================================
Soumya Healthy Diet Planner
Version: 1.0 Master Nutrition Data
Project Codename: Project Jatibaba

Purpose:
Stores the stable starter recipe set and the local ingredient
nutrition references used by the Recipe Builder.
================================================
*/

function starterIngredient(name, quantity, unit, calories) {
    return { name, quantity, unit, calories };
}

const recipeDatabase = [
    {
        id: "SR1001",
        name: "Aloo Chokha",
        foodType: "Vegetarian",
        category: "Vegetable Side",
        ingredients: [
            starterIngredient("Potato, raw", 170, "g", 131),
            starterIngredient("Onion", 30, "g", 12),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 183,
        caloriesPerServing: 92,
        totalProtein: 3.7,
        proteinPerServing: 1.9
    },
    {
        id: "SR1002",
        name: "Aloo Paratha",
        foodType: "Vegetarian",
        category: "Flatbread",
        ingredients: [
            starterIngredient("Wheat Flour", 420, "g", 1529),
            starterIngredient("Potato, raw", 580, "g", 447),
            starterIngredient("Onion", 50, "g", 20),
            starterIngredient("Cooking Oil", 3, "tbsp", 360)
        ],
        totalServings: 8,
        totalCalories: 2255,
        caloriesPerServing: 282,
        totalProtein: 67,
        proteinPerServing: 8.4
    },
    {
        id: "SR1003",
        name: "Chicken Tender Breast Curry",
        foodType: "Chicken",
        category: "Chicken Curry",
        ingredients: [
            starterIngredient("Chicken breast, raw, skinless", 1000, "g", 1200),
            starterIngredient("Onion", 204, "g", 82),
            starterIngredient("Garlic", 32, "g", 48),
            starterIngredient("Ginger", 7, "g", 6),
            starterIngredient("Tomato", 7, "g", 1),
            starterIngredient("Potato, raw", 254, "g", 196),
            starterIngredient("Cooking Oil", 2, "tbsp", 240),
            starterIngredient("Cooking Oil", 1, "tsp", 40),
            starterIngredient("Spices", 10, "g", 30)
        ],
        totalServings: 4,
        totalCalories: 1843,
        caloriesPerServing: 461,
        totalProtein: 240,
        proteinPerServing: 60
    },
    {
        id: "SR1004",
        name: "Chili Soya",
        foodType: "Vegetarian",
        category: "Soya Curry",
        ingredients: [
            starterIngredient("Soya chunks, dry", 80, "g", 276),
            starterIngredient("Garlic", 12, "g", 18),
            starterIngredient("Tomato", 40, "g", 7),
            starterIngredient("Onion", 100, "g", 40),
            starterIngredient("Cooking Oil", 1, "tbsp", 120),
            starterIngredient("Capsicum", 85, "g", 17),
            starterIngredient("Ginger", 5, "g", 4)
        ],
        totalServings: 2,
        totalCalories: 482,
        caloriesPerServing: 241,
        totalProtein: 44,
        proteinPerServing: 22
    },
    {
        id: "SR1005",
        name: "Chole Curry",
        foodType: "Vegetarian",
        category: "Legume Curry",
        ingredients: [
            starterIngredient("Chickpeas, dry", 350, "g", 1274),
            starterIngredient("Onion", 130, "g", 52),
            starterIngredient("Garlic", 30, "g", 45),
            starterIngredient("Ginger", 7, "g", 6),
            starterIngredient("Tomato", 100, "g", 18),
            starterIngredient("Olive Oil", 1, "tbsp", 120)
        ],
        totalServings: 4,
        totalCalories: 1515,
        caloriesPerServing: 379,
        totalProtein: 74,
        proteinPerServing: 18.5
    },
    {
        id: "SR1006",
        name: "Cooked Rice (200g)",
        foodType: "Vegetarian",
        category: "Rice",
        ingredients: [
            starterIngredient("White Rice, cooked", 200, "g", 260)
        ],
        totalServings: 1,
        totalCalories: 260,
        caloriesPerServing: 260,
        totalProtein: 5,
        proteinPerServing: 5
    },
    {
        id: "SR1007",
        name: "Egg Fry",
        foodType: "Egg",
        category: "Egg Dish",
        ingredients: [
            starterIngredient("Egg", 6, "piece", 420),
            starterIngredient("Garlic", 30, "g", 45),
            starterIngredient("Ginger", 5, "g", 4),
            starterIngredient("Onion", 175, "g", 70),
            starterIngredient("Tomato", 100, "g", 18),
            starterIngredient("Cooking Oil", 1, "tbsp", 120),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 717,
        caloriesPerServing: 359,
        totalProtein: 40,
        proteinPerServing: 20
    },
    {
        id: "SR1008",
        name: "Green Beans Sautéed",
        foodType: "Vegetarian",
        category: "Vegetable Side",
        ingredients: [
            starterIngredient("Green Beans", 279, "g", 87),
            starterIngredient("Onion", 25, "g", 10),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 137,
        caloriesPerServing: 69,
        totalProtein: 5.3,
        proteinPerServing: 2.7
    },
    {
        id: "SR1009",
        name: "Lauki Santula",
        foodType: "Vegetarian",
        category: "Vegetable Curry",
        ingredients: [
            starterIngredient("Bottle Gourd", 580, "g", 81),
            starterIngredient("Arbi", 55, "g", 62),
            starterIngredient("Garlic", 10, "g", 15),
            starterIngredient("Onion", 45, "g", 18),
            starterIngredient("Tomato", 45, "g", 8),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 246,
        caloriesPerServing: 123,
        totalProtein: 5,
        proteinPerServing: 2.5
    },
    {
        id: "SR1010",
        name: "Masur Masala Dal",
        foodType: "Vegetarian",
        category: "Dal",
        ingredients: [
            starterIngredient("Masur Dal, dry", 180, "g", 634),
            starterIngredient("Garlic", 5, "g", 7),
            starterIngredient("Ginger", 3, "g", 2),
            starterIngredient("Onion", 30, "g", 12),
            starterIngredient("Tomato", 20, "g", 4),
            starterIngredient("Cooking Oil", 2, "tsp", 80)
        ],
        totalServings: 2,
        totalCalories: 739,
        caloriesPerServing: 370,
        totalProtein: 46,
        proteinPerServing: 23
    },
    {
        id: "SR1011",
        name: "Methi Saag Bhaji",
        foodType: "Vegetarian",
        category: "Leafy Vegetable",
        ingredients: [
            starterIngredient("Fenugreek Leaves", 155, "g", 76),
            starterIngredient("Potato, raw", 147, "g", 113),
            starterIngredient("Garlic", 10, "g", 15),
            starterIngredient("Onion", 47, "g", 19),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 262,
        caloriesPerServing: 131,
        totalProtein: 8.5,
        proteinPerServing: 4.3
    },
    {
        id: "SR1012",
        name: "Methi Saag Dal",
        foodType: "Vegetarian",
        category: "Dal",
        ingredients: [
            starterIngredient("Fenugreek Leaves", 99, "g", 49),
            starterIngredient("Moong Dal, dry", 85, "g", 295),
            starterIngredient("Tomato", 75, "g", 14),
            starterIngredient("Garlic", 20, "g", 30),
            starterIngredient("Ginger", 3, "g", 2),
            starterIngredient("Onion", 90, "g", 36),
            starterIngredient("Cooking Oil", 1, "tbsp", 120),
            starterIngredient("Ghee", 1, "tsp", 37)
        ],
        totalServings: 4,
        totalCalories: 810,
        caloriesPerServing: 203,
        totalProtein: 43,
        proteinPerServing: 10.8
    },
    {
        id: "SR1013",
        name: "Odia Dalma",
        foodType: "Vegetarian",
        category: "Dal and Vegetable Curry",
        ingredients: [
            starterIngredient("Pumpkin", 227, "g", 59),
            starterIngredient("Potato, raw", 124, "g", 95),
            starterIngredient("Arbi", 55, "g", 62),
            starterIngredient("Eggplant", 120, "g", 30),
            starterIngredient("Green Beans", 80, "g", 25),
            starterIngredient("Raw Banana", 80, "g", 98),
            starterIngredient("Toor Dal, dry", 160, "g", 549),
            starterIngredient("Moong Dal, dry", 70, "g", 243),
            starterIngredient("Chana Dal, dry", 30, "g", 108),
            starterIngredient("Ghee", 1, "tbsp", 112)
        ],
        totalServings: 4,
        totalCalories: 1389,
        caloriesPerServing: 347,
        totalProtein: 66,
        proteinPerServing: 16.5
    },
    {
        id: "SR1014",
        name: "Omelet",
        foodType: "Egg",
        category: "Egg Dish",
        ingredients: [
            starterIngredient("Egg", 6, "piece", 420),
            starterIngredient("Onion", 50, "g", 20),
            starterIngredient("Tomato", 60, "g", 11),
            starterIngredient("Garlic", 6, "g", 9),
            starterIngredient("Cheese Slice", 2, "piece", 100),
            starterIngredient("Butter", 7, "g", 40)
        ],
        totalServings: 2,
        totalCalories: 600,
        caloriesPerServing: 300,
        totalProtein: 43,
        proteinPerServing: 21.5
    },
    {
        id: "SR1015",
        name: "Simple Toor Dal",
        foodType: "Vegetarian",
        category: "Dal",
        ingredients: [
            starterIngredient("Toor Dal, dry", 100, "g", 343),
            starterIngredient("Onion", 10, "g", 4),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 387,
        caloriesPerServing: 194,
        totalProtein: 22,
        proteinPerServing: 11
    },
    {
        id: "SR1016",
        name: "Soya Chunk Recipe",
        foodType: "Vegetarian",
        category: "Soya Curry",
        ingredients: [
            starterIngredient("Soya chunks, dry", 80, "g", 276),
            starterIngredient("Garlic and Ginger", 10, "g", 11),
            starterIngredient("Capsicum", 20, "g", 4),
            starterIngredient("Onion", 45, "g", 18),
            starterIngredient("Cooking Oil", 1, "tsp", 40)
        ],
        totalServings: 2,
        totalCalories: 353,
        caloriesPerServing: 177,
        totalProtein: 43,
        proteinPerServing: 21.5
    },
    {
        id: "SR1017",
        name: "Vegetable Santula",
        foodType: "Vegetarian",
        category: "Vegetable Curry",
        ingredients: [
            starterIngredient("Pumpkin", 115, "g", 30),
            starterIngredient("Eggplant", 60, "g", 15),
            starterIngredient("Carrot", 50, "g", 21),
            starterIngredient("Green Beans", 25, "g", 8),
            starterIngredient("Raw Papaya", 120, "g", 52),
            starterIngredient("Green Peas", 40, "g", 32),
            starterIngredient("Raw Banana", 40, "g", 49),
            starterIngredient("Arbi", 40, "g", 45),
            starterIngredient("Potato, raw", 100, "g", 77),
            starterIngredient("Onion", 80, "g", 32),
            starterIngredient("Garlic", 20, "g", 30),
            starterIngredient("Cooking Oil", 1, "tbsp", 120)
        ],
        totalServings: 2,
        totalCalories: 468,
        caloriesPerServing: 234,
        totalProtein: 11.4,
        proteinPerServing: 5.7
    },
    {
        id: "SR1018",
        name: "Veggie Fried Rice",
        foodType: "Vegetarian",
        category: "Rice",
        ingredients: [
            starterIngredient("White Rice, cooked", 400, "g", 520),
            starterIngredient("Green Beans", 59, "g", 18),
            starterIngredient("Beetroot", 55, "g", 24),
            starterIngredient("Onion", 80, "g", 32),
            starterIngredient("Olive Oil", 1, "tbsp", 120)
        ],
        totalServings: 2,
        totalCalories: 714,
        caloriesPerServing: 357,
        totalProtein: 15,
        proteinPerServing: 7.5
    },
    {
        id: "starter-shrimp-pasta",
        name: "Shrimp Pasta Recipe",
        foodType: "Seafood",
        category: "Pasta",
        ingredients: [
            starterIngredient("Pasta, dry", 56, "g", 200),
            starterIngredient("Zucchini", 40, "g", 6.8),
            starterIngredient("Bell Pepper", 43, "g", 11.18),
            starterIngredient("Tomato", 124, "g", 22.32),
            starterIngredient("Jalapeño", 23, "g", 6.67),
            starterIngredient("Broccoli", 36, "g", 12.24),
            starterIngredient("Carrot", 19, "g", 7.79),
            starterIngredient("Spinach", 50, "g", 11.5),
            starterIngredient("Garlic", 4, "g", 5.96),
            starterIngredient("Onion", 41, "g", 16.4),
            starterIngredient("Cooking Oil", 1, "tbsp", 120),
            starterIngredient("Egg, poached", 1, "piece", 84),
            starterIngredient("Feta Cheese", 1, "tbsp", 15)
        ],
        totalServings: 1,
        totalCalories: 519.86,
        caloriesPerServing: 519.86
    },
    {
        id: "starter-soya-chunk-pasta",
        name: "Soya Chunk Pasta Recipe",
        foodType: "Vegetarian",
        category: "Pasta",
        ingredients: [
            starterIngredient("Pasta, dry", 15, "g", 53.57),
            starterIngredient("Soya chunks, dry", 31, "g", 109),
            starterIngredient("Zucchini", 40, "g", 6.8),
            starterIngredient("Bell Pepper", 50, "g", 13),
            starterIngredient("Tomato", 90, "g", 16.2),
            starterIngredient("Jalapeño", 25, "g", 7.25),
            starterIngredient("Broccoli", 36, "g", 12.24),
            starterIngredient("Carrot", 20, "g", 8.2),
            starterIngredient("Spinach", 50, "g", 11.5),
            starterIngredient("Green Beans", 50, "g", 17),
            starterIngredient("Cauliflower", 50, "g", 12.5),
            starterIngredient("Garlic", 5, "g", 7.45),
            starterIngredient("Onion", 50, "g", 20),
            starterIngredient("Cooking Oil", 1, "tbsp", 120),
            starterIngredient("Feta Cheese", 1, "tbsp", 15)
        ],
        totalServings: 1,
        totalCalories: 429.71,
        caloriesPerServing: 429.71
    },
    {
        id: "starter-stir-fried-vegetable-platter",
        name: "Stir-Fried Vegetable Platter",
        foodType: "Vegetarian",
        category: "Vegetable Side",
        ingredients: [
            starterIngredient("Zucchini", 40, "g", 6.8),
            starterIngredient("Bell Pepper", 50, "g", 13),
            starterIngredient("Cherry Tomato", 50, "g", 9),
            starterIngredient("Broccoli", 40, "g", 13.6),
            starterIngredient("Carrot", 20, "g", 8.2),
            starterIngredient("Spinach", 50, "g", 11.5),
            starterIngredient("Green Beans", 50, "g", 17),
            starterIngredient("Cauliflower", 50, "g", 12.5),
            starterIngredient("Garlic", 4, "g", 5.96),
            starterIngredient("Onion", 50, "g", 20),
            starterIngredient("Eggplant", 30, "g", 7.2),
            starterIngredient("Cooking Oil", 1, "tsp", 45),
            starterIngredient("Feta Cheese", 1, "tsp", 15)
        ],
        totalServings: 1,
        totalCalories: 184.76,
        caloriesPerServing: 184.76
    },
    {
        id: "starter-gravy-grilled-boneless-goat",
        name: "Gravy over Grilled Boneless Goat Meat",
        foodType: "Goat",
        category: "Goat Curry",
        ingredients: [
            starterIngredient("Boneless Goat Meat", 142, "g", 355),
            starterIngredient("Dry Masala", null, "unspecified", 5),
            starterIngredient("Garlic", 10, "g", 14.9),
            starterIngredient("Onion", 40, "g", 16),
            starterIngredient("Ginger", 5, "g", 4),
            starterIngredient("Tomato", 30, "g", 5.4),
            starterIngredient("Dry Masala", null, "unspecified", 5),
            starterIngredient("Cooking Oil", 0.5, "tbsp", 60)
        ],
        totalServings: 1,
        totalCalories: 465.30,
        caloriesPerServing: 465.30
    },
    {
        id: "starter-curry-chicken",
        name: "Curry Chicken",
        foodType: "Chicken",
        category: "Chicken Curry",
        ingredients: [
            starterIngredient("Chicken breast, raw, skinless", 180, "g", 297),
            starterIngredient("Garlic", 10, "g", 14.9),
            starterIngredient("Onion", 40, "g", 16),
            starterIngredient("Ginger", 5, "g", 4),
            starterIngredient("Tomato", 30, "g", 5.4),
            starterIngredient("Dry Masala", null, "unspecified", 5),
            starterIngredient("Cooking Oil", 0.5, "tbsp", 60)
        ],
        totalServings: 1,
        totalCalories: 402.30,
        caloriesPerServing: 402.30
    },
    {
        id: "starter-veggie-egg-fried-rice",
        name: "Veggie-Egg Fried Rice",
        foodType: "Egg",
        category: "Fried Rice",
        ingredients: [
            starterIngredient("Cooked Rice–Quinoa Mix, 70:30", 150, "g", 180),
            starterIngredient("Egg, whole", 1, "piece", 84),
            starterIngredient("Zucchini", 40, "g", 7),
            starterIngredient("Bell Pepper", 50, "g", 13),
            starterIngredient("Broccoli", 40, "g", 14),
            starterIngredient("Carrot", 20, "g", 8),
            starterIngredient("Spinach", 30, "g", 6),
            starterIngredient("Green Beans", 50, "g", 17),
            starterIngredient("Cauliflower", 50, "g", 13),
            starterIngredient("Onion", 50, "g", 20),
            starterIngredient("Cooking Oil", 1, "tsp", 45)
        ],
        totalServings: 1,
        totalCalories: 407,
        caloriesPerServing: 407
    }
];

/*
================================================
STARTER INGREDIENT NUTRITION DATABASE

Dry/cooked forms and chicken cuts are intentionally separate.
Reference values support calorie calculation only in Version 1.0.
================================================
*/

const ingredientDatabase = [
    { id: "I001", name: "Potato, raw", aliases: ["Potato", "Aloo", "Alu"], referenceCalories: 77, referenceAmount: 100, referenceUnit: "g" },
    { id: "I002", name: "Potato, boiled", aliases: ["Boiled Potato"], referenceCalories: 87, referenceAmount: 100, referenceUnit: "g" },
    { id: "I003", name: "Onion", aliases: [], referenceCalories: 40, referenceAmount: 100, referenceUnit: "g" },
    { id: "I004", name: "Tomato", aliases: [], referenceCalories: 18, referenceAmount: 100, referenceUnit: "g" },
    { id: "I005", name: "Garlic", aliases: [], referenceCalories: 149, referenceAmount: 100, referenceUnit: "g" },
    { id: "I006", name: "Ginger", aliases: [], referenceCalories: 80, referenceAmount: 100, referenceUnit: "g" },
    { id: "I007", name: "Garlic and Ginger", aliases: ["Ginger Garlic", "Garlic Ginger"], referenceCalories: 110, referenceAmount: 100, referenceUnit: "g" },
    { id: "I008", name: "Pumpkin", aliases: [], referenceCalories: 26, referenceAmount: 100, referenceUnit: "g" },
    { id: "I009", name: "Eggplant", aliases: ["Brinjal"], referenceCalories: 24, referenceAmount: 100, referenceUnit: "g" },
    { id: "I010", name: "Carrot", aliases: [], referenceCalories: 41, referenceAmount: 100, referenceUnit: "g" },
    { id: "I011", name: "Green Beans", aliases: ["Beans"], referenceCalories: 34, referenceAmount: 100, referenceUnit: "g" },
    { id: "I012", name: "Green Peas", aliases: ["Peas"], referenceCalories: 81, referenceAmount: 100, referenceUnit: "g" },
    { id: "I013", name: "Raw Papaya", aliases: ["Green Papaya"], referenceCalories: 43, referenceAmount: 100, referenceUnit: "g" },
    { id: "I014", name: "Raw Banana", aliases: ["Green Banana", "Plantain"], referenceCalories: 122, referenceAmount: 100, referenceUnit: "g" },
    { id: "I015", name: "Arbi", aliases: ["Taro"], referenceCalories: 112, referenceAmount: 100, referenceUnit: "g" },
    { id: "I016", name: "Bottle Gourd", aliases: ["Lauki"], referenceCalories: 14, referenceAmount: 100, referenceUnit: "g" },
    { id: "I017", name: "Fenugreek Leaves", aliases: ["Methi", "Methi Saag"], referenceCalories: 49, referenceAmount: 100, referenceUnit: "g" },
    { id: "I018", name: "Bell Pepper", aliases: ["Capsicum"], referenceCalories: 26, referenceAmount: 100, referenceUnit: "g" },
    { id: "I019", name: "Beetroot", aliases: ["Beet"], referenceCalories: 43, referenceAmount: 100, referenceUnit: "g" },
    { id: "I020", name: "Chicken breast, raw, skinless", aliases: ["Raw Skinless Chicken Breast", "Chicken Breast", "Chicken Brest"], referenceCalories: 297, referenceAmount: 180, referenceUnit: "g" },
    { id: "I021", name: "Chicken breast, cooked, skinless", aliases: ["Cooked Skinless Chicken Breast"], referenceCalories: 165, referenceAmount: 100, referenceUnit: "g" },
    { id: "I022", name: "Chicken thigh, raw, skinless", aliases: ["Raw Skinless Chicken Thigh"], referenceCalories: 121, referenceAmount: 100, referenceUnit: "g" },
    { id: "I023", name: "Chicken thigh, cooked, skinless", aliases: ["Cooked Skinless Chicken Thigh"], referenceCalories: 209, referenceAmount: 100, referenceUnit: "g" },
    { id: "I024", name: "Chicken thigh, raw, with skin", aliases: ["Raw Chicken Thigh With Skin"], referenceCalories: 161, referenceAmount: 100, referenceUnit: "g" },
    { id: "I025", name: "Rohu fish, raw", aliases: ["Rohu", "Raw Rohu"], referenceCalories: 97, referenceAmount: 100, referenceUnit: "g" },
    { id: "I026", name: "Shrimp, raw", aliases: ["Raw Shrimp", "Prawn"], referenceCalories: 85, referenceAmount: 100, referenceUnit: "g" },
    { id: "I027", name: "White Rice, cooked", aliases: ["Cooked White Rice", "Cooked Rice", "Rice"], referenceCalories: 130, referenceAmount: 100, referenceUnit: "g" },
    { id: "I028", name: "Basmati Rice, cooked", aliases: ["Cooked Basmati Rice"], referenceCalories: 121, referenceAmount: 100, referenceUnit: "g" },
    { id: "I029", name: "White Rice, dry", aliases: ["Dry White Rice", "Uncooked White Rice"], referenceCalories: 365, referenceAmount: 100, referenceUnit: "g" },
    { id: "I030", name: "Wheat Flour", aliases: ["Atta"], referenceCalories: 364, referenceAmount: 100, referenceUnit: "g" },
    { id: "I031", name: "Masur Dal, dry", aliases: ["Masur Dal", "Red Lentils", "Dry Masur Dal"], referenceCalories: 352, referenceAmount: 100, referenceUnit: "g" },
    { id: "I032", name: "Toor Dal, dry", aliases: ["Toor Dal", "Arhar Dal", "Dry Toor Dal"], referenceCalories: 343, referenceAmount: 100, referenceUnit: "g" },
    { id: "I033", name: "Moong Dal, dry", aliases: ["Moong Dal", "Split Moong Dal", "Split Yellow Moong Dal"], referenceCalories: 347, referenceAmount: 100, referenceUnit: "g" },
    { id: "I034", name: "Chana Dal, dry", aliases: ["Chana Dal", "Dry Chana Dal"], referenceCalories: 360, referenceAmount: 100, referenceUnit: "g" },
    { id: "I035", name: "Chickpeas, dry", aliases: ["Chickpeas", "Chole", "Dry Chickpeas"], referenceCalories: 364, referenceAmount: 100, referenceUnit: "g" },
    { id: "I036", name: "Soya chunks, dry", aliases: ["Soya", "Soya Chunk", "Soya Chunks", "Soy Chunk", "Soy Chunks"], referenceCalories: 109, referenceAmount: 31, referenceUnit: "g" },
    { id: "I037", name: "Egg, whole", aliases: ["Egg", "Eggs", "Whole Egg"], referenceCalories: 84, referenceAmount: 1, referenceUnit: "piece" },
    { id: "I038", name: "Cooking Oil", aliases: ["Oil", "Mustard Oil", "Vegetable Oil"], referenceCalories: 120, referenceAmount: 1, referenceUnit: "tbsp", unitReferences: { tsp: { calories: 45, amount: 1 } } },
    { id: "I039", name: "Olive Oil", aliases: [], referenceCalories: 120, referenceAmount: 1, referenceUnit: "tbsp" },
    { id: "I040", name: "Ghee", aliases: [], referenceCalories: 112, referenceAmount: 1, referenceUnit: "tbsp" },
    { id: "I041", name: "Butter", aliases: [], referenceCalories: 717, referenceAmount: 100, referenceUnit: "g" },
    { id: "I042", name: "Cheese Slice", aliases: ["Cheese Slices"], referenceCalories: 50, referenceAmount: 1, referenceUnit: "piece" },
    { id: "I043", name: "Dry Masala", aliases: ["Spices", "Dry Spices", "Masala"], referenceCalories: 5, referenceAmount: 1, referenceUnit: "unspecified" },
    { id: "I044", name: "Pasta, dry", aliases: ["Pasta", "Dry Pasta"], referenceCalories: 200, referenceAmount: 56, referenceUnit: "g" },
    { id: "I045", name: "Zucchini", aliases: ["Zucchine"], referenceCalories: 17, referenceAmount: 100, referenceUnit: "g" },
    { id: "I046", name: "Cherry Tomato", aliases: ["Cherry Tomatoes"], referenceCalories: 18, referenceAmount: 100, referenceUnit: "g" },
    { id: "I047", name: "Jalapeño", aliases: ["Jalapeno"], referenceCalories: 29, referenceAmount: 100, referenceUnit: "g" },
    { id: "I048", name: "Broccoli", aliases: [], referenceCalories: 34, referenceAmount: 100, referenceUnit: "g" },
    { id: "I049", name: "Spinach", aliases: [], referenceCalories: 23, referenceAmount: 100, referenceUnit: "g" },
    { id: "I050", name: "Egg, poached", aliases: ["Egg Poach", "Poached Egg"], referenceCalories: 84, referenceAmount: 1, referenceUnit: "piece" },
    { id: "I051", name: "Feta Cheese", aliases: ["Feta"], referenceCalories: 15, referenceAmount: 1, referenceUnit: "tbsp", unitReferences: { tsp: { calories: 15, amount: 1 } } },
    { id: "I052", name: "Cauliflower", aliases: ["Cauli Flower"], referenceCalories: 25, referenceAmount: 100, referenceUnit: "g" },
    { id: "I053", name: "Boneless Goat Meat", aliases: ["Goat Meat, Boneless", "Boneless Goat"], referenceCalories: 355, referenceAmount: 142, referenceUnit: "g" },
    { id: "I054", name: "Cooked Rice–Quinoa Mix, 70:30", aliases: ["Quinoa-Rice Cooked", "Rice-Quinoa Cooked", "Kinua-Rice", "White Rice-Kinua Cooked", "Rice Quinoa Mix", "Cooked Rice Quinoa"], referenceCalories: 120, referenceAmount: 100, referenceUnit: "g" }
];
