import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";

import type { X402PaymentClient } from "./x402.js";
export type PaymentRequiredResult = {
  error: "PAYMENT_REQUIRED";
  x402Version?: number;
  resource?: string;
  accepts?: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  }>;
  rawHeader?: string;
  details?: unknown;
};

export type FetchOkResult = { ok: true; json: unknown };
export type FetchResult = FetchOkResult | { ok: false; paymentRequired: PaymentRequiredResult };

type PaymentRequiredLike = PaymentRequired & { accepts: Array<Record<string, unknown>> };

function formatPaymentRequirements(payload: PaymentRequiredLike): PaymentRequiredResult {
  const resourceUrl = payload.resource && typeof payload.resource === "object" && "url" in payload.resource ? (payload.resource as { url: string }).url : undefined;

  return {
    error: "PAYMENT_REQUIRED",
    x402Version: payload.x402Version,
    resource: resourceUrl,
    accepts: payload.accepts.map((option) => {
      const amount = "maxAmountRequired" in option ? option.maxAmountRequired : option.amount;
      return {
        scheme: option.scheme as string,
        network: option.network as string,
        asset: option.asset as string,
        amount: amount as string,
        payTo: option.payTo as string,
      };
    }),
  };
}

async function parsePaymentRequiredResponse(response: Response): Promise<{
  paymentRequired: PaymentRequired | null;
  rawHeader?: string;
  details?: unknown;
}> {
  const rawHeader = response.headers.get("PAYMENT-REQUIRED") ?? response.headers.get("X-PAYMENT-REQUIRED") ?? undefined;

  if (rawHeader) {
    try {
      return { paymentRequired: decodePaymentRequiredHeader(rawHeader), rawHeader };
    } catch {
      // Fall through to body-based details.
    }
  }

  const details = await response.json().catch(() => undefined);
  const paymentRequired = details && typeof details === "object" && "x402Version" in details ? (details as PaymentRequired) : null;

  return { paymentRequired, rawHeader, details };
}

async function tryAutoPay(options: { paymentClient: X402PaymentClient; paymentRequired: PaymentRequired; url: URL; userAgent: string }): Promise<FetchOkResult | null> {
  console.log(
    JSON.stringify(
      {
        event: "x402_payment_attempt",
        x402Version: options.paymentRequired.x402Version,
        resource: options.paymentRequired.resource?.url,
        accepts: options.paymentRequired.accepts?.map((accept) => ({
          scheme: accept.scheme,
          network: accept.network,
          asset: accept.asset,
          amount: accept.amount,
          payTo: accept.payTo,
        })),
      },
      null,
      2
    )
  );

  const paymentPayload = await options.paymentClient.httpClient.createPaymentPayload(options.paymentRequired);
  const paymentHeaders = options.paymentClient.httpClient.encodePaymentSignatureHeader(paymentPayload);

  const response = await fetch(options.url, {
    headers: {
      accept: "application/json",
      "user-agent": options.userAgent,
      ...paymentHeaders,
    },
  });

  if (response.status === 402) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error (${response.status}): ${text}`);
  }

  const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  if (paymentResponseHeader) {
    try {
      const decoded = decodePaymentResponseHeader(paymentResponseHeader);
      console.log(
        JSON.stringify(
          {
            event: "x402_payment_settled",
            transaction: decoded.transaction,
            payer: decoded.payer,
            network: decoded.network,
          },
          null,
          2
        )
      );
    } catch {
      console.log(
        JSON.stringify(
          {
            event: "x402_payment_settled",
            rawHeader: paymentResponseHeader,
          },
          null,
          2
        )
      );
    }
  }

  return { ok: true, json: await response.json() };
}

export async function fetchJsonWith402Handling(options: { url: URL; userAgent: string; paymentClient?: X402PaymentClient | null }): Promise<FetchResult> {
  const response = await fetch(options.url, {
    headers: {
      accept: "application/json",
      "user-agent": options.userAgent,
    },
  });

  if (response.status === 402) {
    const { paymentRequired, rawHeader, details } = await parsePaymentRequiredResponse(response);

    if (paymentRequired) {
      console.log(
        JSON.stringify(
          {
            event: "x402_payment_required",
            x402Version: paymentRequired.x402Version,
            resource: paymentRequired.resource?.url,
            accepts: paymentRequired.accepts?.map((accept) => ({
              scheme: accept.scheme,
              network: accept.network,
              asset: accept.asset,
              amount: accept.amount,
              payTo: accept.payTo,
            })),
          },
          null,
          2
        )
      );
    }

    if (paymentRequired && options.paymentClient) {
      try {
        const paidResult = await tryAutoPay({
          paymentClient: options.paymentClient,
          paymentRequired,
          url: options.url,
          userAgent: options.userAgent,
        });
        if (paidResult) return paidResult;
      } catch (error) {
        const failureDetails = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          paymentRequired: {
            ...(formatPaymentRequirements(paymentRequired as PaymentRequiredLike) ?? {
              error: "PAYMENT_REQUIRED",
            }),
            rawHeader,
            details: { reason: "AUTO_PAY_FAILED", message: failureDetails },
          },
        };
      }
    }

    if (paymentRequired) {
      return {
        ok: false,
        paymentRequired: { ...formatPaymentRequirements(paymentRequired as PaymentRequiredLike), rawHeader },
      };
    }

    return { ok: false, paymentRequired: { error: "PAYMENT_REQUIRED", rawHeader, details } };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error (${response.status}): ${text}`);
  }

  return { ok: true, json: await response.json() };
}
