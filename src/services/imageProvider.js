// =============================================================================
// Image generation provider abstraction.
//
// Auto-selects the best free/cheap provider based on the runtime environment:
//
//   REACT_APP_OPENAI_KEY is set AND the call succeeds  -> OpenAI gpt-image-2
//     (teacher-supplied premium path; matches what the lesson screenshots show)
//
//   otherwise                                            -> Pollinations.ai
//     (free, no key, FLUX Apache 2.0 model, AWS-reachable, no signup)
//
// If the OpenAI call fails for ANY reason -- zero credits, model unavailable,
// network error -- we silently fall back to Pollinations so the demo never
// dead-ends. The user never has to choose; createImage() in Landing.js just
// calls generateImage({ prompt }) and the right provider "just works".
//
// Both providers expose an HTTPS endpoint reachable from a browser bundle,
// so AWS Amplify can deploy either path unchanged. To FORCE a specific
// provider regardless of env, set REACT_APP_IMAGE_PROVIDER=pollinations|openai.
//
// Circuit breaker (added 2026-09-03):
//   When the OpenAI call fails the breaker opens for a duration that depends
//   on the failure type. While open, all calls skip OpenAI straight to
//   Pollinations, so a dead or quota-less key doesn't keep adding 30-second
//   timeouts to every user click.
//
//   401 invalid_api_key            -> disable for the rest of the session
//   429 rate_limit / insufficient_quota -> disable for 10 minutes
//   5xx / network error            -> disable for 60 seconds
//   400 content_policy (etc.)      -> not disabled, fall through to fallback
// =============================================================================

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

function forceProvider() {
  return (process.env.REACT_APP_IMAGE_PROVIDER || "").toLowerCase();
}

function openaiModel() {
  // Pin to gpt-image-2 by default; override with env when OpenAI rolls out a
  // new name. Listed in the /v1/models call today: gpt-image-1, gpt-image-1-mini,
  // gpt-image-1.5, chatgpt-image-latest, gpt-image-2, gpt-image-2-2026-04-21.
  return process.env.REACT_APP_OPENAI_IMAGE_MODEL || "gpt-image-2";
}

// ---------------------------------------------------------------------------
// Circuit breaker (module-level, lives in the browser session)
// ---------------------------------------------------------------------------
const breaker = {
  // 0 = closed (normal); otherwise = unix-ms when the breaker auto-resets
  openUntil: 0,
  // human-readable reason, shown by lastBreakerReason() for debugging
  reason: "",
  // "permanent" means it will not auto-reset this session (e.g. 401)
  permanent: false,
};

function isBreakerOpen() {
  if (breaker.permanent) return true;
  return Date.now() < breaker.openUntil;
}

function openBreaker(durationMs, reason) {
  breaker.openUntil = Date.now() + durationMs;
  breaker.reason = reason;
  breaker.permanent = false;
  console.warn(
    `[imageProvider] circuit breaker open for ${Math.round(durationMs / 1000)}s: ${reason}`
  );
}

function openBreakerPermanent(reason) {
  breaker.openUntil = 0;
  breaker.reason = reason;
  breaker.permanent = true;
  console.warn(`[imageProvider] circuit breaker permanent: ${reason}`);
}

function closeBreaker() {
  breaker.openUntil = 0;
  breaker.reason = "";
  breaker.permanent = false;
}

// Pollination generator -------------------------------------------------------
async function generateWithPollinations({ prompt, width = 1024, height = 1024 }) {
  const seed = Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: "flux",
    nologo: "true",
    enhance: "true",
  });
  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?${params}`;
  return { url, provider: "pollinations" };
}

// OpenAI generator ------------------------------------------------------------
// Lazy-imported so the openai SDK is not pulled into the main bundle when the
// user only plans to use Pollinations (saves ~70 kB gz). On a key-less
// build the chunk is never fetched.
async function generateWithOpenAI({ prompt, size }) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: process.env.REACT_APP_OPENAI_KEY,
    // Only the React bundle running in the browser can ever see this env
    // value; "dangerouslyAllowBrowser: true" is the documented opt-in for
    // that case. Production deployments should still proxy through a server
    // to keep the key out of the public bundle -- see Lesson 44 md sec. 18.1.
    dangerouslyAllowBrowser: true,
  });
  try {
    const response = await openai.images.generate({
      model: openaiModel(),
      prompt,
      n: 1,
      size: size || "1024x1024",
    });
    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI returned no image bytes");
    }
    return {
      url: `data:image/png;base64,${b64}`,
      provider: "openai",
    };
  } catch (err) {
    // The openai SDK uses an APIError class with .status and .code.
    // We map them to breaker durations and re-throw so the caller can fall
    // back. Logging the status once is enough; the body is usually verbose.
    const status = err && (err.status || err.response?.status);
    const code = err && err.code;
    const msg = err && err.message;
    if (status === 401 || code === "invalid_api_key") {
      openBreakerPermanent("401 invalid_api_key");
    } else if (status === 429) {
      // 429 = either rate_limit or insufficient_quota -- treat as quota
      // since rate_limit retries too fast to be worth a 10-min lock.
      openBreaker(10 * 60 * 1000, `429 ${code || "rate_limit"}`);
    } else if (status === 400) {
      // 400 covers content_policy, bad prompt, unsupported size, etc.
      // We do NOT open the breaker -- the next prompt may pass.
      console.warn(
        "[imageProvider] OpenAI 400 (prompt rejected? falling back):",
        msg
      );
    } else if (status && status >= 500) {
      openBreaker(60 * 1000, `${status} server_error`);
    } else if (!status) {
      // Network / DNS / CORS / timeout -- treat as transient
      openBreaker(60 * 1000, `network error: ${msg || "unknown"}`);
    } else {
      console.warn(
        `[imageProvider] OpenAI unexpected status ${status}, falling back:`,
        msg
      );
    }
    throw err;
  }
}

// Track the most recent successful provider for the debug indicator.
let lastUsedProvider = null;

function recordUsage(provider) {
  lastUsedProvider = provider;
  // A successful call proves the key still works; reset breaker.
  if (provider === "openai") closeBreaker();
}

// Public entry point ----------------------------------------------------------
// Returns:
//   { url: <string usable in <img src> or fetch().blob()>, provider: <name> }
export async function generateImage({ prompt, width, height, size }) {
  if (!prompt || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  const forced = forceProvider();
  const hasOpenAIKey = Boolean(process.env.REACT_APP_OPENAI_KEY);

  // 1) Honour explicit overrides first (handy for debugging / comparing).
  if (forced === "pollinations") {
    const r = await generateWithPollinations({ prompt, width, height });
    recordUsage(r.provider);
    return r;
  }
  if (forced === "openai") {
    if (!hasOpenAIKey) {
      console.warn(
        "[imageProvider] REACT_APP_IMAGE_PROVIDER=openai but no key set; using Pollinations"
      );
      const r = await generateWithPollinations({ prompt, width, height });
      recordUsage(r.provider);
      return r;
    }
    const r = await generateWithOpenAI({ prompt, size });
    recordUsage(r.provider);
    return r;
  }

  // 2) Default: try OpenAI when a key is present AND the breaker is closed.
  if (hasOpenAIKey && !isBreakerOpen()) {
    try {
      const r = await generateWithOpenAI({ prompt, size });
      recordUsage(r.provider);
      return r;
    } catch (err) {
      console.warn(
        "[imageProvider] OpenAI call failed, falling back to Pollinations:",
        err && err.message ? err.message : err
      );
    }
  } else if (hasOpenAIKey && isBreakerOpen()) {
    console.warn(
      `[imageProvider] OpenAI skipped (breaker open: ${breaker.reason || "unknown"})`
    );
  }

  // 3) Last resort: free provider.
  const r = await generateWithPollinations({ prompt, width, height });
  recordUsage(r.provider);
  return r;
}

// UI-facing description ------------------------------------------------------
// Turns the `provider` string returned by generateImage() into something the
// UI can render directly. This lives here (not in the component) because the
// model name and vendor live next to the code that actually picks them --
// Landing.js just renders whatever comes back.
//
// IMPORTANT: call this with the provider that was ACTUALLY used (the one
// generateImage() resolved with), never with what the env suggests. When the
// OpenAI key has no credits, or the circuit breaker is open, the configured
// provider and the real one differ, and telling the user otherwise is a lie.
export function describeProvider(provider) {
  if (provider === "openai") {
    return {
      label: "Generated with " + openaiModel(),
      vendor: "OpenAI",
      color: "purple",
    };
  }
  return {
    label: "Generated with FLUX · free tier",
    vendor: "Pollinations.ai",
    color: "blue",
  };
}

// Debug helpers ---------------------------------------------------------------
// "Cheap string, never throws" -- safe to render in JSX.
//
// NOTE (2026-09-03): activeProviderName() is no longer used by the UI. It
// reports what the env SUGGESTS will happen, evaluated BEFORE any request is
// made, so it cannot know that a fallback already occurred -- which made the
// old footer print "OpenAI ..." even when FLUX had served the image.
// For anything user-facing, call describeProvider(provider) with the provider
// generateImage() actually resolved with.
export function activeProviderName() {
  const forced = forceProvider();
  if (forced === "pollinations") return "Pollinations.ai (forced)";
  if (forced === "openai") return "OpenAI " + openaiModel() + " (forced)";
  if (process.env.REACT_APP_OPENAI_KEY) {
    return "OpenAI " + openaiModel() + " (Pollinations fallback on failure)";
  }
  return "Pollinations.ai (free, no OpenAI key)";
}

export function lastUsedProviderName() {
  return lastUsedProvider
    ? lastUsedProvider === "openai"
      ? "OpenAI " + openaiModel()
      : "Pollinations.ai"
    : null;
}

export function breakerStatus() {
  if (breaker.permanent) {
    return "OPEN (permanent: " + breaker.reason + ")";
  }
  if (Date.now() < breaker.openUntil) {
    const remaining = Math.round((breaker.openUntil - Date.now()) / 1000);
    return `OPEN for ${remaining}s more (${breaker.reason})`;
  }
  return "closed";
}

// Test-only hook (not part of the public surface). Lets the test harness reset
// the breaker between scenarios. The variable is not exported by name.
export function _resetBreakerForTests() {
  closeBreaker();
  lastUsedProvider = null;
}
