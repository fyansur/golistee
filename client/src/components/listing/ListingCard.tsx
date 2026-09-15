import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ListingDraft } from "@/pages/CreateListing";
import { ListingCardForm } from "@/components/listing/ListingCardForm";

interface Props {
  index: number;
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  onRemove: () => void;
}

export function ListingCard({ index, draft, onChange, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card>
      <CardContent>
        <ListingCardForm
          draft={draft}
          onChange={onChange}
          index={index}
          onRemove={onRemove}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </CardContent>
    </Card>
  );
}
