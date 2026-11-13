export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error('too_large');
  try { return JSON.parse(text); } catch { throw new Error('bad_json'); }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const bad = (error: string, status = 400) => json({ error }, status);
