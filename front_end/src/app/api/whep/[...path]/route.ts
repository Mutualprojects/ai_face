import { NextRequest, NextResponse } from "next/server";
import http from "http";

const MEDIAMTX_HOST = "127.0.0.1";
const MEDIAMTX_PORT = 8889;

/** Headers that are hop-by-hop and must NOT be forwarded. */
const DROP_REQ = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

const DROP_RES = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
]);

/**
 * Proxy a request to MediaMTX using Node's http module.
 * Using http.request() instead of fetch() because Next.js fetch in
 * Route Handlers can mangle chunked bodies, causing MediaMTX to get EOF.
 */
function proxyToMediaMTX(
  req: NextRequest,
  method: string,
  path: string,
  body?: Buffer
): Promise<NextResponse> {
  return new Promise((resolve) => {
    const bodyLength = body ? body.byteLength : 0;

    // Build forwarded headers
    const headers: Record<string, string> = {
      "Content-Length": String(bodyLength),
    };
    req.headers.forEach((val, key) => {
      const k = key.toLowerCase();
      if (!DROP_REQ.has(k)) {
        headers[key] = val;
      }
    });
    // Always override host with MediaMTX host
    headers["Host"] = `${MEDIAMTX_HOST}:${MEDIAMTX_PORT}`;

    const options: http.RequestOptions = {
      hostname: MEDIAMTX_HOST,
      port: MEDIAMTX_PORT,
      path: `/${path}`,
      method,
      headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const status = proxyRes.statusCode ?? 502;
        const resHeaders = new Headers();

        Object.entries(proxyRes.headers).forEach(([key, val]) => {
          if (!DROP_RES.has(key.toLowerCase()) && val !== undefined) {
            let headerValue = Array.isArray(val) ? val.join(", ") : val;
            if (key.toLowerCase() === "location") {
              if (headerValue.startsWith("/") && !headerValue.startsWith("/api/whep")) {
                headerValue = `/api/whep${headerValue}`;
              }
            }
            resHeaders.set(key, headerValue);
          }
        });

        const noBody = [204, 205, 304].includes(status);
        if (noBody || chunks.length === 0) {
          resolve(new NextResponse(null, { status, headers: resHeaders }));
        } else {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          resolve(new NextResponse(responseBody, { status, headers: resHeaders }));
        }
      });
    });

    proxyReq.on("error", (err) => {
      console.error("[WHEP proxy] http.request error:", err.message);
      resolve(
        NextResponse.json(
          { error: `Cannot reach MediaMTX: ${err.message}` },
          { status: 502 }
        )
      );
    });

    // Write the buffered body and close the request
    if (body && bodyLength > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  const body = Buffer.from(await req.arrayBuffer());
  return proxyToMediaMTX(req, "POST", path, body);
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  return proxyToMediaMTX(req, "OPTIONS", segments.join("/"));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  return proxyToMediaMTX(req, "GET", segments.join("/"));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  const body = Buffer.from(await req.arrayBuffer());
  return proxyToMediaMTX(req, "PATCH", path, body);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  return proxyToMediaMTX(req, "DELETE", segments.join("/"));
}
