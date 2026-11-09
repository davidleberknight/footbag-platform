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
 * Every other event here is SYNTHETIC: built from that capture to CloudTrail's
 * documented event structure, changing only the fields under test. The
 * `app/<id>` user-agent token is the form the AWS CLI documents for
 * `AWS_SDK_UA_APP_ID`; how CloudTrail records it is not yet seen in a real
 * event. Replace the synthetic events with ones captured in the first staging
 * drill, recording their capture date here.
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

type MintEvent = Record<string, unknown>;

/** SYNTHETIC: the captured event with the fields under test replaced. */
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
  const event: MintEvent = { ...CAPTURED_PRODUCTION_EVENT };
  if (overrides.time) event.eventTime = overrides.time;
  if (overrides.instance === null) delete event.requestParameters;
  else if (overrides.instance) event.requestParameters = { instanceName: overrides.instance };
  if (overrides.userAgent === null) delete event.userAgent;
  else if (overrides.userAgent !== undefined) event.userAgent = overrides.userAgent;
  else if (overrides.appId) event.userAgent = `${CLI_AGENT} app/${overrides.appId}`;
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
