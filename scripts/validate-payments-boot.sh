#!/usr/bin/env bash
# scripts/validate-payments-boot.sh -- live-payments boot readiness gate.
#
# A production boot with PAYMENT_ADAPTER=live needs the webhook secret in the
# env file and the Stripe secret key in SSM; missing either crashes checkout
# or silently drops webhooks. This gate checks the env file's declared
# intent: when PAYMENT_ADAPTER=live, STRIPE_WEBHOOK_SECRET must be present
# and non-placeholder. When the adapter is stub (payments not yet activated)
# the gate passes with a notice, since stub mode is a legitimate pre-launch
# state but is refused by the app at production boot.
#
# Env:
#   FOOTBAG_ENV_FILE   Path to the deploy env file (default: /srv/footbag/env)
set -euo pipefail

ENV_FILE="${FOOTBAG_ENV_FILE:-/srv/footbag/env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "GATE: PAYMENTS-BOOT FAIL: env file not found at ${ENV_FILE} (set FOOTBAG_ENV_FILE)" >&2
  exit 1
fi

get_var() {
  # Last assignment wins, matching how the env file is consumed.
  grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true
}

ADAPTER="$(get_var PAYMENT_ADAPTER)"
WEBHOOK_SECRET="$(get_var STRIPE_WEBHOOK_SECRET)"
WEBHOOK_SECRET_PREVIOUS="$(get_var STRIPE_WEBHOOK_SECRET_PREVIOUS)"

if [[ "${ADAPTER}" != "live" ]]; then
  echo "GATE: PAYMENTS-BOOT NOTICE: PAYMENT_ADAPTER='${ADAPTER:-unset}' (not live). Production refuses stub at boot; activate live payments before the flip."
  echo "GATE: PAYMENTS-BOOT FAIL: live adapter not configured" >&2
  exit 1
fi

if [[ -z "${WEBHOOK_SECRET}" ]]; then
  echo "GATE: PAYMENTS-BOOT FAIL: PAYMENT_ADAPTER=live but STRIPE_WEBHOOK_SECRET is unset in ${ENV_FILE}" >&2
  exit 1
fi
case "${WEBHOOK_SECRET}" in
  TODO*|todo*|changeme*|CHANGEME*)
    echo "GATE: PAYMENTS-BOOT FAIL: STRIPE_WEBHOOK_SECRET is a placeholder value" >&2
    exit 1
    ;;
esac

if [[ -n "${WEBHOOK_SECRET_PREVIOUS}" ]]; then
  echo "GATE: PAYMENTS-BOOT NOTICE: STRIPE_WEBHOOK_SECRET_PREVIOUS is set, so a webhook-secret rotation window is open. A roll should be short-lived; close it once every delivery signs with the new secret: scripts/activate-payments.sh --complete-webhook-rotation"
fi

echo "GATE: PAYMENTS-BOOT PASS: PAYMENT_ADAPTER=live with webhook secret present"
