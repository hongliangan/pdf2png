// POST /api/export
//
// Browser builds an SVG string from the editor state and sends it here with a
// { format, dpi } body. We rasterize it server-side via sharp (which can't be
// bundled into a client component because it shells out to node:child_process)
// and return the resulting PNG/JPEG bytes.
//
// Why not Server Actions? Server Actions in Next.js with this app-router
// version put the action handler into a client wrapper that still has to
// pull sharp into the same module graph. Route handlers keep the dependency
// tree isolated to the server.

import { NextResponse } from 'next/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export const runtime = 'nodejs';

interface Body {
  svg: string;
  format: 'png' | 'jpeg';
  dpi: number;
}

export async function POST(req: Request) {
  const text = await req.text();
  let body: Body;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json(
      { error: 'body must be JSON' },
      { status: 400 },
    );
  }
  const { svg, format, dpi } = body;
  if (typeof svg !== 'string' || svg.length === 0) {
    return NextResponse.json({ error: 'svg required' }, { status: 400 });
  }
  if (format !== 'png' && format !== 'jpeg') {
    return NextResponse.json({ error: 'format must be png or jpeg' }, { status: 400 });
  }
  if (!Number.isFinite(dpi) || dpi <= 0) {
    return NextResponse.json({ error: 'dpi must be a positive number' }, { status: 400 });
  }

  // We have to write the SVG to a temp file and pass the file path to
  // sharp. Passing the buffer directly fails inside the standalone
  // Electron build: sharp/libvips sees the buffer as backed by a
  // SharedArrayBuffer (Buffer.from(string) under Electron's Node can
  // allocate from the SAB pool) and throws "ArrayBuffer:
  // SharedArrayBuffer is not allowed." A file path goes through the
  // standard fs pread path which sharp can handle cleanly.
  const dir = await mkdtemp(join(tmpdir(), 'pdf2png-'));
  const inPath = join(dir, 'in.svg');
  const cleanup = async (): Promise<void> => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  try {
    await writeFile(inPath, svg, 'utf8');
    const pipeline = sharp(inPath, { density: dpi });
    const raw =
      format === 'png'
        ? await pipeline.png().toBuffer()
        : await pipeline
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 92 })
            .toBuffer();
    // Node 22+ Buffer pool is backed by SharedArrayBuffer. When the pooled
    // Buffer is passed to `new Response(buf)`, undici rejects with
    // "ArrayBuffer: SharedArrayBuffer is not allowed." Allocate a fresh,
    // non-pooled buffer by copying through a Uint8Array with a sliced
    // ArrayBuffer.
    const safe = Buffer.from(
      new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
    );
    return new NextResponse(safe, {
      status: 200,
      headers: {
        'Content-Type': format === 'png' ? 'image/png' : 'image/jpeg',
        'Content-Length': String(safe.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await cleanup();
  }
}
