import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
	const password = process.env.ACCESS_PASSWORD;

	// Allow the login page and login API
	if (
		request.nextUrl.pathname === "/login" ||
		request.nextUrl.pathname === "/api/auth"
	) {
		return NextResponse.next();
	}

	// Check auth cookie (if password protection is enabled)
	if (password) {
		const authed = request.cookies.get("authed")?.value;
		if (authed !== password) {
			const loginUrl = new URL("/login", request.url);
			return NextResponse.redirect(loginUrl);
		}
	}

	// Ensure session ID cookie exists
	const sessionId = request.cookies.get("sid")?.value;
	if (!sessionId) {
		const response = NextResponse.next();
		response.cookies.set("sid", crypto.randomUUID(), {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 60 * 24, // 24h
		});
		return response;
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
