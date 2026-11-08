// Offline PCM-only analyzer. No generator parameters, pitch labels or recipe input.
import {validateAudio} from './codec.js';
import {clampPcm} from './tonal.js';
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);for(let at=0;at<n;at+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const p=at+j,q=p+len/2,tr=re[q]*wr-im[q]*wi,ti=re[q]*wi+im[q]*wr;re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}
}
function peak(residual,rate,existing){
  let n=1;while(n<residual.length*4)n*=2;
  const re=new Float64Array(n),im=new Float64Array(n);
  for(let i=0;i<residual.length;i++)re[i]=residual[i]*(.5-.5*Math.cos(2*Math.PI*i/(residual.length-1)));
  fft(re,im);const power=i=>re[i]*re[i]+im[i]*im[i];let bin=-1,value=0;
  for(let i=Math.max(2,Math.ceil(40*n/rate));i<Math.min(n/2-1,Math.floor(Math.min(20000,rate*.47)*n/rate));i++){
    const hz=i*rate/n;if(existing.some(f=>Math.abs(f-hz)<rate/residual.length*.75))continue;
    const p=power(i);if(p>value&&p>=power(i-1)&&p>=power(i+1)){value=p;bin=i;}
  }
  if(bin<0||value<1e-12)return null;
  const a=Math.log(power(bin-1)+1e-30),b=Math.log(power(bin)+1e-30),c=Math.log(power(bin+1)+1e-30),offset=Math.max(-.5,Math.min(.5,.5*(a-c)/(a-2*b+c||1)));
  return {hz:(bin+offset)*rate/n,step:rate/n/4};
}
function solve(matrix,rhs){
  const n=rhs.length,a=matrix.map((row,i)=>Float64Array.from([...row,rhs[i]]));
  for(let col=0;col<n;col++){
    let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
    if(Math.abs(a[pivot][col])<1e-15)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];const scale=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=scale;
    for(let i=0;i<n;i++)if(i!==col){const factor=a[i][col];for(let j=col;j<=n;j++)a[i][j]-=factor*a[col][j];}
  }
  return a.map(row=>row[n]);
}
function linearFit(pcm,rate,frequencies,renderer){
  const length=pcm.length,increments=frequencies.map(f=>Math.max(1,Math.min(2147483647,Math.round(f/rate*4294967296)))),columns=Array.from({length:2+4*frequencies.length},()=>new Float64Array(length));
  for(let n=0;n<length;n++){
    const t=length===1?0:n/(length-1);columns[0][n]=1-t;columns[1][n]=t;
    increments.forEach((inc,p)=>{const phase=inc*n/4294967296*2*Math.PI,s=Math.sin(phase)*32767/32768,c=Math.cos(phase)*32767/32768,i=2+p*4;columns[i][n]=(1-t)*s;columns[i+1][n]=(1-t)*c;columns[i+2][n]=t*s;columns[i+3][n]=t*c;});
  }
  const d=columns.length,matrix=Array.from({length:d},()=>new Float64Array(d)),rhs=new Float64Array(d);
  for(let i=0;i<d;i++){for(let n=0;n<length;n++)rhs[i]+=columns[i][n]*pcm[n];for(let j=0;j<=i;j++){let sum=0;for(let n=0;n<length;n++)sum+=columns[i][n]*columns[j][n];matrix[i][j]=matrix[j][i]=sum;}matrix[i][i]+=length*1e-10;}
  const coefficients=solve(matrix,rhs);if(!coefficients)return null;
  let clamps=0;const quantize=value=>{const rounded=Math.round(value);if(rounded < -32768||rounded>32767)clamps++;return clampPcm(rounded);};
  const model={dc0:quantize(coefficients[0]),dc1:quantize(coefficients[1]),partials:increments.map((increment,p)=>({increment,...Object.fromEntries(['a0','b0','a1','b1'].map((key,j)=>[key,quantize(coefficients[2+p*4+j])]))}))};
  const wide=renderer.render(model,length);let error=0;for(let i=0;i<length;i++)error+=(pcm[i]-wide[i])**2;
  return {model,wide,error,clamps,frequencies:increments.map(inc=>inc*rate/4294967296)};
}
export function fitTonalPage(pcm,rate,renderer,{maxPartials=2,refineSteps=3}={}){
  validateAudio(pcm,rate);if(pcm.length>2048||!Number.isInteger(maxPartials)||maxPartials<0||maxPartials>4||!Number.isInteger(refineSteps)||refineSteps<0||refineSteps>5)throw new Error('Invalid tonal analysis parameters');
  let best=linearFit(pcm,rate,[],renderer);const variants=[best],power=pcm.reduce((sum,n)=>sum+n*n,0);
  if(pcm.length<32||power===0)return {best,variants};
  for(let partial=0;partial<maxPartials;partial++){
    const residual=Float64Array.from(pcm,(n,i)=>n-best.wide[i]),candidate=peak(residual,rate,best.frequencies);if(!candidate)break;
    let frequencies=[...best.frequencies,candidate.hz],trial=linearFit(pcm,rate,frequencies,renderer);if(!trial)break;
    let step=candidate.step;
    for(let level=0;level<refineSteps;level++){
      const center=trial.frequencies[partial];
      for(const hz of [center-step,center+step])if(hz>0&&hz<rate*.49){const changed=[...trial.frequencies];changed[partial]=hz;const fitted=linearFit(pcm,rate,changed,renderer);if(fitted&&fitted.error<trial.error)trial=fitted;}
      step/=4;
    }
    if(trial.error>=best.error-Math.max(4,power*1e-7))break;
    best=trial;variants.push(trial);
  }
  return {best,variants};
}
