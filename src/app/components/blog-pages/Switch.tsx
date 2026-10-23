import {Switch as SiteSwitch} from '../ui/switch';

export function Switch({checked,onChange,label,disabled=false}:{checked:boolean;onChange:(checked:boolean)=>void;label:string;disabled?:boolean}) {
  return <label className="bp-switch-hit"><SiteSwitch className="bp-switch" aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled}/></label>;
}
