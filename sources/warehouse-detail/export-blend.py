"""Blender 4.5: affordable static derivatives, preserving authored UVs/materials."""
import bpy, os, json
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
SOURCE='D:/Burning Horizons Assets/BlendKit/source/chaise-lounge-sofa/chaise-lounge-sofa.source.blend'
report={}
for part in ['chaise','ottoman']:
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
    keep=[]
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH': continue
        is_ottoman=obj.name in ['stool','Pouf','Pouf_1']
        if is_ottoman != (part=='ottoman'):
            bpy.data.objects.remove(obj,do_unlink=True);continue
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        # Evaluate subdivision only at one level; retain curved silhouette and piping.
        for mod in obj.modifiers:
            if mod.type=='SUBSURF': mod.levels=1;mod.render_levels=1
        deps=bpy.context.evaluated_depsgraph_get()
        mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
        obj.modifiers.clear();obj.data=mesh
        if len(mesh.polygons)>1800:
            mod=obj.modifiers.new('budget','DECIMATE');mod.ratio=min(1,1800/len(mesh.polygons))
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if not obj.data.uv_layers:
            uv=obj.data.uv_layers.new(name='Piping planar UV')
            for loop in obj.data.loops:
                co=obj.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv=(co.x,co.y)
        keep.append(obj)
    for image in bpy.data.images:
        if image.size[0]>512 or image.size[1]>512:image.scale(512,512)
    # Bake world transforms and Blender Z-up to glTF Y-up, then normalize to unit bounds.
    points=[o.matrix_world@Vector(c) for o in keep for c in o.bound_box]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    for o in keep:
        matrix=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
        for v in o.data.vertices:v.co=Vector(tuple(((matrix@v.co)[i]-(hi[i]+lo[i])/2)/(hi[i]-lo[i]) for i in range(3)))
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep:o.select_set(True)
    dest=os.path.join(OUT,part+'.glb')
    bpy.ops.export_scene.gltf(filepath=dest,export_format='GLB',use_selection=True,export_image_format='JPEG',export_jpeg_quality=82,export_materials='EXPORT',export_animations=False,export_extras=False,export_normals=True)
    report[part]={'sourceBounds':[list(lo),list(hi)],'meshObjects':len(keep),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in keep),'bytes':os.path.getsize(dest)}
open(os.path.join(OUT,'blend-report.json'),'w').write(json.dumps(report,indent=2)+'\n')
