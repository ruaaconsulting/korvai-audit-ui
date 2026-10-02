"use client";

import { useStreamContext } from "@/providers/Stream";

const STAGES = [
    { key: "baseline", label: "1 · Baseline" },
    { key: "charter", label: "2 · Charter" },
    { key: "compare", label: "3 · Compare" },
    { key: "classify", label: "4 · Classify (Jev)" },
    { key: "severity", label: "5 · Severity" },
    { key: "score", label: "6 · Score" },
    { key: "report", label: "7 · Report" },
] as const;

type Status = "pending" | "active" | "halted" | "done";

const ICON: Record<Status, string> = {
    done: "✓",
    active: "●",
    halted: "⚑",
    pending: "○",
};

const COLOR: Record<Status, string> = {
    done: "text-green-600",
    active: "text-blue-600 animate-pulse",
    halted: "text-amber-600",
    pending: "text-gray-400",
};

export function MethodologyStepper() {
    const stream = useStreamContext();

    // 1. Collect every set_stage call the agent made, in order
    const started: { stage: string; note: string }[] = [];
    for (const message of stream.messages) {
        if (message.type !== "ai" || !("tool_calls" in message)) continue;
        for (const call of message.tool_calls ?? []) {
            if (call.name === "set_stage") {
                const args = call.args as { stage?: string; note?: string };
                if (args.stage) {
                    started.push({ stage: args.stage, note: args.note ?? "" });
                }
            }
        }
    }

    if (started.length === 0) return null;

    const latest = started[started.length - 1].stage;
    const running = stream.isLoading;

    // 2. Work out each stage's status
    function statusOf(key: string): Status {
        if (!started.some((s) => s.stage === key)) return "pending";
        if (key === latest && running) return "active";
        if (key === latest && !running && latest !== "report") return "halted";
        return "done";
    }

    function noteOf(key: string): string {
        const found = [...started].reverse().find((s) => s.stage === key);
        return found?.note ?? "";
    }

    // 3. Draw the panel
    return (
        <div className="w-64 shrink-0 border-1 bg-gray-50 p-4">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
                IEM-PM Methodology
            </h2>
            <ol className="space-y-3">
                {STAGES.map((stage) => {
                    const status = statusOf(stage.key);
                    const note = noteOf(stage.key);
                    return (
                        <li key={stage.key} className="flex gap-2">
                            <span className={`w-4 text-center ${COLOR[status]}`}>
                                {ICON[status]}
                            </span>
                            <div>
                                <div
                                    className={`text-sm ${status === "pending" ? "text-gray-400" : "text-gray-900"
                                        }`}
                                >
                                    {stage.label}
                                </div>
                                {note && (
                                    <div className="text-xs text-gray-500">{note}</div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}