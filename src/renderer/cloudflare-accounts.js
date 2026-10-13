export function createCloudflarePanel({api,run,escape,getState,openModal,tabs,bindTabs}){
 let signature='',edits=new Map();
 async function show(){
  signature='';edits=new Map();const content=document.createElement('div');content.className='accounts-content cloudflare-content';
  content.innerHTML=tabs('cloudflare')+'<p>Add as many Cloudflare profiles as you need. Choose a login and account for each, then select a profile per project.</p><div id="cloudflare-list"></div><div class="add-account-form"><label for="cloudflare-name">Add a Cloudflare account</label><div><input id="cloudflare-name" placeholder="Personal, Work, Client…" maxlength="60"><button id="cloudflare-add" type="button" class="primary">Add & sign in</button></div></div><p class="account-note">Choose the correct login in your browser. Changes apply to new terminals. Wrangler stores each login in its own private local directory.</p><button id="cloudflare-refresh" type="button">Refresh Cloudflare accounts</button>';
  await openModal('Accounts',content,'');bindTabs(content);document.getElementById('modal-form').onsubmit=e=>e.preventDefault();
  const add=content.querySelector('#cloudflare-add'),input=content.querySelector('#cloudflare-name');add.disabled=!getState().cloudflareAvailable;
  add.onclick=()=>run(async()=>{add.disabled=true;try{const a=await api.addCloudflareAccount(input.value);input.value='';await api.loginCloudflareAccount(a.id);}finally{add.disabled=!getState().cloudflareAvailable;}});
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add.click();}};
  content.querySelector('#cloudflare-refresh').onclick=()=>run(async()=>{const button=content.querySelector('#cloudflare-refresh');button.disabled=true;try{await api.refreshCloudflareAccounts();}finally{button.disabled=false;}});update();
 }
 function update(){
  const list=document.getElementById('cloudflare-list');if(!list||!document.getElementById('modal').open)return;
  const state=getState(),accounts=state.cloudflareAccounts||[],next=JSON.stringify([accounts,state.cloudflareAvailable]);if(next===signature)return;signature=next;
  const active=document.activeElement,card=active?.closest('.cloudflare-card'),focus=card?{id:card.dataset.accountId,name:active.name,start:active.selectionStart,end:active.selectionEnd}:null;
  list.replaceChildren();
  if(!state.cloudflareAvailable){list.innerHTML='<p class="github-empty">Install Wrangler with <code>npm install -g wrangler</code>, then restart Luce. Version 4.71 or later is required.</p>';return;}
  if(!accounts.length){list.innerHTML='<div class="github-empty"><strong>Your Cloudflare accounts, together.</strong><p>Add a profile below for each login or Cloudflare account you use.</p></div>';return;}
  for(const a of accounts){
   const row=document.createElement('section');row.className='account-card cloudflare-card';row.dataset.accountId=a.id;
   const busy=['signing-in','checking'].includes(a.status),label={'signed-in':'Connected','choose-account':'Choose account','signing-in':'Signing in…',checking:'Checking…','signed-out':'Sign in needed'}[a.status]||'Unavailable';
   row.innerHTML=`<div class="github-card-heading"><div><strong>${escape(a.name)}</strong><span>${escape(a.email||'Not connected')}</span></div><span class="github-status ${a.status==='signed-in'?'connected':''}">${escape(label)}</span></div>${a.message?`<p class="account-note">${escape(a.message)}</p>`:''}<div class="cloudflare-fields"><label>Profile name<input name="name" aria-label="Profile name" maxlength="60" value="${escape(edits.get(a.id)??a.name)}"></label><label>Cloudflare account<select name="accountId" aria-label="Cloudflare account" ${busy||!a.accounts.length?'disabled':''}><option value="">Choose an account</option>${a.accounts.map(account=>`<option value="${escape(account.id)}" ${account.id===a.accountId?'selected':''}>${escape(account.name)}</option>`).join('')}</select></label></div><div class="account-card-actions"><button type="button" class="cloudflare-save" ${busy?'disabled':''}>Save name</button>${a.status==='signing-in'?'<button type="button" class="cloudflare-cancel">Cancel sign-in</button>':`<button type="button" class="cloudflare-login" ${busy?'disabled':''}>${a.status==='signed-in'?'Sign in again':'Sign in'}</button>`}<button type="button" class="cloudflare-remove" ${busy?'disabled':''}>Remove from Luce</button></div>`;
   const input=row.querySelector('input');input.oninput=()=>edits.set(a.id,input.value);
   row.querySelector('.cloudflare-save').onclick=()=>run(async()=>{await api.updateCloudflareAccount(a.id,{name:input.value});edits.delete(a.id);signature='';update();});
   row.querySelector('select').onchange=event=>run(()=>api.updateCloudflareAccount(a.id,{accountId:event.target.value}));
   const bind=(selector,action)=>row.querySelector(selector)?.addEventListener('click',()=>run(action));bind('.cloudflare-login',()=>api.loginCloudflareAccount(a.id));bind('.cloudflare-cancel',()=>api.cancelCloudflareLogin(a.id));bind('.cloudflare-remove',()=>api.removeCloudflareAccount(a.id));list.append(row);
   if(focus?.id===a.id){const target=row.querySelector(`[name="${focus.name}"]`);target?.focus();if(target?.tagName==='INPUT')target.setSelectionRange(focus.start,focus.end);}
  }
 }
 return {show,update};
}
