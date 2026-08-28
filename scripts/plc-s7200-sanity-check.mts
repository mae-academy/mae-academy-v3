import { astToIl, defaultPlcAst, ilToAst, initialPlcMemory, scanCycle, setWatchValue } from "../client/src/lib/plcEngine";

const fail = (message: string): never => { throw new Error(message); };
let memory = initialPlcMemory();
const ast = defaultPlcAst();

memory = setWatchValue(memory, "I0.0", true);
let result = scanCycle(memory, ast, 100);
if (!result.memory.outputs["Q0.0"]) fail("Scan cycle did not write Q0.0 from I0.0.");

memory = setWatchValue(result.memory, "I0.1", true);
memory = setWatchValue(memory, "I0.2", false);
for (let scan = 0; scan < 15; scan += 1) memory = scanCycle(memory, ast, 100).memory;
if (!memory.timers.T0.done || !memory.markers["M0.0"]) fail("TON did not complete after its 1500 ms preset.");
memory = scanCycle(memory, ast, 100).memory;
if (!memory.outputs["Q0.1"]) fail("M0.0 timer marker did not drive Q0.1 on the next rung scan.");

const il = "LD I0.0\n= Q0.2";
const parsed = ilToAst(il);
if (parsed.errors.length || astToIl(parsed.ast) !== il) fail("IL parser/generator did not produce a synchronized AST.");
memory = scanCycle(memory, parsed.ast, 100).memory;
if (!memory.outputs["Q0.2"]) fail("Parsed IL program did not drive Q0.2.");

const parallelProgram = ilToAst("LD I0.6\nOR I0.7\n= Q0.4");
if (parallelProgram.errors.length) fail("Parallel OR IL program did not parse.");
memory = setWatchValue(memory, "I0.6", false);
memory = setWatchValue(memory, "I0.7", true);
memory = scanCycle(memory, parallelProgram.ast, 100).memory;
if (!memory.outputs["Q0.4"]) fail("Parallel branch did not energize Q0.4 from I0.7.");

console.log("S7-200 engine sanity checks passed: scan cycle, TON, LD↔IL synchronization, and parallel branches.");
