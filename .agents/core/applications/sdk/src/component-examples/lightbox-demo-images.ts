const image=new URL('../fidelity/assets/reference-landscape.svg',import.meta.url).href;
/** Original local fixture, independent of upstream photographic assets. */
export const lightboxPhotos=Array.from({length:6},(_,i)=>({src:image,alt:`本地场景 ${i+1}`,width:i%2?1200:1600,height:i%2?1600:1067,caption:`本地场景 · ${i+1}`}));
