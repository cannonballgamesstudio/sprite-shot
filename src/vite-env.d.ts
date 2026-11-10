/// <reference types="vite/client" />
// declare module "*.fbx" {
//     const content: binary;
//     export default src;
//   }
declare module "*.hdr" {
    const src: string;
    export default src;
}

declare module "*.glb" {
    const src: string;
    export default src;
}

import Icons from 'unplugin-icons/vite'

export default defineConfig({
  plugins: [
    Icons({ /* options */ }),
  ],
})