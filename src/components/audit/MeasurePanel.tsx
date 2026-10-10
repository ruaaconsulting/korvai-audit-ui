"use client";

import { useStreamContext } from "@/providers/Stream";

type Verdict = "pass" | "raw_gap" | "needs_review";

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

const PILL: Record<Verdict, { label: string; style: string }> = {
  raw_gap: { label: "Gap", style: "bg-[#FBE9E7] text-[#B3261E] font-bold" },
  pass: { label: "Pass", style: "bg-[#E6F4F1] text-[#1E7F74] font-bold" },
  needs_review: { label: "Review", style: "bg-[#FFF8EC] text-[#B86E00] font-bold" },
};

export function MeasurePanel() {
  const stream = useStreamContext();

  // One cell per rule (row) and record (column), filled from check_criterion
  const callArgs = new Map<string, { clause: string; item: string }>();
  const clauses: string[] = [];
  const clauseText = new Map<string, string>();
  const items: string[] = [];
  const cells = new Map<string, { verdict?: Verdict; p?: number; pending: boolean }>();

  for (const message of stream.messages as any[]) {
    if (message.type === "ai" && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.name !== "check_criterion" || !call.id) continue;
        const clause = String(call.args?.clause_id ?? "?");
        const item = String(call.args?.item_id ?? "?");
        callArgs.set(call.id, { clause, item });
        if (!clauses.includes(clause)) clauses.push(clause);
        if (call.args?.requirement) clauseText.set(clause, String(call.args.requirement));
        if (!items.includes(item)) items.push(item);
        cells.set(`${clause}||${item}`, { pending: true });
      }
    }
    if (message.type === "tool" && message.name === "check_criterion") {
      const a = callArgs.get(message.tool_call_id);
      const r = parse(message.content);
      if (a && r) {
        cells.set(`${a.clause}||${a.item}`, {
          verdict: r.verdict,
          p: r.probability_satisfied,
          pending: false,
        });
      }
    }
  }

  if (callArgs.size === 0) return null;

  let gaps = 0;
  let passes = 0;
  let reviews = 0;
  for (const c of cells.values()) {
    if (c.verdict === "raw_gap") gaps++;
    if (c.verdict === "pass") passes++;
    if (c.verdict === "needs_review") reviews++;
  }

  return (
    <section className="m-3 rounded border border-[#DCE1EA] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#DCE1EA] pb-1.5">
        <h2 className="text-[13px] font-semibold text-[#09152e]">Rule vs. record matrix</h2>
        <span className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Stage 3 · Measure</span>
      </div>
      <div className="mt-1.5 text-[11px] text-gray-600">
        {callArgs.size} checks by Jev · {gaps} gap{gaps === 1 ? "" : "s"} · {passes} pass
        {passes === 1 ? "" : "es"} · {reviews} need review
      </div>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-[#DCE1EA] text-[10.5px] font-semibold text-gray-500 uppercase">
              <th className="px-1.5 py-1">Clause</th>
              {items.map((it) => (
                <th key={it} className="px-1 py-1 text-center" title={it}>
                  {it.length > 9 ? it.slice(0, 8) + "…" : it}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE1EA]">
            {clauses.map((cl) => (
              <tr key={cl}>
                <td className="px-1.5 py-1 font-mono font-semibold text-[#09152e]" title={clauseText.get(cl)}>
                  {cl}
                </td>
                {items.map((it) => {
                  const c = cells.get(`${cl}||${it}`);
                  let pill = <span className="inline-block rounded bg-[#EEF2FA] px-1.5 py-0.5 text-[10px] text-gray-500">N/A</span>;
                  if (c && (c.pending || !c.verdict)) {
                    pill = <span className="inline-block animate-pulse rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">…</span>;
                  } else if (c && c.verdict) {
                    const v = PILL[c.verdict];
                    pill = (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${v.style}`}
                        title={`${Math.round((c.p ?? 0) * 100)}% satisfied`}
                      >
                        {v.label}
                      </span>
                    );
                  }
                  return (
                    <td key={it} className="px-1 py-1 text-center">
                      {pill}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[10px] text-gray-500">
        A pass is not a finding. Hover a clause for its text, a cell for Jev&apos;s probability.
      </div>
    </section>
  );
}
