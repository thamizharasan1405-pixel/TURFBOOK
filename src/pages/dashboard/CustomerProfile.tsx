import {ChangeEvent,FormEvent,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Camera,KeyRound,Save,UserRound} from 'lucide-react';
import Field from '../../components/Field';
import {getSession,updatePassword} from '../../lib/auth';
import {supabase} from '../../lib/supabase';

const sports=['Football','Cricket','Badminton','Basketball','Tennis','Volleyball','Box Cricket'];

export default function CustomerProfile(){
  const [userId,setUserId]=useState('');
  const [email,setEmail]=useState('');
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [preferredSports,setPreferredSports]=useState<string[]>([]);
  const [avatarPath,setAvatarPath]=useState('');
  const [avatarUrl,setAvatarUrl]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const {data:session,error:sessionError}=await getSession();
        if(sessionError)throw sessionError;
        const user=session.session?.user;
        if(!user)throw new Error('Please sign in to view your profile.');
        const [profile,preferences]=await Promise.all([
          supabase.from('profiles').select('full_name,email,phone,avatar_url').eq('id',user.id).single(),
          supabase.from('customer_profiles').select('preferred_sports').eq('user_id',user.id).maybeSingle(),
        ]);
        if(profile.error)throw profile.error;
        if(preferences.error)throw preferences.error;
        if(!active)return;
        setUserId(user.id);setEmail(profile.data.email||user.email||'');
        setName(profile.data.full_name||'');setPhone(profile.data.phone||'');
        setPreferredSports(preferences.data?.preferred_sports||[]);
        const path=profile.data.avatar_url||'';
        setAvatarPath(path);
        if(path){const {data,error}=await supabase.storage.from('customer-avatars').createSignedUrl(path,3600);if(error)throw error;if(active)setAvatarUrl(data.signedUrl)}
      }catch(err){if(active)setError(err instanceof Error?err.message:'Unable to load your profile.')}
      finally{if(active)setLoading(false)}
    }
    void load();
    return()=>{active=false};
  },[]);

  async function uploadAvatar(event:ChangeEvent<HTMLInputElement>){
    setError('');setMessage('');
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith('image/')){setError('Choose an image file.');return}
    if(file.size>5*1024*1024){setError('Profile images must be smaller than 5 MB.');return}
    if(!userId){setError('Sign in again before uploading a profile image.');return}
    setSaving(true);
    try{
      const extension=file.name.split('.').pop()?.toLowerCase()||'jpg';
      const path=`${userId}/avatar-${Date.now()}.${extension}`;
      const {error}=await supabase.storage.from('customer-avatars').upload(path,file,{upsert:true,contentType:file.type});
      if(error)throw error;
      const {data:signed,error:signedError}=await supabase.storage.from('customer-avatars').createSignedUrl(path,3600);
      if(signedError)throw signedError;
      setAvatarPath(path);setAvatarUrl(signed.signedUrl);setMessage('Photo uploaded. Save your profile to apply it.');
    }catch(err){setError(err instanceof Error?err.message:'Unable to upload profile photo.')}
    finally{setSaving(false);event.target.value=''}
  }

  async function saveProfile(event:FormEvent){
    event.preventDefault();setError('');setMessage('');setSaving(true);
    try{
      const {error:profileError}=await supabase.from('profiles').update({full_name:name.trim(),phone:phone.trim()||null,avatar_url:avatarPath||null}).eq('id',userId);
      if(profileError)throw profileError;
      const {error:preferencesError}=await supabase.from('customer_profiles').update({preferred_sports:preferredSports}).eq('user_id',userId);
      if(preferencesError)throw preferencesError;
      setMessage('Profile saved.');
    }catch(err){setError(err instanceof Error?err.message:'Unable to save your profile.')}
    finally{setSaving(false)}
  }

  async function savePassword(event:FormEvent){
    event.preventDefault();setError('');setMessage('');
    if(newPassword!==confirmPassword){setError('Passwords do not match.');return}
    if(newPassword.length<6){setError('Password must be at least 6 characters.');return}
    setSaving(true);
    try{const {error}=await updatePassword(newPassword);if(error)throw error;setNewPassword('');setConfirmPassword('');setMessage('Password updated.')}
    catch(err){setError(err instanceof Error?err.message:'Unable to update password.')}
    finally{setSaving(false)}
  }

  function toggleSport(sport:string){setPreferredSports(current=>current.includes(sport)?current.filter(item=>item!==sport):[...current,sport])}

  if(loading)return <main className="mx-auto max-w-4xl px-5 py-16 text-slate-400">Loading profile…</main>;
  return <main className="mx-auto max-w-4xl px-5 py-12">
    <Link to="/dashboard" className="text-sm accent">← Customer dashboard</Link>
    <p className="accent mt-6 text-sm font-bold uppercase tracking-[.2em]">Account settings</p>
    <h1 className="mt-2 text-4xl font-black">Your profile</h1>
    {error&&<p role="alert" className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
    {message&&<p role="status" className="mt-5 rounded-xl bg-lime-400/10 p-4 text-sm text-lime-200">{message}</p>}
    <form onSubmit={saveProfile} className="card mt-7 p-6">
      <div className="flex flex-wrap items-center gap-4">
        {avatarUrl?<img src={avatarUrl} alt="Profile" className="h-20 w-20 rounded-full object-cover"/>:<div className="grid h-20 w-20 place-items-center rounded-full bg-white/5"><UserRound size={30} className="text-slate-400"/></div>}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold"><Camera size={16}/>Upload photo<input type="file" accept="image/*" onChange={uploadAvatar} className="sr-only"/></label>
        <span className="text-xs text-slate-500">Image up to 5 MB</span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" autoComplete="name" required value={name} onChange={e=>setName(e.target.value)}/>
        <Field label="Email" type="email" autoComplete="email" readOnly value={email}/>
        <Field label="Phone number" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/>
      </div>
      <fieldset className="mt-6"><legend className="mb-3 text-sm font-medium text-slate-300">Preferred sports</legend><div className="flex flex-wrap gap-2">{sports.map(sport=><label key={sport} className={`cursor-pointer rounded-full border px-3 py-2 text-sm ${preferredSports.includes(sport)?'border-lime-300/40 bg-lime-300/10 text-lime-200':'border-white/10 text-slate-400'}`}><input type="checkbox" checked={preferredSports.includes(sport)} onChange={()=>toggleSport(sport)} className="sr-only"/>{sport}</label>)}</div></fieldset>
      <button disabled={saving} className="accent-bg mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold disabled:opacity-50"><Save size={17}/>{saving?'Saving…':'Save profile'}</button>
    </form>
    <form onSubmit={savePassword} className="card mt-6 p-6">
      <div className="flex items-center gap-3"><KeyRound className="accent"/><h2 className="text-xl font-bold">Change password</h2></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="New password" type="password" autoComplete="new-password" minLength={6} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><Field label="Confirm password" type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></div>
      <button disabled={saving} className="mt-5 rounded-xl border border-white/10 px-5 py-3 font-semibold disabled:opacity-50">{saving?'Updating…':'Update password'}</button>
    </form>
  </main>
}
