import {
  ArrowUpRight,
  CalendarDays,
  Ticket,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, money } from "../shared.jsx";

export default function TournamentCard({ tournament: t }) {
  return (
    <article className="event-card">
      <Link
        className="event-image"
        to={`/tournaments/${t.id}`}
        aria-label={`View ${t.title}`}
      >
        <img src={t.image} alt="" loading="lazy" />
        <div className="event-image-overlay" />
        <div className="event-card-tags">
          <span className="game-tag">{t.game.toUpperCase()}</span>
          {t.isDemo ? (
            <span className="demo-tag">SAMPLE EVENT</span>
          ) : (
            <span className={`open-tag ${!t.canJoin ? "closed" : ""}`}>
              <span />
              {t.canJoin ? "REGISTRATION OPEN" : "CLOSED"}
            </span>
          )}
        </div>
        <div className="image-bottom-label">
          <span>BLUECLASH / TOURNAMENTS</span>
          <ArrowUpRight size={18} />
        </div>
      </Link>
      <div className="event-body">
        <div className="event-title-row">
          <div>
            <div className="event-kicker">{t.tagline}</div>
            <h3>
              <Link to={`/tournaments/${t.id}`}>{t.title}</Link>
            </h3>
          </div>
          <Link
            className="icon-arrow"
            to={`/tournaments/${t.id}`}
            aria-label={`View ${t.title}`}
          >
            <ArrowUpRight size={19} />
          </Link>
        </div>
        <div className="event-meta">
          <span>
            <CalendarDays size={14} /> {formatDate(t.startsAt)}
          </span>
          <span>
            <UsersRound size={14} /> {t.mode}
          </span>
        </div>
        <div className="event-prizes">
          <div>
            <span>
              <Trophy size={14} /> PRIZE POOL
            </span>
            <strong>{money(t.prizePool)}</strong>
          </div>
          <div>
            <span>
              <Ticket size={14} /> ENTRY FEE
            </span>
            <strong>{money(t.entryFee)}</strong>
          </div>
        </div>
        <div className="event-bottom">
          <span>
            {t.isDemo
              ? "PREVIEW ONLY"
              : `${t.slotsLeft} OF ${t.totalSlots} SPOTS LEFT`}
          </span>
          <Link to={`/tournaments/${t.id}`}>
            VIEW DETAILS <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}
