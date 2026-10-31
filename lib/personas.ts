// Who to target for each Curinos product: the roles in a deal (economic buyer,
// champion, users, influencers) and, for each persona, the titles, title keywords,
// seniority and department a prospecting tool such as Clay searches on.
//
// The 11 personas marked with a `page` are Curinos's own (curinos.com/who-we-help),
// and SITE lists the products each of those pages ties to the persona. The rest of
// the map is a draft from the catalogue and standard bank org structures: it should
// be reviewed by Product Marketing (REVIEWED below) before it is relied on.

export type PersonaId =
  | "cfo" | "treasurer" | "deposits" | "retail" | "commercial" | "wealth" | "lending" | "cmo" | "digital" | "cio" | "distribution"
  | "treasury_mgmt" | "small_business" | "mkt_analytics" | "strategy" | "product" | "finance_analytics" | "ceo";

export type Persona = {
  label: string;
  page?: string; // curinos.com persona page
  department: string;
  seniority: string[]; // Clay-style seniority levels
  titles: string[]; // typical titles at a bank
  cuTitles: string[]; // typical titles at a credit union
  include: string[]; // job-title keywords to search for
  exclude: string[]; // job-title keywords that look similar but aren't the buyer
  note?: string; // how the role changes with size
};

const SITE_BASE = "https://curinos.com/who-we-help/";

export const PERSONAS: Record<PersonaId, Persona> = {
  cfo: {
    label: "Chief Financial Officer", page: `${SITE_BASE}chief-financial-officers`, department: "Finance",
    seniority: ["C-Suite", "EVP"],
    titles: ["Chief Financial Officer", "EVP, Chief Financial Officer", "Head of Finance"],
    cuTitles: ["Chief Financial Officer", "EVP Finance", "VP Finance"],
    include: ["chief financial officer", "cfo", "head of finance"],
    exclude: ["deputy cfo of subsidiary", "assistant"],
    note: "Under $10B the CFO often owns deposit pricing and ALCO directly; above $50B they sponsor and a pricing or treasury team runs the work.",
  },
  treasurer: {
    label: "Treasurer / balance sheet", page: `${SITE_BASE}treasurers`, department: "Treasury (ALM)",
    seniority: ["EVP", "SVP", "Head", "Director"],
    titles: ["Corporate Treasurer", "Head of Asset Liability Management", "Director of Balance Sheet Management", "Head of Funding and Liquidity", "ALCO Chair"],
    cuTitles: ["Treasurer", "Director of ALM", "Chief Investment Officer", "VP Finance and Treasury"],
    include: ["treasurer", "asset liability", "alm", "balance sheet management", "funding", "liquidity", "alco", "interest rate risk"],
    exclude: ["treasury management", "treasury services", "cash management sales"],
    note: "Not the same as Treasury Management (the commercial cash management business).",
  },
  deposits: {
    label: "Head of Deposits", page: `${SITE_BASE}heads-of-deposits`, department: "Deposits / pricing",
    seniority: ["EVP", "SVP", "Head", "Director"],
    titles: ["Head of Deposits", "Director of Deposit Pricing", "Head of Consumer Deposits", "Deposit Strategy Director", "Pricing Strategy Manager"],
    cuTitles: ["VP Deposits", "Director of Deposit Strategy", "VP Share Products", "Pricing Manager"],
    include: ["deposit", "deposits", "deposit pricing", "deposit strategy", "pricing strategy", "share products"],
    exclude: ["deposit operations", "deposit processing", "teller", "deposit services specialist"],
  },
  retail: {
    label: "Head of Retail Banking", page: `${SITE_BASE}heads-of-retail`, department: "Retail / consumer banking",
    seniority: ["C-Suite", "EVP", "SVP", "Head"],
    titles: ["Head of Retail Banking", "Chief Consumer Banking Officer", "EVP Consumer Banking", "President, Retail Bank"],
    cuTitles: ["Chief Retail Officer", "Chief Member Experience Officer", "SVP Member Services"],
    include: ["retail banking", "consumer banking", "head of retail", "chief consumer", "chief retail", "member experience"],
    exclude: ["retail store", "retail sales associate"],
  },
  commercial: {
    label: "Head of Commercial & Business Banking", page: `${SITE_BASE}heads-of-commercial-and-business-banking`, department: "Commercial banking",
    seniority: ["C-Suite", "EVP", "SVP", "Head"],
    titles: ["Head of Commercial Banking", "Chief Banking Officer", "EVP Commercial Banking", "Head of Business Banking", "Head of Middle Market"],
    cuTitles: ["Chief Business Services Officer", "VP Business Services", "VP Member Business Lending"],
    include: ["commercial banking", "business banking", "middle market", "chief banking officer", "business services"],
    exclude: ["commercial real estate appraiser", "commercial loan processor"],
  },
  wealth: {
    label: "Head of Wealth & Private Banking", page: `${SITE_BASE}heads-of-wealth-and-private-banking`, department: "Wealth / private banking",
    seniority: ["C-Suite", "EVP", "SVP", "Head", "Director"],
    titles: ["Head of Wealth Management", "President, Private Bank", "Head of Trust and Investment Management", "Head of Brokerage Cash and Sweep", "Wealth Deposit Product Head"],
    cuTitles: ["VP Investment Services", "Director of Wealth Management"],
    include: ["wealth management", "private bank", "private banking", "trust", "investment management", "brokerage", "cash sweep"],
    exclude: ["financial advisor", "wealth advisor", "trust officer"],
  },
  lending: {
    label: "Head of Lending", page: `${SITE_BASE}heads-of-lending`, department: "Lending",
    seniority: ["C-Suite", "EVP", "SVP", "Head", "Director"],
    titles: ["Chief Lending Officer", "Head of Consumer Lending", "Head of Mortgage", "Head of Home Equity", "Director of Loan Pricing"],
    cuTitles: ["Chief Lending Officer", "VP Lending", "VP Mortgage Lending", "VP Consumer Lending"],
    include: ["lending", "chief lending", "mortgage", "home equity", "consumer lending", "loan pricing", "credit card"],
    exclude: ["loan officer", "loan processor", "underwriter", "mortgage loan originator"],
  },
  cmo: {
    label: "Chief Marketing Officer", page: `${SITE_BASE}chief-marketing-officers`, department: "Marketing",
    seniority: ["C-Suite", "EVP", "SVP", "Head"],
    titles: ["Chief Marketing Officer", "Head of Marketing", "EVP Marketing", "Head of Acquisition Marketing"],
    cuTitles: ["Chief Marketing Officer", "VP Marketing", "Chief Growth Officer"],
    include: ["chief marketing officer", "cmo", "head of marketing", "marketing", "chief growth officer"],
    exclude: ["marketing coordinator", "marketing specialist", "mortgage marketing"],
  },
  digital: {
    label: "Head of Digital", page: `${SITE_BASE}heads-of-digital`, department: "Digital",
    seniority: ["C-Suite", "EVP", "SVP", "Head", "Director"],
    titles: ["Chief Digital Officer", "Head of Digital Banking", "Head of Digital Channels", "Director of Digital Product", "Head of Customer Experience"],
    cuTitles: ["Chief Digital Officer", "VP Digital Banking", "VP Digital Experience"],
    include: ["digital", "digital banking", "online banking", "mobile banking", "digital channels", "omnichannel", "customer experience"],
    exclude: ["digital marketing coordinator", "digital banking support"],
  },
  cio: {
    label: "CIO / CTO / data & AI", page: `${SITE_BASE}cios-ctos`, department: "Technology, data & analytics",
    seniority: ["C-Suite", "EVP", "SVP", "Head"],
    titles: ["Chief Information Officer", "Chief Technology Officer", "Chief Data Officer", "Chief Analytics Officer", "Head of Data Science", "Head of AI"],
    cuTitles: ["Chief Information Officer", "Chief Technology Officer", "VP Data and Analytics"],
    include: ["chief information officer", "chief technology officer", "chief data", "chief analytics", "data science", "artificial intelligence", "head of analytics"],
    exclude: ["it support", "help desk", "network administrator"],
    note: "Influences anything that touches the bank's data or decisioning (Curinos One, optimizers); rarely the buyer.",
  },
  distribution: {
    label: "Head of Distribution", page: `${SITE_BASE}heads-of-distribution`, department: "Distribution / branch network",
    seniority: ["EVP", "SVP", "Head", "Director"],
    titles: ["Head of Distribution", "Head of Branch Network", "Director of Branch Strategy", "Head of Retail Network and Sales", "Director of Workforce Planning"],
    cuTitles: ["VP Branch Operations", "Chief Retail Officer", "VP Branch Network"],
    include: ["distribution", "branch network", "branch strategy", "retail network", "workforce", "sales and service", "branch performance"],
    exclude: ["branch manager", "teller", "distribution center"],
  },
  treasury_mgmt: {
    label: "Head of Treasury Management", department: "Commercial: treasury management",
    seniority: ["EVP", "SVP", "Head", "Director"],
    titles: ["Head of Treasury Management", "Treasury Management Product Manager", "Head of Cash Management", "Treasury Services Pricing Manager"],
    cuTitles: ["VP Business Services", "Treasury Management Manager"],
    include: ["treasury management", "cash management", "treasury services", "payments product", "commercial deposits"],
    exclude: ["treasury management officer", "treasury management sales", "treasury management specialist"],
  },
  small_business: {
    label: "Head of Small Business Banking", department: "Small business banking",
    seniority: ["EVP", "SVP", "Head", "Director"],
    titles: ["Head of Small Business Banking", "Director of Business Banking Products", "Head of SBA Lending"],
    cuTitles: ["VP Member Business Services", "Business Services Manager"],
    include: ["small business", "business banking", "sba"],
    exclude: ["small business banker", "relationship manager"],
  },
  mkt_analytics: {
    label: "Marketing analytics & acquisition", department: "Marketing analytics",
    seniority: ["SVP", "Head", "Director", "Manager"],
    titles: ["Head of Marketing Analytics", "Director of Customer Analytics", "Head of Acquisition and Growth", "Director of Marketing Effectiveness", "CRM and Customer Insight Lead"],
    cuTitles: ["Marketing Analytics Manager", "Director of Member Insights"],
    include: ["marketing analytics", "customer analytics", "acquisition", "growth", "marketing effectiveness", "customer insight", "crm"],
    exclude: ["coordinator", "intern"],
  },
  strategy: {
    label: "Strategy & corporate development", department: "Strategy / M&A",
    seniority: ["C-Suite", "EVP", "SVP", "Head"],
    titles: ["Chief Strategy Officer", "Head of Corporate Development", "Head of M&A Integration", "Head of Transformation"],
    cuTitles: ["Chief Strategy Officer", "VP Strategy", "Merger Integration Lead"],
    include: ["strategy", "corporate development", "m&a", "mergers", "integration", "transformation"],
    exclude: ["strategy analyst intern"],
  },
  product: {
    label: "Product management", department: "Product",
    seniority: ["SVP", "Head", "Director", "Manager"],
    titles: ["Head of Deposit Products", "Director of Product Management", "Head of Consumer Products", "Product Development Director"],
    cuTitles: ["VP Products", "Product Manager"],
    include: ["product management", "product development", "head of products", "product strategy", "deposit products"],
    exclude: ["product support", "product specialist"],
  },
  finance_analytics: {
    label: "FP&A, profitability & pricing analytics", department: "Finance analytics",
    seniority: ["Director", "Manager", "Senior"],
    titles: ["Director of FP&A", "Head of Profitability and MIS", "Pricing Analytics Manager", "Senior Financial Analyst, Pricing"],
    cuTitles: ["Financial Analyst", "Director of Financial Planning"],
    include: ["fp&a", "financial planning", "profitability", "pricing analyst", "pricing analytics", "management reporting", "mis"],
    exclude: ["accounts payable", "payroll"],
    note: "The day-to-day users; worth finding once a sponsor is engaged.",
  },
  ceo: {
    label: "CEO / President", department: "Executive",
    seniority: ["C-Suite"],
    titles: ["Chief Executive Officer", "President", "Chief Operating Officer"],
    cuTitles: ["President and CEO", "Chief Operating Officer"],
    include: ["chief executive officer", "ceo", "president", "chief operating officer"],
    exclude: ["vice president", "regional president"],
    note: "Signs or sponsors advisory work and large programmes; otherwise an influencer.",
  },
};

export const ROLES = ["buyer", "champion", "users", "influencers"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  buyer: "Economic buyer", champion: "Champion", users: "Users", influencers: "Influencers",
};
export const ROLE_HELP: Record<Role, string> = {
  buyer: "Owns the budget and signs.",
  champion: "Owns the problem day to day and sells it internally.",
  users: "Uses the product every week.",
  influencers: "Shapes or can block the decision.",
};

type Map = Record<Role, PersonaId[]> & { note?: string };
const m = (buyer: PersonaId[], champion: PersonaId[], users: PersonaId[], influencers: PersonaId[], note?: string): Map =>
  ({ buyer, champion, users, influencers, note });

// Product -> roles. Keys are catalogue slugs (lib/catalogue.json).
export const PRODUCT_PERSONAS: Record<string, Map> = {
  "pricing-data": m(["cfo", "treasurer"], ["deposits", "lending"], ["finance_analytics", "product"], ["retail", "wealth", "digital"]),
  "commercial-data": m(["commercial"], ["treasury_mgmt"], ["finance_analytics", "product"], ["cfo", "treasurer"]),
  "retail-deposit-analyzer": m(["deposits", "retail"], ["product"], ["finance_analytics"], ["cfo", "treasurer", "digital", "cmo"]),
  "retail-deposit-optimizer": m(["cfo", "deposits"], ["product"], ["finance_analytics"], ["treasurer", "retail", "cio"]),
  "deposit-optimizer-essentials": m(["cfo"], ["deposits"], ["finance_analytics"], ["ceo", "retail"], "Smaller institutions: the CFO usually owns deposit pricing, so go to them first."),
  "small-business-deposit-analyzer": m(["commercial"], ["small_business"], ["finance_analytics", "product"], ["deposits", "cfo"]),
  "commercial-analyzer": m(["commercial"], ["treasury_mgmt"], ["finance_analytics"], ["cfo", "treasurer"]),
  "commercial-optimizer": m(["commercial", "cfo"], ["treasury_mgmt"], ["finance_analytics"], ["treasurer", "cio"]),
  "treasury-management-fee-analyzer": m(["commercial"], ["treasury_mgmt"], ["finance_analytics", "product"], ["cfo", "treasurer"]),
  "wealth-analyzer": m(["wealth"], ["product"], ["finance_analytics"], ["cfo", "treasurer"]),
  "wealth-optimizer": m(["wealth", "cfo"], ["product"], ["finance_analytics"], ["treasurer", "cio"]),
  "wealth-cash-analyzer-optimizer-suite": m(["wealth"], ["product"], ["finance_analytics"], ["treasurer", "cfo"], "Brokerage cash and sweep: find the head of brokerage or the sweep product owner."),
  "treasury-analyzer": m(["cfo"], ["treasurer"], ["finance_analytics"], ["deposits"]),
  "lendersbenchmark-analyzer": m(["lending"], ["product"], ["finance_analytics"], ["cfo", "treasurer"]),
  "lendersbenchmark-analyzer-for-small-business-lending": m(["commercial"], ["small_business"], ["finance_analytics"], ["lending"]),
  "lenders-optimizer": m(["lending", "cfo"], ["product"], ["finance_analytics"], ["treasurer", "cio"], "Unlisted: confirm availability with Product Marketing before prospecting."),
  "marketing-analyzer": m(["cmo"], ["mkt_analytics"], ["finance_analytics"], ["retail", "distribution", "cfo"]),
  "distribution-analyzer": m(["distribution"], ["retail"], ["finance_analytics"], ["cfo", "cmo"]),
  "distribution-optimizer": m(["distribution"], ["strategy"], ["finance_analytics"], ["retail", "cfo"]),
  "digital-banking-analyzer": m(["digital"], ["product"], ["mkt_analytics"], ["cmo", "retail", "cio"]),
  "ebenchmarkers-banking": m(["digital"], ["product"], ["mkt_analytics"], ["cmo"], "UK only: not for US institutions."),
  "commercial-digital-analyzer": m(["digital", "commercial"], ["treasury_mgmt"], ["product"], ["cio"], "Unlisted: confirm availability with Product Marketing before prospecting."),
  "profitability-optimizer": m(["cfo"], ["finance_analytics"], ["finance_analytics"], ["treasurer", "retail", "commercial"], "Unlisted: confirm availability with Product Marketing before prospecting."),
  "curinos-one-capture": m(["cmo", "retail"], ["mkt_analytics"], ["mkt_analytics", "product"], ["cio", "cfo", "deposits"]),
  "curinos-one-compound": m(["retail", "cmo"], ["deposits"], ["mkt_analytics"], ["cio", "cfo", "digital"]),
  "curinos-one-commit": m(["retail"], ["mkt_analytics"], ["product"], ["cio", "cmo"], "Roadmap (coming soon): for early conversations only."),
  "curinos-one-conserve": m(["retail", "deposits"], ["mkt_analytics"], ["product"], ["cio", "cfo"], "Roadmap (coming soon): for early conversations only."),
  "curinos-one-calibrate": m(["deposits", "cfo"], ["product"], ["finance_analytics"], ["cio", "treasurer"], "Roadmap (coming soon): for early conversations only."),
  "advisory-pricing-strategy-and-optimization": m(["cfo", "deposits"], ["product"], ["finance_analytics"], ["treasurer", "retail", "ceo"]),
  "advisory-treasury-and-balance-sheet-management": m(["cfo"], ["treasurer"], ["finance_analytics"], ["ceo"]),
  "advisory-value-proposition": m(["retail"], ["product"], ["mkt_analytics"], ["ceo", "cmo", "digital"]),
  "advisory-market-playbook": m(["strategy", "retail"], ["distribution"], ["mkt_analytics"], ["ceo", "cmo", "commercial"]),
  "advisory-product-design": m(["retail"], ["product"], ["finance_analytics"], ["deposits", "cmo"]),
  "advisory-network-optimization": m(["distribution"], ["strategy"], ["finance_analytics"], ["ceo", "cfo", "retail"]),
  "advisory-manda-support": m(["ceo", "cfo"], ["strategy"], ["finance_analytics"], ["retail", "commercial"]),
  "advisory-commercial-strategy": m(["commercial"], ["treasury_mgmt"], ["finance_analytics"], ["ceo", "cfo"]),
  "advisory-marketing-investment-planning": m(["cmo"], ["mkt_analytics"], ["finance_analytics"], ["cfo"]),
};

// Products each curinos.com persona page links to (read 31 October 2026).
export const SITE: Partial<Record<PersonaId, string[]>> = {
  cfo: ["curinos-one-capture", "curinos-one-compound", "retail-deposit-analyzer", "retail-deposit-optimizer", "lendersbenchmark-analyzer", "distribution-analyzer", "marketing-analyzer", "digital-banking-analyzer", "pricing-data"],
  treasurer: ["treasury-analyzer", "treasury-management-fee-analyzer", "lendersbenchmark-analyzer", "pricing-data", "retail-deposit-optimizer"],
  deposits: ["curinos-one-capture", "curinos-one-compound", "retail-deposit-analyzer", "retail-deposit-optimizer", "pricing-data", "lendersbenchmark-analyzer", "distribution-analyzer", "marketing-analyzer"],
  retail: ["curinos-one-capture", "curinos-one-compound", "retail-deposit-analyzer", "retail-deposit-optimizer", "lendersbenchmark-analyzer", "distribution-analyzer", "marketing-analyzer", "digital-banking-analyzer", "pricing-data"],
  commercial: ["commercial-analyzer", "commercial-optimizer", "treasury-management-fee-analyzer", "lendersbenchmark-analyzer-for-small-business-lending", "small-business-deposit-analyzer", "commercial-data", "digital-banking-analyzer"],
  wealth: ["wealth-analyzer", "wealth-optimizer", "wealth-cash-analyzer-optimizer-suite", "pricing-data"],
  digital: ["digital-banking-analyzer", "retail-deposit-analyzer", "retail-deposit-optimizer", "pricing-data", "distribution-analyzer"],
  cmo: ["curinos-one-capture", "curinos-one-compound", "marketing-analyzer", "digital-banking-analyzer", "retail-deposit-analyzer", "retail-deposit-optimizer"],
  cio: ["curinos-one-capture", "curinos-one-compound", "retail-deposit-analyzer", "retail-deposit-optimizer", "pricing-data", "digital-banking-analyzer"],
  lending: ["curinos-one-capture", "curinos-one-compound", "lendersbenchmark-analyzer", "lendersbenchmark-analyzer-for-small-business-lending", "pricing-data"],
  distribution: ["distribution-analyzer", "distribution-optimizer", "marketing-analyzer"],
};

// Set once Product Marketing has reviewed a product's map.
export const REVIEWED = new Set<string>([]);

export const onCurinosSite = (persona: PersonaId, productSlug: string) => Boolean(SITE[persona]?.includes(productSlug));

export type PersonaLine = { role: Role; id: PersonaId; persona: Persona; site: boolean };

// The roles for one product, buyer first.
export function personasFor(productSlug: string): { lines: PersonaLine[]; note?: string; reviewed: boolean } | null {
  const map = PRODUCT_PERSONAS[productSlug];
  if (!map) return null;
  const lines = ROLES.flatMap((role) => map[role].map((id) => ({ role, id, persona: PERSONAS[id], site: onCurinosSite(id, productSlug) })));
  return { lines, note: map.note, reviewed: REVIEWED.has(productSlug) };
}

// Does a named executive's title look like this persona? Used to show who the
// research already found before searching for more.
export function titleMatches(persona: Persona, title: string | null | undefined) {
  const t = ` ${(title ?? "").toLowerCase()} `;
  if (!t.trim()) return false;
  if (persona.exclude.some((x) => t.includes(x))) return false;
  return persona.include.some((k) => k.length <= 4 ? new RegExp(`\\b${k}\\b`).test(t) : t.includes(k));
}
