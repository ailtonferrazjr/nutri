CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grocery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"quantity" real,
	"unit" text,
	"category" text,
	"checked" boolean DEFAULT false,
	"estimated_price" real,
	"frequency" text,
	"notes" text,
	"mercadona_product_id" text
);
--> statement-breakpoint
CREATE TABLE "grocery_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"store" text,
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "meal_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"meal_type" text NOT NULL,
	"recipe_id" uuid,
	"description" text,
	"for_user" text DEFAULT 'both',
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "mercadona_categories" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"order" integer,
	"level" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mercadona_products" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"slug" text,
	"category_id" integer,
	"category_name" text,
	"packaging" text,
	"unit_price" real,
	"bulk_price" real,
	"reference_price" real,
	"previous_unit_price" real,
	"unit_name" text,
	"unit_size" real,
	"size_format" text,
	"is_pack" boolean DEFAULT false,
	"pack_size" real,
	"total_units" integer,
	"thumbnail" text,
	"share_url" text,
	"badges" jsonb,
	"is_new" boolean DEFAULT false,
	"tax_percentage" real,
	"published" boolean DEFAULT true,
	"scraped_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"category" text,
	"quantity" real,
	"unit" text,
	"expires_at" date,
	"added_at" timestamp DEFAULT now(),
	"source" text DEFAULT 'manual',
	"receipt_id" uuid,
	"mercadona_product_id" text
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text,
	"quantity" real DEFAULT 1,
	"price" real,
	"pantry_item_id" uuid
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store" text,
	"total" real,
	"date" date,
	"image_url" text,
	"raw_parsed" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"servings" integer DEFAULT 2,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"ingredients" text NOT NULL,
	"instructions" text NOT NULL,
	"tags" text,
	"nutrition" text,
	"source" text DEFAULT 'generated',
	"rating" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"restrictions" text DEFAULT '[]',
	"preferences" text DEFAULT '{}',
	"health_goals" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_mercadona_product_id_mercadona_products_id_fk" FOREIGN KEY ("mercadona_product_id") REFERENCES "public"."mercadona_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadona_products" ADD CONSTRAINT "mercadona_products_category_id_mercadona_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."mercadona_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_mercadona_product_id_mercadona_products_id_fk" FOREIGN KEY ("mercadona_product_id") REFERENCES "public"."mercadona_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_pantry_item_id_pantry_items_id_fk" FOREIGN KEY ("pantry_item_id") REFERENCES "public"."pantry_items"("id") ON DELETE no action ON UPDATE no action;