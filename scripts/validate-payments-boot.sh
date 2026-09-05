#!/usr/bin/env bash
# scripts/validate-payments-boot.sh -- live-payments boot readiness gate.
#
# A production boot with PAYMENT_ADAPTER=live needs the webhook secret in the
# env file and the Stripe secret key in SSM; missing either crashes checkout
# or silently drops webhooks. This gate checks the env file's declared
# intent, arming-flag aware:
#   - PAYMENTS_ARMED=dark + stub adapter: PASS with a notice. Dark is the
#     stub's required state; arming is scripts/arming.sh.
#   - PAYMENTS_ARMED=dark + live adapter: FAIL. The app refuses this
#     combination at boot (dark production must not hold the live SDK).
#   - armed (or no flag) + live adapter: STRIPE_WEBHOOK_SECRET must be
#     present and non-placeholder.
#   - armed (or no flag) + stub adapter: FAIL with a notice, since an armed
#     production refuses the stub at boot.
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
PAYMENTS_ARMED_VAL="$(get_var PAYMENTS_ARMED)"
WEBHOOK_SECRET="$(get_var STRIPE_WEBHOOK_SECRET)"
WEBHOOK_SECRET_PREVIOUS="$(get_var STRIPE_WEBHOOK_SECRET_PREVIOUS)"

if [[ "${PAYMENTS_ARMED_VAL}" == "dark" ]]; then
  if [[ "${ADAPTER}" == "live" ]]; then
    echo "GATE: PAYMENTS-BOOT FAIL: PAYMENTS_ARMED=dark but PAYMENT_ADAPTER=live; a dark production refuses the live payment SDK at boot. Redeploy so the adapter follows the flag, or arm payments via the Terraform step." >&2
    exit 1
  fi
  echo "GATE: PAYMENTS-BOOT PASS: PAYMENTS_ARMED=dark with the stub adapter, the required dark state. Arming is scripts/arming.sh --switch payments --state armed, which owns the values file, the apply and the deploy in order."
  exit 0
fi

if [[ "${ADAPTER}" != "live" ]]; then
  echo "GATE: PAYMENTS-BOOT NOTICE: PAYMENT_ADAPTER='${ADAPTER:-unset}' (not live). An armed production refuses the stub at boot; activate live payments before the flip."
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
