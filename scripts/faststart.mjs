/* 把 MP4 的 moov 原子搬到 mdat 之前（等同 ffmpeg -movflags +faststart）。
   moov 在尾部时，浏览器必须下完整个文件才知道怎么解码，点击即播会先卡住。
   搬动会改变 mdat 的绝对位置，所以 moov 里所有 chunk offset（stco/co64）都要跟着平移。*/
import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
const buf = readFileSync(src);

function topBoxes(b) {
  const out = [];
  let off = 0;
  while (off + 8 <= b.length) {
    let size = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    let hdr = 8;
    if (size === 1) { size = Number(b.readBigUInt64BE(off + 8)); hdr = 16; }
    else if (size === 0) size = b.length - off;
    if (size < hdr || off + size > b.length) throw new Error(`box ${type} 越界`);
    out.push({ type, off, size, hdr });
    off += size;
  }
  return out;
}

const boxes = topBoxes(buf);
const ftyp = boxes.find(x => x.type === 'ftyp');
const moov = boxes.find(x => x.type === 'moov');
const mdat = boxes.find(x => x.type === 'mdat');
if (!ftyp || !moov || !mdat) throw new Error('缺少 ftyp/moov/mdat');
console.log('原始顺序:', boxes.map(x => x.type).join(' '));
if (moov.off < mdat.off) { console.log('已经是 faststart，直接复制'); writeFileSync(dst, buf); process.exit(0); }

const moovBuf = Buffer.from(buf.subarray(moov.off, moov.off + moov.size));

// 新布局：ftyp + moov + mdat（丢掉 free）
const newMdatOff = ftyp.size + moov.size;
const delta = newMdatOff - mdat.off;
console.log(`mdat 位移 ${delta} 字节`);

// 递归找 moov 内所有 stco / co64 并平移
let patched = 0, entries = 0;
(function walk(b, off, end) {
  while (off + 8 <= end) {
    let size = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    let hdr = 8;
    if (size === 1) { size = Number(b.readBigUInt64BE(off + 8)); hdr = 16; }
    if (size < hdr || off + size > end) break;
    if (['moov','trak','mdia','minf','stbl','edts','udta','moof','traf'].includes(type)) {
      walk(b, off + hdr, off + size);
    } else if (type === 'stco') {
      const n = b.readUInt32BE(off + hdr + 4);
      for (let i = 0; i < n; i++) {
        const p = off + hdr + 8 + i * 4;
        b.writeUInt32BE(b.readUInt32BE(p) + delta, p);
      }
      patched++; entries += n;
    } else if (type === 'co64') {
      const n = b.readUInt32BE(off + hdr + 4);
      for (let i = 0; i < n; i++) {
        const p = off + hdr + 8 + i * 8;
        b.writeBigUInt64BE(b.readBigUInt64BE(p) + BigInt(delta), p);
      }
      patched++; entries += n;
    }
    off += size;
  }
})(moovBuf, 0, moovBuf.length);
console.log(`修正了 ${patched} 张 chunk offset 表，共 ${entries} 条`);
if (!patched) throw new Error('一张 stco/co64 都没找到，不敢写出');

writeFileSync(dst, Buffer.concat([
  buf.subarray(ftyp.off, ftyp.off + ftyp.size),
  moovBuf,
  buf.subarray(mdat.off, mdat.off + mdat.size)
]));
const check = topBoxes(readFileSync(dst));
console.log('新顺序:', check.map(x => x.type).join(' '));
