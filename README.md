# Animated Motion Diagram — Gallery

Community **templates** and **themes** for
[Animated Motion Diagram](https://animated-motion-diagram.netlify.app).

This repository is public and cloneable. Approved content is published
automatically to the app gallery when it reaches `main`. Only
[@rodrigovirgilio](https://github.com/rodrigovirgilio) can merge to `main`;
everyone else contributes through a fork and a pull request.

```
animated-motion-diagram-gallery/
├── templates/
│   ├── lego/nginx.json
│   ├── lego/feature-flag-rollout.json
│   ├── terminal/cicd.json
│   ├── matrix/oauth.json
│   ├── neon/queue.json
│   └── gta/webhook-retries.json
├── themes/
│   ├── blueprint.json
│   └── papercut.json
├── manifest.json          # generated index used by the app as a fallback
├── supabase/schema.sql    # tables + row-level security
└── scripts/               # validate, manifest, sync, local mock
```

It ships the four templates that are built into the app plus two community examples.

## Templates vs. themes

| Folder                    | What it is                                            |
| ------------------------- | ----------------------------------------------------- |
| `templates/<theme>/<slug>.json` | A complete diagram (nodes, edges, animation steps). |
| `themes/<id>.json`        | A visual theme (colors, fonts, grid, glow).           |

A template lives **inside the folder of the theme it uses**, and the JSON must
agree with the folder:

```json
{
  "slug": "webhook-retries",
  "name": "Webhook retries with a dead-letter queue",
  "description": "API → retry queue → worker → webhook, with exponential backoff and a DLQ.",
  "theme": "gta",
  "data": { "title": "...", "nodes": [], "edges": [], "steps": [], "theme": "gta" }
}
```

A theme is the exact object exported by the app:

```json
{
  "id": "blueprint",
  "name": "Blueprint",
  "bg": "#081826",
  "grid": "rgba(56, 189, 248, 0.16)",
  "ink": "#e0f2fe",
  "palette": ["#22d3ee", "#fbbf24"]
}
```

The six built-in ids (`sketch`, `lego`, `neon`, `terminal`, `matrix`, `gta`)
are reserved. A new theme gets a new id.

## Use a template

- **In the app:** open the grid button in the header. Templates from this repo
  appear under the **Community** badge and stay fully editable.
- **Manually:** download a JSON file and use **Open** in the app.

## Contribute

1. **No code?** Open an issue:
   [new template](https://github.com/rodrigovirgilio/animated-motion-diagram-gallery/issues/new?template=template.yml)
   or [new theme](https://github.com/rodrigovirgilio/animated-motion-diagram-gallery/issues/new?template=theme.yml).
   A **Triage** workflow validates the pasted JSON automatically: it labels the
   issue `ready` (valid) or `needs-changes` (with the exact errors), and posts a
   verdict comment.
2. **With code:**
   ```bash
   git clone https://github.com/rodrigovirgilio/animated-motion-diagram-gallery.git
   cd animated-motion-diagram-gallery
   # add templates/<theme>/<slug>.json or themes/<id>.json
   npm run check          # validation + manifest + unit tests
   git add -A && git commit -m "feat: add <name>"
   ```
3. Open a pull request. CI runs `npm run check`. A maintainer reviews and
   merges.

The full rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## What happens on merge

```
pull request ──CI validates──▶ main ──Publish workflow──▶ Supabase ──▶ app gallery
                                      └── manifest.json ──▶ raw GitHub fallback
```

- `.github/workflows/ci.yml` validates every PR.
- `.github/workflows/publish.yml` runs on pushes to `main`, waits for
  validation, and upserts the approved files into Supabase.
- Files deleted from the repo are pruned from Supabase (`source = 'github'`).
- If Supabase is not configured (or unavailable), the app falls back to
  `manifest.json` + the JSON files on `raw.githubusercontent.com`. The gallery
  keeps working with zero backend cost.

Publishing is idempotent: the `slug`/`id` is the primary key, so re-running the
workflow updates rows instead of duplicating them.

## Security model

- The repository is public: anyone can read, fork and open PRs.
- Only the owner has write access; branch protection requires a PR, blocks
  force-pushes and deletions, and requires the `validate` check.
- `SUPABASE_SERVICE_ROLE_KEY` exists **only** as a GitHub Actions secret. It is
  never shipped to the browser.
- The app uses the public `anon` key and row-level security allows `select`
  only where `published = true`. There is no insert/update/delete policy.
- Every JSON file is validated in CI (size limits, known node kinds, existing
  references, reserved theme ids, single font family). The app validates again
  at runtime with `parseDiagram()` / `parseTheme()`.
- The content is rendered on a Canvas 2D context; no HTML is injected.

## Local testing

No dependencies are required (Node 20+).

```bash
npm run check                 # validation + manifest freshness + unit tests
npm run manifest              # regenerate manifest.json after editing files
npm run mock                  # Supabase-compatible mock on :54321
```

Full sync round-trip against the mock:

```bash
# terminal 1
npm run mock

# terminal 2
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=test-service \
npm run sync

curl -s 'http://127.0.0.1:54321/rest/v1/templates?select=id,name&published=eq.true'
```

`MOCK_SEED=1 npm run mock` pre-loads the current files, so the app can point at
it without running a sync:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=test-anon \
npm run dev    # in the app repository
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
3. Add the repository secrets `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets and variables → Actions).
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the app build
   environment (Netlify) and redeploy.

Without steps 3–4 the app still works through the GitHub fallback.

## License

MIT. By contributing you agree to publish your template or theme under the
same license.
