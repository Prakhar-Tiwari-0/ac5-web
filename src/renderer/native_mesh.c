/* Apache-2.0. Included once by ps2_webgpu.c; also independently testable. */
#include "native_mesh.h"
#include <math.h>
#include <string.h>
static float nm_clamp(float x,float lo,float hi){return fminf(fmaxf(x,lo),hi);}
static void nm_matrix(const float*m,const float*p,float*out){for(int j=0;j<4;j++)out[j]=m[j]*p[0]+m[j+4]*p[1]+m[j+8]*p[2]+m[j+12];}
void ac5_mesh_transform(const u8*rec,const ps2_vk_mesh_block*k,u32 width,u32 height,ac5_mesh_vertex*o){
 float p[4],uv[4],s[4],cc[4];s32 normal[4],col[4];
 memcpy(p,rec,16);memcpy(normal,rec+16,16);memcpy(col,rec+32,16);memcpy(uv,rec+48,16);memset(o,0,sizeof *o);
 nm_matrix(k->m,p,s);nm_matrix(k->c,p,cc);float w=s[3],zlim=fminf(16777215.f,k->zmax);
 o->pos[0]=(s[0]+(.5f-k->xoff)*w)*2.f/width-w;
 o->pos[1]=w-(s[1]+(.5f-k->yoff)*w)*2.f/height;
 o->pos[2]=nm_clamp(s[2]*k->zscale,0,zlim*fmaxf(w,0))/k->zmax;o->pos[3]=w;
 o->clip=k->clip?cc[2]+cc[3]:1.f;float fog=nm_clamp(k->fog0+w*k->fog1,0,255);o->fog=fog/255;
 for(int j=0;j<4;j++)o->color[j]=(float)(col[j]&255);o->stq[0]=uv[0];o->stq[1]=uv[1];o->stq[2]=1;
 if(k->prog==5){o->pos[0]=p[0]*2/width-1;o->pos[1]=1-p[1]*2/height;o->pos[2]=p[2];o->pos[3]=1;o->clip=1;memcpy(o->stq,uv,12);for(int j=0;j<4;j++)o->color[j]=(float)col[j];o->fog=uv[3];o->round_uv=(u32)normal[0];return;}
 if(k->prog==3){float iw=1/w,c[3]={s[0]*iw,s[1]*iw,s[2]*iw};float x=c[0]+normal[0]*k->p[0]*uv[2]*iw,y=c[1]+normal[1]*k->p[1]*uv[2]*iw;
  o->pos[0]=(x+.5f-k->xoff)*2/width-1;o->pos[1]=1-(y+.5f-k->yoff)*2/height;o->pos[2]=nm_clamp(floorf(floorf(c[2]*16)/8),k->p[2],zlim)/k->zmax;o->pos[3]=1;
  if(c[2]<=0){o->pos[0]=2;o->pos[1]=-2;o->pos[2]=2;}o->clip=1;o->fog=1;return;}
 if(k->prog==4){memcpy(o->stq,uv,12);return;}
 if(k->prog==2){if(k->pass){o->stq[0]*=2;o->stq[1]*=2;for(int j=0;j<3;j++)o->color[j]=nm_clamp((k->p[2]-cc[3])*k->p[3]*128,0,128);o->color[3]=128;}return;}
 if(k->prog==1){if(k->pass==0){o->stq[0]+=uv[2];o->stq[1]+=uv[3];}
  else if(k->pass<=2){u32 i=k->pass==1?0:4;o->stq[0]=uv[0]*16+(i?k->p[4]:0);o->stq[1]=uv[1]*16+(i?k->p[5]:0);for(int j=0;j<3;j++)o->color[j]=nm_clamp((k->p[i+2]-cc[3])*k->p[i+3]*128,0,128);o->color[3]=i?fog*.5f:k->p[12];}
  else{o->stq[0]=(p[0]-k->p[8])*k->p[11];o->stq[1]=(p[2]-k->p[10])*k->p[11];for(int j=0;j<4;j++)o->color[j]=fog*.5f;}return;}
 float n[3];for(int j=0;j<3;j++)n[j]=normal[j]/4096.f;
 if(!k->pass){if(k->mode){float l[4]={0,0,0,1};for(int j=0;j<3;j++){float t=k->l[j]*n[0]+k->l[4+j]*n[1]+k->l[8+j]*n[2];l[j]=fmaxf(t*t*t*2,0);}
  for(int j=0;j<3;j++){float li=0;for(int i=0;i<4;i++)li+=k->r[i*4+j]*l[i];o->color[j]=fminf(col[j]*fmaxf(li,0),255);}o->color[3]=128;}}
 else{float nb[3];for(int j=0;j<3;j++)nb[j]=k->e[j]*n[0]+k->e[4+j]*n[1]+k->e[8+j]*n[2];o->stq[0]=(nb[0]+1)*.5f;o->stq[1]=(nb[2]+1)*.5f;for(int j=0;j<3;j++)o->color[j]=nm_clamp(nb[1]*1280,0,128);o->color[3]=k->spec_alpha;}
}
static ac5_mesh_vertex nm_lerp(ac5_mesh_vertex a,ac5_mesh_vertex b,float t){ac5_mesh_vertex o=a;float dst[12],x[12],y[12];memcpy(x,&a,sizeof x);memcpy(y,&b,sizeof y);for(int i=0;i<12;i++)dst[i]=x[i]+(y[i]-x[i])*t;memcpy(&o,dst,sizeof dst);o.clip=0;return o;}
/* A single user clip plane; normal WebGPU frustum clipping remains on GPU. */
u32 ac5_mesh_clip(const ac5_mesh_vertex*in,u32 n,ac5_mesh_vertex*out){u32 count=0;if(n==1){if(in[0].clip>=0)out[count++]=in[0];return count;}if(n==2){ac5_mesh_vertex a=in[0],b=in[1];if(a.clip<0&&b.clip<0)return 0;if(a.clip<0)a=nm_lerp(a,b,a.clip/(a.clip-b.clip));else if(b.clip<0)b=nm_lerp(b,a,b.clip/(b.clip-a.clip));out[0]=a;out[1]=b;return 2;}
 ac5_mesh_vertex a=in[n-1];for(u32 i=0;i<n;i++){ac5_mesh_vertex b=in[i];if((a.clip>=0)!=(b.clip>=0))out[count++]=nm_lerp(a,b,a.clip/(a.clip-b.clip));if(b.clip>=0)out[count++]=b;a=b;}return count;}
