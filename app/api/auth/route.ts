import { NextResponse } from "next/server";

export async function POST(req: Request) {
	const { password } = await req.json();
	const expected = process.env.ACCESS_PASSWORD;

	if (!expected || password !== expected) {
		return NextResponse.json({ ok: false }, { status: 401 });
	}

	const res = NextResponse.json({ ok: true });
	res.cookies.set("authed", password, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 30, // 30 days
		path: "/",
	});
	return res;
}
