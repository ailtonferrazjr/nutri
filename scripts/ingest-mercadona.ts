import { config } from "dotenv";
import { readFileSync } from "fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

config();

const INPUT_FILE = "scripts/mercadona-data.json";

interface ScrapedData {
  warehouseCode: string;
  postalCode: string;
  categories: Array<{
    id: number;
    name: string;
    parentId: number | null;
    order: number;
    level: number;
  }>;
  products: Array<{
    id: string;
    displayName: string;
    slug: string;
    categoryId: number;
    categoryName: string;
    packaging: string | null;
    unitPrice: number | null;
    bulkPrice: number | null;
    referencePrice: number | null;
    previousUnitPrice: number | null;
    unitName: string | null;
    unitSize: number | null;
    sizeFormat: string | null;
    isPack: boolean;
    packSize: number | null;
    totalUnits: number | null;
    thumbnail: string;
    shareUrl: string;
    badges: Record<string, boolean>;
    isNew: boolean;
    taxPercentage: number | null;
    published: boolean;
  }>;
  scrapedAt: string;
}

async function main() {
  console.log("📥 Mercadona Data Ingestion\n");

  const raw = readFileSync(INPUT_FILE, "utf-8");
  const data: ScrapedData = JSON.parse(raw);

  console.log(`   Source: ${INPUT_FILE}`);
  console.log(`   Categories: ${data.categories.length}`);
  console.log(`   Products: ${data.products.length}`);
  console.log(`   Scraped at: ${data.scrapedAt}\n`);

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  const now = new Date();

  // 1. Upsert categories
  console.log("📂 Upserting categories...");
  const BATCH_SIZE = 100;

  for (let i = 0; i < data.categories.length; i += BATCH_SIZE) {
    const batch = data.categories.slice(i, i + BATCH_SIZE);
    await db
      .insert(schema.mercadonaCategories)
      .values(
        batch.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          order: c.order,
          level: c.level,
          updatedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: schema.mercadonaCategories.id,
        set: {
          name: sql`excluded.name`,
          parentId: sql`excluded.parent_id`,
          order: sql`excluded."order"`,
          level: sql`excluded.level`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  console.log(`   ✅ ${data.categories.length} categories upserted`);

  // 2. Upsert products
  console.log("📦 Upserting products...");

  for (let i = 0; i < data.products.length; i += BATCH_SIZE) {
    const batch = data.products.slice(i, i + BATCH_SIZE);
    await db
      .insert(schema.mercadonaProducts)
      .values(
        batch.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          slug: p.slug,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          packaging: p.packaging,
          unitPrice: p.unitPrice,
          bulkPrice: p.bulkPrice,
          referencePrice: p.referencePrice,
          previousUnitPrice: p.previousUnitPrice,
          unitName: p.unitName,
          unitSize: p.unitSize,
          sizeFormat: p.sizeFormat,
          isPack: p.isPack,
          packSize: p.packSize,
          totalUnits: p.totalUnits,
          thumbnail: p.thumbnail,
          shareUrl: p.shareUrl,
          badges: p.badges,
          isNew: p.isNew,
          taxPercentage: p.taxPercentage,
          published: p.published,
          scrapedAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: schema.mercadonaProducts.id,
        set: {
          displayName: sql`excluded.display_name`,
          slug: sql`excluded.slug`,
          categoryId: sql`excluded.category_id`,
          categoryName: sql`excluded.category_name`,
          packaging: sql`excluded.packaging`,
          unitPrice: sql`excluded.unit_price`,
          bulkPrice: sql`excluded.bulk_price`,
          referencePrice: sql`excluded.reference_price`,
          previousUnitPrice: sql`excluded.previous_unit_price`,
          unitName: sql`excluded.unit_name`,
          unitSize: sql`excluded.unit_size`,
          sizeFormat: sql`excluded.size_format`,
          isPack: sql`excluded.is_pack`,
          packSize: sql`excluded.pack_size`,
          totalUnits: sql`excluded.total_units`,
          thumbnail: sql`excluded.thumbnail`,
          shareUrl: sql`excluded.share_url`,
          badges: sql`excluded.badges`,
          isNew: sql`excluded.is_new`,
          taxPercentage: sql`excluded.tax_percentage`,
          published: sql`excluded.published`,
          scrapedAt: sql`excluded.scraped_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    process.stdout.write(`   ${Math.min(i + BATCH_SIZE, data.products.length)}/${data.products.length}\r`);
  }
  console.log(`   ✅ ${data.products.length} products upserted`);

  // 3. Summary
  const [{ count: catCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.mercadonaCategories);
  const [{ count: prodCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.mercadonaProducts);

  console.log(`\n📊 Database totals:`);
  console.log(`   Categories: ${catCount}`);
  console.log(`   Products: ${prodCount}`);

  await client.end();
}

main().catch(console.error);
