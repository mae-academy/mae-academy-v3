import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SegmentedControl, StudioCard } from '@/components/common/templates';
import { KatexMath } from '@/components/ui/KatexMath';
import { INITIAL_BLOCK_STATE } from '../engine/blocks';
import { SCENARIOS, type ScenarioId } from '../scenarios';
import { FbdViewer } from './FbdViewer';

/** Inline math; every variable in the manual goes through KaTeX. */
const M = ({ children }: { children: string }) => <KatexMath math={children} />;

type ModuleId = 'hardware' | 'scan' | 'panel' | 'library' | 'commissioning' | 'sealin' | 'traffic';

const MODULES: readonly { readonly id: ModuleId; readonly label: string; readonly title: string }[] = [
  { id: 'hardware', label: '1 · Hardware', title: 'Hardware architecture & wiring principles' },
  { id: 'scan', label: '2 · Scan cycle', title: 'The cyclic PLC scan engine' },
  { id: 'panel', label: '3 · Front panel', title: 'LCD & keypad programming' },
  { id: 'library', label: '4 · Blocks', title: 'Standard library & parameters' },
  { id: 'commissioning', label: '5 · Commissioning', title: 'Diagnostic verification & commissioning' },
  { id: 'sealin', label: 'A · Seal-in', title: 'Tutorial A: self-holding (seal-in) circuit' },
  { id: 'traffic', label: 'B · Traffic light', title: 'Tutorial B: automated traffic light sequence' },
];

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">{heading}</h4>
      <div className="space-y-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

function Try({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:border-slate-800 dark:bg-[#020617] dark:text-slate-300">
      <span className="font-bold text-red-600 dark:text-red-400">Try it · </span>
      {children}
    </p>
  );
}

const Table = ({ head, rows }: { head: readonly ReactNode[]; rows: readonly (readonly ReactNode[])[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[420px] border-collapse text-[12px]">
      <thead>
        <tr>
          {head.map((cell, index) => (
            <th key={index} className="border-b border-slate-200 px-2 py-1 text-left font-bold text-slate-800 dark:border-slate-800 dark:text-slate-100">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} className="border-b border-slate-100 px-2 py-1 align-top text-slate-600 dark:border-slate-800/70 dark:text-slate-300">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function Hardware() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section heading="Two voltage classes">
        <Table
          head={['', 'LOGO! 230RC', 'LOGO! 12/24RC · 24R/24C']}
          rows={[
            ['Supply', <M key="a">{'115\\text{–}240\\,\\mathrm{V}\\ \\mathrm{AC/DC}'}</M>, <M key="b">{'12/24\\,\\mathrm{V}\\ \\mathrm{DC}'}</M>],
            ['Input “1”', <M key="c">{'> 79\\,\\mathrm{V}'}</M>, <M key="d">{'> 8\\,\\mathrm{V}'}</M>],
            ['Input “0”', <M key="e">{'< 40\\,\\mathrm{V}\\ \\mathrm{AC}'}</M>, <M key="f">{'< 5\\,\\mathrm{V}'}</M>],
            ['Outputs', 'relay, 10 A dry contacts', 'relay (…R) or transistor 0.3 A (…/24, sourcing)'],
          ]}
        />
        <p>
          Switch the class with <strong>230V AC / 24V DC</strong> in the toolbar. Live conductors follow IEC 60204-1 control-wiring colours: red on AC,
          blue on DC.
        </p>
      </Section>
      <Section heading="Inputs, dry contacts and return paths">
        <p>
          A DC input of this family is <em>sinking</em>: the field contact connects the input terminal to <M>{'L{+}'}</M> (sourcing field device), and
          current returns through the module to <M>M</M>. On the 230RC the contact switches the phase <M>{'L_1'}</M> onto the input; the inputs form two
          groups, <M>{'I_1\\ldots I_4'}</M> and <M>{'I_5\\ldots I_8'}</M>, each of which must stay on one phase.
        </p>
        <p>
          Each relay output <M>{'Q_n'}</M> is a <em>floating dry contact</em> between terminals 1 and 2: it is not referenced to the supply. You close the
          loop yourself: <M>{'L_1 \\to Q_n(1) \\to Q_n(2) \\to \\text{load} \\to N'}</M> (or <M>{'L{+} \\to \\ldots \\to M'}</M> on DC).
        </p>
        <Try>Open the mains breaker: every contact drops, the inputs read 0 V, and on power-up the unit resumes the RUN/STOP state it had.</Try>
      </Section>
    </div>
  );
}

function Scan() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section heading="Three steps, every cycle">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Read inputs</strong> — every terminal is sampled once into the process image of inputs (PII). A change shorter than one cycle is not
            seen.
          </li>
          <li>
            <strong>Evaluate</strong> — each block is executed exactly once, in the topological order of the block graph, a directed acyclic graph{' '}
            <M>{'G = (V, E)'}</M>: a block runs only after every block it reads.
          </li>
          <li>
            <strong>Write outputs</strong> — all <M>{'Q'}</M> and <M>{'M'}</M> values are committed together to the process image of outputs (PIQ) and the
            relays follow.
          </li>
        </ol>
        <p>
          Timers advance by the measured time between two scans, <M>{'T_a \\leftarrow T_a + \\Delta t'}</M>, so their accuracy does not depend on the scan
          rate.
        </p>
      </Section>
      <Section heading="Why feedback goes through Q and M">
        <p>
          A block may not read its own result in the same cycle — that would be a loop in <M>G</M>. Reading a flag or an output instead returns the value
          committed in the <em>previous</em> cycle: <M>{'M_k(n) \\text{ reads } M_k(n-1)'}</M>. That is how every seal-in circuit in the library works
          (e.g. DOL starter: <M>{'Q_1 = (I_1 \\lor Q_1) \\land I_2 \\land I_3'}</M>).
        </p>
        <p>
          <M>{'M_8'}</M> is the start-up flag: it is 1 during the first cycle after RUN only.
        </p>
        <Try>Load “Star-delta”, open the function block diagram under the bench and press START: follow the star contactor drop and the 50 ms transit before delta.</Try>
      </Section>
    </div>
  );
}

function Panel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section heading="Menu hierarchy">
        <Table
          head={['Where', 'Keys', 'What happens']}
          rows={[
            ['Main menu (STOP)', '▲ ▼ · OK', 'Program.. / Card.. / Clock.. / Start'],
            ['Program..', 'OK', 'Edit.. · Edit Name · Memory? · Clear Prg · Password'],
            ['Edit..', '▲ ▼', 'step through the outputs; an empty output shows “- [ Q1 ]”'],
            ['on a connector', '◄ / ►', 'walk toward the inputs / back toward the output'],
            ['on a connector', 'OK', 'open the list: Co (connectors), GF, SF, BN (existing blocks)'],
            ['RUN', 'ESC', 'parameter menu: Stop · Set Param · Set Clock · Prg Name'],
          ]}
        />
      </Section>
      <Section heading="Wiring a block on the device">
        <p>
          Programs are entered from the output backwards. On <M>{'Q_1'}</M> press ◄ then OK, pick <strong>GF → OR</strong>: block <M>{'B_1'}</M> is placed and
          its output is wired to <M>{'Q_1'}</M>. The cursor moves to its first input; OK → <strong>Co</strong> → <M>{'I_1'}</M> wires the first pin. Pins
          you leave as <M>x</M> take the block’s neutral value (1 for AND, 0 for OR).
        </p>
        <p>
          Connectors offered: <M>{'I_1\\ldots I_8'}</M>, <M>{'Q_1\\ldots Q_4'}</M> (read-back), flags <M>{'M_1\\ldots M_8'}</M>, <M>{'\\mathrm{hi}'}</M>{' '}
          and <M>{'\\mathrm{lo}'}</M>. Your physical keyboard works too: arrows, Enter = OK, Esc = ESC.
        </p>
        <Try>Program.. → Clear Prg → Yes, then build Q1 = OR(I1, I2) from scratch and press Start.</Try>
      </Section>
    </div>
  );
}

function Library() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section heading="Basic functions (GF)">
        <Table
          head={['Block', 'Output', 'Open pin x']}
          rows={[
            ['AND', <M key="1">{'Q = I_1 \\land I_2 \\land I_3 \\land I_4'}</M>, '1'],
            ['OR', <M key="2">{'Q = I_1 \\lor I_2 \\lor I_3 \\lor I_4'}</M>, '0'],
            ['NOT', <M key="3">{'Q = \\lnot I_1'}</M>, '—'],
            ['NAND / NOR', <M key="4">{'Q = \\lnot(\\ldots)'}</M>, '1 / 0'],
            ['XOR', <M key="5">{'Q = I_1 \\oplus I_2'}</M>, '0'],
            ['AND ↑ / NAND ↓', 'one-cycle pulse on the edge', '1'],
          ]}
        />
      </Section>
      <Section heading="Special functions (SF)">
        <Table
          head={['Block', 'Behaviour', 'Parameters']}
          rows={[
            ['On-delay (TON)', <><M>Q</M> after Trg held for <M>T</M></>, <M key="a">T</M>],
            ['Off-delay (TOF)', <><M>Q</M> at once, drops <M>T</M> after Trg falls</>, <M key="b">T</M>],
            ['Retentive on-delay', <>one edge starts <M>T</M>; only R resets</>, <M key="c">T</M>],
            ['Wiping relay (TP)', <>pulse of <M>T</M>, cut short if Trg falls</>, <M key="d">T</M>],
            ['Pulse generator', <>free-runs <M>{'T_H / T_L'}</M> while En</>, <M key="e">{'T_H,\\ T_L'}</M>],
            ['Stairway', <>off after <M>T</M>, blinks <M>{'T_{!}'}</M> before</>, <M key="f">{'T,\\ T_{!},\\ T_{!L}'}</M>],
            ['Latching relay (RS)', 'S sets, R resets (R wins)', '—'],
            ['Pulse relay', 'Trg toggles; S/R priority RS or SR', 'Par'],
            ['Up/down counter (CTUD)', <><M>Q</M> when <M>{'\\mathrm{Cnt} \\ge \\mathrm{On}'}</M></>, <M key="g">{'\\mathrm{On},\\ \\mathrm{Off}'}</M>],
          ]}
        />
        <p>
          Times are entered as <M>{'SS{:}hh'}</M> (10 ms), <M>{'MM{:}SS'}</M> or <M>{'HH{:}MM'}</M>. Change them live with ESC → Set Param without stopping the
          program.
        </p>
      </Section>
    </div>
  );
}

function Commissioning() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section heading="Trace the signal">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Check the terminal voltage printed under each input screw: 230 V / 24 V means the field contact is closed.</li>
          <li>In RUN, ▼ on the start screen shows the <M>{'I{:}'}</M> screen: every input that reads 1 is shown inverted.</li>
          <li>
            ▼ again for <M>{'Q{:}'}</M> and <M>{'M{:}'}</M>. If <M>{'Q_n = 1'}</M> but the load stays dark, the fault is outside the PLC: supply to terminal
            1, the load, or its return.
          </li>
          <li>The function block diagram shows which block input is holding an output off.</li>
        </ol>
      </Section>
      <Section heading="RUN / STOP safely">
        <p>
          STOP forces every relay open. From RUN: ESC → Stop → <strong>Yes</strong> (the prompt defaults to No). Editing the program is only possible in
          STOP; parameters may be changed in RUN.
        </p>
        <p>
          Before energising a drive, prove the interlocks: in the forward/reverse and star-delta programs the two contactors must never close together —
          watch both relay windows while you operate the buttons.
        </p>
        <Try>Load “Two-hand safety control”, press one hand, wait more than 0.5 s, press the other: the valve must stay off.</Try>
      </Section>
    </div>
  );
}


type LoadScenario = (id: ScenarioId) => void;

/** Static diagram of a preloaded program (no live values), with a button that loads it on the bench. */
function ProgramFigure({ id, caption, onLoad }: { id: ScenarioId; caption: string; onLoad: LoadScenario }) {
  const scenario = SCENARIOS[id];
  return (
    <figure className="space-y-2">
      <FbdViewer program={scenario.program} running={false} level={() => 0} blockState={() => INITIAL_BLOCK_STATE} />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500 dark:text-slate-400">
        <span>{caption}</span>
        <button
          type="button"
          onClick={() => onLoad(id)}
          className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:border-red-500 hover:text-red-600 dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:text-red-400"
        >
          {`Load “${scenario.title}” on the bench`}
        </button>
      </figcaption>
    </figure>
  );
}

function SealIn({ onLoad }: { onLoad: LoadScenario }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Section heading="Concept">
          <p>
            A pump or motor must keep running after the operator lets go of a momentary START button. The circuit therefore has to <em>remember</em> that
            it was started: it <strong>seals itself in</strong> by feeding its own output back to its input, and only a STOP command breaks the loop.
          </p>
          <p>
            Behaviour: START pressed → <M>{'Q_1 = 1'}</M>; START released → <M>{'Q_1'}</M> stays 1; STOP pressed → <M>{'Q_1 = 0'}</M>. STOP always wins.
          </p>
        </Section>
        <Section heading="Wiring">
          <Table
            head={['Input', 'Device', 'Contact', 'At rest']}
            rows={[
              [<M key="a">{'I_1'}</M>, 'START push-button', 'NO (make)', <M key="a2">{'I_1 = 0'}</M>],
              [<M key="b">{'I_2'}</M>, 'STOP push-button', 'NC (break)', <M key="b2">{'I_2 = 1'}</M>],
              [<M key="c">{'Q_1'}</M>, 'Pump / motor contactor', 'dry contact', 'open'],
            ]}
          />
          <p>
            STOP is a break contact on purpose: if its wire is cut, <M>{'I_2'}</M> reads 0 and the pump stops — the circuit fails safe.
          </p>
        </Section>
        <Section heading="Logic 1 — OR + AND gates">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <M>{'B_1 = \text{OR}(I_1,\ Q_1)'}</M> — START <em>or</em> the feedback from <M>{'Q_1'}</M>.
            </li>
            <li>
              <M>{'B_2 = \text{AND}(B_1,\ I_2)'}</M> — only while STOP is not pressed.
            </li>
            <li>
              <M>{'Q_1 = B_2'}</M>, that is <M>{'Q_1 = (I_1 \lor Q_1) \land I_2'}</M>.
            </li>
          </ol>
          <p>
            The <M>{'Q_1'}</M> on the left is the value from the <em>previous</em> scan (see module 2), which is what makes the feedback legal.
          </p>
        </Section>
      </div>
      <div className="space-y-4">
        <ProgramFigure id="seal-in-gates" caption="Gate version: I1 and the Q1 read-back into OR, then AND with I2." onLoad={onLoad} />
        <Section heading="Logic 2 — the latching relay (RS) block">
          <p>
            The same function is built into LOGO! as the <strong>Latching relay</strong>: <M>{'S = I_1'}</M> sets it, <M>{'R = \lnot I_2'}</M> resets it. The
            NC button reads 1 at rest, so it is wired to R <em>inverted</em> (the small circle on the pin). R has priority over S, exactly like STOP over
            START.
          </p>
        </Section>
        <ProgramFigure id="seal-in-rs" caption="RS version: S = I1, R = NOT I2." onLoad={onLoad} />
        <Try>Load a version, press Start on the LCD, hold START and release it: the motor keeps turning and the feedback wire stays lit. Press STOP to break it.</Try>
      </div>
    </div>
  );
}

function Traffic({ onLoad }: { onLoad: LoadScenario }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Section heading="Concept">
          <p>
            A cyclic sequence needs a clock. An <strong>asynchronous pulse generator</strong> is the master clock; timers derived from its two phases split
            the cycle into Green, Yellow and Red. Because every lamp is computed from the same two signals, exactly one lamp can be on at a time.
          </p>
        </Section>
        <Section heading="Wiring">
          <Table
            head={['Terminal', 'Function']}
            rows={[
              [<M key="a">{'I_1'}</M>, 'Cycle-enable switch (latching, NO)'],
              [<M key="b">{'Q_1'}</M>, 'Red lamp'],
              [<M key="c">{'Q_2'}</M>, 'Yellow lamp'],
              [<M key="d">{'Q_3'}</M>, 'Green lamp'],
            ]}
          />
        </Section>
        <Section heading="Blocks and parameters">
          <Table
            head={['Block', 'Type', 'Inputs', 'Parameters']}
            rows={[
              [<M key="1">{'B_1'}</M>, 'Off-delay (TOF)', <M key="1i">{'\mathrm{Trg} = I_1'}</M>, <M key="1p">{'T = 12\,\mathrm{s}'}</M>],
              [<M key="2">{'B_2'}</M>, 'Async. pulse generator', <M key="2i">{'\mathrm{En} = B_1'}</M>, <M key="2p">{'T_H = 5\,\mathrm{s},\ T_L = 7\,\mathrm{s}'}</M>],
              [<M key="3">{'B_3'}</M>, 'AND', <M key="3i">{'B_1,\ \lnot B_2'}</M>, '—'],
              [<M key="4">{'B_4'}</M>, 'On-delay (TON)', <M key="4i">{'\mathrm{Trg} = B_3'}</M>, <M key="4p">{'T = 2\,\mathrm{s}'}</M>],
              [<M key="5">{'B_5'}</M>, 'AND', <M key="5i">{'B_3,\ \lnot B_4'}</M>, '—'],
            ]}
          />
        </Section>
        <Section heading="How the outputs are formed">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Green</strong> <M>{'Q_3 = B_2'}</M> — the pulse generator’s high phase, 5 s.
            </li>
            <li>
              <strong>Low phase</strong> <M>{'B_3 = B_1 \land \lnot B_2'}</M> — the 7 s after the pulse.
            </li>
            <li>
              <strong>Red</strong> <M>{'Q_1 = B_4'}</M> — the on-delay switches on 2 s into the low phase, leaving 5 s of red.
            </li>
            <li>
              <strong>Yellow</strong> <M>{'Q_2 = B_3 \land \lnot B_4'}</M> — the first 2 s of the low phase, before the timer has elapsed.
            </li>
          </ul>
          <p>
            Cycle: <M>{'5 + 2 + 5 = 12\,\mathrm{s}'}</M>. The off-delay <M>{'B_1'}</M> keeps the enable up for 12 s after the switch opens (a “run-out”), so the lights
            keep sequencing for one cycle length and then go dark instead of blanking mid-phase.
          </p>
        </Section>
      </div>
      <div className="space-y-4">
        <ProgramFigure id="traffic-light" caption="B2 is the master clock; B4 splits its low phase into yellow and red." onLoad={onLoad} />
        <Try>Load the program, start it from the LCD and switch I1 on: watch the timer readouts in the diagram and the three lamps take turns, never overlapping.</Try>
      </div>
    </div>
  );
}

const CONTENT: Readonly<Record<ModuleId, (props: { onLoad: LoadScenario }) => ReactNode>> = {
  hardware: Hardware,
  scan: Scan,
  panel: Panel,
  library: Library,
  commissioning: Commissioning,
  sealin: SealIn,
  traffic: Traffic,
};

/** Beginner's manual (five modules plus two worked tutorials), opened from the toolbar. */
export function LogoManual({ onClose, onLoad }: { onClose: () => void; onLoad: (id: ScenarioId) => void }) {
  const [module, setModule] = useState<ModuleId>('hardware');
  const current = MODULES.find((entry) => entry.id === module) ?? MODULES[0];
  const Body = CONTENT[module];
  return (
    <StudioCard
      title="LOGO! beginner’s manual"
      subtitle={current?.title}
      actionSlot={
        <button
          type="button"
          onClick={onClose}
          aria-label="Close manual"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      }
    >
      <div role="region" aria-label="LOGO! manual" className="space-y-4">
        <div className="overflow-x-auto">
          <SegmentedControl<ModuleId>
            aria-label="Manual module"
            size="sm"
            value={module}
            options={MODULES.map((entry) => ({ label: entry.label, value: entry.id }))}
            onChange={setModule}
            className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
          />
        </div>
        <Body onLoad={onLoad} />
      </div>
    </StudioCard>
  );
}
