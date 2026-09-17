/**
 * `std::set<T>` for JSCPP — MVP scope: `T` in {int, double}. Same monomorphization strategy as
 * `vectorInclude.ts` (see there for why: JSCPP's grammar cannot parse `set<int>` at all).
 *
 * Backed by a sorted, duplicate-free JS array (linear insert/erase) rather than a real
 * balanced-tree — fine at the small sizes this interpreter is already limited to (`maxSteps`),
 * and gives real C++ `set` iteration-order semantics (ascending) for free if iteration is ever
 * added later.
 */
import type { JscppCRuntime, JscppInclude, JscppType, JscppValue } from "JSCPP";

import { registerContainerPrinter } from "./containerRegistry";

interface SetStorage {
  members: Record<string, never>;
  items: Array<JscppValue<number>>;
}

function storage(_this: JscppValue): SetStorage {
  return _this.v as SetStorage;
}

function classAlreadyRegistered(rt: JscppCRuntime, mangledName: string): boolean {
  return rt.getTypeSignature({ type: "class", name: mangledName }) in rt.types;
}

function registerSetClass(rt: JscppCRuntime, suffix: string, elementType: JscppType): void {
  const mangledName = `__set_${suffix}`;
  if (classAlreadyRegistered(rt, mangledName)) return;

  const setType = rt.newClass(mangledName, []);
  const sig = rt.getTypeSignature(setType);
  rt.types[sig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  rt.regFunc(
    (_rt, _this, x) => {
      const items = storage(_this).items;
      const value = x.v as number;
      let low = 0;
      let high = items.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (items[mid].v < value) low = mid + 1;
        else high = mid;
      }
      if (items[low]?.v !== value) items.splice(low, 0, _rt.val(elementType, value, true));
    },
    setType,
    "insert",
    [elementType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this, x) => {
      const items = storage(_this).items;
      const index = items.findIndex(item => item.v === (x.v as number));
      if (index >= 0) items.splice(index, 1);
    },
    setType,
    "erase",
    [elementType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this, x) => _rt.val(_rt.intTypeLiteral, storage(_this).items.some(item => item.v === (x.v as number)) ? 1 : 0),
    setType,
    "count",
    [elementType],
    rt.intTypeLiteral
  );

  rt.regFunc((_rt, _this) => _rt.val(_rt.boolTypeLiteral, storage(_this).items.length === 0), setType, "empty", [], rt.boolTypeLiteral);
  rt.regFunc((_rt, _this) => _rt.val(_rt.intTypeLiteral, storage(_this).items.length), setType, "size", [], rt.intTypeLiteral);

  registerContainerPrinter(sig, { open: "{", close: "}", items: v => storage(v).items });
}

const setInclude: JscppInclude = {
  load(rt) {
    registerSetClass(rt, "int", rt.intTypeLiteral);
    registerSetClass(rt, "double", rt.doubleTypeLiteral);
  },
};

export default setInclude;
