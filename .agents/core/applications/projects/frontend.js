import {mountReact} from '@ksf/sdk/react';
import {ProjectsApp} from './projects-app.tsx';
import './projects.css';

export function mount(container,sdk){return mountReact(ProjectsApp,container,sdk);}
