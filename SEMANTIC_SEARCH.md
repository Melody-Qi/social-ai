# Semantic Search Setup

The Social AI frontend now includes a **Semantic** search mode. The browser sends
`GET /search?semantic=<text>` to the Go backend. The API key is never sent to the
browser: the backend uses Gemini `gemini-embedding-001` to create a 768-dimensional
query vector, then Elasticsearch ranks posts by cosine similarity.

## Current behavior

- Keyword and user search continue to work as before.
- Semantic search returns HTTP `503` until `GEMINI_API_KEY` is configured.
- The UI converts that `503` response into the message
  `Semantic search is not enabled on the server yet.`
- New posts receive an embedding when semantic search is enabled.
- Existing posts can be embedded once at startup by setting
  `SEMANTIC_BACKFILL_ON_STARTUP=true`.

## Configure the GCE development server

Create a Gemini API key in Google AI Studio. Do not paste it into source code,
Git, screenshots, or chat. In the SSH terminal, set it only for the process that
starts the backend:

```bash
cd ~/go/src/socialai
export GEMINI_API_KEY='REPLACE_IN_THE_TERMINAL_ONLY'
export SEMANTIC_BACKFILL_ON_STARTUP=true
./socialai_lesson36
```

After the first successful backfill, restart later with
`SEMANTIC_BACKFILL_ON_STARTUP=false` so startup does not repeatedly scan old posts.

## Verification

```bash
go test ./...
```

Then sign in, copy the returned JWT, and call:

```bash
curl -G 'http://127.0.0.1:8080/search' \
  -H 'Authorization: Bearer YOUR_JWT' \
  --data-urlencode 'semantic=an outdoor mountain trip'
```

A valid but unrelated wording should still retrieve conceptually similar posts.
An arbitrary value such as `123` is not a valid JWT and cannot enable server-side
semantic search.

## Production note

For production, store the API key in a secret manager and expose it to the
backend at runtime. Do not put a real key in `constants.js`, a React environment
variable, `deploy.yml`, or a committed `app.yaml`; anything shipped to the browser
or repository should be treated as public.
