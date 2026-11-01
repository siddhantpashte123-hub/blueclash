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
  const { branding } = useAuth();
  return (
    <Link
      className={`brand ${footer ? "brand-footer" : ""}`}
      to="/"
      aria-label={`${branding.name} home`}
      title={branding.name}
    >
      <span className="brand-mark" aria-hidden="true">
        <img src={branding.logoUrl} width="48" height="48" alt="" />
      </span>
      <span className="brand-word">
        <span className="brand-name">
          {branding.name === "BlueClash" ? (
            <>
              BLUE<span>CLASH</span>
            </>
          ) : (
            branding.name
          )}
        </span>
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
              OUR WAY
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
  const { supportEmail, branding } = useAuth();
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
            © {new Date().getFullYear()} {branding.name}. BUILT FOR THE CLASH.
          </span>
          <span>
            COMMUNITY FIRST <ArrowRight size={12} /> ALWAYS
          </span>
        </div>
        <p className="footer-disclaimer">
          {branding.name} is an independent community platform and is not
          affiliated with any game publisher.
        </p>
      </div>
    </footer>
  );
}
