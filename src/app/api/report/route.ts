import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Serves finished audit reports to the browser, ONLY from AUDIT_OUTPUT_DIR.
// Runs on the server (Node), never in the browser.
export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const root = process.env.AUDIT_OUTPUT_DIR;
  if (!root) {
    return new Response("AUDIT_OUTPUT_DIR is not set in the UI's .env.", { status: 500 });
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(root);
  } catch {
    return new Response("The audit output folder does not exist.", { status: 500 });
  }

  const requested = req.nextUrl.searchParams.get("path") ?? "";
  let fileReal: string;
  try {
    fileReal = await fs.realpath(path.resolve(requested));
  } catch {
    return new Response("Report file not found.", { status: 404 });
  }

  // The real path must sit inside the audit output folder (blocks ../ and symlink tricks)
  if (!fileReal.startsWith(rootReal + path.sep)) {
    return new Response("Access denied: reports are served only from the audit output folder.", {
      status: 403,
    });
  }

  const type = TYPES[path.extname(fileReal).toLowerCase()];
  if (!type) {
    return new Response("Only .html, .txt and .json report files can be opened.", { status: 403 });
  }

  const body = await fs.readFile(fileReal);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  };
  if (req.nextUrl.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(fileReal)}"`;
  }
  return new Response(body, { headers });
}
