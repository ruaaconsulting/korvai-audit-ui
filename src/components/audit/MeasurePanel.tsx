"use client";

import { useStreamContext } from "@/providers/Stream";

type CheckArgs = { clause_id?: string; item_id?: string };
type CheckResult = {
    clause_id?: string;
    item_id?: string;
    verdict?: "pass" | "raw_gap" | "needs_review";
    probability_satisfied?: number;
    conformance_rules?: { version?: string };
    error?: string;
    message?: string;
};

function parse(content: unknown): CheckResult | null {
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

const VERDICT: Record<string, { label: string; style: string }> = {
    raw_gap: { label: "Raw gap", style: "bg-red-100 text-red-800" },
    pass: { label: "Pass, not a finding", style: "bg-gray-100 text-gray-600" },
    needs_review: { label: "Needs review", style: "bg-amber-100 text-amber-800" },
};

export function MeasurePanel() {
    const stream = useStreamContext();

    const order: string[] = [];
    const args = new Map<string, CheckArgs>();
    const results = new Map<string, CheckResult>();

    for (const message of stream.messages as any[]) {
        if (message.type === "ai" && message.tool_calls) {
            for (const call of message.tool_calls) {
                if (call.name === "check_criterion" && call.id) {
                    order.push(call.id);
                    args.set(call.id, call.args ?? {});
                }
            }
        }
        if (message.type === "tool" && message.name === "check_criterion") {
            const r = parse(message.content);
            if (r) results.set(message.tool_call_id, r);
        }
    }

    if (order.length === 0) return null;

    const counts = { raw_gap: 0, pass: 0, needs_review: 0 };
    for (const id of order) {
        const v = results.get(id)?.verdict;
        if (v && v in counts) counts[v]++;
    }
    const version = [...results.values()].find((r) => r.conformance_rules?.version)
        ?.conformance_rules?.version;

    return (
        <div className="border-t p-4">
            <h2 className="text-sm font-semibold text-gray-900">
                3 · Measure ({order.length} evaluations)
            </h2>
            <div className="mt-1 mb-3 text-[11px] text-gray-600">
                {counts.raw_gap} raw gap{counts.raw_gap === 1 ? "" : "s"} · {counts.pass} pass
                {counts.pass === 1 ? "" : "es"} · {counts.needs_review} need review
                {version && <span className="text-gray-400"> · rules v{version}</span>}
            </div>
            <div className="space-y-1">
                {order.map((id) => {
                    const a = args.get(id) ?? {};
                    const r = results.get(id);
                    const v = r?.verdict ? VERDICT[r.verdict] : null;
                    return (
                        <div
                            key={id}
                            className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1"
                        >
                            <span className="text-[11px] text-gray-800">
                                <span className="font-medium">{a.clause_id}</span> × {a.item_id}
                            </span>
                            {!r && (
                                <span className="animate-pulse text-[10px] text-blue-600">Evaluating…</span>
                            )}
                            {r?.error && (
                                <span className="text-[10px] text-red-700">{r.message ?? r.error}</span>
                            )}
                            {v && (
                                <span className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-500">
                                        {Math.round((r?.probability_satisfied ?? 0) * 100)}% satisfied
                                    </span>
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${v.style}`}>
                                        {v.label}
                                    </span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}