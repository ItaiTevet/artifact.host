import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

export const config = { matcher: '/a/:path*' };
