import { connectToDatabase } from "@/util/mongodb";

/**
 * Appends one event to the `telemetry_logs` collection.
 *
 * Imprint's research instrumentation: how long contributors spend per image and
 * how often they accept the model's suggested boxes rather than redrawing them.
 * /api/telemetryStats reads this collection to build the dashboard's speed and
 * streak figures.
 *
 * Two things to know before relying on it:
 *
 *   - The schema is open by design. Callers pass whatever fields their event
 *     needs, with `event` naming the type (SESSION_START, IMAGE_SUBMITTED,
 *     SESSION_END). Treat every field as optional when reading — older rows
 *     predate later additions.
 *   - It never throws. Logging is a side effect of someone's real work, so a
 *     failure here must not cost them the annotation they just submitted;
 *     errors are recorded to the console and swallowed. That also means gaps
 *     are silent, so this is not a complete record of what happened.
 *
 * @param {Object} eventPayload - Event fields; `event` names the type.
 */
export async function logTelemetryEvent(eventPayload) {
    try {
        const { db } = await connectToDatabase();

        // Timestamp first so a caller passing its own overrides this default
        const payloadWithTime = {
            timestamp: new Date(),
            ...eventPayload,
        };

        await db.collection("telemetry_logs").insertOne(payloadWithTime);
    } catch (err) {
        console.error(`[Telemetry Error] Failed to write event ${eventPayload.event} to DB:`, err);
    }
}
