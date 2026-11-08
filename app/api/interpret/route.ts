import { handleInterpret } from '../../../lib/ai/interpret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return handleInterpret(request);
}
