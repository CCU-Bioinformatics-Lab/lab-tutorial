import { SITE_PAGES } from '../site-pages.data.mjs';

export const dynamic = 'force-static';

export async function GET(_request, { params }) {
  const resolved = await params;
  const segments = resolved?.path ?? [];
  const page = segments.length ? segments.join('/') : 'index.html';

  if (page.includes('..') || !page.endsWith('.html')) {
    return new Response('Not found', { status: 404 });
  }

  const html = SITE_PAGES[page];
  if (!html) return new Response('Not found', { status: 404 });

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
