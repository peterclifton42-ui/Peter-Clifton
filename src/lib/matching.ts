import Anthropic from "@anthropic-ai/sdk";
import type {
  FiFinancials,
  FinancialInstitution,
  FiNewsItem,
  Product,
} from "@/lib/types";

let cachedClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }
  cachedClient = new Anthropic();
  return cachedClient;
}

export interface ProductMatchResult {
  product_slug: string;
  score: number;
  rationale: string;
}

const MODEL = "claude-opus-4-8";

export async function matchProductsForFi(
  fi: FinancialInstitution,
  financials: FiFinancials | null,
  news: FiNewsItem[],
  products: Product[],
): Promise<ProductMatchResult[]> {
  const client = getAnthropicClient();

  const productCatalog = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    description: p.description,
    target_segments: p.target_segments,
    signals: p.signals,
  }));

  const financialsSummary = financials
    ? {
        source: financials.source,
        as_of_date: financials.as_of_date,
        metrics: financials.metrics,
      }
    : "No financial data available.";

  const newsSummary = news.map((n) => ({
    title: n.title,
    source: n.source,
    published_at: n.published_at,
  }));

  const userPrompt = `Financial institution profile:
${JSON.stringify(
  {
    name: fi.name,
    type: fi.fi_type,
    city: fi.city,
    state: fi.state,
  },
  null,
  2,
)}

Recent financials:
${JSON.stringify(financialsSummary, null, 2)}

Recent news headlines:
${JSON.stringify(newsSummary, null, 2)}

Curinos product catalog:
${JSON.stringify(productCatalog, null, 2)}

Based on this institution's financial profile and recent news, identify which Curinos products are the best fit and why. Consider signals like deposit/asset growth trends, profitability metrics, and news about strategic initiatives, leadership changes, digital transformation, M&A, or competitive pressure. Return every product with a plausible fit (a handful of strong matches, not the whole catalog) ranked by score descending, with a concrete rationale tying specific financial metrics or news items to why that product would help.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_slug: {
                    type: "string",
                    enum: products.map((p) => p.slug),
                  },
                  score: {
                    type: "integer",
                    description: "Fit score from 0-100",
                  },
                  rationale: {
                    type: "string",
                    description:
                      "1-3 sentences citing specific financial metrics or news items",
                  },
                },
                required: ["product_slug", "score", "rationale"],
                additionalProperties: false,
              },
            },
          },
          required: ["matches"],
          additionalProperties: false,
        },
      },
    },
    system:
      "You are a client intelligence analyst at Curinos, a financial services data and analytics company. You map financial institutions to the Curinos products that would help them most, grounded strictly in the financial data and news provided.",
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model.");
  }

  const parsed = JSON.parse(textBlock.text) as { matches: ProductMatchResult[] };
  return parsed.matches.sort((a, b) => b.score - a.score);
}

export { MODEL as MATCHING_MODEL };
