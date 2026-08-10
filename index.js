const defaultScalars = {
  Boolean: "boolean",
  Float: "number",
  ID: "string",
  Int: "number",
  String: "string",
};

const ENUM_PATTERN = /enum\s+(\w+)\s*\{([^\}]*)\}/gv;
const ENUM_VALUE_PATTERN = /^(\w+)/v;
const FIELD_PATTERN = /^(\w+)(?:\([^\)]*\))?\s*:\s*(\S.*)$/v;
const NON_NULL_INNER_PATTERN = /^(.+)!$/v;
const NON_NULL_LIST_PATTERN = /^\[(.+)\]!$/v;
const NULLABLE_LIST_PATTERN = /^\[(.+)\]$/v;
const TYPE_PATTERN = /(?:type|input)\s+(\w+)\s*\{([^\}]*)\}/gv;

function stripComments(sdl) {
  return sdl
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("#");
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join("\n");
}

function resolveType(typeString, scalars) {
  const trimmed = typeString.trim();

  // [Type!]!
  const nonNullListMatch = NON_NULL_LIST_PATTERN.exec(trimmed);
  if (nonNullListMatch) {
    const [, inner] = nonNullListMatch;
    const nonNullInnerMatch = NON_NULL_INNER_PATTERN.exec(inner);
    if (nonNullInnerMatch) {
      const resolved = resolveBaseType(nonNullInnerMatch[1], scalars);
      return `${resolved}[]`;
    }

    const resolved = resolveBaseType(inner, scalars);
    return `Array<${resolved} | null>`;
  }

  // [Type!] or [Type]
  const nullableListMatch = NULLABLE_LIST_PATTERN.exec(trimmed);
  if (nullableListMatch) {
    const [, inner] = nullableListMatch;
    const nonNullInnerMatch = NON_NULL_INNER_PATTERN.exec(inner);
    if (nonNullInnerMatch) {
      const resolved = resolveBaseType(nonNullInnerMatch[1], scalars);
      return `${resolved}[] | null`;
    }

    const resolved = resolveBaseType(inner, scalars);
    return `Array<${resolved} | null> | null`;
  }

  // Type!
  const nonNullMatch = NON_NULL_INNER_PATTERN.exec(trimmed);
  if (nonNullMatch) {
    return resolveBaseType(nonNullMatch[1], scalars);
  }

  // Type (nullable by default in GraphQL)
  const resolved = resolveBaseType(trimmed, scalars);
  return `${resolved} | null`;
}

function resolveBaseType(typeName, scalars) {
  const trimmed = typeName.trim();
  return scalars[trimmed] ?? trimmed;
}

function parseFields(body, scalars) {
  const fields = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Match: fieldName: Type or fieldName(args): Type
    const fieldMatch = FIELD_PATTERN.exec(trimmed);
    if (fieldMatch) {
      const [, name, type] = fieldMatch;
      fields.push({ name, type: resolveType(type.trim(), scalars) });
    }
  }

  return fields;
}

function parseEnumValues(body) {
  const values = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = ENUM_VALUE_PATTERN.exec(trimmed);
    if (match) {
      values.push(match[1]);
    }
  }

  return values;
}

export default function pluckTypes(sdl, options = {}) {
  const scalars = { ...defaultScalars, ...options.scalars };
  const cleaned = stripComments(sdl);
  const output = [];

  // Match type blocks
  for (const match of cleaned.matchAll(TYPE_PATTERN)) {
    const [, name, body] = match;
    const fields = parseFields(body, scalars);

    const fieldLines = fields.map((field) => `\t${field.name}: ${field.type};`);

    output.push(`export interface ${name} {\n${fieldLines.join("\n")}\n}`);
  }

  // Match enum blocks
  for (const match of cleaned.matchAll(ENUM_PATTERN)) {
    const [, name, body] = match;
    const values = parseEnumValues(body);

    const valueLines = values.map((value) => `\t${value} = '${value}',`);

    output.push(`export enum ${name} {\n${valueLines.join("\n")}\n}`);
  }

  return `${output.join("\n\n")}\n`;
}
