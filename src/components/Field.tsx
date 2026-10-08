import {useId,useState,type InputHTMLAttributes} from 'react'
import {Eye,EyeOff} from 'lucide-react'

export default function Field({label,type,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string}){
  const id=useId()
  const [visible,setVisible]=useState(false)
  const isPassword=type==='password'
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-300">{label}</label>
    <span className="relative block">
      <input {...props} id={id} type={isPassword&&visible?'text':type} className={`w-full rounded-xl border border-white/10 bg-[#0d121b] px-4 py-3 text-white outline-none transition focus:border-lime-400/50${isPassword?' pr-12':''}`}/>
      {isPassword&&<button type="button" onClick={()=>setVisible(value=>!value)} aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-white">{visible?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}</button>}
    </span>
  </div>
}
