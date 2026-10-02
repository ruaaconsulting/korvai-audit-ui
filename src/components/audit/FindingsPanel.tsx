"use client";

import { useStreamContext } from "@/providers/Stream";

type FindingArgs = {
    requirement?: string;
    evidence?: string;
    expected?: string;
    observed?: string;
};

type ClassifyResult = {
    gap_type?: string;
    gap_type_confidence?: number;
    gap_type_probabilities?: Record<string, number>;
    root_origin?: string;
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
    severity?: string;
    severity_score?: number;
    floor_applied?: boolean;
    decision_impact?: string;
    decision_impact_confidence?: number;
    spread?: string;
    spread_confidence?: number;
    persistence?: string;
    persistence_confidence?: number;
    needs_review?: boolean;
    threshold_used?: number;
    severity_rubric?: { version?: string };
    error?: string;
    message?: string;
};

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

// The second most likely label, e.g. "Ignored 0.39"
function runnerUp(
    probs: Record<string, number> | undefined,
    winner: string | undefined,
): string | null {
    if (!probs) return null;
    const sorted = Object.entries(probs)
        .filter(([label]) => label !== winner)
        .sort((a, b) => b[1] - a[1]);
    if (!sorted.length || sorted[0][1] === 0) return null;
    return `${sorted[0][0]} ${sorted[0][1].toFixed(2)}`;
}

const BAND_STYLE: Record<string, string> = {
    Low: "bg-gray-100 text-gray-800",
    Medium: "bg-yellow-100 text-yellow-800",
    High: "bg-orange-100 text-orange-800",
    Critical: "bg-red-100 text-red-800",
};

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

function SeveritySection({ s }: { s: SeverityResult }) {
    const threshold = s.threshold_used ?? 0.7;
    const band = s.severity ?? "Unknown";
    return (
        <div className="mt-3 border-t pt-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">Severity</span>
                <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${BAND_STYLE[band] ?? "bg-gray-100 text-gray-800"
                        }`}
                >
                    {band} · {s.severity_score}
                </span>
            </div>
            <div className="mt-0.5 text-[10px] text-gray-500">
                Persistence × Spread × Decision Impact
                {s.floor_applied && " · raised by floor rule"}
            </div>
            <ConfidenceBar
                label={`Decision impact: ${s.decision_impact}`}
                value={s.decision_impact_confidence ?? 0}
                threshold={threshold}
            />
            <ConfidenceBar
                label={`Spread: ${s.spread}`}
                value={s.spread_confidence ?? 0}
                threshold={threshold}
            />
            <ConfidenceBar
                label={`Persistence: ${s.persistence}`}
                value={s.persistence_confidence ?? 0}
                threshold={threshold}
            />
            {s.severity_rubric?.version && (
                <div className="mt-1 text-[10px] text-gray-500">
                    Rubric v{s.severity_rubric.version}
                </div>
            )}
        </div>
    );
}

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

    if (order.length === 0) return null;

    return (
        <div className="border-t p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                Findings ({order.length})
            </h2>
            <div className="space-y-3">
                {order.map((key, i) => {
                    const a = args.get(key) ?? {};
                    const r = classify.get(key);
                    const s = severity.get(key);
                    const threshold = r?.threshold_used ?? 0.7;
                    const needsReview = !!r?.needs_review || !!s?.needs_review;

                    return (
                        <div key={key} className="rounded-lg border bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-semibold text-gray-900">
                                    Finding {i + 1}
                                </div>
                                {needsReview && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                        Needs review
                                    </span>
                                )}
                            </div>

                            <div className="mt-1 text-[11px] text-gray-600">{a.requirement}</div>
                            {a.observed && (
                                <div className="mt-1 text-[11px] text-gray-800">
                                    <span className="font-medium">Observed:</span> {a.observed}
                                </div>
                            )}

                            {!r && (
                                <div className="mt-2 animate-pulse text-xs text-blue-600">
                                    Classifying with Jev…
                                </div>
                            )}

                            {r?.error && (
                                <div className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">
                                    {r.message ?? r.error}
                                </div>
                            )}

                            {r && !r.error && (
                                <>
                                    <ConfidenceBar
                                        label={`Gap type: ${r.gap_type}`}
                                        value={r.gap_type_confidence ?? 0}
                                        threshold={threshold}
                                        runner={runnerUp(r.gap_type_probabilities, r.gap_type)}
                                    />
                                    <ConfidenceBar
                                        label={`Root origin: ${r.root_origin}`}
                                        value={r.root_origin_confidence ?? 0}
                                        threshold={threshold}
                                        runner={runnerUp(r.root_origin_probabilities, r.root_origin)}
                                    />
                                </>
                            )}

                            {s?.error && (
                                <div className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">
                                    Severity: {s.message ?? s.error}
                                </div>
                            )}

                            {s && !s.error && <SeveritySection s={s} />}

                            {r && !r.error && (
                                <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-gray-500">
                                    {r.evidence_verified && (
                                        <span className="text-green-700">✓ Evidence verbatim</span>
                                    )}
                                    {r.classified_by && <span>{r.classified_by}</span>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}