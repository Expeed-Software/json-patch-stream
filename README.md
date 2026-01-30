# JSON Patch Streaming

An AI-powered agent that streams JSON Patch operations (RFC 6902) to incrementally construct JSON objects conforming to a given schema.

## Features

- **Streaming output** - Generates JSON Patch operations one at a time, enabling real-time UI updates
- **Schema-driven** - Ensures generated JSON conforms to your JSON Schema
- **Validated** - Full validation of JSON Patch operations including JSON Pointer validation for paths

## Installation

```bash
npm install
```

Create a `.env` file with your OpenAI API key:

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

## Usage

Edit the `USER_PROMPT` in `src/index.ts` to change the prompt, then run:

```bash
npm start
```

JSON Patches will be logged to the terminal as they are streamed.

### As a library

```typescript
import { jsonPatchStreamingAgent } from "./agent.js";
import schema from "./schema.json" with { type: "json" };

const prompt = "Create a profile for Alice Johnson, 35 years old, senior software engineer, email alice.johnson@example.com, living at 123 Market Street, San Francisco, USA.";

for await (const patch of jsonPatchStreamingAgent(schema, prompt)) {
  console.log(patch);
  // {"op": "add", "path": "/firstName", "value": "Alice"}
  // {"op": "add", "path": "/lastName", "value": "Johnson"}
  // ...
}
```

## How It Works

1. You provide a JSON Schema and a natural language prompt
2. The agent instructs GPT-4o-mini to generate RFC 6902 JSON Patch operations
3. Each operation is validated against the schema before being yielded
4. Operations stream out in JSONL format (one JSON object per line)

The patches can be applied sequentially to an empty object `{}` to build the final JSON document.

### Example Output

For a user profile schema, the agent might stream:

```json
{"op": "add", "path": "/firstName", "value": "Alice"}
{"op": "add", "path": "/lastName", "value": "Johnson"}
{"op": "add", "path": "/age", "value": 35}
{"op": "add", "path": "/email", "value": "alice@example.com"}
{"op": "add", "path": "/position", "value": "Senior Software Engineer"}
{"op": "add", "path": "/address", "value": {}}
{"op": "add", "path": "/address/street", "value": "123 Market Street"}
{"op": "add", "path": "/address/city", "value": "San Francisco"}
{"op": "add", "path": "/address/country", "value": "USA"}
```

## Schema Format

The agent accepts standard JSON Schema. Example:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer" },
    "email": { "type": "string" }
  },
  "required": ["name", "age", "email"]
}
```

## Project Structure

```bash
src/
  agent.ts                      # Main streaming agent
  index.ts                      # Entry point
  schema.json                   # Example user profile schema
  validators/
    json-patch.validator.ts     # RFC 6902 validation
    json-pointer.validator.ts   # RFC 6901 validation
```

## License

MIT
