import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Search,
} from "lucide-react";
import { api, ErrorMessage, formatDate, Loader } from "../shared.jsx";
import ChatConversation from "./ChatConversation.jsx";

export default function AdminChats({
  tournaments,
  initialEntryId,
  onActivity,
}) {
  const [selectedId, setSelectedId] = useState(initialEntryId || null);
  const [tournamentId, setTournamentId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [threads, setThreads] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const refreshList = useRef(() => {});
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;

  useEffect(() => {
    setSelectedId(initialEntryId || null);
  }, [initialEntryId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    let serial = 0;
    const controller = new AbortController();
    const params = new URLSearchParams({ offset: String(offset) });
    if (tournamentId) params.set("tournamentId", tournamentId);
    if (debouncedSearch) params.set("search", debouncedSearch);
    async function load() {
      const request = ++serial;
      try {
        const result = await api(`/admin/chats?${params}`, {
          signal: controller.signal,
        });
        if (!active || request !== serial) return;
        setThreads(result.threads);
        setHasMore(result.hasMore);
        setError("");
      } catch (err) {
        if (active && err.name !== "AbortError" && request === serial)
          setError(err.message);
      }
    }
    refreshList.current = load;
    setThreads(null);
    setError("");
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
      refreshList.current = () => {};
    };
  }, [tournamentId, debouncedSearch, offset]);
  const chatActivity = useCallback(() => {
    refreshList.current();
    activityRef.current?.();
  }, []);

  return (
    <div className="admin-chats">
      <div className="admin-section-header">
        <div>
          <span className="section-kicker">
            <span>// YOUR PLAYERS, ONE TO ONE</span>
          </span>
          <h2>
            PLAYER <span>MESSAGES.</span>
          </h2>
          <p>
            Privately share server IPs and match details with confirmed players.
          </p>
        </div>
      </div>
      <div className={`admin-chat-layout ${selectedId ? "has-selected" : ""}`}>
        <div className="admin-chat-list">
          <div className="chat-list-top">
            <div>
              <span>INBOX</span>
              <strong>CONFIRMED PLAYERS</strong>
            </div>
            <MessageCircle size={19} />
          </div>
          <div className="chat-filters">
            <label className="sr-only" htmlFor="chat-tournament-filter">
              Filter by tournament
            </label>
            <select
              id="chat-tournament-filter"
              value={tournamentId}
              onChange={(event) => {
                setTournamentId(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All tournaments</option>
              {tournaments.map((tournament) => (
                <option value={tournament.id} key={tournament.id}>
                  {tournament.title}
                </option>
              ))}
            </select>
            <div className="chat-search">
              <Search size={15} />
              <label className="sr-only" htmlFor="chat-player-search">
                Search players
              </label>
              <input
                id="chat-player-search"
                type="search"
                maxLength={100}
                placeholder="Search player or event..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <ErrorMessage message={error} />
          {!threads && !error ? (
            <Loader label="Loading players..." />
          ) : threads?.length ? (
            <div className="chat-thread-list">
              {threads.map((thread) => (
                <button
                  key={thread.entryId}
                  type="button"
                  className={`chat-thread ${selectedId === thread.entryId ? "active" : ""}`}
                  aria-label={`Open chat with ${thread.playerName} for ${thread.tournamentTitle}`}
                  aria-pressed={selectedId === thread.entryId}
                  onClick={() => setSelectedId(thread.entryId)}
                >
                  <span className="chat-thread-avatar">
                    {thread.playerName.charAt(0).toUpperCase()}
                  </span>
                  <span className="chat-thread-info">
                    <span className="chat-thread-name">
                      {thread.playerName}
                    </span>
                    <span className="chat-thread-event">
                      {thread.tournamentTitle}
                    </span>
                    <span className="chat-thread-preview">
                      {thread.lastMessage
                        ? `${thread.lastSenderRole === "admin" ? "You: " : ""}${thread.lastMessage}`
                        : "Start a conversation"}
                    </span>
                  </span>
                  <span className="chat-thread-meta">
                    {thread.lastMessageAt && (
                      <small>{formatDate(thread.lastMessageAt)}</small>
                    )}
                    {thread.unreadCount > 0 && (
                      <span
                        className="chat-unread"
                        aria-label={`${thread.unreadCount} unread messages`}
                      >
                        {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            !error && (
              <div className="chat-list-empty">
                <MessageCircle size={21} />
                <p>
                  No confirmed players found. Approve an entry to start a
                  private chat.
                </p>
              </div>
            )
          )}
          {(offset > 0 || hasMore) && (
            <div className="chat-pagination">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                <ChevronLeft size={15} /> PREVIOUS
              </button>
              <span>PAGE {Math.floor(offset / 50) + 1}</span>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setOffset(offset + 50)}
              >
                NEXT <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
        <div className="admin-chat-detail">
          {selectedId ? (
            <>
              <button
                type="button"
                className="chat-mobile-back"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft size={15} /> BACK TO INBOX
              </button>
              <ChatConversation
                key={selectedId}
                entryId={selectedId}
                role="admin"
                onActivity={chatActivity}
              />
            </>
          ) : (
            <div className="admin-chat-placeholder">
              <span>
                <MessageCircle size={28} />
              </span>
              <h3>YOUR PRIVATE LINE.</h3>
              <p>
                Select a confirmed player to share the server IP or answer their
                questions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
