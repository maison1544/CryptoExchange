import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/admin/login",
  "/partner/login",
  "/",
  "/trade",
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
  response.headers.set("Cache-Control", "no-store");

  if (!user) {
    if (pathname.startsWith("/admin")) {
      const redirect = NextResponse.redirect(new URL("/admin/login", request.url));
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }
    if (pathname.startsWith("/partner")) {
      const redirect = NextResponse.redirect(
        new URL("/partner/login", request.url),
      );
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
