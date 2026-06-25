export type AssetReport = {
  label: string;
  file: string;
  hash?: string;
  tags: string[];
  usedIn: string[];
  sourceLine: number;
};
