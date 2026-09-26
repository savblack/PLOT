// Local demonstration only. Real components, fictional account, no backend writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { AppContext } from '../src/hooks/useApp.js';
import PublicProfilePage from '../src/pages/PublicProfilePage.jsx';
import ListPage from '../src/components/ListPage.jsx';
import { useShareTitle } from '../src/hooks/useShareTitle.js';
import titles from './titles.json';
import '../src/index.css';
import '../src/styles/app.css';
import './preview.css';

const person = {id:'preview-user',username:'demo',display_name:'Alex',is_public:true,bio:'Good stories, late nights, and a watchlist that keeps growing.',profile_sections:['recent','favourites'],links:{}};
const list = {id:'preview-weekend',name:'Your next good watch',is_public:true,items:titles};
const noop = () => {};
const fake = {
  rpc: async name => ({data:name === 'get_profile_card' ? [person] : [],error:null}),
  from(table) {
    let head = false;
    const data = table === 'history' || table === 'user_favourites' ? titles : [];
    const q = new Proxy({}, {get(_,key) {
      if (key === 'then') return (resolve) => Promise.resolve({data:head ? null:data,count:table==='follows'?12:titles.length,error:null}).then(resolve);
      if (key === 'select') return (_fields,opts) => {head=!!opts?.head;return q;};
      if (['insert','update','delete','upsert'].includes(key)) return () => {throw new Error('This preview cannot write account data.');};
      return () => q;
    }});
    return q;
  },
};
configure({supabaseClient:fake,isDev:true,tmdbProxyUrl:import.meta.env.VITE_TMDB_PROXY_URL,supabaseAnonKey:import.meta.env.VITE_SUPABASE_ANON_KEY});
const app = {
 user:{id:person.id},profile:person,openPanel:(item,type)=>window.open(`/save?media_type=${type || item.media_type || 'tv'}&tmdb_id=${typeof item === 'number' ? item : item.tmdb_id||item.id}&src=share`,'_blank'),
 topLists:{loading:false},favorites:{loading:false,favorites:[],isFavorite:()=>false,toggleFavorite:noop},watching:{loading:false,items:[]},
 watchlist:{loading:false,items:[],isInList:()=>false,toggle:noop},
 customLists:{loading:false,lists:[list],renameList:noop,setListPublic:noop,addItem:noop,removeItem:noop,deleteList:noop},
};
const sections=[
 ['title','01','Share a title','A recommendation worth keeping.'],
 ['list','02','Share a list','Your picks, ready to pass on.'],
 ['profile','03','Share your profile','Let friends see your taste.'],
];
export function TitleSender(){const {shareTitle}=useShareTitle();const title=titles[0];return <div className="title-sender"><img src={`https://image.tmdb.org/t/p/w342${title.poster_path}`} alt={title.title}/><div><p className="eyebrow">Title sharing</p><h2>{title.title}</h2><p className="description">Share a recommendation directly from a title’s detail panel.</p><button className="btn btn-ghost" onClick={()=>shareTitle({tmdbId:title.tmdb_id,mediaType:title.media_type,title:title.title})}>Share</button></div></div>;}
export function Profile({recipient=false}){return <AppContext.Provider value={{...app,user:recipient?null:app.user}}><MemoryRouter initialEntries={['/u/demo']}><Routes><Route path="/u/:username" element={<PublicProfilePage/>}/><Route path="*" element={<div className="handoff"><h2>Create your account</h2><p>The production flow continues to signup here.</p><a href="/signup" target="_blank">Open the actual signup screen →</a></div>}/></Routes></MemoryRouter></AppContext.Provider>;}
export function Gallery(){
 const [active,setActive]=useState(new URLSearchParams(location.search).get('view')||'title');
 const [recipient,setRecipient]=useState(false);const [payload,setPayload]=useState(null);
 // In this isolated gallery, sharing opens a payload preview instead of contacting another app.
 Object.defineProperty(navigator,'share',{configurable:true,value:async data=>setPayload(data)});
 const choose=id=>{setActive(id);setRecipient(false);setPayload(null);};
 return <><header className="gallery-header"><span className="wordmark">plot</span><span className="preview-label">Sharing preview · Sample account</span></header>
 <main className="gallery"><aside><p className="eyebrow">Made to be passed on</p><h1>Good stories.<br/>Better together.</h1><p className="intro">Explore each sharing flow, from the button you tap to the page your friend sees.</p><nav>{sections.map(([id,n,label,desc])=><button key={id} className={active===id?'active':''} onClick={()=>choose(id)}><span className="number">{n}</span><span><strong>{label}</strong><small>{desc}</small></span></button>)}</nav><p className="fine">Actual web components with fictional account data. Share buttons show the outgoing message here; nothing is sent.</p></aside>
 <section className="stage"><div className="stage-toolbar"><span>{sections.find(s=>s[0]===active)?.[2]}</span><div className="switch"><button className={!recipient?'selected':''} onClick={()=>setRecipient(false)}>You share</button><button className={recipient?'selected':''} onClick={()=>setRecipient(true)}>They receive</button></div></div>
 <div className="screen" key={`${active}-${recipient}`}>
 {active==='title'&&(recipient?<iframe title="Shared title preview" src={`/save?media_type=${titles[0].media_type}&tmdb_id=${titles[0].tmdb_id}&src=share`}/>:<TitleSender/>)}
 {active==='list'&&(recipient?<iframe title="Public list preview" src="/sharing-preview/public-list.html"/>:<AppContext.Provider value={app}><MemoryRouter initialEntries={['/my-lists/list-preview-weekend']}><Routes><Route path="/my-lists/:key" element={<ListPage/>}/></Routes></MemoryRouter></AppContext.Provider>)}
 {active==='profile'&&<Profile recipient={recipient}/>}
 </div><div className="stage-caption">{active==='profile'?'“Share profile” is also your invitation. Recipients can browse before joining, with your referral carried into signup and the follow flow.':active==='list'?'Public lists expose Share beside the list controls. Recipients can choose a title and create their own watchlist.':'The sender uses the real share hook. The recipient preview is the actual /save page.'}</div>
 {payload&&<section className="message" aria-live="polite"><div className="message-top"><span className="eyebrow">Outgoing share preview</span><button onClick={()=>setPayload(null)} aria-label="Close message preview">×</button></div><h3>{payload.title}</h3><p>{payload.text}</p><code>{payload.url}</code><p className="fine">In the app, your device’s share sheet opens. On desktop, the link is copied when native sharing is unavailable.</p></section>}
 </section></main></>;
}
createRoot(document.getElementById('root')).render(<Gallery/>);
