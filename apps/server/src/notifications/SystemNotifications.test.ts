import { describe, expect, it } from "vitest";

import {
  resolveAttentionNotificationLaunch,
  resolveSystemNotificationEnvironment,
} from "./SystemNotifications.ts";

describe("SystemNotifications", () => {
  it("uses notify-send for Linux attention notifications", () => {
    const launch = resolveAttentionNotificationLaunch(
      {
        providerName: "codex",
        threadTitle: "Fix reconnect handling",
        reason: "approval",
        detail: "Run git status",
      },
      {
        platform: "linux",
        isCommandAvailable: (command) => command === "notify-send",
      },
    );

    expect(launch?.command).toBe("notify-send");
    expect(launch?.args).toEqual([
      "-u",
      "normal",
      "T3 Code",
      "Codex needs approval in Fix reconnect handling: Run git status",
    ]);
  });

  it("describes structured user input requests", () => {
    const launch = resolveAttentionNotificationLaunch(
      {
        providerName: "claudeAgent",
        threadTitle: "Release smoke test",
        reason: "user-input",
      },
      {
        platform: "linux",
        isCommandAvailable: (command) => command === "notify-send",
      },
    );

    expect(launch?.args).toEqual([
      "-u",
      "normal",
      "T3 Code",
      "Claude needs your input in Release smoke test",
    ]);
  });

  it("describes completed turns", () => {
    const launch = resolveAttentionNotificationLaunch(
      {
        providerName: "codex",
        threadTitle: "Release smoke test",
        reason: "turn-completed",
        turnState: "completed",
      },
      {
        platform: "linux",
        isCommandAvailable: (command) => command === "notify-send",
      },
    );

    expect(launch?.args).toEqual([
      "-u",
      "normal",
      "T3 Code",
      "Codex finished in Release smoke test",
    ]);
  });

  it("describes failed turns with the error detail", () => {
    const launch = resolveAttentionNotificationLaunch(
      {
        providerName: "codex",
        threadTitle: "Release smoke test",
        reason: "turn-completed",
        turnState: "failed",
        detail: "Process exited with code 1",
      },
      {
        platform: "linux",
        isCommandAvailable: (command) => command === "notify-send",
      },
    );

    expect(launch?.args).toEqual([
      "-u",
      "normal",
      "T3 Code",
      "Codex turn failed in Release smoke test: Process exited with code 1",
    ]);
  });

  it("returns null when no supported notification command is available", () => {
    const launch = resolveAttentionNotificationLaunch(
      {
        providerName: "codex",
        threadTitle: "Thread",
        reason: "approval",
      },
      {
        platform: "linux",
        isCommandAvailable: () => false,
      },
    );

    expect(launch).toBeNull();
  });

  it("strips AppImage library overrides from system notification commands", () => {
    const env = resolveSystemNotificationEnvironment({
      DISPLAY: ":0",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
      LD_LIBRARY_PATH: "/tmp/.mount_T3-Code/usr/lib",
      LD_PRELOAD: "/tmp/.mount_T3-Code/preload.so",
      PATH: "/usr/bin",
    });

    expect(env).toEqual({
      DISPLAY: ":0",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
      PATH: "/usr/bin",
    });
  });
});
