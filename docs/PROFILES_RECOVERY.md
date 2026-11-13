# Missing profiles table: manual recovery

The hosted SQL Editor result `to_regclass('public.profiles') = NULL` confirms the table is absent. The existing frontend expects a database profile and cannot fix a missing schema by retrying or by creating a local substitute.

## Exact migration and application order

Review the complete SQL in **`supabase/migrations/202611130003_profiles_recovery.sql`**. This is the only new migration in this pass. Migrations `202611130001_app_roles.sql` and `202611130002_member_profiles.sql` are preserved unchanged.

For the confirmed hosted missing-table state, review and run the **entire 003 file** manually in the intended project's Supabase SQL Editor. It is self-contained for profile recovery; do not also run 002 afterward, because 002 unconditionally creates the same table. Do not rerun the role migration against an existing role setup. This manual repair does not record migration history automatically: reconcile any SQL Editor changes with your team's migration tracking before future CLI deployments. Do not use a reset to reconcile history.

For a brand-new database using the migration runner, the normal sequence **001 → 002 → 003** also works. Migration 003 skips table creation when the known profile table exists, preserves its rows, and applies the recovery policies/grants and backfill. It never drops or recreates a table. It rejects unexpected column layouts, missing expected constraint names, or unknown policies so they can be audited manually. This guard is not a substitute for reviewing existing constraint definitions in an unfamiliar database.

No migration has been applied to hosted Supabase by the agent. Run it as the trusted database operator, never from the frontend. The SQL transaction must succeed in full; on an editor error, run `ROLLBACK;` before investigating.

## Required application schema

| Column | Definition and application expectation |
| --- | --- |
| `id` | UUID primary key; FK to `auth.users(id)` with `ON DELETE CASCADE`; equals the authenticated member's ID; not editable |
| `username` | Nullable text, UNIQUE; non-NULL values match `^[a-z][a-z0-9_]{2,29}$`; NULL means onboarding incomplete |
| `display_name` | Non-NULL text, default empty; at most 100 characters; must contain a non-space character when username is set |
| `bio` | Non-NULL text, default empty; at most 500 characters |
| `avatar_url` | Nullable text; HTTPS URL without whitespace, at most 2048 characters |
| `created_at` | Non-NULL timestamptz, server default `now()`; client cannot insert/update it |
| `updated_at` | Non-NULL timestamptz, server default `now()`; update trigger sets `clock_timestamp()`; client cannot insert/update it |

Primary-key and unique constraints provide ID and username indexes. Multiple NULL usernames are allowed, so blank/missing/duplicate signup names cannot cause generated-name collisions. No email, password, role, or private account setting is stored in this publicly readable table.

## Profile creation, recovery, and security

- After verified sign-in, the existing `ProfileProvider` calls `ensure_my_profile()` and the profile gate routes NULL usernames to `/app/onboarding`. The function takes no arguments, uses `auth.uid()`, checks trusted `auth.users.email_confirmed_at`, inserts only the caller's ID, and uses `ON CONFLICT (id) DO NOTHING`. Retries do not duplicate or erase profiles.
- The migration backfills all **confirmed** users lacking profiles with just their ID. It leaves existing profile edits intact. It does not copy untrusted usernames, display names, avatars, or role metadata. The frontend can suggest the member's signup display name during onboarding; it is then validated on save.
- Unconfirmed accounts remain without a profile until verification/sign-in. No `auth.users` trigger or write is introduced, so registration and email verification do not depend on profile creation succeeding inside an Auth trigger.
- SELECT exposes completed public profile fields to anonymous/authenticated readers. Incomplete profiles are visible only to their owner.
- INSERT is granted only for `id`, with an owner-only and verified-email RLS check. This permits a verified member to recover only their own empty profile. The frontend continues using the idempotent RPC rather than direct inserts. A second direct insert reports a duplicate primary key; retrying the RPC safely returns the existing row.
- UPDATE grants cover only username, display name, bio, and avatar URL. Both `USING` and `WITH CHECK` require ownership and trusted email verification. IDs/timestamps cannot be updated, and no client DELETE is allowed.
- Both table and column grants are reset for PUBLIC/anon/authenticated before the exact grants are restored. Revoking table privileges alone would leave pre-existing column privileges intact.
- Security-definer functions have fixed empty search paths, qualified references, no target-user parameters, and authenticated-only execution. The verification helper exposes only the caller's verification status.
- `user_roles`, its rows, RLS, grants, and `current_app_role()` are untouched. Profile operations never assign roles; member attempts to promote themselves or others remain denied.
- The final `NOTIFY pgrst, 'reload schema'` requests a PostgREST schema-cache refresh after the transaction commits.

## Frontend and supporting changes

`src/features/profiles/profileService.ts` now points missing-schema errors at the exact recovery filename and tells the member to retry after administrator review/application. No changes were required to registration, AuthProvider, verification, onboarding, routing, or profile payloads: they already match the seven-column schema and caller-only provisioning API.

Added `tests/profilesRecovery.database.test.ts` for missing-table and existing-table migration paths. Updated `docs/supabase-audit.sql` to include the new caller-verification helper. Updated README and the previous handoff guide to point here as the current repair procedure. No environment credentials were read into the test workers or modified.

## Verification completed

`npm test`: **62 tests passed across 6 files**. This includes 18 new recovery tests (nine on each migration path) plus the existing 44 tests. PostgreSQL/PGlite tests use disposable in-memory databases, not hosted Supabase. They verify schema creation, backfill, email verification, NULL username handling, insert/update RLS, uniqueness, column privileges, role preservation, repeat recovery, and rejection of unknown policies.

`npm run build`: **passed**, including strict TypeScript checking and the Vite production build. Live hosted execution, SMTP delivery, real Auth/JWT refresh, and visual browser verification remain manual.

## Manual review and test steps

1. Verify the intended Supabase project. Review the full 003 SQL and existing role setup. Confirm `profiles` is still absent, or audit its existing columns/constraints/policies with `docs/supabase-audit.sql` if it has appeared since the earlier query.
2. After review, manually run the **entire** `202611130003_profiles_recovery.sql` in SQL Editor. Do not run 002 afterward on the recovered database. No secret or service-role key is needed in the frontend.
3. Run the following read-only checks. Expect a non-NULL table name, RLS enabled, three scoped policies, and zero confirmed users without profiles. Unconfirmed users may still lack profiles by design.

```sql
select to_regclass('public.profiles');
select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'profiles';
select count(*) as confirmed_users_missing_profiles
from auth.users u left join public.profiles p on p.id = u.id
where u.email_confirmed_at is not null and p.id is null;
```

4. Return to the app's profile error screen and click **Retry profile setup**, or reload/sign in. An existing confirmed account with no username should reach onboarding. Save a valid display name and unique username; reload and verify persistence.
5. Register a new test account with Confirm email enabled. Before confirmation, expect the inbox screen and no member access. After following the confirmation link, expect onboarding. Reload/retry repeatedly and confirm only one profile exists for that member.
6. Use two ordinary test accounts in separate browser profiles. Attempt the same username; expect a taken/duplicate message and no overwritten profile. Edit A's bio, reload, and verify timestamps and saved data. Missing signup names must not prevent provisioning; the display name is required at onboarding save time.
7. As A, make a direct API update targeting B's UUID. Expect zero returned rows or a permission error; confirm B's data is unchanged. Direct inserts for B's ID, timestamp inserts/updates, identity updates, profile deletes, and role inserts/updates must be denied. Use the browser API snippets in `docs/AUTH_PROFILES.md`; do not run member tests as postgres/service_role, which are trusted operators and bypass normal member restrictions.
8. For owner-insert recovery testing, use an approved disposable test project/account lacking a profile. A verified member can insert only their own ID; unverified and anonymous attempts fail. Use the RPC for idempotent repeated recovery.
9. Confirm completed public fields are readable while unfinished profiles and account secrets are not. Confirm member access to `/admin` and `/moderation` is denied and the existing role values have not changed.
10. Confirm Email provider, Confirm email, SMTP, and exact `/auth/callback` redirect URLs remain configured. Sign out and revisit protected routes to verify sign-in is required.

Please review and apply the migration manually in Supabase SQL Editor. No push, deployment, user deletion, or remote database mutation was performed by this task.
