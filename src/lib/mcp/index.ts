import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchDevices from "./tools/search-devices";
import getDevice from "./tools/get-device";
import getPowerSpec from "./tools/get-power-spec";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "stepcord-mcp",
  title: "Stepcord MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Stepcord device catalog and power-safety database. Use `search_devices` to browse synths, drum machines, samplers and grooveboxes, `get_device` for full details, and `get_power_spec` for audited DC voltage/polarity/connector info.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchDevices, getDevice, getPowerSpec],
});
