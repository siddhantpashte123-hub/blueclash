import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Gamepad2,
  MessageCircle,
  Printer,
  ShieldCheck,
  Ticket as TicketIcon,
} from "lucide-react";
import {
  api,
  ErrorMessage,
  formatDate,
  Loader,
  money,
  useAuth,
} from "../shared.jsx";

function fitText(ctx, value, x, y, maxWidth, size, color = "#f1f5ff") {
  let current = size;
  ctx.fillStyle = color;
  ctx.font = `800 ${current}px "Barlow Condensed", sans-serif`;
  while (ctx.measureText(value).width > maxWidth && current > 20) {
    current -= 2;
    ctx.font = `800 ${current}px "Barlow Condensed", sans-serif`;
  }
  let shown = value;
  while (ctx.measureText(shown).width > maxWidth && shown.length > 1) {
    shown = shown.slice(0, -2).trimEnd();
  }
  ctx.fillText(shown === value ? shown : `${shown}…`, x, y);
}

async function downloadTicket(ticket, qrCode) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 680;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create the ticket image.");
  ctx.fillStyle = "#09111f";
  ctx.fillRect(0, 0, 1200, 680);
  ctx.fillStyle = "#111d31";
  ctx.fillRect(3, 3, 815, 674);
  ctx.fillStyle = "#172948";
  ctx.fillRect(820, 3, 377, 674);
  ctx.strokeStyle = "#405a83";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 1196, 676);
  const logo = new Image();
  const logoLoaded = await new Promise((resolve) => {
    logo.onload = () => resolve(true);
    logo.onerror = () => resolve(false);
    logo.src = "/brand/logo-192.png";
  });
  if (logoLoaded) ctx.drawImage(logo, 43, 40, 60, 60);
  else {
    // The ticket is still downloadable if the logo asset is unavailable.
    ctx.fillStyle = "#346aff";
    ctx.fillRect(48, 46, 48, 48);
    fitText(ctx, "B", 59, 84, 35, 42, "#ffffff");
  }
  fitText(ctx, "BLUECLASH", 110, 82, 200, 34);
  ctx.font = '700 16px "Manrope", sans-serif';
  ctx.fillStyle = "#94ade2";
  ctx.fillText("OFFICIAL TOURNAMENT TICKET", 49, 151);
  fitText(ctx, ticket.tournamentTitle.toUpperCase(), 48, 224, 720, 62);
  fitText(
    ctx,
    `${ticket.game.toUpperCase()}  /  ${ticket.mode.toUpperCase()}`,
    50,
    265,
    720,
    24,
    "#7da3ff",
  );
  ctx.strokeStyle = "#314563";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 293);
  ctx.lineTo(772, 293);
  ctx.stroke();
  const field = (label, value, x, y, width = 310) => {
    ctx.font = '700 14px "Manrope", sans-serif';
    ctx.fillStyle = "#8fa4c4";
    ctx.fillText(label, x, y);
    fitText(ctx, value, x, y + 37, width, 29);
  };
  field("PLAYER", `${ticket.firstName} ${ticket.lastName}`, 50, 345);
  field("IN-GAME NAME", ticket.gameName, 420, 345);
  field("MATCH DATE / LOCAL TIME", formatDate(ticket.startsAt, true), 50, 437);
  field("IN-GAME ID", ticket.gameId, 420, 437);
  field("TICKET CODE", ticket.ticketCode, 50, 531, 700);
  ctx.font = '600 14px "Manrope", sans-serif';
  ctx.fillStyle = "#90a6c6";
  ctx.fillText(
    "CONFIRMED ENTRY  •  SHOW THIS TICKET TO THE ORGANIZER",
    50,
    627,
  );
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Could not load the ticket QR."));
    image.src = qrCode;
  });
  ctx.fillStyle = "#fff";
  ctx.fillRect(893, 132, 230, 230);
  ctx.drawImage(image, 900, 139, 216, 216);
  fitText(ctx, "SCAN TO VERIFY", 886, 415, 280, 30);
  ctx.font = '600 14px "Manrope", sans-serif';
  ctx.fillStyle = "#b2c4e5";
  ctx.fillText("Organizer login required", 903, 450);
  ctx.fillText("This QR is not for payment.", 895, 478);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `BlueClash-${ticket.ticketCode}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function Ticket() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [qr, setQr] = useState({ ticketCode: "", data: "" });
  const qrCode = qr.ticketCode === ticket?.ticketCode ? qr.data : "";
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    setTicket(null);
    setError("");
    api(`/entries/${id}/ticket`)
      .then((data) => {
        if (active) setTicket(data.ticket);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!ticket?.ticketCode) return;
    let active = true;
    const url = new URL("/admin", window.location.origin);
    url.searchParams.set("ticket", ticket.ticketCode);
    QRCode.toDataURL(url.toString(), {
      margin: 2,
      width: 320,
      color: { dark: "#101629", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((value) => {
        if (active) setQr({ ticketCode: ticket.ticketCode, data: value });
      })
      .catch(() => {
        if (active)
          setDownloadError(
            "Could not generate the ticket QR. Please use the ticket code below.",
          );
      });
    return () => {
      active = false;
    };
  }, [ticket?.ticketCode]);

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
          from: `/entries/${id}/ticket`,
          message: "Sign in to see your ticket.",
        }}
      />
    );
  if (error)
    return (
      <div className="container narrow-page">
        <ErrorMessage message={error} />
        <Link className="back-link" to={`/entries/${id}`}>
          <ArrowLeft size={15} /> BACK TO ENTRY
        </Link>
      </div>
    );
  if (!ticket)
    return (
      <div className="container narrow-page">
        <Loader label="Getting your ticket ready..." />
      </div>
    );

  return (
    <div className="page-shell ticket-page">
      <div className="container ticket-container">
        <Link to="/my-entries" className="back-link">
          <ArrowLeft size={15} /> MY ENTRIES
        </Link>
        <div className="ticket-page-heading">
          <span className="section-kicker">
            <span>// YOU'RE OFFICIALLY IN</span>
          </span>
          <h1>
            YOUR TICKET TO <span>THE CLASH.</span>
          </h1>
          <p>Your entry is confirmed. Keep this ticket handy for match day.</p>
        </div>
        <div className="ticket-card">
          <div className="ticket-main">
            <div className="ticket-topline">
              <span className="ticket-brand">
                <img src="/brand/logo-192.png" width="38" height="38" alt="" />
                BLUE<span>CLASH</span>
              </span>
              <span className="ticket-confirmed">
                <CheckCircle2 size={15} /> CONFIRMED ENTRY
              </span>
            </div>
            <div className="ticket-heading">
              <span className="section-kicker">
                <span>// OFFICIAL TOURNAMENT TICKET</span>
              </span>
              <h2>{ticket.tournamentTitle}</h2>
              <p>
                <Gamepad2 size={15} /> {ticket.game} <span> / </span>{" "}
                {ticket.mode}
              </p>
            </div>
            <div className="ticket-fields">
              <div>
                <span>PLAYER NAME</span>
                <strong>
                  {ticket.firstName} {ticket.lastName}
                </strong>
              </div>
              <div>
                <span>IN-GAME NAME</span>
                <strong>{ticket.gameName}</strong>
              </div>
              <div>
                <span>MATCH DAY · YOUR LOCAL TIME</span>
                <strong>{formatDate(ticket.startsAt, true)}</strong>
              </div>
              <div>
                <span>IN-GAME ID</span>
                <strong>{ticket.gameId}</strong>
              </div>
            </div>
            <div className="ticket-code-row">
              <div>
                <span>TICKET CODE</span>
                <strong>{ticket.ticketCode}</strong>
              </div>
              <span className="ticket-fee">{money(ticket.amount)} ENTRY</span>
            </div>
            <div className="ticket-main-footer">
              <span>
                <ShieldCheck size={15} /> ENTRY CONFIRMED
              </span>
              <span>BLUECLASH / PLAYER PASS</span>
            </div>
          </div>
          <div className="ticket-stub">
            <span className="ticket-stub-label">
              <TicketIcon size={16} /> PLAYER PASS
            </span>
            <div className="ticket-qr">
              {qrCode ? (
                <img src={qrCode} alt="Ticket verification QR code" />
              ) : (
                <Loader label="Generating QR..." />
              )}
            </div>
            <h3>SCAN TO VERIFY.</h3>
            <p>
              For the organizer to verify your entry. This is not a payment QR.
            </p>
            <strong>{ticket.ticketCode}</strong>
          </div>
        </div>
        <ErrorMessage message={downloadError} />
        <div className="ticket-page-actions">
          <button
            className="button button-primary"
            disabled={!qrCode}
            onClick={async () => {
              setDownloadError("");
              try {
                await downloadTicket(ticket, qrCode);
              } catch (err) {
                setDownloadError(err.message);
              }
            }}
          >
            <Download size={16} /> DOWNLOAD TICKET PNG
          </button>
          <button
            className="button button-outline"
            onClick={() => window.print()}
          >
            <Printer size={16} /> PRINT / SAVE PDF
          </button>
          <Link to={`/entries/${id}/chat`} className="button button-chat">
            <MessageCircle size={16} /> CHAT WITH ADMIN
          </Link>
          <Link to={`/entries/${id}`} className="text-link">
            VIEW ENTRY <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="ticket-helper">
          <ShieldCheck size={16} /> The ticket QR opens an admin-only
          verification page. It does not record check-ins or prevent reuse.
        </div>
      </div>
    </div>
  );
}
