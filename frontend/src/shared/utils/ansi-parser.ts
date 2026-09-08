/**
 * ANSI Escape Sequences Parser
 * Supports:
 * - Standard 16 colors (foreground: 30-37, 90-97)
 * - 256-color xterm palette (38;5;n)
 * - Truecolor RGB (38;2;r;g;b)
 * - Reset (0, 39)
 * - Handles both literal \x1b[ and fallback \u2190[ or \u001b[
 */

export interface LogSegment {
  text: string;
  color?: string;
  bold?: boolean;
}

/* eslint-disable no-control-regex */
const ANSI_REGEX = /(?:\x1b|\u2190|\u001b)\[([0-9;]*)m/g;

const BASIC_16_COLORS: string[] = [
  '#1e293b', // 0 Black
  '#ef4444', // 1 Red
  '#22c55e', // 2 Green
  '#eab308', // 3 Yellow
  '#3b82f6', // 4 Blue
  '#a855f7', // 5 Magenta
  '#06b6d4', // 6 Cyan
  '#e2e8f0', // 7 White
  '#64748b', // 8 Bright Black / Gray
  '#f87171', // 9 Bright Red
  '#4ade80', // 10 Bright Green
  '#facc15', // 11 Bright Yellow
  '#60a5fa', // 12 Bright Blue
  '#c084fc', // 13 Bright Magenta
  '#22d3ee', // 14 Bright Cyan
  '#ffffff', // 15 Bright White
];

function xterm256ToHex(index: number): string {
  if (index < 16) {
    return BASIC_16_COLORS[index] || '#cbd5e1';
  }
  if (index >= 232) {
    // Grayscale
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  // 6x6x6 color cube
  const c = index - 16;
  const r = Math.floor(c / 36);
  const g = Math.floor((c % 36) / 6);
  const b = c % 6;
  const levels = [0, 95, 135, 175, 215, 255];
  return `rgb(${levels[r]}, ${levels[g]}, ${levels[b]})`;
}

export function parseAnsiLine(rawText: string): LogSegment[] {
  if (!rawText) return [];

  // Normalize fallback arrow back to escape
  let text = rawText.replace(/\u2190\[/g, '\x1b[');

  if (!text.includes('\x1b[')) {
    return [{ text }];
  }

  const segments: LogSegment[] = [];
  let currentColor: string | undefined = undefined;
  let isBold = false;
  let lastIndex = 0;

  ANSI_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, match.index),
        color: currentColor,
        bold: isBold,
      });
    }

    const codeStr = match[1] || '0';
    const parts = codeStr.split(';').map((p) => parseInt(p, 10));

    for (let i = 0; i < parts.length; i++) {
      const code = parts[i];
      if (isNaN(code) || code === 0 || code === 39) {
        currentColor = undefined;
        isBold = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 22) {
        isBold = false;
      } else if (code >= 30 && code <= 37) {
        currentColor = BASIC_16_COLORS[code - 30];
      } else if (code >= 90 && code <= 97) {
        currentColor = BASIC_16_COLORS[code - 90 + 8];
      } else if (code === 38 && i + 1 < parts.length) {
        const mode = parts[i + 1];
        if (mode === 5 && i + 2 < parts.length) {
          currentColor = xterm256ToHex(parts[i + 2]);
          i += 2;
        } else if (mode === 2 && i + 4 < parts.length) {
          const r = parts[i + 2];
          const g = parts[i + 3];
          const b = parts[i + 4];
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            currentColor = `rgb(${r}, ${g}, ${b})`;
          }
          i += 4;
        }
      }
    }

    lastIndex = ANSI_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      color: currentColor,
      bold: isBold,
    });
  }

  return segments;
}
