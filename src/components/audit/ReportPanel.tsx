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

function reportUrl(path: string, download = false): string {
  return `/api/report?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

export function ReportPanel() {
  const stream = useStreamContext();

  let result: any = null; // the accepted submit_manifest result
  let approvals: any[] = []; // latest recorded human decisions

  for (const message of stream.messages as any[]) {
    if (message.type !== "tool") continue;
    const r = parse(message.content);
    if (!r) continue;
    if (message.name === "submit_manifest" && r.accepted === true) result = r;
    if (message.name === "request_human_approval" && Array.isArray(r.approvals)) approvals = r.approvals;
  }

  if (!result) return null;

  const ris = result.reporting_integrity_score ?? {};
  const files = result.files ?? {};
  const score = typeof ris.score === "number" ? ris.score : null;
  const dash = score === null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <section className="m-3 flex flex-col gap-3 rounded border-2 border-[#09152e] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#DCE1EA] pb-1.5">
        <h2 className="text-[13px] font-semibold text-[#09152e]">Report</h2>
        <span className="text-[10px] font-semibold tracking-wider text-[#1E7F74] uppercase">
          {result.total_findings} finding{result.total_findings === 1 ? "" : "s"}
        </span>
      </div>

      {/* RIS ring + what it means */}
      <div className="flex items-center gap-3 rounded border border-[#DCE1EA] bg-[#F6F7F9] p-2.5">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#DCE1EA" strokeWidth="3.5" />
            <circle
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="#B86E00"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={`${dash}, 100`}
            />
          </svg>
          <div className="absolute flex flex-col items-center leading-none">
            <span className="font-serif text-[22px] font-bold text-[#09152e]">
              {score === null ? "—" : score.toFixed(1)}
            </span>
            <span className="mt-0.5 text-[8px] text-gray-500 uppercase">out of 100</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-[#09152e]">Reporting Integrity Score</span>
          <span className="text-[11px] text-gray-600">
            Calculated by code, never by the AI · {ris.methodology ?? "Weighted Gap Profile"}
          </span>
        </div>
      </div>

      {Array.isArray(ris.limitations) && ris.limitations.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-medium text-[#3558D4]">
            Limitations of this score
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-gray-600">
            {ris.limitations.map((l: string) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      )}

      {approvals.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-[#09152e]">Human approvals (Severity 4–5)</div>
          <ul className="mt-0.5 space-y-0.5 text-[11px]">
            {approvals.map((a: any) => (
              <li key={`${a.clause_id}-${a.artifact_id}`}>
                <span className="font-mono font-semibold">{a.clause_id}</span>:{" "}
                {a.decision === "approved" ? (
                  <span className="text-[#1E7F74]">
                    approved by {a.approved_by} on {a.approval_date}
                  </span>
                ) : (
                  <span className="text-[#B3261E]">
                    {a.decision}
                    {a.message ? ` (${a.message})` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {files.html && (
          <a
            href={reportUrl(files.html)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded bg-[#09152e] px-3 py-2 text-center text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#1f2a44]"
          >
            Open full report
          </a>
        )}
        <div className="grid grid-cols-2 gap-2">
          {files.txt && (
            <a
              href={reportUrl(files.txt, true)}
              className="rounded border border-[#DCE1EA] bg-white px-2 py-1.5 text-center text-[12px] font-semibold text-[#09152e] hover:bg-[#F6F7F9]"
            >
              Download TXT
            </a>
          )}
          {files.json && (
            <a
              href={reportUrl(files.json, true)}
              className="rounded border border-[#DCE1EA] bg-white px-2 py-1.5 text-center text-[12px] font-semibold text-[#09152e] hover:bg-[#F6F7F9]"
            >
              Download JSON
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
