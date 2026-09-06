/**
 * PLC Ladder backend contract.
 * The compiler emits deterministic JavaScript from the backend AST only. Generated code
 * receives a frozen runtime function map; no source token is interpolated unescaped.
 */
import { parseLadder } from './parser';
import { validateLadderAst } from './semantic';
import type { LDBranch, LDCircuit, LDInstruction, LDParameter, LDProgram, PlcAoi, PlcCompilationResult } from './types';

function descriptor(parameter: LDParameter): string {
  if (parameter.type === 'LDNumericLiteral') return JSON.stringify({ kind: 'literal', value: parameter.value, dataType: parameter.dataType });
  if (parameter.type === 'LDTagReference') return JSON.stringify({ kind: 'tag', name: parameter.name });
  if (parameter.type === 'LDMemberAccess') return `{kind:'member',object:${descriptor(parameter.object)},member:${JSON.stringify(parameter.member)}}`;
  return `{kind:'index',target:${descriptor(parameter.target)},index:${descriptor(parameter.index)}}`;
}

function instructionMeta(instruction: LDInstruction, rung: number): string {
  return JSON.stringify({ nodeId: instruction.nodeId, instructionType: instruction.instructionType, rung });
}

interface GenerationScope { branch: number; instruction: number; }

function generateInstruction(instruction: LDInstruction, powerVariable: string, rung: number, scope: GenerationScope): string[] {
  const serial = scope.instruction++;
  const before = `__powerBefore${serial}`;
  const after = `__powerAfter${serial}`;
  const params = `[${instruction.parameters.map(descriptor).join(',')}]`;
  return [
    `const ${before}=!!${powerVariable};`,
    `${powerVariable}=!!funcs.${instruction.instructionType}(${powerVariable},${params},${instructionMeta(instruction, rung)});`,
    `const ${after}=!!${powerVariable};`,
    `funcs.trace(__rt,${instructionMeta(instruction, rung)},${before},${after},${params});`,
  ];
}

function generateBranch(branch: LDBranch, powerVariable: string, rung: number, scope: GenerationScope): string[] {
  const branchSerial = scope.branch++;
  const legVariables: string[] = [];
  const code: string[] = [];
  branch.circuits.forEach((leg, index) => {
    const legVariable = `__branch${branchSerial}Leg${index}`;
    legVariables.push(legVariable);
    code.push(`const ${legVariable}=(()=>{let __branchPower=${powerVariable};${generateCircuit(leg, '__branchPower', rung, scope).join('')}return !!__branchPower;})();`);
  });
  code.push(`${powerVariable}=(${legVariables.join('||')})?1:0;`);
  return code;
}

function generateCircuit(circuit: LDCircuit, powerVariable: string, rung: number, scope: GenerationScope): string[] {
  return circuit.elements.flatMap(element => element.type === 'LDInstruction'
    ? generateInstruction(element, powerVariable, rung, scope)
    : generateBranch(element, powerVariable, rung, scope));
}

export function generateLadderCode(ast: LDProgram): string {
  const chunks = [
    'const __prescan=__scanMode===\'prescan\';',
    'if(__trace&&!Array.isArray(__trace.rungs))__trace.rungs=[];',
  ];
  for (const rung of ast.rungs) {
    const scope: GenerationScope = { branch: 0, instruction: 0 };
    chunks.push(`(()=>{let __power=__prescan?0:1;const __rt={rungIndex:${rung.index},inputPower:!!__power,elements:[],outputPower:false};${generateCircuit(rung.circuit, '__power', rung.index, scope).join('')}__rt.outputPower=!!__power;if(__trace)__trace.rungs.push(__rt);})();`);
  }
  return chunks.join('\n');
}

export function compileLadder(source: string, aoi: Pick<PlcAoi, 'tags'>): PlcCompilationResult {
  const parsed = parseLadder(source);
  const diagnostics = [...parsed.diagnostics, ...validateLadderAst(parsed.ast, aoi)];
  const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === 'error');
  return { success: !hasErrors, ast: parsed.ast, diagnostics, code: hasErrors ? undefined : generateLadderCode(parsed.ast) };
}
