import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Swords,
} from "lucide-react";
import { api, ErrorMessage, useAuth } from "../shared.jsx";

function safeDestination(value) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api(
        `/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body:
            mode === "login" ? { email, password } : { name, email, password },
        },
      );
      setUser(data.user);
      navigate(safeDestination(location.state?.from), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-shell auth-page">
      <div className="container">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} /> BACK TO THE ARENA
        </Link>
        <div className="auth-layout">
          <div className="auth-art">
            <div className="auth-art-inner">
              <span className="art-symbol">
                <Swords size={27} />
              </span>
              <div>
                <span className="section-kicker">
                  <span>// YOUR JOURNEY STARTS HERE</span>
                </span>
                <h1>
                  EVERY
                  <br />
                  LEGEND
                  <br />
                  <em>
                    STARTS
                    <br />
                    SOMEWHERE.
                  </em>
                </h1>
                <p>
                  Join the community. Find your arena. Make your next move
                  count.
                </p>
              </div>
              <span className="auth-art-bottom">
                BLUECLASH <ArrowRight size={16} /> BUILT FOR PLAYERS
              </span>
            </div>
          </div>
          <div className="auth-panel">
            <div className="section-kicker">
              <span>// PLAYER ACCOUNT</span>
            </div>
            <h2>
              {mode === "login" ? (
                <>
                  WELCOME <span>BACK.</span>
                </>
              ) : (
                <>
                  JOIN THE <span>CLASH.</span>
                </>
              )}
            </h2>
            <p>
              {location.state?.message ||
                (mode === "login"
                  ? "Your next great game is waiting."
                  : "Create your account and get ready to play.")}
            </p>
            <div className="auth-tabs">
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                SIGN IN
              </button>
              <button
                className={mode === "register" ? "active" : ""}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                CREATE ACCOUNT
              </button>
            </div>
            <form onSubmit={submit} className="form-stack">
              {mode === "register" && (
                <label>
                  YOUR NAME
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
              )}
              <label>
                EMAIL ADDRESS
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label>
                PASSWORD
                <div className="password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "register"
                        ? "At least 10 characters"
                        : "Enter your password"
                    }
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    minLength={mode === "register" ? 10 : undefined}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <ErrorMessage message={error} />
              <button
                className="button button-primary full-width"
                disabled={busy}
              >
                {busy
                  ? "PLEASE WAIT..."
                  : mode === "login"
                    ? "SIGN IN TO BLUECLASH"
                    : "CREATE MY ACCOUNT"}{" "}
                <ArrowUpRight size={17} />
              </button>
            </form>
            <div className="auth-switch">
              {mode === "login" ? (
                <>
                  New around here?{" "}
                  <button
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
            <div className="auth-security">
              <ShieldCheck size={16} /> Your details stay yours. Play with
              confidence.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
