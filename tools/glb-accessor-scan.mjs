// Build-time, exact-source adaptation of the vendored GLB 2.0 inspector.
// The enclosing transform pins the complete vendor hash. Never edit the vendor
// copy. Keep byte order, buffer-view offsets, padding, order and error messages.
export function optimizeGlbScans(source){
 const edits=[
  ['if (accessor.componentType === 5126) for (let row = 0; row < accessor.count; row++) for (let column = 0; column < widths[accessor.type]; column++) requireValue(Number.isFinite(valueAt(accessor, row, column)), "GLB contains nonfinite vertex attributes.");',
   `if (accessor.componentType === 5126) {
      const width = widths[accessor.type], start = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = bv.byteStride ?? size;
      for (let row = 0, offset = start; row < accessor.count; row++, offset += stride)
        for (let col = 0; col < width; col++) requireValue(Number.isFinite(data.getFloat32(offset + col * 4, true)), "GLB contains nonfinite vertex attributes.");
    }`],
  ['for (let i = 0; i < count; i++) requireValue(valueAt(index, i, 0) < position.count, "GLB index exceeds the vertex range.");',
   `const view = json2.bufferViews[index.bufferView], start = (view.byteOffset ?? 0) + (index.byteOffset ?? 0);
        const stride = view.byteStride ?? bytesPerComponent[index.componentType];
        for (let i = 0, offset = start; i < count; i++, offset += stride) {
          const value = index.componentType === 5121 ? data.getUint8(offset) : index.componentType === 5123 ? data.getUint16(offset, true) : data.getUint32(offset, true);
          requireValue(value < position.count, "GLB index exceeds the vertex range.");
        }`],
  [`for (let i = 0; i < position.count; i++) {
          point.set(valueAt(position, i, 0), valueAt(position, i, 1), valueAt(position, i, 2)).applyMatrix4(matrix);
          requireValue(point.toArray().every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5), "GLB transformed bounds are nonfinite or excessive.");`,
   `const view = json2.bufferViews[position.bufferView], start = (view.byteOffset ?? 0) + (position.byteOffset ?? 0), stride = view.byteStride ?? 12;
        for (let i = 0, offset = start; i < position.count; i++, offset += stride) {
          point.set(data.getFloat32(offset, true), data.getFloat32(offset + 4, true), data.getFloat32(offset + 8, true)).applyMatrix4(matrix);
          requireValue(Math.abs(point.x) <= 1e5 && Math.abs(point.y) <= 1e5 && Math.abs(point.z) <= 1e5, "GLB transformed bounds are nonfinite or excessive.");`]
 ];
 for(const [from,to] of edits){
  if(source.split(from).length!==2)throw Error('Review pinned GLB geometry scan after upstream change');
  source=source.replace(from,()=>to);
 }
 return source;
}
