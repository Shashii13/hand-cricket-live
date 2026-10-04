import { GameError, GameService } from '@/lib/game.mjs';
const globalStore = globalThis as typeof globalThis & { cricketService?: InstanceType<typeof GameService> };
const service = globalStore.cricketService ??= new GameService();
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Please play from the room page.' }, { status: 403 });
    if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const text = await request.text(); if (text.length > 4096) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const body = JSON.parse(text);
    let result;
    if (body.action === 'create') result = service.create(body.name);
    else if (body.action === 'join') result = service.join(body.code, body.name, body.token);
    else result = service.act(body.code, body.token, body.action, body);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof GameError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    console.error(error); return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
