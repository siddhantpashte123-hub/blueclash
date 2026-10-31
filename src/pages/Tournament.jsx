import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  Gamepad2,
  ShieldCheck,
  Swords,
  Ticket,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  api,
  ErrorMessage,
  formatDate,
  Loader,
  money,
  termsKey,
  useAuth,
} from "../shared.jsx";

export default function Tournament() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [t, setTournament] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [termsError, setTermsError] = useState("");
  useEffect(() => {
    setError("");
    api(`/tournaments/${id}`)
      .then((data) => {
        setTournament(data.tournament);
        setMyEntry(data.myEntry);
        setAccepted(
          sessionStorage.getItem(termsKey(id)) === data.tournament.termsVersion,
        );
      })
      .catch((err) => setError(err.message));
  }, [id, user?.id]);
  const updateAccepted = (checked) => {
    setAccepted(checked);
    setTermsError("");
    if (checked) sessionStorage.setItem(termsKey(id), t.termsVersion);
    else sessionStorage.removeItem(termsKey(id));
  };
  const enter = () => {
    if (myEntry) {
      navigate(`/entries/${myEntry.id}`);
      return;
    }
    if (!accepted) {
      setTermsError("Please read and accept the terms before continuing.");
      document
        .getElementById("event-terms")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!user)
      navigate("/auth", {
        state: {
          from: `/tournaments/${id}`,
          message: "Sign in or create an account to continue your entry.",
        },
      });
    else navigate(`/tournaments/${id}/join`);
  };
  if (error)
    return (
      <div className="container narrow-page">
        <ErrorMessage message={error} />
        <Link className="back-link" to="/">
          ← Back to tournaments
        </Link>
      </div>
    );
  if (!t)
    return (
      <div className="container narrow-page">
        <Loader label="Loading tournament..." />
      </div>
    );
  const rules = t.rules
    .split("\n")
    .map((rule) => rule.trim())
    .filter(Boolean);
  return (
    <div className="page-shell tournament-page">
      <div className="container">
        <Link to="/#tournaments" className="back-link">
          <ArrowLeft size={15} /> ALL TOURNAMENTS
        </Link>
        <div
          className="detail-hero"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(5,9,18,.98) 4%, rgba(5,9,18,.77) 53%, rgba(5,9,18,.15)), url(${t.image})`,
          }}
        >
          <div className="detail-hero-content">
            <div className="detail-tags">
              <span className="game-tag">{t.game.toUpperCase()}</span>
              {t.isDemo ? (
                <span className="demo-tag">SAMPLE EVENT</span>
              ) : (
                <span className={`open-tag ${!t.canJoin ? "closed" : ""}`}>
                  <span />
                  {t.canJoin ? "REGISTRATION OPEN" : "REGISTRATION CLOSED"}
                </span>
              )}
            </div>
            <div className="section-kicker">
              <span>// TOURNAMENT DETAILS</span> / {t.mode.toUpperCase()}
            </div>
            <h1>{t.title}</h1>
            <p>{t.tagline}</p>
            <div className="detail-meta">
              <span>
                <CalendarDays size={16} /> {formatDate(t.startsAt, true)}
              </span>
              <span>
                <UsersRound size={16} /> {t.mode}
              </span>
              <span>
                <Gamepad2 size={16} /> {t.game}
              </span>
            </div>
          </div>
          <div className="detail-hero-number">
            BC / {String(t.id).padStart(2, "0")}
          </div>
        </div>
        {t.isDemo && (
          <div className="notice notice-blue">
            <CircleHelp size={19} />
            <div>
              <strong>This is a sample tournament.</strong> It shows how events
              look, but isn't open for entry. An organizer can create real
              tournaments in the admin panel.
            </div>
          </div>
        )}
        <div className="detail-layout">
          <div className="detail-main">
            <div className="content-block">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">
                    <span>// THE LOWDOWN</span>
                  </span>
                  <h2>
                    ABOUT THE <span>TOURNAMENT.</span>
                  </h2>
                </div>
                <Swords size={25} />
              </div>
              <p className="body-copy preserve-lines">{t.description}</p>
              <div className="detail-info-grid">
                <div>
                  <CalendarDays size={18} />
                  <span>STARTS</span>
                  <strong>{formatDate(t.startsAt, true)}</strong>
                  <small>Shown in your local time</small>
                </div>
                <div>
                  <UsersRound size={18} />
                  <span>FORMAT</span>
                  <strong>{t.mode}</strong>
                  <small>{t.totalSlots} total spots</small>
                </div>
                <div>
                  <Trophy size={18} />
                  <span>PRIZE POOL</span>
                  <strong>{money(t.prizePool)}</strong>
                  <small>Set by organizer</small>
                </div>
              </div>
            </div>
            <div className="content-block">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">
                    <span>// PLAY FAIR</span>
                  </span>
                  <h2>
                    THE <span>RULEBOOK.</span>
                  </h2>
                </div>
                <ShieldCheck size={25} />
              </div>
              <p className="body-copy">
                Great games start with good sportsmanship. Read the rules before
                you enter.
              </p>
              <div className="rules-list">
                {rules.map((rule, index) => (
                  <div key={`${rule}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{rule.replace(/^[-•]\s*/, "")}</p>
                    <Check size={16} />
                  </div>
                ))}
              </div>
            </div>
            <div className="content-block" id="event-terms">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">
                    <span>// THE IMPORTANT STUFF</span>
                  </span>
                  <h2>
                    TERMS & <span>CONDITIONS.</span>
                  </h2>
                </div>
              </div>
              <div className="terms-copy preserve-lines">{t.terms}</div>
              <label className={`check-card ${accepted ? "checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => updateAccepted(event.target.checked)}
                />
                <span className="custom-check">
                  <Check size={14} />
                </span>
                <span>
                  I have read and agree to the tournament rules and terms &amp;
                  conditions.
                  <small>
                    You'll be asked to sign in only when you're ready to enter.
                  </small>
                </span>
              </label>
              <ErrorMessage message={termsError} />
            </div>
          </div>
          <aside className="entry-sidebar">
            <div className="entry-card">
              <div className="entry-card-top">
                <div>
                  <span className="section-kicker">
                    <span>// YOUR NEXT MOVE</span>
                  </span>
                  <h2>
                    READY TO <span>PLAY?</span>
                  </h2>
                </div>
                <span className="entry-icon">
                  <Trophy size={22} />
                </span>
              </div>
              <p>Everything you need to know before you step into the arena.</p>
              <div className="price-highlight">
                <div>
                  <span>PRIZE POOL</span>
                  <strong>{money(t.prizePool)}</strong>
                </div>
                <Trophy size={27} />
              </div>
              <div className="entry-facts">
                <div>
                  <span>
                    <Ticket size={15} /> Entry fee
                  </span>
                  <strong>{money(t.entryFee)}</strong>
                </div>
                <div>
                  <span>
                    <UsersRound size={15} /> Spots available
                  </span>
                  <strong>
                    {t.isDemo
                      ? "Sample event"
                      : `${t.slotsLeft} / ${t.totalSlots}`}
                  </strong>
                </div>
                <div>
                  <span>
                    <Clock3 size={15} /> Match day
                  </span>
                  <strong>{formatDate(t.startsAt)}</strong>
                </div>
              </div>
              {t.closedReason && !myEntry && (
                <div className="sidebar-notice">{t.closedReason}</div>
              )}
              <button
                className="button button-primary full-width"
                onClick={enter}
                disabled={!t.canJoin && !myEntry}
              >
                {myEntry ? "VIEW MY ENTRY" : "ENTER TOURNAMENT"}{" "}
                <ArrowUpRight size={17} />
              </button>
              <div className="secure-note">
                <ShieldCheck size={14} />{" "}
                {t.entryFee === 0
                  ? "Free entry"
                  : "Payment proof is reviewed by the organizer"}
              </div>
            </div>
            <div className="sidebar-mini">
              <span>GOT WHAT IT TAKES?</span>
              <strong>
                THE ARENA IS
                <br />
                WAITING FOR YOU <ArrowRight size={16} />
              </strong>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
