import type { ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
}

export function Panel({ children }: PanelProps) {
  return <section>{children}</section>;
}
