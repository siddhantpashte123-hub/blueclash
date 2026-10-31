import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./styles.css";
import { AuthProvider } from "./shared.jsx";
import { Footer, Header } from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Tournament from "./pages/Tournament.jsx";
import Auth from "./pages/Auth.jsx";
import Join from "./pages/Join.jsx";
import Checkout from "./pages/Checkout.jsx";
import MyEntries from "./pages/MyEntries.jsx";
import Admin from "./pages/Admin.jsx";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() =>
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ behavior: "smooth" }),
      );
    } else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tournaments/:id" element={<Tournament />} />
            <Route path="/tournaments/:id/join" element={<Join />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/entries/:id" element={<Checkout />} />
            <Route path="/my-entries" element={<MyEntries />} />
            <Route path="/admin" element={<Admin />} />
            <Route
              path="*"
              element={
                <div className="empty-page">
                  <span className="eyebrow">404 / GAME OVER</span>
                  <h1>PAGE NOT FOUND.</h1>
                  <p>
                    Looks like you took a wrong turn. Let's get you back in the
                    game.
                  </p>
                  <a className="button button-primary" href="/">
                    BACK TO HOME <span>↗</span>
                  </a>
                </div>
              }
            />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
