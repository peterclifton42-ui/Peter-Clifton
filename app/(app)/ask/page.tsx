import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { askConfigured } from "@/lib/ask/agent";
import { AskChat } from "./ask-chat";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage() {
  await requireViewer();
  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1>Ask</h1>
          <p>Questions about any bank or credit union, a Curinos product, or the whole market. Every answer links to where it came from.</p>
        </div>
      </div>
      {!askConfigured() && (
        <div className="notice info">The assistant isn&apos;t switched on yet. An admin needs to add <code>ANTHROPIC_API_KEY</code> in Vercel and redeploy.</div>
      )}
      <div className="panel"><AskChat context={null} /></div>
    </main>
  );
}
