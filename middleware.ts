import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
	const password = process.env.ACCESS_PASSWORD;
	if (!password) return NextResponse.next();

	// Allow the login page and login API
	if (
		request.nextUrl.pathname === "/login" ||
		request.nextUrl.pathname === "/api/auth"
	) {
		return NextResponse.next();
	}

	// Check auth cookie
	const authed = request.cookies.get("authed")?.value;
	if (authed === password) {
		return NextResponse.next();
	}

	// Redirect to login
	const loginUrl = new URL("/login", request.url);
	return NextResponse.redirect(loginUrl);
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
