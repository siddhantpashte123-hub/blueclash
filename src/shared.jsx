import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export async function api(url, { method = "GET", body, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (method !== "GET") headers["X-Requested-With"] = "BlueClash";
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`/api${url}`, {
    credentials: "same-origin",
    ...options,
    method,
    headers,
    body: payload,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supportEmail, setSupportEmail] = useState("");
  const refresh = useCallback(async () => {
    try {
      const data = await api("/me");
      setUser(data.user);
      setSupportEmail(data.supportEmail || "");
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    // Terms accepted in this browser tab should not carry over to a different player.
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("blueclash-terms-")) sessionStorage.removeItem(key);
    setUser(null);
  };
  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, logout, supportEmail, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}

export const money = (value) =>
  value === 0
    ? "FREE"
    : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const formatDate = (value, withTime = false) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "TBA";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
};
export const termsKey = (id) => `blueclash-terms-${id}`;
export const entryStatus = {
  awaiting_payment: { label: "Awaiting payment", className: "warning" },
  pending: { label: "Pending review", className: "warning" },
  approved: { label: "Confirmed", className: "success" },
  rejected: { label: "Needs attention", className: "danger" },
};

export function StatusBadge({ status }) {
  const item = entryStatus[status] || { label: status, className: "muted" };
  return (
    <span className={`status-badge ${item.className}`}>
      <span />
      {item.label}
    </span>
  );
}
export function ErrorMessage({ message }) {
  return message ? (
    <div className="form-error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loader({ label = "Loading..." }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
      {label}
    </div>
  );
}
