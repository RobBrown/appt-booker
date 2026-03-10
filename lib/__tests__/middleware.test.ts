import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Minimal NextRequest/NextResponse stubs so middleware can run without
// the full Next.js runtime.
class MockNextResponse {
  status: number;
  statusText: string;
  static nextCalled = false;

  constructor(_body: null, init: { status: number; statusText: string }) {
    this.status = init.status;
    this.statusText = init.statusText;
  }

  static next() {
    MockNextResponse.nextCalled = true;
    return new MockNextResponse(null, { status: 200, statusText: "OK" });
  }
}

class MockNextRequest {
  method: string;
  headers: Map<string, string>;

  constructor(method: string, origin?: string) {
    this.method = method;
    this.headers = new Map();
    if (origin) this.headers.set("origin", origin);
    // Map.get is used as headers.get() in the middleware
  }
}

vi.mock("next/server", () => ({
  NextRequest: MockNextRequest,
  NextResponse: MockNextResponse,
}));

// Import after mock is set up
const { middleware } = await import("../../middleware");

describe("CORS middleware", () => {
  beforeEach(() => {
    MockNextResponse.nextCalled = false;
    process.env.HOST_DOMAIN = "example.com";
  });

  afterEach(() => {
    delete process.env.HOST_DOMAIN;
  });

  // --- GET requests are always allowed ---

  it("allows GET requests from any origin", () => {
    const req = new MockNextRequest("GET", "https://evil.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  // --- No Origin header (same-origin or server-to-server) ---

  it("allows POST with no Origin header", () => {
    const req = new MockNextRequest("POST") as any;
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  // --- Allowed origins ---

  it("allows POST from https://HOST_DOMAIN", () => {
    const req = new MockNextRequest("POST", "https://example.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("allows POST from http://HOST_DOMAIN (http variant)", () => {
    const req = new MockNextRequest("POST", "http://example.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("allows POST from localhost in development", () => {
    const req = new MockNextRequest("POST", "http://localhost:3000") as any;
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  // --- Blocked origins ---

  it("blocks POST from a foreign origin", () => {
    const req = new MockNextRequest("POST", "https://evil.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks PATCH from a foreign origin", () => {
    const req = new MockNextRequest("PATCH", "https://evil.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks DELETE from a foreign origin", () => {
    const req = new MockNextRequest("DELETE", "https://evil.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  // --- Subdomain should not be treated as matching ---

  it("blocks POST from a subdomain of HOST_DOMAIN", () => {
    const req = new MockNextRequest("POST", "https://sub.example.com") as any;
    const res = middleware(req);
    expect(res.status).toBe(403);
  });
});
