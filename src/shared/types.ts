// Shared types will go here
export interface ImageItem {
  id: string;
  sourcePath?: string;
  originalName?: string;
  bytes: number;
  width: number;
  height: number;
  format?: string;
  hasAlpha?: boolean;
}
