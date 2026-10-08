import {createClient} from 'npm:@supabase/supabase-js@2.57.4';

const supabaseUrl=Deno.env.get('SUPABASE_URL');
const supabaseAnonKey=Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const razorpayKeyId=Deno.env.get('RAZORPAY_KEY_ID');
const razorpayKeySecret=Deno.env.get('RAZORPAY_KEY_SECRET');
const allowedOrigins=new Set((Deno.env.get('ALLOWED_ORIGINS')||'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(origin=>origin.trim()).filter(Boolean));

export function corsHeaders(request:Request):Record<string,string>{
  const origin=request.headers.get('origin');
  const headers:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  if(origin&&allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  return headers;
}

export function jsonResponse(request:Request,status:number,body:unknown):Response{
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(request),'Content-Type':'application/json'}});
}

export function preflight(request:Request):Response|null{
  return request.method==='OPTIONS'?new Response('ok',{headers:corsHeaders(request)}):null;
}

export function createAdminClient(){
  if(!supabaseUrl||!serviceRoleKey)throw new Error('Supabase service environment is not configured.');
  return createClient(supabaseUrl,serviceRoleKey,{auth:{autoRefreshToken:false,persistSession:false}});
}

export async function authenticatedUser(request:Request){
  if(!supabaseUrl||!supabaseAnonKey)throw new Error('Supabase auth environment is not configured.');
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer '))throw new Error('Sign in before paying.');
  const authClient=createClient(supabaseUrl,supabaseAnonKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await authClient.auth.getUser(authorization.slice(7));
  if(error||!data.user)throw new Error('Your sign-in session is invalid or expired.');
  return data.user;
}

function razorpayAuthorization(){
  if(!razorpayKeyId||!razorpayKeySecret)throw new Error('Razorpay is not configured on the server.');
  return `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`;
}

export function getRazorpayKeyId(){
  if(!razorpayKeyId)throw new Error('Razorpay is not configured on the server.');
  return razorpayKeyId;
}

export async function razorpayRequest(path:string,init:RequestInit={}){
  const response=await fetch(`https://api.razorpay.com/v1${path}`,{
    ...init,
    headers:{Authorization:razorpayAuthorization(),'Content-Type':'application/json'},
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result?.error?.description||`Razorpay request failed (${response.status}).`);
  return result;
}

export async function verifyHmac(message:string,signature:string,secret:string){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)));
  const expected=[...digest].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(signature.length!==expected.length)return false;
  let difference=0;
  for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^signature.charCodeAt(i);
  return difference===0;
}

export function paymentMethod(value:string):'UPI'|'CARD'|'NET_BANKING'{
  if(value==='upi')return 'UPI';
  if(value==='card')return 'CARD';
  if(value==='netbanking')return 'NET_BANKING';
  throw new Error('This Razorpay payment method is not supported by TURFBOOK.');
}
