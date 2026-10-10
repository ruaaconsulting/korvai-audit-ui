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

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => (p && "text" in p ? p.text : "")).join("");
  return "";
}

type Line = { icon: string; iconStyle: string; title: string; detail?: string; extra?: string };

// A condensed, live view of the run, built only from the tools' actual calls and results
export function ExecutionTrace() {
  const stream = useStreamContext();
  const messages = stream.messages as any[];
  if (!messages.some((m) => m.type === "ai" && m.tool_calls?.some((c: any) => c.name === "set_stage"))) {
    return null;
  }

  const request = textOf(messages.find((m) => m.type === "human")?.content).trim().split("\n")[0] ?? "";
  const stageDefs = new Map<string, { number: number; name: string }>();
  const started: { key: string; note: string }[] = [];
  let checks = 0, gaps = 0, passes = 0, reviews = 0;
  let classified = 0, rated = 0, needApproval = 0;
  let gateRejected = 0;
  let accepted: any = null;
  let approvals: any[] = [];

  for (const m of messages) {
    if (m.type === "ai" && m.tool_calls) {
      for (const c of m.tool_calls) {
        if (c.name === "set_stage" && c.args?.stage && !started.some((s) => s.key === c.args.stage)) {
          started.push({ key: c.args.stage, note: c.args.note ?? "" });
        }
      }
    }
    if (m.type !== "tool") continue;
    const r = parse(m.content);
    if (!r) continue;
    if (m.name === "set_stage" && Array.isArray(r.stages)) {
      for (const s of r.stages) stageDefs.set(s.key, { number: s.number, name: s.name });
    }
    if (m.name === "check_criterion" && r.verdict) {
      checks++;
      if (r.verdict === "raw_gap") gaps++;
      if (r.verdict === "pass") passes++;
      if (r.verdict === "needs_review") reviews++;
    }
    if (m.name === "classify_gap" && !r.error) classified++;
    if (m.name === "rate_severity" && !r.error) {
      rated++;
      if (r.human_approval_required) needApproval++;
    }
    if (m.name === "submit_manifest") {
      if (r.accepted === true) accepted = r;
      else gateRejected++;
    }
    if (m.name === "request_human_approval" && Array.isArray(r.approvals)) approvals = r.approvals;
  }

  const running = stream.isLoading;
  const waiting = !!stream.interrupt;
  const lines: Line[] = [];

  started.forEach((s, i) => {
    const def = stageDefs.get(s.key);
    const isLast = i === started.length - 1;
    const done = !isLast || !!accepted;
    const icon = done ? "✓" : running ? "●" : waiting ? "⏳" : "⚑";
    const iconStyle = done ? "text-[#7fd6c9]" : running ? "text-[#bbc6e7] animate-pulse" : "text-[#ffb86d]";
    let extra = "";
    if (s.key === "measure" && checks) {
      extra = `${checks} checks by Jev · ${gaps} gap${gaps === 1 ? "" : "s"} · ${passes} pass${passes === 1 ? "" : "es"}${reviews ? ` · ${reviews} need review` : ""}`;
    }
    if (s.key === "classify" && classified) extra = `${classified} finding${classified === 1 ? "" : "s"} classified by Jev`;
    if (s.key === "engineer_and_score" && rated) {
      extra = `${rated} severit${rated === 1 ? "y" : "ies"} rated by Jev${needApproval ? ` · ${needApproval} need human approval` : ""}`;
    }
    if (s.key === "synthesize") {
      const parts: string[] = [];
      const decided = approvals.filter((a) => a.decision === "approved").length;
      if (approvals.length) parts.push(`${decided} of ${approvals.length} approval${approvals.length === 1 ? "" : "s"} recorded`);
      if (gateRejected) parts.push(`Manifest Gate returned ${gateRejected} correction request${gateRejected === 1 ? "" : "s"}`);
      if (accepted) parts.push("Manifest accepted");
      extra = parts.join(" · ");
    }
    lines.push({
      icon,
      iconStyle,
      title: def ? `Stage ${def.number} · ${def.name}` : s.key,
      detail: s.note,
      extra,
    });
  });

  if (accepted) {
    const score = accepted.reporting_integrity_score?.score;
    lines.push({
      icon: "✓",
      iconStyle: "text-[#7fd6c9]",
      title: "Stages 8–10 · Completed by code",
      detail: "Findings JSON, report render and final summary",
      extra: typeof score === "number" ? `Reporting Integrity Score ${score.toFixed(1)} / 100` : "",
    });
  }

  const chip = accepted
    ? { text: "Complete", style: "bg-[#E6F4F1] text-[#1E7F74]", dot: "bg-[#1E7F74]" }
    : waiting
      ? { text: "Awaiting sign-off", style: "bg-[#FFF8EC] text-[#B86E00]", dot: "bg-[#B86E00] animate-pulse" }
      : running
        ? { text: "Running", style: "bg-[#EEF2FA] text-[#3558D4]", dot: "bg-[#3558D4] animate-ping" }
        : { text: "Stopped", style: "bg-[#FFF8EC] text-[#B86E00]", dot: "bg-[#B86E00]" };

  return (
    <section className="rounded border border-[#DCE1EA] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#DCE1EA] pb-2">
        <h2 className="text-[13px] font-semibold text-[#09152e]">Live execution trace</h2>
        <span className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${chip.style}`}>
          <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
          {chip.text}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2.5 rounded border border-[#273042] bg-[#273042] p-3 font-mono text-[11.5px] text-[#ecf0ff]">
        {request && (
          <div className="flex items-start gap-2 border-b border-white/15 pb-2">
            <span className="text-[#9bf2e5] select-none">&gt;</span>
            <div className="flex min-w-0 flex-col">
              <span className="font-sans text-[10.5px] font-semibold tracking-wider text-[#d9e2ff] uppercase">Auditor request</span>
              <span className="truncate text-white">{request}</span>
            </div>
          </div>
        )}

        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`select-none ${l.iconStyle}`}>{l.icon}</span>
            <div className="flex min-w-0 flex-col leading-snug">
              <span className="font-semibold text-[#e0e8ff]">{l.title}</span>
              {l.detail && <span className="text-[11px] text-[#c6c6ce]">{l.detail}</span>}
              {l.extra && <span className="text-[11px] text-[#9bf2e5]">{l.extra}</span>}
            </div>
          </div>
        ))}

        {waiting && (
          <div className="mt-1 flex items-start gap-2 rounded border border-[#ffb86d]/30 bg-[#09152e]/60 p-2 font-sans">
            <span className="text-[#ffb86d]">⚠</span>
            <span className="text-[11.5px] text-[#ffdcbd]">
              Waiting for your decision on the approval card below. The audit continues once you submit.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
