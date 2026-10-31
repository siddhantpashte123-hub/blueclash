import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Crosshair,
  Gamepad2,
  ShieldCheck,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { api, ErrorMessage, Loader } from "../shared.jsx";
import TournamentCard from "../components/TournamentCard.jsx";

const filters = [
  { id: "all", label: "All tournaments" },
  { id: "minecraft", label: "Minecraft" },
  { id: "freefire", label: "Free Fire" },
  { id: "other", label: "Other games" },
];
const steps = [
  {
    n: "01",
    title: "FIND YOUR ARENA",
    description:
      "Explore tournaments for the games you love. Find a match that feels like yours.",
    icon: <Crosshair size={24} />,
  },
  {
    n: "02",
    title: "LOCK IN YOUR SPOT",
    description:
      "Enter your player details, complete checkout, and submit your payment proof.",
    icon: <ShieldCheck size={24} />,
  },
  {
    n: "03",
    title: "PLAY FOR GLORY",
    description:
      "Once your entry is confirmed, bring your best game and make your mark.",
    icon: <Trophy size={24} />,
  },
];

export default function Home() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/tournaments")
      .then((data) => setEvents(data.tournaments))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = events.filter(
    (event) => filter === "all" || event.category === filter,
  );
  return (
    <>
      <section className="hero">
        <div className="hero-art" />
        <div className="hero-overlay" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="live-spark">
                <Zap size={13} fill="currentColor" />
              </span>{" "}
              THE HOME OF COMMUNITY COMPETITION{" "}
              <span className="eyebrow-line" />
            </div>
            <h1>
              YOUR GAME.
              <br />
              <span>YOUR</span> <em>GLORY.</em>
            </h1>
            <p>
              Find Minecraft, Free Fire and more community tournaments. Join
              the clash and show the world what you've got.
            </p>
            <div className="hero-buttons">
              <a
                className="button button-primary button-large"
                href="#tournaments"
              >
                EXPLORE TOURNAMENTS <ArrowUpRight size={18} />
              </a>
              <a className="hero-secondary" href="#how-it-works">
                <span>
                  <ArrowDown size={15} />
                </span>{" "}
                HOW IT WORKS
              </a>
            </div>
            <div className="hero-bottom-note">
              <div className="mini-mark">
                <Swords size={16} />
              </div>
              <div>
                <strong>ONE ARENA. ENDLESS POSSIBILITIES.</strong>
                <span>MADE FOR PLAYERS, BY PLAYERS.</span>
              </div>
            </div>
          </div>
          <div className="hero-side-label">
            <span>THE STAGE IS SET</span>
            <strong>
              YOUR MOVE<span>.</span>
            </strong>
            <div>
              <i /> LET THE GAMES BEGIN
            </div>
          </div>
          <div className="hero-index">
            <span>01</span>
            <i /> 03
          </div>
        </div>
        <div className="hero-corner" />
      </section>

      <div className="games-strip">
        <div className="container games-strip-inner">
          <div className="strip-intro">
            <span className="strip-spark">✳</span>
            <div>
              YOUR GAME.<strong>YOUR COMMUNITY.</strong>
            </div>
          </div>
          <div className="strip-divider" />
          <span className="strip-label">THE GAMES WE PLAY</span>
          <div className="game-word minecraft-word">MINECRAFT</div>
          <span className="game-dot">✦</span>
          <div className="game-word freefire-word">FREE FIRE</div>
          <span className="game-dot">✦</span>
          <div className="game-word other-word">& MORE</div>
          <span className="strip-end">
            ALL PLAYERS WELCOME <ArrowRight size={15} />
          </span>
        </div>
      </div>

      <section className="section tournaments-section" id="tournaments">
        <div className="container">
          <div className="section-heading">
            <div>
              <div className="section-kicker">
                <span>// 01</span> YOUR NEXT CHALLENGE
              </div>
              <h2>
                FIND YOUR <span>NEXT CLASH.</span>
              </h2>
              <p>Find your game. Bring your best. The rest is up to you.</p>
            </div>
            <div className="heading-side">
              <span className="heading-side-icon">
                <Swords size={19} />
              </span>
              <div>
                THE BATTLEGROUND
                <br />
                <strong>IS CALLING</strong>
              </div>
            </div>
          </div>
          <div className="filter-bar">
            <div
              className="filters"
              role="group"
              aria-label="Filter tournaments by game"
            >
              {filters.map((item) => (
                <button
                  key={item.id}
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  {filter === item.id && <span />}
                </button>
              ))}
            </div>
            <span className="filter-count">
              <span /> {visible.length}{" "}
              {visible.length === 1 ? "EVENT" : "EVENTS"} TO EXPLORE
            </span>
          </div>
          <ErrorMessage message={error} />
          {loading ? (
            <Loader label="Finding tournaments..." />
          ) : visible.length ? (
            <div className="event-grid">
              {visible.map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          ) : (
            <div className="empty-panel">
              <Gamepad2 size={27} />
              <h3>NO TOURNAMENTS HERE YET.</h3>
              <p>Check another game or come back soon for the next drop.</p>
            </div>
          )}
          <div className="tournaments-footnote">
            <span>
              <span className="small-dot" /> MORE GAMES. MORE GLORY.
            </span>
            <span>
              YOUR NEXT BIG PLAY STARTS HERE <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
      </section>

      <section className="section how-section" id="how-it-works">
        <div className="container">
          <div className="section-heading how-heading">
            <div>
              <div className="section-kicker">
                <span>// 02</span> THE GAME PLAN
              </div>
              <h2>
                FROM PLAYER <span>TO CONTENDER.</span>
              </h2>
              <p>Three simple steps. One unforgettable experience.</p>
            </div>
            <a href="#tournaments" className="text-link">
              LET'S GET STARTED <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <div className="step-card" key={step.n}>
                <div className="step-top">
                  <span className="step-icon">{step.icon}</span>
                  <span className="step-number">{step.n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <div className="step-line">
                  <span />
                  <ArrowUpRight size={15} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bottom-cta-section">
        <div className="container">
          <div className="bottom-cta">
            <div className="cta-decor cta-decor-one" />
            <div className="cta-decor cta-decor-two" />
            <div className="bottom-cta-content">
              <div className="section-kicker">
                <span>// 03</span> THIS IS YOUR MOMENT
              </div>
              <h2>
                READY TO <em>MAKE YOUR MARK?</em>
              </h2>
              <p>Whatever your game, there's a place for you in the arena.</p>
              <a href="#tournaments" className="button button-white">
                FIND YOUR TOURNAMENT <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="cta-symbol">
              <div>
                <Swords size={78} strokeWidth={1} />
              </div>
              <span>
                <Check size={14} /> PLAYER FIRST. ALWAYS.
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
