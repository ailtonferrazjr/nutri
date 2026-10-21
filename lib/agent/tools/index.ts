// Agent tools, grouped by domain. The object below keeps the original tool
// order so the model sees the same tool list as before the split.

import { profileTools } from "./profiles";
import { pantryTools } from "./pantry";
import { receiptTools } from "./receipts";
import { groceryTools } from "./grocery";
import { mercadonaTools } from "./mercadona";
import { recipeTools } from "./recipes";
import { mealPlanTools } from "./meal-plan";

export const agentTools = {
  get_user_profiles: profileTools.get_user_profiles,
  update_user_profile: profileTools.update_user_profile,
  get_pantry: pantryTools.get_pantry,
  add_pantry_item: pantryTools.add_pantry_item,
  remove_pantry_item: pantryTools.remove_pantry_item,
  scan_receipt: receiptTools.scan_receipt,
  create_grocery_list: groceryTools.create_grocery_list,
  get_grocery_list: groceryTools.get_grocery_list,
  check_grocery_item: groceryTools.check_grocery_item,
  search_mercadona: mercadonaTools.search_mercadona,
  get_mercadona_deals: mercadonaTools.get_mercadona_deals,
  create_recipe: recipeTools.create_recipe,
  update_recipe: recipeTools.update_recipe,
  search_recipes: recipeTools.search_recipes,
  rate_recipe: recipeTools.rate_recipe,
  complete_meal: mealPlanTools.complete_meal,
  suggest_recipes_from_pantry: recipeTools.suggest_recipes_from_pantry,
  get_meal_plan: mealPlanTools.get_meal_plan,
  set_meal_plan_entry: mealPlanTools.set_meal_plan_entry,
  remove_meal_plan_entry: mealPlanTools.remove_meal_plan_entry,
};
