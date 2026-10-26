import { useEffect } from "react";
import { X } from "lucide-react";

export function buttonClass(variant = "secondary", size = "md") {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ";
  const sizes = { md: "px-4 py-2 text-[15px] ", sm: "px-3 py-1.5 text-sm " };
  const variants = {
    primary: "bg-asphalt text-white hover:bg-asphalt-2",
    secondary: "border border-line bg-white text-ink hover:bg-paper",
    danger: "bg-alert text-white hover:bg-[#b72626]",
    quiet: "text-ink-2 hover:bg-paper hover:text-ink",
    marking: "bg-marking text-asphalt hover:bg-[#dba604]",
  };
  return base + sizes[size] + variants[variant];
}

export function Button({ variant = "secondary", size = "md", icon: Icon, children, className = "", ...rest }) {
  return (
    <button type="button" className={buttonClass(variant, size) + " " + className} {...rest}>
      {Icon ? <Icon size={size === "sm" ? 15 : 17} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Panel({ title, action, children, className = "", bodyClass = "p-5" }) {
  return (
    <section className={"rounded-xl border border-line bg-panel " + className}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-line-2 px-5 py-3.5">
          <h2 className="text-[19px] text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function SpeedSign({ value, size = 72 }) {
  const text = String(value);
  const fontSize = text.length >= 3 ? 40 : 50;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={"Speed limit " + text}>
      <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#d32f2f" strokeWidth="9" />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="700"
        fill="#14202a"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {text}
      </text>
    </svg>
  );
}

const BADGE_TONES = {
  neutral: "bg-paper text-ink-2",
  good: "bg-sign-soft text-sign",
  bad: "bg-alert-soft text-alert",
  warn: "bg-marking-soft text-[#7a5b00]",
  dark: "bg-asphalt text-white",
};

export function Badge({ tone = "neutral", children }) {
  return (
    <span className={"inline-flex items-center gap-1 rounded px-2 py-0.5 text-[13px] font-medium " + BADGE_TONES[tone]}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink-2">
          <Icon size={22} aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-[22px] text-ink">{title}</h3>
      {text ? <p className="mt-1.5 max-w-md text-ink-2">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, tone = "sign" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  const color = tone === "marking" ? "bg-marking" : "bg-sign";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-line-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={"h-full rounded-full transition-[width] duration-500 " + color} style={{ width: pct + "%" }} />
    </div>
  );
}

const NOTICE_TONES = {
  error: "border-alert/30 bg-alert-soft text-[#8f1f1f]",
  warn: "border-marking/50 bg-marking-soft text-[#6b4f00]",
  info: "border-line bg-white text-ink-2",
  good: "border-sign/30 bg-sign-soft text-[#0a5a42]",
};

export function Notice({ tone = "info", children, onClose }) {
  return (
    <div className={"flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-[15px] " + NOTICE_TONES[tone]} role={tone === "error" ? "alert" : "status"}>
      <div>{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="mt-0.5 shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function Stat({ label, value, unit, tone = "default", note }) {
  const color = tone === "bad" ? "text-alert" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-4">
      <p className="text-[14px] text-ink-2">{label}</p>
      <p className={"num mt-1 text-[38px] font-semibold leading-none " + color}>
        {value}
        {unit ? <span className="ml-1.5 text-[17px] font-medium text-ink-3">{unit}</span> : null}
      </p>
      {note ? <p className="mt-2 text-[13px] text-ink-3">{note}</p> : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-3 py-10 text-ink-2" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[13px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-asphalt/60 px-4 py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"w-full rounded-xl bg-white shadow-xl " + (wide ? "max-w-3xl" : "max-w-lg")}
      >
        <header className="flex items-center justify-between border-b border-line-2 px-5 py-3.5">
          <h2 className="text-[20px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-2 hover:bg-paper">
            <X size={18} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageIntro({ children }) {
  return <p className="max-w-2xl text-[16px] text-ink-2">{children}</p>;
}
