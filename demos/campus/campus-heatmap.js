((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CampusHeatmap=api;
})(typeof window!=='undefined'?window:globalThis,()=>{
  'use strict';
  // Absolute rate scale. This is NOT a people-density or room-interior model.
  const stops=[[36,88,198],[8,184,189],[216,220,75],[244,154,56],[217,54,54]];
  const valid=value=>Number.isFinite(value)&&value>=0;
  const validPoint=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&valid(p.value);
  const kernel=d2=>d2>=1?0:(1-d2)**2;
  function channels(value){
    const t=Math.min(1,value)*4,i=Math.min(3,Math.floor(t)),f=t-i;
    return stops[i].map((c,k)=>Math.round(c+(stops[i+1][k]-c)*f));
  }
  function colour(value){
    return valid(value)?'#'+channels(value).map(c=>c.toString(16).padStart(2,'0')).join(''):null;
  }
  function sample(points,x,y,radius=180){
    let weighted=0,weights=0,strongest=0;
    for(const p of points){
      if(!validPoint(p))continue;
      const w=kernel(((x-p.x)**2+(y-p.y)**2)/(radius*radius));
      weighted+=w*p.value;weights+=w;strongest=Math.max(strongest,w);
    }
    return {value:weights?weighted/weights:null,opacity:strongest};
  }
  function rasterise(points,{width,height,maxWidth=768,radius=180,opacity=.76}){
    if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))throw Error('Invalid map dimensions');
    if(!(radius>0&&Number.isFinite(radius)))throw Error('Invalid smoothing radius');
    if(!(maxWidth>=1&&maxWidth<=2048&&Number.isFinite(maxWidth)))throw Error('Invalid raster resolution');
    const scale=Math.min(1,maxWidth/Math.max(width,height));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const weights=new Float64Array(w*h),weighted=new Float64Array(w*h),support=new Float32Array(w*h);
    const anchors=points.filter(p=>validPoint(p)&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);
    // Limit work to each anchor's finite support, in PDF coordinates (not metres).
    for(const p of anchors){
      const x0=Math.max(0,Math.floor((p.x-radius)*w/width)),x1=Math.min(w-1,Math.ceil((p.x+radius)*w/width));
      const y0=Math.max(0,Math.floor((p.y-radius)*h/height)),y1=Math.min(h-1,Math.ceil((p.y+radius)*h/height));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const q=kernel((((x+.5)*width/w-p.x)**2+((y+.5)*height/h-p.y)**2)/(radius*radius));
        const i=y*w+x;
        weights[i]+=q;weighted[i]+=q*p.value;support[i]=Math.max(support[i],q);
      }
    }
    const pixels=new Uint8ClampedArray(w*h*4);
    for(let i=0;i<weights.length;i++){
      if(!weights[i])continue;
      const rgb=channels(weighted[i]/weights[i]);
      pixels.set(rgb,i*4);
      // Opacity follows the nearest support, not a sum: clusters do not become hotter.
      pixels[i*4+3]=Math.round(255*Math.min(1,Math.max(0,opacity))*Math.sqrt(support[i]));
    }
    return {width:w,height:h,pixels,validPoints:anchors.length};
  }
  return {colour,sample,rasterise};
});
