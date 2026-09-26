const defaultScalars = {
  Boolean: "boolean",
  Float: "number",
  ID: "string",
  Int: "number",
  String: "string",
};

const ENUM_VALUE_PATTERN = /^(\w+)/v;
const DEFINITION_KINDS = new Set(["enum", "input", "type"]);
const FIELD_PUNCTUATION = new Set([
  "!",
  "(",
  ")",
  ":",
  "=",
  "@",
  "[",
  "]",
  "{",
  "}",
]);
const NAME_TOKEN_PATTERN = /^[_A-Za-z][_0-9A-Za-z]*$/v;
const WHITESPACE_PATTERN = /\s/v;
const NON_NULL_INNER_PATTERN = /^(.+)!$/v;
const NON_NULL_LIST_PATTERN = /^\[(.+)\]!$/v;
const NULLABLE_LIST_PATTERN = /^\[(.+)\]$/v;

function stripComments(sdl) {
  let cleaned = "";
  let cursor = 0;

  while (cursor < sdl.length) {
    if (sdl[cursor] === '"') {
      const end = skipQuotedString(sdl, cursor);
      cleaned += sdl.slice(cursor, end);
      cursor = end;
    } else if (sdl[cursor] === "#") {
      const newline = sdl.indexOf("\n", cursor);
      cursor = newline === -1 ? sdl.length : newline;
    } else {
      cleaned += sdl[cursor];
      cursor += 1;
    }
  }

  return cleaned;
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

function isNumberStart(character) {
  const code = character?.codePointAt(0) ?? 0;
  return character === "-" || (code >= 48 && code <= 57);
}

function isNumberContinuation(character) {
  const code = character?.codePointAt(0) ?? 0;
  return (
    character === "+" ||
    character === "-" ||
    character === "." ||
    character === "E" ||
    character === "e" ||
    (code >= 48 && code <= 57)
  );
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
      tokens.push('"');
    } else if (isNameStart(character)) {
      const start = cursor;
      cursor += 1;
      while (isNameContinuation(body[cursor])) {
        cursor += 1;
      }
      tokens.push(body.slice(start, cursor));
    } else if (isNumberStart(character)) {
      const start = cursor;
      cursor += 1;
      while (isNumberContinuation(body[cursor])) {
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

function skipBalanced(tokens, start, opening, closing) {
  let cursor = start;
  let depth = 0;
  while (cursor < tokens.length) {
    if (tokens[cursor] === opening) {
      depth += 1;
    } else if (tokens[cursor] === closing) {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
    cursor += 1;
  }
  return cursor;
}

function skipParenthesized(tokens, start) {
  return skipBalanced(tokens, start, "(", ")");
}

function skipDefaultValue(tokens, start) {
  if (tokens[start] === "{") {
    return skipBalanced(tokens, start, "{", "}");
  }
  if (tokens[start] === "[") {
    return skipBalanced(tokens, start, "[", "]");
  }
  return Math.min(start + 1, tokens.length);
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
      const next =
        tokens[fieldType.cursor] === "="
          ? skipDefaultValue(tokens, fieldType.cursor + 1)
          : fieldType.cursor;
      index = next - 1;
    }
  }

  return fields;
}

function skipWhitespace(source, start) {
  let cursor = start;
  while (WHITESPACE_PATTERN.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function readName(source, start) {
  if (!isNameStart(source[start])) {
    return;
  }
  let cursor = start + 1;
  while (isNameContinuation(source[cursor])) {
    cursor += 1;
  }
  return { cursor, value: source.slice(start, cursor) };
}

function readBracedBody(source, start) {
  let cursor = start + 1;
  let depth = 1;
  while (cursor < source.length) {
    if (source[cursor] === '"') {
      cursor = skipQuotedString(source, cursor);
    } else if (source[cursor] === "{") {
      depth += 1;
      cursor += 1;
    } else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { body: source.slice(start + 1, cursor), cursor: cursor + 1 };
      }
      cursor += 1;
    } else {
      cursor += 1;
    }
  }
}

function parseDefinitions(source) {
  const definitions = [];
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === '"') {
      cursor = skipQuotedString(source, cursor);
      continue;
    }
    const kind = readName(source, cursor);
    if (!kind) {
      cursor += 1;
      continue;
    }
    const { cursor: kindCursor, value: kindValue } = kind;
    cursor = kindCursor;
    if (!DEFINITION_KINDS.has(kindValue)) {
      continue;
    }

    const name = readName(source, skipWhitespace(source, cursor));
    const opening = name && skipWhitespace(source, name.cursor);
    const block =
      opening !== undefined && source[opening] === "{"
        ? readBracedBody(source, opening)
        : undefined;
    if (name && block) {
      const { cursor: blockCursor, body } = block;
      const { value: nameValue } = name;
      definitions.push({ body, kind: kindValue, name: nameValue });
      cursor = blockCursor;
    }
  }

  return definitions;
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
  const definitions = parseDefinitions(cleaned);
  const output = [];

  // Match type blocks
  for (const { body, kind, name } of definitions) {
    if (kind === "enum") {
      continue;
    }
    const fields = parseFields(body, scalars);

    const fieldLines = fields.map((field) => `\t${field.name}: ${field.type};`);

    output.push(`export interface ${name} {\n${fieldLines.join("\n")}\n}`);
  }

  // Match enum blocks
  for (const { body, kind, name } of definitions) {
    if (kind !== "enum") {
      continue;
    }
    const values = parseEnumValues(body);

    const valueLines = values.map((value) => `\t${value} = '${value}',`);

    output.push(`export enum ${name} {\n${valueLines.join("\n")}\n}`);
  }

  return `${output.join("\n\n")}\n`;
}
