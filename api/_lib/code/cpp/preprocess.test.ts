import { describe, expect, it } from "vitest";

import { run } from "./cppEngine";

import { desugarContainerReferences } from "./preprocess";

describe("desugarContainerReferences", () => {
  it("strips a plain vector reference", () => {
    expect(desugarContainerReferences("void f(vector<int>& v) {}")).toBe("void f(vector<int> v) {}");
  });

  it("strips const + reference on a nested vector", () => {
    expect(desugarContainerReferences("int f(int start, const vector<vector<int>>& adj) {}")).toBe(
      "int f(int start, vector<vector<int>> adj) {}"
    );
  });

  it("strips references on non-vector containers", () => {
    expect(desugarContainerReferences("void f(stack<int>& s, const queue<int>& q) {}")).toBe(
      "void f(stack<int> s, queue<int> q) {}"
    );
  });

  it("leaves by-value container parameters untouched", () => {
    expect(desugarContainerReferences("void f(vector<int> v) {}")).toBe("void f(vector<int> v) {}");
  });
});

describe("cppEngine.run — nested vector<vector<int>> by const reference", () => {
  it("parses and runs a function taking const vector<vector<int>>&", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <queue>

int bfs_test(int start, const std::vector<std::vector<int>>& adj) {
    return adj.size();
}

int main() {
    std::vector<std::vector<int>> adj(2);
    std::cout << "Res: " << bfs_test(0, adj) << std::endl;
    return 0;
}
`);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("Res: 2\n");
  });
});
