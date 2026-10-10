"use client";

import { useStreamContext } from "@/providers/Stream";

/* ───────────── Types ───────────── */

type FindingArgs = {
    requirement?: string;
    evidence?: string;
    expected?: string;
    observed?: string;
};

type ClassifyResult = {
    gap_type?: string;
    gap_type_definition?: string;
    gap_type_confidence?: number;
    gap_type_probabilities?: Record<string, number>;
    root_origin?: string;
    root_origin_definition?: string;
    root_origin_confidence?: number;
    root_origin_probabilities?: Record<string, number>;
    needs_review?: boolean;
    threshold_used?: number;
    evidence_verified?: boolean;
    classified_by?: string;
    error?: string;
    message?: string;
};

type SeverityResult = {
    severity?: number;
    severity_label?: string;
    severity_confidence?: number;
    severity_probabilities?: Record<string, number>;
    severity_runner_up?: {
        severity: number;
        label: string;
        probability: number;
        approval_required: boolean;
    } | null;
    human_approval_required?: boolean;
    needs_review?: boolean;
    threshold_used?: number;
    calibration?: {
        band?: string;
        score?: number;
        floor_applied?: boolean;
        decision_impact?: string;
        decision_impact_score?: number;
        decision_impact_confidence?: number;
        spread?: string;
        spread_score?: number;
        spread_confidence?: number;
        persistence?: string;
        persistence_score?: number;
        persistence_confidence?: number;
        rubric?: { version?: string };
    };
    severity_scale?: { version?: string };
    error?: string;
    message?: string;
};

/* ───────────── Helpers ───────────── */

// Same requirement + same evidence = same finding
function findingKey(args: FindingArgs): string {
    return `${args.requirement ?? ""}||${args.evidence ?? ""}`;
}

// Tool results arrive as text; turn them back into an object
function parseResult<T>(content: unknown): T | null {
    const text =
        typeof content === "string"
            ? content
            : Array.isArray(content)
                ? content.map((p: any) => (p && "text" in p ? p.text : "")).join("")
                : "";
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

// Second most likely label, as { label, probability }
function runnerUpOf(
    probs: Record<string, number> | undefined,
    winner: string | undefined,
): { label: string; probability: number } | null {
    if (!probs) return null;
    const sorted = Object.entries(probs)
        .filter(([label]) => label !== winner)
        .sort((a, b) => b[1] - a[1]);
    if (!sorted.length || sorted[0][1] === 0) return null;
    return { label: sorted[0][0], probability: sorted[0][1] };
}

function pct(value: number | undefined): string {
    return `${Math.round((value ?? 0) * 100)}%`;
}

const SEVERITY_STYLE: Record<number, string> = {
    1: "bg-gray-100 text-gray-700",
    2: "bg-blue-100 text-blue-800",
    3: "bg-yellow-100 text-yellow-800",
    4: "bg-orange-100 text-orange-800",
    5: "bg-red-100 text-red-800",
};

/* ───────────── Confidence bar ───────────── */

function ConfidenceBar({
    label,
    value,
    threshold,
    runner,
}: {
    label: string;
    value: number;
    threshold: number;
    runner?: string | null;
}) {
    const ok = value >= threshold;
    return (
        <div className="mt-2">
            <div className="flex justify-between text-xs">
                <span className="font-medium text-gray-900">{label}</span>
                <span className={ok ? "text-green-700" : "text-amber-700"}>
                    {value.toFixed(2)}
                </span>
            </div>
            <div className="relative mt-1 h-1.5 w-full rounded bg-gray-200">
                <div
                    className={`h-1.5 rounded ${ok ? "bg-green-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.round(value * 100)}%` }}
                />
                <div
                    className="absolute top-[-2px] h-2.5 w-px bg-gray-500"
                    style={{ left: `${Math.round(threshold * 100)}%` }}
                    title={`Threshold ${threshold}`}
                />
            </div>
            {runner && (
                <div className="mt-0.5 text-[11px] text-gray-500">vs {runner}</div>
            )}
        </div>
    );
}

/* ───────────── Severity section (§9.1 official + Appendix D reference) ───────────── */

function SeveritySection({ s, approved = false }: { s: SeverityResult; approved?: boolean }) {
    const threshold = s.threshold_used ?? 0.7;
    const c = s.calibration ?? {};
    const r = s.severity_runner_up;
    return (
        <div className="mt-3 border-t pt-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">Severity (§9.1)</span>
                <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLE[s.severity ?? 0] ?? "bg-gray-100 text-gray-800"
                        }`}
                >
                    {s.severity} · {s.severity_label}
                </span>
            </div>

            <ConfidenceBar
                label={`Severity ${s.severity}: ${s.severity_label}`}
                value={s.severity_confidence ?? 0}
                threshold={threshold}
                runner={r ? `${r.severity} ${r.label} (${pct(r.probability)})` : null}
            />

            {s.human_approval_required && !approved && (
                <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-800">
                    Severity 4–5: human approval required before this finding is final (§10.2.3)
                </div>
            )}

            <div className="mt-2 rounded bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-semibold text-gray-600">
                    Calibration reference (Appendix D, not the severity)
                </div>
                <div className="font-mono text-[10px] text-gray-600">
                    {c.persistence} {c.persistence_score} × {c.spread} {c.spread_score} ×{" "}
                    {c.decision_impact} {c.decision_impact_score} = {c.score} → {c.band}
                    {c.floor_applied && " (floor rule)"}
                </div>
            </div>

            <div className="mt-1 text-[10px] text-gray-500">
                Scale v{s.severity_scale?.version} · Rubric v{c.rubric?.version}
            </div>
        </div>
    );
}

/* ───────────── Plain-language summary ───────────── */

function PmSummary({
    a,
    r,
    s,
}: {
    a: FindingArgs;
    r: ClassifyResult;
    s?: SeverityResult;
}) {
    const threshold = r.threshold_used ?? 0.7;
    const questions: string[] = [];

    // Classification: only where Jev was unsure
    const gapRunner = runnerUpOf(r.gap_type_probabilities, r.gap_type);
    if ((r.gap_type_confidence ?? 1) < threshold && gapRunner) {
        questions.push(
            `Gap type: ${r.gap_type} (${pct(r.gap_type_probabilities?.[r.gap_type ?? ""])}) or ${gapRunner.label} (${pct(gapRunner.probability)})?`,
        );
    }
    const rootRunner = runnerUpOf(r.root_origin_probabilities, r.root_origin);
    if ((r.root_origin_confidence ?? 1) < threshold && rootRunner) {
        questions.push(
            `Root origin: ${r.root_origin} (${pct(r.root_origin_probabilities?.[r.root_origin ?? ""])}) or ${rootRunner.label} (${pct(rootRunner.probability)})?`,
        );
    }

    // Severity: only where Jev was unsure
    if (s && !s.error && s.needs_review && s.severity_runner_up) {
        const ru = s.severity_runner_up;
        questions.push(
            `Severity: ${s.severity} ${s.severity_label} (${pct(s.severity_probabilities?.[s.severity_label ?? ""])}) or ${ru.severity} ${ru.label} (${pct(ru.probability)})?` +
            (ru.approval_required !== s.human_approval_required
                ? " This changes whether human approval is required."
                : ""),
        );
    }

    return (
        <div className="mt-2 space-y-1.5 rounded-md bg-blue-50 p-2.5 text-[11px] leading-snug text-gray-800">
            <div className="text-[10px] font-semibold tracking-wide text-blue-800 uppercase">
                Plain-language summary
            </div>

            <div>
                <span className="font-semibold">What we found: </span>
                Your standard requires: {a.requirement} The evidence shows: {a.observed}.
            </div>

            <div>
                <span className="font-semibold">What kind of problem: </span>
                <em>{r.gap_type}</em>
                {r.gap_type_definition ? ` — ${r.gap_type_definition}` : ""} (
                {pct(r.gap_type_probabilities?.[r.gap_type ?? ""])} likely).
            </div>

            <div>
                <span className="font-semibold">Why it happened: </span>
                <em>{r.root_origin}</em>
                {r.root_origin_definition ? ` — ${r.root_origin_definition}` : ""} (
                {pct(r.root_origin_probabilities?.[r.root_origin ?? ""])} likely).
            </div>

            {s && !s.error && (
                <div>
                    <span className="font-semibold">How serious: </span>
                    <strong>
                        Severity {s.severity} ({s.severity_label})
                    </strong>{" "}
                    ({pct(s.severity_probabilities?.[s.severity_label ?? ""])} likely).
                    {s.human_approval_required &&
                        " A real person must approve this finding before it is final."}
                </div>
            )}

            {questions.length > 0 ? (
                <div>
                    <div className="font-semibold">Where your judgment is needed:</div>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {questions.map((q) => (
                            <li key={q}>{q}</li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="text-green-700">
                    No judgment calls needed: every rating is above the confidence threshold.
                </div>
            )}
        </div>
    );
}

/* ───────────── Findings panel ───────────── */

export function FindingsPanel() {
    const stream = useStreamContext();

    // Findings come from classify_gap calls, in order
    const order: string[] = [];
    const args = new Map<string, FindingArgs>();
    const classifyCallKey = new Map<string, string>(); // tool call id -> finding key
    const severityCallKey = new Map<string, string>();
    const classify = new Map<string, ClassifyResult>(); // finding key -> result
    const severity = new Map<string, SeverityResult>();

    for (const message of stream.messages as any[]) {
        if (message.type === "ai" && message.tool_calls) {
            for (const call of message.tool_calls) {
                const key = findingKey(call.args ?? {});
                if (call.name === "classify_gap" && call.id) {
                    if (!args.has(key)) {
                        order.push(key);
                        args.set(key, call.args ?? {});
                    }
                    classifyCallKey.set(call.id, key);
                }
                if (call.name === "rate_severity" && call.id) {
                    severityCallKey.set(call.id, key);
                }
            }
        }
        if (message.type === "tool") {
            if (message.name === "classify_gap") {
                const key = classifyCallKey.get(message.tool_call_id);
                const parsed = parseResult<ClassifyResult>(message.content);
                if (key && parsed) classify.set(key, parsed);
            }
            if (message.name === "rate_severity") {
                const key = severityCallKey.get(message.tool_call_id);
                const parsed = parseResult<SeverityResult>(message.content);
                if (key && parsed) severity.set(key, parsed);
            }
        }
    }

    // Recorded human decisions (request_human_approval), matched to findings by rule
  const reqToClause = new Map<string, string>();
  const decisions = new Map<string, any>();
  for (const message of stream.messages as any[]) {
    if (message.type === "ai" && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.name === "check_criterion" && call.args?.requirement && call.args?.clause_id) {
          reqToClause.set(String(call.args.requirement).trim().toLowerCase(), String(call.args.clause_id));
        }
      }
    }
    if (message.type === "tool" && message.name === "request_human_approval") {
      const parsed = parseResult<{ approvals?: any[] }>(message.content);
      for (const d of parsed?.approvals ?? []) decisions.set(String(d.clause_id), d);
    }
  }
  const approvalFor = (args: FindingArgs) =>
    decisions.get(reqToClause.get(String(args.requirement ?? "").trim().toLowerCase()) ?? "");

  if (order.length === 0) return null;

  const clauseFor = (args: FindingArgs) =>
    reqToClause.get(String(args.requirement ?? "").trim().toLowerCase()) ?? "";

  return (
    <section className="m-3 flex flex-col gap-2 rounded border border-[#DCE1EA] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#DCE1EA] pb-1.5">
        <h2 className="text-[13px] font-semibold text-[#09152e]">Classified findings</h2>
        <span className="rounded bg-[#FCE3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#8A4A00]">
          {order.length} finding{order.length === 1 ? "" : "s"}
        </span>
      </div>

      {order.map((key, i) => {
        const a = args.get(key) ?? {};
        const r = classify.get(key);
        const s = severity.get(key);
        const threshold = r?.threshold_used ?? 0.7;
        const needsReview = !!r?.needs_review || !!s?.needs_review;
        const gapRunner = runnerUpOf(r?.gap_type_probabilities, r?.gap_type);
        const rootRunner = runnerUpOf(r?.root_origin_probabilities, r?.root_origin);
        const decision = s?.human_approval_required ? approvalFor(a) : undefined;
        const approved = decision?.decision === "approved";
        const waiting = !!s?.human_approval_required && !decision;
        const clause = clauseFor(a);

        // One combined badge: severity, plus approval state where it applies
        let badgeText = s && !s.error ? `Severity ${s.severity} · ${s.severity_label}` : "";
        let badgeStyle = SEVERITY_STYLE[s?.severity ?? 0] ?? "bg-gray-100 text-gray-800";
        if (s?.human_approval_required && approved) {
          badgeText = `✓ Severity ${s.severity} · Approved`;
          badgeStyle = "bg-[#E6F4F1] text-[#1E7F74]";
        } else if (s?.human_approval_required && decision) {
          badgeText = `Severity ${s.severity} · Not approved`;
          badgeStyle = "bg-[#FBE9E7] text-[#B3261E]";
        } else if (waiting) {
          badgeText = `Severity ${s?.severity} · Awaiting you`;
          badgeStyle = "bg-[#B86E00] text-white";
        }

        return (
          <div
            key={key}
            className={`flex flex-col gap-1 rounded border p-2.5 ${
              waiting ? "border-[#B86E00]/40 bg-[#FFF8EC]/60" : "border-[#DCE1EA] bg-[#F6F7F9]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-bold text-[#09152e]">
                {clause || `Finding ${i + 1}`}
                {r && !r.error ? ` · ${r.gap_type}` : ""}
              </span>
              {badgeText && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeStyle}`}>
                  {badgeText}
                </span>
              )}
            </div>

            {a.observed && <p className="text-[12px] leading-snug text-gray-700">{a.observed}</p>}
            {r && !r.error && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
                <span>Root origin: {r.root_origin}</span>
                {needsReview && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Needs review
                  </span>
                )}
              </div>
            )}

            {decision && (
              <div
                className={`rounded px-2 py-1 text-[11px] font-medium ${
                  approved ? "bg-[#E6F4F1] text-[#1E7F74]" : "bg-[#FBE9E7] text-[#B3261E]"
                }`}
              >
                {approved
                  ? `Approved by ${decision.approved_by} on ${decision.approval_date}`
                  : `Not approved (${decision.decision})${decision.message ? ": " + decision.message : ""}`}
              </div>
            )}

            {!r && <div className="animate-pulse text-xs text-blue-600">Classifying with Jev…</div>}
            {r?.error && <div className="rounded bg-red-50 p-2 text-[11px] text-red-700">{r.message ?? r.error}</div>}
            {s?.error && (
              <div className="rounded bg-red-50 p-2 text-[11px] text-red-700">Severity: {s.message ?? s.error}</div>
            )}

            {r && !r.error && (
              <details>
                <summary className="cursor-pointer text-[11px] font-medium text-[#3558D4]">Details</summary>
                <div className="mt-1 text-[11px] text-gray-600">{a.requirement}</div>
                <PmSummary a={a} r={r} s={s} />
                <ConfidenceBar
                  label={`Gap type: ${r.gap_type}`}
                  value={r.gap_type_confidence ?? 0}
                  threshold={threshold}
                  runner={gapRunner ? `${gapRunner.label} (${pct(gapRunner.probability)})` : null}
                />
                <ConfidenceBar
                  label={`Root origin: ${r.root_origin}`}
                  value={r.root_origin_confidence ?? 0}
                  threshold={threshold}
                  runner={rootRunner ? `${rootRunner.label} (${pct(rootRunner.probability)})` : null}
                />
                {s && !s.error && <SeveritySection s={s} approved={approved} />}
                <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-gray-500">
                  {r.evidence_verified && <span className="text-[#1E7F74]">✓ Evidence verbatim</span>}
                  {r.classified_by && <span>{r.classified_by}</span>}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
