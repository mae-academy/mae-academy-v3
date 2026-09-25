import React from 'react';

/**
 * Renders a canonical schematic component or terminal label using KaTeX typography:
 * single-letter variables are italic math Roman (KaTeX_Math),
 * while multi-letter acronyms and instruments (GND, OSC, DMM, etc.) and all digits/subscripts
 * are upright math Roman (KaTeX_Main).
 */
export function renderComponentCanvasLabel(rawLabel: string, isGround = false): React.ReactNode {
  const label = (rawLabel ?? '').trim();

  // 1. Ground component
  if (isGround || /^GND\d*$/i.test(label)) {
    const gndMatch = label.match(/^GND(\d+)$/i);
    if (gndMatch) {
      return (
        <>
          <tspan
            fontFamily="'KaTeX_Main', serif"
            fontStyle="normal"
            style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
          >
            GND
          </tspan>
          <tspan
            dy="2.5"
            fontFamily="'KaTeX_Main', serif"
            fontSize="9.5px"
            fontStyle="normal"
            style={{
              fontSize: '9.5px',
              fontWeight: 400,
              fontStyle: 'normal',
              fontFamily: "'KaTeX_Main', serif",
            }}
          >
            {gndMatch[1]}
          </tspan>
        </>
      );
    }
    return (
      <tspan
        fontFamily="'KaTeX_Main', serif"
        fontStyle="normal"
        style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
      >
        GND
      </tspan>
    );
  }

  // 2. Pure numbers (e.g. "12")
  if (/^\d+$/.test(label)) {
    return (
      <tspan
        fontFamily="'KaTeX_Main', serif"
        fontStyle="normal"
        style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
      >
        {label}
      </tspan>
    );
  }

  // 3. LaTeX underscore or standard reference with subscript:
  // Examples: V_{12}, V_1, C12, R1, L_load, V_in, OSC1, DMM1, F_1, F1
  const subMatch =
    label.match(/^([A-Za-z]+)_\{([^}]+)\}$/) ??
    label.match(/^([A-Za-z]+)_([A-Za-z0-9]+)$/) ??
    label.match(/^([A-Za-z]+)(\d+)$/);

  if (subMatch) {
    const [, base, sub] = subMatch;
    const isSingleLetter = base.length === 1;
    return (
      <>
        <tspan
          fontFamily={isSingleLetter ? "'KaTeX_Math', serif" : "'KaTeX_Main', serif"}
          fontStyle={isSingleLetter ? 'italic' : 'normal'}
          style={{
            fontStyle: isSingleLetter ? 'italic' : 'normal',
            fontFamily: isSingleLetter ? "'KaTeX_Math', serif" : "'KaTeX_Main', serif",
          }}
        >
          {base}
        </tspan>
        <tspan
          dy="2.5"
          fontFamily="'KaTeX_Main', serif"
          fontSize="9.5px"
          fontStyle="normal"
          style={{
            fontSize: '9.5px',
            fontWeight: 400,
            fontStyle: 'normal',
            fontFamily: "'KaTeX_Main', serif",
          }}
        >
          {sub}
        </tspan>
      </>
    );
  }

  // 4. Tokenized fallback for any other string to guarantee 100% KaTeX font coverage:
  const tokens = label.match(/([A-Za-z]+|\d+|[^A-Za-z0-9\s]+|\s+)/g) || [label];
  return (
    <>
      {tokens.map((token, index) => {
        if (/^[A-Za-z]$/.test(token)) {
          return (
            <tspan
              key={index}
              fontFamily="'KaTeX_Math', serif"
              fontStyle="italic"
              style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', serif" }}
            >
              {token}
            </tspan>
          );
        }
        return (
          <tspan
            key={index}
            fontFamily="'KaTeX_Main', serif"
            fontStyle="normal"
            style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
          >
            {token}
          </tspan>
        );
      })}
    </>
  );
}
