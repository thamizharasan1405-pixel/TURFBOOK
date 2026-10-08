import {authenticatedUser,createAdminClient,getRazorpayKeyId,jsonResponse,preflight,razorpayRequest} from '../_shared/razorpay.ts';

Deno.serve(async request=>{
  const options=preflight(request);
  if(options)return options;
  if(request.method!=='POST')return jsonResponse(request,405,{error:'Method not allowed.'});
  try{
    const user=await authenticatedUser(request);
    const body=await request.json();
    if(typeof body.bookingId!=='string'||!body.bookingId||!['UPI','CARD','NET_BANKING'].includes(body.method)){
      return jsonResponse(request,400,{error:'A booking and valid payment method are required.'});
    }

    const admin=createAdminClient();
    const {data:role,error:roleError}=await admin.from('user_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(roleError)throw roleError;
    if(role?.role!=='CUSTOMER')return jsonResponse(request,403,{error:'Customer account required.'});

    const {data:booking,error:bookingError}=await admin.from('bookings')
      .select('id,customer_id,final_amount,booking_status,payment_status,turfs(name)')
      .eq('id',body.bookingId).maybeSingle();
    if(bookingError)throw bookingError;
    if(!booking||booking.customer_id!==user.id)return jsonResponse(request,404,{error:'Booking not found.'});
    if(!['PENDING','RESCHEDULED'].includes(booking.booking_status)||!['PENDING','PROCESSING'].includes(booking.payment_status)){
      return jsonResponse(request,409,{error:'This booking is not currently payable.'});
    }

    const {data:attempts,error:attemptError}=await admin.from('payments')
      .select('id,status,method').eq('booking_id',booking.id).in('status',['PROCESSING','SUCCESS']);
    if(attemptError)throw attemptError;
    if(attempts?.some(attempt=>attempt.status==='SUCCESS'))return jsonResponse(request,409,{error:'This booking is already paid.'});
    if(attempts?.some(attempt=>attempt.status==='PROCESSING'))return jsonResponse(request,409,{error:'A payment attempt is still processing. Wait for its result before retrying.'});
    const {data:cashPayments,error:cashError}=await admin.from('payments')
      .select('id').eq('booking_id',booking.id).eq('method','PAY_AT_TURF').eq('status','PENDING').limit(1);
    if(cashError)throw cashError;
    if(cashPayments?.length)return jsonResponse(request,409,{error:'Pay at Turf has already been selected for this booking.'});

    const amountPaise=Math.round(Number(booking.final_amount)*100);
    if(!Number.isSafeInteger(amountPaise)||amountPaise<100)return jsonResponse(request,400,{error:'The booking amount must be at least ₹1.00.'});
    const receipt=`tb-${booking.id.replaceAll('-','').slice(0,18)}-${Date.now().toString(36)}`;
    const order=await razorpayRequest('/orders',{method:'POST',body:JSON.stringify({
      amount:amountPaise,currency:'INR',receipt,notes:{booking_id:booking.id,customer_id:user.id},
    })});
    if(!order?.id||order.amount!==amountPaise||order.currency!=='INR'){
      throw new Error('Razorpay returned an order that does not match the booking amount.');
    }

    const {error:recordError}=await admin.rpc('record_razorpay_order',{
      p_booking_id:booking.id,p_method:body.method,p_order_id:order.id,p_amount_paise:amountPaise,
    });
    if(recordError)throw recordError;
    return jsonResponse(request,200,{keyId:getRazorpayKeyId(),orderId:order.id,amount:order.amount,currency:order.currency,turfName:booking.turfs?.name||'TURFBOOK booking'});
  }catch(error){
    console.error('razorpay-order failed:',error);
    return jsonResponse(request,400,{error:error instanceof Error?error.message:'Unable to create the payment order.'});
  }
});
