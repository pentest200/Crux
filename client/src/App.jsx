import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import { tools } from "./lib/catalog.js";
import Workspace from "./components/Workspace.jsx";
import AuthModal from "./components/AuthModal.jsx";
import AuthPage from "./components/AuthPage.jsx";
import { authRequest } from "./lib/auth.js";
import { followLink, navigate, useLocation } from "./lib/navigation.js";

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
  const location = useLocation();
  const pathname = location.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const activeTool = tools.find(tool => tool.path === pathname);
  const isHome = pathname === "/";
  const isLogin = pathname === "/login";
  const isRegister = pathname === "/register" || pathname === "/signup";
  const isAuthPage = isLogin || isRegister;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });
  const [accountsEnabled, setAccountsEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [accountError, setAccountError] = useState("");
  const pendingDownload = useRef(null);
  const checkingDownload = useRef(false);
  useEffect(() => {
    pendingDownload.current = null;
    setAuthMode(null);
  }, [pathname]);
  useEffect(() => {
    document.title = activeTool
      ? `${activeTool.name} | Ghost Files`
      : isLogin
      ? "Log in | Ghost Files"
      : isRegister
      ? "Create account | Ghost Files"
      : isHome
      ? "Ghost Files — Private file tools"
      : "Page not found | Ghost Files";
    setMenu(false);
    const hash = location.includes("#") ? location.slice(location.indexOf("#") + 1) : "";
    const frame = requestAnimationFrame(() => {
      if (hash) document.getElementById(hash)?.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [location, activeTool, isHome, isLogin, isRegister]);

  useEffect(() => {
    // Retire profiles and placeholder tokens created by the former demo login.
    try {
      localStorage.removeItem("ghost-files-auth-user");
      localStorage.removeItem("ghost-files-auth-token");
    } catch {
      // File tools also work when browser storage is unavailable.
    }
  }, []);

  const filteredTools = tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    let stopped = false;
    let timer = null;
    let attempts = 0;

    async function syncAuth() {
      try {
        const status = await authRequest("status");
        if (stopped) return;
        const isEnabled = status?.enabled === true;
        setAccountsEnabled(isEnabled);
        if (isEnabled) {
          const data = await authRequest("me").catch(() => null);
          if (!stopped) setUser(data?.user || null);
        }
      } catch {
        // If backend is waking up, poll every 3 seconds up to 10 times to auto-reconnect
        if (!stopped && attempts < 10) {
          attempts++;
          timer = setTimeout(syncAuth, 3000);
        }
      }
    }

    syncAuth();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  async function logout() {
    setAccountError("");
    try { await authRequest("logout", {}); setUser(null); }
    catch (error) { setAccountError(error.message); }
  }
  async function authorizeDownload(action) {
    if (checkingDownload.current) return;
    checkingDownload.current = true;
    setAccountError("");
    try {
      await authRequest("download", {});
      await action();
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        pendingDownload.current = { pathname, action };
        setAuthMode("login");
      } else {
        setAccountError(error.message);
      }
    } finally {
      checkingDownload.current = false;
    }
  }
  function authenticated(user) {
    setUser(user);
    setAuthMode(null);
    const pending = pendingDownload.current;
    pendingDownload.current = null;
    if (pending?.pathname === pathname) {
      void authorizeDownload(pending.action);
    } else if (isAuthPage) {
      navigate("/");
    }
  }

  return (
    <div className="app">
      <div className="ambient ambient-lime" aria-hidden="true" />
      <div className="ambient ambient-amber" aria-hidden="true" />
      <motion.div className="scroll-progress" style={{ scaleX: progress }} aria-hidden="true" />

      <header className="nav shell">
        <a className="brand" href="/" onClick={followLink}>
          <span className="brand-mark">G</span>
          <span>Ghost Files</span>
          <span className="brand-version">/ 01</span>
        </a>
        <nav className={menu ? "menu-open" : ""} aria-label="Primary navigation">
          <a href="/#tools" onClick={followLink}>Tools <span>01</span></a>
          <a href="/#privacy" onClick={followLink}>Privacy <span>02</span></a>
          <a href="/#workflow" onClick={followLink}>Workflow <span>03</span></a>
        </nav>
        <div className="nav-buttons">
          <span className="mono-label">Log in to download</span>
          {user ? <>
            <span>{user.name}</span>
            <button type="button" className="auth-nav-btn" onClick={logout}>Log out</button>
          </> : <>
            <a href="/login" className="auth-nav-btn" onClick={followLink}>Log in</a>
            <a href="/register" className="auth-nav-btn auth-nav-signup" onClick={followLink}>Create account</a>
          </>}
          <button className="icon-button mobile-toggle" aria-label="Toggle navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button>
        </div>
      </header>

      <main>
        {accountError && <p className="shell" role="alert">{accountError}</p>}
        {isHome ? <>
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
              <a className="dropzone" href="/tools/merge-pdf" onClick={followLink}><span className="drop-icon">+</span><strong>Open Merge PDF</strong><span>Local processing · 50 MB per file</span><b>Launch tool ↗</b></a>
              <div className="card-bottom"><span>Session is held in browser memory</span><span className="mono-label">NO UPLOAD</span></div>
            </motion.div>
          </Reveal>
        </section>

        <section id="tools" className="section shell">
          <Reveal reduced={reduced}><div className="section-head"><div><div className="kicker"><span>01</span> The toolkit</div><h2>Small tools.<br /><em>Clear boundaries.</em></h2></div><label className="search-label">Find a tool<input type="search" placeholder="Search tools..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div></Reveal>
          <motion.div className="tool-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.08 }} variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.045 } } }}>
            {filteredTools.map((tool, index) => (
              <motion.a className="tool-card" href={tool.path} onClick={followLink} key={tool.id} variants={reveal} whileHover={reduced ? undefined : { y: -6 }} whileTap={reduced ? undefined : { scale: 0.985 }}>
                <span className="tool-index">{String(index + 1).padStart(2, "0")}</span><span className="tool-icon" style={{ background: tool.tint }}>{tool.icon}</span><strong>{tool.name}</strong><span>{tool.description}</span><small>{tool.mode === "server" ? "Temporary server processing" : "Processed on your device"}<b>↗</b></small>
              </motion.a>
            ))}
          </motion.div>
          {!filteredTools.length && <div className="empty-state">No tools match “{query}”. Try a broader search.</div>}
        </section>

        <section id="privacy" className="section shell"><Reveal reduced={reduced}><div className="privacy-band"><div><div className="kicker lime"><span>02</span> A clearer promise</div><h2>Your file should never take a detour.</h2><p>Local tools keep your files in browser memory. Server tools ask for approval at the moment of transfer and clean up after they finish.</p></div><div className="privacy-list"><div><b><span>01</span> On your device</b><span>PDF, image, HTML, and text-based exports run locally.</span></div><div><b><span>02</span> Temporary by consent</b><span>Office rendering and password operations use the server only after approval.</span></div><div><b><span>03</span> Honest limits</b><span>Local processing reduces exposure; it cannot protect a compromised browser or device.</span></div></div></div></Reveal></section>

        <section id="workflow" className="section shell"><Reveal reduced={reduced}><div className="section-head"><div><div className="kicker"><span>03</span> Simple by design</div><h2>One session.<br /><em>Three decisions.</em></h2></div><p className="section-note">A visible path from input to result, with no mystery state in between.</p></div></Reveal><div className="steps">{[["Choose files", "Drop or browse. Check where the operation will happen."], ["Configure and process", "Adjust settings, preview, and run the operation."], ["Download your result", "Download individually or bundle successful results into a ZIP."]].map(([title, copy], index) => <Reveal key={title} delay={index * 0.06} reduced={reduced}><div className="step-card"><b>0{index + 1}</b><h3>{title}</h3><p>{copy}</p><span className="step-line" /></div></Reveal>)}</div></section>
        </> : isAuthPage ? (
          <AuthPage
            key={isLogin ? "login" : "signup"}
            mode={isLogin ? "login" : "signup"}
            available={accountsEnabled}
            user={user}
            onAuthSuccess={authenticated}
            onLogout={logout}
          />
        ) : activeTool ? (
          <Workspace key={activeTool.id} tool={activeTool} onClose={() => navigate("/#tools")} presentation="page" onAuthorizeDownload={authorizeDownload} />
        ) : (
          <section className="section shell"><h1>Page not found</h1><p>Choose a tool from the toolkit.</p><a className="button primary" href="/#tools" onClick={followLink}>Back to tools</a></section>
        )}
      </main>

      <footer className="shell footer"><span className="brand"><span className="brand-mark">G</span>Ghost Files</span><div><div><a href="/#tools" onClick={followLink}>All tools</a><i>·</i><a href="/#privacy" onClick={followLink}>Privacy</a><i>·</i><a href="/#workflow" onClick={followLink}>How it works</a></div><p>50 MB local · 25 MB server · 300 PDF pages · 24 MP images</p></div></footer>

      {authMode && <AuthModal initialMode={authMode} available={accountsEnabled} downloadRequired={!!pendingDownload.current} onClose={() => { pendingDownload.current = null; setAuthMode(null); }} onAuthSuccess={authenticated} />}
    </div>
  );
}
