// The project URL and publishable key are designed to be public: every request is
// still checked against the database's row-level security rules. They can be
// overridden with environment variables if the app moves to another project.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zwevbnccqixavejvlwhb.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_6iJSs4ir5wQ9sEyF16tjJA_vGG6Mikn";
