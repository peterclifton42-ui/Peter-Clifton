import Link from "next/link";
import { SCOPES, type Scope } from "@/lib/insights";

// All / Banks / Credit unions / Following, as links that keep the page.
export function ScopeTabs({ path, scope }: { path: string; scope: Scope }) {
  return (
    <nav className="scope-tabs" aria-label="Which institutions">
      {SCOPES.map((s) => (
        <Link key={s.key} href={s.key === "all" ? path : `${path}?scope=${s.key}`} aria-current={s.key === scope ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
