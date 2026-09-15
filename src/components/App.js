import React, { useEffect, useState } from "react";
import ResponsiveAppBar from "./ResponsiveAppBar";
import Main from "./Main";

import { TOKEN_KEY } from "../constants";
import { validateStoredToken } from "../utils";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let isActive = true;

    const restoreLogin = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (isActive) setIsCheckingAuth(false);
        return;
      }

      const isValid = await validateStoredToken(token);
      if (!isActive) return;

      if (isValid) {
        setIsLoggedIn(true);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
      setIsCheckingAuth(false);
    };

    restoreLogin();
    return () => {
      isActive = false;
    };
  }, []);

  const loggedIn = (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      setIsLoggedIn(true);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setIsLoggedIn(false);
  };

  if (isCheckingAuth) {
    return <p>Checking authentication...</p>;
  }

  return (
    <div className="App">
      <ResponsiveAppBar isLoggedIn={isLoggedIn} handleLogout={logout} />
      <Main isLoggedIn={isLoggedIn} handleLoggedIn={loggedIn} />
    </div>
  );
}

export default App;
