# Authentication and profiles handoff

**Current recovery procedure:** The hosted SQL Editor has since confirmed `public.profiles` is absent. See [PROFILES_RECOVERY.md](PROFILES_RECOVERY.md) and new migration `202611130003_profiles_recovery.sql`. That guide supersedes the earlier application plan and no-direct-insert/backfill descriptions below. The original 001 and 002 migrations are unchanged. The latest suite passes 62 tests; the original 44-test report below is historical.

## Audit findings

Inspected the existing source files, environment variable names/types without printing values, configuration, README, and the single existing Supabase migration before implementation. Existing application files were extended. `.env` was not changed.

- The client already used the Supabase SDK with persistent sessions, token refresh, URL detection, and public-key format checking. URL/key validation is now shared and tested; invalid configuration disables auth without printing secrets.
- Local `.env` contains a configured URL and a public publishable key. No privileged credential was detected in the inspected configuration. `.gitignore` now also covers names such as `.env copy.example` while allowing the sanitized `.env.example`.
- Login/signup/sign-out wiring existed. Verification/resend/callback screens, friendly error mappings, profile data, onboarding, and tests were missing.
- `202611130001_app_roles.sql` enables RLS on `user_roles`, revokes client table privileges, grants trusted `service_role` access, and exposes only the caller’s role through `current_app_role()`. The function is security-definer with a fixed empty search path and fully qualified objects. These existing rules were preserved unchanged. No client role selection, metadata role trust, or promotion was added.
- No local `profiles` table or migration existed.
- A read-only anonymous REST probe against the configured project returned **HTTP 404 / PGRST205** for the requested profile columns. This means they are not exposed in the current schema cache; it is not proof that no table exists anywhere in the database.
- The same read-only probe returned **HTTP 401 / 42501** for anonymous `user_roles` access, consistent with the intended denial.
- The live function definition, table constraints, authenticated grants, RLS policies, and migration history could not be established through those anonymous probes. **Do not assume either migration has been applied.** Run `docs/supabase-audit.sql` manually in the SQL editor to inspect them. The SQL is read-only and does not select member data.

Potential deployment permission issues: missing `ensure_my_profile()` yields a profile setup error; missing `current_app_role()` denies privileged routes. Incorrect column grants can break PostgREST updates even when RLS is correct. A pre-existing `profiles` table with broad policies needs reconciliation, not blind migration execution. Exposed future tables still require their own RLS.

## New database migration

`supabase/migrations/202611130002_member_profiles.sql` is the only new migration. It has **not** been applied to Supabase.

Review the live schema first. Apply the original role migration only if the audit shows it is missing and its proposed schema is appropriate. Then, after approval, apply the new profile migration. Do not rerun an already-applied migration blindly. The new migration is transactional and intentionally uses `CREATE TABLE`, not `IF NOT EXISTS`, so an unexpected existing table causes a failure rather than masking unknown constraints or policies. If it fails, roll back the editor transaction before proceeding.

Profiles contain only public profile fields: `id` (FK to `auth.users`, delete cascades), unique lowercase `username`, `display_name`, `bio`, nullable `avatar_url`, and server-controlled `created_at` / `updated_at`. Primary-key and unique constraints supply lookup indexes; an additional duplicate index is unnecessary.

A NULL username represents an unfinished profile. Such a profile is readable only by its owner; completed profiles are publicly readable at the data layer. There is no public member-directory page yet. Never add email, passwords, private preferences, or role information to this publicly readable table.

Client grants permit reading the explicit public columns and updating only `username`, `display_name`, `bio`, and `avatar_url`. RLS restricts updates to the owner, with both `USING` and `WITH CHECK`. There are no client insert/delete grants or policies. Members cannot alter IDs, timestamps, or another member’s profile. Administrator status does not bypass these owner rules in browser requests.

`ensure_my_profile()` accepts no arguments. It derives the caller from `auth.uid()`, checks `auth.users.email_confirmed_at`, and idempotently creates only that caller’s empty profile. It has a fixed search path, explicit authenticated-only execution, and no role writes. The function reads `auth.users` but never writes to it. No auth-table trigger, backfill, or direct browser insert is needed. Existing confirmed accounts are provisioned on their next sign-in.

Registration does not reserve a username. With email confirmation enabled, an unauthenticated signup receives a verification screen and cannot create a profile. After confirmation/sign-in, provisioning runs and onboarding asks for a username. Availability is advisory; only the unique database constraint decides who receives the name. Conflicts return SQLSTATE `23505` and the UI asks for another name without overwriting another member or losing the authenticated account. Repeated provisioning cannot reset existing edits.

## Supabase dashboard configuration required

1. Select the intended project and review its schema, policies, grants, function definitions, and migration history using `docs/supabase-audit.sql`.
2. Review and approve the migration plan before manually applying anything. No remote migration was applied by this task.
3. In Authentication, enable the **Email** provider and email/password signup. Enable **Confirm email** for production. If disabled, Supabase treats signup emails as confirmed; the frontend cannot substitute for that server setting. See [Supabase general auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
4. Set the Site URL to the actual application origin. Add exact redirect allowlist entries for `http://127.0.0.1:5173/auth/callback`, `http://localhost:5173/auth/callback` if used, and the approved production origin’s `/auth/callback`. Avoid unrestricted production wildcards.
5. Use the normal confirmation template with `{{ .ConfirmationURL }}` unless you deliberately implement a different OTP flow. This SPA uses the SDK’s default implicit callback handling; do not switch templates to a custom token-hash callback without implementing it.
6. Configure production SMTP, sender domain, delivery monitoring, appropriate email rate limits, and password requirements. The app requires at least eight characters for registration and displays stronger requirements returned by Supabase. The resend UI adds a one-minute cooldown; server rate limits remain authoritative. See [Supabase resend documentation](https://supabase.com/docs/reference/javascript/auth-resend).
7. Keep only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_PUBLISHABLE_KEY` in frontend configuration. Never put privileged keys in any `VITE_` variable; those values can be embedded in the bundle even if initialization rejects them. No dashboard settings or credentials were changed by this task.
8. Provision elevated roles only through reviewed, trusted database/server operations. User metadata is editable by members and is never an authorization source. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [column privilege guidance](https://supabase.com/docs/guides/database/postgres/column-level-security).

## Automated verification

Run `npm test` and `npm run build`.

Final local verification on November 13, 2026: **44 tests passed across 5 files**, including **11 PostgreSQL authorization/provisioning tests**; `npm run build` passed strict TypeScript checking and the Vite production build. No visual browser or live email/session-flow verification is claimed.

The UI tests render the real auth provider, route guards, auth forms, layout sign-out, and profile editor using a mocked Supabase transport. They cover login success/failure, registration without role assignment, password mismatch, verification state/resend/callback fallback, loading, session restoration events, logout failures, missing migrations, onboarding, duplicate usernames, profile saves, and denial of forged or unverifiable roles.

The database tests execute the two actual SQL files against **disposable, in-memory PostgreSQL through PGlite**, using minimal isolated `auth.users` / `auth.uid()` fixtures. They exercise SQL grants, RLS, constraints, and security-definer functions as `anon` and `authenticated`. They do not connect to Supabase, create real accounts, send emails, modify a persistent database, or mark any Supabase migration as applied. The simulated Auth fixture confirmation is test infrastructure, not application code writing `auth.users`.

Tests do not load the project `.env`. Database tests prove the proposed SQL behavior in the isolated fixture, not the deployed project’s policy state. Live Auth service delivery, real JWT/session refresh and cross-tab persistence, production SMTP, live PostgREST behavior, and dashboard configuration still require the manual tests below. Password recovery, uploads, account deletion, and other social features remain incomplete.

## Step-by-step manual test plan

Use two ordinary test accounts **A** and **B** in separate browser profiles, plus a signed-out/private browser. Only use an approved test project and test accounts. Never paste tokens into chat, documentation, or logs.

1. Run the read-only SQL audit, confirm expected objects/policies/grants, and approve/apply missing migrations in order. Restart Vite after configuration changes. Confirm no privileged keys are present in frontend configuration.
2. Signed out, visit `/app`, `/app/profile`, `/moderation`, and `/admin`. Each must route to sign-in without showing protected content. `/preview` must remain clearly labeled read-only and must not create a fake session.
3. Register A with an email you control. Verify mismatched passwords are rejected. Submit matching credentials. With Confirm email enabled, expect the inbox screen and no member session. In SQL, no profile should exist for A until verified sign-in; no role row should be inserted.
4. Before confirming, try password login. Expect a verification-required error. Request a resend; confirm the neutral success message, immediate resend cooldown, and server rate-limit handling. Verify that no account-existence claim is made.
5. Open A’s confirmation link. Expect `/auth/callback`, a restored verified session, and `/app/onboarding`. Reuse an expired/used link in a signed-out window: expect a recoverable verification message rather than protected content. A valid existing session may legitimately bypass an obsolete link error.
6. Choose a valid username and display name. Confirm the availability message says the name is reserved only when saved. Submit and expect the member feed. Reload and revisit `/app/profile`; the profile and session must persist. Sign out, verify protected content disappears, then sign in and confirm edits remain.
7. Edit A’s name, bio, and optional public HTTPS avatar URL. Save and reload. Confirm server timestamps update, long/invalid values are rejected, and no email or role field is present. A broken avatar should fall back to initials. Image uploads remain explicitly unavailable.
8. Register/confirm B separately. Try A’s username: expect taken/uniqueness messaging. For a race test, have both users check the same unused username before either saves, then save both. Exactly one succeeds; the other receives a conflict, with no overwritten profile or lost account. Recover with distinct usernames.
9. Verify public data visibility without logging in: completed profile fields may be read through the public REST API; incomplete profiles must not appear. Email/password/role data must not be available from `profiles`. Anonymous edits must be denied.
10. Test cross-user access **through the API**, not only the UI. In A’s local Vite browser console, use the snippet below with B’s test profile ID. The edit must affect zero rows, and B’s bio must remain unchanged. An RLS-filtered update can return no rows without an error; lack of an error is not evidence of a write.

```js
// Local Vite development only. Do not print client session objects or tokens.
const { supabase: client } = await import('/src/lib/supabase.ts')
const otherMemberId = 'REPLACE_WITH_B_TEST_PROFILE_UUID'
const attempt = await client.from('profiles')
  .update({ bio: 'Cross-user test; must not be saved' })
  .eq('id', otherMemberId).select('id')
console.log({ errorCode: attempt.error?.code, affectedRows: attempt.data?.length })
// Expected: affectedRows 0 (or an explicit denial), and B's stored bio unchanged.
```

11. Still as A, attempt protected-column and role changes with the following snippet. Expect SQLSTATE `42501`. Repeat the role update targeting B. Confirm `current_app_role()` still returns `member` for A and the role table is unchanged through the trusted SQL editor. Also verify direct profile insert/delete requests are denied.

```js
const identity = await client.auth.getUser()
const ownId = identity.data.user.id
const timestampAttempt = await client.from('profiles')
  .update({ created_at: new Date().toISOString() }).eq('id', ownId)
const roleAttempt = await client.from('user_roles')
  .update({ role: 'admin' }).eq('user_id', ownId)
const otherRoleAttempt = await client.from('user_roles')
  .update({ role: 'admin' }).eq('user_id', otherMemberId)
console.log({ timestamp: timestampAttempt.error?.code,
  ownRole: roleAttempt.error?.code, otherRole: otherRoleAttempt.error?.code })
```

12. Visit `/admin` and `/moderation` as a member: expect access restricted. For an approved moderator/admin test account provisioned by a trusted operator, confirm role-appropriate navigation and access after a fresh sign-in. These workspaces remain labeled placeholders and perform no privileged actions. Changing user metadata to `{ role: 'admin' }` must not change access.
13. Test network failures during login, resend, profile loading/saving, and sign-out. Expect error messages/retry, no false save success, and no invented session. In a disposable project missing the profile migration, expect the setup error and working sign-out escape path rather than endless loading.
14. Test mobile width, keyboard-only navigation, password visibility, labels/errors, and reload in another tab. Verify the Supabase SDK’s real persistence/refresh behavior by leaving a signed-in test session open across token refresh. Actual access decisions must remain enforced by RLS even if UI role information is temporarily stale.

## Files changed in this development pass

Modified existing files:

- `.gitignore`
- `README.md`
- `package.json`, `package-lock.json`
- `src/main.tsx`
- `src/app/router.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/components/ui/Avatar.tsx`
- `src/features/auth/AuthProvider.tsx`
- `src/features/auth/AuthPage.tsx`
- `src/features/auth/ProtectedRoute.tsx`
- `src/lib/supabase.ts`
- `src/styles/index.css`

New files:

- `supabase/migrations/202611130002_member_profiles.sql`
- `src/lib/env.ts`
- `src/features/auth/authErrors.ts`
- `src/features/auth/VerificationPage.tsx`
- `src/features/profiles/profileService.ts`
- `src/features/profiles/ProfileProvider.tsx`
- `src/features/profiles/ProfileGate.tsx`
- `src/features/profiles/ProfilePage.tsx`
- `vitest.config.ts`
- `tests/setup.ts`
- `tests/auth.test.tsx`
- `tests/profile.test.tsx`
- `tests/profileService.test.ts`
- `tests/profiles.database.test.ts`
- `tests/validation.test.ts`
- `scripts/audit-supabase.mjs`
- `docs/supabase-audit.sql`
- `docs/AUTH_PROFILES.md`

Generated ignored outputs: `dist/`, `node_modules/`, and TypeScript build metadata. The original role migration, `.env`, existing placeholder screens, feed examples, brand tokens, and hosting fallback were preserved. No commit, push, deployment, or remote migration application was performed.
