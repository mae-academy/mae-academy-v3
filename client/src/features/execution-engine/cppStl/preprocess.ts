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
  vector: ["int", "double", "string"],
  stack: ["int", "double"],
  queue: ["int", "double"],
  set: ["int", "double"],
};

const CONTAINER_INSTANTIATION = new RegExp(
  Object.entries(CONTAINER_ELEMENT_TYPES)
    .map(([container, types]) => `(?:std::)?(${container})\\s*<\\s*(${types.join("|")})\\s*>`)
    .join("|"),
  "g"
);

export function expandStlContainers(code: string): string {
  return code.replace(CONTAINER_INSTANTIATION, (...groups) => {
    // One (container, type) capture pair per alternative above; exactly one pair is non-undefined.
    const captures = groups.slice(1, -2) as Array<string | undefined>;
    for (let i = 0; i < captures.length; i += 2) {
      if (captures[i] !== undefined) return `__${captures[i]}_${captures[i + 1]}`;
    }
    return groups[0] as string; // Unreachable if the regex matched at all.
  });
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
  return expandStlContainers(expandRangeForLoops(code));
}
