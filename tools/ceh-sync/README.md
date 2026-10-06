# CEH accounts and progress sync

Status: implemented locally and connected to the hosted project `cbkhisehgxnuadoitono` (CEH Quiz Progress, Singapore). The schema and authentication settings are applied, and real hosted account isolation and cross-browser resume tests passed. The existing live site is unchanged pending the owner's review and approval.

The encrypted question vault and its passphrase are unchanged. Supabase Auth identifies each person, and the database stores one private progress snapshot per account. No questionnaire content, vault key, passphrase, or account password is stored in the progress table.

## One-time hosted setup

1. Sign into the Supabase dashboard. Create a dedicated project on the Free plan, preferably in Singapore, with a strong database password entered by the owner.
2. Run `schema.sql` in the SQL editor. It enables row level security, limits each account to its own row, and provides a revision-checked save operation.
3. In Authentication → URL Configuration, set the Site URL to `https://megatmuhammadfawwaz.github.io/ceh/`. Add `https://megatmuhammadfawwaz.github.io/ceh/index.html` as an allowed redirect. Add `http://127.0.0.1:8768/ceh/index.html` only while testing locally.
4. Email/password signup is enabled. The owner explicitly approved immediate signup without email confirmation on 2026-10-07. Email addresses are therefore not verified. Anonymous sign-in and manual identity linking remain disabled. Configure a production email service before enabling password reset or confirmation emails for general users; the default Supabase sender only delivers to organization team addresses. See the [official email service documentation](https://supabase.com/docs/guides/auth/auth-smtp).
5. Put only the project URL and public publishable key in `ceh/sync-config.js`. Never use a secret or service-role key in the browser.
6. Run `node tools/ceh-sync/validate-config.cjs` and the tests. Review the local preview before publishing. Pushing main automatically deploys the site.

The URL, schema, public key, and approved authentication settings above are already configured. `passwordResetEnabled` is false in the browser configuration, so the UI does not offer unavailable reset emails. Enable it only after verifying email delivery. Remove the temporary localhost redirect after deployment verification. Do not commit account tokens, database passwords, test-account passwords, or the owner's progress backup to the website repository.

## Existing owner migration

Use the existing Opera profile at the existing live origin. Sign into a personal CEH account and select **Keep my existing progress**. The original keys `ceh_quiz_progress_v1` and `ceh_quiz_stats_v1` remain available; migration copies their full contents and first creates safety backups. The original progress can be attached only once per browser, so a subsequent account cannot claim it.

Once the status reads **Up to date**, sign into that same account on another computer. All category sessions, question records, XP, streaks, weak spots, bookmarks, badges, and run history are loaded. Every other account has a separate save. Signing out keeps any pending changes under the original account on that device.

## Reliability and conflicts

The browser saves one complete snapshot before attempting an upload. Autosync is debounced; opening the page, returning to a tab, reconnecting, or pressing **Sync now** checks for updates. The database uses compare-and-swap revisions, so a stale device cannot silently replace a newer save.

If both devices changed, practice is paused and the user chooses the online or device version. Both versions are backed up locally and can be downloaded. Changes are not automatically added together because XP, resets, and repeated answers cannot safely be merged from aggregate snapshots. Local safety copies are retained, not automatically pruned. Download the current progress and safety copies before clearing browser data.

Only a previously loaded account can continue from a cached save when its database download fails. A failed first download blocks startup instead of creating a blank replacement. Once an email service is configured and resets are enabled, password reset links return to the vault page; unlock it to set a new account password.

## Tests

`node --test tools/ceh-sync/progress-store.test.cjs` covers legacy preservation, explicit migration, two users, another computer, offline recovery, revision conflicts, in-flight edits, stale tabs, corrupted storage, and quota failures.

The database schema was additionally executed against local PostgreSQL using PGlite, testing anonymous denial, account isolation, attempted cross-account writes, invalid payloads, forbidden deletion, and stale revisions. Isolated browser tests verified the owner's backup with mocked cloud transport, conflicts, real quiz answers, and mobile layout.

Live tests against the hosted project verified immediate signup without sending email, password sign-in, private account saves, denied cross-account access, revision conflicts, a real quiz answer syncing, and resume in another isolated browser using the real vendored SDK. Only dummy progress was uploaded to two temporary accounts. The owner's real progress has not been uploaded or migrated. The temporary account IDs are recorded in the review workspace for cleanup after approval. Actual public-site deployment and the owner's migration are still pending.

To reproduce both automated suites, run `npm ci` and `npm test` from `tools/ceh-sync/`. PGlite creates an isolated in-memory PostgreSQL database; it does not contact or change a hosted database.

SDK: vendored `@supabase/supabase-js` 2.117.2 from npm, with its MIT license. No CDN script is required.

Security references: [Supabase row level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions).
