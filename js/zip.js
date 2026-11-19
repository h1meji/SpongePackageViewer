/* Minimal streaming ZIP reader (ZIP64-aware) for File/Blob objects.
   Nothing is loaded into memory up front: only the central directory is read,
   and each entry is streamed from a slice of the file through DecompressionStream. */
'use strict';

const ZipReader = (() => {
  const u16 = (v, o) => v.getUint16(o, true);
  const u32 = (v, o) => v.getUint32(o, true);
  const u64 = (v, o) => v.getUint32(o, true) + v.getUint32(o + 4, true) * 4294967296;
  const utf8 = new TextDecoder('utf-8');
  const cp437 = new TextDecoder('ibm866'); // close enough for legacy non-UTF8 names

  async function readBytes(file, start, end) {
    return new DataView(await file.slice(start, end).arrayBuffer());
  }

  async function open(file) {
    const size = file.size;
    const tailLen = Math.min(size, 65557 + 20);
    const tailStart = size - tailLen;
    const tail = await readBytes(file, tailStart, size);
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This does not look like a zip file (no end-of-central-directory record).');
    let count = u16(tail, eocd + 10), cdSize = u32(tail, eocd + 12), cdOffset = u32(tail, eocd + 16);
    // ZIP64
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const loc = eocd - 20;
      if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
        const z64off = u64(tail, loc + 8);
        const z = await readBytes(file, z64off, z64off + 56);
        if (u32(z, 0) !== 0x06064b50) throw new Error('Corrupt ZIP64 record');
        count = u64(z, 32); cdSize = u64(z, 40); cdOffset = u64(z, 48);
      }
    }
    const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
      if (u32(cd, p) !== 0x02014b50) throw new Error('Corrupt central directory');
      const flags = u16(cd, p + 8), method = u16(cd, p + 10);
      let csize = u32(cd, p + 20), usize = u32(cd, p + 24);
      const nlen = u16(cd, p + 28), xlen = u16(cd, p + 30), clen = u16(cd, p + 32);
      let off = u32(cd, p + 42);
      const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen);
      const name = (flags & 0x800 ? utf8 : (() => { try { return new TextDecoder('utf-8', { fatal: true }); } catch { return cp437; } })()).decode(nameBytes);
      // zip64 extra field
      let x = p + 46 + nlen; const xend = x + xlen;
      while (x + 4 <= xend) {
        const id = u16(cd, x), sz = u16(cd, x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; }
          if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; }
          if (off === 0xffffffff) { off = u64(cd, q); q += 8; }
        }
        x += 4 + sz;
      }
      entries.push({ name, method, csize, usize, offset: off, dir: name.endsWith('/') });
      p += 46 + nlen + xlen + clen;
    }
    return new Archive(file, entries);
  }

  class Archive {
    constructor(file, entries) {
      this.file = file;
      this.entries = entries;
      this.byLower = new Map();
      for (const e of entries) this.byLower.set(e.name.toLowerCase(), e);
    }
    get(name) { return this.byLower.get(String(name).toLowerCase()) || null; }
    async dataStart(e) {
      if (e._data != null) return e._data;
      const h = await readBytes(this.file, e.offset, e.offset + 30);
      if (u32(h, 0) !== 0x04034b50) throw new Error('Corrupt local header for ' + e.name);
      return (e._data = e.offset + 30 + u16(h, 26) + u16(h, 28));
    }
    /* Returns a ReadableStream of decompressed bytes. onCompressed(n) is called with compressed bytes read. */
    async stream(e, onCompressed) {
      const start = await this.dataStart(e);
      let s = this.file.slice(start, start + e.csize).stream();
      if (onCompressed) {
        s = s.pipeThrough(new TransformStream({ transform(chunk, c) { onCompressed(chunk.byteLength); c.enqueue(chunk); } }));
      }
      if (e.method === 0) return s;
      if (e.method === 8) return s.pipeThrough(new DecompressionStream('deflate-raw'));
      throw new Error(`Unsupported compression method ${e.method} for ${e.name}`);
    }
    async text(e) { return new Response(await this.stream(e)).text(); }
    async json(e) {
      const t = await this.text(e);
      return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
    }
    async blob(e, type) { const b = await new Response(await this.stream(e)).blob(); return type ? new Blob([b], { type }) : b; }
    /* Calls onLine(string) for every line; streams so multi-GB files are fine. */
    async lines(e, onLine, onCompressed) {
      const reader = (await this.stream(e, onCompressed)).pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (; ;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i, s = 0;
        while ((i = buf.indexOf('\n', s)) !== -1) { if (i > s) onLine(buf.slice(s, i)); s = i + 1; }
        buf = buf.slice(s);
      }
      if (buf.trim()) onLine(buf);
    }
  }
  return { open };
})();
if (typeof self !== 'undefined') self.ZipReader = ZipReader;
