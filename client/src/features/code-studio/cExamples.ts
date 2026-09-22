import type { AssemblerTemplateGroup } from "@/components/assembler/AssemblerToolbar";

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const C_EXAMPLES: CodeExample[] = [
  {
    id: "c-printf-types",
    title: "1. Formatted Standard I/O & Types",
    description: "Format specifiers, primitive data types, and sizeof memory footprints.",
    code: `#include <stdio.h>
#include <stdint.h>

int main(void) {
    char label = 'A';
    int32_t sensor_val = 1024;
    float voltage = 3.30f;
    double calibrated = 3.30285;

    printf("Channel: %c | ADC Reading: %d\\n", label, sensor_val);
    printf("Voltage: %.2f V | Calibrated: %.5f V\\n", voltage, calibrated);
    printf("Size of int32_t: %zu bytes | Size of double: %zu bytes\\n", 
           sizeof(sensor_val), sizeof(calibrated));

    return 0;
}
`
  },
  {
    id: "c-switch-state",
    title: "2. Control Flow & State Enumeration",
    description: "Discrete finite-state machine handling via enum and switch-case branching.",
    code: `#include <stdio.h>

typedef enum {
    SYS_IDLE,
    SYS_STARTUP,
    SYS_RUNNING,
    SYS_EMERGENCY
} SystemState_t;

int main(void) {
    SystemState_t current = SYS_RUNNING;

    switch (current) {
        case SYS_IDLE:
            printf("[SYS] System offline.\\n");
            break;
        case SYS_STARTUP:
            printf("[SYS] Running power-on self-test (POST)...\\n");
            break;
        case SYS_RUNNING:
            printf("[SYS] Normal operational loop active.\\n");
            break;
        case SYS_EMERGENCY:
            printf("[SYS] EMERGENCY TRIP TRIGGERED!\\n");
            break;
        default:
            printf("[SYS] Unknown state.\\n");
            break;
    }
    return 0;
}
`
  },
  {
    id: "c-loops-series",
    title: "3. Iterative Accumulation & Series",
    description: "Bounded for loops, while iterations, and arithmetic progression math.",
    code: `#include <stdio.h>

int main(void) {
    const int terms = 6;
    int accumulator = 0;
    int step_val = 5;

    printf("Accumulation Series (+5 increments):\\n");
    for (int i = 1; i <= terms; ++i) {
        accumulator += step_val;
        printf("Step %d -> Subtotal: %d\\n", i, accumulator);
    }

    printf("Final Sum: %d\\n", accumulator);
    return 0;
}
`
  },
  {
    id: "c-pass-by-pointer",
    title: "4. Pass-by-Reference via Pointers",
    description: "Modifying caller memory frames directly using dereferenced pointers.",
    code: `#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main(void) {
    int regA = 0x12;
    int regB = 0x34;

    printf("Initial: A = 0x%02X, B = 0x%02X\\n", regA, regB);
    swap(&regA, &regB);
    printf("Swapped: A = 0x%02X, B = 0x%02X\\n", regA, regB);

    return 0;
}
`
  },
  {
    id: "c-array-pointer-arithmetic",
    title: "5. Pointer Arithmetic & Array Indexing",
    description: "Base address displacements, address offsets, and buffer iteration.",
    code: `#include <stdio.h>

int main(void) {
    int buffer[5] = {100, 200, 300, 400, 500};
    int *ptr = buffer;
    size_t length = sizeof(buffer) / sizeof(buffer[0]);

    printf("Direct memory iteration via pointer arithmetic:\\n");
    for (size_t i = 0; i < length; ++i) {
        printf("Offset [%zu] | Addr: %p | Value: %d\\n", i, (void*)(ptr + i), *(ptr + i));
    }

    return 0;
}
`
  },
  {
    id: "c-strings-null-term",
    title: "6. Null-Terminated Strings & Inspection",
    description: "String termination mechanics, manual character iteration, and length calculation.",
    code: `#include <stdio.h>

size_t get_string_length(const char *str) {
    const char *start = str;
    while (*str != '\\0') {
        str++;
    }
    return (size_t)(str - start);
}

int main(void) {
    const char banner[] = "MAE Embedded Studio";
    printf("Text: %s\\n", banner);
    printf("Computed Length: %zu chars\\n", get_string_length(banner));
    return 0;
}
`
  },
  {
    id: "c-struct-padding",
    title: "7. Struct Packing & Telemetry Framing",
    description: "Data encapsulation, struct member access, and memory layout inspection.",
    code: `#include <stdio.h>
#include <stdint.h>

typedef struct {
    uint8_t  node_id;
    uint16_t sample_rate;
    float    temperature;
} NodeTelemetry_t;

int main(void) {
    NodeTelemetry_t node = {
        .node_id = 14,
        .sample_rate = 500,
        .temperature = 27.8f
    };

    printf("Node ID: %u\\n", node.node_id);
    printf("Sampling Rate: %u Hz\\n", node.sample_rate);
    printf("Temp: %.1f C\\n", node.temperature);
    printf("Total Struct Size in RAM: %zu bytes\\n", sizeof(NodeTelemetry_t));

    return 0;
}
`
  },
  {
    id: "c-dynamic-malloc",
    title: "8. Dynamic Heap Memory (malloc / free)",
    description: "Heap allocation, memory validation checks, and clean deallocation.",
    code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int count = 4;
    int *heap_array = (int *)malloc(count * sizeof(int));

    if (heap_array == NULL) {
        printf("Memory allocation failed!\\n");
        return 1;
    }

    for (int i = 0; i < count; ++i) {
        heap_array[i] = (i + 1) * 11;
        printf("heap_array[%d] = %d\\n", i, heap_array[i]);
    }

    free(heap_array);
    heap_array = NULL;
    printf("Heap memory freed successfully.\\n");

    return 0;
}
`
  },
  {
    id: "c-function-pointers",
    title: "9. Function Pointers & Callback Tables",
    description: "Dynamic execution dispatching via array of function pointers.",
    code: `#include <stdio.h>

void cmd_start(void) { printf("-> CMD: Actuators Engaged.\\n"); }
void cmd_stop(void)  { printf("-> CMD: Motion Stopped.\\n"); }
void cmd_reset(void) { printf("-> CMD: Origin Recalibrated.\\n"); }

typedef void (*CommandHandler_t)(void);

int main(void) {
    CommandHandler_t command_table[3] = {cmd_start, cmd_stop, cmd_reset};

    printf("Executing callback sequence:\\n");
    for (int i = 0; i < 3; ++i) {
        command_table[i]();
    }
    return 0;
}
`
  },
  {
    id: "c-circular-buffer",
    title: "10. Circular Ring Buffer (FIFO)",
    description: "Fixed-size circular FIFO queue implementation for UART/telemetry streaming.",
    code: `#include <stdio.h>
#include <stdbool.h>

#define BUF_SIZE 4

typedef struct {
    int data[BUF_SIZE];
    int head;
    int tail;
    int count;
} RingBuffer_t;

bool buffer_push(RingBuffer_t *buf, int val) {
    if (buf->count >= BUF_SIZE) return false;
    buf->data[buf->head] = val;
    buf->head = (buf->head + 1) % BUF_SIZE;
    buf->count++;
    return true;
}

bool buffer_pop(RingBuffer_t *buf, int *val) {
    if (buf->count == 0) return false;
    *val = buf->data[buf->tail];
    buf->tail = (buf->tail + 1) % BUF_SIZE;
    buf->count--;
    return true;
}

int main(void) {
    RingBuffer_t rx_buffer = { .head = 0, .tail = 0, .count = 0 };

    buffer_push(&rx_buffer, 0xAA);
    buffer_push(&rx_buffer, 0xBB);
    buffer_push(&rx_buffer, 0xCC);

    int packet;
    while (buffer_pop(&rx_buffer, &packet)) {
        printf("Received byte: 0x%02X\\n", packet);
    }
    return 0;
}
`
  },
  {
    id: "c-bitwise-operations",
    title: "11. Bitwise Masking & Flag Manipulation",
    description: "Setting, clearing, and toggling specific hardware register bits.",
    code: `#include <stdio.h>
#include <stdint.h>

#define BIT_ENABLE  (1U << 0)
#define BIT_BUSY    (1U << 2)
#define BIT_INTERR  (1U << 5)

int main(void) {
    uint8_t control_reg = 0x00;

    // Set bits
    control_reg |= (BIT_ENABLE | BIT_BUSY);
    printf("After SET: 0x%02X\\n", control_reg);

    // Test bit
    if (control_reg & BIT_BUSY) {
        printf("Status: Hardware module busy.\\n");
    }

    // Clear bit
    control_reg &= ~BIT_BUSY;
    printf("After CLEAR busy: 0x%02X\\n", control_reg);

    // Toggle bit
    control_reg ^= BIT_INTERR;
    printf("After TOGGLE interrupt: 0x%02X\\n", control_reg);

    return 0;
}
`
  },
  {
    id: "c-binary-search",
    title: "12. Binary Search in C",
    description: "Standard integer division divide-and-conquer search on sorted array.",
    code: `#include <stdio.h>

int binary_search(const int arr[], int size, int target) {
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

int main(void) {
    int pins[] = {2, 4, 7, 8, 12, 13, 20};
    int size = sizeof(pins) / sizeof(pins[0]);
    int target = 8;

    int idx = binary_search(pins, size, target);
    if (idx != -1) {
        printf("Target %d located at array index: %d\\n", target, idx);
    } else {
        printf("Target %d not found!\\n", target);
    }
    return 0;
}
`
  },
  {
    id: "c-bubble-sort",
    title: "13. In-Place Bubble Sort",
    description: "Ascending sequence sorting using nested comparison loops and pointer swaps.",
    code: `#include <stdio.h>

void bubble_sort(int arr[], int n) {
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

int main(void) {
    int telemetry[] = {45, 12, 89, 34, 2, 70};
    int n = sizeof(telemetry) / sizeof(telemetry[0]);

    bubble_sort(telemetry, n);

    printf("Sorted Sequence:\\n");
    for (int i = 0; i < n; ++i) {
        printf("%d ", telemetry[i]);
    }
    printf("\\n");
    return 0;
}
`
  },
  {
    id: "c-lookup-table",
    title: "14. Lookup Table (LUT) Math Engine",
    description: "Fast mathematical function evaluation without runtime floating-point overhead.",
    code: `#include <stdio.h>
#include <stdint.h>

// Precomputed Sine LUT for [0, 90] degrees mapped to integer [0, 100]
const uint8_t SINE_LUT[7] = {0, 26, 50, 71, 87, 97, 100}; // 0, 15, 30, 45, 60, 75, 90 deg

int main(void) {
    printf("Evaluating fast Sine LUT values (0 to 90 degrees):\\n");
    for (int i = 0; i < 7; ++i) {
        printf("Angle %2d deg -> Scaled Sine: %3u / 100\\n", i * 15, SINE_LUT[i]);
    }
    return 0;
}
`
  },
  {
    id: "c-union-type-punning",
    title: "15. Unions & Byte Decomposition",
    description: "Deconstructing a 32-bit float/integer into raw byte streams for serialization.",
    code: `#include <stdio.h>
#include <stdint.h>

typedef union {
    float float_val;
    uint8_t raw_bytes[4];
} FloatConverter_t;

int main(void) {
    FloatConverter_t packet;
    packet.float_val = 13.37f;

    printf("Original Float: %f\\n", packet.float_val);
    printf("Serialized Hex Bytes: ");
    for (int i = 0; i < 4; ++i) {
        printf("[0x%02X] ", packet.raw_bytes[i]);
    }
    printf("\\n");

    return 0;
}
`
  }
];

export const C_TEMPLATE_GROUPS: AssemblerTemplateGroup[] = [
  {
    label: "Basics & Memory Pointers",
    items: [
      "1. Formatted Standard I/O & Types",
      "2. Control Flow & State Enumeration",
      "3. Iterative Accumulation & Series",
      "4. Pass-by-Reference via Pointers",
      "5. Pointer Arithmetic & Array Indexing",
      "6. Null-Terminated Strings & Inspection",
    ],
  },
  {
    label: "Memory Management & Data Structures",
    items: [
      "7. Struct Packing & Telemetry Framing",
      "8. Dynamic Heap Memory (malloc / free)",
      "9. Function Pointers & Callback Tables",
      "10. Circular Ring Buffer (FIFO)",
    ],
  },
  {
    label: "Algorithms & Low-Level C",
    items: [
      "11. Bitwise Masking & Flag Manipulation",
      "12. Binary Search in C",
      "13. In-Place Bubble Sort",
      "14. Lookup Table (LUT) Math Engine",
      "15. Unions & Byte Decomposition",
    ],
  },
];

export const C_EXAMPLE_SOURCES: Record<string, string> = Object.fromEntries(
  C_EXAMPLES.map((ex) => [ex.title, ex.code])
);

export const DEFAULT_C_TEMPLATE = "1. Formatted Standard I/O & Types";
