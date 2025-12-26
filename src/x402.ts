import { x402Client, type PaymentPolicy } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/http';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

import type { McpAdapterConfig } from './config.js';

const DEFAULT_MAX_PAYMENT = 100_000n; // 0.10 USDC in base units (6 decimals).

export type X402PaymentClient = {
  httpClient: x402HTTPClient;
  maxPayment: bigint;
};

function normalizePrivateKey(privateKey: string): `0x${string}` {
  const trimmed = privateKey.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed as `0x${string}`;
  }
  return `0x${trimmed}` as `0x${string}`;
}

function parseMaxPayment(raw?: string): bigint {
  if (!raw) return DEFAULT_MAX_PAYMENT;
  try {
    const value = BigInt(raw);
    if (value <= 0n) throw new Error('non-positive');
    return value;
  } catch {
    throw new Error('Invalid SENTIMENT402_X402_MAX_PAYMENT; expected integer base units.');
  }
}

function buildMaxPaymentPolicy(maxPayment: bigint): PaymentPolicy {
  return (_x402Version, paymentRequirements) =>
    paymentRequirements.filter((requirement) => {
      const amount = 'maxAmountRequired' in requirement
        ? (requirement as { maxAmountRequired: string }).maxAmountRequired
        : (requirement as { amount: string }).amount;
      try {
        return BigInt(amount) <= maxPayment;
      } catch {
        return false;
      }
    });
}

export function createX402PaymentClient(config: McpAdapterConfig): X402PaymentClient | null {
  const privateKey = config.SENTIMENT402_X402_PRIVATE_KEY;
  if (!privateKey) return null;

  const signer = privateKeyToAccount(normalizePrivateKey(privateKey));
  const client = new x402Client();
  const maxPayment = parseMaxPayment(config.SENTIMENT402_X402_MAX_PAYMENT);

  registerExactEvmScheme(client, {
    signer,
    policies: [buildMaxPaymentPolicy(maxPayment)],
  });

  return { httpClient: new x402HTTPClient(client), maxPayment };
}
