import {authenticatedUser,createAdminClient,jsonResponse,paymentMethod,preflight,razorpayRequest,verifyHmac} from '../_shared/razorpay.ts';

Deno.serve(async request=>{
  const options=preflight(request);
  if(options)return options;
  if(request.method!=='POST')return jsonResponse(request,405,{error:'Method not allowed.'});
  try{
    const user=await authenticatedUser(request);
    const body=await request.json();
    const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature}=body;
    if(typeof orderId!=='string'||typeof paymentId!=='string'||typeof signature!=='string'){
      return jsonResponse(request,400,{error:'Razorpay payment verification data is incomplete.'});
    }
    const secret=Deno.env.get('RAZORPAY_KEY_SECRET');
    if(!secret)throw new Error('Razorpay is not configured on the server.');
    if(!await verifyHmac(`${orderId}|${paymentId}`,signature,secret)){
      return jsonResponse(request,400,{error:'Razorpay payment signature is invalid.'});
    }

    const admin=createAdminClient();
    const {data:attempt,error:attemptError}=await admin.from('payments')
      .select('id,booking_id,amount,status,gateway_reference').eq('gateway_reference',orderId).maybeSingle();
    if(attemptError)throw attemptError;
    if(!attempt)return jsonResponse(request,404,{error:'Payment order not found.'});
    const {data:booking,error:bookingError}=await admin.from('bookings')
      .select('customer_id').eq('id',attempt.booking_id).maybeSingle();
    if(bookingError)throw bookingError;
    if(!booking||booking.customer_id!==user.id)return jsonResponse(request,403,{error:'This payment does not belong to your account.'});

    let payment=await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if(payment.order_id!==orderId||payment.currency!=='INR'||payment.amount!==Math.round(Number(attempt.amount)*100)){
      return jsonResponse(request,400,{error:'Razorpay payment details do not match this booking.'});
    }
    if(payment.status==='authorized'){
      payment=await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`,{
        method:'POST',body:JSON.stringify({amount:payment.amount,currency:payment.currency}),
      });
    }
    if(payment.status!=='captured')return jsonResponse(request,202,{success:false,status:payment.status,message:'Payment is awaiting gateway confirmation.'});

    const method=paymentMethod(payment.method);
    const {error:settleError}=await admin.rpc('settle_razorpay_payment',{
      p_order_id:orderId,p_payment_id:paymentId,p_amount_paise:payment.amount,p_method:method,
    });
    if(settleError)throw settleError;
    return jsonResponse(request,200,{success:true,status:'SUCCESS'});
  }catch(error){
    console.error('razorpay-verify failed:',error);
    return jsonResponse(request,400,{error:error instanceof Error?error.message:'Unable to verify the Razorpay payment.'});
  }
});
