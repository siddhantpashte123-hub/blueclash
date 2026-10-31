import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Eye,
  LayoutDashboard,
  Plus,
  QrCode,
  Save,
  Settings,
  ShieldCheck,
  Swords,
  Trash2,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import {
  api,
  ErrorMessage,
  formatDate,
  Loader,
  money,
  StatusBadge,
  useAuth,
} from "../shared.jsx";
import SettingsPanel from "../components/SettingsPanel.jsx";
import VerifyTicket from "../components/VerifyTicket.jsx";

const defaultRules =
  "Play fair and respect every participant.\nUse the in-game details provided during registration.\nBe ready before the scheduled start time.\nThe organizer’s decision is final.";
const defaultTerms =
  "By entering, you agree to follow the tournament rules, provide accurate player details, and accept the organizer’s decisions. Entry fees are subject to the organizer’s refund policy. Any cheating, harassment, or unfair play can result in disqualification.";
const covers = [
  {
    id: "minecraft",
    label: "BLOCK WORLD",
    image: "/images/minecraft-arena.webp",
  },
  { id: "battle", label: "BATTLE ROYALE", image: "/images/battle-royale.webp" },
  { id: "neon", label: "NEON ARENA", image: "/images/neon-arena.webp" },
];
function localDate(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function newForm(t) {
  if (t) return { ...t, startsAt: localDate(t.startsAt), makeReal: false };
  return {
    title: "",
    game: "",
    category: "minecraft",
    tagline: "",
    description: "",
    startsAt: localDate(Date.now() + 14 * 86400000),
    mode: "Solo",
    totalSlots: 64,
    entryFee: 0,
    prizePool: 0,
    cover: "minecraft",
    rules: defaultRules,
    terms: defaultTerms,
    status: "draft",
    makeReal: false,
  };
}

function TournamentEditor({ tournament, onClose, onSaved }) {
  const [form, setForm] = useState(() => newForm(tournament));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) =>
    setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const startsAt = new Date(form.startsAt);
      if (Number.isNaN(startsAt.getTime()))
        throw new Error("Choose a valid start date and time.");
      await api(
        tournament
          ? `/admin/tournaments/${tournament.id}`
          : "/admin/tournaments",
        {
          method: tournament ? "PUT" : "POST",
          body: { ...form, startsAt: startsAt.toISOString() },
        },
      );
      onSaved(tournament ? "Tournament updated." : "Tournament created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-editor">
      <button className="back-link back-button" onClick={onClose}>
        <ArrowLeft size={15} /> ALL TOURNAMENTS
      </button>
      <div className="admin-section-header">
        <div>
          <span className="section-kicker">
            <span>// TOURNAMENT EDITOR</span>
          </span>
          <h2>{tournament ? "EDIT TOURNAMENT." : "CREATE TOURNAMENT."}</h2>
          <p>Build an event players will be excited to join.</p>
        </div>
      </div>
      {tournament?.isDemo && (
        <div className="notice notice-blue">
          <AlertCircle size={19} />
          <div>
            <strong>You are editing a sample event.</strong>
            <p>
              Check every detail and explicitly convert it to a real event below
              before players can register.
            </p>
          </div>
        </div>
      )}
      <form className="form-panel form-stack admin-form" onSubmit={submit}>
        <div className="admin-form-title">
          <span>01</span>
          <div>
            <h3>THE BASICS</h3>
            <p>Give your tournament a name and a game.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            TOURNAMENT TITLE
            <input
              value={form.title}
              onChange={update("title")}
              minLength={3}
              maxLength={100}
              placeholder="e.g. The Weekend Clash"
              required
            />
          </label>
          <label>
            GAME NAME
            <input
              value={form.game}
              onChange={update("game")}
              minLength={2}
              maxLength={60}
              placeholder="e.g. Minecraft"
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            GAME CATEGORY
            <select value={form.category} onChange={update("category")}>
              <option value="minecraft">Minecraft</option>
              <option value="freefire">Free Fire</option>
              <option value="other">Other games</option>
            </select>
          </label>
          <label>
            TAGLINE
            <input
              value={form.tagline}
              onChange={update("tagline")}
              maxLength={90}
              placeholder="A short line for your event"
              required
            />
          </label>
        </div>
        <label>
          DESCRIPTION
          <textarea
            value={form.description}
            onChange={update("description")}
            minLength={10}
            maxLength={3000}
            rows={4}
            placeholder="Tell players what makes your tournament special."
            required
          />
        </label>
        <div className="admin-form-title">
          <span>02</span>
          <div>
            <h3>MATCH DETAILS</h3>
            <p>Set the schedule, spots, and prize.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            START DATE & TIME <span className="optional">YOUR LOCAL TIME</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={update("startsAt")}
              required
            />
          </label>
          <label>
            FORMAT
            <input
              value={form.mode}
              onChange={update("mode")}
              maxLength={30}
              placeholder="Solo, Duo, Squad..."
              required
            />
          </label>
        </div>
        <div className="form-row three">
          <label>
            TOTAL SPOTS
            <input
              type="number"
              min="1"
              max="100000"
              value={form.totalSlots}
              onChange={update("totalSlots")}
              required
            />
          </label>
          <label>
            ENTRY FEE (₹)
            <input
              type="number"
              min="0"
              max="9999999"
              step="0.01"
              value={form.entryFee}
              onChange={update("entryFee")}
              required
            />
            <small>Set 0 for a free event.</small>
          </label>
          <label>
            PRIZE POOL (₹)
            <input
              type="number"
              min="0"
              max="9999999"
              step="0.01"
              value={form.prizePool}
              onChange={update("prizePool")}
              required
            />
          </label>
        </div>
        <div className="admin-form-title">
          <span>03</span>
          <div>
            <h3>THE LOOK</h3>
            <p>Choose a cover for your event.</p>
          </div>
        </div>
        <div className="cover-options">
          {covers.map((cover) => (
            <label
              key={cover.id}
              className={`cover-option ${form.cover === cover.id ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="cover"
                value={cover.id}
                checked={form.cover === cover.id}
                onChange={update("cover")}
              />
              <img src={cover.image} alt="" />
              <span>
                {cover.label} {form.cover === cover.id && <Check size={15} />}
              </span>
            </label>
          ))}
        </div>
        <div className="admin-form-title">
          <span>04</span>
          <div>
            <h3>RULES & PUBLISHING</h3>
            <p>Make sure everyone knows the game plan.</p>
          </div>
        </div>
        <label>
          TOURNAMENT RULES
          <textarea
            value={form.rules}
            onChange={update("rules")}
            minLength={10}
            maxLength={5000}
            rows={5}
            required
          />
          <small>One rule per line works best.</small>
        </label>
        <label>
          TERMS & CONDITIONS
          <textarea
            value={form.terms}
            onChange={update("terms")}
            minLength={10}
            maxLength={5000}
            rows={5}
            required
          />
          <small>
            Players must accept these before entering. Consult a professional
            for terms appropriate to your event.
          </small>
        </label>
        <label>
          VISIBILITY
          <select value={form.status} onChange={update("status")}>
            <option value="draft">Draft — hidden from players</option>
            <option value="published">Published — visible to players</option>
            <option value="completed">Completed — registration closed</option>
          </select>
        </label>
        {tournament?.isDemo && (
          <label className={`check-card ${form.makeReal ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={form.makeReal}
              onChange={(e) => setForm({ ...form, makeReal: e.target.checked })}
            />
            <span className="custom-check">
              <Check size={14} />
            </span>
            <span>
              I have reviewed this sample and want to convert it into a real
              tournament.
              <small>
                Once published, players can register using these details.
              </small>
            </span>
          </label>
        )}
        <ErrorMessage message={error} />
        <div className="admin-form-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
          >
            CANCEL
          </button>
          <button className="button button-primary" disabled={busy}>
            <Save size={16} />{" "}
            {busy
              ? "SAVING..."
              : tournament
                ? "SAVE CHANGES"
                : "CREATE TOURNAMENT"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReviewModal({ entry, onClose, onReviewed }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/entries/${entry.id}/review`, {
        method: "POST",
        body: { action, note },
      });
      onReviewed(action === "approve" ? "Entry approved." : "Entry rejected.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="section-kicker">
              <span>// ENTRY #{String(entry.id).padStart(4, "0")}</span>
            </span>
            <h2 id="review-heading">
              PLAYER <span>ENTRY.</span>
            </h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="review-content">
          <div>
            <div className="review-details">
              <div>
                <span>TOURNAMENT</span>
                <strong>{entry.tournamentTitle}</strong>
              </div>
              <div>
                <span>PLAYER</span>
                <strong>
                  {entry.firstName} {entry.lastName}
                </strong>
              </div>
              <div>
                <span>ACCOUNT EMAIL</span>
                <strong>{entry.email}</strong>
              </div>
              <div>
                <span>IN-GAME ID</span>
                <strong>{entry.gameId}</strong>
              </div>
              <div>
                <span>UID</span>
                <strong>{entry.uid || "Not provided"}</strong>
              </div>
              <div>
                <span>IN-GAME NAME</span>
                <strong>{entry.gameName}</strong>
              </div>
              <div>
                <span>ENTRY FEE</span>
                <strong>{money(entry.amount)}</strong>
              </div>
              <div>
                <span>TRANSACTION ID</span>
                <strong>{entry.paymentReference || "Not provided"}</strong>
              </div>
              <div>
                <span>STATUS</span>
                <StatusBadge status={entry.status} />
              </div>
            </div>
            {entry.reviewNote && (
              <div className="notice notice-blue">
                <strong>Previous note: {entry.reviewNote}</strong>
              </div>
            )}
          </div>
          <div>
            <span className="summary-label">PAYMENT SCREENSHOT</span>
            {entry.hasProof ? (
              <a
                className="proof-preview"
                href={`/api/admin/entries/${entry.id}/proof`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`/api/admin/entries/${entry.id}/proof`}
                  alt={`Payment screenshot for ${entry.firstName} ${entry.lastName}`}
                />
                <span>
                  OPEN FULL SIZE <ExternalLink size={14} />
                </span>
              </a>
            ) : (
              <div className="proof-placeholder">
                No screenshot submitted yet.
              </div>
            )}
          </div>
        </div>
        {entry.status === "pending" && (
          <>
            <div className="notice notice-warning">
              <AlertCircle size={18} />
              <div>
                <strong>Verify the actual payment first.</strong>
                <p>
                  A screenshot alone does not prove funds were received. Check
                  your UPI/banking app before approving.
                </p>
              </div>
            </div>
            <label className="review-note-label">
              NOTE TO PLAYER <span className="optional">OPTIONAL</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Explain the decision, especially if rejecting."
              />
            </label>
            <ErrorMessage message={error} />
            <div className="review-actions">
              <button
                className="button button-danger"
                onClick={() => review("reject")}
                disabled={busy}
              >
                REJECT PROOF
              </button>
              <button
                className="button button-primary"
                onClick={() => review("approve")}
                disabled={busy}
              >
                <Check size={16} /> APPROVE ENTRY
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { user, loading: authLoading, refresh } = useAuth();
  const location = useLocation();
  const scannedTicket =
    new URLSearchParams(location.search).get("ticket") || "";
  const [tab, setTab] = useState(scannedTicket ? "verify" : "overview");
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [entries, setEntries] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [filter, setFilter] = useState("pending");
  const load = useCallback(async () => {
    try {
      const [overview, tournaments, registrations, config] = await Promise.all([
        api("/admin/overview"),
        api("/admin/tournaments"),
        api("/admin/entries"),
        api("/admin/settings"),
      ]);
      setStats(overview.stats);
      setEvents(tournaments.tournaments);
      setEntries(registrations.entries);
      setPaymentSettings(config.settings);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user?.id, user?.isAdmin, load]);
  useEffect(() => {
    if (scannedTicket && user?.isAdmin) setTab("verify");
  }, [scannedTicket, user?.isAdmin]);
  const done = async (text) => {
    setEditing(null);
    setReviewing(null);
    setMessage(text);
    await load();
    refresh();
  };
  const removeEvent = async (event) => {
    if (
      !window.confirm(
        `Delete “${event.title}”? Tournaments with entries cannot be deleted.`,
      )
    )
      return;
    try {
      await api(`/admin/tournaments/${event.id}`, { method: "DELETE" });
      done("Tournament deleted.");
    } catch (err) {
      setError(err.message);
    }
  };
  const changeTab = (value) => {
    setTab(value);
    setEditing(null);
    setError("");
    setMessage("");
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
          from: `/admin${location.search}`,
          message: "Sign in with your administrator account.",
        }}
      />
    );
  if (!user.isAdmin)
    return (
      <div className="container narrow-page">
        <div className="empty-panel">
          <ShieldCheck size={32} />
          <h2>ADMIN ACCESS ONLY.</h2>
          <p>This area is only available to the tournament organizer.</p>
          <Link to="/" className="button button-primary">
            BACK TO THE ARENA <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    );
  const nav = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={17} /> },
    { id: "tournaments", label: "Tournaments", icon: <Trophy size={17} /> },
    {
      id: "entries",
      label: "Player entries",
      icon: <ClipboardList size={17} />,
    },
    { id: "verify", label: "Verify ticket", icon: <QrCode size={17} /> },
    { id: "settings", label: "Payment settings", icon: <Settings size={17} /> },
  ];
  const filteredEntries = entries.filter(
    (entry) => filter === "all" || entry.status === filter,
  );
  return (
    <div className="page-shell admin-page">
      <div className="container">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} /> BACK TO THE ARENA
        </Link>
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="admin-side-title">
              <span className="admin-shield">
                <ShieldCheck size={20} />
              </span>
              <div>
                BLUECLASH<strong>CONTROL ROOM</strong>
              </div>
            </div>
            <span className="admin-nav-label">WORKSPACE</span>
            {nav.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => changeTab(item.id)}
              >
                {item.icon}
                {item.label}
                {item.id === "entries" && stats?.pending > 0 && (
                  <span className="admin-count">{stats.pending}</span>
                )}
              </button>
            ))}
            <div className="admin-side-bottom">
              <span>LOGGED IN AS</span>
              <strong>{user.email}</strong>
            </div>
          </aside>
          <div className="admin-content">
            <div className="admin-topbar">
              <span>
                <span className="small-dot" /> ORGANIZER WORKSPACE
              </span>
              <Link to="/" target="_blank">
                VIEW WEBSITE <ArrowUpRight size={14} />
              </Link>
            </div>
            <ErrorMessage message={error} />
            {message && (
              <div className="notice notice-success">
                <Check size={18} />
                {message}
                <button
                  className="notice-close"
                  onClick={() => setMessage("")}
                  aria-label="Dismiss"
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {!stats && !error ? (
              <Loader label="Loading control room..." />
            ) : (
              <>
                {tab === "overview" && (
                  <>
                    <div className="admin-section-header">
                      <div>
                        <span className="section-kicker">
                          <span>// THE BIG PICTURE</span>
                        </span>
                        <h2>WELCOME, ORGANIZER.</h2>
                        <p>Here's what's happening in your arena.</p>
                      </div>
                      <button
                        className="button button-primary"
                        onClick={() => {
                          changeTab("tournaments");
                          setEditing("new");
                        }}
                      >
                        <Plus size={16} /> NEW TOURNAMENT
                      </button>
                    </div>
                    <div className="stats-grid">
                      <div>
                        <span className="stats-icon">
                          <Trophy size={19} />
                        </span>
                        <span>LIVE TOURNAMENTS</span>
                        <strong>{stats?.published ?? 0}</strong>
                        <small>Published, excluding samples</small>
                      </div>
                      <div>
                        <span className="stats-icon">
                          <ClipboardList size={19} />
                        </span>
                        <span>PENDING REVIEW</span>
                        <strong>{stats?.pending ?? 0}</strong>
                        <small>Payment proofs to check</small>
                      </div>
                      <div>
                        <span className="stats-icon">
                          <Check size={19} />
                        </span>
                        <span>CONFIRMED ENTRIES</span>
                        <strong>{stats?.approved ?? 0}</strong>
                        <small>Approved player entries</small>
                      </div>
                      <div>
                        <span className="stats-icon">
                          <UsersRound size={19} />
                        </span>
                        <span>REGISTERED PLAYERS</span>
                        <strong>{stats?.players ?? 0}</strong>
                        <small>Player accounts</small>
                      </div>
                    </div>
                    <div className="dashboard-callout">
                      <div>
                        <span className="section-kicker">
                          <span>// YOUR NEXT MOVE</span>
                        </span>
                        <h3>
                          {paymentSettings?.paymentConfigured
                            ? "YOUR ARENA IS READY."
                            : "SET UP YOUR UPI CHECKOUT."}
                        </h3>
                        <p>
                          {paymentSettings?.paymentConfigured
                            ? "Create your next tournament or review player entries."
                            : "Upload a UPI payment QR or add your UPI ID before opening paid tournaments."}
                        </p>
                      </div>
                      <button
                        className="button button-outline"
                        onClick={() =>
                          changeTab(
                            paymentSettings?.paymentConfigured
                              ? "tournaments"
                              : "settings",
                          )
                        }
                      >
                        {paymentSettings?.paymentConfigured
                          ? "MANAGE TOURNAMENTS"
                          : "SET UP PAYMENTS"}{" "}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="admin-list-heading">
                      <div>
                        <h3>NEEDS YOUR ATTENTION</h3>
                        <p>Most recent payment proofs awaiting review.</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => changeTab("entries")}
                      >
                        VIEW ALL ENTRIES <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <EntryList
                      entries={entries
                        .filter((e) => e.status === "pending")
                        .slice(0, 5)}
                      onSelect={setReviewing}
                      empty="No pending payment proofs. You're all caught up."
                    />
                  </>
                )}
                {tab === "tournaments" &&
                  (editing ? (
                    <TournamentEditor
                      tournament={editing === "new" ? null : editing}
                      onClose={() => setEditing(null)}
                      onSaved={done}
                    />
                  ) : (
                    <>
                      <div className="admin-section-header">
                        <div>
                          <span className="section-kicker">
                            <span>// YOUR EVENTS</span>
                          </span>
                          <h2>TOURNAMENTS.</h2>
                          <p>Create, edit, and manage your arena.</p>
                        </div>
                        <button
                          className="button button-primary"
                          onClick={() => setEditing("new")}
                        >
                          <Plus size={16} /> NEW TOURNAMENT
                        </button>
                      </div>
                      <div className="admin-event-list">
                        {events.length ? (
                          events.map((event) => (
                            <div className="admin-event" key={event.id}>
                              <img src={event.image} alt="" />
                              <div className="admin-event-info">
                                <div>
                                  <span className="section-kicker">
                                    <span>{event.game.toUpperCase()}</span>
                                  </span>
                                  {event.isDemo && (
                                    <span className="demo-tag">SAMPLE</span>
                                  )}
                                </div>
                                <h3>{event.title}</h3>
                                <p>
                                  {formatDate(event.startsAt, true)} ·{" "}
                                  {event.totalSlots} spots ·{" "}
                                  {money(event.entryFee)} entry
                                </p>
                              </div>
                              <div className="admin-event-actions">
                                <span
                                  className={`admin-visibility ${event.status}`}
                                >
                                  {event.status}
                                </span>
                                <button
                                  className="small-button"
                                  onClick={() => setEditing(event)}
                                >
                                  EDIT
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Delete ${event.title}`}
                                  onClick={() => removeEvent(event)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="empty-panel">
                            No tournaments yet. Create your first one.
                          </div>
                        )}
                      </div>
                    </>
                  ))}
                {tab === "entries" && (
                  <>
                    <div className="admin-section-header">
                      <div>
                        <span className="section-kicker">
                          <span>// YOUR PLAYERS</span>
                        </span>
                        <h2>PLAYER ENTRIES.</h2>
                        <p>
                          Review payment screenshots and manage registrations.
                        </p>
                      </div>
                    </div>
                    <div className="admin-filter">
                      {[
                        ["pending", "Pending"],
                        ["approved", "Confirmed"],
                        ["rejected", "Rejected"],
                        ["awaiting_payment", "Awaiting payment"],
                        ["all", "All entries"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setFilter(value)}
                          className={filter === value ? "active" : ""}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <EntryList
                      entries={filteredEntries}
                      onSelect={setReviewing}
                      empty="No entries in this category yet."
                    />
                  </>
                )}
                {tab === "verify" && (
                  <VerifyTicket initialCode={scannedTicket} />
                )}
                {tab === "settings" && paymentSettings && (
                  <SettingsPanel initial={paymentSettings} onSaved={done} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {reviewing && (
        <ReviewModal
          entry={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={done}
        />
      )}
    </div>
  );
}

function EntryList({ entries, onSelect, empty }) {
  return entries.length ? (
    <div className="admin-entry-list">
      {entries.map((entry) => (
        <div className="admin-entry" key={entry.id}>
          <div className="admin-entry-player">
            <span className="user-avatar">
              {entry.firstName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>
                {entry.firstName} {entry.lastName}
              </strong>
              <small>{entry.email}</small>
            </div>
          </div>
          <div className="admin-entry-event">
            <strong>{entry.tournamentTitle}</strong>
            <small>
              {entry.gameName} · {money(entry.amount)}
            </small>
          </div>
          <StatusBadge status={entry.status} />
          <button className="small-button" onClick={() => onSelect(entry)}>
            <Eye size={15} /> REVIEW
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div className="admin-empty">
      <CircleDollarSign size={22} />
      <span>{empty}</span>
    </div>
  );
}
