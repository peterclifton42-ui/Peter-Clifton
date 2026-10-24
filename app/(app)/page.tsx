import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { INSTITUTION_COLUMNS, type Institution } from "@/lib/institutions";
import { Directory } from "./directory";

export const metadata: Metadata = { title: "Banks" };

export default async function DirectoryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("institutions")
    .select(INSTITUTION_COLUMNS)
    .order("assets_b", { ascending: false });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Banks and credit unions</h1>
          <p>Search or filter, then open an institution to see its full dashboard.</p>
        </div>
      </div>
      {error ? (
        <div className="notice error">Couldn&apos;t load the directory: {error.message}</div>
      ) : (
        <Directory institutions={(data ?? []) as Institution[]} />
      )}
    </main>
  );
}
