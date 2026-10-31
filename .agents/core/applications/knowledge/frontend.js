import './style.css';

export function mount(container){
  const surface=document.createElement('main');
  surface.className='ksf-knowledge-placeholder';
  surface.setAttribute('aria-label','KSF知识');
  container.append(surface);
  return {dispose(){surface.remove();}};
}
