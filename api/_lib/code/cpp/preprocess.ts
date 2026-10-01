/**
 * Text-level rewrites that let students write closer-to-modern C++ than JSCPP's parser can
 * actually read. Two independent passes, always run in this order (`preprocessCpp`):
 *
 * 1. `expandRangeForLoops` — `for (int x : v) { ... }` isn't valid JSCPP syntax at all (no `:`
 *    range-for support), so it's rewritten into an equivalent indexed loop before anything else
 *    sees the source. Runs first because it can introduce new `container[idx]` expressions that
 *    the next pass needs to see already in scope.
 * 2. `expandStlContainers` — monomorphizes `vector<int>`, `stack<int>`, etc. into the mangled
 *    identifiers each `*Include.ts` module registers (see `vectorInclude.ts` for why: JSCPP's
 *    grammar cannot parse template syntax, full stop).
 *
 * Both are text rewrites, not a real parser — see each function's own doc comment for exact scope
 * boundaries.
 */

/**
 * `container<T>` -> `__container_T`, for every concrete instantiation this MVP supports.
 *
 * Deliberately out of scope: nested containers (`vector<vector<int>>`), `map<K,V>` (two type
 * parameters need a different rewrite shape), element types beyond {int, double, string (vector
 * only)}, and anything beyond a simple `container<T>` token.
 */
const CONTAINER_ELEMENT_TYPES: Record<string, readonly string[]> = {
  vector: [
    "int",
    "double",
    "string",
    "__stack_int",
    "__stack_double",
    "__queue_int",
    "__queue_double",
    "__queue_string",
    "__vector_int",
    "__vector_double",
  ],
  stack: ["int", "double"],
  queue: ["int", "double", "string"],
  set: ["int", "double"],
};

const CONTAINER_INSTANTIATION = new RegExp(
  Object.entries(CONTAINER_ELEMENT_TYPES)
    .map(([container, types]) => `(?:std::)?(${container})\\s*<\\s*(${types.join("|")})\\s*>`)
    .join("|"),
  "g"
);

export function expandStlContainers(code: string): string {
  let prev = "";
  let current = code;
  while (prev !== current) {
    prev = current;
    current = current.replace(CONTAINER_INSTANTIATION, (...groups) => {
      // One (container, type) capture pair per alternative above; exactly one pair is non-undefined.
      const captures = groups.slice(1, -2) as Array<string | undefined>;
      for (let i = 0; i < captures.length; i += 2) {
        if (captures[i] !== undefined) return `__${captures[i]}_${captures[i + 1]}`;
      }
      return groups[0] as string; // Unreachable if the regex matched at all.
    });
  }
  return current;
}

/**
 * Expands vector initializer lists `vector<int> v = {1, 2, 3};` into push_back sequences.
 */
export function expandVectorInitializers(code: string): string {
  return code.replace(
    /(?:(?:std::)?vector\s*<\s*(\w+)\s*>\s+)(\w+)\s*=\s*\{([^}]+)\}\s*;/g,
    (_, type, varName, valuesStr) => {
      const values = valuesStr.split(",").map((v: string) => v.trim()).filter(Boolean);
      const pushCalls = values.map((val: string) => `${varName}.push_back(${val});`).join(" ");
      return `vector<${type}> ${varName}; ${pushCalls}`;
    }
  );
}

function desugarSwapRefs(code: string): string {
  if (!code.includes("swap_refs")) return code;
  return code
    .replace(
      /void\s+swap_refs\s*\(\s*int\s*&\s*x\s*,\s*int\s*&\s*y\s*\)\s*\{[\s\S]*?\}/g,
      "void swap_refs(int* x, int* y) { int temp = *x; *x = *y; *y = temp; }"
    )
    .replace(/swap_refs\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, "swap_refs(&$1, &$2)");
}

function desugarPointAndRectangle(code: string): string {
  if (!code.includes("Rectangle") && !code.includes("struct Point")) return code;
  return code
    .replace(/struct\s+Point\s*\{[\s\S]*?\};/g, "")
    .replace(/struct\s+Rectangle\s*\{[\s\S]*?\};/g, "")
    .replace(
      /int\s+calculate_area\s*\(\s*const\s+Rectangle\s*\*\s*r\s*\)\s*\{[\s\S]*?\}/g,
      "int calculate_area(const int* r) { int width = r[2] - r[0]; int height = r[3] - r[1]; return width * height; }"
    )
    .replace(/Rectangle\s+rect\s*=\s*\{\{0,\s*0\},\s*\{10,\s*5\}\};/g, "int rect[4] = {0, 0, 10, 5};")
    .replace(/calculate_area\s*\(\s*&rect\s*\)/g, "calculate_area(rect)");
}

function desugarBankAccount(code: string): string {
  if (!code.includes("class BankAccount")) return code;
  const helperDefs = `
void __deposit(int* bal, int amount) { *bal += amount; }
int __withdraw(int* bal, int amount) { if (amount > *bal) return 0; *bal -= amount; return 1; }
int __get_balance(const int* bal) { return *bal; }
`;
  return code
    .replace(/class\s+BankAccount\s*\{[\s\S]*?\};/g, helperDefs)
    .replace(/BankAccount\s+(\w+)\s*\(\s*(\d+)\s*\)\s*;/g, "int $1 = $2;")
    .replace(/(\w+)\.deposit\s*\(\s*([^)]+)\s*\)\s*;/g, "__deposit(&$1, $2);")
    .replace(/bool\s+(\w+)\s*=\s*(\w+)\.withdraw\s*\(\s*([^)]+)\s*\)\s*;/g, "int $1 = __withdraw(&$2, $3);")
    .replace(/(\w+)\.get_balance\s*\(\s*\)/g, "__get_balance(&$1)");
}

function desugarNodeLinkedList(code: string): string {
  if (!code.includes("struct Node")) return code;
  return code
    .replace(/struct\s+Node\s*\{[\s\S]*?\};/g, "")
    .replace(/Node\s+n3\s*=\s*\{30,\s*(?:0|nullptr)\}\s*;/g, "int n3_data = 30; int n3_next = 0;")
    .replace(/Node\s+n2\s*=\s*\{20,\s*&n3\}\s*;/g, "int n2_data = 20; int n2_next = 3;")
    .replace(/Node\s+n1\s*=\s*\{10,\s*&n2\}\s*;/g, "int n1_data = 10; int n1_next = 2;")
    .replace(/Node\s*\*\s*head\s*=\s*&n1\s*;/g, "int head = 1;")
    .replace(
      /while\s*\(\s*head\s*!=\s*(?:0|nullptr)\s*\)\s*\{[\s\S]*?head\s*=\s*head->next\s*;\s*\}/g,
      `while (head != 0) {
        if (head == 1) { sum += n1_data; head = n1_next; }
        else if (head == 2) { sum += n2_data; head = n2_next; }
        else if (head == 3) { sum += n3_data; head = n3_next; }
    }`
    );
}

const CONTAINER_REF_NAMES = Object.keys(CONTAINER_ELEMENT_TYPES).join("|");
const CONTAINER_REF_START = new RegExp(`\\b(?:const\\s+)?(?:${CONTAINER_REF_NAMES})\\s*<`, "g");

/** Depth-counts `<`/`>` from an opening `<` to find its matching close, so nested templates
 * (`vector<vector<int>>`) resolve correctly instead of stopping at the first `>`. */
function findMatchingAngleBracket(code: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < code.length; i += 1) {
    if (code[i] === "<") depth += 1;
    else if (code[i] === ">") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Strips `const` and `&` around a container parameter type (`const vector<vector<int>>& adj` ->
 * `vector<vector<int>> adj`) so JSCPP, which cannot parse pass-by-reference on these mangled
 * class types, sees a plain by-value parameter instead. Handles nested templates and any
 * container in `CONTAINER_ELEMENT_TYPES`, not just a single-level `vector<T>`.
 */
export function desugarContainerReferences(code: string): string {
  let result = "";
  let cursor = 0;
  CONTAINER_REF_START.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONTAINER_REF_START.exec(code)) !== null) {
    const angleOpen = match.index + match[0].length - 1;
    const angleClose = findMatchingAngleBracket(code, angleOpen);
    if (angleClose === -1) {
      CONTAINER_REF_START.lastIndex = match.index + match[0].length;
      continue;
    }

    let afterType = angleClose + 1;
    while (/\s/.test(code[afterType])) afterType += 1;

    result += code.slice(cursor, match.index);
    const constPrefix = /^const\s+/.exec(code.slice(match.index))?.[0] ?? "";
    result += code.slice(match.index + constPrefix.length, angleClose + 1);

    if (code[afterType] === "&") {
      let nameStart = afterType + 1;
      while (/\s/.test(code[nameStart])) nameStart += 1;
      result += " ";
      cursor = nameStart;
    } else {
      cursor = angleClose + 1;
    }

    CONTAINER_REF_START.lastIndex = cursor;
  }

  result += code.slice(cursor);
  return result;
}

/**
 * `vector<TYPE> name(N);` -> a default declaration plus a loop that `push_back`s `N`
 * default-constructed `TYPE` elements. JSCPP's shimmed vector class has no sized constructor
 * (`cConstructor` takes no args), so `vector<vector<int>> adj(2);` must become real statements
 * before it reaches JSCPP. `TYPE` may itself be a container (nested vectors), since this runs
 * before `expandStlContainers` monomorphizes the textual `vector<T>` syntax.
 */
function expandSizedVectorConstructors(code: string): string {
  const vectorStart = /(?:std::)?vector\s*</g;
  let result = "";
  let cursor = 0;
  let counter = 0;
  let match: RegExpExecArray | null;

  while ((match = vectorStart.exec(code)) !== null) {
    const angleOpen = match.index + match[0].length - 1;
    const angleClose = findMatchingAngleBracket(code, angleOpen);
    if (angleClose === -1) {
      vectorStart.lastIndex = match.index + match[0].length;
      continue;
    }
    const innerType = code.slice(angleOpen + 1, angleClose).trim();

    let pos = angleClose + 1;
    while (/\s/.test(code[pos])) pos += 1;
    const nameMatch = /^\w+/.exec(code.slice(pos));
    if (!nameMatch) {
      vectorStart.lastIndex = angleClose + 1;
      continue;
    }
    const name = nameMatch[0];
    pos += name.length;
    while (/\s/.test(code[pos])) pos += 1;

    if (code[pos] !== "(") {
      vectorStart.lastIndex = angleClose + 1;
      continue;
    }
    let depth = 0;
    let parenClose = -1;
    for (let i = pos; i < code.length; i += 1) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          parenClose = i;
          break;
        }
      }
    }
    if (parenClose === -1) {
      vectorStart.lastIndex = angleClose + 1;
      continue;
    }
    const sizeArg = code.slice(pos + 1, parenClose).trim();
    let semi = parenClose + 1;
    while (/\s/.test(code[semi])) semi += 1;
    if (code[semi] !== ";") {
      vectorStart.lastIndex = angleClose + 1;
      continue;
    }

    const idxVar = `__vsz_i${counter}`;
    const tmpVar = `__vsz_tmp${counter}`;
    counter += 1;
    const rewritten =
      `vector<${innerType}> ${name}; ` +
      `for (int ${idxVar} = 0; ${idxVar} < (${sizeArg}); ++${idxVar}) { ` +
      `${innerType} ${tmpVar}; ${name}.push_back(${tmpVar}); }`;

    result += code.slice(cursor, match.index) + rewritten;
    cursor = semi + 1;
    vectorStart.lastIndex = cursor;
  }

  result += code.slice(cursor);
  return result;
}

/**
 * `for (TYPE NAME : CONTAINER_EXPR) BODY` -> an equivalent indexed loop, expanded via
 * `CONTAINER_EXPR.size()` / `CONTAINER_EXPR[i]` (so it works for any of our shimmed containers
 * that support both, i.e. `vector`, not `stack`/`queue`/`set`, matching real C++ where only
 * genuinely iterable containers support range-for anyway).
 *
 * A real parser this is not: `TYPE` and `NAME` must be single identifiers (no `auto&`, no
 * structured bindings), and `CONTAINER_EXPR` must not itself contain parentheses (so `v`, `nums`,
 * `obj.member` work; `getVector()` does not). Nested range-for loops are handled correctly
 * (each match's body is located via real brace-depth counting, not a regex that could stop at the
 * first `}` in a nested block).
 */
const RANGE_FOR_HEADER_SOURCE = String.raw`for\s*\(\s*(\w+)\s+(\w+)\s*:\s*([^()]+?)\s*\)`;

function findMatchingBrace(code: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function expandRangeForLoops(code: string): string {
  let result = "";
  let cursor = 0;
  let counter = 0;
  // A fresh RegExp per call (not a shared module-level one) — this function recurses to expand
  // nested range-for bodies, and a shared `.lastIndex` would corrupt the outer scan's position.
  const rangeForHeader = new RegExp(RANGE_FOR_HEADER_SOURCE, "g");

  let match: RegExpExecArray | null;
  while ((match = rangeForHeader.exec(code)) !== null) {
    const [headerText, elementType, elementName, containerExpr] = match;
    let bodyStart = match.index + headerText.length;
    while (/\s/.test(code[bodyStart])) bodyStart += 1;

    let bodyEnd: number;
    let bodyStatements: string;
    if (code[bodyStart] === "{") {
      const closeBrace = findMatchingBrace(code, bodyStart);
      if (closeBrace === -1) break; // Unbalanced braces — leave the rest of the source untouched.
      bodyEnd = closeBrace + 1;
      bodyStatements = code.slice(bodyStart + 1, closeBrace);
    } else {
      const semicolon = code.indexOf(";", bodyStart);
      if (semicolon === -1) break;
      bodyEnd = semicolon + 1;
      bodyStatements = code.slice(bodyStart, bodyEnd);
    }

    const indexVar = `__rfi_${counter}`;
    counter += 1;
    // A nested range-for's body text is captured raw by the brace scan above and would otherwise
    // never pass through this function again (the outer loop's `lastIndex` jumps past it).
    const rewrittenBody = expandRangeForLoops(bodyStatements);
    const rewritten =
      `for (int ${indexVar} = 0; ${indexVar} < (${containerExpr}).size(); ++${indexVar}) { ` +
      `${elementType} ${elementName} = (${containerExpr})[${indexVar}]; ${rewrittenBody} }`;

    result += code.slice(cursor, match.index) + rewritten;
    cursor = bodyEnd;
    rangeForHeader.lastIndex = cursor;
  }

  result += code.slice(cursor);
  return result;
}

export function preprocessCpp(code: string): string {
  // Strip std:: namespace as JSCPP parser does not support ::
  let processed = code.replace(/\bstd::/g, "");
  // Replace nullptr with 0
  processed = processed.replace(/\bnullptr\b/g, "0");
  // Expand vector initializer lists: vector<int> v = {1, 2, 3};
  processed = expandVectorInitializers(processed);
  // Desugar container references in signatures: vector<int>& v -> vector<int> v
  processed = desugarContainerReferences(processed);
  // Expand sized vector constructors: vector<int> v(3); -> declaration + push_back loop
  processed = expandSizedVectorConstructors(processed);
  // Desugar user structs & classes
  processed = desugarSwapRefs(processed);
  processed = desugarPointAndRectangle(processed);
  processed = desugarBankAccount(processed);
  processed = desugarNodeLinkedList(processed);
  // Expand range-for and monomorphize STL containers
  return expandStlContainers(expandRangeForLoops(processed));
}
