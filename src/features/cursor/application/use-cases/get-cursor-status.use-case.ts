import { LOCAL_OS_USER_IDENTITY_MODEL } from "../../../../shared/local-cli-runtime/local-cli-runtime.types.js";
import type { CursorConcurrencyInspectorPort } from "../ports/cursor-concurrency-inspector.port.js";
import type { CursorRuntimeIntrospectionPort } from "../ports/cursor-runtime-introspection.port.js";

function shouldReconnect(state: string) {
  return state !== "ready";
}

export class GetCursorStatusUseCase {
  constructor(
    private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort,
    private readonly concurrencyInspector: CursorConcurrencyInspectorPort,
  ) {}

  async execute() {
    const snapshot = await this.runtimeIntrospection.inspect();
    const concurrency = this.concurrencyInspector.getSnapshot();
    return {
      provider: snapshot.provider,
      connected: snapshot.state === "ready",
      reconnectRequired: shouldReconnect(snapshot.state),
      executionMode: snapshot.executionMode,
      state: snapshot.state,
      cli: snapshot.cli,
      authentication: snapshot.authentication,
      capabilities: snapshot.capabilities,
      actions: snapshot.actions,
      message: snapshot.message,
      concurrency,
      identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
    };
  }
}

export class GetCursorCapabilitiesUseCase {
  constructor(private readonly runtimeIntrospection: CursorRuntimeIntrospectionPort) {}

  async execute() {
    const snapshot = await this.runtimeIntrospection.inspect();
    return {
      provider: snapshot.provider,
      executionMode: snapshot.executionMode,
      cli: snapshot.cli,
      capabilities: snapshot.capabilities,
      state: snapshot.state,
      actions: snapshot.actions,
      message: snapshot.message,
      identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
    };
  }
}
