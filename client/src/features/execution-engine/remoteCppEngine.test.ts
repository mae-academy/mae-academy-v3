import { describe, it, expect } from "vitest";
import { executeRemoteCpp, executeRemoteC } from "./remoteCppEngine";

describe("remoteCppEngine (Wandbox Zero-Key Real GCC)", () => {
  it(
    "executes full C++ class with access specifiers",
    async () => {
      const code = `#include <iostream>
class MinStack {
private:
    int val;
public:
    MinStack(int v) : val(v) {}
    int get() const { return val; }
};
int main() {
    MinStack m(42);
    std::cout << "Val: " << m.get() << std::endl;
    return 0;
}`;

      const result = await executeRemoteCpp(code);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Val: 42");
    },
    20000
  );

  it(
    "executes dynamic memory allocation (new and delete)",
    async () => {
      const code = `#include <iostream>
struct Node { int data; Node* next; };
int main() {
    Node* n = new Node{100, nullptr};
    std::cout << "Data: " << n->data << std::endl;
    delete n;
    return 0;
}`;

      const result = await executeRemoteCpp(code);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Data: 100");
    },
    20000
  );

  it(
    "executes nested container by reference (const vector<vector<int>>&)",
    async () => {
      const code = `#include <iostream>
#include <vector>
int get_size(const std::vector<std::vector<int>>& m) {
    return m.size();
}
int main() {
    std::vector<std::vector<int>> mat(3, std::vector<int>(2, 5));
    std::cout << "Rows: " << get_size(mat) << std::endl;
    return 0;
}`;

      const result = await executeRemoteCpp(code);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Rows: 3");
    },
    20000
  );

  it(
    "executes standard C program",
    async () => {
      const code = `#include <stdio.h>
int main() {
    printf("Pure C Works: %d\\n", 7 * 6);
    return 0;
}`;

      const result = await executeRemoteC(code);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Pure C Works: 42");
    },
    20000
  );
});
