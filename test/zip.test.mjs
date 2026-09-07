import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../src/public/zip.js';

test('builds a browser-side ZIP containing the selected files', async () => {
  const encoder = new TextEncoder();
  const first = encoder.encode('abc');
  const second = encoder.encode('photo-data');
  const zip = await buildZip([
    { name: 'one.txt', arrayBuffer: async () => first.buffer },
    { name: 'photo.jpg', arrayBuffer: async () => second.buffer },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = new TextDecoder().decode(bytes);
  const endOffset = bytes.length - 22;

  assert.equal(zip.type, 'application/zip');
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x352441c2);
  assert.equal(view.getUint32(endOffset, true), 0x06054b50);
  assert.equal(view.getUint16(endOffset + 8, true), 2);
  assert.match(text, /one\.txt/);
  assert.match(text, /photo\.jpg/);
});
