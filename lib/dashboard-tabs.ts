// The full report's tabs, in order (the dashboard template's TABS), and the
// section ids a link can scroll to. Safe to use anywhere.
export const DASHBOARD_TABS = [
  "Financial Overview", "Organisation & People", "Balance Sheet & Funding", "Strategy & Health",
  "Analytics & Technology", "Peer Comparison", "Product Fit & Playbook", "Recent News",
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

// Section ids per tab, for the research jobs writing summary actions.
export const DASHBOARD_SECTIONS: Record<DashboardTab, string[]> = {
  "Financial Overview": ["fo-theme", "fo-metrics", "fo-charts", "fo-nii", "fo-fees"],
  "Organisation & People": ["op-overview", "op-leadership", "op-structure", "op-market", "op-silo", "op-targets"],
  "Balance Sheet & Funding": ["bs-funding", "bs-deposit-mix", "bs-loans", "bs-maturity", "bs-sales", "bs-suite"],
  "Strategy & Health": ["sh-themes", "sh-pillars", "sh-swot", "sh-timing"],
  "Analytics & Technology": ["at-angle", "at-dii", "at-gaps", "at-maturity", "at-platforms"],
  "Peer Comparison": ["pc-snapshot", "pc-table", "pc-nim", "pc-deposit", "pc-efficiency", "pc-leads", "pc-watchlist"],
  "Product Fit & Playbook": ["pp-plan", "pp-valueprops", "pp-discovery", "pp-proofpoints", "pp-landmines", "pp-emails", "pp-agenda", "pp-calc"],
  "Recent News": ["n-news", "n-press", "n-qa", "n-themes-analyst", "n-ratings", "n-timing"],
};
