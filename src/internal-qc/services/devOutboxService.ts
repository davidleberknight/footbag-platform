// ---- Dev-only ----
// Dev outbox viewer: surfaces in-memory messages from StubSesAdapter so that
// a developer on localhost can complete email-gated flows (activation, password
// reset) without bypassing the adapter seam. Throws NotFoundError when SES_ADAPTER
// is not 'stub' — the controller maps that to 404.

import { getSesAdapter, getStubSesAdapterForTests } from '../../adapters/sesAdapter';
import { operationsPlatformService } from '../../services/operationsPlatformService';
import { NotFoundError } from '../../services/serviceErrors';
import { PageViewModel } from '../../types/page';

interface DevOutboxMessageViewModel {
  to:          string;
  from:        string;
  subject:     string;
  bodyText:    string;
  messageId:   string;
  deliveredAt: string;
  firstUrl:    string | null;
}

interface DevOutboxContent {
  messages: DevOutboxMessageViewModel[];
}

const URL_PATTERN = /https?:\/\/\S+/;

export const devOutboxService = {
  async getDevOutboxPage(): Promise<PageViewModel<DevOutboxContent>> {
    // Force adapter init: getStubSesAdapterForTests() returns null until
    // getSesAdapter() has run at least once, which would 404 this route
    // on a fresh server with no prior email dispatch. getSesAdapter() is
    // idempotent, so calling it here is safe when the stub is already live.
    getSesAdapter();
    const stub = getStubSesAdapterForTests();
    if (!stub) {
      throw new NotFoundError('dev outbox is disabled when SES_ADAPTER is not stub');
    }

    // Drain any pending rows in outbox_emails through the stub adapter so
    // a localhost developer sees their verify/reset mail without having to
    // run the worker process separately. Safe because we only reach here
    // when SES_ADAPTER=stub: the adapter is in-process with no network calls.
    await operationsPlatformService.runEmailWorker();

    const messages: DevOutboxMessageViewModel[] = [...stub.sentMessages]
      .reverse()
      .map((m) => {
        const match = m.bodyText.match(URL_PATTERN);
        return {
          to:          m.to,
          from:        m.from ?? '(default)',
          subject:     m.subject,
          bodyText:    m.bodyText,
          messageId:   m.messageId,
          deliveredAt: m.deliveredAt,
          firstUrl:    match ? match[0] : null,
        };
      });

    return {
      seo:  { title: 'Dev Outbox' },
      page: { sectionKey: '', pageKey: 'dev_outbox', title: 'Dev Outbox' },
      content: { messages },
    };
  },
};
