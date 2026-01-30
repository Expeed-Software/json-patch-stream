import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import {
  JSONPatchOperation,
  validateJSONPatch,
} from "./validators/json-patch.validator.js";

export const jsonPatchStreamingAgent = async function* (
  schema: any,
  userPrompt: string,
) {
  const { textStream } = streamText({
    model: openai("gpt-4o-mini"),
    system: `
    You are a JSON patch generator. Your task is to create a valid JSON object that conforms to the provided schema based on the user's request.

    JSON Schema: 
    ${JSON.stringify(schema, null, 2)}

    CRITICAL INSTRUCTIONS:
    1. Output ONLY JSON Patch operations in RFC 6902 format
    2. Output ONE operation per line (JSONL format)
    3. Start from an empty object {} and build it incrementally
    4. Each line must be a valid JSON Patch operation
    5. Do NOT include any explanatory text, markdown, or code blocks
    6. Do NOT include comments or backticks
    7. Ensure the final result conforms to the schema
    8. Build objects before adding their properties (add parent, then children)
    9. Build arrays before adding elements

    JSON Patch operation format:
    {"op": "add", "path": "/property", "value": "value"}

    Example for building a nested structure:
    {"op": "add", "path": "/name", "value": "John Doe"}
    {"op": "add", "path": "/age", "value": 30}
    {"op": "add", "path": "/email", "value": "john@example.com"}
    {"op": "add", "path": "/address", "value": {}}
    {"op": "add", "path": "/address/city", "value": "San Francisco"}
    {"op": "add", "path": "/address/country", "value": "USA"}
    {"op": "add", "path": "/skills", "value": []}
    {"op": "add", "path": "/skills/0", "value": "Python"}
    {"op": "add", "path": "/skills/1", "value": "TypeScript"}
  `,
    prompt: userPrompt,
    temperature: 0.1,
  });

  let buffer = "";

  for await (const textPart of textStream) {
    buffer += textPart;

    // Split by newlines to extract complete JSONL lines
    const lines = buffer.split("\n");

    // Keep the last incomplete line in the buffer
    buffer = lines[lines.length - 1];

    // Process complete lines
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();

      // Validate it's a valid JSON
      const patchOp: JSONPatchOperation = JSON.parse(line);

      // Validate it's a proper patch operation
      const validation = validateJSONPatch([patchOp], schema);
      if (validation.valid) {
        yield line;
      } else {
        // Decide what to do with invalid JSON Patch
        console.error("Invalid JSON Patch operation:", line, validation.errors);
      }
    }
  }
};
