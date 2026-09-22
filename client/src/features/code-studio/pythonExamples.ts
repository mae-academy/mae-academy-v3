import type { AssemblerTemplateGroup } from "@/components/assembler/AssemblerToolbar";

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const PYTHON_EXAMPLES: CodeExample[] = [
  {
    id: "py-fstrings",
    title: "1. Formatted Strings & Data Types",
    description: "Type inference, arithmetic assignments, and multi-variable f-strings.",
    code: `# Fundamentals: Dynamic typing and string interpolation
course_name = "Embedded Systems"
cohort_size = 42
passing_rate = 94.5
is_active = True

summary = f"Course: {course_name} | Students: {cohort_size} | Pass: {passing_rate}%"
print(summary)
print(f"Active Status: {is_active} (Type: {type(is_active).__name__})")
`
  },
  {
    id: "py-clamping",
    title: "2. Logic & Signal Clamping",
    description: "Nested conditionals, boundary validation, and sensor clamping.",
    code: `# Signal Conditioning: Clamping sensor values to safe operating bounds
raw_sensor_val = 1085
min_limit = 0
max_limit = 1023

if raw_sensor_val < min_limit:
    clamped_val = min_limit
    status = "UNDERFLOW_SATURATED"
elif raw_sensor_val > max_limit:
    clamped_val = max_limit
    status = "OVERFLOW_SATURATED"
else:
    clamped_val = raw_sensor_val
    status = "NOMINAL_OK"

print(f"Input: {raw_sensor_val} -> Output: {clamped_val} [{status}]")
`
  },
  {
    id: "py-while-convergence",
    title: "3. Numerical Convergence (While)",
    description: "Heron's method approximation using while loop tolerance checks.",
    code: `# Numerical Approximation: Computing square root via Heron's method
target = 49.0
guess = target / 2.0
tolerance = 0.0001
max_iter = 20
step = 0

while abs(guess * guess - target) > tolerance and step < max_iter:
    guess = (guess + target / guess) / 2.0
    step += 1

print(f"Sqrt of {target} ≈ {guess:.6f} (Found in {step} iterations)")
`
  },
  {
    id: "py-list-comprehension",
    title: "4. List Comprehension & DSP",
    description: "Inline list processing, value filtering, and sample normalization.",
    code: `# DSP Processing: Filtering and scaling ADC digital samples
raw_samples = [120, 450, 890, 1020, 310, 60]
threshold = 300

# Keep values above threshold and normalize to 0.0 - 1.0 range (10-bit ADC)
filtered_norm = [round(val / 1023.0, 3) for val in raw_samples if val > threshold]

print("Raw Inputs:", raw_samples)
print("Filtered & Normalized:", filtered_norm)
`
  },
  {
    id: "py-dict-telemetry",
    title: "5. Telemetry Dictionary Lookups",
    description: "Key-value aggregations, frequency counters, and dictionary iterations.",
    code: `# Telemetry Monitor: Aggregating microcontroller error status codes
error_logs = ["ERR_TIMEOUT", "ERR_CRC", "ERR_TIMEOUT", "ERR_OVERVOLT", "ERR_CRC"]
counter = {}

for err in error_logs:
    counter[err] = counter.get(err, 0) + 1

for err_type, count in counter.items():
    print(f"Error Code [{err_type}]: {count} occurrences")
`
  },
  {
    id: "py-matrix-transpose",
    title: "6. 2D Matrix Transposition",
    description: "Nested list iteration, matrix operations, and coordinate transformations.",
    code: `# 2D Grid Transform: Matrix Transposition
matrix = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
]

rows = len(matrix)
cols = len(matrix[0])
transposed = []

for c in range(cols):
    new_row = []
    for r in range(rows):
        new_row.append(matrix[r][c])
    transposed.append(new_row)

print("Original Matrix:", matrix)
print("Transposed Matrix:", transposed)
`
  },
  {
    id: "py-tuple-stats",
    title: "7. Tuple Unpacking & Statistics",
    description: "Multiple return values, standard deviation, and dataset mean calculations.",
    code: `# Dataset Statistics: Processing numeric telemetry batches
def calculate_stats(data):
    n = len(data)
    mean_val = sum(data) / n
    variance = sum((x - mean_val) ** 2 for x in data) / n
    return min(data), max(data), round(mean_val, 2), round(variance ** 0.5, 2)

readings = [14.2, 15.1, 13.9, 16.5, 14.8, 15.3]
d_min, d_max, d_mean, d_std = calculate_stats(readings)

print(f"Min: {d_min} | Max: {d_max} | Mean: {d_mean} | StdDev: {d_std}")
`
  },
  {
    id: "py-fib-memo",
    title: "8. Recursive Memoized Fibonacci",
    description: "Call-stack recursion, dictionary caching, and base cases.",
    code: `# Recursion: Fibonacci sequence generator with dictionary cache
memo = {}

def fibonacci(n):
    if n in memo:
        return memo[n]
    if n <= 0:
        return 0
    if n == 1:
        return 1
    
    memo[n] = fibonacci(n - 1) + fibonacci(n - 2)
    return memo[n]

sequence = [fibonacci(i) for i in range(10)]
print("First 10 Fibonacci Numbers:", sequence)
`
  },
  {
    id: "py-stack-brackets",
    title: "9. LIFO Stack & Bracket Validator",
    description: "Stack push/pop operations for balanced bracket verification.",
    code: `# Bracket Matching: Verifying code parenthesis balance using LIFO stack
def is_balanced(expression):
    stack = []
    mapping = {")": "(", "}": "{", "]": "["}
    
    for char in expression:
        if char in mapping.values():
            stack.append(char)
        elif char in mapping.keys():
            if not stack or stack.pop() != mapping[char]:
                return False
    return len(stack) == 0

expr1 = "{[a + b] * (c - d)}"
expr2 = "((x + y) * z]"

print(f"'{expr1}' -> Balanced: {is_balanced(expr1)}")
print(f"'{expr2}' -> Balanced: {is_balanced(expr2)}")
`
  },
  {
    id: "py-fifo-queue",
    title: "10. FIFO Packet Pipeline Queue",
    description: "Queue data structure for buffering and sequentially consuming packets.",
    code: `# Pipeline Buffer: Simulating packet arrival and consumption
class PacketQueue:
    def __init__(self):
        self.buffer = []

    def push(self, packet):
        self.buffer.append(packet)

    def pop(self):
        if not self.buffer:
            return None
        return self.buffer.pop(0)

queue = PacketQueue()
for pkt_id in [101, 102, 103]:
    queue.push(f"PACKET_{pkt_id}")

while True:
    packet = queue.pop()
    if packet is None:
        break
    print(f"Dispatched -> {packet}")
`
  },
  {
    id: "py-binary-search",
    title: "11. Binary Search Algorithm",
    description: "Divide-and-conquer logarithmic array search implementation.",
    code: `# Divide & Conquer: Fast binary search on sorted array
def binary_search(arr, target):
    low = 0
    high = len(arr) - 1
    
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1

sorted_pins = [2, 4, 7, 8, 12, 13, 18, 22]
target_pin = 13
idx = binary_search(sorted_pins, target_pin)

print(f"Search target {target_pin} in {sorted_pins}: Index = {idx}")
`
  },
  {
    id: "py-insertion-sort",
    title: "12. In-Place Insertion Sort",
    description: "Array iteration and in-place shifting to order elements ascendingly.",
    code: `# Sorting Algorithm: In-place insertion sort
def insertion_sort(data):
    arr = list(data)
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr

raw_dataset = [64, 34, 25, 12, 22, 11, 90]
sorted_dataset = insertion_sort(raw_dataset)

print("Before Sort:", raw_dataset)
print("After Sort: ", sorted_dataset)
`
  },
  {
    id: "py-fsm-traffic",
    title: "13. State Machine (FSM Traffic)",
    description: "Discrete state transitions and time durations using lookup tables.",
    code: `# Finite State Machine (FSM): Controller transitions
class TrafficState:
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"

next_transition = {
    TrafficState.RED: (TrafficState.GREEN, 5),
    TrafficState.GREEN: (TrafficState.YELLOW, 4),
    TrafficState.YELLOW: (TrafficState.RED, 2)
}

current_state = TrafficState.RED
for cycle in range(3):
    next_st, duration = next_transition[current_state]
    print(f"Cycle {cycle+1}: State is [{current_state}] -> Next is [{next_st}] in {duration}s")
    current_state = next_st
`
  },
  {
    id: "py-oop-pid",
    title: "14. Object-Oriented PID Controller",
    description: "Class modeling, encapsulated gains, and feedback compute loops.",
    code: `# Object-Oriented: Proportional-Integral-Derivative (PID) Controller class
class PIDController:
    def __init__(self, kp, ki, kd):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.integral = 0.0
        self.prev_error = 0.0

    def compute(self, setpoint, process_var, dt=0.1):
        error = setpoint - process_var
        self.integral += error * dt
        derivative = (error - self.prev_error) / dt
        output = (self.kp * error) + (self.ki * self.integral) + (self.kd * derivative)
        self.prev_error = error
        return round(output, 3)

pid = PIDController(kp=1.2, ki=0.5, kd=0.1)
setpoint = 100.0
measured = 85.0
control_signal = pid.compute(setpoint, measured)

print(f"Setpoint: {setpoint} | Measured: {measured} | Control Effort: {control_signal}")
`
  },
  {
    id: "py-flag-registers",
    title: "15. Bitwise Flag Register Emulation",
    description: "Bit shifting, bitwise masking, and status flag state inspection.",
    code: `# Register Simulation: 8-bit System Status Register manipulation
FLAG_READY = 1 << 0   # Bit 0 (00000001)
FLAG_TX_BUSY = 1 << 1 # Bit 1 (00000010)
FLAG_RX_READY = 1 << 2# Bit 2 (00000100)
FLAG_FAULT = 1 << 3   # Bit 3 (00001000)

status_reg = 0x00

# Set READY and TX_BUSY flags
status_reg |= (FLAG_READY | FLAG_TX_BUSY)
print(f"Status Register: 0b{status_reg:08b} (Hex: 0x{status_reg:02X})")

# Check if TX_BUSY is set
is_busy = bool(status_reg & FLAG_TX_BUSY)
print(f"Is TX Busy? {is_busy}")

# Clear TX_BUSY flag
status_reg &= ~FLAG_TX_BUSY
print(f"After clearing TX_BUSY: 0b{status_reg:08b}")
`
  }
];

export const PYTHON_TEMPLATE_GROUPS: AssemblerTemplateGroup[] = [
  {
    label: "Basics & Fundamentals",
    items: [
      "1. Formatted Strings & Data Types",
      "2. Logic & Signal Clamping",
      "3. Numerical Convergence (While)",
      "4. List Comprehension & DSP",
    ],
  },
  {
    label: "Data Structures & Iteration",
    items: [
      "5. Telemetry Dictionary Lookups",
      "6. 2D Matrix Transposition",
      "7. Tuple Unpacking & Statistics",
      "8. Recursive Memoized Fibonacci",
      "9. LIFO Stack & Bracket Validator",
      "10. FIFO Packet Pipeline Queue",
    ],
  },
  {
    label: "Algorithms & OOP",
    items: [
      "11. Binary Search Algorithm",
      "12. In-Place Insertion Sort",
      "13. State Machine (FSM Traffic)",
      "14. Object-Oriented PID Controller",
      "15. Bitwise Flag Register Emulation",
    ],
  },
];

export const PYTHON_EXAMPLE_SOURCES: Record<string, string> = Object.fromEntries(
  PYTHON_EXAMPLES.map((ex) => [ex.title, ex.code])
);

export const DEFAULT_PYTHON_TEMPLATE = "1. Formatted Strings & Data Types";
