# Member profiles and Discover People

## Audit and preservation

Reviewed authentication, registration, verification, AuthProvider, protected routes, profile provisioning/loading/editing, layout/navigation, and all three existing SQL migrations before changing the application. No authentication flow, profile recovery function, prior migration, environment credential, `user_roles` grant/policy, or `current_app_role()` definition was overwritten.

The existing schema already covers owner-only profile editing, unique nullable usernames, verified caller provisioning, and protected IDs/timestamps. Missing pieces were a cover field, follows, computed counts, searchable member records, public username routes, and Storage buckets/policies. The original feed remains explicitly illustrative; posts and social-feed writes were not implemented in this pass.

A read-only anonymous probe of the configured hosted project returned HTTP 200 for the original public profile columns and HTTP 401 / 42501 for `user_roles`. This establishes table availability and anonymous role denial only. It does not prove live migration history, authenticated grants, RLS definitions, or the availability of the new objects. No member records, credentials, or session tokens were printed.

## Review and manually apply

There are two new files; neither has been applied by the agent:

1. `supabase/migrations/202611130004_member_directory_and_follows.sql`
2. `supabase/migrations/202611130005_member_image_storage.sql`

Run the read-only `docs/supabase-audit.sql` in your intended project's SQL Editor first. Review existing object names, policies, column grants, function definitions, and migration history. Apply 004, then 005 manually after approval. These are single-use migrations: do not blindly rerun them if objects already exist. On error, `ROLLBACK;`, inspect the cause, and reconcile manually; do not delete existing data or reset the project.

004 requires the profile table and verification helper supplied by 003. If profile recovery has not yet been applied, follow `docs/PROFILES_RECOVERY.md` first. **Do not rerun 003 after 004**: its historical seven-column schema guard will intentionally reject the extended schema. On a new project, the normal migration sequence is 001 → 002 → 003 → 004 → 005. For previous manual repairs that skipped 002, reconcile migration history before using CLI deployment tools, without rerunning 002 over an existing table.

004 adds `profiles.cover_url` with an HTTPS/length constraint and owner-scoped column grants. It adds `follows` with two profile foreign keys, a composite primary key, no-self-follow check, server timestamp, and indexes for reverse lookup and sorting. `pg_trgm` is installed into `extensions` for indexed substring searches on display names/usernames. If an existing project installed it into another schema, inspect and reconcile that extension location manually before applying; the migration will roll back rather than silently relocate it.

`member_directory` is a **security-invoker** view of explicit completed/public profile fields, live follower/following counts, and the caller's follow state. RLS remains active underneath it. No private email, `auth.users` record, role, or editable counter is exposed. A NULL username stays out of the directory. Joined dates reflect the existing public profile's `created_at` value.

`discover_people()` is a security-invoker, authenticated-only RPC with bounded query length, four allowed filters, limits 1–48, and offsets 0–10000. SQL parameters are not concatenated into executable SQL. `%`, `_`, and backslashes are escaped for literal substring search. All recommendations exclude the caller. Suggested excludes already-followed accounts; Popular orders by follower count; New Members orders by profile creation date; Following contains the caller's followed members. Ties use creation date and ID. The UI loads 24 records per page.

Follow INSERT requires the real caller's ID, verified email, and completed caller/target profiles. DELETE requires the relationship owner and verified email. UPDATE is not granted. Duplicate follows and self-follow are rejected in PostgreSQL. Counts are computed from rows and cannot be assigned from client state. The UI refreshes counts from the server after successful actions. It does not invent success or optimistically change counters after failures.

## Storage and upload behavior

005 requires the managed Supabase Storage schema with RLS already enabled. It creates public `member-avatars` and `member-covers` buckets only when absent, and refuses incompatible existing bucket settings instead of changing visibility. Exact limits:

| Bucket | Maximum uploaded size | Allowed stored MIME |
| --- | --- | --- |
| `member-avatars` | 2,097,152 bytes | `image/webp` |
| `member-covers` | 5,242,880 bytes | `image/webp` |

JPEG, PNG, and WebP source files are accepted by the frontend. It checks source size, MIME, magic bytes, successful decoding, maximum 8192-pixel side/32-megapixel dimensions, and output size. Images are resized to a maximum 1024-pixel avatar side or 2400-pixel cover side and re-encoded as WebP. Canvas re-encoding discards original file metadata. SVG and GIF are not accepted.

Storage itself enforces the bucket byte limit and declared WebP MIME; browser decoding/re-encoding is client validation, not a server-side content attestation. The SQL fixture tests cover policy execution and configured settings, not the hosted Storage HTTP service or its file inspection. Those require the manual API tests below. [Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits) describe this division.

Objects use `<authenticated-uuid>/<random-uuid>.webp`, `upsert: false`, and owner-folder checks with trusted verification state. A caller-only security-definer helper exposes only upload eligibility, never emails or another user's status. Restrictive guards prevent unrelated permissive Storage policies from authorizing cross-user writes or modifying existing member media. Other buckets retain their existing access behavior. Owner listing is permitted, but public raw downloads remain public by design. See [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Uploading does not immediately update the profile: **Save profile** attaches the uploaded URL. Save is disabled during upload. Clear image clears the draft URL; saving removes that profile reference. Old and abandoned files are retained. There is no client overwrite or delete path and no automatic user-data deletion. Storage lifecycle/cleanup remains a separately approved operator task. Public profile images are not suitable for private documents.

Keep the project-wide Storage size limit at least 5,242,880 bytes or uploads will fail earlier than the cover bucket limit. The existing public frontend key is sufficient; do not add service-role keys or new secrets. Existing SMTP, Confirm email, and `/auth/callback` redirect configuration stays unchanged.

## Routes and UI

| Route | Behavior |
| --- | --- |
| `/app/profile` | Real signed-in profile, image/cover, name/username/bio, joined date, counts, Edit button |
| `/app/profile/edit` | Existing editable profile flow extended with avatar/cover uploads |
| `/app/onboarding` | Existing first-profile flow, now supporting images too |
| `/app/people` | Real directory, search, four filters, follow/unfollow, pagination, View Profile |
| `/members/:username` | Public completed profile; full member shell for onboarded signed-in viewers, compact app header for signed-out viewers |
| `/preview/people` | Explicit placeholder, not a fake member directory |

Public profile pages are application content, not marketing pages. Public visitors can read public fields; follow actions require verified sign-in and onboarding. Sign-in can return to a valid username URL. Unknown or changed usernames show Member not found. Loading, empty bio, no results, no recommendations, no following, missing schema, upload failures, and network/retry states are explicit. Broken avatars fall back to initials; broken profile covers fall back to the design background.

The member sidebar and mobile navigation include Discover. Saved names/avatars appear in the existing shell. Blue `#0866FF`, yellow `#FFC400`, black/gray text, Playfair Display headings, Inter, and existing responsive layout rules are preserved. Profile and people cards adjust from three to two to one column; no hardcoded member data is shipped in these features.

## Verification

`npm test` passed **100 tests across 11 files**. Tests include:

- Existing authentication, confirmation, logout, profile editing, uniqueness, recovery, and role-denial cases.
- Actual migrations 001–005 executed against isolated in-memory PostgreSQL/PGlite, including the real `pg_trgm` extension.
- Member search by display name/username, literal wildcard handling, filters, pagination, self/duplicate/forged follows, unfollow ownership, derived counts, and denial of private Auth reads and forged counters.
- Avatar/cover column ownership, Storage folder ownership, invalid paths, anonymous/unverified writes, overwrite/delete denial, and restrictive guard behavior alongside deliberately broad pre-existing policies.
- Image source limits, file signatures, decode/encoding failures, dimensions, unique upload paths, no upsert, upload/save sequencing, failures, member cards, profile routes, follow errors, count refreshes, and obsolete search responses.

The suite uses mocked Supabase transport for React tests and disposable SQL/Storage fixtures for authorization tests. It does not connect test accounts to hosted Supabase, send emails, upload hosted files, or apply hosted migrations. File decoding/canvas primitives are mocked in unit tests; actual browser decoding remains a manual check. The browser-control host was unavailable and native access timed out, so no visual browser verification is claimed.

`npm run build` passes strict TypeScript checking and the Vite production build. Real hosted bucket enforcement, PostgREST grants, JWT/session refresh, browser image processing, layout, and cross-device behavior still require the checks below after manual migration application.

## Two-account manual test plan

1. Audit the intended hosted schema/policies/grants. Review and apply 004 then 005 manually. Inspect `profiles.cover_url`, the follows constraints/indexes, view `security_invoker=true`, function execute grants, bucket limits, and Storage policies. Confirm `user_roles` definitions/permissions/rows are unchanged. Reload the app after schema-cache refresh.
2. Sign in as ordinary member A. Open My Profile: compare all displayed fields with the saved database record, including joined date and zero/nonzero follow counts. Edit name/bio, test invalid/duplicate usernames, save, and reload. No private email or role editor should appear.
3. Upload a real JPEG/PNG avatar and cover. Check progress/disabled Save, previews, and the instruction to save. Save and reload both the private route and `/members/<username>` in a signed-out browser. Confirm images, date, and bio persist. Use different screen widths and keyboard navigation.
4. Test oversized avatar (>2 MiB), oversized cover (>5 MiB), fake PNG contents, SVG/GIF, invalid image data, and an image over 32 megapixels. Expect errors and unchanged saved profile. Simulate a network failure during upload/save; no false success should appear.
5. Against an approved test project's **Storage HTTP API**, attempt an oversized stored WebP, a disallowed MIME, a path under B's UUID, an anonymous upload, and an upsert/update/delete. Verify hosted size/MIME and RLS rejection. Do not use a service-role key for member tests. SQL metadata insertion is not a valid substitute for testing Storage upload byte limits.
6. Complete ordinary member B's profile. Open Discover as A. Search partial display names and usernames, including mixed case and underscores. Confirm A is excluded, unfinished profiles are absent, no results is honest, and View Profile uses B's unique username URL. Exercise all four filters and Load more when enough approved test accounts exist.
7. Follow B as A. Confirm B's follower count and A's following count each increase by one, B appears in Following, disappears from Suggested, and Popular reflects live counts. Reload both sessions/profile pages. Repeat the same follow API request: there must still be one relationship. Unfollow and verify the reverse changes.
8. Use two ordinary authenticated browser contexts to attempt a forged `follower_id`, self-follow, another member's unfollow/delete, follow timestamp updates, profile/cover edits targeting B, and private `auth.users`/role-table reads or writes. Expect denial or zero affected rows, and verify unchanged stored records. Use `supabase.from('follows').insert(...)` / `.delete().eq(...)` with the real user client, never SQL Editor's privileged operator session.
9. Open a valid public profile signed out: only completed public fields/counts should display and Follow should lead to sign-in. Test an unknown/renamed username, incomplete member, and direct `/app/people` while signed out. Signed-in members must still be denied admin/moderation access without trusted roles.
10. Test slow search responses, switching filters during requests, follow failures, missing migration errors, and offline retry. Verify failed actions do not create fake counts, and refresh a page after another member follows to confirm server state. Live push/realtime count subscriptions are not implemented.

## Changed files in this pass

New SQL: migrations `202611130004_member_directory_and_follows.sql` and `202611130005_member_image_storage.sql`.

New source: `src/features/people/{peopleService.ts,FollowButton.tsx,DiscoverPeople.tsx,MemberProfile.tsx}` and `src/features/profiles/{imageUpload.ts,ImageUploader.tsx}`.

Modified source: `src/features/profiles/{profileService.ts,ProfilePage.tsx}`, `src/features/auth/authErrors.ts`, `src/app/router.tsx`, `src/components/layout/{navigation.ts,AppLayout.tsx}`, and `src/styles/index.css`.

Tests: added `people.database.test.ts`, `peopleService.test.ts`, `people.test.tsx`, `imageUpload.test.ts`, and `imageUploader.test.tsx`; updated `profile.test.tsx` for the cover draft payload. Documentation: README, `docs/supabase-audit.sql`, and this guide. Existing migrations 001–003, AuthProvider, protected-route enforcement, `.env`, and role security were preserved.

Remaining work is manual migration application and hosted/browser verification, optional separately approved Storage lifecycle management, realtime updates if desired, and the still-placeholder posts/feed, messaging, notifications, settings, moderation, and admin features. No commit, push, deployment, hosted mutation, or user-data deletion was performed by the agent.
