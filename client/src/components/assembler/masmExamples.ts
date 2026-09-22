import type { AssemblerTemplateGroup } from "@/components/assembler/AssemblerToolbar";

export interface MasmExample {
  id: string;
  title: string;
  category: string;
  description: string;
  concepts: string[];
  code: string;
}

export const MASM_EXAMPLES: MasmExample[] = [
  {
    id: "hello-world",
    title: "Hello World & DOS String Interrupt",
    category: "Basics & I/O",
    description: "Outputs a '$'-terminated string to the terminal using DOS INT 21h function 09h.",
    concepts: [".DATA", "LEA / MOV OFFSET", "INT 21h AH=09h", "INT 21h AH=4Ch"],
    code: `.model small
.stack 100h
.data
    msg db 'Welcome to MAE Academy - Code Studio!$', 0
.code
main proc
    mov ax, @data
    mov ds, ax
    
    lea dx, msg
    mov ah, 09h
    int 21h
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "math-flags",
    title: "Arithmetic Math & ALU Status Flags",
    category: "Basics & I/O",
    description: "Triggers Overflow (OF), Carry (CF), Sign (SF), and Zero (ZF) status flags in the ALU.",
    concepts: ["ADD", "SUB", "Status flags (OF, CF, SF, ZF)"],
    code: `.model small
.stack 100h
.data
.code
main proc
    mov ax, 7FFFh     ; Max positive 16-bit signed integer
    add ax, 0001h     ; Triggers Overflow (OF=1), Sign (SF=1), resets Zero (ZF=0)
    
    mov bx, 0FFFFh
    add bx, 0001h     ; Zero (ZF=1), Carry (CF=1)
    
    mov cx, 0010h
    sub cx, 0020h     ; Negative result: SF=1, CF=1 (Borrow)
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "signed-neg",
    title: "Signed Math, Two's Complement & NEG",
    category: "Basics & I/O",
    description: "Computes two's complement negation and sign-extends AL into AX with CBW.",
    concepts: ["NEG", "Signed byte math", "CBW sign-extension"],
    code: `.model small
.stack 100h
.data
    val1 db 15
    val2 db -25
.code
main proc
    mov ax, @data
    mov ds, ax
    
    mov al, val1
    neg al            ; AL = -15 (F1h)
    
    mov bl, val2      ; BL = E7h
    add al, bl        ; Result in AL
    
    cbw               ; Sign-extend AL into AX
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "xchg-swap",
    title: "Register Exchange & Data Swapping (XCHG)",
    category: "Basics & I/O",
    description: "Exchanges word registers and swaps high/low bytes of AX using XCHG.",
    concepts: ["XCHG between registers", "High/low byte swapping (AH, AL)", "Memory-register sync"],
    code: `.model small
.stack 100h
.data
    num1 dw 1234h
    num2 dw 5678h
.code
main proc
    mov ax, @data
    mov ds, ax
    
    mov ax, num1      ; AX = 1234h
    mov bx, num2      ; BX = 5678h
    
    xchg ax, bx       ; AX = 5678h, BX = 1234h
    xchg ah, al       ; Swap high and low bytes of AX (7856h)
    
    mov num1, ax
    mov num2, bx
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bitwise-logic",
    title: "Bitwise Logic, Masks & Parity (AND, OR, XOR, NOT, TEST)",
    category: "Logic & Shift",
    description: "Performs bit inversion, masking, non-destructive bit testing, and fast zeroing with XOR.",
    concepts: ["NOT", "AND byte mask", "OR bit setting", "TEST non-destructive", "XOR zeroing"],
    code: `.model small
.stack 100h
.data
.code
main proc
    mov ax, 0AA55h    ; 10101010 01010101
    not ax            ; Invert bits: 01010101 10101010 (55AAh)
    
    and ax, 00FFh     ; Mask upper byte: AX = 00AAh
    or  ax, 0F000h    ; Set highest nibble: AX = F0AAh
    
    test ax, 0001h    ; Test lowest bit without modifying AX (ZF set if 0)
    
    xor bx, bx        ; Fastest way to zero a register: BX = 0, ZF = 1
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bit-shift",
    title: "Bit Shifting & Multiplication/Division (SHL, SHR, SAR)",
    category: "Logic & Shift",
    description: "Fast power-of-2 arithmetic via logical shifts and sign-preserving arithmetic right shift (SAR).",
    concepts: ["SHL power-of-2 multiply", "SHR division with CL", "SAR arithmetic sign-preserving shift"],
    code: `.model small
.stack 100h
.data
.code
main proc
    mov ax, 5         ; AX = 5
    shl ax, 1         ; Multiply by 2: AX = 10
    shl ax, 2         ; Multiply by 4: AX = 40
    
    mov bx, 64
    mov cl, 3
    shr bx, cl        ; Divide by 2^3 (8): BX = 8
    
    mov dx, -16       ; Signed negative integer (FFF0h)
    sar dx, 2         ; Arithmetic shift right: preserves sign, DX = -4 (FFFCh)
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bit-rotate",
    title: "Bit Rotation & Cryptographic Scrambling (ROL, ROR, RCL, RCR)",
    category: "Logic & Shift",
    description: "Demonstrates circular bit rotation and 9/17-bit rotation through the Carry Flag (CF).",
    concepts: ["ROL circular left", "ROR circular right", "STC carry set", "RCL rotate through carry"],
    code: `.model small
.stack 100h
.data
.code
main proc
    mov ax, 8001h     ; Binary: 1000 0000 0000 0001
    rol ax, 1         ; Rotate left: AX = 0000 0000 0000 0011 (CF=1)
    
    ror ax, 2         ; Rotate right by 2: AX = C000h (1100 0000 0000 0000)
    
    stc               ; Set Carry Flag explicitly (CF = 1)
    mov bx, 0AAAAh
    rcl bx, 1         ; Rotate left incorporating Carry bit
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "loop-counter",
    title: "Loop Counter & Conditional Branching (LOOP, CMP, JNZ, JGE)",
    category: "Control Flow",
    description: "Calculates the summation from 1 to 10 (Sigma 1..10 = 55) using CX hardware loop decrements.",
    concepts: ["CX hardware loop counter", "LOOP instruction", "Backward branch", "Accumulator summation"],
    code: `.model small
.stack 100h
.data
    sum dw 0
.code
main proc
    mov ax, @data
    mov ds, ax
    
    mov cx, 10        ; Calculate sum from 1 to 10
    xor ax, ax
    
calc_loop:
    add ax, cx        ; Add counter
    loop calc_loop    ; Decrements CX, jumps if CX != 0
    
    mov sum, ax       ; Sum = 55 (0037h)
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "stack-push-pop",
    title: "Stack Operations & Word Reversal (PUSH, POP)",
    category: "Memory & Stack",
    description: "LIFO (Last-In-First-Out) stack operations and register order reversal via PUSH and POP.",
    concepts: ["PUSH onto stack", "POP off stack", "Stack pointer SP updates", "LIFO reversal"],
    code: `.model small
.stack 100h
.data
.code
main proc
    mov ax, 1111h
    mov bx, 2222h
    mov cx, 3333h
    
    ; Push in order: AX -> BX -> CX
    push ax
    push bx
    push cx
    
    ; Pop in reverse order to swap registers
    pop ax            ; AX = 3333h
    pop bx            ; BX = 2222h
    pop cx            ; CX = 1111h
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "memory-addressing",
    title: "Memory Addressing Modes & Array Traversal",
    category: "Memory & Stack",
    description: "Traverses an array using base-index addressing [BX + SI] and computes the total sum.",
    concepts: ["Base-Index addressing [BX+SI]", "OFFSET directive", "INC pointer", "LOOP traversal"],
    code: `.model small
.stack 100h
.data
    array db 10h, 20h, 30h, 40h, 50h
    total db 0
.code
main proc
    mov ax, @data
    mov ds, ax
    
    xor ax, ax
    mov bx, offset array  ; Base address
    mov si, 0             ; Index
    mov cx, 5             ; Array length
    
sum_array:
    add al, [bx + si]     ; Base-Index addressing
    inc si
    loop sum_array
    
    mov total, al         ; Total = F0h
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "string-ops",
    title: "String Operations (MOVSB, LODSB, STOSB with REP)",
    category: "Memory & Stack",
    description: "Copies an array using REP MOVSB from DS:SI to ES:DI with the Direction Flag (CLD).",
    concepts: ["CLD forward direction", "REP prefix", "MOVSB block transfer", "ES:DI & DS:SI pointers"],
    code: `.model small
.stack 100h
.data
    src db 'MAE_STUDIO'
    len equ $ - src
    dst db len dup(?)
.code
main proc
    mov ax, @data
    mov ds, ax
    mov es, ax            ; ES must equal DS for string copy
    
    cld                   ; Clear direction flag (forward processing)
    lea si, src           ; DS:SI source
    lea di, dst           ; ES:DI destination
    mov cx, len           ; Byte count
    
    rep movsb             ; Copy string automatically
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bios-video-clear",
    title: "BIOS Video Screen Mode & Clear Screen (INT 10h)",
    category: "BIOS & Screen",
    description: "Invokes BIOS INT 10h AH=06h to clear the video screen and AH=02h to place the cursor.",
    concepts: ["INT 10h AH=06h (Scroll/Clear Screen)", "INT 10h AH=02h (Set Cursor)", "DOS print string"],
    code: `.model small
.stack 100h
.data
    prompt db 'Screen Cleared! Cursor at (12, 30)$'
.code
main proc
    mov ax, @data
    mov ds, ax
    
    ; Clear Screen: Scroll window up with 0 lines
    mov ah, 06h
    mov al, 00h       ; 0 lines = blank window
    mov bh, 07h       ; Normal attribute (White on Black)
    mov cx, 0000h     ; Top-left corner (0,0)
    mov dx, 184Fh     ; Bottom-right corner (24,79)
    int 10h
    
    ; Set Cursor Position (Row 12, Column 30)
    mov ah, 02h
    mov bh, 00h       ; Page 0
    mov dh, 12        ; Row
    mov dl, 30        ; Column
    int 10h
    
    ; Print message
    lea dx, prompt
    mov ah, 09h
    int 21h
    
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bios-teletype",
    title: "BIOS Teletype Character Printing (INT 10h AH=0Eh)",
    category: "BIOS & Screen",
    description: "Renders characters one by one via BIOS teletype mode (INT 10h AH=0Eh) with auto-advancing cursor.",
    concepts: ["INT 10h AH=0Eh (Teletype Output)", "Character stream scanning", "Color attribute in BL"],
    code: `.model small
.stack 100h
.data
    text db 'Assembly Interactive Output', 0Dh, 0Ah, '$'
.code
main proc
    mov ax, @data
    mov ds, ax
    
    lea si, text
    
print_char:
    mov al, [si]
    cmp al, '$'
    je done
    
    mov ah, 0Eh       ; Teletype output
    mov bh, 00h       ; Page 0
    mov bl, 0Ah       ; Light Green text color
    int 10h
    
    inc si
    jmp print_char
    
done:
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "linear-search",
    title: "Linear Search Algorithm",
    category: "Algorithms",
    description: "Scans a byte array for a target value and prints the index where it was found.",
    concepts: ["CMP comparison", "JE conditional jump", "Loop counter", "INT 21h AH=02h output"],
    code: `.model small
.stack 100h
.data
    arr db 12h, 45h, 67h, 89h, 34h
    len equ $ - arr
    target db 89h
    msg_found db 'Item found at index: $'
    msg_not   db 'Item not found!$'
.code
main proc
    mov ax, @data
    mov ds, ax

    lea si, arr
    mov cx, len
    mov bl, 0           ; Index counter

search_loop:
    mov al, [si]
    cmp al, target
    je found
    inc si
    inc bl
    loop search_loop

    lea dx, msg_not
    mov ah, 09h
    int 21h
    jmp finish

found:
    lea dx, msg_found
    mov ah, 09h
    int 21h

    ; Print index in BL as ASCII digit
    mov dl, bl
    add dl, '0'
    mov ah, 02h
    int 21h

finish:
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "bubble-sort",
    title: "Bubble Sort Algorithm (Ascending Order)",
    category: "Algorithms",
    description: "Sorts a byte array in ascending order with nested loops, then prints the sorted digits.",
    concepts: ["Nested loops", "JBE conditional branch", "PUSH/POP loop counter", "INT 21h AH=02h output"],
    code: `.model small
.stack 100h
.data
    array db 5, 2, 9, 1, 4
    n equ 5
    header db 'Sorted Array: $'
.code
main proc
    mov ax, @data
    mov ds, ax

    ; Bubble Sort Algorithm
    mov cx, n - 1
outer:
    push cx
    lea si, array

inner:
    mov al, [si]
    mov bl, [si + 1]
    cmp al, bl
    jbe no_swap
    mov [si], bl
    mov [si + 1], al

no_swap:
    inc si
    loop inner

    pop cx
    loop outer

    ; Display header
    lea dx, header
    mov ah, 09h
    int 21h

    ; Print sorted array elements separated by spaces
    lea si, array
    mov cx, n
print_arr:
    mov dl, [si]
    add dl, '0'         ; Convert single digit to ASCII
    mov ah, 02h
    int 21h

    mov dl, ' '
    mov ah, 02h
    int 21h

    inc si
    loop print_arr

    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "color-text-attrs",
    title: "Colorful Text Attributes & Page Scroll (ORG 100h)",
    category: "Tiny Flat (ORG 100h Model)",
    description: "Demonstrates video mode 03h, cursor movement (INT 10h AH=02h), and colored character writing (INT 10h AH=09h) with foreground/background attributes.",
    concepts: ["ORG 100h", "INT 10h AH=00h (Set mode)", "INT 10h AH=02h (Set cursor)", "INT 10h AH=09h (Write char with attribute)"],
    code: `org 100h

start:
    ; Set video mode to 80x25 16-color text (Mode 03h)
    mov ah, 00h
    mov al, 03h
    int 10h

    ; Position Cursor at Row 5, Column 10
    mov ah, 02h
    mov bh, 00h       ; Page 0
    mov dh, 5         ; Row
    mov dl, 10        ; Column
    int 10h

    ; Write character 'M' with Light Magenta on Dark Blue (Attribute: 1Dh)
    ; Background = 1 (Blue), Foreground = D (Light Magenta)
    mov ah, 09h
    mov al, 'M'
    mov bh, 00h
    mov bl, 1Dh       ; Color Attribute
    mov cx, 1         ; Repeat count
    int 10h

    ; Advance Cursor to (Row 5, Column 11)
    mov ah, 02h
    mov dh, 5
    mov dl, 11
    int 10h

    ; Write 'A' with Light Green on Red (Attribute: 4Ah)
    mov ah, 09h
    mov al, 'A'
    mov bl, 4Ah
    mov cx, 1
    int 10h

    ; Advance Cursor to (Row 5, Column 12)
    mov ah, 02h
    mov dh, 5
    mov dl, 12
    int 10h

    ; Write 'E' with Yellow on Cyan (Attribute: 3Eh)
    mov ah, 09h
    mov al, 'E'
    mov bl, 3Eh
    mov cx, 1
    int 10h

    ; Exit to DOS
    mov ax, 4c00h
    int 21h`,
  },
  {
    id: "fullscreen-dialog",
    title: "Full-Screen Custom Background Color & Window Box (ORG 100h)",
    category: "Tiny Flat (ORG 100h Model)",
    description: "Draws full-screen and inner rectangular dialog windows with custom background colors and attributes using INT 10h AH=06h.",
    concepts: ["ORG 100h", "INT 10h AH=06h (Scroll/Clear Window)", "Window boundaries (CX/DX)", "Color Attributes (1Fh, 70h)"],
    code: `org 100h

start:
    ; 1. Clear full screen with Dark Slate background (Attr 1Fh: Bright White on Blue)
    mov ah, 06h       ; Scroll active page up
    mov al, 00h       ; 0 = Blank full window
    mov bh, 1Fh       ; Attribute: White on Blue
    mov cx, 0000h     ; Upper-left: (Row 0, Col 0)
    mov dx, 184Fh     ; Lower-right: (Row 24, Col 79)
    int 10h

    ; 2. Draw an inner dialog box window (Rows 8-16, Cols 20-60) with Gray on Black (Attr 70h: Reverse Video)
    mov ah, 06h
    mov al, 00h
    mov bh, 70h       ; Black text on Gray background
    mov ch, 8         ; Top row
    mov cl, 20        ; Left col
    mov dh, 16        ; Bottom row
    mov dl, 60        ; Right col
    int 10h

    ; 3. Move cursor to center of dialog box
    mov ah, 02h
    mov bh, 00h
    mov dh, 12        ; Row 12
    mov dl, 27        ; Column 27
    int 10h

    ; 4. Print String inside the box
    lea dx, dialog_text
    mov ah, 09h
    int 21h

    ; Exit
    mov ax, 4c00h
    int 21h

dialog_text db 'SYSTEM READY: MAE ACADEMY$'`,
  },
  {
    id: "realtime-keyboard-echo",
    title: "Real-Time Keyboard Echo with Dynamic Color Shift (ORG 100h)",
    category: "Tiny Flat (ORG 100h Model)",
    description: "Direct non-echoing keyboard polling via INT 21h AH=07h with dynamic teletype color rotation via INT 10h AH=0Eh.",
    concepts: ["ORG 100h", "INT 21h AH=07h (Direct key input)", "INT 10h AH=0Eh (Teletype print)", "Dynamic color shift"],
    code: `org 100h

start:
    ; Print instruction
    lea dx, info_msg
    mov ah, 09h
    int 21h

key_loop:
    ; Wait for keypress without local echo
    mov ah, 07h
    int 21h

    ; If user presses 'q' or 'Q', exit
    cmp al, 'q'
    je terminate
    cmp al, 'Q'
    je terminate

    ; Cycle through color attributes in BL (1 to 15)
    inc bl
    and bl, 0Fh
    jnz color_ok
    inc bl            ; Avoid color 0 (black on black)

color_ok:
    ; Print character via BIOS Teletype with color
    mov ah, 0Eh
    int 10h
    jmp key_loop

terminate:
    mov ax, 4c00h
    int 21h

info_msg db 'Type any keys to see color echo (Press Q to quit): ', 0Dh, 0Ah, '$'`,
  },
  {
    id: "cursor-avatar-nav",
    title: "Interactive Cursor Navigation via Arrow Keys / WASD",
    category: "Segmented (.EXE Model)",
    description: "Real-time coordinate tracking, screen boundary checking, and dynamic avatar rendering on the text console using WASD keys.",
    concepts: ["Segmented Model", "Screen boundary checking", "INT 10h AH=02h (Set cursor)", "INT 10h AH=09h (Draw avatar)"],
    code: `.model small
.stack 100h
.data
    prompt db 'Use W(Up), S(Down), A(Left), D(Right). Q to quit.$', 0
    cur_row db 10
    cur_col db 40
.code
main proc
    mov ax, @data
    mov ds, ax

    ; Clear screen
    mov ah, 06h
    mov al, 00h
    mov bh, 07h
    mov cx, 0000h
    mov dx, 184Fh
    int 10h

    ; Initial print
    lea dx, prompt
    mov ah, 09h
    int 21h

redraw:
    ; Move cursor to current coordinates
    mov ah, 02h
    mov bh, 00h
    mov dh, cur_row
    mov dl, cur_col
    int 10h

    ; Draw avatar '*' in Cyan
    mov ah, 09h
    mov al, '*'
    mov bl, 0Bh       ; Light Cyan
    mov cx, 1
    int 10h

input_wait:
    mov ah, 07h       ; Read key without echo
    int 21h

    ; Erase previous avatar (print blank space)
    push ax
    mov ah, 09h
    mov al, ' '
    mov bl, 07h
    mov cx, 1
    int 10h
    pop ax

    cmp al, 'w'
    je go_up
    cmp al, 's'
    je go_down
    cmp al, 'a'
    je go_left
    cmp al, 'd'
    je go_right
    cmp al, 'q'
    je exit_nav
    jmp redraw

go_up:
    cmp cur_row, 1
    jle redraw
    dec cur_row
    jmp redraw

go_down:
    cmp cur_row, 23
    jge redraw
    inc cur_row
    jmp redraw

go_left:
    cmp cur_col, 0
    jle redraw
    dec cur_col
    jmp redraw

go_right:
    cmp cur_col, 79
    jge redraw
    inc cur_col
    jmp redraw

exit_nav:
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "animated-progress-bar",
    title: "Animated Progress Bar on Terminal Canvas",
    category: "Segmented (.EXE Model)",
    description: "Draws an animated glowing progress bar across the console using solid block glyphs (ASCII 219 / DBh) and cursor repositioning.",
    concepts: ["Solid block glyph 0DBh", "INT 10h AH=03h (Get cursor)", "INT 10h AH=02h (Set cursor)", "Delay loop"],
    code: `.model small
.stack 100h
.data
    loading_lbl db 'INITIALIZING SYSTEM HARDWARE...', 0Dh, 0Ah, '$'
.code
main proc
    mov ax, @data
    mov ds, ax

    ; Print label
    lea dx, loading_lbl
    mov ah, 09h
    int 21h

    ; Position cursor for progress bar
    mov ah, 02h
    mov bh, 00h
    mov dh, 3
    mov dl, 10
    int 10h

    mov cx, 25        ; Progress bar length: 25 blocks

bar_loop:
    push cx
    
    ; Print solid block character (ASCII 219 = 0DBh) with Bright Green (0Ah)
    mov ah, 09h
    mov al, 0DBh      ; Full block glyph
    mov bh, 00h
    mov bl, 0Ah       ; Light Green
    mov cx, 1
    int 10h

    ; Advance cursor 1 step to right
    mov ah, 03h       ; Get current position
    int 10h
    inc dl            ; Next column
    mov ah, 02h       ; Set new position
    int 10h

    ; Short delay loop
    mov dx, 10h
delay_loop:
    dec dx
    jnz delay_loop

    pop cx
    loop bar_loop

    ; Exit
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
  {
    id: "vga-pixel-plotter",
    title: "CGA/VGA 320x200 256-Color Graphics Mode Plotter (Mode 13h)",
    category: "Segmented (.EXE Model)",
    description: "Switches the display to VGA Mode 13h (320x200 256 colors), writes graphic pixels via INT 10h AH=0Ch, waits for keypress (INT 16h), and restores text mode.",
    concepts: ["Mode 13h (320x200)", "INT 10h AH=0Ch (Plot pixel)", "INT 16h AH=00h (Wait for key)", "Mode 03h text restoration"],
    code: `.model small
.stack 100h
.data
.code
main proc
    ; Switch to Video Mode 13h (320x200 256-color Graphics)
    mov ah, 00h
    mov al, 13h
    int 10h

    ; Draw a horizontal line of pixels at Y=100 from X=60 to X=260
    mov dx, 100       ; Y coordinate
    mov cx, 60        ; X starting coordinate

draw_line:
    mov ah, 0Ch       ; Write graphics pixel
    mov al, 0Eh       ; Color: Yellow
    mov bh, 00h       ; Page 0
    int 10h

    inc cx
    cmp cx, 260
    jne draw_line

    ; Wait for keypress
    mov ah, 00h
    int 16h

    ; Restore back to standard 80x25 text mode (Mode 03h)
    mov ah, 00h
    mov al, 03h
    int 10h

    ; Exit
    mov ax, 4c00h
    int 21h
main endp
end main`,
  },
];

/** Structured template groups for the CodeStudio top ribbon menu */
export const MASM_TEMPLATE_GROUPS: AssemblerTemplateGroup[] = [
  {
    label: "Segmented (.EXE Model) — Basics & I/O",
    items: [
      "Hello World & DOS String Interrupt",
      "Arithmetic Math & ALU Status Flags",
      "Signed Math, Two's Complement & NEG",
      "Register Exchange & Data Swapping (XCHG)",
    ],
  },
  {
    label: "Segmented (.EXE Model) — Logic & Shift",
    items: [
      "Bitwise Logic, Masks & Parity (AND, OR, XOR, NOT, TEST)",
      "Bit Shifting & Multiplication/Division (SHL, SHR, SAR)",
      "Bit Rotation & Cryptographic Scrambling (ROL, ROR, RCL, RCR)",
    ],
  },
  {
    label: "Segmented (.EXE Model) — Control & Memory",
    items: [
      "Loop Counter & Conditional Branching (LOOP, CMP, JNZ, JGE)",
      "Stack Operations & Word Reversal (PUSH, POP)",
      "Memory Addressing Modes & Array Traversal",
      "String Operations (MOVSB, LODSB, STOSB with REP)",
    ],
  },
  {
    label: "Segmented (.EXE Model) — BIOS, Graphics & Algorithms",
    items: [
      "BIOS Video Screen Mode & Clear Screen (INT 10h)",
      "BIOS Teletype Character Printing (INT 10h AH=0Eh)",
      "Interactive Cursor Navigation via Arrow Keys / WASD",
      "Animated Progress Bar on Terminal Canvas",
      "CGA/VGA 320x200 256-Color Graphics Mode Plotter (Mode 13h)",
      "Linear Search Algorithm",
      "Bubble Sort Algorithm (Ascending Order)",
    ],
  },
  {
    label: "Tiny Flat (ORG 100h Model) — BIOS & Screen Control",
    items: [
      "Colorful Text Attributes & Page Scroll (ORG 100h)",
      "Full-Screen Custom Background Color & Window Box (ORG 100h)",
      "Real-Time Keyboard Echo with Dynamic Color Shift (ORG 100h)",
    ],
  },
];

/** Map from example title to assembly source string */
export const MASM_EXAMPLE_SOURCES: Record<string, string> = Object.fromEntries(
  MASM_EXAMPLES.map((ex) => [ex.title, ex.code])
);

export const DEFAULT_MASM_TEMPLATE = "Hello World & DOS String Interrupt";
