import { loadQuestions, type QuestionFilters } from "@/lib/ask/questions";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The Questions page as a spreadsheet, with the same filters.
export async function GET(request: Request) {
  await requireAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams) as QuestionFilters;
  const { rows, people, institutions } = await loadQuestions(await createClient(), params);
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote everything; a leading = + - @ would otherwise run as a spreadsheet formula.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = ["Asked at (UTC)", "Person", "Asked on", "Question", "Answer", "Banks mentioned", "Rating", "Comment", "Shortfall", "Status", "Cost (USD)"];
  const lines = rows.map((r) => [
    r.created_at.slice(0, 16).replace("T", " "), people.get(r.user_id) ?? "", r.context ?? "Ask page", r.question, r.answer ?? r.error ?? "",
    r.banks.map((b) => institutions.get(b) ?? b).join("; "), r.rating === 1 ? "up" : r.rating === -1 ? "down" : "", r.comment ?? "",
    r.shortfall ?? "", r.status, r.cost_usd ?? "",
  ].map(cell).join(","));
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ask-questions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
