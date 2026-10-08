import {createAdminClient,paymentMethod,verifyHmac} from '../_shared/razorpay.ts';

Deno.serve(async request=>{
  if(request.method!=='POST')return new Response('Method not allowed.',{status:405});
  try{
    const secret=Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if(!secret)throw new Error('Razorpay webhook is not configured on the server.');
    const signature=request.headers.get('x-razorpay-signature');
    if(!signature)return new Response('Missing Razorpay signature.',{status:400});
    const rawBody=await request.text();
    if(!await verifyHmac(rawBody,signature,secret))return new Response('Invalid Razorpay signature.',{status:400});
    const event=JSON.parse(rawBody);
    const entity=event?.payload?.payment?.entity;
    if(!entity?.order_id||!entity?.id)return new Response('Webhook payload is missing payment details.',{status:400});
    const admin=createAdminClient();

    if(event.event==='payment.captured'){
      const {error}=await admin.rpc('settle_razorpay_payment',{
        p_order_id:entity.order_id,p_payment_id:entity.id,
        p_amount_paise:entity.amount,p_method:paymentMethod(entity.method),
      });
      if(error)throw error;
    }else if(event.event==='payment.failed'){
      const {error}=await admin.rpc('fail_razorpay_payment',{
        p_order_id:entity.order_id,p_payment_id:entity.id,
      });
      if(error)throw error;
    }
    return new Response('ok',{status:200});
  }catch(error){
    console.error('razorpay-webhook failed:',error);
    return new Response(error instanceof Error?error.message:'Unable to process webhook.',{status:400});
  }
});
