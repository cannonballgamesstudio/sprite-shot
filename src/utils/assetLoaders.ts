// Example helper functions to demonstrate mesh/animation loading
// Place this in a utility file or component that handles asset loading

import { MeshTreeNode, useMeshTreeStore } from '../state/meshTree';

// Example function to load a mesh file and add it to the tree
export async function loadMeshFile(filePath: string) {
  try {
    // Simulate loading a mesh file
    console.log(`Loading mesh from ${filePath}`);
    
    // Get access to the store functions
    const { addLoadedMesh } = useMeshTreeStore.getState();
    
    // Create a mesh node with appropriate structure
    const meshNode: MeshTreeNode = {
      label: getFileNameFromPath(filePath),
      value: filePath, // Use the file path as the unique value
      type: 'mesh',
      id: generateUniqueId().toString(), // Implement this function to generate IDs
      children: [], // May contain child nodes like submeshes
    };
    
    // Add the mesh to the tree
    addLoadedMesh(filePath, meshNode);
    
    console.log(`Mesh ${meshNode.label} loaded and added to tree`);
    return true;
  } catch (error) {
    console.error(`Error loading mesh: ${error}`);
    return false;
  }
}

// Example function to load an animation file and add it to the tree
export async function loadAnimationFile(filePath: string) {
  try {
    // Simulate loading an animation file
    console.log(`Loading animation from ${filePath}`);
    
    // Get access to the store functions
    const { addLoadedAnimation } = useMeshTreeStore.getState();
    
    // Create an animation node
    const animNode: MeshTreeNode = {
      label: getFileNameFromPath(filePath),
      value: filePath, // Use the file path as the unique value
      type: 'animation',
      id: generateUniqueId().toString(), // Implement this function to generate IDs
      // Animations typically don't have children
    };
    
    // Add the animation to the tree
    addLoadedAnimation(filePath, animNode);
    
    console.log(`Animation ${animNode.label} loaded and added to tree`);
    return true;
  } catch (error) {
    console.error(`Error loading animation: ${error}`);
    return false;
  }
}

// Helper to extract filename from path
function getFileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/); // Split on forward or backward slashes
  return parts[parts.length - 1];
}

// Helper to generate unique IDs
function generateUniqueId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}
