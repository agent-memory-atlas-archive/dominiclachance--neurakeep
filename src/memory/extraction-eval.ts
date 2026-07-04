import type { ExtractedMemory } from "./extractor.js";

export interface ExtractionScore {
  itemCount: number;
  deterministicItemCount: number;
  citationCoverage: number;
  overlapWithDeterministic: number;
  averageConfidence: number;
  gate: ExtractionGateResult;
  warnings: string[];
}

export interface ExtractionGateResult {
  passed: boolean;
  minCitationCoverage: number;
  minAverageConfidence: number;
  minOverlapWithDeterministic: number;
  reasons: string[];
}

export function scoreExtraction(candidate: ExtractedMemory, deterministic: ExtractedMemory): ExtractionScore {
  const candidateItems = flatten(candidate);
  const deterministicItems = flatten(deterministic);
  const cited = candidateItems.filter((item) => item.sourceIds.length > 0 && item.sectionIds.length > 0).length;
  const confidenceTotal = candidateItems.reduce((sum, item) => sum + item.confidence, 0);
  const deterministicKeys = new Set(deterministicItems.map((item) => item.key));
  const overlap = candidateItems.filter((item) => deterministicKeys.has(item.key)).length;
  const warnings: string[] = [];
  const citationCoverage = candidateItems.length > 0 ? cited / candidateItems.length : 1;
  const overlapWithDeterministic = deterministicItems.length > 0 ? overlap / deterministicItems.length : 1;
  if (citationCoverage < 1) {
    warnings.push("Some extracted items are missing source/section citations.");
  }
  if (candidateItems.length === 0) {
    warnings.push("Extractor returned no durable memory items.");
  }
  if (candidateItems.length > deterministicItems.length * 3 && deterministicItems.length > 0) {
    warnings.push("Extractor returned far more items than deterministic baseline; review for over-capture.");
  }
  const gate = gateExtraction({
    itemCount: candidateItems.length,
    deterministicItemCount: deterministicItems.length,
    citationCoverage,
    overlapWithDeterministic,
    averageConfidence: candidateItems.length > 0 ? confidenceTotal / candidateItems.length : 0
  });
  warnings.push(...gate.reasons);
  return {
    itemCount: candidateItems.length,
    deterministicItemCount: deterministicItems.length,
    citationCoverage,
    overlapWithDeterministic,
    averageConfidence: candidateItems.length > 0 ? confidenceTotal / candidateItems.length : 0,
    gate,
    warnings
  };
}

function gateExtraction(score: Omit<ExtractionScore, "gate" | "warnings">): ExtractionGateResult {
  const minCitationCoverage = 1;
  const minAverageConfidence = 0.55;
  const minOverlapWithDeterministic = score.deterministicItemCount > 0 ? 0.15 : 0;
  const reasons: string[] = [];
  if (score.citationCoverage < minCitationCoverage) {
    reasons.push(`Citation gate failed: ${(score.citationCoverage * 100).toFixed(0)}% cited.`);
  }
  if (score.averageConfidence < minAverageConfidence && score.itemCount > 0) {
    reasons.push(`Confidence gate warning: average confidence ${score.averageConfidence.toFixed(2)}.`);
  }
  if (score.overlapWithDeterministic < minOverlapWithDeterministic) {
    reasons.push(`Deterministic comparison warning: overlap ${score.overlapWithDeterministic.toFixed(2)}.`);
  }
  if (score.itemCount > Math.max(15, score.deterministicItemCount * 4) && score.deterministicItemCount > 0) {
    reasons.push("Volume gate warning: extractor returned too many items relative to deterministic baseline.");
  }
  return {
    passed: !reasons.some((reason) => reason.includes("failed")),
    minCitationCoverage,
    minAverageConfidence,
    minOverlapWithDeterministic,
    reasons
  };
}

function flatten(memory: ExtractedMemory): Array<{
  key: string;
  sourceIds: string[];
  sectionIds: string[];
  confidence: number;
}> {
  return [
    ...memory.events.map((item) => ({
      key: `event:${normalize(item.summary)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence
    })),
    ...memory.facts.map((item) => ({
      key: `fact:${normalize(item.subject)}|${normalize(item.predicate)}|${normalize(item.object)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence
    })),
    ...memory.failures.map((item) => ({
      key: `failure:${normalize(item.attempted)}|${normalize(item.doNotRepeat)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence
    }))
  ];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
