"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// windows-package/source/archives.mjs
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_sqlite = require("node:sqlite");
var import_node_crypto = require("node:crypto");

// windows-package/source/reports.mjs
var import_node_path = __toESM(require("node:path"), 1);
var maxReportSize = 20 * 1024 * 1024;
var types = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".txt": "text/plain" };
function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
async function parseReport(file2) {
  if (!file2 || typeof file2 === "string" || file2.size === 0) return null;
  if (file2.size > maxReportSize) throw problem("\u6D4B\u8BD5\u62A5\u544A\u4E0D\u80FD\u8D85\u8FC7 20 MB");
  const name = import_node_path.default.basename(file2.name.replace(/\\/g, "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180);
  const ext = import_node_path.default.extname(name).toLowerCase();
  if (!types[ext]) throw problem("\u652F\u6301 PDF\u3001PNG\u3001JPG\u3001Word\u3001Excel \u548C TXT \u6587\u4EF6");
  const data = Buffer.from(await file2.arrayBuffer());
  const inline = ext === ".pdf" && data.subarray(0, 5).toString() === "%PDF-" || ext === ".png" && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || [".jpg", ".jpeg"].includes(ext) && data[0] === 255 && data[1] === 216 && data[2] === 255;
  return { name, data, mime: types[ext], inline: !!inline };
}

// windows-package/source/archives.mjs
var archiveDir = import_node_path2.default.join(process.env.RDIMM_DATA_DIR || import_node_path2.default.join(process.cwd(), "data"), "finished_order");
function archiveName(value) {
  const fallback = "\u5F52\u6863_" + new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const name = String(value || fallback).trim().replace(/\.(sqlite|db)$/i, "");
  if (!name || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw problem("\u5F52\u6863\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u3001\u7279\u6B8A\u5B57\u7B26\u6216 Windows \u4FDD\u7559\u540D\u79F0\uFF0C\u6700\u591A 100 \u4E2A\u5B57\u7B26");
  return name + ".sqlite";
}
function reserveArchive(value) {
  import_node_fs.default.mkdirSync(archiveDir, { recursive: true });
  const name = archiveName(value), base = name.slice(0, -7);
  for (let i = 0; ; i++) {
    const filename = i ? `${base}_${i}.sqlite` : name;
    try {
      const fd2 = import_node_fs.default.openSync(import_node_path2.default.join(archiveDir, filename), "wx");
      import_node_fs.default.closeSync(fd2);
      return { filename, file: import_node_path2.default.join(archiveDir, filename) };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
}
function resolved(name) {
  if (typeof name !== "string" || import_node_path2.default.basename(name) !== name || !name.endsWith(".sqlite")) throw problem("\u5F52\u6863\u540D\u79F0\u65E0\u6548");
  const file2 = import_node_path2.default.join(archiveDir, name);
  if (!import_node_fs.default.existsSync(file2) || !import_node_fs.default.lstatSync(file2).isFile()) throw problem("\u672A\u627E\u5230\u6570\u636E\u5E93\u5F52\u6863", 404);
  return file2;
}
function listArchives() {
  if (!import_node_fs.default.existsSync(archiveDir)) return [];
  return import_node_fs.default.readdirSync(archiveDir).filter((n) => n.endsWith(".sqlite") && import_node_fs.default.lstatSync(import_node_path2.default.join(archiveDir, n)).isFile()).map((name) => {
    const s = import_node_fs.default.statSync(import_node_path2.default.join(archiveDir, name));
    return { name, size: s.size, modified: s.mtime.toISOString() };
  }).sort((a, b) => b.modified.localeCompare(a.modified));
}
function inspect(file2, reportId) {
  const db = new import_node_sqlite.DatabaseSync(file2, { readOnly: true, allowExtension: false });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;");
    for (const name of ["samples", "returns"]) if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name)) throw problem("\u4E0D\u662F\u517C\u5BB9\u7684 RDIMM \u6570\u636E\u5E93");
    if (reportId !== void 0) {
      if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='report_files'").get()) return null;
      return db.prepare("SELECT name,mime,inline,data FROM report_files WHERE return_id=?").get(reportId);
    }
    const rows = db.prepare("SELECT id,data,quantity FROM samples ORDER BY id").all().map((r) => {
      const data = JSON.parse(r.data);
      if (!data || typeof data !== "object" || Array.isArray(data) || !Number.isInteger(r.quantity) || r.quantity < 1) throw problem("\u6570\u636E\u5E93\u4E2D\u7684\u9001\u6837\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
      const row = { id: String(r.id), quantity: r.quantity, returned: 0 };
      for (const [k, v] of Object.entries(data)) if (!["id", "quantity", "returned", "__proto__", "constructor", "prototype"].includes(k)) row[k] = v == null ? null : String(v);
      return row;
    });
    const columns = new Set(db.prepare("PRAGMA table_info(returns)").all().map((c) => c.name));
    const returns = db.prepare(`SELECT id,sample_id,quantity,returned_on,note,${columns.has("report_provided") ? "report_provided" : "NULL AS report_provided"},${columns.has("report_name") ? "report_name" : "NULL AS report_name"} FROM returns ORDER BY returned_on DESC,id`).all();
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of returns) {
      if (!byId.has(r.sample_id) || !Number.isInteger(r.quantity) || r.quantity < 1) throw problem("\u6570\u636E\u5E93\u4E2D\u7684\u5F52\u8FD8\u660E\u7EC6\u683C\u5F0F\u65E0\u6548");
      byId.get(r.sample_id).returned += r.quantity;
    }
    return { rows, returns };
  } finally {
    db.close();
  }
}
function viewArchive(name) {
  return inspect(resolved(name));
}
function archiveReport(name, id) {
  return inspect(resolved(name), id);
}
async function uploadArchive(req, name) {
  import_node_fs.default.mkdirSync(archiveDir, { recursive: true });
  const temp = import_node_path2.default.join(archiveDir, ".upload-" + (0, import_node_crypto.randomUUID)());
  let fd2, allocated;
  try {
    archiveName(name);
    fd2 = import_node_fs.default.openSync(temp, "wx");
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 512 * 1024 * 1024) throw problem("\u6570\u636E\u5E93\u4E0A\u4F20\u4E0A\u9650\u4E3A 512 MB", 413);
      import_node_fs.default.writeFileSync(fd2, chunk);
    }
    import_node_fs.default.fsyncSync(fd2);
    import_node_fs.default.closeSync(fd2);
    fd2 = void 0;
    const check = import_node_fs.default.openSync(temp, "r");
    const signature = Buffer.alloc(16);
    import_node_fs.default.readSync(check, signature, 0, 16, 0);
    import_node_fs.default.closeSync(check);
    if (signature.toString() !== "SQLite format 3\0") throw problem("\u8BF7\u9009\u62E9\u5B8C\u6574\u7684 SQLite \u6570\u636E\u5E93\u6587\u4EF6\uFF08.sqlite \u6216 .db\uFF09");
    const verify = new import_node_sqlite.DatabaseSync(temp, { readOnly: true, allowExtension: false });
    try {
      verify.exec("PRAGMA trusted_schema=OFF");
      if (verify.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw problem("\u6570\u636E\u5E93\u5B8C\u6574\u6027\u68C0\u67E5\u5931\u8D25");
    } finally {
      verify.close();
    }
    inspect(temp);
    allocated = reserveArchive(name);
    import_node_fs.default.copyFileSync(temp, allocated.file);
    return { ok: true, name: allocated.filename };
  } catch (e) {
    if (allocated) try {
      import_node_fs.default.unlinkSync(allocated.file);
    } catch {
    }
    ;
    if (e.status) throw e;
    throw problem("\u6570\u636E\u5E93\u65E0\u6CD5\u4FDD\u5B58\u6216\u8BFB\u53D6\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u5939\u6743\u9650\u3001\u78C1\u76D8\u7A7A\u95F4\uFF0C\u5E76\u9009\u62E9\u5B8C\u6574\u4E14\u517C\u5BB9\u7684 RDIMM \u6570\u636E\u5E93");
  } finally {
    if (fd2 !== void 0) import_node_fs.default.closeSync(fd2);
    try {
      import_node_fs.default.unlinkSync(temp);
    } catch {
    }
  }
}

// windows-package/source/server.mjs
var import_node_http = __toESM(require("node:http"), 1);
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var import_node_crypto4 = require("node:crypto");
var import_node_child_process = require("node:child_process");

// windows-package/source/storage.mjs
var import_node_sqlite2 = require("node:sqlite");
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_crypto3 = require("node:crypto");

// windows-package/source/attachments.mjs
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_crypto2 = require("node:crypto");
function saveAttachment(id, report) {
  const key = (0, import_node_crypto2.createHash)("sha256").update(String(id)).digest("hex").slice(0, 20);
  const directory = import_node_path3.default.join(process.cwd(), "Attachment", key);
  const original = String(report.name).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_").replace(/[. ]+$/g, "").slice(0, 160) || "report";
  const name = "\u62A5\u544A_" + original;
  import_node_fs2.default.mkdirSync(directory, { recursive: true });
  for (let index = 0; ; index++) {
    const ext = import_node_path3.default.extname(name), base = import_node_path3.default.basename(name, ext);
    const file2 = import_node_path3.default.join(directory, index ? `${base}_${index}${ext}` : name);
    let fd2;
    try {
      fd2 = import_node_fs2.default.openSync(file2, "wx");
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (import_node_fs2.default.lstatSync(file2).isFile() && import_node_fs2.default.readFileSync(file2).equals(Buffer.from(report.data))) return { file: file2, created: false };
      continue;
    }
    try {
      import_node_fs2.default.writeFileSync(fd2, report.data);
      import_node_fs2.default.fsyncSync(fd2);
      import_node_fs2.default.closeSync(fd2);
      return { file: file2, created: true };
    } catch (e) {
      try {
        import_node_fs2.default.closeSync(fd2);
      } catch {
      }
      try {
        import_node_fs2.default.unlinkSync(file2);
      } catch {
      }
      throw e;
    }
  }
}
function discardAttachment(copy) {
  if (copy?.created) try {
    import_node_fs2.default.unlinkSync(copy.file);
  } catch {
  }
}

// windows-package/source/export.mjs
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// rdimm-app/node_modules/fflate/esm/index.mjs
var import_module = require("module");
var require2 = (0, import_module.createRequire)("/");
var Worker;
try {
  Worker = require2("worker_threads").Worker;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var u32 = Uint32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new u32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return [b, r];
};
var _a = freb(fleb, 2);
var fl = _a[0];
var revfl = _a[1];
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b[0];
var revfd = _b[1];
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >>> 1 | (i & 21845) << 1;
  x = (x & 52428) >>> 2 | (x & 13107) << 2;
  x = (x & 61680) >>> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >>> 8 | (x & 255) << 8) >>> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 0; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >>> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >>> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  var n = new (v.BYTES_PER_ELEMENT == 2 ? u16 : v.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
  n.set(v.subarray(s, e));
  return n;
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, buf, st) {
  var sl = dat.length;
  if (!sl || st && st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf || st;
  var noSt = !st || st.i;
  if (!st)
    st = {};
  if (!buf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (noBuf)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >>> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (noBuf)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (noBuf)
          cbuf(bt + 131072);
        var end = bt + add;
        for (; bt < end; bt += 4) {
          buf[bt] = buf[bt - dt];
          buf[bt + 1] = buf[bt + 1 - dt];
          buf[bt + 2] = buf[bt + 2 - dt];
          buf[bt + 3] = buf[bt + 3 - dt];
        }
        bt = end;
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt == buf.length ? buf : slc(buf, 0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >>> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >>> 8;
  d[o + 2] |= v >>> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return [et, 0];
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return [v, 1];
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return [new u8(tr), mbt];
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return [cl.subarray(0, cli), s];
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >>> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2[0], mlb = _a2[1];
  var _b2 = hTree(df, 15), ddt = _b2[0], mdb = _b2[1];
  var _c = lc(dlt), lclt = _c[0], nlc = _c[1];
  var _d = lc(ddt), lcdt = _d[0], ndc = _d[1];
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    lcfreq[lclt[i] & 31]++;
  for (var i = 0; i < lcdt.length; ++i)
    lcfreq[lcdt[i] & 31]++;
  var _e = hTree(lcfreq, 7), lct = _e[0], mlcb = _e[1];
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + (2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18]);
  if (flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >>> 5 & 127), p += clct[i] >>> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    if (syms[i] > 255) {
      var len = syms[i] >>> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, syms[i] >>> 23 & 31), p += fleb[len];
      var dst = syms[i] & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, syms[i] >>> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[syms[i]]), p += ll[syms[i]];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new u32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, lst) {
  var s = dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var pos = 0;
  if (!lvl || s < 8) {
    for (var i = 0; i <= s; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos >> 3] = lst;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
  } else {
    var opt = deo[lvl - 1];
    var n = opt >>> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = new u16(32768), head = new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new u32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = 0, li = 0, wi = 0, bs = 0;
    for (; i < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && rem > 423) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j + 32768 & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti + 32768 & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod + 32768 & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst && pos & 7)
      pos = wfblk(w, pos + 1, et);
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 12 + opt.mem, pre, post, !st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
function inflateSync(data, out) {
  return inflt(data, out);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (val instanceof u8)
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return [r, slc(d, i - 1)];
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strToU8(str2, latin1) {
  if (latin1) {
    var ar_1 = new u8(str2.length);
    for (var i = 0; i < str2.length; ++i)
      ar_1[i] = str2.charCodeAt(i);
    return ar_1;
  }
  if (te)
    return te.encode(str2);
  var l = str2.length;
  var ar = new u8(str2.length + (str2.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str2.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str2.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td)
    return td.decode(dat);
  else {
    var _a2 = dutf8(dat), out = _a2[0], ext = _a2[1];
    if (ext.length)
      err(8);
    return out;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
  var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col2 = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >>> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col2);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col2)
    d.set(co, b), b += col2;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file2 = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file2, p) : file2, l = d.length;
    var c = crc();
    c.p(file2);
    files.push(mrg(p, {
      size: file2.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i = 0; i < files.length; ++i) {
    var f = files[i];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = o == 4294967295 || c == 65535;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), new u8(su));
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// windows-package/source/export-template.json
var export_template_default = "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";

// windows-package/source/export-columns.json
var export_columns_default = [[["id", "\u8BB0\u5F55\u7F16\u53F7"], ["customer", "\u5BA2\u6237"], ["owner", "\u7533\u8BF7\u4EBA"], ["spec", "\u4EA7\u54C1\u89C4\u683C"], ["batch", "\u6279\u6B21"], ["quantity", "\u7533\u8BF7\u6570\u91CF", "n"], ["sentQuantity", "\u9001\u51FA\u6570\u91CF", "n"], ["returned", "\u5DF2\u5F52\u8FD8\u6570\u91CF", "n"], ["remaining", "\u672A\u5F52\u8FD8\u6570\u91CF", "n"], ["applied", "\u7533\u8BF7\u65E5\u671F", "d"], ["sent", "\u5B9E\u9645\u9001\u6837\u65E5\u671F", "d"], ["due", "\u7EA6\u5B9A\u5F52\u8FD8\u65E5\u671F", "d"], ["status", "\u72B6\u6001"], ["part", "\u6837\u54C1\u6599\u53F7"], ["platform", "\u5BA2\u6237\u5E73\u53F0"], ["note", "\u5907\u6CE8"], ["sourceId", "\u539F\u59CB\u5E8F\u53F7"], ["environment", "\u6D4B\u8BD5\u73AF\u5883"], ["spd", "SPD"], ["printing", "\u4E1D\u5370\u8981\u6C42"], ["label", "\u6807\u7B7E\u8981\u6C42"], ["requested", "\u9700\u6C42\u65E5\u671F", "d"], ["actualReturn", "\u539F\u59CB\u5B9E\u9645\u5F52\u8FD8\u65E5\u671F", "d"], ["urgency", "\u7D27\u6025\u7A0B\u5EA6"], ["category", "\u7C7B\u522B"], ["documents", "\u8D44\u6599"], ["report", "\u62A5\u544A"]], [["id", "\u5F52\u8FD8\u8BB0\u5F55\u7F16\u53F7"], ["sample_id", "\u9001\u6837\u8BB0\u5F55\u7F16\u53F7"], ["customer", "\u5BA2\u6237"], ["owner", "\u7533\u8BF7\u4EBA"], ["spec", "\u4EA7\u54C1\u89C4\u683C"], ["batch", "\u6279\u6B21"], ["returned_on", "\u5B9E\u9645\u5F52\u8FD8\u65E5\u671F", "d"], ["quantity", "\u5F52\u8FD8\u6570\u91CF", "n"], ["note", "\u5F52\u8FD8\u5907\u6CE8"], ["report_status", "\u5BA2\u6237\u662F\u5426\u63D0\u4F9B\u6D4B\u8BD5\u62A5\u544A"], ["report_name", "\u6D4B\u8BD5\u62A5\u544A\u6587\u4EF6\u540D"]]];

// windows-package/source/export.mjs
var xml = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var col = (n) => {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
};
function exportWorkbook(snapshot2, now = /* @__PURE__ */ new Date(), directory = import_node_path4.default.join(process.cwd(), "back_up")) {
  const stamp = new Date(now.getTime() + 8 * 36e5).toISOString().slice(0, 16);
  const day2 = stamp.slice(0, 10);
  const state = (r) => {
    if (!r.sent) return "\u5F85\u9001\u6837";
    if (r.returned >= r.quantity) return "\u5DF2\u5F52\u8FD8";
    if (!r.due) return "\u5F85\u7EA6\u5B9A\u65E5\u671F";
    const d = (Date.parse(r.due.slice(0, 10)) - Date.parse(day2)) / 864e5;
    return d < 0 ? "\u5DF2\u903E\u671F" : d === 0 ? "\u4ECA\u65E5\u5230\u671F" : d <= 7 ? "\u5373\u5C06\u5230\u671F" : r.returned ? "\u90E8\u5206\u5F52\u8FD8" : "\u501F\u51FA\u4E2D";
  };
  const byId = new Map(snapshot2.rows.map((r) => [r.id, r]));
  const data = [snapshot2.rows.map((r) => ({ ...r, sentQuantity: r.sent ? r.quantity : 0, remaining: r.sent ? r.quantity - r.returned : 0, status: state(r) })), snapshot2.returns.map((r) => ({ ...byId.get(r.sample_id), ...r, report_status: r.report_provided === "yes" ? "\u5DF2\u63D0\u4F9B" : r.report_provided === "no" ? "\u672A\u63D0\u4F9B" : "\u672A\u767B\u8BB0" }))];
  const files = unzipSync(Buffer.from(export_template_default, "base64"));
  for (let i = 0; i < 2; i++) {
    if (data[i].length > 1048572) throw Error("\u8BB0\u5F55\u6570\u91CF\u8D85\u8FC7 Excel \u5355\u8868\u4E0A\u9650");
    const file2 = `xl/worksheets/sheet${i + 1}.xml`;
    let sheet = strFromU8(files[file2]);
    const proto = sheet.match(/<x:row r="5"[^>]*>.*?<\/x:row>/s)[0];
    const styles = export_columns_default[i].map((_, j) => proto.match(new RegExp(`<x:c r="${col(j)}5" s="(\\d+)"`))[1]);
    const rows = data[i].map((r, index) => `<x:row r="${index + 5}">${export_columns_default[i].map(([key, , type], j) => {
      const value = r[key], ref = col(j) + (index + 5), style = styles[j];
      if (value == null || value === "") return `<x:c r="${ref}" s="${style}"/>`;
      if (type === "n" && Number.isFinite(Number(value))) return `<x:c r="${ref}" s="${style}" t="n"><x:v>${Number(value)}</x:v></x:c>`;
      if (type === "d" && /^\d{4}-\d{2}-\d{2}/.test(String(value)) && Number.isFinite(Date.parse(String(value).slice(0, 10)))) return `<x:c r="${ref}" s="${style}" t="n"><x:v>${Date.parse(String(value).slice(0, 10)) / 864e5 + 25569}</x:v></x:c>`;
      return `<x:c r="${ref}" s="${style}" t="inlineStr"><x:is><x:t xml:space="preserve">${xml(value)}</x:t></x:is></x:c>`;
    }).join("")}</x:row>`).join("");
    sheet = sheet.replace(proto, rows).replace(/<x:c r="B2"[^>]*\/>/, `<x:c r="B2" s="1" t="inlineStr"><x:is><x:t>${stamp.replace("T", " ")}</x:t></x:is></x:c>`);
    sheet = sheet.replace("</x:sheetData>", `</x:sheetData><x:autoFilter ref="A4:${col(export_columns_default[i].length - 1)}${Math.max(4, data[i].length + 4)}"/>`);
    files[file2] = strToU8(sheet);
  }
  const bytes = zipSync(files, { level: 6 });
  import_node_fs3.default.mkdirSync(directory, { recursive: true });
  const base = stamp.replace("T", "_").replace(":", "-");
  for (let index = 0; ; index++) {
    const filename = base + (index ? "_" + String(index).padStart(2, "0") : "") + ".xlsx";
    const target = import_node_path4.default.join(directory, filename);
    let fd2;
    try {
      fd2 = import_node_fs3.default.openSync(target, "wx");
    } catch (e) {
      if (e.code === "EEXIST") continue;
      throw e;
    }
    try {
      import_node_fs3.default.writeFileSync(fd2, bytes);
      import_node_fs3.default.fsyncSync(fd2);
      import_node_fs3.default.closeSync(fd2);
    } catch (e) {
      try {
        import_node_fs3.default.closeSync(fd2);
      } catch {
      }
      try {
        import_node_fs3.default.unlinkSync(target);
      } catch {
      }
      throw e;
    }
    return { ok: true, filename, path: "back_up/" + filename, samples: snapshot2.rows.length, returns: snapshot2.returns.length };
  }
}

// windows-package/source/storage.mjs
var root = process.env.RDIMM_DATA_DIR || import_node_path5.default.join(process.cwd(), "data");
import_node_fs4.default.mkdirSync(root, { recursive: true });
var file = import_node_path5.default.join(root, "rdimm.sqlite");
var existing = import_node_fs4.default.existsSync(file);
var sql = new import_node_sqlite2.DatabaseSync(file);
sql.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
if (existing) {
  const backupDir = import_node_path5.default.join(root, "backups");
  import_node_fs4.default.mkdirSync(backupDir, { recursive: true });
  const target = import_node_path5.default.join(backupDir, `rdimm-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`);
  if (!import_node_fs4.default.existsSync(target)) sql.prepare("VACUUM INTO ?").run(target);
}
sql.exec(`CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,data TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0));
CREATE TABLE IF NOT EXISTS returns(id TEXT PRIMARY KEY,sample_id TEXT NOT NULL REFERENCES samples(id),quantity INTEGER NOT NULL CHECK(quantity>0),returned_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_returns_sample ON returns(sample_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
var returnColumns = new Set(sql.prepare("PRAGMA table_info(returns)").all().map((c) => c.name));
for (const column of ["report_provided", "report_name"]) if (!returnColumns.has(column)) sql.exec(`ALTER TABLE returns ADD COLUMN ${column} TEXT`);
sql.exec(`CREATE TABLE IF NOT EXISTS report_files(return_id TEXT PRIMARY KEY REFERENCES returns(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,inline INTEGER NOT NULL,data BLOB NOT NULL);`);
if (!sql.prepare("SELECT 1 FROM settings WHERE key='initialized'").get()) {
  const snapshot2 = JSON.parse(import_node_fs4.default.readFileSync(import_node_path5.default.join(process.cwd(), "initial-data.json"), "utf8"));
  sql.exec("BEGIN IMMEDIATE");
  try {
    for (const r of snapshot2.rows) sql.prepare("INSERT INTO samples(id,data,quantity) VALUES(?,?,?)").run(r.id, JSON.stringify(r), r.quantity);
    for (const r of snapshot2.returns) sql.prepare("INSERT INTO returns(id,sample_id,quantity,returned_on,note) VALUES(?,?,?,?,?)").run(r.id, r.sample_id, r.quantity, r.returned_on, r.note || "");
    sql.prepare("INSERT INTO settings VALUES('initialized','1')").run();
    sql.exec("COMMIT");
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}
function database() {
  return { prepare(query) {
    return { bind(...args) {
      const stmt = sql.prepare(query);
      return { run() {
        const r = stmt.run(...args);
        return { meta: { changes: Number(r.changes) } };
      }, all() {
        return { results: stmt.all(...args) };
      }, first() {
        return stmt.get(...args) || null;
      } };
    }, all() {
      return { results: sql.prepare(query).all() };
    } };
  } };
}
async function ensureSeed() {
}
function deleteSample(id) {
  sql.exec("BEGIN IMMEDIATE");
  try {
    sql.prepare("DELETE FROM returns WHERE sample_id=?").run(id);
    const result = sql.prepare("DELETE FROM samples WHERE id=?").run(id);
    sql.exec("COMMIT");
    return { ok: true, id, deleted: Number(result.changes) > 0 };
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}
function close() {
  sql.close();
}
function resetSamples(requestId, customName) {
  const key = "reset:" + requestId;
  const prior = sql.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (prior) return JSON.parse(prior.value);
  archiveName(customName);
  const backupDir = import_node_path5.default.join(root, "backups");
  import_node_fs4.default.mkdirSync(backupDir, { recursive: true });
  const backupName = "before-reset-" + (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-") + "-" + (0, import_node_crypto3.randomUUID)().slice(0, 8) + ".sqlite";
  sql.prepare("VACUUM INTO ?").run(import_node_path5.default.join(backupDir, backupName));
  const excelBackup = exportWorkbook(snapshot());
  const archive = reserveArchive(customName);
  try {
    sql.prepare("VACUUM INTO ?").run(archive.file);
  } catch (e) {
    try {
      import_node_fs4.default.unlinkSync(archive.file);
    } catch {
    }
    throw e;
  }
  sql.exec("BEGIN IMMEDIATE");
  try {
    const returnsRemoved = Number(sql.prepare("DELETE FROM returns").run().changes);
    const samplesRemoved = Number(sql.prepare("DELETE FROM samples").run().changes);
    const result = { ok: true, backup: "data/backups/" + backupName, excelBackup: excelBackup.path, archive: "data/finished_order/" + archive.filename, samplesRemoved, returnsRemoved };
    sql.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('initialized','1')").run();
    sql.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(key, JSON.stringify(result));
    sql.exec("COMMIT");
    return result;
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}
function snapshot() {
  const rows = sql.prepare("SELECT s.*,COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.sample_id=s.id),0) returned FROM samples s ORDER BY s.id").all().map((r) => ({ ...JSON.parse(r.data), id: r.id, quantity: r.quantity, returned: r.returned }));
  return { rows, returns: sql.prepare("SELECT * FROM returns ORDER BY returned_on DESC,id").all() };
}
function saveReturn(b, file2 = null, reportOnly = false) {
  let attachment;
  const provided = b.report_provided ?? null;
  if (![null, "yes", "no"].includes(provided) || file2 && provided !== "yes") throw problem("\u8BF7\u9009\u62E9\u5BA2\u6237\u662F\u5426\u63D0\u4F9B\u6D4B\u8BD5\u62A5\u544A\uFF1B\u4E0A\u4F20\u9644\u4EF6\u987B\u9009\u62E9\u5DF2\u63D0\u4F9B");
  sql.exec("BEGIN IMMEDIATE");
  try {
    const existing2 = sql.prepare("SELECT * FROM returns WHERE id=?").get(String(b.requestId || ""));
    if (reportOnly) {
      if (!existing2) throw problem("\u672A\u627E\u5230\u5F52\u8FD8\u8BB0\u5F55", 404);
      if (!file2) throw problem("\u8BF7\u9009\u62E9\u9700\u8981\u4E0A\u4F20\u7684\u6D4B\u8BD5\u62A5\u544A");
      if (sql.prepare("SELECT 1 FROM report_files WHERE return_id=?").get(existing2.id)) throw problem("\u8BE5\u6B21\u5F52\u8FD8\u5DF2\u4E0A\u4F20\u62A5\u544A\uFF0C\u8BF7\u52FF\u91CD\u590D\u4E0A\u4F20", 409);
      sql.prepare("UPDATE returns SET report_provided=?,report_name=? WHERE id=?").run("yes", file2.name, existing2.id);
    } else {
      if (existing2) throw problem("\u8FD9\u6B21\u5F52\u8FD8\u5DF2\u4FDD\u5B58\uFF0C\u8BF7\u5237\u65B0\u540E\u67E5\u770B", 409);
      const sample = sql.prepare("SELECT * FROM samples WHERE id=?").get(String(b.id || ""));
      if (!sample) throw problem("\u672A\u627E\u5230\u9001\u6837\u8BB0\u5F55", 404);
      const row = JSON.parse(sample.data), q = Number(b.quantity), d = b.returned_on;
      const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
      if (!row.sent) throw problem("\u5C1A\u672A\u9001\u51FA\uFF0C\u4E0D\u80FD\u767B\u8BB0\u5F52\u8FD8");
      if (!Number.isInteger(q) || q < 1 || q > 1e6 || typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d || d < row.sent.slice(0, 10) || d > today) throw problem("\u8BF7\u586B\u5199\u6709\u6548\u7684\u5F52\u8FD8\u6570\u91CF\u548C\u65E5\u671F\uFF0C\u65E5\u671F\u987B\u5728\u9001\u51FA\u65E5\u81F3\u4ECA\u5929\u4E4B\u95F4");
      if (!/^[a-f0-9-]{36}$/i.test(b.requestId || "")) throw problem("\u8BF7\u6C42\u6807\u8BC6\u65E0\u6548\uFF0C\u8BF7\u91CD\u8BD5");
      const returned = sql.prepare("SELECT COALESCE(SUM(quantity),0) n FROM returns WHERE sample_id=?").get(sample.id).n;
      if (q > sample.quantity - returned) throw problem("\u5F52\u8FD8\u6570\u91CF\u8D85\u8FC7\u5269\u4F59\u6570\u91CF\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5", 409);
      sql.prepare("INSERT INTO returns(id,sample_id,quantity,returned_on,note,report_provided,report_name) VALUES(?,?,?,?,?,?,?)").run(b.requestId, sample.id, q, d, String(b.note || "").trim().slice(0, 2e3), provided, file2?.name || null);
    }
    if (file2) sql.prepare("INSERT INTO report_files(return_id,name,mime,inline,data) VALUES(?,?,?,?,?)").run(b.requestId, file2.name, file2.mime, file2.inline ? 1 : 0, file2.data);
    if (file2) {
      try {
        attachment = saveAttachment(b.requestId, file2);
      } catch {
        throw problem("Attachment \u6587\u4EF6\u5939\u4FDD\u5B58\u5931\u8D25\uFF0C\u5F52\u8FD8\u548C\u62A5\u544A\u5747\u672A\u4FDD\u5B58\u3002\u8BF7\u68C0\u67E5\u6587\u4EF6\u5939\u6743\u9650\u6216\u78C1\u76D8\u7A7A\u95F4\u540E\u91CD\u8BD5\u3002", 500);
      }
    }
    sql.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    sql.exec("ROLLBACK");
    discardAttachment(attachment);
    throw e;
  }
}
function readReport(id) {
  return sql.prepare("SELECT * FROM report_files WHERE return_id=?").get(id);
}
for (const row of sql.prepare("SELECT return_id FROM report_files").all()) {
  try {
    saveAttachment(row.return_id, readReport(row.return_id));
  } catch (e) {
    console.error("Attachment \u5386\u53F2\u62A5\u544A\u526F\u672C\u4FDD\u5B58\u5931\u8D25\uFF0C\u4E0B\u6B21\u542F\u52A8\u5C06\u91CD\u8BD5\uFF1A", row.return_id, e.message);
  }
}

// rdimm-app/app/api/samples/route.ts
var day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
function validDate(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
}
function str(x, max2 = 200) {
  return typeof x === "string" ? x.trim().slice(0, max2) : "";
}
var fail = (error, status = 400) => Response.json({ error }, { status });
async function GET() {
  try {
    await ensureSeed();
    const db = database();
    const result = await db.prepare("SELECT s.*,COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.sample_id=s.id),0) returned FROM samples s ORDER BY s.id").all();
    const returns = await db.prepare("SELECT * FROM returns ORDER BY returned_on DESC,id").all();
    return Response.json({ rows: result.results.map((r) => ({ ...JSON.parse(r.data), id: r.id, quantity: r.quantity, returned: r.returned })), returns: returns.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return fail("\u53F0\u8D26\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u8BD5", 503);
  }
}
async function POST(req) {
  if (req.headers.get("origin") && new URL(req.headers.get("origin")).host !== new URL(req.url).host) return fail("\u8BF7\u6C42\u6765\u6E90\u65E0\u6548", 403);
  try {
    const payload = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("\u8BF7\u6C42\u5185\u5BB9\u65E0\u6548");
    const b = payload;
    const db = database();
    const note = str(b.note, 2e3);
    let out;
    if (b.action === "create") {
      const q = Number(b.quantity);
      if (!str(b.customer) || !str(b.owner) || !str(b.spec) || !Number.isInteger(q) || q < 1 || q > 1e6) return fail("\u8BF7\u586B\u5199\u5BA2\u6237\u3001\u7533\u8BF7\u4EBA\u3001\u89C4\u683C\u548C\u6709\u6548\u7684\u6574\u6570\u6570\u91CF");
      if (b.due && !validDate(b.due)) return fail("\u5F52\u8FD8\u65E5\u671F\u65E0\u6548");
      const id = "RD-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      const row = { id, customer: str(b.customer), owner: str(b.owner), spec: str(b.spec), quantity: q, platform: str(b.platform), part: str(b.part), batch: str(b.batch), due: b.due || null, applied: day(), sent: null, note, returned: 0 };
      await db.prepare("INSERT INTO samples(id,data,quantity) VALUES(?,?,?)").bind(id, JSON.stringify(row), q).run();
      return Response.json({ id });
    }
    const record = await db.prepare("SELECT * FROM samples WHERE id=?").bind(str(b.id)).first();
    if (!record) return fail("\u672A\u627E\u5230\u9001\u6837\u8BB0\u5F55", 404);
    const r = JSON.parse(record.data);
    if (b.action === "send") {
      if (r.sent) return fail("\u8FD9\u7B14\u6837\u54C1\u5DF2\u7ECF\u9001\u51FA\uFF0C\u8BF7\u5237\u65B0\u9875\u9762", 409);
      if (!str(b.batch) || !validDate(b.sent) || !validDate(b.due) || b.sent > day() || b.due < b.sent) return fail("\u8BF7\u8865\u5145\u6279\u6B21\uFF1B\u9001\u51FA\u65E5\u671F\u4E0D\u80FD\u665A\u4E8E\u4ECA\u5929\uFF0C\u5F52\u8FD8\u65E5\u671F\u4E0D\u80FD\u65E9\u4E8E\u9001\u51FA\u65E5\u671F");
      out = await db.prepare("UPDATE samples SET data=json_set(data,'$.sent',?,'$.due',?,'$.batch',?,'$.note',?) WHERE id=? AND json_extract(data,'$.sent') IS NULL").bind(b.sent, b.due, str(b.batch), note || r.note || "", record.id).run();
    } else if (b.action === "return") {
      const q = Number(b.quantity);
      if (!r.sent) return fail("\u5C1A\u672A\u9001\u51FA\uFF0C\u4E0D\u80FD\u767B\u8BB0\u5F52\u8FD8");
      if (!Number.isInteger(q) || q < 1 || q > 1e6 || !validDate(b.returned_on) || b.returned_on < r.sent.slice(0, 10) || b.returned_on > day()) return fail("\u8BF7\u586B\u5199\u6709\u6548\u7684\u5F52\u8FD8\u6570\u91CF\u548C\u65E5\u671F\uFF0C\u65E5\u671F\u987B\u5728\u9001\u51FA\u65E5\u81F3\u4ECA\u5929\u4E4B\u95F4");
      if (!/^[a-f0-9-]{36}$/i.test(b.requestId || "")) return fail("\u8BF7\u6C42\u6807\u8BC6\u65E0\u6548\uFF0C\u8BF7\u91CD\u8BD5");
      out = await db.prepare("INSERT OR IGNORE INTO returns(id,sample_id,quantity,returned_on,note) SELECT ?,id,?,?,? FROM samples WHERE id=? AND quantity-COALESCE((SELECT SUM(quantity) FROM returns WHERE sample_id=?),0)>=?").bind(b.requestId, q, b.returned_on, note, record.id, record.id, q).run();
    } else if (b.action === "due") {
      if (!r.sent || !validDate(b.due) || b.due < r.sent.slice(0, 10)) return fail("\u7EA6\u5B9A\u65E5\u671F\u4E0D\u80FD\u65E9\u4E8E\u9001\u51FA\u65E5\u671F");
      out = await db.prepare("UPDATE samples SET data=json_set(data,'$.due',?,'$.note',?) WHERE id=?").bind(b.due, note || r.note || "", record.id).run();
    } else return fail("\u4E0D\u652F\u6301\u7684\u64CD\u4F5C");
    if (!out.meta.changes) return fail("\u8BB0\u5F55\u5DF2\u53D8\u5316\uFF0C\u6216\u5F52\u8FD8\u6570\u91CF\u8D85\u8FC7\u5269\u4F59\u6570\u91CF\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5", 409);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return fail("\u4FDD\u5B58\u672A\u5B8C\u6210\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u5E76\u91CD\u8BD5", 503);
  }
}

// windows-package/source/server.mjs
var import_node_readline = require("node:readline");
var identity = (0, import_node_crypto4.createHash)("sha256").update(import_node_path6.default.resolve(root)).digest("hex").slice(0, 16);
var publicDir = import_node_path6.default.resolve("public");
var mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
var stopping = false;
var server = import_node_http.default.createServer(async (req, res) => {
  try {
    const port = server.address().port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ app: "rdimm-windows", identity }));
      return;
    }
    if (stopping) {
      res.writeHead(503).end(JSON.stringify({ error: "\u7A0B\u5E8F\u6B63\u5728\u9000\u51FA" }));
      return;
    }
    if (url.pathname === "/api/archives" || url.pathname === "/api/archive") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        let result;
        if (req.method === "GET") result = url.pathname === "/api/archives" ? { archives: listArchives() } : viewArchive(url.searchParams.get("name"));
        else if (req.method === "POST" && url.pathname === "/api/archives") {
          if (req.headers.origin !== url.origin) throw problem("\u8BF7\u6C42\u6765\u6E90\u65E0\u6548", 403);
          result = await uploadArchive(req, url.searchParams.get("name"));
        } else throw problem("\u4E0D\u652F\u6301\u7684\u8BF7\u6C42\u65B9\u5F0F", 405);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(e.status || 400).end(JSON.stringify({ error: e.status ? e.message : "\u5F52\u6863\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6570\u636E\u5E93\u6587\u4EF6" }));
      }
      return;
    }
    if (url.pathname.startsWith("/api/reports/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const report = url.searchParams.has("archive") ? archiveReport(url.searchParams.get("archive"), decodeURIComponent(url.pathname.slice("/api/reports/".length))) : readReport(decodeURIComponent(url.pathname.slice("/api/reports/".length)));
      if (report && url.searchParams.has("archive")) {
        report.mime = "application/octet-stream";
        report.inline = 0;
      }
      if (!report) {
        res.writeHead(404).end("\u62A5\u544A\u4E0D\u5B58\u5728\u6216\u5DF2\u5220\u9664");
        return;
      }
      res.setHeader("Content-Type", report.mime);
      res.setHeader("Content-Disposition", `${report.inline ? "inline" : "attachment"}; filename="report"; filename*=UTF-8''${encodeURIComponent(report.name).replace(/'/g, "%27")}`);
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.setHeader("Content-Length", report.data.length);
      res.end(req.method === "HEAD" ? void 0 : Buffer.from(report.data));
      return;
    }
    if (url.pathname === "/api/returns") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        if (req.method !== "POST") throw problem("\u4E0D\u652F\u6301\u7684\u8BF7\u6C42\u65B9\u5F0F", 405);
        if (req.headers.origin !== url.origin) throw problem("\u8BF7\u6C42\u6765\u6E90\u65E0\u6548", 403);
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxReportSize + 65536) throw problem("\u6D4B\u8BD5\u62A5\u544A\u4E0D\u80FD\u8D85\u8FC7 20 MB", 413);
          chunks.push(chunk);
        }
        const form = await new Request(url, { method: "POST", headers: { "Content-Type": req.headers["content-type"] || "" }, body: Buffer.concat(chunks) }).formData();
        const file3 = await parseReport(form.get("report_file"));
        const values = Object.fromEntries(form);
        delete values.report_file;
        if (!["return", "report"].includes(values.action)) throw problem("\u4E0D\u652F\u6301\u7684\u64CD\u4F5C");
        res.end(JSON.stringify(saveReturn(values, file3, values.action === "report")));
      } catch (e) {
        console.error(e);
        res.writeHead(e.status || 500).end(JSON.stringify({ error: e.status ? e.message : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5F52\u8FD8\u548C\u62A5\u544A\u5747\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5" }));
      }
      return;
    }
    if (url.pathname === "/api/export" || url.pathname === "/api/shutdown") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      if (req.headers.origin !== url.origin) {
        res.writeHead(403).end(JSON.stringify({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }));
        return;
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "\u8BF7\u6C42\u5185\u5BB9\u65E0\u6548" }));
        return;
      }
      const quitting = url.pathname === "/api/shutdown";
      if (quitting && (payload.confirm !== true || typeof payload.export !== "boolean")) {
        res.writeHead(400).end(JSON.stringify({ error: "\u8BF7\u5148\u786E\u8BA4\u9000\u51FA\u65B9\u5F0F" }));
        return;
      }
      try {
        const result = !quitting || payload.export ? exportWorkbook(snapshot()) : { ok: true };
        if (quitting) {
          stopping = true;
          res.once("finish", stop);
        }
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error(e);
        res.writeHead(500).end(JSON.stringify({ error: "Excel \u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 back_up \u6587\u4EF6\u5939\u662F\u5426\u53EF\u5199\u53CA\u78C1\u76D8\u7A7A\u95F4\u3002\u7A0B\u5E8F\u4ECD\u5728\u8FD0\u884C\uFF0C\u8BF7\u91CD\u8BD5\u3002" }));
      }
      return;
    }
    if (url.pathname === "/api/samples") {
      let response;
      if (req.method === "GET") response = await GET();
      else if (req.method === "POST") {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) {
            res.writeHead(413).end("Request too large");
            return;
          }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        let payload;
        try {
          payload = JSON.parse(body.toString("utf8"));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "\u8BF7\u6C42\u5185\u5BB9\u65E0\u6548" }));
          return;
        }
        if (payload?.action === "reset") {
          if (req.headers.origin && new URL(req.headers.origin).host !== url.host) {
            response = Response.json({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }, { status: 403 });
          } else if (payload.confirm !== true || typeof payload.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.requestId)) {
            response = Response.json({ error: "\u8BF7\u5148\u786E\u8BA4\u5220\u9664\u5168\u90E8\u6570\u636E" }, { status: 400 });
          } else {
            try {
              response = Response.json(resetSamples(payload.requestId, payload.archiveName));
            } catch (e) {
              console.error(e);
              response = Response.json({ error: e.status ? e.message : "\u5907\u4EFD\u3001\u5F52\u6863\u6216\u5220\u9664\u5931\u8D25\uFF0C\u53F0\u8D26\u672A\u88AB\u5220\u9664\u3002\u8BF7\u68C0\u67E5 back_up \u548C data \u6587\u4EF6\u5939\u662F\u5426\u53EF\u5199\u3001\u78C1\u76D8\u7A7A\u95F4\u662F\u5426\u5145\u8DB3\u540E\u91CD\u8BD5\u3002" }, { status: e.status || 500 });
            }
          }
        } else if (payload?.action === "delete") {
          if (req.headers.origin && new URL(req.headers.origin).host !== url.host) {
            response = Response.json({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }, { status: 403 });
          } else if (typeof payload.id !== "string" || !payload.id.trim() || payload.id.length > 200 || payload.confirm !== true) {
            response = Response.json({ error: "\u8BF7\u5148\u9009\u62E9\u5E76\u786E\u8BA4\u8981\u5220\u9664\u7684\u8BB0\u5F55" }, { status: 400 });
          } else response = Response.json(deleteSample(payload.id));
        } else if (payload?.action === "return") {
          if (req.headers.origin && new URL(req.headers.origin).host !== url.host) response = Response.json({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }, { status: 403 });
          else try {
            response = Response.json(saveReturn(payload));
          } catch (e) {
            response = Response.json({ error: e.message }, { status: e.status || 500 });
          }
        } else response = await POST(new Request(url, { method: "POST", headers: req.headers, body }));
      } else {
        res.writeHead(405).end();
        return;
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file2 = import_node_path6.default.resolve(publicDir, name);
    if (!file2.startsWith(publicDir + import_node_path6.default.sep) || !import_node_fs5.default.existsSync(file2) || !import_node_fs5.default.statSync(file2).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.setHeader("Content-Type", mime[import_node_path6.default.extname(file2)] || "application/octet-stream");
    if (req.method === "HEAD") res.end();
    else import_node_fs5.default.createReadStream(file2).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "\u672C\u5730\u670D\u52A1\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" }));
  }
});
function open(url) {
  if (process.argv.includes("--open") && process.platform === "win32") {
    const p = (0, import_node_child_process.spawn)("cmd.exe", ["/d", "/c", "start", "", url], { stdio: "ignore", windowsHide: true });
    p.on("error", () => console.log("Please open the URL above in your browser."));
  }
}
var preferred = Number(process.env.RDIMM_PORT || 18736);
server.on("error", async (e) => {
  if (e.code === "EADDRINUSE") {
    try {
      const r = await fetch(`http://127.0.0.1:${preferred}/health`, { signal: AbortSignal.timeout(1500) });
      const data = await r.json();
      if (data.app === "rdimm-windows" && data.identity === identity) {
        open(`http://127.0.0.1:${preferred}/`);
        close();
        process.exit(0);
      }
    } catch {
    }
    server.listen(0, "127.0.0.1");
  } else {
    console.error(e);
    close();
    process.exit(1);
  }
});
server.listen(preferred, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log("\nRDIMM Sample Manager\n\n" + url + "\n\nKeep this window open while using the app.\nUse the Exit button in the webpage to back up and exit. Ctrl+C also prompts for backup.\n\nData: " + root + "\n");
  open(url);
});
function stop() {
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2e3).unref();
}
var prompting = false;
process.on("SIGINT", () => {
  if (prompting || stopping) return;
  if (!process.stdin.isTTY) {
    console.log("Backup before exit...");
    try {
      exportWorkbook(snapshot());
      stop();
    } catch (e) {
      console.error(e);
    }
    return;
  }
  prompting = true;
  const prompt = (0, import_node_readline.createInterface)({ input: process.stdin, output: process.stdout });
  prompt.question("Export ALL records to back_up before exit? [Y] export and exit / [N] exit / [C] cancel: ", (answer) => {
    prompt.close();
    prompting = false;
    if (answer.trim().toLowerCase() === "n") stop();
    else if (answer.trim().toLowerCase() === "y") {
      try {
        console.log(exportWorkbook(snapshot()).path);
        stop();
      } catch (e) {
        console.error("Export failed. App remains running.", e);
      }
    }
  });
});
process.on("SIGHUP", () => {
  try {
    exportWorkbook(snapshot());
  } catch (e) {
    console.error(e);
  }
  stop();
});
process.on("SIGTERM", stop);
