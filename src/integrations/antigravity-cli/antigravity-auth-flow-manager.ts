import { EventEmitter } from "node:events";
import { createId } from "../../shared/id/id.js";
import { nowIso } from "../../shared/date/date.js";
import { redactAntigravityCliOutput } from "./antigravity-cli-redaction.js";
import type { AntigravityCliStatusSnapshot } from "./antigravity-cli.types.js";
import type {
  AntigravityAuthEvent,
  AntigravityAuthFlowManagerPort,
  AntigravityAuthFlowSnapshot,
  AntigravityInteractiveProcess,
  AntigravityInteractiveProcessLauncher,
} from "./antigravity-auth.types.js";

type InternalFlow = {
  snapshot: AntigravityAuthFlowSnapshot;
  emitter: EventEmitter;
  process: AntigravityInteractiveProcess;
  killTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
};

const DEFAULT_CANCEL_KILL_AFTER_MS = 1_000;
const DEFAULT_FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_FLOW_TTL_MS = 10 * 60 * 1000;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

function expiresAtFromNow(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function isExpired(snapshot: AntigravityAuthFlowSnapshot, now = new Date()) {
  return snapshot.status === "running" && new Date(snapshot.expiresAt).getTime() <= now.getTime();
}

function withUpdatedSnapshot(flow: InternalFlow, event: AntigravityAuthEvent) {
  flow.snapshot = {
    ...flow.snapshot,
    updatedAt: nowIso(),
    events: [...flow.snapshot.events, event],
  };
  flow.emitter.emit("event", event);
}

function classifyInputRequirement(text: string): AntigravityAuthEvent | null {
  const normalized = text.toLowerCase();
  if (/enter .*code|paste .*code|verification code|authorization code/.test(normalized)) {
    return { type: "input_required", inputType: "code", prompt: text.trim() || undefined };
  }
  if (/press enter|type .* and press enter|input required|enter response/.test(normalized)) {
    return { type: "input_required", inputType: "text", prompt: text.trim() || undefined };
  }
  return null;
}

export class AntigravityAuthFlowManager implements AntigravityAuthFlowManagerPort {
  private readonly flows = new Map<string, InternalFlow>();

  constructor(
    private readonly launcher: AntigravityInteractiveProcessLauncher,
    private readonly statusInspector: { inspect(): Promise<AntigravityCliStatusSnapshot> },
    private readonly options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      cancelKillAfterMs?: number;
      initialArgs?: string[];
      flowTimeoutMs?: number;
      flowTtlMs?: number;
    },
  ) {}

  async start(): Promise<AntigravityAuthFlowSnapshot> {
    const flowId = createId();
    this.cleanupExpired();
    const process = await this.launcher.launch({
      args: this.options?.initialArgs ?? [],
      ...(this.options?.cwd ? { cwd: this.options.cwd } : {}),
      ...(this.options?.env ? { env: this.options.env } : {}),
    });

    const internal: InternalFlow = {
      snapshot: {
        flowId,
        status: "running",
        startedAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: expiresAtFromNow(this.options?.flowTtlMs ?? DEFAULT_FLOW_TTL_MS),
        events: [{ type: "started", flowId }],
      },
      emitter: new EventEmitter(),
      process,
      killTimer: null,
      expiryTimer: null,
    };
    this.flows.set(flowId, internal);
    internal.expiryTimer = setTimeout(() => {
      if (internal.snapshot.status !== "running") return;
      internal.snapshot.status = "failed";
      withUpdatedSnapshot(internal, { type: "expired" });
      withUpdatedSnapshot(internal, { type: "failed", code: "AUTH_FLOW_EXPIRED", message: "Antigravity auth flow expired" });
      internal.process.kill("SIGTERM");
    }, this.options?.flowTimeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS);
    internal.expiryTimer.unref();

    const handleChunk = (raw: string, stream: "stdout" | "stderr") => {
      const text = redactAntigravityCliOutput(raw);
      if (!text.trim()) return;
      withUpdatedSnapshot(internal, { type: "output", text, stream });
      const urls = text.match(URL_REGEX) ?? [];
      for (const url of urls) {
        withUpdatedSnapshot(internal, { type: "open_url", url });
      }
      const inputRequired = classifyInputRequirement(text);
      if (inputRequired) {
        withUpdatedSnapshot(internal, inputRequired);
      }
    };

    process.onStdout((chunk) => handleChunk(chunk, "stdout"));
    process.onStderr((chunk) => handleChunk(chunk, "stderr"));
    process.onError((error) => {
      if (internal.snapshot.status !== "running") return;
      internal.snapshot.status = "failed";
      withUpdatedSnapshot(internal, { type: "failed", code: "PROCESS_ERROR", message: redactAntigravityCliOutput(error.message) });
    });
    process.onExit(async () => {
      if (internal.killTimer) {
        clearTimeout(internal.killTimer);
        internal.killTimer = null;
      }
      if (internal.expiryTimer) {
        clearTimeout(internal.expiryTimer);
        internal.expiryTimer = null;
      }
      if (internal.snapshot.status === "cancelled" || internal.snapshot.status === "failed") return;
      const status = await this.statusInspector.inspect();
      if (status.state === "ready") {
        internal.snapshot.status = "authenticated";
        withUpdatedSnapshot(internal, { type: "authenticated" });
        return;
      }
      internal.snapshot.status = "failed";
      withUpdatedSnapshot(internal, {
        type: "failed",
        code: status.state.toUpperCase(),
        message: status.message ?? "Antigravity CLI auth flow ended without ready status",
      });
    });

    return internal.snapshot;
  }

  get(flowId: string): AntigravityAuthFlowSnapshot | null {
    this.cleanupExpired();
    return this.flows.get(flowId)?.snapshot ?? null;
  }

  async writeInput(flowId: string, input: string): Promise<AntigravityAuthFlowSnapshot> {
    this.cleanupExpired();
    this.cleanupExpired();
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error(`Auth flow ${flowId} not found`);
    if (flow.snapshot.status !== "running") throw new Error(`Auth flow ${flowId} is not running`);
    flow.process.write(input.endsWith("\n") ? input : `${input}\n`);
    flow.snapshot = {
      ...flow.snapshot,
      updatedAt: nowIso(),
    };
    return flow.snapshot;
  }

  async cancel(flowId: string): Promise<AntigravityAuthFlowSnapshot> {
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error(`Auth flow ${flowId} not found`);
    if (flow.snapshot.status !== "running") return flow.snapshot;
    flow.snapshot.status = "cancelled";
    withUpdatedSnapshot(flow, { type: "cancelled" });
    if (flow.expiryTimer) {
      clearTimeout(flow.expiryTimer);
      flow.expiryTimer = null;
    }
    flow.process.kill("SIGTERM");
    flow.killTimer = setTimeout(() => {
      flow.process.kill("SIGKILL");
    }, this.options?.cancelKillAfterMs ?? DEFAULT_CANCEL_KILL_AFTER_MS);
    flow.killTimer.unref();
    return flow.snapshot;
  }

  subscribe(flowId: string, listener: (event: AntigravityAuthEvent) => void) {
    this.cleanupExpired();
    const flow = this.flows.get(flowId);
    if (!flow) return null;
    const wrapped = (event: AntigravityAuthEvent) => listener(event);
    flow.emitter.on("event", wrapped);
    return () => flow.emitter.off("event", wrapped);
  }

  cleanupExpired(now = new Date()) {
    let cleaned = 0;
    for (const flow of this.flows.values()) {
      if (!isExpired(flow.snapshot, now)) continue;
      flow.snapshot.status = "failed";
      withUpdatedSnapshot(flow, { type: "expired" });
      withUpdatedSnapshot(flow, { type: "failed", code: "AUTH_FLOW_EXPIRED", message: "Antigravity auth flow expired" });
      flow.process.kill("SIGTERM");
      cleaned += 1;
    }
    return cleaned;
  }

  cancelAll(reason = "Antigravity auth manager shutdown") {
    let cancelled = 0;
    for (const flow of this.flows.values()) {
      if (flow.snapshot.status !== "running") continue;
      flow.snapshot.status = "cancelled";
      withUpdatedSnapshot(flow, { type: "cancelled" });
      flow.process.kill("SIGTERM");
      cancelled += 1;
    }
    void reason;
    return cancelled;
  }
}
