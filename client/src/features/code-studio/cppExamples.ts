import type { AssemblerTemplateGroup } from "@/components/assembler/AssemblerToolbar";

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const CPP_EXAMPLES: CodeExample[] = [
  {
    id: "cpp-io-types",
    title: "1. Formatted I/O & Numeric Types",
    description: "Standard I/O stream formatting, precision manipulators, and primitive limits.",
    code: `#include <iostream>
#include <iomanip>

int main() {
    std::string module = "Telemetry";
    int channel = 4;
    double voltage = 3.314159;
    bool active = true;

    std::cout << "Module: " << module << " | Channel: " << channel << "\\n";
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "Calibrated Voltage: " << voltage << " V\\n";
    std::cout << "Status Flag: " << std::boolalpha << active << "\\n";

    return 0;
}
`
  },
  {
    id: "cpp-switch-logic",
    title: "2. Control Flow & State Dispatch",
    description: "Evaluating status codes using conditional branching and switch-case statements.",
    code: `#include <iostream>

enum SystemState { IDLE = 0, RUNNING = 1, WARNING = 2, FAULT = 3 };

int main() {
    SystemState current = WARNING;

    switch (current) {
        case IDLE:
            std::cout << "[SYS] Standby mode.\\n";
            break;
        case RUNNING:
            std::cout << "[SYS] Normal operational mode.\\n";
            break;
        case WARNING:
            std::cout << "[SYS] Non-critical warning detected!\\n";
            break;
        case FAULT:
            std::cout << "[SYS] Emergency shutdown initiated!\\n";
            break;
    }
    return 0;
}
`
  },
  {
    id: "cpp-loops-series",
    title: "3. Loop Constructs & Geometric Sum",
    description: "Iterative accumulation, boundary clamping, and loop progression.",
    code: `#include <iostream>

int main() {
    int terms = 8;
    long long current_val = 1;
    long long total_sum = 0;

    std::cout << "Geometric Series (x2):\\n";
    for (int i = 0; i < terms; ++i) {
        std::cout << current_val << (i == terms - 1 ? "" : ", ");
        total_sum += current_val;
        current_val *= 2;
    }

    std::cout << "\\nTotal Accumulation: " << total_sum << "\\n";
    return 0;
}
`
  },
  {
    id: "cpp-pass-by-ref",
    title: "4. Pass-by-Reference & Swapping",
    description: "Memory references vs value semantics and in-place variable swaps.",
    code: `#include <iostream>

void swapValues(int& a, int& b) {
    int temp = a;
    a = b;
    b = temp;
}

int main() {
    int regA = 0xAA;
    int regB = 0x55;

    std::cout << "Before Swap: A=" << regA << ", B=" << regB << "\\n";
    swapValues(regA, regB);
    std::cout << "After Swap:  A=" << regA << ", B=" << regB << "\\n";

    return 0;
}
`
  },
  {
    id: "cpp-pointers-arrays",
    title: "5. Pointers & Memory Traversal",
    description: "Pointer arithmetic and iterating arrays using memory addresses.",
    code: `#include <iostream>

int main() {
    int buffer[] = {10, 20, 30, 40, 50};
    int size = sizeof(buffer) / sizeof(buffer[0]);
    int* ptr = buffer;

    std::cout << "Reading array via pointer arithmetic:\\n";
    for (int i = 0; i < size; ++i) {
        std::cout << "Offset " << i << " | Address: " << (ptr + i) 
                  << " | Value: " << *(ptr + i) << "\\n";
    }

    return 0;
}
`
  },
  {
    id: "cpp-vector-filtering",
    title: "6. STL Vector & Dynamic Sizing",
    description: "Dynamic array allocation, element appending, and sample filtering.",
    code: `#include <iostream>
#include <vector>

int main() {
    std::vector<int> raw_adc = {102, 540, 890, 310, 1015, 60};
    std::vector<int> valid_samples;

    int threshold = 300;
    for (int sample : raw_adc) {
        if (sample >= threshold) {
            valid_samples.push_back(sample);
        }
    }

    std::cout << "Filtered Samples count: " << valid_samples.size() << "\\nValues: ";
    for (int val : valid_samples) {
        std::cout << val << " ";
    }
    std::cout << "\\n";

    return 0;
}
`
  },
  {
    id: "cpp-struct-telemetry",
    title: "7. Structs & Sensor Records",
    description: "Compound data structures, member alignment, and formatted inspection.",
    code: `#include <iostream>

struct SensorReading {
    int id;
    float temperature;
    float humidity;
    bool isValid;
};

void printReport(const SensorReading& s) {
    std::cout << "Sensor [" << s.id << "] -> Temp: " << s.temperature 
              << " C | Humidity: " << s.humidity << "% | Status: " 
              << (s.isValid ? "NOMINAL" : "ERR") << "\\n";
}

int main() {
    SensorReading nodeA = {101, 24.5f, 55.2f, true};
    SensorReading nodeB = {102, -99.0f, 0.0f, false};

    printReport(nodeA);
    printReport(nodeB);
    return 0;
}
`
  },
  {
    id: "cpp-oop-bank",
    title: "8. OOP: Encapsulation & Guard Clauses",
    description: "Classes, private state attributes, constructors, and transaction methods.",
    code: `#include <iostream>

class BankAccount {
private:
    std::string accountHolder;
    double balance;

public:
    BankAccount(std::string name, double initial) 
        : accountHolder(name), balance(initial > 0 ? initial : 0) {}

    void deposit(double amount) {
        if (amount > 0) balance += amount;
    }

    bool withdraw(double amount) {
        if (amount > 0 && amount <= balance) {
            balance -= amount;
            return true;
        }
        return false;
    }

    void display() const {
        std::cout << "Holder: " << accountHolder << " | Balance: $" << balance << "\\n";
    }
};

int main() {
    BankAccount acc("Mohammad", 150.0);
    acc.deposit(50.0);
    acc.withdraw(80.0);
    acc.display();
    return 0;
}
`
  },
  {
    id: "cpp-inheritance-polymorphism",
    title: "9. OOP: Inheritance & Virtual Dispatch",
    description: "Virtual base classes, runtime polymorphism, and interface implementation.",
    code: `#include <iostream>
#include <vector>

class Actuator {
public:
    virtual void trigger() = 0;
    virtual ~Actuator() {}
};

class Relay : public Actuator {
public:
    void trigger() override {
        std::cout << "[Relay] Coil energized -> Contacts closed.\\n";
    }
};

class Buzzer : public Actuator {
public:
    void trigger() override {
        std::cout << "[Buzzer] Beep tone emitted at 2.4 kHz.\\n";
    }
};

int main() {
    Relay r;
    Buzzer b;
    std::vector<Actuator*> devices = {&r, &b};

    for (Actuator* dev : devices) {
        dev->trigger();
    }
    return 0;
}
`
  },
  {
    id: "cpp-templates-math",
    title: "10. Generic Programming (Templates)",
    description: "Generic functions and template type deductions for reusable mathematical operations.",
    code: `#include <iostream>

template <typename T>
T clamp(T value, T low, T high) {
    if (value < low) return low;
    if (value > high) return high;
    return value;
}

int main() {
    int int_val = clamp(120, 0, 100);
    float float_val = clamp(3.45f, 0.0f, 5.0f);

    std::cout << "Clamped Int:   " << int_val << "\\n";
    std::cout << "Clamped Float: " << float_val << "\\n";
    return 0;
}
`
  },
  {
    id: "cpp-map-dictionary",
    title: "11. Associative Containers (std::map)",
    description: "Key-value red-black tree lookups, item frequency counters, and lookups.",
    code: `#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> faultLog;

    faultLog["TIMEOUT"]++;
    faultLog["CRC_ERROR"]++;
    faultLog["TIMEOUT"]++;
    faultLog["VOLTAGE_DROP"]++;

    std::cout << "System Fault Telemetry Log:\\n";
    for (const auto& pair : faultLog) {
        std::cout << "Fault Code [" << pair.first << "] -> Count: " << pair.second << "\\n";
    }
    return 0;
}
`
  },
  {
    id: "cpp-stack-lifo",
    title: "12. Stack Data Structure (std::stack)",
    description: "LIFO queue container adapter, element pushing, and balanced popping.",
    code: `#include <iostream>
#include <stack>

int main() {
    std::stack<int> addressStack;

    // Simulate pushing return addresses
    addressStack.push(0x1000);
    addressStack.push(0x1040);
    addressStack.push(0x2080);

    std::cout << "Call Stack unwinding (LIFO):\\n";
    while (!addressStack.empty()) {
        std::cout << "Return to: 0x" << std::hex << addressStack.top() << "\\n";
        addressStack.pop();
    }

    return 0;
}
`
  },
  {
    id: "cpp-binary-search",
    title: "13. Fast Binary Search Algorithm",
    description: "Logarithmic divide-and-conquer implementation on a sorted array.",
    code: `#include <iostream>

int binarySearch(const int arr[], int size, int target) {
    int low = 0;
    int high = size - 1;

    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}

int main() {
    int sorted_ids[] = {12, 24, 35, 47, 59, 63, 75, 88, 99};
    int n = sizeof(sorted_ids) / sizeof(sorted_ids[0]);
    int target = 63;

    int idx = binarySearch(sorted_ids, n, target);
    std::cout << "Target " << target << " found at index: " << idx << "\\n";
    return 0;
}
`
  },
  {
    id: "cpp-bubble-sort",
    title: "14. Sorting: In-Place Bubble Sort",
    description: "Classic iterative swap sorting algorithm for ordering sequence arrays.",
    code: `#include <iostream>

void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; ++i) {
        for (int j = 0; j < n - i - 1; ++j) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

int main() {
    int data[] = {64, 25, 12, 22, 11};
    int n = sizeof(data) / sizeof(data[0]);

    bubbleSort(data, n);

    std::cout << "Sorted Array:\\n";
    for (int i = 0; i < n; ++i) {
        std::cout << data[i] << " ";
    }
    std::cout << "\\n";
    return 0;
}
`
  },
  {
    id: "cpp-bitwise-flags",
    title: "15. Embedded Bitwise Register Simulation",
    description: "Bit manipulation, masking, setting, and toggling hardware register flags.",
    code: `#include <iostream>
#include <bitset>
#include <cstdint>

constexpr uint8_t FLAG_PWR = 1 << 0;  // 00000001
constexpr uint8_t FLAG_RDY = 1 << 1;  // 00000010
constexpr uint8_t FLAG_TX  = 1 << 2;  // 00000100
constexpr uint8_t FLAG_ERR = 1 << 3;  // 00001000

int main() {
    uint8_t control_reg = 0x00;

    // Set PWR and RDY flags
    control_reg |= (FLAG_PWR | FLAG_RDY);
    std::cout << "Reg State: 0b" << std::bitset<8>(control_reg) << "\\n";

    // Check if TX flag is active
    bool is_tx_active = (control_reg & FLAG_TX) != 0;
    std::cout << "Is TX active? " << (is_tx_active ? "YES" : "NO") << "\\n";

    // Toggle ERR flag
    control_reg ^= FLAG_ERR;
    std::cout << "After Error Toggle: 0b" << std::bitset<8>(control_reg) << "\\n";

    return 0;
}
`
  }
];

export const CPP_TEMPLATE_GROUPS: AssemblerTemplateGroup[] = [
  {
    label: "Basics & Control Flow",
    items: [
      "1. Formatted I/O & Numeric Types",
      "2. Control Flow & State Dispatch",
      "3. Loop Constructs & Geometric Sum",
      "4. Pass-by-Reference & Swapping",
      "5. Pointers & Memory Traversal",
    ],
  },
  {
    label: "Containers & Structs",
    items: [
      "6. STL Vector & Dynamic Sizing",
      "7. Structs & Sensor Records",
      "11. Associative Containers (std::map)",
      "12. Stack Data Structure (std::stack)",
    ],
  },
  {
    label: "OOP & Generic Programming",
    items: [
      "8. OOP: Encapsulation & Guard Clauses",
      "9. OOP: Inheritance & Virtual Dispatch",
      "10. Generic Programming (Templates)",
    ],
  },
  {
    label: "Algorithms & Low-Level",
    items: [
      "13. Fast Binary Search Algorithm",
      "14. Sorting: In-Place Bubble Sort",
      "15. Embedded Bitwise Register Simulation",
    ],
  },
];

export const CPP_EXAMPLE_SOURCES: Record<string, string> = Object.fromEntries(
  CPP_EXAMPLES.map((ex) => [ex.title, ex.code])
);

export const DEFAULT_CPP_TEMPLATE = "1. Formatted I/O & Numeric Types";
