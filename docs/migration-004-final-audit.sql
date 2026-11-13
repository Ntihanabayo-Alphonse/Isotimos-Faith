-- Isotimos Faith: ONE read-only preflight for migration 004 (audit format v1).
-- Run this ENTIRE file once in the intended hosted Supabase SQL Editor.
-- Result: one row, one JSONB column named migration_004_audit.
-- Export the complete result as JSON (or CSV with this one complete JSON cell).
-- Do not send screenshots of clipped cells. Preserve all nested sections/definitions.
--
-- This file is one WITH ... SELECT statement. It reads catalogs only, never member
-- records. It does not call application functions, execute policies/triggers, change
-- roles/settings, install extensions, or apply migrations. Reference function bodies
-- below are inert TEXT values, not executable statements.
--
-- Scope: existing profile/role security from 001/003, required functions/triggers,
-- constraints/permissions, PostgreSQL/pg_trgm/operator capabilities, and 004 conflicts.
-- Storage buckets/policies, SMTP, backfill counts and migration-history repair are
-- excluded: they are not prerequisites for executing 004. Review 005 separately.
--
-- PASS means a stated mechanical check passed, not permission to apply a migration.
-- REVIEW means exact definitions/ownership/extra objects need semantic review.
-- FAIL means the expected pre-004 condition is missing or incompatible.
-- Final GO/NO-GO remains pending review of this COMPLETE exported snapshot.
WITH
client_names(role_name) AS (VALUES ('anon'::text), ('authenticated'::text)),
clients AS (
  SELECT v.role_name, r.oid AS role_oid, r.rolsuper, r.rolbypassrls,
    CASE WHEN r.oid IS NOT NULL THEN pg_catalog.has_schema_privilege(
      r.oid,pg_catalog.to_regnamespace('public'),'USAGE') END AS public_schema_usage,
    CASE WHEN r.oid IS NOT NULL THEN
      (SELECT COALESCE(pg_catalog.jsonb_agg(x.rolname ORDER BY x.rolname), '[]'::jsonb)
       FROM pg_catalog.pg_roles x
       WHERE x.oid <> r.oid AND pg_catalog.pg_has_role(r.oid, x.oid, 'USAGE'))
    ELSE '[]'::jsonb END AS inherited_roles
  FROM client_names v LEFT JOIN pg_catalog.pg_roles r ON r.rolname = v.role_name
),
environment AS (
  SELECT current_user::text AS operator_role,
    (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) AS operator_oid,
    COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), false) AS operator_superuser,
    pg_catalog.current_setting('server_version_num')::integer AS version_num,
    pg_catalog.current_setting('server_version') AS version,
    pg_catalog.to_regnamespace('public') AS public_oid,
    pg_catalog.to_regnamespace('extensions') AS extensions_oid,
    pg_catalog.to_regclass('public.profiles') AS profiles_oid,
    pg_catalog.to_regclass('public.user_roles') AS roles_oid,
    pg_catalog.to_regclass('auth.users') AS auth_users_oid,
    pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CREATE') AS database_create
),
relation_names(schema_name, relation_name, purpose) AS (VALUES
  ('public', 'profiles', 'existing profile security'),
  ('public', 'user_roles', 'preserve role security'),
  ('auth', 'users', 'trusted verification source; no client access'),
  ('public', 'follows', 'must be absent before 004'),
  ('public', 'member_directory', 'must be absent before 004')
),
relations AS (
  SELECT v.*, c.oid, c.relkind, c.relowner,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
    c.reloptions AS options, c.relacl::text AS explicit_acl,
    CASE WHEN c.relkind IN ('v', 'm') THEN pg_catalog.pg_get_viewdef(c.oid, true) END AS view_definition,
    CASE WHEN c.oid IS NOT NULL THEN
      (SELECT COALESCE(pg_catalog.bool_or(pg_catalog.pg_has_role(r.role_oid, c.relowner, 'USAGE')), false)
       FROM clients r WHERE r.role_oid IS NOT NULL)
    END AS client_inherits_owner,
    CASE WHEN c.oid IS NOT NULL THEN
      e.operator_superuser OR pg_catalog.pg_has_role(e.operator_oid, c.relowner, 'USAGE')
    END AS operator_has_owner_rights
  FROM relation_names v
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = v.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = v.relation_name
  CROSS JOIN environment e
),
expected_columns(position, name, type_name, nullable, expected_default) AS (VALUES
  (1, 'id',           'uuid',        false, NULL::text),
  (2, 'username',     'text',        true,  NULL::text),
  (3, 'display_name', 'text',        false, $$''::text$$),
  (4, 'bio',          'text',        false, $$''::text$$),
  (5, 'avatar_url',   'text',        true,  NULL::text),
  (6, 'created_at',   'timestamptz', false, 'now()'),
  (7, 'updated_at',   'timestamptz', false, 'now()')
),
columns AS (
  SELECT r.schema_name, r.relation_name, a.attrelid, a.attnum,
    a.attname::text AS name, t.typname::text AS type_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
    NOT a.attnotnull AS nullable,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression,
    a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
    a.attacl::text AS explicit_acl
  FROM relations r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
    AND (r.schema_name = 'public' OR a.attname IN ('id', 'email_confirmed_at'))
),
profile_columns AS (
  SELECT c.*, ROW_NUMBER() OVER (ORDER BY c.attnum) AS position
  FROM columns c WHERE schema_name = 'public' AND relation_name = 'profiles'
),
column_comparison AS (
  SELECT COALESCE(e.name, a.name) AS name, e.position AS expected_position,
    a.position AS actual_position, e.type_name AS expected_type,
    a.type_name AS actual_type, e.nullable AS expected_nullable,
    a.nullable AS actual_nullable, e.expected_default, a.default_expression AS actual_default,
    COALESCE(e.name IS NOT NULL AND a.name IS NOT NULL AND e.position = a.position
      AND e.type_name = a.type_name AND e.nullable = a.nullable
      AND a.identity_kind = '' AND a.generated_kind = '', false) AS shape_matches_003,
    e.expected_default IS NOT DISTINCT FROM a.default_expression AS default_text_matches_003
  FROM expected_columns e FULL JOIN profile_columns a ON a.name = e.name
),
table_privileges AS (
  SELECT r.schema_name, r.relation_name, c.role_name,
    CASE WHEN r.oid IS NOT NULL AND c.role_oid IS NOT NULL THEN
      pg_catalog.jsonb_build_object(
        'select', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'SELECT'),
        'insert', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'INSERT'),
        'update', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'UPDATE'),
        'delete', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'DELETE'),
        'truncate', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'TRUNCATE'),
        'references', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'REFERENCES'),
        'trigger', pg_catalog.has_table_privilege(c.role_oid, r.oid, 'TRIGGER'),
        'select_any_column', pg_catalog.has_any_column_privilege(c.role_oid, r.oid, 'SELECT'),
        'insert_any_column', pg_catalog.has_any_column_privilege(c.role_oid, r.oid, 'INSERT'),
        'update_any_column', pg_catalog.has_any_column_privilege(c.role_oid, r.oid, 'UPDATE'),
        'reference_any_column', pg_catalog.has_any_column_privilege(c.role_oid, r.oid, 'REFERENCES'))
    END AS effective
  FROM relations r CROSS JOIN clients c
  WHERE r.oid IS NULL OR r.relkind IN ('r', 'p', 'v', 'm', 'f')
),
column_privileges AS (
  SELECT a.schema_name, a.relation_name, a.name AS column_name, c.role_name,
    CASE WHEN c.role_oid IS NOT NULL THEN pg_catalog.has_column_privilege(c.role_oid, a.attrelid, a.attnum, 'SELECT') END AS can_select,
    CASE WHEN c.role_oid IS NOT NULL THEN pg_catalog.has_column_privilege(c.role_oid, a.attrelid, a.attnum, 'INSERT') END AS can_insert,
    CASE WHEN c.role_oid IS NOT NULL THEN pg_catalog.has_column_privilege(c.role_oid, a.attrelid, a.attnum, 'UPDATE') END AS can_update,
    CASE WHEN c.role_oid IS NOT NULL THEN pg_catalog.has_column_privilege(c.role_oid, a.attrelid, a.attnum, 'REFERENCES') END AS can_reference
  FROM columns a CROSS JOIN clients c WHERE a.schema_name = 'public'
),
expected_policies(name, command, roles, using_sql, check_sql) AS (VALUES
  ('profiles_read', 'SELECT', ARRAY['anon','authenticated']::text[],
    'username IS NOT NULL OR (SELECT auth.uid()) = id', NULL::text),
  ('profiles_insert_own', 'INSERT', ARRAY['authenticated']::text[], NULL::text,
    '(SELECT auth.uid()) = id AND (SELECT public.isotimos_profile_email_verified())'),
  ('profiles_update_own', 'UPDATE', ARRAY['authenticated']::text[],
    '(SELECT auth.uid()) = id AND (SELECT public.isotimos_profile_email_verified())',
    '(SELECT auth.uid()) = id AND (SELECT public.isotimos_profile_email_verified())')
),
policies AS (
  SELECT p.schemaname AS schema_name, p.tablename AS relation_name,
    p.policyname::text AS name, p.cmd AS command, p.permissive AS mode,
    ARRAY(SELECT x::text FROM pg_catalog.unnest(p.roles) x ORDER BY x::text) AS roles,
    p.qual AS using_sql, p.with_check AS check_sql
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename IN ('profiles','user_roles','follows')
),
policy_comparison AS (
  SELECT COALESCE(e.name, a.name) AS name,
    e.command AS expected_command, a.command AS actual_command,
    e.roles AS expected_roles, a.roles AS actual_roles, a.mode,
    e.using_sql AS reference_using, a.using_sql AS actual_using,
    e.check_sql AS reference_check, a.check_sql AS actual_check,
    COALESCE(e.name IS NOT NULL AND a.name IS NOT NULL AND e.command = a.command
      AND e.roles = a.roles AND a.mode = 'PERMISSIVE'
      AND ((e.using_sql IS NULL) = (a.using_sql IS NULL))
      AND ((e.check_sql IS NULL) = (a.check_sql IS NULL)), false) AS shape_matches_003,
    'REVIEW full expression semantics; matching names/shape alone is insufficient' AS expression_status
  FROM expected_policies e FULL JOIN
    (SELECT * FROM policies WHERE relation_name = 'profiles') a ON a.name = e.name
),
-- Dollar-quoted reference bodies are TEXT, never invoked or executed.
function_references(signature, result_type, definer, volatility, language_name,
                    empty_search_path, anon_execute, authenticated_execute, reference_body) AS (VALUES
  ('public.current_app_role()', 'pg_catalog.text', true, 's', 'sql', true, false, true,
   $ref$select case when auth.uid() is null then null else coalesce((select role from public.user_roles where user_id = auth.uid()), 'member') end;$ref$),
  ('public.isotimos_profile_email_verified()', 'pg_catalog.bool', true, 's', 'sql', true, false, true,
   $ref$select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);$ref$),
  ('public.ensure_my_profile()', 'public.profiles', true, 'v', 'plpgsql', true, false, true,
   $ref$declare caller_id uuid := auth.uid(); result public.profiles; begin if not public.isotimos_profile_email_verified() then raise exception 'A verified email session is required' using errcode = '42501'; end if; insert into public.profiles (id) values (caller_id) on conflict (id) do nothing; select * into strict result from public.profiles where id = caller_id; return result; end;$ref$),
  ('public.set_profile_updated_at()', 'pg_catalog.trigger', false, 'v', 'plpgsql', true, false, false,
   $ref$begin new.updated_at := clock_timestamp(); return new; end;$ref$),
  ('auth.uid()', 'pg_catalog.uuid', NULL::boolean, NULL::text, NULL::text, false, true, true, NULL::text)
),
routine_names(schema_name, name) AS (VALUES
  ('public','current_app_role'), ('public','isotimos_profile_email_verified'),
  ('public','ensure_my_profile'), ('public','set_profile_updated_at'),
  ('auth','uid'), ('public','discover_people')
),
routines AS (
  SELECT n.nspname AS schema_name, p.proname AS name, p.oid,
    p.oid::regprocedure::text AS signature, p.prokind AS kind,
    p.proowner, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.pronargs, p.pronargdefaults, p.prorettype, p.proretset,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    p.prosecdef AS definer, p.provolatile::text AS volatility,
    l.lanname::text AS language_name, p.proconfig AS settings,
    p.proacl::text AS explicit_acl, p.prosrc AS source_body,
    CASE WHEN p.prokind <> 'a' THEN pg_catalog.pg_get_functiondef(p.oid) END AS definition,
    (SELECT pg_catalog.jsonb_object_agg(c.role_name,
      CASE WHEN c.role_oid IS NOT NULL THEN pg_catalog.has_function_privilege(c.role_oid,p.oid,'EXECUTE') END)
     FROM clients c) AS effective_execute,
    (SELECT COALESCE(pg_catalog.bool_or(pg_catalog.pg_has_role(c.role_oid,p.proowner,'USAGE')),false)
     FROM clients c WHERE c.role_oid IS NOT NULL) AS client_inherits_owner
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  JOIN routine_names v ON v.schema_name = n.nspname AND v.name = p.proname
),
function_comparison AS (
  SELECT e.signature AS required_signature, a.signature AS actual_signature,
    a.oid, a.owner, a.kind, a.result_type, a.definer, a.volatility, a.language_name,
    a.settings, a.explicit_acl, a.effective_execute, a.client_inherits_owner,
    a.definition, e.reference_body,
    CASE WHEN e.reference_body IS NOT NULL AND a.oid IS NOT NULL THEN
      pg_catalog.btrim(pg_catalog.regexp_replace(a.source_body,'[[:space:]]+',' ','g')) =
      pg_catalog.btrim(pg_catalog.regexp_replace(e.reference_body,'[[:space:]]+',' ','g'))
    END AS normalized_body_matches_repository,
    COALESCE(a.oid IS NOT NULL AND a.kind = 'f' AND a.pronargs = 0 AND NOT a.proretset
      AND a.prorettype = pg_catalog.to_regtype(e.result_type)
      AND (e.definer IS NULL OR a.definer = e.definer)
      AND (e.volatility IS NULL OR a.volatility = e.volatility)
      AND (e.language_name IS NULL OR a.language_name = e.language_name)
      AND (NOT e.empty_search_path OR EXISTS
        (SELECT 1 FROM pg_catalog.unnest(a.settings) x WHERE x IN ('search_path=""','search_path=')))
      AND (a.effective_execute->>'anon')::boolean = e.anon_execute
      AND (a.effective_execute->>'authenticated')::boolean = e.authenticated_execute
      AND NOT a.client_inherits_owner, false) AS required_properties_match
  FROM function_references e LEFT JOIN routines a
    ON a.oid = pg_catalog.to_regprocedure(e.signature)
),
constraints AS (
  SELECT n.nspname AS schema_name, c.relname AS relation_name,
    k.oid, k.conname AS name, k.contype AS type, k.convalidated AS validated,
    k.condeferrable AS deferrable, k.condeferred AS initially_deferred,
    k.conkey AS key_attnums, k.confkey AS referenced_attnums,
    k.confrelid AS referenced_oid, k.confdeltype AS on_delete_code,
    pg_catalog.pg_get_constraintdef(k.oid, true) AS definition,
    CASE WHEN k.confrelid <> 0 THEN k.confrelid::regclass::text END AS referenced_relation,
    CASE WHEN k.contype IN ('u','p') THEN
      COALESCE((pg_catalog.to_jsonb(i)->>'indnullsnotdistinct')::boolean, false)
    END AS unique_nulls_not_distinct,
    CASE WHEN k.contype IN ('u','p') THEN i.indisvalid END AS supporting_index_valid,
    CASE WHEN k.contype IN ('u','p') THEN i.indisready END AS supporting_index_ready
  FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = k.conindid
  WHERE n.nspname = 'public' AND c.relname IN ('profiles','user_roles','follows')
),
expected_constraints(name, reference_definition) AS (VALUES
  ('profiles_pkey','PRIMARY KEY (id)'),
  ('profiles_id_fkey','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
  ('profiles_username_key','UNIQUE (username), allowing multiple NULL usernames'),
  ('profiles_username_format',$ref$username IS NULL OR username ~ '^[a-z][a-z0-9_]{2,29}$'$ref$),
  ('profiles_display_name_length','char_length(display_name) <= 100 AND (username IS NULL OR char_length(btrim(display_name)) >= 1)'),
  ('profiles_bio_length','char_length(bio) <= 500'),
  ('profiles_avatar_url_format',$ref$avatar_url IS NULL OR (char_length(avatar_url) <= 2048 AND avatar_url ~ '^https://[^[:space:]]+$')$ref$)
),
triggers AS (
  SELECT n.nspname AS schema_name, c.relname AS relation_name,
    t.tgname AS name, t.tgenabled AS enabled, t.tgtype AS event_bits,
    t.tgqual IS NOT NULL AS has_when_condition, t.tgnargs AS argument_count,
    t.tgfoid::regprocedure::text AS function_signature,
    pg_catalog.pg_get_triggerdef(t.oid, true) AS definition,
    pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS function_definer, p.proconfig AS function_settings,
    CASE WHEN p.prokind <> 'a' THEN pg_catalog.pg_get_functiondef(p.oid) END AS function_definition
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND n.nspname = 'public'
    AND c.relname IN ('profiles','user_roles','follows')
),
event_triggers AS (
  SELECT e.evtname AS name, e.evtevent AS event, e.evtenabled AS enabled,
    e.evttags AS tags, pg_catalog.pg_get_userbyid(e.evtowner) AS owner,
    e.evtfoid::regprocedure::text AS function_signature,
    pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS function_definer, p.proconfig AS function_settings,
    pg_catalog.pg_get_functiondef(e.evtfoid) AS function_definition
  FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid = e.evtfoid
),
function_owner_capabilities AS (
  SELECT o.oid, o.rolname AS owner, o.rolsuper AS superuser,
    o.rolbypassrls AS bypass_rls,
    (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'relation',r.schema_name || '.' || r.relation_name,
      'bypasses_rls',o.rolsuper OR o.rolbypassrls OR
        (NOT r.force_rls AND pg_catalog.pg_has_role(o.oid,r.relowner,'USAGE')),
      'table_select',pg_catalog.has_table_privilege(o.oid,r.oid,'SELECT'),
      'table_insert',pg_catalog.has_table_privilege(o.oid,r.oid,'INSERT'),
      'column_privileges',(SELECT COALESCE(pg_catalog.jsonb_object_agg(a.name,
        pg_catalog.jsonb_build_object(
          'select',pg_catalog.has_column_privilege(o.oid,a.attrelid,a.attnum,'SELECT'),
          'insert',pg_catalog.has_column_privilege(o.oid,a.attrelid,a.attnum,'INSERT'))),'{}'::jsonb)
        FROM columns a WHERE a.attrelid = r.oid)
      ) ORDER BY r.schema_name,r.relation_name),'[]'::jsonb)
     FROM relations r WHERE r.oid IS NOT NULL AND r.relation_name IN ('profiles','user_roles','users')
       AND r.relkind IN ('r','p')) AS baseline_table_rights
  FROM pg_catalog.pg_roles o WHERE o.oid IN (SELECT proowner FROM routines)
),
collision_names(name) AS (VALUES
  ('public.follows'), ('public.member_directory'), ('public.follows_following_idx'),
  ('public.profiles_joined_idx'), ('public.profiles_name_search_idx'),
  ('public.profiles_username_search_idx')
),
collisions AS (
  SELECT 'relation'::text AS kind, v.name, c.oid IS NOT NULL AS present,
    CASE WHEN c.oid IS NOT NULL THEN pg_catalog.jsonb_build_object(
      'type',c.relkind,'owner',pg_catalog.pg_get_userbyid(c.relowner),
      'index_definition',CASE WHEN c.relkind IN ('i','I') THEN pg_catalog.pg_get_indexdef(c.oid) END,
      'view_definition',CASE WHEN c.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(c.oid,true) END)
    END AS details
  FROM collision_names v LEFT JOIN pg_catalog.pg_class c ON c.oid = pg_catalog.to_regclass(v.name)
  UNION ALL
  SELECT 'row_type',v.name,t.oid IS NOT NULL,
    CASE WHEN t.oid IS NOT NULL THEN pg_catalog.jsonb_build_object(
      'kind',t.typtype,'owner',pg_catalog.pg_get_userbyid(t.typowner),
      'associated_relation',CASE WHEN t.typrelid <> 0 THEN t.typrelid::regclass::text END) END
  FROM (VALUES ('public.follows'),('public.member_directory')) v(name)
  LEFT JOIN pg_catalog.pg_type t ON t.oid = pg_catalog.to_regtype(v.name)
  UNION ALL
  SELECT 'column','public.profiles.cover_url',EXISTS
    (SELECT 1 FROM profile_columns WHERE name = 'cover_url'),NULL::jsonb
  UNION ALL
  SELECT 'constraint','public.profiles.profiles_cover_url_format',EXISTS
    (SELECT 1 FROM constraints WHERE relation_name = 'profiles' AND name = 'profiles_cover_url_format'),NULL::jsonb
  UNION ALL
  SELECT 'routine','public.discover_people(text,text,integer,integer)',
    pg_catalog.to_regprocedure('public.discover_people(text,text,integer,integer)') IS NOT NULL,NULL::jsonb
),
extensions AS (
  SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema_name,
    pg_catalog.pg_get_userbyid(e.extowner) AS owner, e.extrelocatable AS relocatable
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm'
),
available_extension AS (
  SELECT a.name, a.default_version, a.installed_version,
    (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) ORDER BY v.version),'[]'::jsonb)
     FROM pg_catalog.pg_available_extension_versions v WHERE v.name = a.name
       AND (v.version = a.default_version OR v.installed)) AS version_properties
  FROM pg_catalog.pg_available_extensions a WHERE a.name = 'pg_trgm'
),
operator_classes AS (
  SELECT n.nspname AS schema_name, o.opcname AS name, m.amname AS method,
    pg_catalog.pg_get_userbyid(o.opcowner) AS owner,
    EXISTS (SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
      WHERE d.classid = 'pg_catalog.pg_opclass'::regclass AND d.objid = o.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::regclass AND d.deptype = 'e'
        AND e.extname = 'pg_trgm') AS belongs_to_pg_trgm
  FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid = o.opcnamespace
  JOIN pg_catalog.pg_am m ON m.oid = o.opcmethod WHERE o.opcname = 'gin_trgm_ops'
),
default_grants AS (
  SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator,
    COALESCE(n.nspname,'<global>') AS schema_name, d.defaclobjtype AS object_type,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee,
    x.privilege_type, x.is_grantable,
    CASE WHEN x.grantee = 0 THEN true ELSE EXISTS
      (SELECT 1 FROM clients c WHERE c.role_oid IS NOT NULL
       AND pg_catalog.pg_has_role(c.role_oid,x.grantee,'USAGE')) END AS reaches_client,
    x.grantee <> 0 AND x.grantee NOT IN
      (SELECT role_oid FROM clients WHERE role_oid IS NOT NULL) AS not_directly_revoked_by_004
  FROM pg_catalog.pg_default_acl d
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x CROSS JOIN environment e
  WHERE d.defaclrole = e.operator_oid AND (d.defaclnamespace = 0 OR d.defaclnamespace = e.public_oid)
    AND d.defaclobjtype IN ('r','f')
),
checks(id, status, explanation) AS (
  SELECT 'postgresql_15_or_newer',CASE WHEN version_num >= 150000 THEN 'PASS' ELSE 'FAIL' END,
    '004 uses security_invoker=true on a view.' FROM environment
  UNION ALL SELECT 'required_roles',CASE WHEN
    (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3
    THEN 'PASS' ELSE 'FAIL' END,'004 names these three existing roles in grants.'
  UNION ALL SELECT 'client_roles_unprivileged',CASE WHEN
    (SELECT count(*) FROM clients WHERE role_oid IS NOT NULL AND NOT rolsuper AND NOT rolbypassrls) = 2
    THEN 'PASS' ELSE 'FAIL' END,'Ordinary client roles must not bypass RLS.'
  UNION ALL SELECT 'client_public_schema_usage',CASE WHEN
    (SELECT count(*) FROM clients WHERE public_schema_usage IS TRUE) = 2
    THEN 'PASS' ELSE 'FAIL' END,'Existing client roles need public schema USAGE to use the directory and RPC.'
  UNION ALL SELECT 'existing_profile_and_role_tables',CASE WHEN
    (SELECT count(*) FROM relations WHERE schema_name = 'public' AND relation_name IN ('profiles','user_roles')
      AND relkind = 'r' AND rls AND NOT client_inherits_owner) = 2
    THEN 'PASS' ELSE 'FAIL' END,'Expect existing ordinary tables with RLS and trusted ownership.'
  UNION ALL SELECT 'profile_column_shape',CASE WHEN
    (SELECT count(*) FROM column_comparison) = 7 AND
    COALESCE((SELECT pg_catalog.bool_and(shape_matches_003) FROM column_comparison),false)
    THEN 'PASS' ELSE 'FAIL' END,'Seven original columns in order; cover_url must not already exist.'
  UNION ALL SELECT 'profile_defaults',CASE WHEN
    COALESCE((SELECT pg_catalog.bool_and(default_text_matches_003) FROM column_comparison),false)
    THEN 'PASS' ELSE 'REVIEW' END,'Compare full defaults; equivalent formatting can differ.'
  UNION ALL SELECT 'function_properties_and_execute',CASE WHEN
    COALESCE((SELECT pg_catalog.bool_and(required_properties_match) FROM function_comparison),false)
    THEN 'PASS' ELSE 'REVIEW' END,'Inspect missing/mismatched properties, owners and execute rights in required_functions.'
  UNION ALL SELECT 'required_function_signatures',CASE WHEN EXISTS
    (SELECT 1 FROM function_comparison WHERE oid IS NULL)
    THEN 'FAIL' ELSE 'PASS' END,'All five required zero-argument functions must exist; none is invoked by this audit.'
  UNION ALL SELECT 'required_function_overloads',CASE WHEN EXISTS
    (SELECT 1 FROM routines r WHERE r.name <> 'discover_people' AND r.oid NOT IN
      (SELECT oid FROM function_comparison WHERE oid IS NOT NULL))
    THEN 'REVIEW' ELSE 'PASS' END,'Inspect unexpected overloads/default arguments that could affect function or RPC resolution.'
  UNION ALL SELECT 'function_bodies',CASE WHEN EXISTS
    (SELECT 1 FROM function_comparison WHERE reference_body IS NOT NULL
      AND normalized_body_matches_repository IS DISTINCT FROM true)
    THEN 'REVIEW' ELSE 'PASS' END,'Whitespace-only comparison to 001/003 reference bodies; alternatives need semantic review.'
  UNION ALL SELECT 'profile_policy_shape',CASE WHEN
    (SELECT count(*) FROM policy_comparison) = 3 AND
    COALESCE((SELECT pg_catalog.bool_and(shape_matches_003) FROM policy_comparison),false)
    THEN 'PASS' ELSE 'REVIEW' END,'Full USING/WITH CHECK expressions still require review.'
  UNION ALL SELECT 'profile_column_privileges',CASE WHEN
    (SELECT count(*) FROM column_privileges WHERE relation_name = 'profiles') = 14 AND
    COALESCE((SELECT pg_catalog.bool_and(can_select
      AND can_insert = (role_name = 'authenticated' AND column_name = 'id')
      AND can_update = (role_name = 'authenticated' AND column_name IN ('username','display_name','bio','avatar_url'))
      AND NOT can_reference) FROM column_privileges WHERE relation_name = 'profiles'),false)
    THEN 'PASS' ELSE 'FAIL' END,'Effective privileges include inherited and PUBLIC column/table grants.'
  UNION ALL SELECT 'no_broad_client_table_grants',CASE WHEN
    COALESCE((SELECT pg_catalog.bool_and(effective IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM pg_catalog.jsonb_each(effective) x WHERE x.value = 'true'::jsonb))
      FROM table_privileges WHERE relation_name IN ('profiles','user_roles','users')
      -- profiles column privileges are allowed; its table-level grants are not.
      AND relation_name <> 'profiles'),false)
    AND COALESCE((SELECT pg_catalog.bool_and(NOT EXISTS
      (SELECT 1 FROM pg_catalog.jsonb_each(effective) x
       WHERE x.key NOT LIKE '%_any_column' AND x.value = 'true'::jsonb))
      FROM table_privileges WHERE relation_name = 'profiles'),false)
    THEN 'PASS' ELSE 'FAIL' END,'No direct private-table access or broad profile table grants; inspect effective flags.'
  UNION ALL SELECT 'profile_primary_key',CASE WHEN EXISTS
    (SELECT 1 FROM constraints k WHERE relation_name = 'profiles' AND type = 'p' AND validated
      AND NOT k.deferrable AND k.supporting_index_valid AND k.supporting_index_ready
      AND key_attnums = ARRAY[(SELECT attnum FROM profile_columns WHERE name = 'id')]::smallint[])
    THEN 'PASS' ELSE 'FAIL' END,'profiles.id needs a valid non-deferrable primary key for the new follows foreign keys.'
  UNION ALL SELECT 'profile_auth_foreign_key',CASE WHEN EXISTS
    (SELECT 1 FROM constraints k CROSS JOIN environment e WHERE relation_name = 'profiles'
      AND type = 'f' AND validated AND referenced_oid = e.auth_users_oid AND on_delete_code = 'c'
      AND key_attnums = ARRAY[(SELECT attnum FROM profile_columns WHERE name = 'id')]::smallint[]
      AND referenced_attnums = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = e.auth_users_oid AND attname = 'id' AND NOT attisdropped)]::smallint[])
    THEN 'PASS' ELSE 'FAIL' END,'Profile identity must reference auth.users(id) with cascade deletion.'
  UNION ALL SELECT 'username_unique_nullable',CASE WHEN EXISTS
    (SELECT 1 FROM constraints WHERE relation_name = 'profiles' AND type = 'u' AND validated
      AND NOT unique_nulls_not_distinct AND supporting_index_valid AND supporting_index_ready
      AND key_attnums = ARRAY[(SELECT attnum FROM profile_columns WHERE name = 'username')]::smallint[])
    THEN 'PASS' ELSE 'FAIL' END,'Unique username must permit multiple NULLs for onboarding.'
  UNION ALL SELECT 'expected_constraints_present',CASE WHEN
    (SELECT count(*) FROM expected_constraints e JOIN constraints a ON a.name = e.name
      AND a.relation_name = 'profiles' AND a.validated) = 7
    THEN 'PASS' ELSE 'REVIEW' END,'Names/validation alone do not prove CHECK or foreign-key semantics; inspect definitions.'
  UNION ALL SELECT 'timestamp_trigger',CASE WHEN EXISTS
    (SELECT 1 FROM triggers WHERE relation_name = 'profiles' AND name = 'profiles_updated_at'
      AND enabled IN ('O','A') AND event_bits = 19 AND NOT has_when_condition AND argument_count = 0
      AND function_signature = 'set_profile_updated_at()')
    OR EXISTS (SELECT 1 FROM triggers WHERE relation_name = 'profiles' AND name = 'profiles_updated_at'
      AND enabled IN ('O','A') AND event_bits = 19 AND NOT has_when_condition AND argument_count = 0
      AND function_signature = 'public.set_profile_updated_at()')
    THEN 'PASS' ELSE 'REVIEW' END,'Expected enabled BEFORE UPDATE FOR EACH ROW trigger, without WHEN/arguments.'
  UNION ALL SELECT '004_name_conflicts',CASE WHEN EXISTS(SELECT 1 FROM collisions WHERE present)
    THEN 'FAIL' ELSE 'PASS' END,'004 uses unconditional object creation; existing names must be reconciled.'
  UNION ALL SELECT 'extra_discovery_overloads',CASE WHEN EXISTS
    (SELECT 1 FROM routines WHERE schema_name = 'public' AND name = 'discover_people')
    THEN 'REVIEW' ELSE 'PASS' END,'Other overloads can affect RPC resolution even without an exact-signature conflict.'
  UNION ALL SELECT 'public_and_extensions_schemas',CASE WHEN public_oid IS NOT NULL AND extensions_oid IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END,'004 explicitly creates public objects and uses extensions.gin_trgm_ops.' FROM environment
  UNION ALL SELECT 'pg_trgm_location_or_availability',CASE
    WHEN EXISTS(SELECT 1 FROM extensions) THEN CASE WHEN
      EXISTS(SELECT 1 FROM extensions WHERE schema_name = 'extensions') AND
      EXISTS(SELECT 1 FROM operator_classes WHERE schema_name = 'extensions' AND method = 'gin' AND belongs_to_pg_trgm)
      THEN 'PASS' ELSE 'FAIL' END
    WHEN EXISTS(SELECT 1 FROM available_extension) THEN CASE WHEN
      EXISTS(SELECT 1 FROM operator_classes WHERE schema_name = 'extensions')
      THEN 'REVIEW' ELSE 'PASS' END ELSE 'FAIL' END,
    'Existing pg_trgm elsewhere is not relocated by IF NOT EXISTS; absent extension must be available.'
  UNION ALL SELECT 'operator_ddl_rights',CASE WHEN
    public_oid IS NOT NULL AND pg_catalog.has_schema_privilege(operator_oid,public_oid,'CREATE')
    AND COALESCE((SELECT operator_has_owner_rights FROM relations WHERE schema_name='public' AND relation_name='profiles'),false)
    THEN 'PASS' ELSE 'REVIEW' END,'Run as trusted owner-capable SQL Editor role; no role/privilege changes are made by this audit.' FROM environment
  UNION ALL SELECT 'operator_extension_install_rights',CASE
    WHEN EXISTS(SELECT 1 FROM extensions WHERE schema_name = 'extensions') THEN 'PASS'
    WHEN extensions_oid IS NOT NULL AND pg_catalog.has_schema_privilege(operator_oid,extensions_oid,'CREATE')
      AND (operator_superuser OR (database_create AND EXISTS
        (SELECT 1 FROM available_extension a CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(a.version_properties) v
         WHERE v->>'version' = a.default_version AND (v->>'trusted')::boolean IS TRUE)))
      THEN 'PASS' ELSE 'REVIEW' END,'If pg_trgm is absent, inspect trusted-extension availability and operator install capabilities.' FROM environment
  UNION ALL SELECT 'creator_default_privileges',CASE WHEN EXISTS
    (SELECT 1 FROM default_grants WHERE reaches_client AND not_directly_revoked_by_004)
    THEN 'REVIEW' ELSE 'PASS' END,'Check creator default grants to inherited roles that 004 does not explicitly revoke.'
  UNION ALL SELECT 'additional_triggers_and_policies',CASE WHEN
    EXISTS(SELECT 1 FROM triggers WHERE relation_name <> 'profiles' OR name <> 'profiles_updated_at') OR
    EXISTS(SELECT 1 FROM policies WHERE relation_name = 'user_roles') OR
    EXISTS(SELECT 1 FROM event_triggers WHERE enabled <> 'D')
    THEN 'REVIEW' ELSE 'PASS' END,'Inspect extra baseline triggers/policies and enabled DDL event triggers for side effects.'
)
SELECT pg_catalog.jsonb_build_object(
  'audit', pg_catalog.jsonb_build_object(
    'format_version',1,'target','202611130004_member_directory_and_follows.sql',
    'captured_at',pg_catalog.statement_timestamp(),'operator',current_user,
    'single_statement',true,'catalog_only',true,
    'decision','PENDING_COMPLETE_RESULT_REVIEW',
    'automatic_checks',CASE WHEN EXISTS(SELECT 1 FROM checks WHERE status='FAIL') THEN 'FAILURES_FOUND'
      WHEN EXISTS(SELECT 1 FROM checks WHERE status='REVIEW') THEN 'REVIEW_REQUIRED' ELSE 'MECHANICAL_CHECKS_PASS' END,
    'definition_review_required',true,
    'scope_excludes',pg_catalog.jsonb_build_array('005 Storage buckets/policies','SMTP','backfill counts','migration-history repair'),
    'interpretation','PASS is not a GO. Definitions and equivalent alternatives require semantic comparison; no historical application is inferred from names.'),
  'checks',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY id) FROM checks c),
  'environment',(SELECT pg_catalog.to_jsonb(e) FROM environment e),
  'client_roles',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY role_name) FROM clients c),
  'relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY schema_name,relation_name) FROM relations r),
  'profile_columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY COALESCE(expected_position,actual_position)) FROM column_comparison c),
  'required_functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY required_signature) FROM function_comparison f),
  'routine_inventory',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)-'source_body' ORDER BY signature) FROM routines r),'[]'::jsonb),
  'function_owner_capabilities',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY owner) FROM function_owner_capabilities o),'[]'::jsonb),
  'profile_policy_comparison',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY name) FROM policy_comparison p),
  'all_relevant_policies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY relation_name,name) FROM policies p),'[]'::jsonb),
  'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY relation_name,name) FROM triggers t),'[]'::jsonb),
  'ddl_event_triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY name) FROM event_triggers t),'[]'::jsonb),
  'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY relation_name,name) FROM constraints c),'[]'::jsonb),
  'constraint_references',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY name) FROM expected_constraints c),
  'effective_table_privileges',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY schema_name,relation_name,role_name) FROM table_privileges p),
  'effective_column_privileges',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY relation_name,role_name,column_name) FROM column_privileges p),'[]'::jsonb),
  'creator_default_grants',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY schema_name,object_type,grantee,privilege_type) FROM default_grants d),'[]'::jsonb),
  'pg_trgm',pg_catalog.jsonb_build_object(
    'installed',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)) FROM extensions e),'[]'::jsonb),
    'available',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)) FROM available_extension a),'[]'::jsonb),
    'operator_classes',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY schema_name) FROM operator_classes o),'[]'::jsonb)),
  '004_conflicts',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY kind,name) FROM collisions c)
) AS migration_004_audit;
