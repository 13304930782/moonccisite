import {useEffect,useState} from 'react';
import {api} from './api';
export function usePublishing(){const [enabled,setEnabled]=useState(false);useEffect(()=>{let alive=true;api('/publishing/config').then(x=>{if(alive)setEnabled(x.enabled===true);}).catch(()=>{});return()=>{alive=false;};},[]);return enabled;}
