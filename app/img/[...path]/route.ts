import { getSessionId, getOrCreateSingleton } from "../../api/agent/singleton";

const MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
};

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
	const { path } = await params;
	const sessionId = getSessionId(req);
	const { overlayFs } = getOrCreateSingleton(sessionId);
	const mountPoint = overlayFs.getMountPoint();
	const filePath = `${mountPoint}/img/${path.join("/")}`;

	try {
		const data = await overlayFs.readFileBuffer(filePath);
		const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
		const mime = MIME_TYPES[ext] || "application/octet-stream";
		return new Response(Buffer.from(data), {
			headers: {
				"Content-Type": mime,
				"Cache-Control": "public, max-age=86400",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
