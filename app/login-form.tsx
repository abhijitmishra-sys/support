'use client';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, LifeBuoy } from 'lucide-react';
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function LoginForm({ portal = 'customer', register = false }: { portal?: 'customer' | 'staff'; register?: boolean }) {
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
 const staff = portal === 'staff';
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError('');
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
   const response = await fetch('/api/auth/' + (register ? 'register' : 'login'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(register ? values : { ...values, portal }),
   });
   const result = await response.json() as { error?: { message?: string } };
   if (!response.ok) throw new Error(result.error?.message || 'Sign-in failed. Please check your details.');
   window.location.replace('/');
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to sign in.'); setBusy(false); }
 }
 return <main className="auth-page"><section className="auth-story"><Link href="/login" className="auth-brand">IR<span>IRMA Engine<small>SUPPORT COMMAND</small></span></Link><div>{staff ? <ShieldCheck size={42}/> : <LifeBuoy size={42}/>}<p className="auth-eyebrow">{staff ? 'SUPPORT TEAM' : 'YOUR SUPPORT WORKSPACE'}</p><h1>{staff ? 'Great support starts with your team.' : 'A little help. A lot of progress.'}</h1><p>{staff ? 'Review incoming requests, connect with customers, and keep every conversation moving.' : 'Raise a request, talk to your support team, and track the progress in one place.'}</p></div><small>IRMA · Support that moves work forward.</small></section><section className="auth-main"><div className="auth-card"><span className="tag">{staff ? 'Admin & agent access' : 'Customer access'}</span><h2>{register ? 'Create your account' : staff ? 'Sign in to review requests' : 'Welcome back'}</h2><p>{register ? 'Create a customer account to get help from our team.' : staff ? 'Use your staff account to manage support.' : 'Sign in to raise tickets and follow your conversations.'}</p><form method="post" onSubmit={submit}>{register && <label className="field">Your name<input name="name" autoComplete="name" required minLength={2} maxLength={100}/></label>}<label className="field">Email address<input name="email" type="email" autoComplete="username" required maxLength={254}/></label><label className="field">Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128}/>{register && <small>Use at least 12 characters.</small>}</label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button primary" type="submit" disabled={busy || !ready}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></button></form>{!staff && <p className="auth-link">{register ? 'Already have an account? ' : 'New here? '}<Link href={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create a customer account'}</Link></p>}<div className="auth-switch"><Link href={staff ? '/login' : '/admin/login'}>{staff ? 'Customer sign-in' : 'Admin / support team sign-in'}<ArrowRight size={15}/></Link></div></div></section></main>;
}
