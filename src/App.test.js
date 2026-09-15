import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./components/App";

beforeEach(() => {
  localStorage.clear();
});

test("shows the login form when the user is logged out", () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>
  );

  // Assert on what <Login> actually renders -- its two inputs and the primary
  // button -- instead of a page heading. The old assertion looked for the
  // literal text "login", which was the placeholder this route used before it
  // became a real Ant Design Form, so it had been failing on a stale string.
  expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  expect(screen.getByText("Log in")).toBeInTheDocument();
});
