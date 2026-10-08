import {supabase} from './supabase';

export type RazorpayMethod='UPI'|'CARD'|'NET_BANKING';
type RazorpayResponse={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
type RazorpayFailure={error?:{metadata?:{payment_id?:string;order_id?:string};description?:string}};
type RazorpayOptions={
  key:string;
  amount:number;
  currency:string;
  name:string;
  description:string;
  order_id:string;
  theme:{color:string};
  config:{display:{blocks:Record<string,{name:string;instruments:{method:string}[]}>;sequence:string[];preferences:{show_default_blocks:boolean}}};
  handler:(response:RazorpayResponse)=>void;
  modal:{ondismiss:()=>void};
};
type RazorpayInstance={
  open:()=>void;
  on:(event:'payment.failed',handler:(response:RazorpayFailure)=>void)=>void;
};
type RazorpayConstructor=new(options:RazorpayOptions)=>RazorpayInstance;

declare global{
  interface Window{Razorpay?:RazorpayConstructor}
}

function loadCheckout():Promise<void>{
  if(window.Razorpay)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.getElementById('razorpay-checkout') as HTMLScriptElement|null;
    if(existing){
      existing.addEventListener('load',()=>window.Razorpay?resolve():reject(new Error('Razorpay Checkout failed to load.')),{once:true});
      existing.addEventListener('error',()=>reject(new Error('Razorpay Checkout failed to load.')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.id='razorpay-checkout';
    script.src='https://checkout.razorpay.com/v1/checkout.js';
    script.async=true;
    script.onload=()=>window.Razorpay?resolve():reject(new Error('Razorpay Checkout failed to load.'));
    script.onerror=()=>reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
    document.body.appendChild(script);
  });
}

export async function startRazorpayPayment(input:{
  bookingId:string;
  method:RazorpayMethod;
  onMessage:(message:string)=>void;
  onError:(message:string)=>void;
  onSettled:()=>Promise<void>;
}){
  const {bookingId,method,onMessage,onError,onSettled}=input;
  await loadCheckout();
  const {data:order,error:orderError}=await supabase.functions.invoke('razorpay-order',{
    body:{bookingId,method},
  });
  if(orderError)throw orderError;
  if(!order?.orderId||!order.keyId||!Number.isInteger(order.amount)){
    throw new Error('The payment order response is incomplete.');
  }
  let resolved=false;
  const instance=new window.Razorpay!({
    key:order.keyId,
    amount:order.amount,
    currency:order.currency,
    name:'TURFBOOK',
    description:order.turfName,
    order_id:order.orderId,
    theme:{color:'#c7f36b'},
    config:{display:{
      blocks:{selected:{name:`Pay using ${method.replace('_',' ')}`,instruments:[{method:method.toLowerCase()}]}},
      sequence:['block.selected'],
      preferences:{show_default_blocks:false},
    }},
    handler:async response=>{
      resolved=true;
      try{
        const {data,error}=await supabase.functions.invoke('razorpay-verify',{body:response});
        if(error)throw error;
        if(!data?.success){
          onMessage(data?.message||'Payment is awaiting confirmation. Refresh the booking status shortly.');
          await onSettled();
          return;
        }
        onMessage('Payment verified. Your booking is confirmed.');
        await onSettled();
      }catch(error){
        onError(error instanceof Error?error.message:'The payment result could not be verified. Your booking status will update after the secure server check.');
      }
    },
    modal:{ondismiss:()=>{
      if(resolved)return;
      resolved=true;
      onMessage('Checkout closed. TURFBOOK is checking whether the payment was completed before allowing a retry.');
      void supabase.functions.invoke('razorpay-failure',{body:{orderId:order.orderId,abandoned:true}})
        .then(({error})=>{if(error)onError(error.message)})
        .finally(()=>void onSettled());
    }},
  });
  instance.on('payment.failed',response=>{
    resolved=true;
    const metadata=response.error?.metadata;
    if(metadata?.order_id){
      void supabase.functions.invoke('razorpay-failure',{
        body:{orderId:metadata.order_id,paymentId:metadata.payment_id},
      }).then(({error})=>{if(error)onError(error.message)})
        .finally(()=>void onSettled());
    }
    onError(response.error?.description||'Razorpay reported that this payment failed.');
  });
  instance.open();
}
