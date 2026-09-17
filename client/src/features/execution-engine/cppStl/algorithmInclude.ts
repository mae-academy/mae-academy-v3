/**
 * `<algorithm>` for JSCPP — MVP scope: `sort`/`reverse`/`fill`/`count`/`find`/`accumulate` over
 * `vector<int|double>` iterators, plus `min`/`max`/`swap` on plain `int`/`double`.
 *
 * `sort(arr, arr + n)` on a raw C array is explicitly NOT supported: JSCPP's own array-to-pointer
 * decay and pointer arithmetic are broken in this version (`int* p = a; p + n` throws an internal
 * "Cannot read properties of undefined" error even without this shim involved), so there is no
 * working pointer representation to build iterator-free `sort`/`reverse` on top of. Only the
 * `v.begin(), v.end()` form (`vectorInclude.ts`'s iterators) is supported.
 *
 * `find` needs `it == v.end()` to be a meaningful check (the idiomatic "not found" test), so this
 * module also registers `==`/`!=` on the iterator type — `vectorInclude.ts` itself never needed
 * iterator comparison before `<algorithm>` existed.
 */
import type { JscppCRuntime, JscppInclude, JscppType, JscppValue } from "JSCPP";

import { ensureVectorClass, iteratorStorage, type VectorClassSet } from "./vectorInclude";

/**
 * A bare `int` literal used as a function argument resolves as `unsigned int` in this JSCPP
 * version whenever it follows a class-typed argument (confirmed empirically: `fill(v.begin(),
 * v.end(), 7)` reports `7`'s type as `unsigned int`, but `int a=3; min(a, 3)` reports plain
 * `int` — the class-typed iterator arguments ahead of it appear to change literal inference).
 * Every function below that can receive a literal alongside an iterator therefore needs both
 * overloads for its `int`-typed parameters; `double` has no such literal-typing quirk.
 */
function valueTypeVariants(rt: JscppCRuntime, elementType: JscppType): JscppType[] {
  return elementType === rt.intTypeLiteral ? [rt.intTypeLiteral, rt.unsignedintTypeLiteral] : [elementType];
}

function registerSortAndReverse(rt: JscppCRuntime, iteratorType: JscppType): void {
  const withSlice = (
    first: JscppValue,
    last: JscppValue,
    transform: (slice: Array<JscppValue<number>>) => Array<JscppValue<number>>
  ): void => {
    const items = iteratorStorage(first).items;
    const start = iteratorStorage(first).index;
    const end = iteratorStorage(last).index;
    const slice = transform(items.slice(start, end));
    for (let i = 0; i < slice.length; i += 1) items[start + i] = slice[i];
  };

  rt.regFunc(
    (_rt, _this, first, last) => {
      withSlice(first, last, slice => [...slice].sort((a, b) => a.v - b.v));
    },
    "global",
    "sort",
    [iteratorType, iteratorType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this, first, last) => {
      withSlice(first, last, slice => [...slice].reverse());
    },
    "global",
    "reverse",
    [iteratorType, iteratorType],
    rt.voidTypeLiteral
  );
}

function registerIteratorComparison(rt: JscppCRuntime, iteratorType: JscppType): void {
  const sameIterator = (a: JscppValue, b: JscppValue): boolean =>
    iteratorStorage(a).items === iteratorStorage(b).items && iteratorStorage(a).index === iteratorStorage(b).index;
  rt.regOperator((_rt, _this, other) => _rt.val(_rt.boolTypeLiteral, sameIterator(_this, other)), iteratorType, "==", [iteratorType], rt.boolTypeLiteral);
  rt.regOperator((_rt, _this, other) => _rt.val(_rt.boolTypeLiteral, !sameIterator(_this, other)), iteratorType, "!=", [iteratorType], rt.boolTypeLiteral);
}

function registerFillCountFind(rt: JscppCRuntime, iteratorType: JscppType, elementType: JscppType): void {
  const range = (first: JscppValue, last: JscppValue) => ({
    items: iteratorStorage(first).items,
    start: iteratorStorage(first).index,
    end: iteratorStorage(last).index,
  });

  for (const valueType of valueTypeVariants(rt, elementType)) {
    rt.regFunc(
      (_rt, _this, first, last, value) => {
        const { items, start, end } = range(first, last);
        for (let i = start; i < end; i += 1) items[i].v = value.v as number;
      },
      "global",
      "fill",
      [iteratorType, iteratorType, valueType],
      rt.voidTypeLiteral
    );

    rt.regFunc(
      (_rt, _this, first, last, value) => {
        const { items, start, end } = range(first, last);
        let matches = 0;
        for (let i = start; i < end; i += 1) if (items[i].v === value.v) matches += 1;
        return _rt.val(_rt.intTypeLiteral, matches);
      },
      "global",
      "count",
      [iteratorType, iteratorType, valueType],
      rt.intTypeLiteral
    );

    rt.regFunc(
      (_rt, _this, first, last, value) => {
        const { items, start, end } = range(first, last);
        let foundIndex = end;
        for (let i = start; i < end; i += 1) {
          if (items[i].v === value.v) {
            foundIndex = i;
            break;
          }
        }
        return _rt.val(iteratorType, { members: {}, items, index: foundIndex }, true);
      },
      "global",
      "find",
      [iteratorType, iteratorType, valueType],
      iteratorType
    );
  }
}

function registerAccumulate(rt: JscppCRuntime, iteratorType: JscppType, elementType: JscppType): void {
  for (const initType of valueTypeVariants(rt, elementType)) {
    rt.regFunc(
      (_rt, _this, first, last, init) => {
        const items = iteratorStorage(first).items;
        const start = iteratorStorage(first).index;
        const end = iteratorStorage(last).index;
        let total = init.v as number;
        for (let i = start; i < end; i += 1) total += items[i].v;
        return _rt.val(elementType, total);
      },
      "global",
      "accumulate",
      [iteratorType, iteratorType, initType],
      elementType
    );
  }
}

function registerMinMaxSwap(rt: JscppCRuntime, elementType: JscppType): void {
  for (const a of valueTypeVariants(rt, elementType)) {
    for (const b of valueTypeVariants(rt, elementType)) {
      rt.regFunc((_rt, _this, x, y) => _rt.val(elementType, Math.min(x.v as number, y.v as number)), "global", "min", [a, b], elementType);
      rt.regFunc((_rt, _this, x, y) => _rt.val(elementType, Math.max(x.v as number, y.v as number)), "global", "max", [a, b], elementType);
    }
  }
  rt.regFunc(
    (_rt, _this, a, b) => {
      const tmp = a.v;
      a.v = b.v;
      b.v = tmp;
    },
    "global",
    "swap",
    [elementType, elementType],
    rt.voidTypeLiteral
  );
}

function registerIteratorAlgorithms(rt: JscppCRuntime, classes: VectorClassSet): void {
  registerSortAndReverse(rt, classes.iterator);
  registerIteratorComparison(rt, classes.iterator);
  registerFillCountFind(rt, classes.iterator, classes.elementType);
  registerAccumulate(rt, classes.iterator, classes.elementType);
}

const algorithmInclude: JscppInclude = {
  load(rt) {
    registerIteratorAlgorithms(rt, ensureVectorClass(rt, "int", rt.intTypeLiteral));
    registerIteratorAlgorithms(rt, ensureVectorClass(rt, "double", rt.doubleTypeLiteral));
    registerMinMaxSwap(rt, rt.intTypeLiteral);
    registerMinMaxSwap(rt, rt.doubleTypeLiteral);
  },
};

export default algorithmInclude;
