/**
 * `std::queue<T>` for JSCPP — MVP scope: `T` in {int, double}. Same monomorphization strategy as
 * `vectorInclude.ts` (see there for why: JSCPP's grammar cannot parse `queue<int>` at all).
 */
import type { JscppCRuntime, JscppInclude, JscppType, JscppValue } from "JSCPP";

import { registerContainerPrinter } from "./containerRegistry";

interface QueueStorage {
  members: Record<string, never>;
  items: Array<JscppValue<number>>;
}

function storage(_this: JscppValue): QueueStorage {
  return _this.v as QueueStorage;
}

function classAlreadyRegistered(rt: JscppCRuntime, mangledName: string): boolean {
  return rt.getTypeSignature({ type: "class", name: mangledName }) in rt.types;
}

function registerQueueClass(rt: JscppCRuntime, suffix: string, elementType: JscppType): void {
  const mangledName = `__queue_${suffix}`;
  if (classAlreadyRegistered(rt, mangledName)) return;

  const queueType = rt.newClass(mangledName, []);
  const sig = rt.getTypeSignature(queueType);
  rt.types[sig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  rt.regFunc(
    (_rt, _this, x) => {
      storage(_this).items.push(_rt.val(elementType, x.v as number, true));
    },
    queueType,
    "push",
    [elementType],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = storage(_this).items;
      if (items.length === 0) _rt.raiseException("queue::pop called on an empty queue");
      items.shift();
    },
    queueType,
    "pop",
    [],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = storage(_this).items;
      if (items.length === 0) _rt.raiseException("queue::front called on an empty queue");
      return items[0];
    },
    queueType,
    "front",
    [],
    elementType
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = storage(_this).items;
      if (items.length === 0) _rt.raiseException("queue::back called on an empty queue");
      return items[items.length - 1];
    },
    queueType,
    "back",
    [],
    elementType
  );

  rt.regFunc((_rt, _this) => _rt.val(_rt.boolTypeLiteral, storage(_this).items.length === 0), queueType, "empty", [], rt.boolTypeLiteral);
  rt.regFunc((_rt, _this) => _rt.val(_rt.intTypeLiteral, storage(_this).items.length), queueType, "size", [], rt.intTypeLiteral);

  registerContainerPrinter(sig, { open: "[", close: "]", items: v => storage(v).items });
}

export function ensureStringQueueClass(rt: JscppCRuntime): JscppType {
  const queueName = "__queue_string";
  if (classAlreadyRegistered(rt, queueName)) {
    return { type: "class", name: queueName };
  }

  const anyCString = rt.arrayPointerType(rt.charTypeLiteral, 1);
  const queueType = rt.newClass(queueName, []);
  const queueSig = rt.getTypeSignature(queueType);
  rt.types[queueSig].cConstructor = (_rt, _this) => {
    _this.v = { members: {}, items: [] } as unknown as JscppValue["v"];
  };

  const stringItems = (v: JscppValue): string[] => (v.v as { members: Record<string, never>; items: string[] }).items;

  rt.regFunc(
    (_rt, _this, x) => {
      stringItems(_this).push(_rt.getStringFromCharArray(x));
    },
    queueType,
    "push",
    [anyCString],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = stringItems(_this);
      if (items.length === 0) _rt.raiseException("queue::pop called on an empty queue");
      items.shift();
    },
    queueType,
    "pop",
    [],
    rt.voidTypeLiteral
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = stringItems(_this);
      if (items.length === 0) _rt.raiseException("queue::front called on an empty queue");
      return _rt.makeCharArrayFromString(items[0]);
    },
    queueType,
    "front",
    [],
    anyCString
  );

  rt.regFunc(
    (_rt, _this) => {
      const items = stringItems(_this);
      if (items.length === 0) _rt.raiseException("queue::back called on an empty queue");
      return _rt.makeCharArrayFromString(items[items.length - 1]);
    },
    queueType,
    "back",
    [],
    anyCString
  );

  rt.regFunc((_rt, _this) => _rt.val(_rt.boolTypeLiteral, stringItems(_this).length === 0), queueType, "empty", [], rt.boolTypeLiteral);
  rt.regFunc((_rt, _this) => _rt.val(_rt.intTypeLiteral, stringItems(_this).length), queueType, "size", [], rt.intTypeLiteral);

  registerContainerPrinter(queueSig, {
    open: "[",
    close: "]",
    items: v => stringItems(v).map(s => rt.makeCharArrayFromString(s)),
    formatItem: item => `"${rt.getStringFromCharArray(item)}"`,
  });

  return queueType;
}

const queueInclude: JscppInclude = {
  load(rt) {
    registerQueueClass(rt, "int", rt.intTypeLiteral);
    registerQueueClass(rt, "double", rt.doubleTypeLiteral);
    ensureStringQueueClass(rt);
  },
};

export default queueInclude;
