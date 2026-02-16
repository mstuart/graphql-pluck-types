const defaultScalars = {
	String: 'string',
	Int: 'number',
	Float: 'number',
	Boolean: 'boolean',
	ID: 'string',
};

function stripComments(sdl) {
	return sdl
		.split('\n')
		.map(line => {
			const commentIndex = line.indexOf('#');
			return commentIndex === -1 ? line : line.slice(0, commentIndex);
		})
		.join('\n');
}

function resolveType(typeString, scalars) {
	const trimmed = typeString.trim();

	// [Type!]!
	const nonNullListMatch = /^\[(.+)]!$/.exec(trimmed);
	if (nonNullListMatch) {
		const inner = nonNullListMatch[1];
		const nonNullInnerMatch = /^(.+)!$/.exec(inner);
		if (nonNullInnerMatch) {
			const resolved = resolveBaseType(nonNullInnerMatch[1], scalars);
			return `${resolved}[]`;
		}

		const resolved = resolveBaseType(inner, scalars);
		return `Array<${resolved} | null>`;
	}

	// [Type!] or [Type]
	const nullableListMatch = /^\[(.+)]$/.exec(trimmed);
	if (nullableListMatch) {
		const inner = nullableListMatch[1];
		const nonNullInnerMatch = /^(.+)!$/.exec(inner);
		if (nonNullInnerMatch) {
			const resolved = resolveBaseType(nonNullInnerMatch[1], scalars);
			return `${resolved}[] | null`;
		}

		const resolved = resolveBaseType(inner, scalars);
		return `Array<${resolved} | null> | null`;
	}

	// Type!
	const nonNullMatch = /^(.+)!$/.exec(trimmed);
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
	const lines = body.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		// Match: fieldName: Type or fieldName(args): Type
		const fieldMatch = /^(\w+)(?:\([^)]*\))?\s*:\s*(.+)$/.exec(trimmed);
		if (fieldMatch) {
			const [, name, type] = fieldMatch;
			fields.push({name, type: resolveType(type.trim(), scalars)});
		}
	}

	return fields;
}

function parseEnumValues(body) {
	const values = [];
	const lines = body.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const match = /^(\w+)/.exec(trimmed);
		if (match) {
			values.push(match[1]);
		}
	}

	return values;
}

export default function pluckTypes(sdl, options = {}) {
	const scalars = {...defaultScalars, ...options.scalars};
	const cleaned = stripComments(sdl);
	const output = [];

	// Match type blocks
	const typePattern = /(?:type|input)\s+(\w+)\s*{([^}]*)}/g;
	let match;

	while ((match = typePattern.exec(cleaned)) !== null) {
		const [, name, body] = match;
		const fields = parseFields(body, scalars);

		const fieldLines = fields.map(
			field => `\t${field.name}: ${field.type};`,
		);

		output.push(`export interface ${name} {\n${fieldLines.join('\n')}\n}`);
	}

	// Match enum blocks
	const enumPattern = /enum\s+(\w+)\s*{([^}]*)}/g;

	while ((match = enumPattern.exec(cleaned)) !== null) {
		const [, name, body] = match;
		const values = parseEnumValues(body);

		const valueLines = values.map(
			value => `\t${value} = '${value}',`,
		);

		output.push(`export enum ${name} {\n${valueLines.join('\n')}\n}`);
	}

	return output.join('\n\n') + '\n';
}
