import { describe, expect, it } from "vitest";

import { run } from "./cppEngine";

describe("cppEngine.run", () => {
  it("traces a C++ program with a function call and captures stdout", async () => {
    const result = await run(`
#include <iostream>
using namespace std;
int add(int a, int b) {
  int result = a + b;
  return result;
}
int main() {
  int x = 3;
  int y = 4;
  int z = add(x, y);
  cout << z << endl;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.at(-1)?.stdout).toBe("7\n");
    const callStep = result.steps.find(step =>
      step.callStack.includes("function add")
    );
    expect(callStep).toBeDefined();
    const zStep = result.steps.find(step => step.variables.z?.value === "7");
    expect(zStep).toBeDefined();
  });

  it("reports a parse error as a failed result instead of throwing", async () => {
    const result = await run("int main( { return 0; }");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.steps).toHaveLength(0);
  });

  it("halts a genuine infinite loop instead of hanging the test", async () => {
    const result = await run(
      `
int main() {
  int i = 0;
  while (1) { i = i + 1; }
  return 0;
}
`,
      { maxSteps: 500 }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/possible infinite loop/i);
    // JSCPP's debugger burns its first internal step priming the initial state (no source line
    // yet), so exactly maxSteps trace entries is not guaranteed — only that it stopped at the cap.
    expect(result.steps.length).toBeLessThanOrEqual(500);
    expect(result.steps.length).toBeGreaterThan(450);
  });

  it("does not surface function bindings (e.g. main/add) as traced variables", async () => {
    const result = await run(`
#include <iostream>
using namespace std;
int add(int a, int b) { return a + b; }
int main() {
  int z = add(1, 2);
  cout << z << endl;
  return 0;
}
`);
    const lastStep = result.steps.at(-1);
    expect(lastStep?.variables.add).toBeUndefined();
    expect(lastStep?.variables.main).toBeUndefined();
  });
});

describe("cppEngine.run — std::vector<int|double> (MVP monomorphized STL)", () => {
  it("push_back, size, and indexed read for vector<int>", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(10);
  v.push_back(20);
  v.push_back(30);
  cout << v.size() << " " << v[0] << " " << v[2] << endl;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps.at(-1)?.stdout).toBe("3 10 30\n");
  });

  it("indexed write mutates the stored element (o(=) aliasing through operator[])", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v[1] = 42;
  cout << v[0] << " " << v[1] << endl;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("1 42\n");
  });

  it("supports vector<double> as a distinct monomorphized class", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<double> v;
  v.push_back(1.5);
  v.push_back(2.5);
  cout << v.size() << " " << v[0] + v[1] << endl;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("2 4\n");
  });

  it("reports empty() correctly before and after push_back", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  cout << v.empty();
  v.push_back(1);
  cout << v.empty();
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("10");
  });

  it("raises a catchable error on out-of-range indexing instead of crashing the engine", async () => {
    const result = await run(`
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  int x = v[5];
  return 0;
}
`);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/out of range/i);
  });

  it("traces vector<int> variables at each step like any other local", async () => {
    const result = await run(`
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(7);
  int size_now = v.size();
  return 0;
}
`);
    expect(result.success).toBe(true);
    const sizeStep = result.steps.find(step => step.variables.size_now?.value === "1");
    expect(sizeStep).toBeDefined();
    expect(sizeStep?.variables.v?.type).toBe("__vector_int");
  });
});

describe("cppEngine.run — <algorithm> (MVP: vector iterators, min/max/swap)", () => {
  it("sorts a vector<int> in place via sort(v.begin(), v.end())", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> nums;
  nums.push_back(5);
  nums.push_back(2);
  nums.push_back(8);
  nums.push_back(1);
  nums.push_back(9);
  sort(nums.begin(), nums.end());
  cout << nums[0] << " " << nums[1] << " " << nums[4];
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps.at(-1)?.stdout).toBe("1 2 9");
  });

  it("reverses a vector<double> in place via reverse(v.begin(), v.end())", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<double> v;
  v.push_back(1.5);
  v.push_back(2.5);
  v.push_back(3.5);
  reverse(v.begin(), v.end());
  cout << v[0] << " " << v[2];
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("3.5 1.5");
  });

  it("min, max, and swap on plain ints", async () => {
    const result = await run(`
#include <iostream>
#include <algorithm>
using namespace std;
int main() {
  int a = 3, b = 7;
  cout << min(a, b) << " " << max(a, b) << " ";
  swap(a, b);
  cout << a << " " << b;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("3 7 7 3");
  });
});

describe("cppEngine.run — std::stack<int> (MVP monomorphized STL)", () => {
  it("push/pop/top/empty/size behave LIFO", async () => {
    const result = await run(`
#include <iostream>
#include <stack>
using namespace std;
int main() {
  stack<int> s;
  cout << s.empty() << " ";
  s.push(1);
  s.push(2);
  s.push(3);
  cout << s.size() << " " << s.top() << " ";
  s.pop();
  cout << s.top() << " " << s.empty();
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("1 3 3 2 0");
  });

  it("raises a catchable error popping an empty stack", async () => {
    const result = await run(`
#include <stack>
using namespace std;
int main() {
  stack<int> s;
  s.pop();
  return 0;
}
`);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty stack/i);
  });
});

describe("cppEngine.run — std::queue<int> (MVP monomorphized STL)", () => {
  it("push/pop/front/empty/size behave FIFO", async () => {
    const result = await run(`
#include <iostream>
#include <queue>
using namespace std;
int main() {
  queue<int> q;
  q.push(1);
  q.push(2);
  q.push(3);
  cout << q.size() << " " << q.front() << " ";
  q.pop();
  cout << q.front() << " " << q.size();
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("3 1 2 2");
  });
});

describe("cppEngine.run — std::set<int> (MVP monomorphized STL)", () => {
  it("insert deduplicates, count reflects membership, erase removes", async () => {
    const result = await run(`
#include <iostream>
#include <set>
using namespace std;
int main() {
  set<int> s;
  s.insert(5);
  s.insert(3);
  s.insert(5);
  s.insert(1);
  cout << s.size() << " " << s.count(5) << " " << s.count(9) << " ";
  s.erase(5);
  cout << s.size() << " " << s.count(5);
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("3 1 0 2 0");
  });
});

describe("cppEngine.run — cout << container (native-like printing)", () => {
  it("prints vector<int> as [a, b, c]", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  cout << v;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("[1, 2, 3]");
  });

  it("prints set<int> as {a, b, c} and still prints plain ints normally afterward", async () => {
    const result = await run(`
#include <iostream>
#include <set>
using namespace std;
int main() {
  set<int> s;
  s.insert(3);
  s.insert(1);
  s.insert(2);
  cout << s << " " << 42;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("{1, 2, 3} 42");
  });
});

describe("cppEngine.run — <algorithm> fill/count/find/accumulate", () => {
  it("fill overwrites a range with a value", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  fill(v.begin(), v.end(), 7);
  cout << v;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("[7, 7, 7]");
  });

  it("count counts matching elements in a range", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(2);
  v.push_back(3);
  cout << count(v.begin(), v.end(), 2);
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("2");
  });

  it("find returns v.end() when the value is absent (idiomatic not-found check)", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  bool foundTwo = find(v.begin(), v.end(), 2) != v.end();
  bool foundNine = find(v.begin(), v.end(), 9) != v.end();
  cout << foundTwo << " " << foundNine;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("1 0");
  });

  it("accumulate sums a range starting from init", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  v.push_back(3);
  cout << accumulate(v.begin(), v.end(), 100);
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("106");
  });
});

describe("cppEngine.run — vector<string> bridge", () => {
  it("push_back, size, and indexed read of string literals", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<string> names;
  names.push_back("MAE");
  names.push_back("Academy");
  cout << names.size() << " " << names[0] << " " << names[1];
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("2 MAE Academy");
  });

  it("prints vector<string> quoted via cout << v", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<string> names;
  names.push_back("MAE");
  names.push_back("Academy");
  cout << names;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe('["MAE", "Academy"]');
  });
});

describe("cppEngine.run — range-based for loop preprocessing", () => {
  it("transpiles for (int x : v) into an indexed loop over a vector<int>", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(10);
  v.push_back(20);
  v.push_back(30);
  int total = 0;
  for (int x : v) {
    total = total + x;
  }
  cout << total;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.steps.at(-1)?.stdout).toBe("60");
  });

  it("supports a range-for body without braces (single statement)", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(1);
  v.push_back(2);
  for (int x : v) cout << x;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.steps.at(-1)?.stdout).toBe("12");
  });

  it("handles a nested range-for loop correctly (brace-depth tracking, not naive regex)", async () => {
    const result = await run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<int> outer;
  outer.push_back(1);
  outer.push_back(2);
  vector<int> inner;
  inner.push_back(10);
  inner.push_back(20);
  int total = 0;
  for (int a : outer) {
    for (int b : inner) {
      total = total + a * b;
    }
  }
  cout << total;
  return 0;
}
`);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    // (1*10 + 1*20) + (2*10 + 2*20) = 30 + 60 = 90
    expect(result.steps.at(-1)?.stdout).toBe("90");
  });
});
