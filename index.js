const defaultScalars = {
  Boolean: "boolean",
  Float: "number",
  ID: "string",
  Int: "number",
  String: "string",
};

const ENUM_PATTERN = /enum\s+(\w+)\s*\{([^\}]*)\}/gv;
const ENUM_VALUE_PATTERN = /^(\w+)/v;
const FIELD_PUNCTUATION = new Set(["!", "(", ")", ":", "@", "[", "]"]);
const NAME_TOKEN_PATTERN = /^[_A-Za-z][_0-9A-Za-z]*$/v;
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

function isNameStart(character) {
  const code = character?.codePointAt(0) ?? 0;
  return (
    character === "_" ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isNameContinuation(character) {
  const code = character?.codePointAt(0) ?? 0;
  return isNameStart(character) || (code >= 48 && code <= 57);
}

function skipQuotedString(body, start) {
  const block = body.startsWith('"""', start);
  let cursor = start + (block ? 3 : 1);
  const terminator = block ? '"""' : '"';

  while (cursor < body.length) {
    if (body[cursor] === "\\") {
      cursor += 2;
    } else if (body.startsWith(terminator, cursor)) {
      return cursor + terminator.length;
    } else {
      cursor += 1;
    }
  }

  return cursor;
}

function tokenizeFields(body) {
  const tokens = [];
  let cursor = 0;

  while (cursor < body.length) {
    const character = body[cursor];
    if (character === '"') {
      cursor = skipQuotedString(body, cursor);
    } else if (isNameStart(character)) {
      const start = cursor;
      cursor += 1;
      while (isNameContinuation(body[cursor])) {
        cursor += 1;
      }
      tokens.push(body.slice(start, cursor));
    } else {
      if (FIELD_PUNCTUATION.has(character)) {
        tokens.push(character);
      }
      cursor += 1;
    }
  }

  return tokens;
}

function skipParenthesized(tokens, start) {
  let cursor = start;
  let depth = 0;
  while (cursor < tokens.length) {
    if (tokens[cursor] === "(") {
      depth += 1;
    } else if (tokens[cursor] === ")") {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
    cursor += 1;
  }
  return cursor;
}

function readFieldType(tokens, start) {
  let cursor = start;
  if (tokens[cursor] === "[") {
    cursor += 1;
    if (!NAME_TOKEN_PATTERN.test(tokens[cursor] ?? "")) {
      return;
    }
    cursor += 1;
    if (tokens[cursor] === "!") {
      cursor += 1;
    }
    if (tokens[cursor] !== "]") {
      return;
    }
    cursor += 1;
  } else if (NAME_TOKEN_PATTERN.test(tokens[cursor] ?? "")) {
    cursor += 1;
  } else {
    return;
  }

  if (tokens[cursor] === "!") {
    cursor += 1;
  }

  return { cursor, type: tokens.slice(start, cursor).join("") };
}

function parseFields(body, scalars) {
  const fields = [];
  const tokens = tokenizeFields(body);

  for (let index = 0; index < tokens.length; index += 1) {
    const name = tokens[index];
    if (name === "@") {
      const argumentStart = index + 2;
      index =
        (tokens[argumentStart] === "("
          ? skipParenthesized(tokens, argumentStart)
          : argumentStart) - 1;
      continue;
    }
    if (!NAME_TOKEN_PATTERN.test(name)) {
      continue;
    }

    let cursor = index + 1;
    if (tokens[cursor] === "(") {
      cursor = skipParenthesized(tokens, cursor);
    }

    if (tokens[cursor] !== ":") {
      continue;
    }

    const fieldType = readFieldType(tokens, cursor + 1);
    if (fieldType) {
      fields.push({ name, type: resolveType(fieldType.type, scalars) });
      index = fieldType.cursor - 1;
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
