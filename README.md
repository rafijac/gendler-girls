# The Gendler Girls

A memorial website for Holocaust survivors **Leah Gendler Fink** and
**Naomi Gendler Jacobson** — sisters who survived the Shoah together.

This repository is the permanent home of the site. It replaces two earlier
sites (Dovid's original Wix page and Mico's WordPress build at
gendlergirls.com), whose content was consolidated here in November 2026.
All family content — stories, testimonies, photos, speeches — now lives in
one place, and the whole family can edit it without a developer.

## How it works (in plain words)

- **The website** is a set of plain web pages served by Cloudflare Pages.
  The pages you see are built from the content in a small database, so
  editing content changes the site immediately — no redeploy needed.
- **The family admin** lives at `/admin/` on the site. One shared family
  password opens it (no accounts, no apps). From there the family can add,
  edit, delete, hide, and reorder photos, videos, stories, speeches,
  timeline entries, references, public appearances, and Joel's Notes —
  and control display: section order, section visibility, hero image,
  featured video, and theme.
- **Nothing is ever truly lost.** Deleting something only hides it: it goes
  to the Trash and can be restored. Every edit keeps the previous version,
  so any change can be reverted from History. And every night, a full
  backup of all content is committed to this repo (`data/snapshot.json`),
  so even a wiped database can be rebuilt from git history.
- **Photos the family uploads** are stored in Cloudflare R2 (object
  storage). The original seeded photos are plain files in `public/images/`.

## Tech (for the technical reader)

Cloudflare Pages (static frontend, vanilla HTML/CSS/JS, no framework, no
build step) + Pages Functions (API, `functions/`) + D1 (SQLite: content,
versions, settings) + R2 (family-uploaded photos). Wrangler for local dev
and deploy. Free tier throughout.

```
public/                 static site: index.html, styles.css, app.js, images/
public/admin/           admin SPA: index.html, admin.js, admin.css
functions/api/          Pages Functions: public content, admin auth + CRUD,
                        upload, history, trash, export, snapshot
migrations/             D1 SQL migrations (numbered)
seed/                   seed.mjs (content.json -> D1 seed SQL) + seed.sql
.github/workflows/      snapshot.yml (nightly content export -> commit)
data/                   nightly snapshots (created by the workflow)
```

## Local development

```bash
npm install
npm run seed          # regenerate seed/seed.sql from seed/content.json
npm run seed:local    # load the seed into local D1 (idempotent)
npm run dev           # serves the site + API at http://localhost:8788
```

Local admin login needs test secrets in `.dev.vars` (never committed —
it is in `.gitignore`):

```bash
# .dev.vars — LOCAL ONLY, never commit, never reuse in production
ADMIN_PASSWORD_HASH=<sha256 hex of a test password>
SESSION_SECRET=<any long random string>
SNAPSHOT_TOKEN=<any long random string>
```

Generate a password hash with:

```bash
printf '%s' 'your-family-password' | sha256sum
```

## Deploying (first time)

1. **Create the GitHub repo** `rafijac/gendler-girls` (public) and push
   this code. (Repo creation/pushing is done by hand, not by automation.)
2. **Cloudflare Pages:** Dashboard → Workers & Pages → Create → Pages →
   Connect to Git → pick `rafijac/gendler-girls`. Build command: none.
   Output directory: `public`.
3. **Create the database and storage bucket:**
   ```bash
   wrangler d1 create gendler-girls
   wrangler r2 bucket create gendler-girls-uploads
   ```
   Copy the `database_id` from the `d1 create` output into `wrangler.toml`
   (`[[d1_databases]]`), commit, and push.
4. **Bind them in the Pages project:** Dashboard → your Pages project →
   Settings → Functions → D1 database bindings → add binding `DB` →
   `gendler-girls`; R2 bucket bindings → add binding `R2` →
   `gendler-girls-uploads`. (Local dev reads these from `wrangler.toml`;
   production reads them from the dashboard bindings.)
5. **Run the migration and seed against the real database:**
   ```bash
   wrangler d1 migrations apply gendler-girls --remote
   npm run seed:remote
   ```
6. **Set the secrets** in the Pages project (Dashboard → Settings →
   Environment variables → Production):
   - `ADMIN_PASSWORD_HASH` — sha256 hex of the family password (see above).
   - `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`).
     Changing it logs everyone out.
   - `SNAPSHOT_TOKEN` — a long random string (e.g. `openssl rand -hex 32`).
7. **Enable nightly snapshots:** in the GitHub repo, add two Actions
   secrets (Settings → Secrets and variables → Actions):
   - `SITE_URL` — e.g. `https://gendler-girls.pages.dev` (no trailing
     slash). Use the custom domain once it is connected.
   - `SNAPSHOT_TOKEN` — the same value as in step 6.
   The workflow (`.github/workflows/snapshot.yml`) then commits a full
   content export to `data/snapshot.json` every night (only when changed).
   It skips cleanly if the secrets are unset.

Redeploys are automatic: every push to the repo's default branch
redeploys the site. Content edits made in the admin do **not** need a
redeploy — they take effect immediately.

## Changing the family password

1. Generate the new hash: `printf '%s' 'new-password' | sha256sum`
2. In Cloudflare Dashboard → Pages project → Settings → Environment
   variables → Production, set `ADMIN_PASSWORD_HASH` to the new hash.
3. Redeploy (or wait for the next deploy) — environment changes apply on
   the next deployment. Changing `SESSION_SECRET` at the same time logs
   out all current sessions immediately.

Tell the family the new password directly (WhatsApp, phone) — never put
it in this repo, in an email subject, or in a chat log you would not want
forwarded.

## Restoring deleted content

In order of ease:

1. **Trash** (`/admin/` → Trash): everything deleted in the admin sits
   here until explicitly purged. Restore one item, or restore all.
2. **History** (`/admin/` → History): every edit keeps its previous
   version. Find the change and revert it.
3. **Export backup** (`/admin/` → Export backup): downloads a full JSON
   backup. To restore from it, a technical person can re-import the
   entities (see `seed/seed.mjs` for the shape) or ask for help.
4. **Repo snapshot** (`data/snapshot.json` in this repo, updated nightly):
   the same full export, versioned in git. Check out any past date's
   snapshot and restore from it. This survives even a fully wiped
   database, because nothing done inside the admin can touch git history.

## Adding a second Cloudflare admin

The site should not depend on one person. In the Cloudflare dashboard:
Account → Manage Account → Members → Invite. Give the second person
**Admin** access to the account (or at least to the Pages project, D1
database, and R2 bucket). They will need their own free Cloudflare
account. Also add them as a collaborator on the GitHub repo
(Settings → Collaborators) so the code and snapshots are not locked to
one account either. Keep this README's deploy/secret notes up to date so
the second admin can actually take over.

## Costs

Free tier throughout, at this site's scale: Cloudflare Pages (free),
Workers/Functions (100k requests/day free), D1 (5M rows read/day free),
R2 (10 GB storage free). A small family memorial site will not come close
to any limit. If Cloudflare's terms ever change, the code and data are
portable — the frontend is plain static files, the data is SQLite/JSON,
and uploads are plain image files.

## Original photos

The photos in `public/images/` are web-optimized copies (max 1600px,
JPEG). The **original full-size photos** live in the workspace archive
(`~/workspace/gendler-girls/media/` on Rafi's machine) and are
deliberately **not** in this repo (some are 5 MB originals). A copy on a
family shared drive is strongly recommended so the originals survive
any single machine. The family-uploaded photos live in R2; the nightly
snapshot backs up the content database, not the image files — export the
R2 bucket separately if a full media backup is ever needed
(`wrangler r2 object list` / `aws s3 sync` with an R2 API token).

## Domain note

`gendlergirls.com` is registered at GoDaddy (since June 2022, paid up
until June 2029) and its transfer lock is on. Pointing it at this new
site needs the domain owner's help: unlock the domain in GoDaddy and
provide the auth code for a transfer, or simply change the DNS records
to point at the Cloudflare Pages project. Until then the site lives at
its `*.pages.dev` address (or any new domain the family registers).

## Secrets — the one rule

**Never commit a secret.** No passwords, password hashes of real
passwords, tokens, or API keys anywhere in this repo — not in code, not
in docs, not in `.dev.vars` (gitignored), not in commit messages. If a
real secret is ever committed by mistake, rotate it immediately (change
the password / regenerate the token) — removing it from git history
after the fact does not un-leak it.
