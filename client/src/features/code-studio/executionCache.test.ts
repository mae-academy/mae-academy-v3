import { afterEach, describe, expect, it, vi } from "vitest";

import * as remote from "@/features/execution-engine/remoteCppEngine";
import {
  clearExecutionCache,
  peekCachedRun,
  prewarmRemote,
  runRemoteCached,
} from "./executionCache";

const ok = { stdout: "hi", stderr: "", exitCode: 0, success: true };

describe("executionCache", () => {
  afterEach(() => {
    clearExecutionCache();
    vi.restoreAllMocks();
  });

  it("serves an identical re-run from memory and busts on any edit", async () => {
    const spy = vi.spyOn(remote, "executeRemoteCpp").mockResolvedValue(ok);
    await runRemoteCached("cpp", "int main(){}");
    await runRemoteCached("cpp", "int main(){}");
    expect(spy).toHaveBeenCalledTimes(1);
    await runRemoteCached("cpp", "int main(){ }");
    await runRemoteCached("cpp", "int main(){}", "input");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not cache transport failures", async () => {
    const spy = vi
      .spyOn(remote, "executeRemoteC")
      .mockResolvedValue({ ...ok, success: false, exitCode: 1, error: "offline" });
    await runRemoteCached("c", "x");
    await runRemoteCached("c", "x");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("pre-warm shares one request with the following Run", async () => {
    const spy = vi.spyOn(remote, "executeRemoteCpp").mockResolvedValue(ok);
    prewarmRemote("cpp", "int main(){return 0;}");
    await runRemoteCached("cpp", "int main(){return 0;}");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(peekCachedRun("cpp", "int main(){return 0;}")).toEqual(ok);
  });
});
