/**
 * testSuggester.ts — Generates test case suggestions based on the MR diff.
 *
 * After the main review is complete, makes a lightweight AI call to suggest
 * 3-5 unit test cases focusing on edge cases and failure scenarios.
 *
 * Uses a cheaper/faster model (gpt-4o-mini) with a small token budget.
 * On failure, returns an empty array — test suggestions are non-critical.
 */

import { openaiChatCompletion } from '../ai/openaiClient';
import { DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

export interface TestSuggestion {
  description: string;
}

const TEST_SUGGESTION_SYSTEM_PROMPT = `You are a senior QA engineer. Given a code diff from a merge request, suggest 3-5 unit test cases that focus on:
- Edge cases and boundary conditions
- Failure scenarios and error handling
- Null/empty inputs
- Concurrency or race conditions (if applicable)
- Data integrity edge cases

Return ONLY valid JSON. Do NOT include markdown, code blocks, or explanations.
Return JSON in this exact format:
[
  { "description": "Test case description here" }
]

Keep descriptions concise but specific (1-2 sentences each).
Focus on the CHANGED code, not existing code.
If the diff is trivial (config changes, imports only), return an empty array: []`;

/**
 * Generates test case suggestions from the MR diff.
 *
 * @param diffChunks The MR's diff chunks (all files).
 * @returns Array of test suggestions, or [] on failure.
 */
export async function generateTestSuggestions(
  diffChunks: DiffChunk[]
): Promise<TestSuggestion[]> {
  try {
    // Build a condensed diff summary for the prompt (cap at ~4000 chars to keep it cheap)
    const diffSummary = diffChunks
      .map((c) => {
        const truncatedDiff = c.diff.substring(0, 800);
        return `### ${c.filePath}${c.isNewFile ? ' (NEW)' : ''}\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
      })
      .join('\n\n')
      .substring(0, 4000);

    const userMessage = `Based on the following merge request diff, suggest unit test cases:\n\n${diffSummary}`;

    const result = await openaiChatCompletion(
      [
        { role: 'system', content: TEST_SUGGESTION_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      {
        model: config.openai.reviewModel, // Use the same lightweight model
        temperature: 0.3,
        maxTokens: 1024,
      }
    );

    // Parse the JSON response
    const parsed = parseTestSuggestions(result.content);

    logger.info('Generated test suggestions', {
      count: parsed.length,
      tokens: result.usage.totalTokens,
    });

    return parsed;
  } catch (error) {
    // Non-critical: log and return empty
    logger.warn('Test suggestion generation failed, skipping', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Parse the AI response into structured test suggestions.
 * Handles common LLM quirks: markdown fences, extra text.
 */
function parseTestSuggestions(content: string): TestSuggestion[] {
  try {
    // Strip markdown code fences if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      logger.warn('Test suggestion response is not an array');
      return [];
    }

    // Validate and sanitize each suggestion
    return parsed
      .filter(
        (item: unknown): item is { description: string } =>
          typeof item === 'object' &&
          item !== null &&
          'description' in item &&
          typeof (item as { description: unknown }).description === 'string'
      )
      .map((item) => ({ description: item.description.trim() }))
      .slice(0, 5); // Cap at 5 suggestions
  } catch (error) {
    logger.warn('Failed to parse test suggestions JSON', {
      error: (error as Error).message,
      contentPreview: content.substring(0, 200),
    });
    return [];
  }
}
