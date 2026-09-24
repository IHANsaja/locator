"use client";

import { useEffect, useState } from "react";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a clipboard permission prompt that was dismissed.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One coordinate, with a button that copies exactly the value shown.
 * `compact` is the smaller variant used in the captured-location card. */
export function CopyRow({
  label,
  value,
  compact = false,
  copyLabel = `Copy ${label.toLowerCase()}`,
}: {
  label: string;
  value: string | null;
  compact?: boolean;
  /** Accessible name for the button, when two rows share a label. */
  copyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function onCopy() {
    if (value && (await copyText(value))) setCopied(true);
  }

  return (
    <div
      className={
        "flex items-center justify-between gap-3 bg-zinc-100 dark:bg-zinc-800 " +
        (compact ? "rounded-xl py-1.5 pl-3 pr-1.5" : "rounded-2xl py-2.5 pl-4 pr-2.5")
      }
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p
          className={
            "truncate font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 " +
            (compact ? "text-sm" : "text-xl")
          }
        >
          {value ?? "—"}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={!value}
        aria-label={copyLabel}
        className={
          "flex shrink-0 items-center gap-1.5 font-semibold transition active:scale-95 disabled:opacity-40 " +
          (compact ? "h-8 rounded-lg px-2.5 text-xs " : "h-11 rounded-xl px-4 text-sm ") +
          (copied ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900")
        }
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
