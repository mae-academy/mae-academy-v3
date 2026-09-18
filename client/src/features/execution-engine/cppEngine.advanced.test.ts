import { describe, expect, it } from "vitest";

import { run } from "@/features/execution-engine/cppEngine";

describe("C++ Execution Engine - Advanced E2E Verification Suite", () => {
  // =========================================================================
  // Level 1: Primitives & Pointers
  // =========================================================================
  describe("Level 1: Primitives & Pointers", () => {
    it("1. Type Casting & Precedence", async () => {
      const code = `
#include <iostream>

int main() {
    int a = 25, b = 4;
    double div_result = (double)a / b;
    int mod_result = a % b;
    int bit_math = (a << 2) ^ (b >> 1);
    
    std::cout << "Div: " << div_result << ", Mod: " << mod_result << ", Bit: " << bit_math << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Div: 6.25, Mod: 1, Bit: 102\n");
    });

    it("2. Pointer Arithmetic & References", async () => {
      const code = `
#include <iostream>

void swap_refs(int& x, int& y) {
    int temp = x;
    x = y;
    y = temp;
}

int main() {
    int val1 = 100, val2 = 200;
    int* ptr = &val1;
    *ptr = 150;
    
    swap_refs(val1, val2);
    std::cout << "V1: " << val1 << ", V2: " << val2 << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("V1: 200, V2: 150\n");
    });

    it("3. Multi-Dimensional Arrays", async () => {
      const code = `
#include <iostream>

int main() {
    int matrix[3][3];
    int diag_sum = 0;
    
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            matrix[i][j] = (i + 1) * (j + 1);
            if (i == j) diag_sum += matrix[i][j];
        }
    }
    std::cout << "Diag Sum: " << diag_sum << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Diag Sum: 14\n");
    });

    it("4. Structs & Pointers to Structs", async () => {
      const code = `
#include <iostream>

struct Point {
    int x;
    int y;
};

struct Rectangle {
    Point top_left;
    Point bottom_right;
};

int calculate_area(const Rectangle* r) {
    int width = r->bottom_right.x - r->top_left.x;
    int height = r->bottom_right.y - r->top_left.y;
    return width * height;
}

int main() {
    Rectangle rect = {{0, 0}, {10, 5}};
    std::cout << "Area: " << calculate_area(&rect) << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Area: 50\n");
    });
  });

  // =========================================================================
  // Level 2: STL Data Structures
  // =========================================================================
  describe("Level 2: STL Data Structures (vector, stack, queue)", () => {
    it("5. Vector dynamic capacity & front/back/insert", async () => {
      const code = `
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    for (int i = 1; i <= 5; i++) {
        v.push_back(i * 10);
    }
    v.pop_back();
    v.insert(v.begin() + 1, 99);
    
    std::cout << "Size: " << v.size() << ", Front: " << v.front() << ", At(1): " << v[1] << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Size: 5, Front: 10, At(1): 99\n");
    });

    it("6. Stack LIFO Operations", async () => {
      const code = `
#include <iostream>
#include <stack>

int main() {
    std::stack<int> s;
    s.push(10);
    s.push(20);
    s.push(30);
    
    int sum = 0;
    while (!s.empty()) {
        sum += s.top();
        s.pop();
    }
    std::cout << "Stack Sum: " << sum << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Stack Sum: 60\n");
    });

    it("7. Task Queue FIFO Operations (std::queue<std::string>)", async () => {
      const code = `
#include <iostream>
#include <queue>

int main() {
    std::queue<std::string> q;
    q.push("task_1");
    q.push("task_2");
    q.push("task_3");
    
    std::cout << "Front: " << q.front() << ", Back: " << q.back() << std::endl;
    q.pop();
    std::cout << "New Front: " << q.front() << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Front: task_1, Back: task_3\nNew Front: task_2\n");
    });
  });

  // =========================================================================
  // Level 3: Sets & Algorithms
  // =========================================================================
  describe("Level 3: Sets & Algorithms (std::set, <algorithm>)", () => {
    it("8. Vector Sort & Reverse (std::sort, std::reverse)", async () => {
      const code = `
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {45, 12, 89, 34, 23};
    std::sort(nums.begin(), nums.end());
    std::cout << "Min: " << nums.front() << ", Max: " << nums.back() << std::endl;
    
    std::reverse(nums.begin(), nums.end());
    std::cout << "Reversed First: " << nums[0] << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Min: 12, Max: 89\nReversed First: 89\n");
    });

    it("9. Set Deduplication & Search (std::set)", async () => {
      const code = `
#include <iostream>
#include <set>

int main() {
    std::set<int> unique_set;
    unique_set.insert(50);
    unique_set.insert(10);
    unique_set.insert(50); // Duplicate
    unique_set.insert(30);
    
    std::cout << "Set Count: " << unique_set.size() << std::endl;
    std::cout << "Has 10: " << unique_set.count(10) << std::endl;
    unique_set.erase(10);
    std::cout << "Has 10 after erase: " << unique_set.count(10) << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Set Count: 3\nHas 10: 1\nHas 10 after erase: 0\n");
    });

    it("10. Search & Swap Algorithms (std::min, std::max, std::swap)", async () => {
      const code = `
#include <iostream>
#include <algorithm>

int main() {
    int x = 40, y = 70;
    std::swap(x, y);
    int minimum = std::min(x, y);
    int maximum = std::max(x, y);
    
    std::cout << "Min: " << minimum << ", Max: " << maximum << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Min: 40, Max: 70\n");
    });
  });

  // =========================================================================
  // Level 4: Call Stack & Recursion
  // =========================================================================
  describe("Level 4: Call Stack & Recursion", () => {
    it("11. Deep Recursive Fibonacci & Stack Frames", async () => {
      const code = `
#include <iostream>

int fibonacci(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    int res = fibonacci(8);
    std::cout << "Fib(8): " << res << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Fib(8): 21\n");
      // Check that recursive call stack frames were captured
      const hasRecursiveFrame = result.steps.some(step =>
        step.callStack.some(f => f.includes("fibonacci"))
      );
      expect(hasRecursiveFrame).toBe(true);
    });

    it("12. Tower of Hanoi Recursion", async () => {
      const code = `
#include <iostream>

int moves_count = 0;

void hanoi(int n, char from, char to, char aux) {
    if (n == 1) {
        moves_count++;
        return;
    }
    hanoi(n - 1, from, aux, to);
    moves_count++;
    hanoi(n - 1, aux, to, from);
}

int main() {
    hanoi(3, 'A', 'C', 'B');
    std::cout << "Total Moves for 3 disks: " << moves_count << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Total Moves for 3 disks: 7\n");
      const hasHanoiFrame = result.steps.some(step =>
        step.callStack.some(f => f.includes("hanoi"))
      );
      expect(hasHanoiFrame).toBe(true);
    });
  });

  // =========================================================================
  // Level 5: OOP & Advanced Algorithms
  // =========================================================================
  describe("Level 5: OOP & Advanced Algorithms", () => {
    it("13. Classes, Encapsulation & this Pointer (BankAccount)", async () => {
      const code = `
#include <iostream>

class BankAccount {
private:
    int balance;
public:
    BankAccount(int initial) : balance(initial) {}
    void deposit(int amount) { this->balance += amount; }
    bool withdraw(int amount) {
        if (amount > this->balance) return false;
        this->balance -= amount;
        return true;
    }
    int get_balance() const { return this->balance; }
};

int main() {
    BankAccount account(500);
    account.deposit(200);
    bool ok = account.withdraw(300);
    std::cout << "Success: " << ok << ", Balance: " << account.get_balance() << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Success: 1, Balance: 400\n");
    });

    it("14. Dynamic Linked List Simulation (Node)", async () => {
      const code = `
#include <iostream>

struct Node {
    int data;
    Node* next;
};

int main() {
    Node n3 = {30, nullptr};
    Node n2 = {20, &n3};
    Node n1 = {10, &n2};
    
    Node* head = &n1;
    int sum = 0;
    while (head != nullptr) {
        sum += head->data;
        head = head->next;
    }
    std::cout << "Linked List Sum: " << sum << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Linked List Sum: 60\n");
    });

    it("15. Vector-Based In-Place Quicksort (std::vector, recursion, partition)", async () => {
      const code = `
#include <iostream>
#include <vector>
#include <algorithm>

void quick_sort(std::vector<int>& arr, int low, int high) {
    if (low < high) {
        int pivot = arr[high];
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (arr[j] <= pivot) {
                i++;
                std::swap(arr[i], arr[j]);
            }
        }
        std::swap(arr[i + 1], arr[high]);
        int pi = i + 1;
        
        quick_sort(arr, low, pi - 1);
        quick_sort(arr, pi + 1, high);
    }
}

int main() {
    std::vector<int> data = {64, 34, 25, 12, 22, 11, 90};
    quick_sort(data, 0, (int)data.size() - 1);
    
    std::cout << "Sorted first: " << data.front() << ", last: " << data.back() << std::endl;
    return 0;
}
`;
      const result = await run(code);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Sorted first: 11, last: 90\n");
    });

    it("16. Nested STL Containers (std::vector<std::stack<int>>)", async () => {
      const code = `
#include <iostream>
#include <vector>
#include <stack>

int main() {
    std::vector<std::stack<int>> multi_stack;
    
    std::stack<int> s1;
    s1.push(10);
    s1.push(20);
    
    std::stack<int> s2;
    s2.push(100);
    s2.push(200);
    s2.push(300);
    
    multi_stack.push_back(s1);
    multi_stack.push_back(s2);
    
    int total_top = multi_stack[0].top() + multi_stack[1].top();
    std::cout << "Stacks Count: " << multi_stack.size() << ", Sum of Tops: " << total_top << std::endl;
    return 0;
}
`;
      const result = await run(code);
      console.log("Nested result:", result.success, result.error, result.steps.at(-1)?.stdout);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.at(-1)?.stdout).toBe("Stacks Count: 2, Sum of Tops: 320\n");
    });
  });
});
