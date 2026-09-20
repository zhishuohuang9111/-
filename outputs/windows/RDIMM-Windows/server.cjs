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
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");

// windows-package/source/storage.mjs
var import_node_sqlite = require("node:sqlite");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
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
  const snapshot = JSON.parse(import_node_fs.default.readFileSync(import_node_path.default.join(process.cwd(), "initial-data.json"), "utf8"));
  sql.exec("BEGIN IMMEDIATE");
  try {
    for (const r of snapshot.rows) sql.prepare("INSERT INTO samples(id,data,quantity) VALUES(?,?,?)").run(r.id, JSON.stringify(r), r.quantity);
    for (const r of snapshot.returns) sql.prepare("INSERT INTO returns(id,sample_id,quantity,returned_on,note) VALUES(?,?,?,?,?)").run(r.id, r.sample_id, r.quantity, r.returned_on, r.note || "");
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
function close() {
  sql.close();
}

// rdimm-app/app/api/samples/route.ts
var day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
function validDate(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
}
function str(x, max = 200) {
  return typeof x === "string" ? x.trim().slice(0, max) : "";
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
var identity = (0, import_node_crypto.createHash)("sha256").update(import_node_path2.default.resolve(root)).digest("hex").slice(0, 16);
var publicDir = import_node_path2.default.resolve("public");
var mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
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
        response = await POST(new Request(url, { method: "POST", headers: req.headers, body: Buffer.concat(chunks) }));
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
    const file2 = import_node_path2.default.resolve(publicDir, name);
    if (!file2.startsWith(publicDir + import_node_path2.default.sep) || !import_node_fs2.default.existsSync(file2) || !import_node_fs2.default.statSync(file2).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.setHeader("Content-Type", mime[import_node_path2.default.extname(file2)] || "application/octet-stream");
    if (req.method === "HEAD") res.end();
    else import_node_fs2.default.createReadStream(file2).pipe(res);
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
  console.log("\nRDIMM Sample Manager\n\n" + url + "\n\nKeep this window open while using the app.\nPress Ctrl+C to stop.\n\nData: " + root + "\n");
  open(url);
});
function stop() {
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2e3).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
