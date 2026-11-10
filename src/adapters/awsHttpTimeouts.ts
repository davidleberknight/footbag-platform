/**
 * Connection and inactivity limits for every AWS SDK client the adapters build.
 *
 * Without them a client waits on a stalled connection with no end, holding the
 * page request or background job that made the call. The limit is on
 * inactivity rather than on the whole request, so a large media upload that
 * keeps sending is never cut off, while a peer that goes silent is. The SDK's
 * whole-request limit is not used: unless separately told to throw, it only
 * prints a warning, and through the console rather than the logger.
 */
export const AWS_CONNECTION_TIMEOUT_MS = 3_000;
export const AWS_SOCKET_TIMEOUT_MS = 15_000;

/** Above the queue's 20-second long poll, during which it sends nothing. */
export const SQS_SOCKET_TIMEOUT_MS = 30_000;

export interface AwsRequestHandlerLimits {
  connectionTimeout: number;
  socketTimeout: number;
}

/** The `requestHandler` option every adapter passes when it builds an SDK client. */
export function awsRequestHandler(socketTimeoutMs: number = AWS_SOCKET_TIMEOUT_MS): AwsRequestHandlerLimits {
  return { connectionTimeout: AWS_CONNECTION_TIMEOUT_MS, socketTimeout: socketTimeoutMs };
}
