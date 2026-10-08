import { supabase } from './supabase'

export async function signIn(email:string,password:string){return supabase.auth.signInWithPassword({email,password})}
export async function requestPasswordReset(email:string,redirectTo:string){return supabase.auth.resetPasswordForEmail(email,{redirectTo})}
export async function verifyOwnerPasswordResetOtp(email:string,token:string){
  const {data,error}=await supabase.auth.verifyOtp({email,token,type:'recovery'})
  if(error)throw error
  if(!data.user||data.user.email?.toLowerCase()!==email.trim().toLowerCase()){
    const {error:signOutError}=await supabase.auth.signOut()
    if(signOutError)throw signOutError
    throw new Error('The verification code is invalid or expired. Request a new code and try again.')
  }
  const {data:role,error:roleError}=await supabase.from('user_roles').select('role').eq('user_id',data.user.id).maybeSingle()
  if(roleError){
    const {error:signOutError}=await supabase.auth.signOut()
    if(signOutError)throw signOutError
    throw roleError
  }
  if(role?.role!=='OWNER'){
    const {error:signOutError}=await supabase.auth.signOut()
    if(signOutError)throw signOutError
    throw new Error('Password reset by email OTP is available only for turf owner accounts.')
  }
  sessionStorage.setItem('turfbook-owner-password-recovery','verified')
}
export async function updatePassword(password:string){return supabase.auth.updateUser({password})}
export async function signUp(email:string,password:string,full_name:string,role:'CUSTOMER'|'OWNER'='CUSTOMER'){
  return supabase.auth.signUp({email,password,options:{data:{full_name,requested_role:role}}})
}
export async function signOut(){return supabase.auth.signOut()}
export async function getSession(){return supabase.auth.getSession()}
export async function getRole(userId:string){
  const [{data:role,error:roleError},{data:profile,error:profileError}]=await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id',userId).maybeSingle(),
    supabase.from('profiles').select('status').eq('id',userId).maybeSingle(),
  ])
  if(roleError)throw roleError
  if(profileError)throw profileError
  if(!role)throw new Error('This account does not have an assigned role. Please contact support.')
  if(profile?.status==='INACTIVE')throw new Error('This account has been deactivated. Please contact support.')
  return role.role as string
}
export async function getOwnerApplicationStatus(userId:string){const {data,error}=await supabase.from('owner_profiles').select('verification_status').eq('user_id',userId).maybeSingle();if(error)throw error;return data?.verification_status as string|undefined}
