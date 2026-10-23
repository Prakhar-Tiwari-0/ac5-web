// Apache-2.0. Native homogeneous clip positions; shared GS fragment semantics.
export const nativeVertexLayout={arrayStride:64,attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x4'},{shaderLocation:2,offset:32,format:'float32x3'},{shaderLocation:3,offset:44,format:'float32'},{shaderLocation:4,offset:48,format:'uint32'}]};
export function createNativeShader(source){
 const start=source.indexOf('@vertex fn vs('),end=source.indexOf('\nfn wrap(',start);
 if(start<0||end<0)throw Error('GS shader vertex boundary changed');
 return source.slice(0,start)+`@vertex fn vs(@location(0)p:vec4f,@location(1)c:vec4f,@location(2)stq:vec3f,@location(3)fog:f32,@location(4)ruv:u32)->V {
 var o:V;o.pos=p;o.color=c/128.0;o.stq=stq;o.fog=fog;o.ruv=ruv;return o;
}`+source.slice(end);
}
