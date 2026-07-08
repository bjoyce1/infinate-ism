export type RawNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  _origin?: string;
  community?: number;
  norm_label?: string;
  image?: string;
  artwork?: string;
  alt?: string;
  caption?: string;
  phone?: string;
  hours?: string;
  email?: string;
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

export type Category = "code" | "blog" | "music" | "image" | "capture" | "other";

export type GraphNode = RawNode & {
  category: Category;
  degree: number;
};

export type GraphLink = {
  source: string;
  target: string;
  relation?: string;
  weight?: number;
  walk_distance?: string;
  walk_duration?: string;
  walk_directions?: string;
  walk_days?: Array<{ label?: string; distance?: string; duration?: string; directions?: string }>;
};

export type NormalizedGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  neighbors: Map<string, Set<string>>;
  byId: Map<string, GraphNode>;
  communities: { id: number; count: number; name: string }[];
  categoryCounts: Record<Category, number>;
};