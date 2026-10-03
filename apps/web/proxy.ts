import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
 const nonce = btoa(crypto.randomUUID());
 const development = process.env.NODE_ENV === 'development';
 const policy = ["default-src 'none'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${development ? "'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'", `connect-src 'self' ${development ? 'ws: wss:' : ''}`, "worker-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"].join('; ');
 const headers = new Headers(request.headers); headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', policy);
 const response = NextResponse.next({request:{headers}});
 response.headers.set('Content-Security-Policy',policy);
 response.headers.set('Cross-Origin-Opener-Policy','same-origin');
 response.headers.set('Cross-Origin-Embedder-Policy','require-corp');
 response.headers.set('Cache-Control','no-store');
 return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|crypto-assets/).*)'] };
