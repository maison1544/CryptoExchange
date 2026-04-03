import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/admin/login",
  "/partner/login",
  "/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    if (pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    if (pathname.startsWith("/partner")) {
      return NextResponse.redirect(new URL("/partner/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
