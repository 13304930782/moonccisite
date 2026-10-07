import {useDocumentResource} from '../context/DocumentData';
import {useEffect,useState} from 'react';
import {api} from './api';
export function usePublishing(){const seed=useDocumentResource('/publishing/config');const [enabled,setEnabled]=useState(seed.data?.enabled===true);useEffect(()=>{if(seed.data)return;let alive=true;api('/publishing/config').then(x=>{if(alive)setEnabled(x.enabled===true);}).catch(()=>{});return()=>{alive=false;};},[]);return enabled;}
