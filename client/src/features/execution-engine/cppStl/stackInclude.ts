/**
 * `std::stack<T>` for JSCPP — MVP scope: `T` in {int, double}. Same monomorphization strategy as
 * `vectorInclude.ts` (see there for why: JSCPP's grammar cannot parse `stack<int>` at all).
 */
import type { JscppCRuntime, JscppInclude, JscppType, JscppValue } from "JSCPP";

import { registerContainerPrinter } from "./containerRegistry";

interface StackStorage {
  members: Record<string, never>;
  items: Array<JscppValue<number>>;
}

function storage(_this: JscppValue): StackStorage {
  return _this.v as StackStorage;
}

function classAlreadyRegistered(rt: JscppCRuntime, mangledName: string): boolean {
  return rt.getTypeSignature({ type: "class", name: mangledName }) in rt.types;
}

function registerStackClass(rt: JscppCRuntime, suffix: string, elementType: JscppType): void {
  const mangledName = `__stack_${suffix}`;
  if (classAlreadyRegistered(rt, mangledName)) return;

  const stackType = rt.newClass(mangledName, []);
  const sig = rt.getTypeSignature(stackType);
  rt.types[sig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  rt.regFunc(
    (_rt, _this, x) => {
      storage(_this).items.push(_rt.val(elementType, x.v as number, true));
    },
    stackType,
    "push",
    [elementType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = storage(_this).items;
      if (items.length === 0) _rt.raiseException("stack::pop called on an empty stack");
      items.pop();
    },
    stackType,
    "pop",
    [],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = storage(_this).items;
      if (items.length === 0) _rt.raiseException("stack::top called on an empty stack");
      return items[items.length - 1];
    },
    stackType,
    "top",
    [],
    elementType
  );

  rt.regFunc((_rt, _this) => _rt.val(_rt.boolTypeLiteral, storage(_this).items.length === 0), stackType, "empty", [], rt.boolTypeLiteral);
  rt.regFunc((_rt, _this) => _rt.val(_rt.intTypeLiteral, storage(_this).items.length), stackType, "size", [], rt.intTypeLiteral);

  registerContainerPrinter(sig, { open: "[", close: "]", items: v => storage(v).items });
}

const stackInclude: JscppInclude = {
  load(rt) {
    registerStackClass(rt, "int", rt.intTypeLiteral);
    registerStackClass(rt, "double", rt.doubleTypeLiteral);
  },
};

export default stackInclude;
