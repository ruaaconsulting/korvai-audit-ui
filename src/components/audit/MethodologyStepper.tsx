"use client";

import { useStreamContext } from "@/providers/Stream";

type StageDef = {
  number: number;
  key: string;
  name: string;
  performed_by: string;
};

type Status = "pending" | "active" | "halted" | "done" | "code";

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

export function MethodologyStepper() {
  const stream = useStreamContext();

  // Stage list comes from the agent (tools/rules/audit-stages.yaml), never hardcoded here
  let stages: StageDef[] = [];
  let sourceVersion = "";
  const started: { stage: string; note: string }[] = [];
  const gate: any[] = []; // submit_manifest results, in order

  for (const message of stream.messages as any[]) {
    if (message.type === "ai" && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.name === "set_stage" && call.args?.stage) {
          started.push({ stage: call.args.stage, note: call.args.note ?? "" });
        }
      }
    }
    if (message.type === "tool" && message.name === "set_stage") {
      const r = parse(message.content);
      if (r?.stages) {
        stages = r.stages;
        sourceVersion = r.source_version ?? "";
      }
    }
    if (message.type === "tool" && message.name === "submit_manifest") {
      const r = parse(message.content);
      if (r) gate.push(r);
    }
  }

  if (started.length === 0 || stages.length === 0) return null;

  const latest = started[started.length - 1].stage;
  const running = stream.isLoading;
  const awaitingApproval = !!stream.interrupt;
  const lastJudgment = [...stages].reverse().find((s) => s.performed_by === "judgment")?.key;
  const accepted = gate.some((r) => r.accepted === true);
  const lastGate = gate[gate.length - 1];
  const failedAt: number | null =
    !accepted && lastGate && typeof lastGate.stage === "number" && lastGate.stage >= 8
      ? lastGate.stage
      : null;

  function statusOf(s: StageDef): Status {
    if (s.performed_by !== "judgment") {
      // Deterministic stages: run by code when the Manifest Gate accepts
      if (accepted) return "done";
      if (failedAt !== null) {
        if (s.number < failedAt) return "done";
        if (s.number === failedAt) return "halted";
      }
      return "code";
    }
    if (!started.some((x) => x.stage === s.key)) return "pending";
    if (s.key === latest && running) return "active";
    if (s.key === latest && !running && (latest !== lastJudgment || !accepted)) return "halted";
    return "done";
  }

  function label(s: StageDef, status: Status): { text: string; style: string } {
    if (status === "done") return { text: "✓ Complete", style: "text-[#1E7F74] font-bold" };
    if (status === "active") return { text: "● Running", style: "text-blue-700 font-bold animate-pulse" };
    if (status === "halted") {
      if (s.key === lastJudgment && awaitingApproval) {
        return { text: "⏳ Awaiting human sign-off", style: "text-[#B86E00] font-bold" };
      }
      return { text: "⚑ Stopped", style: "text-[#B86E00] font-bold" };
    }
    if (status === "code") return { text: "Queued", style: "text-gray-400" };
    return { text: "Not started", style: "text-gray-400" };
  }

  function noteOf(s: StageDef, status: Status): string {
    if (s.performed_by !== "judgment") {
      if (status === "done") return "Completed by code";
      if (status === "halted") return "Stopped: see the gate's errors in the chat";
      return "Runs by code after the Manifest Gate accepts";
    }
    return [...started].reverse().find((x) => x.stage === s.key)?.note ?? "";
  }

  return (
    <section className="m-3 rounded border border-[#DCE1EA] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#DCE1EA] pb-1.5">
        <h2 className="text-[13px] font-semibold text-[#09152e]">Methodology lifecycle</h2>
        <span className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
          IEM-PM{sourceVersion && ` · stages v${sourceVersion}`}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
        {stages.map((s) => {
          const status = statusOf(s);
          const l = label(s, status);
          const highlight = status === "halted" || status === "active";
          const muted = status === "code" || status === "pending";
          return (
            <div
              key={s.key}
              title={noteOf(s, status) || undefined}
              className={`flex items-center justify-between gap-1 rounded border px-2 py-1 ${
                highlight
                  ? "col-span-2 border-[#B86E00]/40 bg-[#FFF8EC]"
                  : muted
                    ? "border-[#DCE1EA]/60 bg-[#F6F7F9]/60 opacity-70"
                    : "border-[#DCE1EA] bg-[#F6F7F9]"
              }`}
            >
              <span className={`truncate font-medium ${muted ? "text-gray-500" : "text-[#09152e]"}`}>
                {s.number} {s.name}
              </span>
              <span className={`shrink-0 text-[10.5px] ${l.style}`}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
