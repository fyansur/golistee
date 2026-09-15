import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAGE_SIZES = [10, 25, 50, 100];

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizes?: number[];
}

// Shared footer for every server-paginated list page — hidden entirely when
// there isn't even enough to fill the smallest page size.
export function PaginationFooter({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES }: Props) {
  if (total <= pageSizes[0]) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger size="sm" className="w-18">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <span className="px-2">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
