import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ImagePlus,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_NAME_MAX_LENGTH,
  DEFAULT_BRANDING,
} from "../brand.js";
import { api, ErrorMessage, Loader, useAuth } from "../shared.jsx";

export default function BrandingPanel({ onSaved }) {
  const { branding, setBranding } = useAuth();
  const [saved, setSaved] = useState(branding);
  const [name, setName] = useState(branding.name);
  const [logo, setLogo] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  const applySaved = useCallback(
    (value) => {
      setSaved(value);
      setName(value.name);
      setLogo(null);
      setRemoveLogo(false);
      setPreview("");
      setConflict(false);
      setBranding(value);
    },
    [setBranding],
  );

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("/admin/branding");
      applySaved(result.branding);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applySaved]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);
  useEffect(() => {
    setPreview("");
    if (!logo) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(logo);
    return () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [logo]);

  const selectLogo = (event) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again after cancelling or saving.
    event.target.value = "";
    if (!file) return;
    setError("");
    if (
      file.size > BRAND_LOGO_MAX_BYTES ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setLogo(null);
      setError("Choose a PNG, JPG or WebP image no larger than 5 MB.");
      return;
    }
    setLogo(file);
    setRemoveLogo(false);
  };

  const useDefaultLogo = () => {
    setLogo(null);
    setRemoveLogo(true);
    setError("");
  };
  const restoreDefaults = () => {
    setName(DEFAULT_BRANDING.name);
    useDefaultLogo();
  };
  const discardChanges = () => {
    setName(saved.name);
    setLogo(null);
    setRemoveLogo(false);
    setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        !name.trim() ||
        Array.from(name.trim()).length > BRAND_NAME_MAX_LENGTH
      ) {
        throw new Error(
          `Website name must be between 1 and ${BRAND_NAME_MAX_LENGTH} characters.`,
        );
      }
      const body = new FormData();
      body.append("name", name);
      body.append("revision", saved.revision);
      body.append("removeLogo", String(removeLogo));
      if (logo) body.append("logo", logo);
      const result = await api("/admin/branding", { method: "PUT", body });
      applySaved(result.branding);
      onSaved(
        "Website branding saved. Visitors will see the new name and logo.",
      );
    } catch (err) {
      setError(err.message);
      if (err.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader label="Loading website branding..." />;
  const previewLogo =
    preview || (removeLogo ? DEFAULT_BRANDING.logoUrl : saved.logoUrl);
  const dirty =
    name.trim() !== saved.name ||
    Boolean(logo) ||
    (removeLogo && saved.customLogo) ||
    saved.assetsMissing;
  return (
    <>
      <div className="admin-section-header">
        <div>
          <span className="section-kicker">
            <span>// YOUR IDENTITY</span>
          </span>
          <h2>WEBSITE BRANDING.</h2>
          <p>
            Make the arena yours. Your changes appear across the website and on
            tickets.
          </p>
        </div>
      </div>
      {saved.assetsMissing && (
        <div className="notice notice-warning">
          <AlertCircle size={19} />
          <span>
            The saved brand images are missing. Upload the logo again or restore
            the default, then save.
          </span>
        </div>
      )}
      {conflict && (
        <div className="notice notice-warning branding-conflict">
          <AlertCircle size={19} />
          <div>
            Another admin changed these settings. Reload the latest version
            before saving; this discards your unsaved edits.
          </div>
          <button type="button" onClick={loadLatest} disabled={busy}>
            RELOAD LATEST
          </button>
        </div>
      )}
      <div className="branding-workspace">
        <form className="form-panel form-stack branding-form" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <span>// BRAND SETTINGS</span>
              </span>
              <h2>
                YOUR <span>LOOK.</span>
              </h2>
            </div>
            <Sparkles size={22} />
          </div>
          <label>
            WEBSITE NAME
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your website name"
              maxLength={80}
              disabled={busy}
              required
            />
            <small className="branding-help">
              Up to {BRAND_NAME_MAX_LENGTH} characters. Shown in the header,
              page titles and tickets.
            </small>
          </label>
          <div className="branding-upload">
            <div className="branding-upload-title">
              <div>
                <strong>WEBSITE LOGO</strong>
                <p>Use a square image for the best fit.</p>
              </div>
              <ImagePlus size={20} />
            </div>
            <div className="branding-logo-control">
              <div className="branding-logo-image">
                <img src={previewLogo} alt="Website logo preview" />
              </div>
              <div className="branding-logo-options">
                <label className="upload-qr-label">
                  {saved.customLogo || logo ? "CHANGE LOGO" : "UPLOAD LOGO"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={selectLogo}
                    disabled={busy}
                  />
                </label>
                <small>
                  PNG, JPG or WebP · max 5 MB
                  <br />
                  16–4096 px per side · square recommended
                </small>
                {logo && <span className="qr-filename">{logo.name}</span>}
                {(saved.customLogo || logo || saved.assetsMissing) &&
                  !removeLogo && (
                    <button
                      type="button"
                      className="branding-text-button"
                      onClick={useDefaultLogo}
                      disabled={busy}
                    >
                      USE DEFAULT LOGO
                    </button>
                  )}
                {removeLogo && (
                  <small>Default logo selected. Save to apply.</small>
                )}
              </div>
            </div>
          </div>
          <ErrorMessage message={error} />
          <div className="branding-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !dirty || conflict}
            >
              <Save size={16} /> {busy ? "SAVING..." : "SAVE BRANDING"}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={restoreDefaults}
              disabled={busy}
            >
              <RotateCcw size={15} /> RESTORE DEFAULTS
            </button>
            {dirty && !conflict && (
              <button
                type="button"
                className="branding-text-button"
                onClick={discardChanges}
                disabled={busy}
              >
                DISCARD CHANGES
              </button>
            )}
          </div>
          <p className="branding-footnote">
            Restoring defaults changes the name and logo only after you save.
            Payment settings and ticket codes stay the same.
          </p>
        </form>
        <aside className="branding-preview" aria-label="Live branding preview">
          <span className="section-kicker">
            <span>// LIVE PREVIEW</span>
          </span>
          <p>Your website header</p>
          <div className="branding-preview-window">
            <div className="branding-preview-browser">
              <i />
              <i />
              <i />
              <span>YOUR WEBSITE</span>
            </div>
            <div className="branding-preview-header">
              <img src={previewLogo} alt="" />
              <div>
                <strong title={name || DEFAULT_BRANDING.name}>
                  {name.trim() || DEFAULT_BRANDING.name}
                </strong>
                <small>THE GAMING ARENA</small>
              </div>
              <span className="branding-preview-nav">TOURNAMENTS</span>
            </div>
            <div className="branding-preview-content">
              <span>YOUR NEXT BATTLE AWAITS</span>
              <strong>
                FIND YOUR
                <br />
                <em>ARENA.</em>
              </strong>
              <div>DISCOVER TOURNAMENTS ↗</div>
            </div>
          </div>
          <p className="branding-preview-note">
            The favicon and social preview are generated automatically. Search
            engines and social apps may take time to refresh their caches.
          </p>
        </aside>
      </div>
    </>
  );
}
