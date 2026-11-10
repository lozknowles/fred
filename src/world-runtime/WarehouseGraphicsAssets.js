// Package-relative public resources consumed by the WebGL island and Warehouse.
export const leafAtlasPath = 'textures/vegetation/native-leaf-atlas.png';
export const warehouseMaps = {
 brick: [
  'textures/portal-warehouse/brick_wall_001_diffuse_1k.jpg',
  'textures/portal-warehouse/brick_wall_001_nor_gl_1k.jpg',
  'textures/portal-warehouse/brick_wall_001_arm_1k.jpg',
 ],
 floor: [
  'textures/portal-warehouse/concrete_floor_diff_1k.jpg',
  'textures/portal-warehouse/concrete_floor_nor_gl_1k.jpg',
  'textures/portal-warehouse/concrete_floor_arm_1k.jpg',
 ],
 wood: [
  'models/props/s_weathered_brown_planks_a.jpg',
  'models/props/s_weathered_brown_planks_n.jpg',
  'models/props/s_weathered_brown_planks_r.jpg',
 ],
 fabric: [
  'textures/portal-warehouse/fabric_soft_black_diffuse_512.jpg',
  'textures/portal-warehouse/fabric_soft_black_nor_gl_512.jpg',
  'textures/portal-warehouse/fabric_soft_black_roughness_512.jpg',
 ],
};
export const warehouseGraphicsFiles = [
 leafAtlasPath, ...Object.values(warehouseMaps).flat(),
 'textures/portal-warehouse/CREDITS.md', 'models/props/CREDITS.md',
];
