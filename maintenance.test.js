import test from "ava";
import pluckTypes from "./index.js";

for (const count of [1, 2, 3, 4]) {
  test(`preserves definitions around block quotes after ${count} backslashes`, (t) => {
    const description = `"""keep ${"\\".repeat(count)}""" # fake: String! still description"""`;
    const sdl = `${description} type User { ${description} id: ID! } enum Role { ${description} USER }`;
    t.is(
      pluckTypes(sdl),
      "export interface User {\n\tid: string;\n}\n\nexport enum Role {\n\tUSER = 'USER',\n}\n"
    );
  });
}

for (const expression of [
  "string|number",
  "string & {value: number}",
  "() => string",
  "keyof Record<string, number>",
]) {
  test(`preserves scalar list element precedence for ${expression}`, (t) => {
    const result = pluckTypes("type Query { values: [Value!]! }", {
      scalars: { Value: expression },
    });
    t.is(
      result,
      `export interface Query {\n\tvalues: Array<${expression}>;\n}\n`
    );
  });
}
