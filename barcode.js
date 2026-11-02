'use strict';
/* Декодер штрихкодов EAN-13, EAN-8 и UPC-A без внешних библиотек.
   decodeEAN(gray, w, h): gray — яркость пикселей (Uint8ClampedArray, w*h). Возвращает строку с цифрами или null. */
const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PAR=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const _runs=b=>{const r=[];let n=0,c=b[0];for(let i=0;i<b.length;i++){if(b[i]===c)n++;else{r.push(n);c=b[i];n=1}}r.push(n);return r};
const _W={L:EAN_L.map(s=>_runs([...s].map(Number))),G:EAN_G.map(s=>_runs([...s].map(Number))),R:EAN_R.map(s=>_runs([...s].map(Number)))};
const _ok13=c=>{let s=0;for(let i=0;i<12;i++)s+=(+c[i])*(i%2?3:1);return (10-s%10)%10===+c[12]};
const _ok8=c=>{let s=0;for(let i=0;i<7;i++)s+=(+c[i])*(i%2?1:3);return (10-s%10)%10===+c[7]};
/* одна цифра = 4 полосы шириной 7 модулей; ищем ближайший образец */
function _digit(rs,p,kinds,g){
  if(p+4>rs.length)return null;
  const a=rs[p],b=rs[p+1],c=rs[p+2],d=rs[p+3],u=(a+b+c+d)/7;let best=null,be=1e9;
  if(Math.abs(u-g)>g*.4)return null;                                /* масштаб цифры должен совпадать с шириной модуля в ограничителе */
  for(const k of kinds){const W=_W[k];for(let n=0;n<10;n++){const w=W[n],e=Math.abs(a/u-w[0])+Math.abs(b/u-w[1])+Math.abs(c/u-w[2])+Math.abs(d/u-w[3]);if(e<be){be=e;best=[n,k]}}}
  return be<(g>=1.5&&g<2.5?2.4:1.6)?{d:best[0],k:best[1]}:null;   /* при мелком коде допуск шире */
}
function _ean(rs,p,n,g){          /* n=6: EAN-13, n=4: EAN-8 */
  const kinds=[],ds=[],rd=[];
  for(let k=0;k<n;k++){const r=_digit(rs,p,n===6?['L','G']:['L'],g);if(!r)return null;ds.push(r.d);kinds.push(r.k);p+=4}
  if(p+5>rs.length)return null;
  for(let k=0;k<5;k++)if(rs[p+k]<g*.4||rs[p+k]>g*1.8)return null;   /* средний ограничитель */
  p+=5;
  for(let k=0;k<n;k++){const r=_digit(rs,p,['R'],g);if(!r)return null;rd.push(r.d);p+=4}
  if(p+3>rs.length)return null;                                     /* конечный ограничитель */
  for(let k=0;k<3;k++)if(rs[p+k]<g*.4||rs[p+k]>g*1.9)return null;
  if(p+3<rs.length&&rs[p+3]<g*2.5)return null;                       /* тихая зона справа */
  if(n===6){const f=EAN_PAR.indexOf(kinds.join(''));if(f<0)return null;const c=''+f+ds.join('')+rd.join('');return _ok13(c)?c:null}
  const c=ds.join('')+rd.join('');return _ok8(c)?c:null;
}
function _tryAt(rs,i){            /* i — начало левого ограничителя (тёмная, светлая, тёмная) */
  const g=(rs[i]+rs[i+1]+rs[i+2])/3;
  for(let k=0;k<3;k++)if(rs[i+k]<g*.5||rs[i+k]>g*1.7)return null;
  if(i>0&&rs[i-1]<g*2.5)return null;                                /* тихая зона */
  return _ean(rs,i+3,6,g)||_ean(rs,i+3,4,g);
}
function _scanRuns(rs,firstDark){
  for(let i=firstDark?0:1;i+3<rs.length;i+=2){const r=_tryAt(rs,i);if(r)return r}
  return null;
}
function _scanBin(bin){
  const rs=_runs(bin),first=bin[0];
  const r=_scanRuns(rs,first===1);if(r)return r;
  const lastDark=(rs.length-1)%2===0?first:1-first;                /* код вверх ногами */
  return _scanRuns(rs.slice().reverse(),lastDark===1);
}
function _binRow(row,n,f){        /* адаптивная бинаризация: тёмным считаем пиксель темнее локального среднего */
  const win=Math.max(25,(n/6)|0),half=win>>1,pre=new Float64Array(n+1),out=new Uint8Array(n);
  for(let i=0;i<n;i++)pre[i+1]=pre[i]+row[i];
  for(let i=0;i<n;i++){const a=Math.max(0,i-half),b=Math.min(n,i+half+1);out[i]=row[i]<(pre[b]-pre[a])/(b-a)*f?1:0}
  return out;
}
function decodeEAN(gray,w,h){
  const N=14,row=new Float32Array(w),col=new Float32Array(h);
  for(let k=0;k<N;k++){
    const y=Math.min(h-2,Math.max(1,Math.round(h*(0.15+0.7*k/(N-1)))));
    for(let x=0;x<w;x++)row[x]=(gray[(y-1)*w+x]+gray[y*w+x]+gray[(y+1)*w+x])/3;
    for(const f of [0.92,0.8]){const r=_scanBin(_binRow(row,w,f));if(r)return r}
  }
  for(let k=0;k<N;k++){                                             /* вертикально расположенный код */
    const x=Math.min(w-2,Math.max(1,Math.round(w*(0.15+0.7*k/(N-1)))));
    for(let y=0;y<h;y++)col[y]=(gray[y*w+x-1]+gray[y*w+x]+gray[y*w+x+1])/3;
    for(const f of [0.92,0.8]){const r=_scanBin(_binRow(col,h,f));if(r)return r}
  }
  return null;
}
if(typeof module!=='undefined')module.exports={decodeEAN};
