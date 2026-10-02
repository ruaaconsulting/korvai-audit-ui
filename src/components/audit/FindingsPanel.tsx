"use client";

import { useStreamContext } from "@/providers/Stream";

type ClassifyArgs = {
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
    variance_sent?: string;
    classified_by?: string;
    error?: string;
    message?: string;
};

// Tool results arrive as text; turn them back into an object
function parseResult(content: unknown): ClassifyResult | null {
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

function ConfidenceBar({
    label,
    value,
    threshold,
    runner,
}: {
    label: string;
    value: number;
    threshold: number;
    runner: string | null;
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

export function FindingsPanel() {
    const stream = useStreamContext();

    // Pair each classify_gap call (its inputs) with its result
    const order: string[] = [];
    const calls = new Map<string, ClassifyArgs>();
    const results = new Map<string, ClassifyResult>();

    for (const message of stream.messages as any[]) {
        if (message.type === "ai" && message.tool_calls) {
            for (const call of message.tool_calls) {
                if (call.name === "classify_gap" && call.id) {
                    order.push(call.id);
                    calls.set(call.id, call.args ?? {});
                }
            }
        }
        if (message.type === "tool" && message.name === "classify_gap") {
            const parsed = parseResult(message.content);
            if (parsed) results.set(message.tool_call_id, parsed);
        }
    }

    if (order.length === 0) return null;

    return (
        <div className="border-t p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                Findings ({order.length})
            </h2>
            <div className="space-y-3">
                {order.map((id, i) => {
                    const args = calls.get(id) ?? {};
                    const r = results.get(id);
                    const threshold = r?.threshold_used ?? 0.7;

                    return (
                        <div key={id} className="rounded-lg border bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-semibold text-gray-900">
                                    Finding {i + 1}
                                </div>
                                {r?.needs_review && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                        Needs review
                                    </span>
                                )}
                            </div>

                            <div className="mt-1 text-[11px] text-gray-600">
                                {args.requirement}
                            </div>
                            {args.observed && (
                                <div className="mt-1 text-[11px] text-gray-800">
                                    <span className="font-medium">Observed:</span> {args.observed}
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
                                    <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-gray-500">
                                        {r.evidence_verified && (
                                            <span className="text-green-700">✓ Evidence verbatim</span>
                                        )}
                                        {r.classified_by && <span>{r.classified_by}</span>}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}