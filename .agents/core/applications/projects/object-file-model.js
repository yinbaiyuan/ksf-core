// A presentation of the MD frontmatter only. No inferred summaries or workflow state.
const primaryKeys=['name','description','status','owner','next_action','updated'];
export function objectMetadata(metadata){
 const primary=primaryKeys.filter(key=>Object.hasOwn(metadata,key)).map(key=>({key,value:metadata[key]}));
 const other=Object.entries(metadata).filter(([key])=>!primaryKeys.includes(key)).map(([key,value])=>({key,value}));
 return {primary,other};
}
export function objectMetadataEdit(current,next){
 const metadata={...current,...next};
 return {metadata,verification:JSON.stringify(current.verification)!==JSON.stringify(metadata.verification)||JSON.stringify(current.criterion_results)!==JSON.stringify(metadata.criterion_results)};
}
