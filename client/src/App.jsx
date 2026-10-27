import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import { tools } from "./lib/catalog.js";
import Workspace from "./components/Workspace.jsx";
import AuthModal from "./components/AuthModal.jsx";

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

function Reveal({ children, className = "", delay = 0, reduced = false }) {
  return (
    <motion.div
      className={className}
      variants={reveal}
      initial={reduced ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduced ? 0 : 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  const handleLogout = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    localStorage.removeItem("ghost-files-auth-user");
    localStorage.removeItem("ghost-files-auth-token");
    setUser(null);
    setUserMenuOpen(false);
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthCustomMessage("");
    setAuthModalOpen(true);
    setMenu(false);
  };

  const handleRequireAuth = (downloadAction) => {
    setPendingDownload(() => downloadAction);
    setAuthCustomMessage(
      "Sign in to finish the download. You will return to this workspace automatically.",
    );
    setAuthMode("login");
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setAuthModalOpen(false);
    setAuthCustomMessage("");
    if (pendingDownload) {
      setTimeout(() => {
        pendingDownload();
        setPendingDownload(null);
      }, 300);
    }
  };

  const filteredTools = tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="app">
      <div className="ambient ambient-lime" aria-hidden="true" />
      <div className="ambient ambient-amber" aria-hidden="true" />
      <motion.div className="scroll-progress" style={{ scaleX: progress }} aria-hidden="true" />

      <header className="nav shell">
        <a className="brand" href="#home" onClick={() => setMenu(false)}>
          <span className="brand-mark">G</span>
          <span>Ghost Files</span>
          <span className="brand-version">/ 01</span>
        </a>
        <nav className={menu ? "menu-open" : ""} aria-label="Primary navigation">
          <a href="#tools" onClick={() => setMenu(false)}>Tools <span>01</span></a>
          <a href="#privacy" onClick={() => setMenu(false)}>Privacy <span>02</span></a>
          <a href="#workflow" onClick={() => setMenu(false)}>Workflow <span>03</span></a>
        </nav>
        <div className="nav-buttons">
          {user ? (
            <div className="user-menu-container" ref={userMenuRef}>
              <button type="button" className="user-avatar-btn" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
                <span className="user-avatar-circle">{user.avatarInitial || "U"}</span>
                <span className="user-avatar-name">{user.name || "Local user"}</span>
                <span className="user-dropdown-arrow">↓</span>
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div className="user-dropdown-menu" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: reduced ? 0 : 0.18 }}>
                    <div className="user-dropdown-info"><strong>{user.name}</strong><span>{user.email}</span></div>
                    <button type="button" className="user-logout-btn" onClick={handleLogout}>Log out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <button type="button" className="auth-nav-btn" onClick={() => openAuth("login")}>Log in</button>
              <button type="button" className="auth-nav-btn auth-nav-signup" onClick={() => openAuth("signup")}>Create account <span>↗</span></button>
            </>
          )}
          <button className="icon-button mobile-toggle" aria-label="Toggle navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button>
        </div>
      </header>

      <main>
        <section id="home" className="hero shell">
          <Reveal reduced={reduced}>
            <div className="eyebrow"><span /> Privacy-first file tools <b>·</b> v1.0</div>
            <h1>Files in.<br /><em>Nothing else.</em></h1>
            <p className="hero-lede">A quiet toolkit for the work that happens around a document. Convert, sign, compress, and edit without handing your files to a stranger.</p>
            <div className="hero-actions">
              <motion.a className="button primary" href="#tools" whileHover={reduced ? undefined : { y: -3 }} whileTap={reduced ? undefined : { scale: 0.98 }}>Open the toolkit <span>↗</span></motion.a>
              <a className="button quiet" href="#privacy">Read the privacy model</a>
            </div>
            <div className="micro-note"><span className="status-dot" /> Local by default <i>·</i> No document library <i>·</i> No analytics</div>
          </Reveal>

          <Reveal className="hero-visual-wrap" delay={0.12} reduced={reduced}>
            <motion.div className="hero-card" whileHover={reduced ? undefined : { y: -6, rotate: 0 }} transition={{ duration: 0.35 }}>
              <div className="card-top"><span className="mono-label">GHOST FILES / WORKSPACE</span><span className="local"><i /> ON-DEVICE</span></div>
              <div className="hero-card-main"><div className="signal-ring"><span>GF</span></div><div><span className="mono-label">READY WHEN YOU ARE</span><strong>Start with a file.</strong><p>Drop it here, then choose the smallest useful operation.</p></div></div>
              <button className="dropzone" onClick={() => setActive("merge")}><span className="drop-icon">+</span><strong>Open Merge PDF</strong><span>Local processing · 50 MB per file</span><b>Launch tool ↗</b></button>
              <div className="card-bottom"><span>Session is held in browser memory</span><span className="mono-label">NO UPLOAD</span></div>
            </motion.div>
          </Reveal>
        </section>

        <section id="tools" className="section shell">
          <Reveal reduced={reduced}><div className="section-head"><div><div className="kicker"><span>01</span> The toolkit</div><h2>Small tools.<br /><em>Clear boundaries.</em></h2></div><label className="search-label">Find a tool<input type="search" placeholder="Search tools..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div></Reveal>
          <motion.div className="tool-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.08 }} variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.045 } } }}>
            {filteredTools.map((tool, index) => (
              <motion.button className="tool-card" key={tool.id} variants={reveal} whileHover={reduced ? undefined : { y: -6 }} whileTap={reduced ? undefined : { scale: 0.985 }} onClick={() => setActive(tool.id)}>
                <span className="tool-index">{String(index + 1).padStart(2, "0")}</span><span className="tool-icon" style={{ background: tool.tint }}>{tool.icon}</span><strong>{tool.name}</strong><span>{tool.description}</span><small>{tool.mode === "server" ? "Temporary server processing" : "Processed on your device"}<b>↗</b></small>
              </motion.button>
            ))}
          </motion.div>
          {!filteredTools.length && <div className="empty-state">No tools match “{query}”. Try a broader search.</div>}
        </section>

        <section id="privacy" className="section shell"><Reveal reduced={reduced}><div className="privacy-band"><div><div className="kicker lime"><span>02</span> A clearer promise</div><h2>Your file should never take a detour.</h2><p>Local tools keep your files in browser memory. Server tools ask for approval at the moment of transfer and clean up after they finish.</p></div><div className="privacy-list"><div><b><span>01</span> On your device</b><span>PDF, image, HTML, and text-based exports run locally.</span></div><div><b><span>02</span> Temporary by consent</b><span>Office rendering and password operations use the server only after approval.</span></div><div><b><span>03</span> Honest limits</b><span>Local processing reduces exposure; it cannot protect a compromised browser or device.</span></div></div></div></Reveal></section>

        <section id="workflow" className="section shell"><Reveal reduced={reduced}><div className="section-head"><div><div className="kicker"><span>03</span> Simple by design</div><h2>One session.<br /><em>Three decisions.</em></h2></div><p className="section-note">A visible path from input to result, with no mystery state in between.</p></div></Reveal><div className="steps">{[["Choose files", "Drop or browse. Check where the operation will happen."], ["Configure and process", "Adjust settings, preview, and run the operation."], ["Download your result", "Download individually or bundle successful results into a ZIP."]].map(([title, copy], index) => <Reveal key={title} delay={index * 0.06} reduced={reduced}><div className="step-card"><b>0{index + 1}</b><h3>{title}</h3><p>{copy}</p><span className="step-line" /></div></Reveal>)}</div></section>
      </main>

      <footer className="shell footer"><span className="brand"><span className="brand-mark">G</span>Ghost Files</span><div><div><a href="#tools">All tools</a><i>·</i><a href="#privacy">Privacy</a><i>·</i><a href="#workflow">How it works</a></div><p>50 MB local · 25 MB server · 300 PDF pages · 24 MP images</p></div></footer>

      <AnimatePresence mode="wait">{active && <Workspace key={active} tool={tools.find((tool) => tool.id === active)} onClose={() => setActive(null)} user={user} onRequireAuth={handleRequireAuth} />}</AnimatePresence>
      <AuthModal isOpen={authModalOpen} initialMode={authMode} customMessage={authCustomMessage} onClose={() => { setAuthModalOpen(false); setAuthCustomMessage(""); }} onAuthSuccess={handleAuthSuccess} />
    </div>
  );
}
