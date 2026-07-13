import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createProviderGatewayNodeHandler,
  type ProviderGatewayNodeAdapterOptions,
  type ProviderGatewayNodeHandler,
} from "../node/provider-gateway.node.js";

export type ExpressNextFunction = (error?: unknown) => void;

export type ExpressRequestLike = IncomingMessage & {
  originalUrl?: string;
  baseUrl?: string;
};

export type ExpressResponseLike = ServerResponse;

export type ExpressMiddleware = (
  request: ExpressRequestLike,
  response: ExpressResponseLike,
  next: ExpressNextFunction,
) => void;

export type ExpressRouterLike = {
  use(handler: ExpressMiddleware): unknown;
};

export type ExpressLike = {
  Router(): ExpressRouterLike;
};

export type ProviderGatewayExpressAdapterOptions = ProviderGatewayNodeAdapterOptions & {
  /**
   * Public mount path in the Express host, for example `/provider-gateway`.
   * Express strips this path before middleware execution; the value is still
   * needed to build OAuth callback URLs.
   */
  mountPath?: string;
};

export type ProviderGatewayExpressAdapter = {
  router: ExpressRouterLike;
  middleware: ExpressMiddleware;
  close(): Promise<void>;
};

function createLazyMiddleware(handlerPromise: Promise<ProviderGatewayNodeHandler>): ExpressMiddleware {
  return (request, response, next) => {
    handlerPromise
      .then((handler) => {
        handler.handle(request, response);
      })
      .catch(next);
  };
}

export function createProviderGatewayExpressMiddleware(
  options: ProviderGatewayExpressAdapterOptions,
): ExpressMiddleware {
  const handlerPromise = createProviderGatewayNodeHandler({
    ...options,
    stripMountPath: false,
  });
  return createLazyMiddleware(handlerPromise);
}

export function createProviderGatewayExpressAdapter(
  express: ExpressLike,
  options: ProviderGatewayExpressAdapterOptions,
): ProviderGatewayExpressAdapter {
  const handlerPromise = createProviderGatewayNodeHandler({
    ...options,
    stripMountPath: false,
  });
  const middleware = createLazyMiddleware(handlerPromise);
  const router = express.Router();
  router.use(middleware);

  return {
    router,
    middleware,
    async close() {
      const handler = await handlerPromise;
      await handler.close();
    },
  };
}

export function createProviderGatewayExpressRouter(
  express: ExpressLike,
  options: ProviderGatewayExpressAdapterOptions,
): ExpressRouterLike {
  return createProviderGatewayExpressAdapter(express, options).router;
}

