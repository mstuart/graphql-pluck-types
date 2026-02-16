import test from 'ava';
import pluckTypes from './index.js';

// Basic type extraction

test('extracts a simple type', t => {
	const sdl = `
		type User {
			id: ID!
			name: String!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface User'));
	t.true(result.includes('id: string;'));
	t.true(result.includes('name: string;'));
});

test('extracts multiple types', t => {
	const sdl = `
		type User {
			id: ID!
		}

		type Post {
			title: String!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface User'));
	t.true(result.includes('export interface Post'));
});

// Required fields (!)

test('non-null fields do not have null union', t => {
	const sdl = `
		type User {
			id: ID!
			name: String!
		}
	`;

	const result = pluckTypes(sdl);
	t.regex(result, /id: string;/);
	t.regex(result, /name: string;/);
	t.false(result.includes('id: string | null'));
});

test('nullable fields include null union', t => {
	const sdl = `
		type User {
			email: String
			age: Int
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('email: string | null;'));
	t.true(result.includes('age: number | null;'));
});

// Arrays

test('handles non-null list of non-null items [Type!]!', t => {
	const sdl = `
		type User {
			tags: [String!]!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('tags: string[];'));
});

test('handles nullable list of non-null items [Type!]', t => {
	const sdl = `
		type User {
			tags: [String!]
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('tags: string[] | null;'));
});

test('handles non-null list of nullable items [Type]!', t => {
	const sdl = `
		type User {
			tags: [String]!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('tags: Array<string | null>;'));
});

test('handles nullable list of nullable items [Type]', t => {
	const sdl = `
		type User {
			tags: [String]
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('tags: Array<string | null> | null;'));
});

// Enums

test('extracts enums', t => {
	const sdl = `
		enum Role {
			ADMIN
			USER
			GUEST
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export enum Role'));
	t.true(result.includes('ADMIN = \'ADMIN\','));
	t.true(result.includes('USER = \'USER\','));
	t.true(result.includes('GUEST = \'GUEST\','));
});

test('extracts enum with single value', t => {
	const sdl = `
		enum Status {
			ACTIVE
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('ACTIVE = \'ACTIVE\','));
});

// Input types

test('extracts input types as interfaces', t => {
	const sdl = `
		input CreateUserInput {
			name: String!
			email: String!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface CreateUserInput'));
	t.true(result.includes('name: string;'));
	t.true(result.includes('email: string;'));
});

// Custom scalars

test('applies custom scalar mappings', t => {
	const sdl = `
		type Event {
			createdAt: DateTime!
			metadata: JSON
		}
	`;

	const result = pluckTypes(sdl, {
		scalars: {DateTime: 'Date', JSON: 'unknown'},
	});

	t.true(result.includes('createdAt: Date;'));
	t.true(result.includes('metadata: unknown | null;'));
});

test('default scalar mappings work', t => {
	const sdl = `
		type Foo {
			s: String!
			i: Int!
			f: Float!
			b: Boolean!
			id: ID!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('s: string;'));
	t.true(result.includes('i: number;'));
	t.true(result.includes('f: number;'));
	t.true(result.includes('b: boolean;'));
	t.true(result.includes('id: string;'));
});

// Comments in SDL are ignored

test('ignores comments in SDL', t => {
	const sdl = `
		# This is a comment
		type User {
			# User ID
			id: ID!
			# User name
			name: String!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface User'));
	t.true(result.includes('id: string;'));
	t.true(result.includes('name: string;'));
	t.false(result.includes('#'));
	t.false(result.includes('comment'));
});

test('ignores inline comments', t => {
	const sdl = `
		type User {
			id: ID! # primary key
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('id: string;'));
	t.false(result.includes('primary key'));
});

// Mixed types and enums

test('handles mixed types, inputs, and enums', t => {
	const sdl = `
		type User {
			id: ID!
			role: Role!
		}

		input CreateUserInput {
			name: String!
		}

		enum Role {
			ADMIN
			USER
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface User'));
	t.true(result.includes('export interface CreateUserInput'));
	t.true(result.includes('export enum Role'));
});

// Reference types (non-scalar)

test('references other types by name', t => {
	const sdl = `
		type User {
			address: Address
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('address: Address | null;'));
});

test('handles non-null reference types', t => {
	const sdl = `
		type User {
			address: Address!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('address: Address;'));
});

test('handles array of reference types', t => {
	const sdl = `
		type User {
			posts: [Post!]!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('posts: Post[];'));
});

// Fields with arguments (query types)

test('handles fields with arguments', t => {
	const sdl = `
		type Query {
			user(id: ID!): User
			users(limit: Int, offset: Int): [User!]!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('export interface Query'));
	t.true(result.includes('user: User | null;'));
	t.true(result.includes('users: User[];'));
});

// Output format

test('output ends with newline', t => {
	const sdl = 'type Foo { id: ID! }';
	const result = pluckTypes(sdl);
	t.true(result.endsWith('\n'));
});

test('uses tab indentation', t => {
	const sdl = `
		type User {
			id: ID!
		}
	`;

	const result = pluckTypes(sdl);
	t.true(result.includes('\tid: string;'));
});

// Edge cases

test('handles empty type body', t => {
	const sdl = 'type Empty {}';
	const result = pluckTypes(sdl);
	t.true(result.includes('export interface Empty'));
});

test('custom scalars override defaults', t => {
	const sdl = `
		type Foo {
			name: String!
		}
	`;

	const result = pluckTypes(sdl, {scalars: {String: 'custom'}});
	t.true(result.includes('name: custom;'));
});

test('handles no options argument', t => {
	const sdl = 'type Foo { id: ID! }';
	t.notThrows(() => pluckTypes(sdl));
});
