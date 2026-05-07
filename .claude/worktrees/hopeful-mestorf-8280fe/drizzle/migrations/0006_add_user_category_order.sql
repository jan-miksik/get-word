ALTER TABLE "users" ADD COLUMN "category_order" text[] DEFAULT '{}'::text[] NOT NULL;
