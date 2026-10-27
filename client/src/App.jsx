import React, { useState, useEffect, useRef } from "react";
import { tools } from "./lib/catalog.js";
import Workspace from "./components/Workspace.jsx";
import SpaceBackground from "./components/SpaceBackground.jsx";
import AuthModal from "./components/AuthModal.jsx";

export default function App() {
  const [active, setActive] = useState(null),
    [query, setQuery] = useState(""),
    [menu, setMenu] = useState(false);

  // Authentication state
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("ghost-files-auth-user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authCustomMessage, setAuthCustomMessage] = useState("");
  const [pendingDownload, setPendingDownload] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      localStorage.removeItem("ghost-files-auth-user");
      localStorage.removeItem("ghost-files-auth-token");
    } catch (err) {
      console.error("Logout storage error:", err);
    }
    setUser(null);
    setUserMenuOpen(false);
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthCustomMessage("");
    setAuthModalOpen(true);
    setMenu(false);
  };

  // Called when an unauthenticated user clicks a Download button
  const handleRequireAuth = (downloadAction) => {
    setPendingDownload(() => downloadAction);
    setAuthCustomMessage(
      "Please sign in to complete your download. Once signed in, you will be redirected right back and your file will download automatically.",
    );
    setAuthMode("login");
    setAuthModalOpen(true);
  };

  // Called when login or signup succeeds
  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setAuthModalOpen(false);
    setAuthCustomMessage("");

    // Automatically resume and trigger the pending download!
    if (pendingDownload) {
      setTimeout(() => {
        try {
          pendingDownload();
        } catch (err) {
          console.error("Auto-download error:", err);
        }
        setPendingDownload(null);
      }, 300);
    }
  };

  return (
    <div className="app">
      <SpaceBackground />
      <header className="nav shell">
        <a className="brand" href="#home">
          <span className="brand-mark">G</span>Ghost Files
        </a>
        <nav className={menu ? "menu-open" : ""}>
          <a href="#home" onClick={() => setMenu(false)}>
            Home
          </a>
          <a href="#tools" onClick={() => setMenu(false)}>
            All tools
          </a>
          <a href="#privacy" onClick={() => setMenu(false)}>
            Privacy
          </a>
        </nav>
        <div className="nav-buttons">
          {user ? (
            <div className="user-menu-container" ref={userMenuRef}>
              <button
                type="button"
                className="user-avatar-btn"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
                aria-label="User account menu"
              >
                <span className="user-avatar-circle">{user.avatarInitial || "U"}</span>
                <span className="user-avatar-name">{user.name || "Cosmic User"}</span>
                <span className="user-dropdown-arrow">▼</span>
              </button>
              {userMenuOpen && (
                <div className="user-dropdown-menu">
                  <div className="user-dropdown-info">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <button type="button" className="user-logout-btn" onClick={handleLogout}>
                    Log Out
                  </button>
                </div>
              )}
              <button
                type="button"
                className="auth-nav-btn auth-nav-logout"
                onClick={handleLogout}
                title="Log out of your account"
              >
                Log Out
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="auth-nav-btn"
                onClick={() => openAuth("login")}
              >
                Log In
              </button>
              <button
                type="button"
                className="auth-nav-btn auth-nav-signup"
                onClick={() => openAuth("signup")}
              >
                Sign Up
              </button>
            </>
          )}
          <button
            className="icon-button mobile-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            Menu
          </button>
        </div>
      </header>
      <main>
        <section id="home" className="hero shell">
          <div>
            <div className="eyebrow">
              <span />
              Private by default
            </div>
            <h1>
              Your files.
              <br />
              <em>Your device.</em>
              <br />
              Your privacy.
            </h1>
            <p>
              PDF and image tools for everyday work. Local tools process files
              in this browser. Every server upload asks for your approval.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#tools">
                Explore all tools →
              </a>
              <a className="button quiet" href="#privacy">
                How privacy works
              </a>
            </div>
            <div className="micro-note">
              No accounts. No document library. No analytics.
            </div>
          </div>
          <div className="hero-card">
            <div className="card-top">
              <span>Your private workspace</span>
              <span className="local">
                <i />
                On-device tools
              </span>
            </div>
            <button className="dropzone" onClick={() => setActive("merge")}>
              <span className="drop-icon">PDF</span>
              <strong>Start with your files</strong>
              <span>Merge, convert, sign, edit, and more.</span>
              <b>Open Merge PDF</b>
            </button>
            <div className="card-bottom">
              <span>Local processing works without the API</span>
            </div>
          </div>
        </section>
        <section id="tools" className="section shell">
          <div className="section-head">
            <div>
              <div className="kicker">The toolkit</div>
              <h2>
                Useful tools, minus
                <br />
                the privacy trade-off.
              </h2>
            </div>
            <label className="search-label">
              Find a tool
              <input
                type="search"
                placeholder="Search tools..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="tool-grid">
            {tools
              .filter((tool) =>
                `${tool.name} ${tool.description}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((tool) => (
                <button
                  className="tool-card"
                  key={tool.id}
                  onClick={() => setActive(tool.id)}
                >
                  <span className="tool-icon" style={{ background: tool.tint }}>
                    {tool.icon}
                  </span>
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                  <small>
                    {tool.mode === "server"
                      ? "Temporary server processing"
                      : "Processed on your device"}
                  </small>
                </button>
              ))}
          </div>
        </section>
        <section id="privacy" className="section shell">
          <div className="privacy-band">
            <div>
              <div className="kicker lime">A clearer promise</div>
              <h2>Your file should never take a detour.</h2>
              <p>
                Local tools keep your files in browser memory. Office-to-PDF and
                password operations use temporary server processing only after
                you approve the upload. Files are removed when processing
                finishes or fails.
              </p>
            </div>
            <div className="privacy-list">
              <div>
                <b>Processed on your device</b>
                <span>
                  PDF, image, HTML, and text-based PDF-to-Office exports run
                  locally.
                </span>
              </div>
              <div>
                <b>Temporary server processing</b>
                <span>
                  Office rendering and PDF encryption use LibreOffice and qpdf.
                  Review consent before transfer.
                </span>
              </div>
              <div>
                <b>Understand the limits</b>
                <span>
                  Local processing reduces server exposure. It cannot protect a
                  compromised browser or device. Ordinary deletion does not
                  guarantee physical erasure.
                </span>
              </div>
            </div>
          </div>
        </section>
        <section id="workflow" className="section shell">
          <div className="section-head">
            <div>
              <div className="kicker">Simple by design</div>
              <h2>
                Three steps.
                <br />
                One less worry.
              </h2>
            </div>
          </div>
          <div className="steps">
            {[
              [
                "Choose files",
                "Drop or browse. Check the visible processing location.",
              ],
              [
                "Configure and process",
                "Adjust settings, preview, and run the operation.",
              ],
              [
                "Download your result",
                "Download individually or bundle successful results into a ZIP.",
              ],
            ].map(([title, copy], index) => (
              <div key={title}>
                <b>0{index + 1}</b>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="shell footer">
        <span className="brand">Ghost Files</span>
        <div>
          <a href="#tools">All tools</a> ·{" "}
          <a href="#privacy">Privacy & limitations</a> ·{" "}
          <a href="#workflow">How it works</a>
          <p>
            50 MB per local file · 25 MB per server file · 300 PDF pages · 24 MP
            images
          </p>
        </div>
      </footer>
      {active && (
        <Workspace
          key={active}
          tool={tools.find((tool) => tool.id === active)}
          onClose={() => setActive(null)}
          user={user}
          onRequireAuth={handleRequireAuth}
        />
      )}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        customMessage={authCustomMessage}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthCustomMessage("");
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
