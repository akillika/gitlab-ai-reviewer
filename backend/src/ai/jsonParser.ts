import { logger } from '../utils/logger';
import { AIReviewComment } from './types';
import { openaiChatCompletion } from './openaiClient';

/**
 * Extracts and validates a JSON array of review comments from raw LLM output.
 *
 * OpenAI models are much more reliable than local models at producing valid JSON,
 * especially with response_format: { type: "json_object" }. However, we still
 * handle edge cases: markdown fences, preamble text, etc.
 */
export function extractJsonArray(rawText: string): AIReviewComment[] {
  let text = rawText.trim();

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Extract the first JSON array from the text
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error('No JSON array found in response');
  }

  text = text.substring(arrayStart, arrayEnd + 1);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    logger.warn('JSON.parse failed', {
      error: (parseErr as Error).message,
      textPreview: text.substring(0, 300),
    });
    throw new Error(`Invalid JSON: ${(parseErr as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Parsed JSON is not an array');
  }

  // Validate and normalize each item
  return parsed
    .filter((item: unknown): item is Record<string, unknown> => {
      if (typeof item !== 'object' || item === null) return false;
      const obj = item as Record<string, unknown>;
      return (
        typeof obj.file_path === 'string' &&
        (typeof obj.line_number === 'number' || typeof obj.line_number === 'string') &&
        typeof obj.severity === 'string' &&
        typeof obj.comment === 'string'
      );
    })
    .filter((item) => {
      const lineNum = Number(item.line_number);
      if (isNaN(lineNum) || lineNum <= 0) {
        logger.warn('Skipping comment with invalid line number', {
          filePath: item.file_path,
          lineNumber: item.line_number,
        });
        return false;
      }
      return true;
    })
    .map((item) => ({
      file_path: String(item.file_path).replace(/^\//, ''),
      line_number: Math.round(Number(item.line_number)),
      severity: (['major', 'minor', 'suggestion'].includes(String(item.severity).toLowerCase())
        ? String(item.severity).toLowerCase()
        : 'suggestion') as AIReviewComment['severity'],
      comment: String(item.comment),
    }));
}

/**
 * Parses AI response with one retry on failure.
 * If the first parse fails, sends a clarification prompt to OpenAI.
 */
export async function parseAIResponseWithRetry(responseText: string): Promise<AIReviewComment[]> {
  // Attempt 1: Parse directly
  try {
    const comments = extractJsonArray(responseText);
    return comments;
  } catch (firstError) {
    logger.warn('First JSON parse attempt failed, retrying with clarification prompt', {
      error: (firstError as Error).message,
      responsePreview: responseText.substring(0, 200),
    });
  }

  // Attempt 2: Ask OpenAI to fix its output
  try {
    const result = await openaiChatCompletion(
      [
        {
          role: 'system',
          content: 'You are a JSON repair assistant. Fix the invalid JSON and return only valid JSON.',
        },
        {
          role: 'user',
          content: `The following text was supposed to be a valid JSON array of code review comments, but it failed to parse. Fix it and return ONLY the corrected JSON array. No explanation, no markdown.\n\nBroken output:\n${responseText.substring(0, 2000)}`,
        },
      ],
      {
        temperature: 0,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
      }
    );

    // The response_format: json_object wraps in an object, so handle both cases
    const fixedText = result.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fixedText);
    } catch {
      throw new Error('Retry response is also invalid JSON');
    }

    // If wrapped in an object like { "comments": [...] }, extract the array
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const values = Object.values(parsed as Record<string, unknown>);
      const arrayValue = values.find((v) => Array.isArray(v));
      if (arrayValue) {
        parsed = arrayValue;
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Retry response does not contain an array');
    }

    const comments = extractJsonArray(JSON.stringify(parsed));
    logger.info('JSON parse succeeded on retry', { commentCount: comments.length });
    return comments;
  } catch (retryError) {
    logger.error('JSON parse failed after retry', {
      error: (retryError as Error).message,
      originalResponsePreview: responseText.substring(0, 300),
    });
    // Return empty instead of crashing — partial review is better than no review
    logger.warn('Returning empty comments for this batch due to parse failure');
    return [];
  }
}
