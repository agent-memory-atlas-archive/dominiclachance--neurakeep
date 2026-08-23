import type { ExtractedMemory } from "./extractor.js";

export interface ExtractionScore {
  itemCount: number;
  deterministicItemCount: number;
  typeCounts: {
    events: number;
    facts: number;
    failures: number;
  };
  citationCoverage: number;
  overlapWithDeterministic: number;
  averageConfidence: number;
  qualitySignals: {
    actionableItems: number;
    whyThisMattersItems: number;
    lowConfidenceItems: number;
    duplicateKeys: number;
    noisyFactCandidates: number;
  };
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
  const duplicateKeys = candidateItems.length - new Set(candidateItems.map((item) => item.key)).size;
  const lowConfidenceItems = candidateItems.filter((item) => item.confidence < 0.55).length;
  const actionableItems = candidateItems.filter((item) => item.actionable).length;
  const whyThisMattersItems = candidateItems.filter((item) => item.whyThisMatters).length;
  const noisyFactCandidates = candidateItems.filter((item) => item.noisyFactCandidate).length;
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
  if (duplicateKeys > 0) {
    warnings.push(`Extractor returned ${duplicateKeys} duplicate item keys before cleanup.`);
  }
  if (noisyFactCandidates > 0) {
    warnings.push(`Extractor returned ${noisyFactCandidates} low-value fact candidates.`);
  }
  if (candidateItems.length > 0 && whyThisMattersItems / candidateItems.length < 0.4) {
    warnings.push("Extraction has weak 'why this matters' coverage; add clearer consequences or do-not-repeat guidance before applying.");
  }
  const gate = gateExtraction({
    itemCount: candidateItems.length,
    deterministicItemCount: deterministicItems.length,
    typeCounts: {
      events: candidate.events.length,
      facts: candidate.facts.length,
      failures: candidate.failures.length
    },
    citationCoverage,
    overlapWithDeterministic,
    averageConfidence: candidateItems.length > 0 ? confidenceTotal / candidateItems.length : 0,
    qualitySignals: {
      actionableItems,
      whyThisMattersItems,
      lowConfidenceItems,
      duplicateKeys,
      noisyFactCandidates
    }
  });
  warnings.push(...gate.reasons);
  return {
    itemCount: candidateItems.length,
    deterministicItemCount: deterministicItems.length,
    typeCounts: {
      events: candidate.events.length,
      facts: candidate.facts.length,
      failures: candidate.failures.length
    },
    citationCoverage,
    overlapWithDeterministic,
    averageConfidence: candidateItems.length > 0 ? confidenceTotal / candidateItems.length : 0,
    qualitySignals: {
      actionableItems,
      whyThisMattersItems,
      lowConfidenceItems,
      duplicateKeys,
      noisyFactCandidates
    },
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
  actionable: boolean;
  whyThisMatters: boolean;
  noisyFactCandidate: boolean;
}> {
  return [
    ...memory.events.map((item) => ({
      key: `event:${normalize(item.summary)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence,
      actionable: /\b(decision|decided|implemented|deployed|fixed|created|verified|must|should|next|todo|ship|launch)\b/i.test(item.summary),
      whyThisMatters: /\b(because|so that|avoid|prevent|risk|impact|blocked|failed|do not|must|should)\b/i.test(item.summary),
      noisyFactCandidate: false
    })),
    ...memory.facts.map((item) => ({
      key: `fact:${normalize(item.subject)}|${normalize(item.predicate)}|${normalize(item.object)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence,
      actionable: /\b(must|should|requires|use|points to|configured|enabled|verified|current|latest)\b/i.test(`${item.predicate} ${item.object}`),
      whyThisMatters: /\b(because|so that|avoid|prevent|risk|impact|blocked|failed|do not|must|requires|current|verified)\b/i.test(`${item.subject} ${item.predicate} ${item.object}`),
      noisyFactCandidate: isNoisyFactCandidate(item.subject, item.object)
    })),
    ...memory.failures.map((item) => ({
      key: `failure:${normalize(item.attempted)}|${normalize(item.doNotRepeat)}`,
      sourceIds: item.sourceIds,
      sectionIds: item.sectionIds,
      confidence: item.confidence,
      actionable: true,
      whyThisMatters: true,
      noisyFactCandidate: false
    }))
  ];
}

function isNoisyFactCandidate(subject: string, object: string): boolean {
  const cleanSubject = normalize(subject);
  const cleanObject = normalize(object);
  if (cleanSubject === "source" && /^https?:\/\//i.test(object)) return true;
  if (/^(this|that|it|thing|note|notes?)$/.test(cleanSubject)) return true;
  if (/^(yes|no|ok|todo|tbd|n\/a)$/.test(cleanObject)) return true;
  return cleanObject.length < 8 || cleanSubject.length < 3;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
