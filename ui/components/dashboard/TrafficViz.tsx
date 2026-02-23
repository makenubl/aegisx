"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Lock, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

type Packet = {
  id:      number;
  x:       number;
  y:       number;
  vy:      number;          // vertical velocity when dropping
  speed:   number;          // px/ms horizontal
  blocked: boolean;
  state:   "flying" | "dropping" | "done";
  opacity: number;
  size:    number;
  trail:   Array<{ x: number; y: number }>;
};

type Ripple = {
  x: number; y: number;
  born: number; life: number;
};

// ─── Constants ────────────────────────────────────────────────────────────

const BLOCK_RATE  = 0.057;  // ~5.7 % of packets get blocked
const SPAWN_GAP   = 75;     // ms between packet spawns
const LANES       = 5;      // vertical spread
const LANE_SPREAD = 10;     // px between lanes

// ─── Component ───────────────────────────────────────────────────────────

export function TrafficViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  const sim = useRef({
    packets:   [] as Packet[],
    ripples:   [] as Ripple[],
    idCtr:     0,
    lastSpawn: 0,
    allowed:   1_284_932,
    blocked:   48_201,
    statsTick: 0,
    fwPulse:   0,   // 0-1, boosted on each block hit
  });

  const [stats, setStats] = useState({
    allowed: 1_284_932,
    blocked: 48_201,
    rate:    892,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Layout helpers
    const W    = () => canvas.offsetWidth;
    const H    = () => canvas.offsetHeight;
    const SRC  = () => ({ x: 72,         y: H() * 0.45 });
    const FW   = () => ({ x: W() * 0.50, y: H() * 0.45 });
    const DST  = () => ({ x: W() - 72,   y: H() * 0.45 });

    // ── Draw helpers ──────────────────────────────────────────────────────

    const drawDotGrid = () => {
      const w = W(), h = H();
      ctx.fillStyle = "rgba(14, 165, 233, 0.055)";
      for (let gx = 0; gx < w; gx += 26) {
        for (let gy = 0; gy < h; gy += 26) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawPipe = (x1: number, y: number, x2: number) => {
      ctx.strokeStyle = "rgba(14, 165, 233, 0.10)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawNode = (
      x: number, y: number, r: number,
      rgb: string,  // e.g. "14, 165, 233"
      label: string,
      extra = 0     // extra glow intensity 0-1
    ) => {
      // Glow halo
      const gr = r + 18 + extra * 10;
      const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, gr);
      grd.addColorStop(0, `rgba(${rgb}, ${0.22 + extra * 0.18})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, gr, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = `rgba(${rgb}, ${0.8 + extra * 0.2})`;
      ctx.lineWidth   = 1.5;
      ctx.fillStyle   = "rgba(9, 14, 26, 0.85)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle  = "rgba(148, 163, 184, 0.55)";
      ctx.font       = "bold 8px monospace";
      ctx.textAlign  = "center";
      ctx.fillText(label, x, y + r + 13);
    };

    const drawRipples = (ts: number) => {
      const s = sim.current;
      for (const rip of s.ripples) {
        const age  = ts - rip.born;
        const prog = age / rip.life;
        if (prog >= 1) continue;
        const r   = 14 + prog * 32;
        const al  = (1 - prog) * 0.75;
        ctx.strokeStyle = `rgba(239, 68, 68, ${al})`;
        ctx.lineWidth   = 2 * (1 - prog);
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      s.ripples = s.ripples.filter(r => ts - r.born < r.life);
    };

    // ── Main loop ─────────────────────────────────────────────────────────

    let prev = 0;

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = Math.min(ts - prev, 50);
      prev = ts;

      const w = W(), h = H();
      const src = SRC(), fw = FW(), dst = DST();

      ctx.clearRect(0, 0, w, h);
      drawDotGrid();

      // Pipes
      drawPipe(src.x + 14, src.y, fw.x - 20);
      drawPipe(fw.x + 20,  fw.y,  dst.x - 14);

      // Drop zone label
      ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText("▼ DROP", fw.x, h - 8);

      const s = sim.current;

      // Firewall pulse decays
      s.fwPulse = Math.max(0, s.fwPulse - 0.002 * dt);
      const fwPing = s.fwPulse + Math.sin(ts / 900) * 0.25 + 0.25;

      // Nodes
      drawNode(src.x, src.y, 12, "99, 102, 241", "INTERNET",  0);
      drawNode(fw.x,  fw.y,  16, s.fwPulse > 0.3 ? "239, 68, 68" : "14, 165, 233", "FIREWALL", Math.max(0, Math.min(1, fwPing)));
      drawNode(dst.x, dst.y, 12, "16, 185, 129",  "INTERNAL",  0);

      // Ripples
      drawRipples(ts);

      // Spawn
      if (ts - s.lastSpawn > SPAWN_GAP) {
        s.lastSpawn = ts;
        const lane    = Math.floor(Math.random() * LANES);
        const laneOff = (lane - (LANES - 1) / 2) * LANE_SPREAD;
        const isBlock = Math.random() < BLOCK_RATE;
        s.packets.push({
          id:      s.idCtr++,
          x:       src.x + 14,
          y:       src.y + laneOff,
          vy:      0,
          speed:   w * (0.00048 + Math.random() * 0.00028),
          blocked: isBlock,
          state:   "flying",
          opacity: 0.85 + Math.random() * 0.15,
          size:    1.6 + Math.random() * 1.2,
          trail:   [],
        });
      }

      // Update + render packets
      const alive: Packet[] = [];

      for (const p of s.packets) {
        // Physics
        if (p.state === "flying") {
          p.x += p.speed * dt;
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 12) p.trail.shift();

          if (p.blocked && p.x >= fw.x - 6) {
            p.state   = "dropping";
            p.x       = fw.x - 4;
            p.vy      = 0.15;
            s.ripples.push({ x: fw.x, y: p.y, born: ts, life: 480 });
            s.fwPulse = 1;
            s.blocked++;
          } else if (!p.blocked && p.x >= dst.x - 14) {
            p.state   = "done";
            p.opacity = 0.7;
            s.allowed++;
          }
        } else if (p.state === "dropping") {
          p.vy      += 0.01 * dt;
          p.y       += p.vy;
          p.x       += p.speed * 0.25 * dt;
          p.opacity -= 0.007 * dt;
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 7) p.trail.shift();
        } else {
          p.opacity -= 0.012 * dt;
        }

        if (p.opacity <= 0 || p.y > h + 20) continue;

        // Trail
        for (let i = 1; i < p.trail.length; i++) {
          const a = (i / p.trail.length) * 0.5 * p.opacity;
          ctx.strokeStyle = p.blocked
            ? `rgba(239, 68, 68, ${a})`
            : `rgba(56, 189, 248, ${a})`;
          ctx.lineWidth = p.size * 0.9;
          ctx.lineCap   = "round";
          ctx.beginPath();
          ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
          ctx.lineTo(p.trail[i].x,     p.trail[i].y);
          ctx.stroke();
        }

        // Particle glow
        const pr  = p.size * 2.8;
        const col = p.blocked ? "239, 68, 68" : "56, 189, 248";
        const pg  = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr);
        pg.addColorStop(0, `rgba(${col}, ${p.opacity})`);
        pg.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.fill();

        alive.push(p);
      }

      s.packets = alive;

      // Stats tick
      s.statsTick += dt;
      if (s.statsTick > 700) {
        s.statsTick = 0;
        const rate = Math.round(720 + Math.sin(ts / 5500) * 200 + Math.random() * 90);
        setStats({ allowed: s.allowed, blocked: s.blocked, rate });
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const blockPct = ((stats.blocked / (stats.allowed + stats.blocked)) * 100).toFixed(1);

  return (
    <div className="card overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
          <span className="text-xs font-semibold text-slate-200">Live Network Traffic</span>
          <span className="badge badge-green text-[10px] py-0">REAL-TIME</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-slate-600">block rate</span>
          <span className="text-amber-400">{blockPct}%</span>
          <span className="text-slate-800">|</span>
          <span className="text-sky-400">{stats.rate.toLocaleString()}</span>
          <span className="text-slate-600">pkt/s</span>
        </div>
      </div>

      {/* Canvas — the animated visualization */}
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height: 140 }}
      />

      {/* Footer stats */}
      <div className="grid grid-cols-3 border-t border-slate-800 divide-x divide-slate-800">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Allowed</p>
            <p className="text-sm font-bold font-mono tabular-nums text-sky-400">
              {stats.allowed.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Lock className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Blocked</p>
            <p className="text-sm font-bold font-mono tabular-nums text-red-400">
              {stats.blocked.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Packets/s</p>
            <p className="text-sm font-bold font-mono tabular-nums text-emerald-400">
              {stats.rate.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
