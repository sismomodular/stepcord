import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_devices",
  title: "Search device catalog",
  description:
    "Search the Stepcord catalog of synthesizers, drum machines, samplers, grooveboxes and modular gear by brand, model, category, type or tag.",
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe("Free-text search over brand, model and tags."),
    brand: z.string().optional().describe("Filter by brand, e.g. 'Korg'."),
    category: z
      .enum([
        "synthesizer",
        "drum_machine",
        "sampler",
        "groovebox",
        "sequencer",
        "modular",
        "workstation",
      ])
      .optional(),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, brand, category, limit }) => {
    const { CATALOG } = await import("../../../data/deviceCatalog");
    const q = query?.toLowerCase().trim();
    const results = CATALOG.filter((d) => {
      if (brand && d.brand.toLowerCase() !== brand.toLowerCase()) return false;
      if (category && d.category !== category) return false;
      if (q) {
        const hay = `${d.brand} ${d.model} ${d.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).slice(0, limit ?? 25);

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} device(s).\n` +
            results.map((d) => `- ${d.brand} ${d.model} (${d.id}) — ${d.category}/${d.type}, ${d.year_released}`).join("\n"),
        },
      ],
      structuredContent: { count: results.length, results },
    };
  },
});
