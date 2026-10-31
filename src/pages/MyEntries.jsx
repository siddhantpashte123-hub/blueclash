import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Gamepad2,
  MessageCircle,
  Ticket,
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

export default function MyEntries() {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api("/me/entries")
        .then((data) => {
          if (active) {
            setEntries(data.entries);
            setError("");
          }
        })
        .catch((err) => {
          if (active) setError(err.message);
        });
    };
    load();
    const timer = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [user?.id]);
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
          from: "/my-entries",
          message: "Sign in to see your tournament entries.",
        }}
      />
    );
  return (
    <div className="page-shell">
      <div className="container">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} /> BACK TO THE ARENA
        </Link>
        <div className="page-heading">
          <div>
            <div className="section-kicker">
              <span>// YOUR COMPETITIVE JOURNEY</span>
            </div>
            <h1>
              MY <span>ENTRIES.</span>
            </h1>
            <p>All your tournament entries, in one place.</p>
          </div>
          <Link to="/#tournaments" className="button button-outline">
            FIND A TOURNAMENT <ArrowUpRight size={16} />
          </Link>
        </div>
        <ErrorMessage message={error} />
        {!entries && !error ? (
          <Loader label="Loading your entries..." />
        ) : entries?.length ? (
          <div className="my-entries-list">
            {entries.map((entry) => (
              <article className="my-entry-card" key={entry.id}>
                <img src={entry.image} alt="" />
                <div className="my-entry-main">
                  <span className="section-kicker">
                    <span>
                      {entry.game.toUpperCase()} / ENTRY #
                      {String(entry.id).padStart(4, "0")}
                    </span>
                  </span>
                  <h2>{entry.tournamentTitle}</h2>
                  <div className="event-meta">
                    <span>
                      <CalendarDays size={14} />{" "}
                      {formatDate(entry.startsAt, true)}
                    </span>
                    <span>
                      <Gamepad2 size={14} /> {entry.gameName}
                    </span>
                    <span>
                      <Ticket size={14} /> {money(entry.amount)}
                    </span>
                  </div>
                </div>
                <div className="my-entry-action">
                  <div className="my-entry-status">
                    <StatusBadge status={entry.status} />
                    {entry.status === "pending" && (
                      <small className="my-entry-note">
                        Ticket and chat available after approval.
                      </small>
                    )}
                  </div>
                  <div className="my-entry-buttons">
                    <Link
                      className="button button-outline"
                      to={
                        entry.status === "approved"
                          ? `/entries/${entry.id}/ticket`
                          : `/entries/${entry.id}`
                      }
                    >
                      {entry.status === "approved"
                        ? "VIEW TICKET"
                        : entry.status === "awaiting_payment"
                          ? "CONTINUE CHECKOUT"
                          : "VIEW ENTRY"}{" "}
                      <ArrowUpRight size={15} />
                    </Link>
                    {entry.status === "approved" && (
                      <Link
                        className="button button-chat"
                        to={`/entries/${entry.id}/chat`}
                      >
                        <MessageCircle size={15} /> CHAT WITH ADMIN
                        {entry.unreadMessages > 0 && (
                          <span
                            className="chat-unread"
                            aria-label={`${entry.unreadMessages} unread messages`}
                          >
                            {entry.unreadMessages > 99
                              ? "99+"
                              : entry.unreadMessages}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !error && (
            <div className="empty-panel big-empty">
              <Gamepad2 size={30} />
              <h2>YOUR STORY STARTS HERE.</h2>
              <p>
                You haven't joined a tournament yet. Let's find your first one.
              </p>
              <Link to="/#tournaments" className="button button-primary">
                EXPLORE TOURNAMENTS <ArrowUpRight size={16} />
              </Link>
            </div>
          )
        )}
      </div>
    </div>
  );
}
