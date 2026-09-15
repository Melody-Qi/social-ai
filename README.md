# Social AI

A small social web app: sign up, post text and photos, browse a collection, and
search it. Built as the frontend half of a course project (Social AI), and kept
as a working reference for the patterns it uses rather than as a finished
product.

The React app talks to a Go backend that stores posts in Elasticsearch. This
repository is the frontend only — the backend is a separate codebase, reached
through `BASE_URL` in `src/constants.js`.

## Features

| Area | What it does |
|---|---|
| Auth | Sign up / log in. The backend returns a JWT, stored in `localStorage` and re-validated on every page load. |
| Landing | Public landing page with a photo album and a lightbox (fullscreen, slideshow, thumbnails, zoom). |
| Feed | The signed-in user's posts, rendered as a photo grid plus a post list. |
| Create post | Text-only posts, or posts with an uploaded image / video file. |
| Image generation | Generate an image from a text prompt and attach it to a post. |
| Search | Three modes: keyword, user, and semantic (meaning-based). |

## Search

Keyword and user search are plain Elasticsearch queries. **Semantic** search
sends the raw text to the backend, which embeds it with Gemini
(`gemini-embedding-001`, 768 dimensions) and ranks posts by cosine similarity.

The embedding model and its API key stay server-side — the browser never sees a
key and never picks a model. Until `GEMINI_API_KEY` is configured on the backend,
the endpoint answers `503` and the UI shows *"Semantic search is not enabled on
the server yet."*

See [`SEMANTIC_SEARCH.md`](./SEMANTIC_SEARCH.md) for setup and verification.

## Image generation

`src/services/imageProvider.js` picks a provider at runtime so the feature never
dead-ends:

- **Pollinations.ai** (default) — free, no signup, FLUX model, reachable from
  both a local dev machine and a deployed host.
- **OpenAI `gpt-image-2`** — used only when `REACT_APP_OPENAI_KEY` is set and the
  call succeeds.

If the OpenAI call fails for any reason the provider silently falls back to
Pollinations. A circuit breaker skips OpenAI entirely for a while after a
failure, so a dead or quota-less key does not keep adding 30-second timeouts to
every click (401 → rest of session, 429 → 10 minutes, 5xx/network → 60 seconds).

## Running it

```bash
npm install
npm start        # http://localhost:3000
```

Other scripts:

```bash
npm run build                   # production bundle into build/
CI=true npx react-scripts test  # unit tests, non-interactive
```

Build and test both pass on a clean checkout. `src/setupTests.js` stubs two
browser APIs that jsdom does not implement and that Ant Design calls while
rendering (`matchMedia`, `ResizeObserver`).

## Configuration

Copy `.env.example` to `.env.development.local` and fill in what you need. That
file is gitignored; **do not commit real values.**

| Variable | Default | Purpose |
|---|---|---|
| `REACT_APP_AUTH_MODE` | `real` | `mock` accepts the fixed token `123` for local work. Ignored in production builds. |
| `REACT_APP_OPENAI_KEY` | _(unset)_ | Enables the OpenAI image path. Unset → Pollinations only. |
| `REACT_APP_IMAGE_PROVIDER` | _(auto)_ | Force `pollinations` or `openai` instead of auto-selecting. |
| `REACT_APP_OPENAI_IMAGE_MODEL` | `gpt-image-2` | Override the OpenAI image model name. |

Anything prefixed `REACT_APP_` is inlined into the shipped JavaScript bundle at
build time. That is why the image key lives in a gitignored file, and why the
semantic-search key is deliberately kept on the server instead.

## Layout

```
src/
  index.js                   mounts <App> inside BrowserRouter + Ant Design's <App>
  components/
    App.js                   auth state only: restore token -> isLoggedIn
    Main.js                  routing once signed in
    Landing.js               public landing page, photo album, image generation
    Login.js  Register.js    auth forms
    Collection.js            post list + search
    PhotoGallery.js          photo grid + lightbox
    PostForm.js  PostMessageModal.js  CreatePostButton.js
    SearchBar.js  ResponsiveAppBar.js
  services/imageProvider.js  provider selection + circuit breaker
  constants.js               BASE_URL, token key, search modes
  utils.js                   stored-token validation
  styles/                    per-component CSS
```

## Notes

- `axios` and `yet-another-react-lightbox` are ESM-only and ship no usable
  `main` field, so Jest 27 cannot resolve them the way webpack does.
  `package.json` maps them explicitly under `jest.moduleNameMapper`, and
  `transformIgnorePatterns` lets Babel transform those packages. Removing either
  breaks `npm test` but not `npm run build`.

## Course context

Written for the Social AI course. Several files carry a lesson marker in their
comments (`.env.example` → Lesson 39 auth mode, `src/services/imageProvider.js`
→ Lesson 44 image provider, `SEMANTIC_SEARCH.md` → the Go binary
`socialai_lesson36`), so the comments are the best guide to which lecture each
piece came from.
