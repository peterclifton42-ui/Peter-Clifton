import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bank page reads the dashboard template from reference/ at request time.
  outputFileTracingIncludes: {
    "/banks/[slug]": ["./reference/SHELL_TOP.html", "./reference/SHELL_BOTTOM.html"],
  },
  outputFileTracingExcludes: {
    "*": ["./reference/**/*.xls"],
  },
};

export default nextConfig;
