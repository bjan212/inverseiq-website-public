import { invokeLLM } from "../_core/llm";

export type GrokVeto = {
  veto: true;
  citedFactor: string;
  reason: string;
};

/**
 * Accept only the exact JSON veto contract and a character-for-character factor
 * citation from the signal engine. Any malformed or non-veto response fails open.
 */
export function parseGrokVeto(raw: string, factors: string[]): GrokVeto | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== 3 ||
    !keys.includes("veto") ||
    !keys.includes("citedFactor") ||
    !keys.includes("reason") ||
    candidate.veto !== true ||
    typeof candidate.citedFactor !== "string" ||
    candidate.citedFactor.length === 0 ||
    !factors.includes(candidate.citedFactor) ||
    typeof candidate.reason !== "string" ||
    candidate.reason.trim().length === 0
  ) {
    return null;
  }

  return {
    veto: true,
    citedFactor: candidate.citedFactor,
    reason: candidate.reason.trim(),
  };
}

/**
 * Read a narrow veto against engine-provided evidence only. Provider errors and
 * malformed output never replace, change, or suppress the engine signal.
 */
export async function requestGrokVeto(
  symbol: string,
  direction: "LONG" | "SHORT",
  factors: string[]
): Promise<GrokVeto | null> {
  try {
    const response = await invokeLLM({
      maxTokens: 240,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a narrow risk-veto reader. Do not score the signal or propose or alter direction, prices, targets, stops, validity, or CONFLUENCE_SCORE. Return only a JSON object with exactly these keys: {"veto":false,"citedFactor":"","reason":""} when no listed factor clearly invalidates the setup, or {"veto":true,"citedFactor":"...","reason":"..."} when one listed factor clearly does. For veto=true, citedFactor must be copied exactly, character-for-character, from the supplied factor list. Do not use any other evidence.',
        },
        {
          role: "user",
          content: `Signal: ${symbol} ${direction}\nAccuracy factors (JSON strings):\n${JSON.stringify(factors)}\nIf a factor supports a decisive veto, copy that factor exactly into citedFactor. Otherwise return veto=false.`,
        },
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    return parseGrokVeto(typeof content === "string" ? content : "", factors);
  } catch {
    // Fail open: a provider outage must not mutate the engine's result.
    return null;
  }
}
