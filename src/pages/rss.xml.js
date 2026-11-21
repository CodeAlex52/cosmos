import { getCollection } from "astro:content";

export async function GET(context) {
	const posts = (await getCollection("posts")).sort(
		(a, b) => b.data.published.getTime() - a.data.published.getTime(),
	);

	const items = posts
		.map((p) => {
			const url = new URL(`/posts/${p.id}/`, context.site).href;
			return `		<item>
			<title><![CDATA[${p.data.title}]]></title>
			<link>${url}</link>
			<guid>${url}</guid>
			<pubDate>${p.data.published.toUTCString()}</pubDate>
			${p.data.category ? `<category><![CDATA[${p.data.category}]]></category>` : ""}
			${p.data.description ? `<description><![CDATA[${p.data.description}]]></description>` : ""}
		</item>`;
		})
		.join("\n");

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
	<channel>
		<title>苏哲的小宇宙</title>
		<description>把好奇心写进星光里</description>
		<link>${context.site}</link>
		<atom:link href="${new URL("/rss.xml", context.site).href}" rel="self" type="application/rss+xml" />
		<language>zh-CN</language>
		<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
	</channel>
</rss>`;

	return new Response(xml, {
		headers: { "Content-Type": "application/xml; charset=utf-8" },
	});
}
