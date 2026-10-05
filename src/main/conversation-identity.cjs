function conversationKey(conversation){
 if(!conversation||typeof conversation!=='object'||typeof conversation.id!=='string'||!conversation.id||conversation.id.length>200)throw Error('Invalid conversation identity.');
 const provider=conversation.provider;
 if(!['codex','claude'].includes(provider))throw Error('Unsupported conversation provider.');
 if(provider==='codex'){
  const accountId=conversation.accountId||'default';
  if(typeof accountId!=='string'||!accountId||accountId.length>128)throw Error('Invalid conversation account.');
  return `codex:${accountId}:${conversation.id}`;
 }
 return `${provider}:${conversation.id}`;
}
function attachConversationIdentity(store,session,id,{conversationGroup=false}={}){
 if(typeof id!=='string'||!id||id.length>200)throw Error('Invalid conversation identity.');
 const previous=session.conversationId;session.conversationId=id;const identity={provider:session.provider,accountId:session.accountId,id};
 if(session.pendingProjectId||conversationGroup)store.assignConversation(identity,session.pendingProjectId||session.projectId,{directory:session.pendingSourceDirectory||session.workingDirectory});
 const renamed=!!session.pendingConversationTitle;
 if(renamed){session.title=store.setConversationTitle(identity,session.pendingConversationTitle).title;delete session.pendingConversationTitle;}
 else{const title=store.conversationTitle(identity);if(title)session.title=title;else if(previous&&previous!==id){session.title=session.provider==='codex'?'Codex conversation':'Claude conversation';session.customTitle=false;}}
 delete session.pendingProjectId;delete session.pendingSourceDirectory;
 return {identity,renamed};
}
module.exports={conversationKey,attachConversationIdentity};
