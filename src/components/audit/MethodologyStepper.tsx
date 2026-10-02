"use client";

import { useStreamContext } from "@/providers/Stream";

type StageDef = {
    number: number;
    key: string;
    name: string;
    performed_by: string;
};

type Status = "pending" | "active" | "halted" | "done" | "code";

const ICON: Record<Status, string> = {
    done: "✓",
    active: "●",
    halted: "⚑",
    pending: "○",
    code: "⚙",
};

const COLOR: Record<Status, string> = {
    done: "text-green-600",
    active: "text-blue-600 animate-pulse",
    halted: "text-amber-600",
    pending: "text-gray-400",
    code: "text-gray-400",
};

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

    // Stage list comes from the agent (audit-stages.yaml), never hardcoded here
    let stages: StageDef[] = [];
    let sourceVersion = "";
    const started: { stage: string; note: string }[] = [];

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
    }

    if (started.length === 0 || stages.length === 0) return null;

    const latest = started[started.length - 1].stage;
    const running = stream.isLoading;
    const lastJudgment = [...stages].reverse().find((s) => s.performed_by === "judgment")?.key;

    function statusOf(s: StageDef): Status {
        if (s.performed_by !== "judgment") return "code";
        if (!started.some((x) => x.stage === s.key)) return "pending";
        if (s.key === latest && running) return "active";
        if (s.key === latest && !running && latest !== lastJudgment) return "halted";
        return "done";
    }

    function noteOf(key: string): string {
        return [...started].reverse().find((x) => x.stage === key)?.note ?? "";
    }

    return (
        <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-900">IEM-PM Methodology</h2>
            {sourceVersion && (
                <div className="mb-4 text-[10px] text-gray-500">audit-stages v{sourceVersion}</div>
            )}
            <ol className="space-y-3">
                {stages.map((s) => {
                    const status = statusOf(s);
                    const note = noteOf(s.key);
                    return (
                        <li key={s.key} className="flex gap-2">
                            <span className={`w-4 text-center ${COLOR[status]}`}>{ICON[status]}</span>
                            <div>
                                <div
                                    className={`text-sm ${status === "pending" || status === "code" ? "text-gray-400" : "text-gray-900"
                                        }`}
                                >
                                    {s.number} · {s.name}
                                </div>
                                {status === "code" && (
                                    <div className="text-[10px] text-gray-400">Deterministic: performed by code (not yet built)</div>
                                )}
                                {note && <div className="text-xs text-gray-500">{note}</div>}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}