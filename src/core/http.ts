import { logger } from './logger.js';

type RetryFetchOptions = {
  timeoutMs: number;
  maxRetries: number;
  label: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryFetchOptions
): Promise<Response> {
  const totalAttempts = options.maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      logger.debug(`[${options.label}] attempt ${attempt}/${totalAttempts}`);
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok || !shouldRetry(response.status) || attempt === totalAttempts) {
        return response;
      }

      const backoffMs = 250 * Math.pow(2, attempt - 1);
      logger.warn(
        `[${options.label}] retrying after status ${response.status}, waiting ${backoffMs}ms`
      );
      await wait(backoffMs);
    } catch (error: unknown) {
      clearTimeout(timeout);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isLastAttempt = attempt === totalAttempts;
      if (isLastAttempt) {
        throw error;
      }
      const backoffMs = 250 * Math.pow(2, attempt - 1);
      logger.warn(
        `[${options.label}] ${isAbort ? 'timeout' : 'network error'} on attempt ${attempt}, waiting ${backoffMs}ms`
      );
      await wait(backoffMs);
    }
  }

  throw new Error(`[${options.label}] unexpected retry flow termination`);
}
