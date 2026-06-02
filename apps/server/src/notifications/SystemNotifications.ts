import { isCommandAvailable } from "@t3tools/shared/shell";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export interface AttentionNotificationInput {
  readonly providerName: string;
  readonly threadTitle: string;
  readonly reason: "approval" | "user-input" | "turn-completed";
  readonly turnState?: "completed" | "failed" | "interrupted" | "cancelled";
  readonly detail?: string;
}

interface ProcessLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly options: ChildProcess.CommandOptions;
}

export interface SystemNotificationsShape {
  readonly notifyAttentionNeeded: (input: AttentionNotificationInput) => Effect.Effect<void>;
}

export class SystemNotifications extends Context.Service<
  SystemNotifications,
  SystemNotificationsShape
>()("t3/notifications/SystemNotifications") {
  static readonly layerTest = (
    implementation: Partial<SystemNotificationsShape> = {},
  ): Layer.Layer<SystemNotifications> =>
    Layer.succeed(
      SystemNotifications,
      SystemNotifications.of({
        notifyAttentionNeeded: implementation.notifyAttentionNeeded ?? (() => Effect.void),
      }),
    );
}

function systemCommandEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key === "LD_LIBRARY_PATH" || key === "LD_PRELOAD") continue;
    clean[key] = value;
  }
  return clean;
}

function detachedIgnoreStdioOptions(): ChildProcess.CommandOptions {
  return {
    env: systemCommandEnvironment(),
    extendEnv: false,
    detached: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  };
}

export function resolveSystemNotificationEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return systemCommandEnvironment(env);
}

const DETACHED_IGNORE_STDIO_OPTIONS = {
  detached: true,
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
} as const satisfies ChildProcess.CommandOptions;

function truncateNotificationText(value: string, limit = 140): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function displayProviderName(providerName: string): string {
  switch (providerName) {
    case "codex":
      return "Codex";
    case "claudeAgent":
      return "Claude";
    case "opencode":
      return "OpenCode";
    default:
      return providerName;
  }
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function notificationBody(input: AttentionNotificationInput): string {
  const providerName = displayProviderName(input.providerName);
  const threadTitle = truncateNotificationText(input.threadTitle);
  const detail = input.detail?.trim();
  const detailSuffix = detail ? `: ${truncateNotificationText(detail, 90)}` : "";
  switch (input.reason) {
    case "approval":
      return `${providerName} needs approval in ${threadTitle}${detailSuffix}`;
    case "user-input":
      return `${providerName} needs your input in ${threadTitle}${detailSuffix}`;
    case "turn-completed": {
      switch (input.turnState) {
        case "failed":
          return `${providerName} turn failed in ${threadTitle}${detailSuffix}`;
        case "interrupted":
          return `${providerName} turn was interrupted in ${threadTitle}${detailSuffix}`;
        case "cancelled":
          return `${providerName} turn was cancelled in ${threadTitle}${detailSuffix}`;
        case "completed":
        case undefined:
          return `${providerName} finished in ${threadTitle}${detailSuffix}`;
      }
      return `${providerName} finished in ${threadTitle}${detailSuffix}`;
    }
  }
}

export function resolveAttentionNotificationLaunch(
  input: AttentionNotificationInput,
  options: {
    readonly platform?: NodeJS.Platform;
    readonly isCommandAvailable?: typeof isCommandAvailable;
  } = {},
): ProcessLaunch | null {
  const platform = options.platform ?? process.platform;
  const commandAvailable = options.isCommandAvailable ?? isCommandAvailable;
  const body = notificationBody(input);

  if (platform === "linux" && commandAvailable("notify-send")) {
    return {
      command: "notify-send",
      args: ["-u", "normal", "T3 Code", body],
      options: detachedIgnoreStdioOptions(),
    };
  }

  if (platform === "darwin" && commandAvailable("osascript")) {
    return {
      command: "osascript",
      args: ["-e", `display notification "${escapeAppleScriptString(body)}" with title "T3 Code"`],
      options: DETACHED_IGNORE_STDIO_OPTIONS,
    };
  }

  return null;
}

const launchAndUnref = Effect.fn("systemNotifications.launchAndUnref")(function* (
  launch: ProcessLaunch,
): Effect.fn.Return<void, PlatformError.PlatformError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(launch.command, [...launch.args], launch.options);

  return yield* spawner.spawn(command).pipe(
    Effect.flatMap((handle) => handle.unref),
    Effect.asVoid,
    Effect.scoped,
  );
});

const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const notifyAttentionNeeded: SystemNotificationsShape["notifyAttentionNeeded"] = (input) =>
    Effect.gen(function* () {
      const launch = resolveAttentionNotificationLaunch(input);
      if (launch === null) return;

      yield* launchAndUnref(launch).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.scoped,
        Effect.catchCause((cause) =>
          Effect.logWarning("failed to spawn system notification", {
            providerName: input.providerName,
            reason: input.reason,
            cause: Cause.pretty(cause),
          }),
        ),
      );
    });

  return SystemNotifications.of({ notifyAttentionNeeded });
});

export const SystemNotificationsLive = Layer.effect(SystemNotifications, make);
