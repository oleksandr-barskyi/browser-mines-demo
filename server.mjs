import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGameAction, handleGamePath, httpError } from "./src/game/session.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 5173);

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await handleStatic(request, response);
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, {
      message: error.statusCode ? error.message : "Internal server error."
    });
  }
});

server.listen(port, () => {
  console.log(`Browser Mines Demo running at http://localhost:${port}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const method = request.method ?? "GET";
  const body = method === "GET" ? {} : await readJson(request);

  if (url.pathname === "/api/game") {
    const action = url.searchParams.get("action") ?? (method === "GET" ? "state" : null);
    const result = await handleGameAction(action, body);
    sendJson(response, result.status, result.payload);
    return;
  }

  const result = await handleGamePath(method, url.pathname, body);
  sendJson(response, result.status, result.payload);
}

async function handleStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, pathname));

  if (!filePath.startsWith(root)) {
    throw httpError(403, "Forbidden.");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw httpError(404, "File not found.");
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw httpError(404, "File not found.");
    }

    throw error;
  }
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };

  return types[extname(filePath)] ?? "application/octet-stream";
}

async function readJson(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
    if (rawBody.length > 64_000) {
      throw httpError(413, "Request body is too large.");
    }
  }

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}
