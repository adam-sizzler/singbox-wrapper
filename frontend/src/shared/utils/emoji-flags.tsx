import React, { useState } from 'react';

/**
 * Country code to Unicode flag emoji generator
 * Uses Unicode Regional Indicator Symbols:
 * 'A' -> 0x1F1E6, 'Z' -> 0x1F1FF
 */
export function countryCodeToEmoji(code: string): string {
  const upper = String(code || '').trim().toUpperCase();
  if (upper.length !== 2) return '';
  const first = upper.charCodeAt(0) - 0x41 + 0x1f1e6;
  const second = upper.charCodeAt(1) - 0x41 + 0x1f1e6;
  if (first < 0x1f1e6 || first > 0x1f1ff || second < 0x1f1e6 || second > 0x1f1ff) {
    return '';
  }
  return String.fromCodePoint(first, second);
}

// Check if string already starts with a flag emoji (pair of regional indicators)
export function hasFlagEmojiPrefix(text: string): boolean {
  if (!text || text.length < 2) return false;
  const first = text.codePointAt(0);
  if (!first || first < 0x1f1e6 || first > 0x1f1ff) return false;
  const firstLen = first > 0xffff ? 2 : 1;
  const second = text.codePointAt(firstLen);
  return !!(second && second >= 0x1f1e6 && second <= 0x1f1ff);
}

// Extract 2-letter ISO code from regional indicator emoji
export function extractCodeFromEmoji(text: string): string {
  if (!hasFlagEmojiPrefix(text)) return '';
  const first = text.codePointAt(0)!;
  const firstLen = first > 0xffff ? 2 : 1;
  const second = text.codePointAt(firstLen)!;
  const c1 = String.fromCharCode(first - 0x1f1e6 + 65);
  const c2 = String.fromCharCode(second - 0x1f1e6 + 65);
  return (c1 + c2).toUpperCase();
}

const COUNTRY_MAP: Record<string, string> = {
  // Russian names & cities
  россия: 'RU',
  москва: 'RU',
  питер: 'RU',
  петербург: 'RU',
  германия: 'DE',
  франкфурт: 'DE',
  берлин: 'DE',
  нидерланды: 'NL',
  голландия: 'NL',
  амстердам: 'NL',
  сша: 'US',
  америка: 'US',
  турция: 'TR',
  стамбул: 'TR',
  финляндия: 'FI',
  хельсинки: 'FI',
  швеция: 'SE',
  стокгольм: 'SE',
  франция: 'FR',
  париж: 'FR',
  британия: 'GB',
  англия: 'GB',
  лондон: 'GB',
  казахстан: 'KZ',
  алматы: 'KZ',
  астана: 'KZ',
  польша: 'PL',
  варшава: 'PL',
  сингапур: 'SG',
  япония: 'JP',
  токио: 'JP',
  гонконг: 'HK',
  швейцария: 'CH',
  цюрих: 'CH',
  австрия: 'AT',
  вена: 'AT',
  испания: 'ES',
  мадрид: 'ES',
  италия: 'IT',
  рим: 'IT',
  милан: 'IT',
  канада: 'CA',
  австралия: 'AU',
  эстония: 'EE',
  таллин: 'EE',
  латвия: 'LV',
  рига: 'LV',
  литва: 'LT',
  вильнюс: 'LT',
  украина: 'UA',
  киев: 'UA',
  грузия: 'GE',
  тбилиси: 'GE',
  армения: 'AM',
  ереван: 'AM',
  молдова: 'MD',
  румыния: 'RO',
  бухарест: 'RO',
  болгария: 'BG',
  софия: 'BG',
  чехия: 'CZ',
  прага: 'CZ',
  сербия: 'RS',
  белград: 'RS',
  кипр: 'CY',
  греция: 'GR',
  афины: 'GR',
  израиль: 'IL',
  индия: 'IN',
  корея: 'KR',
  сеул: 'KR',
  бразилия: 'BR',
  аргентина: 'AR',
  оаэ: 'AE',
  дубай: 'AE',

  // English names & cities
  russia: 'RU',
  moscow: 'RU',
  germany: 'DE',
  frankfurt: 'DE',
  berlin: 'DE',
  netherlands: 'NL',
  holland: 'NL',
  amsterdam: 'NL',
  usa: 'US',
  'united states': 'US',
  america: 'US',
  turkey: 'TR',
  istanbul: 'TR',
  finland: 'FI',
  helsinki: 'FI',
  sweden: 'SE',
  stockholm: 'SE',
  france: 'FR',
  paris: 'FR',
  uk: 'GB',
  'united kingdom': 'GB',
  britain: 'GB',
  london: 'GB',
  england: 'GB',
  kazakhstan: 'KZ',
  almaty: 'KZ',
  astana: 'KZ',
  poland: 'PL',
  warsaw: 'PL',
  singapore: 'SG',
  japan: 'JP',
  tokyo: 'JP',
  'hong kong': 'HK',
  hongkong: 'HK',
  switzerland: 'CH',
  zurich: 'CH',
  austria: 'AT',
  vienna: 'AT',
  spain: 'ES',
  madrid: 'ES',
  italy: 'IT',
  rome: 'IT',
  milan: 'IT',
  canada: 'CA',
  australia: 'AU',
  estonia: 'EE',
  tallinn: 'EE',
  latvia: 'LV',
  riga: 'LV',
  lithuania: 'LT',
  vilnius: 'LT',
  ukraine: 'UA',
  kyiv: 'UA',
  georgia: 'GE',
  tbilisi: 'GE',
  armenia: 'AM',
  yerevan: 'AM',
  romania: 'RO',
  bucharest: 'RO',
  bulgaria: 'BG',
  sofia: 'BG',
  czech: 'CZ',
  prague: 'CZ',
  serbia: 'RS',
  belgrade: 'RS',
  cyprus: 'CY',
  greece: 'GR',
  athens: 'GR',
  israel: 'IL',
  india: 'IN',
  korea: 'KR',
  seoul: 'KR',
  brazil: 'BR',
  uae: 'AE',
  dubai: 'AE',
  norway: 'NO',
  oslo: 'NO',
  denmark: 'DK',
  copenhagen: 'DK',
  ireland: 'IE',
  dublin: 'IE',
  portugal: 'PT',
  lisbon: 'PT',
};

// ISO 2-letter codes for direct matching
const ISO_CODES = new Set([
  'RU', 'DE', 'NL', 'US', 'TR', 'FI', 'SE', 'FR', 'GB', 'UK',
  'KZ', 'PL', 'SG', 'JP', 'HK', 'CH', 'AT', 'ES', 'IT', 'CA',
  'AU', 'EE', 'LV', 'LT', 'UA', 'GE', 'RO', 'BG', 'CZ', 'RS',
  'CY', 'GR', 'IL', 'IN', 'KR', 'BR', 'AE', 'NO', 'DK', 'IE',
  'IS', 'PT', 'BE', 'LU', 'NZ', 'ZA', 'MX', 'CL', 'TH', 'VN',
  'MY', 'ID', 'PH', 'TW', 'MD', 'AM', 'AZ', 'BY', 'UZ', 'KG',
]);

export interface NodeFlagInfo {
  flag: string;
  countryCode?: string;
  flagUrl?: string;
  cleanName: string;
  hasNativeFlag: boolean;
}

function makeFlagResult(code: string, cleanName: string, hasNativeFlag = false): NodeFlagInfo {
  const normCode = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
  const emoji = countryCodeToEmoji(normCode);
  return {
    flag: emoji || '🌐',
    countryCode: normCode.toLowerCase(),
    flagUrl: `./emoji/twemoji-flags/${normCode.toLowerCase()}.svg`,
    cleanName,
    hasNativeFlag,
  };
}

export function detectNodeFlag(rawName: string): NodeFlagInfo {
  const name = String(rawName || '').trim();
  if (!name) return { flag: '', cleanName: '', hasNativeFlag: false };

  // 1. Check if name already has a flag emoji at start
  if (hasFlagEmojiPrefix(name)) {
    const first = name.codePointAt(0)!;
    const firstLen = first > 0xffff ? 2 : 1;
    const second = name.codePointAt(firstLen)!;
    const secondLen = second > 0xffff ? 2 : 1;
    const emojiStr = name.slice(0, firstLen + secondLen);
    const rest = name.slice(firstLen + secondLen).replace(/^[-_\s|:]+/, '').trim();
    const code = extractCodeFromEmoji(emojiStr);
    if (code) {
      return makeFlagResult(code, rest || name, true);
    }
    return { flag: emojiStr, cleanName: rest || name, hasNativeFlag: true };
  }

  // 2. Special Auto / Direct / URLTest names
  const lower = name.toLowerCase();
  if (lower.includes('auto') || lower.includes('авто') || lower.includes('urltest')) {
    const clean = name.replace(/^[\s⚡\u26A1\uFE0F\-_|:]+/, '').trim();
    return { flag: '⚡', cleanName: clean || 'Auto', hasNativeFlag: true };
  }
  if (lower.includes('direct') || lower.includes('прямо') || lower.includes('bypass')) {
    const clean = name.replace(/^[\s🎯\uFE0F\-_|:]+/, '').trim();
    return { flag: '🎯', cleanName: clean || 'Direct', hasNativeFlag: true };
  }
  if (lower.includes('block') || lower.includes('reject') || lower.includes('блокировка')) {
    const clean = name.replace(/^[\s🛡️\uFE0F\uD83D\uDEE1\-_|:]+/, '').trim();
    return { flag: '🛡️', cleanName: clean || 'Block', hasNativeFlag: true };
  }

  // 3. Generic leading emoji or icon symbol
  const emojiMatch = name.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*[-_\s|:]*\s*(.*)$/u);
  if (emojiMatch && emojiMatch[1]) {
    const leadingIcon = emojiMatch[1];
    const restName = emojiMatch[2]?.trim() || '';
    if (restName) {
      return { flag: leadingIcon, cleanName: restName, hasNativeFlag: true };
    }
  }

  // 2. Check for ISO codes in brackets or start: [RU], (DE), "US - ...", "NL 01"
  const bracketMatch = name.match(/[[({]([A-Za-z]{2})[\])}]/);
  if (bracketMatch) {
    const code = bracketMatch[1].toUpperCase();
    if (ISO_CODES.has(code)) {
      return makeFlagResult(code, name, false);
    }
  }

  // Prefix match: "RU - Server", "DE_01", "US.Frankfurt"
  const prefixMatch = name.match(/^([A-Za-z]{2})[-_.\s]/);
  if (prefixMatch) {
    const code = prefixMatch[1].toUpperCase();
    if (ISO_CODES.has(code)) {
      return makeFlagResult(code, name, false);
    }
  }

  // 3. Keyword scan for country and city names
  for (const [kw, code] of Object.entries(COUNTRY_MAP)) {
    const idx = lower.indexOf(kw);
    if (idx >= 0) {
      return makeFlagResult(code, name, false);
    }
  }

  // 4. Word-boundary 2-letter match: e.g. "Server 01 RU" or "Fast NL"
  const words = name.split(/[\s_-]+/);
  for (const w of words) {
    const upper = w.toUpperCase();
    if (ISO_CODES.has(upper)) {
      return makeFlagResult(upper, name, false);
    }
  }

  // 5. Default fallback: generic globe icon
  return { flag: '🌐', cleanName: name, hasNativeFlag: false };
}

export const NodeFlag: React.FC<{
  flagInfo: NodeFlagInfo;
  style?: React.CSSProperties;
  className?: string;
}> = ({ flagInfo, style, className }) => {
  const [hasError, setHasError] = useState(false);

  return (
    <span
      className={className}
      style={{
        width: '18px',
        height: '14px',
        minWidth: '18px',
        maxWidth: '18px',
        minHeight: '14px',
        maxHeight: '14px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        verticalAlign: 'middle',
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {flagInfo.flagUrl && !hasError ? (
        <img
          src={flagInfo.flagUrl}
          alt={flagInfo.countryCode || ''}
          onError={() => setHasError(true)}
          style={{
            width: '18px',
            height: '13px',
            objectFit: 'cover',
            borderRadius: '2px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        />
      ) : (
        <span style={{ fontSize: '13px', lineHeight: 1, display: 'inline-block' }}>
          {flagInfo.flag || '🌐'}
        </span>
      )}
    </span>
  );
};
