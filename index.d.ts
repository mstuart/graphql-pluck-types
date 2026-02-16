export type PluckTypesOptions = {
	/**
	Custom scalar type mappings from GraphQL scalar names to TypeScript types.

	@default {String: 'string', Int: 'number', Float: 'number', Boolean: 'boolean', ID: 'string'}

	@example
	```
	import pluckTypes from 'graphql-pluck-types';

	const ts = pluckTypes(sdl, {
		scalars: {DateTime: 'Date', JSON: 'unknown'},
	});
	```
	*/
	readonly scalars?: Record<string, string>;
};

/**
Extract TypeScript interface definitions from a GraphQL schema SDL string.

@param sdl - A GraphQL schema definition language string.
@param options - Configuration options.
@returns TypeScript source code string with exported interfaces and enums.

@example
```
import pluckTypes from 'graphql-pluck-types';

const sdl = `
	type User {
		id: ID!
		name: String!
		email: String
	}

	enum Role {
		ADMIN
		USER
	}
`;

const ts = pluckTypes(sdl);
// => 'export interface User {\n\tid: string;\n\tname: string;\n\temail: string | null;\n}\n\nexport enum Role {\n\tADMIN = \'ADMIN\',\n\tUSER = \'USER\',\n}\n'
```
*/
export default function pluckTypes(sdl: string, options?: PluckTypesOptions): string;
