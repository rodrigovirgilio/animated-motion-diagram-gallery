# Contributing

Thanks for helping the gallery grow. There are two ways to contribute: open an
issue (no code) or send a pull request.

## Before you start

- The app: https://animated-motion-diagram.netlify.app
- Build the diagram in the editor and use **Save .json**, or export the current
  theme in **Inspector → Community themes → Export theme JSON**.
- Only @rodrigovirgilio can merge to `main`. Everything else happens through a
  fork and a pull request.
- By contributing you agree to publish the content under the MIT license.

## Add a template

1. Create `templates/<theme>/<slug>.json`, where `<theme>` is the theme used by
   the diagram and `<slug>` matches the `slug` field.
2. Use this shape:

```json
{
  "slug": "webhook-retries",
  "name": "Webhook retries with a dead-letter queue",
  "description": "API → retry queue → worker → webhook, with exponential backoff and a DLQ.",
  "theme": "gta",
  "data": {
    "title": "Webhook retries without losing the event",
    "subtitle": "Exponential backoff, then a dead-letter queue",
    "nodes": [],
    "edges": [],
    "steps": [],
    "theme": "gta"
  }
}
```

Rules enforced by CI:

- `slug` is a lowercase slug (3–40 chars, `a-z`, `0-9`, `-`) and matches the
  file name.
- `theme` matches the folder and `data.theme`.
- 2–80 nodes, at most 120 edges, 1–120 steps.
- Node kinds: `client`, `gateway`, `server`, `database`, `cache`, `cloud`,
  `queue`, `file`.
- Every edge `from`/`to` and every step reference exists.
- Steps are `reveal`, `travel`, `pulse` or `hold`; duration is 0.1–30 s.
- `name` ≤ 80 chars, `description` ≤ 200, `title` ≤ 160, `subtitle` ≤ 240.
- No unknown/duplicated ids.

## Add a theme

1. Create `themes/<id>.json` using the JSON exported by the app.
2. `id` must be a new lowercase slug. The built-in ids are reserved:
   `sketch`, `lego`, `neon`, `terminal`, `matrix`, `gta`.
3. Required fields: `name` (1–40), `palette` (2–12 colors), `bg`, `ink`,
   `muted`, `card`, `stroke`, `accent`, `marker`, `edge`, `titleFont`,
   `bodyFont`.
4. Fonts must be a **single family** per field — Canvas 2D ignores fallback
   lists (`"Space Grotesk"`, not `"Space Grotesk", sans-serif`).
5. Numeric limits: `strokeW` 0–10, `radius` 0–40, `glow` 0–40, weights
   100–900.

A template can use a theme added in the same PR; the theme just needs to exist
in `themes/`.

## Regenerate the manifest

`manifest.json` is the index used by the GitHub fallback and by the publish
script. It is generated, never hand-edited:

```bash
npm run manifest
```

CI fails if it is stale.

## Validate locally

```bash
npm run check   # validate + manifest:check + unit tests
```

If you want to test the Supabase path without a project:

```bash
npm run mock
# another terminal
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=test-service \
npm run sync
```

The mock is in-memory and implements only the REST calls used by the project.

## Review and publishing

1. CI validates the PR.
2. A maintainer reviews the content (quality, legibility, originality).
3. The PR is merged to `main`.
4. The **Publish to Supabase** workflow runs and upserts the files.
5. The app shows the new card or theme. If Supabase is not configured, the app
   reads the same files from `manifest.json` on GitHub.

Removing a file from the repo and merging also removes the corresponding
Supabase row (`source = 'github'`).

## Security

- Never commit tokens, keys or `.env` files.
- The service role key lives only in GitHub Actions secrets.
- Do not add external assets or URLs that the renderer would fetch. Everything
  is drawn from the JSON.

## Português

- **Template:** `templates/<tema>/<slug>.json`, com `slug` igual ao nome do
  arquivo e `theme` igual à pasta.
- **Tema:** `themes/<id>.json`, com id novo (os seis temas embutidos são
  reservados).
- Rode `npm run check` e `npm run manifest` antes do PR.
- Só o @rodrigovirgilio faz merge na `main`; o resto entra por fork + PR.
- Ao chegar na `main`, o workflow publica no Supabase automaticamente.
