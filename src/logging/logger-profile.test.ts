import { describe, expect, it } from "vitest";
import { resolveLogPrefix } from "./logger.js";

describe("resolveLogPrefix", () => {
  it("returns 'openclaw' when no profile is set", () => {
    expect(resolveLogPrefix({})).toBe("openclaw");
  });

  it("returns 'openclaw' when profile is undefined", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: undefined })).toBe("openclaw");
  });

  it("returns 'openclaw' when profile is empty string", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "" })).toBe("openclaw");
  });

  it("returns 'openclaw' when profile is 'default'", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "default" })).toBe("openclaw");
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "DEFAULT" })).toBe("openclaw");
  });

  it("returns 'openclaw-xv' for profile 'xv'", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "xv" })).toBe("openclaw-xv");
  });

  it("returns 'openclaw-my-profile' for profile 'my-profile'", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "my-profile" })).toBe("openclaw-my-profile");
  });

  it("normalizes uppercase to lowercase", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "MyProfile" })).toBe("openclaw-myprofile");
  });

  it("sanitizes special characters to hyphens", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "my profile!" })).toBe("openclaw-my-profile");
  });

  it("collapses multiple hyphens", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "a--b" })).toBe("openclaw-a-b");
  });

  it("trims leading/trailing hyphens from profile name", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "-profile-" })).toBe("openclaw-profile");
  });

  it("trims whitespace from profile name", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "  xv  " })).toBe("openclaw-xv");
  });

  it("falls back to 'openclaw' if profile sanitizes to empty string", () => {
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "---" })).toBe("openclaw");
    expect(resolveLogPrefix({ OPENCLAW_PROFILE: "!!!" })).toBe("openclaw");
  });
});

import { extractLogFilePrefix } from "./logger.js";

describe("extractLogFilePrefix", () => {
  it("returns 'openclaw' for default profile log file", () => {
    expect(extractLogFilePrefix("openclaw-2026-03-04.log")).toBe("openclaw");
  });

  it("returns 'openclaw-xv' for named profile log file", () => {
    expect(extractLogFilePrefix("openclaw-xv-2026-03-04.log")).toBe("openclaw-xv");
  });

  it("returns 'openclaw-my-profile' for multi-segment profile", () => {
    expect(extractLogFilePrefix("openclaw-my-profile-2026-03-04.log")).toBe("openclaw-my-profile");
  });

  it("returns null for non-rolling log files", () => {
    expect(extractLogFilePrefix("openclaw.log")).toBeNull();
    expect(extractLogFilePrefix("openclaw-gateway.log")).toBeNull();
    expect(extractLogFilePrefix("other-2026-03-04.log")).toBeNull();
  });

  it("returns null for files with no log suffix", () => {
    expect(extractLogFilePrefix("openclaw-2026-03-04.txt")).toBeNull();
  });

  it("default profile does NOT match named-profile log files", () => {
    // This is the critical regression test: startsWith("openclaw-") would falsely match
    expect(extractLogFilePrefix("openclaw-xv-2026-03-04.log")).not.toBe("openclaw");
  });
});
