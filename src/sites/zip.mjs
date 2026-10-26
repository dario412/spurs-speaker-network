// Minimal, dependency-free zip reading and writing on node:zlib, for site packs (docs/site-packs.md).
// The reader is deliberately strict: packs come from outside the repo (agents, uploads), so anything unusual is
// refused rather than interpreted. It trusts only the central directory, enforces declared sizes while inflating
// (zip bombs) and never produces a path outside the archive (no absolute paths, `..`, backslashes or symlinks).
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export const LIMITS = { compressed: 15 * 1024 * 1024, uncompressed: 30 * 1024 * 1024, entries: 50 };

export class ZipError extends Error {}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/** MS-DOS time and date fields (local time, 2-second resolution, 1980 at the earliest). */
function dosDateTime(date) {
  const d = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Builds a zip archive. Each entry is deflated when that makes it smaller, otherwise stored (JPEGs usually are).
 * @param {{ name: string, data: Buffer|string }[]} entries
 * @param {{ date?: Date }} [options]
 * @returns {Buffer}
 */
export function writeZip(entries, { date = new Date() } = {}) {
  const { time, date: day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const name = Buffer.from(entry.name, 'utf8');
    const deflated = deflateRawSync(data);
    const [method, body] = deflated.length < data.length ? [8, deflated] : [0, data];
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Why a name is unsafe to extract, or null. Names are compared as given; nothing is normalised. */
function unsafeName(name) {
  if (!name) return 'has an empty name';
  if (name.includes('\\')) return 'uses a backslash';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'is an absolute path';
  if (name.split('/').some(part => part === '..' || part === '.')) return 'contains "." or ".." segments';
  if (name.includes('\0')) return 'contains a NUL byte';
  return null;
}

/**
 * Reads a zip archive into `[{ name, data }]` (directory entries are skipped).
 * @param {Buffer} buffer
 * @param {{ compressed?: number, uncompressed?: number, entries?: number }} [limits]
 * @throws {ZipError} with a message fit to show a person
 */
export function readZip(buffer, limits = {}) {
  const { compressed, uncompressed, entries: maxEntries } = { ...LIMITS, ...limits };
  if (!Buffer.isBuffer(buffer)) throw new ZipError('Not a file upload.');
  if (buffer.length > compressed) throw new ZipError(`The zip is larger than ${Math.round(compressed / 1024 / 1024)} MB.`);
  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === END) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new ZipError('This is not a zip file (no central directory found).');
  const disk = buffer.readUInt16LE(end + 4);
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const start = buffer.readUInt32LE(end + 16);
  if (disk !== 0 || buffer.readUInt16LE(end + 6) !== 0 || buffer.readUInt16LE(end + 8) !== count)
    throw new ZipError('Split or multi-disk zips are not supported.');
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) throw new ZipError('Zip64 archives are not supported.');
  if (count > maxEntries) throw new ZipError(`The zip has ${count} entries; at most ${maxEntries} are allowed.`);
  if (start + size > end) throw new ZipError('The zip central directory is corrupt.');

  const seen = new Set();
  const out = [];
  let total = 0;
  let at = start;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || buffer.readUInt32LE(at) !== CENTRAL) throw new ZipError('The zip central directory is corrupt.');
    const madeBy = buffer.readUInt16LE(at + 4);
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const crc = buffer.readUInt32LE(at + 16);
    const packed = buffer.readUInt32LE(at + 20);
    const declared = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const external = buffer.readUInt32LE(at + 38);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;

    const label = `"${name}"`;
    if (flags & 0x1) throw new ZipError(`${label} is encrypted; encrypted zips are not supported.`);
    if (packed === 0xffffffff || declared === 0xffffffff || localOffset === 0xffffffff)
      throw new ZipError('Zip64 archives are not supported.');
    const unsafe = unsafeName(name);
    if (unsafe) throw new ZipError(`${label} ${unsafe}.`);
    if (madeBy >> 8 === 3 && ((external >>> 16) & 0o170000) === 0o120000) throw new ZipError(`${label} is a symbolic link.`);
    if (seen.has(name)) throw new ZipError(`${label} appears twice in the zip.`);
    seen.add(name);
    if (name.endsWith('/')) continue;
    total += declared;
    if (total > uncompressed) throw new ZipError(`The zip unpacks to more than ${Math.round(uncompressed / 1024 / 1024)} MB.`);

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw new ZipError(`${label} is corrupt.`);
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + packed > start) throw new ZipError(`${label} is corrupt.`);
    const raw = buffer.subarray(dataStart, dataStart + packed);
    let data;
    if (method === 0) {
      if (packed !== declared) throw new ZipError(`${label} is corrupt (stored size mismatch).`);
      data = Buffer.from(raw);
    } else if (method === 8) {
      try {
        // maxOutputLength stops a lying header from inflating past what it declared (zip bomb).
        data = inflateRawSync(raw, { maxOutputLength: Math.max(declared, 1) });
      } catch (error) {
        throw new ZipError(
          error.code === 'ERR_BUFFER_TOO_LARGE' || error instanceof RangeError
            ? `${label} unpacks to more than its declared size.`
            : `${label} is corrupt (${error.message}).`,
        );
      }
      if (data.length !== declared) throw new ZipError(`${label} unpacks to a different size than declared.`);
    } else {
      throw new ZipError(`${label} uses compression method ${method}; only stored and deflate are supported.`);
    }
    if (crc32(data) !== crc) throw new ZipError(`${label} failed its checksum.`);
    out.push({ name, data });
  }
  return out;
}
