import type { Metadata } from "next";
import Link from "next/link";
import { findLink } from "@/lib/accounts";
import { NAME_UNDER_LOGO } from "@/lib/brand";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password" };

type Props = { params: Promise<{ token: string }> };

// Where invite and reset emails land. Open to anyone holding a valid link.
export default async function WelcomePage({ params }: Props) {
  const { token } = await params;
  const admin = adminConfigured() ? createAdminClient() : null;
  const found = admin ? await findLink(admin, token) : { problem: "Sign-up isn't set up yet. Ask your admin." };

  if ("problem" in found) {
    return (
      <main className="login-wrap">
        <div className="panel login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img className="login-logo" src="/curinos-logo.svg" alt="Curinos" width={117} height={26} />
          <h1>{NAME_UNDER_LOGO}</h1>
          <p className="sub">{found.problem}</p>
          <p><Link href="/login/forgot">Get a new link</Link> or ask your admin to resend your invite.</p>
        </div>
      </main>
    );
  }

  const { data } = await admin!.auth.admin.getUserById(found.link.user_id);
  const invite = found.link.kind === "invite";
  return (
    <main className="login-wrap">
      <div className="panel login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img className="login-logo" src="/curinos-logo.svg" alt="Curinos" width={117} height={26} />
        <h1>{invite ? `Welcome to ${NAME_UNDER_LOGO}` : "Choose a new password"}</h1>
        <p className="sub">
          {invite ? "Choose a password to finish setting up your account." : "Choose a new password for your account."}
          {data.user?.email && <> You&apos;ll sign in as <b>{data.user.email}</b>.</>}
        </p>
        <SetPasswordForm token={token} askName={invite} defaultName={(data.user?.user_metadata?.full_name as string | undefined) ?? ""} />
      </div>
    </main>
  );
}
