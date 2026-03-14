import { authRuntime } from "@/lib/auth";
import { toNextJsHandler } from "@ascendkit/nextjs/server";

export const { GET, POST } = toNextJsHandler(authRuntime.handler);
