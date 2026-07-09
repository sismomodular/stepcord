import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_device",
  title: "Get device details",
  description: "Return full catalog details for a device by its Stepcord catalog id (e.g. 'korg-minilogue-xd').",
  inputSchema: { id: z.string().min(1).describe("Catalog device id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const { CATALOG_BY_ID } = await import("../../../data/deviceCatalog");
    const device = CATALOG_BY_ID[id];
    if (!device) {
      return { content: [{ type: "text", text: `No device found with id '${id}'.` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(device, null, 2) }],
      structuredContent: { device },
    };
  },
});
