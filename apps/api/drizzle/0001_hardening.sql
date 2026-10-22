-- Order numbers come from a sequence (CR-100001, CR-100002, ...)
CREATE SEQUENCE IF NOT EXISTS "cr"."order_number_seq" START 1;
--> statement-breakpoint
-- Defence in depth: the cr schema is not exposed through the Data API, and RLS with no policies
-- denies the anon/authenticated roles even if it ever were. The service connects as the owner.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'cr' LOOP
    EXECUTE format('ALTER TABLE cr.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "cr" FROM PUBLIC;
