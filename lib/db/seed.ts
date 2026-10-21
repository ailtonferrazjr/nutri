import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users } from "./schema";

config();

async function seed() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("Seeding users...");

  await db
    .insert(users)
    .values([
      {
        name: "Ana",
        restrictions: JSON.stringify([]),
        preferences: JSON.stringify({
          likes: ["peixe", "arroz", "feijão", "massas", "comida japonesa"],
          dislikes: ["coentro"],
          cuisines: ["brasileira", "japonesa", "italiana"],
          cookingSkill: "intermediate",
        }),
        healthGoals: JSON.stringify({
          goals: ["alimentação equilibrada", "mais proteína no café da manhã"],
          conditions: [],
        }),
      },
      {
        name: "Leo",
        restrictions: JSON.stringify(["vegetariano"]),
        preferences: JSON.stringify({
          likes: ["saladas", "sopas", "grão-de-bico", "cogumelos"],
          dislikes: ["berinjela"],
          cuisines: ["mediterrânea", "indiana", "mexicana"],
          mealTiming: "jantar leve",
          cookingSkill: "beginner",
        }),
        healthGoals: JSON.stringify({
          goals: ["comer mais vegetais", "refeições práticas durante a semana"],
          conditions: [],
        }),
      },
    ])
    .onConflictDoNothing();

  console.log("Done.");
  await client.end();
}

seed().catch(console.error);
