import { chromium, type Page } from "playwright";
import { writeFileSync } from "fs";

// Mercadona prices and availability depend on the warehouse that serves a postal code.
const POSTAL_CODE = process.env.MERCADONA_POSTAL_CODE ?? "28001";
const BASE_URL = "https://tienda.mercadona.es";
const OUTPUT_FILE = "scripts/mercadona-data.json";

interface ApiProduct {
  id: string;
  slug: string;
  display_name: string;
  packaging: string | null;
  published: boolean;
  share_url: string;
  thumbnail: string;
  badges: Record<string, boolean>;
  categories: Array<{ id: number; name: string; level: number; order: number }>;
  price_instructions: {
    iva: number | null;
    is_new: boolean;
    is_pack: boolean;
    pack_size: number | null;
    unit_name: string | null;
    unit_size: number | null;
    bulk_price: string;
    unit_price: string;
    total_units: number | null;
    size_format: string | null;
    tax_percentage: string | null;
    reference_price: string | null;
    previous_unit_price: string | null;
  };
}

interface ScrapedProduct {
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
}

interface ScrapedCategory {
  id: number;
  name: string;
  parentId: number | null;
  order: number;
  level: number;
}

function parseProduct(product: ApiProduct): ScrapedProduct {
  const p = product.price_instructions;
  const cat = product.categories?.[0];
  return {
    id: product.id,
    displayName: product.display_name,
    slug: product.slug,
    categoryId: cat?.id ?? 0,
    categoryName: cat?.name ?? "",
    packaging: product.packaging,
    unitPrice: p.unit_price ? parseFloat(p.unit_price) : null,
    bulkPrice: p.bulk_price ? parseFloat(p.bulk_price) : null,
    referencePrice: p.reference_price ? parseFloat(p.reference_price) : null,
    previousUnitPrice: p.previous_unit_price
      ? parseFloat(p.previous_unit_price)
      : null,
    unitName: p.unit_name,
    unitSize: p.unit_size,
    sizeFormat: p.size_format ?? null,
    isPack: p.is_pack ?? false,
    packSize: p.pack_size,
    totalUnits: p.total_units,
    thumbnail: product.thumbnail,
    shareUrl: product.share_url,
    badges: product.badges ?? {},
    isNew: p.is_new ?? false,
    taxPercentage: p.tax_percentage ? parseFloat(p.tax_percentage) : null,
    published: product.published,
  };
}

async function main() {
  console.log("🚀 Mercadona Catalog Scraper\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "es-ES",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Capture warehouse code — always take the latest value
  let warehouseCode = "";
  page.on("response", async (response) => {
    const match = response.url().match(/[?&]wh=(\w+)/);
    if (match) warehouseCode = match[1];
  });

  try {
    // --- Setup session ---
    console.log("🏪 Navigating to Mercadona...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    const acceptBtn = page.locator('button:has-text("Aceptar")');
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await page.waitForTimeout(1000);
    }

    console.log(`📮 Entering postal code ${POSTAL_CODE}...`);
    const postalInput = page.locator('[data-testid="postal-code-checker-input"]');
    await postalInput.waitFor({ timeout: 10000 });
    await postalInput.fill(POSTAL_CODE);
    await page.waitForTimeout(500);

    await page.locator('button:has-text("CONTINUAR"), button:has-text("Continuar")').first().click();
    await page.waitForTimeout(5000);

    const wh = warehouseCode;
    console.log(`✅ Session ready (warehouse: ${wh})\n`);

    // --- Fetch categories (top-level includes subcategory IDs) ---
    const allProducts: ScrapedProduct[] = [];
    const allCategories: ScrapedCategory[] = [];
    const seenProductIds = new Set<string>();

    const catsResponse = await page.evaluate(async (wh: string) => {
      const res = await fetch(`/api/categories/?lang=es&wh=${wh}`);
      return res.json();
    }, wh);

    interface SubCatRef { id: number; name: string; order: number }
    interface TopCat { id: number; name: string; order: number; categories?: SubCatRef[] }

    const topCategories: TopCat[] = catsResponse.results ?? catsResponse;
    console.log(`📂 ${topCategories.length} categories\n`);

    // Collect all subcategory IDs to fetch
    const subCatQueue: Array<{ subId: number; subName: string; parentId: number; parentName: string; order: number }> = [];

    for (const cat of topCategories) {
      allCategories.push({ id: cat.id, name: cat.name, parentId: null, order: cat.order, level: 0 });

      for (const sub of cat.categories ?? []) {
        allCategories.push({ id: sub.id, name: sub.name, parentId: cat.id, order: sub.order, level: 1 });
        subCatQueue.push({ subId: sub.id, subName: sub.name, parentId: cat.id, parentName: cat.name, order: sub.order });
      }
    }

    console.log(`📦 ${subCatQueue.length} subcategories to fetch\n`);

    // --- Fetch each subcategory (these return products) ---
    for (const sub of subCatQueue) {
      const subData = await page.evaluate(
        async ({ subId, wh }: { subId: number; wh: string }) => {
          const res = await fetch(`/api/categories/${subId}/?lang=es&wh=${wh}`);
          if (!res.ok) return null;
          return res.json();
        },
        { subId: sub.subId, wh }
      );

      if (!subData) continue;

      // Subcategory response may have products directly or nested deeper
      let productCount = 0;

      if (subData.categories) {
        // Deeper nesting: sub-subcategories with products
        for (const deepSub of subData.categories as Array<{
          id: number; name: string; order: number; products?: ApiProduct[];
        }>) {
          allCategories.push({
            id: deepSub.id,
            name: deepSub.name,
            parentId: sub.subId,
            order: deepSub.order ?? 0,
            level: 2,
          });

          for (const product of deepSub.products ?? []) {
            if (!seenProductIds.has(product.id)) {
              seenProductIds.add(product.id);
              allProducts.push(parseProduct(product));
              productCount++;
            }
          }
        }
      } else if (subData.products) {
        for (const product of subData.products as ApiProduct[]) {
          if (!seenProductIds.has(product.id)) {
            seenProductIds.add(product.id);
            allProducts.push(parseProduct(product));
            productCount++;
          }
        }
      }

      if (productCount > 0) {
        process.stdout.write(`   ${sub.parentName} > ${sub.subName}: +${productCount} (${allProducts.length} total)\n`);
      }

      await page.waitForTimeout(150);
    }

    console.log(`\n📊 Results:`);
    console.log(`   Categories: ${allCategories.length}`);
    console.log(`   Products: ${allProducts.length}`);

    writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(
        {
          warehouseCode: wh,
          postalCode: POSTAL_CODE,
          categories: allCategories,
          products: allProducts,
          scrapedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(`💾 Saved to ${OUTPUT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
