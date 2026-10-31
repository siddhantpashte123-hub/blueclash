import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Search,
  ShieldCheck,
  Ticket as TicketIcon,
} from "lucide-react";
import { api, ErrorMessage, formatDate, StatusBadge } from "../shared.jsx";

function extractCode(value) {
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    try {
      return (new URL(input).searchParams.get("ticket") || "")
        .trim()
        .toUpperCase();
    } catch {
      return "";
    }
  }
  return input.toUpperCase();
}

export default function VerifyTicket({ initialCode = "" }) {
  const [input, setInput] = useState(initialCode);
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verify = async (value) => {
    const code = extractCode(value);
    setInput(code || value);
    setTicket(null);
    setError("");
    if (!/^BC-[A-F0-9]{24}$/.test(code)) {
      setError("Enter the full ticket code or paste the ticket QR link.");
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/admin/tickets/${encodeURIComponent(code)}`);
      setTicket(result.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialCode) verify(initialCode);
  }, [initialCode]);
  return (
    <>
      <div className="admin-section-header">
        <div>
          <span className="section-kicker">
            <span>// MATCH DAY</span>
          </span>
          <h2>VERIFY A TICKET.</h2>
          <p>Scan the player's ticket QR, or enter their ticket code below.</p>
        </div>
      </div>
      <form
        className="form-panel form-stack verify-form"
        onSubmit={(event) => {
          event.preventDefault();
          verify(input);
        }}
      >
        <div className="panel-heading">
          <div>
            <span className="section-kicker">
              <span>// CONFIRMED ENTRIES ONLY</span>
            </span>
            <h2>
              FIND THE <span>PLAYER.</span>
            </h2>
          </div>
          <TicketIcon size={22} />
        </div>
        <label>
          TICKET CODE OR QR LINK
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="BC-..."
            maxLength={500}
            required
          />
        </label>
        <ErrorMessage message={error} />
        <button className="button button-primary" disabled={busy}>
          <Search size={16} /> {busy ? "CHECKING..." : "VERIFY TICKET"}
        </button>
      </form>
      {ticket && (
        <div className="verified-ticket-result">
          <div className="verified-ticket-heading">
            <span>
              <CheckCircle2 size={22} /> CONFIRMED TICKET
            </span>
            <StatusBadge status={ticket.status} />
          </div>
          <h3>{ticket.tournamentTitle}</h3>
          <div className="verified-ticket-grid">
            <div>
              <span>PLAYER</span>
              <strong>
                {ticket.firstName} {ticket.lastName}
              </strong>
            </div>
            <div>
              <span>ACCOUNT EMAIL</span>
              <strong>{ticket.email}</strong>
            </div>
            <div>
              <span>IN-GAME NAME</span>
              <strong>{ticket.gameName}</strong>
            </div>
            <div>
              <span>IN-GAME ID / UID</span>
              <strong>
                {ticket.gameId}
                {ticket.uid ? ` / ${ticket.uid}` : ""}
              </strong>
            </div>
            <div>
              <span>GAME / FORMAT</span>
              <strong>
                {ticket.game} / {ticket.mode}
              </strong>
            </div>
            <div>
              <span>MATCH DAY</span>
              <strong>{formatDate(ticket.startsAt, true)}</strong>
            </div>
            <div>
              <span>TICKET CODE</span>
              <strong>{ticket.ticketCode}</strong>
            </div>
            <div>
              <span>ISSUED</span>
              <strong>{formatDate(ticket.ticketIssuedAt, true)}</strong>
            </div>
          </div>
          <div className="inline-note">
            <ShieldCheck size={17} /> Check the player's identity and in-game
            details. This lookup does not record check-ins or prevent the same
            ticket being shown more than once.
          </div>
        </div>
      )}
    </>
  );
}
