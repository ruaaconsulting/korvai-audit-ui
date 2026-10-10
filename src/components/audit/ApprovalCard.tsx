"use client";

import { useState } from "react";
import { useStreamContext } from "@/providers/Stream";

type ActionRequest = {
  name: string;
  args: Record<string, any>;
  description?: string;
};

type Choice = { decision: "approve" | "reject" | null; reason: string };

export const APPROVAL_ACTION = "approve_finding";

// The "why" text comes from the agent's request (tools/approval.py), never hardcoded here
function whyOf(description: string | undefined): string {
  const text = description ?? "";
  const start = text.indexOf("Why this needs your approval");
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.indexOf("\n\n");
  return (end < 0 ? rest : rest.slice(0, end)).replace("Why this needs your approval:", "Why:").trim();
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ApprovalCard({ requests }: { requests: ActionRequest[] }) {
  const thread = useStreamContext();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [date, setDate] = useState(today());
  const [choices, setChoices] = useState<Choice[]>(requests.map(() => ({ decision: null, reason: "" })));
  const [sent, setSent] = useState(false);

  const setChoice = (i: number, patch: Partial<Choice>) =>
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const anyApproved = choices.some((c) => c.decision === "approve");
  const allDecided = choices.every((c) => c.decision !== null);
  const rejectsHaveReasons = choices.every((c) => c.decision !== "reject" || c.reason.trim().length > 0);
  const approverComplete = !anyApproved || (name.trim().length > 0 && date.trim().length > 0);
  const ready = allDecided && rejectsHaveReasons && approverComplete && !sent;

  const submit = () => {
    if (!ready) return;
    const decisions = requests.map((r, i) =>
      choices[i].decision === "approve"
        ? {
            type: "edit",
            edited_action: {
              name: r.name,
              args: { ...r.args, approved_by: name.trim(), approver_role: role.trim(), approval_date: date.trim() },
            },
          }
        : { type: "reject", message: choices[i].reason.trim() },
    );
    setSent(true);
    thread.submit({}, { command: { resume: { decisions } } } as any);
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-2 focus:outline-blue-600";

  return (
    <div className="w-full rounded-xl border-2 border-amber-600 bg-amber-50 p-4 text-sm text-gray-900">
      <div className="font-semibold text-amber-800">Your approval is needed</div>

      <div className="mt-2 space-y-3">
        {requests.map((r, i) => (
          <div key={i} className="rounded-lg border border-amber-200 bg-white p-3">
            <div>
              <span className="font-semibold">
                Severity {r.args.severity} · {r.args.clause_id}
              </span>
              : {r.args.summary}
            </div>
            {whyOf(r.description) && (
              <div className="mt-1 text-xs text-gray-600">{whyOf(r.description)}</div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setChoice(i, { decision: "approve" })}
                className={`rounded-md border px-3 py-1 text-xs font-medium ${
                  choices[i].decision === "approve"
                    ? "border-green-700 bg-green-700 text-white"
                    : "border-gray-400 bg-white text-gray-800"
                }`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setChoice(i, { decision: "reject" })}
                className={`rounded-md border px-3 py-1 text-xs font-medium ${
                  choices[i].decision === "reject"
                    ? "border-red-700 bg-red-700 text-white"
                    : "border-gray-400 bg-white text-gray-800"
                }`}
              >
                Reject
              </button>
              {choices[i].decision === "reject" && (
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Reason for rejecting (required)"
                  value={choices[i].reason}
                  onChange={(e) => setChoice(i, { reason: e.target.value })}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {anyApproved && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs">
            Your name
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </label>
          <label className="text-xs">
            Your role
            <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. PMO Director" />
          </label>
          <label className="text-xs">
            Date
            <input className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </label>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sent ? "Submitted" : "Submit decisions"}
        </button>
        <span className="text-xs text-gray-600">
          {sent
            ? "Recorded by the system, not the AI."
            : choices.some((c) => c.decision === "reject")
              ? "A rejection stops the audit; the report cannot be final."
              : "Decide each finding, then submit."}
        </span>
      </div>
    </div>
  );
}
