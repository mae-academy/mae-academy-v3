/**
 * `std::vector<T>` for JSCPP — MVP scope: `T` in {int, double}.
 *
 * JSCPP's PEG grammar cannot parse template syntax at all (`vector<int> v;` fails to parse even
 * with this include loaded — the `<` is always read as less-than, a known unresolved upstream
 * issue: https://github.com/felixhao28/JSCPP/issues/44). So there is no such thing as a generic
 * `vector<T>` class here: `preprocess.ts` monomorphizes each concrete instantiation found in the
 * source (e.g. `vector<int>` -> `__vector_int`) *before* JSCPP ever parses it, and this module
 * registers one concrete, non-generic class per supported element type to match.
 *
 * Iterators (`.begin()`/`.end()`) exist ONLY so `<algorithm>` (`algorithmInclude.ts`) can receive
 * a `{items, index}` pair and operate on the underlying storage in place. There is no `*it` or
 * `++it` support and no standalone `vector<int>::iterator` declaration — iterators are meant to be
 * produced and consumed in the same expression, e.g. `sort(v.begin(), v.end())`.
 */
import type { JscppCRuntime, JscppInclude, JscppType, JscppValue } from "JSCPP";

import { registerContainerPrinter } from "./containerRegistry";

/** `newClass` gives every instance `.v = { members: {} }`; `items` is this shim's own extension. */
interface VectorStorage {
  members: Record<string, never>;
  items: Array<JscppValue<number>>;
}

/** An iterator just carries a live reference to the same `items` array plus a position in it. */
export interface VectorIteratorStorage {
  members: Record<string, never>;
  items: Array<JscppValue<number>>;
  index: number;
}

export interface VectorClassSet {
  vector: JscppType;
  iterator: JscppType;
  elementType: JscppType;
}

function storage(_this: JscppValue): VectorStorage {
  return _this.v as VectorStorage;
}

export function iteratorStorage(it: JscppValue): VectorIteratorStorage {
  return it.v as VectorIteratorStorage;
}

function classAlreadyRegistered(rt: JscppCRuntime, mangledName: string): boolean {
  return rt.getTypeSignature({ type: "class", name: mangledName }) in rt.types;
}

/**
 * Registers `__vector_<suffix>` (and its iterator type) once per runtime. Safe to call from both
 * `vectorInclude.load` and `algorithmInclude.load` regardless of `#include` order — `newClass`
 * throws "already defined" on a second call, so every caller must go through this guard instead
 * of calling `rt.newClass` directly.
 */
export function ensureVectorClass(rt: JscppCRuntime, suffix: string, elementType: JscppType): VectorClassSet {
  const vectorName = `__vector_${suffix}`;
  const iteratorName = `__vector_${suffix}_iter`;

  if (classAlreadyRegistered(rt, vectorName)) {
    return {
      vector: { type: "class", name: vectorName },
      iterator: { type: "class", name: iteratorName },
      elementType,
    };
  }

  const vectorType = rt.newClass(vectorName, []);
  const vectorSig = rt.getTypeSignature(vectorType);
  rt.types[vectorSig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  const iteratorType = rt.newClass(iteratorName, []);
  const iteratorSig = rt.getTypeSignature(iteratorType);
  rt.types[iteratorSig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [], index: 0 } as unknown as JscppValue["v"];
  };

  rt.regFunc(
    (_rt, _this, x) => {
      storage(_this).items.push(_rt.val(elementType, x.v as number, true));
    },
    vectorType,
    "push_back",
    [elementType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => _rt.val(_rt.intTypeLiteral, storage(_this).items.length),
    vectorType,
    "size",
    [],
    rt.intTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => _rt.val(_rt.boolTypeLiteral, storage(_this).items.length === 0),
    vectorType,
    "empty",
    [],
    rt.boolTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => _rt.val(iteratorType, { members: {}, items: storage(_this).items, index: 0 }, true),
    vectorType,
    "begin",
    [],
    iteratorType
  );

  rt.regFunc(
    (_rt, _this) => _rt.val(iteratorType, { members: {}, items: storage(_this).items, index: storage(_this).items.length }, true),
    vectorType,
    "end",
    [],
    iteratorType
  );

  // Returns the live element wrapper (not a copy) so `v[i] = x;` mutates the stored value in
  // place via JSCPP's default `o(=)` handler, which assigns onto whatever object `left` points at.
  const indexOperator = (_rt: JscppCRuntime, _this: JscppValue, index: JscppValue): JscppValue => {
    const items = storage(_this).items;
    const i = index.v as number;
    if (i < 0 || i >= items.length) _rt.raiseException(`vector subscript out of range: index ${i}, size ${items.length}`);
    return items[i];
  };
  // Integer literal indices (`v[0]`) resolve as `unsigned int`, not `int` — JSCPP overload
  // resolution is an exact type-signature match, so both are registered against the same impl.
  rt.regOperator(indexOperator, vectorType, "[]", [rt.intTypeLiteral], elementType);
  rt.regOperator(indexOperator, vectorType, "[]", [rt.unsignedintTypeLiteral], elementType);

  registerContainerPrinter(vectorSig, { open: "[", close: "]", items: v => storage(v).items });

  return { vector: vectorType, iterator: iteratorType, elementType };
}

/**
 * `vector<string>` — built directly on JSCPP's existing `char[]` string representation rather
 * than a new string type. Element storage holds plain JS strings (not `JscppValue`s, unlike the
 * numeric vectors) because a C string's JSCPP type bakes in its buffer size (`char[4]` for
 * `"MAE"` vs `char[3]` for `"hi"`), so there is no single fixed element type to store as-is; this
 * shim converts on the way in (`getStringFromCharArray`) and out (`makeCharArrayFromString`)
 * instead. Read-only: `names[0] = "x"` is not supported (that needs copy-in/copy-out assignment
 * semantics `operator[]`'s live-reference trick can't give a JS string), only `push_back`,
 * `size`, `empty`, and indexed read.
 */
function ensureStringVectorClass(rt: JscppCRuntime): JscppType {
  const vectorName = "__vector_string";
  if (classAlreadyRegistered(rt, vectorName)) return { type: "class", name: vectorName };

  // Any char array/pointer is `castable` to this regardless of its actual buffer size (JSCPP
  // falls back to `castable()`-based overload matching when no exact-size signature exists).
  const anyCString = rt.arrayPointerType(rt.charTypeLiteral, 1);

  const vectorType = rt.newClass(vectorName, []);
  const vectorSig = rt.getTypeSignature(vectorType);
  rt.types[vectorSig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  const stringItems = (v: JscppValue): string[] => (v.v as { members: Record<string, never>; items: string[] }).items;

  rt.regFunc(
    (_rt, _this, x) => {
      stringItems(_this).push(_rt.getStringFromCharArray(x));
    },
    vectorType,
    "push_back",
    [anyCString],
    rt.voidTypeLiteral
  );

  rt.regFunc((_rt, _this) => _rt.val(_rt.intTypeLiteral, stringItems(_this).length), vectorType, "size", [], rt.intTypeLiteral);
  rt.regFunc((_rt, _this) => _rt.val(_rt.boolTypeLiteral, stringItems(_this).length === 0), vectorType, "empty", [], rt.boolTypeLiteral);

  const indexOperator = (_rt: JscppCRuntime, _this: JscppValue, index: JscppValue): JscppValue => {
    const items = stringItems(_this);
    const i = index.v as number;
    if (i < 0 || i >= items.length) _rt.raiseException(`vector subscript out of range: index ${i}, size ${items.length}`);
    return _rt.makeCharArrayFromString(items[i]);
  };
  rt.regOperator(indexOperator, vectorType, "[]", [rt.intTypeLiteral], anyCString);
  rt.regOperator(indexOperator, vectorType, "[]", [rt.unsignedintTypeLiteral], anyCString);

  registerContainerPrinter(vectorSig, {
    open: "[",
    close: "]",
    items: v => stringItems(v).map(s => rt.makeCharArrayFromString(s)),
    formatItem: item => `"${rt.getStringFromCharArray(item)}"`,
  });

  return vectorType;
}

const vectorInclude: JscppInclude = {
  load(rt) {
    ensureVectorClass(rt, "int", rt.intTypeLiteral);
    ensureVectorClass(rt, "double", rt.doubleTypeLiteral);
    ensureStringVectorClass(rt);
  },
};

export default vectorInclude;
