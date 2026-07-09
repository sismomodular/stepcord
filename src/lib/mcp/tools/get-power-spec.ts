import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_power_spec",
  title: "Get device power spec",
  description:
    "Return the audited DC power spec (voltage, current, polarity, connector) for a device. Data used by Stepcord's safety guard — never power hardware from unaudited values.",
  inputSchema: {
    query: z.string().min(1).describe("Device id, or 'Brand Model' text (e.g. 'Moog Mother-32')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }) => {
    const { POWER_DB } = await import("../../../data/devicePower");
    const q = query.toLowerCase().trim();
    const match =
      POWER_DB.find((p) => p.id.toLowerCase() === q) ??
      POWER_DB.find((p) => `${p.brand} ${p.model}`.toLowerCase() === q) ??
      POWER_DB.find((p) => `${p.brand} ${p.model}`.toLowerCase().includes(q));

    if (!match) {
      return { content: [{ type: "text", text: `No audited power spec for '${query}'.` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(match, null, 2) }],
      structuredContent: { spec: match },
    };
  },
});
