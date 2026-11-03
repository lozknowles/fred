# Local facial photograph

`PlayerAvatar` and `WebGLRepositoryAvatar` expose
`setLocalFacePhoto({image, revision} | null)`. `image` is an already decoded,
locally normalized portrait (`CanvasImageSource` or RGBA `{data,width,height}`).
Decode and validate the upload in the chooser; never pass remote URLs here.
The caller owns the decoded image and may close it after the call settles;
the renderer copies normalized pixels before awaiting model data and retains
that private copy for model/style changes. Await `avatar.ready` before the
initial call. An early call retains the intent and applies it after model load;
its immediate result is false because a model was not yet available.

Only the owner's avatar should receive the local payload. Constructors do not
read storage because the same avatar classes also instantiate remote players.
Keep persistence, decoded images and this method separate from `appearance`,
`AvatarAppearance`, `player.avatarAppearance`, and network packets. A photograph
is local only; other players continue to see the chosen stock rig and colours.

The installed `stock-player` and `stock-female` assets descend from Joe and Marta.
Both provide a dedicated head material and UV atlas, and a `Bip01 Head` hierarchy
with facial bones. The implementation rasterizes original head UV triangles and
projects a portrait onto their front bind-pose XY coordinates. Pixels are weighted
by head/face-bone influence, forward normal, front depth and a feathered ellipse.
The shader additionally permits only authored skin zone 3; the neck, rear head,
hair, eye interiors, clothes and separate opacity material keep their original
appearance. No mesh, bone, animation, position, normal or morph is replaced.
The existing skinning animates the photograph together with the facial surface.
Reduced presentation geometry uses the same atlas, without new attributes.

The square normalized portrait should contain the face from forehead to chin.
Top maps to high Y, image left to negative X. Current installed-rig envelopes:

| Rig | X | Y | Forward-depth threshold |
| --- | --- | --- | --- |
| stock-player | −0.078 to +0.078 m | 1.544 to 1.770 m | +0.065 m |
| stock-female | −0.068 to +0.068 m | 1.483 to 1.681 m | 0 m |

Photograph colour is sRGB and blended in linear albedo after colour tinting,
before original material lighting and normal-map shading. Alpha remains a
surface colour blend; it does not change mesh transparency or depth writing.
This supplies photographic likeness on an existing stylized head, without
reconstructing the user's head geometry or promising exact facial proportions.

Each avatar owns its derived atlas texture. Removal, style/model replacement,
and avatar disposal detach the binding and dispose the texture. A latest-intent
guard rejects stale asynchronous model sources before allocating a texture.
Original installed model textures remain under their existing owners.

`node --test test/avatar-face-photo.mjs test/avatar-appearance.mjs
test/avatar-transport-presentation.mjs test/native-avatar-readiness-races.mjs`
checks actual installed GLB baking, asymmetric colour orientation, exclusion
boundaries, race/disposal behaviour, head-only shader adapters, and existing
appearance/transport invariants. These CPU checks do not prove GPU shader
compilation, native device rendering, or visual acceptance in a browser.
