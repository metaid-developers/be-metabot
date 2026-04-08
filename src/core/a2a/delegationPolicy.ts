import type { DelegationPolicyDecision, DelegationPolicyMode } from './sessionTypes';

export interface EvaluateDelegationPolicyInput {
  policyMode?: unknown;
  estimatedCostAmount?: string | null;
  estimatedCostCurrency?: string | null;
}

const DEFAULT_POLICY_MODE: DelegationPolicyMode = 'confirm_all';
const PUBLIC_ENABLED_POLICY_MODES: ReadonlySet<DelegationPolicyMode> = new Set(['confirm_all']);
const FUTURE_SAFE_POLICY_MODES: ReadonlySet<DelegationPolicyMode> = new Set([
  'confirm_all',
  'confirm_paid_only',
  'auto_when_safe',
]);

export function resolveDelegationPolicyMode(
  rawPolicyMode: unknown,
  fallback: DelegationPolicyMode = DEFAULT_POLICY_MODE,
): DelegationPolicyMode {
  if (typeof rawPolicyMode !== 'string') {
    return fallback;
  }
  const normalized = rawPolicyMode.trim().toLowerCase();
  if (FUTURE_SAFE_POLICY_MODES.has(normalized as DelegationPolicyMode)) {
    return normalized as DelegationPolicyMode;
  }
  return fallback;
}

export function evaluateDelegationPolicy(
  input: EvaluateDelegationPolicyInput = {},
): DelegationPolicyDecision {
  const requestedPolicyMode = resolveDelegationPolicyMode(input.policyMode);
  const isPubliclyEnabled = PUBLIC_ENABLED_POLICY_MODES.has(requestedPolicyMode);

  if (!isPubliclyEnabled) {
    return {
      requiresConfirmation: true,
      policyMode: DEFAULT_POLICY_MODE,
      policyReason: 'policy_mode_not_publicly_enabled',
      requestedPolicyMode,
      confirmationBypassed: false,
      bypassReason: null,
    };
  }

  return {
    requiresConfirmation: true,
    policyMode: DEFAULT_POLICY_MODE,
    policyReason: 'confirm_all_requires_confirmation',
    requestedPolicyMode,
    confirmationBypassed: false,
    bypassReason: null,
  };
}

