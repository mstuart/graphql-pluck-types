import {expectType, expectError} from 'tsd';
import pluckTypes from './index.js';

// Returns a string
expectType<string>(pluckTypes('type Foo { id: ID! }'));

// Accepts options
expectType<string>(pluckTypes('type Foo { id: ID! }', {scalars: {DateTime: 'Date'}}));

// Accepts empty options
expectType<string>(pluckTypes('type Foo { id: ID! }', {}));

// Requires sdl argument
expectError(pluckTypes());
