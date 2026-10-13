// MySQL JSON may return object keys in a different order. Compare content,
// preserving array order, rather than the database's serialization order.
export function draftSnapshot(value:unknown):string {
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}

// Accept server normalization only when no edits were made during the save.
export function settleDraftSave<T>(current:T,sent:T,stored:T):T {
 return draftSnapshot(current)===draftSnapshot(sent)?stored:current;
}
