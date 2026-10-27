import React, { useEffect, useRef, useState } from "react";
import { authRequest } from "../lib/auth.js";

export default function AuthModal({
  initialMode,
  onClose,
  onAuthSuccess,
  available = false,
  downloadRequired = false,
}) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (!available) return;
    setError("");
    setBusy(true);
    try {
      const data = await authRequest(mode, {
        email,
        password,
        ...(mode === "signup" ? { name } : {}),
      });
      setPassword("");
      onAuthSuccess(data.user);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="auth-modal"
      aria-labelledby="account-title"
      onCancel={onClose}
    >
      <button
        type="button"
        className="auth-close"
        aria-label="Close account form"
        onClick={onClose}
      >
        ×
      </button>
      <div className="auth-header">
        <h2 id="account-title">
          {mode === "signup"
            ? "Create a Ghost Files account"
            : "Log in to Ghost Files"}
        </h2>
        <p>
          Your name, email, and password hash are stored on our server. Your
          files are not saved to your account. Log in before downloading your
          results.
        </p>
        {downloadRequired && (
          <p className="auth-notice-banner">
            Log in or create an account to continue. Your result will download
            after sign-in.
          </p>
        )}
        {!available && (
          <p role="alert" className="auth-error-banner">
            The account service is unavailable. Please try again shortly.
          </p>
        )}
      </div>
      <form className="auth-form" onSubmit={submit}>
        <fieldset disabled={!available || busy} className="auth-fields">
          {mode === "signup" && (
            <label className="auth-field">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
          )}
          <label className="auth-field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
          <label className="auth-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={15}
              maxLength={72}
              aria-describedby="password-policy"
              required
            />
          </label>
          <p id="password-policy">
            Use a unique password of at least 15 characters (maximum 72 UTF-8
            bytes).
          </p>
          {error && (
            <p role="alert" className="auth-error-banner">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button primary auth-submit"
            disabled={busy}
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Log in"}
          </button>
          <button
            type="button"
            className="auth-link-bold"
            disabled={busy}
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setPassword("");
              setError("");
            }}
          >
            {mode === "signup"
              ? "Already have an account? Log in"
              : "Create an account"}
          </button>
        </fieldset>
      </form>
    </dialog>
  );
}
