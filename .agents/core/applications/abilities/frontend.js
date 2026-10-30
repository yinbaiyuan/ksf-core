import './style.css';

export function mount(container){
  const surface=document.createElement('main');
  surface.className='ksf-abilities-placeholder';
  surface.setAttribute('aria-label','KSF能力');
  container.append(surface);
  return {dispose(){surface.remove();}};
}
