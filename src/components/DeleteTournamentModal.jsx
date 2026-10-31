import { useEffect, useRef, useState } from "react";
import { AlertCircle, Trash2, X } from "lucide-react";
import { api, ErrorMessage, Loader } from "../shared.jsx";

export default function DeleteTournamentModal({
  tournament,
  onClose,
  onDeleted,
}) {
  const [summary, setSummary] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const summaryUrl = `/admin/tournaments/${tournament.id}/deletion-summary`;

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    api(summaryUrl)
      .then((data) => {
        if (active) setSummary(data.summary);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [summaryUrl]);

  const close = () => {
    if (!busy) onClose();
  };
  const handleKeys = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...dialogRef.current.querySelectorAll(
        "button:not(:disabled), input:not(:disabled)",
      ),
    ];
    if (!controls.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!summary || confirmation !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/admin/tournaments/${tournament.id}`, {
        method: "DELETE",
        body: { confirmation, snapshot: summary.snapshot },
      });
      onDeleted(result);
    } catch (err) {
      setError(err.message);
      setConfirmation("");
      // If anything changed while the dialog was open, require a fresh review.
      try {
        setSummary((await api(summaryUrl)).summary);
      } catch {
        setSummary(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close} onKeyDown={handleKeys}>
      <div
        ref={dialogRef}
        className="review-modal delete-tournament-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-tournament-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="section-kicker">
              <span>// PERMANENT ACTION</span>
            </span>
            <h2 id="delete-tournament-heading">
              DELETE <span>TOURNAMENT?</span>
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={close}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {!summary && !error ? (
          <Loader label="Checking tournament entries..." />
        ) : null}
        {summary && (
          <form className="form-stack" onSubmit={submit}>
            <p className="delete-tournament-name">{summary.title}</p>
            <div className="delete-tournament-stats">
              <div>
                <strong>{summary.entryCount}</strong>
                <span>ENTRIES</span>
                <small>
                  {summary.approvedCount} confirmed · {summary.pendingCount}{" "}
                  pending
                </small>
              </div>
              <div>
                <strong>{summary.ticketCount}</strong>
                <span>TICKETS</span>
              </div>
              <div>
                <strong>{summary.proofCount}</strong>
                <span>PAYMENT SCREENSHOTS</span>
              </div>
            </div>
            <div className="notice notice-danger delete-warning">
              <AlertCircle size={20} />
              <div>
                <strong>This cannot be undone.</strong>
                <p>
                  The tournament and all its entries, tickets and payment
                  screenshots will be permanently deleted. Payments are not
                  automatically refunded.
                </p>
              </div>
            </div>
            <p className="delete-tournament-help">
              Player accounts and other tournaments are not deleted. To keep
              records, cancel and mark this tournament completed instead.
            </p>
            <label>
              TYPE DELETE TO CONFIRM
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                autoFocus
                disabled={busy}
              />
            </label>
            <ErrorMessage message={error} />
            <div className="review-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={close}
                disabled={busy}
              >
                CANCEL
              </button>
              <button
                className="button button-danger"
                disabled={busy || confirmation !== "DELETE"}
              >
                <Trash2 size={16} />{" "}
                {busy ? "DELETING..." : "DELETE TOURNAMENT"}
              </button>
            </div>
          </form>
        )}
        {!summary && error && (
          <>
            <ErrorMessage message={error} />
            <button
              type="button"
              className="button button-outline"
              onClick={close}
            >
              CLOSE
            </button>
          </>
        )}
      </div>
    </div>
  );
}
