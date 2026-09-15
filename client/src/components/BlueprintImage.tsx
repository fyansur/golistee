import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  src: string;
  hoverSrc?: string;
  alt: string;
}

// Printify catalog thumbnails are always exactly square — the skeleton box
// below can safely assume aspect-square instead of guessing/reflowing once
// the real image loads.
export function BlueprintImage({ src, hoverSrc, alt }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md">
      {!loaded && <Skeleton className="absolute inset-0 rounded-md" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`size-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        {...(hoverSrc && {
          onMouseEnter: (e: React.MouseEvent<HTMLImageElement>) => (e.currentTarget.src = hoverSrc),
          onMouseLeave: (e: React.MouseEvent<HTMLImageElement>) => (e.currentTarget.src = src),
        })}
      />
    </div>
  );
}
