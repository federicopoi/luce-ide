// Keep credential preparation before any close/switch and hold the profile lease
// through the launch callback. This helper is main-process-only.
function withCloudflareLaunch(accounts,project,options,action){
 const id=options.cloudflareAccountId??project.cloudflareAccountId??'default';
 return accounts.withEnvironment(id,{},(environment,profileId)=>action({...options,
  cloudflareAccountId:profileId,cloudflareEnvironment:profileId==='default'?null:environment}));
}
// A switch callback can await terminal shutdown and transcript transfer. Recheck
// the preference at the actual spawn, not just before entering that callback.
function finalizeCloudflareLaunch(accounts,options){
 return accounts.enabled?options:{...options,cloudflareAccountId:'default',cloudflareEnvironment:null};
}
module.exports={withCloudflareLaunch,finalizeCloudflareLaunch};
