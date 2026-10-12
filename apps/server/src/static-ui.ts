import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { ApiError, formatError } from "./errors.js";
import { resolveWithinRoot } from "./paths.js";
import type { ServerConfig } from "./types.js";

const WEB_ROOT_ENV = "OPENWORK_WEB_ROOT";
const WEB_BOOTSTRAP_TOKEN_ENV = "OPENWORK_WEB_BOOTSTRAP_TOKEN";
const ASSET_CACHE = "public, max-age=31536000, immutable";
// index.html carries the injected bootstrap token — never let it be cached.
const INDEX_CACHE = "no-store";
// Minimal, non-breaking CSP: blocks plugin content and framing without
// restricting the SPA's own scripts, styles, or connections.
const HTML_CSP = "object-src 'none'; frame-ancestors 'none'; base-uri 'self'";

type StaticUiConfig = Pick<ServerConfig, "token">;

export async function serveStaticUi(request: Request, config: StaticUiConfig): Promise<Response | null> {
  const root = process.env[WEB_ROOT_ENV]?.trim();
  if (!root) return null;

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/w/")) return null;

  const relativePath = requestPathToRelativePath(url.pathname);
  if (!relativePath) {
    return jsonError(new ApiError(400, "invalid_path", "Invalid URL path"));
  }

  try {
    const fileResponse = await serveFile(root, relativePath, url.pathname, method, config.token, request);
    if (fileResponse) return fileResponse;
    if (url.pathname.startsWith("/assets/")) return null;
    return serveFile(root, "index.html", "/index.html", method, config.token, request);
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error);
    throw error;
  }
}

function requestPathToRelativePath(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.replace(/^\/+/, "") || "index.html";
  } catch {
    return null;
  }
}

async function serveFile(
  root: string,
  relativePath: string,
  requestPathname: string,
  method: string,
  token: string,
  request: Request,
): Promise<Response | null> {
  const filePath = await resolveWithinRoot(root, relativePath);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) return null;

  const extension = extname(relativePath).toLowerCase();
  const cacheControl = requestPathname.startsWith("/assets/") ? ASSET_CACHE : INDEX_CACHE;
  const etag = `"${fileStat.mtimeMs.toString(16)}-${fileStat.size.toString(16)}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: responseHeaders(extension, cacheControl, etag) });
  }

  if (method === "HEAD") {
    return new Response(null, { status: 200, headers: responseHeaders(extension, cacheControl, etag) });
  }

  if (isTextExtension(extension)) {
    const body = await readFile(filePath, "utf8");
    const text = relativePath === "index.html" ? injectBootstrap(body, token) : body;
    return new Response(text, { status: 200, headers: responseHeaders(extension, cacheControl, etag) });
  }

  return new Response(await readFile(filePath), {
    status: 200,
    headers: responseHeaders(extension, cacheControl, etag),
  });
}

function isTextExtension(extension: string): boolean {
  return extension === ".html" || extension === ".js" || extension === ".mjs" || extension === ".css" ||
    extension === ".json" || extension === ".svg" || extension === ".map";
}

function responseHeaders(extension: string, cacheControl: string, etag?: string): Headers {
  const headers = new Headers({
    "Cache-Control": cacheControl,
    "Content-Type": contentType(extension),
    "X-Content-Type-Options": "nosniff",
  });
  if (extension === ".html") {
    headers.set("Content-Security-Policy", HTML_CSP);
  }
  if (etag) {
    headers.set("ETag", etag);
  }
  return headers;
}

function contentType(extension: string): string {
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json" || extension === ".map") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".ttf") return "font/ttf";
  return "application/octet-stream";
}

function injectBootstrap(html: string, token: string): string {
  if (!shouldInjectBootstrapToken()) return html;

  const clientToken = token.trim();
  if (!clientToken) return html;

  const bootstrap = escapeScriptJson(JSON.stringify({ token: clientToken }));
  const script = `<script>window.__OPENWORK_BOOTSTRAP__ = ${bootstrap}</script>`;
  const headCloseIndex = html.toLowerCase().indexOf("</head>");
  if (headCloseIndex < 0) return `${script}${html}`;
  return `${html.slice(0, headCloseIndex)}${script}${html.slice(headCloseIndex)}`;
}

function shouldInjectBootstrapToken(): boolean {
  const configured = process.env[WEB_BOOTSTRAP_TOKEN_ENV]?.trim().toLowerCase();
  return configured !== "0" && configured !== "false";
}

function escapeScriptJson(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function jsonError(error: ApiError): Response {
  return new Response(JSON.stringify(formatError(error)), {
    status: error.status,
    headers: { "Content-Type": "application/json" },
  });
}
