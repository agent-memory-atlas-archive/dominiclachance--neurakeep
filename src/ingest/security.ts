export interface SafetyScanResult {
  riskFlags: string[];
  secretHints: string[];
  poisoningHints: string[];
}

const poisoningPatterns: Array<[string, RegExp]> = [
  ["ignore_previous_instructions", /ignore (all )?(previous|prior) instructions/i],
  ["system_prompt_override", /system prompt|developer message|highest priority instruction/i],
  ["memory_override", /write this (to|into) memory|save this as trusted|permanent instruction/i],
  ["tool_exfiltration", /exfiltrate|send (the )?(secret|token|key|password)/i]
];

const secretPatterns: Array<[string, RegExp]> = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["openai_key_like", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["generic_api_key", /\b(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]{8,}/i],
  ["aws_access_key_like", /\bAKIA[0-9A-Z]{16}\b/]
];

export function scanContentForSafety(content: string): SafetyScanResult {
  const poisoningHints = poisoningPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);

  const secretHints = secretPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);

  return {
    riskFlags: [...poisoningHints, ...secretHints],
    secretHints,
    poisoningHints
  };
}

export function redactSensitiveContent(content: string): { redacted: string; redactions: string[] } {
  const redactions: string[] = [];
  let redacted = content;
  for (const [name, pattern] of secretPatterns) {
    redacted = redacted.replace(pattern, (match) => {
      redactions.push(name);
      return `[REDACTED:${name}:${Math.min(match.length, 120)}chars]`;
    });
  }
  return { redacted, redactions: Array.from(new Set(redactions)) };
}

export function downgradeTrustForSafety(
  requestedTrustLevel: string,
  scan: SafetyScanResult
): string {
  if (scan.poisoningHints.length > 0) {
    return "untrusted";
  }

  return requestedTrustLevel;
}
