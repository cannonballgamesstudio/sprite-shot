export interface BoneInfo {
  name: string;
  index: number;
  parent_index: number | null;
  transform: number[]; // 4x4 matrix as flat array
}

export interface AnimationConflict {
  bone_name: string;
  original_index: number;
  new_index: number;
  conflict_type: ConflictType;
}

export enum ConflictType {
  NameMismatch = "NameMismatch",
  HierarchyMismatch = "HierarchyMismatch",
  TransformMismatch = "TransformMismatch"
}

export interface GltfLoadResult {
  success: boolean;
  message: string;
  bone_count?: number;
  conflict_count?: number;
}

// Tauri command interfaces
export interface GltfCommands {
  load_base_mesh: (path: string) => Promise<string>;
  load_animation: (path: string) => Promise<string>;
  get_bone_hierarchy: () => Promise<BoneInfo[]>;
  get_animation_count: () => Promise<number>;
  print_gltf_info: () => Promise<string>;
}
