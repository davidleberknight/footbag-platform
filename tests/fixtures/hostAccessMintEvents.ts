/**
 * CloudTrail events for Lightsail's GetInstanceAccessDetails, as
 * `cloudtrail lookup-events` returns them: each event is a JSON string in
 * `Events[].CloudTrailEvent`.
 *
 * `CAPTURED_PRODUCTION_EVENT` is a real event captured on 2026-11-09 from
 * production's trail, with the account id and the source address replaced by
 * documentation placeholders. It shows the instance recorded under
 * `requestParameters.instanceName` and the response not logged, and it was made
 * before any minting script carried an application id, so it is the shape of an
 * unattributed mint.
 *
 * `CAPTURED_ATTRIBUTED_EVENT` is a real event captured on 2026-11-16 from the
 * trail: a staging pin rebuild by `scripts/install-known-hosts.sh`, with the
 * account id, principal id, access key id and source address replaced by
 * documentation placeholders. It shows how CloudTrail records the `app/<id>`
 * token `AWS_SDK_UA_APP_ID` adds: inside the user agent, followed by further
 * tokens, not at its end.
 *
 * Every other event here is SYNTHETIC: built from one of those captures,
 * changing only the fields under test. An attributed event keeps the token
 * where the capture has it and changes only the id.
 */

const ACCOUNT = '111122223333';
const OPERATOR = {
  type: 'IAMUser',
  principalId: 'AIDAEXAMPLE',
  arn: `arn:aws:iam::${ACCOUNT}:user/footbag-operator`,
  accountId: ACCOUNT,
  userName: 'footbag-operator',
};
const CLI_AGENT =
  'aws-cli/2.34.8 md/awscrt#0.31.2 ua/2.1 os/linux#6.18.54.1-microsoft-standard-WSL2 md/arch#x86_64 '
  + 'lang/python#3.13.11 md/pyimpl#CPython m/Z,b,n,E cfg/retry-mode#standard md/installer#exe '
  + 'md/distrib#ubuntu.22 sid/0ed5b8b6f27d md/prompt#off md/command#lightsail.get-instance-access-details';

export const CAPTURED_PRODUCTION_EVENT = {
  eventVersion: '1.11',
  userIdentity: OPERATOR,
  eventTime: '2026-11-09T00:07:34Z',
  eventSource: 'lightsail.amazonaws.com',
  eventName: 'GetInstanceAccessDetails',
  awsRegion: 'us-east-1',
  sourceIPAddress: '203.0.113.10',
  userAgent: CLI_AGENT,
  requestParameters: { instanceName: 'footbag-production-web' },
  responseElements: null,
  readOnly: true,
  eventType: 'AwsApiCall',
  managementEvent: true,
  recipientAccountId: ACCOUNT,
  eventCategory: 'Management',
};

const CAPTURED_APP_ID = 'footbag-install-known-hosts';
const ATTRIBUTED_AGENT =
  'aws-cli/2.36.36 md/awscrt#0.36.2 ua/2.1 os/linux#6.8.0-149-generic md/arch#x86_64 '
  + 'lang/python#3.14.6 md/pyimpl#CPython m/Z,E,n,b cfg/retry-mode#standard '
  + `app/${CAPTURED_APP_ID} md/installer#exe sid/e440b300e1b4 md/distrib#ubuntu.24 `
  + 'md/prompt#off md/command#lightsail.get-instance-access-details';

export const CAPTURED_ATTRIBUTED_EVENT = {
  eventVersion: '1.11',
  userIdentity: { ...OPERATOR, accessKeyId: 'ASIAIOSFODNN7EXAMPLE' },
  eventTime: '2026-11-16T00:45:05Z',
  eventSource: 'lightsail.amazonaws.com',
  eventName: 'GetInstanceAccessDetails',
  awsRegion: 'us-east-1',
  sourceIPAddress: '203.0.113.10',
  userAgent: ATTRIBUTED_AGENT,
  requestParameters: { instanceName: 'footbag-staging-web', protocol: 'ssh' },
  responseElements: null,
  requestID: '45dc31f8-f607-4e77-8df1-adfc77c5af64',
  eventID: 'c941a8ae-d25c-4d86-8435-82acc3e74d95',
  readOnly: true,
  eventType: 'AwsApiCall',
  managementEvent: true,
  recipientAccountId: ACCOUNT,
  eventCategory: 'Management',
  tlsDetails: {
    tlsVersion: 'TLSv1.3',
    cipherSuite: 'TLS_AES_128_GCM_SHA256',
    clientProvidedHostHeader: 'lightsail.us-east-1.amazonaws.com',
  },
};

type MintEvent = Record<string, unknown>;

/**
 * SYNTHETIC: a captured event with the fields under test replaced. An event
 * with an application id starts from the attributed capture; any other from
 * the unattributed one.
 */
export function mintEvent(overrides: {
  time?: string;
  instance?: string | null;
  appId?: string | null;
  errorCode?: string;
  arn?: string;
  userAgent?: string | null;
  /** An identity record carrying a principal id and no ARN. */
  noArn?: boolean;
}): MintEvent {
  const event: MintEvent = overrides.appId
    ? {
      ...CAPTURED_ATTRIBUTED_EVENT,
      userAgent: ATTRIBUTED_AGENT.replace(`app/${CAPTURED_APP_ID}`, `app/${overrides.appId}`),
    }
    : { ...CAPTURED_PRODUCTION_EVENT };
  if (overrides.time) event.eventTime = overrides.time;
  if (overrides.instance === null) delete event.requestParameters;
  else if (overrides.instance) {
    event.requestParameters = { ...(event.requestParameters as object), instanceName: overrides.instance };
  }
  if (overrides.userAgent === null) delete event.userAgent;
  else if (overrides.userAgent !== undefined) event.userAgent = overrides.userAgent;
  if (overrides.arn) {
    event.userIdentity = {
      type: 'AssumedRole',
      principalId: 'AROAEXAMPLE:james',
      arn: overrides.arn,
      accountId: ACCOUNT,
    };
  }
  if (overrides.noArn) {
    const { arn: _arn, ...rest } = OPERATOR;
    event.userIdentity = rest;
  }
  if (overrides.errorCode) {
    event.errorCode = overrides.errorCode;
    event.errorMessage = 'User is not authorized to perform: lightsail:GetInstanceAccessDetails';
  }
  return event;
}

/** The `--query 'Events[].CloudTrailEvent' --output json` form of a list of events. */
export function lookupEventsOutput(events: MintEvent[]): string {
  return JSON.stringify(events.map((e) => JSON.stringify(e)));
}
