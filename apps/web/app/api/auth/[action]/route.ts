import { productionChatAuth } from '../../../../../../server/chat-auth.mjs';

export const runtime = 'nodejs';
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, context: Context) {
  return productionChatAuth(request, (await context.params).action);
}
export async function POST(request: Request, context: Context) {
  return productionChatAuth(request, (await context.params).action);
}
