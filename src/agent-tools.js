export function registerGuideTools(context,getState,filterState){
 if(!context?.registerTool)return ()=>{};
 const lifecycle=new AbortController();
 const tools=[{name:'get_nfl_viewing_guide',title:'Read Boulder viewing guide',description:'Read the currently loaded NFL slate and source freshness, including TV, RedZone and mobile access for the selected services.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).length)throw new Error('No arguments expected');return getState();}},
 {name:'filter_nfl_viewing_guide',title:'Filter viewing guide',description:'Change the visible game filter and optional team search. Does not save games or enable notifications.',inputSchema:{type:'object',properties:{filter:{type:'string',enum:['all','full','redzone','saved']},team:{type:'string',maxLength:60}},required:['filter'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||!['all','full','redzone','saved'].includes(input.filter)||(input.team!==undefined&&(typeof input.team!=='string'||input.team.length>60))||Object.keys(input).some(k=>!['filter','team'].includes(k)))throw new Error('Invalid filter');filterState(input.filter,input.team||'');return getState();}}];
 for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 return ()=>lifecycle.abort();
}
