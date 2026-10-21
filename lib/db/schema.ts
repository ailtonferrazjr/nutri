import {
  pgTable,
  text,
  uuid,
  real,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// --- Users ---

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  restrictions: text("restrictions").default("[]"),
  preferences: text("preferences").default("{}"),
  healthGoals: text("health_goals").default("{}"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Pantry ---

export const pantryItems = pgTable("pantry_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  category: text("category"),
  quantity: real("quantity"),
  unit: text("unit"),
  expiresAt: date("expires_at"),
  addedAt: timestamp("added_at").defaultNow(),
  source: text("source").default("manual"),
  receiptId: uuid("receipt_id").references(() => receipts.id),
  mercadonaProductId: text("mercadona_product_id").references(
    () => mercadonaProducts.id
  ),
});

// --- Receipts ---

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  store: text("store"),
  total: real("total"),
  date: date("date"),
  imageUrl: text("image_url"),
  rawParsed: text("raw_parsed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"),
  quantity: real("quantity").default(1),
  price: real("price"),
  pantryItemId: uuid("pantry_item_id").references(() => pantryItems.id),
});

// --- Grocery Lists ---

export const groceryLists = pgTable("grocery_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  store: text("store"),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const groceryItems = pgTable("grocery_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  listId: uuid("list_id")
    .notNull()
    .references(() => groceryLists.id),
  name: text("name").notNull(),
  displayName: text("display_name"),
  quantity: real("quantity"),
  unit: text("unit"),
  category: text("category"),
  checked: boolean("checked").default(false),
  estimatedPrice: real("estimated_price"),
  frequency: text("frequency"),
  notes: text("notes"),
  mercadonaProductId: text("mercadona_product_id").references(
    () => mercadonaProducts.id
  ),
});

// --- Recipes ---

export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  servings: integer("servings").default(2),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  ingredients: text("ingredients").notNull(),
  instructions: text("instructions").notNull(),
  tags: text("tags"),
  nutrition: text("nutrition"),
  source: text("source").default("generated"),
  rating: integer("rating"),
  favorite: boolean("favorite").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Recipe Suggestions Pool ---

export const recipeSuggestions = pgTable("recipe_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  mealType: text("meal_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  servings: integer("servings").default(2),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  ingredients: text("ingredients").notNull(),
  instructions: text("instructions").notNull(),
  tags: text("tags"),
  nutrition: text("nutrition"),
  missingIngredients: text("missing_ingredients"),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Recipe Feedback ---

export const recipeFeedback = pgTable("recipe_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  suggestionId: uuid("suggestion_id").references(() => recipeSuggestions.id),
  recipeName: text("recipe_name").notNull(),
  action: text("action").notNull(), // saved, favorited, dismissed, altered
  reason: text("reason"), // not_interested, too_complex, bad_ingredient
  detail: text("detail"), // free text: ingredient name, alter prompt
  tags: text("tags"), // JSON array
  ingredients: text("ingredients"), // JSON array
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Meal Plan ---

export const mealPlan = pgTable("meal_plan", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  mealType: text("meal_type").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id),
  description: text("description"),
  forUser: text("for_user").default("both"),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
});

// --- Mercadona Catalog ---

export const mercadonaCategories = pgTable("mercadona_categories", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  order: integer("order"),
  level: integer("level").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mercadonaProducts = pgTable("mercadona_products", {
  id: text("id").primaryKey(), // Mercadona's product ID (string like "10381")
  displayName: text("display_name").notNull(),
  slug: text("slug"),
  categoryId: integer("category_id").references(() => mercadonaCategories.id),
  categoryName: text("category_name"),
  packaging: text("packaging"),
  unitPrice: real("unit_price"), // price you pay
  bulkPrice: real("bulk_price"), // price per reference unit (€/kg, €/l)
  referencePrice: real("reference_price"),
  previousUnitPrice: real("previous_unit_price"), // for detecting deals
  unitName: text("unit_name"), // "briks", "ud", etc.
  unitSize: real("unit_size"),
  sizeFormat: text("size_format"), // "l", "kg", etc.
  isPack: boolean("is_pack").default(false),
  packSize: real("pack_size"),
  totalUnits: integer("total_units"),
  thumbnail: text("thumbnail"),
  shareUrl: text("share_url"),
  badges: jsonb("badges"),
  isNew: boolean("is_new").default(false),
  taxPercentage: real("tax_percentage"),
  published: boolean("published").default(true),
  scrapedAt: timestamp("scraped_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Conversations ---

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  parts: jsonb("parts").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Types ---

/** Structured shape for the `preferences` JSON column on `users`. */
export type UserPreferences = {
  likes?: string[];
  dislikes?: string[];
  cuisines?: string[];
  mealTiming?: string;
  cookingSkill?: "beginner" | "intermediate" | "advanced";
  budget?: string;
  notes?: string;
};

/** Structured shape for the `health_goals` JSON column on `users`. */
export type UserHealthGoals = {
  goals?: string[];
  conditions?: string[];
};

export type User = typeof users.$inferSelect;
export type PantryItem = typeof pantryItems.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptItem = typeof receiptItems.$inferSelect;
export type GroceryList = typeof groceryLists.$inferSelect;
export type GroceryItem = typeof groceryItems.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type MealPlanEntry = typeof mealPlan.$inferSelect;
export type MercadonaCategory = typeof mercadonaCategories.$inferSelect;
export type MercadonaProduct = typeof mercadonaProducts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
