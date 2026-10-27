import React, { useState } from "react";
import { motion } from "framer-motion";
import { authRequest } from "../lib/auth.js";
import { followLink, navigate } from "../lib/navigation.js";

export default function AuthPage({
  mode = "login", // "login" | "signup"
  available = true,
  user = null,
  onAuthSuccess,
  onLogout,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(event) {
    event.preventDefault();
    if (!available) return;
    setError("");
    setBusy(true);
    try {
      const data = await authRequest(mode, {
        email,
        password,
        ...(isSignup ? { name } : {}),
      });
      setPassword("");
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <section className="auth-page-section shell">
        <motion.div
          className="auth-page-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="auth-header">
            <span className="auth-badge">Active Session</span>
            <h2>Signed In</h2>
            <p>You are currently logged into your Ghost Files account.</p>
          </div>
          <div
            className="user-dropdown-info"
            style={{
              marginBottom: 24,
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              borderRadius: 8,
            }}
          >
            <strong style={{ fontSize: 16 }}>{user.name}</strong>
            <span
              style={{
                fontSize: 13,
                color: "var(--muted)",
                display: "block",
                marginTop: 4,
              }}
            >
              {user.email}
            </span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <a
              href="/#tools"
              className="button primary"
              onClick={followLink}
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Go to Workspace ↗
            </a>
            <button
              type="button"
              className="button quiet"
              onClick={onLogout}
              style={{ width: "100%" }}
            >
              Log out of Ghost Files
            </button>
          </div>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="auth-page-section shell">
      <motion.div
        className="auth-page-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`auth-tab ${!isSignup ? "active" : ""}`}
            onClick={() => {
              setError("");
              navigate("/login");
            }}
          >
            Log In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`auth-tab ${isSignup ? "active" : ""}`}
            onClick={() => {
              setError("");
              navigate("/register");
            }}
          >
            Create Account
          </button>
        </div>

        <div className="auth-header">
          <span className="auth-badge">
            <span className="cosmic-sparkle">✦</span> Ghost Files Account
          </span>
          <h2>{isSignup ? "Create an account" : "Welcome back"}</h2>
          <p>
            Your name, email, and password hash are stored on our server. Your
            files process locally by default. Server tools temporarily upload
            files only with your approval and clean them up after processing.
          </p>
        </div>

        {!available && (
          <p role="alert" className="auth-error-banner">
            Connecting to account service… (waking up server, please wait a moment)
          </p>
        )}

        <form className="auth-form" onSubmit={submit}>
          <fieldset disabled={!available || busy} className="auth-fields">
            {isSignup && (
              <label className="auth-field">
                <span className="auth-label-row">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </label>
            )}

            <label className="auth-field">
              <span className="auth-label-row">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
                maxLength={254}
                required
              />
            </label>

            <label className="auth-field">
              <span className="auth-label-row">Password</span>
              <div className="auth-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder="••••••••••••••••"
                  minLength={15}
                  maxLength={72}
                  aria-describedby="password-policy-page"
                  required
                />
                <button
                  type="button"
                  className="auth-show-pass"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <p
              id="password-policy-page"
              style={{
                fontSize: 11,
                color: "var(--muted)",
                margin: "2px 0 6px",
              }}
            >
              Use a unique password of at least 15 characters (maximum 72 UTF-8 bytes).
            </p>

            {error && (
              <p role="alert" className="auth-error-banner">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="button primary auth-submit"
              disabled={busy || !available}
              style={{ width: "100%", justifyContent: "center", minHeight: 46 }}
            >
              {busy ? (
                <span>Please wait…</span>
              ) : isSignup ? (
                "Create account ↗"
              ) : (
                "Log in ↗"
              )}
            </button>

            <div className="auth-footer-prompt">
              {isSignup ? (
                <>
                  Already have an account?{" "}
                  <a
                    href="/login"
                    className="auth-link-bold"
                    onClick={(e) => {
                      e.preventDefault();
                      setError("");
                      navigate("/login");
                    }}
                  >
                    Log in
                  </a>
                </>
              ) : (
                <>
                  Don't have an account?{" "}
                  <a
                    href="/register"
                    className="auth-link-bold"
                    onClick={(e) => {
                      e.preventDefault();
                      setError("");
                      navigate("/register");
                    }}
                  >
                    Create an account
                  </a>
                </>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: 14 }}>
              <a
                href="/"
                onClick={followLink}
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  textDecoration: "none",
                }}
              >
                ← Back to tools
              </a>
            </div>
          </fieldset>
        </form>
      </motion.div>
    </section>
  );
}
