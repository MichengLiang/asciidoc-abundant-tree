export type DependencyReport = {
  service: string;
  directDependencies: string[];
  blastRadius: string[];
  sourceLine: number;
};
