export type JSONSchema = {
  // Type keywords
  type?: string | string[];
  enum?: any[];
  const?: any;

  // Object keywords
  properties?: Record<string, JSONSchema>;
  patternProperties?: Record<string, JSONSchema>;
  additionalProperties?: boolean | JSONSchema;
  propertyNames?: JSONSchema;
  required?: string[];
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JSONSchema>;

  // Array keywords
  items?: false | JSONSchema | JSONSchema[];
  prefixItems?: JSONSchema[];
  additionalItems?: false | JSONSchema;
  contains?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minContains?: number;
  maxContains?: number;

  // String keywords
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: string;

  // Number keywords
  multipleOf?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;

  // Schema composition
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;

  // Conditional schemas
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;

  // References
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>;
  $dynamicRef?: string;
  $dynamicAnchor?: string;
  $anchor?: string;

  // Metadata (doesn't affect validation)
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  // Media
  contentMediaType?: string;
  contentEncoding?: string;
  contentSchema?: JSONSchema;
};

interface SchemaContext {
  root: JSONSchema;
  definitions: Record<string, JSONSchema>;
  visited: Set<string>;
  anchors: Map<string, JSONSchema>;
}

/**
 * Validates if a JSON Pointer path is valid according to a JSON Schema
 * Supports JSON Schema Draft 2020-12 and earlier drafts
 * @returns true if the path is valid, false otherwise
 */
export function validateJSONPointer(
  pointer: string,
  schema: JSONSchema,
): boolean {
  // Empty pointer is always valid (refers to root)
  if (pointer === "" || pointer === "/") {
    return true;
  }

  // JSON Pointer must start with /
  if (!pointer.startsWith("/")) {
    return false;
  }

  // Parse the pointer into tokens
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));

  const context: SchemaContext = {
    root: schema,
    definitions: {
      ...schema.$defs,
      ...schema.definitions,
    },
    visited: new Set(),
    anchors: new Map(),
  };

  // Collect anchors
  collectAnchors(schema, context);

  return validateTokens(tokens, schema, context);
}

function collectAnchors(
  schema: JSONSchema,
  context: SchemaContext,
  path: string = "",
): void {
  if (!schema || typeof schema !== "object") return;

  if (schema.$anchor) {
    context.anchors.set(schema.$anchor, schema);
  }

  if (schema.$dynamicAnchor) {
    context.anchors.set(schema.$dynamicAnchor, schema);
  }

  // Recursively collect from nested schemas
  if (schema.properties) {
    for (const key in schema.properties) {
      collectAnchors(
        schema.properties[key],
        context,
        `${path}/properties/${key}`,
      );
    }
  }

  if (schema.$defs) {
    for (const key in schema.$defs) {
      collectAnchors(schema.$defs[key], context, `${path}/$defs/${key}`);
    }
  }
}

function validateTokens(
  tokens: string[],
  schema: JSONSchema,
  context: SchemaContext,
): boolean {
  let currentSchema = schema;

  for (const token of tokens) {
    // Resolve schema references and combinators
    currentSchema = resolveSchema(currentSchema, context);

    if (!currentSchema) {
      return false;
    }

    // const/enum don't allow traversal
    if (currentSchema.const !== undefined || currentSchema.enum !== undefined) {
      return false;
    }

    // Get next schema for this token
    const nextSchema = getNextSchema(token, currentSchema, context);

    if (!nextSchema) {
      return false;
    }

    currentSchema = nextSchema;
  }

  return true;
}

function getNextSchema(
  token: string,
  schema: JSONSchema,
  context: SchemaContext,
): JSONSchema | null {
  const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type];

  // Try object traversal
  if (
    schemaTypes.includes("object") ||
    schema.properties ||
    schema.patternProperties ||
    !schema.type
  ) {
    const objectSchema = tryObjectTraversal(token, schema, context);
    if (objectSchema) {
      return objectSchema;
    }
  }

  // Try array traversal
  if (schemaTypes.includes("array") || schema.items || schema.prefixItems) {
    const arraySchema = tryArrayTraversal(token, schema, context);
    if (arraySchema) {
      return arraySchema;
    }
  }

  // If multiple types allowed, try each
  if (Array.isArray(schema.type) && schema.type.length > 1) {
    for (const type of schema.type) {
      const typeSchema = { ...schema, type };
      const result = getNextSchema(token, typeSchema, context);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

function tryObjectTraversal(
  token: string,
  schema: JSONSchema,
  context: SchemaContext,
): JSONSchema | null {
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

  // Check propertyNames constraint
  if (schema.propertyNames) {
    const resolved = resolveSchema(schema.propertyNames, context);

    // Check const
    if (resolved.const !== undefined && resolved.const !== token) {
      return null;
    }

    // Check enum
    if (resolved.enum !== undefined && !resolved.enum.includes(token)) {
      return null;
    }

    // Check pattern
    if (resolved.pattern) {
      try {
        if (!new RegExp(resolved.pattern).test(token)) {
          return null;
        }
      } catch {
        // Invalid pattern, skip
      }
    }

    // Check minLength/maxLength
    if (resolved.minLength !== undefined && token.length < resolved.minLength) {
      return null;
    }
    if (resolved.maxLength !== undefined && token.length > resolved.maxLength) {
      return null;
    }
  }

  // Check additionalProperties
  if (schema.additionalProperties === false) {
    return null;
  }

  if (typeof schema.additionalProperties === "object") {
    return schema.additionalProperties;
  }

  // Check dependentSchemas
  if (schema.dependentSchemas && schema.dependentSchemas[token]) {
    return schema.dependentSchemas[token];
  }

  // Default: allow if additionalProperties not explicitly false
  return {};
}

function tryArrayTraversal(
  token: string,
  schema: JSONSchema,
  context: SchemaContext,
): JSONSchema | null {
  const index = parseInt(token, 10);

  // Must be a valid non-negative integer
  if (isNaN(index) || index < 0 || token !== index.toString()) {
    return null;
  }

  // Check maxItems constraint
  if (schema.maxItems !== undefined && index >= schema.maxItems) {
    return null;
  }

  // Check minItems (if we're beyond minItems, it's still valid)
  // minItems is about minimum array length, not maximum index

  // Handle prefixItems (Draft 2020-12)
  if (schema.prefixItems) {
    if (index < schema.prefixItems.length) {
      return schema.prefixItems[index];
    }

    // Beyond prefixItems, check items
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

  // Handle tuple validation (array of schemas) - older drafts
  if (Array.isArray(schema.items)) {
    if (index < schema.items.length) {
      return schema.items[index];
    }

    // Beyond tuple, check additionalItems
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

  // No items schema defined, allow any
  return {};
}

function resolveSchema(schema: JSONSchema, context: SchemaContext): JSONSchema {
  // Handle $ref
  if (schema.$ref) {
    return resolveRef(schema.$ref, context, schema);
  }

  // Handle $dynamicRef
  if (schema.$dynamicRef) {
    return resolveRef(schema.$dynamicRef, context, schema);
  }

  // Handle allOf - merge all schemas
  if (schema.allOf) {
    const merged = schema.allOf.reduce((acc, s) => {
      const resolved = resolveSchema(s, context);
      return mergeSchemas(acc, resolved);
    }, {} as JSONSchema);
    return { ...schema, ...merged, allOf: undefined };
  }

  // Handle anyOf - at least one must be valid
  // For path validation, we accept if any branch allows it
  if (schema.anyOf && schema.anyOf.length > 0) {
    return resolveSchema(schema.anyOf[0], context);
  }

  // Handle oneOf - exactly one must be valid
  // For path validation, we accept if any branch allows it
  if (schema.oneOf && schema.oneOf.length > 0) {
    return resolveSchema(schema.oneOf[0], context);
  }

  // Handle not - schema must NOT be valid
  // For path validation, we're conservative and allow traversal
  if (schema.not) {
    return { ...schema, not: undefined };
  }

  // Handle if/then/else - conditional schemas
  if (schema.if) {
    // Without data, we can't evaluate conditions
    // Conservative: merge both branches
    const schemas: JSONSchema[] = [];
    if (schema.then) schemas.push(schema.then);
    if (schema.else) schemas.push(schema.else);

    if (schemas.length > 0) {
      const merged = schemas.reduce(
        (acc, s) => mergeSchemas(acc, resolveSchema(s, context)),
        {},
      );
      return {
        ...schema,
        ...merged,
        if: undefined,
        then: undefined,
        else: undefined,
      };
    }
  }

  return schema;
}

function resolveRef(
  ref: string,
  context: SchemaContext,
  currentSchema: JSONSchema,
): JSONSchema {
  // Prevent infinite recursion
  if (context.visited.has(ref)) {
    return {};
  }

  context.visited.add(ref);

  // Handle anchor references
  if (ref.startsWith("#") && !ref.includes("/")) {
    const anchor = ref.slice(1);
    if (context.anchors.has(anchor)) {
      return resolveSchema(context.anchors.get(anchor)!, context);
    }
  }

  // Handle JSON Pointer references (#/path/to/schema)
  if (ref.startsWith("#/")) {
    const path = ref.slice(2).split("/");
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

  // Handle relative JSON Pointer (from current position)
  if (!ref.startsWith("#") && !ref.includes("://")) {
    // Simplified: treat as fragment
    return {};
  }

  context.visited.delete(ref);
  return {};
}

function mergeSchemas(s1: JSONSchema, s2: JSONSchema): JSONSchema {
  const merged: JSONSchema = { ...s1, ...s2 };

  // Merge properties
  if (s1.properties || s2.properties) {
    merged.properties = { ...s1.properties, ...s2.properties };
  }

  // Merge patternProperties
  if (s1.patternProperties || s2.patternProperties) {
    merged.patternProperties = {
      ...s1.patternProperties,
      ...s2.patternProperties,
    };
  }

  // Merge required
  if (s1.required || s2.required) {
    merged.required = [
      ...new Set([...(s1.required || []), ...(s2.required || [])]),
    ];
  }

  // Handle type intersection
  if (s1.type && s2.type) {
    const t1 = Array.isArray(s1.type) ? s1.type : [s1.type];
    const t2 = Array.isArray(s2.type) ? s2.type : [s2.type];
    const commonTypes = t1.filter((t) => t2.includes(t));
    if (commonTypes.length > 0) {
      merged.type = commonTypes.length === 1 ? commonTypes[0] : commonTypes;
    }
  }

  // Merge numeric constraints (take most restrictive)
  if (s1.minProperties !== undefined || s2.minProperties !== undefined) {
    merged.minProperties = Math.max(
      s1.minProperties || 0,
      s2.minProperties || 0,
    );
  }
  if (s1.maxProperties !== undefined || s2.maxProperties !== undefined) {
    const max1 = s1.maxProperties ?? Infinity;
    const max2 = s2.maxProperties ?? Infinity;
    const min = Math.min(max1, max2);
    if (min !== Infinity) merged.maxProperties = min;
  }

  return merged;
}
