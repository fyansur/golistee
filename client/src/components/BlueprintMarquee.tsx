// components/BlueprintMarquee.tsx

import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { BlueprintImage } from "./BlueprintImage";

const resized = (url: string) =>
  `https://printify.com/cdn-cgi/image/width=320,quality=90,format=avif/${url}`;

const POPULAR_BLUEPRINTS = [
  {
    id: 706,
    brand: "Comfort Colors®",
    model: "1717",
    title: "Unisex Garment-Dyed T-shirt",
    images: [
      "https://images.printify.com/66d952e50dea28254a0d1543",
      "https://images.printify.com/66d952faa44fb08a9d0773e3",
    ],
  },
  {
    id: 12,
    brand: "Bella+Canvas",
    model: "3001",
    title: "Unisex Jersey Short Sleeve Tee",
    images: [
      "https://images.printify.com/66d81b70295ea4f038065152",
      "https://images.printify.com/66d81b76953258e42905f422",
    ],
  },
  {
    id: 1382,
    brand: "Bella+Canvas",
    model: "3010",
    title: "Unisex Oversized Boxy Tee",
    images: [
      "https://images.printify.com/66cc723135bd3d9337018aa2",
      "https://images.printify.com/66cc722f4ba8f64842057244",
    ],
  },
  {
    id: 6,
    brand: "Gildan",
    model: "5000",
    title: "Unisex Heavy Cotton Tee",
    images: [
      "https://images.printify.com/66d81786ae1f0775ec0aef82",
      "https://images.printify.com/68f726b037c7b1aa670b6042",
    ],
  },
  {
    id: 49,
    brand: "Gildan",
    model: "18000",
    title: "Unisex Heavy Blend™ Crewneck Sweatshirt",
    images: [
      "https://images.printify.com/66d8232c53b570547f0b78b3",
      "https://images.printify.com/66d8233de727c92cf40aed62",
    ],
  },
  {
    id: 145,
    brand: "Gildan",
    model: "64000",
    title: "Unisex Softstyle T-Shirt",
    images: [
      "https://images.printify.com/66d82988a65761e5f9096537",
      "https://images.printify.com/66d8299ba65761e5f9096538",
    ],
  },
];

const BlueprintCard = ({
  brand,
  model,
  title,
  images,
  onAdd,
  inPool,
}: (typeof POPULAR_BLUEPRINTS)[0] & {
  onAdd: () => void;
  inPool: boolean;
}) => (
    <Card className="w-64 overflow-hidden">
    <CardHeader>
      <BlueprintImage
        src={resized(images[0])}
        hoverSrc={images[1] ? resized(images[1]) : undefined}
        alt={`${brand} ${model}`}
      />
    </CardHeader>
    <CardContent>
      <p className="text-sm font-bold leading-none">{brand} {model}</p>
      <p className="text-xs text-muted-foreground leading-none truncate">{title}</p>
    </CardContent>
    <CardFooter>
      <Button size="sm" className="w-full" disabled={inPool} onClick={onAdd}>
        {inPool ? "Added" : <><PlusIcon className="size-4" /> Add</>}
      </Button>
    </CardFooter>
  </Card>
);

export function BlueprintMarquee({
  poolBlueprintIds,
  onAdd,
}: {
  poolBlueprintIds: Set<number>;
  onAdd: (b: (typeof POPULAR_BLUEPRINTS)[0]) => void;
}) {
  const inPool = (id: number) => poolBlueprintIds.has(id);

  return (
    <div className="relative flex w-full flex-col gap-2 overflow-hidden">
      <Marquee pauseOnHover className="[--duration:40s]">
        {POPULAR_BLUEPRINTS.map((b) => (
          <BlueprintCard key={b.id} {...b} inPool={inPool(b.id)} onAdd={() => onAdd(b)} />
        ))}
      </Marquee>
    </div>
  );
}