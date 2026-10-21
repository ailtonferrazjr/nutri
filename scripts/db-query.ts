import { config } from "dotenv";
import postgres from "postgres";

config();

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const QUERIES: Record<string, string> = {
  pantry: `SELECT name, display_name, category, quantity, unit FROM pantry_items ORDER BY category, name`,
  users: `SELECT id, name, restrictions, preferences FROM users`,
  recipes: `SELECT id, name, tags, servings FROM recipes ORDER BY name`,
  grocery: `SELECT gl.id, gl.name, gl.status, COUNT(gi.id) as items FROM grocery_lists gl LEFT JOIN grocery_items gi ON gi.list_id = gl.id GROUP BY gl.id, gl.name, gl.status ORDER BY gl.created_at DESC`,
  "receipt-recent": `SELECT id, store, total, date FROM receipts ORDER BY date DESC LIMIT 10`,
};

async function main() {
  const [queryName, ...rest] = process.argv.slice(2);

  if (!queryName || queryName === "help") {
    console.log("Usage: pnpm db:query <query-name | raw-sql>\n");
    console.log("Named queries:");
    for (const [name, q] of Object.entries(QUERIES)) {
      console.log(`  ${name.padEnd(20)} ${q.slice(0, 60)}...`);
    }
    console.log(`\nOr pass raw SQL: pnpm db:query "SELECT * FROM pantry_items LIMIT 5"`);
    await sql.end();
    return;
  }

  const query = QUERIES[queryName] ?? [queryName, ...rest].join(" ");
  const rows = await sql.unsafe(query);
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}

main();
