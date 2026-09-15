import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./Login";
import Register from "./Register";
import Collection from "./Collection";
import Landing from "./Landing";

function Main(props) {
  const { isLoggedIn, handleLoggedIn } = props;

  // Authentication gating: redirect users based on login state.
  const showLogin = () => {
    return isLoggedIn ? (
      <Navigate to="/create" />
    ) : (
      <Login handleLoggedIn={handleLoggedIn} />
    );
  };

  const showRegister = () => {
    return isLoggedIn ? <Navigate to="/create" /> : <Register />;
  };

  const showLanding = () => {
    return isLoggedIn ? <Landing /> : <Navigate to="/login" />;
  };

  const showCollection = () => {
    return isLoggedIn ? <Collection /> : <Navigate to="/login" />;
  };

  return (
    <div className="main">
      <Routes>
        {/* `exact` (on the "/" route): in React Router v5 this forced the path
            to match ONLY "/", not "/..." prefixes. In v6 (which this project
            uses) routes rank and match exactly by default, so `exact` is
            deprecated/ignored — kept here only as a harmless leftover.
            `element={...}`: the v6 way to declare what to render on match. It
            takes a REACT ELEMENT (here we CALL showLogin() to produce one),
            replacing v5's `component`/`render` props. */}
        <Route path="/" exact element={showLogin()} />
        <Route path="/login" element={showLogin()} />
        <Route path="/register" element={showRegister()} />
        <Route path="/create" element={showLanding()} />
        <Route path="/collection" element={showCollection()} />
      </Routes>
    </div>
  );
}

export default Main;
