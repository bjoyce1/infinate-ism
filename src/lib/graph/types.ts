export type RawNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  _origin?: string;
  community?: number;
  community_name?: string;
  norm_label?: string;
  image?: string;
  artwork?: string;
  is_hub?: boolean;
  weight?: number;
  color?: string;
  url?: string;
};

export type RawLink = {
  source: string;
  target: string;
  relation?: string;
  weight?: number;
  confidence?: string;
  confidence_score?: number;
};

export type RawGraph = {
  nodes: RawNode[];
  links: RawLink[];
};

export type Category = "code" | "blog" | "music" | "image" | "other";

export type GraphNode = RawNode & {
  category: Category;
  degree: number;
};

export type GraphLink = {
  source: string;
  target: string;
  relation?: string;
  weight?: number;
};

export type NormalizedGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  neighbors: Map<string, Set<string>>;
  byId: Map<string, GraphNode>;
  communities: { id: number; count: number; name: string }[];
  categoryCounts: Record<Category, number>;
};