import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('user', 'admin');
  CREATE TYPE "public"."enum_problems_params_type" AS ENUM('number', 'number[]', 'number[][]', 'string', 'string[]', 'boolean', 'boolean[]');
  CREATE TYPE "public"."enum_problems_starter_templates_language" AS ENUM('python', 'javascript', 'cpp', 'go');
  CREATE TYPE "public"."enum_problems_difficulty" AS ENUM('easy', 'medium', 'hard', 'insane');
  CREATE TYPE "public"."enum_problems_judge_mode" AS ENUM('function', 'stdio');
  CREATE TYPE "public"."enum_problems_return_type" AS ENUM('number', 'number[]', 'number[][]', 'string', 'string[]', 'boolean', 'boolean[]');
  CREATE TYPE "public"."enum_matches_mode" AS ENUM('duel', 'solo');
  CREATE TYPE "public"."enum_matches_status" AS ENUM('active', 'finished', 'aborted');
  CREATE TYPE "public"."enum_matches_end_reason" AS ENUM('solved', 'timeout', 'forfeit', 'aborted');
  CREATE TYPE "public"."enum_submissions_language" AS ENUM('python', 'javascript', 'cpp', 'go');
  CREATE TYPE "public"."enum_submissions_status" AS ENUM('pending', 'judging', 'accepted', 'wrong_answer', 'runtime_error', 'compile_error', 'timeout', 'judge_error');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_users_role" DEFAULT 'user' NOT NULL,
  	"rating" numeric DEFAULT 1200,
  	"wins" numeric DEFAULT 0,
  	"losses" numeric DEFAULT 0,
  	"draws" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar,
  	"username" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "problems_params" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"type" "enum_problems_params_type"
  );
  
  CREATE TABLE "problems_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "problems_starter_templates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"language" "enum_problems_starter_templates_language" NOT NULL,
  	"code" varchar NOT NULL
  );
  
  CREATE TABLE "problems" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"difficulty" "enum_problems_difficulty" DEFAULT 'medium' NOT NULL,
  	"judge_mode" "enum_problems_judge_mode" DEFAULT 'function' NOT NULL,
  	"function_name" varchar,
  	"return_type" "enum_problems_return_type",
  	"time_limit_seconds" numeric DEFAULT 900 NOT NULL,
  	"cpu_time_seconds" numeric DEFAULT 5,
  	"statement" jsonb NOT NULL,
  	"constraints" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "test_cases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"problem_id" integer NOT NULL,
  	"label" varchar,
  	"input" varchar NOT NULL,
  	"expected_output" varchar NOT NULL,
  	"is_public" boolean DEFAULT false,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_one_id" integer NOT NULL,
  	"player_two_id" integer,
  	"mode" "enum_matches_mode" DEFAULT 'duel' NOT NULL,
  	"problem_id" integer NOT NULL,
  	"status" "enum_matches_status" DEFAULT 'active' NOT NULL,
  	"end_reason" "enum_matches_end_reason",
  	"winner_id" integer,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"player_one_stats" jsonb,
  	"player_two_stats" jsonb,
  	"ratings" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"author_id" integer NOT NULL,
  	"language" "enum_submissions_language" NOT NULL,
  	"code" varchar NOT NULL,
  	"status" "enum_submissions_status" DEFAULT 'pending' NOT NULL,
  	"test_results" jsonb,
  	"passed_count" numeric DEFAULT 0,
  	"total_count" numeric DEFAULT 0,
  	"judged_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"problems_id" integer,
  	"test_cases_id" integer,
  	"matches_id" integer,
  	"submissions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "problems_params" ADD CONSTRAINT "problems_params_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "problems_tags" ADD CONSTRAINT "problems_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "problems_starter_templates" ADD CONSTRAINT "problems_starter_templates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_player_one_id_users_id_fk" FOREIGN KEY ("player_one_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_player_two_id_users_id_fk" FOREIGN KEY ("player_two_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_problems_fk" FOREIGN KEY ("problems_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_test_cases_fk" FOREIGN KEY ("test_cases_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matches_fk" FOREIGN KEY ("matches_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submissions_fk" FOREIGN KEY ("submissions_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");
  CREATE INDEX "problems_params_order_idx" ON "problems_params" USING btree ("_order");
  CREATE INDEX "problems_params_parent_id_idx" ON "problems_params" USING btree ("_parent_id");
  CREATE INDEX "problems_tags_order_idx" ON "problems_tags" USING btree ("_order");
  CREATE INDEX "problems_tags_parent_id_idx" ON "problems_tags" USING btree ("_parent_id");
  CREATE INDEX "problems_starter_templates_order_idx" ON "problems_starter_templates" USING btree ("_order");
  CREATE INDEX "problems_starter_templates_parent_id_idx" ON "problems_starter_templates" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "problems_slug_idx" ON "problems" USING btree ("slug");
  CREATE INDEX "problems_updated_at_idx" ON "problems" USING btree ("updated_at");
  CREATE INDEX "problems_created_at_idx" ON "problems" USING btree ("created_at");
  CREATE INDEX "test_cases_problem_idx" ON "test_cases" USING btree ("problem_id");
  CREATE INDEX "test_cases_updated_at_idx" ON "test_cases" USING btree ("updated_at");
  CREATE INDEX "test_cases_created_at_idx" ON "test_cases" USING btree ("created_at");
  CREATE INDEX "matches_player_one_idx" ON "matches" USING btree ("player_one_id");
  CREATE INDEX "matches_player_two_idx" ON "matches" USING btree ("player_two_id");
  CREATE INDEX "matches_mode_idx" ON "matches" USING btree ("mode");
  CREATE INDEX "matches_problem_idx" ON "matches" USING btree ("problem_id");
  CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");
  CREATE INDEX "matches_winner_idx" ON "matches" USING btree ("winner_id");
  CREATE INDEX "matches_updated_at_idx" ON "matches" USING btree ("updated_at");
  CREATE INDEX "matches_created_at_idx" ON "matches" USING btree ("created_at");
  CREATE INDEX "submissions_match_idx" ON "submissions" USING btree ("match_id");
  CREATE INDEX "submissions_author_idx" ON "submissions" USING btree ("author_id");
  CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");
  CREATE INDEX "submissions_updated_at_idx" ON "submissions" USING btree ("updated_at");
  CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_problems_id_idx" ON "payload_locked_documents_rels" USING btree ("problems_id");
  CREATE INDEX "payload_locked_documents_rels_test_cases_id_idx" ON "payload_locked_documents_rels" USING btree ("test_cases_id");
  CREATE INDEX "payload_locked_documents_rels_matches_id_idx" ON "payload_locked_documents_rels" USING btree ("matches_id");
  CREATE INDEX "payload_locked_documents_rels_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("submissions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "problems_params" CASCADE;
  DROP TABLE "problems_tags" CASCADE;
  DROP TABLE "problems_starter_templates" CASCADE;
  DROP TABLE "problems" CASCADE;
  DROP TABLE "test_cases" CASCADE;
  DROP TABLE "matches" CASCADE;
  DROP TABLE "submissions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_problems_params_type";
  DROP TYPE "public"."enum_problems_starter_templates_language";
  DROP TYPE "public"."enum_problems_difficulty";
  DROP TYPE "public"."enum_problems_judge_mode";
  DROP TYPE "public"."enum_problems_return_type";
  DROP TYPE "public"."enum_matches_mode";
  DROP TYPE "public"."enum_matches_status";
  DROP TYPE "public"."enum_matches_end_reason";
  DROP TYPE "public"."enum_submissions_language";
  DROP TYPE "public"."enum_submissions_status";`)
}
