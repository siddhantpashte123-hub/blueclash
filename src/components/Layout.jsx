import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Gamepad2,
  LogOut,
  Menu,
  ShieldCheck,
  Ticket,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../shared.jsx";

export function Brand({ footer = false }) {
  return (
    <Link
      className={`brand ${footer ? "brand-footer" : ""}`}
      to="/"
      aria-label="BlueClash home"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <path
            d="M8 6h14.5C29 6 33 9.4 33 14.6c0 3.3-1.7 5.7-4.5 7 3.6 1.2 5.3 3.8 5.3 7.1C33.8 34 29.5 37 22.5 37H8V6Zm8.1 6.6v6h5.4c2.2 0 3.4-1 3.4-3s-1.2-3-3.4-3h-5.4Zm0 12.3v5.5h5.7c2.5 0 3.8-.9 3.8-2.8s-1.3-2.7-3.8-2.7h-5.7Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="brand-word">
        BLUE<span>CLASH</span>
        <small>THE GAMING ARENA</small>
      </span>
    </Link>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const signOut = async () => {
    try {
      await logout();
      setUserOpen(false);
      setMenuOpen(false);
      navigate("/");
    } catch {
      /* keep the current session if logout failed */
    }
  };
  return (
    <>
      <div className="topline">
        <span className="topline-dot" /> THE ARENA IS OPEN{" "}
        <span className="topline-separator">/</span>{" "}
        <span>YOUR NEXT CHAPTER STARTS HERE</span>
        <Zap size={11} fill="currentColor" />
      </div>
      <header className="site-header">
        <div className="nav-wrap container">
          <Brand />
          <nav
            className={`main-nav ${menuOpen ? "nav-open" : ""}`}
            aria-label="Main navigation"
          >
            <a href="/#tournaments" onClick={() => setMenuOpen(false)}>
              TOURNAMENTS
            </a>
            <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>
              HOW IT WORKS
            </a>
            <a href="/#about" onClick={() => setMenuOpen(false)}>
              THE BLUECLASH WAY
            </a>
            {user && (
              <Link to="/my-entries" onClick={() => setMenuOpen(false)}>
                MY ENTRIES
              </Link>
            )}
            {user?.isAdmin && (
              <Link to="/admin" onClick={() => setMenuOpen(false)}>
                ADMIN PANEL
              </Link>
            )}
            <div className="mobile-nav-action">
              {user ? (
                <button className="link-button" onClick={signOut}>
                  SIGN OUT
                </button>
              ) : (
                <Link to="/auth" onClick={() => setMenuOpen(false)}>
                  SIGN IN
                </Link>
              )}
            </div>
          </nav>
          <div className="nav-actions">
            {user ? (
              <div className="user-menu-wrap">
                <button
                  className="nav-user"
                  onClick={() => setUserOpen(!userOpen)}
                  aria-expanded={userOpen}
                >
                  <span className="user-avatar">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span>{user.name.split(" ")[0]}</span>
                  <ChevronDown size={14} />
                </button>
                {userOpen && (
                  <div className="user-dropdown">
                    <div className="dropdown-name">
                      SIGNED IN AS <strong>{user.email}</strong>
                    </div>
                    <Link to="/my-entries" onClick={() => setUserOpen(false)}>
                      <Ticket size={16} /> My entries
                    </Link>
                    {user.isAdmin && (
                      <Link to="/admin" onClick={() => setUserOpen(false)}>
                        <ShieldCheck size={16} /> Admin panel
                      </Link>
                    )}
                    <button onClick={signOut}>
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/auth" className="nav-login">
                <UserRound size={15} /> SIGN IN
              </Link>
            )}
            <a className="button button-primary nav-cta" href="/#tournaments">
              FIND A TOURNAMENT <ArrowUpRight size={15} />
            </a>
          </div>
          <button
            className="mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  const { supportEmail } = useAuth();
  return (
    <footer className="site-footer" id="about">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand">
            <Brand footer />
            <p>
              For the players who show up, level up, and never back down. Your
              arena awaits.
            </p>
            <span className="footer-tag">
              <span /> MADE FOR THE GAME
            </span>
          </div>
          <div className="footer-column">
            <h4>EXPLORE</h4>
            <a href="/#tournaments">
              Tournaments <ArrowUpRight size={13} />
            </a>
            <a href="/#how-it-works">
              How it works <ArrowUpRight size={13} />
            </a>
            <Link to="/my-entries">
              My entries <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="footer-column">
            <h4>THE PLATFORM</h4>
            <Link to="/auth">Player login</Link>
            <Link to="/admin">Organizer login</Link>
            {supportEmail && (
              <a href={`mailto:${supportEmail}`}>Contact support</a>
            )}
          </div>
          <div className="footer-manifesto">
            <Gamepad2 size={24} />
            <strong>
              GOOD GAMES.
              <br />
              GREAT RIVALRIES.
            </strong>
            <span>LET'S PLAY.</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} BLUECLASH. BUILT FOR THE CLASH.
          </span>
          <span>
            COMMUNITY FIRST <ArrowRight size={12} /> ALWAYS
          </span>
        </div>
        <p className="footer-disclaimer">
          BlueClash is an independent community platform and is not affiliated
          with any game publisher.
        </p>
      </div>
    </footer>
  );
}
