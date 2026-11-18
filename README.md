# json-pointer-reference-resolver

Resolves RFC 6901 JSON Pointer strings against a JavaScript object and validates that the target exists.

```js
import { resolvePointer, hasPointer, parsePointer, formatPointer } from 'json-pointer-reference-resolver';

const document = {
  users: [{ name: 'Ada' }, { name: 'Grace' }],
  'a/b': true,
};

resolvePointer(document, '/users/1/name'); // 'Grace'
resolvePointer(document, '/a~1b');          // true
hasPointer(document, '/users/2');            // false
hasPointer(document, '/users/1/name');       // true

parsePointer('/users/0');   // ['users', '0']
formatPointer(['a/b']);     // '/a~1b'
```

## Why this exists

A plain `document[key]` lookup cannot tell the difference between a missing key and a key that is present but holds `undefined`. That matters when a pointer is used as a reference into a configuration object or a patch document: `{ "enabled": undefined }` and `{}` are not the same thing, but bracket access makes them look identical. This library checks ownership with `Object.prototype.hasOwnProperty` so the two cases stay distinct, and it throws on a missing target instead of quietly returning `undefined`.

The trade-off is strictness. `resolvePointer` throws on a missing property, on a non-canonical array index such as `01`, on `-`, and on traversal through a primitive. If you want a yes/no answer without exceptions, use `hasPointer`, which is implemented on top of `resolvePointer` so the two can never disagree.

## The awkward edge

Array indices follow RFC 6901 exactly: only `0` and unsigned integers without a leading zero are accepted, and `-` is rejected during resolution because it names a position past the end of the array rather than an existing element. A pointer like `/items/01` therefore throws a `RangeError` rather than resolving to `items[1]`, even though JavaScript would happily coerce `'01'` to `1`. The spec is the contract here, not JavaScript's coercion rules.

## API

- `resolvePointer(document, pointer)` — returns the value at `pointer`, or throws `TypeError`, `RangeError`, `SyntaxError`, or `Error` if the path cannot be resolved.
- `hasPointer(document, pointer)` — returns `true` when `resolvePointer` would succeed.
- `parsePointer(pointer)` — returns the decoded reference tokens as a `string[]`.
- `formatPointer(tokens)` — encodes a `string[]` back into a JSON Pointer string.

The empty pointer `''` addresses the whole document. The token `''` (written as `/`) addresses the property whose name is the empty string, which is valid per the spec.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

