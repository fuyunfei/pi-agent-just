import { getStoredImage } from "../../agent/singleton";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const img = getStoredImage(id);
	if (!img) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(new Uint8Array(img.data), {
		headers: {
			"Content-Type": img.mime,
			"Cache-Control": "public, max-age=86400",
		},
	});
}
