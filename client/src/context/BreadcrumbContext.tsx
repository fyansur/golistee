import { createContext, useContext, useState } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextType {
  items: BreadcrumbItem[] | null;
  setItems: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export const useBreadcrumb = () => {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) throw new Error("useBreadcrumb must be used within BreadcrumbProvider");
  return ctx;
};