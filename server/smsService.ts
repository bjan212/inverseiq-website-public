import axios from "axios";

/**
 * SMS notification service using Twilio
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables
 */

interface SMSNotificationParams {
  to: string;
  message: string;
}

/**
 * Send SMS notification using Twilio API
 */
export async function sendSMSNotification(params: SMSNotificationParams): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    console.warn("[SMSService] Twilio credentials not configured, skipping SMS");
    return false;
  }

  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({
        To: params.to,
        From: fromPhone,
        Body: params.message,
      }),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      }
    );

    return response.status === 201;
  } catch (error: any) {
    console.error("[SMSService] Failed to send SMS:", error.message);
    return false;
  }
}

/**
 * Format signal notification SMS (160 characters max for standard SMS)
 */
export function formatSignalSMS(signal: {
  symbol: string;
  direction: string;
  entryPrice: string;
  takeProfit: string;
  confidence: number;
  outcome?: string;
}): string {
  const isOutcome = signal.outcome && signal.outcome !== "pending";
  
  if (isOutcome) {
    const outcomeText = signal.outcome === "hit_tp" ? "TP HIT" : 
                       signal.outcome === "hit_sl" ? "SL HIT" :
                       "EXPIRED";
    
    return `XRYPT: ${outcomeText} - ${signal.symbol} ${signal.direction} @ ${signal.entryPrice}. View: xrypt.net/verification`;
  } else {
    return `XRYPT: NEW SIGNAL ${signal.confidence}% - ${signal.symbol} ${signal.direction} Entry:${signal.entryPrice} TP:${signal.takeProfit}`;
  }
}
