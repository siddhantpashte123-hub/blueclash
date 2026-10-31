import { useEffect, useState } from "react";
import {
  AlertCircle,
  CreditCard,
  ImagePlus,
  QrCode,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { api, ErrorMessage } from "../shared.jsx";

export default function SettingsPanel({ initial, onSaved }) {
  const [form, setForm] = useState({
    paymentMode: initial.paymentMode || "none",
    upiId: initial.upiId || "",
    upiName: initial.upiName || "",
    supportEmail: initial.supportEmail || "",
  });
  const [hasSavedQr, setHasSavedQr] = useState(initial.qrUploaded);
  const [qrFile, setQrFile] = useState(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [preview, setPreview] = useState("");
  const [version, setVersion] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key) => (event) =>
    setForm({ ...form, [key]: event.target.value });
  useEffect(() => {
    setPreview("");
    if (!qrFile || qrFile.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(qrFile);
    return () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [qrFile]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (qrFile && qrFile.size > 5 * 1024 * 1024)
        throw new Error("QR image must be 5 MB or smaller.");
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      body.append("removeQr", String(removeQr));
      if (qrFile) body.append("paymentQr", qrFile);
      const result = await api("/admin/settings", { method: "PUT", body });
      setForm({
        paymentMode: result.settings.paymentMode,
        upiId: result.settings.upiId,
        upiName: result.settings.upiName,
        supportEmail: result.settings.supportEmail,
      });
      setHasSavedQr(result.settings.qrUploaded);
      setQrFile(null);
      setRemoveQr(false);
      setVersion(Date.now());
      onSaved("Payment settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const removeSaved = () => {
    setRemoveQr(true);
    setQrFile(null);
    setForm((old) => ({
      ...old,
      paymentMode: old.paymentMode === "qr" ? "none" : old.paymentMode,
    }));
  };
  const selectQr = (event) => {
    const file = event.target.files?.[0] || null;
    setQrFile(file);
    if (file) setRemoveQr(false);
  };
  const showSaved = hasSavedQr && !removeQr;
  return (
    <>
      <div className="admin-section-header">
        <div>
          <span className="section-kicker">
            <span>// CONFIGURATION</span>
          </span>
          <h2>PAYMENT SETTINGS.</h2>
          <p>Choose the payment QR players see at checkout.</p>
        </div>
      </div>
      <div className="notice notice-warning">
        <AlertCircle size={19} />
        <div>
          <strong>Payments are manually verified.</strong>
          <p>
            Check the actual incoming payment in your UPI or banking app before
            approving. A screenshot alone does not prove payment.
          </p>
        </div>
      </div>
      <form className="form-panel form-stack settings-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">
              <span>// YOUR PAYMENT DETAILS</span>
            </span>
            <h2>
              PAYMENT <span>QR.</span>
            </h2>
          </div>
          <CreditCard size={22} />
        </div>
        <fieldset className="payment-method-fieldset">
          <legend>CHOOSE A PAYMENT METHOD</legend>
          <div className="payment-methods">
            <label
              className={`payment-method ${form.paymentMode === "qr" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="paymentMode"
                value="qr"
                checked={form.paymentMode === "qr"}
                onChange={update("paymentMode")}
              />
              <QrCode size={20} />
              <span>
                <strong>UPLOAD MY QR</strong>
                <small>Use your own UPI QR image</small>
              </span>
            </label>
            <label
              className={`payment-method ${form.paymentMode === "upi" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="paymentMode"
                value="upi"
                checked={form.paymentMode === "upi"}
                onChange={update("paymentMode")}
              />
              <Smartphone size={20} />
              <span>
                <strong>GENERATE FROM UPI ID</strong>
                <small>QR includes the exact entry fee</small>
              </span>
            </label>
            <label
              className={`payment-method payment-disabled ${form.paymentMode === "none" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="paymentMode"
                value="none"
                checked={form.paymentMode === "none"}
                onChange={update("paymentMode")}
              />
              <span>
                <strong>DISABLE PAID ENTRIES</strong>
                <small>Free tournaments will still work</small>
              </span>
            </label>
          </div>
        </fieldset>
        {form.paymentMode === "qr" && (
          <div className="payment-qr-settings">
            <div className="payment-qr-heading">
              <div>
                <strong>YOUR UPI PAYMENT QR</strong>
                <p>Upload the QR players will scan at checkout.</p>
              </div>
              <ImagePlus size={20} />
            </div>
            <div className="admin-qr-upload">
              <div className="admin-qr-preview">
                {preview || showSaved ? (
                  <img
                    src={preview || `/api/admin/payment-qr?v=${version}`}
                    alt="Uploaded payment QR preview"
                  />
                ) : (
                  <span>
                    <QrCode size={28} /> NO QR UPLOADED
                  </span>
                )}
              </div>
              <div>
                <label className="upload-qr-label">
                  {showSaved || qrFile ? "REPLACE QR IMAGE" : "UPLOAD QR IMAGE"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={selectQr}
                  />
                </label>
                <small>PNG, JPG or WebP · up to 5 MB</small>
                {qrFile && <p className="qr-filename">{qrFile.name}</p>}
                {showSaved && (
                  <button
                    type="button"
                    className="remove-qr"
                    onClick={removeSaved}
                  >
                    <Trash2 size={14} /> REMOVE SAVED QR
                  </button>
                )}
              </div>
            </div>
            <div className="notice notice-warning">
              <AlertCircle size={17} />
              <div>
                <strong>Use a reusable, open-amount UPI QR.</strong>
                <p>
                  Do not upload a QR fixed to a different amount. Scan and test
                  it yourself before accepting payments; players must pay the
                  exact fee shown.
                </p>
              </div>
            </div>
          </div>
        )}
        {form.paymentMode === "upi" && (
          <label>
            UPI ID
            <input
              value={form.upiId}
              onChange={update("upiId")}
              placeholder="yourname@bank"
              maxLength={150}
              required
            />
            <small>
              We generate a payment QR containing the exact entry fee.
            </small>
          </label>
        )}
        {form.paymentMode !== "none" && (
          <label>
            PAYEE NAME{" "}
            {form.paymentMode === "qr" && (
              <span className="optional">OPTIONAL</span>
            )}
            <input
              value={form.upiName}
              onChange={update("upiName")}
              placeholder="The name shown to players"
              maxLength={80}
              required={form.paymentMode === "upi"}
            />
            <small>
              {form.paymentMode === "qr"
                ? "Make sure it matches the account linked to your uploaded QR."
                : "Shown alongside your UPI ID at checkout."}
            </small>
          </label>
        )}
        <label>
          SUPPORT EMAIL <span className="optional">OPTIONAL</span>
          <input
            type="email"
            value={form.supportEmail}
            onChange={update("supportEmail")}
            placeholder="support@example.com"
            maxLength={254}
          />
          <small>Shown to players who need help with an entry.</small>
        </label>
        <div className="inline-note">
          <ShieldCheck size={17} /> After paying, the player uploads their
          successful-payment screenshot. The entry stays pending until you
          review it; only then is their ticket issued.
        </div>
        {removeQr && (
          <div className="notice notice-blue">
            Saved QR will be removed when you save these settings.
          </div>
        )}
        <ErrorMessage message={error} />
        <button className="button button-primary" disabled={busy}>
          <Save size={16} /> {busy ? "SAVING..." : "SAVE SETTINGS"}
        </button>
      </form>
    </>
  );
}
