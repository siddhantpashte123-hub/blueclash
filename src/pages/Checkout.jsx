import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  ImagePlus,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
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
import EntrySteps from "../components/EntrySteps.jsx";

export default function Checkout() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  const load = () =>
    api(`/entries/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  useEffect(() => {
    if (user) load();
  }, [id, user?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (data?.entry.status === "rejected") setShowUpload(true);
  }, [data?.entry.status]);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!file) return setError("Please choose a screenshot to submit.");
    if (file.size > 5 * 1024 * 1024)
      return setError("Screenshot must be 5 MB or smaller.");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("screenshot", file);
      body.append("reference", reference);
      await api(`/entries/${id}/proof`, { method: "POST", body });
      setFile(null);
      setShowUpload(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const renewHold = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/entries/${id}/hold`, { method: "POST" });
      await load();
      setNow(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(data.payment.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Could not copy the UPI ID. You can select and copy it manually.",
      );
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
          from: `/entries/${id}`,
          message: "Sign in to see your entry.",
        }}
      />
    );
  if (!data && error)
    return (
      <div className="container narrow-page">
        <ErrorMessage message={error} />
        <Link to="/my-entries" className="back-link">
          ← My entries
        </Link>
      </div>
    );
  if (!data)
    return (
      <div className="container narrow-page">
        <Loader label="Loading your entry..." />
      </div>
    );
  const { entry, payment } = data;
  const expired =
    entry.holdExpiresAt && new Date(entry.holdExpiresAt).getTime() <= now;
  const awaiting = entry.status === "awaiting_payment";
  const rejected = entry.status === "rejected";
  const finished = entry.status === "pending" || entry.status === "approved";
  return (
    <div className="page-shell">
      <div className="container">
        <Link to="/my-entries" className="back-link">
          <ArrowLeft size={15} /> MY ENTRIES
        </Link>
        <EntrySteps current={3} />
        <div className="form-page-heading">
          <div className="section-kicker">
            <span>// THE FINAL STEP</span>
          </div>
          <h1>
            {entry.status === "approved" ? (
              <>
                YOUR TICKET IS <span>READY.</span>
              </>
            ) : entry.status === "pending" ? (
              <>
                ENTRY UNDER <span>REVIEW.</span>
              </>
            ) : (
              <>
                LOCK IN YOUR <span>SPOT.</span>
              </>
            )}
          </h1>
          <p>
            {finished
              ? "Here’s the latest on your tournament entry."
              : "Complete your entry and get ready for the game."}
          </p>
        </div>
        <div className="checkout-layout">
          <div>
            {finished ? (
              <div className="result-panel">
                <span
                  className={`result-icon ${entry.status === "approved" ? "is-success" : ""}`}
                >
                  {entry.status === "approved" ? (
                    <CheckCircle2 size={33} />
                  ) : (
                    <Clock3 size={33} />
                  )}
                </span>
                <div className="section-kicker">
                  <span>// ENTRY #{String(entry.id).padStart(4, "0")}</span>
                </div>
                <h2>
                  {entry.status === "approved" ? (
                    <>
                      ENTRY <span>CONFIRMED.</span>
                    </>
                  ) : (
                    <>
                      PROOF <span>SUBMITTED.</span>
                    </>
                  )}
                </h2>
                <p>
                  {entry.status === "approved"
                    ? "Your place is confirmed and your ticket is ready. You can also chat privately with the organizer for match details."
                    : "Your screenshot is with the organizer. Your ticket and private chat will appear in My Entries after they verify your payment."}
                </p>
                <StatusBadge status={entry.status} />
                {entry.reviewNote && (
                  <div className="notice notice-blue">
                    <span>Organizer note: {entry.reviewNote}</span>
                  </div>
                )}
                <div className="result-actions">
                  {entry.status === "approved" ? (
                    <>
                      <Link
                        to={`/entries/${id}/ticket`}
                        className="button button-primary"
                      >
                        VIEW MY TICKET <ArrowUpRight size={16} />
                      </Link>
                      <Link
                        to={`/entries/${id}/chat`}
                        className="button button-chat"
                      >
                        <MessageCircle size={16} /> CHAT WITH ADMIN
                      </Link>
                      <Link to="/my-entries" className="text-link">
                        MY ENTRIES <ArrowUpRight size={15} />
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link to="/my-entries" className="button button-primary">
                        VIEW MY ENTRIES <ArrowUpRight size={16} />
                      </Link>
                      <Link to="/#tournaments" className="text-link">
                        EXPLORE MORE EVENTS <ArrowUpRight size={15} />
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {rejected && (
                  <div className="notice notice-danger">
                    <AlertCircle size={20} />
                    <div>
                      <strong>Your proof needs another look.</strong>
                      <p>
                        {entry.reviewNote ||
                          "The organizer could not confirm your payment. Please upload a clearer screenshot or contact the organizer."}
                      </p>
                      <p>Do not pay again unless the organizer asks you to.</p>
                    </div>
                  </div>
                )}
                {awaiting && (
                  <div className="form-panel payment-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-kicker">
                          <span>01 / COMPLETE PAYMENT</span>
                        </span>
                        <h2>
                          SCAN. PAY. <span>PLAY.</span>
                        </h2>
                      </div>
                      <LockKeyhole size={22} />
                    </div>
                    <p className="muted-copy">
                      Scan the payment QR with any UPI app and pay the exact
                      entry fee. After paying, upload a screenshot of the
                      successful payment.
                    </p>
                    {expired && (
                      <div className="notice notice-warning">
                        <AlertCircle size={19} />
                        <div>
                          <strong>Your 30-minute spot hold has expired.</strong>
                          <p>
                            Reserve again before paying. If you have already
                            paid, submit your screenshot below; the organizer
                            will review it, but a spot is not guaranteed.
                          </p>
                          <button
                            className="inline-action"
                            disabled={busy}
                            onClick={renewHold}
                          >
                            <RefreshCw size={14} /> RESERVE AGAIN
                          </button>
                        </div>
                      </div>
                    )}
                    {!expired && (
                      <div className="hold-note">
                        <Clock3 size={15} /> Your spot is held until{" "}
                        {formatDate(entry.holdExpiresAt, true)} (your local
                        time).
                      </div>
                    )}
                    {payment.configured && payment.qrCode && !expired ? (
                      <div className="qr-layout">
                        <div className="qr-code">
                          <img
                            src={payment.qrCode}
                            alt={`UPI QR code for ${money(entry.amount)}`}
                          />
                          <span>SCAN TO PAY WITH ANY UPI APP</span>
                        </div>
                        <div className="payment-details">
                          <span className="summary-label">AMOUNT TO PAY</span>
                          <strong className="payment-amount">
                            {money(entry.amount)}
                          </strong>
                          {payment.mode === "upi" && (
                            <div className="upi-field">
                              <span>UPI ID</span>
                              <div>
                                <strong>{payment.upiId}</strong>
                                <button
                                  type="button"
                                  onClick={copyUpi}
                                  aria-label="Copy UPI ID"
                                >
                                  {copied ? (
                                    <Check size={17} />
                                  ) : (
                                    <Copy size={17} />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                          {payment.upiName && (
                            <div className="upi-field">
                              <span>PAYEE NAME</span>
                              <strong>{payment.upiName}</strong>
                            </div>
                          )}
                          {payment.mode === "qr" && (
                            <div className="upi-field">
                              <span>UPLOADED PAYMENT QR</span>
                              <strong>
                                Enter {money(entry.amount)} in your UPI app if
                                the amount is not pre-filled.
                              </strong>
                              <small>
                                On one phone? Use your UPI app's
                                scan-from-gallery option with a screenshot of
                                the QR, if supported.
                              </small>
                            </div>
                          )}
                          {payment.upiUri && (
                            <a className="upi-open" href={payment.upiUri}>
                              OPEN IN UPI APP <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      !expired && (
                        <div className="notice notice-warning">
                          <AlertCircle size={18} />
                          <div>
                            The organizer has not configured payments yet.
                            Please check back or{" "}
                            {payment.supportEmail ? (
                              <a href={`mailto:${payment.supportEmail}`}>
                                contact support
                              </a>
                            ) : (
                              "contact the organizer"
                            )}{" "}
                            before paying.
                          </div>
                        </div>
                      )
                    )}
                    <div className="payment-disclaimer">
                      <ShieldCheck size={16} /> Payments are verified manually
                      by the organizer; scanning the QR does not automatically
                      confirm your entry.
                    </div>
                    {!showUpload && (
                      <button
                        className="button button-primary full-width"
                        onClick={() => {
                          setShowUpload(true);
                          setError("");
                        }}
                      >
                        I HAVE PAID <ArrowUpRight size={17} />
                      </button>
                    )}
                  </div>
                )}
                {showUpload && (
                  <div className="form-panel upload-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-kicker">
                          <span>02 / PAYMENT PROOF</span>
                        </span>
                        <h2>
                          SHOW US THE <span>PROOF.</span>
                        </h2>
                      </div>
                      <ImagePlus size={23} />
                    </div>
                    <p className="muted-copy">
                      Upload the screenshot showing your successful payment —
                      not a photo of the QR code. The organizer will review it
                      before confirming your spot and issuing your ticket.
                    </p>
                    <form onSubmit={submit} className="form-stack">
                      <div
                        className="upload-area"
                        onClick={() => inputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            inputRef.current?.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <input
                          ref={inputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          hidden
                        />
                        <span>
                          <UploadCloud size={23} />
                        </span>
                        <strong>
                          {file ? file.name : "CLICK TO UPLOAD SCREENSHOT"}
                        </strong>
                        <small>
                          {file
                            ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Click to change`
                            : "PNG, JPG or WebP · up to 5 MB"}
                        </small>
                      </div>
                      <label>
                        UPI TRANSACTION ID{" "}
                        <span className="optional">OPTIONAL</span>
                        <input
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="Add your transaction ID"
                          maxLength={100}
                        />
                        <small>
                          This helps the organizer verify your payment faster.
                        </small>
                      </label>
                      <ErrorMessage message={error} />
                      <button
                        className="button button-primary full-width"
                        disabled={busy}
                      >
                        {busy ? "SUBMITTING..." : "SUBMIT PAYMENT PROOF"}{" "}
                        <ArrowUpRight size={17} />
                      </button>
                    </form>
                  </div>
                )}
                {!showUpload && <ErrorMessage message={error} />}
              </>
            )}
          </div>
          <aside>
            <div className="summary-card">
              <div
                className="summary-image"
                style={{
                  backgroundImage: `linear-gradient(0deg, rgba(7,11,20,.97), transparent), url(${entry.image})`,
                }}
              >
                <span className="game-tag">{entry.game.toUpperCase()}</span>
              </div>
              <div className="summary-body">
                <span className="section-kicker">
                  <span>// YOUR ENTRY</span>
                </span>
                <h2>{entry.tournamentTitle}</h2>
                <div className="summary-facts">
                  <span>
                    PLAYER{" "}
                    <strong>
                      {entry.firstName} {entry.lastName}
                    </strong>
                  </span>
                  <span>
                    IN-GAME NAME <strong>{entry.gameName}</strong>
                  </span>
                  <span>
                    MATCH DAY <strong>{formatDate(entry.startsAt)}</strong>
                  </span>
                  <span>
                    STATUS <StatusBadge status={entry.status} />
                  </span>
                </div>
                <div className="summary-total">
                  <span>ENTRY FEE</span>
                  <strong>{money(entry.amount)}</strong>
                </div>
              </div>
            </div>
            <div className="sidebar-mini">
              <span>NEED A HAND?</span>
              <strong>
                {payment.supportEmail ? (
                  <a href={`mailto:${payment.supportEmail}`}>
                    CONTACT THE ORGANIZER <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <>
                    REACH OUT TO THE
                    <br />
                    TOURNAMENT ORGANIZER
                  </>
                )}
              </strong>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
