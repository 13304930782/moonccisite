import {useEffect,useState} from 'react';
import {api} from './api';
export function useOperations(){const [enabled,setEnabled]=useState(false);useEffect(()=>{let active=true;api('/account/security-config').then(r=>{if(active)setEnabled(r.enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);return enabled;}
