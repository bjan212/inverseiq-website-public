import { ENV } from "./_core/env";
import axios from "axios";

/**
 * Email notification service using Manus built-in notification API
 */

interface EmailNotificationParams {
  to: string;
  subject: string;
  content: string;
  html?: string;
}

/**
 * Send email notification using Manus built-in API
 */
export async function sendEmailNotification(params: EmailNotificationParams): Promise<boolean> {
  try {
    const response = await axios.post(
      `${ENV.forgeApiUrl}/notification/email`,
      {
        to: params.to,
        subject: params.subject,
        content: params.content,
        html: params.html || params.content,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.forgeApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return response.data.success === true;
  } catch (error: any) {
    console.error("[EmailService] Failed to send email:", error.message);
    return false;
  }
}

/**
 * Format signal notification email
 */
export function formatSignalEmail(signal: {
  symbol: string;
  direction: string;
  entryPrice: string;
  takeProfit: string;
  stopLoss: string;
  confidence: number;
  outcome?: string;
  actualExitPrice?: string;
}): { subject: string; html: string } {
  const isOutcome = signal.outcome && signal.outcome !== "pending";
  
  if (isOutcome) {
    // Outcome notification
    const outcomeText = signal.outcome === "hit_tp" ? "✅ Take Profit Hit!" : 
                       signal.outcome === "hit_sl" ? "⚠️ Stop Loss Hit" :
                       "⏰ Signal Expired";
    
    const outcomeColor = signal.outcome === "hit_tp" ? "#10b981" : 
                        signal.outcome === "hit_sl" ? "#ef4444" :
                        "#f59e0b";

    return {
      subject: `${outcomeText} - ${signal.symbol} ${signal.direction}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">XRYPT.NET</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">AI-Powered Trading Intelligence</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="background: ${outcomeColor}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <h2 style="margin: 0; font-size: 20px;">${outcomeText}</h2>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Symbol:</td>
                <td style="padding: 12px 0; text-align: right; font-weight: 700;">${signal.symbol}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Direction:</td>
                <td style="padding: 12px 0; text-align: right; font-weight: 700; color: ${signal.direction === 'LONG' ? '#10b981' : '#ef4444'};">${signal.direction}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Entry Price:</td>
                <td style="padding: 12px 0; text-align: right;">${signal.entryPrice}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Take Profit:</td>
                <td style="padding: 12px 0; text-align: right;">${signal.takeProfit}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Stop Loss:</td>
                <td style="padding: 12px 0; text-align: right;">${signal.stopLoss}</td>
              </tr>
              ${signal.actualExitPrice ? `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Exit Price:</td>
                <td style="padding: 12px 0; text-align: right; font-weight: 700;">${signal.actualExitPrice}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Confidence:</td>
                <td style="padding: 12px 0; text-align: right;">${signal.confidence}%</td>
              </tr>
            </table>
            
            <div style="margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center;">
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">View full details and statistics</p>
              <a href="https://xrypt.net/verification" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Verification Page</a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
            <p>You're receiving this because you enabled email notifications in your XRYPT.NET settings.</p>
            <p><a href="https://xrypt.net/settings/notifications" style="color: #667eea; text-decoration: none;">Manage notification preferences</a></p>
          </div>
        </body>
        </html>
      `,
    };
  } else {
    // New signal notification
    return {
      subject: `🎯 New High-Confidence Signal: ${signal.symbol} ${signal.direction}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">XRYPT.NET</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">AI-Powered Trading Intelligence</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <h2 style="margin: 0 0 10px 0; font-size: 20px;">🎯 New High-Confidence Signal</h2>
              <p style="margin: 0; font-size: 16px; opacity: 0.9;">${signal.confidence}% Confidence Score</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Symbol:</td>
                <td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px;">${signal.symbol}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Direction:</td>
                <td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px; color: ${signal.direction === 'LONG' ? '#10b981' : '#ef4444'};">${signal.direction}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Entry Price:</td>
                <td style="padding: 12px 0; text-align: right; font-size: 16px;">${signal.entryPrice}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Take Profit:</td>
                <td style="padding: 12px 0; text-align: right; font-size: 16px; color: #10b981;">${signal.takeProfit}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #6b7280;">Stop Loss:</td>
                <td style="padding: 12px 0; text-align: right; font-size: 16px; color: #ef4444;">${signal.stopLoss}</td>
              </tr>
            </table>
            
            <div style="margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center;">
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">Take action now on the platform</p>
              <a href="https://xrypt.net/signals" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Signal</a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
            <p>You're receiving this because you enabled email notifications in your XRYPT.NET settings.</p>
            <p><a href="https://xrypt.net/settings/notifications" style="color: #667eea; text-decoration: none;">Manage notification preferences</a></p>
          </div>
        </body>
        </html>
      `,
    };
  }
}
