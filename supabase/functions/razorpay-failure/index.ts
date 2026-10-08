import {authenticatedUser,createAdminClient,jsonResponse,preflight,razorpayRequest} from '../_shared/razorpay.ts';

Deno.serve(async request=>{
  const options=preflight(request);
  if(options)return options;
  if(request.method!=='POST')return jsonResponse(request,405,{error:'Method not allowed.'});
  try{
    const user=await authenticatedUser(request);
    const body=await request.json();
    if(typeof body.orderId!=='string')return jsonResponse(request,400,{error:'Razorpay order ID is required.'});
    const admin=createAdminClient();
    const {data:attempt,error:attemptError}=await admin.from('payments')
      .select('booking_id,status').eq('gateway_reference',body.orderId).maybeSingle();
    if(attemptError)throw attemptError;
    if(!attempt)return jsonResponse(request,404,{error:'Payment order not found.'});
    const {data:booking,error:bookingError}=await admin.from('bookings')
      .select('customer_id').eq('id',attempt.booking_id).maybeSingle();
    if(bookingError)throw bookingError;
    if(!booking||booking.customer_id!==user.id)return jsonResponse(request,403,{error:'This payment does not belong to your account.'});
    if(attempt.status==='SUCCESS')return jsonResponse(request,409,{error:'This payment was already completed.'});
    if(attempt.status==='FAILED')return jsonResponse(request,200,{success:true,status:'FAILED'});

    let paymentId:string|null=null;
    if(typeof body.paymentId==='string'){
      const payment=await razorpayRequest(`/payments/${encodeURIComponent(body.paymentId)}`);
      if(payment.order_id!==body.orderId||payment.status!=='failed'){
        return jsonResponse(request,409,{error:'Razorpay has not confirmed this payment as failed yet.'});
      }
      paymentId=payment.id;
    }else if(body.abandoned===true){
      const order=await razorpayRequest(`/orders/${encodeURIComponent(body.orderId)}`);
      if(order.status!=='created'||order.attempts!==0){
        return jsonResponse(request,202,{success:false,status:'PROCESSING',message:'The gateway is still resolving the payment attempt.'});
      }
    }else{
      return jsonResponse(request,400,{error:'A failed payment ID or abandoned checkout is required.'});
    }

    const {error}=await admin.rpc('fail_razorpay_payment',{p_order_id:body.orderId,p_payment_id:paymentId});
    if(error)throw error;
    return jsonResponse(request,200,{success:true,status:'FAILED'});
  }catch(error){
    console.error('razorpay-failure failed:',error);
    return jsonResponse(request,400,{error:error instanceof Error?error.message:'Unable to confirm the failed payment.'});
  }
});
