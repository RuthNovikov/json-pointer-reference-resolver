const UNESCAPE = {
  '~1': '/',
  '~0': '~',
};

/**
 * Decode a single JSON Pointer reference token.
 * RFC 6901 says escaping must happen in this order when encoding: `~` -> `~0`,
 * then `/` -> `~1`. Decoding therefore has to reverse those in the opposite
 * order. We scan once and reject any `~` that is not followed by `0` or `1`,
 * because the spec forbids `~` followed by anything else and silent acceptance
 * would hide malformed pointers that came from a broken encoder.
 */
function decodeToken(token) {
  let out = '';
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch !== '~') {
      out += ch;
      continue;
    }
    const next = token[i + 1];
    const replacement = UNESCAPE[`~${next}`];
    if (replacement === undefined) {
      throw new SyntaxError(`invalid escape sequence at index ${i} in token ${JSON.stringify(token)}`);
    }
    out += replacement;
    i += 1;
  }
  return out;
}

/**
 * RFC 6901 array index rule: only unsigned base-10 integers with no leading
 * zero are valid. `-` is a valid token but it means "one past the end" when
 * used for insertion, not for lookup, so we reject it during resolution.
 */
function decodeIndex(token) {
  if (token === '-') {
    return null;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    return null;
  }
  return Number(token);
}

/**
 * Parse an RFC 6901 JSON Pointer string into reference tokens.
 *
 * A pointer is either the empty string (which addresses the whole document)
 * or a sequence of `/`-prefixed tokens. Parsing is split from resolution so a
 * caller can validate a pointer once and reuse it against many documents.
 */
export function parsePointer(pointer) {
  if (typeof pointer !== 'string') {
    throw new TypeError('pointer must be a string');
  }
  if (pointer === '') {
    return [];
  }
  if (pointer[0] !== '/') {
    throw new SyntaxError('pointer must be empty or start with "/"');
  }
  return pointer.slice(1).split('/').map(decodeToken);
}

/**
 * Encode reference tokens back into a JSON Pointer string.
 * The escape order matters: `~` must be escaped before `/`, otherwise the
 * `~` introduced by escaping `/` would itself be escaped again.
 */
export function formatPointer(tokens) {
  if (!Array.isArray(tokens)) {
    throw new TypeError('tokens must be an array');
  }
  return tokens
    .map((token) => {
      if (typeof token !== 'string') {
        throw new TypeError('each token must be a string');
      }
      return token.replace(/~/g, '~0').replace(/\//g, '~1');
    })
    .map((token) => `/${token}`)
    .join('');
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Resolve a JSON Pointer against `document` and return the target value.
 *
 * Missing keys are not the same as keys holding `undefined`: we use
 * `Object.prototype.hasOwnProperty` so that a pointer into `{ a: undefined }`
 * succeeds and returns `undefined`, while a pointer into `{}` throws. That
 * distinction is the reason this library exists; `obj[key]` alone cannot tell
 * the two cases apart.
 *
 * Array indices must be canonical per RFC 6901 (`0`, `1`, `10`, ...). `-` is
 * rejected during resolution because it has no static target.
 */
export function resolvePointer(document, pointer) {
  const tokens = parsePointer(pointer);
  let current = document;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!isObject(current)) {
      throw new TypeError(
        `cannot resolve token ${JSON.stringify(token)}: value at ${formatPointer(tokens.slice(0, i))} is not an object`,
      );
    }
    if (Array.isArray(current)) {
      const index = decodeIndex(token);
      if (index === null || index >= current.length) {
        throw new RangeError(
          `array index ${JSON.stringify(token)} is out of range at ${formatPointer(tokens.slice(0, i))}`,
        );
      }
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      throw new Error(`missing property ${JSON.stringify(token)} at ${formatPointer(tokens.slice(0, i))}`);
    }
    current = current[token];
  }
  return current;
}

/**
 * Non-throwing existence check. Returns `true` only when the full pointer
 * resolves. This deliberately mirrors `resolvePointer` rather than doing a
 * separate traversal, so the two can never disagree about what counts as
 * present.
 */
export function hasPointer(document, pointer) {
  try {
    resolvePointer(document, pointer);
    return true;
  } catch {
    return false;
  }
}
