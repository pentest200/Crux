import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * SpaceBackground — full-viewport canvas layer that renders:
 *   • a dense star field with twinkling
 *   • two spiral galaxies built from coloured particles
 *
 * On mouse move / hover the galaxy curves warp and the orientation
 * shifts, giving the "interactive galaxy" feel from the reference image.
 *
 * The component is positioned `fixed` behind all content so it fills
 * every page section while the user scrolls.
 */

/* ---------- helpers ---------- */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/** HSL → hex so we can stuff it into fillStyle once. */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ---------- star factory ---------- */
function createStars(count, w, h) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(0, w),
      y: rand(0, h),
      r: rand(0.3, 1.8),
      baseAlpha: rand(0.25, 0.9),
      twinkleSpeed: rand(0.3, 1.5),
      twinkleOffset: rand(0, Math.PI * 2),
      // subtle colour tint
      color: hslToHex(rand(180, 260), rand(10, 45), rand(70, 95)),
    });
  }
  return stars;
}

/* ---------- galaxy particle factory ---------- */
function createGalaxyParticles(cx, cy, armCount, particlesPerArm, spread, palette) {
  const particles = [];
  for (let arm = 0; arm < armCount; arm++) {
    const armAngle = (arm / armCount) * Math.PI * 2;
    for (let i = 0; i < particlesPerArm; i++) {
      const t = i / particlesPerArm; // 0‑1 along arm
      const dist = t * spread;
      const curvature = t * 2.8; // how much the arm spirals
      const angle = armAngle + curvature;
      // scatter perpendicular to arm
      const scatter = rand(-spread * 0.12, spread * 0.12) * (1 - t * 0.4);
      const x = cx + Math.cos(angle) * dist + Math.cos(angle + Math.PI / 2) * scatter;
      const y = cy + Math.sin(angle) * dist + Math.sin(angle + Math.PI / 2) * scatter;
      const col = palette[Math.floor(rand(0, palette.length))];
      particles.push({
        baseX: x - cx,
        baseY: y - cy,
        cx,
        cy,
        r: rand(0.4, 1.6) * (1 - t * 0.35),
        color: col,
        alpha: rand(0.35, 0.95) * (1 - t * 0.3),
        dist,
        armAngle: angle,
      });
    }
  }
  // central glow particles
  for (let i = 0; i < 350; i++) {
    const angle = rand(0, Math.PI * 2);
    const d = rand(0, spread * 0.18);
    particles.push({
      baseX: Math.cos(angle) * d,
      baseY: Math.sin(angle) * d,
      cx,
      cy,
      r: rand(0.3, 1.3),
      color: palette[0],
      alpha: rand(0.5, 1),
      dist: d,
      armAngle: angle,
    });
  }
  return particles;
}

/* ---------- component ---------- */
export default function SpaceBackground() {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const galaxy1Ref = useRef([]);
  const galaxy2Ref = useRef([]);
  const animRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  // mouse position as motion values for smooth interpolation
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 20 });

  // hover state for "nearby galaxy" detection
  const [hoverGalaxy, setHoverGalaxy] = useState(null);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    sizeRef.current = { w, h, dpr };

    starsRef.current = createStars(Math.min(600, Math.floor(w * h / 2800)), w, h);

    // Galaxy 1 — teal/cyan, upper‑right area
    const g1x = w * 0.62;
    const g1y = h * 0.38;
    const g1spread = Math.min(w, h) * 0.38;
    galaxy1Ref.current = createGalaxyParticles(
      g1x, g1y, 3, 420, g1spread,
      ["#1de9d5", "#0ec4b6", "#13b8a8", "#78f0e2", "#aaf8ef", "#ffffff"]
    );

    // Galaxy 2 — warm amber/orange, lower‑left area
    const g2x = w * 0.40;
    const g2y = h * 0.55;
    const g2spread = Math.min(w, h) * 0.30;
    galaxy2Ref.current = createGalaxyParticles(
      g2x, g2y, 2, 360, g2spread,
      ["#ff9f43", "#f0932b", "#ffbe76", "#ffeaa7", "#ffffff", "#ffccbc"]
    );
  }, []);

  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // deep space gradient background
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    grad.addColorStop(0, "#0c1525");
    grad.addColorStop(0.35, "#080e1a");
    grad.addColorStop(1, "#020408");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const t = time / 1000;
    const mx = smoothX.get();
    const my = smoothY.get();

    // --- stars ---
    for (const s of starsRef.current) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
      const a = s.baseAlpha * (0.4 + 0.6 * twinkle);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- galaxies ---
    const drawGalaxy = (particles, rotationBase, hovered) => {
      // Mouse influences rotation angle & tilt
      const mouseRotation = (mx - 0.5) * 0.6 + (my - 0.5) * 0.3;
      const rotation = rotationBase + t * 0.04 + mouseRotation;
      // Tilt (perspective squeeze) based on mouse Y
      const tilt = 0.45 + (my - 0.5) * 0.35;
      // Hover boost
      const hoverScale = hovered ? 1.12 : 1;

      for (const p of particles) {
        // rotate the particle's base position
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);
        let rx = p.baseX * cosR - p.baseY * sinR;
        let ry = p.baseX * sinR + p.baseY * cosR;
        // apply tilt (flatten Y axis)
        ry *= tilt;
        // scale
        rx *= hoverScale;
        ry *= hoverScale;

        const px = p.cx + rx;
        const py = p.cy + ry;

        ctx.globalAlpha = p.alpha * (hovered ? 1 : 0.85);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.r * (hovered ? 1.15 : 1), 0, Math.PI * 2);
        ctx.fill();
      }

      // central glow
      if (particles.length > 0) {
        const cx = particles[0].cx;
        const cy = particles[0].cy;
        const glowR = 60 * (hovered ? 1.5 : 1);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glow.addColorStop(0, hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawGalaxy(galaxy1Ref.current, 0, hoverGalaxy === 1);
    drawGalaxy(galaxy2Ref.current, Math.PI * 0.7, hoverGalaxy === 2);

    // --- nebula glow overlays ---
    ctx.globalAlpha = 0.07;
    const neb1 = ctx.createRadialGradient(w * 0.6, h * 0.35, 0, w * 0.6, h * 0.35, w * 0.35);
    neb1.addColorStop(0, "#1de9d5");
    neb1.addColorStop(1, "transparent");
    ctx.fillStyle = neb1;
    ctx.fillRect(0, 0, w, h);

    const neb2 = ctx.createRadialGradient(w * 0.35, h * 0.55, 0, w * 0.35, h * 0.55, w * 0.28);
    neb2.addColorStop(0, "#ff9f43");
    neb2.addColorStop(1, "transparent");
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 1;
    animRef.current = requestAnimationFrame(draw);
  }, [smoothX, smoothY, hoverGalaxy]);

  useEffect(() => {
    init();
    animRef.current = requestAnimationFrame(draw);
    const onResize = () => {
      init();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [init, draw]);

  const handleMouseMove = useCallback(
    (e) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      mouseX.set(nx);
      mouseY.set(ny);

      // Detect which galaxy is near the cursor
      const { w, h } = sizeRef.current;
      const g1cx = w * 0.62,
        g1cy = h * 0.38;
      const g2cx = w * 0.40,
        g2cy = h * 0.55;
      const d1 = Math.hypot(e.clientX - g1cx, e.clientY - g1cy);
      const d2 = Math.hypot(e.clientX - g2cx, e.clientY - g2cy);
      const threshold = Math.min(w, h) * 0.22;
      if (d1 < threshold) setHoverGalaxy(1);
      else if (d2 < threshold) setHoverGalaxy(2);
      else setHoverGalaxy(null);
    },
    [mouseX, mouseY]
  );

  return (
    <>
      <canvas
        ref={canvasRef}
        className="space-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverGalaxy(null)}
      />
      {/* Decorative motion overlays — glow orbs that follow mouse subtly */}
      <motion.div
        className="space-glow space-glow--teal"
        style={{
          x: useTransform(smoothX, [0, 1], [-80, 80]),
          y: useTransform(smoothY, [0, 1], [-60, 60]),
        }}
      />
      <motion.div
        className="space-glow space-glow--amber"
        style={{
          x: useTransform(smoothX, [0, 1], [60, -60]),
          y: useTransform(smoothY, [0, 1], [40, -40]),
        }}
      />
    </>
  );
}
