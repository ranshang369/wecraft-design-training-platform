import { handleApi } from "@/server/api";

type Context = { params: Promise<{ path: string[] }> };

async function run(request: Request, context: Context) {
  const { path } = await context.params;
  return handleApi(request, path);
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;

