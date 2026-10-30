CREATE TYPE "public"."sync_direction" AS ENUM('wix_to_hs', 'hs_to_wix', 'bi');--> statement-breakpoint
CREATE TABLE "id_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"wix_instance_id" varchar(255) NOT NULL,
	"wix_contact_id" varchar(255) NOT NULL,
	"hs_contact_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"wix_instance_id" varchar(255) NOT NULL,
	"wix_field" varchar(255) NOT NULL,
	"hs_field" varchar(255) NOT NULL,
	"direction" "sync_direction" DEFAULT 'bi' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"wix_instance_id" varchar(255) PRIMARY KEY NOT NULL,
	"hubspot_portal_id" varchar(100),
	"hubspot_access_token" text NOT NULL,
	"hubspot_refresh_token" text NOT NULL,
	"token_type" varchar(50) DEFAULT 'bearer' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "id_map_wix_contact_unique" ON "id_map" USING btree ("wix_instance_id","wix_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "id_map_hs_contact_unique" ON "id_map" USING btree ("wix_instance_id","hs_contact_id");--> statement-breakpoint
CREATE INDEX "id_map_instance_idx" ON "id_map" USING btree ("wix_instance_id");--> statement-breakpoint
CREATE INDEX "mappings_instance_idx" ON "mappings" USING btree ("wix_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mappings_instance_pair_unique" ON "mappings" USING btree ("wix_instance_id","wix_field","hs_field");--> statement-breakpoint
CREATE INDEX "tokens_portal_id_idx" ON "tokens" USING btree ("hubspot_portal_id");