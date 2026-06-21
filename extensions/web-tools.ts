/**
 * Web access for the multi-agent-research recipe.
 *
 * This is the only data source the research system has. Pi ships no built-in
 * web tools and no native web search, so this extension provides both
 * capabilities as real client-side tools (the lead and every research subagent
 * depend on them), reusing Claude Code's well-tuned tool prompts:
 *
 *   - `WebFetch`  — retrieve a URL with the runtime's native `fetch()` and
 *                   return its text for the agent to read.
 *   - `WebSearch` — web search backed by the Parallel AI Search API
 *                   (https://docs.parallel.ai). Requires `PARALLEL_API_KEY`.
 *
 * Configuration (env):
 *   PARALLEL_API_KEY            required for WebSearch
 *   PARALLEL_SEARCH_PROCESSOR   processor tier: "base" (default) or "pro"
 *   PARALLEL_SEARCH_MAX_RESULTS max results per search (default 5)
 */

import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// --- Claude Code tool prompts (reused verbatim) ---

const WEB_FETCH_DESCRIPTION = `
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL. You should then make a new WebFetch request with the redirect URL to fetch the content.
  - For GitHub URLs, prefer using the gh CLI via bash instead (e.g., gh pr view, gh issue view, gh api).
`;

function webSearchDescription(): string {
  const now = new Date();
  const monthYear = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response

Usage notes:
  - Domain filtering is supported to include or block specific websites

IMPORTANT - Use the correct year in search queries:
  - The current month is ${monthYear}. You MUST use this year when searching for recent information, documentation, or current events.
`;
}

// --- WebFetch params ---

const WebFetchParams = Type.Object({
  url: Type.String({ description: "The URL to fetch content from. Must be a fully-formed valid URL." }),
  prompt: Type.String({ description: "What information to extract from the page." }),
});

// --- WebSearch params (mirrors Claude Code's WebSearch) ---

const WebSearchParams = Type.Object({
  query: Type.String({ description: "The search query to use", minLength: 2 }),
  allowed_domains: Type.Optional(
    Type.Array(Type.String(), { description: "Only include search results from these domains" }),
  ),
  blocked_domains: Type.Optional(
    Type.Array(Type.String(), { description: "Never include search results from these domains" }),
  ),
});

const MAX_FETCH_BYTES = 600_000;
const MAX_RETURN_CHARS = 100_000;
const PARALLEL_SEARCH_URL = "https://api.parallel.ai/v1/search";

interface ParallelSearchResult {
  url: string;
  title?: string;
  excerpts?: string[];
  publish_date?: string | null;
}

/** Strip scripts/styles/tags into rough plain text. The model does the extraction. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domains: string[]): boolean {
  return domains.some((d) => {
    const needle = d.replace(/^www\./, "").toLowerCase();
    return host === needle || host.endsWith(`.${needle}`);
  });
}

const extension: ExtensionFactory = (pi: ExtensionAPI) => {
  // --- WebFetch: native fetch client tool ---
  pi.registerTool({
    name: "WebFetch",
    label: "Web Fetch",
    description: WEB_FETCH_DESCRIPTION,
    promptSnippet: "Fetch and read the contents of a URL.",
    parameters: WebFetchParams,
    async execute(_toolCallId, params, signal) {
      let url = params.url.trim();
      if (url.startsWith("http://")) url = `https://${url.slice("http://".length)}`;
      if (!url.startsWith("https://")) {
        return { content: [{ type: "text", text: `Invalid URL: ${params.url}` }], isError: true };
      }
      try {
        const res = await fetch(url, {
          signal,
          redirect: "follow",
          headers: { "User-Agent": "multi-agent-research-pi-recipe/0.1 (+webfetch)" },
        });
        const finalHost = hostOf(res.url);
        if (finalHost && finalHost !== hostOf(url)) {
          return {
            content: [
              {
                type: "text",
                text: `Redirected to a different host: ${res.url}\nMake a new WebFetch request with this URL to fetch the content.`,
              },
            ],
          };
        }
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Fetch failed: ${res.status} ${res.statusText} for ${url}` }],
            isError: true,
          };
        }
        const contentType = res.headers.get("content-type") ?? "";
        const buf = await res.arrayBuffer();
        const raw = new TextDecoder("utf-8").decode(buf.slice(0, MAX_FETCH_BYTES));
        const isHtml = contentType.includes("html") || /^\s*<!doctype html|<html[\s>]/i.test(raw);
        let text = isHtml ? htmlToText(raw) : raw;
        if (text.length > MAX_RETURN_CHARS) {
          text = `${text.slice(0, MAX_RETURN_CHARS)}\n\n[truncated at ${MAX_RETURN_CHARS} chars]`;
        }
        return { content: [{ type: "text", text: `Fetched ${url}\nPrompt: ${params.prompt}\n\n${text}` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Fetch error for ${url}: ${message}` }], isError: true };
      }
    },
  });

  // --- WebSearch: Parallel AI Search API ---
  pi.registerTool({
    name: "WebSearch",
    label: "Web Search",
    description: webSearchDescription(),
    promptSnippet: "Search the web for up-to-date information.",
    parameters: WebSearchParams,
    async execute(_toolCallId, params, signal) {
      const apiKey = process.env.PARALLEL_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "WebSearch is unavailable: PARALLEL_API_KEY is not set. Add it to the recipe environment to enable web search via the Parallel AI Search API (https://docs.parallel.ai).",
            },
          ],
          isError: true,
        };
      }

      const processor = process.env.PARALLEL_SEARCH_PROCESSOR || "base";
      const maxResults = Number(process.env.PARALLEL_SEARCH_MAX_RESULTS) || 5;

      let body: { search_id?: string; results?: ParallelSearchResult[] };
      try {
        const res = await fetch(PARALLEL_SEARCH_URL, {
          method: "POST",
          signal,
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            objective: params.query,
            search_queries: [params.query],
            processor,
            max_results: maxResults,
            max_chars_per_result: 1500,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return {
            content: [
              { type: "text", text: `WebSearch failed: ${res.status} ${res.statusText}${detail ? `\n${detail.slice(0, 500)}` : ""}` },
            ],
            isError: true,
          };
        }
        body = (await res.json()) as { search_id?: string; results?: ParallelSearchResult[] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `WebSearch error: ${message}` }], isError: true };
      }

      let results = body.results ?? [];
      // Client-side domain filtering (allowed_domains and blocked_domains are mutually exclusive).
      if (params.allowed_domains?.length) {
        results = results.filter((r) => matchesDomain(hostOf(r.url), params.allowed_domains!));
      }
      if (params.blocked_domains?.length) {
        results = results.filter((r) => !matchesDomain(hostOf(r.url), params.blocked_domains!));
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No web results for: "${params.query}".` }] };
      }

      const blocks = results.map((r, i) => {
        const title = r.title?.trim() || r.url;
        const date = r.publish_date ? ` (published ${r.publish_date})` : "";
        const excerpt = (r.excerpts ?? []).join("\n").trim();
        return `[${i + 1}] [${title}](${r.url})${date}\n${excerpt}`;
      });

      return {
        content: [
          {
            type: "text",
            text: `Search results for "${params.query}":\n\n${blocks.join("\n\n")}\n\nRemember to cite the URLs you use in a "Sources:" section.`,
          },
        ],
      };
    },
  });
};

export default extension;
