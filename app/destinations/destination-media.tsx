import { ImageOffIcon } from "lucide-react";

import type { DestinationImage } from "~/destinations/destination";
import { cn } from "~/lib/utils";

/**
 * Destination image, or a neutral placeholder when the owner has not
 * published one. Missing images are never replaced with invented content.
 */
export function DestinationMedia({
  image,
  className,
}: {
  image?: DestinationImage;
  className?: string;
}) {
  return (
    <div className={cn("destination-media", className)}>
      {image ? (
        <img src={image.url} alt={image.altText} />
      ) : (
        <div
          className="destination-image-placeholder"
          role="img"
          aria-label="No image available"
        >
          <ImageOffIcon aria-hidden="true" />
          <span>No image available</span>
        </div>
      )}
    </div>
  );
}
