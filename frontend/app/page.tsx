"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStatus = "Running" | "Paused" | "Failed" | "Degraded" | "Warning";

interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  type: string;
  model: string;
  provider: string;
  last_run: string;
  success_rate: number;
  calls_today: number;
  avg_latency_ms: number;
  error_rate: number;
  daily_cost_usd: number;
  trend: "up" | "down" | "flat";
}

interface Metrics {
  active_sessions: number;
  total_students_online: number;
  overall_success_rate: number;
  avg_system_latency_ms: number;
  error_rate_percent: number;
  daily_inference_calls: number;
  gpu_utilization_percent: number;
  cache_hit_ratio: number;
  uptime_percent: number;
  estimated_daily_savings_usd: number;
  students_helped_today: number;
  // legacy aliases
  success_rate: number;
  avg_latency_ms: number;
  error_count: number;
}

interface Alert {
  id: string;
  severity: "Critical" | "Warning" | "Info";
  title: string;
  message: string;
  timestamp: string;
  workflow_id: string | null;
}

interface LogEntry {
  id: string;
  message: string;
  ts: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
}

interface SparkPoint {
  t: number;
  v: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_LOGS = 120;
const MAX_SPARK = 24;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLevel(msg: string): LogEntry["level"] {
  if (msg.includes("[ERROR]")) return "ERROR";
  if (msg.includes("[WARN]")) return "WARN";
  if (msg.includes("[DEBUG]")) return "DEBUG";
  return "INFO";
}

function relativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatNumber(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const cfg: Record<WorkflowStatus, { dot: string; text: string; bg: string }> =
    {
      Running: {
        dot: "bg-[var(--green)] status-pulse",
        text: "text-[var(--green)]",
        bg: "bg-[var(--green)]/10 border-[var(--green)]/25",
      },
      Paused: {
        dot: "bg-[var(--amber)]",
        text: "text-[var(--amber)]",
        bg: "bg-[var(--amber)]/10 border-[var(--amber)]/25",
      },
      Failed: {
        dot: "bg-[var(--red)] status-pulse",
        text: "text-[var(--red)]",
        bg: "bg-[var(--red)]/10 border-[var(--red)]/25",
      },
      Degraded: {
        dot: "bg-[var(--red)] status-pulse",
        text: "text-[var(--red)]",
        bg: "bg-[var(--red)]/10 border-[var(--red)]/25",
      },
      Warning: {
        dot: "bg-[var(--amber)] status-pulse",
        text: "text-[var(--amber)]",
        bg: "bg-[var(--amber)]/10 border-[var(--amber)]/25",
      },
    };
  const c = cfg[status] ?? cfg.Failed;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        c.bg,
        c.text,
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", c.dot)} />
      {status}
    </span>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const severityStyle = (s: Alert["severity"]) =>
    ({
      Critical: {
        bar: "border-[var(--red)]/40 bg-[var(--red)]/8",
        icon: "text-[var(--red)]",
        badge: "bg-[var(--red)]/15 text-[var(--red)]",
      },
      Warning: {
        bar: "border-[var(--amber)]/40 bg-[var(--amber)]/8",
        icon: "text-[var(--amber)]",
        badge: "bg-[var(--amber)]/15 text-[var(--amber)]",
      },
      Info: {
        bar: "border-[var(--cyan)]/30 bg-[var(--cyan)]/6",
        icon: "text-[var(--cyan)]",
        badge: "bg-[var(--cyan)]/15 text-[var(--cyan)]",
      },
    })[s];

  return (
    <div className="space-y-2">
      {visible.map((alert) => {
        const s = severityStyle(alert.severity);
        return (
          <div
            key={alert.id}
            className={clsx(
              "flex items-start gap-3 px-4 py-3 rounded-lg border text-xs",
              s.bar,
            )}
          >
            <span className={clsx("mt-0.5 flex-shrink-0 font-bold", s.icon)}>
              {alert.severity === "Critical"
                ? "⚠"
                : alert.severity === "Warning"
                  ? "●"
                  : "ℹ"}
            </span>
            <div className="flex-1 min-w-0">
              <span
                className={clsx(
                  "font-semibold mr-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide",
                  s.badge,
                )}
              >
                {alert.severity}
              </span>
              <span className="font-medium text-[var(--text-primary)]">
                {alert.title}
              </span>
              <span className="text-[var(--text-secondary)] ml-2">
                {alert.message}
              </span>
            </div>
            <button
              onClick={() => setDismissed((p) => new Set([...p, alert.id]))}
              className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-base leading-none"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accentColor: string;
  icon: React.ReactNode;
  spark: SparkPoint[];
  flash: boolean;
}

function KpiCard({
  label,
  value,
  sub,
  accentColor,
  icon,
  spark,
  flash,
}: KpiCardProps) {
  return (
    <div className="metric-card rounded-xl p-5 flex flex-col gap-3 overflow-hidden relative">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-secondary)]">
            {label}
          </span>
          <span
            className={clsx(
              "text-3xl font-semibold tabular-nums transition-colors duration-300",
              flash ? "text-[var(--cyan)]" : "text-[var(--text-primary)]",
            )}
          >
            {value}
          </span>
          {sub && (
            <span className="text-xs text-[var(--text-secondary)]">{sub}</span>
          )}
        </div>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${accentColor}18`, color: accentColor }}
        >
          {icon}
        </div>
      </div>
      {spark.length > 1 && (
        <div className="h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={spark}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`sg-${label.replace(/\s/g, "")}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={accentColor}
                    stopOpacity={0.25}
                  />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#sg-${label.replace(/\s/g, "")})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r"
        style={{ background: accentColor, opacity: 0.5 }}
      />
    </div>
  );
}

// ─── Trend Icon ───────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: Workflow["trend"] }) {
  if (trend === "up")
    return <span className="text-[var(--green)] text-xs font-mono">↑</span>;
  if (trend === "down")
    return <span className="text-[var(--red)] text-xs font-mono">↓</span>;
  return <span className="text-[var(--text-muted)] text-xs font-mono">→</span>;
}

// ─── Workflow Row ─────────────────────────────────────────────────────────────

interface WorkflowRowProps {
  wf: Workflow;
  onAction: (id: string, action: string) => void;
  loading: boolean;
}

function WorkflowRow({ wf, onAction, loading }: WorkflowRowProps) {
  const [rel, setRel] = useState(() => relativeTime(wf.last_run));
  useEffect(() => {
    setRel(relativeTime(wf.last_run));
    const t = setInterval(() => setRel(relativeTime(wf.last_run)), 10000);
    return () => clearInterval(t);
  }, [wf.last_run]);

  const rateColor =
    wf.success_rate >= 95
      ? "var(--green)"
      : wf.success_rate >= 85
        ? "var(--amber)"
        : "var(--red)";
  const latencyColor =
    wf.avg_latency_ms < 1500
      ? "var(--green)"
      : wf.avg_latency_ms < 4000
        ? "var(--amber)"
        : "var(--red)";

  const actions =
    wf.status === "Running"
      ? [{ label: "Pause", action: "pause" }]
      : wf.status === "Paused"
        ? [{ label: "Resume", action: "resume" }]
        : wf.status === "Failed" || wf.status === "Degraded"
          ? [{ label: "Retry", action: "retry" }]
          : wf.status === "Warning"
            ? [
                { label: "Pause", action: "pause" },
                { label: "Retry", action: "retry" },
              ]
            : [];

  const providerColor: Record<string, string> = {
    OpenAI: "#10a37f",
    Anthropic: "#d4a27f",
    Google: "#4285f4",
    Custom: "#a371f7",
  };
  const pc = providerColor[wf.provider] ?? "#7d8590";

  return (
    <tr className="workflow-row border-b border-[var(--border)] transition-colors duration-150">
      {/* Name + ID */}
      <td className="px-4 py-3.5 min-w-[200px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {wf.name}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {wf.id}
          </span>
        </div>
      </td>
      {/* Model + Provider */}
      <td className="px-4 py-3.5 min-w-[160px]">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-[var(--text-primary)]">
            {wf.model}
          </span>
          <span className="text-[10px] font-medium" style={{ color: pc }}>
            {wf.provider}
          </span>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-[var(--text-secondary)] border border-white/8 font-mono whitespace-nowrap">
          {wf.type}
        </span>
      </td>
      {/* Status */}
      <td className="px-4 py-3.5">
        <StatusBadge status={wf.status} />
      </td>
      {/* Success Rate */}
      <td className="px-4 py-3.5 min-w-[120px]">
        <div className="flex items-center gap-2">
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden w-16 flex-shrink-0">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${wf.success_rate}%`, background: rateColor }}
            />
          </div>
          <span className="text-xs tabular-nums" style={{ color: rateColor }}>
            {wf.success_rate.toFixed(1)}%
          </span>
          <TrendIcon trend={wf.trend} />
        </div>
      </td>
      {/* Latency */}
      <td className="px-4 py-3.5 hidden md:table-cell">
        <span
          className="text-xs tabular-nums font-mono"
          style={{ color: latencyColor }}
        >
          {formatLatency(wf.avg_latency_ms)}
        </span>
      </td>
      {/* Calls */}
      <td className="px-4 py-3.5 hidden md:table-cell">
        <span className="text-xs tabular-nums text-[var(--text-secondary)]">
          {formatNumber(wf.calls_today)}
        </span>
      </td>
      {/* Cost */}
      <td className="px-4 py-3.5 hidden xl:table-cell">
        <span className="text-xs tabular-nums text-[var(--text-secondary)] font-mono">
          ${wf.daily_cost_usd.toFixed(2)}
        </span>
      </td>
      {/* Last run */}
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <span className="text-xs text-[var(--text-muted)]">{rel}</span>
      </td>
      {/* Actions */}
      <td className="px-4 py-3.5">
        <div className="flex gap-1.5">
          {actions.map(({ label, action }) => (
            <button
              key={action}
              disabled={loading}
              onClick={() => onAction(wf.id, action)}
              className={clsx(
                "px-3 py-1 text-xs rounded-md font-medium border transition-all duration-150",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                action === "pause" &&
                  "text-[var(--amber)] border-[var(--amber)]/30 bg-[var(--amber)]/8 hover:bg-[var(--amber)]/15",
                action === "resume" &&
                  "text-[var(--green)] border-[var(--green)]/30 bg-[var(--green)]/8 hover:bg-[var(--green)]/15",
                action === "retry" &&
                  "text-[var(--cyan)] border-[var(--cyan)]/30 bg-[var(--cyan)]/8 hover:bg-[var(--cyan)]/15",
              )}
            >
              {loading ? "…" : label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Log Terminal ─────────────────────────────────────────────────────────────

function LogTerminal({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (pinned && bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, pinned]);

  const onScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setPinned(scrollHeight - scrollTop - clientHeight < 32);
  };

  const levelColor = (l: LogEntry["level"]) =>
    ({
      INFO: "text-[var(--cyan)]",
      WARN: "text-[var(--amber)]",
      ERROR: "text-[var(--red)]",
      DEBUG: "text-[var(--text-muted)]",
    })[l];
  const msgColor = (l: LogEntry["level"]) =>
    ({
      INFO: "text-[#c9d1d9]",
      WARN: "text-[var(--amber)]/80",
      ERROR: "text-[var(--red)]/90",
      DEBUG: "text-[var(--text-muted)]",
    })[l];

  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-[#0a0e13] scanline-effect">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1117] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[var(--red)]/60" />
            <span className="w-3 h-3 rounded-full bg-[var(--amber)]/60" />
            <span className="w-3 h-3 rounded-full bg-[var(--green)]/60" />
          </div>
          <span className="text-xs font-mono text-[var(--text-muted)] ml-2">
            eduai-monitor — live log stream
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {logs.length} entries
          </span>
          {!pinned && (
            <button
              onClick={() => {
                setPinned(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-[10px] font-mono text-[var(--cyan)] hover:underline"
            >
              ↓ tail
            </button>
          )}
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--green)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] status-pulse" />
            LIVE
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="terminal-scroll font-mono text-xs leading-relaxed h-64 overflow-y-auto p-4 space-y-0.5"
      >
        {logs.map((entry) => (
          <div key={entry.id} className="log-entry flex gap-3">
            <span className="text-[var(--text-muted)] flex-shrink-0 select-none">
              {new Date(entry.ts).toLocaleTimeString("en-US", {
                hour12: false,
              })}
            </span>
            <span
              className={clsx("flex-shrink-0 w-12", levelColor(entry.level))}
            >
              {entry.level}
            </span>
            <span className={msgColor(entry.level)}>
              {entry.message.replace(/\[(INFO|WARN|ERROR|DEBUG)\]\s+/, "")}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Latency Chart ────────────────────────────────────────────────────────────

function LatencyMiniChart({ data }: { data: SparkPoint[] }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--purple)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: "#161b22",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 11,
          }}
          labelFormatter={() => ""}
          formatter={(v: number) => [`${formatLatency(v)}`, "Latency"]}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Resource Bar ─────────────────────────────────────────────────────────────

function ResourceBar({
  label,
  value,
  max = 100,
  unit = "%",
  color = "var(--cyan)",
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const barColor = pct > 85 ? "var(--red)" : pct > 65 ? "var(--amber)" : color;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono tabular-nums" style={{ color: barColor }}>
          {unit === "%" ? `${Math.round(value)}%` : `${value}${unit}`}
        </span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ connected }: { connected: boolean }) {
  const [isDark, setIsDark] = useState(true);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      document.documentElement.style.setProperty("--bg-0", "#080c10");
      document.documentElement.style.setProperty("--bg-1", "#0d1117");
      document.documentElement.style.setProperty("--bg-2", "#161b22");
      document.documentElement.style.setProperty("--bg-3", "#1c2128");
      document.documentElement.style.setProperty("--text-primary", "#e6edf3");
      document.documentElement.style.setProperty("--text-secondary", "#7d8590");
      document.documentElement.style.setProperty("--text-muted", "#484f58");
      document.documentElement.style.setProperty(
        "--border",
        "rgba(255,255,255,0.08)",
      );
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      document.documentElement.style.setProperty("--bg-0", "#f6f8fa");
      document.documentElement.style.setProperty("--bg-1", "#ffffff");
      document.documentElement.style.setProperty("--bg-2", "#f0f2f5");
      document.documentElement.style.setProperty("--bg-3", "#e8eaed");
      document.documentElement.style.setProperty("--text-primary", "#1c2128");
      document.documentElement.style.setProperty("--text-secondary", "#57606a");
      document.documentElement.style.setProperty("--text-muted", "#8c959f");
      document.documentElement.style.setProperty("--border", "rgba(0,0,0,0.1)");
    }
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-14 bg-[var(--bg-1)]/90 backdrop-blur-md border-b border-[var(--border)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--cyan)]/15 border border-[var(--cyan)]/30 flex items-center justify-center">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-4 h-4 text-[var(--cyan)]"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path d="M10 2L2 6v8l8 4 8-4V6L10 2z" />
            <path d="M10 2v12M2 6l8 4 8-4" />
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            EduAI Monitor
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              connected ? "bg-[var(--green)] status-pulse" : "bg-[var(--red)]",
            )}
          />
          <span
            className={connected ? "text-[var(--green)]" : "text-[var(--red)]"}
          >
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="w-px h-5 bg-white/10" />
        <button
          onClick={toggleDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={clsx(
            "w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-200 cursor-pointer",
            isDark
              ? "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--cyan)] hover:border-[var(--cyan)]/40"
              : "border-amber-300/50 text-amber-400 bg-amber-400/10 hover:bg-amber-400/20",
          )}
        >
          {isDark ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                strokeLinecap="round"
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>({
    active_sessions: 0,
    total_students_online: 0,
    overall_success_rate: 0,
    avg_system_latency_ms: 0,
    error_rate_percent: 0,
    daily_inference_calls: 0,
    gpu_utilization_percent: 0,
    cache_hit_ratio: 0,
    uptime_percent: 0,
    estimated_daily_savings_usd: 0,
    students_helped_today: 0,
    success_rate: 0,
    avg_latency_ms: 0,
    error_count: 0,
  });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Flash states
  const [flashSessions, setFlashSessions] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [flashLatency, setFlashLatency] = useState(false);
  const [flashCalls, setFlashCalls] = useState(false);

  // Sparkline histories
  const [sessionsHist, setSessionsHist] = useState<SparkPoint[]>([]);
  const [successHist, setSuccessHist] = useState<SparkPoint[]>([]);
  const [latencyHist, setLatencyHist] = useState<SparkPoint[]>([]);
  const [callsHist, setCallsHist] = useState<SparkPoint[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const pushSpark = (
    setter: React.Dispatch<React.SetStateAction<SparkPoint[]>>,
    v: number,
  ) =>
    setter((prev) => [...prev.slice(-(MAX_SPARK - 1)), { t: Date.now(), v }]);

  const flashFor = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(true);
    setTimeout(() => setter(false), 900);
  };

  const appendLog = useCallback((message: string, ts: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      ts,
      level: parseLevel(message),
    };
    setLogs((prev) => [...prev.slice(-(MAX_LOGS - 1)), entry]);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetch(`${API}/api/metrics`)
      .then((r) => r.json())
      .then((m: Metrics) => {
        setMetrics(m);
        pushSpark(setSessionsHist, m.active_sessions);
        pushSpark(setSuccessHist, m.overall_success_rate);
        pushSpark(setLatencyHist, m.avg_system_latency_ms);
        pushSpark(setCallsHist, m.daily_inference_calls);
      })
      .catch(console.error);

    fetch(`${API}/api/workflows`)
      .then((r) => r.json())
      .then(setWorkflows)
      .catch(console.error);
    fetch(`${API}/api/alerts`)
      .then((r) => r.json())
      .then(setAlerts)
      .catch(console.error);
  }, []);

  // WebSocket
  useEffect(() => {
    const socket = io(API, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("metrics_update", (m: Metrics) => {
      setMetrics((prev) => {
        if (prev.active_sessions !== m.active_sessions) {
          flashFor(setFlashSessions);
          pushSpark(setSessionsHist, m.active_sessions);
        }
        if (prev.overall_success_rate !== m.overall_success_rate) {
          flashFor(setFlashSuccess);
          pushSpark(setSuccessHist, m.overall_success_rate);
        }
        if (prev.avg_system_latency_ms !== m.avg_system_latency_ms) {
          flashFor(setFlashLatency);
          pushSpark(setLatencyHist, m.avg_system_latency_ms);
        }
        if (prev.daily_inference_calls !== m.daily_inference_calls) {
          flashFor(setFlashCalls);
          pushSpark(setCallsHist, m.daily_inference_calls);
        }
        return m;
      });
    });

    socket.on("workflow_update", (data: { workflows: Workflow[] }) =>
      setWorkflows(data.workflows),
    );
    socket.on("alerts_update", (data: Alert[]) => setAlerts(data));
    socket.on("log", (data: { message: string; ts: string }) =>
      appendLog(data.message, data.ts),
    );

    return () => {
      socket.disconnect();
    };
  }, [appendLog]);

  // Action handler
  const handleAction = async (id: string, action: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API}/api/workflows/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        appendLog(
          `[ERROR] Action '${action}' on ${id} failed: ${err.detail}`,
          new Date().toISOString(),
        );
      }
    } catch {
      appendLog(
        `[ERROR] Network error performing '${action}' on ${id}`,
        new Date().toISOString(),
      );
    } finally {
      setActionLoading(null);
    }
  };

  const kpis = [
    {
      label: "Active Sessions",
      value: formatNumber(metrics.active_sessions),
      sub: `${formatNumber(metrics.total_students_online)} students online`,
      accent: "#39d0d8",
      spark: sessionsHist,
      flash: flashSessions,
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
    },
    {
      label: "Success Rate",
      value: `${metrics.overall_success_rate.toFixed(1)}%`,
      sub: `${metrics.uptime_percent.toFixed(2)}% uptime`,
      accent: "#3fb950",
      spark: successHist,
      flash: flashSuccess,
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "Avg Latency",
      value: formatLatency(metrics.avg_system_latency_ms),
      sub: `${(metrics.cache_hit_ratio * 100).toFixed(0)}% cache hit`,
      accent: "#a371f7",
      spark: latencyHist,
      flash: flashLatency,
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "Inference Calls",
      value: formatNumber(metrics.daily_inference_calls),
      sub: `${metrics.students_helped_today.toLocaleString()} students helped today`,
      accent: "#58a6ff",
      spark: callsHist,
      flash: flashCalls,
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      ),
    },
  ];

  const runningCount = workflows.filter((w) => w.status === "Running").length;
  const degradedCount = workflows.filter(
    (w) => w.status === "Degraded" || w.status === "Failed",
  ).length;
  const criticalAlerts = alerts.filter((a) => a.severity === "Critical").length;

  return (
    <div className="min-h-screen bg-[var(--bg-0)] grid-bg">
      <Header connected={connected} />

      <main className="max-w-[1500px] mx-auto px-6 py-6 space-y-6">
        {/* ── Section header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              System Overview
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-60">
              · {connected ? "live" : "paused"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <span>
              <span className="text-[var(--green)] font-semibold">
                {runningCount}
              </span>{" "}
              running
            </span>
            <span>
              <span className="text-[var(--red)] font-semibold">
                {degradedCount}
              </span>{" "}
              degraded
            </span>
            {criticalAlerts > 0 && (
              <span className="flex items-center gap-1 text-[var(--red)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] status-pulse" />
                {criticalAlerts} critical
              </span>
            )}
          </div>
        </div>

        {/* ── Alerts ── */}
        {alerts.length > 0 && <AlertBanner alerts={alerts} />}

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.value}
              sub={k.sub}
              accentColor={k.accent}
              icon={k.icon}
              spark={k.spark}
              flash={k.flash}
            />
          ))}
        </div>

        {/* ── Workflows Table ── */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-2)] shadow-panel">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5 text-[var(--text-muted)]"
              >
                <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zm.75 4.5A.75.75 0 012.5 12h12.5a.75.75 0 010 1.5H2.5a.75.75 0 01-.75-.75z" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                AI Workflows
              </span>
              <span className="text-xs font-mono text-[var(--text-muted)] bg-white/5 px-1.5 py-0.5 rounded">
                {workflows.length}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              realtime · auto-refreshing
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {[
                    "Workflow",
                    "Model / Provider",
                    "Type",
                    "Status",
                    "Success Rate",
                    "Latency",
                    "Calls",
                    "Cost/day",
                    "Last Run",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className={clsx(
                        "px-4 py-2.5 text-left text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium",
                        (h === "Type" || h === "Last Run") &&
                          "hidden lg:table-cell",
                        (h === "Latency" || h === "Calls") &&
                          "hidden md:table-cell",
                        h === "Cost/day" && "hidden xl:table-cell",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workflows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-[var(--text-muted)] text-sm"
                    >
                      Connecting to backend…
                    </td>
                  </tr>
                ) : (
                  workflows.map((wf) => (
                    <WorkflowRow
                      key={wf.id}
                      wf={wf}
                      onAction={handleAction}
                      loading={actionLoading === wf.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Bottom row ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px_1fr] gap-4">
          {/* Latency chart */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                Latency Trend
              </span>
              <span className="text-xs font-mono text-[var(--purple)]">
                {formatLatency(metrics.avg_system_latency_ms)}
              </span>
            </div>
            <div className="h-40 w-full">
              <LatencyMiniChart data={latencyHist} />
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Avg inference latency · last {latencyHist.length} samples
            </p>
          </div>

          {/* System Resources panel */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-5 flex flex-col gap-4">
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              System Resources
            </span>
            <ResourceBar
              label="GPU 0 (A100)"
              value={metrics.gpu_utilization_percent}
              color="var(--cyan)"
            />
            <ResourceBar
              label="GPU 1 (A100)"
              value={Math.max(30, metrics.gpu_utilization_percent - 17)}
              color="var(--cyan)"
            />
            <ResourceBar label="CPU" value={42} color="var(--blue)" />
            <ResourceBar
              label="Memory"
              value={124}
              max={256}
              unit=" GB"
              color="var(--purple)"
            />
            <ResourceBar label="Disk" value={61} color="var(--amber)" />
            <div className="mt-auto pt-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>Cache hit</span>
              <span className="font-mono text-[var(--green)]">
                {(metrics.cache_hit_ratio * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Live log terminal */}
          <LogTerminal logs={logs} />
        </div>

        <footer className="text-center pb-4">
          <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">
            EDUAI MONITOR v1.0.0 · {new Date().getFullYear()}
          </p>
        </footer>
      </main>
    </div>
  );
}
