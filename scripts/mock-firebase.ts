import { createServer } from "node:http";

// A tiny in-memory stand-in for the Firebase Realtime Database REST API, for local testing without
// credentials:  npm run db:mock   then run the app with
//   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 SESSION_SECRET=<32+ chars> ADMIN_USERNAME=admin ADMIN_PASSWORD=...
// Supports GET / PUT / PATCH / DELETE on /<path>.json, like the real thing. Data is lost on exit.
const port = Number(process.env.MOCK_FIREBASE_PORT ?? 9000);
let root: Record<string, unknown> = {};

const segments = (path: string) => decodeURIComponent(path).replace(/^\/+|\.json$/g, "").split("/").filter(Boolean);

function read(path: string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) node = (node as Record<string, unknown>)[key];
    else return null;
  }
  return node ?? null;
}

function write(path: string[], value: unknown, merge: boolean) {
  if (path.length === 0) { root = (merge ? { ...root, ...(value as object) } : (value as Record<string, unknown>)) ?? {}; return; }
  let node = root;
  for (const key of path.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (value === null) delete node[last];
  else if (merge && typeof node[last] === "object" && node[last] && typeof value === "object") node[last] = { ...(node[last] as object), ...(value as object) };
  else node[last] = value;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/__reset") { root = {}; res.end("ok"); return; }
  const path = segments(url.pathname);
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    if (req.method === "GET") { res.end(JSON.stringify(read(path))); return; }
    if (req.method === "PUT" || req.method === "PATCH") { write(path, body, req.method === "PATCH"); res.end(JSON.stringify(body)); return; }
    if (req.method === "DELETE") { write(path, null, false); res.end("null"); return; }
    res.statusCode = 405; res.end(JSON.stringify({ error: "method not allowed" }));
  });
}).listen(port, "127.0.0.1", () => console.log(`Mock Realtime Database on http://127.0.0.1:${port} (in-memory)`));
