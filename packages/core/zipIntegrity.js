// ZIP32 metadata and CRC checks complement fflate's decompressor. Format:
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (sections 4.3, 4.4).
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

/** @param {Uint8Array} bytes */
export function zipCrc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** Validate bounded, single-disk ZIP32 metadata before allocating output.
 * Unsupported ZIP64/encryption/methods fail closed.
 * @param {Uint8Array} bytes
 * @param {{maxFiles: number, maxExpanded: number}} limits
 */
export function inspectZip(bytes, { maxFiles, maxExpanded }) {
  const fail = () => { throw new Error('Invalid ZIP metadata'); };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < 0 || end < bytes.length - 65557 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail();
  const count = u16(end + 10), start = u32(end + 16), size = u32(end + 12);
  if (count > maxFiles) throw new RangeError('ZIP limits exceeded');
  if (start + size !== end || start === 0xffffffff || size === 0xffffffff) fail();
  const entries = [];
  const names = new Set();
  let offset = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail();
    const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16);
    const compressed = u32(offset + 20), original = u32(offset + 24), nameLength = u16(offset + 28);
    const next = offset + 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    const local = u32(offset + 42);
    if (next > end || (flags & 0x2041) || ![0, 8].includes(method) || u16(offset + 34) || local + 30 > start || u32(local) !== 0x04034b50) fail();
    if ((expanded += original) > maxExpanded) throw new RangeError('ZIP limits exceeded');
    if (u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLength) fail();
    const dataStart = local + 30 + nameLength + u16(local + 28);
    if (dataStart + compressed > start || (method === 0 && compressed !== original)) fail();
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== original)) fail();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if (!nameLength || nameBytes.some((byte, index) => byte !== bytes[local + 30 + index])) fail();
    // Keep the raw name as a key; the importer validates decoded path names too.
    const nameKey = Array.from(nameBytes).join(',');
    if (names.has(nameKey)) fail();
    names.add(nameKey);
    entries.push({ nameBytes, crc, original });
    offset = next;
  }
  if (offset !== end) fail();
  return entries;
}
