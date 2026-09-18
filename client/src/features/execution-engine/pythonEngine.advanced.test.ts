import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// Redirect CDN Pyodide import to local node package for Vitest
const require = createRequire(import.meta.url);
const pyodidePackageDir = path.dirname(require.resolve("pyodide/package.json"));
const PYODIDE_LOCAL_INDEX_URL = `${pyodidePackageDir}/`;

vi.mock(
  "https://cdn.jsdelivr.net/pyodide/v0.27.8/full/pyodide.mjs",
  async () => {
    const pyodideModule = await import("pyodide");
    return {
      loadPyodide: (options?: Record<string, unknown>) =>
        pyodideModule.loadPyodide({
          ...options,
          indexURL: PYODIDE_LOCAL_INDEX_URL,
        }),
    };
  }
);

const { run } = await import("@/features/execution-engine/pythonEngine");

const TIMEOUT_MS = 60_000;

describe("Python Execution Engine — Advanced E2E Verification Suite", () => {
  // =========================================================================
  // Level 1: Basic Scope & Primitives
  // =========================================================================
  describe("Level 1: Basic Scope & Primitives", () => {
    it(
      "1. Arithmetic operations, operator precedence, and compound assignment",
      async () => {
        const result = await run(`
x = 10
y = 3
sum_val = x + y
prod_val = x * y
div_val = x / y
int_div = x // y
mod_val = x % y
pow_val = x ** 2

x += 5
y *= 2
`);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();

        const vars = result.steps.at(-1)?.variables;
        expect(vars?.sum_val?.value).toBe(13);
        expect(vars?.prod_val?.value).toBe(30);
        expect(vars?.div_val?.value).toBeCloseTo(3.3333333333333335);
        expect(vars?.int_div?.value).toBe(3);
        expect(vars?.mod_val?.value).toBe(1);
        expect(vars?.pow_val?.value).toBe(100);
        expect(vars?.x?.value).toBe(15);
        expect(vars?.y?.value).toBe(6);
      },
      TIMEOUT_MS
    );

    it(
      "2. Strings, F-string formatting, membership testing, and slicing",
      async () => {
        const result = await run(`
name = "MAE"
tool = "Code Studio"
version = 2.0
formatted = f"Welcome to {name} {tool} v{version:.1f}"

sub = formatted[11:22]
has_studio = "Studio" in formatted
reversed_name = name[::-1]
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.formatted?.value).toBe("Welcome to MAE Code Studio v2.0");
        expect(vars?.sub?.value).toBe("MAE Code St");
        expect(vars?.has_studio?.value).toBe(true);
        expect(vars?.reversed_name?.value).toBe("EAM");
      },
      TIMEOUT_MS
    );

    it(
      "3. Lists, append/insert/pop mutations, slicing, and slice assignment",
      async () => {
        const result = await run(`
nums = [1, 2, 3, 4, 5]
nums.append(6)
nums.insert(0, 0)
popped = nums.pop()
sub_list = nums[2:5]
nums[1:3] = [10, 20]
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.popped?.value).toBe(6);
        expect(vars?.sub_list?.value).toEqual([2, 3, 4]);
        expect(vars?.nums?.value).toEqual([0, 10, 20, 3, 4, 5]);
      },
      TIMEOUT_MS
    );

    it(
      "4. Dictionaries and sets (item modification, deletion, and set algebra)",
      async () => {
        const result = await run(`
lookup = {"alpha": 1, "beta": 2, "gamma": 3}
lookup["delta"] = 4
del lookup["alpha"]

s1 = {1, 2, 3, 4}
s2 = {3, 4, 5, 6}
intersection = s1 & s2
union = s1 | s2
diff = s1 - s2
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.lookup?.value).toEqual({ beta: 2, gamma: 3, delta: 4 });
        expect(vars?.intersection?.type).toBe("set");
        expect(String(vars?.intersection?.value)).toContain("3");
        expect(String(vars?.intersection?.value)).toContain("4");
        expect(vars?.union?.type).toBe("set");
        expect(vars?.diff?.type).toBe("set");
      },
      TIMEOUT_MS
    );
  });

  // =========================================================================
  // Level 2: Control Flow & Comprehensions
  // =========================================================================
  describe("Level 2: Control Flow & Comprehensions", () => {
    it(
      "5. Nested loops with multi-way branches and matrix generation",
      async () => {
        const result = await run(`
matrix = []
for i in range(3):
    row = []
    for j in range(3):
        if i == j:
            row.append(1)
        elif i > j:
            row.append(2)
        else:
            row.append(0)
    matrix.append(row)
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.matrix?.value).toEqual([
          [1, 0, 0],
          [2, 1, 0],
          [2, 2, 1],
        ]);
      },
      TIMEOUT_MS
    );

    it(
      "6. List, dict, and nested flattening comprehensions",
      async () => {
        const result = await run(`
squares = [x**2 for x in range(10) if x % 2 == 0]
pair_dict = {f"k_{i}": i * 10 for i in range(5)}
flattened = [val for row in [[1, 2], [3, 4], [5, 6]] for val in row]
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.squares?.value).toEqual([0, 4, 16, 36, 64]);
        expect(vars?.pair_dict?.value).toEqual({
          k_0: 0,
          k_1: 10,
          k_2: 20,
          k_3: 30,
          k_4: 40,
        });
        expect(vars?.flattened?.value).toEqual([1, 2, 3, 4, 5, 6]);
      },
      TIMEOUT_MS
    );

    it(
      "7. Built-in functions: zip, enumerate, sorted with lambda key",
      async () => {
        const result = await run(`
keys = ["a", "b", "c"]
values = [100, 200, 300]
mapped = dict(zip(keys, values))

indexed = []
for idx, item in enumerate(keys):
    indexed.append((idx, item))

raw_pairs = [(2, 'b'), (1, 'c'), (3, 'a')]
by_key = sorted(raw_pairs, key=lambda p: p[0])
by_val = sorted(raw_pairs, key=lambda p: p[1])
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.mapped?.value).toEqual({ a: 100, b: 200, c: 300 });
        expect(vars?.indexed?.value).toEqual([
          [0, "a"],
          [1, "b"],
          [2, "c"],
        ]);
        expect(vars?.by_key?.value).toEqual([
          [1, "c"],
          [2, "b"],
          [3, "a"],
        ]);
        expect(vars?.by_val?.value).toEqual([
          [3, "a"],
          [2, "b"],
          [1, "c"],
        ]);
      },
      TIMEOUT_MS
    );
  });

  // =========================================================================
  // Level 3: Recursion & Call Stacks
  // =========================================================================
  describe("Level 3: Recursion & Call Stacks", () => {
    it(
      "8. Deep recursion with memoization and call stack tracking",
      async () => {
        const result = await run(`
memo = {}
def fib(n):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]

result = fib(12)
stack_depth_test = fib(5)
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.result?.value).toBe(144);
        expect(vars?.stack_depth_test?.value).toBe(5);

        // Verify call stack grew during execution
        const deepStep = result.steps.find(step =>
          step.callStack.filter(frame => frame === "fib").length >= 2
        );
        expect(deepStep).toBeDefined();

        // Final step returns to top-level module
        expect(result.steps.at(-1)?.callStack).toEqual(["<module>"]);
      },
      TIMEOUT_MS
    );

    it(
      "9. Advanced parameter passing (*args, **kwargs, default params)",
      async () => {
        const result = await run(`
def configure_engine(name, *flags, base_rate=1.0, **metadata):
    active_flags = list(flags)
    config = {
        "engine": name,
        "rate": base_rate,
        "flags_count": len(active_flags),
        "meta": metadata
    }
    return config

c1 = configure_engine("MasmCore", "fast", "opt", base_rate=2.5, mode="headless", debug=True)
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.c1?.value).toEqual({
          engine: "MasmCore",
          rate: 2.5,
          flags_count: 2,
          meta: { mode: "headless", debug: true },
        });
      },
      TIMEOUT_MS
    );

    it(
      "10. Closures and lexical scoping",
      async () => {
        const result = await run(`
def make_multiplier(factor):
    base = 10
    def multiply(x):
        return (x * factor) + base
    return multiply

times_three = make_multiplier(3)
val_a = times_three(4)
val_b = times_three(10)
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.val_a?.value).toBe(22);
        expect(vars?.val_b?.value).toBe(40);

        // Verify that while executing multiply, callStack includes multiply
        const closureStep = result.steps.find(step =>
          step.callStack.includes("multiply")
        );
        expect(closureStep).toBeDefined();
      },
      TIMEOUT_MS
    );
  });

  // =========================================================================
  // Level 4: OOP & Dynamic Dispatch
  // =========================================================================
  describe("Level 4: OOP & Dynamic Dispatch", () => {
    it(
      "11. Classes, object instantiation, and dynamic linked-list traversal",
      async () => {
        const result = await run(`
class Node:
    def __init__(self, value):
        self.value = value
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None

    def insert(self, value):
        new_node = Node(value)
        new_node.next = self.head
        self.head = new_node

    def to_list(self):
        res = []
        curr = self.head
        while curr:
            res.append(curr.value)
            curr = curr.next
        return res

ll = LinkedList()
for v in [10, 20, 30]:
    ll.insert(v)
out = ll.to_list()
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.out?.value).toEqual([30, 20, 10]);
        expect(vars?.ll?.type).toBe("LinkedList");
      },
      TIMEOUT_MS
    );

    it(
      "12. Magic methods: operator overloading (__add__, __eq__)",
      async () => {
        const result = await run(`
class Vector2D:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector2D(self.x + other.x, self.y + other.y)

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y

v1 = Vector2D(3, 4)
v2 = Vector2D(1, 2)
v3 = v1 + v2
is_same = (v3 == Vector2D(4, 6))
is_diff = (v3 == Vector2D(4, 5))
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.is_same?.value).toBe(true);
        expect(vars?.is_diff?.value).toBe(false);
        expect(vars?.v3?.type).toBe("Vector2D");
      },
      TIMEOUT_MS
    );
  });

  // =========================================================================
  // Level 5: Stress Tests & Edge Cases
  // =========================================================================
  describe("Level 5: Stress Tests & Edge Cases", () => {
    it(
      "13. Try / except / finally execution flow and exception interception",
      async () => {
        const result = await run(`
def safe_divide(a, b):
    status = "pending"
    result = None
    try:
        result = a / b
        status = "success"
    except ZeroDivisionError:
        status = "zero_error"
        result = 0
    except TypeError:
        status = "type_error"
    finally:
        execution_done = True
    return result, status

r1, s1 = safe_divide(10, 2)
r2, s2 = safe_divide(10, 0)
`);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.r1?.value).toBe(5);
        expect(vars?.s1?.value).toBe("success");
        expect(vars?.r2?.value).toBe(0);
        expect(vars?.s2?.value).toBe("zero_error");
      },
      TIMEOUT_MS
    );

    it(
      "14. Generators and lazy yield iteration",
      async () => {
        const result = await run(`
def prime_generator(limit):
    for num in range(2, limit):
        is_prime = True
        for i in range(2, int(num ** 0.5) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            yield num

gen = prime_generator(20)
primes = [p for p in gen]
`);
        expect(result.success).toBe(true);
        const vars = result.steps.at(-1)?.variables;
        expect(vars?.primes?.value).toEqual([2, 3, 5, 7, 11, 13, 17, 19]);
      },
      TIMEOUT_MS
    );

    it(
      "15. Recursive in-place quicksort algorithm and stdout capture",
      async () => {
        const result = await run(`
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

sample = [33, 12, 55, 78, 90, 1, 44, 23, 12, 88, 6]
sorted_sample = quicksort(sample)
print("Sorted:", sorted_sample)
`);
        expect(result.success).toBe(true);
        const lastStep = result.steps.at(-1);
        expect(lastStep?.variables?.sorted_sample?.value).toEqual([
          1, 6, 12, 12, 23, 33, 44, 55, 78, 88, 90,
        ]);
        expect(lastStep?.stdout).toContain(
          "Sorted: [1, 6, 12, 12, 23, 33, 44, 55, 78, 88, 90]"
        );
      },
      TIMEOUT_MS
    );
  });
});
