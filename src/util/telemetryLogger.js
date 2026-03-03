import { connectToDatabase } from "@/util/mongodb";

/**
 * Connects to the database and inserts a telemetry event into the `telemetry_logs` collection.
 * 
 * @param {Object} eventPayload - The telemetry data object to log.
 */
export async function logTelemetryEvent(eventPayload) {
    try {
        const { db } = await connectToDatabase();

        // Attach timestamp if not present
        const payloadWithTime = {
            timestamp: new Date(),
            ...eventPayload,
        };

        // Insert into the telemetry_logs collection
        await db.collection("telemetry_logs").insertOne(payloadWithTime);
    } catch (err) {
        console.error(`[Telemetry Error] Failed to write event ${eventPayload.event} to DB:`, err);
    }
}
