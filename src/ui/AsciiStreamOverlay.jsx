import { useEffect, useMemo, useRef, useState } from "react";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)")?.matches
  );
}

export default function AsciiStreamOverlay() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const [enabled, setEnabled] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, has: false });

  // Tune these for density/feel
  const config = useMemo(
    () => ({
      cell: 18, // px per tile
      fontSize: 16,
      chars: ["/", "|", "\\"],
      // motion feel
      flowStrength: 2.2,
      damping: 0.92,
      // visual
      alpha: 0.55,
      fade: 0.08, // trailing smear (lower = more trails)
    }),
    []
  );

  useEffect(() => {
    // Desktop-only: disable on touch / small screens
    const update = () => {
      const small = window.matchMedia("(max-width: 900px)").matches;
      setEnabled(!small && !isTouchDevice());
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });

    let dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.floor(rect.width);
      h = Math.floor(rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${config.fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    };

    resize();

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const p = pointerRef.current;
      if (p.has) {
        const dx = x - p.x;
        const dy = y - p.y;
        p.vx = p.vx * 0.6 + dx * 0.4;
        p.vy = p.vy * 0.6 + dy * 0.4;
      }
      p.x = x;
      p.y = y;
      p.has = true;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", resize);

    // Seed field
    const cols = () => Math.ceil(w / config.cell);
    const rows = () => Math.ceil(h / config.cell);
    let field = [];
    const reseed = () => {
      field = new Array(cols() * rows()).fill(0).map(() => Math.random() * Math.PI * 2);
    };
    reseed();

    const tick = () => {
      // Fade (trail)
      ctx.fillStyle = `rgba(0, 18, 36, ${config.fade})`;
      ctx.fillRect(0, 0, w, h);

      const p = pointerRef.current;
      const c = cols();
      const r = rows();

      // If resized, reseed field
      if (field.length !== c * r) reseed();

      // Motion influence
      const px = p.has ? p.x : w * 0.5;
      const py = p.has ? p.y : h * 0.35;

      // For a nice “current”: angle nudges toward a swirl around pointer
      for (let j = 0; j < r; j++) {
        for (let i = 0; i < c; i++) {
          const idx = j * c + i;
          const cx = i * config.cell + config.cell * 0.5;
          const cy = j * config.cell + config.cell * 0.5;

          const dx = cx - px;
          const dy = cy - py;
          const dist = Math.max(30, Math.hypot(dx, dy));
          const swirl = Math.atan2(dy, dx) + Math.PI / 2; // tangential

          // Pointer velocity adds directionality
          const vAng = Math.atan2(p.vy, p.vx || 0.00001);
          const vMag = Math.min(60, Math.hypot(p.vx, p.vy));

          // Blend swirl with velocity direction, stronger when close
          const influence = (config.flowStrength * vMag) / dist;

          // Smoothly steer current angle toward target
          const target = swirl * 0.8 + vAng * 0.2;
          let a = field[idx];

          // shortest-angle lerp
          let diff = ((target - a + Math.PI) % (Math.PI * 2)) - Math.PI;
          a += diff * Math.min(0.35, influence);
          a += 0.003; // slow drift so it “breathes”

          field[idx] = a;
        }
      }

      // Draw characters
      ctx.fillStyle = `rgba(168, 235, 255, ${config.alpha})`;

      for (let j = 0; j < r; j++) {
        for (let i = 0; i < c; i++) {
          const idx = j * c + i;
          const a = field[idx];

          // Map angle to one of / | \ (3-way quantization)
          // -45..45 => |, else / or \ depending on sign-ish
          const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let ch = "|";
          if (norm > Math.PI / 6 && norm < (5 * Math.PI) / 6) ch = "\\";
          else if (norm > (7 * Math.PI) / 6 && norm < (11 * Math.PI) / 6) ch = "/";

          const x = i * config.cell + config.cell * 0.5;
          const y = j * config.cell + config.cell * 0.5;

          ctx.fillText(ch, x, y);
        }
      }

      // Dampen pointer velocity
      pointerRef.current.vx *= config.damping;
      pointerRef.current.vy *= config.damping;

      rafRef.current = requestAnimationFrame(tick);
    };

    // Clear once with transparent background
    ctx.clearRect(0, 0, w, h);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, config]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        mixBlendMode: "overlay",
      }}
    />
  );
}
