import React from "react";
import { cn } from "../cn";

/**
 * The credit line for the photo being annotated (16 Oct 2026, Rans).
 *
 * Mapillary's images are CC BY-SA 4.0 and ask for credit per image, with a
 * link to it (help.mapillary.com, "CC BY SA license for open data"). ATLAS-3's
 * frames are CC BY 4.0 (pipeline_methodology.md §7h), a collection made by an
 * earlier research group. Every image record carries `source` ("mapillary" or
 * "atlas3") and `sourceImageId` (imageImport.mjs), and annotationGet sends
 * them with the image, so the line needs no new data. The tutorial's three
 * frames are ATLAS-3 (tutorialImages.js).
 *
 * Both sources are among the reference images and the rest of the pool
 * (methodology Table 10.3 and 10.4), so the line says nothing about whether a
 * photo is a reference image. An image with no known source gets no line.
 *
 * No link to ATLAS-3 itself: whether its repository is public is not
 * confirmed. Each license is linked.
 */
export interface PhotoSource {
  source?: string | null;
  sourceImageId?: string | null;
}

export interface Credit {
  text: string;
  license: { label: string; href: string };
  view: { label: string; href: string } | null;
}

export const CC_BY_SA = { label: "CC BY-SA 4.0", href: "https://creativecommons.org/licenses/by-sa/4.0/" };
export const CC_BY = { label: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" };

/** The image's page on Mapillary, which names its contributor */
export const mapillaryImageUrl = (id: string) => `https://www.mapillary.com/app/?pKey=${encodeURIComponent(id)}`;

export function photoCredit(photo?: PhotoSource | null): Credit | null {
  if (!photo) return null;
  if (photo.source === "mapillary") {
    const id = typeof photo.sourceImageId === "string" && photo.sourceImageId.trim() ? photo.sourceImageId.trim() : null;
    return {
      text: "Photo by a Mapillary contributor,",
      license: CC_BY_SA,
      view: id ? { label: "View on Mapillary", href: mapillaryImageUrl(id) } : null,
    };
  }
  if (photo.source === "atlas3") {
    return { text: "Photo from an earlier research group,", license: CC_BY, view: null };
  }
  return null;
}

const linkClass = "underline decoration-line underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm";

/** The line itself: small and muted, under the photo on a laptop, at the end of the answers sheet on a phone */
export default function PhotoCredit({ photo, className }: { photo?: PhotoSource | null; className?: string }) {
  const credit = photoCredit(photo);
  if (!credit) return null;
  return (
    <p data-photo-credit className={cn("text-[11px] leading-snug text-muted", className)}>
      {credit.text}{" "}
      <a href={credit.license.href} target="_blank" rel="noreferrer" className={linkClass}>{credit.license.label}</a>.
      {credit.view && (
        <>
          {" "}
          <a href={credit.view.href} target="_blank" rel="noreferrer" className={linkClass}>{credit.view.label}</a>
        </>
      )}
    </p>
  );
}
