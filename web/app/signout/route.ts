import { NextResponse } from "next/server";

/** Sign out: clear the DeadEnd session cookie (the server session is a
 * stateless signed cookie; clearing it ends the browser session). */
export function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.set("deadend_session", "", { maxAge: 0, path: "/" });
  return res;
}
