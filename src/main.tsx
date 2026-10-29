import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
if(/Electron\//.test(navigator.userAgent)&&/Mac/.test(navigator.userAgent))document.documentElement.classList.add('native-mac');
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return{error:e.message};}render(){return this.state.error?<div className="fatal"><h1>The interface encountered an error.</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>Reload vector.dev</button></div>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
