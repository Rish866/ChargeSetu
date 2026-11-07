import type { Instrumentation } from "next";

/**
 * Logs every uncaught server error with its route, so failures show up in the
 * hosting provider's log search (Vercel → Logs). Add Sentry or similar here
 * later; no personal data is logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      message: e.message,
      digest: e.digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
