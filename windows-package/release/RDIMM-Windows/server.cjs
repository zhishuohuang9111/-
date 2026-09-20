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

// windows-package/source/server.mjs
var import_node_http = __toESM(require("node:http"), 1);
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_crypto2 = require("node:crypto");
var import_node_child_process = require("node:child_process");

// windows-package/source/storage.mjs
var import_node_sqlite = require("node:sqlite");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
var root = process.env.RDIMM_DATA_DIR || import_node_path.default.join(process.cwd(), "data");
import_node_fs.default.mkdirSync(root, { recursive: true });
var file = import_node_path.default.join(root, "rdimm.sqlite");
var existing = import_node_fs.default.existsSync(file);
var sql = new import_node_sqlite.DatabaseSync(file);
sql.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
if (existing) {
  const backupDir = import_node_path.default.join(root, "backups");
  import_node_fs.default.mkdirSync(backupDir, { recursive: true });
  const target = import_node_path.default.join(backupDir, `rdimm-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`);
  if (!import_node_fs.default.existsSync(target)) sql.prepare("VACUUM INTO ?").run(target);
}
sql.exec(`CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,data TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0));
CREATE TABLE IF NOT EXISTS returns(id TEXT PRIMARY KEY,sample_id TEXT NOT NULL REFERENCES samples(id),quantity INTEGER NOT NULL CHECK(quantity>0),returned_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_returns_sample ON returns(sample_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
if (!sql.prepare("SELECT 1 FROM settings WHERE key='initialized'").get()) {
  const snapshot2 = JSON.parse(import_node_fs.default.readFileSync(import_node_path.default.join(process.cwd(), "initial-data.json"), "utf8"));
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
function resetSamples(requestId) {
  const key = "reset:" + requestId;
  const prior = sql.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (prior) return JSON.parse(prior.value);
  const backupDir = import_node_path.default.join(root, "backups");
  import_node_fs.default.mkdirSync(backupDir, { recursive: true });
  const backupName = "before-reset-" + (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-") + "-" + (0, import_node_crypto.randomUUID)().slice(0, 8) + ".sqlite";
  sql.prepare("VACUUM INTO ?").run(import_node_path.default.join(backupDir, backupName));
  sql.exec("BEGIN IMMEDIATE");
  try {
    const returnsRemoved = Number(sql.prepare("DELETE FROM returns").run().changes);
    const samplesRemoved = Number(sql.prepare("DELETE FROM samples").run().changes);
    const result = { ok: true, backup: "data/backups/" + backupName, samplesRemoved, returnsRemoved };
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

// windows-package/source/export.mjs
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);

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
var export_columns_default = [[["id", "\u8BB0\u5F55\u7F16\u53F7"], ["customer", "\u5BA2\u6237"], ["owner", "\u7533\u8BF7\u4EBA"], ["spec", "\u4EA7\u54C1\u89C4\u683C"], ["batch", "\u6279\u6B21"], ["quantity", "\u7533\u8BF7\u6570\u91CF", "n"], ["sentQuantity", "\u9001\u51FA\u6570\u91CF", "n"], ["returned", "\u5DF2\u5F52\u8FD8\u6570\u91CF", "n"], ["remaining", "\u672A\u5F52\u8FD8\u6570\u91CF", "n"], ["applied", "\u7533\u8BF7\u65E5\u671F", "d"], ["sent", "\u5B9E\u9645\u9001\u6837\u65E5\u671F", "d"], ["due", "\u7EA6\u5B9A\u5F52\u8FD8\u65E5\u671F", "d"], ["status", "\u72B6\u6001"], ["part", "\u6837\u54C1\u6599\u53F7"], ["platform", "\u5BA2\u6237\u5E73\u53F0"], ["note", "\u5907\u6CE8"], ["sourceId", "\u539F\u59CB\u5E8F\u53F7"], ["environment", "\u6D4B\u8BD5\u73AF\u5883"], ["spd", "SPD"], ["printing", "\u4E1D\u5370\u8981\u6C42"], ["label", "\u6807\u7B7E\u8981\u6C42"], ["requested", "\u9700\u6C42\u65E5\u671F", "d"], ["actualReturn", "\u539F\u59CB\u5B9E\u9645\u5F52\u8FD8\u65E5\u671F", "d"], ["urgency", "\u7D27\u6025\u7A0B\u5EA6"], ["category", "\u7C7B\u522B"], ["documents", "\u8D44\u6599"], ["report", "\u62A5\u544A"]], [["id", "\u5F52\u8FD8\u8BB0\u5F55\u7F16\u53F7"], ["sample_id", "\u9001\u6837\u8BB0\u5F55\u7F16\u53F7"], ["customer", "\u5BA2\u6237"], ["owner", "\u7533\u8BF7\u4EBA"], ["spec", "\u4EA7\u54C1\u89C4\u683C"], ["batch", "\u6279\u6B21"], ["returned_on", "\u5B9E\u9645\u5F52\u8FD8\u65E5\u671F", "d"], ["quantity", "\u5F52\u8FD8\u6570\u91CF", "n"], ["note", "\u5F52\u8FD8\u5907\u6CE8"]]];

// windows-package/source/export.mjs
var xml = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var col = (n) => {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
};
function exportWorkbook(snapshot2, now = /* @__PURE__ */ new Date(), directory = import_node_path2.default.join(process.cwd(), "back_up")) {
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
  const data = [snapshot2.rows.map((r) => ({ ...r, sentQuantity: r.sent ? r.quantity : 0, remaining: r.sent ? r.quantity - r.returned : 0, status: state(r) })), snapshot2.returns.map((r) => ({ ...byId.get(r.sample_id), ...r }))];
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
  import_node_fs2.default.mkdirSync(directory, { recursive: true });
  const base = stamp.replace("T", "_").replace(":", "-");
  for (let index = 0; ; index++) {
    const filename = base + (index ? "_" + String(index).padStart(2, "0") : "") + ".xlsx";
    const target = import_node_path2.default.join(directory, filename);
    let fd2;
    try {
      fd2 = import_node_fs2.default.openSync(target, "wx");
    } catch (e) {
      if (e.code === "EEXIST") continue;
      throw e;
    }
    try {
      import_node_fs2.default.writeFileSync(fd2, bytes);
      import_node_fs2.default.fsyncSync(fd2);
      import_node_fs2.default.closeSync(fd2);
    } catch (e) {
      try {
        import_node_fs2.default.closeSync(fd2);
      } catch {
      }
      try {
        import_node_fs2.default.unlinkSync(target);
      } catch {
      }
      throw e;
    }
    return { ok: true, filename, path: "back_up/" + filename, samples: snapshot2.rows.length, returns: snapshot2.returns.length };
  }
}

// windows-package/source/server.mjs
var identity = (0, import_node_crypto2.createHash)("sha256").update(import_node_path3.default.resolve(root)).digest("hex").slice(0, 16);
var publicDir = import_node_path3.default.resolve("public");
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
              response = Response.json(resetSamples(payload.requestId));
            } catch (e) {
              console.error(e);
              response = Response.json({ error: "\u5907\u4EFD\u6216\u5220\u9664\u5931\u8D25\uFF0C\u53F0\u8D26\u672A\u88AB\u5220\u9664\u3002\u8BF7\u68C0\u67E5\u6570\u636E\u6587\u4EF6\u5939\u662F\u5426\u53EF\u5199\u540E\u91CD\u8BD5\u3002" }, { status: 500 });
            }
          }
        } else if (payload?.action === "delete") {
          if (req.headers.origin && new URL(req.headers.origin).host !== url.host) {
            response = Response.json({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }, { status: 403 });
          } else if (typeof payload.id !== "string" || !payload.id.trim() || payload.id.length > 200 || payload.confirm !== true) {
            response = Response.json({ error: "\u8BF7\u5148\u9009\u62E9\u5E76\u786E\u8BA4\u8981\u5220\u9664\u7684\u8BB0\u5F55" }, { status: 400 });
          } else response = Response.json(deleteSample(payload.id));
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
    const file2 = import_node_path3.default.resolve(publicDir, name);
    if (!file2.startsWith(publicDir + import_node_path3.default.sep) || !import_node_fs3.default.existsSync(file2) || !import_node_fs3.default.statSync(file2).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.setHeader("Content-Type", mime[import_node_path3.default.extname(file2)] || "application/octet-stream");
    if (req.method === "HEAD") res.end();
    else import_node_fs3.default.createReadStream(file2).pipe(res);
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
