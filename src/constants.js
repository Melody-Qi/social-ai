export const TOKEN_KEY = "token";
export const BASE_URL = "https://deft-strata-505615-h3.uw.r.appspot.com";

// Set REACT_APP_AUTH_MODE=mock in .env.development.local to use the fixed
// development token "123". Any other value uses real server-side validation.
// Mock authentication is additionally blocked from production builds.
export const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "real";
export const MOCK_TOKEN = "123";
export const SEARCH_KEY = {
  all: 0,
  keyword: 1,
  user: 2,
  // Semantic search compares meaning on the backend. The embedding model and
  // API key remain server-side, so users do not need to choose a model.
  semantic: 3,
};
