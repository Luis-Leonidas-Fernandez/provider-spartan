import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import Fastify, { type FastifyInstance } from "fastify";
import { providerGatewayPlugin, type ProviderGatewayPluginOptions } from "../fastify/provider-gateway.plugin.js";

export type ProviderGatewayNodeAdapterOptions = ProviderGatewayPluginOptions & {
  /**
   * Public mount path used by a host app, for example `/provider-gateway`.
   *
   * This is used to derive provider-auth callback routes such as
   * `/provider-gateway/auth/codex/callback`.
   */
  mountPath?: string;

  /**
   * Strip `mountPath` from incoming Node requests before forwarding them to the
   * internal Fastify router.
   *
   * Use this for raw Node `http` servers mounted behind a prefix. Express
   * already strips mounted paths, so the Express adapter disables this.
   */
  stripMountPath?: boolean;
};

export type ProviderGatewayNodeHandler = {
  handle(request: IncomingMessage, response: ServerResponse): void;
  close(): Promise<void>;
};

export type ProviderGatewayNodeServer = {
  server: Server;
  handler: ProviderGatewayNodeHandler;
  close(): Promise<void>;
};

function normalizeRoutePrefix(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/$/, "") : withLeadingSlash;
}

function joinRoutePrefix(base: string | undefined, child: string) {
  const normalizedBase = normalizeRoutePrefix(base);
  const normalizedChild = normalizeRoutePrefix(child) ?? child;
  if (!normalizedBase || normalizedBase === "/") return normalizedChild;
  return `${normalizedBase}${normalizedChild}`;
}

function stripMountPathFromUrl(url: string | undefined, mountPath: string | undefined) {
  if (!url) return url;
  const normalizedMountPath = normalizeRoutePrefix(mountPath);
  if (!normalizedMountPath || normalizedMountPath === "/") return url;
  if (url === normalizedMountPath) return "/";
  if (url.startsWith(`${normalizedMountPath}/`)) return url.slice(normalizedMountPath.length) || "/";
  if (url.startsWith(`${normalizedMountPath}?`)) return `/${url.slice(normalizedMountPath.length)}`;
  return url;
}

function toPluginOptions(options: ProviderGatewayNodeAdapterOptions): ProviderGatewayPluginOptions {
  const { mountPath: _mountPath, stripMountPath: _stripMountPath, ...pluginOptions } = options;
  const providerAuthPrefix = pluginOptions.providerAuthPrefix ?? joinRoutePrefix(options.mountPath, "/auth");
  return {
    ...pluginOptions,
    ...(providerAuthPrefix !== undefined ? { providerAuthPrefix } : {}),
  } as ProviderGatewayPluginOptions;
}

async function createInternalFastifyApp(options: ProviderGatewayNodeAdapterOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(providerGatewayPlugin, toPluginOptions(options));
  await app.ready();
  return app;
}

export async function createProviderGatewayNodeHandler(
  options: ProviderGatewayNodeAdapterOptions,
): Promise<ProviderGatewayNodeHandler> {
  const app = await createInternalFastifyApp(options);
  const shouldStripMountPath = options.stripMountPath ?? Boolean(options.mountPath);

  return {
    handle(request, response) {
      const originalUrl = request.url;
      if (shouldStripMountPath) {
        request.url = stripMountPathFromUrl(request.url, options.mountPath);
      }
      app.server.emit("request", request, response);
      request.url = originalUrl;
    },
    close() {
      return app.close();
    },
  };
}

export async function createProviderGatewayNodeServer(
  options: ProviderGatewayNodeAdapterOptions,
): Promise<ProviderGatewayNodeServer> {
  const handler = await createProviderGatewayNodeHandler(options);
  const server = createServer((request, response) => handler.handle(request, response));

  return {
    server,
    handler,
    async close() {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
      await handler.close();
    },
  };
}

