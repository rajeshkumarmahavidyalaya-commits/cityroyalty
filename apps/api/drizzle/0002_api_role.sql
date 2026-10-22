-- A dedicated role for the API so it never connects as the owner/superuser.
-- Created without LOGIN; the deployer enables login with a password out of band:
--   ALTER ROLE cr_api WITH LOGIN PASSWORD '<generated>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cr_api') THEN
    CREATE ROLE cr_api NOLOGIN NOINHERIT;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "cr" TO cr_api;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "cr" TO cr_api;
--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "cr" TO cr_api;
--> statement-breakpoint
-- RLS stays on for every table; only cr_api gets a policy, so anon/authenticated remain denied.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'cr' AND tablename <> '__drizzle_migrations' LOOP
    EXECUTE format('ALTER TABLE cr.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS api_all ON cr.%I', t.tablename);
    EXECUTE format('CREATE POLICY api_all ON cr.%I FOR ALL TO cr_api USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $$;
