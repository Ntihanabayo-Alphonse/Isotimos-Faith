# Isotimos Faith

A Christian social **application** foundation built with React, TypeScript, Vite, Tailwind CSS v4 (Vite plugin), React Router, Lucide React, and Supabase. There are no public marketing pages or custom backend servers.

Email/password auth, verification/resend, onboarding, and editable member profiles are implemented. See [authentication/profile audit, dashboard setup, changed files, and manual test plan](docs/AUTH_PROFILES.md). The profile migration is supplied for review and has not been applied to Supabase.

**Member profiles and Discover People:** Real profile viewing, avatar/cover uploads, username-based public profiles, search, filters, follow/unfollow, and computed counts are now implemented. Review [the new migrations, Storage setup, test boundaries, and two-account test plan](docs/MEMBER_PROFILES_AND_DISCOVERY.md) before manually applying migrations 004 and 005. They have not been applied by the agent.

**Confirmed missing `public.profiles`?** Follow the [current recovery migration and manual application guide](docs/PROFILES_RECOVERY.md). New migration `202611130003_profiles_recovery.sql` creates the missing schema and safely backfills confirmed members. For that manual repair, run 003 after review; do not then run 002 against the recovered table. Existing role security is preserved.

## Local development

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

In PowerShell use `Copy-Item .env.example .env.local`. Open the URL printed by Vite. Without Supabase credentials, login shows setup instructions and a link to `/preview`. The preview is a separate, public, read-only layout demonstration; it never creates a session or bypasses a protected route.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`build` performs strict TypeScript checking and produces `dist/`.

## Supabase setup

1. Create a Supabase project and enable email/password authentication.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A Supabase **publishable** key (or legacy `anon` key) is appropriate in the browser. Never add a secret/service-role key, database password, or other private credential to any `VITE_` variable: Vite embeds these values in the frontend bundle. The client initialization rejects known non-public key formats, but it cannot prevent Vite embedding a misconfigured variable.
3. Run `docs/supabase-audit.sql` manually to inspect the live schema and migration history. A new database can use migrations 001 → 002 → 003 in order after review. For an existing hosted database confirmed to lack `profiles`, follow `docs/PROFILES_RECOVERY.md` and manually apply the self-contained 003 recovery migration after review; do not blindly rerun 001 or run 002 afterward. The app does not apply migrations automatically.
4. Set the Supabase Auth Site URL to your actual frontend origin. Allow redirect URLs such as `http://localhost:5173/auth/callback`, `http://127.0.0.1:5173/auth/callback`, and your production `/auth/callback` URL. Restrict production redirects to intended origins. Enable Confirm email and configure production SMTP.
5. Register a real account. Follow the confirmation link, then finish username/profile onboarding. Signup stores only `display_name` as user-editable metadata; it never sets a role. Profiles are created only for the verified caller through `ensure_my_profile()`.

Sessions are managed by the Supabase SDK, including persistence, refresh, confirmation URL processing, auth-state changes, and sign-out. There are no hardcoded users, fake tokens, or local-storage role flags.

### Roles and authorization

The database owns `public.user_roles`. An authenticated user without a row is a `member`. Clients have no table grants or write policies. The `current_app_role()` security-definer RPC returns only the caller’s role. Failed role lookups deny access to privileged screens. Only trusted database/server operators should provision moderator/admin rows; there is no browser-side role assignment.

`/moderation` allows `moderator` and `admin`; `/admin` allows only `admin`. Roles are re-read when the session changes/refreshes. Already-open UI may reflect an old role until refresh: **route guards are navigation controls, not a security boundary**. Every future privileged operation must re-authorize in the database or trusted server.

The new profile migration enforces owner-only editable columns with RLS and SQL grants. Completed profile fields are public; email and roles are separate. Before connecting posts, saved content, messages, or storage, create their schemas and ownership/membership policies. Never rely on hidden UI or React guards to protect data. Content data tables and privileged operations remain incomplete.

## Routes

| Route | Access / state |
| --- | --- |
| `/` | Redirects to `/app`, then login when signed out |
| `/login`, `/register` | Real Supabase authentication; disabled without configuration |
| `/auth/verify`, `/auth/callback` | Email confirmation, resend, and callback handling |
| `/app` | Authenticated shell and clearly marked sample feed |
| `/app/onboarding` | Verified member profile onboarding |
| `/app/profile` | Real signed-in member profile and follower/following counts |
| `/app/profile/edit` | Owner-only editing with avatar/cover uploads |
| `/app/people` | Searchable real member directory and follow/unfollow |
| `/members/:username` | Public completed member profile with sign-in required to follow |
| `/app/devotionals` | Authenticated devotionals placeholder |
| `/app/categories` | Authenticated categories placeholder |
| `/app/saved` | Authenticated saved-content placeholder |
| `/app/my-content` | Authenticated content-management placeholder |
| `/app/messages` | Authenticated messaging placeholder |
| `/app/settings` | Authenticated settings placeholder |
| `/moderation` | Moderator/admin only; workspace placeholder |
| `/admin` | Admin only; workspace placeholder |
| `/preview` | Public, read-only demonstration with an explicit preview banner |
| `/preview/*` | Corresponding member-screen placeholders for layout review |
| Unknown paths | Not-found screen |

## Organization

```text
src/
  app/router.tsx                   Route tree and error boundary
  components/layout/              Topbar, sidebar, mobile navigation
  components/ui/                  Button, Card, Avatar, StatusScreen
  features/auth/                  Supabase session provider, guards, auth forms
  features/feed/                  Sample social feed and local sample filters
  features/profiles/              Profile provisioning, onboarding, and editing
  features/people/                Directory, public profiles, and follow actions
  features/workspaces/            Explicit member and privileged placeholders
  lib/supabase.ts                 Environment validation and singleton client
  styles/index.css                Tailwind v4, design tokens, responsive styling
supabase/migrations/              Server-owned role foundation
public/                          Favicon and Cloudflare SPA fallback
```

Design tokens use primary `#0866FF`, secondary `#FFC400`, heading `#111111`, body `#262626`, muted `#525252`, background `#F7F9FC`, and white cards. Playfair Display is used for editorial headings, Inter for the interface, with system fallbacks. Fonts load from Google Fonts; no member data is sent as part of those requests.

## GitHub and Cloudflare Pages

Source files and `package-lock.json` are ready for review and eventual GitHub source control. No commits, pushes, remote setup, or deployment are performed by this task.

When deployment is approved, connect the chosen GitHub repository to Cloudflare Pages with:

- Framework: Vite / React
- Build command: `npm run build`
- Output directory: `dist`
- Node version: `24`
- Public build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

`public/_redirects` is copied into `dist/` and routes direct visits to SPA paths to `index.html`. Cloudflare Pages will serve the React application on deep links. Configure Supabase production redirect URLs before enabling sign-in on that origin. Build variables require a rebuild when changed.

## Implemented and incomplete

Implemented: build configuration, feature organization, reusable UI, responsive member shell, accessible navigation and forms, sample feed filters, email/password login/signup, verification/resend/callback screens, session and role guards, secure profile SQL and editing/onboarding, route errors, empty states, SPA fallback, secret-file ignore rules, auth/profile UI tests, and isolated PostgreSQL grants/RLS tests.

Still incomplete: applying reviewed migrations and verifying hosted/browser behavior, real social feed queries and post uploads, likes, comments, saves, global content search, notifications, devotionals, category following, messaging, settings, password recovery, moderation actions, admin management, content schemas/RLS, realtime subscriptions, Storage lifecycle cleanup, and production email configuration. Member profiles, people search, profile image uploads, follows, and their SQL policies are implemented, pending manual migration application and hosted verification. Existing feed samples remain illustrative and unrelated features remain labeled placeholders. See the latest member/discovery guide for exact test boundaries and manual steps.
