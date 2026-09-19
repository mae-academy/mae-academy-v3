import { LCD_COLS, LCD_ROWS, type LcdFrame } from './lcd-fsm';

const BACKLIGHT = {
  run: {
    glass: 'bg-[#06251d] shadow-[inset_0_0_18px_rgba(64,255,200,0.25)]',
    ink: 'text-[#7dffd4] [text-shadow:0_0_5px_rgba(80,255,200,0.7)]',
    block: 'bg-[#7dffd4] text-[#06251d]',
  },
  stop: {
    glass: 'bg-[#2a1c05] shadow-[inset_0_0_18px_rgba(255,190,70,0.22)]',
    ink: 'text-[#ffc857] [text-shadow:0_0_5px_rgba(255,190,70,0.65)]',
    block: 'bg-[#ffc857] text-[#2a1c05]',
  },
} as const;

/**
 * The 4 x 12 character backlit LCD. Rendering is a pure function of the frame, so a refresh costs
 * four short text nodes; the cursor of the value editor is a single inverted cell.
 */
export function LcdDisplay({ frame, className = '' }: { frame: LcdFrame; className?: string }) {
  const style = BACKLIGHT[frame.backlight];
  return (
    <div
      role="img"
      aria-label={`Display: ${frame.lines.map((line) => line.trimEnd()).filter(Boolean).join(', ')}`}
      data-backlight={frame.backlight}
      className={`select-none rounded-md border-4 border-[#1a1d21] px-3 py-2.5 ${style.glass} ${className}`}
    >
      <div aria-hidden="true" className={`font-mono text-[15px] leading-[1.35rem] tracking-[0.16em] ${style.ink}`}>
        {frame.lines.slice(0, LCD_ROWS).map((line, index) => {
          const cursor = frame.cursor?.line === index ? frame.cursor.col : -1;
          return (
            <div key={index} className="h-[1.35rem] whitespace-pre" data-lcd-line={index}>
              {cursor < 0 ? (
                line
              ) : (
                <>
                  {line.slice(0, cursor)}
                  <span className={`${style.block} animate-pulse`}>{line.charAt(cursor) || ' '}</span>
                  {line.slice(cursor + 1, LCD_COLS)}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
