"use client";

import { useStreamContext } from "@/providers/Stream";

function parse(content: unknown): any {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((p: any) => (p && "text" in p ? p.text : "")).join("")
        : "";
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Full-width Korvai header. Everything shown comes from the current run's tool results.
export function KorvaiTopBar() {
  const stream = useStreamContext();

  let stagesVersion = "";
  let started = false;
  let accepted: any = null;
  let findings = 0;
  for (const message of stream.messages as any[]) {
    if (message.type === "ai" && message.tool_calls?.some((c: any) => c.name === "set_stage")) started = true;
    if (message.type !== "tool") continue;
    const r = parse(message.content);
    if (!r) continue;
    if (message.name === "set_stage" && r.source_version) stagesVersion = String(r.source_version);
    if (message.name === "submit_manifest" && r.accepted === true) accepted = r;
    if (message.name === "classify_gap" && !r.error) findings++;
  }

  // Run status chip
  let status = { text: "Ready", dot: "bg-gray-400", style: "bg-[#F6F7F9] text-gray-600 border-[#DCE1EA]" };
  if (accepted) {
    const score = accepted.reporting_integrity_score?.score;
    status = {
      text: `Completed${typeof score === "number" ? ` · RIS ${score.toFixed(1)}` : ""}`,
      dot: "bg-[#1E7F74]",
      style: "bg-[#E6F4F1] text-[#1E7F74] border-[#8FD9CE]",
    };
  } else if (stream.interrupt) {
    status = { text: "Awaiting human sign-off", dot: "bg-[#B86E00] animate-pulse", style: "bg-[#FFF8EC] text-[#B86E00] border-[#B86E00]/30" };
  } else if (stream.isLoading) {
    status = { text: "Audit in progress", dot: "bg-[#3558D4] animate-pulse", style: "bg-[#EEF2FA] text-[#3558D4] border-[#DCE1EA]" };
  } else if (started) {
    status = { text: "Stopped", dot: "bg-[#B86E00]", style: "bg-[#FFF8EC] text-[#B86E00] border-[#B86E00]/30" };
  }

  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-[#DCE1EA] bg-white px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-serif text-[22px] leading-7 font-semibold tracking-tight text-[#09152e]">Korvai</span>
          <span className="rounded border border-[#DCE1EA] bg-[#EEF2FA] px-1 py-0.5 text-[11px] font-semibold tracking-wider text-[#09152e] uppercase">
            PMO Audit
          </span>
        </div>
        <div className="hidden h-5 w-px bg-[#DCE1EA] sm:block" />
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-[13px] text-gray-600">Methodology:</span>
          <span className="rounded border border-[#DCE1EA] bg-[#f1f3ff] px-1 py-0.5 text-[13px] font-semibold text-[#09152e]">
            IEM-PM{stagesVersion && ` · stages v${stagesVersion}`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {findings > 0 && (
          <span className="hidden rounded border border-[#8A4A00]/20 bg-[#FCE3C7]/50 px-2 py-1 text-[12px] font-semibold text-[#8A4A00] lg:inline">
            {findings} finding{findings === 1 ? "" : "s"}
          </span>
        )}
        <span className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] font-medium ${status.style}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.text}
        </span>
      </div>
    </header>
  );
}
