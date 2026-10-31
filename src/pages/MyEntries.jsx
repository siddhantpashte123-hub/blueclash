import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Gamepad2,
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
    if (user)
      api("/me/entries")
        .then((data) => setEntries(data.entries))
        .catch((err) => setError(err.message));
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
                  <StatusBadge status={entry.status} />
                  <Link
                    className="button button-outline"
                    to={`/entries/${entry.id}`}
                  >
                    {entry.status === "awaiting_payment"
                      ? "CONTINUE CHECKOUT"
                      : "VIEW ENTRY"}{" "}
                    <ArrowUpRight size={15} />
                  </Link>
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
