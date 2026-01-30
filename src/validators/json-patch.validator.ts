import { validateJSONPointer, JSONSchema } from "./json-pointer.validator.js";

export type JSONPatchOperation =
  | { op: "add"; path: string; value: any }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: any }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: any };

interface ValidationError {
  operation: number;
  error: string;
}

interface PatchValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a JSON Patch array against a JSON Schema
 * @param patch - Array of JSON Patch operations
 * @param schema - JSON Schema to validate against
 * @returns Validation result with any errors found
 */
export function validateJSONPatch(
  patch: JSONPatchOperation[],
  schema: JSONSchema,
): PatchValidationResult {
  const errors: ValidationError[] = [];

  if (!Array.isArray(patch)) {
    return {
      valid: false,
      errors: [{ operation: -1, error: "Patch must be an array" }],
    };
  }

  for (let i = 0; i < patch.length; i++) {
    const operation = patch[i];
    const operationErrors = validateOperation(operation, schema, i);
    errors.push(...operationErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateOperation(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate operation structure
  if (!operation || typeof operation !== "object") {
    errors.push({
      operation: index,
      error: "Operation must be an object",
    });
    return errors;
  }

  if (!operation.op) {
    errors.push({
      operation: index,
      error: 'Operation must have an "op" property',
    });
    return errors;
  }

  const validOps = ["add", "remove", "replace", "move", "copy", "test"];
  if (!validOps.includes(operation.op)) {
    errors.push({
      operation: index,
      error: `Invalid operation "${operation.op}". Must be one of: ${validOps.join(", ")}`,
    });
    return errors;
  }

  // Validate based on operation type
  switch (operation.op) {
    case "add":
      errors.push(...validateAdd(operation, schema, index));
      break;
    case "remove":
      errors.push(...validateRemove(operation, schema, index));
      break;
    case "replace":
      errors.push(...validateReplace(operation, schema, index));
      break;
    case "move":
      errors.push(...validateMove(operation, schema, index));
      break;
    case "copy":
      errors.push(...validateCopy(operation, schema, index));
      break;
    case "test":
      errors.push(...validateTest(operation, schema, index));
      break;
  }

  return errors;
}

function validateAdd(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Add operation must have a "path" property',
    });
    return errors;
  }

  if (!("value" in operation)) {
    errors.push({
      operation: index,
      error: 'Add operation must have a "value" property',
    });
    return errors;
  }

  // Validate path format
  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
    return errors;
  }

  // For add operations, we need to validate the parent path exists
  // and that the target can be added
  const pathValid = validateAddPath(operation.path, schema);
  if (!pathValid.valid) {
    errors.push({
      operation: index,
      error: pathValid.error,
    });
  }

  return errors;
}

function validateRemove(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Remove operation must have a "path" property',
    });
    return errors;
  }

  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
    return errors;
  }

  // Validate the path exists in schema
  if (!validateJSONPointer(operation.path, schema)) {
    errors.push({
      operation: index,
      error: `Path "${operation.path}" is not valid according to schema`,
    });
  }

  // Check if removing a required property
  const requiredError = checkRequiredProperty(operation.path, schema);
  if (requiredError) {
    errors.push({
      operation: index,
      error: requiredError,
    });
  }

  return errors;
}

function validateReplace(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Replace operation must have a "path" property',
    });
    return errors;
  }

  if (!("value" in operation)) {
    errors.push({
      operation: index,
      error: 'Replace operation must have a "value" property',
    });
    return errors;
  }

  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
    return errors;
  }

  // Validate the path exists in schema
  if (!validateJSONPointer(operation.path, schema)) {
    errors.push({
      operation: index,
      error: `Path "${operation.path}" is not valid according to schema`,
    });
  }

  return errors;
}

function validateMove(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.from) {
    errors.push({
      operation: index,
      error: 'Move operation must have a "from" property',
    });
  }

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Move operation must have a "path" property',
    });
  }

  if (errors.length > 0) return errors;

  if (typeof operation.from !== "string") {
    errors.push({
      operation: index,
      error: "From must be a string",
    });
  }

  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
  }

  if (errors.length > 0) return errors;

  // Validate from path exists
  if (!validateJSONPointer(operation.from, schema)) {
    errors.push({
      operation: index,
      error: `From path "${operation.from}" is not valid according to schema`,
    });
  }

  // Validate to path can be added
  const pathValid = validateAddPath(operation.path, schema);
  if (!pathValid.valid) {
    errors.push({
      operation: index,
      error: pathValid.error,
    });
  }

  // Check if path is a prefix of from (would create cycle)
  if (operation.from.startsWith(operation.path + "/")) {
    errors.push({
      operation: index,
      error: "Cannot move to a location that is a child of the source",
    });
  }

  // Check if moving a required property
  const requiredError = checkRequiredProperty(operation.from, schema);
  if (requiredError) {
    errors.push({
      operation: index,
      error: requiredError,
    });
  }

  return errors;
}

function validateCopy(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.from) {
    errors.push({
      operation: index,
      error: 'Copy operation must have a "from" property',
    });
  }

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Copy operation must have a "path" property',
    });
  }

  if (errors.length > 0) return errors;

  if (typeof operation.from !== "string") {
    errors.push({
      operation: index,
      error: "From must be a string",
    });
  }

  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
  }

  if (errors.length > 0) return errors;

  // Validate from path exists
  if (!validateJSONPointer(operation.from, schema)) {
    errors.push({
      operation: index,
      error: `From path "${operation.from}" is not valid according to schema`,
    });
  }

  // Validate to path can be added
  const pathValid = validateAddPath(operation.path, schema);
  if (!pathValid.valid) {
    errors.push({
      operation: index,
      error: pathValid.error,
    });
  }

  return errors;
}

function validateTest(
  operation: any,
  schema: JSONSchema,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.path) {
    errors.push({
      operation: index,
      error: 'Test operation must have a "path" property',
    });
    return errors;
  }

  if (!("value" in operation)) {
    errors.push({
      operation: index,
      error: 'Test operation must have a "value" property',
    });
    return errors;
  }

  if (typeof operation.path !== "string") {
    errors.push({
      operation: index,
      error: "Path must be a string",
    });
    return errors;
  }

  // Validate the path exists in schema
  if (!validateJSONPointer(operation.path, schema)) {
    errors.push({
      operation: index,
      error: `Path "${operation.path}" is not valid according to schema`,
    });
  }

  return errors;
}

function validateAddPath(
  path: string,
  schema: JSONSchema,
): { valid: boolean; error: string } {
  // Root document replacement
  if (path === "" || path === "/") {
    return { valid: true, error: "" };
  }

  // Extract parent path and property/index
  const lastSlash = path.lastIndexOf("/");
  const parentPath = lastSlash === 0 ? "/" : path.slice(0, lastSlash);
  const target = path.slice(lastSlash + 1);

  // Special case: adding to root
  if (parentPath === "/" && target === "") {
    return { valid: true, error: "" };
  }

  // Validate parent path exists
  if (!validateJSONPointer(parentPath, schema)) {
    return {
      valid: false,
      error: `Parent path "${parentPath}" is not valid according to schema`,
    };
  }

  // For array operations, target could be "-" (append) or a number
  if (target === "-") {
    // This is valid for arrays, parent path validation is enough
    return { valid: true, error: "" };
  }

  const index = parseInt(target, 10);
  if (!isNaN(index) && target === index.toString()) {
    // Array index - parent validation is enough
    return { valid: true, error: "" };
  }

  // For object properties, validate the full path
  if (!validateJSONPointer(path, schema)) {
    return {
      valid: false,
      error: `Path "${path}" is not valid according to schema`,
    };
  }

  return { valid: true, error: "" };
}

function checkRequiredProperty(
  path: string,
  schema: JSONSchema,
): string | null {
  // Extract parent path and property name
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return null;

  const parentPath = lastSlash === 0 ? "/" : path.slice(0, lastSlash);
  const propertyName = path.slice(lastSlash + 1);

  // Get the parent schema
  const parentSchema = getSchemaAtPath(parentPath, schema);
  if (!parentSchema) return null;

  // Check if the property is required
  if (parentSchema.required && parentSchema.required.includes(propertyName)) {
    return `Cannot remove required property "${propertyName}"`;
  }

  return null;
}

function getSchemaAtPath(path: string, schema: JSONSchema): JSONSchema | null {
  // Root path
  if (path === "" || path === "/") {
    return schema;
  }

  // Parse path tokens
  const tokens = path
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));

  let currentSchema = schema;

  for (const token of tokens) {
    currentSchema = resolveSchema(currentSchema, {
      root: schema,
      definitions: {
        ...schema.$defs,
        ...schema.definitions,
      },
      visited: new Set(),
      anchors: new Map(),
    });

    if (!currentSchema) return null;

    // Try to get next schema
    const nextSchema = getNextSchemaForToken(token, currentSchema, schema);
    if (!nextSchema) return null;

    currentSchema = nextSchema;
  }

  return currentSchema;
}

function getNextSchemaForToken(
  token: string,
  schema: JSONSchema,
  rootSchema: JSONSchema,
): JSONSchema | null {
  const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type];

  // Try object property
  if (schemaTypes.includes("object") || schema.properties || !schema.type) {
    // Check explicit properties
    if (schema.properties && token in schema.properties) {
      return schema.properties[token];
    }

    // Check pattern properties
    if (schema.patternProperties) {
      for (const pattern in schema.patternProperties) {
        try {
          if (new RegExp(pattern).test(token)) {
            return schema.patternProperties[pattern];
          }
        } catch {
          continue;
        }
      }
    }

    // Check additionalProperties
    if (schema.additionalProperties === false) {
      return null;
    }

    if (typeof schema.additionalProperties === "object") {
      return schema.additionalProperties;
    }

    // Default: allow
    return {};
  }

  // Try array index
  if (schemaTypes.includes("array") || schema.items || schema.prefixItems) {
    const index = parseInt(token, 10);
    if (isNaN(index) || index < 0 || token !== index.toString()) {
      return null;
    }

    // Handle prefixItems
    if (schema.prefixItems) {
      if (index < schema.prefixItems.length) {
        return schema.prefixItems[index];
      }
      if (schema.items !== undefined) {
        if (schema.items === false) {
          return null;
        }
        if (typeof schema.items === "object" && !Array.isArray(schema.items)) {
          return schema.items;
        }
      }
      return {};
    }

    // Handle tuple validation
    if (Array.isArray(schema.items)) {
      if (index < schema.items.length) {
        return schema.items[index];
      }
      if (schema.additionalItems === false) {
        return null;
      }
      if (typeof schema.additionalItems === "object") {
        return schema.additionalItems;
      }
      return {};
    }

    // Handle single schema for all items
    if (schema.items !== undefined) {
      if (schema.items === false) {
        return null;
      }
      if (typeof schema.items === "object" && !Array.isArray(schema.items)) {
        return schema.items;
      }
    }

    return {};
  }

  return null;
}

function resolveSchema(schema: JSONSchema, context: any): JSONSchema {
  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref;

    if (context.visited.has(refPath)) {
      return {};
    }

    context.visited.add(refPath);

    // Handle JSON Pointer references
    if (refPath.startsWith("#/")) {
      const path = refPath.slice(2).split("/");
      let resolved: any = context.root;

      for (const segment of path) {
        const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
        resolved = resolved?.[key];
        if (!resolved) break;
      }

      if (resolved && typeof resolved === "object") {
        return resolveSchema(resolved, context);
      }
    }

    context.visited.delete(refPath);
    return {};
  }

  // Handle allOf
  if (schema.allOf) {
    const merged = schema.allOf.reduce((acc: any, s: any) => {
      const resolved = resolveSchema(s, context);
      return mergeSchemas(acc, resolved);
    }, {} as JSONSchema);
    return { ...schema, ...merged, allOf: undefined };
  }

  // Handle anyOf/oneOf
  if (schema.anyOf && schema.anyOf.length > 0) {
    return resolveSchema(schema.anyOf[0], context);
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    return resolveSchema(schema.oneOf[0], context);
  }

  return schema;
}

function mergeSchemas(s1: JSONSchema, s2: JSONSchema): JSONSchema {
  const merged: JSONSchema = { ...s1, ...s2 };

  if (s1.properties || s2.properties) {
    merged.properties = { ...s1.properties, ...s2.properties };
  }

  if (s1.patternProperties || s2.patternProperties) {
    merged.patternProperties = {
      ...s1.patternProperties,
      ...s2.patternProperties,
    };
  }

  if (s1.required || s2.required) {
    merged.required = [
      ...new Set([...(s1.required || []), ...(s2.required || [])]),
    ];
  }

  if (s1.type && s2.type) {
    const t1 = Array.isArray(s1.type) ? s1.type : [s1.type];
    const t2 = Array.isArray(s2.type) ? s2.type : [s2.type];
    const commonTypes = t1.filter((t: any) => t2.includes(t));
    if (commonTypes.length > 0) {
      merged.type = commonTypes.length === 1 ? commonTypes[0] : commonTypes;
    }
  }

  return merged;
}
