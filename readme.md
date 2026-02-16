# graphql-pluck-types

> Extract TypeScript interface definitions from a GraphQL schema SDL string

## Install

```sh
npm install graphql-pluck-types
```

## Usage

```js
import pluckTypes from 'graphql-pluck-types';

const sdl = `
	type User {
		id: ID!
		name: String!
		email: String
		posts: [Post!]!
	}

	type Post {
		id: ID!
		title: String!
		body: String
	}

	enum Role {
		ADMIN
		USER
	}

	input CreateUserInput {
		name: String!
		email: String!
		role: Role!
	}
`;

const ts = pluckTypes(sdl);
console.log(ts);
```

Output:

```ts
export interface User {
	id: string;
	name: string;
	email: string | null;
	posts: Post[];
}

export interface Post {
	id: string;
	title: string;
	body: string | null;
}

export interface CreateUserInput {
	name: string;
	email: string;
	role: Role;
}

export enum Role {
	ADMIN = 'ADMIN',
	USER = 'USER',
}
```

### Custom Scalars

```js
const ts = pluckTypes(sdl, {
	scalars: {
		DateTime: 'Date',
		JSON: 'unknown',
	},
});
```

## API

### `pluckTypes(sdl, options?)`

#### sdl

Type: `string`

A GraphQL schema definition language string.

#### options

Type: `object`

##### scalars

Type: `Record<string, string>`\
Default: `{String: 'string', Int: 'number', Float: 'number', Boolean: 'boolean', ID: 'string'}`

Custom scalar type mappings from GraphQL scalar names to TypeScript types.

#### Return value

Type: `string`

TypeScript source code with exported interfaces and enums.

### Limitations

- Does not handle `union` or `scalar` declarations
- Does not resolve `extend type`
- Field arguments are stripped (only field name and return type are extracted)
- Designed for the 90% use case — use `graphql-codegen` for advanced needs

## Related

- [graphql-codegen](https://github.com/dotansimha/graphql-code-generator) — Full-featured GraphQL code generator

## License

MIT
