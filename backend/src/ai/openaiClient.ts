import OpenAI from 'openai';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

// --- Singleton OpenAI client ---

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
      maxRetries: 0, // We handle retries ourselves for better logging
    });
  }
  return client;
}

// --- Concurrency control ---

let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < config.openai.maxConcurrency) {
    activeRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    requestQueue.push({ resolve });
  });
}

function releaseSlot(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) {
    activeRequests++;
    next.resolve();
  }
}

// --- Retry with exponential backoff ---

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    // 429 = rate limit, 500/502/503 = server errors
    return error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503;
  }
  // Network errors
  if (error instanceof Error) {
    return error.message.includes('ECONNRESET') ||
           error.message.includes('ETIMEDOUT') ||
           error.message.includes('ECONNREFUSED');
  }
  return false;
}

function getRetryDelay(attempt: number, error: unknown): number {
  // Respect Retry-After header for 429s
  if (error instanceof OpenAI.APIError && error.status === 429) {
    const retryAfter = error.headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
  }
  // Exponential backoff: 1s, 2s, 4s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

export function formatOpenAIError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return 'Invalid OpenAI API key. Check OPENAI_API_KEY in your .env file.';
    }
    if (error.status === 429) {
      return 'OpenAI rate limit exceeded. Please wait and try again.';
    }
    if (error.status === 500 || error.status === 502 || error.status === 503) {
      return 'OpenAI service temporarily unavailable. Please try again.';
    }
    return `OpenAI API error (${error.status}): ${error.message}`;
  }
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return 'Unable to reach OpenAI API. Check your network connection.';
    }
    return error.message;
  }
  return 'Unknown OpenAI error';
}

// --- Public API: Chat completion with retry ---

export interface ChatCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export async function openaiChatCompletion(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: OpenAI.ChatCompletionCreateParams['response_format'];
  }
): Promise<ChatCompletionResult> {
  const model = options?.model || config.openai.reviewModel;

  await acquireSlot();
  try {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`OpenAI retry attempt ${attempt}/${MAX_RETRIES}`, { model });
        }

        const response = await getOpenAIClient().chat.completions.create({
          model,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 4096,
          ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
        });

        const choice = response.choices[0];
        if (!choice || !choice.message.content) {
          throw new Error('OpenAI returned empty response');
        }

        return {
          content: choice.message.content,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
          model: response.model,
        };
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = getRetryDelay(attempt, error);
          logger.warn(`OpenAI request failed, retrying in ${delay}ms`, {
            attempt,
            error: formatOpenAIError(error),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    const msg = formatOpenAIError(lastError);
    logger.error('OpenAI chat completion failed after retries', { error: msg, model });
    throw new Error(msg);
  } finally {
    releaseSlot();
  }
}

// --- Public API: Embeddings with retry ---

export interface EmbeddingResult {
  embedding: number[];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export async function openaiEmbed(
  text: string,
  model?: string
): Promise<EmbeddingResult> {
  const embeddingModel = model || config.openai.embeddingModel;

  await acquireSlot();
  try {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`OpenAI embedding retry attempt ${attempt}/${MAX_RETRIES}`);
        }

        const response = await getOpenAIClient().embeddings.create({
          model: embeddingModel,
          input: text,
        });

        const data = response.data[0];
        if (!data || !data.embedding || data.embedding.length === 0) {
          throw new Error('OpenAI returned empty embedding');
        }

        return {
          embedding: data.embedding,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
        };
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = getRetryDelay(attempt, error);
          logger.warn(`OpenAI embedding failed, retrying in ${delay}ms`, {
            attempt,
            error: formatOpenAIError(error),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    const msg = formatOpenAIError(lastError);
    logger.error('OpenAI embedding failed after retries', { error: msg });
    throw new Error(msg);
  } finally {
    releaseSlot();
  }
}
