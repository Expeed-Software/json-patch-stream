import { jsonPatchStreamingAgent } from "./agent.js";
import schema from "./schema.json" with { type: "json" };

// Load environment variables from .env
import "dotenv/config";

const USER_PROMPT =
  "Create a profile for Alice Johnson, 35 years old, senior software engineer, email alice.johnson@example.com, living at 123 Market Street, San Francisco, USA.";

for await (const line of jsonPatchStreamingAgent(schema, USER_PROMPT)) {
  console.log(line);
}
