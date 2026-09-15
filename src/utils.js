import { AUTH_MODE, BASE_URL, MOCK_TOKEN } from "./constants";

// The browser must not decide that a user is authenticated merely because a
// value exists in localStorage. The server verifies the JWT signature and its
// expiration time before the UI restores the logged-in state.
export const validateStoredToken = async (token) => {
  if (!token) {
    return false;
  }

  // Mock authentication is intentionally limited to the local development
  // server. A production build always falls through to server validation,
  // even if REACT_APP_AUTH_MODE was configured incorrectly.
  const mockAuthEnabled =
    process.env.NODE_ENV === "development" && AUTH_MODE === "mock";
  if (mockAuthEnabled) {
    return token === MOCK_TOKEN;
  }

  try {
    const response = await fetch(`${BASE_URL}/auth/validate`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to validate the stored token", error);
    return false;
  }
};
