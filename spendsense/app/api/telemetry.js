// app/api/telemetry.js

const TELEMETRY_URL = "https://telemetry-api-iota.vercel.app/api/feedback";

// ⚠️ Replace this with YOUR actual TMFCID if sir gives you a specific one
const TMFCID = "TMFC006TN";

/**
 * Generic telemetry sender used by the whole app.
 * Used by telemetryEvents.js for things like:
 *  - screen_view
 *  - personal_expense_created
 *  - group_created
 *  - data_exported, etc.
 *
 * We encode our event + payload into the `comments` field as JSON,
 * while matching sir's required schema: { rating, experience, tmfcid, comments }.
 */
export async function sendTelemetry(eventName, payload = {}) {
  try {
    const body = {
      rating: 5, // Neutral "good" rating for internal events
      experience: "good", // 'good' | 'satisfied' | 'needs_improvement'
      tmfcid: TMFCID,
      comments: JSON.stringify({
        event: eventName,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    };

    const res = await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.log("[telemetry] non-2xx:", res.status);
    }
  } catch (e) {
    console.log("Telemetry error:", e.message || e);
  }
}

/**
 * Explicit feedback sender for the user-facing feedback form.
 * This matches sir's API exactly:
 *  POST /api/feedback
 *  { rating, experience, tmfcid, comments }
 */
export async function submitUserFeedback({ rating, experience, comments }) {
  try {
    const body = {
      rating,
      experience, // "good" | "satisfied" | "needs_improvement"
      tmfcid: TMFCID,
      comments: comments?.trim() || "",
    };

    const res = await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.log("[feedback] non-2xx:", res.status);
      throw new Error(`Non-2xx response: ${res.status}`);
    }
  } catch (e) {
    console.log("Feedback error:", e.message || e);
    throw e; // let UI show an error Alert
  }
}
