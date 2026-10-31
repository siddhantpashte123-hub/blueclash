import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  Copy,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api, ErrorMessage, formatDate, Loader } from "../shared.jsx";

// Both sides use the same view, but different API routes and authorization.
export default function ChatConversation({ entryId, role, onActivity }) {
  const endpoint =
    role === "admin"
      ? `/admin/entries/${entryId}/chat`
      : `/entries/${entryId}/chat`;
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const copyTimer = useRef(null);
  const messagesRef = useRef([]);
  const fetchedThrough = useRef(0);
  const readThrough = useRef(0);
  const initialized = useRef(false);
  const scrollBox = useRef(null);
  const scrollAction = useRef(null);
  const refreshNow = useRef(() => {});
  const activity = useRef(onActivity);
  const mounted = useRef(false);
  activity.current = onActivity;

  const mergeMessages = useCallback((incoming, mode = "auto") => {
    if (!incoming.length) return;
    const box = scrollBox.current;
    if (mode === "preserve" && box) {
      scrollAction.current = {
        type: "preserve",
        height: box.scrollHeight,
        top: box.scrollTop,
      };
    } else if (
      mode === "bottom" ||
      !box ||
      box.scrollHeight - box.scrollTop - box.clientHeight < 90
    ) {
      scrollAction.current = { type: "bottom" };
    }
    const byId = new Map(messagesRef.current.map((item) => [item.id, item]));
    for (const item of incoming) byId.set(item.id, item);
    const next = [...byId.values()].sort((a, b) => a.id - b.id);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useLayoutEffect(() => {
    const box = scrollBox.current;
    const action = scrollAction.current;
    if (box && action) {
      if (action.type === "bottom") box.scrollTop = box.scrollHeight;
      else box.scrollTop = action.top + box.scrollHeight - action.height;
    }
    scrollAction.current = null;
  }, [messages]);

  useEffect(() => {
    let active = true;
    let timer;
    let running = false;
    let stopped = false;
    const controller = new AbortController();
    mounted.current = true;
    const schedule = (delay = 5000) => {
      if (active && !stopped) timer = setTimeout(refresh, delay);
    };
    async function refresh() {
      if (!active || stopped || running) return;
      clearTimeout(timer);
      if (document.hidden && initialized.current) return schedule();
      running = true;
      try {
        let more = false;
        let pages = 0;
        do {
          const isInitial = !initialized.current;
          const query = isInitial ? "" : `?after=${fetchedThrough.current}`;
          const result = await api(`${endpoint}${query}`, {
            signal: controller.signal,
          });
          if (!active) return;
          setThread(result.thread);
          if (isInitial) {
            setHasOlder(result.hasMore);
            initialized.current = true;
          }
          mergeMessages(result.messages, isInitial ? "bottom" : "auto");
          if (result.messages.length)
            fetchedThrough.current = result.messages.at(-1).id;
          more = !isInitial && result.hasMore;
          pages++;
        } while (more && pages < 10);
        setConnectionError("");
        // Only mark messages that were actually fetched, and only while this tab is visible.
        if (!document.hidden && fetchedThrough.current > readThrough.current) {
          const through = fetchedThrough.current;
          try {
            await api(`${endpoint}/read`, {
              method: "POST",
              body: { throughId: through },
              signal: controller.signal,
            });
            if (active) {
              readThrough.current = through;
              activity.current?.();
            }
          } catch {
            // A transient read-receipt failure is retried on the next refresh.
          }
        }
        if (active) schedule(more ? 0 : 5000);
      } catch (error) {
        if (!active || error.name === "AbortError") return;
        if ([401, 403, 404, 409].includes(error.status)) {
          stopped = true;
          messagesRef.current = [];
          setMessages([]);
          setThread(null);
          setFatalError(error.message);
        } else {
          setConnectionError(
            "Connection interrupted. Retrying automatically...",
          );
          schedule();
        }
      } finally {
        running = false;
      }
    }
    refreshNow.current = () => {
      if (!running && active && !stopped) {
        clearTimeout(timer);
        refresh();
      }
    };
    const onVisible = () => {
      if (!document.hidden) refreshNow.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    refresh();
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
      refreshNow.current = () => {};
    };
  }, [endpoint, mergeMessages]);

  const copyMessage = async (message) => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(message.text);
      if (!mounted.current) return;
      setActionError("");
      setCopiedId(message.id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      if (mounted.current)
        setActionError(
          "Could not copy. Select the message text to copy it manually.",
        );
    }
  };

  const loadOlder = async () => {
    if (!messagesRef.current.length || loadingOlder) return;
    setLoadingOlder(true);
    setActionError("");
    try {
      const oldest = messagesRef.current[0].id;
      const result = await api(`${endpoint}?before=${oldest}`);
      if (!mounted.current) return;
      mergeMessages(result.messages, "preserve");
      setHasOlder(result.hasMore);
    } catch (error) {
      if (mounted.current) setActionError(error.message);
    } finally {
      if (mounted.current) setLoadingOlder(false);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!draft.trim() || sending || !thread) return;
    setSending(true);
    setActionError("");
    try {
      const result = await api(endpoint, {
        method: "POST",
        body: { message: draft },
      });
      if (!mounted.current) return;
      // Do not advance the fetch cursor here: an incoming message could have
      // arrived between the last poll and our send and must not be skipped.
      mergeMessages([result.message], "bottom");
      setDraft("");
      activity.current?.();
      refreshNow.current();
    } catch (error) {
      if (mounted.current) {
        setActionError(error.message);
        if ([401, 403, 404, 409].includes(error.status)) refreshNow.current();
      }
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  if (fatalError)
    return (
      <div className="conversation-fatal">
        <ErrorMessage message={fatalError} />
      </div>
    );
  if (!thread)
    return (
      <div className="conversation-loading">
        {connectionError ? (
          <p role="status">{connectionError}</p>
        ) : (
          <Loader label="Opening private chat..." />
        )}
      </div>
    );
  const isAdmin = role === "admin";
  return (
    <section
      className="conversation"
      aria-label={`Private chat for ${thread.tournamentTitle}`}
    >
      <div className="conversation-head">
        <div className="conversation-head-main">
          <span className="conversation-avatar">
            <MessageCircle size={20} />
          </span>
          <div>
            <span className="conversation-kicker">
              {isAdmin ? "PLAYER CONVERSATION" : "YOUR ORGANIZER"}
            </span>
            <h2>{isAdmin ? thread.playerName : "TOURNAMENT ORGANIZER"}</h2>
            <p>
              {thread.tournamentTitle} <span>·</span>{" "}
              {isAdmin
                ? `${thread.gameName} · Entry #${thread.entryId}`
                : thread.game}
            </p>
          </div>
        </div>
        <span className="conversation-private">
          <LockKeyhole size={13} /> PRIVATE
        </span>
      </div>
      <div className="conversation-notice">
        <ShieldCheck size={15} />
        <span>
          {isAdmin
            ? "Only this player and organizer accounts can see these messages."
            : "Only you and the tournament organizers can see this chat."}{" "}
          Never share passwords or OTPs.
        </span>
      </div>
      <div
        className="conversation-messages"
        ref={scrollBox}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {hasOlder && (
          <button
            type="button"
            className="chat-load-older"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? "LOADING..." : "LOAD EARLIER MESSAGES"}
          </button>
        )}
        {messages.length ? (
          messages.map((message) => {
            const own = message.senderRole === role;
            return (
              <div
                className={`chat-message-row ${own ? "own" : "other"}`}
                key={message.id}
              >
                <div className="chat-bubble">
                  <span className="chat-message-author">
                    {own ? "YOU" : isAdmin ? thread.playerName : "ORGANIZER"}
                  </span>
                  <p>{message.text}</p>
                  <div className="chat-bubble-meta">
                    <button
                      type="button"
                      onClick={() => copyMessage(message)}
                      aria-label={
                        copiedId === message.id
                          ? "Message copied"
                          : "Copy message"
                      }
                      title="Copy message"
                    >
                      {copiedId === message.id ? (
                        <Check size={12} />
                      ) : (
                        <Copy size={12} />
                      )}
                      {copiedId === message.id ? "COPIED" : "COPY"}
                    </button>
                    <time dateTime={message.createdAt}>
                      {formatDate(message.createdAt, true)}
                    </time>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="conversation-empty">
            <span>
              <MessageCircle size={22} />
            </span>
            <strong>START THE CONVERSATION.</strong>
            <p>
              {isAdmin
                ? "Send the player your server IP, match details or any updates."
                : "Ask the organizer for the server IP and match details here."}
            </p>
          </div>
        )}
      </div>
      {connectionError && (
        <p className="chat-connection" role="status">
          {connectionError}
        </p>
      )}
      <ErrorMessage message={actionError} />
      <form className="chat-compose" onSubmit={send}>
        <label className="sr-only" htmlFor={`chat-message-${role}-${entryId}`}>
          Message
        </label>
        <textarea
          id={`chat-message-${role}-${entryId}`}
          value={draft}
          maxLength={2000}
          rows={2}
          disabled={sending}
          placeholder={
            isAdmin
              ? "Share the server IP and match details..."
              : "Ask for the server IP or send a message..."
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="button button-primary"
          type="submit"
          disabled={sending || !draft.trim()}
        >
          <Send size={16} /> {sending ? "SENDING..." : "SEND"}
        </button>
        <div className="chat-compose-foot">
          <span>Enter to send · Shift + Enter for a new line</span>
          <span>{draft.length}/2000</span>
        </div>
      </form>
      <p className="chat-refresh-note">
        Messages refresh automatically while this chat is open.
      </p>
    </section>
  );
}
