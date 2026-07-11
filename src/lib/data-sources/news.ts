export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractTag(block: string, tag: string): string | null {
  const cdataMatch = block.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, "s"),
  );
  if (cdataMatch) return decodeXmlEntities(cdataMatch[1].trim());

  const plainMatch = block.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s"));
  return plainMatch ? decodeXmlEntities(plainMatch[1].trim()) : null;
}

export async function getNewsForFi(
  name: string,
  limit = 8,
): Promise<NewsItem[]> {
  const query = encodeURIComponent(name);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google News RSS fetch failed: ${res.status}`);
  }
  const xml = await res.text();

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return items.slice(0, limit).map((block) => {
    const title = extractTag(block, "title") ?? "Untitled";
    const link = extractTag(block, "link") ?? "";
    const pubDate = extractTag(block, "pubDate");
    const source = extractTag(block, "source");

    return {
      title,
      url: link,
      source,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
    };
  });
}
