import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePointer, hasPointer, parsePointer, formatPointer } from '../src/index.js';

describe('parsePointer', () => {
  it('parses the empty pointer as zero tokens', () => {
    assert.deepEqual(parsePointer(''), []);
  });

  it('splits on unescaped slashes', () => {
    assert.deepEqual(parsePointer('/a/b/c'), ['a', 'b', 'c']);
  });

  it('unescapes ~1 before ~0', () => {
    assert.deepEqual(parsePointer('/~01'), ['~1']);
    assert.deepEqual(parsePointer('/~1'), ['/']);
  });

  it('rejects a pointer that does not start with a slash', () => {
    assert.throws(() => parsePointer('a'), SyntaxError);
  });

  it('rejects an invalid escape sequence', () => {
    assert.throws(() => parsePointer('/~2'), SyntaxError);
  });

  it('rejects non-string input', () => {
    assert.throws(() => parsePointer(42), TypeError);
  });
});

describe('formatPointer', () => {
  it('round-trips through parsePointer', () => {
    const tokens = ['a/b', '~', 'c'];
    assert.deepEqual(parsePointer(formatPointer(tokens)), tokens);
  });

  it('escapes tilde before slash', () => {
    assert.equal(formatPointer(['~/']), '/~0~1');
  });

  it('rejects non-array input', () => {
    assert.throws(() => formatPointer('a'), TypeError);
  });

  it('rejects non-string tokens', () => {
    assert.throws(() => formatPointer([1]), TypeError);
  });
});

describe('resolvePointer', () => {
  const doc = {
    foo: ['bar', 'baz'],
    '': 'empty-key',
    a: {
      b: { c: 3 },
      'm/n': true,
      'm~n': false,
    },
    undef: undefined,
  };

  it('returns the document for the empty pointer', () => {
    assert.equal(resolvePointer(doc, ''), doc);
  });

  it('walks nested objects', () => {
    assert.equal(resolvePointer(doc, '/a/b/c'), 3);
  });

  it('walks arrays by canonical index', () => {
    assert.equal(resolvePointer(doc, '/foo/0'), 'bar');
    assert.equal(resolvePointer(doc, '/foo/1'), 'baz');
  });

  it('accepts the empty token as a property name', () => {
    assert.equal(resolvePointer(doc, '/'), 'empty-key');
  });

  it('unescapes / and ~ in tokens', () => {
    assert.equal(resolvePointer(doc, '/a/m~1n'), true);
    assert.equal(resolvePointer(doc, '/a/m~0n'), false);
  });

  it('distinguishes a missing key from a key holding undefined', () => {
    assert.equal(resolvePointer(doc, '/undef'), undefined);
    assert.throws(() => resolvePointer(doc, '/missing'), /missing property/);
  });

  it('rejects non-canonical array indices', () => {
    assert.throws(() => resolvePointer(doc, '/foo/01'), RangeError);
    assert.throws(() => resolvePointer(doc, '/foo/+1'), RangeError);
  });

  it('rejects the dash token during resolution', () => {
    assert.throws(() => resolvePointer(doc, '/foo/-'), RangeError);
  });

  it('rejects an out-of-range array index', () => {
    assert.throws(() => resolvePointer(doc, '/foo/2'), RangeError);
  });

  it('rejects traversal through a primitive', () => {
    assert.throws(() => resolvePointer(doc, '/foo/0/x'), TypeError);
  });
});

describe('hasPointer', () => {
  const doc = { a: { b: undefined }, list: [10, 20] };

  it('is true for a present key holding undefined', () => {
    assert.equal(hasPointer(doc, '/a/b'), true);
  });

  it('is false for a missing key', () => {
    assert.equal(hasPointer(doc, '/a/c'), false);
  });

  it('is false for an out-of-range index', () => {
    assert.equal(hasPointer(doc, '/list/5'), false);
  });

  it('is false for a malformed pointer', () => {
    assert.equal(hasPointer(doc, 'a'), false);
  });
});
