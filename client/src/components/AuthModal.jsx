import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthModal({
  isOpen,
  initialMode = "login",
  customMessage = "",
  onClose,
  onAuthSuccess,
}) {
  const [mode, setMode] = useState(initialMode); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "signup") {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    setTimeout(() => {
      // Persist user in localStorage
      const user = {
        name: mode === "signup" ? name.trim() : (email.split("@")[0] || "Cosmic Voyager"),
        email: email.trim().toLowerCase(),
        avatarInitial: (mode === "signup" ? name.trim() : email)[0].toUpperCase(),
        joinedAt: new Date().toISOString(),
      };

      try {
        localStorage.setItem("ghost-files-auth-user", JSON.stringify(user));
        localStorage.setItem("ghost-files-auth-token", "ghost_token_" + Date.now());
      } catch (err) {
        console.error("Storage error:", err);
      }

      setLoading(false);
      onAuthSuccess(user);
      onClose();
    }, 600);
  };

  return (
    <AnimatePresence>
      <div className="auth-overlay" onClick={onClose}>
        <motion.div
          className="auth-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* Close button */}
          <button className="auth-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>

          {/* Modal Header */}
          <div className="auth-header">
            <div className="auth-badge">
              <span className="cosmic-sparkle">✦</span> Ghost Files ID
            </div>
            <h2>{mode === "login" ? "Welcome back" : "Join the galaxy"}</h2>
            <p>
              {mode === "login"
                ? "Sign in to synchronize your local preferences and history securely."
                : "Create your private workspace key. Your files remain on your device."}
            </p>
          </div>

          {customMessage && (
            <div className="auth-notice-banner">
              <span className="auth-notice-icon">🔒</span>
              <div>
                <strong>Sign In Required to Download</strong>
                <span>{customMessage}</span>
              </div>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          {error && <div className="auth-error-banner">{error}</div>}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <label className="auth-field">
                <span>Full Name</span>
                <input
                  type="text"
                  placeholder="e.g. Orion Sky"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </label>
            )}

            <label className="auth-field">
              <span>Email Address</span>
              <input
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-show-pass"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            {mode === "signup" && (
              <label className="auth-field">
                <span>Confirm Password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>
            )}

            <button type="submit" className="button primary auth-submit" disabled={loading}>
              {loading ? (
                <span className="auth-spinner" />
              ) : mode === "login" ? (
                "Sign In →"
              ) : (
                "Create Account →"
              )}
            </button>
          </form>

          {/* Quick Demo Access */}
          <div className="auth-footer-prompt">
            <span>
              {mode === "login" ? "Don't have an account yet?" : "Already have an account?"}
            </span>{" "}
            <button
              type="button"
              className="auth-link-bold"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
