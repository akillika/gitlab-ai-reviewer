/**
 * mrSummaryService.ts — Generates structured AI summaries of merge requests.
 *
 * Produces three perspectives:
 * - technical_summary: What changed technically (files, patterns, approach)
 * - business_summary: What this means for the product/users (non-technical)
 * - risk_summary: Potential risks, regressions, and areas needing attention
 *
 * Also generates a concise one-liner suitable for release notes.
 * Uses a lightweight AI call with condensed diff context.
 */

import { openaiChatCompletion } from '../ai/openaiClient';
import { DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';

// --- Types ---

export interface MRSummary {
  technical_summary: string;
  business_summary: string;
  risk_summary: string;
  release_note: string;
}

// --- Summary generation ---

/**
 * Generate a structured MR summary using AI.
 *
 * @param diffChunks  The changed files with diffs.
 * @param mrTitle     The MR title.
 * @param mrDescription  The MR description (optional).
 * @returns Structured summary, or null if generation fails.
 */
export async function generateMRSummary(
  diffChunks: DiffChunk[],
  mrTitle: string,
  mrDescription?: string
): Promise<MRSummary | null> {
  try {
    // Build condensed diff context (limit to stay within token budget)
    const MAX_TOTAL_CHARS = 6000;
    const MAX_PER_FILE_CHARS = 1200;
    let totalChars = 0;

    const fileSummaries: string[] = [];
    for (const chunk of diffChunks) {
      if (totalChars >= MAX_TOTAL_CHARS) break;

      const available = Math.min(MAX_PER_FILE_CHARS, MAX_TOTAL_CHARS - totalChars);
      const truncatedDiff = chunk.diff.length > available
        ? chunk.diff.substring(0, available) + '\n... (truncated)'
        : chunk.diff;

      const label = chunk.isNewFile ? ' (new file)' : chunk.isDeletedFile ? ' (deleted)' : '';
      fileSummaries.push(`### ${chunk.filePath}${label}\n${truncatedDiff}`);
      totalChars += truncatedDiff.length;
    }

    const diffContext = fileSummaries.join('\n\n');

    const systemPrompt = `You are a senior software engineer writing a merge request summary.
Given the MR title, description, and code changes, produce a structured summary.

Respond in valid JSON with exactly these fields:
{
  "technical_summary": "2-4 sentences describing what changed technically. Mention specific files, patterns, architectural changes.",
  "business_summary": "1-3 sentences describing the user-facing or business impact in non-technical language. If purely infrastructure/refactoring, say so.",
  "risk_summary": "1-3 sentences about potential risks, edge cases, or areas that need testing. Be specific.",
  "release_note": "One concise sentence suitable for a changelog/release note. Start with a verb (Added, Fixed, Updated, Removed, etc.)."
}

Guidelines:
- Be concise and specific. No filler words.
- technical_summary: focus on architecture, patterns, what was added/changed/removed.
- business_summary: translate to stakeholder language. What does this mean for users?
- risk_summary: identify potential regressions, missing edge cases, performance concerns.
- release_note: one sentence, present tense, suitable for a CHANGELOG.`;

    const userPrompt = `MR Title: ${mrTitle}
${mrDescription ? `MR Description: ${mrDescription}\n` : ''}
Changed files (${diffChunks.length} total):
${diffChunks.map((c) => `- ${c.filePath}${c.isNewFile ? ' (new)' : c.isDeletedFile ? ' (deleted)' : ''}`).join('\n')}

Diff context:
${diffContext}`;

    const result = await openaiChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 800,
        responseFormat: { type: 'json_object' },
      }
    );

    const parsed = parseSummaryResponse(result.content);
    if (!parsed) {
      logger.warn('Failed to parse MR summary response', {
        rawContent: result.content.substring(0, 200),
      });
      return null;
    }

    logger.info('MR summary generated', {
      technicalLen: parsed.technical_summary.length,
      businessLen: parsed.business_summary.length,
      riskLen: parsed.risk_summary.length,
      releaseNoteLen: parsed.release_note.length,
    });

    return parsed;
  } catch (error) {
    logger.warn('MR summary generation failed (non-critical)', {
      error: (error as Error).message,
    });
    return null;
  }
}

// --- Response parsing ---

function parseSummaryResponse(content: string): MRSummary | null {
  try {
    // Strip markdown code fences if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.technical_summary !== 'string' ||
      typeof parsed.business_summary !== 'string' ||
      typeof parsed.risk_summary !== 'string' ||
      typeof parsed.release_note !== 'string'
    ) {
      return null;
    }

    return {
      technical_summary: parsed.technical_summary.trim(),
      business_summary: parsed.business_summary.trim(),
      risk_summary: parsed.risk_summary.trim(),
      release_note: parsed.release_note.trim(),
    };
  } catch {
    return null;
  }
}
