/* Apache-2.0. CPU vertex-stage translation of upstream mesh.vert.
 * Homogeneous output keeps hardware perspective interpolation and frustum clipping. */
#ifndef AC5_NATIVE_MESH_H
#define AC5_NATIVE_MESH_H
#include "ps2_vk.h"
#include <stddef.h>
_Static_assert(sizeof(ps2_vk_mesh_block)==416,"mesh block ABI changed");
_Static_assert(offsetof(ps2_vk_mesh_block,prog)==336,"mesh program ABI changed");
_Static_assert(offsetof(ps2_vk_mesh_block,p)==352,"mesh parameters ABI changed");
typedef struct { float pos[4],color[4],stq[3],fog; u32 round_uv; float clip,pad[2]; } ac5_mesh_vertex;
_Static_assert(sizeof(ac5_mesh_vertex)==64,"native GPU vertex stride");
void ac5_mesh_transform(const u8 *record,const ps2_vk_mesh_block *k,u32 width,u32 height,ac5_mesh_vertex *out);
u32 ac5_mesh_clip(const ac5_mesh_vertex *in,u32 n,ac5_mesh_vertex *out);
#endif
