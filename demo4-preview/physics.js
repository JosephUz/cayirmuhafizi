export const CART = {x:0,z:11.5,r:2.2};
export function groundAt(x,z) {
  if (z>3.6 && z<7.5 && Math.abs(x)>2.05) return -4;
  return 0;
}
export function resolveCircleRect(body, rect) {
  const nx=Math.max(rect.x-rect.w/2,Math.min(body.x,rect.x+rect.w/2));
  const nz=Math.max(rect.z-rect.d/2,Math.min(body.z,rect.z+rect.d/2));
  let dx=body.x-nx,dz=body.z-nz,dist=Math.hypot(dx,dz);
  if(dist>=body.r) return false;
  if(dist<0.00001){
    const px=rect.w/2+body.r-Math.abs(body.x-rect.x),pz=rect.d/2+body.r-Math.abs(body.z-rect.z);
    if(px<pz){body.x+=(body.x>=rect.x?1:-1)*px;body.vx*=-.3;}
    else{body.z+=(body.z>=rect.z?1:-1)*pz;body.vz*=-.3;}
  }else{body.x+=dx/dist*(body.r-dist);body.z+=dz/dist*(body.r-dist);const v=body.vx*dx/dist+body.vz*dz/dist;if(v<0){body.vx-=1.3*v*dx/dist;body.vz-=1.3*v*dz/dist;}}
  return true;
}
export function separate(a,b,restitution=.6){
  let dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),min=a.r+b.r;
  if(dist>=min||Math.abs(a.y-b.y)>1.5)return 0;
  if(dist<.0001){dx=1;dz=0;dist=1e-4;}
  const nx=dx/dist,nz=dz/dist,ia=1/(a.mass||1),ib=1/(b.mass||1),total=ia+ib,over=min-dist;
  a.x-=nx*over*ia/total;a.z-=nz*over*ia/total;b.x+=nx*over*ib/total;b.z+=nz*over*ib/total;
  const speed=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
  if(speed>0){const impulse=(1+restitution)*speed/total;a.vx-=impulse*ia*nx;a.vz-=impulse*ia*nz;b.vx+=impulse*ib*nx;b.vz+=impulse*ib*nz;}
  return Math.max(0,speed);
}
export function inCart(item){return Math.abs(item.x-CART.x)<1.9&&Math.abs(item.z-CART.z)<2.05&&item.y<2.6&&item.y>.1;}
