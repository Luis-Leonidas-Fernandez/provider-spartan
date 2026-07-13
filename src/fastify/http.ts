import type { FastifyReply } from "fastify";
export { parseOrThrow } from "../core/http.js";

export function sendCreated<T>(reply: FastifyReply, payload: T) {
  return reply.code(201).send(payload);
}

export function createRequestAbortSignal(request: { raw: NodeJS.ReadableStream & { aborted?: boolean } }) {
  const controller = new AbortController();
  const raw = request.raw;

  const abort = () => {
    if (controller.signal.aborted) return;
    controller.abort(new Error("Client disconnected"));
  };

  raw.on("aborted", abort);
  raw.on("close", () => {
    if (raw.aborted) abort();
  });

  return controller.signal;
}
