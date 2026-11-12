/**
 * Every AWS SDK client the adapters build gives up on a peer that goes silent.
 *
 * What carries the risk: a client built without limits waits on a stalled
 * connection with no end, holding the page request or background job that
 * made the call, and the next adapter added copies the client it sits beside.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQSClient, ListQueuesCommand } from '@aws-sdk/client-sqs';
import { SESv2Client, GetAccountCommand } from '@aws-sdk/client-sesv2';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

import { awsRequestHandler, SQS_SOCKET_TIMEOUT_MS } from '../../src/adapters/awsHttpTimeouts';
import { createLiveNotificationFeedAdapter } from '../../src/adapters/notificationFeedAdapter';
import { listFiles, REPO_ROOT } from '../fixtures/sourceTree';

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** A peer that accepts the connection and then never answers. */
async function silentPeer(onConnect?: () => void): Promise<number> {
  server = createServer((s) => { sockets.push(s); onConnect?.(); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return addr.port;
}

describe('the AWS client limits', () => {
  // Defect caught: a client given the shared limits still waits on a silent
  // peer, so a stalled AWS endpoint hangs the request that called it.
  it('ends a call to a peer that accepts and never answers, with a timeout error', async () => {
    const port = await silentPeer();
    const client = new SQSClient({
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${port}`,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxAttempts: 1,
      requestHandler: awsRequestHandler(250),
    });
    await expect(client.send(new ListQueuesCommand({}))).rejects.toMatchObject({ name: 'TimeoutError' });
    client.destroy();
  });

  // Defect caught: a mail or storage SDK that reads the handler limits
  // differently from the queue SDK, so a silent SES holds a send or a silent
  // S3 holds a page that serves media.
  it('ends a mail call and a storage call to a silent peer the same way', async () => {
    const port = await silentPeer();
    const common = {
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${port}`,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxAttempts: 1,
      requestHandler: awsRequestHandler(250),
    };
    const ses = new SESv2Client(common);
    const s3 = new S3Client({ ...common, forcePathStyle: true });
    await expect(ses.send(new GetAccountCommand({}))).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(s3.send(new HeadObjectCommand({ Bucket: 'b', Key: 'k' }))).rejects.toMatchObject({ name: 'TimeoutError' });
    ses.destroy();
    s3.destroy();
  });

  // Defect caught: the feed's delete ignores the worker's shutdown signal, so a
  // stop waits out the whole queue socket limit on a silent queue.
  it('ends a queue delete when the worker shuts down, before the socket limit', async () => {
    const shutdown = new AbortController();
    const port = await silentPeer(() => shutdown.abort());
    const client = new SQSClient({
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${port}`,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxAttempts: 1,
      requestHandler: awsRequestHandler(SQS_SOCKET_TIMEOUT_MS),
    });
    const feed = createLiveNotificationFeedAdapter({ region: 'us-east-1', sqsClient: client });
    await expect(
      feed.deleteMessage(`http://127.0.0.1:${port}/000000000000/q`, 'rh', { abortSignal: shutdown.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    client.destroy();
  });

  // Defect caught: a queue limit at or under the 20-second long poll, so every
  // empty poll is cut off as a failure.
  it('gives the queue client longer than its long poll', () => {
    expect(SQS_SOCKET_TIMEOUT_MS).toBeGreaterThan(20_000);
    expect(awsRequestHandler(SQS_SOCKET_TIMEOUT_MS).socketTimeout).toBe(SQS_SOCKET_TIMEOUT_MS);
  });

  // Defect caught: an adapter that builds an SDK client without the shared
  // limits, which nothing at run time would notice until AWS stalls.
  it('is passed by every SDK client an adapter constructs', () => {
    let total = 0;
    for (const file of listFiles('src/adapters', /\.ts$/)) {
      const src = readFileSync(join(REPO_ROOT, 'src/adapters', file), 'utf-8');
      // The client classes this file imports from the SDK, so a client of
      // another kind (Stripe, a fetch wrapper) is not counted.
      const classes = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@aws-sdk\/client-[a-z0-9-]+'/g)]
        .flatMap((m) => m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!))
        .filter((n) => /Client$/.test(n));
      if (classes.length === 0) continue;
      const constructed = [...src.matchAll(new RegExp(`new (${classes.join('|')})\\(`, 'g'))].length;
      const limited = [...src.matchAll(/requestHandler: awsRequestHandler\(/g)].length;
      expect(limited, `${file}: ${constructed} SDK client(s) built, ${limited} with the shared limits`).toBe(constructed);
      total += constructed;
    }
    expect(total, 'no SDK client construction found under src/adapters').toBeGreaterThan(0);
  });
});
