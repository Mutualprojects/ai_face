/**
 * Backend Client SDK for Next.js Server Side / API Routes.
 * Communicates with the Python Flask Matrix backend securely passing x-api-key header.
 */

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
const API_KEY = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "";

export async function fetchBackendApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${BACKEND_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown backend response error");
    throw new Error(`Backend API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}
