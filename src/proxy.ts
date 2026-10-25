import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

// First gate only. Every component that loads admin data, every Server Action and every admin
// route handler checks the session again itself (requireAdmin / getSession), so a gap here leaks nothing.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET,
    process.env.ADMIN_PASSWORD_HASH,
  );
  // Same rule as getSession(), otherwise /login and /admin could redirect to each other forever
  const session =
    token !== null && token.email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login"],
};
