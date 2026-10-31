import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  LockKeyhole,
  ShieldCheck,
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
import EntrySteps from "../components/EntrySteps.jsx";

export default function Join() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [t, setTournament] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    gameId: "",
    uid: "",
    gameName: "",
  });
  useEffect(() => {
    api(`/tournaments/${id}`)
      .then((data) => {
        setTournament(data.tournament);
        setMyEntry(data.myEntry);
      })
      .catch((err) => setError(err.message));
  }, [id, user?.id]);
  const update = (key) => (event) =>
    setForm({ ...form, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api(`/tournaments/${id}/entries`, {
        method: "POST",
        body: { ...form, acceptTerms: true, termsVersion: t.termsVersion },
      });
      navigate(`/entries/${data.entry.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (authLoading)
    return (
      <div className="container narrow-page">
        <Loader />
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/auth"
        replace
        state={{
          from: `/tournaments/${id}`,
          message: "Sign in or create an account to continue your entry.",
        }}
      />
    );
  if (error && !t)
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
        <Loader label="Getting your entry ready..." />
      </div>
    );
  if (sessionStorage.getItem(termsKey(id)) !== t.termsVersion)
    return (
      <div className="container narrow-page">
        <div className="empty-panel">
          <ShieldCheck size={30} />
          <h2>ONE QUICK STEP FIRST.</h2>
          <p>Please review and accept the tournament terms before entering.</p>
          <Link className="button button-primary" to={`/tournaments/${id}`}>
            REVIEW TOURNAMENT <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    );
  if (myEntry) return <Navigate to={`/entries/${myEntry.id}`} replace />;
  return (
    <div className="page-shell">
      <div className="container">
        <Link to={`/tournaments/${id}`} className="back-link">
          <ArrowLeft size={15} /> BACK TO TOURNAMENT
        </Link>
        <EntrySteps current={2} />
        <div className="form-page-heading">
          <div className="section-kicker">
            <span>// ALMOST IN THE GAME</span>
          </div>
          <h1>
            LET'S GET YOU <span>REGISTERED.</span>
          </h1>
          <p>Tell us a little about the player behind the screen.</p>
        </div>
        <div className="form-layout">
          <div className="form-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <span>01 / PLAYER INFORMATION</span>
                </span>
                <h2>
                  YOUR <span>DETAILS.</span>
                </h2>
              </div>
              <UsersRound size={23} />
            </div>
            <p className="muted-copy">
              Make sure these match your in-game profile so the organizer can
              find you.
            </p>
            <form onSubmit={submit} className="form-stack">
              <div className="form-row">
                <label>
                  FIRST NAME
                  <input
                    value={form.firstName}
                    onChange={update("firstName")}
                    placeholder="First name"
                    maxLength={60}
                    required
                  />
                </label>
                <label>
                  LAST NAME
                  <input
                    value={form.lastName}
                    onChange={update("lastName")}
                    placeholder="Last name"
                    maxLength={60}
                    required
                  />
                </label>
              </div>
              <label>
                IN-GAME ID
                <input
                  value={form.gameId}
                  onChange={update("gameId")}
                  placeholder="Your player or game ID"
                  maxLength={100}
                  required
                />
                <small>The ID you use to play {t.game}.</small>
              </label>
              <label>
                UID <span className="optional">OPTIONAL</span>
                <input
                  value={form.uid}
                  onChange={update("uid")}
                  placeholder="Your UID, if applicable"
                  maxLength={100}
                />
              </label>
              <label>
                IN-GAME NAME
                <input
                  value={form.gameName}
                  onChange={update("gameName")}
                  placeholder="Your gamer tag"
                  maxLength={100}
                  required
                />
              </label>
              <div className="inline-note">
                <ShieldCheck size={17} />
                <span>
                  You accepted the tournament rules and terms. Your details are
                  shared with the organizer for this entry.
                </span>
              </div>
              <ErrorMessage message={error} />
              {!t.canJoin && (
                <div className="sidebar-notice">{t.closedReason}</div>
              )}
              <button
                className="button button-primary full-width"
                disabled={busy || !t.canJoin}
              >
                {busy
                  ? "SAVING YOUR DETAILS..."
                  : t.entryFee === 0
                    ? "CONFIRM FREE ENTRY"
                    : "SAVE & CHECKOUT"}{" "}
                <ArrowUpRight size={17} />
              </button>
              <div className="secure-note">
                <LockKeyhole size={14} />{" "}
                {t.entryFee === 0
                  ? "No payment required"
                  : "Your spot is held for 30 minutes after checkout"}
              </div>
            </form>
          </div>
          <aside>
            <div className="summary-card">
              <div
                className="summary-image"
                style={{
                  backgroundImage: `linear-gradient(0deg, rgba(7,11,20,.97), transparent), url(${t.image})`,
                }}
              >
                <span className="game-tag">{t.game.toUpperCase()}</span>
              </div>
              <div className="summary-body">
                <span className="section-kicker">
                  <span>// ENTRY SUMMARY</span>
                </span>
                <h2>{t.title}</h2>
                <div className="summary-facts">
                  <span>
                    <CalendarDays size={15} /> {formatDate(t.startsAt, true)}
                  </span>
                  <span>
                    <UsersRound size={15} /> {t.mode}
                  </span>
                  <span>
                    <Trophy size={15} /> {money(t.prizePool)} prize pool
                  </span>
                </div>
                <div className="summary-total">
                  <span>
                    <Ticket size={16} /> ENTRY FEE
                  </span>
                  <strong>{money(t.entryFee)}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
