import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Link, useLocation } from 'react-router-dom';
import { useUnsavedLeave } from '../../src/app/lib/useUnsavedLeave';
import { FeedbackHost } from '../../src/app/components/FeedbackHost';
import { ThemeProvider } from '../../src/app/context/ThemeContext';
import { NavigationProtection } from '../../src/app/components/NavigationProtection';
import { RoutePosition } from '../../src/app/components/RoutePosition';
import '../../src/styles/index.css';
import '../../src/styles/experience.css';
function Harness() {
 const location=useLocation(), dirty=location.search.includes('dirty=1');
 useUnsavedLeave(dirty);
 return <><NavigationProtection/><RoutePosition/><FeedbackHost/><nav style={{position:'fixed',top:0,right:0,zIndex:1}}><Link to="?dirty=1">编辑未保存内容</Link> <Link to="?clean=1">返回列表</Link></nav><main style={{height:3000,paddingTop:100}}><h1>{dirty?'未保存内容':'列表'}</h1><input aria-label="稿件标题" defaultValue="保留的内容"/></main></>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><RouterProvider router={createBrowserRouter([{path:'*',element:<Harness/>}])}/></ThemeProvider>);
