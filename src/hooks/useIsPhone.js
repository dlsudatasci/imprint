import { useEffect, useState } from "react";
import { isPhone } from "@/util/validators/deviceTelemetry";

/**
 * Whether this device is a phone (12 Oct 2026): a finger as the primary
 * pointer and a screen whose shorter side is under 600 CSS px, the same rule
 * telemetry uses. In full screen a phone is asked to turn sideways, and a
 * tablet is not.
 *
 * `null` until it runs in the browser, then `true` or `false`.
 */
export function useIsPhone() {
  const [phone, setPhone] = useState(null);

  useEffect(() => {
    const coarsePointer = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
    const screenMinSide = window.screen ? Math.min(window.screen.width, window.screen.height) : undefined;
    setPhone(isPhone({ coarsePointer, screenMinSide }));
  }, []);

  return phone;
}
